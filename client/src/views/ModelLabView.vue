<template>
  <div class="lab">
    <header class="top-bar">
      <router-link class="back" to="/">← 返回</router-link>
      <span class="title">{{ activeLabel }}</span>
      <span v-if="stateHint" class="state-hint">{{ stateHint }}</span>
    </header>

    <div
      ref="viewport"
      class="viewport"
      :class="{ fp: isFpView }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div v-if="showRedDot" class="hud-reddot" aria-hidden="true">
        <span class="rd-ring" />
        <span class="rd-dot" />
      </div>
      <div v-if="showScope" class="hud-scope" aria-hidden="true">
        <div class="scope-mask">
          <div class="scope-glass">
            <span class="scope-cross-h" />
            <span class="scope-cross-v" />
            <span class="scope-dot" />
          </div>
        </div>
      </div>
      <div v-if="showScope" class="zoom-bar">
        <button type="button" class="zoom-btn" @pointerdown.prevent.stop="zoomBy(-1)">−</button>
        <span class="zoom-val">{{ scopeZoom }}x</span>
        <button type="button" class="zoom-btn" @pointerdown.prevent.stop="zoomBy(1)">+</button>
      </div>
    </div>

    <p v-if="showClickTip" class="click-tip">{{ clickTipText }}</p>

    <nav class="picker" aria-label="选择建模">
      <div class="picker-scroll">
        <button
          v-for="ex in MODEL_EXHIBITS"
          :key="ex.id"
          type="button"
          class="chip"
          :class="{ on: activeId === ex.id }"
          @pointerdown.prevent.stop="select(ex.id)"
        >
          <span class="chip-g">{{ ex.group }}</span>
          <span class="chip-n">{{ ex.label }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import * as THREE from 'three'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  MODEL_EXHIBITS,
  buildExhibitObject,
  disposeObject3D,
  type ModelExhibitId,
} from '@/game/modelLab'
import type { FirstPersonBody } from '@/game/playerBody'
import { tickTreasureChest } from '@/game/treasureChest'
import {
  findDualStateProp,
  getBuildPropStateText,
  tickBuildProps,
  toggleBuildPropActive,
} from '@/game/buildProps'
import { tickMonster } from '@/game/wildMonster'
import {
  findCombatTarget,
  getCombatStateText,
  nudgeSniperZoom,
  playCombatAttack,
  tickCombatProps,
} from '@/game/combatProps'

const viewport = ref<HTMLElement | null>(null)
const activeId = ref<ModelExhibitId>('weapon:all')
const stateHint = ref('')
const scopeZoom = ref(4)
const isFpView = ref(false)
const showRedDot = ref(false)
const showScope = ref(false)

const BASE_FOV = 55

const activeLabel = computed(() => {
  const ex = MODEL_EXHIBITS.find((e) => e.id === activeId.value)
  return ex ? `${ex.group} · ${ex.label}` : '建模预览'
})

const combatClickIds = new Set([
  'weapon:staff',
  'weapon:cleaver',
  'weapon:pistol',
  'weapon:rifle',
  'weapon:sniper',
  'weapon:fp-pistol',
  'weapon:fp-rifle',
  'weapon:fp-sniper',
  'weapon:hit-fx',
  'weapon:all',
])

const showClickTip = computed(() => {
  const id = activeId.value
  return (
    id === 'build:room' ||
    id === 'build:yard' ||
    id === 'build:stove' ||
    id === 'build:craft' ||
    id === 'build:door' ||
    id === 'build:lamp' ||
    id === 'build:wire' ||
    id === 'build:pond' ||
    combatClickIds.has(id)
  )
})

const clickTipText = computed(() => {
  const id = activeId.value
  if (id === 'weapon:fp-sniper') return '点击开火 · 滚轮或 ± 调节 2～8 倍镜'
  if (id.startsWith('weapon:fp-')) return '点击开火'
  if (id === 'weapon:hit-fx') return '点击循环播放击打特效'
  if (id === 'weapon:staff' || id === 'weapon:cleaver') return '点击挥击'
  if (combatClickIds.has(id)) return '点击武器可试挥击 / 开火'
  return '点击道具可切换状态'
})

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let exhibitRoot: THREE.Object3D | null = null
let raf = 0
const raycaster = new THREE.Raycaster()
const pointerNdc = new THREE.Vector2()

