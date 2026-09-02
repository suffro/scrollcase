/**
 * The builder-side Python runtime adapter.
 *
 * `src/contract/runtimes.mjs` holds what a *consumer* must agree with — layout, execution kinds,
 * argv, discovery — and is pure for that reason. This is the other half: what the builder has to do
 * to produce a Python box in the first place, which is allowed to touch a filesystem and is not
 * mirrored in any other language.
 *
 * The split is what makes a second runtime an adapter. Everything a Python box needs that a native
 * or Node box would not — the interpreter's pixi dependency, the starter files `new scroll` writes,
 * the conda shebang trampoline `pixi.mjs` repairs after packing — is reachable from here, and
 * nothing above it names Python to get at them.
 */

import { runtimeAdapter } from '../../contract/runtimes.mjs';
import { repairPosixLaunchers } from './launchers.mjs';
import { STARTER_SCRIPT, STARTER_SELF_TEST, pixiDependency } from './templates/index.mjs';

/** @type {import('../index.mjs').RuntimeBuilder} */
export const pythonRuntimeBuilder = Object.freeze({
  id: 'python',
  contract: runtimeAdapter('python'),
  pixiDependency,
  repairLaunchers: repairPosixLaunchers,
  templates: Object.freeze({
    script: STARTER_SCRIPT,
    selfTest: STARTER_SELF_TEST,
    scriptFileName: 'entrypoint.py',
    selfTestFileName: 'self_test.py',
    starterImport: 'json',
  }),
});
