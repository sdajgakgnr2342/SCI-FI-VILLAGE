<template>
  <div class="minimap-root">
    <!-- 缩略图 -->
    <button
      type="button"
      class="mini"
      @pointerdown.prevent.stop="openMap"
      @click.prevent.stop="openMap"
    >
      <div class="mini-frame">
        <div class="map-surface">
          <canvas ref="miniCanvasEl" class="terrain-canvas" aria-hidden="true" />
          <div class="map-grid" aria-hidden="true" />
          <svg class="nav-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line
              v-if="navLineMini"
              :x1="navLineMini.x1"
              :y1="navLineMini.y1"
              :x2="navLineMini.x2"
              :y2="navLineMini.y2"
              class="nav-line"
            />
            <line
              v-for="ln in squadLinesMini"
              :key="'slm' + ln.userId"
              :x1="ln.x1"
              :y1="ln.y1"
              :x2="ln.x2"
              :y2="ln.y2"
              class="squad-mark-line"
              :style="{ stroke: ln.color }"
            />
          </svg>
          <div
            v-if="wpMini"
            class="waypoint"
            :style="{ left: `${wpMini.left}%`, top: `${wpMini.top}%` }"
          >
            <i class="wp-pin" aria-hidden="true" />
            <span class="wp-dist">{{ wpDistText }}</span>
          </div>
          <div
            v-for="sm in squadPinsMini"
            :key="'spm' + sm.userId"
            class="squad-pin"
            :class="{ edge: sm.onEdge }"
            :style="{ left: `${sm.left}%`, top: `${sm.top}%`, '--pin': sm.color }"
          >
            <i class="sp-dot" />
            <span class="sp-num">{{ sm.slot }}</span>
            <span v-if="sm.isMe" class="sp-dist">{{ sm.distText }}</span>
          </div>
          <div
            v-for="m in markers"
            :key="'m' + m.userId"
            class="marker"
            :class="{ me: m.isMe, edge: m.onEdge, dir: m.hasDir }"
            :style="markerStyle(m)"
          >
            <span
              v-if="m.hasDir"
              class="dir-ring"
              :style="{ transform: `rotate(${m.yawDeg}deg)` }"
            >
              <span class="chevron" />
            </span>
            <span class="badge" :style="{ background: m.color }">{{ m.slot }}</span>
          </div>
        </div>
        <div class="cell-badge">#{{ myCellNum }}</div>
      </div>
    </button>

    <div v-if="expanded" class="map-overlay" @pointerdown.self.prevent="expanded = false">
      <div class="map-panel" role="dialog" aria-label="地图" @pointerdown.stop>
        <header class="map-head">
          <button
            v-if="waypoint || mySquadMark"
            type="button"
            class="clear-wp"
            @pointerdown.prevent.stop="clearAllLocalMarks"
          >
            清除标记
          </button>
          <span class="head-spacer" />
          <button
            type="button"
            class="close"
            aria-label="关闭"
            @pointerdown.prevent.stop="expanded = false"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z"
              />
            </svg>
          </button>
        </header>

        <div class="big-wrap">
          <div
            ref="bigFrameEl"
            class="big-frame"
            @wheel.prevent="onWheel"
            @pointerdown.prevent="onPointerDown"
            @pointermove.prevent="onPointerMove"
            @pointerup.prevent="onPointerUp"
            @pointercancel.prevent="onPointerUp"
          >
            <div class="map-surface big">
              <canvas ref="bigCanvasEl" class="terrain-canvas" aria-hidden="true" />
              <div class="map-grid dense" :style="bigGridStyle" aria-hidden="true" />
              <svg class="nav-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line
                  v-if="navLineBig"
                  :x1="navLineBig.x1"
                  :y1="navLineBig.y1"
                  :x2="navLineBig.x2"
                  :y2="navLineBig.y2"
                  class="nav-line"
                />
                <line
                  v-for="ln in squadLinesBig"
                  :key="'slb' + ln.userId"
                  :x1="ln.x1"
                  :y1="ln.y1"
                  :x2="ln.x2"
                  :y2="ln.y2"
                  class="squad-mark-line"
                  :style="{ stroke: ln.color }"
                />
              </svg>
              <div
                v-if="wpBig"
                class="waypoint big"
                :class="{ edge: wpBig.onEdge }"
                :style="{ left: `${wpBig.left}%`, top: `${wpBig.top}%` }"
              >
                <i class="wp-pin" aria-hidden="true" />
                <span class="wp-dist">{{ wpDistText }}</span>
              </div>
              <div
                v-for="sm in squadPinsBig"
                :key="'spb' + sm.userId"
                class="squad-pin big"
                :class="{ edge: sm.onEdge }"
                :style="{ left: `${sm.left}%`, top: `${sm.top}%`, '--pin': sm.color }"
              >
                <i class="sp-dot" />
                <span class="sp-num">{{ sm.slot }}</span>
                <span class="sp-dist">{{ sm.distText }}</span>
              </div>
              <div
                v-for="m in markersExpanded"
                :key="'b' + m.userId"
                class="marker big"
                :class="{ me: m.isMe, edge: m.onEdge, dir: m.hasDir }"
                :style="markerStyle(m)"
              >
                <span
                  v-if="m.hasDir"
                  class="dir-ring"
                  :style="{ transform: `rotate(${m.yawDeg}deg)` }"
                >
                  <span class="chevron" />
                </span>
                <span class="badge" :style="{ background: m.color }">{{ m.slot }}</span>
              </div>
            </div>
          </div>

          <div class="zoom-rail">
            <button type="button" class="zoom-btn" @pointerdown.prevent.stop="bumpZoom(0.35)">
              +
            </button>
            <div class="zoom-track" @pointerdown.prevent.stop="onZoomTrack">
              <i class="zoom-thumb" :style="{ bottom: `${zoomThumb}%` }" />
            </div>
            <button type="button" class="zoom-btn" @pointerdown.prevent.stop="bumpZoom(-0.35)">
              −
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import { cellNumberAt } from '@/game/mapGrid'
import { paintMinimapTerrain, type MinimapSampleFn } from '@/game/mapTerrain'
import { squadColor, type MapPeer, type SquadMember } from '@/game/squad'
import type { SquadMark } from '@/game/squadMark'

