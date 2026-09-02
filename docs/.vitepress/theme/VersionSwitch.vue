<!-- .vitepress/theme/VersionSwitch.vue -->
<script setup>
// The navbar control that moves a reader between the current documentation and the deprecated v2
// set under /v2/. Both live in one build, so which version you are reading is a property of the
// route rather than of the deployment — which is why this is a component and not a static nav
// entry: a fixed label would be wrong on half the pages.
//
// It keeps your place where it can: jumping from `/v2/reference/cli` to a landing page loses the
// reason you switched, so `counterpart` offers the mirrored route whenever the other version has
// it. That mapping lives in `versions.ts`, shared with the deprecation notice.
import { useData, useRouter, withBase } from 'vitepress'
import { computed } from 'vue'
import { counterpart, isDeprecated, routeOf } from './versions'

const { page } = useData()
const router = useRouter()

const route = computed(() => routeOf(page.value.relativePath))
const onDeprecated = computed(() => isDeprecated(route.value))

const versions = computed(() => [
  {
    id: 'v3',
    label: 'v3',
    title: 'Current documentation',
    href: counterpart(route.value, false),
    active: !onDeprecated.value,
  },
  {
    id: 'v2',
    label: 'v2',
    title: 'Deprecated documentation',
    href: counterpart(route.value, true),
    active: onDeprecated.value,
  },
])

function go(event, href) {
  // Let a modified click open a tab, as it would on any other link.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  router.go(withBase(href))
}
</script>

<template>
  <div class="version-switch" role="group" aria-label="Documentation version">
    <a
      v-for="version in versions"
      :key="version.id"
      class="version-switch-option"
      :class="{ 'is-active': version.active, 'is-deprecated': version.id === 'v2' }"
      :href="withBase(version.href)"
      :title="version.title"
      :aria-current="version.active ? 'page' : undefined"
      @click="go($event, version.href)"
    >{{ version.label }}</a>
  </div>
</template>

<style scoped>
.version-switch {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  margin-left: 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background-color: var(--vp-c-bg-alt);
  line-height: 1;
}

.version-switch-option {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  text-decoration: none !important;
  transition: color 0.25s, background-color 0.25s;
}

.version-switch-option:hover {
  color: var(--vp-c-text-1);
}

.version-switch-option.is-active {
  color: var(--vp-c-brand-1);
  background-color: var(--vp-c-bg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}

/* The deprecated side stays legible but never looks like the recommended choice, including when it
   is the one you are on: a reader who arrived at v2 from a search result should be able to tell. */
.version-switch-option.is-deprecated.is-active {
  color: var(--vp-c-warning-1, var(--vp-c-text-1));
}
</style>
