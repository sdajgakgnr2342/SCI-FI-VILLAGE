<template>
  <div class="play" :class="{ 'editing-controls': editingControls }">
    <div ref="viewport" class="viewport" />

    <div class="hud">
      <!-- 左上：小队条 + 其下 15 秒广播条 -->
      <div class="corner-left">
        <div v-if="squadHud.length" class="squad-strip">
          <div v-for="m in squadHud" :key="m.userId" class="squad-row">
            <i class="slot" :style="{ background: squadColor(m.slot) }">{{ m.slot }}</i>
            <span class="sname">{{ shortName(m.name) }}</span>
            <span v-if="m.online === false" class="offline">离线</span>
          </div>
        </div>
        <div class="broadcast-feed" aria-live="polite">
          <div v-for="b in broadcastLive" :key="b.id" class="bcast">
            <span class="b-who">{{ b.who }}</span><span class="b-sep">：</span
            ><span class="b-txt">{{ b.text }}</span>
          </div>
        </div>
      </div>

      <!-- 右上：地图 → 设置 → 标记 → 消息 -->
      <div class="corner-right">
        <MiniMap
          :my-x="mapMe.x"
          :my-z="mapMe.z"
          :my-yaw="mapMe.yaw"
          :my-user-id="auth.user?.id || 0"
          :peers="mapPeers"
          :squad-members="squadHud"
          :terrain-sample="minimapTerrainSample"
          :terrain-rev="mapTerrainRev"
          :squad-marks="squadMarks"
          @clear-my-mark="clearMySquadMark"
        />
        <button
          type="button"
          class="icon-btn"
          title="设置"
          aria-label="设置"
          @click.stop="showSettings = !showSettings"
        >
          <svg class="gear" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.07 7.07 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.12.22.39.3.6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.58-.22 1.13-.54 1.63-.94l2.39.96c.22.08.48 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
            />
          </svg>
        </button>
        <button
          type="button"
          class="icon-btn mark-btn"
          :class="{ active: !!mySquadMark }"
          title="点一下：标记准星位置；长按本按钮：清除自己的标记"
          aria-label="标记"
          @pointerdown.prevent.stop="onMarkPointerDown"
          @pointerup.prevent.stop="onMarkPointerUp"
          @pointercancel.prevent.stop="onMarkPointerCancel"
          @pointerleave.prevent.stop="onMarkPointerCancel"
        >
          <svg class="gear" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2c-3.3 0-6 2.6-6 5.8 0 4.4 6 11.2 6 11.2s6-6.8 6-11.2C18 4.6 15.3 2 12 2zm0 8.2a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8z"
            />
          </svg>
        </button>
        <SquadChat
          :messages="chatMessages"
          :my-user-id="auth.user?.id || 0"
          @send="sendTeamChat"
          @restore-mark="restoreMarkFromChat"
        />
      </div>

      <div v-if="showWare" class="warehouse">
        <h3>仓库</h3>
        <div class="ware-grid">
          <button
            v-for="m in materials"
            :key="m"
            type="button"
            class="ware-item"
            :class="{ active: selectedMat === m }"
            :title="MATERIAL_LABEL[m]"
            @pointerdown.prevent="selectMat(m)"
          >
            <GameIcon class="mat-icon" :name="MATERIAL_ICON[m]" :size="22" />
            <span class="mlabel">{{ MATERIAL_LABEL[m] }}</span>
            <span class="mqty">{{ inv[m] }}</span>
          </button>
        </div>
        <div class="ware-row">
          <span>工具</span>
          <button type="button" class="chip" :class="{ active: tool === 'hand' }" @pointerdown.prevent="setTool('hand')">手</button>
          <button type="button" class="chip" :class="{ active: tool === 'axe' }" @pointerdown.prevent="setTool('axe')">斧头</button>
        </div>
        <div class="ware-row">
          <span>形状</span>
          <button
            v-for="s in shapes"
            :key="s"
            type="button"
            class="chip"
            :class="{ active: buildShape === s }"
            @pointerdown.prevent="setShape(s)"
          >
            {{ SHAPE_LABEL[s] }}
          </button>
        </div>
        <p class="ware-tip">
          选中材料即建造 · 取消材料即挖砍采 · 「操作/放置」执行当前动作
        </p>
        <button type="button" class="ghost-close" @click="showWare = false">关闭</button>
      </div>

      <button
        v-if="!isTouch && !loading && !error"
        type="button"
        class="desk-ware"
        title="仓库"
        aria-label="仓库"
        @click="showWare = !showWare"
      >
        <GameIcon name="ware" :size="26" />
      </button>

      <div class="bottom">
        <div class="hotbar">
          <div
            v-for="m in materials"
            :key="m"
            class="slot"
            :class="{ active: selectedMat === m }"
            :title="MATERIAL_LABEL[m]"
            @pointerdown="selectMat(m)"
          >
            <span class="qty">{{ inv[m] ?? 0 }}</span>
            <GameIcon class="mat-icon" :name="MATERIAL_ICON[m]" :size="22" />
            <span class="id">{{ MATERIAL_LABEL[m] }}</span>
          </div>
        </div>
        <p v-if="!isTouch" class="tips">
          {{
            actionHint ||
            `格子#${myCellNum} · Q${buildMode ? '建造' : '操作'} · 点材料建造/再点取消 · C蹲 · ${breakLabel}`
          }}
        </p>
      </div>
    </div>

    <!-- 设置：挂在 play 根层，避免被物体提示盖住 -->
    <div
      v-if="showSettings"
      class="settings-overlay"
      @pointerdown.self.prevent="showSettings = false"
    >
      <div
        class="settings-panel"
        role="dialog"
        aria-label="设置"
        @pointerdown.stop
      >
        <header class="settings-head">
          <h3>设置</h3>
          <button type="button" class="ghost-close head-close" @click="showSettings = false">
            关闭
          </button>
        </header>
        <div class="settings-body">
          <div class="settings-actions">
            <button type="button" class="settings-link" @click="enterControlEdit">
              自定义键位
            </button>
            <button type="button" class="settings-link danger" @click="goExitServer">
              退出服务器
            </button>
          </div>
          <div v-if="isTouch" class="settings-import">
            <input v-model="importCode" class="code-input" maxlength="12" placeholder="输入键位码" />
            <button type="button" class="settings-link slim" @click="doImportCode">导入</button>
          </div>
          <p v-if="shareCodeHint" class="settings-note">{{ shareCodeHint }}</p>

          <div class="settings-block">
            <span class="settings-label">画质</span>
            <div class="settings-row">
              <button
                v-for="q in qualityOptions"
                :key="q"
                type="button"
                class="chip-set"
                :class="{ active: playSettings.quality === q }"
                @click="setQuality(q)"
              >
                {{ QUALITY_LABEL[q] }}
              </button>
            </div>
          </div>
          <label class="settings-toggle">
            <input v-model="playSettings.antialias" type="checkbox" @change="applyGraphicsNow" />
            <span>抗锯齿（默认关）</span>
          </label>
          <label class="settings-toggle">
            <input v-model="playSettings.muted" type="checkbox" @change="applyMuteNow" />
            <span>静音</span>
          </label>
        </div>
      </div>
    </div>

    <div
      v-if="!loading && !error && !showSettings && (actionRing.visible || editingControls)"
      class="hud-widget action-ring"
      :class="{ selected: editingControls && editSelected === 'actionRing' }"
      :style="hudWidgetStyle('actionRing')"
      @pointerdown.prevent.stop="onHudDown($event, 'actionRing')"
      @pointermove="onHudMove($event, 'actionRing')"
      @pointerup="onHudUp"
      @pointercancel="onHudUp"
    >
      <svg viewBox="0 0 100 100" class="ring-svg">
        <circle class="ring-bg" cx="50" cy="50" r="42" />
        <circle
          class="ring-fg"
          cx="50"
          cy="50"
          r="42"
          :stroke-dasharray="ringCirc"
          :stroke-dashoffset="ringOffset"
        />
      </svg>
      <span class="ring-time">{{
        actionRing.visible ? `${actionRing.remain.toFixed(1)}s` : '圆环'
      }}</span>
      <span v-if="actionRing.visible && actionRing.label" class="ring-label">{{
        actionRing.label
      }}</span>
      <span v-if="editingControls" class="edit-tag">操作圆环</span>
    </div>

    <div
      v-if="!loading && !error && !showSettings && (targetName || editingControls)"
      class="hud-widget target-hint"
      :class="{ selected: editingControls && editSelected === 'targetHint' }"
      :style="hudWidgetStyle('targetHint')"
      @pointerdown.prevent.stop="onHudDown($event, 'targetHint')"
      @pointermove="onHudMove($event, 'targetHint')"
      @pointerup="onHudUp"
      @pointercancel="onHudUp"
    >
      {{ targetName || '物体提示' }}
    </div>

    <MobileControls
      v-if="(isTouch || editingControls) && !loading && !error"
      :rotated="landscapeForced"
      :break-label="breakLabel"
      :crouched="crouched"
      :layout="controlLayout"
      :editing="editingControls"
      :selected-id="editSelected"
      :mode-icon="modeIcon"
      :build-mode="buildMode"
      :force-show="isTouch"
      @move="onMove"
      @look="onLook"
      @jump="onJump"
      @break="onBreak"
      @crouch-toggle="onCrouchToggle"
      @warehouse="showWare = !showWare"
      @select="onControlSelect"
      @update-item="onControlDrag"
    />

    <!-- 键位编辑条：顶栏，避免挡住右下操作键 -->
    <div
      v-if="editingControls"
      class="ctrl-edit-bar"
      :class="{ collapsed: editBarCollapsed }"
    >
      <button
        type="button"
        class="ctrl-collapse"
        :title="editBarCollapsed ? '展开编辑栏' : '收起编辑栏'"
        :aria-label="editBarCollapsed ? '展开' : '收起'"
        @click.stop="editBarCollapsed = !editBarCollapsed"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            v-if="editBarCollapsed"
            fill="currentColor"
            d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"
          />
          <path
            v-else
            fill="currentColor"
            d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"
          />
        </svg>
      </button>
      <template v-if="!editBarCollapsed">
        <div class="ctrl-edit-head">
          <strong>自定义键位</strong>
          <span>{{ editSelected ? CONTROL_LABEL[editSelected] : '点选控件后拖动' }}</span>
        </div>
        <template v-if="editSelected">
          <label class="slider-row">
            <span>大小</span>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.05"
              :value="controlLayout.items[editSelected].size"
              @input="onSizeSlider"
            />
          </label>
          <label class="slider-row">
            <span>透明度</span>
            <input
              type="range"
              min="0.25"
              max="1"
              step="0.05"
              :value="controlLayout.items[editSelected].opacity"
              @input="onOpacitySlider"
            />
          </label>
        </template>
        <div class="ctrl-edit-actions">
          <button type="button" @click="resetControls">恢复默认</button>
          <button type="button" @click="doShareCode">分享码</button>
          <button type="button" class="primary" @click="saveControls">保存</button>
          <button type="button" @click="cancelControlEdit">取消</button>
        </div>
        <p v-if="editMsg" class="ctrl-edit-msg">{{ editMsg }}</p>
      </template>
      <div v-else class="ctrl-edit-mini">
        <span>{{ editSelected ? CONTROL_LABEL[editSelected] : `拖动 v${CONTROL_DRAG_VERSION}` }}</span>
        <button type="button" class="mini-save" @click="saveControls">保存</button>
        <button type="button" class="mini-cancel" @click="cancelControlEdit">取消</button>
      </div>
    </div>

    <div v-if="loading || leaving" class="overlay">
      <LoadingSpinner :text="leaving ? '正在离开…' : '进入服务器…'" />
    </div>
    <div v-else-if="error" class="overlay error">{{ error }}</div>

    <div v-if="!loading && !error" class="aim" :class="{ build: buildMode }">
      <div class="crosshair" />
      <div v-if="actionHint" class="aim-toast">{{ actionHint }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { GameEngine, SURFACE_Y } from '@/game/engine'
import { NpcManager } from '@/game/npcManager'
import { PresenceClient } from '@/game/presence'
import { RemotePlayerManager } from '@/game/remotePlayers'
import {
  createInventory,
  MATERIAL_LABEL,
  SHAPE_LABEL,
  type BuildShape,
  type MaterialId,
  type ToolId,
} from '@/game/inventory'
import MobileControls from '@/components/MobileControls.vue'
import MiniMap from '@/components/MiniMap.vue'
import SquadChat from '@/components/SquadChat.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import GameIcon from '@/components/GameIcon.vue'
import { MATERIAL_ICON, type IconName } from '@/components/iconData'
import { squadColor, type MapPeer, type SquadMember } from '@/game/squad'
import {
  SQUAD_MARK_TTL_MS,
  type SquadMark,
} from '@/game/squadMark'
import {
  CHAT_TEXT_MAX,
  nextChatId,
  pushChatItem,
  type SquadChatItem,
} from '@/game/squadChat'
import { onLandscapeLayout } from '@/composables/landscapeBus'
import { joinServer, leaveServer, nearbyPlayers, serverHeartbeat, queryServerBlocks, saveServerBlocks, saveServerInventory } from '@/api/server'
import { fetchPartyMine } from '@/api/party'
import {
  fetchControlLayout,
  importControlLayout,
  saveControlLayout,
  shareControlLayout,
} from '@/api/controls'
import {
  CONTROL_LABEL,
  CONTROL_IDS,
  clampItem,
  defaultControlLayout,
  loadLayoutLocal,
  normalizeControlLayout,
  saveLayoutLocal,
  type ControlId,
  type ControlLayout,
} from '@/game/controlLayout'
import { CONTROL_DRAG_VERSION, beginDragSession, moveDragSession, type DragSession } from '@/game/controlDrag'
import { clearLastServerId, setLastServerId } from '@/utils/lastServer'
import { useAuthStore } from '@/stores/auth'
import { cellNumberAt } from '@/game/mapGrid'
import { NatureAudio } from '@/game/natureAudio'
import { GameAudio } from '@/game/gameAudio'
import {
  loadPlaySettings,
  savePlaySettings,
  QUALITY_LABEL,
  type PlaySettings,
  type QualityPreset,
} from '@/game/playSettings'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const viewport = ref<HTMLElement | null>(null)
const loading = ref(true)
const leaving = ref(false)
const error = ref('')
const serverName = ref('')
const hint = ref('')
const peerHint = ref('')
const isTouch = ref(false)
const showWare = ref(false)
const showSettings = ref(false)
const playSettings = reactive<PlaySettings>(loadPlaySettings())
const qualityOptions: QualityPreset[] = ['low', 'standard', 'high']
const actionHint = ref('')
const tool = ref<ToolId>('hand')
/** 当前选中的建造材料；有选中=建造，无选中=挖砍采 */
const selectedMat = ref<MaterialId | null>(null)
const buildMode = computed(() => selectedMat.value != null)
const buildShape = ref<BuildShape>('single')
const inv = reactive(createInventory())
/** 操作键图标：有材料=锤子，无材料=铲子 */
const modeIcon = computed<IconName>(() => (buildMode.value ? 'build' : 'dig'))
const breakLabel = computed(() => (buildMode.value ? '建' : '挖'))
const targetName = ref('')
const crouched = ref(false)
const squadMembers = ref<SquadMember[]>([])
const mapMe = reactive({ x: 0, z: 0, yaw: 0 })
const mapPeers = ref<MapPeer[]>([])
const myCellNum = computed(() => cellNumberAt(mapMe.x, mapMe.z))

/** 小地图：按世界种子/覆盖层采样草坪、溪流、石、树等 */
const mapTerrainRev = ref(0)
function minimapTerrainSample(x: number, z: number) {
  return engine?.getMinimapKind(x, z) ?? 'grass'
}

/** 小队战术标记（本地 + WS 同步） */
const squadMarks = ref<SquadMark[]>([])
const mySquadMark = computed(() => {
  const selfId = auth.user?.id || 0
  return squadMarks.value.find((m) => m.userId === selfId) || null
})
let markExpireTimer: number | undefined
let markHoldTimer: number | undefined
let markHoldCleared = false

function mySquadSlot() {
  const selfId = auth.user?.id || 0
  const m = squadHud.value.find((s) => s.userId === selfId)
  return m?.slot || 1
}

function syncSquadMarkVisuals() {
  const now = Date.now()
  squadMarks.value = squadMarks.value.filter((m) => m.expiresAt > now)
  engine?.setSquadMarks(squadMarks.value)
}

function upsertSquadMark(mark: SquadMark) {
  const list = squadMarks.value.filter((m) => m.userId !== mark.userId)
  list.push(mark)
  squadMarks.value = list
  syncSquadMarkVisuals()
  if (markExpireTimer) window.clearTimeout(markExpireTimer)
  const soonest = Math.min(...squadMarks.value.map((m) => m.expiresAt - Date.now()))
  if (Number.isFinite(soonest) && soonest > 0) {
    markExpireTimer = window.setTimeout(() => syncSquadMarkVisuals(), soonest + 30)
  }
}

function removeSquadMark(userId: number) {
  squadMarks.value = squadMarks.value.filter((m) => m.userId !== userId)
  syncSquadMarkVisuals()
}

function clearMySquadMark() {
  const selfId = auth.user?.id || 0
  if (!selfId) return
  if (!squadMarks.value.some((m) => m.userId === selfId)) return
  removeSquadMark(selfId)
  presence?.sendSquadMark({ clear: true })
  hint.value = '已清除标记'
  window.setTimeout(() => {
    if (hint.value === '已清除标记') hint.value = ''
  }, 1200)
}

function onMarkPointerDown() {
  markHoldCleared = false
  if (markHoldTimer) window.clearTimeout(markHoldTimer)
  markHoldTimer = window.setTimeout(() => {
    markHoldCleared = true
    clearMySquadMark()
  }, 420)
}

function onMarkPointerUp() {
  if (markHoldTimer) {
    window.clearTimeout(markHoldTimer)
    markHoldTimer = undefined
  }
  if (markHoldCleared) return
  placeSquadMark()
}

function onMarkPointerCancel() {
  if (markHoldTimer) {
    window.clearTimeout(markHoldTimer)
    markHoldTimer = undefined
  }
}

/** 局内消息（队伍/系统），条数封顶，几乎不影响性能 */
const chatMessages = ref<SquadChatItem[]>([])
/** 左上广播：仅展示近 15 秒，历史仍在队伍消息列表 */
const BROADCAST_TTL_MS = 15_000
/** 广播条最多同时显示条数（越新越靠下，超出顶掉最旧） */
const BROADCAST_MAX = 5
const broadcastLive = ref<{ id: string; who: string; text: string }[]>([])
const broadcastTimers = new Map<string, number>()

function shortChatName(userId: number, fallback?: string | null) {
  const m = squadHud.value.find((s) => s.userId === userId)
  return shortName(m?.name || fallback || '队友')
}

function pushBroadcast(item: SquadChatItem) {
  if (item.channel !== 'team' || item.kind !== 'chat') return
  const selfId = auth.user?.id || 0
  const who = item.userId === selfId ? '我' : item.name || '队友'
  const id = item.id
  const merged = [
    ...broadcastLive.value.filter((b) => b.id !== id),
    { id, who, text: item.text },
  ]
  if (merged.length > BROADCAST_MAX) {
    const dropped = merged.slice(0, merged.length - BROADCAST_MAX)
    for (const d of dropped) {
      const t = broadcastTimers.get(d.id)
      if (t) window.clearTimeout(t)
      broadcastTimers.delete(d.id)
    }
  }
  broadcastLive.value = merged.slice(-BROADCAST_MAX)
  const prev = broadcastTimers.get(id)
  if (prev) window.clearTimeout(prev)
  const tid = window.setTimeout(() => {
    broadcastTimers.delete(id)
    broadcastLive.value = broadcastLive.value.filter((b) => b.id !== id)
  }, BROADCAST_TTL_MS)
  broadcastTimers.set(id, tid)
}

function appendChat(item: SquadChatItem) {
  chatMessages.value = pushChatItem(chatMessages.value, item)
  pushBroadcast(item)
}

function publishMarkSystem(mark: SquadMark, name?: string) {
  const label = mark.label || '地点'
  const who = name || shortChatName(mark.userId)
  const item: SquadChatItem = {
    id: nextChatId(),
    channel: 'system',
    kind: 'mark',
    userId: mark.userId,
    slot: mark.slot,
    name: who,
    text: `标记了${label}`,
    ts: Date.now(),
    mark: {
      userId: mark.userId,
      slot: mark.slot,
      x: mark.x,
      y: mark.y,
      z: mark.z,
      label: mark.label,
    },
  }
  appendChat(item)
  presence?.sendSquadChat({
    channel: 'system',
    kind: 'mark',
    slot: mark.slot,
    text: item.text,
    mark: item.mark,
  })
}

function placeSquadMark() {
  const eng = engine
  const selfId = auth.user?.id || 0
  if (!eng || !selfId) return
  const aim = eng.raycastMarkAim(64)
  if (!aim) {
    hint.value = '无法标记'
    return
  }
  const slot = mySquadSlot()
  const mark: SquadMark = {
    userId: selfId,
    slot,
    x: aim.x,
    y: aim.y,
    z: aim.z,
    label: aim.label,
    expiresAt: Date.now() + SQUAD_MARK_TTL_MS,
  }
  upsertSquadMark(mark)
  presence?.sendSquadMark({
    slot: mark.slot,
    x: mark.x,
    y: mark.y,
    z: mark.z,
    label: mark.label,
  })
  publishMarkSystem(mark, shortName(auth.user?.displayName || auth.user?.username || '我'))
  hint.value = `标记 · ${aim.label}`
  window.setTimeout(() => {
    if (hint.value.startsWith('标记')) hint.value = ''
  }, 1600)
}

function sendTeamChat(text: string) {
  const selfId = auth.user?.id || 0
  const t = text.trim().slice(0, CHAT_TEXT_MAX)
  if (!selfId || !t) return
  const slot = mySquadSlot()
  const name = shortName(auth.user?.displayName || auth.user?.username || '我')
  appendChat({
    id: nextChatId(),
    channel: 'team',
    kind: 'chat',
    userId: selfId,
    slot,
    name,
    text: t,
    ts: Date.now(),
  })
  presence?.sendSquadChat({
    channel: 'team',
    kind: 'chat',
    slot,
    text: t,
  })
}

function restoreMarkFromChat(item: SquadChatItem) {
  const m = item.mark
  if (!m) return
  upsertSquadMark({
    userId: m.userId,
    slot: m.slot,
    x: m.x,
    y: m.y,
    z: m.z,
    label: m.label,
    expiresAt: Date.now() + SQUAD_MARK_TTL_MS,
  })
  hint.value = '已重新显示标记'
  window.setTimeout(() => {
    if (hint.value === '已重新显示标记') hint.value = ''
  }, 1200)
}

function ingestRemoteChat(msg: {
  userId: number
  username?: string
  displayName?: string | null
  channel?: 'team' | 'system'
  kind?: string
  slot?: number
  text?: string
  mark?: {
    userId: number
    slot: number
    x: number
    y: number
    z: number
    label?: string
  }
  ts?: number
}) {
  const selfId = auth.user?.id || 0
  if (!msg.userId || msg.userId === selfId) return
  const slot = msg.slot || squadHud.value.find((s) => s.userId === msg.userId)?.slot || 1
  const name = shortChatName(msg.userId, msg.displayName || msg.username)
  const kind = (msg.kind as SquadChatItem['kind']) || 'chat'
  const channel = msg.channel === 'system' || kind === 'mark' || kind === 'wait' ? 'system' : 'team'
  let text = (msg.text || '').trim()
  if (kind === 'mark') {
    const label = msg.mark?.label || '地点'
    text = `标记了${label}`
  } else if (kind === 'wait') {
    text = '等一下'
  }
  // kind === 'chat'：text 保持纯内容
  appendChat({
    id: nextChatId(),
    channel,
    kind,
    userId: msg.userId,
    slot,
    name,
    text,
    ts: msg.ts || Date.now(),
    mark: msg.mark
      ? {
          userId: msg.mark.userId || msg.userId,
          slot: msg.mark.slot || slot,
          x: msg.mark.x,
          y: msg.mark.y,
          z: msg.mark.z,
          label: msg.mark.label,
        }
      : undefined,
  })
}

/** 左上小队：无组队也至少显示自己为 1 号；离线队友标 offline */
const squadHud = computed(() => {
  const selfId = auth.user?.id || 0
  const onlineIds = new Set(mapPeers.value.map((p) => p.userId))
  const withOnline = (list: SquadMember[]) =>
    list.map((m) => ({
      ...m,
      online: m.userId === selfId || onlineIds.has(m.userId),
    }))

  if (squadMembers.value.length) return withOnline(squadMembers.value)
  const u = auth.user
  if (!u) return []
  return withOnline([
    {
      userId: u.id,
      name: u.displayName || u.username || '我',
      slot: 1,
    },
  ])
})

const controlLayout = reactive<ControlLayout>(loadLayoutLocal(auth.user?.id))
const editingControls = ref(false)
const editBarCollapsed = ref(false)
const editSelected = ref<ControlId | null>('stick')
const editMsg = ref('')
const importCode = ref('')
const shareCodeHint = ref('')
let layoutBackup: ControlLayout | null = null
let natureAudio: NatureAudio | null = null
let gameAudio: GameAudio | null = null

function persistSettings() {
  savePlaySettings({ ...playSettings })
}

function applyMuteNow() {
  persistSettings()
  natureAudio?.setMuted(playSettings.muted)
  gameAudio?.setMuted(playSettings.muted)
}

function applyGraphicsNow() {
  persistSettings()
  engine?.applyGraphics({
    antialias: playSettings.antialias,
    quality: playSettings.quality,
  })
}

function setQuality(q: QualityPreset) {
  playSettings.quality = q
  applyGraphicsNow()
}

function shortName(name: string) {
  const n = (name || '').trim()
  if (n.length <= 12) return n
  return `${n.slice(0, 11)}…`
}
const actionRing = reactive({
  visible: false,
  progress: 0,
  remain: 0,
  label: '',
})
const ringCirc = 2 * Math.PI * 42
const ringOffset = computed(() => ringCirc * (1 - actionRing.progress))

const materials: MaterialId[] = ['turf', 'stone', 'wood', 'dry_grass', 'dirt', 'sand']
const shapes: BuildShape[] = ['single', 'wall', 'column', 'floor']

let engine: GameEngine | null = null
let npc: NpcManager | null = null
let remotes: RemotePlayerManager | null = null
let presence: PresenceClient | null = null
let nearbyTimer: number | undefined
let blockSyncTimer: number | undefined
let partyTimer: number | undefined
let serverId = 0
let offLayout: (() => void) | undefined
let hintTimer: number | undefined
let presenceAcc = 0
let mapPeerAcc = 0
let lastBlockFetchKey = ''

const BLOCK_FETCH_RADIUS = 112
const BLOCK_FETCH_Y_MIN = -16
const BLOCK_FETCH_Y_MAX = 96

/** 待落库方块队列（按坐标去重，离开前必须冲刷） */
const pendingBlocks = new Map<string, { x: number; y: number; z: number; blockId: string }>()
let blockFlushTimer: number | undefined
let invFlushTimer: number | undefined
let invDirty = false

function blockKey(b: { x: number; y: number; z: number }) {
  return `${b.x},${b.y},${b.z}`
}

async function flushPendingBlocks() {
  if (!serverId || !pendingBlocks.size) return
  const batch = Array.from(pendingBlocks.values())
  pendingBlocks.clear()
  if (blockFlushTimer) {
    window.clearTimeout(blockFlushTimer)
    blockFlushTimer = undefined
  }
  // 分片上传，避免单次过大
  for (let i = 0; i < batch.length; i += 200) {
    const chunk = batch.slice(i, i + 200)
    try {
      await saveServerBlocks(serverId, chunk)
    } catch (e) {
      // 失败放回队列，下次再试
      for (const b of chunk) pendingBlocks.set(blockKey(b), b)
      console.warn('[blocks] save failed', e)
      throw e
    }
  }
}

function scheduleBlockFlush() {
  if (blockFlushTimer) return
  blockFlushTimer = window.setTimeout(() => {
    blockFlushTimer = undefined
    flushPendingBlocks().catch(() => undefined)
  }, 400)
}

async function flushInventory() {
  if (!serverId || !invDirty) return
  invDirty = false
  if (invFlushTimer) {
    window.clearTimeout(invFlushTimer)
    invFlushTimer = undefined
  }
  try {
    await saveServerInventory(serverId, { ...inv })
  } catch (e) {
    invDirty = true
    console.warn('[inventory] save failed', e)
  }
}

function scheduleInventoryFlush() {
  invDirty = true
  if (invFlushTimer) return
  invFlushTimer = window.setTimeout(() => {
    invFlushTimer = undefined
    flushInventory().catch(() => undefined)
  }, 800)
}

function applyInventoryFromServer(raw?: Record<string, number> | null) {
  const base = createInventory()
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(base) as MaterialId[]) {
      const n = Number(raw[k])
      base[k] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
    }
  }
  for (const k of Object.keys(base) as MaterialId[]) {
    inv[k] = base[k]
  }
}

