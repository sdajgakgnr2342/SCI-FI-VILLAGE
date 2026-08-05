<template>
  <div class="loading-overlay" :class="{ dim: dimmed }" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true" />
    <p v-if="text" class="loading-text">{{ text }}</p>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    text?: string
    /** 半透明遮罩，默认 true */
    dimmed?: boolean
  }>(),
  {
    text: '加载中…',
    dimmed: true,
  }
)
</script>

<style scoped>
.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  pointer-events: auto;
}

.loading-overlay.dim {
  background: rgba(7, 16, 21, 0.72);
}

.spinner {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.18);
  border-top-color: #7ee7dc;
  animation: sv-spin 0.75s linear infinite;
}

.loading-text {
  margin: 0;
  color: rgba(245, 248, 247, 0.9);
  font-size: 0.88rem;
  letter-spacing: 0.06em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

@keyframes sv-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