const pointers = new Map<number, { x: number; y: number }>()
let mode: 'none' | 'orbit' | 'pinch' = 'none'
let lastX = 0
let lastY = 0
let pinchDist0 = 0
let dist0 = 8
let yaw = 0.55
let pitch = 0.38
let dist = 8
let downX = 0
let downY = 0
let dragged = false

function refreshStateHint(prop?: THREE.Object3D | null) {
  if (prop?.userData.isCombat || prop?.userData.fpView || prop?.userData.hitFxShowcase) {
    stateHint.value = getCombatStateText(prop) || ''
    return
  }
  if (prop?.userData.dualState || prop?.userData.multiState) {
    const name =
      prop.userData.buildProp === 'stove'
        ? '火炉'
        : prop.userData.buildProp === 'craft'
          ? '制作台'
          : prop.userData.buildProp === 'door'
            ? '门'
            : prop.userData.buildProp === 'lamp'
              ? '灯'
              : prop.userData.buildProp === 'wireFence'
                ? '铁丝网'
                : prop.userData.buildProp === 'pond'
                  ? '池塘'
                  : '建造物'
    stateHint.value = `${name} · ${getBuildPropStateText(prop)}`
    return
  }
  stateHint.value = ''
}

function applyFpCamera() {
  if (!camera || !exhibitRoot) return
  camera.fov = showScope.value ? BASE_FOV / Math.max(1, scopeZoom.value) : BASE_FOV
  camera.updateProjectionMatrix()
  camera.position.set(0, 0, 0)
  camera.rotation.set(0, 0, 0)
  camera.lookAt(0, 0, -1)
  exhibitRoot.position.set(0, 0, 0)
}

function applyOrbitCamera() {
  if (!camera) return
  camera.fov = BASE_FOV
  camera.updateProjectionMatrix()
  updateCamera()
}

function syncCombatHud(obj: THREE.Object3D) {
  isFpView.value = Boolean(obj.userData.fpView)
  showRedDot.value = Boolean(obj.userData.fpView && obj.userData.hasRedDot)
  showScope.value = Boolean(obj.userData.fpView && obj.userData.hasScope)
  if (obj.userData.hasScope) {
    scopeZoom.value = Number(obj.userData.scopeZoom) || 4
  }
  if (isFpView.value) applyFpCamera()
  else applyOrbitCamera()
  refreshStateHint(obj)
}

function clearExhibit() {
  if (!scene || !exhibitRoot) return
  scene.remove(exhibitRoot)
  disposeObject3D(exhibitRoot)
  exhibitRoot = null
  stateHint.value = ''
  isFpView.value = false
  showRedDot.value = false
  showScope.value = false
}

function loadExhibit(id: ModelExhibitId) {
  if (!scene) return
  clearExhibit()
  const obj = buildExhibitObject(id)
  exhibitRoot = obj
  scene.add(obj)
  if (obj.userData.fpView) {
    syncCombatHud(obj)
  } else {
    isFpView.value = false
    showRedDot.value = false
    showScope.value = false
    const box = new THREE.Box3().setFromObject(obj)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 1)
    dist = Math.max(3.2, maxDim * 2.15)
    applyOrbitCamera()
    if (obj.userData.dualState || obj.userData.multiState || obj.userData.isCombat) {
      refreshStateHint(obj)
    }
  }
}

function select(id: ModelExhibitId) {
  activeId.value = id
  loadExhibit(id)
}

function updateCamera() {
  if (!camera || isFpView.value) return
  const cp = Math.cos(pitch)
  camera.position.set(
    Math.sin(yaw) * cp * dist,
    Math.sin(pitch) * dist + 0.35,
    Math.cos(yaw) * cp * dist
  )
  camera.lookAt(0, 0.15, 0)
}

function zoomBy(delta: number) {
  if (!exhibitRoot?.userData.hasScope) return
  const z = nudgeSniperZoom(exhibitRoot, delta)
  scopeZoom.value = z
  applyFpCamera()
  refreshStateHint(exhibitRoot)
}

function pinchDistance() {
  const pts = [...pointers.values()]
  if (pts.length < 2) return 0
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
}

