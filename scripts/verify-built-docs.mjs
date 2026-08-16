/**
 * Check routes and custom-theme semantics that VitePress's dead-link pass cannot see.
 *
 * VitePress validates Markdown links while it builds, but public assets and HTML emitted by Vue
 * components need an artefact-level guard. Keeping this dependency-free also makes the production
 * docs build the exact check contributors run locally.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = resolve(process.argv[2] ?? join(root, 'docs', '.vitepress', 'dist'));
const schemaSource = join(root, 'src', 'contract', 'schema');
const schemaDist = join(distDir, 'schema', 'v2');

async function requireFile(path, label) {
  try {
    return await readFile(path);
  } catch {
    throw new Error(`Built documentation is missing ${label}: ${path}`);
  }
}

await requireFile(join(distDir, 'privacy.html'), '/privacy');

const schemaNames = (await readdir(schemaSource))
  .filter((name) => name.endsWith('.schema.json'))
  .sort();
const builtSchemaNames = (await readdir(schemaDist))
  .filter((name) => name.endsWith('.schema.json'))
  .sort();
if (JSON.stringify(builtSchemaNames) !== JSON.stringify(schemaNames)) {
  throw new Error('Built schema route set differs from the shipped contract.');
}
for (const name of schemaNames) {
  const [source, built] = await Promise.all([
    readFile(join(schemaSource, name)),
    readFile(join(schemaDist, name)),
  ]);
  if (!source.equals(built)) throw new Error(`Built schema differs from the shipped contract: ${name}`);
}

// The sitemap is VitePress's own list of what it rendered, so it is the honest yardstick for the
// three artefacts generated beside it: every page it names must carry a canonical link to itself,
// and must appear in both llms files. A generator that silently skips a page is the failure mode
// worth catching — the files would still look plausible.
const sitemap = (await requireFile(join(distDir, 'sitemap.xml'), 'sitemap.xml')).toString('utf8');
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => match[1])
  .sort();
if (routes.length < 2) throw new Error('Built sitemap names fewer than two pages.');

const origin = new URL(routes[0]).origin;
const home = `${origin}/`;

for (const url of routes) {
  const path = new URL(url).pathname;
  const file = join(distDir, path.endsWith('/') ? `${path}index.html` : `${path}.html`);
  const html = (await requireFile(file, `the page for ${url}`)).toString('utf8');
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (canonical !== url) {
    throw new Error(`${url} declares canonical ${canonical ?? 'nothing'}; Pages serves this build from more than one hostname.`);
  }
}

const llmsIndex = (await requireFile(join(distDir, 'llms.txt'), '/llms.txt')).toString('utf8');
const llmsFull = (await requireFile(join(distDir, 'llms-full.txt'), '/llms-full.txt')).toString('utf8');
for (const url of routes) {
  // The home page renders a component and has no prose to carry into either file.
  if (url === home) continue;
  if (!llmsIndex.includes(`](${url})`)) throw new Error(`llms.txt does not list ${url}`);
  if (!llmsFull.includes(`\nSource: ${url}\n`)) throw new Error(`llms-full.txt does not include ${url}`);
}
const leftoverMarkup = llmsFull.match(/<\/?(?:style|div|Button|Tabs|Tab|HomePage|SubPagesList|Spacer)\b/);
if (leftoverMarkup) {
  throw new Error(`llms-full.txt still carries site markup: ${leftoverMarkup[0]}`);
}
// A site-root link resolves against a page, and this file will be read somewhere that is not one.
const relativeLink = llmsFull.match(/\]\(\/[^)\s]*\)/);
if (relativeLink) {
  throw new Error(`llms-full.txt carries a link only a browser on the site can follow: ${relativeLink[0]}`);
}

const platformHtml = (await requireFile(
  join(distDir, 'guides', 'platform-examples.html'),
  'the platform examples page',
)).toString('utf8');
const tagAttribute = (tag, name) =>
  tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
const tabTags = [...platformHtml.matchAll(/<button\b[^>]*\brole="tab"[^>]*>/g)]
  .map((match) => match[0]);
const panelTags = [...platformHtml.matchAll(/<div\b[^>]*\brole="tabpanel"[^>]*>/g)]
  .map((match) => match[0]);

if (tabTags.length !== 5 || panelTags.length !== 5) {
  throw new Error(`Platform examples must render five tabs and panels in SSR HTML; found ${tabTags.length}/${panelTags.length}.`);
}

const panelsById = new Map(panelTags.map((tag) => [tagAttribute(tag, 'id'), tag]));
for (const tab of tabTags) {
  const id = tagAttribute(tab, 'id');
  const panelId = tagAttribute(tab, 'aria-controls');
  const panel = panelsById.get(panelId);
  if (!id || !panel || tagAttribute(panel, 'aria-labelledby') !== id) {
    throw new Error('A platform tab is missing its reciprocal aria-controls/aria-labelledby relationship.');
  }
}
if (tabTags.filter((tag) => tagAttribute(tag, 'aria-selected') === 'true').length !== 1) {
  throw new Error('Exactly one platform tab must be selected in SSR HTML.');
}
if (tabTags.filter((tag) => tagAttribute(tag, 'tabindex') === '0').length !== 1) {
  throw new Error('Exactly one platform tab must participate in the initial tab order.');
}
if (panelTags.filter((tag) => !tag.includes('style="display:none;"')).length !== 1) {
  throw new Error('Exactly one platform tab panel must be visible in SSR HTML.');
}

console.log(
  `Verified built privacy route, ${schemaNames.length} schemas, platform tab semantics, `
  + `and canonical, llms.txt and llms-full.txt coverage of ${routes.length} pages.`,
);
