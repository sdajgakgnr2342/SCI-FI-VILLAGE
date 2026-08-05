/** 移动端键位布局（仿吃鸡自定义） */

export type ControlId =
  | 'stick'
  | 'jump'
  | 'ware'
  | 'break'
  | 'crouch'
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
  /** v3：www 账号实测簇 + 无模式键（选材料即建造） */
  version: 3
  items: Record<ControlId, ControlItemLayout>
}

export const CONTROL_IDS: ControlId[] = [
  'stick',
  'jump',
  'ware',
  'break',
  'crouch',
  'targetHint',
  'actionRing',
]

export const CONTROL_LABEL: Record<ControlId, string> = {
  stick: '移动轮盘',
  jump: '跳跃',
  ware: '仓库',
  break: '操作/放置',
  crouch: '下蹲',
  targetHint: '物体提示',
  actionRing: '操作圆环',
}

/**
 * 官方默认：取自 www 账号云端键位的坐标与尺寸（透明度另定）
 *
 * ```
 *   [跳]
 *         [操作大]
 *   [蹲]          · 仓在偏上
 * 轮盘左下
 * ```
 */
export function defaultControlLayout(): ControlLayout {
  return {
    version: 3,
    items: {
      stick: { x: 3, y: 5, size: 1.4, opacity: 0.88 },
      jump: { x: 78, y: 33, size: 1, opacity: 0.9 },
      crouch: { x: 76, y: 10, size: 1, opacity: 0.9 },
      break: { x: 85, y: 9, size: 1.7, opacity: 0.92 },
      ware: { x: 83, y: 86, size: 0.65, opacity: 0.9 },
      actionRing: { x: 42, y: 40, size: 1, opacity: 0.95 },
      targetHint: { x: 40, y: 24, size: 1, opacity: 0.92 },
    },
  }
}

export function clampItem(item: ControlItemLayout): ControlItemLayout {
  return {
    x: Math.max(0, Math.min(100, Number.isFinite(item.x) ? item.x : 0)),
    y: Math.max(0, Math.min(100, Number.isFinite(item.y) ? item.y : 0)),
    size: Math.max(0.6, Math.min(1.8, Number.isFinite(item.size) ? item.size : 1)),
    opacity: Math.max(0.25, Math.min(1, Number.isFinite(item.opacity) ? item.opacity : 1)),
  }
}

export function normalizeControlLayout(raw: unknown): ControlLayout {
  const base = defaultControlLayout()
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as {
    version?: unknown
    items?: Partial<Record<string, ControlItemLayout>>
  }
  if (!obj.items || typeof obj.items !== 'object') return base

  const version = Number(obj.version)
  // 仅接受带完整自定义痕迹的 v2/v3；无 version 或旧官方默认 → 新默认
  if (version !== 2 && version !== 3) return base
  if (version === 2 && isLegacyStockDefault(obj.items)) return base

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
  return { version: 3, items }
}

/** 识别未改过的旧出厂坐标（含已删除的 place 键） */
function isLegacyStockDefault(items: Partial<Record<string, ControlItemLayout>>) {
  const p = items.place
  const c = items.crouch
  const b = items.break
  const j = items.jump
  // v1 旧默认
  if (
    p &&
    c &&
    b &&
    Math.abs(Number(p.x) - 83) < 1.5 &&
    Math.abs(Number(p.y) - 44) < 1.5
  ) {
    return true
  }
  // v2 早期默认簇（与 www 实测差距大）
  if (
    j &&
    c &&
    b &&
    Math.abs(Number(j.x) - 78) < 2 &&
    Math.abs(Number(j.y) - 36) < 2 &&
    Math.abs(Number(c.x) - 66) < 2 &&
    Math.abs(Number(b.x) - 70) < 2
  ) {
    return true
  }
  return false
}

const LS_PREFIX = 'sv_control_layout_v3'

function storageKey(userId?: number | null) {
  if (userId && Number.isFinite(userId) && userId > 0) {
    return `${LS_PREFIX}_u${userId}`
  }
  return `${LS_PREFIX}_guest`
}

export function loadLayoutLocal(userId?: number | null): ControlLayout {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) {
      // 兼容读旧 v2 键，再写入 v3
      const legacy =
        localStorage.getItem(
          userId && userId > 0 ? `sv_control_layout_v2_u${userId}` : 'sv_control_layout_v2_guest'
        ) || localStorage.getItem('sv_control_layout')
      if (legacy) {
        const normalized = normalizeControlLayout(JSON.parse(legacy))
        saveLayoutLocal(normalized, userId)
        return normalized
      }
      return defaultControlLayout()
    }
    return normalizeControlLayout(JSON.parse(raw))
  } catch {
    return defaultControlLayout()
  }
}

export function saveLayoutLocal(layout: ControlLayout, userId?: number | null) {
  localStorage.setItem(storageKey(userId), JSON.stringify(layout))
}
