/* Sleep — the night, as you remember it in the morning. */

import { makeDomain, dateField, noteField, plural } from './kit.js';

export default makeDomain({
  type: 'sleep',
  label: 'Sleep',
  plural: 'Sleep',
  section: 'health',
  icon: 'sleep',

  fields: [
    dateField('Night of'),
    { key: 'hours', type: 'number', label: 'How long did you sleep?', placeholder: 'Hours, e.g. 7.5' },
    { key: 'quality', type: 'choice', label: 'How was it?',
      options: [{ value: 'poor', label: 'Poor' }, { value: 'ok', label: 'Okay' }, { value: 'good', label: 'Good' }] },
    noteField('Woke often, slept late, anything you noticed')
  ],

  toValues: (e) => ({
    startDate: e.startDate,
    hours: e.data.hours || '',
    quality: e.data.quality || 'ok',
    notes: e.data.notes || ''
  }),

  fromValues: (v) => ({
    startDate: v.startDate,
    endDate: '',
    data: {
      hours: String(v.hours || '').replace(/[^\d.]/g, '').slice(0, 5),
      quality: v.quality || '',
      notes: v.notes || ''
    }
  }),

  badge: (e) => ({ label: e.data.hours ? `${e.data.hours}h` : 'Logged', tone: e.data.quality === 'poor' ? 'notice' : 'calm' }),
  subtitle: (e) => ({ poor: 'Poor night', ok: 'Okay night', good: 'Good night' }[e.data.quality] || ''),
  rows: (e) => [['Hours', e.data.hours], ['Quality', e.data.quality], ['Notes', e.data.notes]],

  insights: (entries) => {
    const hours = entries.map((e) => Number(e.data.hours) || 0).filter(Boolean);
    if (!hours.length) return [];
    const avg = Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10;
    const out = [`${avg} hours on an average recorded night, across ${plural(hours.length, 'night')}.`];
    const poor = entries.filter((e) => e.data.quality === 'poor').length;
    if (poor) out.push(`${plural(poor, 'night')} recorded as poor.`);
    return out;
  }
});
