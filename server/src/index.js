const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { WebSocketServer } = require('ws');

const config = require('./config');
const redis = require('./db/redis');
const { fail } = require('./utils/response');

const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const worldRoutes = require('./routes/worlds');
const playerRoutes = require('./routes/player');
const serverRoutes = require('./routes/servers');
const partyRoutes = require('./routes/party');
const serverService = require('./services/serverService');
const { attachPresenceHub } = require('./ws/presenceHub');
const fs = require('fs');
const path = require('path');
const { query } = require('./db/mysql');

async function ensurePartyTables() {
  try {
    const sqlPath = path.join(__dirname, '../sql/party.sql');
    const raw = fs.readFileSync(sqlPath, 'utf8');
    // 跳过 USE 语句，按分号拆分执行
    const statements = raw
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--') && !/^USE\b/i.test(s));
    for (const stmt of statements) {
      await query(stmt);
    }
    console.log('[server] party tables ready');
  } catch (err) {
    console.warn('[server] party table ensure skipped:', err.message);
  }
}

async function ensureControlLayoutTable() {
  try {
    const sqlPath = path.join(__dirname, '../sql/control_layout.sql');
    const raw = fs.readFileSync(sqlPath, 'utf8');
    const statements = raw
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--') && !/^USE\b/i.test(s));
    for (const stmt of statements) {
      await query(stmt);
    }
    console.log('[server] control_layouts table ready');
  } catch (err) {
    console.warn('[server] control_layouts ensure skipped:', err.message);
  }
}

async function ensureServerBlocksTable() {
  try {
    const sqlPath = path.join(__dirname, '../sql/server_blocks.sql');
    const raw = fs.readFileSync(sqlPath, 'utf8');
    const statements = raw
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--') && !/^USE\b/i.test(s));
    for (const stmt of statements) {
      await query(stmt);
    }
    console.log('[server] server_block_overrides table ready');
  } catch (err) {
    console.warn('[server] server_block_overrides ensure skipped:', err.message);
  }
}

async function ensureServerAnchorsTable() {
  try {
    const sqlPath = path.join(__dirname, '../sql/server_anchors.sql');
    const raw = fs.readFileSync(sqlPath, 'utf8');
    const statements = raw
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--') && !/^USE\b/i.test(s));
    for (const stmt of statements) {
      await query(stmt);
    }
    console.log('[server] server_player_anchors table ready');
  } catch (err) {
    console.warn('[server] server_player_anchors ensure skipped:', err.message);
  }
}

async function bootstrap() {
  await redis.initRedis();
  await ensurePartyTables();
  await ensureControlLayoutTable();
  await ensureServerBlocksTable();
  await ensureServerAnchorsTable();

  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.isProd
        ? config.clientOrigin
        : true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(config.isProd ? 'combined' : 'dev'));

  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/worlds', worldRoutes);
  app.use('/api/player', playerRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/party', partyRoutes);

  // 清理超时会话 + 刷新服状态
  setInterval(() => {
    serverService.purgeStaleSessions().catch(() => undefined);
  }, 20000);

  app.use((req, res) => fail(res, 404, '接口不存在'));
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    fail(res, err.status || 500, err.message || '服务器错误');
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  attachPresenceHub(wss);
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[server] port ${config.port} is already in use`);
      process.exit(1);
    }
    console.error('[server] listen error:', err);
    process.exit(1);
  });

  server.listen(config.port, () => {
    console.log(
      `[server] Sci-Fi Village API listening on :${config.port} (${config.env})`
    );
    console.log(`[server] MySQL ${config.db.user}@${config.db.host}/${config.db.database}`);
    console.log(`[server] Redis ${redis.isAvailable() ? 'online' : 'fallback(memory)'}`);
  });
}

bootstrap().catch((err) => {
  console.error('[bootstrap] failed:', err);
  process.exit(1);
});
