/* SQLite, through Node's built-in driver. No ORM, no dependencies.
 *
 * The health_entries table is the server-side twin of the entry envelope the
 * frontend has always used (see js/store.js). `data`, `context` and `tags` stay
 * JSON so each domain keeps owning its own shape — the database never learns what
 * a malaria episode is, which is exactly what lets new signals arrive later.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

let db;

/* ── Migrations ───────────────────────────────────────────────────
 * Append only. Each runs once, in order, recorded in schema_migrations.
 */
const MIGRATIONS = [
  {
    id: '001-initial',
    sql: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        name          TEXT NOT NULL,
        passwordHash  TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user',
        createdAt     TEXT NOT NULL,
        updatedAt     TEXT NOT NULL
      );

      CREATE TABLE health_entries (
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
      );

      CREATE INDEX idx_entries_user_date ON health_entries (userId, startDate);
      CREATE INDEX idx_entries_user_type ON health_entries (userId, type);

      CREATE TABLE sessions (
        tokenHash  TEXT PRIMARY KEY,
        userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        createdAt  TEXT NOT NULL,
        expiresAt  TEXT NOT NULL
      );

      CREATE INDEX idx_sessions_user ON sessions (userId);

      /* Counters only. No user ids, no paths with data in them, nothing about
       * what anybody recorded — see server/metrics.js. */
      CREATE TABLE error_log (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        at        TEXT NOT NULL,
        route     TEXT NOT NULL,
        status    INTEGER NOT NULL,
        kind      TEXT NOT NULL
      );
    `
  }
];

export function openDatabase(file) {
  mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(file || join(config.dataDir, 'fitnesskinda.db'));

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, appliedAt TEXT NOT NULL)');

  const done = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)').run(m.id, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${m.id} failed: ${err.message}`);
    }
  }
  return db;
}

export function getDb() {
  if (!db) openDatabase();
  return db;
}

export function closeDatabase() {
  if (db) { db.close(); db = null; }
}

/** Runs fn inside a transaction; any throw rolls the whole thing back. */
export function transaction(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const result = fn(d);
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

export function dbStatus() {
  try {
    const d = getDb();
    const integrity = d.prepare('PRAGMA integrity_check').get();
    return {
      ok: Object.values(integrity)[0] === 'ok',
      migrations: d.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n,
      journalMode: Object.values(d.prepare('PRAGMA journal_mode').get())[0]
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
