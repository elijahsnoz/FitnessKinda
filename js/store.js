/* The health record.
 *
 * FitnessKinda stores one thing: a time-ordered list of ENTRIES. An entry is the
 * atomic unit of a person's health memory, and every signal the product will ever
 * track — a malaria episode today, a night of sleep or a hydration log later —
 * uses the same envelope and differs only in `type` and `data`.
 *
 *   {
 *     id,                        // stable local id
 *     type: 'malaria_episode',   // which domain owns this entry (see registry.js)
 *     startDate: 'YYYY-MM-DD',   // every entry is anchored in time — this is what the
 *     endDate:   'YYYY-MM-DD'|'',//   timeline, the trends and the correlations run on
 *     data:    { ... },          // domain-specific fields, owned by the domain module
 *     context: { ... },          // cross-domain signals observed around this entry
 *                                //   (sleep, hydration, exercise, food, exposure …)
 *     tags:    [ ... ],
 *     createdAt, updatedAt
 *   }
 *
 * Nothing outside a domain module reads `data`. That is what lets a new signal be
 * added by writing one module and registering it, without touching the store, the
 * timeline, the summary or the charts.
 */

import { todayISO, uid } from './util.js';

const KEY = 'fitnesskinda.record.v1';
export const SCHEMA_VERSION = 1;

let record = emptyRecord();

function emptyRecord() {
  return { app: 'fitnesskinda', schema: SCHEMA_VERSION, created: todayISO(), entries: [] };
}

/* ── Entry envelope ───────────────────────────────────────────── */

export function makeEntry(type, { id, startDate, endDate = '', data = {}, context = {}, tags = [] } = {}) {
  const now = new Date().toISOString();
  return {
    id: id || uid(),
    type,
    startDate,
    endDate,
    data,
    context,
    tags,
    createdAt: now,
    updatedAt: now
  };
}

/** Tolerates anything: partial entries, an older shape, a hand-edited backup. */
function normalise(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const startDate = raw.startDate || raw.date;
  if (!startDate) return null;
  return {
    id: raw.id || uid(),
    type: raw.type || 'malaria_episode',
    startDate,
    endDate: raw.endDate || raw.recoveredDate || '',
    data: raw.data && typeof raw.data === 'object' ? raw.data : {},
    context: raw.context && typeof raw.context === 'object' ? raw.context : {},
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString()
  };
}

/** Future schema bumps land here; today it only fills in missing pieces. */
function migrate(raw) {
  if (Array.isArray(raw)) raw = { entries: raw };
  if (!raw || typeof raw !== 'object') return emptyRecord();
  return {
    app: 'fitnesskinda',
    schema: SCHEMA_VERSION,
    created: raw.created || todayISO(),
    entries: (raw.entries || []).map(normalise).filter(Boolean)
  };
}

/* ── Persistence ──────────────────────────────────────────────── */

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    record = migrate(raw ? JSON.parse(raw) : null);
  } catch {
    record = emptyRecord();
  }
  sort();
  return record;
}

export function save() {
  sort();
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function sort() {
  record.entries.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
}

/* ── Change notifications ─────────────────────────────────────────
 * Lets the account layer mirror local writes up to the server. Nothing
 * subscribes when the app runs signed out, so behaviour is unchanged.
 */

const subscribers = new Set();

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

const notify = (op, entry) => subscribers.forEach((fn) => fn({ op, entry }));

/* ── Reads ────────────────────────────────────────────────────── */

/** Oldest first. Pass a type to scope it to one signal. */
export const all = (type) => (type ? record.entries.filter((e) => e.type === type) : record.entries.slice());
export const get = (id) => record.entries.find((e) => e.id === id) || null;
export const count = (type) => all(type).length;
export const isEmpty = () => record.entries.length === 0;

/* ── Writes ───────────────────────────────────────────────────── */

export function upsert(entry) {
  const i = record.entries.findIndex((e) => e.id === entry.id);
  const existing = i > -1 ? record.entries[i] : null;
  const next = { ...entry, createdAt: existing ? existing.createdAt : entry.createdAt, updatedAt: new Date().toISOString() };
  if (existing) record.entries[i] = next; else record.entries.push(next);
  if (!save()) return null;
  notify('upsert', next);
  return next;
}

export function remove(id) {
  record.entries = record.entries.filter((e) => e.id !== id);
  const saved = save();
  if (saved) notify('remove', { id });
  return saved;
}

/**
 * Replaces the working copy wholesale — used when an account's records arrive
 * from the server. Deliberately silent: this is not a local edit to push back.
 */
export function replaceAll(entries) {
  record.entries = (Array.isArray(entries) ? entries : []).map(normalise).filter(Boolean);
  save();
  return record.entries.length;
}

/* ── Backup ───────────────────────────────────────────────────── */

export const exportJSON = () => JSON.stringify({ ...record, exported: new Date().toISOString() }, null, 2);

export function importJSON(text) {
  const next = migrate(JSON.parse(text));
  record = next;
  save();
  return record.entries.length;
}