const props = withDefaults(
  defineProps<{
    myX: number
    myZ: number
    myYaw?: number
    myUserId?: number
    peers?: MapPeer[]
    squadMembers?: SquadMember[]
    /** 世界地表采样；未传入时小地图仍显示草地底 */
    terrainSample?: MinimapSampleFn | null
    /** 引擎就绪 / 挖放变化时递增，触发重绘 */
    terrainRev?: number
    /** 小队战术标记 */
    squadMarks?: SquadMark[]
  }>(),
  {
    myYaw: 0,
    myUserId: 0,
    peers: () => [],
    squadMembers: () => [],
    terrainSample: null,
    terrainRev: 0,
    squadMarks: () => [],
  }
)

const emit = defineEmits<{
  clearMyMark: []
}>()

const expanded = ref(false)
const waypoint = ref<{ x: number; z: number } | null>(null)
const bigFrameEl = ref<HTMLElement | null>(null)
const miniCanvasEl = ref<HTMLCanvasElement | null>(null)
const bigCanvasEl = ref<HTMLCanvasElement | null>(null)

let miniRaf = 0
let bigRaf = 0
let bigPaintTimer = 0
let lastMiniKey = ''
let lastBigKey = ''
/** 缩放/拖动手势中：禁止中途重绘地形，只更新 UI */
let mapGesturing = false
/** 防止上一次 paint 未完成又开新的（移动端主因卡死） */
let bigPainting = false
let bigPaintAgain = false
let lastBigPaintAt = 0
/** 展开大图时地形画布锚点；玩家走动只更新标记，不刷全图 */
let paintAnchorX = 0
let paintAnchorZ = 0

function isCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

function fallbackSample(): MinimapSampleFn {
  return () => 'grass'
}

function sampleAt(x: number, z: number) {
  return (props.terrainSample || fallbackSample())(x, z)
}

function scheduleMiniPaint() {
  if (miniRaf) return
  miniRaf = requestAnimationFrame(() => {
    miniRaf = 0
    paintMini()
  })
}

