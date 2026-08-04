<template>
  <div class="worlds">
    <header>
      <div>
        <p class="brand">SCI-FI VILLAGE</p>
        <h1>世界选择</h1>
      </div>
      <div class="user">
        <span>{{ auth.user?.displayName || auth.user?.username }}</span>
        <button type="button" @click="onLogout">退出</button>
      </div>
    </header>

    <section class="create">
      <h2>创建新世界</h2>
      <form @submit.prevent="onCreate">
        <input v-model="name" placeholder="世界名称" maxlength="64" required />
        <select v-model="gameMode">
          <option value="survival">生存</option>
          <option value="creative">创造</option>
          <option value="adventure">冒险</option>
        </select>
        <button type="submit" :disabled="creating">创建并进入</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <section class="list">
      <h2>我的世界</h2>
      <div v-if="loading" class="empty">加载中…</div>
      <div v-else-if="!worlds.length" class="empty">还没有世界，先创建一个吧。</div>
      <ul v-else>
        <li v-for="w in worlds" :key="w.id">
          <div>
            <strong>{{ w.name }}</strong>
            <p>种子 {{ w.seed }} · {{ w.gameMode }} · #{{ w.id }}</p>
          </div>
          <router-link :to="`/play/${w.id}`">进入</router-link>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { createWorld, listWorlds, type World } from '@/api/world'

const auth = useAuthStore()
const router = useRouter()

const worlds = ref<World[]>([])
const loading = ref(true)
const creating = ref(false)
const name = ref('')
const gameMode = ref('survival')
const error = ref('')

async function refresh() {
  loading.value = true
  try {
    await auth.loadMe()
    worlds.value = await listWorlds()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function onCreate() {
  error.value = ''
  creating.value = true
  try {
    const world = await createWorld({
      name: name.value.trim(),
      gameMode: gameMode.value,
    })
    await router.push(`/play/${world.id}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建失败'
  } finally {
    creating.value = false
  }
}

function onLogout() {
  auth.logout()
  router.replace('/login')
}

onMounted(refresh)
</script>

<style scoped>
.worlds {
  height: 100%;
  overflow: auto;
  padding: 2rem clamp(1rem, 4vw, 3rem);
  background:
    radial-gradient(ellipse at top, rgba(61, 214, 198, 0.1), transparent 45%),
    linear-gradient(180deg, #071015, #0c2430);
}

header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 2rem;
}

.brand {
  font-family: var(--font-display);
  letter-spacing: 0.28em;
  font-size: 0.72rem;
  color: var(--accent);
}

h1, h2 {
  font-family: var(--font-display);
}

h1 { font-size: 1.75rem; }
h2 { font-size: 1rem; margin-bottom: 0.75rem; color: var(--accent-2); }

.user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--muted);
}

.create,
.list {
  max-width: 720px;
  margin-bottom: 2rem;
}

form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

form input { flex: 1 1 200px; }
form select {
  padding: 0.65rem 0.75rem;
  border-radius: 4px;
  border: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.35);
  color: var(--text);
}

ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--line);
  background: rgba(12, 28, 34, 0.65);
  border-radius: 6px;
}

li p {
  color: var(--muted);
  font-size: 0.85rem;
  margin-top: 0.2rem;
}

li a {
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: 4px;
}

.empty, .error {
  color: var(--muted);
}

.error { color: var(--danger); margin-top: 0.5rem; }
</style>
