const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/mysql');
const partyService = require('../services/partyService');
const { attachCombatWorld } = require('../game/combatWorld');
const { normalizeBag, serializeBag, freshBag, START_GOLD, PLAYER_MAX_HP } = require('../game/combatStats');
const { calcDeathBuildCompensation } = require('../game/shopCatalog');
const serverService = require('../services/serverService');

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
/** 小队标记最小间隔 */
const MIN_MARK_MS = 180;
/** 小队聊天最小间隔 */
const MIN_CHAT_MS = 280;

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
      hp: p.hp,
      dead: Boolean(p.dead),
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

  /** 小队标记：同服全图推给队友（无队则不广播） */
  async function broadcastToPartyMates(socket, payload, serverIdOverride) {
    const userId = socket.userId;
    const serverId =
      serverIdOverride != null ? serverIdOverride : socket.serverId;
    if (!userId || serverId == null) return;
    let mateIds = null;
    try {
      const party = await partyService.findPartyByUser(userId);
      if (party) {
        const members = await partyService.listMembers(party.id);
        mateIds = new Set(members.map((m) => Number(m.userId)));
      }
    } catch {
      mateIds = null;
    }
    if (!mateIds || mateIds.size <= 1) return;
    const room = rooms.get(Number(serverId));
    if (!room) return;
    const raw = JSON.stringify(payload);
    for (const peer of room) {
      if (peer === socket || peer.readyState !== 1 || !peer.userId) continue;
      if (!mateIds.has(Number(peer.userId))) continue;
      try {
        peer.send(raw);
      } catch {
        // ignore
      }
    }
  }

  function leaveRoom(socket) {
    if (socket.serverId != null) {
      const serverId = Number(socket.serverId);
      if (socket.userId) {
        combat.removePlayer(serverId, socket.userId);
      }
      const room = rooms.get(serverId);
      // 先通知兴趣域内的人
      if (socket.userId && socket.lastPresence) {
        broadcastAoi(socket, { type: 'peer_left', userId: socket.userId }, true);
      }
      // 清掉该人小队标记（传入 serverId，避免随后置空后异步查不到房）
      if (socket.userId) {
        broadcastToPartyMates(
          socket,
          {
            type: 'squad_mark',
            userId: socket.userId,
            clear: true,
            ts: Date.now(),
          },
          serverId
        ).catch(() => undefined);
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

  function getSocketsForServer(serverId) {
    const map = new Map();
    const room = rooms.get(Number(serverId));
    if (!room) return map;
    for (const sock of room) {
      if (sock.userId) map.set(Number(sock.userId), sock);
    }
    return map;
  }

  function broadcastServer(serverId, payload) {
    const room = rooms.get(Number(serverId));
    if (!room) return;
    const raw = JSON.stringify(payload);
    for (const peer of room) {
      if (peer.readyState === 1) {
        try {
          peer.send(raw);
        } catch {
          // ignore
        }
      }
    }
  }

  function sendToUser(userId, serverId, payload) {
    const room = rooms.get(Number(serverId));
    if (!room) return;
    for (const peer of room) {
      if (Number(peer.userId) === Number(userId) && peer.readyState === 1) {
        sendJson(peer, payload);
        return;
      }
    }
  }

  const combat = attachCombatWorld({
    getSocketsForServer,
    broadcastServer,
    sendToUser,
    async onPlayerKicked(userId, serverId, info) {
      let compensation = 0;
      let clearedBlocks = [];
      let removedFurnitureIds = [];
      try {
        const buildClear = await serverService.clearPlayerBuildsToGrass(serverId, userId);
        clearedBlocks = buildClear.cleared || [];
        const furn = combat.removeOwnedFurniture(serverId, userId);
        removedFurnitureIds = furn.ids || [];
        compensation = calcDeathBuildCompensation(buildClear.blockIds || [], furn.propIds || []);
      } catch (err) {
        console.warn('[combat] death clear builds', err.message);
      }

      const keep = normalizeBag(info.keepBag || freshBag());
      const bag = serializeBag({
        ...keep,
        gold: (Number(keep.gold) || START_GOLD) + compensation,
        hp: PLAYER_MAX_HP,
      });

      const parts = [];
      if (compensation > 0) parts.push(`建造补偿 ${compensation} 金`);
      if (info.vaultCount > 0) parts.push(`保险箱 ${info.vaultCount} 把武器`);
      if (info.overflowGold > 0) parts.push(`超出武器折 ${info.overflowGold} 金`);
      const message =
        parts.length > 0
          ? `您已死亡，装备已掉落。${parts.join('，')}`
          : info.message || '您已死亡，装备已掉落';

      sendToUser(userId, serverId, {
        type: 'combat_kick',
        reason: info.reason,
        message,
        compensation,
        vaultCount: info.vaultCount || 0,
        overflowGold: info.overflowGold || 0,
        bag,
        ts: Date.now(),
      });

      // 同步清场结果给同服其他人
      if (clearedBlocks.length) {
        const CHUNK = 200;
        for (let i = 0; i < clearedBlocks.length; i += CHUNK) {
          broadcastServer(serverId, {
            type: 'blocks',
            userId,
            blocks: clearedBlocks.slice(i, i + CHUNK),
            reason: 'death_clear',
            ts: Date.now(),
          });
        }
      }
      if (removedFurnitureIds.length) {
        broadcastServer(serverId, {
          type: 'furniture_cleared',
          userId,
          ids: removedFurnitureIds,
          furniture: [...combat.worldOf(serverId).furniture.values()],
          ts: Date.now(),
        });
      }

      try {
        await serverService.saveInventory(userId, serverId, bag);
        await serverService.leaveServer(userId, {
          serverId,
          inventory: bag,
        });
      } catch (err) {
        console.warn('[combat] kick cleanup', err.message);
      }
      const room = rooms.get(Number(serverId));
      if (room) {
        for (const peer of [...room]) {
          if (Number(peer.userId) === Number(userId)) {
            leaveRoom(peer);
            try {
              peer.close();
            } catch {
              // ignore
            }
          }
        }
      }
    },
  });

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

          try {
            const inv = await serverService.getInventory(userId, serverId);
            socket.combatBag = serializeBag(normalizeBag(inv));
            combat.setPlayerBag(serverId, userId, socket.combatBag);
          } catch {
            socket.combatBag = serializeBag(freshBag());
            combat.setPlayerBag(serverId, userId, socket.combatBag);
          }

          sendJson(socket, {
            type: 'auth_ok',
            userId,
            username: socket.username,
            displayName: socket.displayName,
            serverId,
            aoiCell: AOI_CELL,
            aoiRange: AOI_RANGE,
            combat: {
              hp: socket.combatBag.hp,
              bag: socket.combatBag,
            },
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
            deploying: Boolean(msg.deploying),
            hp: socket.combatBag?.hp,
            dead: Boolean(socket.combatBag && socket.combatBag.hp <= 0),
            ts: now,
          };
          socket.lastPresence = presence;
          socket.deploying = Boolean(msg.deploying);
          placeInGrid(socket, presence.x, presence.z);
          combat.setPlayerBag(socket.serverId, socket.userId, socket.combatBag || freshBag());
          const cp = combat.worldOf(socket.serverId).players.get(Number(socket.userId));
          if (cp && socket.lastPresence) {
            cp.x = presence.x;
            cp.y = presence.y;
            cp.z = presence.z;
            cp.deploying = Boolean(msg.deploying);
          }

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
          // 先入库再广播，保证同服重进/他人所见一致
          try {
            const serverService = require('../services/serverService');
            await serverService.persistServerBlocks(
              socket.serverId,
              socket.userId,
              blocks
            );
          } catch (err) {
            console.warn('[ws] persist blocks failed:', err.message);
          }
          broadcastBlocksNear(socket.serverId, blocks, socket, {
            type: 'blocks',
            userId: socket.userId,
            blocks,
            ts: Date.now(),
          });
          return;
        }

        if (msg.type === 'squad_mark') {
          const now = Date.now();
          if (now - (socket.lastMarkAt || 0) < MIN_MARK_MS) return;
          socket.lastMarkAt = now;
          const clear = Boolean(msg.clear);
          const payload = {
            type: 'squad_mark',
            userId: socket.userId,
            clear,
            slot: Math.max(1, Math.min(4, Math.floor(Number(msg.slot) || 1))),
            x: Number(msg.x) || 0,
            y: Number(msg.y) || 0,
            z: Number(msg.z) || 0,
            label: String(msg.label || '').slice(0, 24),
            ts: now,
          };
          if (clear) {
            delete payload.x;
            delete payload.y;
            delete payload.z;
            delete payload.label;
            delete payload.slot;
          }
          await broadcastToPartyMates(socket, payload);
          return;
        }

        if (msg.type === 'squad_chat') {
          const now = Date.now();
          if (now - (socket.lastChatAt || 0) < MIN_CHAT_MS) return;
          socket.lastChatAt = now;
          const channel = msg.channel === 'system' ? 'system' : 'team';
          const kind = ['chat', 'mark', 'wait'].includes(String(msg.kind))
            ? String(msg.kind)
            : 'chat';
          const text = String(msg.text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 20);
          if (!text && kind === 'chat') return;
          const payload = {
            type: 'squad_chat',
            userId: socket.userId,
            username: socket.username,
            displayName: socket.displayName,
            channel,
            kind,
            slot: Math.max(1, Math.min(4, Math.floor(Number(msg.slot) || 1))),
            text:
              text ||
              (kind === 'wait' ? '等一下' : kind === 'mark' ? '标记了一处地点' : ''),
            ts: now,
          };
          if (msg.mark && typeof msg.mark === 'object') {
            payload.mark = {
              userId: socket.userId,
              slot: payload.slot,
              x: Number(msg.mark.x) || 0,
              y: Number(msg.mark.y) || 0,
              z: Number(msg.mark.z) || 0,
              label: String(msg.mark.label || '').slice(0, 24),
            };
          }
          // 回显自己 + 推队友（无队时至少自己能看见本地，客户端已先插入）
          sendJson(socket, payload);
          await broadcastToPartyMates(socket, payload);
          return;
        }

        if (msg.type === 'combat_attack') {
          const result = combat.handleAttack(socket.serverId, socket.userId, msg);
          sendJson(socket, { type: 'combat_attack_result', ...result, ts: Date.now() });
          if (result.ok && result.events?.length) {
            broadcastAoi(
              socket,
              {
                type: 'combat_fx',
                userId: socket.userId,
                events: result.events,
                ts: Date.now(),
              },
              false
            );
          }
          return;
        }

        if (msg.type === 'combat_use_medkit') {
          const result = combat.handleUseMedkit(
            socket.serverId,
            socket.userId,
            msg.kind === 'medkit_large' ? 'medkit_large' : 'medkit_small'
          );
          if (result.ok) {
            socket.combatBag = result.bag;
            try {
              await serverService.saveInventory(socket.userId, socket.serverId, result.bag);
            } catch {
              // ignore
            }
          }
          sendJson(socket, { type: 'combat_bag', ...result, ts: Date.now() });
          return;
        }

        if (msg.type === 'combat_claim_crate') {
          const result = combat.handleClaimCrate(
            socket.serverId,
            socket.userId,
            String(msg.crateId || '')
          );
          if (result.ok) {
            socket.combatBag = result.bag;
            try {
              await serverService.saveInventory(socket.userId, socket.serverId, result.bag);
            } catch {
              // ignore
            }
            broadcastServer(socket.serverId, {
              type: 'combat_crate_gone',
              crateId: result.crateId,
              ts: Date.now(),
            });
          }
          sendJson(socket, { type: 'combat_bag', ...result, ts: Date.now() });
          return;
        }

        if (msg.type === 'combat_equip') {
          const result = combat.handleEquipWeapon(
            socket.serverId,
            socket.userId,
            String(msg.weaponInstanceId || 'fist')
          );
          if (result.ok) {
            socket.combatBag = result.bag;
            try {
              await serverService.saveInventory(socket.userId, socket.serverId, result.bag);
            } catch {
              // ignore
            }
          }
          sendJson(socket, { type: 'combat_bag', ...result, ts: Date.now() });
          return;
        }

        if (msg.type === 'combat_claim_chest') {
          const result = combat.handleClaimChest(
            socket.serverId,
            socket.userId,
            String(msg.chestId || '')
          );
          if (result.ok) {
            socket.combatBag = result.bag;
            try {
              await serverService.saveInventory(socket.userId, socket.serverId, result.bag);
            } catch {
              // ignore
            }
          }
          sendJson(socket, { type: 'combat_bag', ...result, ts: Date.now() });
          return;
        }

        if (msg.type === 'shop_buy') {
          const result = combat.handleShopBuy(
            socket.serverId,
            socket.userId,
            String(msg.shopItemId || '')
          );
          if (result.ok) {
            socket.combatBag = result.bag;
            try {
              await serverService.saveInventory(socket.userId, socket.serverId, result.bag);
            } catch {
              // ignore
            }
          }
          sendJson(socket, { type: 'combat_bag', ...result, ts: Date.now() });
          return;
        }

        if (msg.type === 'shop_sell') {
          const result = combat.handleShopSell(socket.serverId, socket.userId, msg);
          if (result.ok) {
            socket.combatBag = result.bag;
            try {
              await serverService.saveInventory(socket.userId, socket.serverId, result.bag);
            } catch {
              // ignore
            }
          }
          sendJson(socket, { type: 'combat_bag', ...result, ts: Date.now() });
          return;
        }

        if (msg.type === 'furniture_place') {
          const result = combat.handlePlaceFurniture(socket.serverId, socket.userId, msg);
          if (result.ok) {
            socket.combatBag = result.bag;
            try {
              await serverService.saveInventory(socket.userId, socket.serverId, result.bag);
            } catch {
              // ignore
            }
            if (result.placed) {
              broadcastServer(socket.serverId, {
                type: 'furniture_placed',
                placed: result.placed,
                ts: Date.now(),
              });
            }
          }
          sendJson(socket, { type: 'combat_bag', ...result, ts: Date.now() });
          return;
        }

        if (msg.type === 'combat_harvest_loot') {
          const result = combat.handleHarvestLoot(
            socket.serverId,
            socket.userId,
            String(msg.source || 'dig')
          );
          if (result.ok && result.chest) {
            const bag = combat.getPlayerBag(socket.serverId, socket.userId);
            if (bag) {
              socket.combatBag = bag;
              try {
                await serverService.saveInventory(socket.userId, socket.serverId, bag);
              } catch {
                // ignore
              }
            }
            sendJson(socket, {
              type: 'combat_loot_chest',
              chest: result.chest,
              reason: 'harvest',
              ts: Date.now(),
            });
          }
          return;
        }

        if (msg.type === 'combat_sync_bag') {
          // 客户端材料变更后同步到战斗世界（保留 hp/金币/家具等权威字段）
          const incoming = normalizeBag(msg.bag);
          const cur = normalizeBag(socket.combatBag);
          incoming.hp = cur.hp;
          incoming.lastDamageAt = cur.lastDamageAt;
          incoming.gold = cur.gold;
          incoming.chests = cur.chests;
          incoming.weapons = cur.weapons.length ? cur.weapons : incoming.weapons;
          incoming.furniture = cur.furniture;
          incoming.medkit_small = Math.max(cur.medkit_small, incoming.medkit_small);
          incoming.medkit_large = Math.max(cur.medkit_large, incoming.medkit_large);
          incoming.equippedWeapon = cur.equippedWeapon || incoming.equippedWeapon;
          // 材料以客户端为准（采集权威暂在客户端）
          socket.combatBag = serializeBag(incoming);
          combat.setPlayerBag(socket.serverId, socket.userId, socket.combatBag);
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
