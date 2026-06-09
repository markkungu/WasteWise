const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[postgres] Unexpected pool error:', err.message);
});

// Release all connections cleanly on process exit
process.on('SIGTERM', () => pool.end());
process.on('SIGINT',  () => pool.end());

// Migrations that must be run explicitly because node-postgres cannot reliably
// execute DO $$ blocks inside a multi-statement string.
const MIGRATIONS = [
  {
    check: `SELECT 1 FROM pg_constraint WHERE conname = 'users_center_id_fkey'`,
    apply: `ALTER TABLE users ADD CONSTRAINT users_center_id_fkey
            FOREIGN KEY (center_id) REFERENCES recycling_companies(id) ON DELETE SET NULL`,
  },
  {
    check: `SELECT 1 FROM pg_constraint WHERE conname = 'plastic_submissions_center_id_fkey'`,
    apply: `ALTER TABLE plastic_submissions ADD CONSTRAINT plastic_submissions_center_id_fkey
            FOREIGN KEY (center_id) REFERENCES recycling_companies(id) ON DELETE SET NULL`,
  },
  {
    check: `SELECT 1 FROM pg_constraint WHERE conname = 'rewards_submission_id_fkey'`,
    apply: `ALTER TABLE rewards ADD CONSTRAINT rewards_submission_id_fkey
            FOREIGN KEY (submission_id) REFERENCES plastic_submissions(id) ON DELETE CASCADE`,
  },
  {
    check: `SELECT 1 FROM information_schema.columns
            WHERE table_name='plastic_submissions' AND column_name='updated_at'`,
    apply: `ALTER TABLE plastic_submissions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()`,
  },
  {
    check: `SELECT 1 FROM information_schema.columns
            WHERE table_name='rewards' AND column_name='updated_at'`,
    apply: `ALTER TABLE rewards ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()`,
  },
];

async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);

    for (const m of MIGRATIONS) {
      const { rows } = await client.query(m.check);
      if (rows.length === 0) {
        await client.query(m.apply);
      }
    }

    console.log('[postgres] Schema ready.');
  } finally {
    client.release();
  }
}

const query = (text, params) => pool.query(text, params);

module.exports = { query, pool, initSchema };
