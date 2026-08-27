/**
 * Build-time generation of /llms.txt and /llms-full.txt.
 *
 * A model answering a question about Scrollcase arrives with a budget: it fetches two or three
 * URLs, not thirty-six. robots.txt only says what it is allowed to read, which is not the same as
 * telling it what is worth reading. These two files do that, following the convention at
 * https://llmstxt.org: `/llms.txt` is the map — every page, in the order the sidebar puts them,
 * with the one-line description its frontmatter already carries — and `/llms-full.txt` is the
 * territory, the same pages' Markdown concatenated so the whole manual arrives in one request.
 *
 * Both are derived from the pages VitePress actually built and from the sidebar that orders them,
 * so a page added to the site joins them by existing rather than by being remembered. The only
 * hand-written part is the header below, which states what the project is — the one thing no
 * page's frontmatter says.
 *
 * The alternative was a static file in `public/`, and it was rejected for the obvious reason: a
 * hand-maintained copy of the site's structure is wrong the first time someone renames a page.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Pages seen by `transformPageData`, keyed by normalised route. Sorted before use — the build
 *  visits pages in whatever order Vite hands them over, and the output has to be stable. */
const pages = new Map();

/** The home page renders a Vue component and carries no prose, so it is nobody's reading. */
const HOME_ROUTE = '/';

/** Turn `guides/index.md` into `/guides/` and `white-paper.md` into `/white-paper`, matching the
 *  clean URLs the site serves and the entries VitePress writes into sitemap.xml. */
export function routeOf(relativePath) {
  const path = relativePath.replace(/\.md$/, '');
  if (path === 'index') return HOME_ROUTE;
  if (path.endsWith('/index')) return `/${path.slice(0, -'index'.length)}`;
  return `/${path}`;
}

/** Trailing slashes differ between a sidebar link and a built route; comparisons use this form. */
const key = (route) => (route.length > 1 ? route.replace(/\/$/, '') : route);

/** Called for every page during the build. Returns the route so the caller can reuse it. */
export function recordPage(pageData) {
  const route = routeOf(pageData.relativePath);
  pages.set(key(route), {
    route,
    relativePath: pageData.relativePath,
    title: pageData.title ?? route,
    description: (pageData.description ?? '').trim(),
  });
  return route;
}

/**
 * Flatten the sidebar into ordered sections. A nested group that has both a link and items — the
 * demos — becomes a section of its own rather than a run of entries buried inside its parent,
 * because in an index the grouping is the only structure a reader gets.
 */
function sectionsFromSidebar(sidebar) {
  const sections = [];
  for (const group of sidebar) {
    const routes = [];
    const promoted = [];
    walk(group, routes, promoted);
    sections.push({ title: group.text, routes });
    sections.push(...promoted);
  }
  return sections;
}

function walk(node, routes, promoted) {
  if (node.link) routes.push(key(node.link));
  for (const item of node.items ?? []) {
    if (item.link && item.items) {
      const sub = [];
      walk(item, sub, promoted);
      promoted.push({ title: item.text, routes: sub });
    } else {
      walk(item, routes, promoted);
    }
  }
}

/** Group the built pages by sidebar section, in sidebar order. Anything the sidebar does not
 *  mention still ships, under `Optional` — the spec's word for "skip this if context is short". */
function group(sidebar) {
  const used = new Set();
  const sections = [];
  for (const section of sectionsFromSidebar(sidebar)) {
    const items = [];
    for (const route of section.routes) {
      const page = pages.get(route);
      if (page && !used.has(route)) {
        used.add(route);
        items.push(page);
      }
    }
    if (items.length) sections.push({ title: section.title, items });
  }
  const rest = [...pages.entries()]
    .filter(([route, page]) => !used.has(route) && page.route !== HOME_ROUTE)
    .map(([, page]) => page)
    .sort((a, b) => a.route.localeCompare(b.route));
  if (rest.length) sections.push({ title: 'Optional', items: rest });
  return sections;
}

/** The schemas are served as files, not pages, and they are the machine-readable half of the
 *  answer to most questions about the box format. Listed from what the build actually emitted. */