function scheduleBigPaint(opts?: { urgent?: boolean; delay?: number }) {
  if (!expanded.value) return
  // 手势中不重绘地形（滑杆/捏合只动 zoom 数值）
  if (mapGesturing && !opts?.urgent) return

  if (bigRaf) {
    cancelAnimationFrame(bigRaf)
    bigRaf = 0
  }
  if (bigPaintTimer) {
    clearTimeout(bigPaintTimer)
    bigPaintTimer = 0
  }

  const run = () => {
    bigRaf = 0
    bigPaintTimer = 0
    if (mapGesturing && !opts?.urgent) return
    paintBig()
  }

  // 移动端：松手后再延迟一帧，先让滑杆/标记跟上，避免同步重绘卡死触摸
  const delay = opts?.delay ?? (opts?.urgent && isCoarsePointer() ? 32 : 0)
  if (delay > 0) {
    bigPaintTimer = window.setTimeout(() => {
      bigPaintTimer = 0
      bigRaf = requestAnimationFrame(run)
    }, delay)
  } else {
    bigRaf = requestAnimationFrame(run)
  }
}

/** 缩放：1=最远俯瞰，ZOOM_MAX=最近 */
const ZOOM_MIN = 1
const ZOOM_MAX = 4.5
const zoom = ref(1.15)
/** 地图中心相对玩家的偏移（世界坐标，吃鸡式拖移） */
const panX = ref(0)
const panZ = ref(0)

const MINI_RANGE = 48
const BASE_RANGE = 200

const viewRange = computed(() => BASE_RANGE / zoom.value)
const centerX = computed(() => props.myX + panX.value)
const centerZ = computed(() => props.myZ + panZ.value)
const zoomThumb = computed(() => {
  const t = (zoom.value - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)
  return Math.max(4, Math.min(96, t * 100))
})

function paintMini() {
  const canvas = miniCanvasEl.value
  if (!canvas) return
  const qx = Math.round(props.myX * 2) / 2
  const qz = Math.round(props.myZ * 2) / 2
  const key = `${qx},${qz},${props.terrainRev}`
  if (key === lastMiniKey && canvas.width > 0) return
  lastMiniKey = key
  paintMinimapTerrain(canvas, {
    centerX: props.myX,
    centerZ: props.myZ,
    range: MINI_RANGE,
    sample: sampleAt,
    maxSamples: 56,
  })
}

function paintBig() {
  const canvas = bigCanvasEl.value
  if (!canvas || !expanded.value) return
  if (bigPainting) {
    bigPaintAgain = true
    return
  }
  const coarse = isCoarsePointer()
  // 移动端最短重绘间隔，防止连滑后排队卡死
  const now = performance.now()
  if (coarse && now - lastBigPaintAt < 180 && canvas.width > 0) {
    bigPaintAgain = true
    return
  }
  const cx = props.myX + panX.value
  const cz = props.myZ + panZ.value
  paintAnchorX = cx
  paintAnchorZ = cz
  const qx = Math.round(cx)
  const qz = Math.round(cz)
  const zr = Math.round(zoom.value * 12) / 12
  const key = `${qx},${qz},${zr},${props.terrainRev}`
  if (key === lastBigKey && canvas.width > 0) return
  lastBigKey = key
  lastBigPaintAt = now
  bigPainting = true
  try {
    paintMinimapTerrain(canvas, {
      centerX: cx,
      centerZ: cz,
      range: viewRange.value,
      sample: sampleAt,
      maxSamples: coarse ? 48 : zoom.value > 2.2 ? 96 : 80,
      quality: coarse ? 'low' : 'high',
    })
  } finally {
    bigPainting = false
    if (bigPaintAgain) {
      bigPaintAgain = false
      lastBigKey = ''
      scheduleBigPaint({ urgent: true, delay: coarse ? 120 : 0 })
    }
  }
}

watch(
  () => [props.myX, props.myZ, props.terrainRev] as const,
  () => scheduleMiniPaint(),
  { flush: 'post', immediate: true }
)

// 大图地形：跟缩放/拖移/挖放；玩家走动只在偏移够大时节流重绘（避免 10Hz 全图卡死）
watch(
  () => [expanded.value, panX.value, panZ.value, zoom.value, props.terrainRev] as const,
  async () => {
    if (!expanded.value) {
      lastBigKey = ''
      return
    }
    if (mapGesturing) return
    await nextTick()
    scheduleBigPaint()
  },
  { flush: 'post' }
)

watch(
  () => [props.myX, props.myZ] as const,
  () => {
    if (!expanded.value || mapGesturing) return
    const dx = props.myX + panX.value - paintAnchorX
    const dz = props.myZ + panZ.value - paintAnchorZ
    if (dx * dx + dz * dz < 12 * 12) return
    scheduleBigPaint({ delay: isCoarsePointer() ? 280 : 120 })
  }
)

