<template>
  <svg
    class="game-icon"
    :class="[`icon-${name}`]"
    :viewBox="meta.viewBox"
    :width="size"
    :height="size"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(d, i) in meta.paths" :key="i" :d="d" fill="currentColor" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ICON_META, type IconName } from '@/components/iconData'

const props = withDefaults(
  defineProps<{
    name: IconName
    size?: number | string
  }>(),
  { size: 22 }
)

const meta = computed(() => ICON_META[props.name])
</script>

<style scoped>
.game-icon {
  display: block;
  flex-shrink: 0;
  color: inherit;
  fill: currentColor;
  pointer-events: none;
}
</style>
