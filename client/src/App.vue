<template>
  <div ref="shell" class="app-shell">
    <router-view />
    <div v-if="routeLoading" class="global-loading">
      <LoadingSpinner :text="routeLoadingText" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { provide, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useForceLandscape } from '@/composables/useForceLandscape'
import LoadingSpinner from '@/components/LoadingSpinner.vue'

const shell = ref<HTMLElement | null>(null)
const landscape = useForceLandscape(shell)
provide('landscape', landscape)

const router = useRouter()
const routeLoading = ref(false)
const routeLoadingText = ref('加载中…')
let navToken = 0

router.beforeEach((to, from) => {
  if (to.fullPath === from.fullPath) return true
  navToken += 1
  routeLoading.value = true
  if (to.name === 'play') routeLoadingText.value = '进入服务器…'
  else if (from.name === 'play') routeLoadingText.value = '正在离开…'
  else if (to.name === 'servers') routeLoadingText.value = '加载服务器…'
  else if (to.name === 'login' || to.name === 'register') routeLoadingText.value = '请稍候…'
  else routeLoadingText.value = '加载中…'
  return true
})

router.afterEach(() => {
  const token = navToken
  window.setTimeout(() => {
    if (token === navToken) routeLoading.value = false
  }, 180)
  // 每个页面都尽量进全屏 / 锁横屏
  void landscape.ensureFullscreen()
})

router.onError(() => {
  routeLoading.value = false
})
</script>

<style scoped>
.app-shell {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-deep);
}

.global-loading {
  position: absolute;
  inset: 0;
  z-index: 9999;
}
</style>
