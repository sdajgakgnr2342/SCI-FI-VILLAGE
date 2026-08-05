/**
 * 与客户端 InfiniteTerrain 对齐的出生点挑选：
 * - 避开小溪 / 河岸
 * - 避开树干邻域与石头
 * - 相对同服在线玩家尽量分散
 */

const SURFACE_Y = 4;
const MIN_PLAYER_SEP = 20;
const RING_MIN = 16;
const RING_MAX = 140;
const MAX_TRIES = 64;

function hash2(x, z, seed) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (seed | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

function creekCenterZ(x, seed) {
  return Math.sin(x * 0.035 + seed * 0.001) * 6 + Math.sin(x * 0.012 + 1.7) * 3;
}

function isCreek(x, z, seed) {
  return Math.abs(z - creekCenterZ(x, seed)) < 1.65;
}

function isCreekBank(x, z, seed) {
  const d = Math.abs(z - creekCenterZ(x, seed));
  return d >= 1.65 && d < 2.6;
}

function isTreeSeed(tx, tz, seed) {
  if (isCreek(tx, tz, seed) || isCreekBank(tx, tz, seed)) return false;
  return hash2(tx, tz, seed ^ 0x11) % 103 === 0;
}

function nearTreeTrunk(ix, iz, seed) {
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (isTreeSeed(ix + dx, iz + dz, seed)) return true;
    }
  }
  return false;
}

function rockSeedInfo(rx, rz, seed) {
  if (isCreek(rx, rz, seed) || isCreekBank(rx, rz, seed)) return null;
  const h = hash2(rx, rz, seed ^ 0x22);
  if (h % 61 !== 0) return null;
  return { size: 1 + (h % 3) };
}

function nearRock(ix, iz, seed, r = 1) {
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (rockSeedInfo(ix + dx, iz + dz, seed)) return true;
    }
  }
  return false;
}

function isSafeFlat(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  if (isCreek(ix, iz, seed) || isCreekBank(ix, iz, seed)) return false;
  if (nearTreeTrunk(ix, iz, seed)) return false;
  if (nearRock(ix, iz, seed, 1)) return false;
  return true;
}

function tooClose(x, z, occupied, minSep) {
  const sep2 = minSep * minSep;
  for (const p of occupied) {
    const dx = Number(p.x) - x;
    const dz = Number(p.z) - z;
    if (dx * dx + dz * dz < sep2) return true;
  }
  return false;
}

/**
 * 在锚点附近找安全格（组队靠拢用）
 */
function nudgeSafeNear(seed, x, z, radius = 8) {
  const ix0 = Math.floor(x);
  const iz0 = Math.floor(z);
  if (isSafeFlat(ix0 + 0.5, iz0 + 0.5, seed)) {
    return { x: ix0 + 0.5, z: iz0 + 0.5 };
  }
  for (let r = 1; r <= radius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const sx = ix0 + dx + 0.5;
        const sz = iz0 + dz + 0.5;
        if (isSafeFlat(sx, sz, seed)) return { x: sx, z: sz };
      }
    }
  }
  return { x: ix0 + 0.5, z: iz0 + 8.5 };
}

/**
 * 分散出生：大环带随机采样，避开地貌与过近玩家
 */
function pickDispersedSpawn({ seed, baseX, baseZ, occupied = [], userId = 0 }) {
  const base = {
    x: Number(baseX) || 24,
    z: Number(baseZ) || 36,
  };
  const others = Array.isArray(occupied) ? occupied : [];

  for (let i = 0; i < MAX_TRIES; i++) {
    const h = hash2((userId * 17 + i) | 0, (i * 31) ^ (seed | 0), seed ^ 0x5f3759df);
    const ang = ((h % 6283) / 1000) + i * 0.37;
    const span = RING_MAX - RING_MIN;
    const dist = RING_MIN + (h % Math.max(1, span)) + (i % 9) * 3;
    const x = base.x + Math.cos(ang) * dist;
    const z = base.z + Math.sin(ang) * dist;
    if (!isSafeFlat(x, z, seed)) continue;
    if (tooClose(x, z, others, MIN_PLAYER_SEP)) continue;
    return {
      x: Math.floor(x) + 0.5,
      y: SURFACE_Y + 2,
      z: Math.floor(z) + 0.5,
    };
  }

  // 兜底：沿锚点外扩找安全格，再尽量远离他人
  for (let r = RING_MIN; r <= RING_MAX + 40; r += 4) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2 + (userId % 7) * 0.2;
      const x = base.x + Math.cos(ang) * r;
      const z = base.z + Math.sin(ang) * r;
      if (!isSafeFlat(x, z, seed)) continue;
      if (tooClose(x, z, others, Math.max(10, MIN_PLAYER_SEP * 0.6))) continue;
      return {
        x: Math.floor(x) + 0.5,
        y: SURFACE_Y + 2,
        z: Math.floor(z) + 0.5,
      };
    }
  }

  const safe = nudgeSafeNear(seed, base.x + 40, base.z + 40, 24);
  return { x: safe.x, y: SURFACE_Y + 2, z: safe.z };
}

module.exports = {
  SURFACE_Y,
  isSafeFlat,
  nudgeSafeNear,
  pickDispersedSpawn,
};
