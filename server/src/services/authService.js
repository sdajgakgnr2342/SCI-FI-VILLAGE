const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db/mysql');
const redis = require('../db/redis');
const config = require('../config');

function signToken(user) {
  return jwt.sign(
    { username: user.username },
    config.jwt.secret,
    { subject: String(user.id), expiresIn: config.jwt.expiresIn }
  );
}

async function register({ username, password, email, displayName }) {
  const existing = await query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  if (existing.length) {
    const err = new Error('用户名已存在');
    err.status = 409;
    throw err;
  }
  if (email) {
    const emailHit = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (emailHit.length) {
      const err = new Error('邮箱已被使用');
      err.status = 409;
      throw err;
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO users (username, email, password_hash, display_name)
     VALUES (?, ?, ?, ?)`,
    [username, email || null, passwordHash, displayName || username]
  );

  const user = {
    id: result.insertId,
    username,
    email: email || null,
    displayName: displayName || username,
  };
  const token = signToken(user);
  await redis.setJson(`session:user:${user.id}`, { id: user.id, username }, 60 * 60 * 24 * 7);
  return { user, token };
}

async function login({ username, password }) {
  const rows = await query(
    'SELECT id, username, email, password_hash, display_name FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  if (!rows.length) {
    const err = new Error('用户名或密码错误');
    err.status = 401;
    throw err;
  }
  const row = rows[0];
  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) {
    const err = new Error('用户名或密码错误');
    err.status = 401;
    throw err;
  }

  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [row.id]);
  const user = {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
  };
  const token = signToken(user);
  await redis.setJson(`session:user:${user.id}`, { id: user.id, username: user.username }, 60 * 60 * 24 * 7);
  return { user, token };
}

async function getUserById(id) {
  const rows = await query(
    'SELECT id, username, email, display_name AS displayName, created_at AS createdAt, last_login_at AS lastLoginAt FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  register,
  login,
  getUserById,
  signToken,
};
