<template>
  <div class="play">
    <div ref="viewport" class="viewport" />

    <div class="hud">
      <!-- 左上：小队条（无人组队也显示自己） -->
      <div v-if="squadHud.length" class="squad-strip">
        <div v-for="m in squadHud" :key="m.userId" class="squad-row">
          <i class="slot" :style="{ background: squadColor(m.slot) }">{{ m.slot }}</i>
          <span class="sname">{{ shortName(m.name) }}</span>
          <span v-if="m.online === false" class="offline">离线</span>
        </div>
      </div>

      <!-- 右上：地图 + 下方设置 -->
      <div class="corner-right">
        <MiniMap
          :my-x="mapMe.x"
          :my-z="mapMe.z"
          :my-yaw="mapMe.yaw"
          :my-user-id="auth.user?.id || 0"
          :peers="mapPeers"
          :squad-members="squadHud"
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
          「模式」开关铲子/锤子 · 「操作/放置」执行 · 砍树采石会自动用斧
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
        <p v-if="isTouch" class="mode-chip" :class="{ build: buildMode }">
          <GameIcon class="mode-chip-icon" :name="modeIcon" :size="14" />
          <span>{{
            buildMode
              ? selectedMat
                ? `建造中 · 对准表面后点「放置」`
                : `建造中 · 先点下方材料`
              : `操作中 · 点「模式」可建造`
          }}</span>
        </p>
        <p v-else class="tips">
          {{
            actionHint ||
            `格子#${myCellNum} · Q${buildMode ? '建造' : '操作'} · E切换模式 · C蹲 · ${breakLabel}`
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
      @pointerup="onHudUp($event, 'actionRing')"
      @pointercancel="onHudUp($event, 'actionRing')"
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
      @pointerup="onHudUp($event, 'targetHint')"
      @pointercancel="onHudUp($event, 'targetHint')"
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
      @place="onPlace"
      @crouch-toggle="onCrouchToggle"
      @warehouse="showWare = !showWare"
      @select="onControlSelect"
      @update-item="onControlDrag"
    />

    <!-- 键位编辑条（可收起，避免挡拖动） -->
    <div v-if="editingControls" class="ctrl-edit-bar" :class="{ collapsed: editBarCollapsed }">
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
        <span>{{ editSelected ? CONTROL_LABEL[editSelected] : '拖动布局' }}</span>
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
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import GameIcon from '@/components/GameIcon.vue'
import { MATERIAL_ICON, type IconName } from '@/components/iconData'
import { squadColor, type MapPeer, type SquadMember } from '@/game/squad'
import { onLandscapeLayout } from '@/composables/landscapeBus'
import { joinServer, leaveServer, nearbyPlayers, serverHeartbeat, queryServerBlocks, saveServerBlocks, type JoinResult } from '@/api/server'
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
/** 建造模式：开=锤子预览建造；关=铲子挖砍采 */
const buildMode = ref(false)
/** 当前选中的建造材料；再点同一项取消 */
const selectedMat = ref<MaterialId | null>(null)
const buildShape = ref<BuildShape>('single')
const inv = reactive(createInventory())
/** 操作键与建造状态键共用：关=铲子 dig，开=锤子 build */
const modeIcon = computed<IconName>(() => (buildMode.value ? 'build' : 'dig'))
const breakLabel = ref('挖')
const targetName = ref('')
const crouched = ref(false)
const squadMembers = ref<SquadMember[]>([])
const mapMe = reactive({ x: 0, z: 0, yaw: 0 })
const mapPeers = ref<MapPeer[]>([])
const myCellNum = computed(() => cellNumberAt(mapMe.x, mapMe.z))

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
let lastBlockFetchKey = ''

const BLOCK_FETCH_RADIUS = 112
const BLOCK_FETCH_Y_MIN = 0
const BLOCK_FETCH_Y_MAX = 48

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
    if (list?.length && engine) engine.applyRemoteBlocks(list)
  } catch {
    // ignore transient
  }
}

