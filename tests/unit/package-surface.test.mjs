/**
 * What a consumer of the published package actually gets.
 *
 * Four failures this catches that nothing else does. First, an `exports` map that names a file which
 * moved or was never shipped: every other test imports by relative path, so the package could be
 * broken for everyone installing it while the suite stayed green. Second, an entry point that
 * resolves but will not *link* — a re-export naming a symbol its source no longer has, which this
 * runner forgives and `node` refuses. Third, generated types drifting from the schemas they are a
 * projection of — the schemas are the source of truth, and a type that disagrees with them is worse
 * than no type at all. Fourth, runtime declarations that exist but silently widen the JavaScript
 * API to `any`.
 */

import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeGeneratedText } from '../../scripts/normalize-generated-text.mjs';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');
const repoRoot = new URL('../../', import.meta.url);
const repoRootPath = fileURLToPath(repoRoot);

async function moduleClosure(entry, visited = new Set(), allowNodeBuiltins = false) {
  const url = new URL(entry, repoRoot);
  if (visited.has(url.href)) return visited;
  visited.add(url.href);
  const source = await readFile(url, 'utf8');
  const specifiers = [...source.matchAll(
    /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  )].map((match) => match[1]);
  for (const specifier of specifiers) {
    if (specifier.startsWith('node:')) {
      if (!allowNodeBuiltins) {
        expect(specifier, `${entry} imports a Node built-in`).not.toMatch(/^node:/);
      }
      continue;
    }
    if (specifier.startsWith('.')) {
      await moduleClosure(new URL(specifier, url).href, visited, allowNodeBuiltins);
    }
  }
  return visited;
}

