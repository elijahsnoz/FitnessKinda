/* Move: how you have been using your body. Recording and understanding, not
 * motivation through pressure. */

import { esc, plural, daysBetween, todayISO } from '../util.js';
import * as store from '../store.js';
import { bySection } from '../registry.js';
import { groupedTimeline, empty, insightList } from './parts.js';
import { barChart } from '../charts.js';

export function renderMove() {
  const types = bySection('move').map((d) => d.type);
  const entries = store.all().filter((e) => types.includes(e.type));

  if (!entries.length) {
    return `<h2 class="title" id="move-title">How you use your body.</h2>
      <p class="lede">Walks count. So does carrying shopping up a hill.</p>
      ${empty('Nothing recorded yet.', 'Record a walk, a session, a stretch, whatever you actually did.', 'Record movement')}`;
  }

  const minutes = entries.map((e) => Number(e.data.minutes) || 0);
  const total = minutes.reduce((a, b) => a + b, 0);
  const last30 = entries.filter((e) => daysBetween(e.startDate, todayISO()) <= 30);
  const activities = {};
  entries.forEach((e) => (e.data.activity || []).forEach((a) => { activities[a] = (activities[a] || 0) + 1; }));
  const top = Object.entries(activities).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Minutes per week over the last eight weeks — a shape, not a scoreboard.
  const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const inWeek = entries.filter((e) => {
      const age = daysBetween(e.startDate, todayISO());
      return age >= w * 7 && age < (w + 1) * 7;
    });
    weeks.push({
      label: w === 0 ? 'This' : `${w}w`,
      value: inWeek.reduce((a, e) => a + (Number(e.data.minutes) || 0), 0)
    });
  }

  return `
    <h2 class="title" id="move-title">How you use your body.</h2>
    <p class="lede">${plural(entries.length, 'record')}${total ? `, ${total} minutes in all` : ''}.</p>

    <div class="snapshot">
      <div class="snap"><span class="snap-label">Records</span><b class="snap-value">${entries.length}</b><span class="snap-when">all time</span></div>
      <div class="snap"><span class="snap-label">Last 30 days</span><b class="snap-value">${last30.length}</b><span class="snap-when">sessions</span></div>
    </div>

    ${weeks.some((w) => w.value) ? `<div class="section-title">Minutes a week</div>
      <div class="card">${barChart(weeks, { unit: ' min' })}
      <p class="hint">Eight weeks, most recent on the right.</p></div>` : ''}

    ${top.length ? `<div class="section-title">What you do most</div>
      <div class="card"><ul class="obs">
        ${top.map(([a, n]) => `<li>${esc(a)} · ${plural(n, 'time')}</li>`).join('')}
      </ul></div>` : ''}

    <div class="section-title">Recent movement</div>
    <ul class="timeline">${groupedTimeline(entries.slice(-12))}</ul>`;
}
