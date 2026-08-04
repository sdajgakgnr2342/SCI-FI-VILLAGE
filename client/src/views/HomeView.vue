<template>
  <div class="home">
    <div class="veil" />
    <div class="content">
      <p class="brand">SCI-FI VILLAGE</p>
      <h1>在科幻废土上，重建你的方块村落</h1>
      <p class="lead">体素沙盒框架已就绪 — 挖、建、存档、多人同步的骨架都在。</p>
      <div class="actions">
        <router-link v-if="auth.isLoggedIn" class="cta" to="/worlds">进入世界</router-link>
        <router-link v-else class="cta" to="/login">开始航行</router-link>
        <router-link class="ghost" to="/register">注册账号</router-link>
      </div>
      <p class="status" v-if="healthText">{{ healthText }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { health } from '@/api/auth'

const auth = useAuthStore()
const healthText = ref('')

onMounted(async () => {
  await auth.loadMe()
  try {
    const h = await health()
    healthText.value = `服务状态 · MySQL ${h.mysql ? 'OK' : 'DOWN'} · Redis ${h.redis ? 'OK' : 'MEM'}`
  } catch {
    healthText.value = '后端未连接 — 请先启动 server'
  }
})
</script>

<style scoped>
.home {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(ellipse 80% 60% at 70% 20%, rgba(61, 214, 198, 0.18), transparent 55%),
    radial-gradient(ellipse 60% 50% at 20% 80%, rgba(126, 231, 135, 0.12), transparent 50%),
    linear-gradient(160deg, #061018 0%, #0c2430 45%, #071015 100%);
  overflow: hidden;
}

.home::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(61, 214, 198, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(61, 214, 198, 0.05) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(circle at 50% 40%, #000 20%, transparent 75%);
  animation: drift 18s linear infinite;
}

@keyframes drift {
  from { transform: translateY(0); }
  to { transform: translateY(48px); }
}

.veil {
  position: absolute;
  inset: auto 0 0;
  height: 35%;
  background: linear-gradient(transparent, rgba(7, 16, 21, 0.95));
  pointer-events: none;
}

.content {
  position: relative;
  z-index: 1;
  text-align: center;
  max-width: 720px;
  padding: 2rem;
  animation: rise 0.9s ease both;
}

@keyframes rise {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}

.brand {
  font-family: var(--font-display);
  letter-spacing: 0.35em;
  font-size: 0.85rem;
  color: var(--accent);
  margin-bottom: 1.25rem;
  animation: pulse 3.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.75; }
  50% { opacity: 1; text-shadow: 0 0 18px rgba(61, 214, 198, 0.45); }
}

h1 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: clamp(1.6rem, 4vw, 2.6rem);
  line-height: 1.25;
  margin-bottom: 1rem;
}

.lead {
  color: var(--muted);
  font-size: 1.05rem;
  margin-bottom: 2rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}

.cta,
.ghost {
  display: inline-flex;
  align-items: center;
  padding: 0.7rem 1.25rem;
  border-radius: 4px;
  border: 1px solid var(--line);
}

.cta {
  background: linear-gradient(180deg, rgba(61, 214, 198, 0.35), rgba(61, 214, 198, 0.12));
  color: var(--text);
}

.ghost {
  color: var(--muted);
  background: transparent;
}

.status {
  margin-top: 1.75rem;
  font-size: 0.85rem;
  color: var(--muted);
  letter-spacing: 0.04em;
}
</style>
