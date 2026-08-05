<template>
  <div class="chat-root">
    <button
      type="button"
      class="icon-btn chat-btn"
      :class="{ active: open, unread: unread > 0 && !open }"
      title="消息"
      aria-label="消息"
      @pointerdown.prevent.stop="toggle"
    >
      <svg class="gear" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4.2 3.2A1 1 0 0 1 3 19.2V6a2 2 0 0 1 2-2Zm2 4v2h12V8H6Zm0 4v2h8v-2H6Z"
        />
      </svg>
      <i v-if="unread > 0 && !open" class="badge">{{ unread > 9 ? '9+' : unread }}</i>
    </button>

    <div v-if="open" class="chat-overlay" @pointerdown.self.prevent="open = false">
      <div class="chat-panel" role="dialog" aria-label="队伍消息" @pointerdown.stop>
        <header class="panel-head">
          <span class="title">消息</span>
          <button type="button" class="close" aria-label="关闭" @pointerdown.prevent.stop="open = false">
            ×
          </button>
        </header>

        <div class="panel-main">
          <!-- 左侧 Tab -->
          <aside class="tabs">
            <button
              type="button"
              class="tab"
              :class="{ on: channel === 'team' }"
              @pointerdown.prevent.stop="channel = 'team'"
            >
              队伍
            </button>
            <button
              type="button"
              class="tab"
              :class="{ on: channel === 'system' }"
              @pointerdown.prevent.stop="channel = 'system'"
            >
              系统
            </button>
          </aside>

          <!-- 右侧消息列表 -->
          <div ref="listEl" class="msg-list">
            <button
              v-for="m in visible"
              :key="m.id"
              type="button"
              class="msg"
              :class="{ tap: channel === 'system' && !!m.mark }"
              @pointerdown.prevent.stop="onRow(m)"
            >
              <span class="who">{{ displayWho(m) }}</span>
              <span class="sep">：</span>
              <span class="txt">{{ displayText(m) }}</span>
            </button>
            <div v-if="!visible.length" class="empty">
              {{ channel === 'team' ? '暂无队伍消息' : '暂无标记记录' }}
            </div>
          </div>
        </div>

        <!-- 下方输入（仅队伍） -->
        <footer v-if="channel === 'team'" class="compose">
          <input
            ref="inputEl"
            v-model="draft"
            class="input"
            type="text"
            :maxlength="maxLen"
            placeholder="输入消息（最多20字）"
            enterkeyhint="send"
            @input="clampDraft"
            @keydown.enter.prevent="send"
          />
          <span class="count">{{ draft.length }}/{{ maxLen }}</span>
          <button
            type="button"
            class="send"
            :disabled="!draft.trim()"
            @pointerdown.prevent.stop="send"
          >
            发送
          </button>
        </footer>
        <footer v-else class="compose tip">
          点击标记记录可重新显示地点
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CHAT_TEXT_MAX, type ChatChannel, type SquadChatItem } from '@/game/squadChat'

const props = withDefaults(
  defineProps<{
    messages: SquadChatItem[]
    myUserId?: number
  }>(),
  {
    messages: () => [],
    myUserId: 0,
  }
)

const emit = defineEmits<{
  send: [text: string]
  restoreMark: [item: SquadChatItem]
}>()

const open = ref(false)
const channel = ref<ChatChannel>('team')
const draft = ref('')
const listEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const maxLen = CHAT_TEXT_MAX
/** 仅统计队伍聊天未读；标记走左上广播，不亮红点 */
const seenTeamLen = ref(0)

function teamChatCount(msgs: SquadChatItem[]) {
  return msgs.filter((m) => m.channel === 'team' && m.kind === 'chat').length
}

const visible = computed(() => {
  if (channel.value === 'team') {
    return props.messages.filter((m) => m.channel === 'team' && m.kind === 'chat')
  }
  return props.messages.filter((m) => m.channel === 'system' && m.kind === 'mark')
})

const unread = computed(() => Math.max(0, teamChatCount(props.messages) - seenTeamLen.value))

function toggle() {
  open.value = !open.value
  if (open.value) {
    channel.value = 'team'
    seenTeamLen.value = teamChatCount(props.messages)
    nextTick(() => {
      scrollBottom()
      inputEl.value?.focus()
    })
  }
}

function displayWho(m: SquadChatItem) {
  if (m.userId && m.userId === props.myUserId) return '我'
  return (m.name || '队友').slice(0, 8)
}

function displayText(m: SquadChatItem) {
  if (m.kind === 'mark') {
    const label = m.mark?.label || '地点'
    return `标记了${label}`
  }
  // text 存纯内容；兼容旧数据「名: 内容」
  const t = m.text || ''
  const i = t.indexOf(': ')
  if (i > 0 && i < 12) return t.slice(i + 2)
  const j = t.indexOf('：')
  if (j > 0 && j < 12) return t.slice(j + 1)
  return t
}

