/* Hand-rolled SVG charts. A charting library would be many times the size of this
 * whole app, and the app only ever needs bars. */

import { esc } from './util.js';

const round = (n) => Math.round(n * 10) / 10;

/**
 * @param {{label:string, value:number, highlight?:boolean}[]} data
 */
export function barChart(data, { unit = '' } = {}) {
  if (!data.length) return '';

  const W = 320, H = 150, PAD_B = 26, PAD_T = 16;
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = W / data.length;
  // Labels collide once they are wider than their slot, so show every nth instead.
  const widest = Math.max(...data.map((d) => d.label.length)) * 5.2 + 4;
  const every = Math.max(1, Math.ceil(widest / slot));
  const bw = Math.min(34, slot * 0.6);
  const plot = H - PAD_B - PAD_T;

  const bars = data.map((d, i) => {
    const h = (d.value / max) * plot;
    const x = i * slot + (slot - bw) / 2;
    const y = H - PAD_B - h;
    const cx = i * slot + slot / 2;

    let out = `<rect class="bar${d.highlight ? ' is-pos' : ''}" x="${round(x)}" y="${round(y)}" width="${round(bw)}" height="${round(Math.max(h, d.value > 0 ? 2 : 0))}" rx="3"><title>${esc(d.label)}: ${d.value}${unit}</title></rect>`;
    if (d.value > 0) out += `<text class="value" x="${round(cx)}" y="${round(y - 5)}" text-anchor="middle">${d.value}</text>`;
    if (i % every === 0) {
      out += `<text class="label" x="${round(cx)}" y="${H - 9}" text-anchor="middle">${esc(d.label)}</text>`;
    }
    return out;
  }).join('');

  const desc = data.map((d) => `${d.label}: ${d.value}${unit}`).join('; ');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}">` +
    `<line class="axis" x1="0" y1="${H - PAD_B}" x2="${W}" y2="${H - PAD_B}"/>${bars}</svg>`;
}
