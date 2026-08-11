const { query } = require('../db/mysql');
const redis = require('../db/redis');
const {
  MAX_PLAYERS,
  OPEN_THRESHOLD,
  DRAIN_BELOW,
  SESSION_TTL_SEC,
  NPC_POLICY,
} = require('../config/matchmaking');
const { pickDispersedSpawn, nudgeSafeNear, SURFACE_Y } = require('./spawnUtil');

async function countOnline(serverId) {
  const cached = await redis.get(`server:online:${serverId}`);
  if (cached != null) return Number(cached) || 0;
  const rows = await query(
    `SELECT COUNT(*) AS c FROM server_sessions
     WHERE server_id = ? AND last_seen_at > DATE_SUB(NOW(), INTERVAL ? SECOND)`,
    [serverId, SESSION_TTL_SEC]
  );
  const c = Number(rows[0].c) || 0;
  await redis.set(`server:online:${serverId}`, String(c), 5);
  return c;
}

async function refreshServerStatuses() {
  const servers = await query(
    `SELECT id, status, max_players FROM game_servers ORDER BY id ASC`
  );
  for (const s of servers) {
    const online = await countOnline(s.id);
    let next = s.status;
    if (online >= (s.max_players || MAX_PLAYERS)) next = 'full';
    else if (s.status === 'full' && online < (s.max_players || MAX_PLAYERS)) next = 'open';
    else if (s.status === 'draining' && online === 0) next = 'standby';
    else if (
      (s.status === 'open' || s.status === 'draining') &&
      online > 0 &&
      online <= DRAIN_BELOW
    ) {
      // 若存在更热闹的 open 服，则本服进入排空，避免长期「几个人一服」
      const busier = await query(
        `SELECT g.id FROM game_servers g
         WHERE g.status IN ('open','full') AND g.id <> ?
         LIMIT 1`,
        [s.id]
      );
      // 粗略：有其他 open/full 且本服过稀 → draining
      if (busier.length && online <= DRAIN_BELOW) next = 'draining';
    } else if (s.status === 'draining' && online > DRAIN_BELOW + 5) {
      next = 'open';
    }

    if (next !== s.status) {
      await query('UPDATE game_servers SET status = ? WHERE id = ?', [next, s.id]);
    }
    await redis.set(`server:online:${s.id}`, String(online), 5);
  }

  // 开放新服：所有 open/full 都达到阈值，且存在 standby
  const openRows = await query(
    `SELECT id FROM game_servers WHERE status IN ('open','full')`
  );
  let allHot = openRows.length > 0;
  for (const row of openRows) {
    const n = await countOnline(row.id);
    if (n < OPEN_THRESHOLD) {
      allHot = false;
      break;
    }
  }
  if (allHot || openRows.length === 0) {
    const standby = await query(
      `SELECT id FROM game_servers WHERE status = 'standby' ORDER BY id ASC LIMIT 1`
    );
    if (standby.length) {
      await query(`UPDATE game_servers SET status = 'open' WHERE id = ?`, [standby[0].id]);
    }
  }
}

async function listServers() {
  await refreshServerStatuses();
  const rows = await query(
    `SELECT id, code, name, seed, max_players AS maxPlayers, status, region,
            spawn_x AS spawnX, spawn_y AS spawnY, spawn_z AS spawnZ
     FROM game_servers
     ORDER BY FIELD(status,'open','full','draining','standby'), id ASC`
  );

  const list = [];
  for (const s of rows) {
    const online = await countOnline(s.id);
    list.push({
      ...s,
      online,
      joinable: s.status === 'open' && online < s.maxPlayers,
    });
  }
  return list;
}

/**
 * Fill-first：在可加入服中选真人最多的；没有则尝试激活 standby。
 */
