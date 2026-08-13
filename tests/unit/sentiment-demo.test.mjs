import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readScroll } from '../../src/build/scroll.mjs';
import { configureWorkspace, resetWorkspace } from '../../src/build/workspace.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const example = join(root, 'examples', 'sentiment-demo');
const shared = join(example, 'shared');
const targets = [
  'linux-x86_64-cpu',
  'macos-aarch64-cpu',
  'windows-x86_64-cpu',
];

// The one sentence the guide, the release notes and both shipped consumer templates use.
const demoSentence = 'This product is surprisingly easy to use.';

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
      scroll: (await readScroll(`sentiment-demo/${target}`)).scroll,
    })));
  } finally {
    resetWorkspace();
  }
}

describe('published sentiment demo box', () => {
  // Unlike hello-box, which copies its entrypoint per target, this example keeps one copy under
  // `shared/` and hashes it into three scrolls. That is only safe while the hashes stay true: a
  // stale one fails the build with a mismatch on a checkout that looks clean.
  it('declares the exact bytes of every shared file, in every target', async () => {
    const files = [
      ['entrypoint.py', 'entrypoint.py'],
      ['MODEL_NOTICE.md', 'THIRD_PARTY_NOTICES/distilbert/MODEL_NOTICE.md'],
      ['APACHE-2.0.txt', 'THIRD_PARTY_NOTICES/distilbert/APACHE-2.0.txt'],
    ];

    for (const [name, relativePath] of files) {
      const digest = createHash('sha256').update(await readFile(join(shared, name))).digest('hex');

      for (const { target, scroll } of await scrolls()) {
        const declared = scroll.localFiles.find((file) => file.relativePath === relativePath);
        expect(declared?.sourcePath, `${target}: ${relativePath}`)
          .toBe(`examples/sentiment-demo/shared/${name}`);
        expect(declared?.sha256, `${target}: ${relativePath}`).toBe(digest);
      }
    }
  });

  // Three targets packaging the same model must differ only in what the target itself forces, or
  // the boxes stop being the same box: a stray asset, environment variable or self-test in one of
  // them would ship a difference nobody declared. The shared half lives in one file, so this is now
  // structural rather than a resemblance checked after the fact.
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

  // `defaultArgs` and caller arguments are concatenated, not overridden, so a default sentence here
  // would be prepended to the caller's own and both would be classified as one string. The box
  // therefore declares none, and everything that runs it supplies one.
  it('declares no default arguments, and ships templates that pass a sentence', async () => {
    for (const { target, scroll } of await scrolls()) {
      expect(scroll.execution, target).toMatchObject({ kind: 'python-script', script: 'entrypoint.py' });
      expect(scroll.execution.defaultArgs, target).toEqual([]);
    }

    for (const template of ['run-box.ts', 'run_box.py']) {
      const source = await readFile(join(example, 'demo-consumers', template), 'utf8');
      expect(source, template).toContain(demoSentence);
    }
  });

  it.skipIf(!python)('fails clearly, and silently on stdout, when given no sentence', () => {
    const result = spawnSync(python, [join(shared, 'entrypoint.py')], { encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^usage: entrypoint\.py WORD \[WORD \.\.\.\]/);
  });

  // The two application lines are the demo's whole output, and the confidence formatting is part of
  // them. Exercised through the injectable predictor, so it needs neither the model nor the box.
  it.skipIf(!python)('prints exactly the two application lines', () => {
    const harness = [
      'import sys',
      `sys.path.insert(0, ${JSON.stringify(shared)})`,
      'from entrypoint import main',
      `sys.exit(main([${JSON.stringify(demoSentence)}], predict_fn=lambda sentence: ('POSITIVE', 0.999)))`,
    ].join('\n');
    const result = spawnSync(python, ['-c', harness], { encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Sentiment: POSITIVE');
    expect(result.stdout).toContain('Confidence: 99.9%');
  });
});
