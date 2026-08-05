/** 移动端键位布局（仿吃鸡自定义） */

export type ControlId =
  | 'stick'
  | 'jump'
  | 'ware'
  | 'break'
  | 'crouch'
  | 'place'
  | 'targetHint'
  | 'actionRing'

export interface ControlItemLayout {
  /** 左缘百分比 0–100 */
  x: number
  /** 底缘百分比 0–100 */
  y: number
  /** 尺寸倍率 */
  size: number
  /** 透明度 0.2–1 */
  opacity: number
}

export interface ControlLayout {
  /** v2：右下拇指簇默认；旧版本地缓存会自动重置 */
  version: 2
  items: Record<ControlId, ControlItemLayout>
}

export const CONTROL_IDS: ControlId[] = [
  'stick',
  'jump',
  'ware',
  'break',
  'crouch',
  'place',
  'targetHint',
  'actionRing',
]

export const CONTROL_LABEL: Record<ControlId, string> = {
  stick: '移动轮盘',
  jump: '跳跃',
  ware: '仓库',
  break: '操作/放置',
  crouch: '下蹲',
  place: '模式',
  targetHint: '物体提示',
  actionRing: '操作圆环',
}

/**
 * 官方默认：右下拇指可达弧形簇（用户可再微调）
 *
 * ```
 *   [蹲]  [跳]
 *           [模式]
 *     [操作大]  [仓]
 * ```
 */
export function defaultControlLayout(): ControlLayout {
  return {
    version: 2,
    items: {
      stick: { x: 3, y: 5, size: 1.12, opacity: 0.88 },
      // 右下簇
      crouch: { x: 66, y: 34, size: 0.86, opacity: 0.9 },
      jump: { x: 78, y: 36, size: 1.02, opacity: 0.9 },
      place: { x: 88, y: 22, size: 1.02, opacity: 0.9 },
      break: { x: 70, y: 8, size: 1.38, opacity: 0.92 },
      ware: { x: 90, y: 5, size: 0.9, opacity: 0.9 },
      // HUD
      actionRing: { x: 42, y: 40, size: 1, opacity: 0.95 },
      targetHint: { x: 40, y: 24, size: 1, opacity: 0.92 },
    },
  }
}

export function clampItem(item: ControlItemLayout): ControlItemLayout {
  return {
    x: Math.max(0, Math.min(92, item.x)),
    y: Math.max(0, Math.min(88, item.y)),
    size: Math.max(0.6, Math.min(1.8, item.size)),
    opacity: Math.max(0.25, Math.min(1, item.opacity)),
  }
}

export function normalizeControlLayout(raw: unknown): ControlLayout {
  const base = defaultControlLayout()
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Partial<ControlLayout> & { version?: number; items?: Partial<Record<ControlId, ControlItemLayout>> }
  if (!obj.items || typeof obj.items !== 'object') return base

  // v1 官方旧默认（place 偏高、簇不成型）→ 重置；其它已微调的 v1 保留坐标
  if (obj.version === 1 && isLegacyStockDefault(obj.items)) {
    return base
  }
  if (obj.version !== 1 && obj.version !== 2) return base

  const items = { ...base.items }
  for (const id of CONTROL_IDS) {
    const it = obj.items[id]
    if (it && typeof it === 'object') {
      items[id] = clampItem({
        x: Number(it.x),
        y: Number(it.y),
        size: Number(it.size),
        opacity: Number(it.opacity),
      })
    }
  }
  return { version: 2, items }
}

/** 识别未改过的 v1 出厂坐标 */
function isLegacyStockDefault(items: Partial<Record<ControlId, ControlItemLayout>>) {
  const p = items.place
  const c = items.crouch
  const b = items.break
  if (!p || !c || !b) return true
  return (
    Math.abs(Number(p.x) - 83) < 1.5 &&
    Math.abs(Number(p.y) - 44) < 1.5 &&
    Math.abs(Number(c.x) - 88) < 1.5 &&
    Math.abs(Number(b.x) - 78) < 1.5
  )
}

const LS_PREFIX = 'sv_control_layout_v2'

function storageKey(userId?: number | null) {
  if (userId && Number.isFinite(userId) && userId > 0) {
    return `${LS_PREFIX}_u${userId}`
  }
  return `${LS_PREFIX}_guest`
}

export function loadLayoutLocal(userId?: number | null): ControlLayout {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return defaultControlLayout()
    return normalizeControlLayout(JSON.parse(raw))
  } catch {
    return defaultControlLayout()
  }
}

export function saveLayoutLocal(layout: ControlLayout, userId?: number | null) {
  localStorage.setItem(storageKey(userId), JSON.stringify(layout))
}
