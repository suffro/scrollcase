/**
 * The launcher check every runtime shares, for the runtimes that cannot rewrite one.
 *
 * A packed conda prefix must carry no path from the machine that built it — that is the whole
 * reason `conda-unpack` is refused and the Python console scripts are rewritten. Rewriting needs a
 * parser for the trampoline a particular ecosystem generates, and Scrollcase has exactly one of
 * those (`python/launchers.mjs`, whose `'''exec'` header is Python source pretending to be shell).
 *
 * A runtime with no such parser is not thereby excused from the guarantee. So it scans instead: if
 * a generated launcher in the packed prefix carries a build path, the build stops and says so,
 * rather than shipping a box that leaks a developer's directory layout and points at an interpreter
 * that is not there. A `node` or `native` prefix normally has nothing to find — conda-forge's own
 * launchers for both resolve relative to themselves — so this is a guard, not a routine step, and
 * the day it fires it is telling the truth about a box that would not have worked.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collectFiles, fileExists } from '../build/filesystem.mjs';
import { fail } from '../build/process.mjs';

/**
 * Refuses a packed prefix whose generated launchers name the build machine.
 *
 * @param {import('../contract/runtimes.mjs').BoxRuntimeLayout} layout where the runtime sits in the
 *   payload, for the target being packed
 * @param {string} payloadDir
 * @param {readonly string[]} forbiddenPaths
 * @returns {Promise<void>}
 */
export async function assertRelocatableLaunchers(layout, payloadDir, forbiddenPaths) {
  const scriptsRoot = join(payloadDir, ...layout.scriptsDirectory.split('/'));
  if (!await fileExists(scriptsRoot)) return;
  for (const file of await collectFiles(scriptsRoot)) {
    const path = join(scriptsRoot, ...file.split('/'));
    const bytes = await readFile(path);
    if (!bytes.subarray(0, 2).equals(Buffer.from('#!'))) continue;
    const text = bytes.toString('utf8');
    const leaked = forbiddenPaths.find((value) => text.includes(value));
    if (leaked) {
      fail(`${layout.scriptsDirectory}/${file} carries a build path (${leaked}) that Scrollcase cannot rewrite for this runtime. Prune it, or package this box with the runtime whose launchers it generates.`);
    }
  }
}
