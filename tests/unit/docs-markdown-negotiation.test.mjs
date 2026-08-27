/**
 * The docs site's Markdown content negotiation.
 *
 * The Function runs on Cloudflare Pages, where this suite cannot reach it, so the parts that
 * decide anything are exercised here against stub asset serving: which requests count as asking
 * for Markdown, which path a page's twin lives at, and what happens when the twin is missing.
 * The path derivation is checked against the built site by `scripts/verify-built-docs.mjs` — the
 * two have to agree, and neither can prove it alone.
 */

import { describe, expect, it } from 'vitest';
import { markdownPathFor, onRequest, prefersMarkdown } from '../../docs/functions/_middleware.js';

const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8';

/** A stubbed Pages context: `next()` serves the HTML page, `env.ASSETS` serves the twin. */
function context(url, { accept, twin, page = '<html>a page</html>' } = {}) {
  const headers = accept ? { Accept: accept } : {};
  return {
    request: new Request(url, { headers }),
    next: async () => new Response(page, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
    env: {
      ASSETS: {
        fetch: async () => (twin === undefined
          ? new Response('Not found', { status: 404 })
          : new Response(twin, { status: 200 })),
      },
    },
  };
}

describe('prefersMarkdown', () => {
  it('accepts only an explicit text/markdown', () => {
    expect(prefersMarkdown('text/markdown')).toBe(true);
    expect(prefersMarkdown('text/markdown, text/html;q=0.9')).toBe(true);
    expect(prefersMarkdown('text/html;q=0.9, text/markdown;q=1.0')).toBe(true);
  });

  it('does not read a browser request as a request for source text', () => {
    expect(prefersMarkdown(BROWSER_ACCEPT)).toBe(false);
    expect(prefersMarkdown('*/*')).toBe(false);
    expect(prefersMarkdown(null)).toBe(false);
  });

  it('honours a refusal expressed as q=0', () => {
    expect(prefersMarkdown('text/html, text/markdown;q=0')).toBe(false);
  });
});

describe('markdownPathFor', () => {
  it('maps a page to its twin', () => {
    expect(markdownPathFor('/')).toBe('/index.md');
    expect(markdownPathFor('/guides/')).toBe('/guides.md');
    expect(markdownPathFor('/guides')).toBe('/guides.md');
    expect(markdownPathFor('/reference/cli')).toBe('/reference/cli.md');
  });

  it('leaves anything that is not a page alone', () => {
    expect(markdownPathFor('/llms.txt')).toBeNull();
    expect(markdownPathFor('/schema/v3/target.schema.json')).toBeNull();
    expect(markdownPathFor('/static/svg/logo-dark.svg')).toBeNull();
    // Asking for the Markdown of a Markdown file is a loop.
    expect(markdownPathFor('/reference/cli.md')).toBeNull();
  });
});

describe('onRequest', () => {
  it('serves the twin to a client that asks for Markdown', async () => {
    const response = await onRequest(context('https://scrollcase.dev/reference/cli', {
      accept: 'text/markdown',
      twin: '# CLI Commands\n',
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(await response.text()).toBe('# CLI Commands\n');
    expect(response.headers.get('Vary')).toBe('Accept');
    expect(response.headers.get('Link')).toBe(
      '<https://scrollcase.dev/reference/cli>; rel="canonical", '
      + '<https://scrollcase.dev/.well-known/api-catalog>; rel="api-catalog"',
    );
    expect(Number(response.headers.get('x-markdown-tokens'))).toBeGreaterThan(0);
  });

  it('serves HTML to a browser, and tells it where the Markdown is', async () => {
    const response = await onRequest(context('https://scrollcase.dev/reference/cli', {
      accept: BROWSER_ACCEPT,
      twin: '# CLI Commands\n',
    }));

    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toBe('<html>a page</html>');
    expect(response.headers.get('Vary')).toBe('Accept');
    expect(response.headers.get('Link')).toBe(
      '<https://scrollcase.dev/reference/cli.md>; rel="alternate"; type="text/markdown", '
      + '<https://scrollcase.dev/.well-known/api-catalog>; rel="api-catalog"',
    );
  });

  it('falls back to HTML when the page has no twin', async () => {
    const response = await onRequest(context('https://scrollcase.dev/reference/cli', {
      accept: 'text/markdown',
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toBe('<html>a page</html>');
  });

  it('declares a directly requested .md file as Markdown', async () => {
    const response = await onRequest(context('https://scrollcase.dev/reference/cli.md', {
      page: '# CLI Commands\n',
    }));

    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(await response.text()).toBe('# CLI Commands\n');
  });

  it('passes an asset request straight through', async () => {
    const response = await onRequest(context('https://scrollcase.dev/static/svg/logo-dark.svg', {
      accept: 'text/markdown',
      page: '<svg />',
    }));

    expect(response.headers.get('Link')).toBeNull();
    expect(await response.text()).toBe('<svg />');
  });
});
