/**
 * Every documentation link the CLI can print, resolved against the pages in this repository.
 *
 * A dead link in a browser shows a 404; a dead link in a terminal shows nothing at all, because the
 * person who followed it is somewhere else by the time it fails. Nothing else in the suite would
 * notice a renamed heading — VitePress checks the links inside `docs/`, not the ones the CLI holds —
 * so this is the only thing standing between a section rename and a prompt that sends people
 * nowhere.
 */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DOCS_BASE_URL, DOCS_LINKS, docsUrl, questionDocs } from '../../src/cli-docs.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const docsDir = join(root, 'docs');

/**
 * VitePress's own slug rule, narrowed to what these headings use: lower-case, punctuation dropped,
 * spaces to hyphens. Kept beside the assertion rather than imported, because the point is to agree
 * with the published anchor and not with our own helper.
 */
const slug = (heading) => heading
  .toLowerCase()
  .replace(/`/g, '')
  .replace(/[^\w\- ]+/g, '')
  .trim()
  .replace(/\s+/g, '-');

/**
 * The Markdown behind a route, resolved the way VitePress resolves one.
 *
 * A route is either a page or a section: `/reference/scroll` is `reference/scroll.md`, while
 * `/reference/api` is `reference/api/index.md`. Trying only the first spelling made this guard
 * reject a link that works — which it did, the first time it ran, because the API reference had
 * already become a directory.
 */
async function pageSource(page) {
  const candidates = [join(docsDir, `${page}.md`), join(docsDir, page, 'index.md')];
  const settled = await Promise.allSettled(candidates.map((path) => readFile(path, 'utf8')));
  const found = settled.find(({ status }) => status === 'fulfilled');
  if (!found) throw new Error(`No page backs /${page}; tried ${candidates.join(' and ')}`);
  return found.value;
}

async function headingsOf(page) {
  // Fenced blocks first: a `#` inside a shell sample is a comment, not a heading.
  const prose = (await pageSource(page)).replace(/^```[\s\S]*?^```$/gm, '');
  return new Set([...prose.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((match) => slug(match[1])));
}

describe('the documentation links the CLI prints', () => {
  it('names a real page, and a real heading on it, for every question', async () => {
    // Not vacuous: an empty map, or one whose entries stopped being reachable from the prompts,
    // would assert nothing at all.
    expect(Object.keys(DOCS_LINKS).length).toBeGreaterThan(10);

    for (const [question, path] of Object.entries(DOCS_LINKS)) {
      const [route, fragment] = path.split('#');
      const page = route.replace(/^\//, '').replace(/\/$/, '');
      const label = `${question} → ${path}`;

      await expect(pageSource(page), label).resolves.toBeTruthy();
      if (fragment) {
        expect([...await headingsOf(page)], label).toContain(fragment);
      }
    }
  });

  it('builds every link from one base URL', () => {
    for (const question of Object.keys(DOCS_LINKS)) {
      expect(questionDocs(question)).toBe(`${DOCS_BASE_URL}${DOCS_LINKS[question]}`);
    }
    // A question with no section returns nothing rather than the bare site, which would send a
    // reader to a home page that does not discuss what they were asked.
    expect(questionDocs('no-such-question')).toBeNull();
    expect(() => docsUrl('reference/cli')).toThrow(/must start with/);
  });

  it('points `help` at the documentation site', () => {
    const help = execFileSync(process.execPath, ['src/cli.mjs', 'help'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(help).toContain(DOCS_BASE_URL);
  });
});
