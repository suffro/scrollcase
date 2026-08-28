/**
 * The builder-side native runtime adapter.
 *
 * A native box carries a compiled executable and starts it directly. Everything the other two
 * adapters exist to arrange — an interpreter to solve for, generated launchers to repair, starter
 * source to write — has no counterpart here, and saying so explicitly is the adapter's whole job.
 *
 * It still packs a conda prefix. `native` is not "no environment": it is "no interpreter". A
 * compiled binary links against shared libraries, those libraries come from conda-forge through the
 * same `pixi.lock` as everything else, and they get the same licence audit. What the scroll
 * declares in `[dependencies]` is therefore the box's business rather than the runtime's, which is
 * why this adapter contributes no dependency of its own.
 *
 * **Link repair is out of scope**, deliberately and for now. A binary that resolves its libraries
 * through an absolute path recorded at compile time will not find them inside a box, and fixing
 * that means per-format work — rpath on Linux, `install_name` on macOS, the DLL search order on
 * Windows — that deserves its own pass rather than a guess in this one. A native box must ship a
 * binary that already resolves: statically linked, or built with a relative rpath. This is stated
 * in the documentation as a limitation, not left for someone to discover.
 */

import { runtimeAdapter } from '../../contract/runtimes.mjs';
import { assertRelocatableLaunchers } from '../launchers.mjs';

/** @type {import('../index.mjs').RuntimeBuilder} */
export const nativeRuntimeBuilder = Object.freeze({
  id: 'native',
  contract: runtimeAdapter('native'),
  // No interpreter to install. A generated manifest for a native box declares no dependency at all,
  // and the author adds the libraries their binary actually needs.
  pixiDependency: () => null,
  repairLaunchers: assertRelocatableLaunchers,
  // Nothing to generate. Scrollcase does not compile anything, so a native scroll has to be pointed
  // at a binary that already exists; writing a starter would mean writing source for a language
  // this tool never sees.
  templates: null,
});
