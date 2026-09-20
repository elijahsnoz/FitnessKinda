/* Health: the record itself. A notebook, not a clinical database. */

import { esc, plural, fmtDate } from '../util.js';
import * as store from '../store.js';
import { bySection, byType, primary } from '../registry.js';
import { groupedTimeline, empty, insightList, privacyNote } from './parts.js';
import { observations } from '../insights.js';

export function renderHealth() {
  const types = bySection('health').map((d) => d.type);
  const entries = store.all().filter((e) => types.includes(e.type));

  if (!entries.length) {
    return `<h2 class="title" id="health-title">My health record.</h2>
      <p class="lede">Symptoms, illnesses, sleep, measurements, medications, kept in one place.</p>
      ${empty('Nothing recorded yet.', "That's okay. Start whenever you're ready.", 'Record something')}
      ${privacyNote()}`;
  }

  const counts = bySection('health')
    .map((d) => ({ d, n: entries.filter((e) => e.type === d.type).length }))
    .filter((x) => x.n);

  const open = entries.filter((e) => !e.endDate && (e.type === 'health_event' || e.type === 'malaria_episode'));
  const obs = observations(store.all(), { limit: 2 });

  return `
    <h2 class="title" id="health-title">My health record.</h2>
    <p class="lede">${plural(entries.length, 'entry').replace('entrys', 'entries')} kept.</p>

    ${open.length ? `<div class="section-title">Still open</div>
      <ul class="timeline">${open.map((e) => {
        const d = byType(e.type);
        return `<li class="event"><div class="event-rail" aria-hidden="true"><span class="dot dot-notice"></span></div>
          <article class="event-card">
            <p class="event-kind">${esc(d.label)}</p>
            <p class="event-title">${esc(d.subtitle(e) || d.label)}</p>
            <p class="event-when">Started ${esc(fmtDate(e.startDate))}</p>
            <div class="event-actions">
              <button type="button" class="btn small quiet" data-edit="${esc(e.id)}">Record the end</button>
            </div>
          </article></li>`;
      }).join('')}</ul>` : ''}

    <div class="section-title">What you have recorded</div>
    <div class="snapshot">
      ${counts.map(({ d, n }) => `<div class="snap">
        <span class="snap-label">${esc(d.plural)}</span><b class="snap-value">${n}</b>
      </div>`).join('')}
    </div>

    ${obs.length ? `<div class="section-title">Kinda Insights</div>${insightList(obs)}` : ''}

    <div class="section-title">Take it with you</div>
    <div class="card">
      <p class="card-note has-space">
        Your health history, organized into something a clinician can read in a minute.
      </p>
      <div class="actions">
        <button type="button" class="btn primary" data-goto="summary">Health summary</button>
      </div>
    </div>

    <div class="section-title">Recent</div>
    <ul class="timeline">${groupedTimeline(entries.slice(-10))}</ul>

    <p class="disclaimer">FitnessKinda describes only what you recorded. It does not diagnose
    anything and does not recommend treatment. Take results and decisions to a qualified
    health worker.</p>`;
}
