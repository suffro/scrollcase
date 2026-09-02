/**
 * The client half of the version mapping: the rule comes from `../versions.mjs`, this supplies the
 * one thing that rule cannot know — which routes the build actually produced — from the data
 * loader beside it. The build-time callers in `llms.mjs` answer the same question from the pages
 * VitePress recorded, so both sides decide identically without either owning the definition.
 */

import { counterpart as pick, isDeprecated, PREFIX } from '../versions.mjs'
import { data as allRoutes } from './versions.data.js'

export { isDeprecated, PREFIX }

const known = new Set(allRoutes.map((url: string) => url.replace(/\.html$/, '')))

/** The route a page's source path is served at: `v2/reference/cli.md` → `/v2/reference/cli`. */
export function routeOf(relativePath: string): string {
  return `/${relativePath}`.replace(/index\.md$/, '').replace(/\.md$/, '')
}

/** A route in the spelling the build serves it at, trying both sides of the trailing slash that
 *  separates a page from a section index, or null when nothing was built there. */
function resolve(candidate: string): string | null {
  if (known.has(candidate)) return candidate
  const alternate = candidate.endsWith('/') ? candidate.slice(0, -1) : `${candidate}/`
  return alternate && known.has(alternate) ? alternate : null
}

export const counterpart = (route: string, toDeprecated: boolean): string =>
  pick(route, resolve, toDeprecated)
