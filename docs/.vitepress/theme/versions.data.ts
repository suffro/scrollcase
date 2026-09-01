import { createContentLoader } from 'vitepress'

// Every route the site builds, section indexes included.
//
// `subpages.data.ts` drops `index.md` on purpose — a section index listing itself is noise — but the
// version switch asks a different question: does the *other* version have this page? Answering it
// from an incomplete list sends a reader from `/reference/` to `/v2/` when `/v2/reference/` was
// right there, which is the exact papercut the switch exists to avoid.
export default createContentLoader('**/*.md', {
  includeSrc: false,
  render: false,
  excerpt: false,
  transform: (raw) => raw.map(({ url }) => url).sort(),
})
