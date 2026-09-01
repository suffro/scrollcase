/**
 * Which documentation set a route belongs to, and where its opposite number is.
 *
 * Four callers need this rule and none of them may disagree: the sitemap and the llms files leave
 * the deprecated set out, the navbar switch offers the other version, the deprecation notice offers
 * the current one, and the generated Markdown twins tell a bot which URL supersedes them. The day
 * two of those computed it separately is the day one starts pointing somewhere the others would not.
 *
 * Plain ESM with no imports so both sides can use it: `llms.mjs` and `config.mts` run in Node at
 * build time, while `theme/versions.ts` is bundled into the browser. Which routes exist is the one
 * thing this module cannot know — the build knows it one way, the client another — so callers pass
 * that in.
 */

export const PREFIX = '/v2';

/** The box format schema version the prefix names. The two move together — a third documentation
 *  set would be `/v3` describing schema version 3 — so they are declared side by side rather than
 *  one being parsed out of the other. */
export const DEPRECATED_SCHEMA_VERSION = 2;

/** True for the deprecated set's landing page and everything under it. */
export const isDeprecated = (route) => route === PREFIX || route.startsWith(`${PREFIX}/`);

/**
 * The other version's copy of `route`, or that version's landing page.
 *
 * `resolve` takes a candidate route and returns it **in the spelling the build serves it at**, or
 * null when nothing was built there. Returning the route rather than a boolean is the whole point:
 * a page and a section index differ only by a trailing slash, and version 3 turned the single
 * `reference/api` page into a `reference/api/` section. With a yes/no answer the two callers
 * disagreed about which spelling counted, so the generated twin advertised `/reference/api` while
 * the navbar switch, unable to find that exact string, silently fell back to the home page.
 *
 * The fallback is what keeps the rest honest: version 3 dropped some of these pages and renamed
 * others, and offering a mirrored route that was never built hands the reader a 404 in place of an
 * answer.
 */
export function counterpart(route, resolve, toDeprecated) {
  const rest = isDeprecated(route) ? route.slice(PREFIX.length) || '/' : route;
  const target = toDeprecated ? `${PREFIX}${rest}` : rest;
  return resolve(target) ?? (toDeprecated ? `${PREFIX}/` : '/');
}
