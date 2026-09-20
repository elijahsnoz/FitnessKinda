/* The shell: five screens, one sheet, one form.
 *
 * Every screen renders from the store; nothing caches its own copy of the data.
 * Recording is the shortest path in the app — Add, pick a kind, one screen, done. */

import { $, $$, esc, todayISO, plural } from './util.js';
import * as store from './store.js';
import * as account from './account.js';
import { Form } from './form.js';
import { DOMAINS, byType, FILTERS } from './registry.js';
import { summaryText } from './summary.js';

import { renderHome } from './views/home.js';
import { renderTimeline, setFilter } from './views/timeline.js';
import { renderMove } from './views/move.js';
import { renderHealth } from './views/health.js';
import { renderProfile } from './views/profile.js';
import { renderSummary } from './views/summary.js';
import { icon } from './views/parts.js';

const SCREENS = {
  home: renderHome,
  timeline: renderTimeline,
  move: renderMove,
  health: renderHealth,
  profile: renderProfile,
  summary: renderSummary,
  record: () => recordScreen()
};

let current = 'home';
let editing = null;      // the entry being changed, if any
let domain = null;       // the domain being recorded
let form = null;

/* ── Screens ───────────────────────────────────────────────────── */

function render() {
  const el = $(`#view-${current}`);
  if (!el || !SCREENS[current]) return;
  el.innerHTML = SCREENS[current]();
  if (current === 'record') mountForm();
}

