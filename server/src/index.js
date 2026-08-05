const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const redis = require('./db/redis');
const { fail } = require('./utils/response');
const { query } = require('./db/mysql');

const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const worldRoutes = require('./routes/worlds');
const playerRoutes = require('./routes/player');
const serverRoutes = require('./routes/servers');
const partyRoutes = require('./routes/party');
const serverService = require('./services/serverService');
const { attachPresenceHub } = require('./ws/presenceHub');

/**
 * 执行 sql 文件：先去掉 -- 注释行，再按分号拆分。
 * 旧逻辑用 startsWith('--') 过滤整段，导致带文件头注释的 CREATE 被整段丢掉。
 */
async function runSqlFile(fileName, label) {
  try {
    const sqlPath = path.join(__dirname, '../sql', fileName);
    const raw = fs.readFileSync(sqlPath, 'utf8');
    const cleaned = raw
      .split(/\r?\n/)
      .filter((line) => {
        const t = line.trim();
        return t && !t.startsWith('--');
      })
      .join('\n');
    const statements = cleaned
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !/^USE\b/i.test(s));
    if (!statements.length) {
      console.warn(`[server] ${label}: no SQL statements in ${fileName}`);
      return;
    }
    for (const stmt of statements) {
      await query(stmt);
    }
    console.log(`[server] ${label} ready (${statements.length} stmt)`);
  } catch (err) {
    console.warn(`[server] ${label} ensure failed:`, err.message);
  }
}

async function bootstrap() {
  await redis.initRedis();
  await runSqlFile('party.sql', 'party tables');
  await runSqlFile('control_layout.sql', 'control_layouts');
  await runSqlFile('server_blocks.sql', 'server_block_overrides');
  await runSqlFile('server_anchors.sql', 'server_player_anchors');
  await runSqlFile('server_inventory.sql', 'server_player_inventories');

  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.isProd ? config.clientOrigin : true,
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
