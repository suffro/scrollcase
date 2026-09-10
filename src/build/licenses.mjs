/**
 * The dependency licence inventories a box ships. They are separate because a licence is known in
 * more than one way, and pretending otherwise is how a tool ends up guessing.
 *
 * The conda half is **derived** from the committed lock file rather than from the installed tree:
 * the lock already carries an SPDX licence per package, and `pixi install --frozen` guarantees the
 * installed set equals it. That makes the audit a pure function of a file the user reviews, so it
 * can be computed without a built prefix and cannot drift from what was approved.
 *
 * The PyPI half of that same lock is not derivable, because pixi records no licence for a PyPI
 * distribution — it writes a name, a version, a hash and the requirements, and nothing about terms.
 * So a project **declares** those, from the distributions its own lock pins, and the declaration is
 * checked against the lock both ways: every package the lock leaves unnamed must be covered, and
 * every entry must be one the lock actually needed. A conda package is never eligible, so no
 * declaration can restate metadata conda-forge already publishes.
 *
 * The bundled half cannot be derived at all. A binary a scroll brings into the box was linked
 * before Scrollcase saw it, and no file in the build says what went into it; reading the binary
 * would be guessing, and guessing about a licence is worse than not answering. So that half is
 * **declared** by the project and checked for the one thing a tool can actually check — that every
 * file it claims to be linked into is a file this box really carries. What belongs in the list is
 * the project's judgement, exactly as the reviewed conda audit is.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_DOCUMENT_NAMESPACE } from '../contract/documents.mjs';
import { compareStableStrings, fileExists, safeRelativePath } from './filesystem.mjs';
import { schemaValidationError } from './schema-validation.mjs';

/**
 * One package the lock pins, with the licence that applies to it.
 *
 * @typedef {object} LockedDistribution
 * @property {string} name
 * @property {string} version
 * @property {string} declaredLicense the SPDX expression, from the lock or from the project
 * @property {'conda' | 'pypi'} source
 * @property {'project'} [licenseDeclaredBy] present only when the lock named no licence and the
 *   project supplied one, so a reader can tell the two apart
 */

