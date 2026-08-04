const authService = require('../services/authService');
const { ok, fail } = require('../utils/response');

async function register(req, res) {
  try {
    const { username, password, email, displayName } = req.body || {};
    if (!username || !password) {
      return fail(res, 400, '用户名和密码必填');
    }
    if (String(username).length < 3 || String(username).length > 32) {
      return fail(res, 400, '用户名长度需 3–32');
    }
    if (String(password).length < 6) {
      return fail(res, 400, '密码至少 6 位');
    }
    const data = await authService.register({
      username: String(username).trim(),
      password: String(password),
      email: email ? String(email).trim() : null,
      displayName: displayName ? String(displayName).trim() : null,
    });
    return ok(res, data, '注册成功');
  } catch (err) {
    return fail(res, err.status || 500, err.message || '注册失败');
  }
}

async function login(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return fail(res, 400, '用户名和密码必填');
    }
    const data = await authService.login({
      username: String(username).trim(),
      password: String(password),
    });
    return ok(res, data, '登录成功');
  } catch (err) {
    return fail(res, err.status || 500, err.message || '登录失败');
  }
}

async function me(req, res) {
  try {
    const user = await authService.getUserById(req.user.id);
    if (!user) return fail(res, 404, '用户不存在');
    return ok(res, user);
  } catch (err) {
    return fail(res, 500, err.message || '查询失败');
  }
}

module.exports = { register, login, me };
