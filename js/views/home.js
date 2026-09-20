/* Home answers one question: how am I doing?
 *
 * A greeting, a small snapshot, one or two observations, and the action that
 * matters most. Anything else belongs on another screen. */

import { esc, todayISO, relativeDay, daysBetween, plural } from '../util.js';
import * as store from '../store.js';
import * as account from '../account.js';
import { observations, snapshot } from '../insights.js';
import { entryCard, insightList, icon } from './parts.js';

/* The four kinds most people reach for first. The rest are one tap further on,
   in the full sheet; putting all seven here would make a first record a decision. */
const FIRST = [
  { type: 'sleep', label: 'Sleep', icon: 'sleep' },
  { type: 'movement', label: 'Movement', icon: 'move' },
  { type: 'health_event', label: 'How I feel', icon: 'health' },
  { type: 'note', label: 'A note', icon: 'note' }
];

/** Fourteen days, one block each, shaded by how much was recorded. */
function fortnight(all) {
  const today = todayISO();
  const days = [];
  for (let back = 13; back >= 0; back--) {
    const count = all.filter((e) => daysBetween(e.startDate, today) === back).length;
    const date = new Date(Date.now() - back * 86400000);
    days.push({
      count,
      initial: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()],
      label: `${count === 0 ? 'nothing' : plural(count, 'record')} on ${date.toDateString()}`
    });
  }
  const active = days.filter((d) => d.count).length;
  return { days, active };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function renderHome() {
  const all = store.all();
  const name = account.state.user?.name?.split(' ')[0] || '';

  if (!all.length) {
    return `
      <h2 class="title" id="home-title">${greeting()}${name ? `, ${esc(name)}` : ''}.</h2>
      <p class="lede">Know your body. Keep your history.</p>
      <div class="empty">
        <p class="empty-title">Your story starts here.</p>
        <p>Record something small: how you slept, how you moved, how you feel. It becomes
        useful faster than you would think.</p>
        <div class="quick-start">
          ${FIRST.map((f) => `<button type="button" class="btn" data-record="${esc(f.type)}">
            ${icon(f.icon)}<span>${esc(f.label)}</span>
          </button>`).join('')}
        </div>
        <div class="actions">
          <button type="button" class="btn ghost" data-add>Something else</button>
        </div>
      </div>
      <div class="section-title">Why bother</div>
      <div class="card">
        <p class="card-note">
          Most apps tell you what to do. FitnessKinda helps you understand what has already
          been happening to you, and hands you a clear history when someone needs to see it.
        </p>
      </div>`;
  }

  const snap = snapshot(all);
  const obs = observations(all, { limit: 2 });
  const recent = [...all].reverse().slice(0, 2);
  const { days, active } = fortnight(all);

  const strip = active
    ? `<div class="section-title">The last two weeks</div>
       <div class="week-strip" role="img" aria-label="Records over the last fourteen days: ${active} days with something recorded">
         ${days.map((d) => `<span class="week-day">
           <span class="week-dot has-${Math.min(d.count, 3)}" title="${esc(d.label)}"></span>
           <span class="week-label">${esc(d.initial)}</span>
         </span>`).join('')}
       </div>
       <p class="hint">${plural(active, 'day')} with something recorded.</p>`
    : '';

  return `
    <h2 class="title" id="home-title">${greeting()}${name ? `, ${esc(name)}` : ''}.</h2>
    <p class="lede">Small records. Better understanding.</p>

    ${snap.length ? `<div class="section-title">Lately</div>
      <div class="snapshot">
        ${snap.map((s) => `<div class="snap${s.tone === 'notice' ? ' is-notice' : ''}">
          <span class="snap-label">${esc(s.label)}</span>
          <b class="snap-value">${esc(String(s.value))}</b>
          <span class="snap-when">${esc(relativeDay(s.when))}</span>
        </div>`).join('')}
      </div>` : ''}

    ${strip}

    ${obs.length ? `<div class="section-title">Your recent story</div>${insightList(obs)}` : ''}

    <div class="section-title">Continue your record</div>
    <div class="actions">
      <button type="button" class="btn primary" data-add>Add something</button>
    </div>

    ${recent.length ? `<div class="section-title">Just recorded</div>
      <ul class="timeline">${recent.map((e) => entryCard(e, { actions: false })).join('')}</ul>
      <div class="actions">
        <button type="button" class="btn ghost" data-goto="timeline">See your whole timeline</button>
      </div>` : ''}`;
}
