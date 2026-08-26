/**
 * Confirms that optional execution metadata names runnable regular files in a payload/archive.
 *
 * `files` must contain only regular archive entries. Both collectFiles() during build and the ZIP
 * entry classifier during verify provide exactly that representation.
 *
 * @param {object} options
 * @param {object | null | undefined} options.execution
 * @param {import('../contract/targets.mjs').BoxTargetAdapter} options.adapter
 * @param {string} options.runtimeVersion the interpreter version a module search needs
 * @param {Set<string>} options.files
 * @param {string} [options.runtimeId]
 * @returns {void}
 */
export function assertExecutionFiles({ execution, adapter, runtimeVersion, files, runtimeId, }: {
    execution: object | null | undefined;
    adapter: import("../contract/targets.mjs").BoxTargetAdapter;
    runtimeVersion: string;
    files: Set<string>;
    runtimeId?: string;
}): void;
