/* Medication — what you took, and for how long. Recorded, never recommended. */

import { makeDomain, dateField, noteField, plural, fmtDate } from './kit.js';

export default makeDomain({
  type: 'medication',
  label: 'Medication',
  plural: 'Medications',
  section: 'health',
  icon: 'medication',

  fields: [
    dateField('Started'),
    { key: 'name', type: 'text', label: 'What did you take?', placeholder: 'Name as written on the packet' },
    { key: 'dose', type: 'text', label: 'Dose', placeholder: 'e.g. 500mg, twice a day' },
    { key: 'reason', type: 'text', label: 'What for?', placeholder: 'In your own words' },
    { key: 'endDate', scope: 'envelope', type: 'date', label: 'Stopped',
      hint: 'Leave blank if you are still taking it.' },
    noteField('How it went, side effects you noticed')
  ],

  toValues: (e) => ({
    startDate: e.startDate, endDate: e.endDate || '',
    name: e.data.name || '', dose: e.data.dose || '',
    reason: e.data.reason || '', notes: e.data.notes || ''
  }),

  fromValues: (v) => ({
    startDate: v.startDate, endDate: v.endDate || '',
    data: { name: v.name || '', dose: v.dose || '', reason: v.reason || '', notes: v.notes || '' }
  }),

  badge: (e) => ({ label: e.endDate ? 'Finished' : 'Ongoing', tone: e.endDate ? 'neutral' : 'calm' }),
  subtitle: (e) => [e.data.name, e.data.dose].filter(Boolean).join(' · '),
  rows: (e) => [
    ['Medication', e.data.name], ['Dose', e.data.dose], ['For', e.data.reason],
    ['Stopped', e.endDate ? fmtDate(e.endDate) : 'Still taking'], ['Notes', e.data.notes]
  ],

  insights: (entries) => {
    if (!entries.length) return [];
    const ongoing = entries.filter((e) => !e.endDate).length;
    const out = [`${plural(entries.length, 'medication')} recorded.`];
    if (ongoing) out.push(`${plural(ongoing, 'course')} with no end date recorded.`);
    return out;
  }
});
