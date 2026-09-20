/* The timeline is the heart of the product: everything recorded, in order,
 * grouped by the day it happened. */

import { esc, plural, fmtDate } from '../util.js';
import * as store from '../store.js';
import { FILTERS } from '../registry.js';
import { groupedTimeline, empty } from './parts.js';

export let activeFilter = 'all';
export const setFilter = (key) => { activeFilter = key; };

export function renderTimeline() {
  const all = store.all();
  const filter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];
  const shown = filter.types ? all.filter((e) => filter.types.includes(e.type)) : all;

  const chips = FILTERS.map((f) => {
    const n = f.types ? all.filter((e) => f.types.includes(e.type)).length : all.length;
    return `<button type="button" class="filter${f.key === activeFilter ? ' is-on' : ''}"
      data-filter="${esc(f.key)}"${f.key === activeFilter ? ' aria-current="true"' : ''}>${esc(f.label)}${n ? ` ${n}` : ''}</button>`;
  }).join('');

  if (!all.length) {
    return `<h2 class="title" id="timeline-title">Your body, over time.</h2>
      <p class="lede">Nothing recorded yet. That's okay — start whenever you're ready.</p>
      ${empty('Your story starts here.', 'Every record you keep makes the next one more useful.')}`;
  }

  return `
    <h2 class="title" id="timeline-title">Your body, over time.</h2>
    <p class="lede">${plural(all.length, 'record')} kept${all.length > 1 ? `, going back to ${esc(fmtDate(all[0].startDate))}` : ''}.</p>
    <div class="filters" role="group" aria-label="Filter the timeline">${chips}</div>
    ${shown.length
      ? `<ul class="timeline">${groupedTimeline(shown)}</ul>`
      : `<div class="empty"><p class="empty-title">Nothing under ${esc(filter.label)} yet.</p>
         <p>Try another filter, or record something.</p>
         <button type="button" class="btn primary" data-add>Add something</button></div>`}`;
}
