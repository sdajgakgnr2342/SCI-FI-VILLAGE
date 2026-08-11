<template>
  <div class="home">
    <div class="veil" />

    <button
      v-if="auth.isLoggedIn"
      type="button"
      class="party-entry"
      title="好友组队"
      aria-label="好友组队"
      @click="showParty = true"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
        />
      </svg>
      <span>组队</span>
      <i v-if="inviteCount" class="badge">{{ inviteCount }}</i>
    </button>

    <div class="content">
      <p class="brand">SCI-FI VILLAGE</p>
      <h1>在科幻废土上，重建你的方块村落</h1>
      <p class="lead">体素沙盒 · 好友同服 · 挖建砍树一起干</p>

      <div class="actions">
        <router-link
          v-if="auth.isLoggedIn"
          class="cta"
          :to="enterTo"
          @click="onEnterNav"
        >
          进入村落
        </router-link>
        <router-link v-else class="cta" to="/login">开始航行</router-link>
        <router-link v-if="!auth.isLoggedIn" class="ghost" to="/register">注册账号</router-link>
      </div>

      <p v-if="healthText" class="status">{{ healthText }}</p>
    </div>

    <div
      v-if="showParty && auth.isLoggedIn"
      class="party-modal-root"
      @pointerdown.self="showParty = false"
    >
      <div class="party-modal" role="dialog" aria-label="好友组队">
        <div class="party-modal-head">
          <h2>好友组队</h2>
          <button type="button" class="party-close" aria-label="关闭" @click="showParty = false">
            ×
          </button>
        </div>
        <p class="party-desc">邀请好友进同一服务器；准备舱内可同舱活动，落地后出生在彼此旁边。</p>

        <div class="invite-row">
          <input
            v-model="inviteName"
            type="text"
            maxlength="32"
            placeholder="输入好友用户名"
            @keydown.enter="sendInvite"
          />
          <button type="button" class="cta sm" :disabled="busy" @click="sendInvite">邀请</button>
        </div>

        <p v-if="partyMsg" class="party-msg">{{ partyMsg }}</p>

        <div v-if="mine?.invites?.length" class="block">
          <h3>收到的邀请</h3>
          <div v-for="inv in mine.invites" :key="inv.id" class="row">
            <span>{{ inv.fromDisplayName || inv.fromUsername }} · {{ inv.partyCode }}</span>
            <span class="row-actions">
              <button type="button" class="cta sm" @click="onAccept(inv.id)">接受</button>
              <button type="button" class="ghost sm" @click="onDecline(inv.id)">拒绝</button>
            </span>
          </div>
        </div>

        <div v-if="mine?.party" class="block">
          <h3>当前队伍 · {{ mine.party.code }}</h3>
          <ul class="members">
            <li v-for="m in mine.members" :key="m.userId">
              {{ m.displayName || m.username }}
              <em>{{ m.role === 'host' ? '队长' : '队员' }}</em>
            </li>
          </ul>
          <div class="party-actions">
            <button type="button" class="cta" :disabled="busy" @click="onEnterParty">
              组队进入游戏
            </button>
            <button type="button" class="ghost" :disabled="busy" @click="onLeaveParty">离队</button>
          </div>
          <p class="hint">队长先点「组队进入」；队员再点即可靠近出生。</p>
        </div>
      </div>
    </div>

    <div v-if="pageLoading" class="home-loading">
      <LoadingSpinner :text="pageLoadingText" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { health } from '@/api/auth'
import { getLastServerId, setLastServerId } from '@/utils/lastServer'
import {
  acceptInvite,
  declineInvite,
  enterWithParty,
  fetchPartyMine,
  inviteFriend,
  leaveParty,
  type PartyMine,
} from '@/api/party'
import LoadingSpinner from '@/components/LoadingSpinner.vue'

const auth = useAuthStore()
const router = useRouter()
const landscape = inject<{ ensureFullscreen?: () => Promise<void> } | null>('landscape', null)

