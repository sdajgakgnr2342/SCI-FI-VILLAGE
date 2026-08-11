/**
 * 掉落表：采集 / 击杀掉宝箱，开箱内容。
 */

import type { ChestTier } from './treasureChest'
import type { CombatWeaponId, MonsterTierId } from './combatStats'
import type { LootPreview, MaterialId } from './inventory'
import { newItemId } from './inventory'

function rand() {
  return Math.random()
}

function pickWeighted<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][]
  let sum = 0
  for (const [, w] of entries) sum += Math.max(0, w)
  let r = rand() * sum
  for (const [k, w] of entries) {
    r -= Math.max(0, w)
    if (r <= 0) return k
  }
  return entries[entries.length - 1][0]
}

export type HarvestLootSource = 'chop' | 'mine' | 'dig' | 'clear'

const HARVEST_CHEST_CHANCE: Record<HarvestLootSource, number> = {
  chop: 0.025,
  mine: 0.02,
  dig: 0.004,
  clear: 0.005,
}

const HARVEST_TIER_WEIGHT: Record<HarvestLootSource, Partial<Record<ChestTier, number>>> = {
  chop: { common: 88, fine: 11.5, exquisite: 0.5 },
  mine: { common: 88, fine: 11.5, exquisite: 0.5 },
  dig: { common: 97, fine: 3 },
  clear: { common: 96, fine: 4 },
}

const KILL_CHEST_CHANCE: Record<MonsterTierId, number> = {
  scrapmite: 0.08,
  miregrub: 0.12,
  shardhound: 0.18,
  voltspire: 0.28,
  voidmaw: 0.4,
}

/** 档位权重：高级箱极稀有；小怪仍可出传奇但权重极低 */
const KILL_TIER_WEIGHT: Record<MonsterTierId, Partial<Record<ChestTier, number>>> = {
  scrapmite: { common: 85, fine: 13, exquisite: 1.7, supreme: 0.25, legendary: 0.05 },
  miregrub: { common: 75, fine: 20, exquisite: 4, supreme: 0.8, legendary: 0.2 },
  shardhound: { common: 40, fine: 40, exquisite: 16, supreme: 3.5, legendary: 0.5 },
  voltspire: { common: 15, fine: 40, exquisite: 35, supreme: 8.5, legendary: 1.5 },
  voidmaw: { fine: 25, exquisite: 45, supreme: 25, legendary: 5 },
}

export function rollHarvestChest(source: HarvestLootSource): ChestTier | null {
  if (rand() > HARVEST_CHEST_CHANCE[source]) return null
  const w = HARVEST_TIER_WEIGHT[source] as Record<ChestTier, number>
  return pickWeighted(w)
}

export function rollKillChest(tier: MonsterTierId): ChestTier | null {
  if (rand() > KILL_CHEST_CHANCE[tier]) return null
  const w = KILL_TIER_WEIGHT[tier] as Record<ChestTier, number>
  return pickWeighted(w)
}

function matBunch(tier: ChestTier): Partial<Record<MaterialId, number>> {
  const mul =
    tier === 'legendary'
      ? 8
      : tier === 'supreme'
        ? 5
        : tier === 'exquisite'
          ? 3
          : tier === 'fine'
            ? 2
            : 1
  const out: Partial<Record<MaterialId, number>> = {
    wood: 2 * mul + Math.floor(rand() * 3),
    stone: 1 * mul + Math.floor(rand() * 2),
  }
  if (rand() < 0.4) out.dirt = mul
  if (rand() < 0.25) out.dry_grass = mul
  return out
}

const WEAPON_POOL: CombatWeaponId[] = ['staff', 'cleaver', 'pistol', 'rifle', 'sniper']

export function generateChestLoot(tier: ChestTier): LootPreview {
  const preview: LootPreview = {
    materials: matBunch(tier),
    weapons: [],
    medkit_small: 0,
    medkit_large: 0,
  }

  const weaponChance =
    tier === 'legendary'
      ? 0.85
      : tier === 'supreme'
        ? 0.35
        : tier === 'exquisite'
          ? 0.12
          : tier === 'fine'
            ? 0.02
            : 0.004

  if (rand() < weaponChance) {
    const w = WEAPON_POOL[Math.floor(rand() * WEAPON_POOL.length)]
    preview.weapons = [w]
  }

  if (tier === 'legendary' || tier === 'supreme') {
    preview.medkit_large = rand() < 0.7 ? 1 : 0
    preview.medkit_small = rand() < 0.5 ? 1 : 0
  } else if (tier === 'exquisite') {
    preview.medkit_small = rand() < 0.45 ? 1 : 0
    preview.medkit_large = rand() < 0.12 ? 1 : 0
  } else if (rand() < 0.2) {
    preview.medkit_small = 1
  }

  return preview
}

export function makeChestEntry(tier: ChestTier) {
  return {
    id: newItemId('chest'),
    tier,
    sealed: true,
    preview: generateChestLoot(tier),
  }
}
