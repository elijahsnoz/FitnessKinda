/* Malaria episodes — the first signal FitnessKinda tracks.
 *
 * This module owns everything malaria-specific: the fields, how an entry reads
 * back as a card, what it contributes to trends and to the doctor summary. The
 * rest of the app knows none of it. Adding sleep or hydration later means writing
 * a sibling of this file and registering it — not changing the app.
 */

import { daysBetween, fmtDate, plural, avg, countBy, MONTHS, toDate, todayISO } from '../util.js';
import { monthlyBuckets, labelBuckets } from '../analytics.js';

export const TYPE = 'malaria_episode';

const RESULTS = [
  { value: 'not_tested', label: 'Not tested' },
  { value: 'positive', label: 'Positive' },
  { value: 'negative', label: 'Negative' }
];

const RESULT_LABEL = Object.fromEntries(RESULTS.map((r) => [r.value, r.label]));

const SYMPTOMS = [
  'Fever', 'Chills', 'Headache', 'Body aches', 'Fatigue', 'Sweating',
  'Nausea', 'Vomiting', 'Diarrhoea', 'Loss of appetite', 'Dizziness', 'Cough'
];

/* ── Fields ───────────────────────────────────────────────────── */

const fields = [
  {
    key: 'startDate', scope: 'envelope', type: 'date',
    label: 'Date symptoms started', required: true, quickDates: true
  },
  {
    key: 'symptoms', type: 'chips', options: SYMPTOMS,
    label: 'Symptoms', placeholder: 'Other symptoms (comma separated)'
  },
  {
    key: 'testResult', type: 'choice', options: RESULTS, label: 'Malaria test result'
  },
  {
    key: 'testType', type: 'select', label: 'Test type',
    options: [
      { value: 'RDT', label: 'Rapid test (RDT)' },
      { value: 'Microscopy', label: 'Microscopy / blood smear' },
      { value: 'PCR', label: 'PCR' },
      { value: 'Other', label: 'Other' }
    ],
    showIf: (v) => v.testResult && v.testResult !== 'not_tested'
  },
  {
    key: 'treatment', type: 'textarea', label: 'Treatment taken',
    placeholder: 'What you took, the dose, how long', rows: 2
  },
  {
    key: 'endDate', scope: 'envelope', type: 'date',
    label: 'Date recovered', hint: 'Leave blank if this episode is still ongoing.'
  },
  {
    key: 'notes', type: 'textarea', label: 'Notes', rows: 3,
    placeholder: 'Travel, weather, sleep, mosquito exposure, anything you noticed'
  }
];

/* ── Entry <-> form values ────────────────────────────────────── */

function toValues(entry) {
  return {
    startDate: entry.startDate,
    endDate: entry.endDate || '',
    symptoms: entry.data.symptoms || [],
    testResult: entry.data.testResult || 'not_tested',
    testType: entry.data.testType || '',
    treatment: entry.data.treatment || '',
    notes: entry.data.notes || ''
  };
}

function fromValues(v) {
  const tested = v.testResult && v.testResult !== 'not_tested';
  return {
    startDate: v.startDate,
    endDate: v.endDate || '',
    data: {
      symptoms: v.symptoms || [],
      testResult: v.testResult || 'not_tested',
      testType: tested ? v.testType || '' : '',
      treatment: v.treatment || '',
      notes: v.notes || ''
    }
  };
}

function validate(v) {
  if (!v.startDate) return 'Please enter the date symptoms started.';
  if (v.startDate > todayISO()) return 'That start date is in the future.';
  if (v.endDate && v.endDate < v.startDate) return 'The recovery date is before the start date.';
  if (v.endDate && v.endDate > todayISO()) return 'That recovery date is in the future.';
  return null;
}

/* ── Derived numbers ──────────────────────────────────────────── */

export function derive(entries) {
  const positives = entries.filter((e) => e.data.testResult === 'positive');
  const tested = entries.filter((e) => e.data.testResult && e.data.testResult !== 'not_tested');

  const gaps = entries.slice(1).map((e, i) => daysBetween(entries[i].startDate, e.startDate));
  const durations = entries
    .filter((e) => e.endDate)
    .map((e) => daysBetween(e.startDate, e.endDate))
    .filter((d) => d >= 0);

  const last = entries.length ? entries[entries.length - 1] : null;
  const ongoing = entries.filter((e) => !e.endDate).length;

  return {
    total: entries.length,
    positives: positives.length,
    tested: tested.length,
    untested: entries.length - tested.length,
    ongoing,
    gaps,
    avgGap: avg(gaps),
    minGap: gaps.length ? Math.min(...gaps) : null,
    maxGap: gaps.length ? Math.max(...gaps) : null,
    durations,
    avgDuration: avg(durations),
    first: entries[0] || null,
    last,
    daysSinceLast: last ? daysBetween(last.startDate, todayISO()) : null
  };
}

