<script setup lang="ts">
withDefaults(
  defineProps<{
    href: string
    external?: boolean
    variant?: 'brand' | 'ghost'
  }>(),
  {
    external: false,
    variant: 'brand',
  },
)
</script>

<template>
  <a
    :href="href"
    class="scrollcase-btn"
    :class="`scrollcase-btn--${variant}`"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
  >
    <slot />

    <svg
      v-if="external"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M14 5h5v5M19 5l-8 8M19 13v6H5V5h6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </a>
</template>