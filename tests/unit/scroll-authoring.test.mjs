
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { copyVerifiedLocalFile } from '../../src/build/assets.mjs';
import {
  DEFAULT_PYTHON_VERSION,
  LATEST_PYTHON_VERSION,
  createScroll,
  ensureExampleScroll,
  resolvePythonVersion,
} from '../../src/build/authoring.mjs';
import { fileExists, sha256File } from '../../src/build/filesystem.mjs';
import { initProject } from '../../src/build/project.mjs';
import { readScroll } from '../../src/build/scroll.mjs';
import { configureWorkspace, getWorkspace, resetWorkspace } from '../../src/build/workspace.mjs';
import { collectNewScrollOptions, promptText } from '../../src/cli-authoring.mjs';

const TARGET = { platform: 'macos', arch: 'aarch64', accelerator: 'metal' };
const BASE = {
  boxId: 'example-model',
  target: TARGET,
  modelId: 'example-org-example-model',
  runtimeId: 'example-model-runtime',
  version: '1.0.0',
  scrollVersion: '1.0.0',
  sourceRevision: 'upstream-v1',
  pythonVersion: '3.11.15',
  pixiVersion: '0.73.0',
  compatibility: { minHostAppVersion: '1.0.0' },
  assetBaseUrl: 'https://assets.example.org',
  weights: 'embed',
};

