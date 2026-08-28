/**
 * The one file a Node box has to carry that nothing declares.
 *
 * Node decides whether a `.js` file is CommonJS or an ES module by walking *up* from the file to
 * the nearest `package.json`. Inside a box there usually is none — so the walk leaves the box and
 * asks whatever directory the box happened to be extracted into. A box extracted under a project
 * whose `package.json` says `"type": "module"` runs its own entry point as ESM; the same box
 * extracted one directory higher runs it as CommonJS. That is a box whose behaviour depends on
 * where it was put, which is the one thing a box exists not to be. It was found by building one:
 * the example box failed its self-test against this repository's own `package.json`.
 *
 * So the box carries its own, and the walk stops inside it. The contents are fixed, so two builds
 * of one commit still produce the same bytes, and it is written only when the payload does not
 * already have one — a project that ships a `package.json` of its own has said what it wants, and
 * overwriting that would replace an answer with a default.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileExists } from '../../build/filesystem.mjs';

/** The manifest a Node box gets when it declares none: Node's own default, said out loud. */
const BOX_PACKAGE_MANIFEST = `${JSON.stringify({
  name: 'scrollcase-box',
  private: true,
  type: 'commonjs',
}, null, 2)}\n`;

/**
 * Writes the box's own `package.json`, unless the payload already carries one.
 *
 * @param {string} payloadDir
 * @returns {Promise<readonly string[]>} the payload paths written, for the build log
 */
export async function writeNodePackageManifest(payloadDir) {
  const path = join(payloadDir, 'package.json');
  if (await fileExists(path)) return [];
  await writeFile(path, BOX_PACKAGE_MANIFEST);
  return ['package.json'];
}
