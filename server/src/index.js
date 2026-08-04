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

async function bootstrap() {
  await redis.initRedis();

  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.clientOrigin,
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

  app.use((req, res) => fail(res, 404, '接口不存在'));
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    fail(res, err.status || 500, err.message || '服务器错误');
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'welcome', message: 'Sci-Fi Village WS ready' }));

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      // broadcast presence / block updates to peers (skeleton)
      if (msg && (msg.type === 'presence' || msg.type === 'block')) {
        const payload = JSON.stringify(msg);
        wss.clients.forEach((client) => {
          if (client !== socket && client.readyState === 1) {
            client.send(payload);
          }
        });
      }
    });
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
