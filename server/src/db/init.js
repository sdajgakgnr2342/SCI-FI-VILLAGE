const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');

async function init() {
  const schemaPath = path.resolve(__dirname, '../../sql/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log(`[db:init] schema applied to ${config.db.database} @ ${config.db.host}`);
  } finally {
    await conn.end();
  }
}

init().catch((err) => {
  console.error('[db:init] failed:', err.message);
  process.exit(1);
});