describe('the package surface', () => {
  const subpathTargets = (subpath) => {
    const entry = packageJson.exports[subpath];
    return typeof entry === 'string' ? [entry] : Object.values(entry);
  };

  it('exports every subpath it advertises, and each one resolves to a file that exists', async () => {
    const subpaths = Object.keys(packageJson.exports).filter((subpath) => !subpath.includes('*'));
    expect(subpaths).toEqual([
      './contract',
      './contract/browser',
      './contract/types',
      './build',
      './consumer',
      './sign',
    ]);
    for (const subpath of subpaths) {
      for (const target of subpathTargets(subpath)) {
        // Reading it is the check: a path that no longer exists throws here.
        await expect(readFile(new URL(target, repoRoot), 'utf8')).resolves.toBeTruthy();
      }
    }
  });

  it('ships everything the exports map points at', () => {
    // `files` decides what npm publishes; an export outside it resolves for us and 404s for a user.
    const shipped = new Set(packageJson.files);
    for (const subpath of Object.keys(packageJson.exports)) {
      for (const target of subpathTargets(subpath)) {
        const top = target.replace(/^\.\//, '').split('/')[0];
        expect(shipped.has(top), `${subpath} resolves outside "files"`).toBe(true);
      }
    }
  });

  it('ships the executable under the canonical command name without npm normalization', () => {
    expect(packageJson.bin).toEqual({ scrollcase: 'src/cli.mjs' });
    expect(packageJson.files).toContain('src');
  });

  it('imports each runtime entry point the way a dependent would', async () => {
    const contract = await import('scrollcase/contract');
    const browserContract = await import('scrollcase/contract/browser');
    const build = await import('scrollcase/build');
    const consumer = await import('scrollcase/consumer');
    const sign = await import('scrollcase/sign');

    // A representative export from each, so a module that resolves but fails to evaluate is caught.
    expect(contract.boxTargetId({ platform: 'macos', arch: 'aarch64', accelerator: 'metal' }))
      .toBe('macos-aarch64-metal');
    expect(contract.documentKinds().release).toBe('scrollcase.box.release');
    expect(browserContract.isSignedBoxDocument({})).toBe(false);
    expect(typeof build.sha256File).toBe('function');
    expect(typeof consumer.verifyAndExtractBox).toBe('function');
    expect(typeof consumer.attachExtractedBox).toBe('function');
    expect(typeof consumer.verifyExtractedPayload).toBe('function');
    expect(typeof consumer.runExtractedBox).toBe('function');
    expect(typeof consumer.runBox).toBe('function');
    expect(typeof sign.verifySignedDocument).toBe('function');
  });

  /**
   * The same five entry points, loaded by Node itself.
   *
   * The case above imports them too, and it is not enough: it runs inside Vitest, whose resolver
   * links a module graph its own way and forgave a re-export naming a symbol that no longer existed.
   * `scrollcase/contract/browser` re-exported `assertPythonEntryPoint` from `targets.mjs` for the
   * whole of the version 3 work — the runtime split had moved it and renamed it — and every one of
   * the three things that should have caught it looked elsewhere. The import above resolved. The
   * closure scan below is a regular expression over source text, which reads specifiers and never
   * evaluates a module. And `tsc` omits an unresolvable re-export from the generated `.d.mts`
   * without a word, so `types:check` reported no drift. Under `node`, linking that module is a
   * SyntaxError before a single statement runs, which is what a dependent would have met.
   *
   * A separate process per subpath, resolved through the package name so the `exports` map is what
   * decides which file is loaded — the same walk `import 'scrollcase/…'` performs for a dependent.
   */
  it('links every entry point in a real Node process, through the exports map', () => {
    const specifiers = Object.entries(packageJson.exports)
      .filter(([, entry]) => typeof entry === 'object' && entry.import)
      .map(([subpath]) => `scrollcase${subpath.slice(1)}`);
    expect(specifiers).toEqual([
      'scrollcase/contract',
      'scrollcase/contract/browser',
      'scrollcase/build',
      'scrollcase/consumer',
      'scrollcase/sign',
    ]);

    for (const specifier of specifiers) {
      // An entry point that links but exports nothing is the other half of the same failure: it
      // resolves, it evaluates, and a dependent gets an empty namespace object.
      const source = `const module = await import(${JSON.stringify(specifier)});
        if (Object.keys(module).length === 0) throw new Error('${specifier} exports nothing');`;
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
        cwd: repoRootPath,
        encoding: 'utf8',
      });
      expect(result.status, `${specifier} failed to link under node:\n${result.stderr}`).toBe(0);
    }
  });

  it('ships a browser-safe contract helper graph with no Node built-ins', async () => {
    await expect(moduleClosure('src/contract/browser.mjs')).resolves.toBeInstanceOf(Set);
  });

  it('type-checks every public entry point in a strict TypeScript consumer', () => {
    const tsc = require.resolve('typescript/bin/tsc');
    const project = join(repoRootPath, 'tests/fixtures/typescript-consumer/tsconfig.json');
    expect(() => execFileSync(process.execPath, [tsc, '--project', project], {
      cwd: dirname(project),
      stdio: 'pipe',
    })).not.toThrow();
  });

  it('includes the complete consumer runtime import closure in an npm pack dry run', async () => {
    const cache = await mkdtemp(join(tmpdir(), 'scrollcase-npm-pack-'));
    try {
      const npmCli = process.env.npm_execpath;
      if (!npmCli) throw new Error('npm_execpath is unavailable; run the suite through npm test.');
      const packed = JSON.parse(execFileSync(process.execPath, [
        npmCli,
        'pack',
        '--dry-run',
        '--json',
        '--ignore-scripts',
        '--cache',
        cache,
      ], {
        cwd: repoRootPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }));
      const packedFiles = new Set(packed[0].files.map((file) => file.path));
      const closure = await moduleClosure('src/consumer/index.mjs', new Set(), true);
      for (const url of closure) {
        const path = relative(repoRootPath, fileURLToPath(url)).replaceAll('\\', '/');
        expect(packedFiles.has(path), `${path} is missing from npm pack`).toBe(true);
      }
    } finally {
      await rm(cache, { recursive: true, force: true });
    }
  });

  it('resolves the schema and fixture wildcards a mirror implementation relies on', async () => {
    const schema = await import('scrollcase/contract/schema/target.schema.json', { with: { type: 'json' } });
    const scroll = await import('scrollcase/contract/schema/scroll.schema.json', { with: { type: 'json' } });
    const fixture = await import('scrollcase/contract/fixtures/target-id-contract.json', { with: { type: 'json' } });
    expect(schema.default.$id).toMatch(/target\.schema\.json$/);
    expect(scroll.default.$id).toBe('https://scrollcase.dev/schema/v3/scroll.schema.json');
    expect(fixture.default.valid.length).toBeGreaterThan(0);
  });
});

