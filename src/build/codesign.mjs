/**
 * Apple code signing of a macOS payload, when the caller asks for it.
 *
 * A box that travels inside a macOS application is inspected by Apple's notary service, which
 * unpacks nested archives and rejects every Mach-O file that lacks a Developer ID signature, a
 * secure timestamp or, for an executable, the hardened runtime. The box cannot be signed after it
 * is built — its archive hash is already committed to by the signed release — so the payload is
 * signed here: before the self-test, which then proves the box still runs signed, and before the
 * digest and the archive commit to its bytes. Nothing rewrites a payload file on extraction, so the
 * signatures hold in every consumer.
 *
 * Only executables, dynamic libraries and bundles are signed: they carry the signature inside the
 * image. `codesign` accepts an object file too, but stores that signature in extended attributes,
 * which no archive carries — a signature that would verify here and be gone in every consumer.
 *
 * It is opt-in and never a default, because it gives up determinism: Apple's timestamp authority
 * issues a fresh timestamp for every signature, so two signed builds of one commit differ. Rejected:
 * signing without a timestamp to keep the archive reproducible, which notarization refuses.
 */

import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { collectRegularFiles } from './filesystem.mjs';

// One `codesign` invocation per batch keeps the argument list far below the system limit while
// still paying the process start only a handful of times on a prefix with hundreds of libraries.
const BATCH_SIZE = 200;

// Thin magics as read big-endian: the first two are big-endian images, the last two little-endian.
const BIG_ENDIAN_MAGICS = new Set([0xfeedface, 0xfeedfacf]);
const LITTLE_ENDIAN_MAGICS = new Set([0xcefaedfe, 0xcffaedfe]);
const UNIVERSAL_MAGIC = 0xcafebabe;
const UNIVERSAL_64_MAGIC = 0xcafebabf;
// MH_EXECUTE, MH_DYLIB and MH_BUNDLE: the file types that embed their own signature.
const SIGNABLE_FILE_TYPES = new Set([0x2, 0x6, 0x8]);

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {number} position
 * @param {number} length
 * @returns {Promise<Buffer>}
 */
async function readAt(handle, position, length) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

/**
 * The Mach-O file type of the image in `handle`, or null when it is not a Mach-O image. A universal
 * binary answers with its first slice, since every slice of one file is the same kind of image.
 *
 * A universal binary shares its magic with a Java class file. The next four bytes tell them apart:
 * a class file's are its version, 45 or more, and a universal header's are its slice count, which
 * is small.
 *
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {number} [offset]
 * @returns {Promise<number | null>}
 */
async function machOFileType(handle, offset = 0) {
  const header = await readAt(handle, offset, 24);
  if (header.length < 16) return null;
  const magic = header.readUInt32BE(0);
  if (BIG_ENDIAN_MAGICS.has(magic)) return header.readUInt32BE(12);
  if (LITTLE_ENDIAN_MAGICS.has(magic)) return header.readUInt32LE(12);
  if (offset !== 0 || header.length < 24) return null;
  if (magic !== UNIVERSAL_MAGIC && magic !== UNIVERSAL_64_MAGIC) return null;
  const slices = header.readUInt32BE(4);
  if (slices === 0 || slices >= 20) return null;
  // The first slice's offset follows its CPU type and subtype: 32 bits wide, or 64 in the 64 form.
  const slice = magic === UNIVERSAL_MAGIC ? header.readUInt32BE(16) : Number(header.readBigUInt64BE(16));
  return slice > 0 ? machOFileType(handle, slice) : null;
}

/**
 * Lists the payload files `codesign` should sign, in the stable archive order. Links are left out:
 * signing through one would sign its target a second time.
 *
 * @param {string} payloadDir
 * @returns {Promise<string[]>}
 */
export async function signableMachOFiles(payloadDir) {
  const found = [];
  for (const path of await collectRegularFiles(payloadDir)) {
    const handle = await open(join(payloadDir, path), 'r');
    try {
      if (SIGNABLE_FILE_TYPES.has(await machOFileType(handle))) found.push(path);
    } finally {
      await handle.close();
    }
  }
  return found;
}

/**
 * Signs every signable Mach-O file in the payload with `identity`, the hardened runtime and a
 * secure timestamp, then verifies each signature. Returns how many files were signed.
 *
 * @param {{ payloadDir: string, identity: string, run: typeof import('./process.mjs').run }} options
 * @returns {Promise<number>}
 */
export async function codesignPayload({ payloadDir, identity, run }) {
  // `./` keeps a file whose name starts with a dash from being read as an option.
  const files = (await signableMachOFiles(payloadDir)).map((path) => `./${path}`);
  for (let start = 0; start < files.length; start += BATCH_SIZE) {
    const batch = files.slice(start, start + BATCH_SIZE);
    run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--sign', identity, ...batch], {
      cwd: payloadDir,
      capture: true,
    });
    run('codesign', ['--verify', '--strict', ...batch], { cwd: payloadDir, capture: true });
  }
  return files.length;
}
