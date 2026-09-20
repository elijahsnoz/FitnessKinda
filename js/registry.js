/* The signal registry.
 *
 * One body produces many signals; the interesting thing is how they line up over
 * time. Each signal is a domain module with the same shape, and every view in the
 * app iterates over whatever is registered here rather than knowing any of them.
 *
 * Adding the next signal is a new file in js/domains/ and a line in this list.
 */

import malaria from './domains/malaria.js';
import healthEvent from './domains/health-event.js';
import movement from './domains/movement.js';
import sleep from './domains/sleep.js';
import measurement from './domains/measurement.js';
import medication from './domains/medication.js';
import note from './domains/note.js';

/* The order people meet them in when they tap Add. */
export const DOMAINS = [healthEvent, movement, sleep, measurement, medication, malaria, note];

export const byType = (type) => DOMAINS.find((d) => d.type === type) || null;
export const bySection = (section) => DOMAINS.filter((d) => d.section === section);

/** Malaria remains the signal with real analysis behind it. */
export const primary = () => malaria;

/* What the timeline offers as filters. */
export const FILTERS = [
  { key: 'all', label: 'All', types: null },
  { key: 'health', label: 'Health', types: ['health_event', 'malaria_episode', 'medication'] },
  { key: 'move', label: 'Move', types: ['movement'] },
  { key: 'sleep', label: 'Sleep', types: ['sleep'] },
  { key: 'measurements', label: 'Measurements', types: ['measurement'] },
  { key: 'notes', label: 'Notes', types: ['note'] }
];

/* Signals the envelope is ready for but nobody has asked for yet. Each becomes a
 * sibling of the files above: type, fields, toValues, fromValues, badge, rows. */
export const PLANNED = [
  { type: 'hydration_day', label: 'Hydration', fields: ['litres'] },
  { type: 'meal', label: 'Food', fields: ['description', 'time'] },
  { type: 'exposure', label: 'Mosquito / environment', fields: ['netUsed', 'repellent', 'standingWater', 'travel'] }
];
