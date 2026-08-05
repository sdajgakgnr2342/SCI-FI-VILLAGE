const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/mysql');

/** 兴趣域格子边长（世界坐标） */
const AOI_CELL = 48;
/** 兴趣域半径（格子数，1 = 3×3） */
const AOI_RANGE = 1;
/** 服务端快照推送间隔 */
const SNAPSHOT_MS = 100;
/** 单连接 presence 最小间隔（防刷） */
const MIN_PRESENCE_MS = 70;
/** 动作变化时立即推给附近，提升手感 */
const ACTION_PUSH = true;

/**
 * 按 serverId 分房 + 网格 AOI + 定时 snapshot
 * 避免同服全量 O(n²) 广播把单线程打满
 */
function attachPresenceHub(wss) {
  /** @type {Map<number, Set<import('ws')>>} */
  const rooms = new Map();
  /** @type {Map<number, Map<string, Set<import('ws')>>>} */
  const grids = new Map();

  function roomOf(serverId) {
    const id = Number(serverId);
    if (!rooms.has(id)) rooms.set(id, new Set());
    return rooms.get(id);
  }

  function gridOf(serverId) {
    const id = Number(serverId);
    if (!grids.has(id)) grids.set(id, new Map());
    return grids.get(id);
  }

  function cellKey(x, z) {
    return `${Math.floor(Number(x) / AOI_CELL)},${Math.floor(Number(z) / AOI_CELL)}`;
  }

  function parseCell(key) {
    const [cx, cz] = String(key).split(',').map(Number);
    return { cx, cz };
  }

  function removeFromGrid(socket) {
    if (socket.serverId == null || !socket.cellKey) return;
    const grid = grids.get(Number(socket.serverId));
    if (!grid) return;
    const set = grid.get(socket.cellKey);
    if (set) {
      set.delete(socket);
      if (set.size === 0) grid.delete(socket.cellKey);
    }
    socket.cellKey = null;
  }

  function placeInGrid(socket, x, z) {
    const key = cellKey(x, z);
    if (socket.cellKey === key) return;
    removeFromGrid(socket);
    if (socket.serverId == null) return;
    const grid = gridOf(socket.serverId);
    if (!grid.has(key)) grid.set(key, new Set());
    grid.get(key).add(socket);
    socket.cellKey = key;
  }

  function forEachInAoi(serverId, cx, cz, fn) {
    const grid = grids.get(Number(serverId));
    if (!grid) return;
    for (let dz = -AOI_RANGE; dz <= AOI_RANGE; dz++) {
      for (let dx = -AOI_RANGE; dx <= AOI_RANGE; dx++) {
        const set = grid.get(`${cx + dx},${cz + dz}`);
        if (!set) continue;
        for (const sock of set) fn(sock);
      }
    }
  }

  function slimPresence(p) {
    if (!p) return null;
    return {
      userId: p.userId,
      username: p.username,
      displayName: p.displayName,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      action: p.action || null,
      crouching: Boolean(p.crouching),
      ts: p.ts,
    };
  }

  function collectAoiPeers(socket) {
    if (!socket.lastPresence || socket.serverId == null) return [];
    const { cx, cz } = parseCell(socket.cellKey || cellKey(socket.lastPresence.x, socket.lastPresence.z));
    const peers = [];
    forEachInAoi(socket.serverId, cx, cz, (peer) => {
      if (peer === socket || !peer.userId || !peer.lastPresence) return;
      const s = slimPresence(peer.lastPresence);
      if (s) peers.push(s);
    });
    return peers;
  }

  function sendJson(socket, obj) {
    if (!socket || socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(obj));
    } catch {
      // ignore
    }
  }

  /** 向兴趣域内其他人推送（不含自己） */
  function broadcastAoi(socket, payload, exceptSelf = true) {
    if (socket.serverId == null || !socket.lastPresence) return;
    const { cx, cz } = parseCell(socket.cellKey || cellKey(socket.lastPresence.x, socket.lastPresence.z));
    const raw = JSON.stringify(payload);
    forEachInAoi(socket.serverId, cx, cz, (peer) => {
      if (exceptSelf && peer === socket) return;
      if (peer.readyState === 1) {
        try {
          peer.send(raw);
        } catch {
          // ignore
        }
      }
    });
  }

  /** 方块：按坐标所在格的兴趣域推送 */
  function broadcastBlocksNear(serverId, blocks, except, payload) {
    if (!blocks.length) return;
    const seen = new Set();
    const raw = JSON.stringify(payload);
    for (const b of blocks) {
      const { cx, cz } = parseCell(cellKey(b.x, b.z));
      forEachInAoi(serverId, cx, cz, (peer) => {
        if (peer === except || peer.readyState !== 1) return;
        if (seen.has(peer)) return;
        seen.add(peer);
        try {
          peer.send(raw);
        } catch {
          // ignore
        }
      });
    }
  }

  function leaveRoom(socket) {
    if (socket.serverId != null) {
      const serverId = Number(socket.serverId);
      const room = rooms.get(serverId);
      // 先通知兴趣域内的人
      if (socket.userId && socket.lastPresence) {
        broadcastAoi(socket, { type: 'peer_left', userId: socket.userId }, true);
      }
      removeFromGrid(socket);
      if (room) {
        room.delete(socket);
        if (room.size === 0) {
          rooms.delete(serverId);
          grids.delete(serverId);
        }
      }
    }
    socket.serverId = null;
    socket.visibleIds = null;
    socket.lastPresence = null;
  }

  function pushSnapshot(socket) {
    const peers = collectAoiPeers(socket);
    const nextIds = new Set(peers.map((p) => p.userId));
    const prev = socket.visibleIds || new Set();
    for (const id of prev) {
      if (!nextIds.has(id)) {
        sendJson(socket, { type: 'peer_left', userId: id });
      }
    }
    socket.visibleIds = nextIds;
    sendJson(socket, { type: 'snapshot', peers, ts: Date.now() });
  }

  const tickTimer = setInterval(() => {
    for (const room of rooms.values()) {
      for (const socket of room) {
        if (!socket.userId || !socket.lastPresence) continue;
        pushSnapshot(socket);
      }
    }
  }, SNAPSHOT_MS);

  if (typeof tickTimer.unref === 'function') tickTimer.unref();

  wss.on('connection', (socket) => {
    socket.userId = null;
    socket.username = null;
    socket.displayName = null;
    socket.serverId = null;
    socket.cellKey = null;
    socket.lastPresence = null;
    socket.lastPresenceAt = 0;
    socket.visibleIds = new Set();

    sendJson(socket, { type: 'welcome', message: 'presence ready', aoi: true });

    socket.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || !msg.type) return;

      try {
        if (msg.type === 'auth') {
          const token = msg.token;
          const serverId = Number(msg.serverId);
          if (!token || !serverId) {
            sendJson(socket, { type: 'error', message: 'auth 参数不完整' });
            return;
          }
          const payload = jwt.verify(token, config.jwt.secret);
          const userId = Number(payload.sub);
          const rows = await query(
            `SELECT id, username, display_name AS displayName FROM users WHERE id = ? LIMIT 1`,
            [userId]
          );
          if (!rows.length) {
            sendJson(socket, { type: 'error', message: '用户无效' });
            return;
          }

          leaveRoom(socket);
          socket.userId = userId;
          socket.username = rows[0].username;
          socket.displayName = rows[0].displayName || rows[0].username;
          socket.serverId = serverId;
          socket.visibleIds = new Set();
          roomOf(serverId).add(socket);

          sendJson(socket, {
            type: 'auth_ok',
            userId,
            username: socket.username,
            displayName: socket.displayName,
            serverId,
            aoiCell: AOI_CELL,
            aoiRange: AOI_RANGE,
          });

          // 等首包 presence 再进格子；先发空 snapshot
          sendJson(socket, { type: 'snapshot', peers: [], ts: Date.now() });
          return;
        }

        if (!socket.userId || !socket.serverId) return;

        if (msg.type === 'presence') {
          const now = Date.now();
          if (now - (socket.lastPresenceAt || 0) < MIN_PRESENCE_MS) return;
          socket.lastPresenceAt = now;

          const prevAction = socket.lastPresence?.action || null;
          const presence = {
            type: 'presence',
            userId: socket.userId,
            username: socket.username,
            displayName: socket.displayName,
            x: Number(msg.x) || 0,
            y: Number(msg.y) || 0,
            z: Number(msg.z) || 0,
            yaw: Number(msg.yaw) || 0,
            pitch: Number(msg.pitch) || 0,
            action: msg.action || null,
            crouching: Boolean(msg.crouching),
            ts: now,
          };
          socket.lastPresence = presence;
          placeInGrid(socket, presence.x, presence.z);

          // 动作变化：立即推给附近，不必等 snapshot
          if (ACTION_PUSH && presence.action !== prevAction) {
            broadcastAoi(
              socket,
              { type: 'presence', ...slimPresence(presence) },
              true
            );
          }
          return;
        }

        if (msg.type === 'blocks' && Array.isArray(msg.blocks)) {
          const blocks = msg.blocks
            .slice(0, 256)
            .map((b) => ({
              x: Math.floor(Number(b.x)),
              y: Math.floor(Number(b.y)),
              z: Math.floor(Number(b.z)),
              blockId: String(b.blockId || 'air').slice(0, 32),
            }))
            .filter((b) => ![b.x, b.y, b.z].some((n) => Number.isNaN(n)));
          if (!blocks.length) return;
          broadcastBlocksNear(socket.serverId, blocks, socket, {
            type: 'blocks',
            userId: socket.userId,
            blocks,
            ts: Date.now(),
          });
          return;
        }

        if (msg.type === 'leave') {
          leaveRoom(socket);
        }
      } catch (err) {
        sendJson(socket, { type: 'error', message: err.message || 'ws error' });
      }
    });

    socket.on('close', () => {
      leaveRoom(socket);
    });
  });
}

module.exports = { attachPresenceHub };
