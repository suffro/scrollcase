import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { codesignPayload, signableMachOFiles } from '../../src/build/codesign.mjs';

const words = (...values) => Buffer.concat(values.map((value) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}));

// Thin arm64 images as they sit on disk: little-endian, so the file type reads byte-swapped.
const thin = (fileType) => words(0xcffaedfe, 0x0c000001, 0, fileType << 24, 0, 0);
// A universal binary whose single slice starts at byte 64.
const universal = (fileType) => {
  const image = Buffer.alloc(64 + 24);
  words(0xcafebabe, 1, 0x0100000c, 0, 64, 24, 0).copy(image);
  thin(fileType).copy(image, 64);
  return image;
};
const MH_OBJECT = 1;
const MH_EXECUTE = 2;
const MH_DYLIB = 6;
const MH_BUNDLE = 8;

describe('Apple code signing of a macOS payload', () => {
  const created = [];

  afterEach(async () => {
    await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it('selects executables, libraries and bundles, thin or universal, and nothing else', async () => {
    const payloadDir = await mkdtemp(join(tmpdir(), 'scrollcase-codesign-'));
    created.push(payloadDir);
    const files = {
      'bin/tool': thin(MH_EXECUTE),
      'lib/libfat.dylib': universal(MH_DYLIB),
      'lib/python/_ext.so': thin(MH_BUNDLE),
      // Signed only into extended attributes, which no archive carries.
      'lib/crt1.o': thin(MH_OBJECT),
      'lib/fat.o': universal(MH_OBJECT),
      // A Java class file: the universal magic, followed by a class-file version, not a slice count.
      'share/Main.class': words(0xcafebabe, 0x00000034, 0, 0, 0, 0),
      'bin/launcher': Buffer.from('#!/bin/sh\nexit 0\n'),
      'lib/truncated': words(0xcffaedfe),
    };
    for (const [path, bytes] of Object.entries(files)) {
      await mkdir(join(payloadDir, path, '..'), { recursive: true });
      await writeFile(join(payloadDir, path), bytes);
    }
    expect(await signableMachOFiles(payloadDir)).toEqual({
      executables: ['bin/tool'],
      libraries: ['lib/libfat.dylib', 'lib/python/_ext.so'],
    });
  });

  it('signs and verifies libraries, then executables with their entitlements, never a script or a link', async () => {
    const payloadDir = await mkdtemp(join(tmpdir(), 'scrollcase-codesign-'));
    created.push(payloadDir);
    await mkdir(join(payloadDir, 'venv', 'bin'), { recursive: true });
    await mkdir(join(payloadDir, 'venv', 'lib'), { recursive: true });
    await writeFile(join(payloadDir, 'venv', 'bin', 'tool'), thin(MH_EXECUTE));
    await writeFile(join(payloadDir, 'venv', 'lib', 'libz.dylib'), universal(MH_DYLIB));
    await writeFile(join(payloadDir, 'venv', 'bin', 'launcher'), '#!/bin/sh\nexit 0\n');
    await symlink('libz.dylib', join(payloadDir, 'venv', 'lib', 'libz.1.dylib'));

    const calls = [];
    const signed = await codesignPayload({
      payloadDir,
      identity: 'Developer ID Application: Example (TEAMID1234)',
      entitlements: '/project/entitlements.plist',
      run: (command, args, options) => calls.push({ command, args, cwd: options.cwd }),
    });
    const signArguments = ['--force', '--options', 'runtime', '--timestamp', '--sign', 'Developer ID Application: Example (TEAMID1234)'];
    expect(signed).toBe(2);
    expect(calls).toEqual([
      { command: 'codesign', args: [...signArguments, './venv/lib/libz.dylib'], cwd: payloadDir },
      { command: 'codesign', args: ['--verify', '--strict', './venv/lib/libz.dylib'], cwd: payloadDir },
      {
        command: 'codesign',
        args: [...signArguments, '--entitlements', '/project/entitlements.plist', './venv/bin/tool'],
        cwd: payloadDir,
      },
      { command: 'codesign', args: ['--verify', '--strict', './venv/bin/tool'], cwd: payloadDir },
    ]);
  });

  it('runs nothing when the payload carries no Mach-O file', async () => {
    const payloadDir = await mkdtemp(join(tmpdir(), 'scrollcase-codesign-'));
    created.push(payloadDir);
    await writeFile(join(payloadDir, 'README'), 'text\n');
    const calls = [];
    expect(await codesignPayload({ payloadDir, identity: 'x', run: (...args) => calls.push(args) })).toBe(0);
    expect(calls).toEqual([]);
  });
});
