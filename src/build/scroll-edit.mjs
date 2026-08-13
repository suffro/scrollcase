/**
 * Editing a scroll that already exists.
 *
 * `authoring.mjs` creates one scroll from nothing; this module changes one that is already checked
 * in. The difference that shapes it is that a box may be split across a base and several target
 * fragments, so every edit has to answer "which file?" before it can answer "what?". That question
 * has one answer here and not one per command.
 *
 * Two guarantees hold for every edit. It is atomic: the new bytes are written to a staging file
 * beside the original and moved into place with a single rename, so an interrupted run never leaves
 * a half-written scroll. And it is verified: after writing, every target of the box is read back
 * through `readScroll` — the same path a build uses — and the originals are restored if any of them
 * no longer loads. An edit that produces a scroll the tool would refuse is not an edit worth
 * keeping.
 */

import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { compareStableStrings, fileExists, safeRelativePath, sha256File } from './filesystem.mjs';
import { fail } from './process.mjs';
import { readScroll, scrollDirectory } from './scroll.mjs';
import { getWorkspace } from './workspace.mjs';

/** The selection meaning "everything this box builds", rather than one of its targets. */
export const ALL_TARGETS = 'all';

/**
 * What a box is made of on disk: its target scrolls, and the base they share when it has one.
 *
 * @param {string} boxId
 * @returns {Promise<{ boxId: string, basePath: string | null, targets: { targetId: string, path: string }[] }>}
 */
export async function readScrollFamily(boxId) {
  const boxDir = scrollDirectory(safeRelativePath(boxId));
  let entries;
  try {
    entries = await readdir(boxDir, { withFileTypes: true });
  } catch {
    return fail(`Box not found: ${boxId}`);
  }
  const targets = [];
  for (const entry of entries.sort((left, right) => compareStableStrings(left.name, right.name))) {
    if (!entry.isDirectory()) continue;
    const path = join(boxDir, entry.name, 'scroll.json');
    if (await fileExists(path)) targets.push({ targetId: entry.name, path });
  }
  if (targets.length === 0) fail(`Box ${boxId} contains no target scrolls.`);
  const basePath = join(boxDir, 'scroll.json');
  return { boxId, basePath: await fileExists(basePath) ? basePath : null, targets };
}

/**
 * The files one edit should touch.
 *
 * A split box keeps its shared declarations in the base, so `all` is a single file there. A box
 * whose targets are separate whole scrolls has no such file, and `all` means every one of them —
 * the same intent, expressed by whatever layout the project chose.
 *
 * @param {object} family
 * @param {string} target `all`, or one target ID
 * @returns {string[]}
 */
