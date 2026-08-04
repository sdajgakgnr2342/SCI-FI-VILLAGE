const express = require('express');
const mysql = require('../db/mysql');
const redis = require('../db/redis');
const { ok } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res) => {
  let mysqlOk = false;
  let redisOk = false;
  try {
    mysqlOk = await mysql.ping();
  } catch {
    mysqlOk = false;
  }
  redisOk = redis.isAvailable();
  return ok(res, {
    status: 'up',
    mysql: mysqlOk,
    redis: redisOk,
    time: new Date().toISOString(),
  });
});

module.exports = router;
