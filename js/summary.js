/* The doctor-friendly summary: plain text, no jargon, no interpretation beyond
 * what was recorded. Built from each domain's own summary block, so a new signal
 * appears here automatically. */

import { DOMAINS } from './registry.js';
import * as store from './store.js';
import { fmtDate, todayISO } from './util.js';

const WIDTH = 44; // fits a phone screen and a plain-text viewer without wrapping oddly

/** Wrap prose at WIDTH, keeping the bullet's hanging indent. */
function wrap(text, indent = '  - ') {
  const hang = ' '.repeat(indent.length);
  const lines = [];
  let line = indent;

  text.split(/\s+/).forEach((word) => {
    if (line.trim() && line.length + word.length + 1 > WIDTH) {
      lines.push(line);
      line = hang;
    }
    line += (line === indent || line === hang ? '' : ' ') + word;
  });
  if (line.trim()) lines.push(line);
  return lines;
}

/**
 * @param {{isEmpty: () => boolean, all: (type: string) => object[]}} [source]
 *   Defaults to the device's own store. The server passes an adapter over the
 *   database so both sides produce a byte-identical summary from one generator.
 */
export function summaryText(source = store) {
  const L = [];

  L.push('FITNESSKINDA — PERSONAL HEALTH SUMMARY');
  L.push(`Generated ${fmtDate(todayISO())}`);
  L.push('Self-reported record kept by the patient.');
  L.push('Not a medical document.');
  L.push('');

  if (source.isEmpty()) {
    L.push('Nothing recorded yet.');
    return L.join('\n');
  }

  DOMAINS.forEach((domain) => {
    const entries = source.all(domain.type);
    if (!entries.length) return;

    L.push(domain.plural.toUpperCase());
    L.push('═'.repeat(40));
    L.push('');
    L.push(...domain.summary(entries));
    L.push('');

    const insights = domain.insights(entries);
    if (insights.length) {
      L.push('PATTERNS IN THIS RECORD');
      insights.forEach((i) => L.push(...wrap(i)));
      L.push('');
    }
  });

  L.push('─'.repeat(40));
  L.push(...wrap('This summary describes only what the patient entered. It does not diagnose any condition and does not recommend any medication.', ''));

  return L.join('\n');
}
