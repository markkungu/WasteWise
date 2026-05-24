/**
 * db.js — Database adapter.
 *   • DATABASE_URL set → PostgreSQL via pg Pool
 *   • Otherwise        → in-memory JSON file store (local dev)
 */

if (process.env.DATABASE_URL) {
  module.exports = require('./db-postgres');
} else {
  module.exports = require('./db-memory');
}
