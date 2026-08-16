import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { auditScroll } from '../../src/build/audit.mjs';
import { readScroll } from '../../src/build/scroll.mjs';
import { configureWorkspace, resetWorkspace } from '../../src/build/workspace.mjs';
import { boxTargetAdapter, condaSubdir } from '../../src/contract/targets.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const example = join(root, 'examples', 'llm-demo');
const shared = join(example, 'shared');
const targets = [
  'linux-x86_64-cpu',
  'macos-aarch64-cpu',
  'windows-x86_64-cpu',
];

// conda-forge's llama-cpp-python for osx-arm64 has the Metal backend compiled in, and llama.cpp
// registers a Metal device whatever `n_gpu_layers` says. Registering it is what makes a *CPU* box
// die on a Mac where Metal will not initialise: context creation fails for every backend it
// registered, not only the ones it was going to use. `GGML_METAL_DEVICES` is how many Metal devices
// ggml registers, so zero is the accelerator this target's name already promised. Nothing to
// declare on Linux or Windows, where there is no Metal backend to switch off.
const environments = {
  'linux-x86_64-cpu': { PYTHONDONTWRITEBYTECODE: '1' },
  'macos-aarch64-cpu': { PYTHONDONTWRITEBYTECODE: '1', GGML_METAL_DEVICES: '0' },
  'windows-x86_64-cpu': { PYTHONDONTWRITEBYTECODE: '1' },
};

const fragmentKeys = {
  'linux-x86_64-cpu': ['condaDependencyLicenseAudit', 'extends', 'target'],
  'macos-aarch64-cpu': ['condaDependencyLicenseAudit', 'environment', 'extends', 'target'],
  'windows-x86_64-cpu': ['condaDependencyLicenseAudit', 'extends', 'target'],
};

// The one prompt the guide, the release notes and the self-test use. Short on purpose: every CI job
// pays for it in tokens generated on a CPU. The consumer templates are checked against it the other
// way round — they must *not* carry it, because a template with a prompt of its own is a template
// that cannot reach the box's other mode.
const demoPrompt = 'What is the capital of Italy?';

// The immutable upstream revision every asset URL must name. `main` would make the box's contents
// depend on when it was built, which is the one thing a pinned hash exists to prevent.
const modelRevision = '2d4a76a30b4af41ecd395c35725ac11688d4cfe4';

// The GGUF as `add asset` recorded it. Restated here rather than merely shape-checked, because a
// unit test cannot recompute the digest of a 1.06 GB file that is deliberately not in the
// repository — and a `/^[0-9a-f]{64}$/` assertion, which is what this was first written as, accepts
// any hex string and so guards nothing. Changing the model means changing both, which is the point:
// an edit to the scroll's asset descriptor that nobody reviewed fails here.
const modelSizeBytes = 1055609536;
const modelSha256 = 'decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33';

function pythonCommand() {
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  return candidates.find((candidate) => (
    spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0
  )) ?? null;
}

const python = pythonCommand();

/** The effective scroll of each target: base joined with fragment, exactly as a build reads it. */
async function scrolls() {
  configureWorkspace({ cwd: root, overrides: { scrolls: 'examples' } });
  try {
    return await Promise.all(targets.map(async (target) => ({
      target,
      scroll: (await readScroll(`llm-demo/${target}`)).scroll,
    })));
  } finally {
    resetWorkspace();
  }
}

/** Runs `entrypoint.py` in-process through a Python harness, with the model back ends injected. */
function runEntrypoint(body) {
  return spawnSync(python, ['-c', [
    'import sys',
    `sys.path.insert(0, ${JSON.stringify(shared)})`,
    'from entrypoint import main',
    body,
  ].join('\n')], { encoding: 'utf8' });
}

