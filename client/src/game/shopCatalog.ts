/**
 * 商城目录与金币经济（武器不可购买）。
 */

import type { ChestTier } from './treasureChest'
import type { CombatWeaponId, MonsterTierId } from './combatStats'
import type { MaterialId } from './inventory'

export const START_GOLD = 100000

/** 可购买 / 可放置的家具道具 */
export type FurnitureId =
  | 'window'
  | 'door'
  | 'stove'
  | 'craft'
  | 'lamp'
  | 'fence'
  | 'wire'
  | 'cobble'
  | 'pond'
  | 'firepit'

export type ShopCategory = 'build' | 'consumable'

export interface ShopItem {
  id: string
  category: ShopCategory
  label: string
  price: number
  /** 建造物 */
  furnitureId?: FurnitureId
  /** 药物 */
  medkit?: 'medkit_small' | 'medkit_large'
  hint?: string
}

export const FURNITURE_LABEL: Record<FurnitureId, string> = {
  window: '窗户',
  door: '门',
  stove: '火炉',
  craft: '制作台',
  lamp: '灯',
  fence: '木栅栏',
  wire: '通电铁丝网',
  cobble: '鹅卵石',
  pond: '小池塘',
  firepit: '火堆',
}

export const FURNITURE_IDS: FurnitureId[] = [
  'window',
  'door',
  'stove',
  'craft',
  'lamp',
  'fence',
  'wire',
  'cobble',
  'pond',
  'firepit',
]

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'buy_window', category: 'build', label: '窗户', furnitureId: 'window', price: 500, hint: '装饰木窗' },
  { id: 'buy_door', category: 'build', label: '门', furnitureId: 'door', price: 800, hint: '可开关' },
  { id: 'buy_stove', category: 'build', label: '火炉', furnitureId: 'stove', price: 2500, hint: '可点火' },
  { id: 'buy_craft', category: 'build', label: '制作台', furnitureId: 'craft', price: 4000, hint: '制作特效' },
  { id: 'buy_lamp', category: 'build', label: '灯', furnitureId: 'lamp', price: 1800, hint: '三态照明' },
  { id: 'buy_fence', category: 'build', label: '木栅栏', furnitureId: 'fence', price: 300, hint: '一段' },
  { id: 'buy_wire', category: 'build', label: '通电铁丝网', furnitureId: 'wire', price: 1200, hint: '一段' },
  { id: 'buy_cobble', category: 'build', label: '鹅卵石', furnitureId: 'cobble', price: 200, hint: '一格' },
  { id: 'buy_pond', category: 'build', label: '小池塘', furnitureId: 'pond', price: 3500 },
  { id: 'buy_firepit', category: 'build', label: '火堆', furnitureId: 'firepit', price: 5000, hint: '灼烧野怪' },
  { id: 'buy_med_s', category: 'consumable', label: '小药包', medkit: 'medkit_small', price: 400, hint: '+800 生命' },
  { id: 'buy_med_l', category: 'consumable', label: '大药包', medkit: 'medkit_large', price: 1100, hint: '+2500 生命' },
]

export const MATERIAL_SELL: Record<MaterialId, number> = {
  wood: 8,
  stone: 10,
  dirt: 3,
  sand: 3,
  turf: 4,
  dry_grass: 2,
}

export const MEDKIT_SELL = { medkit_small: 120, medkit_large: 350 }

export const WEAPON_SELL: Record<CombatWeaponId, number> = {
  fist: 0,
  axe: 0,
  staff: 800,
  cleaver: 1500,
  pistol: 2200,
  rifle: 2800,
  sniper: 4500,
}

export const CHEST_SELL: Record<ChestTier, number> = {
  common: 200,
  fine: 500,
  exquisite: 1500,
  supreme: 4000,
  legendary: 10000,
}

/** 击杀必得金币（区间随机） */
export const KILL_GOLD_RANGE: Record<MonsterTierId, [number, number]> = {
  scrapmite: [80, 140],
  miregrub: [180, 280],
  shardhound: [400, 650],
  voltspire: [900, 1400],
  voidmaw: [2200, 3500],
}

