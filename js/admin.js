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

/* Most of these are the API doing its job, not something being wrong. */
const MEANING = {
  400: 'Rejected as invalid',
  401: 'Asked to sign in',
  403: 'Refused, not allowed',
  404: 'Not found',
  413: 'Request too large',
  429: 'Throttled',
  500: 'Server error'
};

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
  const total = byType.reduce((sum, t) => sum + t.n, 0);

  return `<ul class="meters">${byType
    .map((t) => `<li>
      <span class="meter-label">${esc(KIND[t.type] || t.type)}</span>
      <span class="meter-track"><span class="meter-fill" data-share="${Math.round((t.n / total) * 100)}"></span></span>
      <span class="meter-n">${t.n}</span>
    </li>`)
    .join('')}</ul>
    <p class="hint has-space">Share of all ${total} ${total === 1 ? 'entry' : 'entries'}.</p>`;
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
        ? `<p class="hint has-space">Refused or failed requests, last 7 days</p>
           <ul class="error-rows">${m.errors
             .map((e) => `<li>
               <span class="error-kind">${esc(MEANING[e.status] || `HTTP ${e.status}`)}</span>
               <span class="error-n">${esc(String(e.n))}&times;</span>
             </li>`)
             .join('')}</ul>`
        : '<p class="hint has-space">Nothing refused or failed in the last seven days.</p>'}
    </div>

    <p class="disclaimer">Counts and account details only. This page cannot show anyone's
    symptoms, notes, measurements or test results, it does not reveal which kinds of things
    a person records, and there is no screen here that opens an individual health record.</p>

    <div class="actions">
      <a class="btn ghost" href="/">Back to the app</a>
      <button type="button" class="btn ghost" id="admin-signout">Sign out</button>
    </div>`;

  applyShares();
}

function refuse(message, detail, action = '<a class="btn primary" href="/">Open FitnessKinda</a>') {
  body.className = '';
  body.innerHTML = `<div class="outcome">
    <div class="outcome-mark is-sorry">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v6M12 16.5v.5"></path><circle cx="12" cy="12" r="9"></circle></svg>
    </div>
    <h1>${esc(message)}</h1>
    <p>${esc(detail)}</p>
    ${action}
  </div>`;
}

/* Sign in here rather than being sent to the app and back. Only the account named
 * in ADMIN_EMAILS on the server gets past this; anyone else is told plainly. */
function gate(note) {
  body.className = 'gate';
  body.innerHTML = `
    <h1>Admin</h1>
    <p class="lede">${esc(note || 'Sign in with the administrator account.')}</p>
    <form id="gate-form" novalidate>
      <div class="field">
        <label for="gate-email">Email</label>
        <input type="text" id="gate-email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false">
      </div>
      <div class="field">
        <label for="gate-password">Password</label>
        <div class="password-field">
          <input type="password" id="gate-password" autocomplete="current-password">
          <button type="button" class="reveal" data-reveal="gate-password" aria-label="Show password" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true" class="eye-open"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <svg viewBox="0 0 24 24" aria-hidden="true" class="eye-shut"><path d="M4 4l16 16"></path><path d="M9.5 6C10.3 5.7 11.1 5.5 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4"></path><path d="M6.3 8A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-1"></path><path d="M10 10a3 3 0 0 0 4 4"></path></svg>
          </button>
        </div>
      </div>
      <p id="gate-error" class="error" role="alert" hidden></p>
      <div class="actions"><button type="submit" class="btn primary" id="gate-submit">Sign in</button></div>
    </form>
    <div class="actions"><a class="btn ghost" href="/">Back to the app</a></div>`;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-reveal]');
  if (!button) return;
  const input = document.getElementById(button.dataset.reveal);
  const showing = button.getAttribute('aria-pressed') === 'true';
  input.type = showing ? 'password' : 'text';
  button.setAttribute('aria-pressed', String(!showing));
  button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  input.focus();
});

document.addEventListener('submit', async (event) => {
  if (event.target.id !== 'gate-form') return;
  event.preventDefault();

  const box = document.getElementById('gate-error');
  const button = document.getElementById('gate-submit');
  box.hidden = true;
  button.disabled = true;
  button.textContent = 'Signing in…';

  try {
    await api.login({
      email: document.getElementById('gate-email').value.trim(),
      password: document.getElementById('gate-password').value
    });
    load();
  } catch (err) {
    box.textContent = err.message || 'That did not work.';
    box.hidden = false;
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});

function load() {
  body.className = '';
  body.innerHTML = '<p class="hint">Loading…</p>';
  Promise.all([api.adminMetrics(), api.adminUsers()])
    .then(([metrics, { users }]) => render(metrics, users))
    .catch((err) => {
      if (err instanceof ApiError && err.status === 401) return gate();
      if (err instanceof ApiError && err.status === 403) {
        return refuse(
          'This account is not an administrator.',
          'Admin is granted by the ADMIN_EMAILS setting on the server and cannot be given from inside the app.',
          '<button type="button" class="btn primary" id="gate-again">Use another account</button>'
        );
      }
      refuse('Could not load the metrics.', err.message || 'Try again in a moment.');
    });
}

document.addEventListener('click', async (event) => {
  if (event.target.id === 'admin-signout') {
    try { await api.logout(); } catch { /* going offline is still a sign-out */ }
    gate('Signed out. Sign in again to continue.');
    return;
  }
  if (event.target.id !== 'gate-again') return;
  try { await api.logout(); } catch { /* signing out locally is enough */ }
  gate('Sign in with the administrator account.');
});

load();
