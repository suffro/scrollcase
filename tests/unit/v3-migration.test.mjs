import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BOX_SCHEMA_VERSION,
  CHANNELS,
  schemaUrl,
} from '../../src/contract/index.mjs';
import { decodeSignedDocument } from '../../src/sign/index.mjs';
import { resolveWorkspace } from '../../src/build/workspace.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('the v3-only contract boundary', () => {
  it('publishes only the canonical v3 scroll schema', async () => {
    expect(BOX_SCHEMA_VERSION).toBe(3);
    const schema = JSON.parse(await readFile(schemaUrl('scroll'), 'utf8'));
    expect(schema.$id).toBe('https://scrollcase.dev/schema/v3/scroll.schema.json');
    expect(schema.properties.schemaVersion.const).toBe(3);
  });

  // Both superseded versions, each named. Published v1 and v2 boxes stay historical artefacts and
  // there is no dual-read path anywhere: a reader holding one is told which rebuild it needs, not
  // handed a guess at what the document meant.
  it.each([1, 2])('rejects a v%i signed document with the migration remedy', (schemaVersion) => {
    const bytes = Buffer.from('{}');
    const document = {
      schemaVersion,
      payloadEncoding: 'base64-json-utf8',
      payloadBase64: bytes.toString('base64'),
      payloadSha256: createHash('sha256').update(bytes).digest('hex'),
      signatures: [{ algorithm: 'ed25519', keyId: 'test', signatureBase64: 'test' }],
    };
    expect(() => decodeSignedDocument(document))
      .toThrow(`Unsupported schemaVersion ${schemaVersion}; rebuild this box with Scrollcase v3.`);
  });

  it('closes the channel vocabulary to nightly, beta, and stable', () => {
    expect(CHANNELS).toEqual(['nightly', 'beta', 'stable']);
  });
});

describe('canonical scroll workspace names', () => {
  it('uses scrolls and exposes no legacy compatibility field', () => {
    const cwd = join(tmpdir(), 'scrollcase-v3-workspace');
    const workspace = resolveWorkspace({ cwd });
    expect(workspace.scrollsDir).toBe(join(cwd, 'scrolls'));
    const legacyField = ['re', 'cipesDir'].join('');
    expect(workspace).not.toHaveProperty(legacyField);
  });

  it('keeps retired product terminology out of tracked content and paths', () => {
    const retired = ['re', 'cipe'].join('');
    const contentSearch = spawnSync(
      'git',
      ['grep', '-I', '-i', '--name-only', retired, '--', '.'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(contentSearch.status, contentSearch.stderr).toBe(1);
    expect(contentSearch.stdout).toBe('');

    const trackedPaths = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
    }).split('\0').filter(Boolean);
    expect(trackedPaths.filter((path) => path.toLowerCase().includes(retired))).toEqual([]);
  });
});
