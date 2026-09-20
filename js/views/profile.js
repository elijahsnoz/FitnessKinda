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
      <div class="snap"><span class="snap-label">Since</span><b class="snap-value is-small">${oldest ? esc(fmtDate(oldest.startDate)) : '-'}</b></div>
    </div>`;

  const data = `
    <div class="section-title">Your data</div>
    ${privacyNote(`<p>Phone browsers clear stored data from time to time. Keep a copy
      somewhere safe, and adding FitnessKinda to your home screen helps your phone hold on to it.</p>`)}
    <div class="actions">
      <button type="button" class="btn" id="export-json">Export a backup</button>
      <button type="button" class="btn" id="import-json">Restore a backup</button>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>
    <div class="actions">
      <button type="button" class="btn ghost" data-goto="summary">Health summary</button>
    </div>`;

  if (mode === 'local') {
    const form = account.state.serverAvailable ? `
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
          <div class="password-field">
            <input type="password" id="auth-password" autocomplete="current-password">
            <button type="button" class="reveal" data-reveal="auth-password"
              aria-label="Show password" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true" class="eye-open"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="3"></circle></svg><svg viewBox="0 0 24 24" aria-hidden="true" class="eye-shut"><path d="M4 4l16 16"></path><path d="M9.5 6C10.3 5.7 11.1 5.5 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4"></path><path d="M6.3 8A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-1"></path><path d="M10 10a3 3 0 0 0 4 4"></path></svg></button>
          </div>
          <p class="hint">At least 8 characters.</p>
        </div>
        <div class="field" id="wrap-authconfirm" hidden>
          <label for="auth-confirm">Type it again</label>
          <div class="password-field">
            <input type="password" id="auth-confirm" autocomplete="new-password">
            <button type="button" class="reveal" data-reveal="auth-confirm"
              aria-label="Show password" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true" class="eye-open"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="3"></circle></svg><svg viewBox="0 0 24 24" aria-hidden="true" class="eye-shut"><path d="M4 4l16 16"></path><path d="M9.5 6C10.3 5.7 11.1 5.5 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4"></path><path d="M6.3 8A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-1"></path><path d="M10 10a3 3 0 0 0 4 4"></path></svg></button>
          </div>
          <p class="hint" id="confirm-hint">There is no password reset yet, so a typo here
          would cost you the account.</p>
        </div>
        <label class="consent" id="wrap-consent" hidden>
          <input type="checkbox" id="auth-terms">
          <span>I have read and accept the <a href="/terms" target="_blank" rel="noopener">terms of use</a>
          and the <a href="/privacy" target="_blank" rel="noopener">privacy notice</a>, and I understand
          that FitnessKinda does not give medical advice.</span>
        </label>
        <p id="auth-error" class="error" role="alert" hidden></p>
        <div class="actions"><button type="submit" class="btn primary" id="auth-submit">Sign in</button></div>
        <div class="actions" id="wrap-forgot">
          <button type="button" class="btn ghost" id="forgot">Forgotten your password?</button>
        </div>
      </form>`
      : `<div class="card"><p class="card-note">
          You're offline, so signing in will have to wait. Everything you record is saved on
          this device as usual.</p></div>`;

    return `
      <h2 class="title" id="profile-title">Your information.</h2>
      <p class="lede">FitnessKinda works without an account. One keeps a copy of your record
      so it survives a cleared browser or a lost phone.</p>
      ${form}
      ${record}
      ${data}
      <div class="section-title">The small print</div>
      <div class="card small-print">
        <p>FitnessKinda keeps a record of what you tell it. It does not give medical
        advice, and it does not diagnose anything.</p>
        <a class="link-row" href="/terms">Terms of use
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg></a>
        <a class="link-row" href="/privacy">Privacy notice
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg></a>
      </div>`;
  }

  if (mode === 'migrate') {
    const entries = store.all();
    return `
      <h2 class="title" id="profile-title">Bring your record with you.</h2>
      <p class="lede">Signed in as ${esc(user.email)}.</p>
      <div class="card">
        <div class="snapshot">
          <div class="snap"><span class="snap-label">On this device</span><b class="snap-value">${entries.length}</b></div>
          <div class="snap"><span class="snap-label">In your account</span><b class="snap-value">0</b></div>
        </div>
        <p class="hint">A copy stays on this device, and a backup is
        kept before anything is sent. If the import fails, nothing changes.</p>
        <p id="migrate-error" class="error" role="alert" hidden></p>
        <div class="actions">
          <button type="button" class="btn primary" id="do-migrate">Import ${plural(entries.length, 'entry').replace('entrys', 'entries')}</button>
        </div>
        <div class="actions">
          <button type="button" class="btn ghost" id="sign-out">Sign out instead</button>
        </div>
      </div>`;
  }

  const unverified = user.emailVerified === false;

  return `
    <h2 class="title" id="profile-title">${esc(user.name || user.email)}</h2>
    <p class="lede">${esc(syncLine())}.</p>
    ${lastError ? `<p class="error">${esc(lastError)}</p>` : ''}
    ${unverified ? `<div class="note verify-note">
      <div class="note-row">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7h17v10h-17z"></path><path d="m3.5 7.5 8.5 6 8.5-6"></path></svg>
        <div><p><strong>Confirm your email.</strong> We sent a link to ${esc(user.email)}.
        Your account works either way; confirming it is what will let you recover the
        account if you ever forget your password.</p></div>
      </div>
      <div class="actions">
        <button type="button" class="btn small" id="resend-verify">Send the link again</button>
      </div>
    </div>` : ''}
    ${record}
    ${data}
    <div class="section-title">The small print</div>
    <div class="card small-print">
      <p>FitnessKinda keeps a record of what you tell it. It does not give medical
      advice, and it does not diagnose anything.</p>
      <a class="link-row" href="/terms">Terms of use
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg></a>
      <a class="link-row" href="/privacy">Privacy notice
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg></a>
    </div>

    <div class="section-title">Account</div>
    <div class="card">
      <p class="card-note has-space">${esc(user.email)}</p>
      <div class="actions"><button type="button" class="btn ghost" id="sign-out">Sign out</button></div>
      <p class="hint">Signing out leaves this device's copy exactly where it is.</p>
    </div>`;
}