async function fetchBlocksAround(cx: number, cz: number, force = false) {
  if (!serverId || !engine) return
  const minX = Math.floor(cx - BLOCK_FETCH_RADIUS)
  const maxX = Math.floor(cx + BLOCK_FETCH_RADIUS)
  const minZ = Math.floor(cz - BLOCK_FETCH_RADIUS)
  const maxZ = Math.floor(cz + BLOCK_FETCH_RADIUS)
  const key = `${Math.floor(cx / 16)},${Math.floor(cz / 16)}`
  if (!force && key === lastBlockFetchKey) return
  lastBlockFetchKey = key
  try {
    const list = await queryServerBlocks({
      serverId,
      minX,
      maxX,
      minY: BLOCK_FETCH_Y_MIN,
      maxY: BLOCK_FETCH_Y_MAX,
      minZ,
      maxZ,
    })
    if (list?.length && engine) {
      engine.applyRemoteBlocks(list)
      mapTerrainRev.value += 1
    }
  } catch {
    // ignore transient
  }
}

function publishLocalBlocks(
  blocks: { x: number; y: number; z: number; blockId: string }[]
) {
  if (!serverId || !blocks.length) return
  for (const b of blocks) {
    pendingBlocks.set(blockKey(b), {
      x: Math.floor(b.x),
      y: Math.floor(b.y),
      z: Math.floor(b.z),
      blockId: b.blockId,
    })
  }
  presence?.sendBlocks(blocks)
  scheduleBlockFlush()
}

