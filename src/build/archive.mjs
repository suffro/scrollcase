/**
 * Deterministic archive creation and defensive extraction.
 *
 * Writing: every box ships as a ZIP whose bytes depend only on its contents — fixed timestamps,
 * stable file ordering, and modes synthesised from what the runtime and the scroll declared rather
 * than read off the build machine — so rebuilding the same commit reproduces the archive bit for bit.
 *
 * Reading: nothing from inside an archive is trusted before it is validated. Entry names are
 * checked against path traversal, links and special entries are rejected outright, and both ZIP
 * and TAR are handled by pinned Node implementations rather than whatever tools the host happens
 * to have — an archive behaves the same on every machine that opens it.
 */
import { constants, createWriteStream } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { findEntryThroughLink, findUnresolvableLink } from '../contract/links.mjs';
import { isExecutablePayloadPath, runtimeAdapter } from '../contract/runtimes.mjs';
import {
  FIXED_ARCHIVE_TIME,
  collectEntries,
  collectFiles,
  fileExists,
  safeRelativePath,
  validateExtractedTree,
} from './filesystem.mjs';
import { fail } from './process.mjs';

const ZIP_FILE_TYPE_MASK = 0o170000;
const ZIP_REGULAR_FILE = 0o100000;
const ZIP_DIRECTORY = 0o040000;
const ZIP_SYMBOLIC_LINK = 0o120000;

/**
 * Returns the stable archive mode for a box payload file.
 *
 * Executability is *declared*, from two sources joined into one rule. The runtime contributes what
 * no scroll could name by hand — a conda prefix generates hundreds of console scripts, and the
 * runtime is what knows where they land. The scroll contributes everything it brought in itself:
 * an asset arrives over HTTP, which carries content and not permissions, and a local file is copied
 * rather than moved, so neither has a mode to inherit and both would otherwise be unrunnable.
 *
 * The mode is still *synthesised* rather than read off disk, which is what keeps two builds of one
 * commit byte-identical whatever umask each ran under, and keeps `payload-digest.v1` — which
 * excludes mode — honest.
 */
function archiveFileMode(adapter, relativePath, executablePaths) {
  if (adapter.host.platform === 'win32') return 0o100644;
  return isExecutablePayloadPath(executablePaths, relativePath) ? 0o100755 : 0o100644;
}

/**
 * Joins the runtime's executable rule with the paths the scroll declared executable.
 *
 * @param {string} runtimeId
 * @param {import('../contract/targets.mjs').BoxTargetAdapter} adapter
 * @param {readonly string[]} declared payload paths the scroll marked executable
 * @returns {import('../contract/runtimes.mjs').ExecutablePayloadPaths}
 */
function declaredExecutablePaths(runtimeId, adapter, declared) {
  const rule = runtimeAdapter(runtimeId).executablePayloadPaths(adapter);
  return { files: [...rule.files, ...declared], directories: rule.directories };
}

/**
 * Whether the archive will give one payload path the executable bit.
 *
 * Asked before the archive is written, by the one check that matters for a box nobody can start:
 * the file a box runs has to come out of the archive runnable. A Windows target carries no modes at
 * all — `archiveFileMode` writes 0644 for every entry there and Windows decides executability by
 * extension — so the question does not arise and the answer is yes.
 *
 * @param {import('../contract/targets.mjs').BoxTargetAdapter} adapter
 * @param {string} runtimeId
 * @param {readonly string[]} declared payload paths the scroll marked executable
 * @param {string} relativePath
 * @returns {boolean}
 */
export function archiveMarksExecutable(adapter, runtimeId, declared, relativePath) {
  if (adapter.host.platform === 'win32') return true;
  return isExecutablePayloadPath(
    declaredExecutablePaths(runtimeId, adapter, declared),
    relativePath,
  );
}

/**
 * Whether a payload path was declared as one whose bytes are already compressed.
 *
 * A match is exact or by directory prefix, so one declaration can name a single large file or
 * the whole tree an expanded asset archive landed in. Nothing here opens the file or reads its
 * extension: the answer depends only on the scroll and the path, which is what keeps two builds of
 * the same commit byte-identical.
 *
 * @param {string} path
 * @param {readonly string[]} declared
 * @returns {boolean}
 */
function isDeclaredUncompressed(path, declared) {
  return declared.some((entry) => path === entry || path.startsWith(`${entry}/`));
}