onUnmounted(() => {
  if (miniRaf) cancelAnimationFrame(miniRaf)
  if (bigRaf) cancelAnimationFrame(bigRaf)
  if (bigPaintTimer) clearTimeout(bigPaintTimer)
  endZoomDrag()
})

const myCellNum = computed(() => cellNumberAt(props.myX, props.myZ))

interface Marker {
  userId: number
  name: string
  slot: number
  color: string
  isMe: boolean
  x: number
  z: number
  cellNum: number
  left: number
  top: number
  onEdge: boolean
  yawDeg: number
  hasDir: boolean
}

const squad = computed(() => {
  const peers = props.peers || []
  const peerMap = new Map(peers.map((p) => [p.userId, p]))
  const members = props.squadMembers?.length
    ? props.squadMembers.slice(0, 4)
    : [{ userId: props.myUserId || 0, name: '我', slot: 1 }]

  const hasMe = members.some((m) => m.userId === props.myUserId)
  const list = [...members]
  if (props.myUserId && !hasMe) {
    list.unshift({ userId: props.myUserId, name: '我', slot: 1 })
  }

  return list.slice(0, 4).map((m, i) => {
    const slot = m.slot || i + 1
    const isMe = m.userId === props.myUserId || (!props.myUserId && i === 0)
    const peer = peerMap.get(m.userId)
    const known = isMe || Boolean(peer)
    const x = isMe ? props.myX : peer?.x ?? props.myX
    const z = isMe ? props.myZ : peer?.z ?? props.myZ
    const yaw = isMe ? props.myYaw : peer?.yaw ?? 0
    return {
      userId: m.userId,
      name: m.name,
      slot,
      color: squadColor(slot),
      isMe,
      x,
      z,
      cellNum: cellNumberAt(x, z),
      known,
      yawDeg: (-yaw * 180) / Math.PI,
      hasDir: known,
    }
  })
})

function project(
  wx: number,
  wz: number,
  range: number,
  cx: number,
  cz: number
): { left: number; top: number; onEdge: boolean } {
  const half = range / 2
  let u = (wx - cx) / half
  let v = (wz - cz) / half
  const lim = 0.92
  let onEdge = false
  if (Math.abs(u) > lim || Math.abs(v) > lim) {
    onEdge = true
    const m = Math.max(Math.abs(u), Math.abs(v)) || 1
    u = (u / m) * lim
    v = (v / m) * lim
  }
  return {
    left: 50 + u * 50,
    top: 50 + v * 50,
    onEdge,
  }
}

function buildMarkers(
  range: number,
  cx: number,
  cz: number,
  onlyKnown = false
): Marker[] {
  return squad.value
    .filter((s) => !onlyKnown || s.known || s.isMe)
    .map((s) => {
      const p = project(s.x, s.z, range, cx, cz)
      return {
        userId: s.userId,
        name: s.name,
        slot: s.slot,
        color: s.color,
        isMe: s.isMe,
        x: s.x,
        z: s.z,
        cellNum: s.cellNum,
        left: p.left,
        top: p.top,
        onEdge: p.onEdge && !s.isMe,
        yawDeg: s.yawDeg,
        hasDir: s.hasDir,
      }
    })
}

const markers = computed(() => buildMarkers(MINI_RANGE, props.myX, props.myZ, true))
const markersExpanded = computed(() =>
  buildMarkers(viewRange.value, centerX.value, centerZ.value, true)
)

const wpMini = computed(() => {
  if (!waypoint.value) return null
  return project(waypoint.value.x, waypoint.value.z, MINI_RANGE, props.myX, props.myZ)
})
const wpBig = computed(() => {
  if (!waypoint.value) return null
  return project(waypoint.value.x, waypoint.value.z, viewRange.value, centerX.value, centerZ.value)
})

/** 自身到导航点的直线距离（世界格 ≈ 米） */
const wpDist = computed(() => {
  if (!waypoint.value) return 0
  return Math.round(
    Math.hypot(waypoint.value.x - props.myX, waypoint.value.z - props.myZ)
  )
})
const wpDistText = computed(() => `${wpDist.value}m`)

const meOnBig = computed(() =>
  project(props.myX, props.myZ, viewRange.value, centerX.value, centerZ.value)
)

const navLineMini = computed(() => {
  if (!wpMini.value) return null
  return { x1: 50, y1: 50, x2: wpMini.value.left, y2: wpMini.value.top }
})
const navLineBig = computed(() => {
  if (!wpBig.value) return null
  const me = meOnBig.value
  return { x1: me.left, y1: me.top, x2: wpBig.value.left, y2: wpBig.value.top }
})

