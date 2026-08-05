const { query } = require('../db/mysql');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomShareCode(len = 8) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

function normalizeLayout(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // 接受 v1/v2；缺字段时仍落库，客户端再 normalize
  if ((raw.version !== 1 && raw.version !== 2) || !raw.items || typeof raw.items !== 'object') {
    return null;
  }
  return raw;
}

async function getLayout(userId) {
  const rows = await query(
    `SELECT layout_json AS layoutJson, share_code AS shareCode, updated_at AS updatedAt
     FROM control_layouts WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  if (!rows.length) return { layout: null, shareCode: null };
  const row = rows[0];
  const layout =
    typeof row.layoutJson === 'string' ? JSON.parse(row.layoutJson) : row.layoutJson;
  return { layout, shareCode: row.shareCode || null };
}

async function saveLayout(userId, layout) {
  const normalized = normalizeLayout(layout);
  if (!normalized) {
    const err = new Error('键位配置无效');
    err.status = 400;
    throw err;
  }
  const json = JSON.stringify(normalized);
  await query(
    `INSERT INTO control_layouts (user_id, layout_json)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE layout_json = VALUES(layout_json)`,
    [userId, json]
  );
  return getLayout(userId);
}

async function ensureShareCode(userId) {
  const cur = await getLayout(userId);
  if (!cur.layout) {
    const err = new Error('请先保存键位再分享');
    err.status = 400;
    throw err;
  }
  if (cur.shareCode) return { shareCode: cur.shareCode, layout: cur.layout };

  for (let i = 0; i < 8; i++) {
    const code = randomShareCode(8);
    try {
      await query(`UPDATE control_layouts SET share_code = ? WHERE user_id = ?`, [
        code,
        userId,
      ]);
      return { shareCode: code, layout: cur.layout };
    } catch (e) {
      if (e && e.code === 'ER_DUP_ENTRY') continue;
      throw e;
    }
  }
  const err = new Error('生成键位码失败，请重试');
  err.status = 500;
  throw err;
}

async function importByCode(userId, code) {
  const clean = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (clean.length < 6) {
    const err = new Error('键位码无效');
    err.status = 400;
    throw err;
  }
  const rows = await query(
    `SELECT layout_json AS layoutJson FROM control_layouts WHERE share_code = ? LIMIT 1`,
    [clean]
  );
  if (!rows.length) {
    const err = new Error('键位码不存在');
    err.status = 404;
    throw err;
  }
  const layout =
    typeof rows[0].layoutJson === 'string'
      ? JSON.parse(rows[0].layoutJson)
      : rows[0].layoutJson;
  return saveLayout(userId, layout);
}

module.exports = {
  getLayout,
  saveLayout,
  ensureShareCode,
  importByCode,
};