function tryToggleAt(clientX: number, clientY: number) {
  if (!camera || !exhibitRoot || !viewport.value) return
  if (!showClickTip.value) return

  // 第一人称：整屏点击即开火
  if (exhibitRoot.userData.fpView) {
    const label = playCombatAttack(exhibitRoot)
    if (label) stateHint.value = label
    return
  }

  const rect = viewport.value.getBoundingClientRect()
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointerNdc, camera)
  const hits = raycaster.intersectObject(exhibitRoot, true)
  if (!hits.length) return

  const combat = findCombatTarget(hits[0].object)
  if (combat) {
    const label = playCombatAttack(combat)
    if (label) stateHint.value = label
    else refreshStateHint(combat)
    return
  }

  const prop = findDualStateProp(hits[0].object)
  if (!prop) return
  toggleBuildPropActive(prop)
  refreshStateHint(prop)
}

function onPointerDown(e: PointerEvent) {
  const el = viewport.value
  if (!el) return
  el.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  downX = e.clientX
  downY = e.clientY
  dragged = false

  if (pointers.size >= 2) {
    mode = 'pinch'
    pinchDist0 = pinchDistance() || 1
    dist0 = dist
    return
  }
  mode = 'orbit'
  lastX = e.clientX
  lastY = e.clientY
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) dragged = true

  if (isFpView.value) return

  if (mode === 'pinch' && pointers.size >= 2) {
    const d = pinchDistance()
    if (pinchDist0 > 0) {
      dist = Math.max(2, Math.min(42, dist0 * (pinchDist0 / Math.max(d, 1))))
      updateCamera()
    }
    return
  }

  if (mode === 'orbit' && pointers.size === 1) {
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    yaw -= dx * 0.01
    pitch = Math.max(-0.15, Math.min(1.25, pitch + dy * 0.01))
    updateCamera()
  }
}

function onPointerUp(e: PointerEvent) {
  const wasDrag = dragged
  const x = e.clientX
  const y = e.clientY
  pointers.delete(e.pointerId)
  if (pointers.size >= 2) {
    mode = 'pinch'
    pinchDist0 = pinchDistance() || 1
    dist0 = dist
  } else if (pointers.size === 1) {
    mode = 'orbit'
    const pt = [...pointers.values()][0]
    lastX = pt.x
    lastY = pt.y
  } else {
    mode = 'none'
    if (!wasDrag) tryToggleAt(x, y)
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (exhibitRoot?.userData.hasScope && isFpView.value) {
    zoomBy(e.deltaY > 0 ? -1 : 1)
    return
  }
  if (isFpView.value) return
  dist = Math.max(2, Math.min(42, dist * (e.deltaY > 0 ? 1.09 : 0.91)))
  updateCamera()
}

function resize() {
  const el = viewport.value
  if (!el || !renderer || !camera) return
  const w = el.clientWidth || 1
  const h = el.clientHeight || 1
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}

onMounted(() => {
  const el = viewport.value
  if (!el) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87ceeb)
  scene.fog = new THREE.Fog(0xc5e3f5, 26, 72)

  camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 200)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  el.appendChild(renderer.domElement)

  scene.add(new THREE.HemisphereLight(0xdff2ff, 0x8fbf6a, 0.95))
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.15)
  sun.position.set(6, 12, 4)
  scene.add(sun)
  scene.add(new THREE.AmbientLight(0xffffff, 0.28))

  const grid = new THREE.GridHelper(20, 20, 0x6a9a4e, 0x8fbf6a)
  grid.position.y = -0.01
  scene.add(grid)

  loadExhibit(activeId.value)
  resize()

  el.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('resize', resize)

  let lastTs = performance.now()
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - lastTs) / 1000)
    lastTs = now
    tickFpBody(dt)
    if (exhibitRoot?.userData.isChest) tickTreasureChest(exhibitRoot, dt)
    if (exhibitRoot?.userData.isBuildProps) tickBuildProps(exhibitRoot, dt)
    if (exhibitRoot?.userData.isMonster) tickMonster(exhibitRoot, dt)
    if (exhibitRoot?.userData.isCombat) {
      tickCombatProps(exhibitRoot, dt)
      if (exhibitRoot.userData.isFirePitDemo) {
        refreshStateHint(exhibitRoot)
      }
    }
    if (renderer && scene && camera) renderer.render(scene, camera)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
})

