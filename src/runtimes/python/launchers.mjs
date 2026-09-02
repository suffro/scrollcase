/**
 * Repairs the console scripts a conda environment generates.
 *
 * Console scripts (tqdm, isympy, f2py, …) are written at solve time with the *build machine's*
 * absolute interpreter path in their shebang. That path means nothing on a user's machine, and
 * shipping it also leaks a developer's directory layout. Rewriting them to resolve Python next to
 * themselves is what makes the packed environment genuinely relocatable.
 *
 * It lives under the Python runtime rather than in `src/build/` because the trampoline it parses is
 * a Python fact: the `'''exec'` header is what setuptools and conda generate when an absolute
 * shebang would exceed the POSIX length limit, and the body left behind is Python source. Another
 * runtime packed from the same conda-forge substrate may well need its shebangs rewritten too, but
 * it will not need *this* parser, and pretending otherwise is how a shared helper acquires a
 * per-runtime branch.
 */

import { chmod, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { collectFiles, fileExists } from '../../build/filesystem.mjs';

/**
 * Removes either a direct shebang or a shell trampoline header from a launcher, leaving the Python
 * body. The trampoline appears when an absolute shebang would exceed the POSIX length limit; it
 * closes its quote either on its own `' '''` line or at the end of the same line (`… "$@" #'''`),
 * so both are handled by scanning forward to the line that closes the quote.
 */
function posixLauncherBody(text) {
  const lines = text.split('\n');
  if (lines.length === 0 || !lines[0].startsWith('#!')) return text;
  if (lines[1]?.startsWith("'''exec'")) {
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trimEnd().endsWith("'''")) return lines.slice(index + 1).join('\n');
    }
  }
  return lines.slice(1).join('\n');
}

/**
 * Makes generated POSIX console scripts resolve Python relative to their own installed path.
 *
 * @param {import('../../contract/runtimes.mjs').BoxRuntimeLayout} layout where the runtime sits in
 *   the payload, for the target being packed
 * @param {string} payloadDir
 * @param {readonly string[]} forbiddenPaths
 * @returns {Promise<void>}
 */
export async function repairPosixLaunchers(layout, payloadDir, forbiddenPaths) {
  const scriptsRoot = join(payloadDir, ...layout.scriptsDirectory.split('/'));
  if (!await fileExists(scriptsRoot)) return;
  const pythonName = basename(layout.entryPoint);
  for (const file of await collectFiles(scriptsRoot)) {
    const path = join(scriptsRoot, ...file.split('/'));
    const bytes = await readFile(path);
    if (!bytes.subarray(0, 2).equals(Buffer.from('#!'))) continue;
    const text = bytes.toString('utf8');
    // Search the complete generated launcher, since a trampoline hides the path below line one.
    if (!forbiddenPaths.some((value) => text.includes(value))) continue;
    const body = posixLauncherBody(text);
    const launcher = [
      '#!/bin/sh',
      `'''exec' "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/${pythonName}" "$0" "$@"`,
      "' '''",
      body,
    ].join('\n');
    await writeFile(path, launcher);
    await chmod(path, 0o755);
  }
}
