/** 仓库材料 / 工具 / 建造形状 */

export type MaterialId = 'turf' | 'stone' | 'wood' | 'dry_grass' | 'dirt' | 'sand'
export type ToolId = 'hand' | 'axe'
export type BuildShape = 'single' | 'wall' | 'column' | 'floor'

export const MATERIAL_LABEL: Record<MaterialId, string> = {
  turf: '草坪',
  stone: '石材',
  wood: '木材',
  dry_grass: '枯草',
  dirt: '泥土',
  sand: '沙子',
}

export const TOOL_LABEL: Record<ToolId, string> = {
  hand: '手',
  axe: '斧头',
}

export const SHAPE_LABEL: Record<BuildShape, string> = {
  single: '单块',
  wall: '墙3×3',
  column: '柱×3',
  floor: '地板3×3',
}

/** 建造消耗数量 */
export const SHAPE_COST: Record<BuildShape, number> = {
  single: 1,
  wall: 9,
  column: 3,
  floor: 9,
}

export function createInventory() {
  return {
    turf: 0,
    stone: 0,
    wood: 0,
    dry_grass: 0,
    dirt: 0,
    sand: 0,
  } as Record<MaterialId, number>
}

export type InventoryCounts = Record<MaterialId, number>

export function addMaterial(inv: InventoryCounts, id: MaterialId, n = 1) {
  inv[id] = (inv[id] || 0) + n
}

export function trySpend(inv: InventoryCounts, id: MaterialId, n: number): boolean {
  if ((inv[id] || 0) < n) return false
  inv[id] -= n
  return true
}
