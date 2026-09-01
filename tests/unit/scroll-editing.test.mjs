/**
 * The commands that change a scroll that already exists.
 *
 * Each one is exercised against a real workspace and read back through `readScroll`, because the
 * thing worth proving is not that a JSON key was set but that the box still loads afterwards —
 * these commands write the only input a build accepts.
 */

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addDependency, withDependency } from '../../src/build/dependencies.mjs';
import { readRequirements } from '../../src/runtimes/python/dependencies.mjs';
import { sha256File } from '../../src/build/filesystem.mjs';
import { readScroll } from '../../src/build/scroll.mjs';
import {
  ALL_TARGETS,
  addAsset,
  addFile,
  addSelfTestCommand,
  removeSelfTestCommand,
  addSelfTestImport,
  editableScrollFields,
  refreshScroll,
  removeEnvironmentVariable,
  removeScrollEntry,
  removeSelfTestImport,
  setEnvironmentVariable,
  setScrollField,
} from '../../src/build/scroll-edit.mjs';
import { configureWorkspace, resetWorkspace } from '../../src/build/workspace.mjs';
import { chooseEditTarget } from '../../src/cli-edit.mjs';

const TARGET_ID = 'macos-aarch64-metal';
const OTHER_TARGET_ID = 'macos-aarch64-cpu';
const TARGET = { platform: 'macos', arch: 'aarch64', accelerator: 'metal' };
const OTHER_TARGET = { platform: 'macos', arch: 'aarch64', accelerator: 'cpu' };
const REFERENCE = `example-model/${TARGET_ID}`;

