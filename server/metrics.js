/* Admin metrics.
 *
 * Aggregates only. Nothing in here reads symptoms, notes, treatments or any other
 * free text, and nothing is grouped down to a single named person. The queries
 * below are the whole admin surface — if a number cannot be produced by counting,
 * it does not belong here.
 */

import { all, run, count, dbStatus } from './db.js';

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const one = (sql, ...args) => count(sql, args);

export async function adminMetrics() {
  const users = {
    total: await one('SELECT COUNT(*) FROM users'),
    newLast7: await one('SELECT COUNT(*) FROM users WHERE createdAt >= ?', daysAgo(7)),
    newLast30: await one('SELECT COUNT(*) FROM users WHERE createdAt >= ?', daysAgo(30)),
    // "Active" = signed in or wrote something recently. Still just a count.
    activeLast7: await one(
      `SELECT COUNT(DISTINCT userId) FROM (
         SELECT userId FROM sessions WHERE createdAt >= ?1
         UNION SELECT userId FROM health_entries WHERE updatedAt >= ?1)`,
      daysAgo(7)
    ),
    activeLast30: await one(
      `SELECT COUNT(DISTINCT userId) FROM (
         SELECT userId FROM sessions WHERE createdAt >= ?1
         UNION SELECT userId FROM health_entries WHERE updatedAt >= ?1)`,
      daysAgo(30)
    )
  };

  const usage = {
    episodes: await one("SELECT COUNT(*) FROM health_entries WHERE type = 'malaria_episode'"),
    confirmedPositive: await one("SELECT COUNT(*) FROM health_entries WHERE json_extract(data, '$.testResult') = 'positive'"),
    tested: await one("SELECT COUNT(*) FROM health_entries WHERE json_extract(data, '$.testResult') IN ('positive','negative')"),
    withRecovery: await one("SELECT COUNT(*) FROM health_entries WHERE endDate != ''"),
    ongoing: await one("SELECT COUNT(*) FROM health_entries WHERE endDate = ''"),
    loggedLast7: await one('SELECT COUNT(*) FROM health_entries WHERE createdAt >= ?', daysAgo(7)),
    loggedLast30: await one('SELECT COUNT(*) FROM health_entries WHERE createdAt >= ?', daysAgo(30))
  };

  // Entries created per day for the last fortnight — a count and a date, nothing else.
  const daily = (await all(
    `SELECT substr(createdAt, 1, 10) AS day, COUNT(*) AS n
       FROM health_entries WHERE createdAt >= ?
      GROUP BY day ORDER BY day`,
    [daysAgo(14)]
  )).map((r) => ({ day: r.day, n: Number(r.n) }));

  const errors = (await all(
    `SELECT kind, status, COUNT(*) AS n
       FROM error_log WHERE at >= ?
      GROUP BY kind, status ORDER BY n DESC LIMIT 20`,
    [daysAgo(7)]
  )).map((r) => ({ kind: r.kind, status: Number(r.status), n: Number(r.n) }));

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
      database: await dbStatus(),
      generatedAt: new Date().toISOString()
    }
  };
}

/** Counters for the admin view. Never a request body, never a user id. */
export async function logError(route, status, kind) {
  try {
    await run('INSERT INTO error_log (at, route, status, kind) VALUES (?, ?, ?, ?)',
      [new Date().toISOString(), String(route).slice(0, 80), status, String(kind).slice(0, 60)]);
  } catch {
    /* logging must never break a request */
  }
}
