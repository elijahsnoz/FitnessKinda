/* Generic analysis over entries. Nothing here knows what a malaria episode is —
 * it works on the envelope (type, startDate, endDate), so every future signal
 * gets these buckets for free. */

import { toDate, MONTHS } from './util.js';

/** One bucket per calendar month spanned by the entries, gaps included. */
export function monthlyBuckets(entries) {
  if (!entries.length) return [];

  const first = toDate(entries[0].startDate);
  const last = toDate(entries[entries.length - 1].startDate);
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  const end = new Date(last.getFullYear(), last.getMonth(), 1);
  const buckets = [];

  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    buckets.push({
      year: y,
      month: m,
      entries: entries.filter((e) => {
        const d = toDate(e.startDate);
        return d.getFullYear() === y && d.getMonth() === m;
      })
    });
    cursor.setMonth(m + 1);
  }
  return buckets;
}

/** Axis labels for a set of buckets: the year shows on the first one and each January. */
export function labelBuckets(buckets) {
  return buckets.map((b, i) => ({
    ...b,
    label: MONTHS[b.month] + (i === 0 || b.month === 0 ? ` '${String(b.year).slice(2)}` : '')
  }));
}

/** Entries grouped by year, newest first — the timeline's spine. */
export function byYearDesc(entries) {
  const groups = new Map();
  [...entries].reverse().forEach((e) => {
    const y = toDate(e.startDate).getFullYear();
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(e);
  });
  return [...groups].map(([year, items]) => ({ year, entries: items }));
}