function publishLocalBlocks(
  blocks: { x: number; y: number; z: number; blockId: string }[]
) {
  if (!serverId || !blocks.length) return
  presence?.sendBlocks(blocks)
  saveServerBlocks(serverId, blocks).catch(() => undefined)
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
  engine.setBuildMode(buildMode.value)
}

function setBuildMode(on: boolean) {
  buildMode.value = on
  breakLabel.value = on ? '建' : '挖'
  if (engine) {
    engine.setBuildMode(on)
    syncEngineLoadout()
  }
}

function selectMat(m: MaterialId) {
  selectedMat.value = selectedMat.value === m ? null : m
  // 选材料时自动进入建造模式，取消材料时不强制退出
  if (selectedMat.value) setBuildMode(true)
  else syncEngineLoadout()
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
/** 操作键：跟随当前模式执行挖砍或建造 */
function onBreak() {
  if (!engine) return
  if (buildMode.value) {
    if (!selectedMat.value) {
      engine.lastActionHint = '未选择材料'
      flashHint()
      return
    }
    engine.beginBuild()
  } else {
    engine.beginHarvest()
    tool.value = engine.tool
    syncEngineLoadout()
  }
  flashHint()
}
/** 建造状态键：切换挖/建模式 */
function onPlace() {
  setBuildMode(!buildMode.value)
  if (engine) {
    engine.lastActionHint = buildMode.value
      ? selectedMat.value
        ? '建造模式 · 对准表面后点「放置」'
        : '建造模式 · 先选下方材料'
      : '操作模式 · 点「操作」挖砍采'
    flashHint()
  }
}

function layoutUserId() {
  return auth.user?.id || null
}

function applyLayout(layout: ControlLayout) {
  const next = normalizeControlLayout(layout)
  for (const id of CONTROL_IDS) {
    controlLayout.items[id] = { ...next.items[id] }
  }
  controlLayout.version = 2
  saveLayoutLocal(controlLayout, layoutUserId())
}

function enterControlEdit() {
  showSettings.value = false
  layoutBackup = JSON.parse(JSON.stringify(controlLayout)) as ControlLayout
  editingControls.value = true
  editBarCollapsed.value = false
  editSelected.value = 'stick'
  editMsg.value = '拖动控件调整位置'
}

function cancelControlEdit() {
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
const hudDragStart = reactive({ px: 0, py: 0, ix: 0, iy: 0 })

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
    pointerEvents: editingControls.value ? 'auto' : 'none',
    zIndex: editingControls.value ? 8 : 5,
  }
}

function mapHudDelta(sx: number, sy: number) {
  if (!landscapeForced.value) return { x: sx, y: sy }
  return { x: sy, y: -sx }
}

