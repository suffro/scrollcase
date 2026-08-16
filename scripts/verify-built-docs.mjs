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
  // The share preview is generated per page from the same route, so a generator that loses a page
  // does not fail loudly — it points every share at whatever URL it fell back to.
  const shared = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  if (shared !== url) {
    throw new Error(`${url} declares og:url ${shared ?? 'nothing'}; a share of this page would preview as another one.`);
  }
  // An empty description is the failure this catches: the tag is present, the build says nothing,
  // and the preview renders a title over blank space. VitePress gives a page with no description
  // of its own an empty string rather than nothing at all, so absence is not the only way to fail.
  const blurb = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1];
  if (!blurb) {
    throw new Error(`${url} declares no og:description; its share preview would be a title over blank space.`);
  }
}

// Every page also ships as Markdown, which is what `docs/functions/_middleware.js` answers with
// when a client sends `Accept: text/markdown`. The middleware derives the twin's path from the
// request; this checks the build put it where that derivation looks — a page whose twin is missing
// silently falls back to HTML, which is the one failure nobody would notice.
const { markdownPathFor } = await import(new URL('../docs/functions/_middleware.js', import.meta.url));
for (const url of routes) {
  const path = new URL(url).pathname;
  const twin = markdownPathFor(path);
  if (!twin) throw new Error(`${url} has no Markdown path; the middleware would not serve one.`);
  const markdown = (await requireFile(join(distDir, twin), `the Markdown twin of ${url}`)).toString('utf8');
  if (!markdown.startsWith('---\ntitle:')) {
    throw new Error(`${twin} is missing its frontmatter.`);
  }
  if (!markdown.includes(`\nsource: ${url}\n`)) {
    throw new Error(`${twin} does not name ${url} as its source.`);
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

// The RFC 9727 catalogue is a promise about what this host serves, made to software that will not
// read the page saying otherwise. So every href in it has to resolve to something the build
// emitted, and every schema the build emitted has to be in it — a catalogue that lists eight
// schemas while the contract ships nine is worse than no catalogue.
const catalogue = JSON.parse(
  (await requireFile(join(distDir, '.well-known', 'api-catalog'), '/.well-known/api-catalog'))
    .toString('utf8'),
);
if (!Array.isArray(catalogue.linkset) || catalogue.linkset.length === 0) {
  throw new Error('The API catalogue has no linkset.');
}
const catalogued = catalogue.linkset.flatMap((entry) => [
  ...(entry['service-desc'] ?? []),
  ...(entry['service-doc'] ?? []),
]);
for (const target of catalogued) {
  const path = new URL(target.href).pathname;
  // A clean URL is a page; a last segment carrying an extension is the file it names.
  const file = path.endsWith('/')
    ? `${path}index.html`
    : (path.split('/').pop().includes('.') ? path : `${path}.html`);
  await requireFile(join(distDir, file), `the API catalogue target ${target.href}`);
}
const cataloguedSchemas = catalogued
  .filter((target) => target.href.endsWith('.schema.json'))
  .map((target) => target.href.split('/').pop())
  .sort();
if (JSON.stringify(cataloguedSchemas) !== JSON.stringify(schemaNames)) {
  throw new Error('The API catalogue and the shipped contract disagree about which schemas exist.');
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
  + `the API catalogue, and canonical, Markdown twin, llms.txt and llms-full.txt coverage `
  + `of ${routes.length} pages.`,
);