async function flushWorldStateBeforeLeave() {
  // 先同步快照姿态（await 前 engine 可能被 dispose）
  const pose = engine?.getPose()
  const cam = engine?.camera.position
  const finalState =
    serverId && cam && pose
      ? {
          serverId,
          x: cam.x,
          y: cam.y,
          z: cam.z,
          yaw: pose.yaw,
          pitch: pose.pitch,
          inventory: { ...inv },
        }
      : null

  try {
    await flushPendingBlocks()
  } catch {
    /* best effort */
  }
  try {
    await flushInventory()
  } catch {
    /* best effort */
  }

  if (finalState) {
    try {
      await leaveServer(finalState)
      return
    } catch {
      /* fall through */
    }
  }
  try {
    await leaveServer()
  } catch {
    /* ignore */
  }
}

const landscape = inject<{
  forced: Ref<boolean>
  tryNativeLock: () => Promise<void>
}>('landscape')
const landscapeForced = computed(() => Boolean(landscape?.forced.value))

const routeServerId = computed(() => Number(route.params.serverId))

function detectInput() {
  isTouch.value =
    window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

async function enterFullscreen() {
  try {
    await landscape?.tryNativeLock()
  } catch {
    // ignore
  }
}

/** 异步加载后可能丢失手势授权，首次点击再补一次全屏 */
function armFullscreenGesture() {
  const tryFs = () => {
    if (document.fullscreenElement) return
    void enterFullscreen()
  }
  window.addEventListener('pointerdown', tryFs, { once: true, capture: true })
  window.addEventListener('touchstart', tryFs, { once: true, capture: true, passive: true })
  window.addEventListener('keydown', tryFs, { once: true, capture: true })
}

function syncEngineLoadout() {
  if (!engine) return
  engine.tool = tool.value
  engine.matArmed = selectedMat.value != null
  if (selectedMat.value) engine.buildMaterial = selectedMat.value
  engine.buildShape = buildShape.value
  engine.inventory = inv
  engine.setBuildMode(selectedMat.value != null)
}

function selectMat(m: MaterialId) {
  selectedMat.value = selectedMat.value === m ? null : m
  syncEngineLoadout()
  if (engine) {
    engine.lastActionHint = selectedMat.value
      ? `建造 · ${MATERIAL_LABEL[selectedMat.value]} · 对准后点「放置」`
      : '操作模式 · 点「操作」挖砍采'
    flashHint()
  }
}
function setTool(t: ToolId) {
  tool.value = t
  syncEngineLoadout()
}
function setShape(s: BuildShape) {
  buildShape.value = s
  syncEngineLoadout()
}

function flashHint() {
  if (!engine?.lastActionHint) return
  actionHint.value = engine.lastActionHint
  engine.lastActionHint = ''
  if (hintTimer) window.clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => {
    actionHint.value = ''
  }, 2200)
}

