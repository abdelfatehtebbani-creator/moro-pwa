// Charts (the second tab of the reports screen): purchases, suppliers, stock value, prices, consumption,
// expiry, losses, minimum stock, coffee bags and shop orders, for a period and some stores.
// Worked out on the device from the movements kept on it (works without internet), except the coffee
// batches and the shop order lines, read from the server when the user may open those screens.
// Amounts of money only for users who may see prices; the others see counts instead.
import { call } from '../api.js';
import { Data, STORES } from '../data.js';
import { MovStore } from '../movstore.js';
import { t, errText } from '../i18n.js';
import { h, fmtDate, trackFilled } from '../ui.js';
import { unitCosts } from '../reports.js';
import { barChart, hbarChart, lineChart, donut, short } from '../charts.js';

const STORE_COLOR = { CHILLED: 'var(--chilled)', DRY: 'var(--food)', PACK: 'var(--pack)', FINAL: 'var(--final)', CLEAN: 'var(--clean)' };
const PALETTE = ['var(--teal)', 'var(--brand)', 'var(--chilled)', 'var(--final)', 'var(--food)', 'var(--muted)'];
const qr = (v) => Math.round(v).toLocaleString('en-US') + ' QR';
const num = (v) => (Math.round(v * 10) / 10).toLocaleString('en-US');
const ym = (d) => String(d || '').slice(0, 7);
const monthLabel = (k) => fmtDate(k + '-01').slice(3);
/** The months from..to as YYYY-MM keys. */
function monthsOf(from, to) {
  const out = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  while (out.length < 60) {
    const k = y + '-' + String(m).padStart(2, '0');
    out.push(k);
    if (k >= end) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
const isoMinus = (iso, days) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };

let state = null;   // period and stores, kept while the app is open

export async function render(root) {
  const today = Data.todayIso();
  // the last 12 months by default
  if (!state) state = { from: isoMinus(today, 334).slice(0, 8) + '01', to: today, stores: new Set(STORES), item: '' };
  const prices = Data.can('see_prices');
  const body = h('div.an-grid');
  const status = h('p.form-status', '');

  // ---------- filters
  const from = trackFilled(h('input.input#an-from', { type: 'date', value: state.from }));
  const to = trackFilled(h('input.input#an-to', { type: 'date', value: state.to }));
  const setRange = (f, tt) => { state.from = from.value = f; state.to = to.value = tt; draw(); };
  [from, to].forEach((x) => x.addEventListener('change', () => { if (from.value && to.value && from.value <= to.value) setRange(from.value, to.value); }));
  const quick = [
    ['an_this_month', () => setRange(today.slice(0, 8) + '01', today)],
    ['an_3_months', () => setRange(isoMinus(today, 89).slice(0, 8) + '01', today)],
    ['an_this_year', () => setRange(today.slice(0, 5) + '01-01', today)],
    ['an_12_months', () => setRange(isoMinus(today, 364).slice(0, 8) + '01', today)],
  ];
  const storeBox = h('div.months', STORES.map((s) => {
    const cb = h('input', { type: 'checkbox', checked: state.stores.has(s) });
    cb.addEventListener('change', () => { cb.checked ? state.stores.add(s) : state.stores.delete(s); draw(); });
    return h('label.check', cb, ' ', t('store_' + s));
  }));

  root.replaceChildren(h('div.card.an-filters',
    h('div.form-grid', h('div.field', h('label', t('from')), from), h('div.field', h('label', t('to')), to)),
    h('div.quick', quick.map(([k, fn]) => h('button.link', { type: 'button', onclick: fn }, t(k)))),
    h('div.field', h('label', t('stores')), storeBox), status), body);

  // ---------- data
  let movs = [];
  try {
    const res = await MovStore.all();
    movs = res.list.filter((m) => m.status !== 'deleted');
    if (res.stale) status.textContent = t('offline_data', { at: new Date(res.at).toLocaleString('en-GB') });
  } catch (e) { status.textContent = errText(e); status.className = 'form-status err'; return; }
  const cost = prices ? unitCosts(movs) : new Map();
  let coffee = null, shop = null;
  const extra = [];
  if (Data.can('coffee.list')) extra.push(call('coffee.list', {}).then((r) => { coffee = r; }).catch(() => {}));
  if (Data.can('shop.list')) extra.push(call('shop.list', { status: 'done', limit: 5000 }).then((r) => { shop = r; }).catch(() => {}));
  Promise.all(extra).then(() => draw());

  function card(title, chart, note) {
    return h('div.card.an-card', h('h3', title), note ? h('small.muted', note) : null, chart);
  }

  function draw() {
    const p = { from: state.from, to: state.to };
    const inStore = (id) => state.stores.has(Data.storeOf(Data.items.get(id)));
    const inP = (m) => m.date >= p.from && m.date <= p.to && inStore(m.item_id);
    const months = monthsOf(p.from, p.to);
    const labels = months.map(monthLabel);
    const idx = new Map(months.map((k, i) => [k, i]));
    const zeros = () => months.map(() => 0);
    const value = (m) => (cost.has(m.item_id) ? Math.abs(Number(m.qty)) * cost.get(m.item_id) : 0);
    const metric = prices ? value : () => 1;
    const mfmt = prices ? qr : num;
    const unitNote = prices ? t('an_note_value') : t('an_note_count');
    const stores = STORES.filter((s) => state.stores.has(s));
    const out = [];

    if (prices) {
      // 1. purchases per month, by store (receipts less returns to the supplier)
      const byStore = Object.fromEntries(stores.map((s) => [s, zeros()]));
      for (const m of movs) {
        if ((m.kind !== 'RECEIPT' && m.kind !== 'SUPPLIER_RETURN') || !inP(m) || !idx.has(ym(m.date))) continue;
        const a = Number(m.final_amount !== '' && m.final_amount !== undefined ? m.final_amount : m.amount) || 0;
        byStore[Data.storeOf(Data.items.get(m.item_id))][idx.get(ym(m.date))] += m.kind === 'RECEIPT' ? a : -Math.abs(a);
      }
      out.push(card(t('an_purchases'), barChart({ labels, fmt: qr, emptyText: t('an_empty'),
        series: stores.map((s) => ({ name: t('store_' + s), color: STORE_COLOR[s], values: byStore[s] })) })));

      // 2. top suppliers
      const sup = new Map();
      for (const m of movs) {
        if (m.kind !== 'RECEIPT' || !inP(m)) continue;
        sup.set(m.party_id, (sup.get(m.party_id) || 0) + (Number(m.final_amount !== '' && m.final_amount !== undefined ? m.final_amount : m.amount) || 0));
      }
      out.push(card(t('an_suppliers'), hbarChart({ fmt: qr, emptyText: t('an_empty'),
        rows: [...sup].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => ({ label: (Data.parties.get(id) || {}).name || id, value: v })) })));

      // 3. stock value now, by store
      const val = Object.fromEntries(stores.map((s) => [s, 0]));
      for (const it of Data.activeItems()) {
        const s = Data.storeOf(it);
        if (s in val && cost.has(it.item_id)) val[s] += Math.max(0, Data.qty(it.item_id)) * cost.get(it.item_id);
      }
      out.push(card(t('an_stock_value'), donut({ fmt: qr, center: t('an_today'), emptyText: t('an_empty'),
        parts: stores.map((s) => ({ label: t('store_' + s), value: val[s], color: STORE_COLOR[s] })) }), t('an_note_last_price')));

      // 4. price of one item over time (net price per stock unit of each receipt)
      const bought = [...new Set(movs.filter((m) => m.kind === 'RECEIPT').map((m) => m.item_id))]
        .map((id) => Data.items.get(id)).filter((i) => i && inStore(i.item_id)).sort((a, b) => a.name.localeCompare(b.name));
      // first shown: the item received most often in the period
      if (!state.item || !bought.some((i) => i.item_id === state.item)) {
        const times = new Map();
        movs.forEach((m) => { if (m.kind === 'RECEIPT' && m.date >= p.from && m.date <= p.to && inStore(m.item_id)) times.set(m.item_id, (times.get(m.item_id) || 0) + 1); });
        state.item = [...times].sort((a, b) => b[1] - a[1]).map(([id]) => id)[0] || (bought[0] ? bought[0].item_id : '');
      }
      const pick = h('select.input#an-item', bought.map((i) => h('option', { value: i.item_id, selected: i.item_id === state.item }, i.name)));
      pick.addEventListener('change', () => { state.item = pick.value; draw(); });
      const it = Data.items.get(state.item);
      const pts = movs.filter((m) => m.kind === 'RECEIPT' && m.item_id === state.item && m.date >= p.from && m.date <= p.to && Number(m.qty) > 0)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .map((m) => ({ label: fmtDate(m.date).slice(0, 6), value: (Number(m.final_amount !== '' && m.final_amount !== undefined ? m.final_amount : m.amount) || 0) / Number(m.qty) }))
        .filter((x) => x.value > 0);
      out.push(card(t('an_price_trend'), h('div', pick, lineChart({ points: pts, fmt: (v) => v.toFixed(2) + ' QR', emptyText: t('an_empty') })),
        it ? t('an_note_per_unit', { unit: it.unit }) : ''));
    }

    // 5. consumption per month by department (the five largest, the rest together)
    const isSection = (id) => (Data.parties.get(id) || {}).kind === 'section';
    const issues = movs.filter((m) => m.kind === 'ISSUE' && isSection(m.party_id) && inP(m) && idx.has(ym(m.date)));
    const perDept = new Map();
    issues.forEach((m) => perDept.set(m.party_id, (perDept.get(m.party_id) || 0) + metric(m)));
    const top = [...perDept].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
    const series = top.map((id, i) => ({ name: (Data.parties.get(id) || {}).name || id, color: PALETTE[i], values: zeros() }));
    const rest = { name: t('an_others'), color: PALETTE[5], values: zeros() };
    issues.forEach((m) => { const k = top.indexOf(m.party_id); (k >= 0 ? series[k] : rest).values[idx.get(ym(m.date))] += metric(m); });
    out.push(card(t('an_consumption'), barChart({ labels, fmt: mfmt, emptyText: t('an_empty'), series: series.concat(rest.values.some(Boolean) ? [rest] : []) }), unitNote));

    // 6. most used items
    const perItem = new Map();
    issues.forEach((m) => perItem.set(m.item_id, (perItem.get(m.item_id) || 0) + metric(m)));
    out.push(card(t('an_top_items'), hbarChart({ fmt: mfmt, color: 'var(--brand)', emptyText: t('an_empty'),
      rows: [...perItem].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => ({ label: (Data.items.get(id) || {}).name || id, value: v })) }), unitNote));

    // 7. expiry: expired, and what expires within 30 / 60 / 90 days (stock today)
    const buckets = [0, 0, 0, 0];
    for (const x of Data.expiring(90)) {
      if (!inStore(x.item.item_id)) continue;
      const k = x.left < 0 ? 0 : x.left <= 30 ? 1 : x.left <= 60 ? 2 : 3;
      buckets[k] += prices ? (cost.get(x.item.item_id) || 0) * x.qty : 1;
    }
    out.push(card(t('an_expiry'), barChart({ labels: [t('an_expired'), t('an_30'), t('an_60'), t('an_90')], fmt: mfmt, emptyText: t('an_empty'),
      series: [{ name: '', color: 'var(--danger)', values: buckets }] }), prices ? t('an_note_value') : t('an_note_batches')));

    // 8. losses per month: disposals, and count differences (short / over)
    const disp = zeros(), shortV = zeros(), over = zeros();
    for (const m of movs) {
      if ((m.kind !== 'DISPOSAL' && m.kind !== 'ADJUST') || !inP(m) || !idx.has(ym(m.date)) || !Number(m.qty)) continue;
      const i = idx.get(ym(m.date)), v = metric(m);
      if (m.kind === 'DISPOSAL') disp[i] -= v; else if (Number(m.qty) < 0) shortV[i] -= v; else over[i] += v;
    }
    out.push(card(t('an_losses'), barChart({ labels, fmt: mfmt, emptyText: t('an_empty'), series: [
      { name: t('an_disposal'), color: 'var(--danger)', values: disp }, { name: t('an_count_short'), color: 'var(--warn)', values: shortV },
      { name: t('an_count_over'), color: 'var(--ok)', values: over }] }), prices ? t('an_note_value') : t('an_note_count')));

    // 9. items at or below their minimum, per store (today)
    const low = Object.fromEntries(stores.map((s) => [s, 0]));
    Data.lowStock().forEach((x) => { const s = Data.storeOf(x.item); if (s in low) low[s]++; });
    out.push(card(t('an_min'), hbarChart({ fmt: (v) => String(v), emptyText: t('an_none_low'),
      rows: stores.map((s) => ({ label: t('store_' + s), value: low[s], color: STORE_COLOR[s] })) })));

    // 10. coffee bags per month, and the real loss
    if (coffee) {
      const bags = zeros(), lossSum = zeros(), greenSum = zeros();
      (coffee.batches || []).forEach((b) => {
        if (!idx.has(ym(b.date)) || b.date < p.from || b.date > p.to) return;
        const i = idx.get(ym(b.date));
        bags[i] += Number(b.bags) || 0; greenSum[i] += Number(b.green_kg) || 0; lossSum[i] += (Number(b.green_kg) || 0) - (Number(b.packed_kg) || 0);
      });
      const pts = months.map((k, i) => ({ label: labels[i], value: greenSum[i] ? lossSum[i] / greenSum[i] * 100 : null })).filter((x) => x.value !== null);
      out.push(card(t('an_coffee'), h('div', barChart({ labels, fmt: (v) => short(v), emptyText: t('an_empty'), series: [{ name: '', color: '#6b4226', values: bags }] }),
        pts.length ? h('div', h('small.muted', t('an_coffee_loss')), lineChart({ points: pts, fmt: (v) => v.toFixed(1) + '%' })) : null)));
    }

    // 11. shop orders: handed to distribution or not available, per month
    if (shop) {
      const handed = zeros(), none = zeros();
      (Array.isArray(shop) ? shop : []).forEach((l) => {
        const d = String(l.handed_at || l.updated_at || '').slice(0, 10);
        if (!d || d < p.from || d > p.to || !idx.has(ym(d)) || !inStore(l.item_id)) return;
        if (l.status === 'handed' || l.status === 'partial') handed[idx.get(ym(d))]++;
        else if (l.status === 'unavailable') none[idx.get(ym(d))]++;
      });
      out.push(card(t('an_shop'), barChart({ labels, fmt: (v) => String(v), emptyText: t('an_empty'),
        series: [{ name: t('an_handed'), color: 'var(--ok)', values: handed }, { name: t('an_unavailable'), color: 'var(--danger)', values: none }] }), t('an_note_lines')));
    }
    body.replaceChildren(...out);
  }
  draw();
}
