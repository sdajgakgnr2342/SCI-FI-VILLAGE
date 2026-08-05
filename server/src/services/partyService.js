const { query } = require('../db/mysql');

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[(Math.random() * chars.length) | 0];
  return s;
}

async function getUserByUsername(username) {
  const rows = await query(
    `SELECT id, username, display_name AS displayName FROM users WHERE username = ? LIMIT 1`,
    [username]
  );
  return rows[0] || null;
}

async function getUserBrief(userId) {
  const rows = await query(
    `SELECT id, username, display_name AS displayName FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function findPartyByUser(userId) {
  const rows = await query(
    `SELECT p.id, p.code, p.host_user_id AS hostUserId, p.server_id AS serverId, p.status
     FROM party_members m
     JOIN parties p ON p.id = m.party_id
     WHERE m.user_id = ? AND p.status <> 'closed'
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function listMembers(partyId) {
  return query(
    `SELECT u.id AS userId, u.username, u.display_name AS displayName, m.role, m.joined_at AS joinedAt
     FROM party_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.party_id = ?
     ORDER BY FIELD(m.role,'host','member'), m.joined_at ASC`,
    [partyId]
  );
}

async function ensureParty(userId) {
  let party = await findPartyByUser(userId);
  if (party) return party;

  let code = makeCode();
  for (let i = 0; i < 5; i++) {
    const exists = await query('SELECT id FROM parties WHERE code = ? LIMIT 1', [code]);
    if (!exists.length) break;
    code = makeCode();
  }

  const result = await query(
    `INSERT INTO parties (code, host_user_id, status) VALUES (?, ?, 'open')`,
    [code, userId]
  );
  const partyId = result.insertId;
  await query(
    `INSERT INTO party_members (party_id, user_id, role) VALUES (?, ?, 'host')`,
    [partyId, userId]
  );
  return findPartyByUser(userId);
}

async function getMine(userId) {
  const party = await findPartyByUser(userId);
  const members = party ? await listMembers(party.id) : [];
  const invites = await query(
    `SELECT i.id, i.status, i.created_at AS createdAt,
            p.code AS partyCode, p.id AS partyId,
            fu.username AS fromUsername, fu.display_name AS fromDisplayName
     FROM party_invites i
     JOIN parties p ON p.id = i.party_id
     JOIN users fu ON fu.id = i.from_user_id
     WHERE i.to_user_id = ? AND i.status = 'pending'
     ORDER BY i.created_at DESC`,
    [userId]
  );
  const sent = party
    ? await query(
        `SELECT i.id, i.status, tu.username AS toUsername, tu.display_name AS toDisplayName
         FROM party_invites i
         JOIN users tu ON tu.id = i.to_user_id
         WHERE i.party_id = ? AND i.status = 'pending'`,
        [party.id]
      )
    : [];
  return { party, members, invites, sent };
}

async function inviteByUsername(fromUserId, username) {
  const target = await getUserByUsername(String(username || '').trim());
  if (!target) {
    const err = new Error('找不到该用户名');
    err.status = 404;
    throw err;
  }
  if (target.id === fromUserId) {
    const err = new Error('不能邀请自己');
    err.status = 400;
    throw err;
  }

  const party = await ensureParty(fromUserId);
  if (party.hostUserId !== fromUserId) {
    const err = new Error('只有队长可以邀请');
    err.status = 403;
    throw err;
  }

  // 最多 4 人（含自己）
  const members = await listMembers(party.id);
  if (members.length >= 4) {
    const err = new Error('队伍最多 4 人');
    err.status = 400;
    throw err;
  }

  const already = await query(
    `SELECT id FROM party_members WHERE party_id = ? AND user_id = ? LIMIT 1`,
    [party.id, target.id]
  );
  if (already.length) {
    const err = new Error('对方已在队伍中');
    err.status = 400;
    throw err;
  }

  const pending = await query(
    `SELECT id FROM party_invites
     WHERE party_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1`,
    [party.id, target.id]
  );
  if (pending.length) {
    return { inviteId: pending[0].id, party, alreadyPending: true };
  }

  const result = await query(
    `INSERT INTO party_invites (party_id, from_user_id, to_user_id, status)
     VALUES (?, ?, ?, 'pending')`,
    [party.id, fromUserId, target.id]
  );
  return { inviteId: result.insertId, party, toUser: target };
}

async function acceptInvite(userId, inviteId) {
  const rows = await query(
    `SELECT i.id, i.party_id AS partyId, i.to_user_id AS toUserId, i.status, p.status AS partyStatus
     FROM party_invites i
     JOIN parties p ON p.id = i.party_id
     WHERE i.id = ? LIMIT 1`,
    [inviteId]
  );
  if (!rows.length || rows[0].toUserId !== userId) {
    const err = new Error('邀请不存在');
    err.status = 404;
    throw err;
  }
  if (rows[0].status !== 'pending') {
    const err = new Error('邀请已处理');
    err.status = 400;
    throw err;
  }
  if (rows[0].partyStatus === 'closed') {
    const err = new Error('队伍已解散');
    err.status = 400;
    throw err;
  }

  const memberCount = await query(
    `SELECT COUNT(*) AS c FROM party_members WHERE party_id = ?`,
    [rows[0].partyId]
  );
  if (Number(memberCount[0].c) >= 4) {
    const err = new Error('队伍已满（最多 4 人）');
    err.status = 400;
    throw err;
  }

  // 离开旧队伍
  await query('DELETE FROM party_members WHERE user_id = ?', [userId]);

  await query(
    `INSERT INTO party_members (party_id, user_id, role) VALUES (?, ?, 'member')
     ON DUPLICATE KEY UPDATE party_id = VALUES(party_id), role = 'member'`,
    [rows[0].partyId, userId]
  );
  await query(`UPDATE party_invites SET status = 'accepted' WHERE id = ?`, [inviteId]);

  return getMine(userId);
}

async function declineInvite(userId, inviteId) {
  const rows = await query(
    `SELECT id, to_user_id AS toUserId, status FROM party_invites WHERE id = ? LIMIT 1`,
    [inviteId]
  );
  if (!rows.length || rows[0].toUserId !== userId) {
    const err = new Error('邀请不存在');
    err.status = 404;
    throw err;
  }
  await query(`UPDATE party_invites SET status = 'declined' WHERE id = ?`, [inviteId]);
  return true;
}

async function leaveParty(userId) {
  const party = await findPartyByUser(userId);
  if (!party) return true;
  await query('DELETE FROM party_members WHERE user_id = ?', [userId]);
  if (party.hostUserId === userId) {
    await query(`UPDATE parties SET status = 'closed' WHERE id = ?`, [party.id]);
    await query(`UPDATE party_invites SET status = 'expired' WHERE party_id = ? AND status = 'pending'`, [
      party.id,
    ]);
    await query('DELETE FROM party_members WHERE party_id = ?', [party.id]);
  }
  return true;
}

async function setPartyServer(partyId, serverId) {
  await query(`UPDATE parties SET server_id = ?, status = 'playing' WHERE id = ?`, [
    serverId,
    partyId,
  ]);
}

module.exports = {
  getMine,
  inviteByUsername,
  acceptInvite,
  declineInvite,
  leaveParty,
  findPartyByUser,
  listMembers,
  ensureParty,
  setPartyServer,
  getUserBrief,
};