describe('the generated contract types', () => {
  it('normalises platform line endings before checking generated source', () => {
    expect(normalizeGeneratedText('first\r\nsecond\rthird\n')).toBe('first\nsecond\nthird\n');
  });

  it('match the schemas they are generated from', () => {
    // Run the generator under Node itself instead of loading its CommonJS toolchain through
    // Vitest's transformer. Besides matching how contributors invoke it, this keeps collection
    // portable on Windows, where transforming that dependency graph failed before any test ran.
    const generator = fileURLToPath(new URL('../../scripts/generate-contract-types.mjs', import.meta.url));
    expect(() => execFileSync(process.execPath, [generator, '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('declares a type for every document the format defines', async () => {
    const committed = await readFile(new URL('src/contract/types/index.d.ts', repoRoot), 'utf8');
    for (const name of [
      'BoxTarget',
      'BoxScroll',
      'BoxManifest',
      'BoxReleaseManifest',
      'BoxChannelManifest',
      'BoxRevocationsManifest',
      'SignedBoxDocument',
    ]) {
      expect(committed).toMatch(new RegExp(`^export (?:interface|type) ${name}\\b`, 'm'));
    }
  });
});

describe('the generated runtime declarations', () => {
  it('match the typed JavaScript implementation', () => {
    const generator = fileURLToPath(new URL('../../scripts/generate-runtime-types.mjs', import.meta.url));
    expect(() => execFileSync(process.execPath, [generator, '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});

/**
 * The changelog is shipped in the package, and it is the one artefact nothing else keeps honest.
 *
 * `npm version` bumps `package.json` and writes a tag; it does not touch this file. Five releases
 * went out with every one of their entries still sitting under `[Unreleased]`, so the file said
 * nothing about what had actually shipped and when. The first check below is the missing half of
 * that command: it fails on the release commit that forgot to close the section, because a bump to
 * a version with no dated section is exactly what those five releases looked like.
 *
 * It used to be two checks, the second asserting `[Unreleased]` held no entries at all. That is a
 * stronger claim than the story supports, and the wrong one: the first check already catches every
 * bump that forgot to close, and forbidding pending entries outright left ordinary work with
 * nowhere to record itself — a fix to a demo box could not be written down without cutting a
 * release for it, which is not a trade the changelog was ever meant to impose.
 */
describe('the changelog', () => {
  const changelog = () => readFile(new URL('CHANGELOG.md', repoRoot), 'utf8');
  // `## [1.2.3] — 2026-01-01`, and not the `[Python 0.4.1]` sections of the separate PyPI package.
  const RELEASE_HEADING = /^## \[(\d+\.\d+\.\d+)\](?: — (\d{4}-\d{2}-\d{2}))?$/gm;

  it('has a section for the version the package is about to publish', async () => {
    const sections = [...(await changelog()).matchAll(RELEASE_HEADING)];
    const current = sections.find(([, version]) => version === packageJson.version);

    // The failure this exists for: a bump with no section, which is silent everywhere else.
    expect(current, `CHANGELOG.md has no "## [${packageJson.version}]" section`).toBeTruthy();
    expect(current[2], `the ${packageJson.version} section has no date`).toBeTruthy();
  });

  it('keeps somewhere to write the next change', async () => {
    const text = await changelog();

    // What it holds is the release's business; that it exists is this file's. A changelog whose
    // heading was renamed at release time without a fresh one opened above it sends the next
    // change looking for a section to write in and finding the last release instead.
    expect(text).toContain('## [Unreleased]');

    const [firstRelease] = [...text.matchAll(RELEASE_HEADING)];
    expect(firstRelease?.index, 'every release section precedes [Unreleased]')
      .toBeGreaterThan(text.indexOf('## [Unreleased]'));
  });

  it('lists its releases newest first', async () => {
    const versions = [...(await changelog()).matchAll(RELEASE_HEADING)].map(([, version]) => version);
    const order = (version) => version.split('.').map(Number);
    const descending = [...versions].sort((left, right) => {
      const [a, b] = [order(right), order(left)];
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    });

    expect(versions).toEqual(descending);
  });
});