function onMove(forward: number, strafe: number) {
  engine?.setMoveInput(forward, strafe)
}
function onLook(dx: number, dy: number) {
  engine?.applyLook(dx, dy, 0.0062)
}
function onJump() {
  engine?.queueJump()
}
function onCrouchToggle() {
  engine?.queueCrouch()
  crouched.value = Boolean(engine?.crouching)
}
/** 操作键：有材料则建造，否则挖砍采 */
function onBreak() {
  if (!engine) return
  if (selectedMat.value) {
    engine.beginBuild()
  } else {
    engine.beginHarvest()
    tool.value = engine.tool
    syncEngineLoadout()
  }
  flashHint()
}

function layoutUserId() {
  return auth.user?.id || null
}

function applyLayout(layout: ControlLayout) {
  const next = normalizeControlLayout(layout)
  for (const id of CONTROL_IDS) {
    controlLayout.items[id] = { ...next.items[id] }
  }
  controlLayout.version = 3
  saveLayoutLocal(controlLayout, layoutUserId())
}

function enterControlEdit() {
  showSettings.value = false
  layoutBackup = JSON.parse(JSON.stringify(controlLayout)) as ControlLayout
  editingControls.value = true
  // 默认收起，避免挡键位；需要调大小/透明度再展开
  editBarCollapsed.value = true
  editSelected.value = 'stick'
  editMsg.value = `拖动控件调整位置（引擎 v${CONTROL_DRAG_VERSION}）`
}