function tickFpBody(dt: number) {
  const root = exhibitRoot
  if (!root?.userData.fpBody) return
  const body = root.userData.fpBody as FirstPersonBody
  const anim = root.userData.labAnim as { t: number; nextSwing: number }
  anim.t += dt
  anim.nextSwing -= dt
  if (anim.nextSwing <= 0) {
    body.playSwing('axe')
    anim.nextSwing = 1.6 + (anim.t % 0.7)
  }
  const walk = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(anim.t * 0.7))
  body.update(dt, walk, false, 0, false)
}

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  const el = viewport.value
  el?.removeEventListener('wheel', onWheel)
  window.removeEventListener('resize', resize)
  window.visualViewport?.removeEventListener('resize', resize)
  clearExhibit()
  renderer?.dispose()
  if (renderer?.domElement.parentElement) {
    renderer.domElement.parentElement.removeChild(renderer.domElement)
  }
  renderer = null
  scene = null
  camera = null
})
</script>

<style scoped>
.lab {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #152028;
  color: #e8eef0;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.top-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: max(0.45rem, env(safe-area-inset-top)) 0.75rem 0.4rem;
  background: rgba(10, 16, 20, 0.88);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 2;
}

.back {
  color: rgba(126, 231, 220, 0.95);
  text-decoration: none;
  font-size: 0.78rem;
  font-weight: 700;
  flex-shrink: 0;
}

.title {
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state-hint {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: #7ec8e8;
  background: rgba(40, 90, 110, 0.45);
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
}

.viewport {
  flex: 1;
  min-height: 0;
  position: relative;
  touch-action: none;
  cursor: grab;
  background: #87ceeb;
}

.viewport.fp {
  cursor: crosshair;
  background: #6a9aaa;
}

.viewport:active {
  cursor: grabbing;
}

.viewport.fp:active {
  cursor: crosshair;
}

.viewport :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.hud-reddot {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  display: grid;
  place-items: center;
}

.rd-ring {
  width: 2.4rem;
  height: 2.4rem;
  border: 2px solid rgba(40, 220, 120, 0.55);
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
}

.rd-dot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff2a2a;
  box-shadow: 0 0 6px #ff4040;
}

.hud-scope {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
}

.scope-mask {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at center,
    transparent 0,
    transparent 28%,
    rgba(0, 0, 0, 0.82) 29%,
    rgba(0, 0, 0, 0.92) 100%
  );
  display: grid;
  place-items: center;
}

.scope-glass {
  position: relative;
  width: min(56vmin, 22rem);
  height: min(56vmin, 22rem);
  border-radius: 50%;
  border: 3px solid rgba(120, 140, 150, 0.55);
  box-shadow: inset 0 0 40px rgba(40, 80, 100, 0.35);
}

.scope-cross-h,
.scope-cross-v {
  position: absolute;
  background: rgba(220, 240, 230, 0.55);
}

.scope-cross-h {
  left: 12%;
  right: 12%;
  top: 50%;
  height: 1px;
  transform: translateY(-50%);
}

.scope-cross-v {
  top: 12%;
  bottom: 12%;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
}

.scope-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 5px;
  height: 5px;
  margin: -2.5px 0 0 -2.5px;
  border-radius: 50%;
  background: #ff3030;
}

.zoom-bar {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.35rem;
  background: rgba(10, 16, 20, 0.72);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.zoom-btn {
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #e8eef0;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
}

.zoom-val {
  font-size: 0.78rem;
  font-weight: 800;
  color: #7ec8e8;
  min-width: 2.2rem;
  text-align: center;
}

.click-tip {
  position: absolute;
  left: 50%;
  bottom: 5.4rem;
  transform: translateX(-50%);
  z-index: 3;
  margin: 0;
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  color: #d8e8f0;
  background: rgba(10, 18, 24, 0.72);
  border-radius: 999px;
  pointer-events: none;
  white-space: nowrap;
}

.picker {
  flex-shrink: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(10, 16, 20, 0.94);
  padding: 0.55rem 0 max(0.65rem, env(safe-area-inset-bottom));
  z-index: 2;
}

.picker-scroll {
  display: flex;
  flex-direction: row;
  gap: 0.45rem;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 0.65rem;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  touch-action: pan-x;
}

.chip {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.12rem;
  min-width: 5.6rem;
  max-width: 7.5rem;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.chip.on {
  border-color: rgba(240, 201, 58, 0.55);
  background: rgba(240, 201, 58, 0.18);
}

.chip-g {
  font-size: 0.55rem;
  font-weight: 800;
  color: rgba(240, 201, 58, 0.75);
  letter-spacing: 0.04em;
}

.chip-n {
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.2;
  word-break: break-word;
}
</style>
