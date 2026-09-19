/* Data access for health entries.
 *
 * Every statement is scoped by userId — ownership is enforced here, at the data
 * layer, so a route that forgets to check cannot leak another person's record.
 *
 * Functions take a query interface `q` so the same code runs against the normal
 * connection or inside a transaction. That matters: the bulk import must do its
 * inserts through the transaction, or a failure would leave half a record behind.
 */

import { all, get, run, count as countQuery, transaction } from './db.js';
import { uid, nowISO, notFound } from './util.js';
import { validateEntry } from './validate.js';

/** The plain, non-transactional query interface. */
const conn = { all, get, run };

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

export async function listEntries(userId, type) {
  const rows = type
    ? await conn.all('SELECT * FROM health_entries WHERE userId = ? AND type = ? ORDER BY startDate, createdAt', [userId, type])
    : await conn.all('SELECT * FROM health_entries WHERE userId = ? ORDER BY startDate, createdAt', [userId]);
  return rows.map(toEntry);
}

async function readEntry(q, userId, id) {
  return toEntry(await q.get('SELECT * FROM health_entries WHERE userId = ? AND id = ?', [userId, id])) || null;
}

export const getEntry = (userId, id) => readEntry(conn, userId, id);

async function insertEntry(q, userId, payload) {
  const body = validateEntry(payload);

  // A client may propose its own id (it had one offline); only accept an unused one.
  const proposed = typeof payload.id === 'string' && /^[\w-]{1,64}$/.test(payload.id) ? payload.id : null;
  const taken = proposed ? await q.get('SELECT 1 FROM health_entries WHERE id = ?', [proposed]) : null;
  const id = proposed && !taken ? proposed : uid();

  const now = nowISO();
  await q.run(
    `INSERT INTO health_entries (id, userId, type, startDate, endDate, data, context, tags, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, userId, body.type, body.startDate, body.endDate,
      JSON.stringify(body.data), JSON.stringify(body.context), JSON.stringify(body.tags),
      typeof payload.createdAt === 'string' ? payload.createdAt : now, now
    ]
  );
  return id;
}

export async function createEntry(userId, payload) {
  const id = await insertEntry(conn, userId, payload);
  return readEntry(conn, userId, id);
}

export async function updateEntry(userId, id, payload) {
  const existing = await readEntry(conn, userId, id);
  if (!existing) throw notFound('That episode is not in your record.');

  const body = validateEntry(payload, { partial: true, existing });
  await conn.run(
    `UPDATE health_entries
        SET type = ?, startDate = ?, endDate = ?, data = ?, context = ?, tags = ?, updatedAt = ?
      WHERE userId = ? AND id = ?`,
    [
      body.type, body.startDate, body.endDate,
      JSON.stringify(body.data), JSON.stringify(body.context), JSON.stringify(body.tags),
      nowISO(), userId, id
    ]
  );
  return readEntry(conn, userId, id);
}

export async function deleteEntry(userId, id) {
  const result = await conn.run('DELETE FROM health_entries WHERE userId = ? AND id = ?', [userId, id]);
  if (!result.changes) throw notFound('That episode is not in your record.');
  return true;
}

/**
 * Bulk import from a device (Phase 5). All or nothing: if any entry is rejected
 * the transaction rolls back and the account is left exactly as it was, so the
 * device copy stays the only source of truth.
 */
export async function importEntries(userId, entries) {
  if (!Array.isArray(entries)) throw new TypeError('entries must be an array');

  return transaction(async (tx) => {
    const report = { imported: 0, skipped: 0, ids: [] };
    const seen = await tx.all('SELECT id FROM health_entries WHERE userId = ?', [userId]);
    const existing = new Set(seen.map((r) => r.id));

    for (const [index, raw] of entries.entries()) {
      // Already imported once — importing again must not duplicate the record.
      if (raw && typeof raw.id === 'string' && existing.has(raw.id)) {
        report.skipped += 1;
        continue;
      }
      try {
        const id = await insertEntry(tx, userId, raw);
        report.imported += 1;
        report.ids.push(id);
        existing.add(id);
      } catch (err) {
        err.message = `Entry ${index + 1} (${raw?.startDate || 'no date'}): ${err.message}`;
        throw err;
      }
    }
    return report;
  });
}

export const countEntries = (userId) =>
  countQuery('SELECT COUNT(*) FROM health_entries WHERE userId = ?', [userId]);
