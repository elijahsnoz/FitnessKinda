/* Admin dashboard. Renders whatever /api/admin/metrics returns — and that
 * endpoint only ever returns counts. There is deliberately no route here for
 * looking at a person's record. */

import { api, ApiError } from './api.js';
import { esc } from './util.js';

const body = document.getElementById('admin-body');

const tiles = (pairs) =>
  `<div class="stats">${pairs
    .map(([label, value]) => `<div class="stat"><b>${esc(String(value))}</b><span>${esc(label)}</span></div>`)
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

function render(m) {
  body.innerHTML = `
    <h2 class="view-title">Users</h2>
    ${tiles([
      ['Total users', m.users.total],
      ['New (7 days)', m.users.newLast7],
      ['New (30 days)', m.users.newLast30],
      ['Active (7 days)', m.users.activeLast7]
    ])}

    <h2 class="view-title">Usage</h2>
    ${tiles([
      ['Episodes logged', m.usage.episodes],
      ['Confirmed positive', m.usage.confirmedPositive],
      ['Tests recorded', m.usage.tested],
      ['Recovery recorded', m.usage.withRecovery],
      ['Ongoing episodes', m.usage.ongoing],
      ['Logged (7 days)', m.usage.loggedLast7]
    ])}

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

api
  .adminMetrics()
  .then(render)
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
