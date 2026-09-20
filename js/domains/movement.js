/* Movement — how you used your body. Recorded, not scored. */

import { makeDomain, dateField, noteField, plural } from './kit.js';

const ACTIVITIES = ['Walk', 'Run', 'Strength', 'Cycle', 'Swim', 'Stretch', 'Sport', 'Work', 'Other'];

export default makeDomain({
  type: 'movement',
  label: 'Movement',
  plural: 'Movement',
  section: 'move',
  icon: 'move',

  fields: [
    dateField('When'),
    { key: 'activity', type: 'chips', label: 'What did you do?', options: ACTIVITIES,
      placeholder: 'Something else' },
    { key: 'minutes', type: 'number', label: 'For how long?', placeholder: 'Minutes' },
    { key: 'effort', type: 'choice', label: 'How did it feel?',
      options: [{ value: 'easy', label: 'Easy' }, { value: 'steady', label: 'Steady' }, { value: 'hard', label: 'Hard' }] },
    noteField('How your body felt, where you went')
  ],

  toValues: (e) => ({
    startDate: e.startDate,
    activity: e.data.activity || [],
    minutes: e.data.minutes || '',
    effort: e.data.effort || 'easy',
    notes: e.data.notes || ''
  }),

  fromValues: (v) => ({
    startDate: v.startDate,
    endDate: '',
    data: {
      activity: v.activity || [],
      minutes: String(v.minutes || '').replace(/[^\d.]/g, '').slice(0, 6),
      effort: v.effort || '',
      notes: v.notes || ''
    }
  }),

  badge: (e) => ({ label: e.data.minutes ? `${e.data.minutes} min` : 'Logged', tone: 'move' }),
  subtitle: (e) => (e.data.activity || []).join(', '),
  rows: (e) => [
    ['Activity', (e.data.activity || []).join(', ')],
    ['Minutes', e.data.minutes],
    ['Effort', e.data.effort],
    ['Notes', e.data.notes]
  ],

  insights: (entries) => {
    if (!entries.length) return [];
    const mins = entries.map((e) => Number(e.data.minutes) || 0).filter(Boolean);
    const total = mins.reduce((a, b) => a + b, 0);
    const out = [`${plural(entries.length, 'movement record')} kept.`];
    if (total) out.push(`${total} minutes recorded in total, ${Math.round(total / mins.length)} on an average day.`);
    return out;
  }
});