export function scrollFilesFor(family, target) {
  if (target === ALL_TARGETS) {
    return family.basePath ? [family.basePath] : family.targets.map(({ path }) => path);
  }
  const selected = family.targets.find(({ targetId }) => targetId === target);
  if (!selected) {
    fail(`Target ${target} is not one of ${family.boxId}'s targets (${family.targets.map(({ targetId }) => targetId).join(', ')}).`);
  }
  return [selected.path];
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    return fail(`Invalid scroll at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Replaces a file's contents without ever leaving a partial one behind. */
async function writeFileAtomically(path, contents) {
  const staging = await mkdtemp(join(dirname(path), '.scrollcase-edit-'));
  const temporary = join(staging, 'scroll.json');
  try {
    await writeFile(temporary, contents);
    await rename(temporary, path);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/**
 * Applies one change to the selected files, then proves the whole box still reads.
 *
 * `mutate` receives the parsed scroll and returns the scroll to write, or null to leave the file
 * alone. Verification covers every target of the box rather than only the edited file, because a
 * base and its fragments only mean something together: an entry added to the base can collide with
 * one a fragment already declared, and that is exactly the case worth catching before it is saved.
 *
 * @param {string} boxId
 * @param {string} target `all`, or one target ID
 * @param {(scroll: object, context: { path: string, isBase: boolean }) => object | null} mutate
 * @returns {Promise<{ written: string[] }>}
 */
export async function updateScrollFiles(boxId, target, mutate) {
  const family = await readScrollFamily(boxId);
  return applyToScrollFiles(family, scrollFilesFor(family, target), mutate);
}

/** The shared write-then-verify core, over an explicit list of the box's files. */
async function applyToScrollFiles(family, paths, mutate) {
  const { boxId } = family;
  const originals = new Map();
  const written = [];
  for (const path of paths) {
    const scroll = await readJsonFile(path);
    const updated = mutate(scroll, { path, isBase: path === family.basePath });
    if (updated === null) continue;
    originals.set(path, await readFile(path));
    await writeFileAtomically(path, `${JSON.stringify(updated, null, 2)}\n`);
    written.push(path);
  }

  try {
    for (const { targetId } of family.targets) {
      await readScroll(`${boxId}/${targetId}`);
    }
  } catch (error) {
    // The scroll on disk is the one a build reads. Leaving a rejected edit there would turn one bad
    // command into a box that cannot be built until someone works out what changed.
    for (const [path, bytes] of originals) await writeFileAtomically(path, bytes);
    throw error;
  }
  return { written };
}

/**
 * Reads the box's scrolls as one view, for a command that needs to know what is already declared
 * without caring which file said it.
 *
 * @param {string} boxId
 * @returns {Promise<object[]>} one effective scroll per target
 */
export async function readEffectiveScrolls(boxId) {
  const family = await readScrollFamily(boxId);
  return Promise.all(family.targets.map(async ({ targetId }) =>
    (await readScroll(`${boxId}/${targetId}`)).scroll));
}

/** The one value the box's targets agree on for `field`, or null when they disagree. */
async function agreedValue(boxId, field) {
  const values = new Set((await readEffectiveScrolls(boxId)).map((scroll) => scroll[field]));
  return values.size === 1 ? [...values][0] : null;
}

/** Adds `relativePath` to a scroll's self-test file list, which is what survives an over-eager prune. */
function withSelfTestFile(scroll, relativePath) {
  const files = scroll.selfTest?.files ?? [];
  if (files.includes(relativePath)) return scroll.selfTest ?? {};
  return { ...scroll.selfTest, files: [...files, relativePath] };
}

/** Drops `relativePath` from a scroll's self-test file list, leaving an empty list off entirely. */
function withoutSelfTestFile(selfTest, relativePath) {
  if (!selfTest?.files?.includes(relativePath)) return selfTest;
  const files = selfTest.files.filter((file) => file !== relativePath);
  if (files.length > 0) return { ...selfTest, files };
  const { files: _dropped, ...rest } = selfTest;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/**
 * The payload path an asset URL lands at when the caller does not name one.
 *
 * The last segment of the URL path, under the box's model cache. A URL that ends in a slash, or
 * whose last segment is not a filename, gets no default: guessing a name for a file whose hash is
 * about to be pinned would be the wrong kind of helpful.
 */
function defaultAssetPath(url, modelCacheSubdir) {
  let name;
  try {
    name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '');
  } catch {
    return fail(`Not a URL: ${url}`);
  }
  if (!name || name === '.' || name === '..') {
    fail(`Cannot tell what to call ${url} in the box; pass --to <path>.`);
  }
  return `${modelCacheSubdir}/${name}`;
}

/**
 * Downloads a URL once and reports what arrived.
 *
 * An asset's size and hash are the two values a scroll cannot be written without and no author can
 * know without fetching the file, which is why writing one by hand meant downloading and hashing it
 * yourself. Recording them here does not weaken anything: the guarantee has always been that they
 * are pinned once and checked on every build, and that is unchanged.
 */
async function measureAsset(url, { fetchImpl = fetch, log = () => {} } = {}) {
  log(`Fetching ${url}`);
  let response;
  try {
    response = await fetchImpl(url, { redirect: 'follow' });
  } catch (error) {
    return fail(`Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) fail(`Asset download failed (${response.status}): ${url}`);
  const hash = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of response.body) {
    hash.update(chunk);
    sizeBytes += chunk.length;
  }
  if (sizeBytes === 0) fail(`Asset is empty: ${url}`);
  return { sizeBytes, sha256: hash.digest('hex') };
}

/**
 * `add asset` — records a remote file in the scroll, with the size and hash it actually has.
 *
 * @param {{ boxId: string, target: string, url: string, to?: string | null,
 *   fetchImpl?: typeof fetch, log?: (message: string) => void }} options
 */
export async function addAsset({ boxId, target, url, to = null, fetchImpl = fetch, log = () => {} }) {
  let relativePath;
  if (to) {
    relativePath = safeRelativePath(to);
  } else {
    const modelCacheSubdir = await agreedValue(boxId, 'modelCacheSubdir');
    if (!modelCacheSubdir) {
      fail(`${boxId}'s targets use different model cache directories; pass --to <path>.`);
    }
    relativePath = safeRelativePath(defaultAssetPath(url, modelCacheSubdir));
  }
  const { sizeBytes, sha256 } = await measureAsset(url, { fetchImpl, log });
  const entry = { url, relativePath, sizeBytes, sha256 };
  const { written } = await updateScrollFiles(boxId, target, (scroll) => ({
    ...scroll,
    assets: [...(scroll.assets ?? []), entry],
    selfTest: withSelfTestFile(scroll, relativePath),
  }));
  return { written, entry };
}