const mySquadMark = computed(() =>
  (props.squadMarks || []).find((m) => m.userId === props.myUserId) || null
)

function ownerPos(userId: number) {
  if (userId === props.myUserId) return { x: props.myX, z: props.myZ }
  const peer = (props.peers || []).find((p) => p.userId === userId)
  return peer ? { x: peer.x, z: peer.z } : { x: props.myX, z: props.myZ }
}

function buildSquadPins(range: number, cx: number, cz: number) {
  return (props.squadMarks || []).map((m) => {
    const p = project(m.x, m.z, range, cx, cz)
    const owner = ownerPos(m.userId)
    const dist = Math.round(Math.hypot(m.x - props.myX, m.z - props.myZ))
    return {
      userId: m.userId,
      slot: m.slot,
      color: squadColor(m.slot),
      isMe: m.userId === props.myUserId,
      left: p.left,
      top: p.top,
      onEdge: p.onEdge,
      distText: `${dist}m`,
      ownerX: owner.x,
      ownerZ: owner.z,
      markX: m.x,
      markZ: m.z,
    }
  })
}

const squadPinsMini = computed(() =>
  buildSquadPins(MINI_RANGE, props.myX, props.myZ)
)
const squadPinsBig = computed(() =>
  buildSquadPins(viewRange.value, centerX.value, centerZ.value)
)

function buildSquadLines(
  pins: ReturnType<typeof buildSquadPins>,
  range: number,
  cx: number,
  cz: number
) {
  return pins.map((p) => {
    const from = project(p.ownerX, p.ownerZ, range, cx, cz)
    return {
      userId: p.userId,
      color: p.color,
      x1: from.left,
      y1: from.top,
      x2: p.left,
      y2: p.top,
    }
  })
}

const squadLinesMini = computed(() =>
  buildSquadLines(squadPinsMini.value, MINI_RANGE, props.myX, props.myZ)
)
const squadLinesBig = computed(() =>
  buildSquadLines(squadPinsBig.value, viewRange.value, centerX.value, centerZ.value)
)

/** 放大时格子线：约每 8 格（编号单元）一条，随 zoom 变疏密 */
const bigGridStyle = computed(() => {
  const cellsAcross = Math.max(2, viewRange.value / 8)
  const pct = 100 / cellsAcross
  return {
    backgroundSize: `${pct}% ${pct}%`,
    opacity: Math.min(0.35, 0.12 + zoom.value * 0.04),
  }
})

function markerStyle(m: Marker) {
  return { left: `${m.left}%`, top: `${m.top}%` }
}

function clampZoom(z: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
}

function clampPan() {
  // 放大后允许拖移，但别拖太远（约半屏世界）
  const max = viewRange.value * 0.85
  panX.value = Math.max(-max, Math.min(max, panX.value))
  panZ.value = Math.max(-max, Math.min(max, panZ.value))
  if (zoom.value <= 1.05) {
    panX.value = 0
    panZ.value = 0
  }
}

function setZoom(z: number, anchorWorld?: { x: number; z: number }) {
  const prev = zoom.value
  const next = clampZoom(z)
  if (Math.abs(next - prev) < 1e-4) return
  if (anchorWorld && bigFrameEl.value) {
    // 以锚点为中心缩放：保持锚点在屏幕位置不变
    const before = project(anchorWorld.x, anchorWorld.z, BASE_RANGE / prev, centerX.value, centerZ.value)
    zoom.value = next
    const half = viewRange.value / 2
    const wantU = (before.left - 50) / 50
    const wantV = (before.top - 50) / 50
    // center so that anchor projects to same left/top
    panX.value = anchorWorld.x - props.myX - wantU * half
    panZ.value = anchorWorld.z - props.myZ - wantV * half
  } else {
    zoom.value = next
  }
  clampPan()
}

function bumpZoom(delta: number) {
  mapGesturing = true
  setZoom(zoom.value + delta)
  mapGesturing = false
  lastBigKey = ''
  scheduleBigPaint({ urgent: true, delay: isCoarsePointer() ? 48 : 0 })
}

function openMap() {
  expanded.value = true
  zoom.value = 1.15
  panX.value = 0
  panZ.value = 0
  lastBigKey = ''
  mapGesturing = false
  paintAnchorX = props.myX
  paintAnchorZ = props.myZ
  nextTick(() => scheduleBigPaint({ urgent: true }))
}

