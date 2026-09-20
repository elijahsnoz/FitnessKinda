/* A health event — a symptom, an illness, an injury, an appointment.
 * The catch-all for things that happen to a body and are worth remembering. */

import { makeDomain, dateField, noteField, plural, fmtDate, daysBetween } from './kit.js';

const KINDS = [
  { value: 'symptom', label: 'Symptom' },
  { value: 'illness', label: 'Illness' },
  { value: 'injury', label: 'Injury' },
  { value: 'appointment', label: 'Appointment' }
];
const LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));

export default makeDomain({
  type: 'health_event',
  label: 'Health event',
  plural: 'Health events',
  section: 'health',
  icon: 'health',

  fields: [
    dateField('Started'),
    { key: 'kind', type: 'choice', label: 'What kind?', options: KINDS },
    { key: 'what', type: 'text', label: 'What happened?', placeholder: 'In your own words' },
    { key: 'endDate', scope: 'envelope', type: 'date', label: 'Ended',
      hint: 'Leave blank if it is still going on.' },
    noteField('What you did about it, what a clinician said')
  ],

  toValues: (e) => ({
    startDate: e.startDate, endDate: e.endDate || '',
    kind: e.data.kind || 'symptom', what: e.data.what || '', notes: e.data.notes || ''
  }),

  fromValues: (v) => ({
    startDate: v.startDate, endDate: v.endDate || '',
    data: { kind: v.kind || 'symptom', what: v.what || '', notes: v.notes || '' }
  }),

  badge: (e) => ({
    label: LABEL[e.data.kind] || 'Event',
    tone: e.endDate ? 'neutral' : 'notice'
  }),
  subtitle: (e) => e.data.what || '',
  rows: (e) => [
    ['Kind', LABEL[e.data.kind] || ''],
    ['What', e.data.what],
    ['Ended', e.endDate ? `${fmtDate(e.endDate)} (${plural(daysBetween(e.startDate, e.endDate), 'day')})` : 'Still going'],
    ['Notes', e.data.notes]
  ],

  insights: (entries) => {
    if (!entries.length) return [];
    const open = entries.filter((e) => !e.endDate).length;
    const out = [`${plural(entries.length, 'health event')} recorded.`];
    if (open) out.push(`${plural(open, 'one')} with no end date yet.`);
    return out;
  }
});