/**
 * Streams a deterministic, Zip64-capable box archive using the pinned Node backend.
 *
 * Deflating an already-compressed file is pure loss: measured on incompressible bytes, level 6
 * runs at 47 MB/s and the result is 0.03% *larger* than the input, and dropping to level 1 buys
 * 4 MB/s because the search fails either way. Declared assets are the only thing in a box large
 * enough for that to matter, so they and `uncompressedPaths` are stored instead. Everything else —
 * the interpreter, the site-packages tree, the notices — compresses genuinely and still does.
 *
 * @param {string} payloadDir
 * @param {string} archivePath
 * @param {import('../contract/targets.mjs').BoxTargetAdapter} adapter
 * @param {object} options
 * @param {string} options.runtimeId whose rule decides which entries carry the executable bit
 * @param {readonly string[]} [options.uncompressedPaths] payload paths stored rather than deflated
 * @param {readonly string[]} [options.executablePaths] payload paths the scroll declared executable
 * @returns {Promise<void>}
 */
export async function createDeterministicZip(payloadDir, archivePath, adapter, options) {
  const { runtimeId, uncompressedPaths = [], executablePaths: declared = [] } = options;
  const entries = await collectEntries(payloadDir);
  const executablePaths = declaredExecutablePaths(runtimeId, adapter, declared);
  assertPayloadLinksAreCarryable(entries);
  await rm(archivePath, { force: true });
  await mkdir(dirname(archivePath), { recursive: true });
  const zip = new yazl.ZipFile();
  const output = pipeline(zip.outputStream, createWriteStream(archivePath, { flags: 'wx' }));
  for (const entry of entries) {
    if (entry.kind === 'link') {
      // A link is its target string, stored under a mode whose type bits say what it is — the same
      // two facts every ZIP implementation reads it back from.
      zip.addBuffer(Buffer.from(entry.linkTarget, 'utf8'), entry.path, {
        compress: false,
        mtime: FIXED_ARCHIVE_TIME,
        mode: ZIP_SYMBOLIC_LINK | 0o777,
        forceDosTimestamp: true,
      });
      continue;
    }
    // yazl rejects a compress/compressionLevel pair that disagrees, so the two are derived from
    // one decision rather than set independently.
    const compressionLevel = isDeclaredUncompressed(entry.path, uncompressedPaths) ? 0 : 6;
    zip.addFile(join(payloadDir, ...entry.path.split('/')), entry.path, {
      compress: compressionLevel !== 0,
      compressionLevel,
      mtime: FIXED_ARCHIVE_TIME,
      mode: archiveFileMode(adapter, entry.path, executablePaths),
      forceDosTimestamp: true,
    });
  }
  zip.end({ forceZip64Format: false });
  await output;
}

/**
 * Refuses to archive a payload whose links do not satisfy the contract rule.
 *
 * The builder settles links against the real filesystem; this asks the same question of the entry
 * set that will actually be written, which is what a consumer will later be handed. A failure here
 * is a bug in this repository rather than bad input — but shipping a box a consumer must reject is
 * worse than not building one.
 *
 * @param {Array<{ path: string, kind: string, linkTarget?: string }>} entries
 */
function assertPayloadLinksAreCarryable(entries) {
  const unresolvable = findUnresolvableLink(entries);
  if (unresolvable) fail(`Box link does not resolve to a file inside the payload: ${unresolvable}`);
  const throughLink = findEntryThroughLink(entries);
  if (throughLink) fail(`Box entry would be written through a link: ${throughLink}`);
}

/**
 * The longest link target a payload may carry. A real one is a file name; anything approaching a
 * path limit is either corrupt or an attempt to make reading the archive expensive.
 */
const MAX_LINK_TARGET_BYTES = 1024;

/** Classifies a ZIP entry and rejects special entries and encrypted files. */
function classifyZipEntry(entry) {
  if ((entry.generalPurposeBitFlag & 0x1) !== 0) fail(`Encrypted ZIP entries are not allowed: ${entry.fileName}`);
  const path = safeRelativePath(entry.fileName.endsWith('/') ? entry.fileName.slice(0, -1) : entry.fileName);
  const unixType = (entry.externalFileAttributes >>> 16) & ZIP_FILE_TYPE_MASK;
  if (unixType === ZIP_SYMBOLIC_LINK) {
    if (entry.uncompressedSize > MAX_LINK_TARGET_BYTES) fail(`Archive link target is too long: ${path}`);
    // The target itself is the entry's content, so it is not known yet; listZipEntries reads it
    // before anything is validated, and nothing may be extracted until it has.
    return { path, kind: 'link', size: entry.uncompressedSize, mode: 0o777, linkTarget: null };
  }
  const directory = entry.fileName.endsWith('/') || unixType === ZIP_DIRECTORY;
  if (!directory && unixType !== 0 && unixType !== ZIP_REGULAR_FILE) {
    fail(`Archive special entries are not allowed: ${path}`);
  }
  return {
    path,
    kind: directory ? 'directory' : 'file',
    size: entry.uncompressedSize,
    mode: (entry.externalFileAttributes >>> 16) & 0o777,
  };
}