function clearAllLocalMarks() {
  waypoint.value = null
  emit('clearMyMark')
}

watch(zoom, () => clampPan())

// —— 手势：单击标记 / 拖移 / 双指缩放 ——
const pointers = new Map<number, { x: number; y: number }>()
const gesture = reactive({
  mode: 'none' as 'none' | 'pan' | 'pinch' | 'tap',
  startX: 0,
  startY: 0,
  lastOx: 0,
  lastOy: 0,
  pan0X: 0,
  pan0Z: 0,
  moved: false,
  pinchDist0: 0,
  zoom0: 1,
})

function localUV(e: { offsetX: number; offsetY: number }) {
  const el = bigFrameEl.value
  if (!el) return { u: 0.5, v: 0.5 }
  const w = el.clientWidth || 1
  const h = el.clientHeight || 1
  return {
    u: Math.max(0, Math.min(1, e.offsetX / w)),
    v: Math.max(0, Math.min(1, e.offsetY / h)),
  }
}

function worldAtUV(u: number, v: number) {
  const half = viewRange.value / 2
  return {
    x: centerX.value + (u - 0.5) * 2 * half,
    z: centerZ.value + (v - 0.5) * 2 * half,
  }
}

function pinchDist() {
  const pts = [...pointers.values()]
  if (pts.length < 2) return 0
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
}

function onPointerDown(e: PointerEvent) {
  const el = bigFrameEl.value
  if (!el) return
  el.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pointers.size === 2) {
    gesture.mode = 'pinch'
    gesture.pinchDist0 = pinchDist() || 1
    gesture.zoom0 = zoom.value
    gesture.moved = true
    return
  }

  gesture.mode = 'tap'
  gesture.startX = e.clientX
  gesture.startY = e.clientY
  gesture.lastOx = e.offsetX
  gesture.lastOy = e.offsetY
  gesture.pan0X = panX.value
  gesture.pan0Z = panZ.value
  gesture.moved = false
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (gesture.mode === 'pinch' && pointers.size >= 2) {
    const d = pinchDist()
    if (gesture.pinchDist0 > 0) {
      mapGesturing = true
      setZoom(gesture.zoom0 * (d / gesture.pinchDist0))
    }
    return
  }

  if (pointers.size !== 1) return
  const dist = Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY)
  if (dist > 10) {
    gesture.moved = true
    gesture.mode = 'pan'
  }
  if (gesture.mode === 'pan' && zoom.value > 1.08) {
    mapGesturing = true
    const el = bigFrameEl.value
    const w = el?.clientWidth || 1
    const h = el?.clientHeight || 1
    // 用元素本地 offset 增量，不受强制横屏旋转影响
    const dOx = e.offsetX - gesture.lastOx
    const dOy = e.offsetY - gesture.lastOy
    gesture.lastOx = e.offsetX
    gesture.lastOy = e.offsetY
    const half = viewRange.value / 2
    panX.value -= (dOx / w) * 2 * half
    panZ.value -= (dOy / h) * 2 * half
    clampPan()
  }
}

function onPointerUp(e: PointerEvent) {
  const wasTap = gesture.mode === 'tap' && !gesture.moved && pointers.size <= 1
  const wasGesture = mapGesturing || gesture.mode === 'pan' || gesture.mode === 'pinch'
  pointers.delete(e.pointerId)

  if (pointers.size >= 2) {
    gesture.mode = 'pinch'
    gesture.pinchDist0 = pinchDist() || 1
    gesture.zoom0 = zoom.value
    return
  }
  if (pointers.size === 1) {
    gesture.mode = 'pan'
    const pt = [...pointers.values()][0]
    gesture.startX = pt.x
    gesture.startY = pt.y
    gesture.pan0X = panX.value
    gesture.pan0Z = panZ.value
    return
  }

  if (wasTap) {
    const { u, v } = localUV(e)
    waypoint.value = worldAtUV(u, v)
  }
  gesture.mode = 'none'
  if (wasGesture) {
    mapGesturing = false
    lastBigKey = ''
    scheduleBigPaint({ urgent: true, delay: isCoarsePointer() ? 48 : 0 })
  }
}

function onWheel(e: WheelEvent) {
  const { u, v } = localUV(e)
  const anchor = worldAtUV(u, v)
  const factor = e.deltaY > 0 ? 0.9 : 1.12
  mapGesturing = true
  setZoom(zoom.value * factor, anchor)
  mapGesturing = false
  lastBigKey = ''
  scheduleBigPaint({ urgent: true })
}

