/**
 * Move the two Python version constants a new scroll is authored with, at release time.
 *
 * `DEFAULT_PYTHON_VERSION` and `LATEST_PYTHON_VERSION` are committed constants rather than a lookup
 * a scroll performs, because a value that changes with the calendar would make the same command
 * produce different scrolls in different months. They still have to move, so this script moves them
 * once per Scrollcase release and the change is reviewed like any other.
 *
 * The source of truth is conda-forge, not python.org: a box is solved from conda-forge, so the
 * newest Python that matters here is the newest one conda-forge has actually built. The default
 * stays one minor behind it, because the heavy compiled packages land on a new minor months after
 * the interpreter does, and a default that outruns them hands a first-time user a solve that cannot
 * succeed.
 *
 * Usage:
 *   node scripts/bump-python-version.mjs             # ask conda-forge and rewrite
 *   node scripts/bump-python-version.mjs --latest 3.15   # state it, no network
 *   node scripts/bump-python-version.mjs --check     # fail if a bump is due
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CONDA_FORGE_PYTHON = 'https://api.anaconda.org/package/conda-forge/python';
const source = fileURLToPath(new URL('../src/build/authoring.mjs', import.meta.url));

const args = process.argv.slice(2);
const check = args.includes('--check');
const statedLatest = args.includes('--latest') ? args[args.indexOf('--latest') + 1] : null;

/** `3.14.2` -> `[3, 14]`. Anything without a major and a minor is not a release we can order. */
function minorOf(version) {
  const match = /^(\d+)\.(\d+)(?:\.|$)/.exec(String(version));
  return match ? [Number(match[1]), Number(match[2])] : null;
}

const compareMinors = (left, right) => (left[0] - right[0]) || (left[1] - right[1]);

/** The newest `major.minor` conda-forge publishes a python package for. */
async function newestCondaForgeMinor() {
  const response = await fetch(CONDA_FORGE_PYTHON, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`conda-forge package query failed (${response.status}): ${CONDA_FORGE_PYTHON}`);
  }
  const versions = (await response.json())?.versions;
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error('conda-forge returned no python versions.');
  }
  const minors = versions.map(minorOf).filter(Boolean).sort(compareMinors);
  if (minors.length === 0) throw new Error('No parseable python version from conda-forge.');
  return minors.at(-1);
}

const latestMinor = statedLatest ? minorOf(statedLatest) : await newestCondaForgeMinor();
if (!latestMinor) throw new Error(`Not a major.minor version: ${statedLatest}`);
if (latestMinor[1] === 0) {
  // A hand-written table of "how many minors did 3.x have" is exactly the kind of thing that goes
  // stale silently, so this asks for a decision instead of guessing one.
  throw new Error(`Cannot derive the previous minor from ${latestMinor.join('.')}; set both constants by hand.`);
}
const latest = latestMinor.join('.');
const previous = [latestMinor[0], latestMinor[1] - 1].join('.');

const original = await readFile(source, 'utf8');
const replace = (text, name, value) => {
  const pattern = new RegExp(`(export const ${name} = ')[^']+(';)`);
  if (!pattern.test(text)) throw new Error(`${name} is no longer declared in ${source}.`);
  return text.replace(pattern, `$1${value}$2`);
};
const updated = replace(replace(original, 'DEFAULT_PYTHON_VERSION', previous), 'LATEST_PYTHON_VERSION', latest);

if (check) {
  if (updated !== original) {
    throw new Error(`Python constants are due a bump: default ${previous}, latest ${latest}. Run node scripts/bump-python-version.mjs.`);
  }
  console.log(`Python constants are current: default ${previous}, latest ${latest}.`);
} else if (updated === original) {
  console.log(`Python constants already at default ${previous}, latest ${latest}.`);
} else {
  await writeFile(source, updated);
  console.log(`Python constants set to default ${previous}, latest ${latest}.`);
}
