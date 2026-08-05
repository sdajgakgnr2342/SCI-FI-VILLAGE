<template>
  <div class="auth-page">
    <form class="panel" @submit.prevent="onSubmit">
      <p class="brand">SCI-FI VILLAGE</p>
      <h2>登录</h2>
      <label>
        用户名
        <input v-model="username" autocomplete="username" required />
      </label>
      <label>
        密码
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="loading">{{ loading ? '进入中…' : '进入村落' }}</button>
      <p class="hint">没有账号？<router-link to="/register">注册</router-link></p>
    </form>
    <div v-if="loading" class="auth-loading">
      <LoadingSpinner text="登录中…" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getLastServerId } from '@/utils/lastServer'
import LoadingSpinner from '@/components/LoadingSpinner.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const landscape = inject<{ ensureFullscreen?: () => Promise<void> } | null>('landscape', null)

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

onMounted(() => {
  void landscape?.ensureFullscreen?.()
})

async function onSubmit() {
  error.value = ''
  loading.value = true
  void landscape?.ensureFullscreen?.()
  try {
    await auth.login(username.value.trim(), password.value)
    if (typeof route.query.redirect === 'string') {
      await router.replace(route.query.redirect)
    } else {
      const last = getLastServerId()
      await router.replace(last ? `/play/${last}` : '/servers')
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
@import '@/styles/auth.css';

.auth-page {
  position: relative;
}

.auth-loading {
  position: absolute;
  inset: 0;
  z-index: 20;
}
</style>
