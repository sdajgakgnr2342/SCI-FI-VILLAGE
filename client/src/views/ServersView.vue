<template>
  <div class="servers">
    <header>
      <div>
        <p class="brand">SCI-FI VILLAGE</p>
        <h1>{{ choosing ? '选择服务器' : '进入村落' }}</h1>
        <p class="sub">
          {{
            choosing
              ? '可切换服务器；选定后下次将自动进入'
              : '正在回到你上次的服务器…'
          }}
        </p>
      </div>
      <div class="user">
        <span>{{ auth.user?.displayName || auth.user?.username }}</span>
        <button type="button" :disabled="joining || loggingOut" @click="onLogout">退出</button>
      </div>
    </header>

    <section v-if="autoJoining" class="quick">
      <p class="hint">正在进入 {{ lastName || '上次服务器' }}…</p>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="button" class="primary" :disabled="joining" @click="showChooser">
        改选其他服务器
      </button>
    </section>

    <template v-else>
      <section class="quick">
        <button type="button" class="primary" :disabled="joining" @click="onQuickJoin">
          {{ joining ? '匹配中…' : '快速加入（自动均衡）' }}
        </button>
        <p v-if="error" class="error">{{ error }}</p>
        <p class="hint">选定后会记住，下次登录直接进该服。</p>
      </section>

      <section class="list">
        <h2>服务器列表</h2>
        <div v-if="loading" class="empty">加载中…</div>
        <div v-else-if="!servers.length" class="empty">暂无服务器，请稍后重试。</div>
        <ul v-else>
          <li v-for="s in servers" :key="s.id">
            <div>
              <strong>{{ s.name }}</strong>
              <p>
                {{ statusLabel(s) }} · {{ s.online }}/{{ s.maxPlayers }} 人 · {{ s.code }}
                <template v-if="s.id === lastId"> · 上次进入</template>
              </p>
              <div class="bar">
                <i :style="{ width: `${Math.min(100, (s.online / s.maxPlayers) * 100)}%` }" />
              </div>
            </div>
            <button
              type="button"
              :disabled="!canJoin(s) || joining"
              @click="onJoin(s.id)"
            >
              {{ joinLabel(s) }}
            </button>
          </li>
        </ul>
      </section>
    </template>

    <div v-if="pageBusy" class="local-loading">
      <LoadingSpinner :text="busyText" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { joinServer, listServers, type GameServer } from '@/api/server'
import { getLastServerId, setLastServerId } from '@/utils/lastServer'
import LoadingSpinner from '@/components/LoadingSpinner.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const landscape = inject<{
  tryNativeLock?: () => Promise<void>
  ensureFullscreen?: () => Promise<void>
} | null>('landscape', null)

const servers = ref<GameServer[]>([])
const loading = ref(true)
const joining = ref(false)
const loggingOut = ref(false)
const autoJoining = ref(false)
const choosing = ref(false)
const error = ref('')
const lastId = ref<number | null>(getLastServerId())

const lastName = computed(() => {
  const id = lastId.value
  if (!id) return ''
  return servers.value.find((s) => s.id === id)?.name || ''
})

const pageBusy = computed(
  () => loading.value || joining.value || loggingOut.value || autoJoining.value
)
const busyText = computed(() => {
  if (loggingOut.value) return '正在退出…'
  if (joining.value || autoJoining.value) return '进入服务器…'
  if (loading.value) return '加载中…'
  return '加载中…'
})

function statusLabel(s: GameServer) {
  const map: Record<string, string> = {
    open: '开放',
    full: '已满',
    draining: '排空中',
    standby: '待命',
  }
  return map[s.status] || s.status
}

function canJoin(s: GameServer) {
  return (s.status === 'open' || s.status === 'draining') && s.online < s.maxPlayers
}

function joinLabel(s: GameServer) {
  if (s.status === 'full') return '已满'
  if (s.status === 'standby') return '未开放'
  if (s.status === 'draining') return '排空中'
  return '进入'
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    await auth.loadMe()
    const data = await listServers()
    servers.value = data.servers
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function enter(serverId?: number) {
  error.value = ''
  joining.value = true
  try {
    await landscape?.ensureFullscreen?.()
    await landscape?.tryNativeLock?.()
    const data = await joinServer(serverId)
    setLastServerId(data.server.id)
    lastId.value = data.server.id
    sessionStorage.setItem('sv_join', JSON.stringify(data))
    await router.replace(`/play/${data.server.id}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加入失败'
    autoJoining.value = false
    choosing.value = true
    await refresh()
  } finally {
    joining.value = false
  }
}

function onQuickJoin() {
  return enter()
}

function onJoin(id: number) {
  return enter(id)
}

function showChooser() {
  autoJoining.value = false
  choosing.value = true
  refresh()
}

async function onLogout() {
  loggingOut.value = true
  try {
    auth.logout()
    await router.replace('/login')
  } finally {
    loggingOut.value = false
  }
}

onMounted(async () => {
  void landscape?.ensureFullscreen?.()
  const forceChoose = route.query.change === '1'
  lastId.value = getLastServerId()

  if (!forceChoose && lastId.value) {
    autoJoining.value = true
    choosing.value = false
    await refresh()
    await enter(lastId.value)
    return
  }

  choosing.value = true
  autoJoining.value = false
  await refresh()
})
</script>

<style scoped>
.servers {
  position: relative;
  height: 100%;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  padding:
    max(1rem, env(safe-area-inset-top))
    max(1rem, env(safe-area-inset-right))
    max(1.25rem, env(safe-area-inset-bottom))
    max(1rem, env(safe-area-inset-left));
  background:
    radial-gradient(ellipse at top, rgba(120, 190, 255, 0.28), transparent 45%),
    linear-gradient(180deg, #eaf5fb, #d8ebe0);
}

.local-loading {
  position: absolute;
  inset: 0;
  z-index: 30;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.brand {
  font-family: var(--font-display);
  letter-spacing: 0.28em;
  font-size: 0.72rem;
  color: var(--accent);
}

h1,
h2 {
  font-family: var(--font-display);
}

h1 {
  font-size: 1.75rem;
}
h2 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
  color: var(--accent-2);
}

.sub {
  color: var(--muted);
  font-size: 0.88rem;
  margin-top: 0.35rem;
}

.user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--muted);
}

.quick {
  max-width: 720px;
  margin-bottom: 1.5rem;
}

.primary {
  background: linear-gradient(180deg, rgba(31, 138, 122, 0.3), rgba(31, 138, 122, 0.12));
  font-size: 1rem;
  padding: 0.75rem 1.2rem;
}

.hint {
  margin-top: 0.6rem;
  color: var(--muted);
  font-size: 0.85rem;
}

.list {
  max-width: 720px;
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
  background: rgba(255, 255, 255, 0.72);
  border-radius: 6px;
}

li p {
  color: var(--muted);
  font-size: 0.85rem;
  margin-top: 0.2rem;
}

.bar {
  margin-top: 0.45rem;
  height: 6px;
  border-radius: 99px;
  background: rgba(40, 100, 120, 0.12);
  overflow: hidden;
  max-width: 220px;
}

.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #3d9a4a, #1f8a7a);
}

.empty,
.error {
  color: var(--muted);
}
.error {
  color: var(--danger);
  margin-top: 0.5rem;
}
</style>
