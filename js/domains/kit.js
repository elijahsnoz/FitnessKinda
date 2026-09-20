/* A small factory for signal domains.
 *
 * Every domain answers the same questions — what fields does it hold, how does
 * an entry read on the timeline, what does it contribute to a summary — so most
 * of them are a declaration rather than a module. Malaria keeps its own file
 * because it carries real analysis; these are records.
 */

import { fmtDate, plural, daysBetween, todayISO } from '../util.js';

export function makeDomain(spec) {
  const {
    type, label, plural: pluralLabel, section, icon, fields,
    toValues, fromValues, validate, badge, subtitle, rows,
    insights = () => [], metrics = () => [], charts = () => []
  } = spec;

  return {
    type, label, plural: pluralLabel, section, icon, status: 'active',
    fields, toValues, fromValues, metrics, charts, insights,

    validate: validate || ((v) => {
      if (!v.startDate) return 'Pick a date.';
      if (v.startDate > todayISO()) return 'That date is in the future.';
      if (v.endDate && v.endDate < v.startDate) return 'The end date is before the start.';
      return null;
    }),

    badge: badge || (() => ({ label: '', tone: 'neutral' })),
    subtitle: subtitle || (() => ''),
    rows: rows || (() => []),
    quickActions: () => [],
    applyAction: () => null,

    summary(entries) {
      const L = [`${pluralLabel.toUpperCase()} (${entries.length})`, ''];
      [...entries].reverse().forEach((e) => {
        const parts = rows(e).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
        L.push(`  ${fmtDate(e.startDate)}${e.endDate ? ` – ${fmtDate(e.endDate)}` : ''}`);
        parts.forEach((p) => L.push(`     ${p}`));
        L.push('');
      });
      return L;
    }
  };
}

/* Shared field shapes, so a date means the same thing everywhere. */
export const dateField = (label, extra = {}) => ({
  key: 'startDate', scope: 'envelope', type: 'date', label, required: true, quickDates: true, ...extra
});
export const noteField = (placeholder = 'Anything worth remembering') => ({
  key: 'notes', type: 'textarea', label: 'Notes', rows: 2, placeholder
});

export { fmtDate, plural, daysBetween };
