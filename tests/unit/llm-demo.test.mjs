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

// The one prompt the guide, the release notes, the self-test and both shipped consumer templates
// use. Short on purpose: every CI job pays for it in tokens generated on a CPU.
const demoPrompt = 'What is the capital of France?';

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
      expect(Object.keys(fragment).sort(), target)
        .toEqual(['condaDependencyLicenseAudit', 'extends', 'target']);
    }

    const normalised = (await scrolls()).map(({ scroll }) => JSON.stringify({
      ...scroll,
      scrollId: null,
      target: null,
      condaDependencyLicenseAudit: null,
      pythonEntryPoint: null,
    }));

    expect(new Set(normalised).size).toBe(1);
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
  it('declares no default arguments, and ships templates that pass a prompt', async () => {
    for (const { target, scroll } of await scrolls()) {
      expect(scroll.execution, target)
        .toMatchObject({ kind: 'python-script', script: 'entrypoint.py' });
      expect(scroll.execution.defaultArgs, target).toEqual([]);
      expect(scroll.selfTest.imports, target).toContain('llama_cpp');
    }

    for (const template of ['run-box.ts', 'run_box.py']) {
      const source = await readFile(join(example, 'demo-consumers', template), 'utf8');
      expect(source, template).toContain(demoPrompt);
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
      + ` generate_fn=lambda prompt: ("Paris.", ${statistics})))`,
    );

    expect(result.status, result.stderr).toBe(0);
    // Compared whole rather than with `toContain`, because "only the answer" is the claim being
    // tested and a substring match would pass on stdout that also carried the statistics. The line
    // ending is normalised first: Python's `print` writes `\r\n` on Windows, which is the platform's
    // business and not something this box decides.
    expect(result.stdout.replaceAll('\r\n', '\n')).toBe('Paris.\n');
    expect(result.stderr).toContain('3 tokens in 0.5s');
  });

  // The mode is the argument list, and nothing else: no flag, no second box, no scroll field. This
  // is that decision, exercised without loading a gigabyte.
  it.skipIf(!python)('opens the chat when it is given no arguments at all', () => {
    const result = runEntrypoint('sys.exit(main([], chat_fn=lambda: 0))');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });
});
