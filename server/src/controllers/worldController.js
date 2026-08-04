const worldService = require('../services/worldService');
const { ok, fail } = require('../utils/response');

async function list(req, res) {
  try {
    const worlds = await worldService.listWorlds(req.user.id);
    return ok(res, worlds);
  } catch (err) {
    return fail(res, 500, err.message || '获取世界失败');
  }
}

async function create(req, res) {
  try {
    const { name, seed, gameMode, isPublic } = req.body || {};
    if (!name || !String(name).trim()) {
      return fail(res, 400, '世界名称必填');
    }
    const world = await worldService.createWorld(req.user.id, {
      name: String(name).trim().slice(0, 64),
      seed,
      gameMode,
      isPublic,
    });
    return ok(res, world, '世界已创建');
  } catch (err) {
    return fail(res, 500, err.message || '创建世界失败');
  }
}

async function detail(req, res) {
  try {
    const worldId = Number(req.params.id);
    const world = await worldService.getWorldById(worldId, req.user.id);
    if (!world) return fail(res, 404, '世界不存在或无权限');
    const player = await worldService.getOrCreatePlayerState(req.user.id, worldId);
    return ok(res, { world, player });
  } catch (err) {
    return fail(res, 500, err.message || '获取世界失败');
  }
}

async function updatePosition(req, res) {
  try {
    const { worldId, x, y, z, yaw, pitch } = req.body || {};
    if (!worldId || x == null || y == null || z == null) {
      return fail(res, 400, 'worldId 与坐标必填');
    }
    const world = await worldService.getWorldById(Number(worldId), req.user.id);
    if (!world) return fail(res, 404, '世界不存在或无权限');
    const state = await worldService.updatePlayerPosition(req.user.id, Number(worldId), {
      x: Number(x),
      y: Number(y),
      z: Number(z),
      yaw: Number(yaw) || 0,
      pitch: Number(pitch) || 0,
    });
    return ok(res, state);
  } catch (err) {
    return fail(res, 500, err.message || '同步位置失败');
  }
}

async function inventory(req, res) {
  try {
    const worldId = Number(req.query.worldId);
    if (!worldId) return fail(res, 400, 'worldId 必填');
    const world = await worldService.getWorldById(worldId, req.user.id);
    if (!world) return fail(res, 404, '世界不存在或无权限');
    const items = await worldService.getInventory(req.user.id, worldId);
    return ok(res, items);
  } catch (err) {
    return fail(res, 500, err.message || '获取背包失败');
  }
}

async function placeBlock(req, res) {
  try {
    const { worldId, x, y, z, blockId } = req.body || {};
    if (!worldId || x == null || y == null || z == null || !blockId) {
      return fail(res, 400, '参数不完整');
    }
    const world = await worldService.getWorldById(Number(worldId), req.user.id);
    if (!world) return fail(res, 404, '世界不存在或无权限');
    const block = await worldService.setBlock(Number(worldId), req.user.id, {
      x: Math.floor(Number(x)),
      y: Math.floor(Number(y)),
      z: Math.floor(Number(z)),
      blockId: String(blockId),
    });
    return ok(res, block);
  } catch (err) {
    return fail(res, 500, err.message || '放置方块失败');
  }
}

async function blocks(req, res) {
  try {
    const worldId = Number(req.query.worldId);
    const minX = Number(req.query.minX);
    const maxX = Number(req.query.maxX);
    const minY = Number(req.query.minY ?? 0);
    const maxY = Number(req.query.maxY ?? 128);
    const minZ = Number(req.query.minZ);
    const maxZ = Number(req.query.maxZ);
    if (!worldId || [minX, maxX, minZ, maxZ].some((n) => Number.isNaN(n))) {
      return fail(res, 400, '范围参数不完整');
    }
    const world = await worldService.getWorldById(worldId, req.user.id);
    if (!world) return fail(res, 404, '世界不存在或无权限');
    const list = await worldService.getBlocksInRange(
      worldId,
      { x: minX, y: minY, z: minZ },
      { x: maxX, y: maxY, z: maxZ }
    );
    return ok(res, list);
  } catch (err) {
    return fail(res, 500, err.message || '获取方块失败');
  }
}

module.exports = {
  list,
  create,
  detail,
  updatePosition,
  inventory,
  placeBlock,
  blocks,
};