const healthText = ref('')
const inviteName = ref('')
const partyMsg = ref('')
const busy = ref(false)
const pageLoading = ref(false)
const pageLoadingText = ref('加载中…')
const mine = ref<PartyMine | null>(null)
const showParty = ref(false)
let pollTimer: number | undefined

const enterTo = computed(() => {
  const id = getLastServerId()
  return id ? `/play/${id}` : '/servers'
})

const inviteCount = computed(() => mine.value?.invites?.length || 0)

function onEnterNav() {
  pageLoading.value = true
  pageLoadingText.value = '进入村落…'
  void landscape?.ensureFullscreen?.()
}

async function refreshParty() {
  if (!auth.isLoggedIn) return
  try {
    mine.value = await fetchPartyMine()
  } catch {
    // ignore
  }
}

async function sendInvite() {
  const name = inviteName.value.trim()
  if (!name) {
    partyMsg.value = '请输入用户名'
    return
  }
  busy.value = true
  partyMsg.value = ''
  try {
    await inviteFriend(name)
    partyMsg.value = `已邀请 ${name}`
    inviteName.value = ''
    await refreshParty()
  } catch (e) {
    partyMsg.value = e instanceof Error ? e.message : '邀请失败'
  } finally {
    busy.value = false
  }
}

async function onAccept(id: number) {
  busy.value = true
  pageLoading.value = true
  pageLoadingText.value = '加入队伍…'
  try {
    mine.value = await acceptInvite(id)
    partyMsg.value = '已加入队伍'
  } catch (e) {
    partyMsg.value = e instanceof Error ? e.message : '接受失败'
  } finally {
    busy.value = false
    pageLoading.value = false
  }
}

async function onDecline(id: number) {
  try {
    await declineInvite(id)
    await refreshParty()
  } catch (e) {
    partyMsg.value = e instanceof Error ? e.message : '拒绝失败'
  }
}

async function onLeaveParty() {
  busy.value = true
  pageLoading.value = true
  pageLoadingText.value = '离开队伍…'
  try {
    await leaveParty()
    partyMsg.value = '已离开队伍'
    await refreshParty()
  } catch (e) {
    partyMsg.value = e instanceof Error ? e.message : '离队失败'
  } finally {
    busy.value = false
    pageLoading.value = false
  }
}

async function onEnterParty() {
  busy.value = true
  partyMsg.value = ''
  pageLoading.value = true
  pageLoadingText.value = '进入服务器…'
  try {
    const data = await enterWithParty()
    sessionStorage.setItem('sv_join', JSON.stringify(data))
    setLastServerId(data.server.id)
    showParty.value = false
    await router.push(`/play/${data.server.id}`)
  } catch (e) {
    partyMsg.value = e instanceof Error ? e.message : '进入失败'
    pageLoading.value = false
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  void landscape?.ensureFullscreen?.()
  pageLoading.value = true
  pageLoadingText.value = '加载中…'
  try {
    await auth.loadMe()
    try {
      const h = await health()
      healthText.value = `服务 · MySQL ${h.mysql ? 'OK' : 'DOWN'} · Redis ${h.redis ? 'OK' : 'MEM'}`
    } catch {
      healthText.value = '后端未连接 — 请先启动 server'
    }
    await refreshParty()
    pollTimer = window.setInterval(refreshParty, 5000)
  } finally {
    pageLoading.value = false
  }
})

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})
</script>

<style scoped>
.home {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  padding:
    max(1rem, env(safe-area-inset-top))
    max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom))
    max(1rem, env(safe-area-inset-left));
  background:
    radial-gradient(ellipse 80% 60% at 70% 20%, rgba(120, 190, 255, 0.35), transparent 55%),
    radial-gradient(ellipse 60% 50% at 20% 80%, rgba(140, 200, 120, 0.2), transparent 50%),
    linear-gradient(160deg, #d7ebf8 0%, #b7d6ea 45%, #cfe3c8 100%);
  overflow: hidden;
}

.home-loading {
  position: absolute;
  inset: 0;
  z-index: 40;
}

