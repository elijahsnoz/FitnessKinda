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
    entries: await one('SELECT COUNT(*) FROM health_entries'),
    loggedLast7: await one('SELECT COUNT(*) FROM health_entries WHERE createdAt >= ?', daysAgo(7)),
    loggedLast30: await one('SELECT COUNT(*) FROM health_entries WHERE createdAt >= ?', daysAgo(30)),
    openEvents: await one("SELECT COUNT(*) FROM health_entries WHERE endDate = '' AND type IN ('health_event','malaria_episode','medication')"),
    confirmedPositive: await one("SELECT COUNT(*) FROM health_entries WHERE json_extract(data, '$.testResult') = 'positive'")
  };

  /* Which signals people actually use, across everybody. A count per kind, never
   * per person: how one individual's record is shaped says things about them. */
  const byType = (await all(
    'SELECT type, COUNT(*) AS n FROM health_entries GROUP BY type ORDER BY n DESC'
  )).map((r) => ({ type: r.type, n: Number(r.n) }));

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
    byType,
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

/**
 * The registered people, as account metadata only.
 *
 * Deliberately no health content: not a symptom, not a note, not a measurement,
 * and no per-signal breakdown either, because the shape of someone's record says
 * things about them. An entry count and a last-active date are enough to run the
 * product and answer a support question.
 */
export async function adminUsers({ limit = 200 } = {}) {
  const rows = await all(
    `SELECT u.id, u.email, u.name, u.role, u.createdAt, u.emailVerifiedAt, u.termsAcceptedAt,
            (SELECT COUNT(*) FROM health_entries e WHERE e.userId = u.id) AS entries,
            (SELECT MAX(e.updatedAt) FROM health_entries e WHERE e.userId = u.id) AS lastEntryAt,
            (SELECT MAX(s.createdAt) FROM sessions s WHERE s.userId = u.id) AS lastSignInAt
       FROM users u
      ORDER BY u.createdAt DESC
      LIMIT ?`,
    [limit]
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    joinedAt: r.createdAt,
    emailVerified: Boolean(r.emailVerifiedAt),
    acceptedTerms: Boolean(r.termsAcceptedAt),
    entries: Number(r.entries || 0),
    lastActiveAt: [r.lastEntryAt, r.lastSignInAt].filter(Boolean).sort().pop() || null
  }));
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
