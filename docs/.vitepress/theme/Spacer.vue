<script setup lang="ts">
withDefaults(
  defineProps<{
    height?: number,
    divider?: boolean
  }>(),
  {
    height: 10,
    divider: false,
  },
)

</script>

<template>
  <div class="spacer-container">
    <div
      class="spacer"
      :style="`height: ${(height)/2}px;`"
    >
    </div>
    <div
      class="divider"
      :style="`${divider?'display: block;':'display: none;'}`"
    >
    </div>
    <div
      class="spacer"
      :style="`height: ${(height)/2}px;`"
    >
    </div>
  </div>
</template>

<style>

.spacer-container {
  pointer-events: none !important;
  display: block !important;
  width: 100% !important;
}

.spacer {
  opacity: 0 !important;
  pointer-events: none !important;
  display: block !important;
  width: 100% !important;
}

.divider {
  pointer-events: none !important;
  width: 100% !important;
  height: 1px !important;
  background-color: var(--vp-c-divider) !important;
}

</style>