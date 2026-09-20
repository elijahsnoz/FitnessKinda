/* Pieces every screen shares. Nothing here knows what a signal is — it asks the
 * entry's own domain how to describe itself. */

import { esc, fmtDate, relativeDay, todayISO, daysBetween } from '../util.js';
import { byType } from '../registry.js';
import * as account from '../account.js';

export const ICONS = {
  health: '<path d="M12 20C7 16.5 4 13 4 9.8 4 7.1 6 5 8.6 5c1.5 0 2.7.7 3.4 1.8C12.7 5.7 13.9 5 15.4 5 18 5 20 7.1 20 9.8c0 3.2-3 6.7-8 10.2z"/>',
  move: '<path d="M4 17c3-1 4.5-4 6-7s3-5 4-5"/><circle cx="17" cy="6" r="2"/><path d="M13 20l3-5 4 2"/>',
  sleep: '<path d="M19 13.5A7.5 7.5 0 0 1 10.5 5a7.5 7.5 0 1 0 8.5 8.5z"/>',
  measure: '<path d="M4 14h3l2.5-6 3 11 2.5-7 1.5 2H20"/>',
  medication: '<rect x="3.5" y="9" width="17" height="6.5" rx="3.25"/><path d="M12 9v6.5"/>',
  malaria: '<circle cx="12" cy="12" r="7.5"/><path d="M12 8v4l2.5 1.5"/>',
  note: '<path d="M6 4h9l4 4v12H6z"/><path d="M15 4v4h4M9 13h6M9 16.5h4"/>'
};

export const icon = (name, cls = '') =>
  `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${ICONS[name] || ICONS.note}</svg>`;

/** A day heading: Today, Yesterday, or the date. */
export function dayLabel(iso) {
  const age = daysBetween(iso, todayISO());
  if (age === 0) return 'Today';
  if (age === 1) return 'Yesterday';
  return fmtDate(iso);
}

/**
 * One entry, as it appears anywhere in the app.
 * The domain supplies the words; this supplies the shape.
 */
export function entryCard(entry, { actions = true } = {}) {
  const d = byType(entry.type);
  if (!d) return '';

  const badge = d.badge(entry);
  const sub = d.subtitle(entry);
  const rows = d.rows(entry).filter(([, v]) => v);
  const quick = (d.quickActions?.(entry) || [])
    .map((a) => `<button type="button" class="btn small quiet" data-action="${esc(a.action)}" data-id="${esc(entry.id)}">${esc(a.label)}</button>`)
    .join('');

  return `<li class="event">
    <div class="event-rail" aria-hidden="true"><span class="dot dot-${esc(badge.tone || 'neutral')}"></span></div>
    <article class="event-card">
      <div class="event-head">
        <div class="event-head-main">
          <p class="event-kind">${esc(d.label)}</p>
          <p class="event-title">${esc(sub || d.label)}</p>
          <p class="event-when">${esc(relativeDay(entry.startDate))}</p>
        </div>
        ${badge.label ? `<span class="tag tone-${esc(badge.tone || 'neutral')}">${esc(badge.label)}</span>` : ''}
      </div>
      ${account.isPending(entry.id) ? '<p class="pending">Not yet saved to your account</p>' : ''}
      ${quick ? `<div class="event-actions">${quick}</div>` : ''}
      ${rows.length || actions ? `<details class="event-more">
        <summary>Details</summary>
        ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
        ${actions ? `<div class="event-actions is-end">
          <button type="button" class="btn small" data-edit="${esc(entry.id)}">Edit</button>
          <button type="button" class="btn small danger" data-delete="${esc(entry.id)}">Delete</button>
        </div>` : ''}
      </details>` : ''}
    </article>
  </li>`;
}

/** Entries grouped under day headings, newest first. */
export function groupedTimeline(entries) {
  if (!entries.length) return '';
  const byDay = new Map();
  [...entries].reverse().forEach((e) => {
    if (!byDay.has(e.startDate)) byDay.set(e.startDate, []);
    byDay.get(e.startDate).push(e);
  });

  return [...byDay]
    .map(([day, items]) => {
      const label = dayLabel(day);
      // Only Today and Yesterday need the date spelling out beside them; the rest
      // already are the date.
      const dated = label !== fmtDate(day) ? `<small>· ${esc(fmtDate(day))}</small>` : '';
      return `<li class="day">${esc(label)} ${dated}</li>` + items.map((e) => entryCard(e)).join('');
    })
    .join('');
}

export const empty = (title, line, cta = 'Add something') =>
  `<div class="empty">
    <p class="empty-title">${esc(title)}</p>
    <p>${esc(line)}</p>
    <button type="button" class="btn primary" data-add>${esc(cta)}</button>
  </div>`;

export const privacyNote = (extra = '') =>
  `<div class="note">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6z"/></svg>
    <div><p><strong>Your body. Your history. Your data.</strong> Everything you record
    stays on this device unless you choose to keep a copy in your account.</p>${extra}</div>
  </div>`;

export const insightList = (items) =>
  `<ul class="insights">${items.map((o) => `<li class="insight is-${esc(o.tone)}">
    <span class="insight-tag">${o.tone === 'notice' ? 'Notice' : o.tone === 'good' ? 'Better' : 'Kinda'}</span>
    <span>${esc(o.text)}</span>
  </li>`).join('')}</ul>`;
