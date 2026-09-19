/* Wiring: four views over one health record. */

import { $, $$, esc, fmtDate, relativeDay, todayISO, daysBetween, plural } from './util.js';
import * as store from './store.js';
import { Form } from './form.js';
import { DOMAINS, primary } from './registry.js';
import { byYearDesc } from './analytics.js';
import { barChart } from './charts.js';
import { summaryText } from './summary.js';
import * as account from './account.js';
import { renderAccount } from './account-view.js';

const domain = primary();
let form;
let editingId = null;

/* ── Log ──────────────────────────────────────────────────────── */

function startNew() {
  editingId = null;
  form.reset();
  form.set({ startDate: todayISO(), testResult: 'not_tested' });
  $('#form-error').hidden = true;
  $('#save-btn').textContent = 'Save episode';
  $('#cancel-edit').hidden = true;
  $('#log-lede').textContent = 'Log it in a few taps. The date is already set to today.';
}

function startEdit(entry) {
  editingId = entry.id;
  form.set(domain.toValues(entry));
  $('#form-error').hidden = true;
  $('#save-btn').textContent = 'Update entry';
  $('#cancel-edit').hidden = false;
  $('#log-lede').textContent = `Editing the episode from ${fmtDate(entry.startDate)}.`;
  show('log');
}

