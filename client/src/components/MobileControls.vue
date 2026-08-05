<template>
  <div class="controls" :class="{ editing, forced: forceShow }" aria-hidden="false">
    <div
      v-if="!editing"
      class="look-layer"
      @pointerdown="onLookDown"
      @pointermove="onLookMove"
      @pointerup="onLookUp"
      @pointercancel="onLookUp"
    />

    <!-- 移动轮盘 -->
    <div
      ref="stickArea"
      class="widget stick-area"
      :class="{ selected: editing && selectedId === 'stick' }"
      :style="widgetStyle('stick')"
      @pointerdown="onWidgetDown($event, 'stick')"
      @pointermove="onStickOrDragMove($event, 'stick')"
      @pointerup="onStickOrDragUp($event, 'stick')"
      @pointercancel="onStickOrDragUp($event, 'stick')"
    >
      <div class="stick-base" :style="stickBaseStyle">
        <div class="stick-knob" :style="knobStyle" />
      </div>
      <span v-if="editing" class="edit-tag">轮盘</span>
    </div>

    <!-- 操作键：与轮盘同一套 widget 拖动 -->
    <div
      v-for="btn in actionButtons"
      :key="btn.id"
      role="button"
      tabindex="0"
      class="widget act"
      :class="[
        btn.id,
        {
          on: btn.id === 'crouch' && crouched,
          'mode-build': btn.id === 'break' && buildMode,
          'mode-dig': btn.id === 'break' && !buildMode,
          selected: editing && selectedId === btn.id,
        },
      ]"
      :style="widgetStyle(btn.id)"
      :title="btnTitle(btn.id)"
      :aria-label="btnTitle(btn.id)"
      @pointerdown.prevent.stop="onWidgetDown($event, btn.id)"
      @pointermove="onStickOrDragMove($event, btn.id)"
      @pointerup="onStickOrDragUp($event, btn.id)"
      @pointercancel="onStickOrDragUp($event, btn.id)"
    >
      <span v-if="btn.id === 'break' && buildMode" class="mode-pulse" aria-hidden="true" />
      <span class="act-cap">{{ btnCaption(btn.id) }}</span>
      <GameIcon v-if="btn.id === 'break'" :name="modeIcon" :size="26" />
      <GameIcon v-else-if="btn.id === 'jump'" name="jump" :size="26" />
      <GameIcon v-else-if="btn.id === 'crouch'" name="crouch" :size="26" />
      <GameIcon v-else-if="btn.id === 'ware'" name="ware" :size="24" />
      <template v-else>{{ btn.label }}</template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { ControlId, ControlLayout } from '@/game/controlLayout'
import { clampItem } from '@/game/controlLayout'
import {
  beginDragSession,
  moveDragSession,
  screenDeltaToPlayDelta,
  type DragSession,
} from '@/game/controlDrag'
import GameIcon from '@/components/GameIcon.vue'
import type { IconName } from '@/components/iconData'

const props = withDefaults(
  defineProps<{
    rotated?: boolean
    breakLabel?: string
    crouched?: boolean
    layout: ControlLayout
    editing?: boolean
    selectedId?: ControlId | null
    /** 与模式同步：挖=铲子 dig，建=锤子 build */
    modeIcon?: IconName
    buildMode?: boolean
    /** 触摸设备强制显示，避免大屏 + fine pointer 被 CSS 藏掉 */
    forceShow?: boolean
  }>(),
  { modeIcon: 'dig', buildMode: false, forceShow: false }
)

const emit = defineEmits<{
  move: [forward: number, strafe: number]
  look: [dx: number, dy: number]
  jump: []
  break: []
  crouchToggle: []
  warehouse: []
  select: [id: ControlId]
  'update-item': [id: ControlId, patch: { x?: number; y?: number }]
}>()

const breakLabel = computed(() => props.breakLabel || '挖')
const crouched = computed(() => Boolean(props.crouched))
const editing = computed(() => Boolean(props.editing))
const selectedId = computed(() => props.selectedId ?? null)
const modeIcon = computed(() => props.modeIcon || 'dig')
const buildMode = computed(() => Boolean(props.buildMode))
const forceShow = computed(() => Boolean(props.forceShow))