/** Rejects duplicate paths and file/directory collisions before extraction begins. */
function assertNoZipEntryCollisions(entries) {
  const seen = new Map();
  const parentsWithChildren = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) fail(`Archive entry collides with another entry: ${entry.path}`);
    const parts = entry.path.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      const parent = parts.slice(0, index).join('/');
      if (seen.get(parent) === 'file') {
        fail(`Archive entry collides with another entry: ${entry.path}`);
      }
      parentsWithChildren.add(parent);
    }
    if (entry.kind === 'file' && parentsWithChildren.has(entry.path)) {
      fail(`Archive entry collides with another entry: ${entry.path}`);
    }
    seen.set(entry.path, entry.kind);
  }
}

/** Opens a ZIP with strict names, path validation, and uncompressed-size checks enabled. */
async function openZip(archivePath) {
  return yauzl.openPromise(archivePath, {
    autoClose: false,
    decodeStrings: true,
    lazyEntries: true,
    strictFileNames: true,
    validateEntrySizes: true,
  });
}

/**
 * Lists and validates all entries before any ZIP data is trusted or extracted.
 *
 * @param {string} archivePath
 * @returns {Promise<Array<{
 *   path: string,
 *   kind: 'directory' | 'file',
 *   size: number,
 *   mode: number,
 * }>>}
 */
export async function listZipEntries(archivePath) {
  const zip = await openZip(archivePath);
  const entries = [];
  try {
    for await (const entry of zip.eachEntry()) {
      const classified = classifyZipEntry(entry);
      if (classified.kind === 'link') {
        const chunks = [];
        const stream = await zip.openReadStreamPromise(entry);
        for await (const chunk of stream) chunks.push(chunk);
        classified.linkTarget = Buffer.concat(chunks).toString('utf8');
      }
      entries.push(classified);
    }
  } finally {
    await zip.close();
  }
  assertNoZipEntryCollisions(entries);
  // Every link is judged by the same rule the builder applied, against the archive as received
  // rather than as intended. A box assembled by hand gets no benefit of the doubt here.
  const unresolvable = findUnresolvableLink(entries);
  if (unresolvable) fail(`Archive link does not resolve to a file inside the payload: ${unresolvable}`);
  const throughLink = findEntryThroughLink(entries);
  if (throughLink) fail(`Archive entry would be written through a link: ${throughLink}`);
  return entries;
}

/**
 * Reads one small ZIP metadata entry without extracting the surrounding archive.
 *
 * @param {string} archivePath
 * @param {string} wantedPath
 * @param {number} [maximumBytes]
 * @returns {Promise<string>}
 */