function submit(e) {
  e.preventDefault();
  const values = form.values();
  const error = domain.validate(values);
  if (error) {
    $('#form-error').textContent = error;
    $('#form-error').hidden = false;
    $('#form-error').scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  const shape = domain.fromValues(values);
  const existing = editingId ? store.get(editingId) : null;
  const entry = existing
    ? { ...existing, ...shape }
    : store.makeEntry(domain.type, shape);

  if (!store.upsert(entry)) {
    toast('Could not save — this device’s storage is full or blocked.');
    return;
  }

  toast(existing ? 'Entry updated' : 'Episode saved');
  startNew();
  show('timeline');
}

/* ── Timeline ─────────────────────────────────────────────────── */

function renderTimeline() {
  const entries = store.all();

  $('#timeline-stats').innerHTML = domain.metrics(store.all(domain.type))
    .map((m) => `<div class="stat"><b>${esc(String(m.value))}</b><span>${esc(m.label)}</span></div>`)
    .join('');

  if (!entries.length) {
    $('#timeline').innerHTML = empty('Nothing recorded yet.', 'Your timeline builds itself as you log.');
    return;
  }

  // Newest first, grouped by year, with the gap back to the previous entry.
  const gapBefore = new Map();
  entries.forEach((e, i) => {
    if (i > 0) gapBefore.set(e.id, daysBetween(entries[i - 1].startDate, e.startDate));
  });

  $('#timeline').innerHTML = byYearDesc(entries)
    .map(
      (group) =>
        `<li class="year"><span>${group.year}</span></li>` +
        group.entries.map((e) => entryCard(e, gapBefore.get(e.id))).join('')
    )
    .join('');
}

function entryCard(entry, gap) {
  const d = DOMAINS.find((x) => x.type === entry.type) || domain;
  const badge = d.badge(entry);
  const sub = d.subtitle(entry);
  const rows = d.rows(entry);
  const quick = (d.quickActions?.(entry) || [])
    .map((a) => `<button type="button" class="btn small quick" data-action="${esc(a.action)}" data-id="${esc(entry.id)}">${esc(a.label)}</button>`)
    .join('');

  return `<li class="event">
    <div class="event-rail" aria-hidden="true"><span class="dot dot-${esc(badge.tone)}"></span></div>
    <article class="card event-card">
      <header class="event-head">
        <div>
          <p class="event-date">${esc(fmtDate(entry.startDate))}</p>
          <p class="event-ago">${esc(relativeDay(entry.startDate))}${gap != null ? ` · ${esc(plural(gap, 'day'))} after the previous` : ''}</p>
        </div>
        <span class="tag tone-${esc(badge.tone)}">${esc(badge.label)}</span>
      </header>
      ${sub ? `<p class="event-sub">${esc(sub)}</p>` : ''}
      ${account.isPending(entry.id) ? '<p class="pending">Not yet saved to your account</p>' : ''}
      ${quick ? `<div class="event-actions">${quick}</div>` : ''}
      <details class="event-more">
        <summary>Details</summary>
        <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="actions">
          <button type="button" class="btn small" data-edit="${esc(entry.id)}">Edit</button>
          <button type="button" class="btn small danger" data-delete="${esc(entry.id)}">Delete</button>
        </div>
      </details>
    </article>
  </li>`;
}

/* ── Trends ───────────────────────────────────────────────────── */

function renderTrends() {
  const entries = store.all(domain.type);

  if (!entries.length) {
    $('#trends-body').innerHTML = empty('No trends yet.', 'Charts appear as soon as you log your first episode.');
    return;
  }

  const charts = domain
    .charts(entries)
    .map(
      (c) => `<section class="card">
        <h3>${esc(c.title)}</h3>
        <p class="hint">${esc(c.hint)}</p>
        ${barChart(c.data)}
      </section>`
    )
    .join('');

  const insights = `<section class="card">
    <h3>What your record shows</h3>
    <ul class="obs">${domain.insights(entries).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  </section>`;

  $('#trends-body').innerHTML = charts + insights;
}

/* ── Summary ──────────────────────────────────────────────────── */

function renderSummary() {
  $('#summary-text').textContent = summaryText();
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── Views ────────────────────────────────────────────────────── */

const RENDER = {
  timeline: renderTimeline,
  trends: renderTrends,
  summary: renderSummary,
  account: () => { $('#account-body').innerHTML = renderAccount(); }
};

function show(view) {
  currentView = view;
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  $$('.tab').forEach((t) => {
    const on = t.dataset.view === view;
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  RENDER[view]?.();
  window.scrollTo(0, 0);
}

function empty(title, line) {
  return `<div class="empty"><p class="empty-title">${esc(title)}</p><p>${esc(line)}</p>
    <button type="button" class="btn primary" data-goto="log">Log an episode</button></div>`;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ── Init ─────────────────────────────────────────────────────── */

function init() {
  store.load();

  form = new Form($('#form-fields'), domain.fields);
  startNew();

  $$('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));
  $('#episode-form').addEventListener('submit', submit);
  $('#cancel-edit').addEventListener('click', () => { startNew(); });

  $('#main').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.goto) return show(btn.dataset.goto);

    if (btn.dataset.action) {
      const entry = store.get(btn.dataset.id);
      const result = entry && domain.applyAction(entry, btn.dataset.action);
      if (!result) return;
      if (!store.upsert(result.entry)) return toast('Could not save — this device’s storage is full or blocked.');
      renderTimeline();
      toast(result.message);
      return;
    }

    if (btn.dataset.edit) {
      const entry = store.get(btn.dataset.edit);
      if (entry) startEdit(entry);
      return;
    }

    if (btn.dataset.delete) {
      if (!confirm('Delete this entry? This cannot be undone.')) return;
      store.remove(btn.dataset.delete);
      if (editingId === btn.dataset.delete) startNew();
      renderTimeline();
      toast('Entry deleted');
    }
  });

  $('#copy-summary').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(summaryText());
      toast('Summary copied');
    } catch {
      toast('Copy blocked — select the text instead.');
    }
  });

  $('#download-summary').addEventListener('click', () =>
    download(`fitnesskinda-summary-${todayISO()}.txt`, summaryText(), 'text/plain'));

  $('#print-summary').addEventListener('click', () => window.print());

  $('#export-json').addEventListener('click', () =>
    download(`fitnesskinda-backup-${todayISO()}.json`, store.exportJSON(), 'application/json'));

  $('#import-json').addEventListener('click', () => $('#import-file').click());

  $('#import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const current = store.all().length;
      if (!confirm(`Replace the ${current} entr${current === 1 ? 'y' : 'ies'} on this device with the contents of this file?`)) return;
      try {
        const n = store.importJSON(reader.result);
        renderSummary();
        toast(`Imported ${n} ${n === 1 ? 'entry' : 'entries'}`);
      } catch {
        toast('That file could not be read.');
      }
    };
    reader.readAsText(file);
  });

  /* ── Account tab ── */

  $('#main').addEventListener('change', (e) => {
    if (e.target.name === 'authmode') {
      const signup = e.target.value === 'signup';
      $('#wrap-authname').hidden = !signup;
      $('#auth-submit').textContent = signup ? 'Create account' : 'Sign in';
      $('#auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    }
  });

  $('#main').addEventListener('submit', async (e) => {
    if (e.target.id !== 'auth-form') return;
    e.preventDefault();

    const mode = ($('input[name="authmode"]:checked') || {}).value || 'login';
    const payload = {
      email: $('#auth-email').value.trim(),
      password: $('#auth-password').value,
      ...(mode === 'signup' ? { name: $('#auth-name').value.trim() } : {})
    };

    const error = $('#auth-error');
    const button = $('#auth-submit');
    error.hidden = true;
    button.disabled = true;
    button.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';

    try {
      await (mode === 'signup' ? account.signup(payload) : account.login(payload));
      renderCurrentView();
      toast(mode === 'signup' ? 'Account created' : 'Signed in');
    } catch (err) {
      error.textContent = err.message || 'That did not work.';
      error.hidden = false;
      button.disabled = false;
      button.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    }
  });

  $('#main').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.id === 'do-migrate') {
      const error = $('#migrate-error');
      error.hidden = true;
      btn.disabled = true;
      btn.textContent = 'Importing…';
      try {
        const report = await account.migrate();
        renderCurrentView();
        toast(`Imported ${report.imported} of ${store.all().length} into your account`);
      } catch (err) {
        // Nothing was imported and nothing was lost — say so plainly.
        error.textContent = `${err.message} Nothing was imported; your records are still on this device.`;
        error.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Try again';
      }
      return;
    }

    if (btn.id === 'sign-out') {
      await account.logout();
      renderCurrentView();
      toast('Signed out — your records stay on this device');
    }
  });

  // Anything the sync layer changes should show up wherever the user is looking.
  account.onChange(() => renderCurrentView());
  account.start();

  show('log');
}

let currentView = 'log';

function renderCurrentView() {
  RENDER[currentView]?.();
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();

// Offline: the app shell is cached on the first visit so it opens without a network.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  });
}
