<!-- .vitepress/theme/PageActions.vue -->
<script setup>
/**
 * The row above every page's H1 that hands the page to a language model.
 *
 * Two things a reader cannot do on their own. Copying what they see gives them the rendered page —
 * the navigation, the copy buttons inside the code blocks, the Mermaid diagrams already turned into
 * SVG, and of a `Tabs` component only the tab that happens to be open. The Markdown twin this site
 * already generates is the same page without any of that, and this is the control that reaches it.
 *
 * Two menus rather than one, and neither trigger does anything but open its own: what the reader
 * wants is either the file or a model, and asking that question first makes each menu short enough
 * to read at a glance. It also means no click acts before the reader has said which of the two they
 * meant — a split button whose primary half copies is a button half the people who press it were
 * not aiming for.
 *
 * The four services are a convenience over one action, not the action itself. `Copy` carries the
 * content and depends on nobody: it is what serves a local model, a chat with egress blocked, a
 * paste into an editor, and every service not listed here. The links depend on the model fetching
 * a URL, which is usually fine and occasionally fails by inventing an answer instead of admitting
 * it read nothing — so `Copy` leads its menu, and the shortcuts are the other menu.
 *
 * `Copy prompt` is the last of the service entries rather than a third Markdown one. It does what
 * the four links do, for the fifth model, and that is the only reason it exists: without it the
 * menu is a closed list of four vendors, which is not what this project wants to be.
 *
 * Registered once in the theme's `doc-before` slot, so it covers every page without a line in any
 * of them. The home page renders VitePress's home layout, which has no such slot — hence no guard
 * here for a case that cannot arise.
 */
import { useData } from 'vitepress'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const { page } = useData()

/**
 * The instruction that travels with the URL. A model handed a bare link has to guess why it was
 * given one; a model handed this does not. It stays a single sentence and names the project,
 * because the reader's own question comes after it — this is the carrier, not the question.
 */
const PROMPT = 'Read this Scrollcase documentation page and help me with it: '

/**
 * Where each service takes a pre-filled prompt.
 *
 * Every one of these is an undocumented, unversioned URL parameter belonging to somebody else, and
 * **nothing in this repository can test them**: the suite never reaches the network, so a service
 * that changes its parameter breaks this menu silently and stays broken until a person clicks it.
 * That is the whole reason the list is four long rather than ten — four can be re-checked by hand.
 *
 * Google is absent for the same reason rather than a different one: Gemini has no stable way to
 * arrive with a prompt already in the box, and a button that opens an empty chat is worse than no
 * button. `Copy prompt` covers it, and covers whatever comes next.
 *
 * Hand-check log — record the date every time these are verified in a browser:
 *   pending first verification
 */
const SERVICES = [
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/new?q=' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/?q=' },
  { id: 'mistral', label: 'Mistral', url: 'https://chat.mistral.ai/chat?q=' },
  { id: 'perplexity', label: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
]

/** The twin's absolute URL, on the production origin: what a model has to be given. */
const twin = ref('')
/** The same file as a same-origin path: what this browser is allowed to fetch. */
const local = ref('')

/** Which menu is open, if either. One at a time: two open menus overlap and neither is readable. */
const open = ref('')
const root = ref(null)

/** Transient confirmation, shown on the trigger that was used — `{ on, text }` or null. */
const flash = ref(null)
let flashTimer

/**
 * The twin's address is read from the `<link rel="alternate" type="text/markdown">` that
 * `config.mts` already puts in every page's head, rather than derived here.
 *
 * Deriving it would be three lines, and would make this the fourth place that turns a route into a
 * twin path — after `llms.mjs`, `functions/_middleware.js` and `config.mts` itself. Those three
 * have to agree with each other already; a fourth that only disagrees in the browser is the kind
 * that goes unnoticed longest.
 */
function readTwin() {
  const link = document.querySelector('link[rel="alternate"][type="text/markdown"]')
  twin.value = link?.href ?? ''
  // Absolute for the services — a model cannot fetch someone's localhost — but same-origin for our
  // own fetch and for `View`, which otherwise leave the site for the production copy of the page
  // being read: the head link names scrollcase.dev, and fetching it from anywhere else is refused
  // as cross-origin anyway.
  //
  // Which makes `vitepress dev` the wrong place to judge any of this, in a way that looks like it
  // worked. The twins are written at build time, so in dev there is none — and Vite serves the
  // page's *source* Markdown from `docs/` at that same path instead. Same URL, different file: no
  // `source:` field, and links still root-relative because the pass that absolutises them has not
  // run. Test with `npm run build && npm run preview`.
  local.value = twin.value ? new URL(twin.value).pathname : ''
}

