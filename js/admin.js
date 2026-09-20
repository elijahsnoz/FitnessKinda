/* Admin dashboard. Renders whatever /api/admin/metrics returns — and that
 * endpoint only ever returns counts. There is deliberately no route here for
 * looking at a person's record. */

import { api, ApiError } from './api.js';
import { esc, fmtDate, relativeDay } from './util.js';

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

const tiles = (pairs) =>
  `<div class="snapshot">${pairs
    .map(([label, value]) => `<div class="snap">
      <span class="snap-label">${esc(label)}</span>
      <b class="snap-value">${esc(String(value))}</b>
    </div>`)
    .join('')}</div>`;

function bars(daily) {
  if (!daily.length) return '<p class="hint">No activity in the last fortnight.</p>';
  const max = Math.max(...daily.map((d) => d.n));
  return `<ul class="bars">${daily
    .map(
      (d) => `<li>
        <span class="bars-day">${esc(d.day.slice(5))}</span>
        <span class="bars-track"><span class="bars-fill" style="width:${Math.round((d.n / max) * 100)}%"></span></span>
        <span class="bars-n">${d.n}</span>
      </li>`
    )
    .join('')}</ul>`;
}

/* People, as account metadata. Nothing here is health content, and there is no
 * route from this page into anyone's record. */
function people(users) {
  if (!users.length) return '<p class="hint">Nobody has registered yet.</p>';

  return `<ul class="people">${users.map((u) => `
    <li class="person">
      <div class="person-main">
        <p class="person-name">${esc(u.name || 'No name given')}${u.role === 'admin' ? ' <span class="tag tone-calm">Admin</span>' : ''}</p>
        <p class="person-email">${esc(u.email)}</p>
      </div>
      <div class="person-facts">
        <span class="${u.emailVerified ? 'is-yes' : 'is-no'}">${u.emailVerified ? 'Email confirmed' : 'Not confirmed'}</span>
        <span>${u.entries} ${u.entries === 1 ? 'entry' : 'entries'}</span>
        <span>Joined ${esc(fmtDate(u.joinedAt.slice(0, 10)))}</span>
        <span>${u.lastActiveAt ? `Active ${esc(relativeDay(u.lastActiveAt.slice(0, 10)))}` : 'No activity yet'}</span>
      </div>
    </li>`).join('')}</ul>`;
}

function render(m, users) {
  body.innerHTML = `
    <h2 class="view-title">Registered</h2>
    <div class="card">${people(users)}</div>

    <h2 class="view-title">Users</h2>
    ${tiles([
      ['Total users', m.users.total],
      ['New (7 days)', m.users.newLast7],
      ['New (30 days)', m.users.newLast30],
      ['Active (7 days)', m.users.activeLast7]
    ])}

    <h2 class="view-title">Usage</h2>
    ${tiles([
      ['Entries kept', m.usage.entries],
      ['Last 7 days', m.usage.loggedLast7],
      ['Last 30 days', m.usage.loggedLast30],
      ['Open health events', m.usage.openEvents]
    ])}

    <h2 class="view-title">What people record</h2>
    <div class="card">
      ${m.byType.length
        ? `<ul class="obs">${m.byType.map((t) => `<li>${esc(KIND[t.type] || t.type)} &middot; ${t.n}</li>`).join('')}</ul>`
        : '<p class="hint">Nothing recorded yet.</p>'}
    </div>

    <h2 class="view-title">Daily activity</h2>
    <div class="card">${bars(m.daily)}</div>

    <h2 class="view-title">System</h2>
    <div class="card">
      <dl class="migrate-facts">
        <dt>API</dt><dd>${esc(m.system.status)}</dd>
        <dt>Database</dt><dd>${m.system.database.ok ? 'ok' : 'error'} · ${esc(String(m.system.database.journalMode || ''))}</dd>
        <dt>Migrations</dt><dd>${esc(String(m.system.database.migrations ?? '—'))}</dd>
        <dt>Uptime</dt><dd>${Math.round(m.system.uptimeSeconds / 60)} min</dd>
        <dt>Memory</dt><dd>${esc(String(m.system.memoryMb))} MB</dd>
        <dt>Node</dt><dd>${esc(m.system.nodeVersion)}</dd>
      </dl>
    </div>

    <h2 class="view-title">Errors (7 days)</h2>
    <div class="card">
      ${m.errors.length
        ? `<ul class="obs">${m.errors
            .map((e) => `<li>${esc(e.kind)} · HTTP ${esc(String(e.status))} · ${esc(String(e.n))}×</li>`)
            .join('')}</ul>`
        : '<p class="hint">No errors recorded.</p>'}
    </div>`;
}

Promise.all([api.adminMetrics(), api.adminUsers()])
  .then(([metrics, { users }]) => render(metrics, users))
  .catch((err) => {
    const message =
      err instanceof ApiError && err.status === 401
        ? 'Sign in with an admin account to view this page.'
        : err instanceof ApiError && err.status === 403
          ? 'This account does not have admin access.'
          : 'Could not load metrics.';
    body.innerHTML = `<div class="empty"><p class="empty-title">${esc(message)}</p>
      <p>Admin access is granted by the ADMIN_EMAILS environment variable on the server.</p></div>`;
  });