.home::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(31, 100, 120, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(31, 100, 120, 0.06) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(circle at 50% 40%, #000 20%, transparent 75%);
  animation: drift 18s linear infinite;
  pointer-events: none;
}

@keyframes drift {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(48px);
  }
}

.veil {
  position: absolute;
  inset: auto 0 0;
  height: 32%;
  background: linear-gradient(transparent, rgba(200, 220, 230, 0.75));
  pointer-events: none;
}

.party-entry {
  position: absolute;
  top: max(0.65rem, env(safe-area-inset-top));
  right: max(0.65rem, env(safe-area-inset-right));
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(40, 100, 120, 0.28);
  background: rgba(255, 255, 255, 0.72);
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 600;
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 14px rgba(20, 60, 80, 0.12);
}

.party-entry svg {
  width: 1.1rem;
  height: 1.1rem;
  color: var(--accent);
}

.party-entry .badge {
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.28rem;
  border-radius: 999px;
  background: #d64545;
  color: #fff;
  font-size: 0.65rem;
  font-style: normal;
  display: grid;
  place-items: center;
  line-height: 1;
}

.content {
  position: relative;
  z-index: 1;
  text-align: center;
  max-width: min(640px, 92%);
  padding: 1.25rem 1rem;
  animation: rise 0.9s ease both;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.brand {
  font-family: var(--font-display);
  letter-spacing: 0.35em;
  font-size: clamp(0.95rem, 2.4vw, 1.15rem);
  color: var(--accent);
  margin-bottom: 1rem;
}

h1 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: clamp(1.15rem, 3.2vw, 2.2rem);
  line-height: 1.3;
  margin-bottom: 0.75rem;
}

.lead {
  color: var(--muted);
  font-size: clamp(0.85rem, 1.8vw, 1rem);
  margin-bottom: 1.35rem;
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
  justify-content: center;
  padding: 0.7rem 1.25rem;
  border-radius: 4px;
  border: 1px solid var(--line);
  cursor: pointer;
  font: inherit;
}

.cta {
  background: linear-gradient(180deg, rgba(31, 138, 122, 0.28), rgba(31, 138, 122, 0.1));
  color: var(--text);
}

.ghost {
  color: var(--muted);
  background: transparent;
}

.cta.sm,
.ghost.sm {
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
}

.cta:disabled,
.ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status {
  margin-top: 1.5rem;
  font-size: 0.78rem;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.party-modal-root {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(8, 18, 24, 0.45);
  backdrop-filter: blur(3px);
}

.party-modal {
  width: min(420px, 92%);
  max-height: min(78%, 520px);
  overflow: auto;
  text-align: left;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(40, 100, 120, 0.22);
  border-radius: 12px;
  padding: 1rem 1.1rem 1.1rem;
  box-shadow: 0 16px 40px rgba(10, 40, 50, 0.28);
  color: var(--text);
}

.party-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.party-modal-head h2 {
  margin: 0;
  font-size: 1.05rem;
  font-family: var(--font-display);
}

.party-close {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid rgba(40, 100, 120, 0.22);
  background: rgba(255, 255, 255, 0.7);
  font-size: 1.25rem;
  line-height: 1;
  padding: 0;
  display: grid;
  place-items: center;
  color: var(--muted);
}

.party-desc,
.hint {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  color: var(--muted);
}

.invite-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.invite-row input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(40, 100, 120, 0.28);
  border-radius: 4px;
  padding: 0.5rem 0.65rem;
  font: inherit;
  background: #fff;
}

.party-msg {
  color: #0f6b5c;
  font-size: 0.82rem;
  margin: 0.35rem 0 0.5rem;
}

.block {
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(40, 100, 120, 0.15);
}

.block h3 {
  margin: 0 0 0.45rem;
  font-size: 0.9rem;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  margin-bottom: 0.4rem;
}

.row-actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.members {
  list-style: none;
  margin: 0 0 0.75rem;
  padding: 0;
  font-size: 0.85rem;
}

.members li {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
}

.members em {
  font-style: normal;
  color: var(--accent);
  font-size: 0.75rem;
}

.party-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