// `flush: 'post'` because the head is updated from the same page data this watches: reading the
// link before the update has landed would copy the previous page on every client-side navigation.
onMounted(() => {
  readTwin()
  watch(() => page.value.relativePath, () => {
    open.value = ''
    readTwin()
  }, { flush: 'post' })
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  clearTimeout(flashTimer)
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

function onDocumentClick(event) {
  if (!root.value?.contains(event.target)) open.value = ''
}

function onKeydown(event) {
  if (event.key === 'Escape') open.value = ''
}

function toggle(menu) {
  open.value = open.value === menu ? '' : menu
}

function say(on, text) {
  flash.value = { on, text }
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flash.value = null), 2000)
}

const labelOf = (menu, label) => (flash.value?.on === menu ? flash.value.text : label)

async function toClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Absent over plain HTTP, and refusable by the browser at any time.
    return false
  }
}

/** Copy the twin itself. On any failure, fall back to the menu's other entry: showing the file is a
 *  worse outcome than copying it and a much better one than a button that does nothing. */
async function copyPage() {
  open.value = ''
  try {
    const response = await fetch(local.value)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (await toClipboard(await response.text())) return say('markdown', 'Copied')
  } catch {
    /* falls through to the same place a clipboard refusal does */
  }
  window.open(local.value, '_blank', 'noopener')
}

async function copyPrompt() {
  open.value = ''
  say('services', await toClipboard(PROMPT + twin.value) ? 'Copied' : 'Copy failed')
}

const services = computed(() => {
  const query = encodeURIComponent(PROMPT + twin.value)
  return SERVICES.map((service) => ({ ...service, href: `${service.url}${query}` }))
})
</script>

<template>
  <div class="page-actions">
    <div v-if="twin" ref="root" class="page-actions-controls">
      <div class="page-actions-control">
        <button
          type="button"
          class="page-actions-trigger"
          title="This page as Markdown"
          aria-haspopup="true"
          :aria-expanded="open === 'markdown'"
          @click="toggle('markdown')"
        >
          <span>{{ labelOf('markdown', 'Markdown') }}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 3.5 5 7.5 9 3.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
        <div v-if="open === 'markdown'" class="page-actions-menu" aria-label="This page as Markdown">
          <button type="button" class="page-actions-item" @click="copyPage">Copy</button>
          <a class="page-actions-item" :href="local" target="_blank" rel="noopener">View</a>
        </div>
      </div>

      <div class="page-actions-control">
        <button
          type="button"
          class="page-actions-trigger"
          title="Ask a language model about this page"
          aria-haspopup="true"
          :aria-expanded="open === 'services'"
          @click="toggle('services')"
        >
          <span>{{ labelOf('services', 'Ask an AI') }}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 3.5 5 7.5 9 3.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
        <div v-if="open === 'services'" class="page-actions-menu" aria-label="Ask a language model about this page">
          <a
            v-for="service in services"
            :key="service.id"
            class="page-actions-item"
            :href="service.href"
            target="_blank"
            rel="noopener"
          >{{ service.label }}</a>
          <!-- Below the rule because it is a different kind of thing: not a fifth service, but the
               way to use a service that is not on the list. -->
          <button type="button" class="page-actions-item is-separated" @click="copyPrompt">Copy prompt</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The outer row keeps its height whether or not the controls are inside it. The twin's address is
   only readable once the page is in a browser, so they appear at hydration — and without a
   reserved row they would appear by pushing the H1 down under the reader. */
.page-actions {
  display: flex;
  justify-content: flex-end;
  min-height: 32px;
  margin-bottom: 12px;
}

.page-actions-controls {
  display: flex;
  gap: 8px;
}

.page-actions-control {
  position: relative;
}

/* Wide enough for the confirmation that replaces the label, so a button does not resize under the
   pointer at the moment it is pressed. */
.page-actions-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 104px;
  padding: 7px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background-color: var(--vp-c-bg-alt);
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  transition: color 0.25s, background-color 0.25s;
}

.page-actions-trigger span {
  flex: 1;
  text-align: left;
}

.page-actions-trigger:hover,
.page-actions-trigger[aria-expanded='true'] {
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg);
}

.page-actions-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 10;
  min-width: 100%;
  padding: 6px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background-color: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-3);
}

.page-actions-item {
  display: block;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  text-decoration: none !important;
  white-space: nowrap;
  transition: color 0.25s, background-color 0.25s;
}

.page-actions-item:hover {
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg-soft);
}

.page-actions-item.is-separated {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--vp-c-divider);
  border-radius: 6px;
}
</style>
