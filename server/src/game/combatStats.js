/**
 * 服务器端战斗常量（与 client combatStats / lootTables 对齐）
 */

const PLAYER_MAX_HP = 10000;
const REGEN_DELAY_MS = 10000;
const REGEN_PER_SEC = 10;
const DEATH_COUNTDOWN_MS = 10000;

const DAY_SEC = 50 * 60;
const NIGHT_SEC = 10 * 60;
const CYCLE_SEC = DAY_SEC + NIGHT_SEC;

const WEAPON_DEFS = {
  fist: { damage: 80, rate: 2.0, range: 1.6, kind: 'melee' },
  axe: { damage: 140, rate: 1.4, range: 1.8, kind: 'melee' },
  staff: { damage: 220, rate: 1.3, range: 2.4, kind: 'melee' },
  cleaver: { damage: 380, rate: 1.1, range: 2.0, kind: 'melee' },
  pistol: { damage: 450, rate: 0.9, range: 28, kind: 'ranged' },
  rifle: { damage: 320, rate: 2.2, range: 40, kind: 'ranged' },
  sniper: { damage: 900, rate: 0.45, range: 80, kind: 'ranged' },
};

const MONSTER_DEFS = {
  scrapmite: {
    maxHp: 400,
    speed: 2.8,
    lowHpSpeedMul: 0.55,
    attackKind: 'melee',
    range: 1.4,
    damage: 60,
    interval: 1.0,
    canClimb: false,
    isElite: false,
    tier: 1,
  },
  miregrub: {
    maxHp: 900,
    speed: 2.2,
    lowHpSpeedMul: 0.55,
    attackKind: 'melee',
    range: 1.5,
    damage: 110,
    interval: 1.1,
    canClimb: false,
    isElite: false,
    tier: 2,
  },
  shardhound: {
    maxHp: 1800,
    speed: 4.2,
    lowHpSpeedMul: 0.6,
    attackKind: 'melee',
    range: 1.8,
    damage: 200,
    interval: 0.9,
    canClimb: true,
    isElite: false,
    tier: 3,
  },
  voltspire: {
    maxHp: 3200,
    speed: 2.0,
    lowHpSpeedMul: 0.55,
    attackKind: 'ranged',
    range: 12,
    damage: 260,
    interval: 1.4,
    canClimb: false,
    isElite: true,
    tier: 4,
  },
  voidmaw: {
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
    tier: 5,
  },
};

const TIER_IDS = ['scrapmite', 'miregrub', 'shardhound', 'voltspire', 'voidmaw'];

function sampleDayNight(nowMs = Date.now()) {
  const cycleT = ((nowMs / 1000) % CYCLE_SEC + CYCLE_SEC) % CYCLE_SEC;
  const phase = cycleT >= DAY_SEC ? 'night' : cycleT >= DAY_SEC - 60 ? 'dusk' : 'day';
  const nightProgress =
    phase === 'night' ? Math.min(1, Math.max(0, (cycleT - DAY_SEC) / NIGHT_SEC)) : 0;
  return { cycleT, phase, nightProgress, isNight: phase === 'night' };
}

const { START_GOLD, normalizeFurniture, emptyFurniture } = require('./shopCatalog');

function emptyMaterials() {
  return { turf: 0, stone: 0, wood: 0, dry_grass: 0, dirt: 0, sand: 0 };
}

function normalizeBag(raw) {
  const matKeys = ['turf', 'stone', 'wood', 'dry_grass', 'dirt', 'sand'];
  const materials = emptyMaterials();
  const src =
    raw && typeof raw === 'object' && raw.materials && typeof raw.materials === 'object'
      ? raw.materials
      : raw || {};
  for (const k of matKeys) {
    const n = Number(src[k]);
    materials[k] = Number.isFinite(n) && n > 0 ? Math.min(999999, Math.floor(n)) : 0;
  }
  const weapons = Array.isArray(raw && raw.weapons)
    ? raw.weapons
        .filter((w) => w && typeof w === 'object' && WEAPON_DEFS[w.weaponId])
        .slice(0, 32)
        .map((w, i) => ({
          id: String(w.id || `wpn_${i}`),
          weaponId: w.weaponId,
        }))
    : [];
  const chests = Array.isArray(raw && raw.chests)
    ? raw.chests.filter((c) => c && typeof c === 'object').slice(0, 64)
    : [];
  const eq = raw && WEAPON_DEFS[raw.equippedWeapon] ? raw.equippedWeapon : 'fist';
  let hp = Number(raw && raw.hp);
  if (!Number.isFinite(hp)) hp = PLAYER_MAX_HP;
  hp = Math.max(0, Math.min(PLAYER_MAX_HP, Math.floor(hp)));
  let gold;
  if (!raw || !('gold' in raw)) gold = START_GOLD;
  else {
    const g = Number(raw.gold);
    gold = Number.isFinite(g) && g > 0 ? Math.min(999999999, Math.floor(g)) : 0;
  }
  return {
    materials,
    chests,
    weapons,
    furniture: normalizeFurniture(raw && raw.furniture),
    medkit_small: Math.max(0, Math.min(99, Math.floor(Number((raw && raw.medkit_small) || 0)))),
    medkit_large: Math.max(0, Math.min(99, Math.floor(Number((raw && raw.medkit_large) || 0)))),
    equippedWeapon: eq,
    hp,
    lastDamageAt: Math.max(0, Math.floor(Number((raw && raw.lastDamageAt) || 0))),
    gold,
  };
}

function serializeBag(bag) {
  return {
    ...bag.materials,
    materials: { ...bag.materials },
    chests: bag.chests,
    weapons: bag.weapons,
    furniture: { ...(bag.furniture || emptyFurniture()) },
    medkit_small: bag.medkit_small,
    medkit_large: bag.medkit_large,
    equippedWeapon: bag.equippedWeapon,
    hp: bag.hp,
    lastDamageAt: bag.lastDamageAt,
    gold: bag.gold ?? START_GOLD,
  };
}

function freshBag() {
  return normalizeBag(null);
}

module.exports = {
  PLAYER_MAX_HP,
  REGEN_DELAY_MS,
  REGEN_PER_SEC,
  DEATH_COUNTDOWN_MS,
  WEAPON_DEFS,
  MONSTER_DEFS,
  TIER_IDS,
  sampleDayNight,
  normalizeBag,
  serializeBag,
  freshBag,
  DAY_SEC,
  NIGHT_SEC,
  CYCLE_SEC,
  START_GOLD: require('./shopCatalog').START_GOLD,
};
