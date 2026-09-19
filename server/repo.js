/* Data access for health entries.
 *
 * Every statement is scoped by userId — ownership is enforced here, at the data
 * layer, so a route that forgets to check cannot leak another person's record.
 */

import { getDb, transaction } from './db.js';
import { uid, nowISO, notFound } from './util.js';
import { validateEntry } from './validate.js';

const toEntry = (row) =>
  row && {
    id: row.id,
    type: row.type,
    startDate: row.startDate,
    endDate: row.endDate,
    data: JSON.parse(row.data),
    context: JSON.parse(row.context),
    tags: JSON.parse(row.tags),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };

export function listEntries(userId, type) {
  const db = getDb();
  const rows = type
    ? db.prepare('SELECT * FROM health_entries WHERE userId = ? AND type = ? ORDER BY startDate, createdAt').all(userId, type)
    : db.prepare('SELECT * FROM health_entries WHERE userId = ? ORDER BY startDate, createdAt').all(userId);
  return rows.map(toEntry);
}

export function getEntry(userId, id) {
  return toEntry(getDb().prepare('SELECT * FROM health_entries WHERE userId = ? AND id = ?').get(userId, id)) || null;
}

function insert(userId, body, { id, createdAt } = {}) {
  const now = nowISO();
  const entry = {
    id: id || uid(),
    userId,
    ...body,
    createdAt: createdAt || now,
    updatedAt: now
  };
  getDb()
    .prepare(
      `INSERT INTO health_entries (id, userId, type, startDate, endDate, data, context, tags, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.id, userId, entry.type, entry.startDate, entry.endDate,
      JSON.stringify(entry.data), JSON.stringify(entry.context), JSON.stringify(entry.tags),
      entry.createdAt, entry.updatedAt
    );
  return getEntry(userId, entry.id);
}

export function createEntry(userId, payload) {
  const body = validateEntry(payload);
  // A client may propose its own id (it had one offline); only accept an unused one.
  const proposed = typeof payload.id === 'string' && /^[\w-]{1,64}$/.test(payload.id) ? payload.id : null;
  const free = proposed && !getDb().prepare('SELECT 1 FROM health_entries WHERE id = ?').get(proposed);
  return insert(userId, body, { id: free ? proposed : null, createdAt: payload.createdAt });
}

export function updateEntry(userId, id, payload) {
  const existing = getEntry(userId, id);
  if (!existing) throw notFound('That episode is not in your record.');

  const body = validateEntry(payload, { partial: true, existing });
  getDb()
    .prepare(
      `UPDATE health_entries
          SET type = ?, startDate = ?, endDate = ?, data = ?, context = ?, tags = ?, updatedAt = ?
        WHERE userId = ? AND id = ?`
    )
    .run(
      body.type, body.startDate, body.endDate,
      JSON.stringify(body.data), JSON.stringify(body.context), JSON.stringify(body.tags),
      nowISO(), userId, id
    );
  return getEntry(userId, id);
}

export function deleteEntry(userId, id) {
  const result = getDb().prepare('DELETE FROM health_entries WHERE userId = ? AND id = ?').run(userId, id);
  if (!result.changes) throw notFound('That episode is not in your record.');
  return true;
}

/**
 * Bulk import from a device (Phase 5). All or nothing: if any entry is rejected
 * the transaction rolls back and the account is left exactly as it was, so the
 * device copy stays the only source of truth.
 */
export function importEntries(userId, entries) {
  if (!Array.isArray(entries)) throw new TypeError('entries must be an array');

  return transaction(() => {
    const report = { imported: 0, skipped: 0, ids: [] };
    const seen = getDb().prepare('SELECT id FROM health_entries WHERE userId = ?').all(userId).map((r) => r.id);
    const existing = new Set(seen);

    entries.forEach((raw, index) => {
      // Already imported once — importing again must not duplicate the record.
      if (raw && typeof raw.id === 'string' && existing.has(raw.id)) {
        report.skipped += 1;
        return;
      }
      try {
        const saved = createEntry(userId, raw);
        report.imported += 1;
        report.ids.push(saved.id);
        existing.add(saved.id);
      } catch (err) {
        err.message = `Entry ${index + 1} (${raw?.startDate || 'no date'}): ${err.message}`;
        throw err;
      }
    });
    return report;
  });
}

export const countEntries = (userId) =>
  getDb().prepare('SELECT COUNT(*) AS n FROM health_entries WHERE userId = ?').get(userId).n;
