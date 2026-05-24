const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'wastewise-data.json');
const DEFAULT = { users: [], submissions: [], verification: [], rewards: [], routes: [], _seq: { routes: 0 } };

let store = { ...DEFAULT };
if (fs.existsSync(FILE)) {
  try {
    store = { ...DEFAULT, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch (e) {
    console.warn('[db-memory] Could not load saved data:', e.message);
  }
}

function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch {}
}

async function initSchema() {
  console.log('[db-memory] In-memory store ready (no DATABASE_URL set).');
}

module.exports = { store, save, initSchema };