/** 滑杆拖动：全程不重绘，松手画一次（避免移动端卡死） */
let zoomDragCleanup: (() => void) | null = null

function endZoomDrag() {
  zoomDragCleanup?.()
  zoomDragCleanup = null
}

function onZoomTrack(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  endZoomDrag()
  mapGesturing = true

  let lastY = e.clientY
  let done = false
  const apply = (clientY: number) => {
    // 移动端触摸抖动：忽略过小位移
    if (Math.abs(clientY - lastY) < 1.5 && clientY !== e.clientY) return
    lastY = clientY
    const rect = el.getBoundingClientRect()
    const t = 1 - (clientY - rect.top) / Math.max(rect.height, 1)
    const next = ZOOM_MIN + Math.max(0, Math.min(1, t)) * (ZOOM_MAX - ZOOM_MIN)
    if (Math.abs(next - zoom.value) < 0.02) return
    zoom.value = clampZoom(next)
    clampPan()
  }

  try {
    el.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  apply(e.clientY)

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    apply(ev.clientY)
  }
  const finish = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    if (done) return
    done = true
    endZoomDrag()
    mapGesturing = false
    lastBigKey = ''
    scheduleBigPaint({ urgent: true, delay: isCoarsePointer() ? 48 : 0 })
  }

  // 挂到 window：手指滑出滑杆时仍能收到 up，避免 gesturing 卡死
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
  el.addEventListener('lostpointercapture', finish)
  zoomDragCleanup = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    el.removeEventListener('lostpointercapture', finish)
    try {
      if (el.hasPointerCapture?.(e.pointerId)) {
        el.releasePointerCapture(e.pointerId)
      }
    } catch {
      /* ignore */
    }
  }
}
</script>

<style scoped>
.minimap-root {
  pointer-events: auto;
  position: relative;
  z-index: 8;
}

.mini {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  display: block;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.mini-frame {
  position: relative;
  width: 88px;
  height: 88px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow:
    0 0 0 1.5px rgba(20, 28, 36, 0.7),
    0 3px 10px rgba(0, 0, 0, 0.3);
  opacity: 0.92;
}

.map-surface {
  position: absolute;
  inset: 0;
  background-color: #5e8f48;
}

.map-surface.big {
  background-color: #5e8f48;
}

.terrain-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

.map-grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
  background-size: 25% 25%;
  pointer-events: none;
}

.map-grid.dense {
  background-size: 12.5% 12.5%;
}

.nav-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
  overflow: visible;
}

.nav-line {
  stroke: #f0c878;
  stroke-width: 1.6;
  stroke-dasharray: 3 2.5;
  stroke-linecap: round;
  opacity: 0.95;
  filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.65));
}

.squad-mark-line {
  stroke-width: 1.6;
  stroke-dasharray: 4 2.5;
  stroke-linecap: round;
  opacity: 0.82;
  filter: none;
}

.squad-pin {
  position: absolute;
  width: 0;
  height: 0;
  z-index: 3;
  pointer-events: none;
  transform: translate(-50%, -50%);
  opacity: 0.95;
}

.squad-pin .sp-dot {
  position: absolute;
  left: 0;
  top: 0;
  width: 9px;
  height: 9px;
  border-radius: 50% 50% 50% 0;
  background: var(--pin, #f0c93a);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%) translateY(-6px) rotate(-45deg);
  box-sizing: border-box;
  opacity: 0.95;
}

.squad-pin .sp-num {
  position: absolute;
  left: 0;
  top: -16px;
  transform: translate(-50%, -50%);
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--pin, #f0c93a);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 800;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.75);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  opacity: 0.95;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.85), 0 1px 1px rgba(0, 0, 0, 0.7);
  line-height: 1;
}

.squad-pin .sp-dist {
  position: absolute;
  left: 10px;
  top: -18px;
  white-space: nowrap;
  font-size: 0.52rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.78);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}

.squad-pin.big .sp-dot {
  width: 11px;
  height: 11px;
  transform: translate(-50%, -50%) translateY(-8px) rotate(-45deg);
}

.squad-pin.big .sp-num {
  width: 18px;
  height: 18px;
  font-size: 0.75rem;
  top: -20px;
}

.squad-pin.big .sp-dist {
  font-size: 0.68rem;
  left: 12px;
  top: -22px;
}