async function pickServerForJoin() {
  await refreshServerStatuses();
  const candidates = await query(
    `SELECT id, max_players AS maxPlayers, status FROM game_servers
     WHERE status = 'open'
     ORDER BY id ASC`
  );

  let best = null;
  let bestCount = -1;
  for (const s of candidates) {
    const online = await countOnline(s.id);
    if (online >= s.maxPlayers) continue;
    if (online > bestCount) {
      best = s;
      bestCount = online;
    }
  }

  if (best) return best;

  // 尝试打开一台 standby
  const standby = await query(
    `SELECT id, max_players AS maxPlayers, status FROM game_servers
     WHERE status = 'standby' ORDER BY id ASC LIMIT 1`
  );
  if (standby.length) {
    await query(`UPDATE game_servers SET status = 'open' WHERE id = ?`, [standby[0].id]);
    return standby[0];
  }

  // 允许进入 draining 中仍未满的（保底）
  const draining = await query(
    `SELECT id, max_players AS maxPlayers FROM game_servers WHERE status = 'draining'`
  );
  for (const s of draining) {
    const online = await countOnline(s.id);
    if (online < s.maxPlayers) return s;
  }

  return null;
}

async function getServer(serverId) {
  const rows = await query(
    `SELECT id, code, name, seed, max_players AS maxPlayers, status, region,
            spawn_x AS spawnX, spawn_y AS spawnY, spawn_z AS spawnZ
     FROM game_servers WHERE id = ? LIMIT 1`,
    [serverId]
  );
  return rows[0] || null;
}

async function upsertAnchor(userId, serverId, pos) {
  const x = Number(pos.x);
  const y = Number(pos.y);
  const z = Number(pos.z);
  if (![x, y, z].every(Number.isFinite)) return;
  const yaw = Number.isFinite(Number(pos.yaw)) ? Number(pos.yaw) : 0;
  const pitch = Number.isFinite(Number(pos.pitch)) ? Number(pos.pitch) : -0.2;
  try {
    await query(
      `INSERT INTO server_player_anchors
         (user_id, server_id, pos_x, pos_y, pos_z, yaw, pitch)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         pos_x = VALUES(pos_x),
         pos_y = VALUES(pos_y),
         pos_z = VALUES(pos_z),
         yaw = VALUES(yaw),
         pitch = VALUES(pitch)`,
      [userId, serverId, x, y, z, yaw, pitch]
    );
  } catch {
    // 表未就绪时忽略，不影响进服
  }
}

