const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('[postgres] Unexpected pool error:', err.message);
});

async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[postgres] Schema ready.');
}

const query = (text, params) => pool.query(text, params);

module.exports = { query, pool, initSchema };
