// Small SVG charts for the analysis screen, drawn by hand (no library): vertical bars (stacked or
// side by side), horizontal bars (a ranking), a line, and a ring. Each returns an element with the
// chart and its legend; the value of every bar or point shows on hover (and on a long press).
// Colours are CSS colours, usually the app's variables (var(--teal)…).
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs || {}).forEach(([k, v]) => { if (v !== null && v !== undefined) el.setAttribute(k, String(v)); });
  kids.flat().forEach((k) => { if (k !== null && k !== undefined && k !== '') el.append(typeof k === 'string' ? document.createTextNode(k) : k); });
  return el;
}
const tip = (text) => s('title', {}, text);

/** A round step above the largest value, so the grid lines fall on plain numbers. */
function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
/** Short numbers for the axis: 1500 → 1.5k, 2300000 → 2.3M. */
export function short(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v * 10) / 10);
}

function legend(items) {
  return items.length > 1 ? h('div.ch-legend', items.map((x) => h('span', h('i', { style: 'background:' + x.color }), x.name))) : null;
}
const empty = (text) => h('div.ch-empty', text);

/**
 * Vertical bars per label. series: [{name, color, values:[…]}]; stacked (default) or side by side.
 * Negative values go below the zero line.
 */
export function barChart({ labels, series, stacked = true, fmt = short, emptyText = '' }) {
  if (!labels.length || series.every((x) => x.values.every((v) => !v))) return empty(emptyText);
  const W = 640, H = 240, L = 44, B = 34, T = 10, R = 8;
  const sums = labels.map((_, i) => series.map((x) => x.values[i] || 0));
  const top = niceMax(Math.max(0, ...sums.map((v) => (stacked ? v.filter((x) => x > 0).reduce((a, b) => a + b, 0) : Math.max(0, ...v)))));
  const lowRaw = Math.min(0, ...sums.map((v) => (stacked ? v.filter((x) => x < 0).reduce((a, b) => a + b, 0) : Math.min(0, ...v))));
  const low = lowRaw < 0 ? -niceMax(-lowRaw) : 0;
  const y = (v) => T + (top - v) / (top - low) * (H - T - B);
  const slot = (W - L - R) / labels.length;
  const bw = Math.max(4, Math.min(46, slot * 0.66));
  const g = [];
  for (let k = 0; k <= 4; k++) {
    const v = low + (top - low) * k / 4;
    g.push(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'ch-grid' }), s('text', { x: L - 6, y: y(v) + 4, class: 'ch-axis', 'text-anchor': 'end' }, short(v)));
  }
  if (low < 0) g.push(s('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'ch-zero' }));
  const every = Math.ceil(labels.length / 12);
  labels.forEach((lab, i) => {
    const x0 = L + slot * i + (slot - bw) / 2;
    let up = 0, down = 0;
    series.forEach((ser, j) => {
      const v = ser.values[i] || 0;
      if (!v) return;
      let a, b, x = x0, w = bw;
      if (stacked) { if (v > 0) { a = up; up += v; b = up; } else { a = down; down += v; b = down; } }
      else { w = bw / series.length; x = x0 + w * j; a = 0; b = v; }
      g.push(s('rect', { x, width: Math.max(1, w - (stacked ? 0 : 1)), y: y(Math.max(a, b)), height: Math.max(1, Math.abs(y(a) - y(b))), fill: ser.color, rx: 2 },
        tip(lab + ' · ' + (series.length > 1 ? ser.name + ': ' : '') + fmt(v))));
    });
    if (i % every === 0) g.push(s('text', { x: L + slot * i + slot / 2, y: H - B + 16, class: 'ch-axis', 'text-anchor': 'middle' }, lab));
  });
  return h('div.chart', s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', dir: 'ltr' }, g), legend(series.filter((x) => x.values.some(Boolean))));
}

/** A ranking: one horizontal bar per row [{label, value}], longest first. */
export function hbarChart({ rows, color = 'var(--teal)', fmt = short, emptyText = '' }) {
  rows = rows.filter((r) => r.value > 0);
  if (!rows.length) return empty(emptyText);
  const max = Math.max(...rows.map((r) => r.value));
  return h('div.chart.ch-rank', rows.map((r) => h('div.ch-row', { title: r.label + ' · ' + fmt(r.value) },
    h('span.ch-lbl', h('bdi', r.label)),
    h('span.ch-bar', h('i', { style: `width:${Math.max(1.5, r.value / max * 100)}%;background:${r.color || color}` })),
    h('b.ch-val', fmt(r.value)))));
}

/** A line through points [{label, value}] (in order). */
export function lineChart({ points, color = 'var(--brand)', fmt = short, emptyText = '', zeroBase = false }) {
  if (!points.length) return empty(emptyText);
  const W = 640, H = 220, L = 44, B = 34, T = 12, R = 14;
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (zeroBase) lo = Math.min(0, lo);
  if (hi === lo) { hi += Math.abs(hi) * 0.1 || 1; lo -= zeroBase ? 0 : Math.abs(lo) * 0.1 || 1; }
  const pad = (hi - lo) * 0.08;
  hi += pad; if (!zeroBase) lo -= pad;
  const x = (i) => (points.length === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (points.length - 1));
  const y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  const g = [];
  for (let k = 0; k <= 4; k++) {
    const v = lo + (hi - lo) * k / 4;
    g.push(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'ch-grid' }), s('text', { x: L - 6, y: y(v) + 4, class: 'ch-axis', 'text-anchor': 'end' }, short(v)));
  }
  g.push(s('polyline', { points: points.map((p, i) => x(i) + ',' + y(p.value)).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  const every = Math.ceil(points.length / 10);
  points.forEach((p, i) => {
    g.push(s('circle', { cx: x(i), cy: y(p.value), r: 4, fill: color }, tip(p.label + ' · ' + fmt(p.value))));
    if (i % every === 0 || i === points.length - 1) g.push(s('text', { x: x(i), y: H - B + 16, class: 'ch-axis', 'text-anchor': 'middle' }, p.label));
  });
  return h('div.chart', s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', dir: 'ltr' }, g));
}

/** A ring of parts [{label, value, color}] with the total in the middle. */
export function donut({ parts, fmt = short, center = '', emptyText = '' }) {
  parts = parts.filter((p) => p.value > 0);
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return empty(emptyText);
  const R = 80, C = 100, SW = 30;
  let a0 = -Math.PI / 2;
  const arcs = parts.map((p) => {
    const a1 = a0 + p.value / total * Math.PI * 2;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (a) => (C + R * Math.cos(a)) + ' ' + (C + R * Math.sin(a));
    const d = parts.length === 1 ? `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R}` : `M ${pt(a0)} A ${R} ${R} 0 ${big} 1 ${pt(a1)}`;
    a0 = a1;
    return s('path', { d, fill: 'none', stroke: p.color, 'stroke-width': SW }, tip(p.label + ' · ' + fmt(p.value) + ' · ' + Math.round(p.value / total * 100) + '%'));
  });
  return h('div.chart.ch-donut', s('svg', { viewBox: '0 0 200 200', role: 'img', dir: 'ltr' }, arcs,
    s('text', { x: C, y: C - 2, class: 'ch-total', 'text-anchor': 'middle' }, fmt(total)), s('text', { x: C, y: C + 18, class: 'ch-axis', 'text-anchor': 'middle' }, center)),
    h('div.ch-legend.col', parts.map((p) => h('span', h('i', { style: 'background:' + p.color }), h('bdi', p.label), h('b', ' ' + fmt(p.value) + ' · ' + Math.round(p.value / total * 100) + '%')))));
}