/* ── How an entry shows up in the timeline ────────────────────── */

function badge(entry) {
  const result = entry.data.testResult || 'not_tested';
  return { label: RESULT_LABEL[result] || '-', tone: result };
}

function subtitle(entry) {
  const s = entry.data.symptoms || [];
  if (s.length > 3) return `${s.slice(0, 3).join(', ')} +${s.length - 3} more`;
  return s.join(', ');
}

/* Actions offered on the card itself. Logging usually happens while the person is
 * still ill, so closing the episode has to be one tap from the timeline — not a
 * trip through the edit form. */
function quickActions(entry) {
  return entry.endDate ? [] : [{ action: 'recover', label: 'Mark as recovered' }];
}

function applyAction(entry, action) {
  if (action !== 'recover') return null;
  return {
    entry: { ...entry, endDate: todayISO() },
    message: `Marked recovered ${fmtDate(todayISO())}`
  };
}

function rows(entry) {
  const out = [];
  const add = (label, value) => { if (value) out.push([label, value]); };

  add('Symptoms', (entry.data.symptoms || []).join(', '));
  add('Test type', entry.data.testType);
  add('Treatment', entry.data.treatment);
  add('Recovered', entry.endDate ? fmtDate(entry.endDate) : 'Ongoing');
  if (entry.endDate) add('Lasted', plural(daysBetween(entry.startDate, entry.endDate), 'day'));
  add('Notes', entry.data.notes);
  return out;
}

/* ── Trends ───────────────────────────────────────────────────── */

function metrics(entries) {
  const d = derive(entries);
  return [
    { value: d.total, label: 'Episodes logged' },
    { value: d.positives, label: 'Confirmed positive' },
    { value: d.avgGap ?? '-', label: 'Avg days between' },
    { value: d.daysSinceLast ?? '-', label: 'Days since last' }
  ];
}

/* The dashboard's headline numbers. Domain-owned, like every other view's data,
 * so the dashboard itself stays signal-agnostic. */
function overview(entries) {
  const d = derive(entries);
  const completed = entries.filter((e) => e.endDate);
  const lastCompleted = completed[completed.length - 1] || null;
  const ongoing = [...entries].reverse().find((e) => !e.endDate) || null;

  return {
    tiles: [
      { label: 'Episodes logged', value: d.total },
      { label: 'Confirmed positive', value: d.positives },
      { label: 'Avg days between', value: d.avgGap ?? '-' },
      { label: 'Days since last recovery', value: lastCompleted ? daysBetween(lastCompleted.endDate, todayISO()) : '-' }
    ],
    ongoing: ongoing
      ? { startDate: ongoing.startDate, days: daysBetween(ongoing.startDate, todayISO()), id: ongoing.id }
      : null
  };
}

function charts(entries) {
  const out = [];

  const months = labelBuckets(monthlyBuckets(entries).slice(-12));
  out.push({
    title: 'Episodes over time',
    hint: 'Episodes that started in each month. Red marks a confirmed positive test.',
    data: months.map((m) => ({
      label: m.label,
      value: m.entries.length,
      highlight: m.entries.some((e) => e.data.testResult === 'positive')
    }))
  });

  const recovered = entries.filter((e) => e.endDate);
  if (recovered.length) {
    out.push({
      title: 'Days to recover',
      hint: 'From the start of symptoms to the recovery date you entered.',
      data: recovered.map((e) => ({
        label: `${MONTHS[toDate(e.startDate).getMonth()]} ${String(toDate(e.startDate).getFullYear()).slice(2)}`,
        value: Math.max(daysBetween(e.startDate, e.endDate), 0),
        highlight: e.data.testResult === 'positive'
      }))
    });
  }

  if (entries.length >= 2) {
    out.push({
      title: 'Gap between episodes',
      hint: 'Days from the start of one episode to the start of the next.',
      data: entries.slice(1).map((e, i) => ({
        label: `${MONTHS[toDate(e.startDate).getMonth()]} ${String(toDate(e.startDate).getFullYear()).slice(2)}`,
        value: daysBetween(entries[i].startDate, e.startDate)
      }))
    });
  }

  return out;
}

/* Observations. Strictly descriptive: counts, averages and timing from what was
 * entered. Never a diagnosis, never a medication suggestion. */
