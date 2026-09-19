/* Account state: who is signed in, whether this device's record has been taken
 * into that account, and the queue of writes waiting to reach the server.
 *
 * The device stays the working copy. Every write still lands in localStorage
 * first — that is what keeps logging instant, and what keeps the app usable with
 * no signal. The queue then pushes those writes up when there is a connection.
 */

import * as store from './store.js';
import { api, ApiError } from './api.js';

const QUEUE_KEY = 'fitnesskinda.queue.v1';
const LINK_KEY = 'fitnesskinda.account.v1';
const BACKUP_KEY = 'fitnesskinda.premigration.v1';

/* mode:
 *   'local'     — signed out. Exactly the original MVP.
 *   'migrate'   — signed in, and this device holds records the account has not seen.
 *   'account'   — signed in and in step with the account.
 */
export const state = {
  mode: 'local',
  user: null,
  pending: [],
  lastError: null,
  lastSyncAt: null,
  serverAvailable: true
};

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(state));

/* ── Queue ─────────────────────────────────────────────────────── */

function readQueue() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* storage full; the queue is best effort */ }
  state.pending = queue;
}

export const isPending = (id) => state.pending.some((job) => job.id === id);

function enqueue(op, id) {
  const queue = readQueue().filter((job) => job.id !== id);
  queue.push({ op, id, at: new Date().toISOString() });
  writeQueue(queue);
}

/* ── Link between this device and an account ───────────────────── */

const readLink = () => {
  try { return JSON.parse(localStorage.getItem(LINK_KEY) || 'null'); } catch { return null; }
};
const writeLink = (link) => {
  try { localStorage.setItem(LINK_KEY, JSON.stringify(link)); } catch { /* ignore */ }
};

/* ── Sync ──────────────────────────────────────────────────────── */

let flushing = null;

/**
 * Pushes queued writes. Stops at the first network failure and keeps the rest.
 * Only one flush runs at a time — a save and a reconnect can fire together, and
 * two loops racing over the same queue would push an entry twice.
 */
export function flush() {
  if (state.mode === 'local' || !state.user) return Promise.resolve();
  if (flushing) return flushing;
  flushing = flushOnce().finally(() => { flushing = null; });
  return flushing;
}

async function flushOnce() {

  for (const job of readQueue()) {
    try {
      if (job.op === 'remove') {
        await api.deleteEpisode(job.id);
      } else {
        const entry = store.get(job.id);
        if (!entry) { dequeue(job.id); continue; }
        try {
          await api.updateEpisode(job.id, entry);
        } catch (err) {
          if (err.status === 404) await api.createEpisode(entry);
          else throw err;
        }
      }
      dequeue(job.id);
      state.lastError = null;
    } catch (err) {
      if (err instanceof ApiError && (err.offline || err.status >= 500)) {
        state.serverAvailable = false;
        emit();
        return; // keep the job; try again when the connection is back
      }
      if (err.status === 401) { await refresh(); return; }
      /* The server refused this write outright (bad data, or an entry that is not
       * ours). Stop retrying it, keep the record on the device, and say so. */
      state.lastError = `Could not save an episode to your account: ${err.message}`;
      dequeue(job.id);
    }
  }
  state.serverAvailable = true;
  emit();
}

function dequeue(id) {
  writeQueue(readQueue().filter((job) => job.id !== id));
}

/** Replaces the device's working copy with the account's records. */
export async function hydrate() {
  const { episodes } = await api.listEpisodes();
  store.replaceAll(episodes);
  state.lastSyncAt = new Date().toISOString();
  emit();
}

/* ── Migration (Phase 5) ───────────────────────────────────────── */

/** Records on this device that the signed-in account has never seen. */
export function localOnlyEntries() {
  const link = readLink();
  if (link && state.user && link.userId === state.user.id && link.migratedAt) return [];
  return store.all();
}

/**
 * Imports this device's records into the account.
 * The device copy is never deleted: it is kept under a backup key, and only a
 * fully successful import switches this device over to the account.
 */
export async function migrate() {
  const entries = store.all();
  if (!entries.length) {
    writeLink({ userId: state.user.id, migratedAt: new Date().toISOString(), imported: 0 });
    state.mode = 'account';
    await hydrate();
    return { imported: 0, skipped: 0 };
  }

  // Keep a copy before anything leaves the device.
  try {
    localStorage.setItem(BACKUP_KEY, store.exportJSON());
  } catch { /* the import still proceeds; the record is untouched either way */ }

  const report = await api.migrate(entries); // throws → nothing imported, nothing lost

  writeLink({ userId: state.user.id, migratedAt: new Date().toISOString(), imported: report.imported });
  state.mode = 'account';
  state.lastError = null;
  await hydrate();
  return report;
}

export const backupExists = () => !!localStorage.getItem(BACKUP_KEY);
export const readBackup = () => localStorage.getItem(BACKUP_KEY);

/* ── Session ───────────────────────────────────────────────────── */

async function settle() {
  const link = readLink();
  const linked = link && link.userId === state.user.id && link.migratedAt;

  if (linked) {
    state.mode = 'account';
    await flush();
    await hydrate();
  } else if (store.isEmpty()) {
    // Nothing on this device to worry about — just take the account's records.
    writeLink({ userId: state.user.id, migratedAt: new Date().toISOString(), imported: 0 });
    state.mode = 'account';
    await hydrate();
  } else {
    // The device holds records the account has not seen. Ask; never merge silently.
    state.mode = 'migrate';
  }
  emit();
}

/** Called once at start-up. Any failure leaves the app in plain local mode. */
export async function refresh() {
  try {
    const { user } = await api.me();
    state.user = user;
    state.serverAvailable = true;
    if (!user) {
      state.mode = 'local';
      emit();
      return;
    }
    await settle();
  } catch (err) {
    state.user = null;
    state.mode = 'local';
    // No connection, or no backend at all (the app also runs as plain static files).
    state.serverAvailable = !(err instanceof ApiError && (err.offline || err.status === 404));
    emit();
  }
}

export async function signup(payload) {
  const { user } = await api.signup(payload);
  state.user = user;
  await settle();
  return user;
}

export async function login(payload) {
  const { user } = await api.login(payload);
  state.user = user;
  await settle();
  return user;
}

/** Signing out leaves the device's records alone — they are the user's copy. */
export async function logout() {
  try { await api.logout(); } catch { /* going offline is still a sign-out */ }
  state.user = null;
  state.mode = 'local';
  state.lastError = null;
  emit();
}

/* ── Wiring ────────────────────────────────────────────────────── */

export function start() {
  state.pending = readQueue();

  store.subscribe(({ op, entry }) => {
    if (state.mode !== 'account') return;
    enqueue(op === 'remove' ? 'remove' : 'upsert', entry.id);
    emit();
    flush();
  });

  window.addEventListener('online', () => { flush(); });

  return refresh();
}