async function getAnchor(userId, serverId) {
  try {
    const rows = await query(
      `SELECT pos_x AS x, pos_y AS y, pos_z AS z, yaw, pitch
       FROM server_player_anchors
       WHERE user_id = ? AND server_id = ?
       LIMIT 1`,
      [userId, serverId]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

/** 离开会话前把当前位置写入锚点，避免硬关页时只靠心跳 */
async function flushSessionToAnchor(userId) {
  const rows = await query(
    `SELECT server_id AS serverId, pos_x AS x, pos_y AS y, pos_z AS z, yaw, pitch
     FROM server_sessions WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  await upsertAnchor(userId, row.serverId, row);
  return row;
}

async function joinServer(userId, preferredServerId, opts = {}) {
  // 离开旧会话前先落盘锚点
  await flushSessionToAnchor(userId);
  await query('DELETE FROM server_sessions WHERE user_id = ?', [userId]);

  let target = null;
  if (preferredServerId) {
    target = await getServer(Number(preferredServerId));
    if (target) {
      const online = await countOnline(target.id);
      // 组队靠拢时允许进入 draining/open；满员仍拒绝
      if (online >= target.maxPlayers) {
        target = null;
      } else if (target.status === 'standby') {
        await query(`UPDATE game_servers SET status = 'open' WHERE id = ?`, [target.id]);
        target = await getServer(target.id);
      } else if (
        target.status === 'draining' &&
        online <= DRAIN_BELOW &&
        !opts.nearUserId
      ) {
        target = null;
      }
    }
  }
  if (!target) target = await pickServerForJoin();
  if (!target) {
    const err = new Error('当前没有可加入的服务器');
    err.status = 503;
    throw err;
  }

  const server = await getServer(target.id);
  const seed = Number(server.seed) || 0;
  let px = Number(server.spawnX);
  let py = Number(server.spawnY);
  let pz = Number(server.spawnZ);
  let yaw = 0;
  let pitch = -0.2;

  const onlineRows = await query(
    `SELECT pos_x AS x, pos_z AS z FROM server_sessions
     WHERE server_id = ?
       AND last_seen_at > DATE_SUB(NOW(), INTERVAL ? SECOND)`,
    [server.id, SESSION_TTL_SEC]
  );

  // 主动组队靠拢（party 传入 nearUserId）优先；否则同服恢复锚点；
  // 首次进该服且有在线队友时才自动靠过去；再否则分散出生
  const explicitNear = Boolean(opts.nearUserId);
  const anchor = !explicitNear ? await getAnchor(userId, server.id) : null;
  const hasAnchor =
    anchor && Number.isFinite(Number(anchor.x)) && Number.isFinite(Number(anchor.z));

  if (!explicitNear && !hasAnchor) {
    const mate = await findOnlinePartyMate(userId, server.id);
    if (mate) opts.nearUserId = mate.userId;
  }

  /** 准备舱共享中心（与落点可分离）：组队同舱 */
  let cabinX = px;
  let cabinZ = pz;
  let shareCabin = false;
  let partySlot = Number(opts.slot);
  if (!Number.isFinite(partySlot) || partySlot < 0) partySlot = 0;

  if (opts.nearUserId) {
    const near = await query(
      `SELECT pos_x AS x, pos_y AS y, pos_z AS z, yaw
       FROM server_sessions
       WHERE user_id = ? AND server_id = ?
         AND last_seen_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
       LIMIT 1`,
      [opts.nearUserId, server.id, SESSION_TTL_SEC]
    );
    if (near.length) {
      const slot = Math.max(1, partySlot || 1);
      partySlot = slot;
      cabinX = Number(near[0].x);
      cabinZ = Number(near[0].z);
      shareCabin = true;
      const ang = (slot * 1.2) % (Math.PI * 2);
      const rawX = cabinX + Math.cos(ang) * (2.2 + (slot % 3) * 0.6);
      const rawZ = cabinZ + Math.sin(ang) * (2.2 + (slot % 3) * 0.6);
      const safe = nudgeSafeNear(seed, rawX, rawZ, 12);
      px = safe.x;
      pz = safe.z;
      py = SURFACE_Y + 2;
      yaw = Number(near[0].yaw) || 0;
      pitch = -0.2;
    } else if (hasAnchor) {
      px = Number(anchor.x);
      py = Number(anchor.y);
      pz = Number(anchor.z);
      yaw = Number(anchor.yaw) || 0;
      pitch = Number.isFinite(Number(anchor.pitch)) ? Number(anchor.pitch) : -0.2;
      cabinX = px;
      cabinZ = pz;
    } else {
      const picked = pickDispersedSpawn({
        seed,
        baseX: px,
        baseZ: pz,
        occupied: onlineRows,
        userId,
      });
      px = picked.x;
      py = picked.y;
      pz = picked.z;
      yaw = ((userId * 0.7) % (Math.PI * 2)) - Math.PI;
      pitch = -0.2;
      cabinX = px;
      cabinZ = pz;
    }
  } else if (hasAnchor) {
    px = Number(anchor.x);
    py = Number(anchor.y);
    pz = Number(anchor.z);
    yaw = Number(anchor.yaw) || 0;
    pitch = Number.isFinite(Number(anchor.pitch)) ? Number(anchor.pitch) : -0.2;
    cabinX = px;
    cabinZ = pz;
  } else {
    const picked = pickDispersedSpawn({
      seed,
      baseX: px,
      baseZ: pz,
      occupied: onlineRows,
      userId,
    });
    px = picked.x;
    py = picked.y;
    pz = picked.z;
    yaw = ((userId * 0.618 + seed * 0.01) % (Math.PI * 2)) - Math.PI;
    pitch = -0.2;
    cabinX = px;
    cabinZ = pz;
  }

  // 即使走了锚点恢复，只要队伍里有人在线，准备舱仍对齐队长/队友（同舱活动）
  const partyCabin = await findPartyCabinAnchor(userId, server.id);
  if (partyCabin) {
    cabinX = partyCabin.x;
    cabinZ = partyCabin.z;
    shareCabin = true;
    if (Number.isFinite(partyCabin.slot)) partySlot = partyCabin.slot;
  }

  // 会话坐标：共享舱时写舱心，便于后进队员对准同一仓
  const sessionX = shareCabin ? cabinX : px;
  const sessionZ = shareCabin ? cabinZ : pz;

  await query(
    `INSERT INTO server_sessions (server_id, user_id, pos_x, pos_y, pos_z, yaw, pitch)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       server_id = VALUES(server_id),
       joined_at = NOW(),
       last_seen_at = NOW(),
       pos_x = VALUES(pos_x),
       pos_y = VALUES(pos_y),
       pos_z = VALUES(pos_z),
       yaw = VALUES(yaw),
       pitch = VALUES(pitch)`,
    [server.id, userId, sessionX, py, sessionZ, yaw, pitch]
  );

  await upsertAnchor(userId, server.id, { x: px, y: py, z: pz, yaw, pitch });

  await redis.del(`server:online:${server.id}`);
  const online = await countOnline(server.id);
  const inventory = await getInventory(userId, server.id);

  return {
    server: {
      ...server,
      online,
      maxPlayers: server.maxPlayers,
    },
    player: {
      x: px,
      y: py,
      z: pz,
      yaw,
      pitch,
      cabinX,
      cabinZ,
      partySlot,
      shareCabin,
    },
    inventory,
    npcPolicy: NPC_POLICY,
  };
}

async function findOnlinePartyMate(userId, serverId) {
  try {
    const rows = await query(
      `SELECT s.user_id AS userId, s.pos_x AS x, s.pos_z AS z
       FROM party_members me
       JOIN parties p ON p.id = me.party_id AND p.status = 'open'
       JOIN party_members mate ON mate.party_id = me.party_id AND mate.user_id <> me.user_id
       JOIN server_sessions s ON s.user_id = mate.user_id
         AND s.server_id = ?
         AND s.last_seen_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
       WHERE me.user_id = ?
       LIMIT 1`,
      [serverId, SESSION_TTL_SEC, userId]
    );
    return rows[0] || null;
  } catch {
    // party 表未就绪时忽略
    return null;
  }
}

/**
 * 组队准备舱锚点：优先在线队长；否则任意在线队友。
 * 用于后进队员 / PlayView 二次 join 仍对齐同一舱心。
 */
async function findPartyCabinAnchor(userId, serverId) {
  try {
    const partyRows = await query(
      `SELECT p.id AS partyId, p.host_user_id AS hostUserId
       FROM party_members me
       JOIN parties p ON p.id = me.party_id AND p.status = 'open'
       WHERE me.user_id = ?
       LIMIT 1`,
      [userId]
    );
    if (!partyRows.length) return null;
    const partyId = partyRows[0].partyId;
    const hostUserId = Number(partyRows[0].hostUserId);

    const members = await query(
      `SELECT user_id AS userId, role
       FROM party_members
       WHERE party_id = ?
       ORDER BY role = 'host' DESC, user_id ASC`,
      [partyId]
    );
    if (members.length < 2) return null;

    const slot = Math.max(
      0,
      members.findIndex((m) => Number(m.userId) === Number(userId))
    );

    const online = await query(
      `SELECT s.user_id AS userId, s.pos_x AS x, s.pos_z AS z
       FROM party_members m
       JOIN server_sessions s ON s.user_id = m.user_id
         AND s.server_id = ?
         AND s.last_seen_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
       WHERE m.party_id = ? AND m.user_id <> ?
       ORDER BY m.user_id = ? DESC, m.role = 'host' DESC, m.user_id ASC
       LIMIT 1`,
      [serverId, SESSION_TTL_SEC, partyId, userId, hostUserId]
    );
    if (!online.length) return null;
    return {
      x: Number(online[0].x),
      z: Number(online[0].z),
      slot,
      leadUserId: Number(online[0].userId),
    };
  } catch {
    return null;
  }
}

async function leaveServer(userId, finalState = null) {
  // 优先用客户端上报的最终姿态/仓库，避免只靠心跳漏存
  if (
    finalState &&
    finalState.serverId &&
    finalState.x != null &&
    finalState.y != null &&
    finalState.z != null
  ) {
    const sid = Number(finalState.serverId);
    await upsertAnchor(userId, sid, {
      x: Number(finalState.x),
      y: Number(finalState.y),
      z: Number(finalState.z),
      yaw: Number(finalState.yaw) || 0,
      pitch: Number(finalState.pitch) || 0,
    });
    // 同步会话行（若还在）便于 flush 兜底
    await query(
      `UPDATE server_sessions
       SET last_seen_at = NOW(),
           pos_x = ?, pos_y = ?, pos_z = ?, yaw = ?, pitch = ?
       WHERE user_id = ? AND server_id = ?`,
      [
        Number(finalState.x),
        Number(finalState.y),
        Number(finalState.z),
        Number(finalState.yaw) || 0,
        Number(finalState.pitch) || 0,
        userId,
        sid,
      ]
    );
    if (finalState.inventory && typeof finalState.inventory === 'object') {
      await saveInventory(userId, sid, finalState.inventory);
    }
  }

  const row = await flushSessionToAnchor(userId);
  await query('DELETE FROM server_sessions WHERE user_id = ?', [userId]);
  if (row) await redis.del(`server:online:${row.serverId}`);
  return true;
}

async function heartbeat(userId, serverId, pos) {
  const yaw = pos.yaw || 0;
  const pitch = pos.pitch || 0;
  const result = await query(
    `UPDATE server_sessions
     SET last_seen_at = NOW(),
         pos_x = ?, pos_y = ?, pos_z = ?,
         yaw = ?, pitch = ?
     WHERE user_id = ? AND server_id = ?`,
    [pos.x, pos.y, pos.z, yaw, pitch, userId, serverId]
  );
  if (result.affectedRows === 0) {
    const err = new Error('不在该服务器会话中');
    err.status = 409;
    throw err;
  }
  await upsertAnchor(userId, serverId, {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    yaw,
    pitch,
  });
  await redis.del(`server:online:${serverId}`);
  return true;
}

async function nearbyPlayers(serverId, userId, radius = 48) {
  const me = await query(
    `SELECT pos_x AS x, pos_y AS y, pos_z AS z FROM server_sessions
     WHERE user_id = ? AND server_id = ? LIMIT 1`,
    [userId, serverId]
  );
  if (!me.length) return [];
  const { x, y, z } = me[0];
  return query(
    `SELECT u.id AS userId, u.username, u.display_name AS displayName,
            s.pos_x AS x, s.pos_y AS y, s.pos_z AS z
     FROM server_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.server_id = ?
       AND s.user_id <> ?
       AND s.last_seen_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
       AND ABS(s.pos_x - ?) <= ?
       AND ABS(s.pos_z - ?) <= ?`,
    [serverId, userId, SESSION_TTL_SEC, x, radius, z, radius]
  );
}

async function assertSession(userId, serverId) {
  const rows = await query(
    `SELECT id FROM server_sessions WHERE user_id = ? AND server_id = ? LIMIT 1`,
    [userId, serverId]
  );
  if (!rows.length) {
    const err = new Error('不在该服务器会话中');
    err.status = 409;
    throw err;
  }
}

async function setServerBlocks(serverId, userId, blocks) {
  await assertSession(userId, serverId);
  return writeServerBlocks(serverId, userId, blocks);
}

/** WS 等路径：已鉴权时直接写入（会话失效时仍尽量落盘，保证地形不丢） */
async function persistServerBlocks(serverId, userId, blocks) {
  try {
    await assertSession(userId, serverId);
  } catch {
    // 会话过期仍写入方块，避免挖坑丢失
  }
  return writeServerBlocks(serverId, userId, blocks);
}

async function writeServerBlocks(serverId, userId, blocks) {
  const saved = [];
  for (const b of blocks) {
    const x = Math.floor(Number(b.x));
    const y = Math.floor(Number(b.y));
    const z = Math.floor(Number(b.z));
    const blockId = String(b.blockId || 'air').slice(0, 32);
    if ([x, y, z].some((n) => Number.isNaN(n))) continue;
    await query(
      `INSERT INTO server_block_overrides (server_id, x, y, z, block_id, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE block_id = VALUES(block_id), updated_by = VALUES(updated_by)`,
      [serverId, x, y, z, blockId, userId]
    );
    saved.push({ x, y, z, blockId });
  }
  return saved;
}

const { normalizeBag, serializeBag } = require('../game/combatStats');

const INV_KEYS = ['turf', 'stone', 'wood', 'dry_grass', 'dirt', 'sand'];

function normalizeInventory(raw) {
  return serializeBag(normalizeBag(raw));
}

async function getInventory(userId, serverId) {
  try {
    const rows = await query(
      `SELECT inv_json AS invJson FROM server_player_inventories
       WHERE user_id = ? AND server_id = ? LIMIT 1`,
      [userId, serverId]
    );
    if (!rows.length) return normalizeInventory(null);
    const raw =
      typeof rows[0].invJson === 'string'
        ? JSON.parse(rows[0].invJson)
        : rows[0].invJson;
    return normalizeInventory(raw);
  } catch {
    return normalizeInventory(null);
  }
}

async function saveInventory(userId, serverId, inventory) {
  const inv = normalizeInventory(inventory);
  await query(
    `INSERT INTO server_player_inventories (user_id, server_id, inv_json)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE inv_json = VALUES(inv_json)`,
    [userId, serverId, JSON.stringify(inv)]
  );
  return inv;
}

async function saveInventoryForSession(userId, serverId, inventory) {
  await assertSession(userId, serverId);
  return saveInventory(userId, serverId, inventory);
}

async function getServerBlocksInRange(serverId, min, max) {
  return query(
    `SELECT x, y, z, block_id AS blockId
     FROM server_block_overrides
     WHERE server_id = ?
       AND x BETWEEN ? AND ?
       AND y BETWEEN ? AND ?
       AND z BETWEEN ? AND ?`,
    [serverId, min.x, max.x, min.y, max.y, min.z, max.z]
  );
}

/**
 * 死亡清场：该玩家改过的方块按列压成草坪（最低层 grass，其上 air）
 * @returns {{ blockIds: string[], cleared: {x:number,y:number,z:number,blockId:string}[] }}
 */
async function clearPlayerBuildsToGrass(serverId, userId) {
  const rows = await query(
    `SELECT x, y, z, block_id AS blockId
     FROM server_block_overrides
     WHERE server_id = ? AND updated_by = ?`,
    [serverId, userId]
  );
  if (!rows.length) {
    return { blockIds: [], cleared: [] };
  }

  const blockIds = rows.map((r) => String(r.blockId || 'air'));
  /** @type {Map<string, {x:number,z:number, ys:number[]}>} */
  const cols = new Map();
  for (const r of rows) {
    const x = Math.floor(Number(r.x));
    const y = Math.floor(Number(r.y));
    const z = Math.floor(Number(r.z));
    const key = `${x},${z}`;
    let col = cols.get(key);
    if (!col) {
      col = { x, z, ys: [] };
      cols.set(key, col);
    }
    col.ys.push(y);
  }

  /** @type {{x:number,y:number,z:number,blockId:string}[]} */
  const cleared = [];
  for (const col of cols.values()) {
    const minY = Math.min(...col.ys);
    const maxY = Math.max(...col.ys);
    for (let y = minY; y <= maxY; y++) {
      cleared.push({
        x: col.x,
        y,
        z: col.z,
        blockId: y === minY ? 'grass' : 'air',
      });
    }
  }

  // 先删归属，再写入草坪/空气并标记为系统（updated_by=0），避免下次死亡重复折现
  await query(`DELETE FROM server_block_overrides WHERE server_id = ? AND updated_by = ?`, [
    serverId,
    userId,
  ]);

  const CHUNK = 200;
  for (let i = 0; i < cleared.length; i += CHUNK) {
    const slice = cleared.slice(i, i + CHUNK);
    await writeServerBlocks(serverId, null, slice);
  }

  return { blockIds, cleared };
}

function getNpcPolicy() {
  return NPC_POLICY;
}

async function purgeStaleSessions() {
  await query(
    `DELETE FROM server_sessions
     WHERE last_seen_at < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
    [SESSION_TTL_SEC * 2]
  );
}

module.exports = {
  listServers,
  getServer,
  joinServer,
  leaveServer,
  heartbeat,
  nearbyPlayers,
  setServerBlocks,
  persistServerBlocks,
  getServerBlocksInRange,
  clearPlayerBuildsToGrass,
  getInventory,
  saveInventory,
  saveInventoryForSession,
  getNpcPolicy,
  purgeStaleSessions,
  countOnline,
};
