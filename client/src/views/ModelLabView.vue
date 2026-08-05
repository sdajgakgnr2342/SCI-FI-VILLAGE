<template>
  <div class="lab">
    <header class="top-bar">
      <router-link class="back" to="/">← 返回</router-link>
      <span class="title">{{ activeLabel }}</span>
    </header>

    <div
      ref="viewport"
      class="viewport"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />

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

const viewport = ref<HTMLElement | null>(null)
const activeId = ref<ModelExhibitId>('scene:all-blocks')

const activeLabel = computed(() => {
  const ex = MODEL_EXHIBITS.find((e) => e.id === activeId.value)
  return ex ? `${ex.group} · ${ex.label}` : '建模预览'
})

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let exhibitRoot: THREE.Object3D | null = null
let raf = 0

/** 单指旋转 / 双指缩放 */
const pointers = new Map<number, { x: number; y: number }>()
let mode: 'none' | 'orbit' | 'pinch' = 'none'
let lastX = 0
let lastY = 0
let pinchDist0 = 0
let dist0 = 8
let yaw = 0.55
let pitch = 0.38
let dist = 8

function clearExhibit() {
  if (!scene || !exhibitRoot) return
  scene.remove(exhibitRoot)
  disposeObject3D(exhibitRoot)
  exhibitRoot = null
}

function loadExhibit(id: ModelExhibitId) {
  if (!scene) return
  clearExhibit()
  const obj = buildExhibitObject(id)
  exhibitRoot = obj
  scene.add(obj)
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 1)
  dist = Math.max(3.2, maxDim * 2.15)
  updateCamera()
}

function select(id: ModelExhibitId) {
  activeId.value = id
  loadExhibit(id)
}

function updateCamera() {
  if (!camera) return
  const cp = Math.cos(pitch)
  camera.position.set(
    Math.sin(yaw) * cp * dist,
    Math.sin(pitch) * dist + 0.35,
    Math.cos(yaw) * cp * dist
  )
  camera.lookAt(0, 0.15, 0)
}

function pinchDistance() {
  const pts = [...pointers.values()]
  if (pts.length < 2) return 0
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
}

function onPointerDown(e: PointerEvent) {
  const el = viewport.value
  if (!el) return
  el.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

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
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
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

  camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200)
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
    if (renderer && scene && camera) renderer.render(scene, camera)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
})

/** 第一人称肢体展品：同步走路 / 挥砍预览 */
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
  // 走路强度随时间起伏，便于看摆臂
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

.viewport {
  flex: 1;
  min-height: 0;
  position: relative;
  touch-action: none;
  cursor: grab;
  background: #87ceeb;
}

.viewport:active {
  cursor: grabbing;
}

.viewport :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
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