async function schemaLinks(outDir, hostname) {
  try {
    const names = (await readdir(join(outDir, 'schema', 'v2')))
      .filter((name) => name.endsWith('.schema.json'))
      .sort();
    return names.map((name) => `- [${name}](${hostname}/schema/v3/${name})`);
  } catch {
    return [];
  }
}

function header(version) {
  return [
    '# Scrollcase',
    '',
    '> Scrollcase turns a declarative **scroll** into a **box**: a portable, locked, self-contained',
    '> Python environment for one operating system and accelerator, packed so it runs somewhere other',
    '> than where it was built, signed so a consumer can prove what they received, and accompanied by',
    '> a dependency licence inventory.',
    '',
    `- Version ${version}, box format schema version 2. Apache-2.0, vendor-neutral, open source.`,
    '- Substrate: pixi + conda-pack + conda-forge, and only that. There is no second dependency backend.',
    '- CLI verbs: `init`, `new`, `add`, `remove`, `edit`, `refresh`, `doctor`, `keygen`, `lock`, `audit`, `build`, `verify`, `run`.',
    '- Also a library, in three languages that implement the same consumer semantics: `scrollcase` on npm, `scrollcase-consumer` on PyPI, `scrollcase-consumer` on crates.io.',
    '- Scrollcase is not a distribution system, not a CI system, and not a scientific validator. It builds, signs, verifies and runs a box; publishing, updating and deciding what is scientifically correct belong to whoever uses it.',
    '- Source and issues: https://github.com/suffro/scrollcase',
    '',
  ];
}

/** `/llms.txt` — the index. */
async function renderIndex({ hostname, version, sidebar, outDir }) {
  const lines = [
    ...header(version),
    `Every page below, concatenated as one document: ${hostname}/llms-full.txt`,
    '',
  ];
  for (const section of group(sidebar)) {
    lines.push(`## ${section.title}`, '');
    for (const page of section.items) {
      const description = page.description ? `: ${page.description}` : '';
      lines.push(`- [${page.title}](${hostname}${page.route})${description}`);
    }
    lines.push('');
  }
  const schemas = await schemaLinks(outDir, hostname);
  if (schemas.length) {
    lines.push('## JSON Schemas', '', 'The box format itself, machine-readable. Normative — the prose above describes these.', '', ...schemas, '');
  }
  return `${lines.join('\n')}`;
}

/**
 * Reduce a page to what someone would read if the site were a text file.
 *
 * The rule is that markup carrying content is converted and markup carrying only presentation is
 * dropped: a `<Button>` becomes the link it is, a tab keeps its title as a heading, and the
 * section `<div>`s, the print stylesheet and the layout components go, since none of them says
 * anything a reader would miss. Deleting a wrapper's tags is never allowed to delete what it
 * wrapped — that is the difference between a plain-text page and a shorter one.
 *
 * Site-root links are made absolute for the same reason the file exists at all: `/reference/scroll`
 * resolves against a page, and this text will be read somewhere that is not one.
 */
