/**
 * Refuse a release tag that does not match the manifest it claims to release.
 *
 * A publish workflow is handed one thing: the tag that started it. Nothing else in the run knows
 * which version is meant to go out, so without this a mistyped tag publishes whatever the manifest
 * happened to say, under a name nobody chose — and a published version is never replaced, only
 * yanked, with the yanked one still downloadable. The check costs a second and the mistake cannot
 * be undone, so it runs before anything is built.
 *
 * This is `python/scripts/check_release_version.py` for the two manifests a Node script can read.
 * That one stays where it is: the PyPI workflow installs Python and nothing else, and giving it a
 * Node dependency to answer a question about a Python package would be the wrong trade.
 *
 * One script for both registries rather than two, because it is one question asked twice — the
 * tag's prefix picks the manifest, and the manifest answers with its own version. The prefixes are
 * disjoint (`rust-v0.4.0` does not start with `v`), so the order below is for the reader.
 *
 * Usage:
 *   node scripts/check-release-version.mjs v1.0.0
 *   node scripts/check-release-version.mjs rust-v0.4.0
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);

/** The `version` of the root npm package. */
async function packageJsonVersion(path) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  return manifest.version;
}

/**
 * The `version` of the crate's own `[package]` table.
 *
 * Read by hand rather than with a TOML parser: the runtime dependency surface is deliberately three
 * packages, a release check is not a reason to make it four, and a dependency shipped only for CI
 * is still one more thing a contributor has to install.
 *
 * Narrowing to the `[package]` table before looking is what makes that trade safe, and the two
 * cases it covers were measured rather than imagined. As the file stands a line-anchored `^version`
 * would already find the right answer, because `[package]` comes first and every dependency is
 * written inline — but that is a property of how this file happens to be written, not of TOML:
 *
 *   - a `[dev-dependencies.jsonschema]` sub-table placed above `[package]` puts `version = "0.49.4"`
 *     at the start of its own line, and the unscoped read returns that instead;
 *   - `version.workspace = true` under `[package]` leaves no literal version there at all, and the
 *     unscoped read again returns the dependency's.
 *
 * Both publish the crate under a number nobody chose. Scoped, the first still reads `0.4.0` and the
 * second finds nothing and stops the release, which is the outcome to want when the answer is
 * genuinely not there.
 */
async function cargoVersion(path) {
  const manifest = await readFile(path, 'utf8');
  const afterHeading = manifest.split(/^\[package\]$/m)[1];
  if (afterHeading === undefined) return null;
  const packageTable = afterHeading.split(/^\[/m)[0];
  return /^version\s*=\s*"([^"]+)"/m.exec(packageTable)?.[1] ?? null;
}

const RELEASES = [
  { prefix: 'rust-v', manifest: 'rust/Cargo.toml', read: cargoVersion },
  { prefix: 'v', manifest: 'package.json', read: packageJsonVersion },
];

const tag = process.argv[2];

if (!tag) {
  console.error('Usage: node scripts/check-release-version.mjs <tag>');
  process.exit(2);
}

const release = RELEASES.find(({ prefix }) => tag.startsWith(prefix));

if (!release) {
  const known = RELEASES.map(({ prefix }) => `${prefix}<version>`).join(', ');
  console.error(`Release tag ${JSON.stringify(tag)} names no known package; expected one of ${known}.`);
  process.exit(1);
}

const manifestPath = fileURLToPath(new URL(release.manifest, repoRoot));
const version = await release.read(manifestPath);

if (!version) {
  console.error(`Could not read a version from ${release.manifest}.`);
  process.exit(1);
}

const expected = `${release.prefix}${version}`;

if (tag !== expected) {
  console.error(
    `Release tag ${JSON.stringify(tag)} does not match ${release.manifest}; expected ${expected}.`,
  );
  process.exit(1);
}

console.log(`${tag} matches ${release.manifest} version ${version}.`);
