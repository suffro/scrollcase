/**
 * The dependency list in a box's pixi manifests.
 *
 * Writing `pixi.toml` by hand is the second-most tedious part of authoring a box, and unlike the
 * scroll it has to be edited once per target. This module changes the `[dependencies]` table of
 * every manifest in a box, so a dependency is added in one command rather than three edits that have
 * to agree.
 *
 * It edits the text rather than parsing and re-emitting TOML. A parser would be a new runtime
 * dependency for a job whose whole scope is one table of `name = "spec"` lines, and re-emitting
 * would rewrite comments and spacing the project chose. Text editing keeps the manifest a file its
 * author still recognises.
 *
 * No version is looked up. A manifest declares what is acceptable and `pixi.lock` records what was
 * actually solved, so an added dependency defaults to `*` and the lock — committed and reviewed —
 * pins the newest version that fits everything else. Asking the network for a "latest" to write here
 * would put a second, weaker pin next to the real one.
 *
 * Everything here is substrate: a conda package name and a pixi table, whatever runtime the box
 * packs. Reading a *Python* project's `requirements.txt` into these terms is a Python fact and lives
 * at `src/runtimes/python/dependencies.mjs`.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fail } from './process.mjs';

const DEPENDENCIES_TABLE = '[dependencies]';

/** A conda package name, as conda-forge spells them. */
const PACKAGE_NAME = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

/**
 * Inserts or replaces one dependency in a manifest's `[dependencies]` table.
 *
 * @param {string} manifest the file's text
 * @param {string} name
 * @param {string} spec
 * @returns {{ text: string, replaced: boolean }}
 */
export function withDependency(manifest, name, spec) {
  const lines = manifest.split('\n');
  const entry = `${name} = "${spec}"`;
  const header = lines.findIndex((line) => line.trim() === DEPENDENCIES_TABLE);
  if (header === -1) {
    const text = `${manifest.replace(/\n*$/, '')}\n\n${DEPENDENCIES_TABLE}\n${entry}\n`;
    return { text, replaced: false };
  }
  // The table runs to the next header or the end of the file.
  let end = lines.length;
  for (let index = header + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) {
      end = index;
      break;
    }
  }
  const existing = lines.findIndex((line, index) =>
    index > header && index < end && new RegExp(`^\\s*(?:"${name}"|${name})\\s*=`).test(line));
  if (existing !== -1) {
    lines[existing] = entry;
    return { text: lines.join('\n'), replaced: true };
  }
  // After the table's last declaration, so trailing blank lines stay where the author put them.
  let insertAt = end;
  while (insertAt > header + 1 && lines[insertAt - 1].trim() === '') insertAt -= 1;
  lines.splice(insertAt, 0, entry);
  return { text: lines.join('\n'), replaced: false };
}

/**
 * Adds one dependency to each of a box's pixi manifests.
 *
 * @param {{ manifests: string[], name: string, spec?: string }} options
 * @returns {Promise<{ written: string[], replaced: boolean }>}
 */
export async function addDependency({ manifests, name, spec = '*' }) {
  if (!PACKAGE_NAME.test(name)) {
    fail(`Not a conda package name: ${name}. conda-forge names are lowercase, as in "onnxruntime".`);
  }
  if (typeof spec !== 'string' || spec.trim() === '' || spec.includes('"')) {
    fail(`Not a version specification: ${spec}`);
  }
  const written = [];
  let replaced = false;
  for (const path of manifests) {
    const manifest = await readFile(path, 'utf8');
    const result = withDependency(manifest, name, spec.trim());
    replaced = replaced || result.replaced;
    if (result.text === manifest) continue;
    await writeFile(path, result.text);
    written.push(path);
  }
  return { written, replaced };
}
