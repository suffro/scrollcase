
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { copyVerifiedLocalFile } from '../../src/build/assets.mjs';
import {
  BOX_ID_SHAPE,
  DEFAULT_NODE_VERSION,
  DEFAULT_PYTHON_VERSION,
  LATEST_NODE_VERSION,
  LATEST_PYTHON_VERSION,
  boxIdProblem,
  createScroll,
  ensureConsumerTemplates,
  ensureExampleScroll,
  resolveRuntimeVersion,
} from '../../src/build/authoring.mjs';
import { fileExists, sha256File } from '../../src/build/filesystem.mjs';
import { initProject } from '../../src/build/project.mjs';
import { readScroll } from '../../src/build/scroll.mjs';
import { configureWorkspace, getWorkspace, resetWorkspace } from '../../src/build/workspace.mjs';
import { collectNewScrollOptions, promptText } from '../../src/cli-authoring.mjs';

const TARGET = { platform: 'macos', arch: 'aarch64', accelerator: 'metal' };
// Every runtime that offers a choice offers `library-only` last, so the hint's list ends on it.
const EXECUTION_KIND_TAIL = 'being imported by another application as a library';
const BASE = {
  boxId: 'example-model',
  target: TARGET,
  labels: { model: 'example-org-example-model' },
  version: '1.0.0',
  scrollVersion: '1.0.0',
  sourceRevision: 'upstream-v1',
  runtimeVersion: '3.11.15',
  pixiVersion: '0.73.0',
  compatibility: { minHostAppVersion: '1.0.0' },
  publishBaseUrl: 'https://assets.example.org',
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
    expect(result.scroll.$schema).toBe('https://scrollcase.dev/schema/v3/scroll.schema.json');
    expect(await readScroll(result.scrollRef)).toMatchObject({
      scroll: { boxId: BASE.boxId, target: TARGET, pixiVersion: BASE.pixiVersion },
    });
    expect(await readFile(join(result.scrollDir, 'pixi.toml'), 'utf8'))
      .toContain('platforms = ["osx-arm64"]');
  });

  it('writes a node scroll in the node runtime\'s own terms', async () => {
    const current = await workspace();
    const result = await createScroll({
      workspace: current,
      ...BASE,
      runtimeId: 'node',
      runtimeVersion: undefined,
      executionKind: 'node-script',
      generateScript: true,
    });

    expect(result.scroll.runtime).toEqual({ id: 'node', version: DEFAULT_NODE_VERSION });
    expect(result.scroll.execution)
      .toEqual({ kind: 'node-script', script: 'entrypoint.js', defaultArgs: [] });
    // The probe, the generated files and the pixi dependency all come from the runtime; nothing
    // above it names a language.
    expect(result.scroll.selfTest.imports).toEqual(['fs']);
    expect(result.scroll.selfTest.script).toMatch(/self_test\.js$/);
    expect(result.generatedScriptPath).toMatch(/entrypoint\.js$/);
    expect(await readFile(join(result.scrollDir, 'pixi.toml'), 'utf8'))
      .toContain(`nodejs = "${DEFAULT_NODE_VERSION}.*"`);
    await expect(readScroll(result.scrollRef)).resolves.toBeTruthy();
  });

  it('writes a native scroll that points at a binary and declares it executable', async () => {
    const current = await workspace();
    await writeFile(join(current.root, 'tool'), '#!/bin/sh\nexit 0\n');
    const result = await createScroll({
      workspace: current,
      ...BASE,
      runtimeId: 'native',
      runtimeVersion: undefined,
      executionKind: 'native-binary',
      scriptSourcePath: 'tool',
      scriptRelativePath: 'bin/tool',
    });

    // No version, because there is no interpreter to version — and `readScroll` derives no entry
    // point for the same reason.
    expect(result.scroll.runtime).toEqual({ id: 'native' });
    expect(result.scroll.execution)
      .toEqual({ kind: 'native-binary', binary: 'bin/tool', defaultArgs: [] });
    // Without this the archive would not mark the file executable and the box could not start.
    expect(result.scroll.localFiles)
      .toEqual([{ sourcePath: 'tool', relativePath: 'bin/tool', executable: true }]);
    // A native box has no module system, so its only probe is an invocation of its own binary.
    expect(result.scroll.selfTest.imports).toBeUndefined();
    expect(result.scroll.selfTest.commands).toEqual([{ args: [] }]);
    expect(result.scroll.selfTest.script).toBeUndefined();
    expect(await readFile(join(result.scrollDir, 'pixi.toml'), 'utf8'))
      .toContain('# Add the libraries this box');
    const { scroll } = await readScroll(result.scrollRef);
    expect(scroll.runtime.entryPoint).toBeUndefined();
  });

  it('refuses what a runtime cannot be asked for', async () => {
    const current = await workspace();
    await expect(createScroll({
      workspace: current,
      ...BASE,
      runtimeId: 'native',
      runtimeVersion: undefined,
      executionKind: 'library-only',
    })).rejects.toThrow(/Unsupported execution kind for a native box/);
    await expect(createScroll({
      workspace: current,
      ...BASE,
      runtimeId: 'native',
      runtimeVersion: undefined,
      executionKind: 'native-binary',
      generateScript: true,
    })).rejects.toThrow(/cannot generate an entry point for a native box/);
    await expect(createScroll({
      workspace: current,
      ...BASE,
      runtimeId: 'node',
      executionKind: 'python-module',
      module: 'example',
    })).rejects.toThrow(/Unsupported execution kind for a node box/);
  });

  it('asks only what it cannot work out, and derives the rest', async () => {
    const current = await workspace();
    const answers = new Map([
      ['Box ID', BASE.boxId],
      ['Upstream revision', BASE.sourceRevision],
      ['Publish base URL', BASE.publishBaseUrl],
      ['Python module', 'example_model.main'],
    ]);
    const asked = [];
    const chosen = [];
    const options = await collectNewScrollOptions(new Map(), {
      terminal: true,
      ask: async (question, promptOptions = {}) => {
        asked.push(question);
        if (!answers.has(question)) {
          throw new Error(`unexpected question: ${question}`);
        }
        // Every question carries one line saying what the field is: a label alone does not explain
        // `sourceRevision` or `publishBaseUrl` to someone meeting the tool for the first time.
        expect(promptOptions.hint).toEqual(expect.any(String));
        return answers.get(question);
      },
      choose: async (question, _choices, chooseOptions = {}) => {
        expect(chooseOptions.hint).toEqual(expect.any(String));
        chosen.push(question);
        return question === 'runtime' ? 'python' : 'python-module';
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
    // Labels are not among the menus, and there is nothing to derive: Scrollcase reads none of
    // them, so prompting for one would be asking the author to fill in a field on the tool's
    // behalf. A generated scroll carries none.
    expect(chosen).toEqual(['runtime', 'execution kind']);
    expect(options.labels).toEqual({});
    expect(result.scroll.labels).toBeUndefined();
    expect(result.scroll.runtime).toEqual({ id: 'python', version: DEFAULT_PYTHON_VERSION });
    expect(options.version).toBe('1.0.0');
    expect(options.runtimeId).toBe('python');
    expect(options.runtimeVersion).toBe(DEFAULT_PYTHON_VERSION);
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
        ['publish-base-url', 'https://assets.example.org'],
        ['execution', 'library-only'], ['target', 'macos-aarch64-metal']]),
      { terminal: false, probe: () => ({ path: 'pixi', version: '9.9.9' }) },
    );

    expect(options.pixiVersion).toBe('9.9.9');
  });

  it('points a native box at a binary the environment provides, staging nothing', async () => {
    const current = await workspace();
    const result = await createScroll({
      workspace: current,
      ...BASE,
      runtimeId: 'native',
      runtimeVersion: undefined,
      executionKind: 'native-binary',
      environmentPath: 'venv/bin/ffmpeg',
      defaultArgs: ['-hide_banner'],
    });

    expect(result.scroll.execution).toEqual({
      kind: 'native-binary',
      binary: 'venv/bin/ffmpeg',
      defaultArgs: ['-hide_banner'],
    });
    // Nothing of the project is copied in, so there is no `localFiles` entry to invent. Claiming one
    // would say the project ships a file it does not have.
    expect(result.scroll.localFiles).toBeUndefined();
    await expect(readScroll(result.scrollRef)).resolves.toBeTruthy();
  });

  it('refuses a binary that is both in the environment and in the project', async () => {
    const current = await workspace();
    await expect(createScroll({
      workspace: current,
      ...BASE,
      runtimeId: 'native',
      runtimeVersion: undefined,
      executionKind: 'native-binary',
      environmentPath: 'venv/bin/ffmpeg',
      scriptSourcePath: 'tool',
    })).rejects.toThrow(/either a file from the environment or one from this project/);
  });

  it('collects --from-environment without asking for a project file', async () => {
    const options = await collectNewScrollOptions(
      new Map([['target', 'macos-aarch64-metal'], ['runtime', 'native'],
        ['box-id', 'transcode-demo'], ['source-revision', 'ffmpeg-9'],
        ['from-environment', 'venv/bin/ffmpeg']]),
      { terminal: false, probe: () => ({ path: 'pixi', version: BASE.pixiVersion }) },
    );

    expect(options.environmentPath).toBe('venv/bin/ffmpeg');
    expect(options.scriptSourcePath).toBeUndefined();
    expect(options.generateScript).toBeUndefined();
  });

  it('asks a native box where its binary comes from, the environment first', async () => {
    let offered = null;
    const asked = [];
    const options = await collectNewScrollOptions(
      new Map([['target', 'macos-aarch64-metal'], ['runtime', 'native'],
        ['box-id', 'transcode-demo'], ['source-revision', 'ffmpeg-9']]),
      {
        terminal: true,
        ask: async (question) => { asked.push(question); return 'venv/bin/ffmpeg'; },
        choose: async (question, choices) => {
          if (question === 'binary source') offered = choices;
          return question === 'runtime' ? 'native' : choices[0];
        },
        chooseTargetValue: async () => ({ target: TARGET, targetId: 'macos-aarch64-metal' }),
        probe: () => ({ path: 'pixi', version: BASE.pixiVersion }),
      },
    );

    // Most native boxes package a program conda-forge installs, and that answer needs nothing to
    // exist yet — so it is the preselected one, as the menu's first entry.
    expect(offered).toEqual(['a program the environment provides', 'a compiled binary in this project']);
    expect(options.environmentPath).toBe('venv/bin/ffmpeg');
    expect(options.scriptSourcePath).toBeUndefined();
    expect(asked).toContain('Path inside the box');
    expect(asked).not.toContain('Binary path');
  });

  it('offers each runtime only the execution kinds it has, and explains those and no others', async () => {
    const seen = new Map();
    const collect = async (runtimeId) => collectNewScrollOptions(
      new Map([['runtime', runtimeId], ['box-id', 'example-model'],
        ['source-revision', 'upstream-v1'], ['publish-base-url', 'https://assets.example.org'],
        ['script', 'app/entrypoint'], ['target', 'macos-aarch64-metal']]),
      {
        terminal: true,
        ask: async () => 'example_model.main',
        choose: async (question, choices, options = {}) => {
          if (question === 'execution kind') seen.set(runtimeId, { choices, hint: options.hint });
          return question === 'runtime' ? runtimeId : choices[0];
        },
        chooseTargetValue: async () => ({ target: TARGET, targetId: 'macos-aarch64-metal' }),
        probe: () => ({ path: 'pixi', version: BASE.pixiVersion }),
      },
    );

    await collect('python');
    await collect('node');
    // A module is a Python idea. Offering a node author "an importable module" describes a choice
    // that is not on their menu, which is how the shared sentence read before it was derived from
    // the kinds actually offered.
    expect(seen.get('python').hint).toContain('an importable module');
    expect(seen.get('node').hint).not.toContain('an importable module');
    for (const [runtimeId, { choices, hint }] of seen) {
      expect(choices.length, runtimeId).toBeGreaterThan(1);
      // `promptHeading` renders a hint as one lead-in line, stripping a trailing period and adding
      // a colon of its own. So: no second sentence, because it has nowhere to go; no colon inside,
      // because two in one line read as two questions; and the line ends where the list ends,
      // because an explanation hung off the last item hides the list's boundary — which is exactly
      // how "or nothing at all, for a box other code imports rather than runs" became unreadable.
      expect(hint, runtimeId).not.toMatch(/\.\s/);
      expect(hint, runtimeId).not.toContain(':');
      expect(hint.endsWith(EXECUTION_KIND_TAIL), `${runtimeId}: ${hint}`).toBe(true);
      // No option may be described as an absence. `library-only` under a "what does run start"
      // framing can only be "nothing at all", which tells the reader what they would not get
      // instead of what the choice is for, and reads as an option that does nothing. Every entry
      // has to answer why someone would pick it.
      expect(hint, runtimeId).not.toMatch(/\bnothing\b|\bnone\b|\bno entry point\b/);
    }

    // native defines one authored kind, so there is nothing to choose between and no menu is shown.
    const native = await collect('native');
    expect(seen.has('native')).toBe(false);
    expect(native.executionKind).toBe('native-binary');
  });

  it('preselects the generated starter, which is the one that works with nothing else in place', async () => {
    let offered = null;
    const options = await collectNewScrollOptions(
      new Map([['box-id', 'example-model'], ['source-revision', 'upstream-v1'],
        ['publish-base-url', 'https://assets.example.org'], ['target', 'macos-aarch64-metal']]),
      {
        terminal: true,
        ask: async () => 'entrypoint.py',
        choose: async (question, choices) => {
          if (question === 'script source') offered = choices;
          if (question === 'runtime') return 'python';
          if (question === 'execution kind') return 'python-script';
          // The menu's first entry is what a preselected answer takes, so the order is the default.
          return choices[0];
        },
        chooseTargetValue: async () => ({ target: TARGET, targetId: 'macos-aarch64-metal' }),
        probe: () => ({ path: 'pixi', version: BASE.pixiVersion }),
      },
    );

    expect(offered[0]).toBe('generate starter script');
    expect(options.generateScript).toBe(true);
    expect(options.scriptSourcePath).toBeUndefined();
  });

  it('refuses a malformed box ID at the prompt, naming the shape, and asks again', { timeout: 5000 }, async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let rendered = '';
    let asked = 0;
    output.on('data', (chunk) => {
      rendered += String(chunk);
      if (!String(chunk).endsWith('↳ ')) return;
      asked += 1;
      input.write(asked === 1 ? 'Example Model\n' : 'example-model\n');
    });

    const answer = await promptText('Box ID', {
      hint: `Name of the box. ${BOX_ID_SHAPE}.`,
      validate: boxIdProblem,
      input,
      output,
    });

    expect(answer).toBe('example-model');
    // The value that was refused, and the shape it needed — not "does not match the required
    // pattern", and not after every other question in the session had been answered.
    expect(rendered).toContain('Example Model is not a usable box ID');
    expect(rendered).toContain('lower-case letters and digits');
  });

  it('refuses a malformed --box-id before asking anything else', async () => {
    const asked = [];
    await expect(collectNewScrollOptions(
      new Map([['box-id', 'Example Model'], ['target', 'macos-aarch64-metal']]),
      {
        terminal: true,
        ask: async (question) => { asked.push(question); return 'x'; },
        choose: async (question, choices) => (question === 'runtime' ? 'python' : choices[0]),
        chooseTargetValue: async () => ({ target: TARGET, targetId: 'macos-aarch64-metal' }),
        probe: () => ({ path: 'pixi', version: BASE.pixiVersion }),
      },
    )).rejects.toThrow(/Example Model is not a usable box ID/);
    expect(asked).toEqual([]);
  });

  it('writes a scroll with no publishBaseUrl when the author skips it, rather than inventing one', async () => {
    const current = await workspace();
    const { publishBaseUrl: _skipped, ...withoutUrl } = BASE;
    const result = await createScroll({
      workspace: current,
      ...withoutUrl,
      executionKind: 'library-only',
    });

    // Absent, not a placeholder: a made-up URL in a signed release is a false statement about where
    // the box is published, and the scroll schema does not require the field either.
    expect(result.scroll.publishBaseUrl).toBeUndefined();
    expect(JSON.parse(await readFile(join(result.scrollDir, 'scroll.json'), 'utf8')))
      .not.toHaveProperty('publishBaseUrl');
    // Still a valid scroll a build can read; `build` is what refuses, by name, and says how to
    // supply the URL it needs.
    await expect(readScroll(result.scrollRef)).resolves.toBeTruthy();
  });

  it('lets the wizard skip the publish base URL instead of blocking the session on it', async () => {
    let optionalAsk = null;
    const options = await collectNewScrollOptions(
      new Map([['box-id', 'example-model'], ['source-revision', 'upstream-v1'],
        ['target', 'macos-aarch64-metal']]),
      {
        terminal: true,
        ask: async (question, promptOptions = {}) => {
          if (question !== 'Publish base URL') return 'value';
          optionalAsk = promptOptions.optional;
          return null;
        },
        choose: async (question) => (question === 'runtime' ? 'python' : 'library-only'),
        chooseTargetValue: async () => ({ target: TARGET, targetId: 'macos-aarch64-metal' }),
        probe: () => ({ path: 'pixi', version: BASE.pixiVersion }),
      },
    );

    expect(optionalAsk).toBe(true);
    expect(options.publishBaseUrl).toBeNull();
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
      if (!String(chunk).endsWith('↳ ')) return;
      asked += 1;
      input.write(asked > 2 ? 'example-model\n' : '\n');
    });

    expect(await promptText('Box ID', { input, output })).toBe('example-model');
    // Two slips, each answered with the question again rather than with the end of the session.
    expect(written.filter((line) => line.includes('is required')).length).toBe(2);
  });

  it('lays a question out as a separated title, explanation, then the marked answer line', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let rendered = '';
    output.on('data', (chunk) => {
      rendered += String(chunk);
      if (String(chunk).endsWith('↳ ')) input.write('entrypoint.py\n');
    });

    const answer = await promptText('Script path', {
      hint: 'Path from the project root to the Python file the box should run.',
      input,
      output,
    });

    expect(answer).toBe('entrypoint.py');
    expect(rendered).toBe(
      '\nScript path\nPath from the project root to the Python file the box should run:\n ↳ ',
    );
  });

  it('resolves --runtime-version latest to a number, never the word', async () => {
    expect(resolveRuntimeVersion('python', 'latest')).toBe(LATEST_PYTHON_VERSION);
    expect(resolveRuntimeVersion('python', 'latest')).toMatch(/^\d+\.\d+$/);
    expect(resolveRuntimeVersion('python', null)).toBe(DEFAULT_PYTHON_VERSION);
    expect(resolveRuntimeVersion('python', '3.10.4')).toBe('3.10.4');
    expect(resolveRuntimeVersion('node', 'latest')).toBe(LATEST_NODE_VERSION);
    expect(resolveRuntimeVersion('node', null)).toBe(DEFAULT_NODE_VERSION);
    // A runtime that installs no interpreter has no version to pin, so asking for one is refused
    // rather than answered with a number that would mean nothing.
    expect(resolveRuntimeVersion('native', null)).toBeNull();
    expect(() => resolveRuntimeVersion('native', '1.0')).toThrow(/no version to pin/);
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
    expect(written.runtime.entryPoint).toBeUndefined();
    expect(written.cacheSubdir).toBeUndefined();
    const { scroll } = await readScroll(result.scrollRef);
    expect(scroll.runtime.entryPoint).toBe('venv/python.exe');
    expect(scroll.cacheSubdir).toBe('cache/example-model');
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
      runtime: { ...minimal.runtime, entryPoint: 'venv/bin/python' },
      cacheSubdir: 'cache/example-model',
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
      runtime: { ...scroll.runtime, entryPoint: 'venv/python.exe' },
    }, null, 2)}\n`);

    await expect(readScroll(result.scrollRef)).rejects.toThrow(/must use entry point/);
  });

  it('generates a runnable self-test as a Python file, not a JSON string', async () => {
    const current = await workspace();
    const result = await createScroll({
      workspace: current,
      ...BASE,
      executionKind: 'library-only',
    });

    expect(result.scroll.selfTest.code).toBeUndefined();
    const selfTestPath = join(result.scrollDir, 'self_test.py');
    expect(result.scroll.selfTest.script)
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

    const second = await ensureExampleScroll({ workspace: current, target: TARGET });

    expect(second.created).toBe(false);
    expect(second.written).toEqual([]);
    expect(await readFile(first.generatedScriptPath, 'utf8')).toBe('print("customized")\n');
  });

  it('writes the consumer templates without an example, and never over an edited one', async () => {
    const current = await workspace();
    // No example scroll here at all: the templates are what a real consumer application starts
    // from, so declining the demo must not take them away.
    const first = await ensureConsumerTemplates({ workspace: current });
    const typescriptTemplate = join(current.root, 'consumer-templates', 'run-box.ts');
    const pythonTemplate = join(current.root, 'consumer-templates', 'run_box.py');
    const rustTemplate = join(current.root, 'consumer-templates', 'rust', 'src', 'main.rs');
    const rustManifest = join(current.root, 'consumer-templates', 'rust', 'Cargo.toml');
    const packageJson = join(current.root, 'package.json');
    expect(first.written).toContain(typescriptTemplate);
    // They name no box of their own: the release path is a placeholder for the project's box.
    expect(await readFile(typescriptTemplate, 'utf8')).not.toContain('example-box');
    expect(await readFile(typescriptTemplate, 'utf8')).toContain('<box-id>/<version>');

    await writeFile(typescriptTemplate, '// customized\n');
    await rm(pythonTemplate);
    await writeFile(rustTemplate, '// customized\n');
    await rm(rustManifest);
    await writeFile(packageJson, '{"type":"commonjs","custom":true}\n');

    const second = await ensureConsumerTemplates({ workspace: current });

    expect(second.written).toEqual([pythonTemplate, rustManifest]);
    expect(await readFile(typescriptTemplate, 'utf8')).toBe('// customized\n');
    expect(await readFile(pythonTemplate, 'utf8')).toContain('run_box');
    expect(await readFile(rustTemplate, 'utf8')).toBe('// customized\n');
    expect(await readFile(rustManifest, 'utf8')).toContain('scrollcase-consumer-template');
    expect(await readFile(packageJson, 'utf8')).toBe('{"type":"commonjs","custom":true}\n');

    const third = await ensureConsumerTemplates({ workspace: current });
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

  it('takes default arguments as one argument or as a JSON array', async () => {
    const collect = async (value) => (await collectNewScrollOptions(
      new Map([['target', 'macos-aarch64-metal'], ['runtime', 'native'],
        ['box-id', 'transcode-demo'], ['source-revision', 'ffmpeg-9'],
        ['from-environment', 'venv/bin/ffmpeg'], ['default-args', value]]),
      { terminal: false, probe: () => ({ path: 'pixi', version: BASE.pixiVersion }) },
    )).defaultArgs;

    // The common case is one argument, and quoting a one-element JSON array to say it is a tax.
    expect(await collect('-hide_banner')).toEqual(['-hide_banner']);
    expect(await collect('["-hide_banner", "-nostats"]')).toEqual(['-hide_banner', '-nostats']);
    // A value that opens like an array is held to being one: falling back to a literal would turn a
    // malformed array into a single argument that looks almost right.
    await expect(collect('["-a"')).rejects.toThrow(/not valid JSON/);
    await expect(collect('[1, 2]')).rejects.toThrow(/JSON array of strings, or a single argument/);
  });
});
