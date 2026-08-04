const { query } = require('../db/mysql');
const redis = require('../db/redis');

async function listWorlds(userId) {
  return query(
    `SELECT w.id, w.name, w.seed, w.game_mode AS gameMode, w.spawn_x AS spawnX,
            w.spawn_y AS spawnY, w.spawn_z AS spawnZ, w.is_public AS isPublic,
            w.owner_id AS ownerId, w.created_at AS createdAt,
            u.username AS ownerName
     FROM worlds w
     JOIN users u ON u.id = w.owner_id
     WHERE w.owner_id = ? OR w.is_public = 1
     ORDER BY w.updated_at DESC`,
    [userId]
  );
}

async function createWorld(userId, { name, seed, gameMode, isPublic }) {
  const worldSeed = seed != null ? Number(seed) : Math.floor(Math.random() * 1e9);
  const result = await query(
    `INSERT INTO worlds (owner_id, name, seed, game_mode, is_public)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, name, worldSeed, gameMode || 'survival', isPublic ? 1 : 0]
  );
  const worldId = result.insertId;

  await query(
    `INSERT INTO player_states (user_id, world_id, pos_x, pos_y, pos_z)
     VALUES (?, ?, 0, 64, 0)`,
    [userId, worldId]
  );

  // starter inventory (sci-fi themed placeholders)
  const starters = [
    { slot: 0, itemId: 'plasma_torch', qty: 1 },
    { slot: 1, itemId: 'nano_dirt', qty: 64 },
    { slot: 2, itemId: 'alloy_block', qty: 32 },
  ];
  for (const s of starters) {
    await query(
      `INSERT INTO inventories (user_id, world_id, slot_index, item_id, quantity)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, worldId, s.slot, s.itemId, s.qty]
    );
  }

  return getWorldById(worldId, userId);
}

async function getWorldById(worldId, userId) {
  const rows = await query(
    `SELECT w.id, w.name, w.seed, w.game_mode AS gameMode, w.spawn_x AS spawnX,
            w.spawn_y AS spawnY, w.spawn_z AS spawnZ, w.is_public AS isPublic,
            w.owner_id AS ownerId, w.created_at AS createdAt
     FROM worlds w
     WHERE w.id = ? AND (w.owner_id = ? OR w.is_public = 1)
     LIMIT 1`,
    [worldId, userId]
  );
  return rows[0] || null;
}

async function getOrCreatePlayerState(userId, worldId) {
  const cacheKey = `player:${userId}:world:${worldId}`;
  const cached = await redis.getJson(cacheKey);
  if (cached) return cached;

  let rows = await query(
    `SELECT pos_x AS x, pos_y AS y, pos_z AS z, yaw, pitch, health, hunger, energy
     FROM player_states WHERE user_id = ? AND world_id = ? LIMIT 1`,
    [userId, worldId]
  );
  if (!rows.length) {
    await query(
      `INSERT INTO player_states (user_id, world_id) VALUES (?, ?)`,
      [userId, worldId]
    );
    rows = await query(
      `SELECT pos_x AS x, pos_y AS y, pos_z AS z, yaw, pitch, health, hunger, energy
       FROM player_states WHERE user_id = ? AND world_id = ? LIMIT 1`,
      [userId, worldId]
    );
  }
  const state = rows[0];
  await redis.setJson(cacheKey, state, 60);
  return state;
}

async function updatePlayerPosition(userId, worldId, pos) {
  await query(
    `UPDATE player_states
     SET pos_x = ?, pos_y = ?, pos_z = ?, yaw = ?, pitch = ?
     WHERE user_id = ? AND world_id = ?`,
    [pos.x, pos.y, pos.z, pos.yaw || 0, pos.pitch || 0, userId, worldId]
  );
  const state = {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    yaw: pos.yaw || 0,
    pitch: pos.pitch || 0,
  };
  await redis.setJson(`player:${userId}:world:${worldId}`, state, 60);
  await redis.setJson(
    `presence:world:${worldId}:user:${userId}`,
    { userId, ...state, ts: Date.now() },
    30
  );
  return state;
}

async function getInventory(userId, worldId) {
  return query(
    `SELECT slot_index AS slot, item_id AS itemId, quantity, meta_json AS meta
     FROM inventories
     WHERE user_id = ? AND world_id = ?
     ORDER BY slot_index ASC`,
    [userId, worldId]
  );
}

async function setBlock(worldId, userId, { x, y, z, blockId }) {
  await query(
    `INSERT INTO block_overrides (world_id, x, y, z, block_id, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE block_id = VALUES(block_id), updated_by = VALUES(updated_by)`,
    [worldId, x, y, z, blockId, userId]
  );
  return { x, y, z, blockId };
}

async function getBlocksInRange(worldId, min, max) {
  return query(
    `SELECT x, y, z, block_id AS blockId
     FROM block_overrides
     WHERE world_id = ?
       AND x BETWEEN ? AND ?
       AND y BETWEEN ? AND ?
       AND z BETWEEN ? AND ?`,
    [worldId, min.x, max.x, min.y, max.y, min.z, max.z]
  );
}

module.exports = {
  listWorlds,
  createWorld,
  getWorldById,
  getOrCreatePlayerState,
  updatePlayerPosition,
  getInventory,
  setBlock,
  getBlocksInRange,
};
