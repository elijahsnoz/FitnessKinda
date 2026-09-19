/* Shared helpers: dates, formatting, small math. No dependencies. */

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const pad = (n) => (n < 10 ? '0' + n : String(n));

/** 'YYYY-MM-DD' -> local Date. Avoids the UTC shift of `new Date(str)`. */
export function toDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayISO = () => toISO(new Date());

export function shiftISO(iso, days) {
  const d = toDate(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function daysBetween(isoA, isoB) {
  return Math.round((toDate(isoB) - toDate(isoA)) / 86400000);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = toDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Today", "Yesterday", "3 days ago" — how a person actually reads their own timeline. */
export function relativeDay(iso) {
  const n = daysBetween(iso, todayISO());
  if (n === 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n < 0) return fmtDate(iso);
  if (n < 30) return `${n} days ago`;
  if (n < 730) return `${Math.round(n / 30.4)} months ago`;
  const years = Math.round(n / 365);
  return `about ${years} year${years === 1 ? '' : 's'} ago`;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function avg(list) {
  if (!list.length) return null;
  return Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
}

/** Frequency table, most common first. */
export function countBy(items) {
  const map = new Map();
  items.forEach((k) => map.set(k, (map.get(k) || 0) + 1));
  return [...map].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