function toPlainMarkdown(source, hostname) {
  return source
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/\]\((\/[^)\s]*)\)/g, `](${hostname}$1)`)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<Button\b([^>]*)>([\s\S]*?)<\/Button>/g, (_, attrs, label) => {
      // Absolutised here too: this runs after the link pass above, which only sees Markdown.
      const href = attrs.match(/href="([^"]*)"/)?.[1];
      const text = label.replace(/\s+/g, ' ').trim();
      if (!href) return text;
      return `[${text}](${href.startsWith('/') ? hostname + href : href})`;
    })
    .replace(/<Tab\s+title="([^"]*)"\s*>/g, '\n**$1**\n')
    .replace(/<\/?Tabs\b[^>]*>/g, '')
    .replace(/<\/Tab>/g, '')
    .replace(/<\/?div\b[^>]*>/g, '')
    .replace(/^[ \t]*<(?:HomePage|SubPagesList|Spacer)\b[^>]*\/?>[ \t]*$/gim, '')
    .replace(/<spacer\s*\/>/gi, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Every page but the home page opens with its own H1, and that heading is a better section title
 *  than the frontmatter's — the white paper's frontmatter says `Technical White Paper` while the
 *  document calls itself `Scrollcase — Technical White Paper`. Use the page's, fall back to ours,
 *  and never emit both: two H1s in a row read as a formatting accident. */
function sectionOf(page, body, hostname) {
  const heading = body.match(/^# (.+)$/m);
  const title = heading && body.startsWith('# ') ? heading[1] : page.title;
  const text = body.startsWith('# ') ? body.slice(body.indexOf('\n') + 1).trimStart() : body;
  return [`# ${title}`, '', `Source: ${hostname}${page.route}`, '', text, ''];
}

/** `/llms-full.txt` — every page's Markdown, in the index's order, each under its own URL.
 *  The white paper goes last however the sidebar orders it: it is half the site by weight, and a
 *  reader who truncates should lose the appendix rather than the manual. */
async function renderFull({ hostname, version, sidebar, srcDir }) {
  const ordered = group(sidebar).flatMap((section) => section.items);
  const body = [...ordered].sort((a, b) =>
    Number(a.route === '/white-paper') - Number(b.route === '/white-paper'));

  const parts = [
    ...header(version),
    `The complete text of ${hostname}, generated at build time. Index: ${hostname}/llms.txt`,
    '',
  ];
  for (const page of body) {
    const source = await readFile(join(srcDir, page.relativePath), 'utf8');
    // No `---` rule between pages: several pages use one themselves, and a horizontal rule after a
    // line of text is a setext heading in Markdown. The H1 and the Source line are the boundary.
    parts.push('', ...sectionOf(page, toPlainMarkdown(source, hostname), hostname));
  }
  return parts.join('\n');
}

/**
 * The Markdown twin of a page, at the page's own path with `.md` appended. `functions/_middleware.js`
 * derives the same path from a request, and the two derivations have to agree — a twin written
 * where nothing looks for it is a file nobody will ever read.
 */
export function markdownFileFor(route) {
  return route === HOME_ROUTE ? 'index.md' : `${route.replace(/\/$/, '').slice(1)}.md`;
}

/** YAML is not forgiving of a colon or a quote in an unquoted scalar, and these descriptions carry
 *  both. Double-quoted with the two characters that matter escaped. */
const yamlString = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * One `.md` per page, so `Accept: text/markdown` has something true to return.
 *
 * The home page is the exception and gets the llms.txt index: it renders a Vue component rather
 * than prose, and the most useful Markdown a landing page can hand an agent is the map of
 * everything behind it.
 */
async function writePageFiles({ outDir, srcDir, hostname, index, siteDescription }) {
  const written = [];
  for (const page of pages.values()) {
    const body = page.route === HOME_ROUTE
      ? index
      : toPlainMarkdown(await readFile(join(srcDir, page.relativePath), 'utf8'), hostname);
    // The home page declares no description of its own — it is the one page whose subject is the
    // whole site, so the site's own description is the accurate answer rather than a stand-in.
    const description = page.description || siteDescription;
    const document = [
      '---',
      `title: ${yamlString(page.title)}`,
      ...(description ? [`description: ${yamlString(description)}`] : []),
      `source: ${hostname}${page.route}`,
      '---',
      '',
      body,
      '',
    ].join('\n');
    const file = join(outDir, markdownFileFor(page.route));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, document);
    written.push(file);
  }
  return written.length;
}

/** Write the generated Markdown surface into the built site. Called from `buildEnd`, so `outDir`
 *  already holds the rendered pages and the public assets the index points at. */
export async function writeLlmsFiles({ outDir, srcDir, hostname, version, sidebar, siteDescription }) {
  const [index, full] = await Promise.all([
    renderIndex({ hostname, version, sidebar, outDir }),
    renderFull({ hostname, version, sidebar, srcDir }),
  ]);
  await Promise.all([
    writeFile(join(outDir, 'llms.txt'), index),
    writeFile(join(outDir, 'llms-full.txt'), full),
  ]);
  const twins = await writePageFiles({ outDir, srcDir, hostname, index, siteDescription });
  return {
    pages: pages.size,
    twins,
    indexBytes: Buffer.byteLength(index),
    fullBytes: Buffer.byteLength(full),
  };
}