const actionButtons: { id: ControlId; label: string; title: string }[] = [
  { id: 'jump', label: '跳', title: '跳跃' },
  { id: 'ware', label: '仓', title: '仓库' },
  { id: 'break', label: '挖', title: '操作' },
  { id: 'crouch', label: '蹲', title: '蹲下' },
]

function btnTitle(id: ControlId) {
  if (id === 'break') return buildMode.value ? '确认建造' : breakLabel.value
  const btn = actionButtons.find((b) => b.id === id)
  return btn?.title || ''
}

/** 键位旁短文案（移动端提示） */
function btnCaption(id: ControlId) {
  if (id === 'break') return buildMode.value ? '放置' : '操作'
  if (id === 'jump') return '跳跃'
  if (id === 'crouch') return crouched.value ? '站立' : '下蹲'
  if (id === 'ware') return '仓库'
  return ''
}

const stickArea = ref<HTMLElement | null>(null)
const stickId = ref<number | null>(null)
const lookId = ref<number | null>(null)
const dragId = ref<number | null>(null)
const dragging = ref<ControlId | null>(null)
const dragSession = ref<DragSession | null>(null)
const lastLook = reactive({ x: 0, y: 0 })
const offset = reactive({ x: 0, y: 0 })
const BASE_STICK = 110
const BASE_BTN = 64

function itemOf(id: ControlId) {
  return props.layout.items[id]
}

function boxSize(id: ControlId) {
  const base = id === 'stick' ? BASE_STICK : BASE_BTN
  const s = base * itemOf(id).size
  return { w: s, h: s }
}

function widgetStyle(id: ControlId) {
  const it = itemOf(id)
  const { w, h } = boxSize(id)
  return {
    left: `${it.x}%`,
    bottom: `${it.y}%`,
    width: `${w}px`,
    height: `${h}px`,
    opacity: it.opacity,
  }
}

const stickBaseStyle = computed(() => {
  const it = itemOf('stick')
  const size = BASE_STICK * it.size
  return {
    width: `${size * 0.85}px`,
    height: `${size * 0.85}px`,
  }
})

const radius = computed(() => (BASE_STICK * itemOf('stick').size * 0.85) / 2 - 8)

const knobStyle = computed(() => {
  const kn = Math.max(28, BASE_STICK * itemOf('stick').size * 0.36)
  return {
    width: `${kn}px`,
    height: `${kn}px`,
    margin: `${-kn / 2}px 0 0 ${-kn / 2}px`,
    transform: `translate(${offset.x}px, ${offset.y}px)`,
  }
})

let lastCrouchAt = 0
function fireAction(id: ControlId) {
  if (id === 'jump') emit('jump')
  else if (id === 'ware') emit('warehouse')
  else if (id === 'break') emit('break')
  else if (id === 'crouch') {
    const now = performance.now()
    if (now - lastCrouchAt < 280) return
    lastCrouchAt = now
    emit('crouchToggle')
  }
}

function clampStick(dx: number, dy: number) {
  const r = radius.value
  const len = Math.hypot(dx, dy)
  if (len > r) {
    const s = r / len
    return { x: dx * s, y: dy * s }
  }
  return { x: dx, y: dy }
}

function mapScreenDelta(sx: number, sy: number) {
  return screenDeltaToPlayDelta(sx, sy)
}

function publishMove() {
  const r = radius.value || 1
  emit('move', -offset.y / r, offset.x / r)
}

const winDragOpts: AddEventListenerOptions = { capture: true, passive: false }

function unbindWindowDrag() {
  window.removeEventListener('pointermove', onWindowDragMove, winDragOpts)
  window.removeEventListener('pointerup', onWindowDragUp, winDragOpts)
  window.removeEventListener('pointercancel', onWindowDragUp, winDragOpts)
}

function bindWindowDrag() {
  unbindWindowDrag()
  window.addEventListener('pointermove', onWindowDragMove, winDragOpts)
  window.addEventListener('pointerup', onWindowDragUp, winDragOpts)
  window.addEventListener('pointercancel', onWindowDragUp, winDragOpts)
}

/**
 * 编辑拖动：绝对跟手 + window capture，不被遮挡层截断。
 */
