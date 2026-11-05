/**
 * The rules for joining a base scroll with one target's fragment.
 *
 * These are the tests the feature stands on. A join rule that is wrong in one direction loses a
 * shared declaration silently; wrong in the other, it produces an object no author wrote — so each
 * rule is asserted on its own rather than through one large expected scroll.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readScroll, scrollCandidates } from '../../src/build/scroll.mjs';
import { configureWorkspace, resetWorkspace } from '../../src/build/workspace.mjs';

const TARGET_ID = 'macos-aarch64-metal';
const TARGET = { platform: 'macos', arch: 'aarch64', accelerator: 'metal' };
const REFERENCE = `example-model/${TARGET_ID}`;

/** Everything the targets of one box share. A base declares no target of its own. */
const BASE = {
  $schema: 'https://scrollcase.dev/schema/v3/scroll.schema.json',
  schemaVersion: 3,
  boxId: 'example-model',
  labels: { model: 'example-org-example-model' },
  version: '1.0.0',
  sourceRevision: 'upstream-v1',
  runtime: { id: 'python', version: '3.14' },
  pixiVersion: '0.73.0',
  publishBaseUrl: 'https://assets.example.org/boxes',
  selfTest: { imports: ['json'] },
};

const asset = (name, hash) => ({
  url: `https://assets.example.org/${name}`,
  relativePath: `cache/${name}`,
  sizeBytes: 4,
  sha256: hash.repeat(64),
});