function cancelControlEdit() {
  onHudUp()
  if (layoutBackup) applyLayout(layoutBackup)
  layoutBackup = null
  editingControls.value = false
  editBarCollapsed.value = false
  editMsg.value = ''
}

function resetControls() {
  applyLayout(defaultControlLayout())
  editMsg.value = '已恢复默认（未保存到云端）'
}

function onControlSelect(id: ControlId) {
  editSelected.value = id
}

function onControlDrag(id: ControlId, patch: { x?: number; y?: number }) {
  const cur = controlLayout.items[id]
  controlLayout.items[id] = clampItem({
    ...cur,
    x: patch.x ?? cur.x,
    y: patch.y ?? cur.y,
  })
}

const hudDragId = ref<number | null>(null)
const hudDragging = ref<ControlId | null>(null)
const hudDragSession = ref<DragSession | null>(null)

function hudWidgetStyle(id: 'targetHint' | 'actionRing') {
  const it = controlLayout.items[id]
  const base = id === 'actionRing' ? 88 : 32
  const size = base * it.size
  return {
    left: `${it.x}%`,
    bottom: `${it.y}%`,
    width: id === 'actionRing' ? `${size}px` : 'auto',
    height: id === 'actionRing' ? `${size}px` : 'auto',
    fontSize: id === 'targetHint' ? `${Math.max(0.62, 0.78 * it.size)}rem` : undefined,
    opacity: it.opacity,
    pointerEvents: (editingControls.value ? 'auto' : 'none') as 'auto' | 'none',
    zIndex: editingControls.value ? 45 : 5,
  }
}

const hudWinOpts: AddEventListenerOptions = { capture: true, passive: false }

function unbindHudWindowDrag() {
  window.removeEventListener('pointermove', onHudWindowMove, hudWinOpts)
  window.removeEventListener('pointerup', onHudWindowUp, hudWinOpts)
  window.removeEventListener('pointercancel', onHudWindowUp, hudWinOpts)
}

function bindHudWindowDrag() {
  unbindHudWindowDrag()
  window.addEventListener('pointermove', onHudWindowMove, hudWinOpts)
  window.addEventListener('pointerup', onHudWindowUp, hudWinOpts)
  window.addEventListener('pointercancel', onHudWindowUp, hudWinOpts)
}

