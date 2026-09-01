<!-- .vitepress/theme/DeprecationNotice.vue -->
<script setup>
/**
 * The standing notice on every page of the deprecated v2 documentation.
 *
 * Registered once, in the theme's `doc-before` slot, and it decides for itself whether to appear —
 * so it covers all thirty-five pages under `/v2/` without a line being added to any of them, and it
 * cannot be forgotten on a page someone adds later.
 *
 * Above the content rather than floating in a corner. The reader this exists for arrived from a
 * search result or an old link, straight onto a mid-level page they have no reason to doubt: the
 * navbar switch is too quiet to catch them, and a floating badge lives in the corner people learned
 * to ignore when it held cookie banners. Something in the reading path, that has to be passed to
 * reach the first heading, is the only placement that does the job.
 *
 * Not dismissible, deliberately. The whole point is preventing one mistake, and a dismiss button
 * removes the warning on exactly the page where it was working.
 */
import { useData, withBase } from 'vitepress'
import { computed } from 'vue'
import { counterpart, isDeprecated, routeOf } from './versions'

const { page } = useData()

const route = computed(() => routeOf(page.value.relativePath))
const show = computed(() => isDeprecated(route.value))
const current = computed(() => counterpart(route.value, false))

// The link is only worth calling "this page" when it really is this page. Where version 3 has no
// counterpart the fallback is its landing page, and promising the same page there would be a lie a
// reader discovers by clicking.
const mirrored = computed(() => current.value !== '/')
</script>

<template>
  <div v-if="show" class="custom-block warning deprecation-notice">
    <p class="custom-block-title">v2 IS DEPRECATED</p>
    <hr>
    <p>
      This documentation describes <strong>Scrollcase v2</strong>, which is no longer maintained, and version 3
      refuses a version 2 box by name rather than reading it.
      <a :href="withBase(current)">{{
        mirrored ? 'Read this page in the current version' : 'Go to the current documentation'
      }}</a>.
    </p>
  </div>
</template>

<style scoped>
/* `doc-before` renders above the page's own H1, whose theme styling assumes it opens the document
   and so carries no top margin of its own. Without this the notice would sit against the header. */
.deprecation-notice {
  margin-top: 0px;
  margin-bottom: 50px;
}

.custom-block-title {
  font-size: 16px;
}

hr {
  opacity: 0.05;
}
</style>
