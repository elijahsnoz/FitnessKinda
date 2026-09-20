/* The admin page.
 *
 * Two questions: who is here, and is the thing healthy. Everything on this page
 * is a count or a piece of account metadata — there is no route from here into
 * anyone's health record, and the queries behind it count rows rather than
 * reading them.
 */

import { api, ApiError } from './api.js';
import { esc, fmtDate, relativeDay } from './util.js';
import { barChart } from './charts.js';

const body = document.getElementById('admin-body');

const KIND = {
  health_event: 'Health events',
  movement: 'Movement',
  sleep: 'Sleep',
  measurement: 'Measurements',
  medication: 'Medications',
  malaria_episode: 'Malaria episodes',
  note: 'Notes'
};

const initials = (name, email) =>
  (name || email || '?')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const tiles = (pairs) =>
  `<div class="snapshot">${pairs
    .map(([label, value, note]) => `<div class="snap">
      <span class="snap-label">${esc(label)}</span>
      <b class="snap-value">${esc(String(value))}</b>
      ${note ? `<span class="snap-when">${esc(note)}</span>` : ''}
    </div>`)
    .join('')}</div>`;

/** People, as account metadata. */
function people(users) {
  if (!users.length) {
    return `<div class="empty"><p class="empty-title">Nobody has registered yet.</p>
      <p>Accounts appear here the moment someone signs up.</p></div>`;
  }

  return `<ul class="people">${users
    .map((u) => `<li class="person">
      <span class="person-avatar" aria-hidden="true">${esc(initials(u.name, u.email))}</span>
      <div class="person-main">
        <p class="person-name">${esc(u.name || 'No name given')}${
          u.role === 'admin' ? ' <span class="tag tone-calm">Admin</span>' : ''
        }</p>
        <p class="person-email">${esc(u.email)}</p>
        <p class="person-facts">
          <span class="${u.emailVerified ? 'is-yes' : 'is-no'}">${u.emailVerified ? 'Email confirmed' : 'Not confirmed'}</span>
          <span>Joined ${esc(fmtDate(u.joinedAt.slice(0, 10)))}</span>
          <span>${u.lastActiveAt ? `Active ${esc(relativeDay(u.lastActiveAt.slice(0, 10)))}` : 'No activity yet'}</span>
        </p>
      </div>
      <span class="person-count"><b>${u.entries}</b><small>${u.entries === 1 ? 'entry' : 'entries'}</small></span>
    </li>`)
    .join('')}</ul>`;
}

/** What people record, as a share of everything kept. */
function signals(byType) {
  if (!byType.length) return '<p class="hint">Nothing recorded yet.</p>';
  const most = Math.max(...byType.map((t) => t.n));

  return `<ul class="meters">${byType
    .map((t) => `<li>
      <span class="meter-label">${esc(KIND[t.type] || t.type)}</span>
      <span class="meter-track"><span class="meter-fill" data-share="${Math.round((t.n / most) * 100)}"></span></span>
      <span class="meter-n">${t.n}</span>
    </li>`)
    .join('')}</ul>`;
}

/* Inline style attributes are blocked by our Content-Security-Policy, so anything
 * with a computed width is set here instead. The CSSOM is not covered by
 * style-src, and keeping the policy strict is worth the extra line. */
function applyShares() {
  document.querySelectorAll('.meter-fill[data-share]').forEach((el) => {
    el.style.width = `${el.dataset.share}%`;
  });
}

function render(m, users) {
  const verified = users.filter((u) => u.emailVerified).length;
  const daily = m.daily.map((d) => ({ label: d.day.slice(5).replace('-', '/'), value: d.n }));

  body.innerHTML = `
    <h2 class="section-title">Overview</h2>
    ${tiles([
      ['People', m.users.total, `${verified} confirmed`],
      ['Entries kept', m.usage.entries, `${m.usage.loggedLast7} this week`],
      ['Active this week', m.users.activeLast7, `of ${m.users.total}`],
      ['Open health events', m.usage.openEvents, 'across everyone']
    ])}

    <h2 class="section-title">Registered</h2>
    <div class="card people-card">${people(users)}</div>

    <h2 class="section-title">Entries a day</h2>
    <div class="card">
      ${daily.some((d) => d.value) ? barChart(daily) : '<p class="hint">Nothing recorded in the last fortnight.</p>'}
      <p class="hint">The last fourteen days, everyone together.</p>
    </div>

    <h2 class="section-title">What people record</h2>
    <div class="card">${signals(m.byType)}</div>

    <h2 class="section-title">System</h2>
    <div class="card">
      <dl class="facts">
        <dt>API</dt><dd>${esc(m.system.status)}</dd>
        <dt>Database</dt><dd>${m.system.database.ok ? 'ok' : 'error'} &middot; ${esc(String(m.system.database.driver || ''))}</dd>
        <dt>Migrations</dt><dd>${esc(String(m.system.database.migrations ?? '—'))}</dd>
        <dt>Uptime</dt><dd>${Math.round(m.system.uptimeSeconds / 60)} min</dd>
        <dt>Memory</dt><dd>${esc(String(m.system.memoryMb))} MB</dd>
        <dt>Node</dt><dd>${esc(m.system.nodeVersion)}</dd>
      </dl>
      ${m.errors.length
        ? `<p class="hint has-space">Errors, last 7 days</p>
           <ul class="obs">${m.errors
             .map((e) => `<li>${esc(e.kind)} &middot; HTTP ${esc(String(e.status))} &middot; ${esc(String(e.n))}&times;</li>`)
             .join('')}</ul>`
        : '<p class="hint has-space">No errors recorded in the last seven days.</p>'}
    </div>`;

  applyShares();
}

function refuse(message, detail) {
  body.innerHTML = `<div class="outcome">
    <div class="outcome-mark is-sorry">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v6M12 16.5v.5"></path><circle cx="12" cy="12" r="9"></circle></svg>
    </div>
    <h1>${esc(message)}</h1>
    <p>${esc(detail)}</p>
    <a class="btn primary" href="/">Open FitnessKinda</a>
  </div>`;
}

Promise.all([api.adminMetrics(), api.adminUsers()])
  .then(([metrics, { users }]) => render(metrics, users))
  .catch((err) => {
    if (err instanceof ApiError && err.status === 401) {
      return refuse('Sign in first.', 'This page is for the account named in ADMIN_EMAILS on the server.');
    }
    if (err instanceof ApiError && err.status === 403) {
      return refuse('This account is not an admin.', 'Admin is granted by the ADMIN_EMAILS environment variable, never from inside the app.');
    }
    refuse('Could not load the metrics.', err.message || 'Try again in a moment.');
  });
