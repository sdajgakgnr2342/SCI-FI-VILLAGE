/** 世界格子编号（队友可对同一位置说同一个号） */
export const MAP_CELL_SIZE = 8
/** 编号原点：世界坐标 (-512,-512) 对应格子 (0,0) → 编号 1 起 */
const ORIGIN = -64 // in cells → world -512
const GRID_SPAN = 128 // cells across

export function worldToCell(x: number, z: number) {
  const cx = Math.floor(x / MAP_CELL_SIZE)
  const cz = Math.floor(z / MAP_CELL_SIZE)
  return { cx, cz }
}

/** 全局唯一格子编号，从 1 开始 */
export function cellNumber(cx: number, cz: number) {
  const col = cx - ORIGIN
  const row = cz - ORIGIN
  if (col < 0 || row < 0 || col >= GRID_SPAN || row >= GRID_SPAN) {
    // 超出预设范围：仍给一个稳定大数编号
    return (cz + 10000) * 100000 + (cx + 10000) + 1
  }
  return row * GRID_SPAN + col + 1
}

export function cellNumberAt(x: number, z: number) {
  const { cx, cz } = worldToCell(x, z)
  return cellNumber(cx, cz)
}

export function cellCenter(cx: number, cz: number) {
  return {
    x: cx * MAP_CELL_SIZE + MAP_CELL_SIZE / 2,
    z: cz * MAP_CELL_SIZE + MAP_CELL_SIZE / 2,
  }
}
