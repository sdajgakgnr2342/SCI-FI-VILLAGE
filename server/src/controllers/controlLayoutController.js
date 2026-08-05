const controlLayoutService = require('../services/controlLayoutService');
const { ok, fail } = require('../utils/response');

async function getMine(req, res) {
  try {
    const data = await controlLayoutService.getLayout(req.user.id);
    return ok(res, data);
  } catch (err) {
    return fail(res, err.status || 500, err.message);
  }
}

async function saveMine(req, res) {
  try {
    const data = await controlLayoutService.saveLayout(req.user.id, req.body?.layout);
    return ok(res, data, '键位已保存');
  } catch (err) {
    return fail(res, err.status || 500, err.message);
  }
}

async function share(req, res) {
  try {
    const data = await controlLayoutService.ensureShareCode(req.user.id);
    return ok(res, data);
  } catch (err) {
    return fail(res, err.status || 500, err.message);
  }
}

async function importCode(req, res) {
  try {
    const data = await controlLayoutService.importByCode(req.user.id, req.body?.code);
    return ok(res, data, '键位已导入');
  } catch (err) {
    return fail(res, err.status || 500, err.message);
  }
}

module.exports = { getMine, saveMine, share, importCode };
