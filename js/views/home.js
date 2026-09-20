/* Home answers one question: how am I doing?
 *
 * A greeting, a small snapshot, one or two observations, and the action that
 * matters most. Anything else belongs on another screen. */

import { esc, todayISO, relativeDay } from '../util.js';
import * as store from '../store.js';
import * as account from '../account.js';
import { observations, snapshot } from '../insights.js';
import { entryCard, empty, insightList } from './parts.js';

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
      ${empty('Your story starts here.',
        'Record something small — how you slept, how you moved, how you feel. It becomes useful faster than you would think.',
        'Add your first record')}
      <div class="section-title">Why bother</div>
      <div class="card">
        <p style="margin:0;font-size:14.5px;line-height:1.6;color:var(--text-soft)">
          Most apps tell you what to do. FitnessKinda helps you understand what has already
          been happening to you — and hands you a clear history when someone needs to see it.
        </p>
      </div>`;
  }

  const snap = snapshot(all);
  const obs = observations(all, { limit: 2 });
  const recent = [...all].reverse().slice(0, 2);

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

    ${obs.length ? `<div class="section-title">Your recent story</div>${insightList(obs)}` : ''}

    <div class="section-title">Continue your record</div>
    <div class="actions">
      <button type="button" class="btn primary" data-add>Add something</button>
    </div>

    ${recent.length ? `<div class="section-title">Just recorded</div>
      <ul class="timeline">${recent.map((e) => entryCard(e, { actions: false })).join('')}</ul>
      <div class="actions" style="margin-top:14px">
        <button type="button" class="btn ghost" data-goto="timeline">See your whole timeline</button>
      </div>` : ''}`;
}