.waypoint {
  position: absolute;
  width: 0;
  height: 0;
  z-index: 3;
  pointer-events: none;
}

.wp-pin {
  position: absolute;
  left: 0;
  top: 0;
  width: 10px;
  height: 10px;
  border-radius: 50% 50% 50% 0;
  background: #f0c878;
  border: 1.5px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  /* 尖角落在 left/top 锚点（半对角 ≈ size×0.707） */
  transform: translate(-50%, -50%) translateY(-7px) rotate(-45deg);
  box-sizing: border-box;
}

.waypoint.big .wp-pin {
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%) translateY(-10px) rotate(-45deg);
}

.wp-dist {
  position: absolute;
  left: 8px;
  top: -18px;
  white-space: nowrap;
  font-size: 0.58rem;
  font-weight: 700;
  font-style: normal;
  color: #fff;
  text-shadow: 0 1px 2px #000, 0 0 4px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.02em;
  pointer-events: none;
}

.waypoint.big .wp-dist {
  font-size: 0.72rem;
  left: 10px;
  top: -22px;
}

.cell-badge {
  position: absolute;
  left: 4px;
  bottom: 4px;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: rgba(8, 14, 18, 0.62);
  color: #f5f7f6;
  font-size: 0.62rem;
  font-weight: 700;
  z-index: 3;
}

.marker {
  position: absolute;
  width: 0;
  height: 0;
  transform: translate(-50%, -50%);
  z-index: 2;
  pointer-events: none;
}

.marker.me {
  z-index: 4;
}

.dir-ring {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
  z-index: 1;
  pointer-events: none;
}

.chevron {
  position: absolute;
  left: -6px;
  top: -15px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 9px solid #fff;
  filter: drop-shadow(0 0 1px #000) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  pointer-events: none;
}

.marker.big .chevron {
  left: -7px;
  top: -18px;
  border-left-width: 7px;
  border-right-width: 7px;
  border-bottom-width: 11px;
}

.badge {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid #fff;
  color: #111;
  font-size: 0.62rem;
  font-weight: 800;
  display: grid;
  place-items: center;
  line-height: 1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
  z-index: 2;
}

.marker.big .badge {
  width: 20px;
  height: 20px;
  font-size: 0.72rem;
}

.map-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: max(0.4rem, env(safe-area-inset-top)) max(0.5rem, env(safe-area-inset-right))
    max(0.4rem, env(safe-area-inset-bottom)) max(0.5rem, env(safe-area-inset-left));
  pointer-events: auto;
  box-sizing: border-box;
}

.map-panel {
  width: min(400px, 88vw, 72vh);
  max-height: min(94vh, 100%);
  overflow: auto;
  background: rgba(18, 26, 32, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 0.5rem 0.55rem 0.55rem;
  color: #e8eef0;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
}

.map-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
  min-height: 30px;
}

.head-spacer {
  flex: 1;
}

.clear-wp {
  border: 1px solid rgba(240, 200, 120, 0.45);
  background: rgba(240, 200, 120, 0.12);
  color: #f0c878;
  border-radius: 999px;
  padding: 0.2rem 0.5rem;
  font-size: 0.6rem;
  cursor: pointer;
  flex-shrink: 0;
}

.close {
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
  padding: 0;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  line-height: 0;
}

.close svg {
  width: 14px;
  height: 14px;
  display: block;
}

.big-wrap {
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
}

.big-frame {
  position: relative;
  flex: 1;
  width: min(100%, 52vh, 320px);
  aspect-ratio: 1;
  margin: 0 auto;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  touch-action: none;
  cursor: grab;
}

.big-frame:active {
  cursor: grabbing;
}

.zoom-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  width: 28px;
  flex-shrink: 0;
  padding: 0.1rem 0;
  touch-action: none;
}

.zoom-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: grid;
  place-items: center;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.zoom-track {
  flex: 1;
  width: 6px;
  min-height: 72px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.12);
  position: relative;
  cursor: pointer;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

.zoom-thumb {
  position: absolute;
  left: 50%;
  width: 12px;
  height: 12px;
  margin: 0 0 -6px -6px;
  border-radius: 50%;
  background: #7ee7dc;
  border: 1.5px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}

@media (max-height: 420px) {
  .map-panel {
    width: min(320px, 82vw, 90vh);
  }
  .big-frame {
    width: min(100%, 42vh, 240px);
  }
}
</style>