function onHudDown(e: PointerEvent, id: 'targetHint' | 'actionRing') {
  if (!editingControls.value) return
  editSelected.value = id
  hudDragging.value = id
  hudDragId.value = e.pointerId
  hudDragStart.px = e.clientX
  hudDragStart.py = e.clientY
  hudDragStart.ix = controlLayout.items[id].x
  hudDragStart.iy = controlLayout.items[id].y
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onHudMove(e: PointerEvent, id: 'targetHint' | 'actionRing') {
  if (!editingControls.value || hudDragging.value !== id || e.pointerId !== hudDragId.value) return
  const play = document.querySelector('.play') as HTMLElement | null
  const pw = play?.clientWidth || window.innerWidth
  const ph = play?.clientHeight || window.innerHeight
  let dx = e.clientX - hudDragStart.px
  let dy = e.clientY - hudDragStart.py
  if (landscapeForced.value) {
    const mapped = mapHudDelta(dx, dy)
    dx = mapped.x
    dy = mapped.y
  }
  const nx = hudDragStart.ix + (dx / pw) * 100
  const ny = hudDragStart.iy - (dy / ph) * 100
  controlLayout.items[id] = clampItem({
    ...controlLayout.items[id],
    x: nx,
    y: ny,
  })
}

function onHudUp(e: PointerEvent, id: 'targetHint' | 'actionRing') {
  if (hudDragging.value !== id || e.pointerId !== hudDragId.value) return
  hudDragging.value = null
  hudDragId.value = null
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
    await leaveServer()
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
  // 按钮文案跟模式走；具体目标名另显示在 target-hint
  breakLabel.value = buildMode.value ? '建' : '挖'
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
  if (e.code === 'KeyE') {
    e.preventDefault()
    onPlace()
  }
}

function readCachedJoin(): JoinResult | null {
  try {
    const raw = sessionStorage.getItem('sv_join')
    if (!raw) return null
    const data = JSON.parse(raw) as JoinResult
    if (data?.server?.id === routeServerId.value) return data
  } catch {
    // ignore
  }
  return null
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
    let data = readCachedJoin()
    if (!data) {
      data = await joinServer(routeServerId.value)
      sessionStorage.setItem('sv_join', JSON.stringify(data))
    }
    serverId = data.server.id
    serverName.value = data.server.name
    setLastServerId(serverId)

    engine = new GameEngine(viewport.value, data.server.seed ?? 42, {
      antialias: playSettings.antialias,
      quality: playSettings.quality,
    })
    gameAudio = new GameAudio()
    gameAudio.setMuted(playSettings.muted)
    gameAudio.ensure()
    engine.audio = gameAudio
    engine.inventory = inv
    engine.onInventoryChange = () => {
      /* reactive inv already updates */
    }
    engine.onBlocksChange = (blocks) => publishLocalBlocks(blocks)
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
      npc?.update(dt)
      remotes?.update(dt)
      if (engine && engine.tool !== tool.value) tool.value = engine.tool
      crouched.value = engine.crouching
      mapMe.x = engine.camera.position.x
      mapMe.z = engine.camera.position.z
      mapMe.yaw = engine.getPose().yaw
      mapPeers.value = remotes?.listMapPeers() || []
      natureAudio?.setCreekDistance(engine.getCreekDistance(mapMe.x, mapMe.z))
      syncActionUi()

      presenceAcc += dt
      if (presenceAcc > 0.08 && engine && presence) {
        presenceAcc = 0
        const pose = engine.getPose()
        presence.sendPresence({
          x: engine.camera.position.x,
          y: engine.camera.position.y,
          z: engine.camera.position.z,
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
        onLeft: (uid) => remotes?.remove(uid),
        onBlocks: (blocks) => engine?.applyRemoteBlocks(blocks),
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
    nearbyTimer = window.setInterval(refreshNearby, 3000)
    refreshNearby()
    refreshPartyHud()
    partyTimer = window.setInterval(refreshPartyHud, 8000)
    blockSyncTimer = window.setInterval(() => {
      if (!engine) return
      fetchBlocksAround(engine.camera.position.x, engine.camera.position.z, true).catch(
        () => undefined
      )
    }, 12000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '进入失败'
    loading.value = false
  }
})

onBeforeUnmount(() => {
  offLayout?.()
  window.removeEventListener('keydown', onPlayKeyDown)
  if (nearbyTimer) window.clearInterval(nearbyTimer)
  if (blockSyncTimer) window.clearInterval(blockSyncTimer)
  if (partyTimer) window.clearInterval(partyTimer)
  if (hintTimer) window.clearTimeout(hintTimer)
  natureAudio?.stop()
  natureAudio = null
  gameAudio?.dispose()
  gameAudio = null
  presence?.disconnect()
  presence = null
  leaveServer().catch(() => undefined)
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

/* 左上小队：半透明细条，尽量不挡视野 */
.squad-strip {
  pointer-events: none;
  position: absolute;
  left: max(0.4rem, env(safe-area-inset-left));
  top: max(0.4rem, env(safe-area-inset-top));
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  max-width: 220px;
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
  bottom: max(0.4rem, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 15;
  width: min(420px, 94vw);
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

.mode-chip {
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.15rem auto 0;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  max-width: min(92vw, 22rem);
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.25;
  color: #ffe8d8;
  background: rgba(40, 22, 14, 0.78);
  border: 1px solid rgba(255, 170, 120, 0.45);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.mode-chip.build {
  color: #d9ffe8;
  background: rgba(12, 40, 28, 0.82);
  border-color: rgba(120, 220, 160, 0.55);
}
.mode-chip-icon {
  flex-shrink: 0;
  opacity: 0.95;
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
