<template>
  <div class="auth-page">
    <form class="panel" @submit.prevent="onSubmit">
      <p class="brand">SCI-FI VILLAGE</p>
      <h2>注册</h2>
      <label>
        用户名
        <input v-model="username" autocomplete="username" required minlength="3" maxlength="32" />
      </label>
      <label>
        显示名（可选）
        <input v-model="displayName" maxlength="64" />
      </label>
      <label>
        密码
        <input v-model="password" type="password" autocomplete="new-password" required minlength="6" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="loading">{{ loading ? '创建中…' : '创建账号' }}</button>
      <p class="hint">已有账号？<router-link to="/login">登录</router-link></p>
    </form>
    <div v-if="loading" class="auth-loading">
      <LoadingSpinner text="注册中…" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoadingSpinner from '@/components/LoadingSpinner.vue'

const auth = useAuthStore()
const router = useRouter()
const landscape = inject<{ ensureFullscreen?: () => Promise<void> } | null>('landscape', null)

const username = ref('')
const displayName = ref('')
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
    await auth.register({
      username: username.value.trim(),
      password: password.value,
      displayName: displayName.value.trim() || undefined,
    })
    await router.replace('/servers')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '注册失败'
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
