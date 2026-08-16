import { defineConfig } from 'vitepress'
import pkg from '../../package.json'
import { writeApiCatalog } from './api-catalog.mjs'
import { markdownFileFor, recordPage, writeLlmsFiles } from './llms.mjs'

const packageVersion = pkg.version

// The production origin. Every absolute URL the build emits — sitemap entries, canonical links,
// the llms.txt index — is prefixed with it, so the site has one name even though Cloudflare Pages
// also serves it from its own *.pages.dev hostname.
const hostname = 'https://scrollcase.dev'

// Shared with the generated Markdown, where it stands in for the home page's own description:
// the landing page's subject is the site, so this is that page's description too.
const description = 'Signed, self-contained Python environment boxes for scientific and AI models'

// Declared here rather than inline in `themeConfig` because llms.txt is generated from it: the
// sidebar is where this site's reading order is decided, and an index that invented its own would
// drift from the navigation the same pages get on screen.
const sidebar = [
  {
    text: 'Getting Started',
    link: '/getting-started',
    collapsed: false,
    items: [
      { text: 'What\'s Scrollcase ', link: '/getting-started/overview' },
      { text: 'Purpose', link: '/getting-started/why-scrollcase' },
      { text: 'Quickstart', link: '/getting-started/quickstart' },
      { text: 'Installation', link: '/getting-started/installation' },
      { text: 'TL;DR', link: '/getting-started/tl-dr' },
      {
        text: 'Demos',
        link: "/demos",
        collapsed: true,
        items: [
          { text: 'Basic demos', items: [
            { text: 'Box run', link: '/demos/box-run-demo' },
            { text: 'Box development', link: '/demos/box-dev-demo' },
          ] },
          { text: 'AI models', items: [
            { text: 'Local LLM', link: '/demos/llm-box-demo' },
            { text: 'Sentiment Analysis', link: '/demos/sentiment-demo' }
          ]},
        ]
      }
    ]
  },
  {
    text: 'Guides',
    link: '/guides',
    collapsed: false,
    items: [
      { text: 'Managing Model Weights', link: '/guides/managing-weights' },
      { text: 'Packaging CUDA Boxes', link: '/guides/packaging-cuda' },
      { text: 'Accelerator Parity', link: '/guides/accelerator-parity' },
      { text: 'Signing & Key Custody', link: '/guides/signing-and-custody' },
      { text: 'Offline / Air-Gapped Installs', link: '/guides/offline-airgap' },
      { text: 'Distributing Boxes', link: '/guides/distributing-boxes' },
      { text: 'Platform Examples', link: '/guides/platform-examples' },
      { text: 'Troubleshooting', link: '/guides/troubleshooting' }
    ]
  },
  {
    text: 'Reference',
    link: '/reference',
    collapsed: false,
    items: [
      { text: 'CLI Commands', link: '/reference/cli' },
      { text: 'Workspace Configuration', link: '/reference/configuration' },
      { text: 'The Scroll (scroll.json)', link: '/reference/scroll' },
      { text: 'The Box Format', link: '/reference/box-format' },
      { text: 'JSON Schemas', link: '/reference/schemas' },
      { text: 'Library APIs', link: '/reference/api' }
    ]
  },
  {
    text: 'Concepts',
    link: '/concepts',
    collapsed: false,
    items: [
      { text: 'Architecture', link: '/concepts/architecture' },
      { text: 'Security & Trust', link: '/concepts/security-and-trust' },
      { text: 'Why Pixi & Conda-Forge', link: '/concepts/why-pixi' },
      { text: 'Design Decisions', link: '/concepts/design-decisions' },
      { text: 'Tool Comparison', link: '/concepts/tool-comparison' }
    ]
  },
  {
    // One page, deliberately: the white paper is meant to be downloaded and studied as a
    // single artefact, so it is a top-level entry rather than a section of its own.
    text: 'White Paper',
    collapsed: false,
    link: '/white-paper'
  },
]

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Scrollcase",
  description,
  base: '/',

  markdown: {
    // Render mathematical notation in Markdown pages.
    math: true
  },

  // Generate links without the .html suffix (Cloudflare Pages serves clean URLs).
  cleanUrls: true,

  // Generate sitemap.xml at build time so search engines can crawl every page.
  // `hostname` must be the production domain — it prefixes every URL entry.
  sitemap: {
    hostname,
  },

  // Two build-time jobs, both about being read correctly rather than being read at all.
  //
  // The canonical link is the one the site cannot do without: Cloudflare Pages serves this exact
  // build from its own *.pages.dev hostname as well, and two hostnames carrying identical pages is
  // duplicate content unless each page names which URL it really lives at. A static file in
  // `public/` cannot state that, because it would have to say something different per host.
  //
  // The page record feeds llms.txt; see ./llms.mjs.
  transformPageData(pageData) {
    const route = recordPage(pageData)
    const head: [string, Record<string, string>][] = (pageData.frontmatter.head ??= [])
    if (!head.some((tag) => tag[0] === 'link' && tag[1]?.rel === 'canonical')) {
      head.push(['link', { rel: 'canonical', href: `${hostname}${route}` }])
      // The Markdown twin of this page, discoverable without asking for it. The Function in
      // `functions/` serves the same file to anything sending `Accept: text/markdown`.
      head.push(['link', {
        rel: 'alternate',
        type: 'text/markdown',
        href: `${hostname}/${markdownFileFor(route)}`,
      }])
    }
  },

  async buildEnd(siteConfig) {
    const written = await writeLlmsFiles({
      outDir: siteConfig.outDir,
      srcDir: siteConfig.srcDir,
      hostname,
      version: `v${packageVersion}`,
      sidebar,
      siteDescription: description,
    })
    const entries = await writeApiCatalog({ outDir: siteConfig.outDir, hostname })
    console.log(
      `generated ${entries}-entry api-catalog, llms.txt (${written.pages - 1} pages, ${Math.round(written.indexBytes / 1024)} kB), `
      + `llms-full.txt (${Math.round(written.fullBytes / 1024)} kB) `
      + `and ${written.twins} Markdown page twins`,
    )
  },

  head: [
    // The tab icon is the bare mark, following the browser's colour scheme. icon.ico comes first
    // as the universal fallback — it carries its own gold plate, so it stays legible on any tab
    // in browsers that ignore `media` on icon links.
    ['link', { rel: 'icon', href: '/static/icon.ico', sizes: '256x256' }],
    // ['link', { rel: 'icon', type: 'image/svg+xml', href: '/static/svg/logo-dark.svg', media: '(prefers-color-scheme: light)' }],
    // ['link', { rel: 'icon', type: 'image/svg+xml', href: '/static/svg/logo-light.svg', media: '(prefers-color-scheme: dark)' }]

    // No third-party scripts. The site set analytics and sharing cookies while telling readers it
    // used only essential ones, and loaded them before the notice could be read. Measurement, if
    // wanted, belongs at the edge where it needs no cookie and no consent dialogue.
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    // In the site itself the mark is used bare, without the plate: the dark mark on a light
    // background and the light mark on a dark one.
    logo: {
      light: '/static/svg/logo-dark.svg',
      dark: '/static/svg/logo-light.svg',
      alt: 'Scrollcase Logo',
    },

    siteTitle: 'Scrollcase',
    search: { provider: 'local' },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Quickstart', link: '/getting-started/quickstart' },
      { text: 'Resources', activeMatch: " ", items: [
        { text: 'Overview', link: '/getting-started/overview' },
        { text: 'Architecture', link: '/concepts/architecture' },
        { text: 'Concepts', link: '/concepts/' },
        { text: 'Guides', link: '/guides/' },
        { text: 'Reference', link: '/reference/' },
        { text: 'Security & trust', link: '/concepts/security-and-trust' },
        { text: 'Other tools', link: '/concepts/tool-comparison' },
        { text: 'Quick Demo', link: '/demos/box-run-demo' },
        { text: 'White paper', link: '/white-paper' },
      ]
    },
    ],

    sidebar,

    socialLinks: [
      { icon: 'github', link: 'https://github.com/suffro/scrollcase' }
    ],

    outline: {
      level: [2, 2]
    },

    footer: {
      message: `Scrollcase v${packageVersion} · schema version 2 · <a href="/privacy" target="_blank">Privacy</a> · <a href="https://github.com/suffro/scrollcase/blob/main/CHANGELOG.md" target="_blank">Changelog</a>`,
      copyright: 'Licensed under Apache-2.0'
    }
  }
})
