/**
 * The registry of builder-side runtime adapters.
 *
 * One entry per runtime Scrollcase can actually pack. It is deliberately not seeded with the
 * runtimes that are planned but unimplemented: a registry that answers for a runtime no build can
 * produce turns "unsupported" into a failure somewhere further down, where the message no longer
 * says what went wrong.
 *
 * The contract half of a runtime lives in `src/contract/runtimes.mjs` and is mirrored in every
 * consumer language. This half is the builder's alone.
 */

import { pythonRuntimeBuilder } from './python/index.mjs';

const RUNTIME_BUILDERS = Object.freeze([pythonRuntimeBuilder]);

/**
 * Returns the builder-side adapter for a runtime id.
 *
 * @param {string} runtimeId
 * @returns {import('./python/index.mjs').RuntimeBuilder}
 * @throws {TypeError} when Scrollcase cannot build boxes for that runtime
 */
export function runtimeBuilder(runtimeId) {
  const builder = RUNTIME_BUILDERS.find((candidate) => candidate.id === runtimeId);
  if (!builder) throw new TypeError(`Scrollcase cannot build a ${String(runtimeId)} box`);
  return builder;
}

/**
 * Lists every runtime the builder can pack, for the CLI's own listings and for contract tests.
 *
 * @returns {import('./python/index.mjs').RuntimeBuilder[]} every builder, as a fresh array
 */
export function runtimeBuilders() {
  return [...RUNTIME_BUILDERS];
}
