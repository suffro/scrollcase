/**
 * Writes the box's own `package.json`, unless the payload already carries one.
 *
 * @param {string} payloadDir
 * @returns {Promise<readonly string[]>} the payload paths written, for the build log
 */
export function writeNodePackageManifest(payloadDir: string): Promise<readonly string[]>;