export function rollKillGold(tier: MonsterTierId): number {
  const [a, b] = KILL_GOLD_RANGE[tier] || [50, 100]
  return a + Math.floor(Math.random() * (b - a + 1))
}

export function emptyFurniture(): Record<FurnitureId, number> {
  const out = {} as Record<FurnitureId, number>
  for (const id of FURNITURE_IDS) out[id] = 0
  return out
}

/** 家具卖价 ≈ 购价 40% */
export function furnitureSellPrice(id: FurnitureId): number {
  const buy = SHOP_ITEMS.find((x) => x.furnitureId === id)
  return buy ? Math.floor(buy.price * 0.4) : 50
}

export function formatGold(n: number): string {
  const v = Math.max(0, Math.floor(n || 0))
  return v.toLocaleString('zh-CN')
}

/** 死亡清场：建筑物/家具折现金币上限 */
export const DEATH_BUILD_COMP_CAP = 1000

/** 方块折现：石头 10、木块 5、空气 0、其它实心 2 */
export function deathBlockGold(blockId: string): number {
  const id = String(blockId || '')
  if (!id || id === 'air') return 0
  if (id === 'stone' || id === 'rubble') return 10
  if (id === 'wood' || id === 'plank' || id === 'stump') return 5
  return 2
}

/**
 * 已放置家具死亡折现（远低于购价，略作安慰）
 * 制作台 100、灯 10 …
 */
export const DEATH_FURNITURE_GOLD: Record<FurnitureId, number> = {
  window: 20,
  door: 28,
  stove: 55,
  craft: 100,
  lamp: 10,
  fence: 8,
  wire: 22,
  cobble: 5,
  pond: 65,
  firepit: 80,
}

export function deathFurnitureGold(propId: string): number {
  return DEATH_FURNITURE_GOLD[propId as FurnitureId] || 15
}

/** 死亡清场总补偿（方块 + 家具），封顶 1000 */
export function calcDeathBuildCompensation(
  blockIds: string[],
  furniturePropIds: string[]
): number {
  let sum = 0
  for (const id of blockIds) sum += deathBlockGold(id)
  for (const id of furniturePropIds) sum += deathFurnitureGold(id)
  return Math.min(DEATH_BUILD_COMP_CAP, Math.max(0, Math.floor(sum)))
}

/** 死亡：未装备武器进保险箱的最大数量；超出按售价折现 */
export const SAFE_VAULT_MAX = 3

export type StoredWeaponLike = { id: string; weaponId: CombatWeaponId | string }

/**
 * 死亡分拆：仅当前装备进物资盒；未装备进保险箱（最多 SAFE_VAULT_MAX）；
 * 超出保险箱的按售价折金。
 */
export function splitDeathWeapons(bag: {
  weapons?: StoredWeaponLike[]
  equippedWeapon?: string
}): {
  dropWeapons: StoredWeaponLike[]
  vaultWeapons: StoredWeaponLike[]
  overflowGold: number
} {
  const weapons = Array.isArray(bag.weapons) ? [...bag.weapons] : []
  const eq = String(bag.equippedWeapon || 'fist')
  const dropWeapons: StoredWeaponLike[] = []
  if (eq && eq !== 'fist' && eq !== 'axe') {
    const idx = weapons.findIndex((w) => w && w.weaponId === eq)
    if (idx >= 0) dropWeapons.push(...weapons.splice(idx, 1))
  }
  weapons.sort(
    (a, b) => (WEAPON_SELL[b.weaponId as CombatWeaponId] || 0) - (WEAPON_SELL[a.weaponId as CombatWeaponId] || 0)
  )
  const vaultWeapons = weapons.slice(0, SAFE_VAULT_MAX)
  const overflow = weapons.slice(SAFE_VAULT_MAX)
  let overflowGold = 0
  for (const w of overflow) {
    overflowGold += WEAPON_SELL[w.weaponId as CombatWeaponId] || 0
  }
  return { dropWeapons, vaultWeapons, overflowGold }
}
