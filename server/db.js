/* The database.
 *
 * libSQL, which is SQLite. Locally it is a file; in production it is Turso over
 * HTTP. The same client and the same SQL serve both, so nothing here changes
 * between a laptop and the deployed site.
 *
 * health_entries is the server-side twin of the entry envelope the frontend has
 * always used (see js/store.js). `data`, `context` and `tags` stay JSON so each
 * domain keeps owning its own shape — the database never learns what a malaria
 * episode is, which is what lets new signals arrive later.
 */

import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

let db = null;

/* ── Migrations ───────────────────────────────────────────────────
 * Append only. Each runs once, as one batch (so it is all-or-nothing), and is
 * recorded in schema_migrations. Never edit a migration that has been applied.
 */
const MIGRATIONS = [
  {
    id: '001-initial',
    statements: [
      `CREATE TABLE users (
         id            TEXT PRIMARY KEY,
         email         TEXT NOT NULL UNIQUE,
         name          TEXT NOT NULL,
         passwordHash  TEXT NOT NULL,
         role          TEXT NOT NULL DEFAULT 'user',
         createdAt     TEXT NOT NULL,
         updatedAt     TEXT NOT NULL
       )`,
      `CREATE TABLE health_entries (
         id         TEXT PRIMARY KEY,
         userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         type       TEXT NOT NULL,
         startDate  TEXT NOT NULL,
         endDate    TEXT NOT NULL DEFAULT '',
         data       TEXT NOT NULL DEFAULT '{}',
         context    TEXT NOT NULL DEFAULT '{}',
         tags       TEXT NOT NULL DEFAULT '[]',
         createdAt  TEXT NOT NULL,
         updatedAt  TEXT NOT NULL
       )`,
      `CREATE INDEX idx_entries_user_date ON health_entries (userId, startDate)`,
      `CREATE INDEX idx_entries_user_type ON health_entries (userId, type)`,
      `CREATE TABLE sessions (
         tokenHash  TEXT PRIMARY KEY,
         userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         createdAt  TEXT NOT NULL,
         expiresAt  TEXT NOT NULL
       )`,
      `CREATE INDEX idx_sessions_user ON sessions (userId)`,
      /* Counters only. No user ids, no request bodies, nothing about what anybody
       * recorded — see server/metrics.js. */
      `CREATE TABLE error_log (
         id      INTEGER PRIMARY KEY AUTOINCREMENT,
         at      TEXT NOT NULL,
         route   TEXT NOT NULL,
         status  INTEGER NOT NULL,
         kind    TEXT NOT NULL
       )`
    ]
  },
  {
    id: '002-verification-and-terms',
    statements: [
      /* An unverified account is a working account. Verification exists so a
       * password reset has a trustworthy address to send to, not as a gate. */
      `ALTER TABLE users ADD COLUMN emailVerifiedAt TEXT`,
      `ALTER TABLE users ADD COLUMN termsAcceptedAt TEXT`,
      `ALTER TABLE users ADD COLUMN termsVersion TEXT`,
      `CREATE TABLE email_tokens (
         tokenHash  TEXT PRIMARY KEY,
         userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         purpose    TEXT NOT NULL,
         createdAt  TEXT NOT NULL,
         expiresAt  TEXT NOT NULL,
         usedAt     TEXT
       )`,
      `CREATE INDEX idx_email_tokens_user ON email_tokens (userId, purpose)`
    ]
  }
];

/** Resolves where the database lives: Turso if configured, otherwise a local file. */
export function databaseUrl(override) {
  if (override) return { url: override };
  if (config.database.url) {
    return { url: config.database.url, authToken: config.database.authToken || undefined };
  }
  mkdirSync(config.dataDir, { recursive: true });
  return { url: `file:${join(config.dataDir, 'fitnesskinda.db')}` };
}

export async function openDatabase(override) {
  db = createClient(databaseUrl(override));

  await db.execute(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, appliedAt TEXT NOT NULL)'
  );

  const applied = new Set((await db.execute('SELECT id FROM schema_migrations')).rows.map((r) => r.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await db.batch(
      [
        ...migration.statements,
        { sql: 'INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)', args: [migration.id, new Date().toISOString()] }
      ],
      'write'
    );
  }
  return db;
}

export function getDb() {
  if (!db) throw new Error('openDatabase() must be awaited before the database is used');
  return db;
}

export function closeDatabase() {
  if (db) { try { db.close(); } catch { /* already gone */ } db = null; }
}

/* ── Query helpers ────────────────────────────────────────────────
 * Every call is parameterised. No statement in this codebase is built by
 * concatenating a value into SQL.
 */

export async function all(sql, args = []) {
  return (await getDb().execute({ sql, args })).rows;
}

export async function get(sql, args = []) {
  return (await getDb().execute({ sql, args })).rows[0] ?? null;
}

export async function run(sql, args = []) {
  const result = await getDb().execute({ sql, args });
  return { changes: Number(result.rowsAffected || 0) };
}

/** First column of the first row, as a number. Counts come back as BigInt. */
export async function count(sql, args = []) {
  const row = await get(sql, args);
  return row ? Number(Object.values(row)[0]) : 0;
}

/** Runs fn inside a write transaction; any throw rolls the whole thing back. */
export async function transaction(fn) {
  const tx = await getDb().transaction('write');
  try {
    const result = await fn({
      all: async (sql, args = []) => (await tx.execute({ sql, args })).rows,
      get: async (sql, args = []) => (await tx.execute({ sql, args })).rows[0] ?? null,
      run: async (sql, args = []) => ({ changes: Number((await tx.execute({ sql, args })).rowsAffected || 0) })
    });
    await tx.commit();
    return result;
  } catch (err) {
    try { await tx.rollback(); } catch { /* already rolled back */ }
    throw err;
  }
}

export async function dbStatus() {
  try {
    const migrations = await count('SELECT COUNT(*) FROM schema_migrations');
    const integrity = await get('PRAGMA integrity_check');
    return {
      ok: integrity ? Object.values(integrity)[0] === 'ok' : true,
      migrations,
      driver: config.database.url ? 'turso' : 'local file'
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
