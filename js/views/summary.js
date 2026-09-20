/* The health summary: everything recorded, organised for someone else to read. */

import { summaryText } from '../summary.js';
import * as store from '../store.js';

export function renderSummary() {
  return `
    <h2 class="title" id="summary-title">Your health history, organized.</h2>
    <p class="lede">A plain record of everything you kept, made to hand to a clinician.
    Nothing leaves this device until you send it.</p>
    <div class="actions">
      <button type="button" class="btn primary" id="copy-summary">Copy</button>
      <button type="button" class="btn" id="download-summary">Download</button>
      <button type="button" class="btn" id="print-summary">Print</button>
    </div>
    <pre id="summary-text" class="summary">${escapeHtml(summaryText())}</pre>
    <div class="actions">
      <button type="button" class="btn ghost" data-goto="health">Back to your record</button>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
