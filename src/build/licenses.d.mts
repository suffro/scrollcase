/**
 * Derives (name, version) from a conda package filename: `name-version-build.conda`.
 *
 * @param {string} url a conda package URL or filename
 * @returns {{ name: string, version: string }}
 * @throws {Error} when the filename is not `name-version-build.conda`
 */
export function parseCondaPackageReference(url: string): {
    name: string;
    version: string;
};
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
export function lockedCondaDistributions(lockBytes: Buffer, declaredLicenses?: Map<string, string>): LockedDistribution[];
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
export function validateDeclaredPypiLicenses(declared: unknown): Map<string, string>;
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
export function readDeclaredPypiLicenses(scroll: {
    pypiLicenseDeclaration?: string;
}, projectRoot: string): Promise<Map<string, string>>;
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
export function createCondaDependencyLicenseAudit({ lockBytes, targetId, namespace, declaredLicenses, }: {
    lockBytes: Buffer;
    targetId: string;
    namespace?: string;
    declaredLicenses?: Map<string, string>;
}): {
    schemaVersion: 2;
    kind: string;
    targetId: string;
    dependencyLockSha256: string;
    packages: LockedDistribution[];
};
/**
 * Ensures a reviewed conda audit still matches the current pixi.lock exactly.
 *
 * @param {unknown} reviewed the audit committed to the repository
 * @param {ReturnType<typeof createCondaDependencyLicenseAudit>} actual
 * @returns {ReturnType<typeof createCondaDependencyLicenseAudit>} `actual`, when they agree
 * @throws {Error} when the lock no longer matches what was reviewed
 */
export function validateCondaDependencyLicenseAudit(reviewed: unknown, actual: ReturnType<typeof createCondaDependencyLicenseAudit>): ReturnType<typeof createCondaDependencyLicenseAudit>;
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
export function validateBundledLicenses(declared: unknown, carriedPaths: Set<string>): Promise<BundledDependency[]>;
/**
 * One package the lock pins, with the licence that applies to it.
 */
export type LockedDistribution = {
    name: string;
    version: string;
    /**
     * the SPDX expression, from the lock or from the project
     */
    declaredLicense: string;
    source: "conda" | "pypi";
    /**
     * present only when the lock named no licence and the
     * project supplied one, so a reader can tell the two apart
     */
    licenseDeclaredBy?: "project";
};
/**
 * One dependency compiled inside a binary the box ships, as the project declared it.
 */
export type BundledDependency = {
    name: string;
    version: string;
    /**
     * the licence the project reviewed
     */
    declaredLicense: string;
    /**
     * payload files it is compiled into
     */
    linkedInto: string[];
    sourceUrl?: string;
};
