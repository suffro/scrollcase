/**
 * The registry of builder-side runtime adapters.
 *
 * One entry per runtime Scrollcase can actually pack. It is deliberately not seeded with runtimes
 * that are named but unimplemented: a registry that answers for a runtime no build can produce
 * turns "unsupported" into a failure somewhere further down, where the message no longer says what
 * went wrong.
 *
 * The contract half of a runtime lives in `src/contract/runtimes.mjs` and is mirrored in every
 * consumer language. This half is the builder's alone, and the three entries differ in exactly the
 * ways the runtimes do: `python` brings an interpreter and a launcher parser, `node` brings an
 * interpreter and needs no parser, and `native` brings neither and generates nothing.
 */

import { nativeRuntimeBuilder } from './native/index.mjs';
import { nodeRuntimeBuilder } from './node/index.mjs';
import { pythonRuntimeBuilder } from './python/index.mjs';

/**
 * What the builder needs from a runtime, beyond what the contract already states.
 *
 * @typedef {object} RuntimeBuilder
 * @property {string} id
 * @property {import('../contract/runtimes.mjs').BoxRuntimeAdapter} contract the pure half, so a
 *   caller holding a builder never has to look the same runtime up twice
 * @property {(runtimeVersion: string) => { name: string, spec: string } | null} pixiDependency the
 *   `[dependencies]` entry a generated pixi manifest declares for this runtime, or null for a
 *   runtime that installs nothing of its own
 * @property {(layout: import('../contract/runtimes.mjs').BoxRuntimeLayout, payloadDir: string,
 *   forbiddenPaths: readonly string[]) => Promise<void>} repairLaunchers makes generated console
 *   scripts stop pointing at the build machine — by rewriting them where the runtime's trampoline
 *   is understood, and by refusing the box where it is not
 * @property {RuntimeTemplates | null} templates the source `new scroll` writes, or null for a
 *   runtime whose entry point Scrollcase cannot generate
 */

/**
 * @typedef {object} RuntimeTemplates
 * @property {string} script the application entry point a generated scroll points at
 * @property {string} selfTest the self-test a generated scroll runs
 * @property {string} scriptFileName what the generated entry point is called
 * @property {string} selfTestFileName what the generated self-test is called
 * @property {string} starterImport a module every box of this runtime can load, for the probe a
 *   generated scroll starts with
 */

const RUNTIME_BUILDERS = Object.freeze([
  pythonRuntimeBuilder,
  nodeRuntimeBuilder,
  nativeRuntimeBuilder,
]);

/**
 * Returns the builder-side adapter for a runtime id.
 *
 * @param {string} runtimeId
 * @returns {RuntimeBuilder}
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
 * @returns {RuntimeBuilder[]} every builder, as a fresh array
 */
export function runtimeBuilders() {
  return [...RUNTIME_BUILDERS];
}