const SHARED = {
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

/** A fetch that serves fixed bytes, so nothing here touches the network. */
const servingBytes = (bytes) => async () => ({
  ok: true,
  status: 200,
  body: (async function* stream() { yield Buffer.from(bytes); }()),
});

describe('editing an existing scroll', () => {
  const created = [];

  afterEach(async () => {
    resetWorkspace();
    await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  /** A split box: a base plus two target fragments, the layout the commands have to reason about. */
  async function splitBox({ base = SHARED, fragments = null } = {}) {
    const root = await mkdtemp(join(tmpdir(), 'scrollcase-editing-'));
    created.push(root);
    const boxDir = join(root, 'scrolls', 'example-model');
    const targets = fragments ?? [
      [TARGET_ID, { extends: '../scroll.json', target: TARGET }],
      [OTHER_TARGET_ID, { extends: '../scroll.json', target: OTHER_TARGET }],
    ];
    await mkdir(boxDir, { recursive: true });
    await writeFile(join(boxDir, 'scroll.json'), `${JSON.stringify(base, null, 2)}\n`);
    for (const [targetId, fragment] of targets) {
      await mkdir(join(boxDir, targetId), { recursive: true });
      await writeFile(join(boxDir, targetId, 'scroll.json'), `${JSON.stringify(fragment, null, 2)}\n`);
      await writeFile(join(boxDir, targetId, 'pixi.toml'),
        '[workspace]\nname = "example-model"\n\n[dependencies]\npython = "3.14.*"\n');
    }
    configureWorkspace({ cwd: root });
    return { root, boxDir };
  }

  it('records an asset with the size and hash the URL actually served', async () => {
    await splitBox();
    const { entry } = await addAsset({
      boxId: 'example-model',
      target: ALL_TARGETS,
      url: 'https://assets.example.org/data.bin',
      fetchImpl: servingBytes('data'),
    });

    // The two values nobody can write by hand, taken from the bytes rather than from the author.
    expect(entry).toEqual({
      url: 'https://assets.example.org/data.bin',
      relativePath: 'cache/example-model/data.bin',
      sizeBytes: 4,
      sha256: createHash('sha256').update('data').digest('hex'),
    });
    const { scroll } = await readScroll(REFERENCE);
    expect(scroll.assets).toHaveLength(1);
    // Both targets share it, and the self-test now guards it against an over-eager prune.
    expect(scroll.selfTest.files).toContain('cache/example-model/data.bin');
    const other = await readScroll(`example-model/${OTHER_TARGET_ID}`);
    expect(other.scroll.assets).toHaveLength(1);
  });

  it('records an asset for one target only when asked', async () => {
    await splitBox();
    await addAsset({
      boxId: 'example-model',
      target: TARGET_ID,
      url: 'https://assets.example.org/metal.bin',
      fetchImpl: servingBytes('metal'),
    });

    expect((await readScroll(REFERENCE)).scroll.assets).toHaveLength(1);
    expect((await readScroll(`example-model/${OTHER_TARGET_ID}`)).scroll.assets).toEqual([]);
  });

  it('records a project file without pinning a hash to it', async () => {
    const { root } = await splitBox();
    await writeFile(join(root, 'entrypoint.py'), 'print("hello")\n');
    const { entry } = await addFile({
      boxId: 'example-model',
      target: ALL_TARGETS,
      sourcePath: 'entrypoint.py',
    });

    // No sha256: the file just added is the one about to be edited.
    expect(entry).toEqual({ sourcePath: 'entrypoint.py', relativePath: 'entrypoint.py' });
    expect((await readScroll(REFERENCE)).scroll.localFiles).toEqual([entry]);
  });

  it('refuses a file the project does not have', async () => {
    await splitBox();

    await expect(addFile({ boxId: 'example-model', target: ALL_TARGETS, sourcePath: 'missing.py' }))
      .rejects.toThrow(/Project file is missing/);
  });

  it('removes exactly what add recorded, self-test entry included', async () => {
    const { root } = await splitBox();
    await writeFile(join(root, 'entrypoint.py'), 'print("hello")\n');
    await addFile({ boxId: 'example-model', target: ALL_TARGETS, sourcePath: 'entrypoint.py' });
    const before = (await readScroll(REFERENCE)).scroll;
    expect(before.selfTest.files).toContain('entrypoint.py');

    await removeScrollEntry({
      boxId: 'example-model',
      target: ALL_TARGETS,
      field: 'localFiles',
      relativePath: 'entrypoint.py',
    });
    const after = (await readScroll(REFERENCE)).scroll;

    expect(after.localFiles).toBeUndefined();
    expect(after.selfTest.files).not.toContain('entrypoint.py');
  });

  it('reports a removal that matched nothing instead of succeeding quietly', async () => {
    await splitBox();

    await expect(removeScrollEntry({
      boxId: 'example-model',
      target: ALL_TARGETS,
      field: 'assets',
      relativePath: 'cache/absent.bin',
    })).rejects.toThrow(/No asset at cache\/absent\.bin/);
  });

  it('restores every file when an edit would leave the box unreadable', async () => {
    const { boxDir } = await splitBox();
    const basePath = join(boxDir, 'scroll.json');
    const before = await readFile(basePath, 'utf8');
    // The fragment already claims this path, so adding it to the base is a conflict the reader
    // refuses — and the refusal has to leave the scroll exactly as it was.
    await writeFile(join(boxDir, TARGET_ID, 'scroll.json'), `${JSON.stringify({
      extends: '../scroll.json',
      target: TARGET,
      assets: [{
        url: 'https://assets.example.org/other.bin',
        relativePath: 'cache/example-model/data.bin',
        sizeBytes: 4,
        sha256: 'a'.repeat(64),
      }],
    }, null, 2)}\n`);

    await expect(addAsset({
      boxId: 'example-model',
      target: ALL_TARGETS,
      url: 'https://assets.example.org/data.bin',
      fetchImpl: servingBytes('data'),
    })).rejects.toThrow(/both claim that path/);

    expect(await readFile(basePath, 'utf8')).toBe(before);
  });

  it('declares environment variables one key at a time', async () => {
    await splitBox();
    await setEnvironmentVariable({
      boxId: 'example-model', target: ALL_TARGETS, name: 'HF_HUB_OFFLINE', value: '1',
    });
    await setEnvironmentVariable({
      boxId: 'example-model', target: ALL_TARGETS, name: 'LOG_LEVEL', value: 'debug',
    });

    // A map is the one shape a single-value prompt cannot edit, so it gets its own command.
    expect((await readScroll(REFERENCE)).scroll.environment)
      .toEqual({ HF_HUB_OFFLINE: '1', LOG_LEVEL: 'debug' });

    await removeEnvironmentVariable({ boxId: 'example-model', target: ALL_TARGETS, name: 'LOG_LEVEL' });
    expect((await readScroll(REFERENCE)).scroll.environment).toEqual({ HF_HUB_OFFLINE: '1' });

    await removeEnvironmentVariable({
      boxId: 'example-model', target: ALL_TARGETS, name: 'HF_HUB_OFFLINE',
    });
    // The last one takes the empty map with it rather than leaving `"environment": {}` behind.
    expect((await readScroll(REFERENCE)).scroll.environment).toBeUndefined();
  });

  it('refuses an environment name or value the box format cannot carry', async () => {
    await splitBox();

    for (const name of ['', 'HAS=EQUALS', 'HAS\0NUL']) {
      await expect(setEnvironmentVariable({
        boxId: 'example-model', target: ALL_TARGETS, name, value: 'x',
      }), name).rejects.toThrow(/Not an environment variable name/);
    }
    await expect(setEnvironmentVariable({
      boxId: 'example-model', target: ALL_TARGETS, name: 'OK', value: 'has\0nul',
    })).rejects.toThrow(/values are strings and cannot contain NUL/);
    await expect(removeEnvironmentVariable({
      boxId: 'example-model', target: ALL_TARGETS, name: 'ABSENT',
    })).rejects.toThrow(/declares no environment variable ABSENT/);
  });

  it('adds and removes self-test imports, but never the last one', async () => {
    await splitBox();
    await addSelfTestImport({ boxId: 'example-model', target: ALL_TARGETS, module: 'onnxruntime' });
    await addSelfTestImport({ boxId: 'example-model', target: ALL_TARGETS, module: 'numpy' });

    expect((await readScroll(REFERENCE)).scroll.selfTest.imports)
      .toEqual(['json', 'onnxruntime', 'numpy']);

    await removeSelfTestImport({ boxId: 'example-model', target: ALL_TARGETS, module: 'json' });
    expect((await readScroll(REFERENCE)).scroll.selfTest.imports).toEqual(['onnxruntime', 'numpy']);

    await removeSelfTestImport({ boxId: 'example-model', target: ALL_TARGETS, module: 'numpy' });
    // The schema requires one, so the refusal explains itself instead of writing an invalid scroll.
    await expect(removeSelfTestImport({
      boxId: 'example-model', target: ALL_TARGETS, module: 'onnxruntime',
    })).rejects.toThrow(/a box must prove it can import something/);
    await expect(addSelfTestImport({
      boxId: 'example-model', target: ALL_TARGETS, module: 'not a module',
    })).rejects.toThrow(/Not an importable python module name/);
  });

  it('sets a field, and refuses one the format does not let a person change', async () => {
    await splitBox();
    await setScrollField({
      boxId: 'example-model',
      target: ALL_TARGETS,
      field: 'version',
      value: '2.0.0',
    });

    expect((await readScroll(REFERENCE)).scroll.version).toBe('2.0.0');
    await expect(setScrollField({
      boxId: 'example-model', target: ALL_TARGETS, field: 'runtime', value: 'node',
    })).rejects.toThrow(/not an editable scroll field/);
  });

  it('offers editable fields from the schema, never the derived or structural ones', async () => {
    const names = (await editableScrollFields()).map(({ name }) => name);

    expect(names).toContain('version');
    expect(names).toContain('publishBaseUrl');
    for (const excluded of ['boxId', 'target', 'runtime', 'schemaVersion', 'extends', 'assets']) {
      expect(names, excluded).not.toContain(excluded);
    }
  });

  it('re-pins a local file the project changed, and reports nothing when nothing moved', async () => {
    const { root, boxDir } = await splitBox();
    const source = join(root, 'NOTICE.md');
    await writeFile(source, 'first\n');
    await addFile({ boxId: 'example-model', target: ALL_TARGETS, sourcePath: 'NOTICE.md' });
    // A project pins what must not change without review; after a reviewed change the digest moves.
    const base = JSON.parse(await readFile(join(boxDir, 'scroll.json'), 'utf8'));
    base.localFiles[0].sha256 = await sha256File(source);
    await writeFile(join(boxDir, 'scroll.json'), `${JSON.stringify(base, null, 2)}\n`);
    await writeFile(source, 'reviewed second\n');

    const first = await refreshScroll({ boxId: 'example-model' });
    expect(first.updated).toEqual(['NOTICE.md']);
    expect((await readScroll(REFERENCE)).scroll.localFiles[0].sha256).toBe(await sha256File(source));

    const second = await refreshScroll({ boxId: 'example-model' });
    expect(second.written).toEqual([]);
  });

  it('never touches the network unless refresh is asked to', async () => {
    const { root, boxDir } = await splitBox();
    await writeFile(join(root, 'NOTICE.md'), 'first\n');
    await addFile({ boxId: 'example-model', target: ALL_TARGETS, sourcePath: 'NOTICE.md' });
    const base = JSON.parse(await readFile(join(boxDir, 'scroll.json'), 'utf8'));
    base.assets = [{
      url: 'https://assets.example.org/data.bin',
      relativePath: 'cache/example-model/data.bin',
      sizeBytes: 7,
      sha256: 'a'.repeat(64),
    }];
    await writeFile(join(boxDir, 'scroll.json'), `${JSON.stringify(base, null, 2)}\n`);

    // Re-fetching every asset means downloading the whole box, so it happens only on request.
    const refused = () => { throw new Error('refresh reached the network'); };
    await expect(refreshScroll({ boxId: 'example-model', fetchImpl: refused })).resolves.toBeTruthy();
  });

  it('stops on an upstream asset that changed, and needs an explicit repin to accept it', async () => {
    const { boxDir } = await splitBox();
    const base = JSON.parse(await readFile(join(boxDir, 'scroll.json'), 'utf8'));
    base.assets = [{
      url: 'https://assets.example.org/data.bin',
      relativePath: 'cache/example-model/data.bin',
      sizeBytes: 7,
      sha256: 'a'.repeat(64),
    }];
    await writeFile(join(boxDir, 'scroll.json'), `${JSON.stringify(base, null, 2)}\n`);
    const fetchImpl = servingBytes('changed');

    // Adopting a substituted upstream file in silence would remove the protection the hash exists
    // for, so the difference is refused and the scroll is left alone.
    await expect(refreshScroll({ boxId: 'example-model', checkAssets: true, fetchImpl }))
      .rejects.toThrow(/no longer match what the scroll pins/);
    expect((await readScroll(REFERENCE)).scroll.assets[0].sha256).toBe('a'.repeat(64));

    const accepted = await refreshScroll({ boxId: 'example-model', repin: true, fetchImpl });
    expect(accepted.repinned).toEqual(['cache/example-model/data.bin']);
    expect((await readScroll(REFERENCE)).scroll.assets[0].sha256).not.toBe('a'.repeat(64));
  });

  it('asks where an edit goes, and refuses to guess without a terminal', async () => {
    await splitBox();

    expect(await chooseEditTarget({ boxId: 'example-model', requested: ALL_TARGETS })).toBe(ALL_TARGETS);
    expect(await chooseEditTarget({ boxId: 'example-model', requested: TARGET_ID })).toBe(TARGET_ID);
    await expect(chooseEditTarget({ boxId: 'example-model', requested: 'linux-x86_64-cpu' }))
      .rejects.toThrow(/is not one of example-model's targets/);
    // Both answers are reasonable and only the author knows which was meant.
    await expect(chooseEditTarget({ boxId: 'example-model', terminal: false }))
      .rejects.toThrow(/pass --target/);
    expect(await chooseEditTarget({
      boxId: 'example-model',
      terminal: true,
      menu: async () => 0,
    })).toBe(ALL_TARGETS);
  });

  it('uses the only target of a single-target box without asking', async () => {
    await splitBox({ fragments: [[TARGET_ID, { extends: '../scroll.json', target: TARGET }]] });

    expect(await chooseEditTarget({ boxId: 'example-model', terminal: false })).toBe(TARGET_ID);
  });

  /**
   * A `native` box's only probe shape is a command, so without these its self-test could not be
   * authored at all — the scroll had to be edited by hand, which every other command here exists to
   * avoid. `pin` closes the last hand edit: recording a hash used to mean opening the file.
   */
  it('authors a native self-test without touching the scroll by hand', async () => {
    const { boxDir } = await splitBox({
      base: {
        ...SHARED,
        runtime: { id: 'native' },
        execution: { kind: 'native-binary', binary: 'venv/bin/ffmpeg', defaultArgs: [] },
        selfTest: { commands: [{ args: [] }] },
      },
    });
    const read = async () => JSON.parse(await readFile(join(boxDir, 'scroll.json'), 'utf8'));

    await addSelfTestCommand({ boxId: 'example-model', target: ALL_TARGETS, args: ['-version'] });
    await addSelfTestCommand({
      boxId: 'example-model', target: ALL_TARGETS, args: ['-i', 'missing.mp4'], expectExitCode: 254,
    });

    // The placeholder `new scroll` leaves — "run it with no arguments" — stops being a claim anyone
    // made once a real probe exists, so it is replaced rather than kept beside them.
    expect((await read()).selfTest.commands).toEqual([
      { args: ['-version'] },
      { args: ['-i', 'missing.mp4'], expectExitCode: 254 },
    ]);

    await expect(addSelfTestCommand({
      boxId: 'example-model', target: ALL_TARGETS, args: ['-version'],
    })).rejects.toThrow(/already runs that self-test command/);
    await expect(addSelfTestCommand({
      boxId: 'example-model', target: ALL_TARGETS, args: ['-x'], expectExitCode: 999,
    })).rejects.toThrow(/between 0 and 255/);

    await removeSelfTestCommand({ boxId: 'example-model', target: ALL_TARGETS, args: ['-version'] });
    expect((await read()).selfTest.commands).toEqual([
      { args: ['-i', 'missing.mp4'], expectExitCode: 254 },
    ]);
    await expect(removeSelfTestCommand({
      boxId: 'example-model', target: ALL_TARGETS, args: ['-nope'],
    })).rejects.toThrow(/does not run that self-test command/);
  });

  it('records a file hash only when asked to pin it', async () => {
    const { root, boxDir } = await splitBox();
    await writeFile(join(root, 'data.csv'), 'a,b\n1,2\n');
    const read = async () => JSON.parse(await readFile(join(boxDir, 'scroll.json'), 'utf8'));

    await addFile({ boxId: 'example-model', target: ALL_TARGETS, sourcePath: 'data.csv' });
    expect((await read()).localFiles.at(-1).sha256).toBeUndefined();

    await addFile({
      boxId: 'example-model', target: ALL_TARGETS, sourcePath: 'data.csv', to: 'pinned.csv', pin: true,
    });
    // Opt-in on purpose: most added files are about to be edited, and a hash recorded then would
    // fail the very next build. Reference data is the case that wants it.
    expect((await read()).localFiles.at(-1).sha256).toMatch(/^[a-f0-9]{64}$/);
  });

});

describe('a box pixi manifest', () => {
  const created = [];

  afterEach(async () => {
    await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  const MANIFEST = '[workspace]\nname = "demo"\n\n[dependencies]\npython = "3.14.*"\n';

  it('adds a dependency to the dependencies table, leaving the rest of the file alone', () => {
    const { text, replaced } = withDependency(MANIFEST, 'onnxruntime', '*');

    expect(replaced).toBe(false);
    expect(text).toBe('[workspace]\nname = "demo"\n\n[dependencies]\npython = "3.14.*"\nonnxruntime = "*"\n');
  });

  it('replaces a dependency it already declares rather than adding it twice', () => {
    const once = withDependency(MANIFEST, 'numpy', '*').text;
    const { text, replaced } = withDependency(once, 'numpy', '>=2,<3');

    expect(replaced).toBe(true);
    expect(text.match(/numpy/g)).toHaveLength(1);
    expect(text).toContain('numpy = ">=2,<3"');
  });

  it('creates the table when a manifest has none', () => {
    const { text } = withDependency('[workspace]\nname = "demo"\n', 'numpy', '*');

    expect(text).toBe('[workspace]\nname = "demo"\n\n[dependencies]\nnumpy = "*"\n');
  });

  it('does not write past the dependencies table into a later one', () => {
    const manifest = `${MANIFEST}\n[target.linux-64.dependencies]\ncuda-version = "12.4"\n`;
    const { text } = withDependency(manifest, 'numpy', '*');

    expect(text).toBe('[workspace]\nname = "demo"\n\n[dependencies]\npython = "3.14.*"\nnumpy = "*"\n\n[target.linux-64.dependencies]\ncuda-version = "12.4"\n');
  });

  it('writes every manifest of a box, so its targets cannot disagree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrollcase-manifests-'));
    created.push(root);
    const manifests = [join(root, 'a.toml'), join(root, 'b.toml')];
    for (const path of manifests) await writeFile(path, MANIFEST);

    const { written } = await addDependency({ manifests, name: 'onnxruntime' });

    expect(written).toEqual(manifests);
    for (const path of manifests) {
      expect(await readFile(path, 'utf8')).toContain('onnxruntime = "*"');
    }
  });

  it('refuses a name that is not a conda package name', async () => {
    await expect(addDependency({ manifests: [], name: 'OpenCV Python' }))
      .rejects.toThrow(/Not a conda package name/);
  });

  it('translates the pip names it is sure of, and reports every one it changed', () => {
    const { dependencies, renamed, skipped } = readRequirements([
      'onnxruntime>=1.20',
      'torch',
      'opencv-python==4.9',
      '# a comment',
      '-r other.txt',
      'requests[socks]>=2',
      'private @ git+https://example.org/private.git',
    ].join('\n'));

    expect(dependencies).toEqual([
      { name: 'onnxruntime', spec: '>=1.20' },
      { name: 'pytorch', spec: '*' },
      { name: 'opencv', spec: '==4.9' },
      { name: 'requests', spec: '>=2' },
    ]);
    // A rename the author never sees is a lock that resolves and a box that cannot import.
    expect(renamed).toEqual([{ from: 'torch', to: 'pytorch' }, { from: 'opencv-python', to: 'opencv' }]);
    expect(skipped.map(({ line }) => line)).toEqual([
      '-r other.txt',
      'requests[socks]',
      'private @ git+https://example.org/private.git',
    ]);
  });
});