function show(view) {
  current = view;
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  $$('.tab').forEach((t) => {
    const on = t.dataset.view === view;
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  render();
  window.scrollTo(0, 0);
}

/* ── Recording ─────────────────────────────────────────────────── */

function recordScreen() {
  const heading = editing ? `Edit this ${domain.label.toLowerCase()}` : domain.label;
  return `
    <h2 class="title" id="record-title">${esc(heading)}</h2>
    <p class="lede">${editing ? 'Change what you recorded. Nothing else moves.' : 'Only the date is required. Fill in what you know.'}</p>
    <form id="record-form" novalidate>
      <div id="record-fields"></div>
      <p id="record-error" class="error" role="alert" hidden></p>
      <div class="actions add-row">
        <button type="submit" class="btn primary">${editing ? 'Save changes' : 'Add to my timeline'}</button>
        <button type="button" class="btn ghost" data-cancel>Cancel</button>
      </div>
    </form>`;
}

function mountForm() {
  form = new Form($('#record-fields'), domain.fields);
  form.set(editing ? domain.toValues(editing) : { startDate: todayISO() });
}

function startRecording(type) {
  domain = byType(type);
  editing = null;
  closeSheet();
  show('record');
}

function startEditing(entry) {
  domain = byType(entry.type);
  if (!domain) return;
  editing = entry;
  show('record');
}

function submitRecord(event) {
  event.preventDefault();
  const values = form.values();
  const error = domain.validate(values);
  if (error) {
    const box = $('#record-error');
    box.textContent = error;
    box.hidden = false;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  const shape = domain.fromValues(values);
  const entry = editing ? { ...editing, ...shape } : store.makeEntry(domain.type, shape);

  if (!store.upsert(entry)) {
    toast('Could not save. This device’s storage is full or blocked.');
    return;
  }

  const wasEditing = !!editing;
  editing = null;
  toast(wasEditing ? 'Updated.' : 'Added to your timeline.');
  show('timeline');
}

/* ── The add sheet ─────────────────────────────────────────────── */

const BLURB = {
  health_event: 'A symptom, illness, injury or appointment',
  movement: 'A walk, a session, anything physical',
  sleep: 'How last night went',
  measurement: 'Weight, blood pressure, temperature',
  medication: 'Something you are taking',
  malaria_episode: 'A malaria episode, tracked in detail',
  note: 'Anything that does not fit a field'
};

function openSheet() {
  $('#sheet-root').innerHTML = `
    <div class="sheet-backdrop" data-close-sheet></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-grab"></div>
      <h2 id="sheet-title">What would you like to record?</h2>
      <p class="hint">It takes a few seconds and goes straight onto your timeline.</p>
      <div class="sheet-list">
        ${DOMAINS.map((d) => `<button type="button" class="sheet-item" data-record="${esc(d.type)}">
          ${icon(d.icon)}
          <span>${esc(d.label)}<small>${esc(BLURB[d.type] || '')}</small></span>
        </button>`).join('')}
      </div>
      <div class="actions">
        <button type="button" class="btn ghost" data-close-sheet>Not now</button>
      </div>
    </div>`;
  const first = $('.sheet-item');
  if (first) first.focus();
}

const closeSheet = () => { $('#sheet-root').innerHTML = ''; };

/* ── Small helpers ─────────────────────────────────────────────── */

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, 2600);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── Wiring ────────────────────────────────────────────────────── */

function init() {
  store.load();

  $$('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));

  document.addEventListener('click', async (event) => {
    const el = event.target.closest('button, [data-close-sheet]');
    if (!el) return;

    if (el.hasAttribute('data-add')) return openSheet();
    if (el.hasAttribute('data-close-sheet')) return closeSheet();
    if (el.dataset.record) return startRecording(el.dataset.record);
    if (el.dataset.goto) return show(el.dataset.goto);
    if (el.hasAttribute('data-cancel')) { editing = null; return show('timeline'); }

    if (el.dataset.filter) { setFilter(el.dataset.filter); return render(); }

    if (el.dataset.edit) {
      const entry = store.get(el.dataset.edit);
      if (entry) startEditing(entry);
      return;
    }

    if (el.dataset.delete) {
      if (!confirm('Remove this from your record? This cannot be undone.')) return;
      store.remove(el.dataset.delete);
      render();
      return toast('Removed.');
    }

    if (el.dataset.action) {
      const entry = store.get(el.dataset.id);
      const d = entry && byType(entry.type);
      const result = d && d.applyAction(entry, el.dataset.action);
      if (!result) return;
      if (!store.upsert(result.entry)) return toast('Could not save.');
      render();
      return toast(result.message);
    }

    /* Account */
    if (el.id === 'do-migrate') {
      const box = $('#migrate-error');
      box.hidden = true;
      el.disabled = true;
      el.textContent = 'Importing…';
      try {
        const report = await account.migrate();
        render();
        toast(`Imported ${report.imported} into your account`);
      } catch (err) {
        box.textContent = `${err.message} Nothing was imported; your records are still here.`;
        box.hidden = false;
        el.disabled = false;
        el.textContent = 'Try again';
      }
      return;
    }

    if (el.dataset.reveal) {
      const input = $(`#${el.dataset.reveal}`);
      const showing = el.getAttribute('aria-pressed') === 'true';
      input.type = showing ? 'password' : 'text';
      el.setAttribute('aria-pressed', String(!showing));
      el.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      input.focus();
      return;
    }

    if (el.id === 'forgot') {
      const email = $('#auth-email').value.trim();
      const box = $('#auth-error');
      if (!email) {
        box.textContent = 'Enter your email above and I will send a link to it.';
        box.hidden = false;
        $('#auth-email').focus();
        return;
      }
      el.disabled = true;
      el.textContent = 'Sending…';
      try {
        await (await import('./api.js')).api.requestReset(email);
        box.hidden = true;
        /* The same words whether or not that address has an account: saying
           otherwise would tell a stranger something about someone's health. */
        toast('If that address has an account, a link is on its way.');
      } catch (err) {
        toast(err.message || 'Could not send it just now.');
      }
      el.disabled = false;
      el.textContent = 'Forgotten your password?';
      return;
    }

    if (el.id === 'resend-verify') {
      el.disabled = true;
      el.textContent = 'Sending…';
      try {
        const { sent } = await (await import('./api.js')).api.resendVerification();
        toast(sent ? 'Link sent. Check your email.' : 'Email is not switched on yet for this site.');
      } catch (err) {
        toast(err.message || 'Could not send it just now.');
      }
      el.disabled = false;
      el.textContent = 'Send the link again';
      return;
    }

    if (el.id === 'sign-out') {
      await account.logout();
      render();
      return toast('Signed out. Your records stay on this device');
    }

    /* Summary and backups */
    if (el.id === 'copy-summary') {
      try {
        await navigator.clipboard.writeText(summaryText());
        toast('Summary copied');
      } catch { toast('Copy blocked. Select the text instead.'); }
      return;
    }
    if (el.id === 'download-summary') return download(`fitnesskinda-summary-${todayISO()}.txt`, summaryText(), 'text/plain');
    if (el.id === 'print-summary') return window.print();
    if (el.id === 'export-json') return download(`fitnesskinda-backup-${todayISO()}.json`, store.exportJSON(), 'application/json');
    if (el.id === 'import-json') return $('#import-file').click();
  });

  document.addEventListener('submit', async (event) => {
    if (event.target.id === 'record-form') return submitRecord(event);
    if (event.target.id !== 'auth-form') return;

    event.preventDefault();
    const mode = ($('input[name="authmode"]:checked') || {}).value || 'login';
    const box = $('#auth-error');

    if (mode === 'signup' && $('#auth-password').value !== $('#auth-confirm').value) {
      box.textContent = 'Those two passwords are not the same.';
      box.hidden = false;
      $('#auth-confirm').focus();
      return;
    }

    if (mode === 'signup' && !$('#auth-terms').checked) {
      box.textContent = 'Please accept the terms and the privacy notice to continue.';
      box.hidden = false;
      return;
    }

    const payload = {
      email: $('#auth-email').value.trim(),
      password: $('#auth-password').value,
      ...(mode === 'signup'
        ? { name: $('#auth-name').value.trim(), acceptedTerms: $('#auth-terms').checked }
        : {})
    };
    const button = $('#auth-submit');
    box.hidden = true;
    button.disabled = true;
    button.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';
    try {
      await (mode === 'signup' ? account.signup(payload) : account.login(payload));
      render();
      toast(mode === 'signup' ? 'Account created' : 'Signed in');
    } catch (err) {
      box.textContent = err.message || 'That did not work.';
      box.hidden = false;
      button.disabled = false;
      button.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.name === 'authmode') {
      const signup = event.target.value === 'signup';
      $('#wrap-authname').hidden = !signup;
      $('#wrap-authconfirm').hidden = !signup;
      $('#wrap-consent').hidden = !signup;
      $('#wrap-forgot').hidden = signup;
      if (!signup) $('#auth-confirm').value = '';
      $('#auth-submit').textContent = signup ? 'Create account' : 'Sign in';
      $('#auth-password').autocomplete = signup ? 'new-password' : 'current-password';
      return;
    }

    if (event.target.id === 'import-file') {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const n = store.all().length;
        if (!confirm(`Replace the ${n} ${n === 1 ? 'entry' : 'entries'} on this device with this file?`)) return;
        try {
          const count = store.importJSON(reader.result);
          render();
          toast(`Restored ${count} ${count === 1 ? 'entry' : 'entries'}`);
        } catch { toast('That file could not be read.'); }
      };
      reader.readAsText(file);
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id !== 'auth-confirm' && event.target.id !== 'auth-password') return;
    const confirmWrap = $('#wrap-authconfirm');
    if (!confirmWrap || confirmWrap.hidden) return;

    const password = $('#auth-password').value;
    const again = $('#auth-confirm').value;
    const hint = $('#confirm-hint');
    hint.classList.remove('is-match', 'is-mismatch');

    if (!again) {
      hint.textContent = 'There is no password reset yet, so a typo here would cost you the account.';
    } else if (password === again) {
      hint.textContent = 'They match.';
      hint.classList.add('is-match');
    } else {
      hint.textContent = 'These do not match yet.';
      hint.classList.add('is-mismatch');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('.sheet')) closeSheet();
  });

  account.onChange(() => render());
  account.start();

  show('home');
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();

/* Offline: the shell is cached on the first visit, so the app opens with no
 * connection and reads from the copy on the device. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  });
}
