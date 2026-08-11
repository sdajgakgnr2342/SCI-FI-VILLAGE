/**
 * 服务器掉落表（与客户端 lootTables 对齐）
 */

function rand() {
  return Math.random();
}

function pickWeighted(weights) {
  const entries = Object.entries(weights);
  let sum = 0;
  for (const [, w] of entries) sum += Math.max(0, w);
  let r = rand() * sum;
  for (const [k, w] of entries) {
    r -= Math.max(0, w);
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

const HARVEST_CHANCE = { chop: 0.025, mine: 0.02, dig: 0.004, clear: 0.005 };
const HARVEST_WEIGHT = {
  chop: { common: 88, fine: 11.5, exquisite: 0.5 },
  mine: { common: 88, fine: 11.5, exquisite: 0.5 },
  dig: { common: 97, fine: 3 },
  clear: { common: 96, fine: 4 },
};

const KILL_CHANCE = {
  scrapmite: 0.08,
  miregrub: 0.12,
  shardhound: 0.18,
  voltspire: 0.28,
  voidmaw: 0.4,
};
const KILL_WEIGHT = {
  scrapmite: { common: 85, fine: 13, exquisite: 1.7, supreme: 0.25, legendary: 0.05 },
  miregrub: { common: 75, fine: 20, exquisite: 4, supreme: 0.8, legendary: 0.2 },
  shardhound: { common: 40, fine: 40, exquisite: 16, supreme: 3.5, legendary: 0.5 },
  voltspire: { common: 15, fine: 40, exquisite: 35, supreme: 8.5, legendary: 1.5 },
  voidmaw: { fine: 25, exquisite: 45, supreme: 25, legendary: 5 },
};

function rollHarvestChest(source) {
  if (rand() > (HARVEST_CHANCE[source] || 0)) return null;
  return pickWeighted(HARVEST_WEIGHT[source] || HARVEST_WEIGHT.dig);
}

function rollKillChest(tier) {
  if (rand() > (KILL_CHANCE[tier] || 0)) return null;
  return pickWeighted(KILL_WEIGHT[tier] || KILL_WEIGHT.scrapmite);
}

function matBunch(tier) {
  const mul =
    tier === 'legendary' ? 8 : tier === 'supreme' ? 5 : tier === 'exquisite' ? 3 : tier === 'fine' ? 2 : 1;
  const out = {
    wood: 2 * mul + Math.floor(rand() * 3),
    stone: 1 * mul + Math.floor(rand() * 2),
  };
  if (rand() < 0.4) out.dirt = mul;
  if (rand() < 0.25) out.dry_grass = mul;
  return out;
}

const WEAPON_POOL = ['staff', 'cleaver', 'pistol', 'rifle', 'sniper'];

function generateChestLoot(tier) {
  const preview = {
    materials: matBunch(tier),
    weapons: [],
    medkit_small: 0,
    medkit_large: 0,
  };
  const weaponChance =
    tier === 'legendary' ? 0.85 : tier === 'supreme' ? 0.35 : tier === 'exquisite' ? 0.12 : tier === 'fine' ? 0.02 : 0.004;
  if (rand() < weaponChance) {
    preview.weapons = [WEAPON_POOL[Math.floor(rand() * WEAPON_POOL.length)]];
  }
  if (tier === 'legendary' || tier === 'supreme') {
    preview.medkit_large = rand() < 0.7 ? 1 : 0;
    preview.medkit_small = rand() < 0.5 ? 1 : 0;
  } else if (tier === 'exquisite') {
    preview.medkit_small = rand() < 0.45 ? 1 : 0;
    preview.medkit_large = rand() < 0.12 ? 1 : 0;
  } else if (rand() < 0.2) {
    preview.medkit_small = 1;
  }
  return preview;
}

let seq = 0;
function makeChestEntry(tier) {
  seq += 1;
  return {
    id: `chest_${Date.now()}_${seq}`,
    tier,
    sealed: true,
    preview: generateChestLoot(tier),
  };
}

module.exports = {
  rollHarvestChest,
  rollKillChest,
  generateChestLoot,
  makeChestEntry,
};
