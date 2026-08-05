/**
 * 自定义键位拖动几何（v4）
 *
 * 强制横屏唯一真相来源：useForceLandscape 写在 .app-shell 上的
 *   data-logic-w / data-logic-h / transform:rotate(90deg)
 * 禁止用 play.clientWidth（竖屏短边会把拖动卡在半屏）。
 */

export const CONTROL_DRAG_VERSION = 5

export function isForcedLandscape(): boolean {
  if (typeof document === 'undefined') return false
  if (document.documentElement.classList.contains('sv-forced-landscape')) return true
  const shell = document.querySelector('.app-shell') as HTMLElement | null
  const t = shell?.style?.transform || ''
  return /rotate\(/i.test(t)
}

/** 逻辑画布（横屏宽×高） */
export function layoutCanvasSize(): { w: number; h: number } {
  const shell = document.querySelector('.app-shell') as HTMLElement | null
  if (shell) {
    const dw = Number(shell.dataset.logicW)
    const dh = Number(shell.dataset.logicH)
    if (dw > 0 && dh > 0) return { w: dw, h: dh }
    const sw = parseFloat(shell.style.width)
    const sh = parseFloat(shell.style.height)
    if (sw > 0 && sh > 0) return { w: sw, h: sh }
  }
  if (isForcedLandscape()) {
    return {
      w: Math.max(1, window.innerHeight),
      h: Math.max(1, window.innerWidth),
    }
  }
  const play = document.querySelector('.play') as HTMLElement | null
  return {
    w: Math.max(1, play?.clientWidth || window.innerWidth),
    h: Math.max(1, play?.clientHeight || window.innerHeight),
  }
}

/**
 * 屏幕 client → 逻辑画布坐标（左上原点，x 右 y 下）
 * rotate(90deg CW) + origin(0,0) + left=innerWidth, top=0：
 *   localX = clientY
 *   localY = innerWidth - clientX
 */
export function clientToLocal(clientX: number, clientY: number): {
  x: number
  y: number
  w: number
  h: number
} {
  const { w, h } = layoutCanvasSize()
  if (!isForcedLandscape()) {
    const play = document.querySelector('.play') as HTMLElement | null
    if (play) {
      const r = play.getBoundingClientRect()
      return { x: clientX - r.left, y: clientY - r.top, w, h }
    }
    return { x: clientX, y: clientY, w, h }
  }
  const shell = document.querySelector('.app-shell') as HTMLElement | null
  const originX = parseFloat(shell?.style.left || '')
  const originY = parseFloat(shell?.style.top || '')
  const ox = Number.isFinite(originX) ? originX : window.innerWidth
  const oy = Number.isFinite(originY) ? originY : 0
  return {
    x: clientY - oy,
    y: ox - clientX,
    w,
    h,
  }
}

export type DragSession = {
  pointerId: number
  /** 抓取点相对控件左上角（逻辑像素） */
  grabX: number
  grabY: number
  boxW: number
  boxH: number
  startLeftPct: number
  startBottomPct: number
}

export function beginDragSession(
  clientX: number,
  clientY: number,
  pointerId: number,
  leftPct: number,
  bottomPct: number,
  boxW: number,
  boxH: number
): DragSession {
  const local = clientToLocal(clientX, clientY)
  const left = (leftPct / 100) * local.w
  const top = local.h - (bottomPct / 100) * local.h - boxH
  return {
    pointerId,
    grabX: local.x - left,
    grabY: local.y - top,
    boxW: Math.max(1, boxW),
    boxH: Math.max(1, boxH),
    startLeftPct: leftPct,
    startBottomPct: bottomPct,
  }
}

/** 绝对跟手：指针位置 − grab → left%/bottom% */
export function moveDragSession(
  clientX: number,
  clientY: number,
  session: DragSession
): { x: number; y: number } {
  const local = clientToLocal(clientX, clientY)
  let left = local.x - session.grabX
  let top = local.y - session.grabY

  left = Math.max(0, Math.min(local.w - session.boxW * 0.2, left))
  top = Math.max(0, Math.min(local.h - session.boxH * 0.2, top))

  const x = (left / local.w) * 100
  const y = ((local.h - top - session.boxH) / local.h) * 100
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  }
}

/** 摇杆：屏幕位移 → 画布位移 */
export function screenDeltaToPlayDelta(
  screenDx: number,
  screenDy: number
): { x: number; y: number } {
  if (!isForcedLandscape()) return { x: screenDx, y: screenDy }
  return { x: screenDy, y: -screenDx }
}

/** @deprecated 保留给 HUD 位移路径；新拖动用 begin/moveDragSession */
export function screenDeltaToLayoutDelta(
  screenDx: number,
  screenDy: number,
  rotated: boolean
): { dxPct: number; dyPct: number } {
  const { w, h } = layoutCanvasSize()
  let dx = screenDx
  let dy = screenDy
  if (rotated || isForcedLandscape()) {
    dx = screenDy
    dy = -screenDx
  }
  return {
    dxPct: (dx / w) * 100,
    dyPct: -(dy / h) * 100,
  }
}