function onHudDown(e: PointerEvent, id: 'targetHint' | 'actionRing') {
  if (!editingControls.value) return
  e.preventDefault()
  e.stopPropagation()
  editSelected.value = id
  hudDragging.value = id
  hudDragId.value = e.pointerId
  const el = e.currentTarget as HTMLElement
  const it = controlLayout.items[id]
  const boxW = el.offsetWidth || (id === 'actionRing' ? 88 : 120) * it.size
  const boxH = el.offsetHeight || (id === 'actionRing' ? 88 : 36) * it.size
  hudDragSession.value = beginDragSession(
    e.clientX,
    e.clientY,
    e.pointerId,
    it.x,
    it.y,
    boxW,
    boxH
  )
  bindHudWindowDrag()
  try {
    el.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

function applyHudDrag(e: PointerEvent) {
  const id = hudDragging.value
  const session = hudDragSession.value
  if (!editingControls.value || !id || !session || e.pointerId !== session.pointerId) return
  const next = moveDragSession(e.clientX, e.clientY, session)
  controlLayout.items[id] = clampItem({
    ...controlLayout.items[id],
    x: next.x,
    y: next.y,
  })
}

function onHudWindowMove(e: PointerEvent) {
  if (!hudDragging.value || e.pointerId !== hudDragId.value) return
  e.preventDefault()
  applyHudDrag(e)
}

function onHudWindowUp(e: PointerEvent) {
  if (e.pointerId !== hudDragId.value) return
  e.preventDefault()
  onHudUp()
}

function onHudMove(e: PointerEvent, id: 'targetHint' | 'actionRing') {
  if (!editingControls.value || hudDragging.value !== id || e.pointerId !== hudDragId.value) return
  applyHudDrag(e)
}

function onHudUp(_e?: PointerEvent) {
  hudDragging.value = null
  hudDragId.value = null
  hudDragSession.value = null
  unbindHudWindowDrag()
}

function onSizeSlider(e: Event) {
  const id = editSelected.value
  if (!id) return
  const v = Number((e.target as HTMLInputElement).value)
  controlLayout.items[id] = clampItem({ ...controlLayout.items[id], size: v })
}

function onOpacitySlider(e: Event) {
  const id = editSelected.value
  if (!id) return
  const v = Number((e.target as HTMLInputElement).value)
  controlLayout.items[id] = clampItem({ ...controlLayout.items[id], opacity: v })
}

async function saveControls() {
  try {
    onHudUp()
    const normalized = normalizeControlLayout(controlLayout)
    saveLayoutLocal(normalized, layoutUserId())
    const data = await saveControlLayout(normalized)
    if (data.layout) applyLayout(data.layout)
    layoutBackup = null
    editingControls.value = false
    editMsg.value = ''
    shareCodeHint.value = data.shareCode ? `已保存 · 键位码 ${data.shareCode}` : '键位已保存到账号'
  } catch (e) {
    editMsg.value = e instanceof Error ? e.message : '保存失败'
  }
}

async function doShareCode() {
  try {
    const normalized = normalizeControlLayout(controlLayout)
    saveLayoutLocal(normalized, layoutUserId())
    await saveControlLayout(normalized)
    const data = await shareControlLayout()
    editMsg.value = `键位码：${data.shareCode}（可复制分享）`
    shareCodeHint.value = `键位码 ${data.shareCode}`
    try {
      await navigator.clipboard.writeText(data.shareCode)
      editMsg.value += ' · 已复制'
    } catch {
      /* ignore */
    }
  } catch (e) {
    editMsg.value = e instanceof Error ? e.message : '分享失败'
  }
}

async function doImportCode() {
  try {
    const data = await importControlLayout(importCode.value)
    if (data.layout) applyLayout(data.layout)
    shareCodeHint.value = '已导入键位配置'
    importCode.value = ''
    showSettings.value = false
  } catch (e) {
    shareCodeHint.value = e instanceof Error ? e.message : '导入失败'
  }
}

async function loadCloudLayout() {
  try {
    const data = await fetchControlLayout()
    if (data.layout) {
      applyLayout(data.layout)
    } else {
      // 新账号无云端键位：强制官方默认，不继承本机其它账号的乱布局
      applyLayout(defaultControlLayout())
    }
    if (data.shareCode) shareCodeHint.value = `键位码 ${data.shareCode}`
  } catch {
    applyLayout(loadLayoutLocal(layoutUserId()))
  }
}

async function refreshPartyHud() {
  const selfName = auth.user?.displayName || auth.user?.username || '我'
  const selfId = auth.user?.id || 0
  try {
    const data = await fetchPartyMine()
    const members = (data.members || []).slice(0, 4)
    if (members.length) {
      squadMembers.value = members.map((m, i) => ({
        userId: m.userId,
        name: m.displayName || m.username,
        slot: i + 1,
      }))
      return
    }
  } catch {
    // fall through to solo
  }
  squadMembers.value = selfId
    ? [{ userId: selfId, name: selfName, slot: 1 }]
    : []
}

async function goExitServer() {
  if (leaving.value) return
  leaving.value = true
  showSettings.value = false
  try {
    presence?.disconnect()
    presence = null
    await flushWorldStateBeforeLeave()
  } catch {
    // 会话已失效也继续清本地
  }
  clearLastServerId()
  try {
    sessionStorage.removeItem('sv_join')
  } catch {
    // ignore
  }
  try {
    await router.push('/servers?change=1')
  } catch {
    leaving.value = false
  }
}

function syncActionUi() {
  if (!engine) return
  targetName.value = engine.targetName
  const busy = engine.actionKind != null && engine.actionRemainSec > 0
  actionRing.visible = busy
  actionRing.progress = engine.actionProgress
  actionRing.remain = engine.actionRemainSec
  actionRing.label = engine.targetActionLabel
  if (engine.lastActionHint) flashHint()
}

function onPlayKeyDown(e: KeyboardEvent) {
  if (e.repeat || editingControls.value || showSettings.value) return
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  // E：取消材料（退出建造）
  if (e.code === 'KeyE') {
    e.preventDefault()
    if (selectedMat.value) {
      selectedMat.value = null
      syncEngineLoadout()
      if (engine) {
        engine.lastActionHint = '已取消材料 · 操作模式'
        flashHint()
      }
    }
  }
}

async function refreshNearby() {
  if (!serverId) return
  try {
    const list = await nearbyPlayers(serverId)
    npc?.setNearbyHumanCount(list.length)
    // WS 未连上时用轮询兜底画人
    if (remotes && (!presence || list.length)) {
      // 仅补充：不覆盖 WS 更实时的数据太狠，只在 remotes 为空时灌入
      if (remotes.count() === 0 && list.length) {
        remotes.syncList(
          list.map((p) => ({
            userId: p.userId,
            username: p.username,
            displayName: p.displayName,
            x: p.x,
            y: p.y,
            z: p.z,
            yaw: 0,
            pitch: 0,
            action: null,
          }))
        )
      }
    }
    peerHint.value = remotes && remotes.count() > 0 ? `附近玩家 ${remotes.count()}` : ''
  } catch {
    // ignore
  }
}

watch(
  squadHud,
  (list) => {
    remotes?.setSquadSlots(list)
  },
  { deep: true }
)

onMounted(async () => {
  detectInput()
  // 清掉跨账号共用的旧键位缓存
  try {
    localStorage.removeItem('sv_control_layout')
  } catch {
    /* ignore */
  }
  // 尽早抢全屏（异步过久会丢掉点击手势授权）
  void enterFullscreen()
  armFullscreenGesture()
  offLayout = onLandscapeLayout(() => engine?.resize())
  if (!auth.user) await auth.loadMe()
  // 按当前账号载入本地键位（避免沿用上一账号）
  applyLayout(loadLayoutLocal(layoutUserId()))

  if (!viewport.value) return
  try {
    // 先塞自己进小队条，避免接口返回前左上空白
    refreshPartyHud()
    // 必须重新 join 建立 server_sessions，否则方块/仓库保存会 409 被静默吞掉
    const data = await joinServer(routeServerId.value)
    try {
      sessionStorage.setItem('sv_join', JSON.stringify(data))
    } catch {
      /* ignore */
    }
    serverId = data.server.id
    serverName.value = data.server.name
    setLastServerId(serverId)
    applyInventoryFromServer(data.inventory)

    engine = new GameEngine(viewport.value, data.server.seed ?? 42, {
      antialias: playSettings.antialias,
      quality: playSettings.quality,
    })
    mapTerrainRev.value += 1
    gameAudio = new GameAudio()
    gameAudio.setMuted(playSettings.muted)
    gameAudio.ensure()
    engine.audio = gameAudio
    engine.inventory = inv
    engine.onInventoryChange = () => {
      scheduleInventoryFlush()
    }
    engine.onBlocksChange = (blocks) => {
      publishLocalBlocks(blocks)
      mapTerrainRev.value += 1
    }
    syncEngineLoadout()

    const sp = data.player
    engine.setSpawn(sp.x, sp.y || SURFACE_Y + 2, sp.z, sp.yaw, sp.pitch)
    await fetchBlocksAround(sp.x, sp.z, true)
    engine.onPosition = (pos) => {
      hint.value = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`
      serverHeartbeat({
        serverId,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: pos.yaw,
        pitch: pos.pitch,
      }).catch(() => undefined)
      fetchBlocksAround(pos.x, pos.z).catch(() => undefined)
    }
    engine.onFrame = (dt) => {
      const eng = engine
      if (!eng) return
      npc?.update(dt)
      remotes?.update(dt)
      if (eng.tool !== tool.value) tool.value = eng.tool
      crouched.value = eng.crouching
      mapMe.x = eng.camera.position.x
      mapMe.z = eng.camera.position.z
      mapMe.yaw = eng.getPose().yaw
      mapPeerAcc += dt
      if (mapPeerAcc > 0.25) {
        mapPeerAcc = 0
        mapPeers.value = remotes?.listMapPeers() || []
      }
      natureAudio?.setCreekDistance(eng.getCreekDistance(mapMe.x, mapMe.z))
      syncActionUi()

      presenceAcc += dt
      if (presenceAcc > 0.12 && presence) {
        presenceAcc = 0
        const pose = eng.getPose()
        presence.sendPresence({
          x: eng.camera.position.x,
          y: eng.camera.position.y,
          z: eng.camera.position.z,
          yaw: pose.yaw,
          pitch: pose.pitch,
          action: pose.action,
          crouching: pose.crouching,
        })
      }
    }
    engine.onActionUi = () => syncActionUi()

    npc = new NpcManager(
      engine.scene,
      engine.camera,
      data.npcPolicy as import('@/api/server').NpcPolicy,
      {
        standY: (x, z) => engine!.getNpcStandY(x, z),
        walkable: (x, z) => engine!.isNpcWalkable(x, z),
        nearBuild: (x, z, r) => engine!.isPlayerStructureNear(x, z, r ?? 5),
      }
    )
    npc.audio = gameAudio

    remotes = new RemotePlayerManager(engine.scene)
    remotes.audio = gameAudio
    remotes.listener = () => ({
      x: engine!.camera.position.x,
      z: engine!.camera.position.z,
    })
    remotes.setSquadSlots(squadHud.value)
    if (auth.token) {
      presence = new PresenceClient()
      presence.connect(auth.token, serverId, {
        onPeers: (peers) => remotes?.syncList(peers),
        onPresence: (peer) => remotes?.upsert(peer),
        onLeft: (uid) => {
          remotes?.remove(uid)
          removeSquadMark(uid)
        },
        onBlocks: (blocks) => {
          engine?.applyRemoteBlocks(blocks)
          if (blocks?.length) mapTerrainRev.value += 1
        },
        onSquadMark: (msg) => {
          const uid = Number(msg.userId)
          if (!uid || uid === auth.user?.id) return
          if (msg.clear) {
            removeSquadMark(uid)
            return
          }
          const slot =
            msg.slot ||
            squadHud.value.find((s) => s.userId === uid)?.slot ||
            1
          upsertSquadMark({
            userId: uid,
            slot,
            x: Number(msg.x) || 0,
            y: Number(msg.y) || 0,
            z: Number(msg.z) || 0,
            label: msg.label || '',
            expiresAt: Date.now() + SQUAD_MARK_TTL_MS,
          })
        },
        onSquadChat: (msg) => ingestRemoteChat(msg),
      })
    }

    engine.start()
    loading.value = false
    window.addEventListener('keydown', onPlayKeyDown)
    natureAudio = new NatureAudio()
    natureAudio.setMuted(playSettings.muted)
    natureAudio.start()
    gameAudio?.ensure()
    await loadCloudLayout()
    await enterFullscreen()
    if (!document.fullscreenElement) armFullscreenGesture()
    nearbyTimer = window.setInterval(() => {
      if (document.hidden) return
      refreshNearby()
    }, 5000)
    refreshNearby()
    refreshPartyHud()
    partyTimer = window.setInterval(() => {
      if (document.hidden) return
      refreshPartyHud()
    }, 10000)
    blockSyncTimer = window.setInterval(() => {
      if (document.hidden || !engine) return
      fetchBlocksAround(engine.camera.position.x, engine.camera.position.z, true).catch(
        () => undefined
      )
    }, 16000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '进入失败'
    loading.value = false
  }
})

onBeforeUnmount(() => {
  onHudUp()
  offLayout?.()
  window.removeEventListener('keydown', onPlayKeyDown)
  if (nearbyTimer) window.clearInterval(nearbyTimer)
  if (blockSyncTimer) window.clearInterval(blockSyncTimer)
  if (partyTimer) window.clearInterval(partyTimer)
  if (hintTimer) window.clearTimeout(hintTimer)
  if (blockFlushTimer) window.clearTimeout(blockFlushTimer)
  if (invFlushTimer) window.clearTimeout(invFlushTimer)
  if (markExpireTimer) window.clearTimeout(markExpireTimer)
  if (markHoldTimer) window.clearTimeout(markHoldTimer)
  for (const tid of broadcastTimers.values()) window.clearTimeout(tid)
  broadcastTimers.clear()
  natureAudio?.stop()
  natureAudio = null
  gameAudio?.dispose()
  gameAudio = null
  presence?.disconnect()
  presence = null
  // 同步冲刷（不 await unmount，但尽量 fire-and-await via void）
  void flushWorldStateBeforeLeave()
  sessionStorage.removeItem('sv_join')
  remotes?.dispose()
  remotes = null
  npc?.dispose()
  npc = null
  engine?.dispose()
  engine = null
})
</script>

<style scoped>
.play {
  position: relative;
  width: 100%;
  height: 100%;
  background: #87ceeb;
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: none;
  /* 局内文案不可选中复制，减少误触 */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.play :deep(input),
.play :deep(textarea) {
  -webkit-user-select: text;
  user-select: text;
}

/* 编辑键位时关掉会抢触摸的 HUD 交互层 */
.play.editing-controls .hotbar,
.play.editing-controls .corner-right,
.play.editing-controls .warehouse,
.play.editing-controls .desk-ware {
  pointer-events: none !important;
}

.viewport {
  width: 100%;
  height: 100%;
}

.viewport :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.hud {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 4;
  display: block;
  padding:
    max(0.4rem, env(safe-area-inset-top))
    max(0.4rem, env(safe-area-inset-right))
    max(0.35rem, env(safe-area-inset-bottom))
    max(0.4rem, env(safe-area-inset-left));
}

/* 左上：小队 + 广播 */
.corner-left {
  pointer-events: none;
  position: absolute;
  left: max(0.4rem, env(safe-area-inset-left));
  top: max(0.4rem, env(safe-area-inset-top));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.28rem;
  max-width: min(240px, 46vw);
  z-index: 9;
}

.squad-strip {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  width: 100%;
}

.broadcast-feed {
  /* 固定约 5 行高度，越新越靠下；透明背景 */
  box-sizing: border-box;
  width: 100%;
  height: 6.9rem;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.18rem;
  overflow: hidden;
  background: transparent;
  pointer-events: none;
}

.bcast {
  flex-shrink: 0;
  background: transparent;
  color: rgba(245, 248, 247, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75), 0 0 6px rgba(0, 0, 0, 0.35);
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.3;
  word-break: break-word;
  max-height: 1.3em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  animation: bcast-in 0.2s ease-out;
}

.b-who {
  font-weight: 800;
  color: rgba(240, 201, 58, 0.95);
}

.b-sep {
  color: rgba(236, 242, 244, 0.55);
}

.b-txt {
  color: rgba(245, 248, 247, 0.92);
}

@keyframes bcast-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.squad-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.12rem 0.4rem 0.12rem 0.18rem;
  border-radius: 4px;
  background: rgba(8, 14, 18, 0.38);
  color: rgba(245, 248, 247, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
  min-width: 0;
}

.squad-row .slot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.9);
  color: #111;
  font-size: 0.58rem;
  font-style: normal;
  font-weight: 800;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.squad-row .sname {
  flex: 1;
  min-width: 0;
  font-size: 0.68rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.squad-row .offline {
  flex-shrink: 0;
  font-size: 0.56rem;
  font-weight: 600;
  color: rgba(160, 168, 172, 0.85);
  letter-spacing: 0.02em;
}

/* 右上：地图在上，设置在下 */
.corner-right {
  pointer-events: auto;
  position: absolute;
  right: max(0.4rem, env(safe-area-inset-right));
  top: max(0.4rem, env(safe-area-inset-top));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.3rem;
  z-index: 10;
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
}

.icon-btn .gear {
  width: 16px;
  height: 16px;
  display: block;
}

.icon-btn.mark-btn.active {
  border-color: rgba(240, 201, 58, 0.65);
  background: rgba(240, 201, 58, 0.22);
  color: #ffe9a0;
}

.icon-btn:active {
  transform: scale(0.96);
}

.settings-overlay {
  pointer-events: auto;
  position: absolute;
  inset: 0;
  z-index: 3200;
  display: grid;
  place-items: center;
  padding: max(0.6rem, env(safe-area-inset-top)) max(0.8rem, env(safe-area-inset-right))
    max(0.6rem, env(safe-area-inset-bottom)) max(0.8rem, env(safe-area-inset-left));
  background: rgba(0, 0, 0, 0.5);
  box-sizing: border-box;
}

.settings-panel {
  pointer-events: auto;
  width: min(560px, 92%);
  max-width: 92%;
  max-height: min(86%, 520px);
  height: auto;
  display: flex;
  flex-direction: column;
  background: rgba(18, 26, 32, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  color: #e8eef0;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
  overflow: hidden;
}

.settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-shrink: 0;
  padding: 0.7rem 0.85rem 0.55rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.settings-panel h3 {
  margin: 0;
  font-size: 1rem;
}

.settings-head .head-close {
  margin: 0;
  width: auto;
  padding: 0.35rem 0.7rem;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 0.75rem 1rem 1rem;
  touch-action: pan-y;
}

.settings-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}

.settings-actions .settings-link {
  width: 100%;
  margin: 0;
  text-align: center;
}

.settings-block {
  margin: 0.55rem 0 0.35rem;
}

.settings-label {
  display: block;
  font-size: 0.72rem;
  color: rgba(232, 238, 240, 0.65);
  margin-bottom: 0.3rem;
}

.settings-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip-set {
  flex: 1;
  min-width: 4.5rem;
  padding: 0.45rem 0.35rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(232, 238, 240, 0.85);
  font-size: 0.78rem;
  cursor: pointer;
}

.chip-set.active {
  border-color: rgba(126, 231, 220, 0.55);
  background: rgba(126, 231, 220, 0.16);
  color: #9fd9cf;
  font-weight: 700;
}

.settings-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0;
  padding: 0.35rem 0;
  font-size: 0.85rem;
  color: rgba(232, 238, 240, 0.9);
  cursor: pointer;
  user-select: none;
}

.settings-toggle input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #7ee7dc;
  flex-shrink: 0;
}

.settings-link {
  display: block;
  width: 100%;
  text-align: left;
  margin: 0.4rem 0;
  padding: 0.55rem 0.65rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #9fd9cf;
  cursor: pointer;
  font: inherit;
  font-size: 0.88rem;
  text-decoration: none;
  box-sizing: border-box;
}

.settings-link.danger {
  border-color: rgba(255, 140, 140, 0.45);
  background: rgba(120, 40, 40, 0.35);
  color: #ffc9c9;
}

.settings-import {
  display: flex;
  gap: 0.35rem;
  margin: 0.35rem 0;
  align-items: center;
}

.code-input {
  flex: 1;
  min-width: 0;
  padding: 0.35rem 0.45rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.25);
  color: #e8eef0;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.settings-link.slim {
  width: auto;
  margin: 0;
  padding: 0.35rem 0.55rem;
  white-space: nowrap;
}

.ctrl-edit-bar {
  pointer-events: auto;
  position: absolute;
  left: 50%;
  top: max(0.4rem, env(safe-area-inset-top));
  bottom: auto;
  transform: translateX(-50%);
  z-index: 30;
  width: min(420px, 72%);
  background: rgba(12, 20, 26, 0.88);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  padding: 0.55rem 0.7rem 0.65rem;
  color: #e8eef0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
}

.ctrl-edit-bar.collapsed {
  width: auto;
  max-width: min(92vw, 360px);
  padding: 0.3rem 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.ctrl-collapse {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #e8f4f2;
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.ctrl-collapse svg {
  width: 18px;
  height: 18px;
}

.ctrl-edit-bar.collapsed .ctrl-collapse {
  position: static;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
}

.ctrl-edit-mini {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.ctrl-edit-mini > span {
  font-size: 0.7rem;
  color: rgba(232, 238, 240, 0.85);
  max-width: 7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctrl-edit-mini .mini-save,
.ctrl-edit-mini .mini-cancel {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #e8eef0;
  border-radius: 6px;
  padding: 0.28rem 0.5rem;
  font-size: 0.68rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.ctrl-edit-mini .mini-save {
  background: rgba(61, 214, 198, 0.45);
  border-color: #7ee7dc;
}

.ctrl-edit-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.78rem;
  margin-bottom: 0.4rem;
  padding-right: 2rem;
}

.ctrl-edit-head span {
  color: rgba(232, 238, 240, 0.55);
  font-size: 0.68rem;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.7rem;
  margin: 0.25rem 0;
}

.slider-row span {
  width: 3.2rem;
  flex-shrink: 0;
  color: rgba(232, 238, 240, 0.7);
}

.slider-row input {
  flex: 1;
}

.ctrl-edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.ctrl-edit-actions button {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #e8eef0;
  border-radius: 6px;
  padding: 0.35rem 0.55rem;
  font-size: 0.7rem;
  cursor: pointer;
}

.ctrl-edit-actions button.primary {
  background: rgba(61, 214, 198, 0.45);
  border-color: #7ee7dc;
}

.ctrl-edit-msg {
  margin: 0.4rem 0 0;
  font-size: 0.68rem;
  color: #f0c878;
}

.settings-note {
  font-size: 0.68rem;
  color: rgba(232, 238, 240, 0.5);
  margin: 0.4rem 0;
}

.ghost-close {
  margin-top: 0.25rem;
  border: none;
  background: transparent;
  color: rgba(232, 238, 240, 0.55);
  cursor: pointer;
  font-size: 0.72rem;
}

.desk-ware {
  pointer-events: auto;
  position: absolute;
  right: max(0.75rem, env(safe-area-inset-right));
  bottom: max(6.5rem, calc(env(safe-area-inset-bottom) + 5.5rem));
  width: 56px;
  height: 56px;
  border-radius: 12px;
  border: 2px solid rgba(180, 160, 255, 0.9);
  background: rgba(50, 40, 90, 0.75);
  color: #e8f4f2;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 5;
  padding: 0;
}

.warehouse {
  pointer-events: auto;
  position: absolute;
  left: max(0.4rem, env(safe-area-inset-left));
  top: max(0.4rem, env(safe-area-inset-top));
  z-index: 7;
  background: rgba(12, 20, 26, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  max-width: min(420px, 92vw);
  color: #e8eef0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
}

.warehouse h3 {
  margin: 0 0 0.45rem;
  font-size: 0.85rem;
  color: rgba(245, 248, 247, 0.92);
}

.ware-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.35rem;
}

.ware-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.45rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: #e8f4f2;
  cursor: pointer;
  font-size: 0.75rem;
  -webkit-tap-highlight-color: transparent;
}

.ware-item .mlabel {
  text-align: left;
  color: rgba(232, 244, 242, 0.92);
  font-size: 0.72rem;
}

.ware-item .mat-icon,
.hotbar .mat-icon {
  color: #e8f4f2;
}

.ware-item.active {
  border-color: rgba(126, 231, 220, 0.85);
  background: rgba(61, 214, 198, 0.22);
  box-shadow: 0 0 0 1px rgba(61, 214, 198, 0.25);
}

.mqty {
  font-weight: 700;
  color: #f0c878;
}

.ware-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.5rem;
  font-size: 0.72rem;
  color: rgba(232, 238, 240, 0.75);
}

.chip {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #e8eef0;
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  font-size: 0.7rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.chip.active {
  background: rgba(61, 214, 198, 0.55);
  color: #fff;
  border-color: #7ee7dc;
}

.ware-tip {
  margin: 0.45rem 0 0;
  font-size: 0.68rem;
  color: rgba(232, 238, 240, 0.55);
}

.bottom {
  pointer-events: none;
  position: absolute;
  left: 0;
  right: 0;
  bottom: max(0.25rem, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.28rem;
  padding: 0 0.5rem 0.1rem;
}

.tips {
  font-size: 0.68rem;
  color: rgba(245, 248, 247, 0.72);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  text-align: center;
  max-width: 90vw;
  opacity: 0.85;
}

.hotbar {
  pointer-events: auto;
  display: flex;
  gap: 0.35rem;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 98vw;
}

.hotbar .slot {
  position: relative;
  min-width: 3.4rem;
  width: auto;
  height: auto;
  border: 1.5px solid rgba(255, 255, 255, 0.22);
  background: rgba(12, 20, 26, 0.42);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.18rem;
  padding: 0.4rem 0.45rem 0.3rem;
  font-size: 0.68rem;
  color: #e8f4f2;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  cursor: pointer;
  box-sizing: border-box;
}

.hotbar .slot .id {
  line-height: 1.15;
  letter-spacing: 0.04em;
  color: rgba(232, 244, 242, 0.95);
  white-space: nowrap;
  text-align: center;
  font-size: 0.68rem;
}

.hotbar .slot .mat-icon {
  flex-shrink: 0;
}

.hotbar .slot.tool {
  background: rgba(31, 138, 122, 0.28);
}

.hotbar .slot.active {
  border-color: rgba(126, 231, 220, 0.85);
  background: rgba(61, 214, 198, 0.22);
  box-shadow: 0 0 0 1px rgba(61, 214, 198, 0.25);
}

.hotbar .qty {
  position: absolute;
  top: 2px;
  right: 4px;
  margin: 0;
  color: #f0c878;
  font-weight: 700;
  font-size: 0.62rem;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
  pointer-events: none;
}

.aim {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 3;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translate(-50%, -50%);
}

.crosshair {
  width: 14px;
  height: 14px;
  border: 1.5px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  box-shadow:
    0 0 0 1.5px rgba(0, 0, 0, 0.65),
    inset 0 0 0 1px rgba(0, 0, 0, 0.35);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    width 0.18s ease,
    height 0.18s ease;
}
.aim.build .crosshair {
  width: 18px;
  height: 18px;
  border-color: rgba(142, 240, 180, 0.95);
  box-shadow:
    0 0 0 1.5px rgba(0, 0, 0, 0.55),
    0 0 10px rgba(90, 210, 140, 0.55),
    inset 0 0 0 1px rgba(0, 40, 20, 0.35);
}

.aim-toast {
  margin-top: 40px;
  padding: 0.28rem 0.7rem;
  border-radius: 6px;
  background: rgba(12, 22, 28, 0.72);
  border: 1px solid rgba(240, 200, 120, 0.45);
  color: #f0c878;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
  white-space: nowrap;
}

.hud-widget {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  -webkit-tap-highlight-color: transparent;
  box-sizing: border-box;
}

.hud-widget.selected {
  outline: 2px solid #f0c878;
  outline-offset: 3px;
  box-shadow: 0 0 0 4px rgba(240, 200, 120, 0.25);
}

.hud-widget .edit-tag {
  position: absolute;
  bottom: -1.1rem;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.58rem;
  color: rgba(240, 200, 120, 0.95);
  white-space: nowrap;
  text-shadow: 0 1px 2px #000;
}

.target-hint {
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  background: rgba(12, 22, 28, 0.55);
  color: #f2f7f5;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
  white-space: nowrap;
  display: grid;
  place-items: center;
}

.action-ring {
  display: grid;
  place-items: center;
}

.ring-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: rgba(0, 0, 0, 0.35);
  stroke-width: 6;
}

.ring-fg {
  fill: none;
  stroke: #f0c878;
  stroke-width: 6;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.05s linear;
}

.ring-time {
  position: relative;
  z-index: 1;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 3px #000;
}

.ring-label {
  position: absolute;
  top: calc(100% + 2px);
  font-size: 0.62rem;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 2px #000;
  white-space: nowrap;
}

.overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-content: center;
  justify-items: center;
  background: rgba(7, 16, 21, 0.92);
}

.overlay.error {
  color: var(--danger);
  font-family: var(--font-display);
  letter-spacing: 0.08em;
  text-align: center;
  padding: 1.5rem;
}
</style>