function onWidgetDown(e: PointerEvent, id: ControlId) {
  if (editing.value) {
    e.preventDefault()
    e.stopPropagation()
    emit('select', id)
    dragging.value = id
    dragId.value = e.pointerId
    const it = itemOf(id)
    const el = e.currentTarget as HTMLElement
    const box = {
      w: el.offsetWidth || boxSize(id).w,
      h: el.offsetHeight || boxSize(id).h,
    }
    dragSession.value = beginDragSession(
      e.clientX,
      e.clientY,
      e.pointerId,
      it.x,
      it.y,
      box.w,
      box.h
    )
    bindWindowDrag()
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* window capture 兜底 */
    }
    return
  }
  if (id === 'stick') {
    onStickDown(e)
    return
  }
  fireAction(id)
}

function onStickOrDragMove(e: PointerEvent, id: ControlId) {
  if (editing.value) {
    onBtnDragMove(e, id)
    return
  }
  if (id === 'stick') onStickMove(e)
}

function onStickOrDragUp(e: PointerEvent, id: ControlId) {
  if (editing.value) {
    onBtnDragUp(e, id)
    return
  }
  if (id === 'stick') onStickUp(e)
}

function applyDragFromPointer(e: PointerEvent) {
  const id = dragging.value
  const session = dragSession.value
  if (!editing.value || !id || !session || e.pointerId !== session.pointerId) return
  const next = moveDragSession(e.clientX, e.clientY, session)
  const clamped = clampItem({ ...itemOf(id), x: next.x, y: next.y })
  emit('update-item', id, { x: clamped.x, y: clamped.y })
}

function onWindowDragMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== dragId.value) return
  e.preventDefault()
  applyDragFromPointer(e)
}

function onWindowDragUp(e: PointerEvent) {
  if (e.pointerId !== dragId.value) return
  e.preventDefault()
  onBtnDragUp(e)
}

function onBtnDragMove(e: PointerEvent, id: ControlId) {
  if (!editing.value || dragging.value !== id || e.pointerId !== dragId.value) return
  applyDragFromPointer(e)
}

function onBtnDragUp(_e?: PointerEvent, _id?: ControlId) {
  dragging.value = null
  dragId.value = null
  dragSession.value = null
  unbindWindowDrag()
}

function onStickDown(e: PointerEvent) {
  e.stopPropagation()
  if (stickId.value !== null) return
  if (lookId.value === e.pointerId) lookId.value = null
  stickId.value = e.pointerId
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  onStickMove(e)
}

function onStickMove(e: PointerEvent) {
  if (e.pointerId !== stickId.value || !stickArea.value) return
  const rect = stickArea.value.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const local = mapScreenDelta(e.clientX - cx, e.clientY - cy)
  const next = clampStick(local.x, local.y)
  offset.x = next.x
  offset.y = next.y
  publishMove()
}

function onStickUp(e: PointerEvent) {
  if (e.pointerId !== stickId.value) return
  stickId.value = null
  offset.x = 0
  offset.y = 0
  emit('move', 0, 0)
}

function onLookDown(e: PointerEvent) {
  if (e.pointerId === stickId.value) return
  if (lookId.value !== null) return
  lookId.value = e.pointerId
  lastLook.x = e.clientX
  lastLook.y = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onLookMove(e: PointerEvent) {
  if (e.pointerId !== lookId.value) return
  if (e.pointerId === stickId.value) return
  const rawDx = e.clientX - lastLook.x
  const rawDy = e.clientY - lastLook.y
  lastLook.x = e.clientX
  lastLook.y = e.clientY
  if (rawDx === 0 && rawDy === 0) return
  const mapped = mapScreenDelta(rawDx, rawDy)
  emit('look', mapped.x, mapped.y)
}

function onLookUp(e: PointerEvent) {
  if (e.pointerId !== lookId.value) return
  lookId.value = null
}

watch(editing, (on) => {
  if (on) {
    offset.x = 0
    offset.y = 0
    emit('move', 0, 0)
    stickId.value = null
    lookId.value = null
  } else {
    onBtnDragUp()
  }
})

onBeforeUnmount(() => {
  onBtnDragUp()
  emit('move', 0, 0)
})
</script>

<style scoped>
.controls {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 3;
}

.controls.editing {
  z-index: 40;
}

.controls.editing::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.22);
  pointer-events: none;
  z-index: 0;
}

.look-layer,
.widget {
  pointer-events: auto;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.look-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: transparent;
}

.widget {
  position: absolute;
  z-index: 3;
  box-sizing: border-box;
}

.stick-area {
  display: grid;
  place-items: center;
}

