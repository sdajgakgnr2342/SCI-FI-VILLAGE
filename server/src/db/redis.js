const Redis = require('ioredis');
const config = require('../config');

/** @type {import('ioredis').Redis | null} */
let client = null;
let available = false;
const memoryStore = new Map();

function createClient() {
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 1000);
    },
  });

  redis.on('connect', () => {
    available = true;
    console.log('[redis] connected');
  });

  redis.on('error', (err) => {
    available = false;
    if (err && err.code !== 'ECONNREFUSED') {
      console.warn('[redis] error:', err.message);
    }
  });

  redis.on('close', () => {
    available = false;
  });

  return redis;
}

async function initRedis() {
  client = createClient();
  try {
    await client.connect();
    await client.ping();
    available = true;
  } catch (err) {
    available = false;
    console.warn('[redis] unavailable, using in-memory fallback:', err.message);
  }
  return available;
}

function isAvailable() {
  return available;
}

async function get(key) {
  if (available && client) {
    return client.get(key);
  }
  const item = memoryStore.get(key);
  if (!item) return null;
  if (item.expireAt && Date.now() > item.expireAt) {
    memoryStore.delete(key);
    return null;
  }
  return item.value;
}

async function set(key, value, ttlSeconds) {
  if (available && client) {
    if (ttlSeconds) {
      return client.set(key, value, 'EX', ttlSeconds);
    }
    return client.set(key, value);
  }
  memoryStore.set(key, {
    value: String(value),
    expireAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
  return 'OK';
}

async function del(key) {
  if (available && client) {
    return client.del(key);
  }
  memoryStore.delete(key);
  return 1;
}

async function setJson(key, obj, ttlSeconds) {
  return set(key, JSON.stringify(obj), ttlSeconds);
}

async function getJson(key) {
  const raw = await get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  initRedis,
  isAvailable,
  get,
  set,
  del,
  setJson,
  getJson,
  getClient: () => client,
};
