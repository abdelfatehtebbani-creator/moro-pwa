// The general manager's screen (server/Exec.gs): the business at a glance, read only.
// A period (this month by default) against the period just before it, in seven tabs: overview, sales,
// profitability, stock, losses, suppliers, service. One request brings every number; the last answer
// of each period is kept on the device, so the screen opens at once and is brought up to date behind.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, fmtDate } from '../ui.js';

const TABS = ['overview', 'sales', 'profit', 'stock', 'losses', 'suppliers', 'service'];
const KEEP = 'moro.exec.';
let tab = 'overview';
let period = 'month';
let custom = { from: '', to: '' };

const ar = () => document.documentElement.lang === 'ar';
const qr = (n) => (n === null || n === undefined ? '—' : Math.round(Number(n) || 0).toLocaleString('en-US'));
const pctTxt = (n) => (n === null || n === undefined ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-US') + '%');
const nm = (x) => (ar() && x.name_ar ? x.name_ar : x.name);
const party = (id) => (Data.parties.get(id) || {}).name || id;
const iso = (d) => d.toISOString().slice(0, 10);
const shift = (s, days) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return iso(d); };

function range() {
  const today = Data.todayIso();
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') return { from: shift(today, -6), to: today };
  if (period === 'last') { const first = today.slice(0, 8) + '01'; const end = shift(first, -1); return { from: end.slice(0, 8) + '01', to: end }; }
  if (period === 'custom' && custom.from && custom.to) return { from: custom.from, to: custom.to };
  return { from: today.slice(0, 8) + '01', to: today };
}
const kept = (r) => { try { return JSON.parse(localStorage.getItem(KEEP + r.from + '|' + r.to) || 'null'); } catch { return null; } };
const keep = (r, d) => { try { localStorage.setItem(KEEP + r.from + '|' + r.to, JSON.stringify(d)); } catch { /* storage full or blocked */ } };

// ---------- pieces
/** The change against the period before: ▲ 12%; good is green (for losses, a rise is bad). */
function delta(now, before, lowerIsBetter) {
  if (!before) return h('span.ex-delta.flat', now ? t('ex_new') : '—');
  const p = ((now - before) / Math.abs(before)) * 100;
  const up = p >= 0;
  const good = lowerIsBetter ? !up : up;
  return h('span', { class: 'ex-delta ' + (Math.abs(p) < 0.5 ? 'flat' : good ? 'good' : 'bad') }, (up ? '▲ ' : '▼ ') + Math.abs(Math.round(p)) + '%');
}

function kpi(label, value, opts = {}) {
  return h('div', { class: 'ex-kpi' + (opts.tone ? ' ' + opts.tone : '') },
    h('div.ex-kpi-label', label),
    h('div.ex-kpi-value', h('span.num', value), opts.unit ? h('small', ' ' + opts.unit) : null),
    h('div.ex-kpi-foot', opts.delta || null, opts.sub ? h('small.muted', opts.sub) : null));
}

/** Rows of bars: [{label, value, sub, tone}] scaled to the largest. */
function bars(rows, fmt = qr, opts = {}) {
  if (!rows.length) return h('p.ex-empty', t('ex_nothing'));
  const max = Math.max(...rows.map((r) => Math.abs(r.value))) || 1;
  return h('div.ex-bars', rows.map((r) => h('div.ex-bar-row',
    h('div.ex-bar-label', h('bdi', r.label), r.sub ? h('small.muted', r.sub) : null),
    h('div.ex-bar-track', h('div', { class: 'ex-bar-fill ' + (r.tone || opts.tone || ''), style: 'width:' + Math.max(2, (Math.abs(r.value) / max) * 100).toFixed(1) + '%' })),
    h('div.ex-bar-value.num', fmt(r.value), r.extra || null))));
}

const PALETTE = ['#00807f', '#ee7326', '#22385a', '#1f5fa8', '#6a3fa0', '#2e7d32', '#c0392b', '#00838f', '#b35c00'];

