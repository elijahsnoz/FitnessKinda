/* Measurements — numbers you or a clinic took. Units stay free text on purpose:
 * a reading is more useful recorded as it was given than forced into a schema. */

import { makeDomain, dateField, noteField, plural } from './kit.js';

const KINDS = ['Weight', 'Blood pressure', 'Temperature', 'Heart rate', 'Blood sugar', 'Oxygen', 'Other'];

export default makeDomain({
  type: 'measurement',
  label: 'Measurement',
  plural: 'Measurements',
  section: 'health',
  icon: 'measure',

  fields: [
    dateField('When'),
    { key: 'kind', type: 'select', label: 'What was measured?',
      options: KINDS.map((k) => ({ value: k, label: k })) },
    { key: 'value', type: 'text', label: 'Reading', placeholder: 'e.g. 72.4 kg, 120/80, 37.2°C' },
    { key: 'where', type: 'text', label: 'Where', placeholder: 'At home, at the clinic' },
    noteField()
  ],

  toValues: (e) => ({
    startDate: e.startDate, kind: e.data.kind || '', value: e.data.value || '',
    where: e.data.where || '', notes: e.data.notes || ''
  }),

  fromValues: (v) => ({
    startDate: v.startDate, endDate: '',
    data: { kind: v.kind || '', value: v.value || '', where: v.where || '', notes: v.notes || '' }
  }),

  badge: (e) => ({ label: e.data.kind || 'Reading', tone: 'calm' }),
  subtitle: (e) => e.data.value || '',
  rows: (e) => [['Measured', e.data.kind], ['Reading', e.data.value], ['Where', e.data.where], ['Notes', e.data.notes]],

  insights: (entries) => {
    if (!entries.length) return [];
    const kinds = [...new Set(entries.map((e) => e.data.kind).filter(Boolean))];
    return [`${plural(entries.length, 'measurement')} recorded${kinds.length ? `, covering ${kinds.join(', ').toLowerCase()}` : ''}.`];
  }
});
