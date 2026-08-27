/**
 * Confirms that optional execution metadata names runnable regular files in a payload/archive.
 *
 * `files` must contain only regular archive entries. Both collectFiles() during build and the ZIP
 * entry classifier during verify provide exactly that representation.
 *
 * @param {object} options
 * @param {object | null | undefined} options.execution
 * @param {import('../contract/targets.mjs').BoxTargetAdapter} options.adapter
 * @param {string} options.runtimeId the runtime the box declares
 * @param {string | undefined} options.runtimeVersion its version, where a module search needs one
 * @param {Set<string>} options.files
 * @returns {void}
 */
export function assertExecutionFiles({ execution, adapter, runtimeId, runtimeVersion, files, }: {
    execution: object | null | undefined;
    adapter: import("../contract/targets.mjs").BoxTargetAdapter;
    runtimeId: string;
    runtimeVersion: string | undefined;
    files: Set<string>;
}): void;
