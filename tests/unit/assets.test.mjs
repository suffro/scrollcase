import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { downloadVerified, expandAssetArchive } from '../../src/build/assets.mjs';
import { fileExists } from '../../src/build/filesystem.mjs';
import { writeAssetArchive } from '../helpers/asset-archive.mjs';

const created = [];
afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function scratch() {
  const path = await mkdtemp(join(tmpdir(), 'scrollcase-assets-'));
  created.push(path);
  return path;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

describe('executable members of asset archives', () => {
  async function staged(format = 'tar.gz', overrides = {}, contents = {}) {
    const root = await scratch();
    const { path } = await writeAssetArchive(join(root, 'upstream'), { format, ...contents });
    const payload = join(root, 'payload');
    await mkdir(payload);
    await copyFile(path, join(payload, `source.${format}`));
    return {
      payload,
      archive: {
        relativePath: `source.${format}`, format, destination: 'tools',
        stripComponents: 1, executables: ['bin/tool'], ...overrides,
      },
    };
  }

  for (const format of ['zip', 'tar', 'tar.gz']) {
    for (const stripComponents of [0, 1]) {
      for (const removeAfterExtract of [true, false]) {
        it(`validates ${format} members with strip=${stripComponents}, remove=${removeAfterExtract}`, async () => {
          const member = stripComponents ? 'bin/tool' : 'wrapper/bin/tool';
          const { payload, archive } = await staged(format, {
            stripComponents, removeAfterExtract, executables: [member],
          });
          await expect(expandAssetArchive(payload, archive)).resolves.toEqual([`tools/${member}`]);
          expect(await fileExists(join(payload, `source.${format}`))).toBe(!removeAfterExtract);
        });
      }
    }
  }

  for (const path of ['missing', 'bin', '../escape', '/absolute', 'C:/drive', 'C:drive',
    'bin/../tool', './bin/tool', 'bin/./tool', 'bin//tool', 'bin/tool/', 'bin\\tool', 'bad\0path', '']) {
    it(`refuses the invalid member ${JSON.stringify(path)} and names its field`, async () => {
      const { payload, archive } = await staged('tar.gz', { executables: [path] });
      const error = await expandAssetArchive(payload, archive).catch((error) => error);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('assetArchives[].executables');
      expect(error.message).toContain(JSON.stringify(path));
      expect(await fileExists(join(payload, archive.relativePath))).toBe(true);
    });
  }

  it('refuses a duplicate declaration before extraction', async () => {
    const { payload, archive } = await staged('zip', { executables: ['bin/tool', 'bin/tool'] });
    await expect(expandAssetArchive(payload, archive)).rejects.toThrow(/assetArchives\[\]\.executables.*bin\/tool.*duplicate/i);
    expect(await fileExists(join(payload, 'tools'))).toBe(false);
  });

  it('does not borrow a regular file already in the destination', async () => {
    const { payload, archive } = await staged('tar', { executables: ['other'] });
    await mkdir(join(payload, 'tools'));
    await writeFile(join(payload, 'tools', 'other'), 'from elsewhere');
    await expect(expandAssetArchive(payload, archive)).rejects.toThrow(/assetArchives\[\]\.executables.*other.*member/);
  });

  it('accepts empty and absent declarations', async () => {
    for (const executables of [undefined, []]) {
      const { payload, archive } = await staged('zip', { executables });
      await expect(expandAssetArchive(payload, archive)).resolves.toEqual([]);
    }
  });

  for (const format of ['zip', 'tar', 'tar.gz']) {
    it(`refuses a declared link in ${format} before it can become a copied regular file`, async () => {
      const { payload, archive } = await staged(format, { executables: ['bin/alias'] }, {
        links: { 'wrapper/bin/alias': 'tool' },
      });
      await expect(expandAssetArchive(payload, archive)).rejects.toThrow(/assetArchives\[\]\.executables.*bin\/alias.*link/);
    });
  }

  it('refuses a destination traversing a link', async () => {
    const { payload, archive } = await staged();
    await mkdir(join(payload, 'real'));
    await symlink('real', join(payload, 'tools'), 'dir');
    await expect(expandAssetArchive(payload, archive)).rejects.toThrow(/assetArchives\[\]\.executables.*bin\/tool.*link/);
    expect(await fileExists(join(payload, 'real', 'bin', 'tool'))).toBe(false);
  });

  it('refuses a link below the destination before copying through it', async () => {
    const { payload, archive } = await staged();
    const outside = join(payload, '..', 'outside');
    await mkdir(outside);
    await mkdir(join(payload, 'tools'));
    await symlink(outside, join(payload, 'tools', 'bin'), 'dir');
    await expect(expandAssetArchive(payload, archive)).rejects.toThrow(/assetArchives\[\]\.executables.*bin\/tool.*link/);
    expect(await fileExists(join(outside, 'tool'))).toBe(false);
  });

  it('refuses declaring the compressed original instead of a member', async () => {
    const { payload, archive } = await staged('tar.gz', {
      destination: '.', executables: ['source.tar.gz'],
    });
    await expect(expandAssetArchive(payload, archive)).rejects.toThrow(/assetArchives\[\]\.executables.*source.tar.gz.*not a member/);
    expect(await fileExists(join(payload, 'source.tar.gz'))).toBe(true);
  });
});

function response(bytes, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    }),
  };
}

