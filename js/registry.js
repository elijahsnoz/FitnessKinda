/* The signal registry.
 *
 * FitnessKinda's premise is that one body produces many signals, and that the
 * interesting thing is how they line up over time. Each signal is a domain module
 * with the same shape; the app iterates over whatever is registered here.
 *
 * Only malaria is built. The PLANNED list is not UI and not dead code — it is the
 * contract the envelope was designed around (see store.js), recorded so the next
 * signal is a new file here rather than a rewrite.
 */

import malaria from './domains/malaria.js';

export const DOMAINS = [malaria];

export const byType = (type) => DOMAINS.find((d) => d.type === type) || null;

/** The signal currently being logged. One today; a picker when there are more. */
export const primary = () => DOMAINS[0];

/* Next signals, in the order they make sense to add. Each becomes a module in
 * js/domains/ with the same interface malaria.js implements:
 *   type, fields, toValues, fromValues, validate, badge, subtitle, rows,
 *   metrics, charts, insights, summary
 *
 * Each also gets a `context` slot on entries of other types, so an episode can
 * eventually carry the sleep, hydration and exposure recorded around it.
 */
export const PLANNED = [
  { type: 'sleep_night',   label: 'Sleep',       fields: ['hours', 'quality', 'wakeups'] },
  { type: 'exercise',      label: 'Exercise',    fields: ['activity', 'minutes', 'intensity'] },
  { type: 'hydration_day', label: 'Hydration',   fields: ['litres'] },
  { type: 'meal',          label: 'Food',        fields: ['description', 'time'] },
  { type: 'exposure',      label: 'Mosquito / environment', fields: ['netUsed', 'repellent', 'standingWater', 'travel', 'rain'] }
];