function insights(entries) {
  if (!entries.length) return [];
  const d = derive(entries);
  const out = [];

  out.push(
    d.total === 1
      ? `One episode recorded, starting ${fmtDate(d.first.startDate)}.`
      : `${plural(d.total, 'episode')} recorded between ${fmtDate(d.first.startDate)} and ${fmtDate(d.last.startDate)}.`
  );

  out.push(
    d.tested
      ? `${d.positives} of ${plural(d.tested, 'recorded test')} came back positive.`
      : 'No test results recorded yet. Every episode is logged as "not tested".'
  );
  if (d.untested) out.push(`${plural(d.untested, 'episode')} had no test recorded.`);

  out.push(
    d.gaps.length
      ? `Average gap between episodes: ${plural(d.avgGap, 'day')} (shortest ${d.minGap}, longest ${d.maxGap}).`
      : 'Log a second episode to see the gap between episodes.'
  );

  if (d.durations.length) {
    out.push(`Average time to recovery: ${plural(d.avgDuration, 'day')}, across ${plural(d.durations.length, 'episode')} with a recovery date.`);
  }
  if (d.ongoing) out.push(`${plural(d.ongoing, 'episode')} ${d.ongoing === 1 ? 'has' : 'have'} no recovery date yet.`);

  const symptoms = countBy(entries.flatMap((e) => e.data.symptoms || []));
  if (symptoms.length) {
    out.push(`Most recorded symptoms: ${symptoms.slice(0, 3).map((s) => `${s.key} (${s.n}×)`).join(', ')}.`);
  }

  const treatments = countBy(entries.map((e) => (e.data.treatment || '').trim()).filter(Boolean));
  if (treatments.length && treatments[0].n > 1) {
    out.push(`"${treatments[0].key}" appears in ${plural(treatments[0].n, 'episode')}.`);
  }

  if (d.total >= 3) {
    const months = countBy(entries.map((e) => MONTHS[toDate(e.startDate).getMonth()]));
    if (months[0].n > 1) {
      const top = months.filter((m) => m.n === months[0].n).map((m) => m.key);
      out.push(`Episodes cluster in ${top.join(' and ')}, ${months[0].n} each.`);
    }
  } else {
    out.push(`With ${plural(d.total, 'episode')} recorded there is not enough history to say much about timing yet. Keep logging.`);
  }

  if (d.daysSinceLast !== null) {
    out.push(`The most recent episode started ${plural(d.daysSinceLast, 'day')} ago.`);
  }

  return out;
}

/* ── Doctor summary block ─────────────────────────────────────── */

function summary(entries) {
  const d = derive(entries);
  const L = [];

  L.push('OVERVIEW');
  L.push(`  Episodes:      ${d.total}`);
  L.push(`  Period:        ${fmtDate(d.first.startDate)} – ${fmtDate(d.last.startDate)}`);
  L.push(`  Tests:         ${d.tested} recorded, ${d.positives} positive`);
  if (d.avgGap !== null) L.push(`  Gap between:   ${d.avgGap} days avg (${d.minGap}–${d.maxGap})`);
  if (d.avgDuration !== null) L.push(`  Recovery:      ${d.avgDuration} days avg`);
  if (d.ongoing) L.push(`  Ongoing:       ${d.ongoing}`);
  L.push('');

  L.push('EPISODES (most recent first)');
  [...entries].reverse().forEach((e, i) => {
    L.push('');
    L.push(`  ${i + 1}. Started ${fmtDate(e.startDate)}`);
    L.push(`     Test:      ${RESULT_LABEL[e.data.testResult] || '-'}${e.data.testType ? ` (${e.data.testType})` : ''}`);
    L.push(`     Symptoms:  ${(e.data.symptoms || []).join(', ') || '-'}`);
    L.push(`     Treated:   ${e.data.treatment || '-'}`);
    L.push(`     Recovered: ${e.endDate ? `${fmtDate(e.endDate)} (${plural(daysBetween(e.startDate, e.endDate), 'day')})` : 'Ongoing / not recorded'}`);
    if (e.data.notes) L.push(`     Notes:     ${e.data.notes}`);
  });

  return L;
}

export default {
  type: TYPE,
  label: 'Malaria episode',
  plural: 'Malaria episodes',
  section: 'health',
  icon: 'malaria',
  status: 'active',
  fields,
  toValues,
  fromValues,
  validate,
  badge,
  subtitle,
  rows,
  quickActions,
  applyAction,
  metrics,
  overview,
  charts,
  insights,
  summary
};
