"use strict";

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DB_URL,
  // Keep a small pool; tune for production workloads
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[database] Unexpected pool error:", err.message);
});

/**
 * Execute a parameterised SQL query.
 *
 * @param {string} text   - SQL statement with $1, $2 … placeholders
 * @param {Array}  params - Parameter values
 * @returns {Promise<import("pg").QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

/**
 * Verify the database connection at startup.
 * Throws if the database is unreachable.
 */
const testConnection = async () => {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("[database] Connection established successfully.");
  } finally {
    client.release();
  }
};

module.exports = { query, testConnection, pool };
