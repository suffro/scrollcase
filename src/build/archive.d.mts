/**
 * Streams a deterministic, Zip64-capable box archive using the pinned Node backend.
 *
 * Deflating an already-compressed file is pure loss: measured on incompressible bytes, level 6
 * runs at 47 MB/s and the result is 0.03% *larger* than the input, and dropping to level 1 buys
 * 4 MB/s because the search fails either way. Declared assets are the only thing in a box large
 * enough for that to matter, so they and `uncompressedPaths` are stored instead. Everything else —
 * the interpreter, the site-packages tree, the notices — compresses genuinely and still does.
 *
 * @param {string} payloadDir
 * @param {string} archivePath
 * @param {import('../contract/targets.mjs').BoxTargetAdapter} adapter
 * @param {object} options
 * @param {string} options.runtimeId whose rule decides which entries carry the executable bit
 * @param {readonly string[]} [options.uncompressedPaths] payload paths stored rather than deflated
 * @param {readonly string[]} [options.executablePaths] payload paths the scroll declared executable
 * @returns {Promise<void>}
 */
export function createDeterministicZip(payloadDir: string, archivePath: string, adapter: import("../contract/targets.mjs").BoxTargetAdapter, options: {
    runtimeId: string;
    uncompressedPaths?: readonly string[];
    executablePaths?: readonly string[];
}): Promise<void>;
/**
 * Lists and validates all entries before any ZIP data is trusted or extracted.
 *
 * @param {string} archivePath
 * @returns {Promise<Array<{
 *   path: string,
 *   kind: 'directory' | 'file',
 *   size: number,
 *   mode: number,
 * }>>}
 */
export function listZipEntries(archivePath: string): Promise<Array<{
    path: string;
    kind: "directory" | "file";
    size: number;
    mode: number;
}>>;
/**
 * Reads one small ZIP metadata entry without extracting the surrounding archive.
 *
 * @param {string} archivePath
 * @param {string} wantedPath
 * @param {number} [maximumBytes]
 * @returns {Promise<string>}
 */
export function readZipEntry(archivePath: string, wantedPath: string, maximumBytes?: number): Promise<string>;
/**
 * Extracts a prevalidated ZIP without shelling out to whatever unzip the host provides.
 *
 * @param {string} archivePath
 * @param {string} destination
 * @returns {Promise<void>}
 */
export function extractZipArchive(archivePath: string, destination: string): Promise<void>;
/**
 * Extracts scroll assets using only pinned Node archive implementations.
 *
 * @param {string} archivePath
 * @param {'zip' | 'tar.gz'} format
 * @param {string} destination
 * @param {number} [stripComponents]
 * @returns {Promise<void>}
 */
export function extractScrollArchive(archivePath: string, format: "zip" | "tar.gz", destination: string, stripComponents?: number): Promise<void>;
