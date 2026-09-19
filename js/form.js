/* A form built from a domain's field specs.
 *
 * Domains describe what they track; this renders it, reads it back and fills it
 * for editing. A future signal (sleep, hydration, exercise …) ships its own field
 * list and gets a working logging screen with no new UI code.
 *
 * Field spec:
 *   { key, type, label, hint, required, scope, options, placeholder, showIf, quickDates }
 *   type:  date | chips | choice | select | text | textarea | number
 *   scope: 'data' (default) | 'envelope'  — envelope keys live on the entry itself
 *   showIf: (values) => boolean           — conditional fields, re-evaluated on change
 */

import { $, $$, esc, todayISO, shiftISO } from './util.js';

export class Form {
  constructor(root, fields) {
    this.root = root;
    this.fields = fields;
    this.render();
  }

  render() {
    this.root.innerHTML = this.fields.map((f) => fieldHTML(f)).join('');
    this.root.addEventListener('change', () => this.syncVisibility());

    // Quick date buttons — the difference between logging in 3 seconds and not logging.
    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-quick-date]');
      if (!btn) return;
      const input = $(`#f-${btn.dataset.for}`, this.root);
      input.value = btn.dataset.quickDate === 'today' ? todayISO() : shiftISO(todayISO(), -1);
      this.syncVisibility();
    });

    this.syncVisibility();
  }

  /** { key: value } for every field, whatever its scope. */
  values() {
    const out = {};
    this.fields.forEach((f) => {
      out[f.key] = readField(this.root, f);
    });
    return out;
  }

  set(values) {
    this.fields.forEach((f) => writeField(this.root, f, values[f.key]));
    this.syncVisibility();
  }

  reset() {
    this.fields.forEach((f) => writeField(this.root, f, f.type === 'chips' ? [] : ''));
    this.syncVisibility();
  }

  syncVisibility() {
    const values = this.values();
    this.fields.forEach((f) => {
      if (!f.showIf) return;
      $(`#wrap-${f.key}`, this.root).hidden = !f.showIf(values);
    });
  }

  focusFirst() {
    const first = $('input, select, textarea', this.root);
    if (first) first.focus();
  }
}

/* ── Rendering ────────────────────────────────────────────────── */

function fieldHTML(f) {
  const id = `f-${f.key}`;
  const label = `${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}`;
  const hint = f.hint ? `<p class="hint">${esc(f.hint)}</p>` : '';
  let control = '';

  switch (f.type) {
    case 'date':
      control = `<input type="date" id="${id}" ${f.required ? 'required' : ''}>` +
        (f.quickDates
          ? `<div class="quick-dates">
               <button type="button" class="btn small" data-quick-date="today" data-for="${f.key}">Today</button>
               <button type="button" class="btn small" data-quick-date="yesterday" data-for="${f.key}">Yesterday</button>
             </div>`
          : '');
      break;

    case 'chips':
      control =
        `<div class="chips">${f.options
          .map((o) => `<label class="chip"><input type="checkbox" name="${f.key}" value="${esc(o)}">${esc(o)}</label>`)
          .join('')}</div>` +
        `<input type="text" id="${id}-other" class="chip-other" placeholder="${esc(f.placeholder || 'Anything else (comma separated)')}" autocomplete="off">`;
      break;

    case 'choice':
      control =
        `<div class="segmented" role="radiogroup" aria-label="${esc(f.label)}">${f.options
          .map(
            (o, i) =>
              `<label><input type="radio" name="${f.key}" value="${esc(o.value)}" ${i === 0 && f.defaultFirst !== false ? 'checked' : ''}><span>${esc(o.label)}</span></label>`
          )
          .join('')}</div>`;
      break;

    case 'select':
      control =
        `<select id="${id}"><option value="">Select…</option>${f.options
          .map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`)
          .join('')}</select>`;
      break;

    case 'textarea':
      control = `<textarea id="${id}" rows="${f.rows || 2}" placeholder="${esc(f.placeholder || '')}"></textarea>`;
      break;

    case 'number':
      control = `<input type="number" id="${id}" inputmode="decimal" placeholder="${esc(f.placeholder || '')}">`;
      break;

    default:
      control = `<input type="text" id="${id}" placeholder="${esc(f.placeholder || '')}" autocomplete="off">`;
  }

  const tag = f.type === 'chips' || f.type === 'choice' ? 'fieldset' : 'div';
  const caption = f.type === 'chips' || f.type === 'choice'
    ? `<legend>${label}</legend>`
    : `<label for="${id}">${label}</label>`;

  return `<${tag} class="field" id="wrap-${f.key}">${caption}${control}${hint}</${tag}>`;
}

/* ── Read / write ─────────────────────────────────────────────── */

function readField(root, f) {
  if (f.type === 'chips') {
    const checked = $$(`input[name="${f.key}"]:checked`, root).map((i) => i.value);
    const other = $(`#f-${f.key}-other`, root)
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return [...checked, ...other];
  }
  if (f.type === 'choice') {
    const picked = $(`input[name="${f.key}"]:checked`, root);
    return picked ? picked.value : '';
  }
  const el = $(`#f-${f.key}`, root);
  return el ? el.value.trim() : '';
}

function writeField(root, f, value) {
  if (f.type === 'chips') {
    const list = Array.isArray(value) ? value : [];
    const known = new Set(f.options);
    $$(`input[name="${f.key}"]`, root).forEach((i) => { i.checked = list.includes(i.value); });
    $(`#f-${f.key}-other`, root).value = list.filter((v) => !known.has(v)).join(', ');
    return;
  }
  if (f.type === 'choice') {
    const target = $(`input[name="${f.key}"][value="${CSS.escape(value || '')}"]`, root);
    if (target) target.checked = true;
    else {
      const fallback = $(`input[name="${f.key}"]`, root);
      if (fallback) fallback.checked = true;
    }
    return;
  }
  const el = $(`#f-${f.key}`, root);
  if (el) el.value = value == null ? '' : value;
}
