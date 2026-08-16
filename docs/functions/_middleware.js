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

  // A directly requested .md file is served as an asset; all that is missing is the promise that
  // it is Markdown, which depends on a mime table this code should not have to trust.
  if (url.pathname.endsWith('.md')) {
    const asset = await next();
    if (!asset.ok) return asset;
    const response = new Response(asset.body, asset);
    response.headers.set('Content-Type', MARKDOWN_TYPE);
    return response;
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
    return response;
  }

  const markdown = await env.ASSETS.fetch(markdownUrl);
  if (!markdown.ok) return next();

  const body = await markdown.text();
  return new Response(body, {
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
  });
}