function fixture(bytes) {
  return {
    asset: {
      url: 'https://assets.example.org/weights.bin',
      relativePath: 'model-cache/weights.bin',
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
    },
    bytes,
  };
}

describe('verified asset downloads', () => {
  it('writes only bytes whose declared size and hash match', async () => {
    const root = await scratch();
    const { asset, bytes } = fixture(Buffer.from('verified bytes'));
    const destination = join(root, 'model-cache', 'weights.bin');
    await downloadVerified(asset, destination, {
      fetchImpl: async () => response(bytes),
      log: () => {},
    });
    expect(await readFile(destination)).toEqual(bytes);
    expect(await fileExists(`${destination}.part`)).toBe(false);
  });

  it('resumes a partial response and sends the exact Range header', async () => {
    const root = await scratch();
    const { asset, bytes } = fixture(Buffer.from('abcdef'));
    const destination = join(root, 'model-cache', 'weights.bin');
    await mkdir(join(root, 'model-cache'), { recursive: true });
    await writeFile(`${destination}.part`, bytes.subarray(0, 2));
    const requests = [];
    await downloadVerified(asset, destination, {
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return response(bytes.subarray(2), 206);
      },
      log: () => {},
    });
    expect(requests).toEqual([{
      url: asset.url,
      options: { headers: { Range: 'bytes=2-' }, redirect: 'follow' },
    }]);
    expect(await readFile(destination)).toEqual(bytes);
  });

  it('never promotes a same-size download with the wrong hash and restarts cleanly', async () => {
    const root = await scratch();
    const { asset, bytes } = fixture(Buffer.from('expected'));
    const destination = join(root, 'model-cache', 'weights.bin');
    await expect(downloadVerified(asset, destination, {
      fetchImpl: async () => response(Buffer.from('tampered')),
      log: () => {},
    })).rejects.toThrow(/SHA-256 mismatch/);
    expect(await fileExists(destination)).toBe(false);
    expect(await fileExists(`${destination}.part`)).toBe(false);

    const requests = [];
    await downloadVerified(asset, destination, {
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return response(bytes);
      },
      log: () => {},
    });
    expect(requests[0].options.headers).toBeUndefined();
    expect(await readFile(destination)).toEqual(bytes);
  });

  it('retries a dropped connection through injected time and logging seams', async () => {
    const root = await scratch();
    const { asset, bytes } = fixture(Buffer.from('retry'));
    const destination = join(root, 'model-cache', 'weights.bin');
    const delays = [];
    const logs = [];
    let attempts = 0;
    await downloadVerified(asset, destination, {
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('connection reset');
        return response(bytes);
      },
      wait: async (milliseconds) => delays.push(milliseconds),
      log: (message) => logs.push(message),
    });
    expect(attempts).toBe(2);
    expect(delays).toEqual([2000]);
    expect(logs[0]).toMatch(/attempt 1 failed/);
  });
});
