/**
 * Where each interactive question is explained in full, and the one place those URLs are written.
 *
 * A prompt has room for a single lead-in line, which is enough to say what a field is and never
 * enough to say why it exists or what the alternatives cost. Rather than grow the prompts —
 * a paragraph in front of every question is skipped as reliably as no help at all — each one points
 * at the section that already answers it. The reader who knows the field ignores the line; the
 * reader who does not gets the page instead of a search.
 *
 * Two rules keep this from becoming a list of dead links, which is worse than no links because a
 * terminal cannot show a 404 the way a browser can:
 *
 * - **One base URL.** `docsUrl()` builds every link here and nothing composes one by hand.
 * - **Every entry is asserted.** `cli-docs.test.mjs` resolves each path against `docs/` and each
 *   fragment against that page's own headings, so a renamed section fails the suite rather than
 *   printing a URL that goes nowhere.
 */

/** The published documentation site. The `docs/` sources in this repository are what it serves. */
export const DOCS_BASE_URL = 'https://scrollcase.dev';

/**
 * A site-relative documentation path as an absolute URL.
 *
 * @param {string} path a route beginning with `/`, optionally with a `#fragment`
 * @returns {string}
 */
export function docsUrl(path) {
  if (!path.startsWith('/')) throw new TypeError(`Documentation path must start with /: ${path}`);
  return `${DOCS_BASE_URL}${path}`;
}

/**
 * The section that explains each question the CLI asks, keyed by the question it belongs to.
 *
 * Only questions with somewhere to send the reader appear. A prompt whose answer is entirely local
 * to the session — a path on this machine, a yes/no about this directory — has no section to name,
 * and inventing one would send a reader to a page that does not discuss their question.
 */
export const DOCS_LINKS = Object.freeze({
  // `new scroll`
  target: '/reference/scroll#target',
  cudaVersion: '/reference/scroll#target',
  boxId: '/reference/scroll#identity',
  sourceRevision: '/reference/scroll#identity',
  publishBaseUrl: '/reference/scroll#publishbaseurl',
  runtime: '/reference/scroll#choosing-a-runtime',
  execution: '/reference/scroll#why-declare-an-execution',
  scriptSource: '/reference/scroll#execution-intent',
  scriptPath: '/reference/scroll#execution-intent',
  binaryPath: '/reference/scroll#execution-intent',
  binarySource: '/reference/scroll#execution-intent',
  environmentPath: '/reference/scroll#execution-intent',
  module: '/reference/scroll#execution-intent',

  // `init`
  example: '/getting-started/quickstart',
  consumerTemplates: '/reference/api/',
  consumerDependencies: '/reference/api/',
  pythonConsumerSource: '/reference/api/',
  toolchain: '/getting-started/installation',

  // `build`
  channel: '/reference/box-format#channel-manifest',
});

/**
 * The link for one question, absolute and ready to print, or null when it has no section.
 *
 * @param {keyof DOCS_LINKS | string} question
 * @returns {string | null}
 */
export function questionDocs(question) {
  const path = DOCS_LINKS[question];
  return path === undefined ? null : docsUrl(path);
}
