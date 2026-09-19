/* Accounts and sessions.
 *
 * Passwords: scrypt with a per-user salt, compared in constant time.
 * Sessions:  an opaque random token in an HttpOnly cookie. Only the SHA-256 of
 *            the token is stored, so a stolen database does not hand over live
 *            sessions. Admin is granted by env (ADMIN_EMAILS), never in-app.
 */

import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { all, get, run, count } from './db.js';
import { config } from './config.js';
import { uid, nowISO, badRequest, unauthorised } from './util.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const COOKIE = 'fk_session';

/* ── Passwords ─────────────────────────────────────────────────── */

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: +N, r: +r, p: +p });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/* ── Users ─────────────────────────────────────────────────────── */

const publicUser = (row) =>
  row && { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.createdAt, updatedAt: row.updatedAt };

export async function createUser({ email, name, password }) {
  if (await get('SELECT 1 FROM users WHERE email = ?', [email])) {
    throw badRequest('An account with that email already exists.');
  }
  const now = nowISO();
  const user = {
    id: uid(),
    email,
    name: name || email.split('@')[0],
    passwordHash: hashPassword(password),
    role: config.adminEmails.includes(email) ? 'admin' : 'user',
    createdAt: now,
    updatedAt: now
  };
  await run(
    'INSERT INTO users (id, email, name, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [user.id, user.email, user.name, user.passwordHash, user.role, user.createdAt, user.updatedAt]
  );
  return publicUser(user);
}

export async function authenticate(email, password) {
  const row = await get('SELECT * FROM users WHERE email = ?', [String(email || '').trim().toLowerCase()]);
  // Always spend the time hashing, so a missing account is not faster than a wrong password.
  const ok = row ? verifyPassword(password, row.passwordHash) : verifyPassword(password, hashPassword('decoy'));
  if (!row || !ok) throw unauthorised('Email or password is not right.');

  // Admin membership is re-read from the environment on every login.
  const role = config.adminEmails.includes(row.email) ? 'admin' : 'user';
  if (role !== row.role) {
    await run('UPDATE users SET role = ?, updatedAt = ? WHERE id = ?', [role, nowISO(), row.id]);
    row.role = role;
  }
  return publicUser(row);
}

export const findUser = async (id) => publicUser(await get('SELECT * FROM users WHERE id = ?', [id]));

/* ── Sessions ──────────────────────────────────────────────────── */

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86400000);
  await run(
    'INSERT INTO sessions (tokenHash, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)',
    [hashToken(token), userId, nowISO(), expires.toISOString()]
  );
  return { token, expires };
}

export async function destroySession(token) {
  if (token) await run('DELETE FROM sessions WHERE tokenHash = ?', [hashToken(token)]);
}

export async function userForToken(token) {
  if (!token) return null;
  const row = await get('SELECT * FROM sessions WHERE tokenHash = ?', [hashToken(token)]);
  if (!row) return null;
  if (new Date(row.expiresAt) < new Date()) {
    await run('DELETE FROM sessions WHERE tokenHash = ?', [row.tokenHash]);
    return null;
  }
  return findUser(row.userId);
}

export async function purgeExpiredSessions() {
  return (await run('DELETE FROM sessions WHERE expiresAt < ?', [nowISO()])).changes;
}

/* ── Cookies ───────────────────────────────────────────────────── */

export function parseCookies(header = '') {
  const out = {};
  String(header)
    .split(';')
    .forEach((part) => {
      const i = part.indexOf('=');
      if (i < 0) return;
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
  return out;
}

export function sessionCookie(token, expires) {
  const bits = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expires.toUTCString()}`
  ];
  if (config.secureCookies) bits.push('Secure');
  return bits.join('; ');
}

export const clearCookie = () =>
  `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;

/* ── Brute-force brake ─────────────────────────────────────────── */

const attempts = new Map();

export function throttle(key, { limit = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.start > windowMs) {
    attempts.set(key, { start: now, n: 1 });
    return;
  }
  rec.n += 1;
  if (rec.n > limit) {
    const wait = Math.ceil((windowMs - (now - rec.start)) / 60000);
    const err = badRequest(`Too many attempts. Try again in ${wait} minute${wait === 1 ? '' : 's'}.`);
    err.status = 429;
    throw err;
  }
}

export const resetThrottle = (key) => attempts.delete(key);

/** Test-only: forget every recorded attempt. */
export const resetAllThrottles = () => attempts.clear();
