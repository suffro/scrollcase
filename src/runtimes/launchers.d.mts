/**
 * Refuses a packed prefix whose generated launchers name the build machine.
 *
 * @param {import('../contract/runtimes.mjs').BoxRuntimeLayout} layout where the runtime sits in the
 *   payload, for the target being packed
 * @param {string} payloadDir
 * @param {readonly string[]} forbiddenPaths
 * @returns {Promise<void>}
 */
export function assertRelocatableLaunchers(layout: import("../contract/runtimes.mjs").BoxRuntimeLayout, payloadDir: string, forbiddenPaths: readonly string[]): Promise<void>;