/**
 * `add file` — records a file from the project in the scroll.
 *
 * No `sha256` is written. The pin is for a file that must not change without review; a file being
 * added is usually one being worked on, and a pin there fails the next build over an edit the
 * author meant to make.
 *
 * @param {{ boxId: string, target: string, sourcePath: string, to?: string | null }} options
 */
export async function addFile({ boxId, target, sourcePath, to = null }) {
  const source = safeRelativePath(sourcePath);
  const absolute = join(getWorkspace().root, ...source.split('/'));
  let details;
  try {
    details = await lstat(absolute);
  } catch {
    return fail(`Project file is missing: ${source}`);
  }
  if (!details.isFile() || details.isSymbolicLink()) {
    fail(`A box file must be a regular file: ${source}`);
  }
  const relativePath = safeRelativePath(to ?? basename(source));
  const entry = { sourcePath: source, relativePath };
  const { written } = await updateScrollFiles(boxId, target, (scroll) => ({
    ...scroll,
    localFiles: [...(scroll.localFiles ?? []), entry],
    selfTest: withSelfTestFile(scroll, relativePath),
  }));
  return { written, entry };
}

/**
 * `remove asset` / `remove file` — the exact inverse of the two above.
 *
 * Without these, adding is a command and removing is back to editing JSON by hand, which is the
 * problem this set of commands exists to remove.
 *
 * @param {{ boxId: string, target: string, field: 'assets' | 'localFiles', relativePath: string }} options
 */
export async function removeScrollEntry({ boxId, target, field, relativePath }) {
  const path = safeRelativePath(relativePath);
  let removed = 0;
  const { written } = await updateScrollFiles(boxId, target, (scroll) => {
    const entries = scroll[field] ?? [];
    const kept = entries.filter((entry) => entry.relativePath !== path);
    if (kept.length === entries.length) return null;
    removed += entries.length - kept.length;
    const updated = { ...scroll };
    if (kept.length > 0) updated[field] = kept;
    else delete updated[field];
    const selfTest = withoutSelfTestFile(scroll.selfTest, path);
    if (selfTest === undefined) delete updated.selfTest;
    else updated.selfTest = selfTest;
    return updated;
  });
  if (removed === 0) {
    fail(`No ${field === 'assets' ? 'asset' : 'file'} at ${path} in ${boxId}${target === ALL_TARGETS ? '' : `/${target}`}.`);
  }
  return { written, removed };
}

/**
 * Fields `edit scroll` refuses, and why each one is not an edit.
 *
 * Three kinds. Structural values a project does not choose (`$schema`, `schemaVersion`, `extends`).
 * Values the layout or the target fixes, where a text prompt would only let someone contradict a
 * check they cannot win — `boxId` and `target` name the directories, and `pythonEntryPoint` has one
 * legal value per target. And the collections, which have their own commands or their own file:
 * editing a list through a single value prompt is how a list gets destroyed.
 */
const UNEDITABLE_FIELDS = Object.freeze(new Set([
  '$schema', 'schemaVersion', 'extends', 'boxId', 'target', 'pythonEntryPoint',
  'compatibility', 'environment', 'assets', 'assetArchives', 'localFiles',
  'prunePaths', 'uncompressedPaths', 'selfTest', 'execution', 'parity',
]));

/**
 * The fields `edit scroll` offers, taken from the schema rather than from a list kept in step by
 * hand: a field added to the format is offered the day it exists.
 *
 * @returns {Promise<{ name: string, description: string, choices: string[] | null }[]>}
 */
export async function editableScrollFields() {
  const schema = JSON.parse(await readFile(
    new URL('../contract/schema/scroll.schema.json', import.meta.url),
    'utf8',
  ));
  return Object.entries(schema.properties)
    .filter(([name]) => !UNEDITABLE_FIELDS.has(name))
    .map(([name, property]) => ({
      name,
      description: (property.description ?? '').split('.')[0],
      choices: property.enum ?? null,
    }));
}

/**
 * `edit scroll` — sets one field of an existing scroll.
 *
 * The value is written and the whole box is then read back, so an edit the tool would refuse never
 * reaches disk. That is the same guard every command here relies on, which is why this one can be a
 * plain assignment rather than a per-field validator that would drift from the schema.
 *
 * @param {{ boxId: string, target: string, field: string, value: string }} options
 */