/** A ring of parts: [{label, value}]. */
function donut(parts, centre) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return h('p.ex-empty', t('ex_nothing'));
  const r = 54, c = 2 * Math.PI * r;
  let off = 0;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 140 140'); svg.setAttribute('class', 'ex-donut-svg');
  const ring = (stroke, len, o) => {
    const e = document.createElementNS(NS, 'circle');
    Object.entries({ cx: 70, cy: 70, r, fill: 'none', stroke, 'stroke-width': 18, 'stroke-dasharray': len + ' ' + (c - len), 'stroke-dashoffset': -o, transform: 'rotate(-90 70 70)' })
      .forEach(([k, v]) => e.setAttribute(k, v));
    svg.append(e);
  };
  ring('#eef1f4', c, 0);
  parts.forEach((p, i) => { const len = (p.value / total) * c; ring(PALETTE[i % PALETTE.length], Math.max(0, len - 1.5), off); off += len; });
  return h('div.ex-donut', h('div.ex-donut-chart', svg, h('div.ex-donut-centre', h('b.num', centre.value), h('small', centre.label))),
    h('div.ex-legend', parts.map((p, i) => h('div.ex-legend-row', h('i', { style: 'background:' + PALETTE[i % PALETTE.length] }), h('bdi', p.label),
      h('span.num', qr(p.value)), h('small.muted', Math.round((p.value / total) * 100) + '%')))));
}