describe('published local LLM demo box', () => {
  // One copy of the entrypoint under `shared/`, hashed into three scrolls — and hashed a fourth
  // time by the Codespaces walkthrough, which ships the same file. That is only safe while the
  // hashes stay true: a stale one fails the build with a mismatch on a checkout that looks clean.
  it('declares the exact bytes of every shared file, in every target', async () => {
    const files = [
      ['entrypoint.py', 'entrypoint.py'],
      ['MODEL_NOTICE.md', 'THIRD_PARTY_NOTICES/smollm2/MODEL_NOTICE.md'],
      ['APACHE-2.0.txt', 'THIRD_PARTY_NOTICES/smollm2/APACHE-2.0.txt'],
    ];

    for (const [name, relativePath] of files) {
      const digest = createHash('sha256').update(await readFile(join(shared, name))).digest('hex');

      for (const { target, scroll } of await scrolls()) {
        const declared = scroll.localFiles.find((file) => file.relativePath === relativePath);
        expect(declared?.sourcePath, `${target}: ${relativePath}`)
          .toBe(`examples/llm-demo/shared/${name}`);
        expect(declared?.sha256, `${target}: ${relativePath}`).toBe(digest);
      }
    }
  });

  // Three targets packaging the same model must differ only in what the target itself forces, or
  // the boxes stop being the same box: a stray asset, environment variable or self-test in one of
  // them would ship a difference nobody declared.
  it('declares what the targets share once, in a base they all extend', async () => {
    for (const target of targets) {
      const fragment = JSON.parse(await readFile(join(example, target, 'scroll.json'), 'utf8'));
      expect(Object.keys(fragment).sort(), target).toEqual(fragmentKeys[target]);
    }

    // `environment` is compared separately, below, and exactly. Leaving it in here would make one
    // target's extra variable the reason all three differ, and the message would say only that.
    const normalised = (await scrolls()).map(({ scroll }) => JSON.stringify({
      ...scroll,
      scrollId: null,
      target: null,
      condaDependencyLicenseAudit: null,
      pythonEntryPoint: null,
      environment: null,
    }));

    expect(new Set(normalised).size).toBe(1);
  });

  // Stated per target and in full, rather than asserted to be equal: the one variable that differs
  // is a real difference between the operating systems, and the way to keep it from becoming cover
  // for an undeclared second one is to write down what each box is allowed to set.
  it('sets the CPU-only Metal count on macOS and nothing extra anywhere else', async () => {
    for (const { target, scroll } of await scrolls()) {
      expect(scroll.environment, target).toEqual(environments[target]);
    }
  });

  // A GGUF carries the weights, the tokenizer and the chat template in one container, so this box
  // has exactly one asset. Two would mean something arrived that this entrypoint cannot describe.
  it('pins the whole model as one commit-pinned asset', async () => {
    for (const { target, scroll } of await scrolls()) {
      expect(scroll.assets, target).toHaveLength(1);

      const [asset] = scroll.assets;
      expect(asset.url, target).toContain(`/resolve/${modelRevision}/`);
      expect(asset.url, target).not.toContain('/resolve/main/');
      expect(asset.relativePath, target).toBe(
        'model-cache/llm-demo/smollm2-1.7b-instruct-q4_k_m.gguf',
      );
      expect(asset.sizeBytes, target).toBe(modelSizeBytes);
      expect(asset.sha256, target).toBe(modelSha256);
      expect(scroll.weights, target).toBe('embed');
    }
  });

  // `defaultArgs` and caller arguments are concatenated, not overridden, so a default prompt here
  // would be prepended to the caller's own and both would be answered as one question. It is also
  // what makes the two modes work: an empty argument list is how the box is told to open a chat.
  it('declares no default arguments, and ships templates that substitute none', async () => {
    for (const { target, scroll } of await scrolls()) {
      expect(scroll.execution, target)
        .toMatchObject({ kind: 'python-script', script: 'entrypoint.py' });
      expect(scroll.execution.defaultArgs, target).toEqual([]);
      expect(scroll.selfTest.imports, target).toContain('llama_cpp');
    }

    // The templates once supplied a question when the caller passed none, which made them always
    // produce an answer and quietly cost the box a mode: no arguments is not a missing prompt, it
    // is the chat. A consumer read as a worked example teaches whatever it does, so it forwards
    // what it was given and nothing else.
    for (const template of ['run-box.ts', 'run_box.py']) {
      const source = await readFile(join(example, 'demo-consumers', template), 'utf8');
      expect(source, template).not.toContain(demoPrompt);
      expect(source, `${template} forwards its own arguments`)
        .toMatch(/process\.argv\.slice\(2\)|sys\.argv\[1:\]/);
    }
  });

  // `platforms` in pixi.toml decides which operating system the solved environment is for. Get it
  // wrong and the solve succeeds, the build succeeds, and the box cannot run on the machine it is
  // named for — a failure that only appears on the target itself.
  it('solves for the conda subdir and interpreter its target requires', async () => {
    for (const { target, scroll } of await scrolls()) {
      const manifest = await readFile(join(example, target, 'pixi.toml'), 'utf8');
      expect(manifest, target).toContain(`platforms = ["${condaSubdir(scroll.target)}"]`);
      expect(scroll.pythonEntryPoint, target)
        .toBe(boxTargetAdapter(scroll.target).python.entryPoint);
    }
  });

  // The build recomputes this inventory from the lock and refuses to continue on any difference, so
  // a committed audit that no longer matches its lock is a build that fails after the environment
  // has already been installed. Recomputing it here is the same check, minutes earlier.
  it('ships a reviewed licence audit that still matches its lock', async () => {
    configureWorkspace({ cwd: root, overrides: { scrolls: 'examples' } });
    try {
      for (const target of targets) {
        await expect(auditScroll(`llm-demo/${target}`), target).resolves.toBeDefined();
      }
    } finally {
      resetWorkspace();
    }
  });

  it.skipIf(!python)('fails clearly, and silently on stdout, on a blank prompt', () => {
    // Whitespace rather than nothing: an empty argument list is the chat mode, and a chat needs the
    // model. A prompt of spaces is the case that has to reach the usage line.
    const result = runEntrypoint('sys.exit(main(["   "]))');

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^usage: entrypoint\.py WORD \[WORD \.\.\.\]/);
  });

  // The answer is the whole of stdout. Timings, progress and the loading line go to stderr, which
  // is what makes `run ... > answer.txt` produce a file with the answer and nothing else.
  it.skipIf(!python)('prints the answer on stdout and its statistics on stderr', () => {
    const statistics = JSON.stringify({
      load_seconds: 1.5,
      generate_seconds: 0.5,
      output_tokens: 3,
      tokens_per_second: 6.0,
      threads: 2,
      context_tokens: 2048,
    });
    const result = runEntrypoint(
      `sys.exit(main([${JSON.stringify(demoPrompt)}],`
      + ` generate_fn=lambda prompt: ("Rome.", ${statistics})))`,
    );

    expect(result.status, result.stderr).toBe(0);
    // Compared whole rather than with `toContain`, because "only the answer" is the claim being
    // tested and a substring match would pass on stdout that also carried the statistics. The line
    // ending is normalised first: Python's `print` writes `\r\n` on Windows, which is the platform's
    // business and not something this box decides.
    expect(result.stdout.replaceAll('\r\n', '\n')).toBe('Rome.\n');
    expect(result.stderr).toContain('3 tokens in 0.5s');
  });

  // The load is where this box fails on a machine it has never run on, and llama.cpp writes the
  // reason to a log the box mutes. The switch that unmutes it is only useful if the release leaves
  // it alone: a declared value wins over the host's, so declaring it would silently weld it shut.
  it.skipIf(!python)('loads quietly, and talks when the host asks it to', () => {
    const result = runEntrypoint([
      'import entrypoint, os, sys, types',
      'seen = {}',
      'class FakeLlama:',
      '    def __init__(self, **kwargs): seen.update(kwargs)',
      'fake = types.ModuleType("llama_cpp")',
      'fake.Llama = FakeLlama',
      'sys.modules["llama_cpp"] = fake',
      'entrypoint.model_path = lambda: __import__("pathlib").Path("model.gguf")',
      'os.environ.pop(entrypoint.VERBOSE_VARIABLE, None)',
      'entrypoint.load_model()',
      'print("quiet", seen["verbose"])',
      'os.environ[entrypoint.VERBOSE_VARIABLE] = "1"',
      'entrypoint.load_model()',
      'print("asked", seen["verbose"])',
    ].join('\n'));

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.replaceAll('\r\n', '\n')).toContain('quiet False\nasked True\n');
  });

  it.skipIf(!python)('names the switch when the load fails without it', async () => {
    const result = runEntrypoint([
      'import entrypoint, os, sys, types',
      'class FakeLlama:',
      '    def __init__(self, **kwargs): raise ValueError("Failed to create llama_context")',
      'fake = types.ModuleType("llama_cpp")',
      'fake.Llama = FakeLlama',
      'sys.modules["llama_cpp"] = fake',
      'entrypoint.model_path = lambda: __import__("pathlib").Path("model.gguf")',
      'os.environ.pop(entrypoint.VERBOSE_VARIABLE, None)',
      'try:',
      '    entrypoint.load_model()',
      'except entrypoint.DemoError as error:',
      '    print(error)',
    ].join('\n'));

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Failed to create llama_context');
    expect(result.stdout).toContain('LLM_DEMO_VERBOSE=1');

    // The same variable, unset in every release: whichever name the entrypoint reads, a box that
    // declares it takes the switch away from the person holding it.
    for (const { target, scroll } of await scrolls()) {
      expect(Object.keys(scroll.environment ?? {}), target).not.toContain('LLM_DEMO_VERBOSE');
    }
  });

  // The mode is the argument list, and nothing else: no flag, no second box, no scroll field. This
  // is that decision, exercised without loading a gigabyte.
  it.skipIf(!python)('opens the chat when it is given no arguments at all', () => {
    const result = runEntrypoint('sys.exit(main([], chat_fn=lambda: 0))');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });
});
