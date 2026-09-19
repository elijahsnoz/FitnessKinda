/* The Account tab: signing in, the migration step, and the dashboard.
 *
 * Everything here is additive — the four original views do not know it exists.
 */

import { esc, fmtDate, plural, relativeDay } from './util.js';
import * as store from './store.js';
import * as account from './account.js';
import { primary } from './registry.js';

const domain = primary();

export function renderAccount() {
  const { mode, user, serverAvailable, pending, lastError } = account.state;

  if (mode === 'local') return user === null && !serverAvailable ? offlineSignedOut() : signedOut();
  if (mode === 'migrate') return migrationPrompt();
  return dashboard({ user, pending, lastError });
}

/* ── Signed out ────────────────────────────────────────────────── */

function signedOut() {
  return `
    <p class="lede">FitnessKinda works without an account. An account keeps a copy of your
      record so it survives a cleared browser or a lost phone.</p>

    <div class="segmented" role="tablist" id="auth-switch">
      <label><input type="radio" name="authmode" value="login" checked><span>Sign in</span></label>
      <label><input type="radio" name="authmode" value="signup"><span>Create account</span></label>
    </div>

    <form id="auth-form" novalidate>
      <div class="field" id="wrap-authname" hidden>
        <label for="auth-name">Your name</label>
        <input type="text" id="auth-name" autocomplete="name">
      </div>
      <div class="field">
        <label for="auth-email">Email</label>
        <input type="text" id="auth-email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false">
      </div>
      <div class="field">
        <label for="auth-password">Password</label>
        <input type="password" id="auth-password" autocomplete="current-password">
        <p class="hint">At least 8 characters.</p>
      </div>
      <p id="auth-error" class="error" role="alert" hidden></p>
      <div class="actions">
        <button type="submit" class="btn primary" id="auth-submit">Sign in</button>
      </div>
    </form>

    <div class="note">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6z"/></svg>
      <p>Your ${store.all().length ? `${plural(store.all().length, 'episode')} on this device stay` : 'records stay'}
         here either way. Creating an account never deletes them.</p>
    </div>`;
}

function offlineSignedOut() {
  return `
    <div class="note">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6z"/></svg>
      <div>
        <p><strong>You're offline.</strong> Signing in needs a connection.</p>
        <p>Everything you log is saved on this device as usual, and the rest of the app works normally.</p>
      </div>
    </div>`;
}

/* ── Migration ─────────────────────────────────────────────────── */

function migrationPrompt() {
  const entries = store.all();
  const first = entries[0];
  const last = entries[entries.length - 1];

  return `
    <div class="card migrate-card">
      <h3>Bring this device's records into your account</h3>
      <p class="hint">Signed in as ${esc(account.state.user.email)}.</p>
      <dl class="migrate-facts">
        <dt>On this device</dt><dd>${plural(entries.length, 'episode')}</dd>
        <dt>Covering</dt><dd>${esc(fmtDate(first.startDate))} – ${esc(fmtDate(last.startDate))}</dd>
        <dt>In your account</dt><dd>Nothing yet</dd>
      </dl>
      <p class="hint">A copy stays on this device, and a backup is kept before anything is sent.
        If the import fails, nothing changes.</p>
      <p id="migrate-error" class="error" role="alert" hidden></p>
      <div class="actions">
        <button type="button" class="btn primary" id="do-migrate">Import ${plural(entries.length, 'episode')}</button>
      </div>
      <div class="actions" style="margin-top:10px">
        <button type="button" class="btn ghost" id="sign-out">Sign out instead</button>
      </div>
    </div>`;
}

/* ── Dashboard ─────────────────────────────────────────────────── */

function dashboard({ user, pending, lastError }) {
  const entries = store.all(domain.type);
  const { tiles, ongoing } = domain.overview(entries);
  const recent = [...store.all()].reverse().slice(0, 3);
  const insights = domain.insights(entries).slice(0, 3);

  return `
    <p class="lede">Signed in as ${esc(user.name || user.email)} · ${syncLine(pending)}</p>
    ${lastError ? `<p class="error">${esc(lastError)}</p>` : ''}

    <h3 class="sub">Overview</h3>
    <div class="stats">
      ${tiles.map((t) => `<div class="stat"><b>${esc(String(t.value))}</b><span>${esc(t.label)}</span></div>`).join('')}
    </div>
    ${ongoing
      ? `<div class="note ongoing">
           <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
           <p><strong>An episode is open.</strong> Started ${esc(fmtDate(ongoing.startDate))},
              ${esc(plural(ongoing.days, 'day'))} ago and not yet marked recovered.</p>
         </div>`
      : ''}

    <h3 class="sub">Quick actions</h3>
    <div class="quick-grid">
      <button type="button" class="btn" data-goto="log">Log episode</button>
      <button type="button" class="btn" data-goto="timeline">View timeline</button>
      <button type="button" class="btn" data-goto="trends">View trends</button>
      <button type="button" class="btn" data-goto="summary">Health summary</button>
    </div>

    <h3 class="sub">Recent activity</h3>
    ${recent.length
      ? `<ul class="recent">${recent
          .map((e) => {
            const badge = domain.badge(e);
            return `<li>
              <span class="dot dot-${esc(badge.tone)}" aria-hidden="true"></span>
              <span class="recent-main">${esc(fmtDate(e.startDate))}
                <em>${esc(relativeDay(e.startDate))}${e.endDate ? '' : ' · ongoing'}</em></span>
              <span class="tag tone-${esc(badge.tone)}">${esc(badge.label)}</span>
            </li>`;
          })
          .join('')}</ul>`
      : '<p class="hint">Nothing logged yet.</p>'}

    <h3 class="sub">Patterns</h3>
    ${insights.length
      ? `<ul class="obs">${insights.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
      : '<p class="hint">Patterns appear once you have logged an episode.</p>'}

    <h3 class="sub">Account</h3>
    <div class="note">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      <div>
        <p>${esc(user.email)}</p>
        <p>Your records are saved to your account and kept on this device, so the app still
           works with no connection. Signing out leaves this device's copy untouched.</p>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="btn ghost" id="sign-out">Sign out</button>
    </div>`;
}

function syncLine(pending) {
  if (!account.state.serverAvailable) return 'offline · changes saved on this device';
  if (pending.length) return `${plural(pending.length, 'change')} waiting to sync`;
  return 'saved to your account';
}
