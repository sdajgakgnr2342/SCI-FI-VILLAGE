const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');

async function init() {
  const files = ['schema.sql', 'servers.sql'];
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  try {
    for (const file of files) {
      const sqlPath = path.resolve(__dirname, '../../sql', file);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await conn.query(sql);
      console.log(`[db:init] applied ${file}`);
    }
    console.log(`[db:init] done @ ${config.db.host}/${config.db.database}`);
  } finally {
    await conn.end();
  }
}

init().catch((err) => {
  console.error('[db:init] failed:', err.message);
  process.exit(1);
});
