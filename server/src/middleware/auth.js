const jwt = require('jsonwebtoken');
const config = require('../config');
const { fail } = require('../utils/response');

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return fail(res, 401, '未登录');
  }
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = { id: Number(payload.sub), username: payload.username };
    return next();
  } catch {
    return fail(res, 401, '登录已失效');
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return next();
  }
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = { id: Number(payload.sub), username: payload.username };
  } catch {
    // ignore
  }
  return next();
}

module.exports = { authRequired, optionalAuth };