describe('scroll authoring', () => {
  const created = [];

  afterEach(async () => {
    resetWorkspace();
    await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  async function workspace() {
    const root = await mkdtemp(join(tmpdir(), 'scrollcase-authoring-'));
    created.push(root);
    await initProject({ root });
    configureWorkspace({ cwd: root });
    return getWorkspace();
  }

  it('creates a complete library-only scroll without execution metadata', async () => {
    const current = await workspace();
    const result = await createScroll({
      workspace: current,
      ...BASE,
      executionKind: 'library-only',
    });

    expect(result.scrollRef).toBe('example-model/macos-aarch64-metal');
    expect(result.scroll.execution).toBeUndefined();
    expect(result.scroll.localFiles).toBeUndefined();
    expect(result.scroll.$schema).toBe('https://scrollcase.dev/schema/v2/scroll.schema.json');
    expect(await readScroll(result.scrollRef)).toMatchObject({
      scroll: { boxId: BASE.boxId, target: TARGET, pixiVersion: BASE.pixiVersion },
    });
    expect(await readFile(join(result.scrollDir, 'pixi.toml'), 'utf8'))
      .toContain('platforms = ["osx-arm64"]');
  });

  it('asks only what it cannot work out, and derives the rest', async () => {
    const current = await workspace();
    const answers = new Map([
      ['Box ID', BASE.boxId],
      ['Upstream revision', BASE.sourceRevision],
      ['Asset base URL', BASE.assetBaseUrl],
      ['Python module', 'example_model.main'],
    ]);
    const asked = [];
    const options = await collectNewScrollOptions(new Map(), {
      terminal: true,
      ask: async (question, promptOptions = {}) => {
        asked.push(question);
        if (!answers.has(question)) {
          throw new Error(`unexpected question: ${question}`);
        }
        // Every question carries one line saying what the field is: a label alone does not explain
        // `sourceRevision` or `assetBaseUrl` to someone meeting the tool for the first time.
        expect(promptOptions.hint).toEqual(expect.any(String));
        return answers.get(question);
      },
      choose: async (question, _choices, chooseOptions = {}) => {
        expect(chooseOptions.hint).toEqual(expect.any(String));
        return question === 'weights mode' ? 'embed' : 'python-module';
      },
      chooseTargetValue: async (_candidates, targetOptions = {}) => {
        expect(targetOptions.hint).toEqual(expect.any(String));
        return { target: TARGET, targetId: 'macos-aarch64-metal' };
      },
      probe: () => ({ path: 'pixi', version: BASE.pixiVersion }),
    });
    const result = await createScroll({ workspace: current, ...options });

    // Four questions, not nine: identity, provenance, where it will be published, how it runs.
    expect(asked).toEqual([...answers.keys()]);
    expect(options.modelId).toBe(BASE.boxId);
    expect(options.runtimeId).toBe(`${BASE.boxId}-runtime`);
    expect(options.version).toBe('1.0.0');
    expect(options.pythonVersion).toBe(DEFAULT_PYTHON_VERSION);
    expect(options.pixiVersion).toBe(BASE.pixiVersion);
    expect(result.scroll.execution).toEqual({
      kind: 'python-module',
      module: 'example_model.main',
      defaultArgs: [],
    });
    await expect(readScroll(result.scrollRef)).resolves.toBeTruthy();
  });

  it('pins the pixi that is installed, since a build refuses any other', async () => {
    const options = await collectNewScrollOptions(
      new Map([['box-id', 'example-model'], ['source-revision', 'upstream-v1'],
        ['asset-base-url', 'https://assets.example.org'], ['weights', 'embed'],
        ['execution', 'library-only'], ['target', 'macos-aarch64-metal']]),
      { terminal: false, probe: () => ({ path: 'pixi', version: '9.9.9' }) },
    );

    expect(options.pixiVersion).toBe('9.9.9');
  });

  // Short timeout on purpose: an abort on the first blank answer leaves the prompt waiting for input
  // nobody will send, so the failure must arrive quickly rather than stall the suite.
  it('repeats a required question instead of throwing the session away', { timeout: 5000 }, async () => {
    const input = new PassThrough();
    const written = [];
    const output = new PassThrough();
    // Answers are fed one at a time: readline drops lines that arrive while no question is pending.
    // Two blanks, then a real answer.
    let asked = 0;
    output.on('data', (chunk) => {
      written.push(String(chunk));
      if (!String(chunk).endsWith('Box ID: ')) return;
      asked += 1;
      input.write(asked > 2 ? 'example-model\n' : '\n');
    });

    expect(await promptText('Box ID', { input, output })).toBe('example-model');
    // Two slips, each answered with the question again rather than with the end of the session.
    expect(written.filter((line) => line.includes('is required')).length).toBe(2);
  });

  it('resolves --python-version latest to a number, never the word', async () => {
    expect(resolvePythonVersion('latest')).toBe(LATEST_PYTHON_VERSION);
    expect(resolvePythonVersion('latest')).toMatch(/^\d+\.\d+$/);
    expect(resolvePythonVersion(null)).toBe(DEFAULT_PYTHON_VERSION);
    expect(resolvePythonVersion('3.10.4')).toBe('3.10.4');
  });

  it('records a Python module and its default arguments', async () => {
    const current = await workspace();
    const result = await createScroll({
      workspace: current,
      ...BASE,
      executionKind: 'python-module',
      module: 'example_model.main',
      defaultArgs: ['--port', '8080'],
    });

    expect(result.scroll.execution).toEqual({
      kind: 'python-module',
      module: 'example_model.main',
      defaultArgs: ['--port', '8080'],
    });
    await expect(readScroll(result.scrollRef)).resolves.toBeTruthy();
  });

  it('leaves the Windows interpreter out of the file and derives it on read', async () => {
    const current = await workspace();
    const target = {
      platform: 'windows',
      arch: 'x86_64',
      accelerator: 'cuda',
      cudaVersion: '12.8',
    };
    const result = await createScroll({
      workspace: current,
      ...BASE,
      target,
      executionKind: 'library-only',
    });

    const written = JSON.parse(await readFile(join(result.scrollDir, 'scroll.json'), 'utf8'));
    expect(written.pythonEntryPoint).toBeUndefined();
    expect(written.modelCacheSubdir).toBeUndefined();
    const { scroll } = await readScroll(result.scrollRef);
    expect(scroll.pythonEntryPoint).toBe('venv/python.exe');
    expect(scroll.modelCacheSubdir).toBe('model-cache/example-model');
    expect(await readFile(join(result.scrollDir, 'pixi.toml'), 'utf8'))
      .toContain('platforms = ["win-64"]');
  });

  it('reads a hand-written minimal scroll exactly like the full one', async () => {
    const current = await workspace();
    const result = await createScroll({
      workspace: current,
      ...BASE,
      executionKind: 'library-only',
    });
    const minimal = JSON.parse(await readFile(join(result.scrollDir, 'scroll.json'), 'utf8'));
    const { scroll: derived } = await readScroll(result.scrollRef);

    // The same scroll with every derivable field spelled out must read identically, or the
    // shorthand and the long form are two different formats rather than one.
    await writeFile(join(result.scrollDir, 'scroll.json'), `${JSON.stringify({
      ...minimal,
      scrollVersion: '1.0.0',
      pythonEntryPoint: 'venv/bin/python',
      modelCacheSubdir: 'model-cache/example-model',
      assets: [],
      selfTest: { ...minimal.selfTest, files: [] },
    }, null, 2)}\n`);
    const { scroll: spelledOut } = await readScroll(result.scrollRef);

    expect(spelledOut).toEqual(derived);
  });

  it('still rejects a declared interpreter the target does not use', async () => {
    const current = await workspace();
    const result = await createScroll({
      workspace: current,
      ...BASE,
      executionKind: 'library-only',
    });
    const scroll = JSON.parse(await readFile(join(result.scrollDir, 'scroll.json'), 'utf8'));
    await writeFile(join(result.scrollDir, 'scroll.json'), `${JSON.stringify({
      ...scroll,
      pythonEntryPoint: 'venv/python.exe',
    }, null, 2)}\n`);

    await expect(readScroll(result.scrollRef)).rejects.toThrow(/must use Python entry point/);
  });

  it('generates a runnable self-test as a Python file, not a JSON string', async () => {
    const current = await workspace();
    const result = await createScroll({
      workspace: current,
      ...BASE,
      executionKind: 'library-only',
    });

    expect(result.scroll.selfTest.pythonCode).toBeUndefined();
    const selfTestPath = join(result.scrollDir, 'self_test.py');
    expect(result.scroll.selfTest.pythonFile)
      .toBe(`scrolls/example-model/macos-aarch64-metal/self_test.py`);
    expect(await readFile(selfTestPath, 'utf8')).toContain('self-test ok');
    expect(result.written).toContain(selfTestPath);
  });

  it('hashes an existing project script and stages it at a safe payload path', async () => {
    const current = await workspace();
    const sourcePath = 'application.py';
    await writeFile(join(current.root, sourcePath), 'print("hello")\n');
    const result = await createScroll({
      workspace: current,
      ...BASE,
      executionKind: 'python-script',
      scriptSourcePath: sourcePath,
      scriptRelativePath: 'app/main.py',
    });

    expect(result.scroll.execution).toEqual({
      kind: 'python-script',
      script: 'app/main.py',
      defaultArgs: [],
    });
    // No sha256: the author is about to edit this file, and a pin here would fail their first build.
    expect(result.scroll.localFiles).toEqual([{
      sourcePath,
      relativePath: 'app/main.py',
    }]);
    expect(result.scroll.selfTest.files).toContain('app/main.py');
    await expect(readScroll(result.scrollRef)).resolves.toBeTruthy();
  });

  it('generates a starter script the author can edit without breaking the build', async () => {
    const current = await workspace();
    const result = await createScroll({
      workspace: current,
      ...BASE,
      executionKind: 'python-script',
      generateScript: true,
      scriptRelativePath: 'entrypoint.py',
    });

    expect(await fileExists(result.generatedScriptPath)).toBe(true);
    expect(result.scroll.localFiles[0].sourcePath).toBe(
      'box-entrypoints/example-model/macos-aarch64-metal/entrypoint.py',
    );
    await writeFile(result.generatedScriptPath, 'print("edited")\n');
    const payloadDir = join(current.root, '.scrollcase', 'payload');
    await copyVerifiedLocalFile(result.scroll.localFiles[0], payloadDir, current.root);

    expect(await readFile(join(payloadDir, 'entrypoint.py'), 'utf8')).toBe('print("edited")\n');
  });

  it('keeps an existing initialized example untouched', async () => {
    const current = await workspace();
    const first = await ensureExampleScroll({ workspace: current, target: TARGET });
    await writeFile(first.generatedScriptPath, 'print("customized")\n');
    const typescriptTemplate = join(current.root, 'consumer-templates', 'run-box.ts');
    const pythonTemplate = join(current.root, 'consumer-templates', 'run_box.py');
    const rustTemplate = join(current.root, 'consumer-templates', 'rust', 'src', 'main.rs');
    const rustManifest = join(current.root, 'consumer-templates', 'rust', 'Cargo.toml');
    const packageJson = join(current.root, 'package.json');
    await writeFile(typescriptTemplate, '// customized\n');
    await rm(pythonTemplate);
    await writeFile(rustTemplate, '// customized\n');
    await rm(rustManifest);
    await writeFile(packageJson, '{"type":"commonjs","custom":true}\n');

    const second = await ensureExampleScroll({ workspace: current, target: TARGET });

    expect(second.created).toBe(false);
    expect(second.written).toEqual([pythonTemplate, rustManifest]);
    expect(await readFile(first.generatedScriptPath, 'utf8')).toBe('print("customized")\n');
    expect(await readFile(typescriptTemplate, 'utf8')).toBe('// customized\n');
    expect(await readFile(pythonTemplate, 'utf8')).toContain('run_box');
    expect(await readFile(rustTemplate, 'utf8')).toBe('// customized\n');
    expect(await readFile(rustManifest, 'utf8')).toContain('scrollcase-consumer-template');
    expect(await readFile(packageJson, 'utf8')).toBe('{"type":"commonjs","custom":true}\n');

    const third = await ensureExampleScroll({ workspace: current, target: TARGET });
    expect(third.written).toEqual([]);
  });

  it('never overwrites an existing scroll or generated script', async () => {
    const current = await workspace();
    const options = {
      workspace: current,
      ...BASE,
      executionKind: 'python-script',
      generateScript: true,
    };
    const first = await createScroll(options);
    const original = await readFile(join(first.scrollDir, 'scroll.json'), 'utf8');

    await expect(createScroll(options)).rejects.toThrow(/already exists/);
    expect(await readFile(join(first.scrollDir, 'scroll.json'), 'utf8')).toBe(original);
  });

  it('still refuses a local file that drifted from the hash a project pinned', async () => {
    const current = await workspace();
    const result = await createScroll({
      workspace: current,
      ...BASE,
      executionKind: 'python-script',
      generateScript: true,
    });
    // A project pins the files it wants frozen — a licence notice, a reviewed shim — by adding the
    // hash itself. That pin must still be enforced.
    const pinned = {
      ...result.scroll.localFiles[0],
      sha256: await sha256File(result.generatedScriptPath),
    };
    await writeFile(result.generatedScriptPath, 'print("tampered")\n');

    await expect(copyVerifiedLocalFile(
      pinned,
      join(current.root, '.scrollcase', 'payload'),
      current.root,
    )).rejects.toThrow(/SHA-256 mismatch/);
  });
});
