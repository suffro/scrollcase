/**
 * Static execution prerequisites shared by the builder and verifier.
 *
 * Execution metadata is not a command string: it names either one regular payload file or one
 * importable unit of the box's runtime. Checking the archive file set proves those names can
 * resolve without importing a package, running an `__init__.py`, or starting the application. The
 * later consumer may therefore launch only after the complete trust chain has passed.
 *
 * Which paths a declaration could resolve to is a runtime question, and it is asked of
 * `contract/runtimes.mjs` rather than answered here. This module keeps the two things that are
 * genuinely the builder's: the path-safety rule every candidate goes through, and the single error
 * path every validation failure in the tool takes.
 */

import { IMPLICIT_RUNTIME_ID, runtimeAdapter } from '../contract/runtimes.mjs';
import { safeRelativePath } from './filesystem.mjs';
import { fail } from './process.mjs';

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
export function assertExecutionFiles({
  execution,
  adapter,
  runtimeVersion,
  files,
  runtimeId = IMPLICIT_RUNTIME_ID,
}) {
  if (!execution) return;
  const runtime = runtimeAdapter(runtimeId);
  if (!runtime.executionKinds.includes(execution.kind)) {
    fail(`Unsupported execution kind: ${String(execution.kind)}.`);
  }
  const { candidates, missing } = runtime.resolveExecutionFiles({
    execution,
    runtimeVersion,
    target: adapter,
  });
  // Every candidate goes through the traversal rule, not just the one a scroll wrote by hand: a
  // path the format derived is still a path this process is about to look for.
  if (!candidates.some((path) => files.has(safeRelativePath(path)))) fail(missing);
}
