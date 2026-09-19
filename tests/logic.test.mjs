/* The original MVP logic suite: the entry envelope, the malaria domain,
 * analytics, charts and the doctor summary — all running without a browser. */

import { suite, fakeLocalStorage } from './harness.mjs';

export default async function run() {
  const { ok, results } = suite('logic');
  fakeLocalStorage();

  const store = await import('../js/store.js');
  const { default: malaria, derive } = await import('../js/domains/malaria.js');
  const { summaryText } = await import('../js/summary.js');
  const { barChart } = await import('../js/charts.js');
  const { monthlyBuckets, byYearDesc } = await import('../js/analytics.js');

  store.load();
  ok(store.isEmpty(), 'starts empty');
  ok(summaryText().includes('Nothing recorded yet'), 'empty summary is graceful');
  ok(malaria.insights([]).length === 0, 'no insights with no data');

  const fixtures = [
    { startDate: '2025-04-12', endDate: '2025-04-18', testResult: 'positive', testType: 'RDT', symptoms: ['Fever', 'Chills'], treatment: 'ACT', notes: 'rainy week' },
    { startDate: '2025-09-02', endDate: '2025-09-09', testResult: 'negative', testType: 'Microscopy', symptoms: ['Headache'], treatment: '', notes: '' },
    { startDate: '2026-01-20', endDate: '', testResult: 'not_tested', testType: 'RDT', symptoms: ['Fever', 'Fatigue', 'Nausea', 'Cough'], treatment: 'rest', notes: '' }
  ];
  fixtures.forEach((f) => store.upsert(store.makeEntry(malaria.type, malaria.fromValues(f))));

  ok(store.all().length === 3, 'three entries saved');
  ok(store.all(malaria.type).length === 3, 'entries can be scoped by type');
  ok(store.all()[0].startDate === '2025-04-12', 'entries sort oldest first');
  ok(store.all()[0].data.testType === 'RDT' && store.all()[2].data.testType === '', 'test type is cleared when not tested');
  ok('context' in store.all()[0] && 'tags' in store.all()[0], 'the envelope carries slots for future signals');

  const d = derive(store.all(malaria.type));
  ok(d.total === 3 && d.positives === 1 && d.tested === 2 && d.untested === 1, 'counts are right');
  ok(d.gaps.length === 2 && d.gaps[0] === 143, `gap Apr→Sep is 143 days (got ${d.gaps[0]})`);
  ok(d.durations.join() === '6,7' && d.avgDuration === 6.5, 'durations and their average are right');
  ok(d.ongoing === 1, 'one episode is still open');

  const insights = malaria.insights(store.all(malaria.type));
  ok(insights.some((i) => i.includes('1 of 2 recorded tests')), 'positivity is stated from the data');
  ok(!/diagnos|you (have|may have)|take |dose|prescrib/i.test(insights.join(' ')), 'no diagnosis or medication language');

  const charts = malaria.charts(store.all(malaria.type));
  ok(charts.length === 3, 'three charts once there is enough data');
  ok(monthlyBuckets(store.all()).length === 10, 'monthly buckets span the whole range');
  ok(byYearDesc(store.all())[0].year === 2026, 'the timeline groups the newest year first');
  const svg = barChart(charts[0].data);
  ok(svg.startsWith('<svg') && svg.includes('</svg>'), 'charts render as svg');

  const text = summaryText();
  ['PERSONAL HEALTH SUMMARY', 'MALARIA EPISODES', 'OVERVIEW', 'Started 20 Jan 2026'].forEach((s) =>
    ok(text.includes(s), `summary contains "${s}"`));
  ok(/does not diagnose any condition and does not recommend any medication/.test(text.replace(/\s+/g, ' ')),
    'summary carries the disclaimer');
  const lines = text.split('\n').filter((l) => !/Symptoms:|Notes:|Treated:/.test(l));
  ok(Math.max(...lines.map((l) => l.length)) <= 48, 'summary lines fit a phone screen');

  ok(malaria.validate({ startDate: '' }) !== null, 'rejects a missing date');
  ok(malaria.validate({ startDate: '2099-01-01' }) !== null, 'rejects a future start');
  ok(malaria.validate({ startDate: '2025-04-12', endDate: '2025-04-01' }) !== null, 'rejects recovery before start');
  ok(malaria.validate({ startDate: '2025-04-12', endDate: '2025-04-18' }) === null, 'accepts a valid episode');

  const first = store.all()[0];
  store.upsert({ ...first, data: { ...first.data, treatment: 'ACT, 3 days' } });
  ok(store.all().length === 3 && store.get(first.id).data.treatment === 'ACT, 3 days', 'editing updates in place');
  ok(store.get(first.id).createdAt === first.createdAt, 'createdAt survives an edit');

  const backup = store.exportJSON();
  store.remove(first.id);
  ok(store.all().length === 2, 'delete removes one entry');
  ok(store.importJSON(backup) === 3, 'restore brings it back');
  ok(store.importJSON(JSON.stringify([{ date: '2024-03-01', recoveredDate: '2024-03-05' }])) === 1, 'a legacy flat array migrates');
  ok(store.all()[0].type === 'malaria_episode' && store.all()[0].endDate === '2024-03-05', 'legacy entries normalise into the envelope');

  store.importJSON(backup);
  store.load();
  ok(store.all().length === 3, 'the record survives a reload');

  const ongoing = store.all().find((e) => !e.endDate);
  ok(malaria.quickActions(ongoing).length === 1, 'an open episode offers one quick action');
  ok(malaria.quickActions(store.all().find((e) => e.endDate)).length === 0, 'a closed episode offers none');
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  ok(malaria.applyAction(ongoing, 'recover').entry.endDate === iso, '"mark recovered" sets today');
  ok(malaria.applyAction(ongoing, 'nonsense') === null, 'unknown actions are ignored');

  return results;
}
