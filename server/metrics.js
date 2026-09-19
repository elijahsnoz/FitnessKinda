/* Admin metrics.
 *
 * Aggregates only. Nothing in here reads symptoms, notes, treatments or any other
 * free text, and nothing is grouped down to a single named person. The queries
 * below are the whole admin surface — if a number cannot be produced by counting,
 * it does not belong here.
 */

import { getDb, dbStatus } from './db.js';

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const one = (sql, ...args) => Object.values(getDb().prepare(sql).get(...args))[0];

export function adminMetrics() {
  const db = getDb();

  const users = {
    total: one('SELECT COUNT(*) FROM users'),
    newLast7: one('SELECT COUNT(*) FROM users WHERE createdAt >= ?', daysAgo(7)),
    newLast30: one('SELECT COUNT(*) FROM users WHERE createdAt >= ?', daysAgo(30)),
    // "Active" = signed in or wrote something recently. Still just a count.
    activeLast7: one(
      `SELECT COUNT(DISTINCT userId) FROM (
         SELECT userId FROM sessions WHERE createdAt >= ?1
         UNION SELECT userId FROM health_entries WHERE updatedAt >= ?1)`,
      daysAgo(7)
    ),
    activeLast30: one(
      `SELECT COUNT(DISTINCT userId) FROM (
         SELECT userId FROM sessions WHERE createdAt >= ?1
         UNION SELECT userId FROM health_entries WHERE updatedAt >= ?1)`,
      daysAgo(30)
    )
  };

  const usage = {
    episodes: one("SELECT COUNT(*) FROM health_entries WHERE type = 'malaria_episode'"),
    confirmedPositive: one("SELECT COUNT(*) FROM health_entries WHERE json_extract(data, '$.testResult') = 'positive'"),
    tested: one("SELECT COUNT(*) FROM health_entries WHERE json_extract(data, '$.testResult') IN ('positive','negative')"),
    withRecovery: one("SELECT COUNT(*) FROM health_entries WHERE endDate != ''"),
    ongoing: one("SELECT COUNT(*) FROM health_entries WHERE endDate = ''"),
    loggedLast7: one('SELECT COUNT(*) FROM health_entries WHERE createdAt >= ?', daysAgo(7)),
    loggedLast30: one('SELECT COUNT(*) FROM health_entries WHERE createdAt >= ?', daysAgo(30))
  };

  // Entries created per day for the last fortnight — a count and a date, nothing else.
  const daily = db
    .prepare(
      `SELECT substr(createdAt, 1, 10) AS day, COUNT(*) AS n
         FROM health_entries WHERE createdAt >= ?
        GROUP BY day ORDER BY day`
    )
    .all(daysAgo(14));

  const errors = db
    .prepare(
      `SELECT kind, status, COUNT(*) AS n
         FROM error_log WHERE at >= ?
        GROUP BY kind, status ORDER BY n DESC LIMIT 20`
    )
    .all(daysAgo(7));

  return {
    users,
    usage,
    daily,
    errors,
    system: {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      database: dbStatus(),
      generatedAt: new Date().toISOString()
    }
  };
}

/** Counters for the admin view. Never a request body, never a user id. */
export function logError(route, status, kind) {
  try {
    getDb()
      .prepare('INSERT INTO error_log (at, route, status, kind) VALUES (?, ?, ?, ?)')
      .run(new Date().toISOString(), String(route).slice(0, 80), status, String(kind).slice(0, 60));
  } catch {
    /* logging must never break a request */
  }
}
