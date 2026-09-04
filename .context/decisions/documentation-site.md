# The documentation site: what was decided, and still holds

**Decided across the documentation correction programme of 2026-07-26
([`../history/docs-correction-and-expansion-plan.md`](../history/docs-correction-and-expansion-plan.md))
and extended since.** The site at `scrollcase.dev` is a VitePress build deployed to Cloudflare
Pages, and it is part of the deliverable: a behaviour change not reflected there is unfinished.

**No third-party scripts, and therefore no consent banner.** The site had loaded Google Analytics
unconditionally while telling readers it set essential cookies only. The choice was to make
analytics opt-in and honest, or to remove it; analytics was removed entirely, which is why
`docs/privacy.md` can say what it says. The one exception, added later, is `docs/donate.md`: it
embeds a Ko-fi payment widget in an iframe, which loads only when a reader opens that page. It is
named on the privacy page rather than left for someone to find in the source, and it is the only
place another party's code runs — a second one would put the site back where the banner came from.

**The schemas are published at the URLs they claim.** Every shipped JSON Schema is served under
`/schema/v2/` and `/schema/v3/`, byte for byte matching its absolute `$id` and `$ref`. The
alternative — declaring the schemas package-only — leaves public-looking `$id` URLs that resolve to
nothing, which is worse than not having them.

**Verification satisfies the documented guarantee, rather than the documentation being weakened to
match the code.** Where the site promised a field-for-field check, the check was made
field-for-field. Narrowing a published promise is a product decision, not a documentation edit.

**Builder self-test and consumer verification are distinct, and the site says so.** The self-test is
run with the box's *own* interpreter at build time; a consumer's checks are signature, payload
shape, archive size and hash, safe entry and manifest agreement, before anything is executed.

**Every page is machine-readable.** The build emits `sitemap.xml`, a canonical link, `llms.txt`,
`llms-full.txt` and a Markdown twin of every page at the page's own path with an .md suffix, all
generated from the pages themselves — never hand-written into `docs/public/`, and
`scripts/verify-built-docs.mjs` fails the build when a page is missing from any of them.
`docs/functions/_middleware.js` answers `Accept: text/markdown` with the twin, so its path
derivation and `llms.mjs`'s must agree.

**`/.well-known/api-catalog` lists the JSON Schemas and the CLI reference, and nothing else.**
Scrollcase publishes no HTTP API, and a catalogue is read by software that will never see the page
saying otherwise: an entry must be something the host actually serves.