.stick-base {
  border-radius: 50%;
  border: 2px solid rgba(61, 214, 198, 0.45);
  background: rgba(7, 16, 21, 0.5);
  position: relative;
}

.stick-knob {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
  background: rgba(61, 214, 198, 0.6);
  border: 2px solid rgba(232, 244, 242, 0.55);
  box-shadow: 0 0 12px rgba(61, 214, 198, 0.35);
  will-change: transform;
}

.label,
.edit-tag {
  position: absolute;
  bottom: 2px;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: rgba(232, 244, 242, 0.7);
  text-shadow: 0 1px 2px #000;
  pointer-events: none;
}

.act {
  /* 必须 absolute：相对定位会覆盖 .widget，导致键位挤叠、拖动受限 */
  position: absolute;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.55);
  background: rgba(20, 36, 42, 0.72);
  color: #e8f4f2;
  font-size: 0.8rem;
  font-family: var(--font-display);
  font-weight: 600;
  padding: 0;
  display: grid;
  place-items: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
  -webkit-tap-highlight-color: transparent;
  overflow: visible;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.12s ease,
    color 0.18s ease;
}

.act-cap {
  position: absolute;
  left: 50%;
  top: 0;
  z-index: 2;
  transform: translate(-50%, -72%);
  min-width: 2.2em;
  padding: 0.1rem 0.34rem;
  border-radius: 999px;
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.2;
  white-space: nowrap;
  background: rgba(8, 14, 18, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: #f2f7f6;
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
}
.act.break.mode-build .act-cap {
  border-color: rgba(142, 240, 180, 0.75);
  color: #d9ffe8;
  background: rgba(12, 40, 28, 0.92);
}
.act.break.mode-dig .act-cap {
  border-color: rgba(255, 180, 130, 0.6);
  color: #ffe8d8;
}
.act.jump .act-cap {
  border-color: rgba(240, 200, 120, 0.65);
  color: #ffe9c2;
}
.act.crouch .act-cap {
  border-color: rgba(160, 190, 230, 0.7);
  color: #d7e6ff;
}
.act.crouch.on .act-cap {
  border-color: #a8c4ff;
  color: #eef4ff;
  background: rgba(30, 50, 90, 0.92);
}
.act.ware .act-cap {
  border-color: rgba(180, 160, 255, 0.75);
  color: #e8e0ff;
}

.act.ware {
  border-radius: 12px;
  border-color: rgba(180, 160, 255, 0.9);
  background: rgba(50, 40, 90, 0.75);
}

.act:active,
.act.on {
  background: rgba(61, 214, 198, 0.55);
  border-color: #7ee7dc;
}

.act.break.mode-dig {
  border-color: rgba(255, 168, 120, 0.92);
  background: linear-gradient(160deg, rgba(90, 48, 28, 0.82), rgba(50, 28, 18, 0.78));
  color: #ffe8d4;
  box-shadow: 0 0 0 1px rgba(255, 160, 100, 0.2);
}
.act.break.mode-build {
  border-color: rgba(120, 220, 170, 0.95);
  background: linear-gradient(160deg, rgba(28, 78, 52, 0.88), rgba(18, 48, 34, 0.82));
  color: #d8ffe8;
  box-shadow: 0 0 0 1px rgba(110, 230, 160, 0.28);
}
.mode-pulse {
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  border: 2px solid rgba(142, 240, 180, 0.65);
  pointer-events: none;
  animation: mode-pulse 1.4s ease-out infinite;
}
@keyframes mode-pulse {
  0% {
    transform: scale(0.92);
    opacity: 0.85;
  }
  100% {
    transform: scale(1.28);
    opacity: 0;
  }
}
.act.jump {
  border-color: rgba(240, 200, 120, 0.9);
  background: rgba(70, 50, 20, 0.72);
}
.act.crouch {
  border-color: rgba(160, 180, 220, 0.9);
  background: rgba(30, 40, 70, 0.72);
}
.act.crouch.on {
  background: rgba(80, 120, 200, 0.75);
  border-color: #a8c4ff;
}

.widget.selected {
  outline: 2px solid #f0c878;
  outline-offset: 3px;
  box-shadow: 0 0 0 4px rgba(240, 200, 120, 0.25);
  z-index: 6;
}

@media (min-width: 900px) and (pointer: fine) {
  .controls:not(.editing):not(.forced) {
    display: none;
  }
}
</style>
