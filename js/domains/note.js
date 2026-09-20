/* A note — anything that does not fit a field. Often the most useful record. */

import { makeDomain, dateField } from './kit.js';

export default makeDomain({
  type: 'note',
  label: 'Note',
  plural: 'Notes',
  section: 'health',
  icon: 'note',

  fields: [
    dateField('When'),
    { key: 'text', type: 'textarea', label: 'What would you like to remember?', rows: 4,
      placeholder: 'How you felt, something you noticed, a question for your next appointment' }
  ],

  toValues: (e) => ({ startDate: e.startDate, text: e.data.text || '' }),
  fromValues: (v) => ({ startDate: v.startDate, endDate: '', data: { text: v.text || '' } }),

  validate: (v) => {
    if (!v.startDate) return 'Pick a date.';
    if (!String(v.text || '').trim()) return 'Write something to remember.';
    return null;
  },

  badge: () => ({ label: 'Note', tone: 'neutral' }),
  subtitle: (e) => {
    const t = (e.data.text || '').trim();
    return t.length > 90 ? `${t.slice(0, 90)}…` : t;
  },
  rows: (e) => [['Note', e.data.text]]
});
