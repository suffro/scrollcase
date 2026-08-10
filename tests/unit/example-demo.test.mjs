import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const targets = [
  'linux-x86_64-cpu',
  'macos-aarch64-metal',
  'windows-x86_64-cpu',
];

function pythonCommand() {
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  return candidates.find((candidate) => (
    spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0
  )) ?? null;
}

const python = pythonCommand();

describe('published demo box', () => {
  it('keeps one entrypoint across targets and declares its exact bytes', async () => {
    const sources = [];

    for (const target of targets) {
      const directory = join(root, 'examples', 'hello-box', target);
      const source = await readFile(join(directory, 'entrypoint.py'));
      const scroll = JSON.parse(await readFile(join(directory, 'scroll.json'), 'utf8'));
      const declared = scroll.localFiles.find((file) => file.relativePath === 'entrypoint.py');

      expect(declared?.sha256, target)
        .toBe(createHash('sha256').update(source).digest('hex'));
      sources.push(source.toString('utf8'));
    }

    expect(new Set(sources).size).toBe(1);
  });

  it.skipIf(!python)('leads with a successful box run instead of temporary-path diagnostics', () => {
    const script = join(root, 'examples', 'hello-box', targets[0], 'entrypoint.py');
    const result = spawnSync(python, [script], { encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/^Hello from inside a Scrollcase box!\n/);
    expect(result.stdout).toContain('signed -> verified -> relocated -> running');
    expect(result.stdout).toContain("Success: the box's own Python runtime executed this program.");
    expect(result.stdout).toMatch(/Runtime  Python \d+\.\d+\.\d+/);
    expect(result.stdout).not.toMatch(/scrollcase-run-|executable|prefix|\/tmp\//i);
  });
});
