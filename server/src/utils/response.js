function ok(res, data, message) {
  return res.json({
    code: 0,
    message: message || 'ok',
    data: data === undefined ? null : data,
  });
}

function fail(res, status, message, code) {
  return res.status(status).json({
    code: code || status,
    message: message || 'error',
    data: null,
  });
}

module.exports = { ok, fail };
