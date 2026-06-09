const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'wastewise-data.json');
const TMP  = FILE + '.tmp';
const DEFAULT = { users: [], submissions: [], verification: [], rewards: [], routes: [], _seq: { routes: 0 } };

let store = { ...DEFAULT };
if (fs.existsSync(FILE)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // Merge so any new top-level keys added to DEFAULT appear in loaded store
    store = { ...DEFAULT, ...parsed };
  } catch (e) {
    console.warn('[db-memory] Could not load saved data — starting fresh:', e.message);
  }
}

function save() {
  try {
    // Atomic write: write to .tmp then rename so a crash mid-write never corrupts the file
    fs.writeFileSync(TMP, JSON.stringify(store, null, 2));
    fs.renameSync(TMP, FILE);
  } catch (e) {
    console.error('[db-memory] Save failed:', e.message);
  }
}

async function initSchema() {
  console.log('[db-memory] In-memory store ready (no DATABASE_URL set).');
}

module.exports = { store, save, initSchema };
