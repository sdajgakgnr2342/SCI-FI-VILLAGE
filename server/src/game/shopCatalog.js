/**
 * 服务器商城 / 金币（与 client shopCatalog 对齐）
 */

const START_GOLD = 100000;

const FURNITURE_IDS = [
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
];

const SHOP_ITEMS = {
  buy_window: { furnitureId: 'window', price: 500 },
  buy_door: { furnitureId: 'door', price: 800 },
  buy_stove: { furnitureId: 'stove', price: 2500 },
  buy_craft: { furnitureId: 'craft', price: 4000 },
  buy_lamp: { furnitureId: 'lamp', price: 1800 },
  buy_fence: { furnitureId: 'fence', price: 300 },
  buy_wire: { furnitureId: 'wire', price: 1200 },
  buy_cobble: { furnitureId: 'cobble', price: 200 },
  buy_pond: { furnitureId: 'pond', price: 3500 },
  buy_firepit: { furnitureId: 'firepit', price: 5000 },
  buy_med_s: { medkit: 'medkit_small', price: 400 },
  buy_med_l: { medkit: 'medkit_large', price: 1100 },
};

const MATERIAL_SELL = {
  wood: 8,
  stone: 10,
  dirt: 3,
  sand: 3,
  turf: 4,
  dry_grass: 2,
};

const MEDKIT_SELL = { medkit_small: 120, medkit_large: 350 };

const WEAPON_SELL = {
  staff: 800,
  cleaver: 1500,
  pistol: 2200,
  rifle: 2800,
  sniper: 4500,
};

const CHEST_SELL = {
  common: 200,
  fine: 500,
  exquisite: 1500,
  supreme: 4000,
  legendary: 10000,
};

const KILL_GOLD = {
  scrapmite: [80, 140],
  miregrub: [180, 280],
  shardhound: [400, 650],
  voltspire: [900, 1400],
  voidmaw: [2200, 3500],
};

function emptyFurniture() {
  const out = {};
  for (const id of FURNITURE_IDS) out[id] = 0;
  return out;
}

function rollKillGold(tier) {
  const range = KILL_GOLD[tier] || [50, 100];
  return range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
}

function normalizeFurniture(raw) {
  const out = emptyFurniture();
  if (!raw || typeof raw !== 'object') return out;
  for (const id of FURNITURE_IDS) {
    const n = Number(raw[id]);
    out[id] = Number.isFinite(n) && n > 0 ? Math.min(9999, Math.floor(n)) : 0;
  }
  return out;
}

const DEATH_BUILD_COMP_CAP = 1000;

const DEATH_FURNITURE_GOLD = {
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
};

function deathBlockGold(blockId) {
  const id = String(blockId || '');
  if (!id || id === 'air') return 0;
  if (id === 'stone' || id === 'rubble') return 10;
  if (id === 'wood' || id === 'plank' || id === 'stump') return 5;
  return 2;
}

function deathFurnitureGold(propId) {
  return DEATH_FURNITURE_GOLD[propId] || 15;
}

function calcDeathBuildCompensation(blockIds, furniturePropIds) {
  let sum = 0;
  for (const id of blockIds || []) sum += deathBlockGold(id);
  for (const id of furniturePropIds || []) sum += deathFurnitureGold(id);
  return Math.min(DEATH_BUILD_COMP_CAP, Math.max(0, Math.floor(sum)));
}

/** 死亡：未装备武器进保险箱上限；超出折现 */
const SAFE_VAULT_MAX = 3;

function splitDeathWeapons(bag) {
  const weapons = Array.isArray(bag && bag.weapons) ? [...bag.weapons] : [];
  const eq = String((bag && bag.equippedWeapon) || 'fist');
  const dropWeapons = [];
  if (eq && eq !== 'fist' && eq !== 'axe') {
    const idx = weapons.findIndex((w) => w && w.weaponId === eq);
    if (idx >= 0) dropWeapons.push(weapons.splice(idx, 1)[0]);
  }
  weapons.sort(
    (a, b) => (WEAPON_SELL[b.weaponId] || 0) - (WEAPON_SELL[a.weaponId] || 0)
  );
  const vaultWeapons = weapons.slice(0, SAFE_VAULT_MAX);
  const overflow = weapons.slice(SAFE_VAULT_MAX);
  let overflowGold = 0;
  for (const w of overflow) overflowGold += WEAPON_SELL[w.weaponId] || 0;
  return { dropWeapons, vaultWeapons, overflowGold };
}

module.exports = {
  START_GOLD,
  FURNITURE_IDS,
  SHOP_ITEMS,
  MATERIAL_SELL,
  MEDKIT_SELL,
  WEAPON_SELL,
  CHEST_SELL,
  emptyFurniture,
  normalizeFurniture,
  rollKillGold,
  DEATH_BUILD_COMP_CAP,
  DEATH_FURNITURE_GOLD,
  deathBlockGold,
  deathFurnitureGold,
  calcDeathBuildCompensation,
  SAFE_VAULT_MAX,
  splitDeathWeapons,
};
