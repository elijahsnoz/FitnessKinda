/* Kinda Insights.
 *
 * Observations, not conclusions. Every line here is arithmetic on what the person
 * recorded: counts, averages, spans, and comparisons between two equal windows of
 * time. Nothing infers a cause, and nothing connects two different signals — "you
 * sleep badly when you exercise less" is a claim this product has no standing to
 * make, however tempting the data looks.
 *
 * An observation carries a `tone` so the interface can be quiet about it:
 *   calm    — a plain fact about the record
 *   good    — something moved in a direction most people would welcome
 *   notice  — worth a second look, never an alarm
 */

import { daysBetween, todayISO, plural, toDate, fmtDate } from './util.js';
import { byType } from './registry.js';

const within = (entries, days) => {
  const today = todayISO();
  return entries.filter((e) => daysBetween(e.startDate, today) <= days && daysBetween(e.startDate, today) >= 0);
};
const between = (entries, from, to) => {
  const today = todayISO();
  return entries.filter((e) => {
    const age = daysBetween(e.startDate, today);
    return age > from && age <= to;
  });
};

const num = (e, key) => Number(e.data?.[key]) || 0;
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** @returns {{text: string, tone: string}[]} at most `limit`, most useful first. */
export function observations(all, { limit = 3 } = {}) {
  if (!all.length) return [];
  const out = [];
  const of = (type) => all.filter((e) => e.type === type);

  /* Movement, this month against last. A comparison of two equal windows is the
   * only kind of trend claim that survives having very little data. */
  const move = of('movement');
  if (move.length >= 3) {
    const now = within(move, 30).length;
    const before = between(move, 30, 60).length;
    if (before && now > before) out.push({ text: `You recorded more movement this month than last — ${now} against ${before}.`, tone: 'good' });
    else if (before && now < before) out.push({ text: `You recorded less movement this month than last — ${now} against ${before}.`, tone: 'calm' });
    else out.push({ text: `${plural(now, 'movement record')} in the last 30 days.`, tone: 'calm' });
  }

  /* Sleep: an average, and how steady it has been. Spread says more than a mean. */
  const sleep = of('sleep').filter((e) => num(e, 'hours') > 0);
  if (sleep.length >= 3) {
    const hours = sleep.map((e) => num(e, 'hours'));
    const mean = avg(hours);
    const spread = Math.round((Math.max(...hours) - Math.min(...hours)) * 10) / 10;
    out.push({
      text: spread <= 1.5
        ? `Your sleep has been fairly consistent — around ${mean} hours across ${plural(sleep.length, 'recorded night')}.`
        : `Your recorded sleep ranges from ${Math.min(...hours)} to ${Math.max(...hours)} hours, averaging ${mean}.`,
      tone: 'calm'
    });
    const poor = within(of('sleep'), 7).filter((e) => e.data.quality === 'poor').length;
    if (poor >= 2) out.push({ text: `You've recorded poor sleep ${plural(poor, 'time')} in the last week.`, tone: 'notice' });
  }

  /* Health events, and how long since the last one. */
  const health = [...of('health_event'), ...of('malaria_episode')]
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  if (health.length) {
    const last = health[health.length - 1];
    const since = daysBetween(last.startDate, todayISO());
    const recent = within(health, 30).length;
    if (recent >= 2) out.push({ text: `${plural(recent, 'health event')} recorded in the last 30 days.`, tone: 'notice' });
    else if (since > 30) out.push({ text: `No health event recorded since ${fmtDate(last.startDate)} — ${plural(since, 'day')} ago.`, tone: 'good' });
  }

  /* Measurements that repeat are the ones worth watching; say so without reading them. */
  const measures = of('measurement');
  const kinds = {};
  measures.forEach((e) => { const k = e.data.kind; if (k) kinds[k] = (kinds[k] || 0) + 1; });
  const repeated = Object.entries(kinds).filter(([, n]) => n >= 3).map(([k]) => k.toLowerCase());
  if (repeated.length) out.push({ text: `You've recorded ${repeated.join(' and ')} often enough to see a trend.`, tone: 'calm' });

  /* How much of a memory this has become. */
  if (out.length < limit) {
    const sorted = [...all].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    const span = daysBetween(sorted[0].startDate, todayISO());
    if (span >= 45) {
      const months = Math.round(span / 30.4);
      out.push({ text: `Your record now covers ${plural(months, 'month')} and ${plural(all.length, 'entry').replace('entrys', 'entries')}.`, tone: 'calm' });
    }
  }

  return out.slice(0, limit);
}

/** A one-line snapshot for Home: the most recent value of a few signals. */
export function snapshot(all) {
  const latest = (type) => {
    const list = all.filter((e) => e.type === type).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    return list[list.length - 1] || null;
  };

  const items = [];
  const sleep = latest('sleep');
  if (sleep && sleep.data.hours) items.push({ label: 'Sleep', value: `${sleep.data.hours}h`, when: sleep.startDate });

  const move = latest('movement');
  if (move) items.push({
    label: 'Movement',
    value: move.data.minutes ? `${move.data.minutes} min` : (move.data.activity || []).join(', ') || 'Recorded',
    when: move.startDate
  });

  const measure = latest('measurement');
  if (measure && measure.data.value) items.push({ label: measure.data.kind || 'Measurement', value: measure.data.value, when: measure.startDate });

  const open = all.filter((e) => !e.endDate && (e.type === 'health_event' || e.type === 'malaria_episode'))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  if (open.length) {
    const e = open[open.length - 1];
    const d = byType(e.type);
    items.push({ label: 'Open', value: d ? d.subtitle(e) || d.label : 'Health event', when: e.startDate, tone: 'notice' });
  }

  return items.slice(0, 4);
}
