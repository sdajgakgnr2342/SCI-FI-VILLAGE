/**
 * 扩展仓库：材料 + 宝箱 + 武器 + 药物 + 装备与血量快照。
 * 服务器 inv_json 存同一结构；旧存档仅材料时 normalize 可兼容。
 */

import type { ChestTier } from './treasureChest'
import type { CombatWeaponId } from './combatStats'
import { PLAYER_MAX_HP } from './combatStats'
import { START_GOLD, emptyFurniture, type FurnitureId, FURNITURE_IDS } from './shopCatalog'

export type MaterialId = 'turf' | 'stone' | 'wood' | 'dry_grass' | 'dirt' | 'sand'
export type ToolId = 'hand' | 'axe'
export type BuildShape = 'single' | 'wall' | 'column' | 'floor'
export type ConsumableId = 'medkit_small' | 'medkit_large'

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

export const SHAPE_COST: Record<BuildShape, number> = {
  single: 1,
  wall: 9,
  column: 3,
  floor: 9,
}

export const CONSUMABLE_LABEL: Record<ConsumableId, string> = {
  medkit_small: '小药包',
  medkit_large: '大药包',
}

export type InventoryCounts = Record<MaterialId, number>

export interface StoredChest {
  id: string
  tier: ChestTier
  /** 未领取前可预览；领取后从列表移除 */
  sealed: boolean
  /** 开箱预览内容（领取时写入材料/武器） */
  preview?: LootPreview
}

export interface StoredWeapon {
  id: string
  weaponId: CombatWeaponId
}

export interface LootPreview {
  materials?: Partial<Record<MaterialId, number>>
  weapons?: CombatWeaponId[]
  medkit_small?: number
  medkit_large?: number
}

/** 完整玩家背包（含战斗状态） */
export interface PlayerBag {
  materials: InventoryCounts
  chests: StoredChest[]
  weapons: StoredWeapon[]
  furniture: Record<FurnitureId, number>
  medkit_small: number
  medkit_large: number
  equippedWeapon: CombatWeaponId
  hp: number
  lastDamageAt: number
  gold: number
}

export function createInventory(): InventoryCounts {
  return {
    turf: 0,
    stone: 0,
    wood: 0,
    dry_grass: 0,
    dirt: 0,
    sand: 0,
  }
}

export function createPlayerBag(): PlayerBag {
  return {
    materials: createInventory(),
    chests: [],
    weapons: [],
    furniture: emptyFurniture(),
    medkit_small: 0,
    medkit_large: 0,
    equippedWeapon: 'fist',
    hp: PLAYER_MAX_HP,
    lastDamageAt: 0,
    gold: START_GOLD,
  }
}

export function addMaterial(inv: InventoryCounts, id: MaterialId, n = 1) {
  inv[id] = (inv[id] || 0) + n
}

export function trySpend(inv: InventoryCounts, id: MaterialId, n: number): boolean {
  if ((inv[id] || 0) < n) return false
  inv[id] -= n
  return true
}

const MAT_KEYS: MaterialId[] = ['turf', 'stone', 'wood', 'dry_grass', 'dirt', 'sand']
const WEAPON_IDS = new Set([
  'fist',
  'axe',
  'staff',
  'cleaver',
  'pistol',
  'rifle',
  'sniper',
])

function clampInt(n: unknown, max = 999999) {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? Math.min(max, Math.floor(v)) : 0
}

/** 兼容旧版纯材料 JSON 与新版 bag */
export function normalizePlayerBag(raw: unknown): PlayerBag {
  const bag = createPlayerBag()
  if (!raw || typeof raw !== 'object') return bag
  const obj = raw as Record<string, unknown>

  // 旧格式：顶层就是材料
  const matSrc =
    obj.materials && typeof obj.materials === 'object'
      ? (obj.materials as Record<string, unknown>)
      : obj
  for (const k of MAT_KEYS) {
    bag.materials[k] = clampInt(matSrc[k])
  }

  if (Array.isArray(obj.chests)) {
    bag.chests = obj.chests
      .filter((c) => c && typeof c === 'object')
      .map((c, i) => {
        const x = c as Record<string, unknown>
        return {
          id: String(x.id || `chest_${i}_${Date.now()}`),
          tier: (['legendary', 'supreme', 'exquisite', 'fine', 'common'].includes(
            String(x.tier)
          )
            ? String(x.tier)
            : 'common') as ChestTier,
          sealed: x.sealed !== false,
          preview: x.preview as LootPreview | undefined,
        }
      })
      .slice(0, 64)
  }

  if (Array.isArray(obj.weapons)) {
    bag.weapons = obj.weapons
      .filter((w) => w && typeof w === 'object')
      .map((w, i) => {
        const x = w as Record<string, unknown>
        const wid = String(x.weaponId || 'staff')
        return {
          id: String(x.id || `wpn_${i}_${Date.now()}`),
          weaponId: (WEAPON_IDS.has(wid) ? wid : 'staff') as CombatWeaponId,
        }
      })
      .slice(0, 32)
  }

  bag.medkit_small = clampInt(obj.medkit_small, 99)
  bag.medkit_large = clampInt(obj.medkit_large, 99)

  bag.furniture = emptyFurniture()
  if (obj.furniture && typeof obj.furniture === 'object') {
    const fr = obj.furniture as Record<string, unknown>
    for (const id of FURNITURE_IDS) {
      bag.furniture[id] = clampInt(fr[id], 9999)
    }
  }

  const eq = String(obj.equippedWeapon || 'fist')
  bag.equippedWeapon = (WEAPON_IDS.has(eq) ? eq : 'fist') as CombatWeaponId

  const hp = Number(obj.hp)
  bag.hp =
    Number.isFinite(hp) && hp >= 0
      ? Math.min(PLAYER_MAX_HP, Math.floor(hp))
      : PLAYER_MAX_HP
  bag.lastDamageAt = clampInt(obj.lastDamageAt, Number.MAX_SAFE_INTEGER)

  // 无 gold 字段 = 旧档，给开局金；显式 0 则保留 0
  if (!('gold' in obj)) {
    bag.gold = START_GOLD
  } else {
    bag.gold = clampInt(obj.gold, 999999999)
  }

  return bag
}

/** 序列化给服务器；同时展平材料键以兼容旧 normalize */
export function serializePlayerBag(bag: PlayerBag): Record<string, unknown> {
  return {
    ...bag.materials,
    materials: { ...bag.materials },
    chests: bag.chests,
    weapons: bag.weapons,
    furniture: { ...bag.furniture },
    medkit_small: bag.medkit_small,
    medkit_large: bag.medkit_large,
    equippedWeapon: bag.equippedWeapon,
    hp: bag.hp,
    lastDamageAt: bag.lastDamageAt,
    gold: bag.gold,
  }
}

export function mergeMaterialsIntoBag(bag: PlayerBag, mats: InventoryCounts) {
  for (const k of MAT_KEYS) bag.materials[k] = mats[k] || 0
}

export function bagMaterials(bag: PlayerBag): InventoryCounts {
  return { ...bag.materials }
}

let _idSeq = 0
export function newItemId(prefix: string) {
  _idSeq += 1
  return `${prefix}_${Date.now()}_${_idSeq}`
}