function send() {
  const t = draft.value.trim().slice(0, maxLen)
  if (!t) return
  emit('send', t)
  draft.value = ''
  nextTick(scrollBottom)
}

function clampDraft() {
  if (draft.value.length > maxLen) draft.value = draft.value.slice(0, maxLen)
}

function onRow(m: SquadChatItem) {
  if (channel.value === 'system' && m.mark) emit('restoreMark', m)
}

function scrollBottom() {
  const el = listEl.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  () => [visible.value.length, channel.value, open.value] as const,
  async () => {
    if (!open.value) return
    await nextTick()
    scrollBottom()
  }
)

watch(open, (v) => {
  if (v) seenTeamLen.value = teamChatCount(props.messages)
})

watch(
  () => teamChatCount(props.messages),
  (n) => {
    if (open.value) seenTeamLen.value = n
  }
)

defineExpose({ open })
</script>

<style scoped>
.chat-root {
  position: relative;
  pointer-events: auto;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(12, 18, 22, 0.5);
  color: #f2f6f5;
  cursor: pointer;
  padding: 0;
  display: grid;
  place-items: center;
  line-height: 0;
  flex-shrink: 0;
  position: relative;
}

.icon-btn .gear {
  width: 16px;
  height: 16px;
  display: block;
}

.icon-btn.active {
  border-color: rgba(120, 180, 220, 0.55);
  background: rgba(80, 130, 170, 0.28);
}

.icon-btn:active {
  transform: scale(0.96);
}

.badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: #e85d5d;
  color: #fff;
  font-size: 0.55rem;
  font-weight: 800;
  font-style: normal;
  display: grid;
  place-items: center;
  line-height: 1;
}

.chat-overlay {
  position: fixed;
  inset: 0;
  z-index: 3400;
  display: grid;
  place-items: center;
  padding: max(0.5rem, env(safe-area-inset-top)) max(0.6rem, env(safe-area-inset-right))
    max(0.5rem, env(safe-area-inset-bottom)) max(0.6rem, env(safe-area-inset-left));
  background: rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
}

.chat-panel {
  width: min(420px, 94vw);
  max-height: min(70vh, 420px);
  display: flex;
  flex-direction: column;
  background: rgba(14, 22, 28, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.65rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #e8eef0;
}

.close {
  border: none;
  background: transparent;
  color: rgba(230, 236, 238, 0.7);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.1rem 0.35rem;
}

.panel-main {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
}

.tabs {
  width: 52px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.4rem 0.25rem;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.15);
}

.tab {
  border: none;
  background: transparent;
  color: rgba(220, 228, 230, 0.5);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.45rem 0.15rem;
  border-radius: 6px;
  cursor: pointer;
  writing-mode: horizontal-tb;
}

.tab.on {
  color: #1a1e22;
  background: rgba(240, 201, 58, 0.9);
}

.msg-list {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 0.45rem 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  -webkit-overflow-scrolling: touch;
  background: transparent;
  -webkit-user-select: none;
  user-select: none;
}

.msg {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  text-align: left;
  font: inherit;
  color: rgba(236, 242, 244, 0.92);
  cursor: default;
  line-height: 1.4;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

.msg.tap {
  cursor: pointer;
}

.msg.tap:active .txt {
  text-decoration: underline;
}

.who {
  font-size: 0.72rem;
  font-weight: 800;
  color: rgba(240, 201, 58, 0.95);
}

.sep {
  font-size: 0.72rem;
  color: rgba(236, 242, 244, 0.55);
}

.txt {
  font-size: 0.72rem;
  font-weight: 600;
  word-break: break-word;
}

.empty {
  font-size: 0.68rem;
  color: rgba(220, 228, 230, 0.35);
  padding: 0.6rem 0.1rem;
}

.compose {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.55rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.2);
}

.compose.tip {
  font-size: 0.62rem;
  color: rgba(200, 220, 235, 0.55);
  justify-content: center;
}

.input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.28);
  color: #eef4f6;
  border-radius: 6px;
  font-size: 0.78rem;
  padding: 0.4rem 0.5rem;
  outline: none;
  -webkit-user-select: text;
  user-select: text;
}

.input::placeholder {
  color: rgba(220, 228, 230, 0.35);
}

.count {
  flex-shrink: 0;
  font-size: 0.58rem;
  color: rgba(220, 228, 230, 0.4);
  min-width: 2.2rem;
  text-align: right;
}

.send {
  flex-shrink: 0;
  border: 1px solid rgba(240, 201, 58, 0.45);
  background: rgba(240, 201, 58, 0.85);
  color: #1a1e22;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 0.4rem 0.7rem;
  cursor: pointer;
}

.send:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
