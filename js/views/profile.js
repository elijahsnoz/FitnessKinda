/* Profile answers: who controls my information?
 *
 * Account, privacy and the export live together, because they are the same
 * question asked three ways. */

import { esc, plural, fmtDate } from '../util.js';
import * as store from '../store.js';
import * as account from '../account.js';
import { privacyNote } from './parts.js';

const syncLine = () => {
  if (account.state.mode === 'local') return 'Kept on this device';
  if (!account.state.serverAvailable) return 'Offline · saved on this device';
  if (account.state.pending.length) return `${plural(account.state.pending.length, 'change')} waiting to sync`;
  return 'Saved to your account';
};

export function renderProfile() {
  const { mode, user, lastError } = account.state;
  const all = store.all();
  const oldest = all[0];

  const record = `
    <div class="section-title">Your record</div>
    <div class="snapshot">
      <div class="snap"><span class="snap-label">Entries</span><b class="snap-value">${all.length}</b></div>
      <div class="snap"><span class="snap-label">Since</span><b class="snap-value" style="font-size:16px">${oldest ? esc(fmtDate(oldest.startDate)) : '-'}</b></div>
    </div>`;

  const data = `
    <div class="section-title">Your data</div>
    ${privacyNote(`<p>Phone browsers clear stored data from time to time. Keep a copy
      somewhere safe, and adding FitnessKinda to your home screen helps your phone hold on to it.</p>`)}
    <div class="actions" style="margin-top:12px">
      <button type="button" class="btn" id="export-json">Export a backup</button>
      <button type="button" class="btn" id="import-json">Restore a backup</button>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>
    <div class="actions" style="margin-top:10px">
      <button type="button" class="btn ghost" data-goto="summary">Health summary</button>
    </div>`;

  if (mode === 'local') {
    const form = account.state.serverAvailable ? `
      <div class="segmented" role="tablist" id="auth-switch" style="margin-bottom:20px">
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
        <div class="actions"><button type="submit" class="btn primary" id="auth-submit">Sign in</button></div>
      </form>`
      : `<div class="card"><p style="margin:0;font-size:14.5px;color:var(--text-soft)">
          You're offline, so signing in will have to wait. Everything you record is saved on
          this device as usual.</p></div>`;

    return `
      <h2 class="title" id="profile-title">Your information.</h2>
      <p class="lede">FitnessKinda works without an account. One keeps a copy of your record
      so it survives a cleared browser or a lost phone.</p>
      ${form}
      ${record}
      ${data}`;
  }

  if (mode === 'migrate') {
    const entries = store.all();
    return `
      <h2 class="title" id="profile-title">Bring your record with you.</h2>
      <p class="lede">Signed in as ${esc(user.email)}.</p>
      <div class="card">
        <div class="snapshot" style="margin-bottom:16px">
          <div class="snap"><span class="snap-label">On this device</span><b class="snap-value">${entries.length}</b></div>
          <div class="snap"><span class="snap-label">In your account</span><b class="snap-value">0</b></div>
        </div>
        <p class="hint" style="margin-bottom:16px">A copy stays on this device, and a backup is
        kept before anything is sent. If the import fails, nothing changes.</p>
        <p id="migrate-error" class="error" role="alert" hidden></p>
        <div class="actions">
          <button type="button" class="btn primary" id="do-migrate">Import ${plural(entries.length, 'entry').replace('entrys', 'entries')}</button>
        </div>
        <div class="actions" style="margin-top:10px">
          <button type="button" class="btn ghost" id="sign-out">Sign out instead</button>
        </div>
      </div>`;
  }

  return `
    <h2 class="title" id="profile-title">${esc(user.name || user.email)}</h2>
    <p class="lede">${esc(syncLine())}.</p>
    ${lastError ? `<p class="error">${esc(lastError)}</p>` : ''}
    ${record}
    ${data}
    <div class="section-title">Account</div>
    <div class="card">
      <p style="margin:0 0 14px;font-size:14.5px;color:var(--text-soft)">${esc(user.email)}</p>
      <div class="actions"><button type="button" class="btn ghost" id="sign-out">Sign out</button></div>
      <p class="hint">Signing out leaves this device's copy exactly where it is.</p>
    </div>`;
}