export async function setScrollField({ boxId, target, field, value }) {
  const editable = await editableScrollFields();
  const declared = editable.find((candidate) => candidate.name === field);
  if (!declared) {
    fail(`${field} is not an editable scroll field. Editable: ${editable.map(({ name }) => name).join(', ')}.`);
  }
  if (declared.choices && !declared.choices.includes(value)) {
    fail(`Unsupported ${field}: ${value}. Use ${declared.choices.join(' or ')}.`);
  }
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} requires a value.`);
  const { written } = await updateScrollFiles(boxId, target, (scroll) => ({
    ...scroll,
    [field]: value.trim(),
  }));
  return { written, field, value: value.trim() };
}

/**
 * `refresh` — brings a scroll back into agreement with the project it describes.
 *
 * Only the pins a project asked for are recomputed: a `localFiles` entry that declares `sha256` is
 * saying "this file must not change without review", and after a reviewed change the digest has to
 * move with it. Editing that by hand is the toil the pin was never meant to impose.
 *
 * Remote assets are treated differently, and the difference is the point. Their hashes are what
 * stands between a replaced upstream file and a silently different box. If `refresh` re-fetched and
 * rewrote them, then every time someone swapped a file on that server the next `refresh` would adopt
 * it without a word and the build would go green — the protection would be gone. So the network is
 * never touched unless asked (`checkAssets`), a difference is reported and refused, and accepting it
 * takes a separate, explicit `repin`.
 *
 * @param {{ boxId: string, repin?: boolean, checkAssets?: boolean,
 *   fetchImpl?: typeof fetch, log?: (message: string) => void }} options
 */
export async function refreshScroll({
  boxId,
  repin = false,
  checkAssets = false,
  fetchImpl = fetch,
  log = () => {},
}) {
  const family = await readScrollFamily(boxId);
  const paths = [...(family.basePath ? [family.basePath] : []), ...family.targets.map(({ path }) => path)];
  const root = getWorkspace().root;

  // Every measurement happens before anything is written, so a refused difference — or a missing
  // file — leaves the scroll exactly as it was.
  const localFileDigests = new Map();
  for (const path of paths) {
    for (const file of (await readJsonFile(path)).localFiles ?? []) {
      if (file.sha256 === undefined || localFileDigests.has(file.sourcePath)) continue;
      const source = join(root, ...safeRelativePath(file.sourcePath).split('/'));
      if (!await fileExists(source)) fail(`Local box file is missing: ${file.sourcePath}`);
      localFileDigests.set(file.sourcePath, await sha256File(source));
    }
  }

  const measured = new Map();
  const drifted = [];
  if (checkAssets || repin) {
    for (const path of paths) {
      for (const asset of (await readJsonFile(path)).assets ?? []) {
        if (measured.has(asset.url)) continue;
        const actual = await measureAsset(asset.url, { fetchImpl, log });
        measured.set(asset.url, actual);
        if (actual.sha256 !== asset.sha256 || actual.sizeBytes !== asset.sizeBytes) {
          drifted.push({ ...asset, actual });
        }
      }
    }
    if (drifted.length > 0 && !repin) {
      fail(`${drifted.length} asset(s) no longer match what the scroll pins: ${drifted.map(({ relativePath }) => relativePath).join(', ')}. `
        + 'Check why upstream changed before accepting it, then re-run with --repin.');
    }
  }

  const repinned = [];
  const updated = [];
  const { written } = await applyToScrollFiles(family, paths, (scroll) => {
    let changed = false;
    const next = { ...scroll };
    if (scroll.localFiles) {
      next.localFiles = scroll.localFiles.map((file) => {
        if (file.sha256 === undefined) return file;
        const actual = localFileDigests.get(file.sourcePath);
        if (actual === undefined || actual === file.sha256) return file;
        changed = true;
        updated.push(file.sourcePath);
        return { ...file, sha256: actual };
      });
    }
    if (repin && scroll.assets) {
      next.assets = scroll.assets.map((asset) => {
        const actual = measured.get(asset.url);
        if (!actual || (actual.sha256 === asset.sha256 && actual.sizeBytes === asset.sizeBytes)) {
          return asset;
        }
        changed = true;
        repinned.push(asset.relativePath);
        return { ...asset, sizeBytes: actual.sizeBytes, sha256: actual.sha256 };
      });
    }
    return changed ? next : null;
  });
  return { written, updated, repinned, checked: measured.size };
}
