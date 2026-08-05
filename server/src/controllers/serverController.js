const serverService = require('../services/serverService');
const { ok, fail } = require('../utils/response');

async function list(req, res) {
  try {
    const list = await serverService.listServers();
    return ok(res, { servers: list, npcPolicy: serverService.getNpcPolicy() });
  } catch (err) {
    return fail(res, 500, err.message || '获取服务器失败');
  }
}

async function join(req, res) {
  try {
    const preferred = req.body && req.body.serverId ? Number(req.body.serverId) : null;
    const data = await serverService.joinServer(req.user.id, preferred);
    return ok(res, data, '已进入服务器');
  } catch (err) {
    return fail(res, err.status || 500, err.message || '加入失败');
  }
}

async function leave(req, res) {
  try {
    const body = req.body || {};
    await serverService.leaveServer(req.user.id, {
      serverId: body.serverId != null ? Number(body.serverId) : null,
      x: body.x,
      y: body.y,
      z: body.z,
      yaw: body.yaw,
      pitch: body.pitch,
      inventory: body.inventory,
    });
    return ok(res, true, '已离开');
  } catch (err) {
    return fail(res, 500, err.message || '离开失败');
  }
}

async function heartbeat(req, res) {
  try {
    const { serverId, x, y, z, yaw, pitch } = req.body || {};
    if (!serverId || x == null || y == null || z == null) {
      return fail(res, 400, '参数不完整');
    }
    await serverService.heartbeat(req.user.id, Number(serverId), {
      x: Number(x),
      y: Number(y),
      z: Number(z),
      yaw: Number(yaw) || 0,
      pitch: Number(pitch) || 0,
    });
    return ok(res, true);
  } catch (err) {
    return fail(res, err.status || 500, err.message || '心跳失败');
  }
}

async function nearby(req, res) {
  try {
    const serverId = Number(req.query.serverId);
    if (!serverId) return fail(res, 400, 'serverId 必填');
    const list = await serverService.nearbyPlayers(serverId, req.user.id);
    return ok(res, list);
  } catch (err) {
    return fail(res, 500, err.message || '查询附近玩家失败');
  }
}

async function detail(req, res) {
  try {
    const server = await serverService.getServer(Number(req.params.id));
    if (!server) return fail(res, 404, '服务器不存在');
    const online = await serverService.countOnline(server.id);
    return ok(res, {
      server: { ...server, online },
      npcPolicy: serverService.getNpcPolicy(),
    });
  } catch (err) {
    return fail(res, 500, err.message || '获取失败');
  }
}

async function queryBlocks(req, res) {
  try {
    const serverId = Number(req.query.serverId);
    const minX = Number(req.query.minX);
    const maxX = Number(req.query.maxX);
    const minY = Number(req.query.minY ?? -16);
    const maxY = Number(req.query.maxY ?? 96);
    const minZ = Number(req.query.minZ);
    const maxZ = Number(req.query.maxZ);
    if (!serverId || [minX, maxX, minZ, maxZ].some((n) => Number.isNaN(n))) {
      return fail(res, 400, '范围参数不完整');
    }
    const list = await serverService.getServerBlocksInRange(
      serverId,
      { x: minX, y: minY, z: minZ },
      { x: maxX, y: maxY, z: maxZ }
    );
    return ok(res, list);
  } catch (err) {
    return fail(res, err.status || 500, err.message || '获取方块失败');
  }
}

async function saveBlocks(req, res) {
  try {
    const { serverId, blocks } = req.body || {};
    if (!serverId || !Array.isArray(blocks) || !blocks.length) {
      return fail(res, 400, '参数不完整');
    }
    if (blocks.length > 512) {
      return fail(res, 400, '单次方块过多');
    }
    const saved = await serverService.setServerBlocks(
      Number(serverId),
      req.user.id,
      blocks
    );
    return ok(res, saved);
  } catch (err) {
    return fail(res, err.status || 500, err.message || '保存方块失败');
  }
}

async function saveInventory(req, res) {
  try {
    const { serverId, inventory } = req.body || {};
    if (!serverId || !inventory || typeof inventory !== 'object') {
      return fail(res, 400, '参数不完整');
    }
    // 借 heartbeat 的会话校验：先查会话
    const saved = await serverService.saveInventoryForSession(
      req.user.id,
      Number(serverId),
      inventory
    );
    return ok(res, saved);
  } catch (err) {
    return fail(res, err.status || 500, err.message || '保存仓库失败');
  }
}

module.exports = {
  list,
  join,
  leave,
  heartbeat,
  nearby,
  detail,
  queryBlocks,
  saveBlocks,
  saveInventory,
};