/** The days of the period as an area chart. */
function trend(byDay, from, to) {
  const days = [];
  for (let d = from; d <= to; d = shift(d, 1)) { days.push(d); if (days.length > 400) break; }
  const vals = days.map((d) => Number(byDay[d]) || 0);
  const max = Math.max(...vals);
  if (!max) return h('p.ex-empty', t('ex_nothing'));
  const W = 600, H = 150, pad = 6;
  const x = (i) => (days.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (days.length - 1));
  const y = (v) => H - pad - (v / max) * (H - 2 * pad - 14);
  const pts = vals.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'ex-trend-svg');
  // in Arabic time runs from right to left, like the dates under it
  if (ar()) svg.style.transform = 'scaleX(-1)';
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); svg.append(e); return e; };
  const defs = el('defs', {});
  const grad = document.createElementNS(NS, 'linearGradient'); grad.setAttribute('id', 'exg'); grad.setAttribute('x1', 0); grad.setAttribute('y1', 0); grad.setAttribute('x2', 0); grad.setAttribute('y2', 1);
  [['0%', '0.35'], ['100%', '0']].forEach(([o, a]) => { const s = document.createElementNS(NS, 'stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', '#00807f'); s.setAttribute('stop-opacity', a); grad.append(s); });
  defs.append(grad);
  el('polygon', { points: x(0).toFixed(1) + ',' + (H - pad) + ' ' + pts.join(' ') + ' ' + x(days.length - 1).toFixed(1) + ',' + (H - pad), fill: 'url(#exg)' });
  el('polyline', { points: pts.join(' '), fill: 'none', stroke: '#00807f', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' });
  const best = vals.indexOf(max);
  el('circle', { cx: x(best), cy: y(max), r: 4, fill: '#ee7326' });
  return h('div.ex-trend', svg, h('div.ex-trend-axis', h('bdi.num', fmtDate(days[0])),
    h('span.ex-best', h('i'), t('ex_best_day_lbl'), ' ', h('bdi.num', fmtDate(days[best])), ' · ', h('b.num', qr(max) + ' QR')), h('bdi.num', fmtDate(days[days.length - 1]))));
}

const panel = (title, ...kids) => h('section.ex-panel', h('h3.ex-panel-title', title), ...kids);
const grid = (...kids) => h('div.ex-grid', ...kids);
const chName = (d, id) => { const c = (d.channels || []).find((x) => x.id === id); return id === 'cash' ? t('ex_cash') : c ? (ar() ? c.name_ar || c.name_en : c.name_en || c.name_ar) : id; };

// ---------- the tabs
const VIEWS = {
  overview(d) {
    const shops = Object.entries(d.sales.byShop).sort((a, b) => b[1] - a[1]);
    const ch = Object.entries(d.sales.byChannel).sort((a, b) => b[1] - a[1]);
    const p = d.pending;
    const waits = [['orders', p.orders], ['lpo', p.lpo], ['cash', p.cash], ['sales', p.sales], ['returns', p.returns], ['shifts', p.shifts], ['invoices', p.invoices]].filter((x) => x[1]);
    return [
      h('div.ex-kpis',
        kpi(t('ex_sales'), qr(d.sales.total), { unit: 'QR', delta: delta(d.sales.total, d.sales.prev), sub: t('ex_vs', { v: qr(d.sales.prev) }), tone: 'hero' }),
        kpi(t('ex_margin'), pctTxt(d.margin.pct), { sub: t('ex_profit', { v: qr(d.margin.profit) }) }),
        kpi(t('ex_stock'), qr(d.stock.value), { unit: 'QR', sub: t('ex_near', { v: qr(d.stock.near) }) }),
        kpi(t('ex_losses'), qr(d.losses.total), { unit: 'QR', delta: delta(d.losses.total, d.losses.prev, true), tone: d.losses.total ? 'warn' : '' }),
        kpi(t('ex_owed'), qr(d.suppliers.owed), { unit: 'QR', sub: t('ex_suppliers_n', { n: d.suppliers.count }) }),
        kpi(t('ex_fill'), pctTxt(d.service.fill), { sub: d.service.hours === null ? '' : t('ex_hours', { h: d.service.hours }) })),
      panel(t('ex_trend'), trend(d.sales.byDay, d.from, d.to)),
      grid(panel(t('ex_by_shop'), bars(shops.map(([id, v]) => ({ label: party(id), value: v })))),
        panel(t('ex_by_channel'), donut(ch.map(([id, v]) => ({ label: chName(d, id), value: v })), { value: qr(d.sales.total), label: 'QR' }))),
      panel(t('ex_waiting'), waits.length ? h('div.ex-waits', waits.map(([k, n]) => h('div.ex-wait', h('b.num', String(n)), h('span', t('ex_wait_' + k))))) : h('p.ex-empty', t('ex_all_clear')),
        d.sales.takingsDiff ? h('p', { class: 'ex-note ' + (d.sales.takingsDiff < 0 ? 'bad' : '') }, t('ex_takings_diff', { v: qr(d.sales.takingsDiff) })) : null),
    ];
  },

  sales(d) {
    const days = Math.max(1, d.prev.days);
    const shops = Object.keys(Object.assign({}, d.sales.byShop, d.sales.byShopPrev)).map((id) => ({ id, now: d.sales.byShop[id] || 0, before: d.sales.byShopPrev[id] || 0 }))
      .sort((a, b) => b.now - a.now);
    const ch = Object.entries(d.sales.byChannel).sort((a, b) => b[1] - a[1]);
    return [
      h('div.ex-kpis',
        kpi(t('ex_sales'), qr(d.sales.total), { unit: 'QR', delta: delta(d.sales.total, d.sales.prev), tone: 'hero' }),
        kpi(t('ex_per_day'), qr(d.sales.total / days), { unit: 'QR' }),
        kpi(t('ex_invoiced'), qr(d.invoiced.total), { unit: 'QR', delta: delta(d.invoiced.total, d.invoiced.prev), sub: t('ex_invoiced_sub') })),
      panel(t('ex_trend'), trend(d.sales.byDay, d.from, d.to)),
      grid(panel(t('ex_by_shop'), bars(shops.map((s) => ({ label: party(s.id), value: s.now, sub: t('ex_vs', { v: qr(s.before) }), extra: delta(s.now, s.before) })))),
        panel(t('ex_by_channel'), donut(ch.map(([id, v]) => ({ label: chName(d, id), value: v })), { value: qr(d.sales.total), label: 'QR' }))),
      panel(t('ex_top_products'), bars(d.products.top.map((r) => ({ label: nm(r), value: r.amount, sub: qr(r.qty) + ' ' + (r.unit || '') })))),
    ];
  },

  profit(d) {
    return [
      h('div.ex-kpis',
        kpi(t('ex_margin'), pctTxt(d.margin.pct), { tone: 'hero', sub: t('ex_covered', { p: d.margin.covered }) }),
        kpi(t('ex_profit_lbl'), qr(d.margin.profit), { unit: 'QR' }),
        kpi(t('ex_invoiced'), qr(d.invoiced.total), { unit: 'QR' })),
      panel(t('ex_margin_by_shop'), bars(d.invoiced.byShop.filter((s) => s.margin !== null).sort((a, b) => b.margin - a.margin)
        .map((s) => ({ label: party(s.shop), value: s.margin, sub: qr(s.amount) + ' QR', tone: s.margin < 0 ? 'bad' : '' })), pctTxt)),
      grid(panel(t('ex_best'), bars(d.products.best.map((r) => ({ label: nm(r), value: r.profit, sub: pctTxt(r.margin) })), qr, { tone: 'good' })),
        panel(t('ex_worst'), bars(d.products.worst.map((r) => ({ label: nm(r), value: r.margin, sub: qr(r.amount) + ' QR', tone: r.margin < 0 ? 'bad' : 'warn' })), pctTxt))),
      h('p.ex-note', t('ex_margin_note')),
    ];
  },

  stock(d) {
    const stores = Object.entries(d.stock.byStore).sort((a, b) => b[1] - a[1]);
    return [
      h('div.ex-kpis',
        kpi(t('ex_stock'), qr(d.stock.value), { unit: 'QR', tone: 'hero' }),
        kpi(t('ex_near_lbl'), qr(d.stock.near), { unit: 'QR', tone: d.stock.near ? 'warn' : '', sub: t('ex_30_days') }),
        kpi(t('ex_slow_lbl'), qr(d.stock.slow), { unit: 'QR', sub: t('ex_90_days') }),
        kpi(t('ex_below'), String(d.stock.below), { tone: d.stock.below ? 'warn' : '', sub: t('ex_items') })),
      panel(t('ex_by_store'), bars(stores.map(([s, v]) => ({ label: t('store_' + s), value: v })))),
      grid(panel(t('ex_near_lbl'), bars(d.stock.nearItems.map((r) => ({ label: nm(r), value: r.value, sub: qr(r.qty) + ' ' + (r.unit || ''), tone: 'warn' })))),
        panel(t('ex_slow_lbl'), bars(d.stock.slowItems.map((r) => ({ label: nm(r), value: r.value, sub: r.since ? t('ex_since', { d: fmtDate(r.since) }) : t('ex_never') }))))),
    ];
  },

  losses(d) {
    const types = Object.entries(d.losses.byType).sort((a, b) => b[1] - a[1]);
    const shops = Object.entries(d.losses.byShop).sort((a, b) => b[1] - a[1]);
    return [
      h('div.ex-kpis',
        kpi(t('ex_losses'), qr(d.losses.total), { unit: 'QR', delta: delta(d.losses.total, d.losses.prev, true), tone: 'hero bad', sub: t('ex_vs', { v: qr(d.losses.prev) }) }),
        kpi(t('ex_losses_share'), d.invoiced.total ? pctTxt((d.losses.total / d.invoiced.total) * 100) : '—', { sub: t('ex_of_invoiced') })),
      grid(panel(t('ex_by_type'), bars(types.map(([k, v]) => ({ label: t('ex_loss_' + k), value: v, tone: 'bad' })))),
        panel(t('ex_by_shop'), bars(shops.map(([id, v]) => ({ label: party(id), value: v, tone: 'bad' }))))),
    ];
  },

  suppliers(d) {
    return [
      h('div.ex-kpis',
        kpi(t('ex_owed'), qr(d.suppliers.owed), { unit: 'QR', tone: 'hero' }),
        kpi(t('ex_bought'), qr(d.suppliers.bought), { unit: 'QR', delta: delta(d.suppliers.bought, d.suppliers.boughtPrev, true), sub: t('ex_vs', { v: qr(d.suppliers.boughtPrev) }) }),
        kpi(t('ex_rises'), String(d.suppliers.rises.length), { tone: d.suppliers.rises.length ? 'warn' : '', sub: t('ex_rises_sub') })),
      grid(panel(t('ex_owed_top'), bars(d.suppliers.top.map((x) => ({ label: x.name, value: x.owed })))),
        panel(t('ex_bought_top'), bars(d.suppliers.byParty.map((x) => ({ label: party(x.party_id), value: x.amount }))))),
      panel(t('ex_rises'), d.suppliers.rises.length ? h('div.ex-table', d.suppliers.rises.map((r) => h('div.ex-tr', h('bdi', nm(r)),
        h('span.num.muted', r.from.toLocaleString('en-US') + ' → ' + r.to.toLocaleString('en-US') + ' / ' + r.unit), h('span.ex-delta.bad', '▲ ' + r.pct + '%')))) : h('p.ex-empty', t('ex_no_rises'))),
    ];
  },

  service(d) {
    return [
      h('div.ex-kpis',
        kpi(t('ex_fill'), pctTxt(d.service.fill), { tone: 'hero', sub: t('ex_fill_sub') }),
        kpi(t('ex_hours_lbl'), d.service.hours === null ? '—' : String(d.service.hours), { unit: t('ex_h') }),
        kpi(t('ex_orders'), String(d.service.orders)),
        kpi(t('ex_unavailable'), String(d.service.unavailable), { tone: d.service.unavailable ? 'warn' : '' })),
      panel(t('ex_fill_by_shop'), bars(d.service.byShop.filter((s) => s.fill !== null).sort((a, b) => a.fill - b.fill)
        .map((s) => ({ label: party(s.shop), value: s.fill, sub: t('ex_orders_n', { n: s.orders }), tone: s.fill < 90 ? 'warn' : 'good' })), pctTxt)),
    ];
  },
};

export async function render(root) {
  const head = h('div.ex-head');
  const tabsBar = h('div.ex-tabs');
  const body = h('div.ex-body');
  const stamp = h('small.muted.ex-stamp');
  let data = null;

  const draw = () => {
    tabsBar.replaceChildren(...TABS.map((k) => h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; draw(); } }, t('ex_tab_' + k))));
    if (!data) { body.replaceChildren(h('div.ex-skeleton', [1, 2, 3, 4].map(() => h('div')))); return; }
    body.replaceChildren(...VIEWS[tab](data));
  };

  const chips = h('div.ex-periods', ['today', 'week', 'month', 'last', 'custom'].map((k) => h('button', { type: 'button', class: k === period ? 'on' : '',
    onclick: () => { period = k; customBox.hidden = k !== 'custom'; [...chips.children].forEach((b, i) => b.classList.toggle('on', ['today', 'week', 'month', 'last', 'custom'][i] === k)); if (k !== 'custom') load(); } }, t('ex_p_' + k))));
  const fromIn = h('input.input', { type: 'date', value: custom.from });
  const toIn = h('input.input', { type: 'date', value: custom.to });
  [fromIn, toIn].forEach((x) => x.addEventListener('change', () => { custom = { from: fromIn.value, to: toIn.value }; if (custom.from && custom.to) load(); }));
  const customBox = h('div.ex-custom', { hidden: period !== 'custom' }, fromIn, h('span', '→'), toIn);

  async function load() {
    const r = range();
    const was = kept(r);
    data = was; draw();
    stamp.textContent = t('ex_period', { a: fmtDate(r.from), b: fmtDate(r.to) }) + (was ? ' · ' + t('ex_updating') : '');
    try {
      const d = await call('exec.summary', r);
      keep(r, d);
      const same = r.from === range().from && r.to === range().to;
      if (!same) return;
      data = d; draw();
      stamp.textContent = t('ex_period', { a: fmtDate(d.from), b: fmtDate(d.to) }) + ' · ' + t('ex_compare', { a: fmtDate(d.prev.from), b: fmtDate(d.prev.to) });
    } catch (e) { if (!data) body.replaceChildren(h('p.ex-empty', errText(e))); else toast(errText(e), 'err'); }
  }

  const print = h('button.btn.secondary.small', { type: 'button', onclick: () => {
    document.body.classList.add('ex-printing');
    const done = () => { document.body.classList.remove('ex-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  } }, '⎙ ' + t('ex_print'));
  head.append(h('div.ex-title', h('h2', t('exec')), stamp), h('div.ex-tools', chips, customBox, print));
  root.replaceChildren(h('div.ex', head, tabsBar, body));
  draw();
  load();
}

export function dispose() {}