function fail(message) {
  throw new Error(`box licence audit: ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** conda ships packages as `.conda` or the older `.tar.bz2`; both encode name-version-build. */
const CONDA_PACKAGE_FILE = /\.(?:conda|tar\.bz2)$/;

/**
 * Derives (name, version) from a conda package filename: `name-version-build.conda`.
 *
 * @param {string} url a conda package URL or filename
 * @returns {{ name: string, version: string }}
 * @throws {Error} when the filename is not `name-version-build.conda`
 */
export function parseCondaPackageReference(url) {
  const file = String(url).split('/').pop() ?? '';
  const stem = file.replace(CONDA_PACKAGE_FILE, '');
  const parts = stem.split('-');
  // conda names may contain '-', but version and build never do, so they are the last two segments.
  if (parts.length < 3 || stem === file) fail(`unparseable conda package filename: ${file}`);
  parts.pop(); // build string
  const version = parts.pop();
  return { name: parts.join('-'), version };
}

/** pixi quotes a version YAML would otherwise read as a number, so `'1.84'` means `1.84`. */
const unquoteScalar = (value) => value.replace(/^'(.*)'$/, '$1');

/**
 * Parses the exact conda + pypi distributions and their declared licenses from a pixi.lock.
 *
 * The `packages:` section is a YAML list of `- conda: <url>` / `- pypi: <url>` items, each followed
 * by indented `key: value` fields. This scans that regular, machine-generated structure directly
 * rather than taking a transitive YAML dependency.
 *
 * pixi records an SPDX licence for a conda package and none at all for a PyPI one, so a lock with
 * PyPI dependencies cannot be inventoried from the lock alone. `declaredLicenses` supplies the
 * missing half from what the project reviewed; where it is absent, an undeclared package still
 * fails, because a dependency whose licence nobody has named is a legal problem rather than a
 * reporting gap.
 *
 * @param {Buffer} lockBytes the committed `pixi.lock`
 * @param {Map<string, string>} [declaredLicenses] SPDX by `name==version`, from the project's
 *   reviewed declaration
 * @returns {LockedDistribution[]} sorted by name then version
 * @throws {Error} when the lock is unparseable or a package's licence is nowhere to be found
 */
export function lockedCondaDistributions(lockBytes, declaredLicenses = new Map()) {
  const lines = lockBytes.toString('utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => line === 'packages:');
  if (start === -1) fail('pixi.lock has no packages section');
  const distributions = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    let { name, version } = current;
    if (current.source === 'conda') ({ name, version } = parseCondaPackageReference(current.url));
    if (!name || !version) fail(`pixi.lock package lacks a name or version: ${current.url}`);
    const lockLicense = current.license && current.license.toUpperCase() !== 'UNKNOWN' ? current.license : null;
    // Only the PyPI half may be supplied by the project. conda-forge states a licence for every
    // package, so a conda entry without one is a broken lock, not a gap a declaration should paper
    // over — and keeping the door shut means no declaration can quietly restate conda's own metadata.
    const declared = lockLicense === null && current.source === 'pypi'
      ? declaredLicenses.get(`${name}==${version}`)
      : undefined;
    if (lockLicense === null && declared === undefined) {
      fail(`${name}==${version} lacks a declared license in pixi.lock`);
    }
    // conda/pypi filenames already carry the canonical name, so keep raw names — normalizing
    // would mangle legitimate leading-underscore conda names like `_openmp_mutex`.
    distributions.push({
      name,
      version,
      declaredLicense: lockLicense ?? declared,
      source: current.source,
      // Only on the declared half, so an inventory of a lock that declares everything is unchanged.
      ...(lockLicense === null ? { licenseDeclaredBy: 'project' } : {}),
    });
    current = null;
  };
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const entry = /^- (conda|pypi): (.+)$/.exec(line);
    if (entry) {
      flush();
      current = { source: entry[1], url: entry[2], name: null, version: null, license: null };
      continue;
    }
    if (!current) continue;
    // A non-indented, non-empty line ends the packages section (defensive; it is normally last).
    if (line !== '' && !line.startsWith(' ')) { flush(); break; }
    const field = /^ {2}(\w[\w-]*): (.*)$/.exec(line);
    if (!field) continue;
    const [, key, value] = field;
    if (key === 'license' && current.license === null) current.license = value.trim();
    else if (key === 'name' && current.name === null) current.name = unquoteScalar(value.trim());
    else if (key === 'version' && current.version === null) current.version = unquoteScalar(value.trim());
  }
  flush();
  return distributions.sort((left, right) =>
    compareStableStrings(left.name, right.name) || compareStableStrings(left.version, right.version));
}

/**
 * Reads a project's declared licences for the PyPI distributions its lock does not name.
 *
 * The shape is checked here; whether each entry belongs is checked against the lock, by
 * `createCondaDependencyLicenseAudit`, which is the only place both are in hand.
 *
 * @param {unknown} declared the parsed contents of the project's declaration file
 * @returns {Map<string, string>} SPDX expression by `name==version`
 * @throws {Error} when the shape is wrong or a distribution is named twice
 */
export function validateDeclaredPypiLicenses(declared) {
  if (!Array.isArray(declared) || declared.length === 0) {
    fail('a declared PyPI licence inventory must be a non-empty array');
  }
  const licenses = new Map();
  for (const entry of /** @type {Record<string, unknown>[]} */ (declared)) {
    const { name, version, declaredLicense } = entry ?? {};
    const missing = ['name', 'version', 'declaredLicense']
      .filter((field) => typeof (entry ?? {})[field] !== 'string' || !(entry ?? {})[field]);
    if (missing.length > 0) {
      fail(`a declared PyPI licence entry lacks ${missing.join(', ')}: ${JSON.stringify(entry)}`);
    }
    const key = `${name}==${version}`;
    if (licenses.has(key)) fail(`the declared PyPI licence inventory names ${key} twice`);
    licenses.set(key, /** @type {string} */ (declaredLicense));
  }
  return licenses;
}

/**
 * Loads a scroll's declared PyPI licences, or an empty map when it declares none.
 *
 * Both the audit command and the build read the declaration through here, so a licence the author
 * reviewed with `audit` is the same licence the build signs.
 *
 * @param {{ pypiLicenseDeclaration?: string }} scroll
 * @param {string} projectRoot
 * @returns {Promise<Map<string, string>>} SPDX expression by `name==version`
 * @throws {Error} when the declared path is missing or its contents are malformed
 */
export async function readDeclaredPypiLicenses(scroll, projectRoot) {
  if (!scroll.pypiLicenseDeclaration) return new Map();
  const path = join(projectRoot, safeRelativePath(scroll.pypiLicenseDeclaration));
  if (!await fileExists(path)) {
    fail(`declared PyPI licence inventory is missing: ${scroll.pypiLicenseDeclaration}`);
  }
  return validateDeclaredPypiLicenses(JSON.parse(await readFile(path, 'utf8')));
}

/**
 * Builds the deterministic dependency licence audit bound to one pixi.lock and target.
 *
 * @param {{ lockBytes: Buffer, targetId: string, namespace?: string,
 *   declaredLicenses?: Map<string, string> }} options
 * @returns {{ schemaVersion: 2, kind: string, targetId: string, dependencyLockSha256: string,
 *   packages: LockedDistribution[] }}
 * @throws {Error} when a locked package's licence is nowhere to be found, or a declared licence
 *   names a package the lock does not need one for
 */
export function createCondaDependencyLicenseAudit({
  lockBytes,
  targetId,
  namespace = DEFAULT_DOCUMENT_NAMESPACE,
  declaredLicenses = new Map(),
}) {
  const packages = lockedCondaDistributions(lockBytes, declaredLicenses);
  // A declaration nobody needed is a stale entry: the package left the lock, changed version, or
  // started declaring its own licence. Saying so beats carrying a claim about nothing.
  const supplied = new Set(packages
    .filter((entry) => entry.licenseDeclaredBy)
    .map((entry) => `${entry.name}==${entry.version}`));
  for (const key of declaredLicenses.keys()) {
    if (!supplied.has(key)) {
      fail(`declared PyPI licence for ${key} matches no locked package that needs one`);
    }
  }
  return {
    schemaVersion: 2,
    kind: `${namespace}.dependency-license-audit`,
    targetId,
    dependencyLockSha256: sha256(lockBytes),
    packages,
  };
}

/**
 * Ensures a reviewed conda audit still matches the current pixi.lock exactly.
 *
 * @param {unknown} reviewed the audit committed to the repository
 * @param {ReturnType<typeof createCondaDependencyLicenseAudit>} actual
 * @returns {ReturnType<typeof createCondaDependencyLicenseAudit>} `actual`, when they agree
 * @throws {Error} when the lock no longer matches what was reviewed
 */
export function validateCondaDependencyLicenseAudit(reviewed, actual) {
  if (reviewed?.schemaVersion !== 2 || reviewed.kind !== actual.kind) fail('reviewed conda audit contract is invalid');
  if (JSON.stringify(reviewed) !== JSON.stringify(actual)) {
    fail('locked conda dependency licenses differ from the reviewed audit');
  }
  return actual;
}

/**
 * One dependency compiled inside a binary the box ships, as the project declared it.
 *
 * @typedef {object} BundledDependency
 * @property {string} name
 * @property {string} version
 * @property {string} declaredLicense the licence the project reviewed
 * @property {string[]} linkedInto payload files it is compiled into
 * @property {string} [sourceUrl]
 */

const releaseSchemaUrl = new URL('../contract/schema/release-manifest.schema.json', import.meta.url);
let bundledLicenseSchema;

/**
 * The `bundledLicenses` definition, lifted out of the release manifest schema so the declaration a
 * project writes is judged against the very shape that will be signed. Re-stating the fields here
 * would create a second definition of the format, which is the one thing `src/contract/` exists to
 * prevent.
 */
async function loadBundledLicenseSchema() {
  bundledLicenseSchema ??= readFile(releaseSchemaUrl, 'utf8').then((text) => {
    const release = JSON.parse(text);
    return { $id: release.$id, $defs: release.$defs, $ref: '#/$defs/bundledLicenses' };
  });
  return bundledLicenseSchema;
}

/**
 * Checks a declared bundled inventory against its schema and against the box it describes.
 *
 * The second half is the part worth having. A licence file nobody can check is a licence file
 * nobody maintains: a path that stopped being in the box means the entry is stale, and the build
 * says so instead of signing a claim about a file that is not there. Deferred assets count as
 * carried — the box declares them and a consumer materializes them — because leaving one out of the
 * inventory on the grounds that it is fetched later would exempt exactly the large binaries this
 * exists for.
 *
 * @param {unknown} declared the parsed contents of the project's declaration file
 * @param {Set<string>} carriedPaths every payload path this box carries, deferred assets included
 * @returns {Promise<BundledDependency[]>} the declaration, unchanged, when it holds
 * @throws {Error} when the shape is wrong or an entry names a file the box does not carry
 */
export async function validateBundledLicenses(declared, carriedPaths) {
  const error = schemaValidationError(declared, await loadBundledLicenseSchema());
  if (error) fail(`declared bundled licence inventory is invalid: ${error}`);
  for (const entry of /** @type {BundledDependency[]} */ (declared)) {
    for (const path of entry.linkedInto) {
      if (!carriedPaths.has(safeRelativePath(path))) {
        fail(`${entry.name}==${entry.version} is declared linked into ${path}, which this box does not carry`);
      }
    }
  }
  return /** @type {BundledDependency[]} */ (declared);
}
