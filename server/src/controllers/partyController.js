const partyService = require('../services/partyService');
const serverService = require('../services/serverService');
const { ok, fail } = require('../utils/response');

async function mine(req, res) {
  try {
    const data = await partyService.getMine(req.user.id);
    return ok(res, data);
  } catch (err) {
    return fail(res, 500, err.message || '获取队伍失败');
  }
}

async function invite(req, res) {
  try {
    const username = req.body && req.body.username;
    if (!username) return fail(res, 400, '请输入用户名');
    const data = await partyService.inviteByUsername(req.user.id, username);
    return ok(res, data, '邀请已发送');
  } catch (err) {
    return fail(res, err.status || 500, err.message || '邀请失败');
  }
}

async function accept(req, res) {
  try {
    const data = await partyService.acceptInvite(req.user.id, Number(req.params.id));
    return ok(res, data, '已加入队伍');
  } catch (err) {
    return fail(res, err.status || 500, err.message || '接受失败');
  }
}

async function decline(req, res) {
  try {
    await partyService.declineInvite(req.user.id, Number(req.params.id));
    return ok(res, true, '已拒绝');
  } catch (err) {
    return fail(res, err.status || 500, err.message || '拒绝失败');
  }
}

async function leave(req, res) {
  try {
    await partyService.leaveParty(req.user.id);
    return ok(res, true, '已离队');
  } catch (err) {
    return fail(res, 500, err.message || '离队失败');
  }
}

/**
 * 组队进入：队长先进服，队员在队长旁出生。
 */
async function enter(req, res) {
  try {
    const preferred = req.body && req.body.serverId ? Number(req.body.serverId) : null;
    let party = await partyService.findPartyByUser(req.user.id);
    if (!party) {
      party = await partyService.ensureParty(req.user.id);
    }
    const members = await partyService.listMembers(party.id);
    const isHost = party.hostUserId === req.user.id;
    const myIndex = Math.max(
      0,
      members.findIndex((m) => m.userId === req.user.id)
    );

    let joinOpts = { slot: myIndex };

    if (!isHost && party.serverId) {
      // 队员：进队长所在服，靠在队长旁边
      joinOpts.nearUserId = party.hostUserId;
      const data = await serverService.joinServer(req.user.id, party.serverId, joinOpts);
      return ok(res, { ...data, party }, '组队进入');
    }

    if (!isHost && !party.serverId) {
      // 队长还没进服：先让队员等，或直接一起匹配
      // 允许队员先匹配，队长随后靠近 — 这里让队员走自动匹配同一逻辑：若无 server 则进，否则提示等队长
      const err = new Error('请等待队长先点击「组队进入」');
      err.status = 400;
      throw err;
    }

    // 队长：选服并写入 party.server_id
    const data = await serverService.joinServer(req.user.id, preferred || party.serverId, joinOpts);
    await partyService.setPartyServer(party.id, data.server.id);
    return ok(res, { ...data, party: { ...party, serverId: data.server.id } }, '组队进入');
  } catch (err) {
    return fail(res, err.status || 500, err.message || '组队进入失败');
  }
}

module.exports = { mine, invite, accept, decline, leave, enter };
