const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      console.warn('[PG] DATABASE_URL non défini — la config ne sera pas persistée en base.');
      return null;
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    pool.on('error', (err) => console.error('[PG] Erreur pool :', err.message));
  }
  return pool;
}

async function query(sql, params = []) {
  const p = getPool();
  if (!p) return { rows: [] };
  const client = await p.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function init() {
  const p = getPool();
  if (!p) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS guild_config (
        id        SERIAL PRIMARY KEY,
        guild_id  TEXT    NOT NULL,
        key       TEXT    NOT NULL,
        value     TEXT,
        updated_at BIGINT,
        UNIQUE(guild_id, key)
      );
    `);
    console.log('[PG] Table guild_config prête.');
  } catch (err) {
    console.error('[PG] Erreur init :', err.message);
  }
}

module.exports = { query, init, getPool };