describe('joining a base scroll with a target fragment', () => {
  const created = [];

  afterEach(async () => {
    resetWorkspace();
    await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  /** Lays out `scrolls/<boxId>/scroll.json` plus one target fragment beside it. */
  async function family(base = BASE, fragment = { extends: '../scroll.json', target: TARGET }) {
    const root = await mkdtemp(join(tmpdir(), 'scrollcase-extends-'));
    created.push(root);
    const boxDir = join(root, 'scrolls', 'example-model');
    await mkdir(join(boxDir, TARGET_ID), { recursive: true });
    if (base) await writeFile(join(boxDir, 'scroll.json'), `${JSON.stringify(base, null, 2)}\n`);
    await writeFile(
      join(boxDir, TARGET_ID, 'scroll.json'),
      `${JSON.stringify(fragment, null, 2)}\n`,
    );
    configureWorkspace({ cwd: root });
    return root;
  }

  it('reads a fragment that declares nothing but its target', async () => {
    await family();
    const { scroll } = await readScroll(REFERENCE);

    expect(scroll.boxId).toBe('example-model');
    expect(scroll.target).toEqual(TARGET);
    expect(scroll.runtime.version).toBe('3.14');
    // The joined scroll extends nothing: it is the whole scroll, not half of one.
    expect(scroll.extends).toBeUndefined();
    expect(scroll.scrollId).toBe(`example-model-${TARGET_ID}`);
  });

  it('keeps executable members on both base and target archive entries', async () => {
    const shared = { relativePath: 'shared.tar', format: 'tar', destination: 'shared', executables: ['bin/tool'] };
    const target = { relativePath: 'target.zip', format: 'zip', destination: 'target', executables: ['bin/tool'] };
    await family({ ...BASE, assetArchives: [shared] }, {
      extends: '../scroll.json', target: TARGET, assetArchives: [target],
    });
    expect((await readScroll(REFERENCE)).scroll.assetArchives).toEqual([shared, target]);
  });

  it('refuses duplicate resulting executable paths across base and target archives', async () => {
    const archive = { relativePath: 'one.tar', format: 'tar', destination: 'tools', executables: ['bin/tool'] };
    await family({ ...BASE, assetArchives: [archive] }, {
      extends: '../scroll.json', target: TARGET,
      assetArchives: [{ ...archive, relativePath: 'two.tar', destination: './tools' }],
    });
    await expect(readScroll(REFERENCE)).rejects.toThrow(/assetArchives\[\]\.executables.*tools\/bin\/tool.*more than one/);
  });

  for (const path of ['../escape', 'bin/./tool', 'bin\\tool', '']) {
    it(`refuses the unsafe archive declaration ${JSON.stringify(path)} while reading`, async () => {
      await family({ ...BASE, assetArchives: [{
        relativePath: 'source.zip', format: 'zip', destination: 'tools', executables: [path],
      }] });
      const error = await readScroll(REFERENCE).catch((error) => error);
      expect(error.message).toContain('assetArchives[].executables');
      expect(error.message).toContain(JSON.stringify(path));
    });
  }

  it('joins environment executable paths base-first and drops repeats', async () => {
    await family({ ...BASE, executablePaths: ['venv/lib/pkg/bin/shared', 'venv/lib/pkg/bin/both'] }, {
      extends: '../scroll.json', target: TARGET,
      executablePaths: ['venv/lib/pkg/bin/both', 'venv/lib/pkg/bin/target'],
    });
    expect((await readScroll(REFERENCE)).scroll.executablePaths)
      .toEqual(['venv/lib/pkg/bin/shared', 'venv/lib/pkg/bin/both', 'venv/lib/pkg/bin/target']);
  });

  const owned = {
    'outside the environment': [{ executablePaths: ['tools/bin/helper'] }, /executablePaths: "tools\/bin\/helper" is outside venv\//],
    'an asset brings in': [
      { assets: [{ ...asset('helper', 'a'), relativePath: 'venv/extra/helper' }], executablePaths: ['venv/extra/helper'] },
      /executablePaths: "venv\/extra\/helper" is brought in by an asset or local file/,
    ],
    'an archive expands': [{
      assetArchives: [{ relativePath: 'cache/tools.zip', format: 'zip', destination: './venv/extra' }],
      executablePaths: ['venv/extra/bin/helper'],
    }, /executablePaths: "venv\/extra\/bin\/helper" lies under the destination of cache\/tools\.zip/],
  };
  for (const [name, [declaration, message]] of Object.entries(owned)) {
    it(`refuses an executable path ${name}`, async () => {
      await family({ ...BASE, ...declaration });
      await expect(readScroll(REFERENCE)).rejects.toThrow(message);
    });
  }

  for (const path of ['venv/lib/./helper', 'venv/lib/../helper', 'venv\\lib\\helper', 'venv/lib/helper/', 'C:venv/helper']) {
    it(`refuses the unsafe environment declaration ${JSON.stringify(path)} while reading`, async () => {
      await family({ ...BASE, executablePaths: [path] });
      await expect(readScroll(REFERENCE)).rejects.toThrow(/executablePaths/);
    });
  }

  it('refuses a repeated environment executable path in a whole scroll', async () => {
    await family(null, { ...BASE, target: TARGET, executablePaths: ['venv/lib/helper', 'venv/lib/helper'] });
    await expect(readScroll(REFERENCE)).rejects.toThrow(/executablePaths.*duplicate/);
  });

  it('lets a fragment replace a scalar and a cohesive object', async () => {
    await family(
      { ...BASE, version: '1.0.0', execution: { kind: 'python-module', module: 'shared.main', defaultArgs: [] } },
      {
        extends: '../scroll.json',
        target: TARGET,
        version: '2.0.0',
        execution: { kind: 'python-script', script: 'entrypoint.py', defaultArgs: ['--fast'] },
      },
    );
    const { scroll } = await readScroll(REFERENCE);

    expect(scroll.version).toBe('2.0.0');
    // Replaced whole, never merged: a python-script kind that inherited `module` from the base
    // would be an execution block no author ever wrote.
    expect(scroll.execution).toEqual({
      kind: 'python-script',
      script: 'entrypoint.py',
      defaultArgs: ['--fast'],
    });
  });

  it('joins entry lists base-first instead of replacing them', async () => {
    await family(
      {
        ...BASE,
        assets: [asset('shared.bin', 'a')],
        localFiles: [{ sourcePath: 'notice.md', relativePath: 'NOTICE.md' }],
      },
      {
        extends: '../scroll.json',
        target: TARGET,
        assets: [asset('metal.bin', 'b')],
        localFiles: [{ sourcePath: 'metal.py', relativePath: 'metal.py' }],
      },
    );
    const { scroll } = await readScroll(REFERENCE);

    // A target that adds one asset must not lose the shared ones.
    expect(scroll.assets.map(({ relativePath }) => relativePath))
      .toEqual(['cache/shared.bin', 'cache/metal.bin']);
    expect(scroll.localFiles.map(({ relativePath }) => relativePath))
      .toEqual(['NOTICE.md', 'metal.py']);
  });

  it('refuses two entries claiming one payload path', async () => {
    await family(
      { ...BASE, assets: [asset('data.bin', 'a')] },
      {
        extends: '../scroll.json',
        target: TARGET,
        assets: [{ ...asset('data.bin', 'b'), url: 'https://assets.example.org/other.bin' }],
      },
    );

    await expect(readScroll(REFERENCE))
      .rejects.toThrow(/asset and the asset at cache\/data\.bin both claim that path/);
  });

  it('refuses an asset and a local file claiming one path, whichever half declared them', async () => {
    await family(
      { ...BASE, assets: [asset('shim.py', 'a')] },
      {
        extends: '../scroll.json',
        target: TARGET,
        localFiles: [{ sourcePath: 'shim.py', relativePath: 'cache/shim.py' }],
      },
    );

    // The conflict is about the destination, not about which list an author wrote it in.
    await expect(readScroll(REFERENCE))
      .rejects.toThrow(/asset and the local file at cache\/shim\.py both claim that path/);
  });

  it('accepts an archive naming the very asset that downloaded it', async () => {
    // Download-then-expand is what the two lists exist to express together: the asset fetches the
    // archive to a path, and the archive entry reads it from there. Reading is not claiming.
    await family(
      { ...BASE, assets: [asset('source.tar.gz', 'a')] },
      {
        extends: '../scroll.json',
        target: TARGET,
        assetArchives: [{
          relativePath: 'cache/source.tar.gz',
          format: 'tar.gz',
          destination: 'source',
          removeAfterExtract: true,
        }],
      },
    );

    const { scroll } = await readScroll(REFERENCE);
    expect(scroll.assetArchives[0].relativePath).toBe('cache/source.tar.gz');
  });

  it('joins string lists and drops repeats', async () => {
    // Each half names something the other does not, so a rule that replaced rather than joined
    // would drop the base's entry and show up here.
    await family(
      {
        ...BASE,
        prunePaths: ['venv/share/doc', 'venv/share/man'],
        selfTest: { imports: ['json', 'math'], files: ['a.txt'] },
      },
      {
        extends: '../scroll.json',
        target: TARGET,
        prunePaths: ['venv/share/doc', 'venv/lib/tests'],
        selfTest: { imports: ['json', 'sqlite3'], files: ['b.txt'] },
      },
    );
    const { scroll } = await readScroll(REFERENCE);

    // A repeat here is the same instruction twice, so it is dropped rather than refused.
    expect(scroll.prunePaths).toEqual(['venv/share/doc', 'venv/share/man', 'venv/lib/tests']);
    expect(scroll.selfTest.imports).toEqual(['json', 'math', 'sqlite3']);
    expect(scroll.selfTest.files).toEqual(['a.txt', 'b.txt']);
  });

  it('joins compatibility and environment key by key, the fragment winning a shared key', async () => {
    await family(
      {
        ...BASE,
        compatibility: { minHostAppVersion: '1.0.0', minRamGb: 2 },
        environment: { HF_HUB_OFFLINE: '1', LOG_LEVEL: 'info' },
      },
      {
        extends: '../scroll.json',
        target: TARGET,
        compatibility: { minMacosVersion: '13.0' },
        environment: { LOG_LEVEL: 'debug' },
      },
    );
    const { scroll } = await readScroll(REFERENCE);

    // The macOS floor is added without restating the shared constraints.
    expect(scroll.compatibility).toEqual({
      minHostAppVersion: '1.0.0',
      minRamGb: 2,
      minMacosVersion: '13.0',
    });
    expect(scroll.environment).toEqual({ HF_HUB_OFFLINE: '1', LOG_LEVEL: 'debug' });
  });

  it('lets a fragment replace the extra self-test source in either spelling', async () => {
    await family(
      { ...BASE, selfTest: { imports: ['json'], script: 'checks/shared.py' } },
      {
        extends: '../scroll.json',
        target: TARGET,
        selfTest: { imports: ['json'], code: 'assert True' },
      },
    );
    const { scroll } = await readScroll(REFERENCE);

    // One logical slot, two spellings: keeping both would produce a scroll the schema refuses.
    expect(scroll.selfTest.code).toBe('assert True');
    expect(scroll.selfTest.script).toBeUndefined();
  });

  it('refuses a base that declares a target', async () => {
    await family({ ...BASE, target: TARGET });

    await expect(readScroll(REFERENCE)).rejects.toThrow(/declares a target/);
  });

  it('refuses a base that extends another scroll', async () => {
    await family({ ...BASE, extends: '../scroll.json' });

    await expect(readScroll(REFERENCE)).rejects.toThrow(/a base is one level, not a chain/);
  });

  it('refuses any base reference other than the box directory', async () => {
    await family(BASE, { extends: '../../other/scroll.json', target: TARGET });

    await expect(readScroll(REFERENCE)).rejects.toThrow(/the only base is \.\.\/scroll\.json/);
  });

  it('reports a missing base instead of reading half a scroll', async () => {
    await family(null);

    await expect(readScroll(REFERENCE)).rejects.toThrow(/which does not exist/);
  });

  it('reports schema failures against the joined scroll', async () => {
    const { selfTest: _selfTest, ...withoutSelfTest } = BASE;
    await family(withoutSelfTest);

    await expect(readScroll(REFERENCE)).rejects.toThrow(/joined with its base/);
  });

  it('never offers the base itself as a buildable scroll', async () => {
    await family();

    // The base is a file in the box directory, and a scroll is a target directory beneath it.
    const candidates = await scrollCandidates();
    expect(candidates.map(({ reference }) => reference)).toEqual([REFERENCE]);
  });

  it('reads a split scroll exactly like the single file it replaces', async () => {
    const shared = {
      ...BASE,
      compatibility: { minHostAppVersion: '1.0.0' },
      environment: { HF_HUB_OFFLINE: '1' },
      assets: [asset('data.bin', 'a')],
      prunePaths: ['venv/share/doc'],
      selfTest: { imports: ['json'], files: ['cache/data.bin'] },
    };
    await family(shared, { extends: '../scroll.json', target: TARGET });
    const { scroll: split } = await readScroll(REFERENCE);

    resetWorkspace();
    const root = await mkdtemp(join(tmpdir(), 'scrollcase-extends-'));
    created.push(root);
    const wholeDir = join(root, 'scrolls', 'example-model', TARGET_ID);
    await mkdir(wholeDir, { recursive: true });
    await writeFile(
      join(wholeDir, 'scroll.json'),
      `${JSON.stringify({ ...shared, target: TARGET }, null, 2)}\n`,
    );
    configureWorkspace({ cwd: root });
    const { scroll: whole } = await readScroll(REFERENCE);

    // Splitting a scroll is a change to how it is written, never to what it means. Deep equality is
    // the exact claim: a joined map carries the base's keys before the fragment's, so a split scroll
    // and a hand-written whole one can serialise `compatibility` or `environment` in a different key
    // order while holding the same entries. Each writing is stable, which is what rebuilds need.
    expect(split).toEqual(whole);
  });
});
