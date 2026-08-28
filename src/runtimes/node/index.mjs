/**
 * The builder-side Node runtime adapter.
 *
 * The pure half — layout, execution kinds, argv, the import probe — lives in
 * `src/contract/runtimes.mjs` and is mirrored in every consumer language. This is what the builder
 * has to do to produce a Node box, which is allowed to touch a filesystem and is mirrored nowhere.
 *
 * There is less of it than for Python, and that is the interesting part. conda-forge's `nodejs`
 * package puts `node` in the prefix's own `bin/` and writes `npm` and `npx` as links into
 * `lib/node_modules`, whose shebangs resolve `node` through the environment rather than through an
 * absolute path burnt in at solve time. So there is no trampoline to parse and nothing to rewrite —
 * only the shared guard that says so out loud if a prefix ever turns out to carry one.
 */

import { runtimeAdapter } from '../../contract/runtimes.mjs';
import { assertRelocatableLaunchers } from '../launchers.mjs';
import { STARTER_SCRIPT, STARTER_SELF_TEST, pixiDependency } from './templates/index.mjs';

/** @type {import('../index.mjs').RuntimeBuilder} */
export const nodeRuntimeBuilder = Object.freeze({
  id: 'node',
  contract: runtimeAdapter('node'),
  pixiDependency,
  repairLaunchers: assertRelocatableLaunchers,
  templates: Object.freeze({
    script: STARTER_SCRIPT,
    selfTest: STARTER_SELF_TEST,
    scriptFileName: 'entrypoint.js',
    selfTestFileName: 'self_test.js',
    starterImport: 'fs',
  }),
});