export async function readZipEntry(archivePath, wantedPath, maximumBytes = 1024 * 1024) {
  const safePath = safeRelativePath(wantedPath);
  const zip = await openZip(archivePath);
  try {
    for await (const entry of zip.eachEntry()) {
      const classified = classifyZipEntry(entry);
      if (classified.path !== safePath || classified.kind !== 'file') continue;
      if (classified.size > maximumBytes) fail(`ZIP entry is too large to read as metadata: ${safePath}`);
      const stream = await zip.openReadStreamPromise(entry);
      const chunks = [];
      let length = 0;
      for await (const chunk of stream) {
        length += chunk.length;
        if (length > maximumBytes) fail(`ZIP entry is too large to read as metadata: ${safePath}`);
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString('utf8');
    }
  } finally {
    await zip.close();
  }
  fail(`ZIP archive does not contain ${safePath}`);
}

/**
 * Extracts a prevalidated ZIP without shelling out to whatever unzip the host provides.
 *
 * @param {string} archivePath
 * @param {string} destination
 * @returns {Promise<void>}
 */
export async function extractZipArchive(archivePath, destination) {
  // Validated in full first, and the targets it returns are the only ones written below: reading
  // the link target twice would let a concurrently rewritten archive pass the check with one value
  // and extract with another.
  const validated = await listZipEntries(archivePath);
  const linkTargets = new Map(validated
    .filter((entry) => entry.kind === 'link')
    .map((entry) => [entry.path, entry.linkTarget]));
  await mkdir(destination, { recursive: true });
  const zip = await openZip(archivePath);
  try {
    for await (const entry of zip.eachEntry()) {
      const classified = classifyZipEntry(entry);
      const outputPath = join(destination, ...classified.path.split('/'));
      if (classified.kind === 'directory') {
        await mkdir(outputPath, { recursive: true });
        continue;
      }
      await mkdir(dirname(outputPath), { recursive: true });
      if (classified.kind === 'link') {
        // Written as the relative string it was validated as, never as a resolved absolute path:
        // the link must mean the same thing wherever the box is extracted.
        await symlink(linkTargets.get(classified.path), outputPath);
        continue;
      }
      const stream = await zip.openReadStreamPromise(entry);
      const mode = classified.mode || 0o644;
      await pipeline(stream, createWriteStream(outputPath, { flags: 'wx', mode }));
      // `open(2)` masks the mode it is given by the process umask, so a box extracted under 077
      // would silently lose the executable bit the archive states — and the box would fail to run
      // for reasons nothing in it explains. Say the mode again, explicitly, the way key writing
      // already has to (`src/sign/keys.mjs`). Windows has no bit to restore.
      if (process.platform !== 'win32') await chmod(outputPath, mode & 0o7777);
    }
  } finally {
    await zip.close();
  }
  await validateExtractedTree(destination, { allowLinks: true });
}

/** Lists TAR assets and rejects paths, links, and special entries before extraction. */
async function validateTarArchive(archivePath) {
  let violation;
  await tar.t({
    file: archivePath,
    gzip: true,
    strict: true,
    onentry(entry) {
      if (violation) return;
      try {
        safeRelativePath(entry.path.endsWith('/') ? entry.path.slice(0, -1) : entry.path);
        if (!['File', 'OldFile', 'Directory'].includes(entry.type)) {
          violation = `Archive links and special entries are not allowed: ${entry.path}`;
        }
      } catch (error) {
        violation = error instanceof Error ? error.message : String(error);
      }
    },
  });
  if (violation) fail(violation);
}

/**
 * Extracts scroll assets using only pinned Node archive implementations.
 *
 * @param {string} archivePath
 * @param {'zip' | 'tar.gz'} format
 * @param {string} destination
 * @param {number} [stripComponents]
 * @returns {Promise<void>}
 */
export async function extractScrollArchive(archivePath, format, destination, stripComponents = 0) {
  const tempRoot = await mkdtemp(join(tmpdir(), 'scrollcase-extract-'));
  try {
    if (format === 'zip') {
      await extractZipArchive(archivePath, tempRoot);
    } else if (format === 'tar.gz') {
      await validateTarArchive(archivePath);
      await tar.x({
        file: archivePath,
        cwd: tempRoot,
        gzip: true,
        preservePaths: false,
        strict: true,
      });
      await validateExtractedTree(tempRoot);
    } else {
      fail(`Unsupported archive format: ${format}`);
    }

    let source = tempRoot;
    for (let index = 0; index < stripComponents; index += 1) {
      const entries = await collectFiles(source);
      const topLevels = [...new Set(entries
        .map((entry) => entry.split('/')[0])
        .filter((entry) => entry !== '__MACOSX'))];
      if (topLevels.length !== 1) fail(`Cannot strip archive component ${index + 1}: expected one root directory`);
      const nextSource = join(source, topLevels[0]);
      if (!(await stat(nextSource)).isDirectory()) {
        fail(`Cannot strip archive component ${index + 1}: expected one root directory`);
      }
      source = nextSource;
    }
    const files = await collectFiles(source);
    // Archives may add a subtree beside verified assets, but must never replace those assets.
    for (const file of files) {
      if (await fileExists(join(destination, ...file.split('/')))) {
        fail(`Scroll archive entry already exists in destination: ${file}`);
      }
    }
    await mkdir(destination, { recursive: true });
    for (const file of files) {
      const outputPath = join(destination, ...file.split('/'));
      await mkdir(dirname(outputPath), { recursive: true });
      await copyFile(join(source, ...file.split('/')), outputPath, constants.COPYFILE_EXCL);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
