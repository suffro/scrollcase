/**
 * Content negotiation: serve Markdown to clients that ask for it, HTML to everyone else.
 *
 * An agent reading this site through a browser page pays for a layout it cannot use — navigation,
 * theme switcher, search widget, syntax-highlighting spans — to reach prose that was Markdown
 * before the build touched it. `Accept: text/markdown` gets that prose back.
 *
 * What it returns is the *source*, not a conversion. Cloudflare can convert a page's HTML to
 * Markdown at the edge with no code at all (Markdown for Agents, a zone setting), and that
 * remains available; this middleware exists because the build already has the better answer —
 * the Markdown the page was written in, with the components resolved into the links and headings
 * they render as. A round trip through HTML can only lose to that.
 *
 * The twin files come from `.vitepress/llms.mjs` at build time, one per page, at the page's own
 * path with `.md` appended: `/reference/cli` → `/reference/cli.md`, `/guides/` → `/guides.md`.
 * They are ordinary assets, so an agent that would rather not negotiate can just request them,
 * and every HTML page advertises its own with a `Link: … rel="alternate"` header and a matching
 * `<link>` in the document head.
 *
 * Anything without a twin falls through to HTML. A page that exists in one representation and 404s
 * in the other would be worse than never having offered the choice.
 */

const MARKDOWN_TYPE = 'text/markdown; charset=utf-8';

/** RFC 9727's fixed path, advertised on every page it serves so the catalogue is discoverable
 *  without a client guessing that it exists. Spelled out rather than imported from
 *  `.vitepress/api-catalog.mjs`, which is Node code the Worker bundle has no business carrying. */
const CATALOG_PATH = '/.well-known/api-catalog';

/** The deprecated documentation's prefix, spelled out for the same reason as the path above rather
 *  than imported from `.vitepress/versions.mjs`. `docs-markdown-negotiation.test.mjs` asserts the
 *  two agree, so the copy cannot drift without a test saying so. */
const DEPRECATED_PREFIX = '/v2';

/**
 * The date version 2 stopped being current, as a Unix timestamp, or null while there is not one.
 *
 * RFC 9745's `Deprecation` field is a Date and nothing else will do, so this stays null until the
 * release that makes version 3 current actually ships and the date is a fact rather than a guess.
 * A header stating a deprecation date that never happened is worse than no header: it is a claim
 * about this project made to software that cannot check it.
 *
 * The signal that needs no date ships regardless — see `rel="deprecation"` below.
 */
const DEPRECATED_SINCE = null;

/**
 * What every response under the deprecated prefix carries, page and Markdown twin alike.
 *
 * `noindex` because the version switch links these pages from every current one, so a crawler
 * finds the whole archive whether or not the sitemap offers it, and two documentation sets
 * describing incompatible formats then compete for the same queries — with the obsolete one often
 * winning on age. `follow` because the links inside are worth following, not least the one out.
 *
 * `rel="deprecation"` is RFC 9745's own relation and points at the page explaining the deprecation.
 * It is deliberately not `successor-version`: that names the resource replacing *this* one, and
 * which page that is differs per URL — version 3 dropped some of these and renamed others. The
 * answer is already per page, in the twin's `current:` field and in the page's own banner, and a
 * header that guessed would be pointing readers at pages that do not exist.
 *
 * No `Sunset` (RFC 8594). That field promises when a resource will stop being served, and these
 * are meant to stay readable for as long as there are version 2 boxes in the field.
 */
function deprecationHeaders(pathname, origin) {
  if (pathname !== DEPRECATED_PREFIX && !pathname.startsWith(`${DEPRECATED_PREFIX}/`)) return [];
  return [
    ['X-Robots-Tag', 'noindex, follow'],
    ['Link', `<${origin}${DEPRECATED_PREFIX}/>; rel="deprecation"`],
    ...(DEPRECATED_SINCE ? [['Deprecation', `@${DEPRECATED_SINCE}`]] : []),
  ];
}

/**
 * True when the client explicitly asked for Markdown.
 *
 * Explicitly is the whole test: every browser puts a catch-all entry in its Accept header, and
 * reading that as a request for Markdown would serve source text to people looking at a website.
 * Only a literal `text/markdown` counts, and `;q=0` still means no.
 */
export function prefersMarkdown(accept) {
  if (!accept) return false;
  return accept.split(',').some((entry) => {
    const [type, ...parameters] = entry.split(';').map((part) => part.trim().toLowerCase());
    if (type !== 'text/markdown') return false;
    const quality = parameters.find((parameter) => parameter.startsWith('q='));
    return !quality || Number(quality.slice(2)) > 0;
  });
}

/**
 * The Markdown twin of a page path, or null when the path is not a page.
 *
 * A last segment with a dot in it is an asset — the schemas, the logos, llms.txt, or a `.md` file
 * someone requested directly — and asking for the Markdown of a Markdown file is a loop.
 */
export function markdownPathFor(pathname) {
  if (pathname === '/') return '/index.md';
  const path = pathname.replace(/\/$/, '');
  if (path.split('/').pop().includes('.')) return null;
  return `${path}.md`;
}

/** The conventional four-characters-per-token estimate, which is what this header carries
 *  everywhere it appears. It is an estimate, not a tokeniser's count. */
const estimateTokens = (text) => Math.ceil(text.length / 4);

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Applied to whichever response is returned below. Both representations of a deprecated page get
  // it — the twin is an indexable file in its own right, and it is the one a bot reads.
  const deprecation = deprecationHeaders(url.pathname, url.origin);
  const marked = (response) => {
    for (const [name, value] of deprecation) response.headers.append(name, value);
    return response;
  };

  // A directly requested .md file is served as an asset; all that is missing is the promise that
  // it is Markdown, which depends on a mime table this code should not have to trust.
  if (url.pathname.endsWith('.md')) {
    const asset = await next();
    if (!asset.ok) return asset;
    const response = new Response(asset.body, asset);
    response.headers.set('Content-Type', MARKDOWN_TYPE);
    return marked(response);
  }

  const markdownPath = markdownPathFor(url.pathname);
  if (!markdownPath) return next();

  const markdownUrl = new URL(markdownPath, url.origin).toString();

  if (!prefersMarkdown(request.headers.get('Accept'))) {
    const page = await next();
    // Discovery, for an agent that did not know to ask. `Vary` goes on both representations, or a
    // cache that stored one of them would answer for the other.
    const response = new Response(page.body, page);
    response.headers.append('Vary', 'Accept');
    response.headers.append('Link', `<${markdownUrl}>; rel="alternate"; type="text/markdown"`);
    response.headers.append('Link', `<${url.origin}${CATALOG_PATH}>; rel="api-catalog"`);
    return marked(response);
  }

  const markdown = await env.ASSETS.fetch(markdownUrl);
  if (!markdown.ok) return next();

  const body = await markdown.text();
  return marked(new Response(body, {
    status: 200,
    headers: {
      'Content-Type': MARKDOWN_TYPE,
      // The HTML page stays the canonical URL: this is the same document in another dress, not a
      // second page for a search engine to index separately.
      Link: `<${url.origin}${url.pathname}>; rel="canonical", `
        + `<${url.origin}${CATALOG_PATH}>; rel="api-catalog"`,
      Vary: 'Accept',
      'x-markdown-tokens': String(estimateTokens(body)),
      'Cache-Control': 'public, max-age=3600',
    },
  }));
}
