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
 * @param {Buffer} lockBytes the committed `pixi.lock`
 * @returns {LockedDistribution[]} sorted by name then version
 * @throws {Error} when the lock is unparseable or a package lacks a licence
 */
export function lockedCondaDistributions(lockBytes: Buffer): LockedDistribution[];
/**
 * Builds the deterministic conda license audit bound to one pixi.lock and target.
 *
 * @param {{ lockBytes: Buffer, targetId: string, namespace?: string }} options
 * @returns {{ schemaVersion: 2, kind: string, targetId: string, dependencyLockSha256: string,
 *   packages: LockedDistribution[] }}
 * @throws {Error} when a locked package declares no licence
 */
export function createCondaDependencyLicenseAudit({ lockBytes, targetId, namespace }: {
    lockBytes: Buffer;
    targetId: string;
    namespace?: string;
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
 * One package as the lock declares it.
 */
export type LockedDistribution = {
    name: string;
    version: string;
    /**
     * the SPDX expression carried by the lock
     */
    declaredLicense: string;
    source: "conda" | "pypi";
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
