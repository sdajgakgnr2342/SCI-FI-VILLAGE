/**
 * 战斗数值：血量分段、武器表、野怪表（与设计定案一致）。
 */

export const PLAYER_MAX_HP = 10000
export const REGEN_DELAY_SEC = 10
export const REGEN_PER_SEC = 10
export const DEATH_COUNTDOWN_SEC = 10

export type InjuryBand = 'healthy' | 'light' | 'critical' | 'dead'

export function injuryBand(hp: number): InjuryBand {
  if (hp <= 0) return 'dead'
  if (hp < 2000) return 'critical'
  if (hp < 4000) return 'light'
  return 'healthy'
}

/** 血迹强度 0–1 */
export function bloodOverlayStrength(hp: number): number {
  const band = injuryBand(hp)
  if (band === 'dead') return 1
  if (band === 'critical') return 0.55 + 0.35 * (1 - hp / 2000)
  if (band === 'light') return 0.12 + 0.28 * (1 - (hp - 2000) / 2000)
  return 0
}

export function canSprint(hp: number): boolean {
  return injuryBand(hp) === 'healthy' || injuryBand(hp) === 'light'
}

export type CombatWeaponId =
  | 'fist'
  | 'axe'
  | 'staff'
  | 'cleaver'
  | 'pistol'
  | 'rifle'
  | 'sniper'

export type WeaponRangeKind = 'melee' | 'ranged'

export interface WeaponDef {
  id: CombatWeaponId
  label: string
  kind: WeaponRangeKind
  damage: number
  /** 每秒攻击次数 */
  rate: number
  range: number
  /** 狙击镜倍率范围 */
  zoomMin?: number
  zoomMax?: number
}

export const WEAPON_DEFS: Record<CombatWeaponId, WeaponDef> = {
  fist: { id: 'fist', label: '拳头', kind: 'melee', damage: 80, rate: 2.0, range: 1.6 },
  axe: { id: 'axe', label: '斧头', kind: 'melee', damage: 140, rate: 1.4, range: 1.8 },
  staff: { id: 'staff', label: '长木棍', kind: 'melee', damage: 220, rate: 1.3, range: 2.4 },
  cleaver: { id: 'cleaver', label: '大砍刀', kind: 'melee', damage: 380, rate: 1.1, range: 2.0 },
  pistol: { id: 'pistol', label: '单发手枪', kind: 'ranged', damage: 450, rate: 0.9, range: 28 },
  rifle: { id: 'rifle', label: '步枪', kind: 'ranged', damage: 320, rate: 2.2, range: 40 },
  sniper: {
    id: 'sniper',
    label: '狙击枪',
    kind: 'ranged',
    damage: 900,
    rate: 0.45,
    range: 80,
    zoomMin: 2,
    zoomMax: 8,
  },
}

export type MonsterTierId =
  | 'scrapmite'
  | 'miregrub'
  | 'shardhound'
  | 'voltspire'
  | 'voidmaw'

export interface MonsterDef {
  id: MonsterTierId
  label: string
  tier: 1 | 2 | 3 | 4 | 5
  maxHp: number
  speed: number
  lowHpSpeedMul: number
  attackKind: 'melee' | 'ranged' | 'hybrid'
  range: number
  rangeAlt?: number
  damage: number
  damageAlt?: number
  interval: number
  canClimb: boolean
  isElite: boolean
}

export const MONSTER_DEFS: Record<MonsterTierId, MonsterDef> = {
  scrapmite: {
    id: 'scrapmite',
    label: '废铁螨',
    tier: 1,
    maxHp: 400,
    speed: 2.8,
    lowHpSpeedMul: 0.55,
    attackKind: 'melee',
    range: 1.4,
    damage: 60,
    interval: 1.0,
    canClimb: false,
    isElite: false,
  },
  miregrub: {
    id: 'miregrub',
    label: '泥沼蛆',
    tier: 2,
    maxHp: 900,
    speed: 2.2,
    lowHpSpeedMul: 0.55,
    attackKind: 'melee',
    range: 1.5,
    damage: 110,
    interval: 1.1,
    canClimb: false,
    isElite: false,
  },
  shardhound: {
    id: 'shardhound',
    label: '碎晶犬',
    tier: 3,
    maxHp: 1800,
    speed: 4.2,
    lowHpSpeedMul: 0.6,
    attackKind: 'melee',
    range: 1.8,
    damage: 200,
    interval: 0.9,
    canClimb: true,
    isElite: false,
  },
  voltspire: {
    id: 'voltspire',
    label: '电棘塔兽',
    tier: 4,
    maxHp: 3200,
    speed: 2.0,
    lowHpSpeedMul: 0.55,
    attackKind: 'ranged',
    range: 12,
    damage: 260,
    interval: 1.4,
    canClimb: false,
    isElite: true,
  },
  voidmaw: {
    id: 'voidmaw',
    label: '虚空巨口',
    tier: 5,
    maxHp: 6000,
    speed: 2.6,
    lowHpSpeedMul: 0.5,
    attackKind: 'hybrid',
    range: 2.2,
    rangeAlt: 8,
    damage: 420,
    damageAlt: 300,
    interval: 1.6,
    canClimb: true,
    isElite: true,
  },
}

export const MONSTER_TIER_LIST: MonsterTierId[] = [
  'scrapmite',
  'miregrub',
  'shardhound',
  'voltspire',
  'voidmaw',
]

export const FIRE_PIT_RADIUS = 4
export const FIRE_PIT_DAMAGE = 25
export const FIRE_PIT_TICK_SEC = 0.5

export const MEDKIT_SMALL_HEAL = 800
export const MEDKIT_LARGE_HEAL = 2500

export function attackCooldown(weaponId: CombatWeaponId): number {
  const def = WEAPON_DEFS[weaponId] || WEAPON_DEFS.fist
  return 1 / Math.max(0.1, def.rate)
}
