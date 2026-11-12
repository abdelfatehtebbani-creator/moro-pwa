// The 13 MORO v13 reports, computed on the device from the movements and balances.
// Every report returns {title, subtitle, columns:[{label, type}], rows:[[...]]}.
// Column types: t text, n number, m money, d date (YYYY-MM-DD), p share (0–1).
import { Data, STORES } from './data.js';
import { daysBetween } from './ui.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const itemName = (id) => Data.nameOf(Data.items.get(id)) || id;
/** [qty, unit] of a stock-unit quantity in the item's report unit (eggs: 720 PC -> 2 BOX). */
const ru = (id, qty) => Data.inReportUnit(Data.items.get(id), qty);
const partyName = (id) => (Data.parties.get(id) || {}).name || id;
const byName = (a, b) => String(a).localeCompare(String(b));
const inRange = (m, p) => (!p.from || m.date >= p.from) && (!p.to || m.date <= p.to);
const periodText = (p) => 'Period: ' + p.from + '  to  ' + p.to;
const todayText = () => 'Date: ' + Data.todayIso();
const STORE_NAMES = { CHILLED: 'Chilled foods', DRY: 'Dry foods', PACK: 'Packaging', FINAL: 'Final products', CLEAN: 'Cleaning', EQUIP: 'Equipment and tools' };
/** Store filter of a report: true when the item is in one of the chosen stores (no filter: all). */
const inStores = (p, id) => !p.stores || p.stores.size === STORES.length || p.stores.has(Data.storeOf(Data.items.get(id)));
const storesText = (p) => (!p.stores || p.stores.size === STORES.length ? '' : '  ·  Stores: ' + STORES.filter((s) => p.stores.has(s)).map((s) => STORE_NAMES[s]).join(', '));

/** Report catalogue: id, group, the options it uses, and its builder. */
export const REPORTS = [
  { id: 'fast', group: 'stock', opts: ['list'], build: (p) => itemList('FAST', 'Fast Moving Items Report') },
  { id: 'min', group: 'stock', opts: ['stores'], build: minStock },
  { id: 'sensitive', group: 'stock', opts: ['list'], build: () => itemList('SENSITIVE', 'Sensitive Items Report') },
  { id: 'expiry', group: 'stock', opts: ['stores', 'foodPack', 'zero', 'items?'], build: stockExpiry },
  { id: 'near', group: 'stock', opts: ['days', 'stores', 'zero'], build: nearExpiry },
  { id: 'changes', group: 'move', opts: ['dates', 'mode', 'items?'], build: changes },
  { id: 'bySection', group: 'move', opts: ['dates', 'stores', 'sections'], build: (p, m) => consumption(p, m, false) },
  { id: 'byItem', group: 'move', opts: ['dates', 'zoneItems'], build: (p, m) => consumption(p, m, true) },
  { id: 'itemOut', group: 'move', opts: ['dates', 'zoneItems', 'detail'], build: (p, m) => itemMovement(p, m, true) },
  { id: 'itemIn', group: 'move', opts: ['dates', 'zoneItems', 'detail'], build: (p, m) => itemMovement(p, m, false) },
  { id: 'multiMonth', group: 'move', opts: ['year', 'items'], build: multiMonth },
  { id: 'prices', group: 'other', opts: ['items'], build: prices, prices: true },
  { id: 'production', group: 'other', opts: ['period'], build: productionSummary },
  { id: 'trace', group: 'move', opts: ['dates', 'sections'], build: trace },
  { id: 'slow', group: 'stock', opts: ['days', 'stores'], build: slowMoving },
  { id: 'cover', group: 'stock', opts: ['days', 'stores'], build: daysOfCover },
  { id: 'losses', group: 'move', opts: ['dates', 'stores'], needs: 'losses', build: losses },
  { id: 'valuation', group: 'stock', opts: ['asof', 'stores'], prices: true, build: valuation },
  { id: 'margin', group: 'orders', opts: ['dates'], needs: 'margin', prices: true, build: margin },
  { id: 'takings', group: 'orders', opts: ['dates'], needs: 'takings', prices: true, build: takings },
  { id: 'salesChannels', group: 'orders', opts: ['dates'], needs: 'salesChannels', prices: true, build: salesChannels },
  { id: 'orderTimes', group: 'orders', opts: ['dates'], needs: 'orders', build: orderTimes },
  { id: 'receiptShort', group: 'orders', opts: ['dates'], needs: 'orders', build: receiptShort },
  { id: 'unavailable', group: 'orders', opts: ['dates'], needs: 'orders', build: unavailable },
  { id: 'shopSales', group: 'orders', opts: ['dates'], needs: 'orders', prices: true, build: shopSales },
  { id: 'dispatch', group: 'orders', opts: ['dates'], needs: 'dispatch', build: dispatch },
];

// ---------- the dispatching and delivery record (food safety; data from report.dispatch)
const dmy = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '');
function dispatch(p, movs, data) {
  const join = (r, f) => [...new Set(r.batches.map(f).filter(Boolean))].join(' · ');
  const rows = data.rows.map((r, i) => {
    const it = Data.items.get(r.item_id);
    return [i + 1, r.date, r.loaded, r.description || (it ? Data.nameOf(it) : r.item_id), join(r, (b) => b.batch), join(r, (b) => dmy(b.made)), join(r, (b) => dmy(b.expiry)),
      r.qty + ' ' + (r.unit || ''), partyName(r.shop_party_id) + (r.address ? ' – ' + r.address : ''), r.vehicle, r.driver, r.temp, r.departed,
      r.received_by ? r.received_by + ' ' + stamp(r.received_at).slice(11) : '', r.arrival_temp, r.handed_by];
  });
  const days = [...new Set(data.rows.map((r) => r.date))];
  return { title: 'Dispatching and delivery record', subtitle: periodText(p),
    columns: cols(['#', 'n'], ['Date', 'd'], ['Loading time', 't'], ['Product', 't'], ['Batch No.', 't'], ['Production date', 't'], ['Expiry date', 't'],
      ['Quantity and unit', 't'], ['Destination', 't'], ['Vehicle no.', 't'], ['Driver', 't'],
      ['Temperature when leaving (°C)', 'n'], ['Departure time', 't'], ['Recipient (confirmed)', 't'], ['Temperature on arrival (°C)', 'n'], ['Handed over by', 't']),
    rows, review: { days, reviews: data.reviews }, wide: true };
}

// ---------- shop orders (data from orders.report: the orders of the period and their invoices)
const stamp = (iso) => (iso ? String(iso).replace('T', ' ').slice(0, 16) : '');
const hoursBetween = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 36e5 * 10) / 10 : '');

function orderTimes(p, movs, data) {
  const rows = data.orders.filter((o) => o.sent_at).map((o) => [o.order_no, partyName(o.shop_party_id), o.order_date, stamp(o.sent_at), stamp(o.approved_at),
    stamp(o.ready_at), stamp(o.loaded_at), stamp(o.delivered_at), stamp(o.received_at), hoursBetween(o.sent_at, o.received_at)]);
  return { title: 'Shop orders: time of each step', subtitle: periodText(p) + '  ·  Sent → approved → ready → loaded → delivered → received',
    columns: cols(['Order', 't'], ['Shop', 't'], ['Order date', 'd'], ['Sent', 't'], ['Approved', 't'], ['Ready', 't'], ['Loaded', 't'],
      ['Delivered', 't'], ['Received', 't'], ['Hours sent → received', 'n']), rows };
}

const SHORT = { damaged: 'Damaged', short_in_trip: 'Short in the trip', loading_error: 'Loading error', other: 'Other' };
function receiptShort(p, movs, data) {
  const rows = [];
  data.orders.forEach((o) => o.lines.forEach((l) => {
    if (l.received_qty === '' || l.received_qty === undefined || !(Number(l.received_qty) < l.handed_qty)) return;
    const it = Data.items.get(l.item_id) || {};
    rows.push([o.order_date, partyName(o.shop_party_id), o.order_no, itemName(l.item_id), l.handed_qty, Number(l.received_qty),
      r6(l.handed_qty - Number(l.received_qty)), it.unit || '', SHORT[l.short_reason] || l.short_reason, l.short_note || '']);
  }));
  return { title: 'Shop orders: received short', subtitle: periodText(p),
    columns: cols(['Order date', 'd'], ['Shop', 't'], ['Order', 't'], ['Item', 't'], ['Handed', 'n'], ['Received', 'n'], ['Short', 'n'], ['Unit', 't'],
      ['Reason', 't'], ['Note', 't']), rows };
}

function unavailable(p, movs, data) {
  const rows = [];
  data.orders.forEach((o) => o.lines.forEach((l) => {
    if (l.line_status !== 'unavailable') return;
    const it = Data.items.get(l.item_id) || {};
    const where = Data.storeOf(it) === 'FINAL' && it.dept ? partyName(it.dept) : STORE_NAMES[Data.storeOf(it)];
    rows.push([o.order_date, partyName(o.shop_party_id), o.order_no, itemName(l.item_id), where, Number(l.approved_qty) || l.qty, it.unit || '', l.reason]);
  }));
  return { title: 'Shop orders: could not be supplied', subtitle: periodText(p),
    columns: cols(['Order date', 'd'], ['Shop', 't'], ['Order', 't'], ['Item', 't'], ['Department / store', 't'], ['Quantity', 'n'], ['Unit', 't'], ['Reason', 't']), rows };
}

function shopSales(p, movs, data) {
  // each shop's invoices in the period: the final products part, the store items part, and the total
  const by = new Map();
  data.invoices.forEach((v) => {
    const s = by.get(v.shop_party_id) || { n: 0, f: 0, st: 0 };
    s.n++; s.f += Number(v.total_final) || 0; s.st += Number(v.total_store) || 0;
    by.set(v.shop_party_id, s);
  });
  const rows = [...by].sort((a, b) => byName(partyName(a[0]), partyName(b[0])))
    .map(([id, s]) => [partyName(id), s.n, money(s.f), money(s.st), money(s.f + s.st)]);
  if (rows.length > 1) rows.push(['Total', rows.reduce((a, r) => a + r[1], 0), money(rows.reduce((a, r) => a + r[2], 0)),
    money(rows.reduce((a, r) => a + r[3], 0)), money(rows.reduce((a, r) => a + r[4], 0))]);
  return { title: 'Shop sales (invoices)', subtitle: periodText(p),
    columns: cols(['Shop', 't'], ['Invoices', 'n'], ['Final products (QR)', 'm'], ['Store items (QR)', 'm'], ['Total (QR)', 'm']), rows };
}

// ---------- cost of the stock: the net price of the last receipt, per stock unit
/** {item_id: cost per stock unit} from the latest receipt of each item (items never bought: none). */
export function unitCosts(movs) {
  const last = new Map();
  for (const m of movs) {
    if (m.kind !== 'RECEIPT' || !(Number(m.qty) > 0)) continue;
    const amount = Number(m.final_amount !== '' && m.final_amount !== undefined ? m.final_amount : m.amount);
    if (!(amount > 0)) continue;
    const k = String(m.date) + '|' + String(m.movement_id || m.created_at || '');
    const cur = last.get(m.item_id);
    if (!cur || k > cur.k) last.set(m.item_id, { k, cost: amount / Number(m.qty) });
  }
  return new Map([...last].map(([id, x]) => [id, x.cost]));
}
const money = (v) => Math.round(v * 100) / 100;

function slowMoving(p, movs) {
  const days = Number(p.days) || 90;
  const today = Data.todayIso();
  const prices = Data.can('see_prices');
  const cost = prices ? unitCosts(movs) : new Map();
  const lastOut = new Map();
  for (const m of movs) if (Number(m.qty) < 0 && !(lastOut.get(m.item_id) >= m.date)) lastOut.set(m.item_id, m.date);
  const rows = [];
  for (const it of Data.activeItems()) {
    const q = Data.qty(it.item_id);
    if (q <= 0 || !inStores(p, it.item_id)) continue;
    const out = lastOut.get(it.item_id) || '';
    const idle = out ? daysBetween(out, today) : null;
    if (idle !== null && idle < days) continue;
    const [rq, u] = ru(it.item_id, q);
    rows.push([Data.nameOf(it), STORE_NAMES[Data.storeOf(it)], rq, u, out, idle === null ? 'Never issued' : String(idle),
      ...(prices ? [cost.has(it.item_id) ? money(q * cost.get(it.item_id)) : ''] : [])]);
  }
  rows.sort((a, b) => (prices ? (Number(b[6]) || 0) - (Number(a[6]) || 0) : 0) || byName(a[0], b[0]));
  return { title: 'Slow-moving stock (no issue for ' + days + ' days or more)', subtitle: todayText() + storesText(p),
    columns: cols(['Item', 't'], ['Store', 't'], ['Quantity', 'n'], ['Unit', 't'], ['Last issue', 'd'], ['Days without issue', 't'],
      ...(prices ? [['Value (QR)', 'm']] : [])), rows };
}

function daysOfCover(p, movs) {
  const days = Number(p.days) || 90;
  const today = Data.todayIso();
  const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - days);
  const from = d.toISOString().slice(0, 10);
  const used = new Map();
  for (const m of movs) {
    if ((m.kind !== 'ISSUE' && m.kind !== 'PROD_CONSUME') || m.date <= from || m.date > today || !(Number(m.qty) < 0)) continue;
    used.set(m.item_id, r6((used.get(m.item_id) || 0) - Number(m.qty)));
  }
  const rows = [];
  for (const [id, u] of used) {
    const it = Data.items.get(id);
    if (!it || it.active !== true || !inStores(p, id)) continue;
    const q = Math.max(0, Data.qty(id));
    const avg = u / days;
    const cover = Math.floor(q / avg);
    const order = Math.max(0, avg * days - q);
    const [rq, unit] = ru(id, q);
    rows.push([Data.nameOf(it), STORE_NAMES[Data.storeOf(it)], rq, unit, ru(id, u)[0], Math.round(ru(id, avg)[0] * 100) / 100, cover, Math.ceil(ru(id, order)[0] * 100) / 100]);
  }
  rows.sort((a, b) => a[6] - b[6] || byName(a[0], b[0]));
  return { title: 'Days of cover (use of the last ' + days + ' days)', subtitle: todayText() + storesText(p)
      + '  ·  Suggested order: enough for another ' + days + ' days at the same use',
    columns: cols(['Item', 't'], ['Store', 't'], ['Balance', 'n'], ['Unit', 't'], ['Used', 'n'], ['Daily average', 'n'], ['Days of cover', 'n'], ['Suggested order', 'n']), rows };
}

// ---------- the value of the stock on a date: the balance then (today's balance less what moved since) at the last purchase price then
function valuation(p, movs) {
  const at = p.asof || Data.todayIso();
  const after = new Map();
  for (const m of movs) if (String(m.date) > at) after.set(m.item_id, r6((after.get(m.item_id) || 0) + Number(m.qty)));
  const cost = unitCosts(movs.filter((m) => String(m.date) <= at));
  const by = new Map();
  const rows = [];
  for (const it of Data.items.values()) {
    if (!inStores(p, it.item_id)) continue;
    const q = r6(Data.qty(it.item_id) - (after.get(it.item_id) || 0));
    if (!q) continue;
    const c = cost.get(it.item_id);
    const v = c === undefined ? '' : money(q * c);
    const st = STORE_NAMES[Data.storeOf(it)];
    if (v !== '') by.set(st, money((by.get(st) || 0) + v));
    const [rq, u] = ru(it.item_id, q);
    rows.push([st, Data.nameOf(it), rq, u, c === undefined || !rq ? '' : money(v / rq), v]);
  }
  rows.sort((a, b) => byName(a[0], b[0]) || byName(a[1], b[1]));
  [...by].sort((a, b) => byName(a[0], b[0])).forEach(([st, v]) => rows.push([st, 'Total ' + st, '', '', '', v]));
  if (by.size) rows.push(['', 'Total', '', '', '', money([...by.values()].reduce((a, b) => a + b, 0))]);
  return { title: 'Stock value on ' + at, subtitle: 'Balance on that day at the last purchase price before it' + storesText(p) + '  ·  No price: never bought',
    columns: cols(['Store', 't'], ['Item', 't'], ['Quantity', 'n'], ['Unit', 't'], ['Unit cost (QR)', 'm'], ['Value (QR)', 'm']), rows };
}

// ---------- cost and margin of what was invoiced to the shops
// cost per unit: a final product with a recipe = its ingredients at their last purchase price; a store item = its
// last purchase price; a product without a recipe, or a special product: no cost known (shown empty)
function margin(p, movs, data) {
  const cost = unitCosts(movs);
  const recipe = new Map();
  (data.recipes || []).forEach((r) => { const k = String(r.product).trim().toUpperCase(); if (!recipe.has(k)) recipe.set(k, []); recipe.get(k).push(r); });
  const costOf = (id) => {
    const it = Data.items.get(id);
    if (!it) return undefined;
    if (Data.storeOf(it) !== 'FINAL') return cost.get(id);
    const lines = recipe.get(String(it.name).trim().toUpperCase());
    if (!lines) return undefined;
    let c = 0;
    // a generic material (family) costs what one of its units costs from its brands (worked out by the server)
    const fc = data.family_costs || {};
    for (const l of lines) { const u = Data.isFamily(l.item_id) ? fc[l.item_id] : cost.get(l.item_id); if (u === undefined) return undefined; c += l.qty_per_unit * u; }
    return c;
  };
  const by = new Map(), shops = new Map();
  data.lines.forEach((x) => {
    const k = x.item_id || 'special|' + x.description;
    const r = by.get(k) || { name: x.item_id ? itemName(x.item_id) : x.description + ' (special)', unit: x.unit, qty: 0, sales: 0, cost: 0, known: true };
    const c = x.item_id ? costOf(x.item_id) : undefined;
    r.qty += x.qty; r.sales += x.amount;
    if (c === undefined) r.known = false; else r.cost += c * x.qty;
    by.set(k, r);
    const s = shops.get(x.shop_party_id) || { sales: 0, cost: 0, unknown: 0 };
    s.sales += x.amount; if (c === undefined) s.unknown += x.amount; else s.cost += c * x.qty;
    shops.set(x.shop_party_id, s);
  });
  const pct = (m, s) => (s ? Math.round((m / s) * 1000) / 10 : '');
  const rows = [...by.values()].sort((a, b) => b.sales - a.sales).map((r) => {
    const m = r.known ? money(r.sales - r.cost) : '';
    return ['Item', r.name, r6(r.qty), r.unit, money(r.sales), r.known ? money(r.cost) : '', m, r.known ? pct(r.sales - r.cost, r.sales) : '', '', ''];
  });
  // each shop: its invoices, their cost and margin, and the cash its cashiers collected against what it was invoiced
  const took = data.takings || {};
  const ids = new Set([...shops.keys(), ...Object.keys(took)]);
  [...ids].sort((a, b) => byName(partyName(a), partyName(b))).forEach((id) => {
    const s = shops.get(id) || { sales: 0, cost: 0, unknown: 0 };
    const known = s.sales - s.unknown;
    const tk = took[id] || 0;
    rows.push(['Shop', partyName(id), '', '', money(s.sales), money(s.cost), money(known - s.cost), pct(known - s.cost, known), money(tk), money(tk - s.sales)]);
  });
  return { title: 'Cost and margin of the shop invoices', subtitle: periodText(p) + '  ·  Cost: recipe ingredients or the item at its last purchase price'
      + '  ·  Empty: no cost known (no recipe, special product)  ·  A shop margin leaves out the lines without cost'
      + '  ·  Takings: the cash its cashiers declared; takings − invoiced below zero: it sold less than it received',
    columns: cols(['Line', 't'], ['Item / shop', 't'], ['Quantity', 'n'], ['Unit', 't'], ['Sales (QR)', 'm'], ['Cost (QR)', 'm'], ['Margin (QR)', 'm'], ['Margin %', 'n'],
      ['Takings (QR)', 'm'], ['Takings − invoiced (QR)', 'm']), rows };
}

// ---------- the shops' takings: the cash each cashier collected, per day and shop, and what the accountant received
function takings(p, movs, list) {
  const by = new Map();
  (list || []).forEach((s) => {
    const k = s.date + '|' + s.shop_party_id + '|' + s.cashier;
    const r = by.get(k) || { date: s.date, shop: s.shop_party_id, cashier: s.cashier, n: 0, amount: 0, got: 0, open: 0, diff: 0 };
    r.n++; r.amount += s.amount;
    if (s.received_amount === '') r.open++; else { r.got += s.received_amount; r.diff += s.diff; }
    by.set(k, r);
  });
  const rows = [...by.values()].sort((a, b) => (a.date === b.date ? byName(partyName(a.shop), partyName(b.shop)) : a.date < b.date ? 1 : -1))
    .map((r) => [r.date, partyName(r.shop), r.cashier, r.n, money(r.amount), money(r.got), money(r.diff), r.open]);
  if (rows.length > 1) rows.push(['', 'Total', '', rows.reduce((a, r) => a + r[3], 0), money(rows.reduce((a, r) => a + r[4], 0)),
    money(rows.reduce((a, r) => a + r[5], 0)), money(rows.reduce((a, r) => a + r[6], 0)), rows.reduce((a, r) => a + r[7], 0)]);
  return { title: 'Shop takings', subtitle: periodText(p) + '  ·  Difference = received − declared (negative: short)',
    columns: cols(['Date', 'd'], ['Shop', 't'], ['Cashier', 't'], ['Shifts', 'n'], ['Declared (QR)', 'm'], ['Received (QR)', 'm'], ['Difference (QR)', 'm'], ['Not received yet', 'n']), rows };
}

// ---------- the daily sales sheets: each shop and day by channel
function salesChannels(p, movs, data) {
  const ar = document.documentElement.lang === 'ar';
  const used = (data.channels || []).filter((c) => data.days.some((d) => d.channels[c.id] !== undefined));
  const name = (c) => (ar ? c.name_ar || c.name_en : c.name_en || c.name_ar) || c.id;
  const STATUS = { draft: 'Draft', submitted: 'Sent', approved: 'Approved', returned: 'Returned' };
  const rows = data.days.map((d) => [d.date, partyName(d.shop_party_id), money(d.cash), ...used.map((c) => (d.channels[c.id] === undefined ? '' : money(d.channels[c.id]))),
    money(d.total), STATUS[d.status] || d.status]);
  if (rows.length > 1) rows.push(['', 'Total', money(data.days.reduce((a, d) => a + d.cash, 0)),
    ...used.map((c) => money(data.days.reduce((a, d) => a + (d.channels[c.id] || 0), 0))), money(data.days.reduce((a, d) => a + d.total, 0)), '']);
  return { title: 'Sales by channel', subtitle: periodText(p) + '  ·  Cash: the shifts of the day; the other channels: the daily sales sheet',
    columns: cols(['Date', 'd'], ['Shop', 't'], ['Cash (QR)', 'm'], ...used.map((c) => [name(c) + ' (QR)', 'm']), ['Total (QR)', 'm'], ['Status', 't']), rows };
}

function losses(p, movs, extra) {
  const prices = Data.can('see_prices');
  const cost = prices ? unitCosts(movs) : new Map();
  const rows = [];
  let total = 0;
  // returns decided damaged or expired, and receipt differences lost on the way: losses that are no stock movement
  const add = (date, type, id, label, q, unit, why) => {
    const v = id && cost.has(id) ? money(q * cost.get(id)) : '';
    if (v !== '') total += v;
    const [rq, u] = id ? ru(id, q) : [q, unit];
    rows.push([date, type, label, rq, u, ...(prices ? [v] : []), why]);
  };
  ((extra || {}).returns || []).filter((r) => inStores(p, r.item_id)).forEach((r) => add(r.date, r.decision === 'expired' ? 'Return: expired' : 'Return: damaged',
    r.item_id, itemName(r.item_id), r.qty, r.unit, partyName(r.shop_party_id) + ' · ' + (r.source === 'diff' ? 'receipt difference' : r.reason) + ' · ' + r.ref));
  ((extra || {}).lost || []).filter((r) => !r.item_id || inStores(p, r.item_id)).forEach((r) => add(r.date, 'Lost on the way',
    r.item_id, r.item_id ? itemName(r.item_id) : r.description, r.qty, r.unit, partyName(r.shop_party_id) + ' · ' + r.reason + (r.note ? ': ' + r.note : '') + ' · ' + r.ref));
  movs.filter((m) => (m.kind === 'DISPOSAL' || m.kind === 'ADJUST') && inRange(m, p) && inStores(p, m.item_id) && Number(m.qty))
    .sort((a, b) => (a.date === b.date ? byName(itemName(a.item_id), itemName(b.item_id)) : a.date < b.date ? -1 : 1))
    .forEach((m) => {
      const q = Number(m.qty);
      const type = m.kind === 'DISPOSAL' ? 'Disposal' : String(m.doc_no || '').charAt(0) === 'C' ? 'Count difference' : 'Adjustment';
      const v = cost.has(m.item_id) ? money(q * cost.get(m.item_id)) : '';
      if (v !== '') total += v;
      const [rq, u] = ru(m.item_id, q);
      rows.push([m.date, type, itemName(m.item_id), rq, u, ...(prices ? [v] : []), m.purpose || m.doc_no || '']);
    });
  rows.sort((a, b) => (a[0] === b[0] ? byName(a[2], b[2]) : a[0] < b[0] ? -1 : 1));
  if (prices && rows.length) rows.push(['', 'Total', '', '', '', money(total), '']);
  return { title: 'Losses: disposals, count differences, returns and goods lost on the way', subtitle: periodText(p) + storesText(p) + '  ·  Negative = stock lost',
    columns: cols(['Date', 'd'], ['Type', 't'], ['Item', 't'], ['Quantity', 'n'], ['Unit', 't'], ...(prices ? [['Value (QR)', 'm']] : []), ['Reason / document', 't']), rows };
}

function itemList(list, title) {
  const ids = Data.list(list);
  const rows = [...ids].map((id) => Data.items.get(id)).filter(Boolean)
    .sort((a, b) => (a.category === b.category ? byName(a.name, b.name) : a.category === 'Food' ? -1 : 1))
    .map((it) => [it.category, Data.nameOf(it), ...ru(it.item_id, Data.qty(it.item_id))]);
  return { title, subtitle: todayText(), columns: cols(['Category', 't'], ['Item', 't'], ['Quantity', 'n'], ['Unit', 't']), rows };
}

function minStock(p) {
  const rows = Data.lowStock().filter((x) => inStores(p, x.item.item_id)).map((x) => { const [q, u] = ru(x.item.item_id, x.qty); return [Data.nameOf(x.item), q, ru(x.item.item_id, x.min)[0], u]; });
  return { title: 'Items at or below minimum stock', subtitle: todayText() + storesText(p),
    columns: cols(['Item', 't'], ['Available', 'n'], ['Minimum stock', 'n'], ['Unit', 't']), rows };
}

function expiryStatus(left) {
  if (left < 0) return 'Expired';
  if (left === 0) return 'Expires Today';
  return 'Remaining ' + left + ' days';
}

function stockExpiry(p) {
  const today = Data.todayIso();
  const sel = p.items && p.items.size ? p.items : null;
  const rows = [];
  for (const it of Data.activeItems()) {
    if ((sel && !sel.has(it.item_id)) || !inStores(p, it.item_id)) continue;
    const q = Data.qty(it.item_id);
    if (!p.zero && q <= 0) continue;
    const b = Data.balances.get(it.item_id);
    const exp = b && b.last_expiry;
    const dated = Data.batchesOf(it.item_id).filter((x) => x.expiry);
    if (exp || dated.length) {
      if (p.packOnly) continue;
      // one line per expiry date still in stock (stock is taken earliest-expiry first)
      if (q > 0 && dated.length) Data.batchesOf(it.item_id).forEach((x) => rows.push(['Food', Data.nameOf(it), ...ru(it.item_id, x.qty), x.expiry,
        x.expiry ? expiryStatus(daysBetween(today, x.expiry)) : 'No expiry']));
      else rows.push(['Food', Data.nameOf(it), ...ru(it.item_id, q), exp, expiryStatus(daysBetween(today, exp))]);
    } else {
      if (p.foodOnly) continue;
      rows.push(['Packaging', Data.nameOf(it), ...ru(it.item_id, q), '', 'No expiry']);
    }
  }
  rows.sort((a, b) => (a[0] === b[0] ? byName(a[1], b[1]) : a[0] === 'Packaging' ? -1 : 1));
  return { title: 'Stock with expiry', subtitle: todayText() + storesText(p),
    columns: cols(['Category', 't'], ['Item', 't'], ['Quantity', 'n'], ['Unit', 't'], ['Expiry date', 'd'], ['Status', 't']), rows };
}

function nearExpiry(p) {
  const days = Number(p.days) || 90;
  const rows = Data.expiring(days).filter((x) => x.left >= 0 && (p.zero || x.qty > 0) && inStores(p, x.item.item_id))
    .map((x) => [Data.nameOf(x.item), x.expiry, x.left, ...ru(x.item.item_id, x.qty)]);
  if (p.zero) {
    const today = Data.todayIso();
    for (const b of Data.balances.values()) {
      const it = Data.items.get(b.item_id);
      if (!it || !b.last_expiry || Number(b.qty) > 0 || !inStores(p, it.item_id)) continue;
      const left = daysBetween(today, b.last_expiry);
      if (left >= 0 && left <= days) rows.push([Data.nameOf(it), b.last_expiry, left, ...ru(it.item_id, Number(b.qty))]);
    }
    rows.sort((a, b) => a[2] - b[2]);
  }
  return { title: 'Products near expiry (within ' + days + ' days)', subtitle: todayText() + storesText(p),
    columns: cols(['Item', 't'], ['Expiry date', 'd'], ['Days left', 'n'], ['Quantity', 'n'], ['Unit', 't']), rows };
}

function changes(p, movs) {
  const sel = p.items && p.items.size ? p.items : null;
  const inc = new Map(); const out = new Map();
  for (const m of movs) {
    if (!inRange(m, p) || (sel && !sel.has(m.item_id))) continue;
    const q = Number(m.qty);
    const map = q > 0 ? inc : out;
    map.set(m.item_id, r6((map.get(m.item_id) || 0) + Math.abs(q)));
  }
  const rows = [];
  const add = (label, map) => [...map.keys()].sort((a, b) => byName(itemName(a), itemName(b)))
    .forEach((id) => { const [q, u] = ru(id, map.get(id)); rows.push([label, itemName(id), q, ru(id, Data.qty(id))[0], u]); });
  if (p.mode !== 'out') add('Incoming', inc);
  if (p.mode !== 'in') add('Outgoing', out);
  return { title: 'Inventory changes', subtitle: periodText(p),
    columns: cols(['Direction', 't'], ['Item', 't'], ['Quantity', 'n'], ['Current balance', 'n'], ['Unit', 't']), rows };
}

function consumption(p, movs, byItem) {
  // by department: the chosen departments; by item: the chosen items, issued to any department
  const sel = (byItem ? p.items : p.sections) || new Set();
  const isSection = (id) => ['section', 'shop', 'affiliate'].includes((Data.parties.get(id) || {}).kind);
  const groups = new Map();
  for (const m of movs) {
    if (!inRange(m, p) || !sel.has(byItem ? m.item_id : m.party_id) || !isSection(m.party_id) || !inStores(p, m.item_id)) continue;
    const k1 = byItem ? m.item_id : m.party_id;
    const k2 = byItem ? m.party_id : m.item_id;
    if (!groups.has(k1)) groups.set(k1, new Map());
    const g = groups.get(k1);
    g.set(k2, r6((g.get(k2) || 0) - Number(m.qty)));       // issues are negative: shown as quantity issued
  }
  const n1 = byItem ? itemName : partyName;
  const n2 = byItem ? partyName : itemName;
  const rows = [];
  [...groups.keys()].sort((a, b) => byName(n1(a), n1(b))).forEach((k1) => {
    const g = groups.get(k1);
    [...g.keys()].sort((a, b) => byName(n2(a), n2(b))).forEach((k2) => rows.push([n1(k1), n2(k2), g.get(k2)]));
  });
  return { title: 'Consumption by ' + (byItem ? 'item' : 'department'), subtitle: periodText(p) + storesText(p),
    columns: byItem ? cols(['Item', 't'], ['Department', 't'], ['Quantity issued', 'n']) : cols(['Department', 't'], ['Item', 't'], ['Quantity issued', 'n']), rows };
}

function itemMovement(p, movs, outgoing) {
  const sel = p.items || new Set();
  const groups = new Map();
  for (const m of movs) {
    const q = Number(m.qty);
    if (!inRange(m, p) || !sel.has(m.item_id) || (outgoing ? q >= 0 : q <= 0)) continue;
    const k = m.item_id + '|' + m.unit;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const rows = [];
  for (const k of [...groups.keys()].sort((a, b) => byName(itemName(a.split('|')[0]), itemName(b.split('|')[0])))) {
    const [id, stockUnit] = k.split('|');
    const list = groups.get(k);
    const unit = stockUnit === (Data.items.get(id) || {}).unit ? ru(id, 0)[1] : stockUnit;
    const rq = (q) => (unit === stockUnit ? q : ru(id, q)[0]);
    const per = new Map(); let tot = 0;
    list.forEach((m) => { const q = Math.abs(Number(m.qty)); per.set(m.party_id, r6((per.get(m.party_id) || 0) + q)); tot += q; });
    if (p.detail === 'detailed') {
      [...per.keys()].sort((a, b) => byName(partyName(a), partyName(b))).forEach((pid) => {
        const byDate = new Map();
        list.filter((m) => m.party_id === pid).forEach((m) => byDate.set(m.date, r6((byDate.get(m.date) || 0) + Math.abs(Number(m.qty)))));
        [...byDate.keys()].sort().forEach((d) => rows.push([itemName(id), unit, partyName(pid), d, rq(byDate.get(d))]));
      });
    } else {
      [...per.keys()].sort((a, b) => per.get(b) - per.get(a)).forEach((pid) => rows.push([itemName(id), unit, partyName(pid), rq(per.get(pid)), tot ? per.get(pid) / tot : 0]));
    }
  }
  const title = (outgoing ? 'Item consumption' : 'Item receipts') + (p.detail === 'detailed' ? ' (detailed)' : ' (summary)');
  return { title, subtitle: periodText(p),
    columns: p.detail === 'detailed' ? cols(['Item', 't'], ['Unit', 't'], ['Supplier / Department', 't'], ['Date', 'd'], ['Quantity', 'n'])
      : cols(['Item', 't'], ['Unit', 't'], ['Supplier / Department', 't'], ['Quantity', 'n'], ['Share', 'p']), rows };
}

function multiMonth(p, movs) {
  const sel = p.items || new Set();
  const months = p.months && p.months.size ? p.months : new Set([Number(Data.todayIso().slice(5, 7))]);
  const total = new Map();
  for (const m of movs) {
    if (!sel.has(m.item_id) || Number(m.date.slice(0, 4)) !== Number(p.year)) continue;
    const mo = Number(m.date.slice(5, 7));
    if (!months.has(mo)) continue;
    const k = mo + '|' + m.item_id;
    total.set(k, r6((total.get(k) || 0) + Number(m.qty)));
  }
  const rows = [...total.keys()].sort((a, b) => Number(a.split('|')[0]) - Number(b.split('|')[0]) || byName(itemName(a.split('|')[1]), itemName(b.split('|')[1])))
    .map((k) => { const [mo, id] = k.split('|'); const [q, u] = ru(id, total.get(k)); return [MONTHS[mo - 1], itemName(id), u, q]; });
  return { title: 'Multi-month item report ' + p.year, subtitle: todayText(),
    columns: cols(['Month', 't'], ['Item', 't'], ['Unit', 't'], ['Total quantity', 'n']), rows };
}

function prices(p, movs) {
  const sel = p.items || new Set();
  const rec = new Map();
  for (const m of movs) {
    if (m.kind !== 'RECEIPT' || !sel.has(m.item_id) || !(Number(m.price) > 0)) continue;
    if (!rec.has(m.item_id)) rec.set(m.item_id, []);
    rec.get(m.item_id).push(m);
  }
  const rows = [];
  [...rec.keys()].sort((a, b) => byName(itemName(a), itemName(b))).forEach((id) => {
    const list = rec.get(id);
    const latest = list.reduce((a, b) => (b.date > a.date || (b.date === a.date && b.movement_id > a.movement_id) ? b : a));
    const high = list.reduce((a, b) => (Number(b.price) > Number(a.price) ? b : a));
    const low = list.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
    [['Latest', latest], ['Highest', high], ['Lowest', low]].forEach(([kind, m]) =>
      rows.push([itemName(id), kind, Number(m.price), m.per, partyName(m.party_id), m.date]));
  });
  return { title: 'Price differences', subtitle: todayText(),
    columns: cols(['Item', 't'], ['Price type', 't'], ['Price (QR)', 'm'], ['Per', 't'], ['Supplier', 't'], ['Date', 'd']), rows };
}

function weekStart(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7));   // weeks start on Saturday
  return d.toISOString().slice(0, 10);
}

function productionSummary(p, movs) {
  const key = (d) => (p.period === 'weekly' ? 'Week of ' + weekStart(d) : p.period === 'yearly' ? d.slice(0, 4) : d.slice(0, 7));
  const tot = new Map();
  movs.filter((m) => m.kind === 'PROD_OUTPUT').forEach((m) => {
    const k = key(m.date) + '|' + m.item_id;
    tot.set(k, r6((tot.get(k) || 0) + Number(m.qty)));
  });
  const rows = [...tot.keys()].sort().reverse().map((k) => {
    const [per, id] = k.split('|');
    return [per, itemName(id), tot.get(k), (Data.items.get(id) || {}).unit || ''];
  });
  const label = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }[p.period] || 'Monthly';
  return { title: 'Production summary (' + label + ')', subtitle: todayText(),
    columns: cols(['Period', 't'], ['Product', 't'], ['Quantity', 'n'], ['Unit', 't']), rows };
}

// ---------- traceability (food safety inquiry): what each department received, from which batch
// Issues do not record the batch. It is worked out the same way as the stock's batches on the server
// (Batches.gs): the stock on hand is the latest receipts, so what went out came from the oldest ones.
// The whole history of the item is replayed in date order, every inflow is a batch (its expiry, supplier,
// invoice), and every outflow takes from the batch received first (FIFO). A stock count that set the
// expiry starts again from what was counted.
const INFLOWS = new Set(['RECEIPT', 'OPENING', 'DEPT_RETURN', 'PROD_OUTPUT', 'ADJUST', 'SHOP_RETURN']);
const SOURCE = { RECEIPT: 'Receipt', OPENING: 'Opening balance', DEPT_RETURN: 'Department return', PROD_OUTPUT: 'Production',
  ADJUST: 'Stock adjustment', SHOP_RETURN: 'Shop return', COUNT: 'Stock count' };
const receivedFirst = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** {movement key: [{qty, lot}]} — the batches each outflow of these items took from. */
function batchesTaken(movs, itemIds) {
  const byItem = new Map();
  for (const m of movs) {
    if (!itemIds.has(m.item_id) || !Number(m.qty)) continue;
    if (!byItem.has(m.item_id)) byItem.set(m.item_id, []);
    byItem.get(m.item_id).push(m);
  }
  const taken = new Map();
  for (const [id, list] of byItem) {
    list.sort((a, b) => (a.date === b.date ? String(a.movement_id || a.created_at || '').localeCompare(String(b.movement_id || b.created_at || '')) : a.date < b.date ? -1 : 1));
    const bal = Data.balances.get(id) || {};
    const reset = /^\d{4}-\d{2}-\d{2}$/.test(String(bal.expiry_reset || '')) ? String(bal.expiry_reset) : '';
    const resetOn = String(bal.expiry_reset_on || '');
    let lots = [];
    let applied = false;
    for (const m of list) {
      if (reset && !applied && m.date > resetOn) {
        lots = [{ expiry: reset, qty: Number(bal.expiry_reset_qty) || 0, date: resetOn, kind: 'COUNT', party: '', doc: '' }];
        applied = true;
      }
      const q = Number(m.qty);
      if (q > 0) {
        lots.push({ expiry: INFLOWS.has(m.kind) ? String(m.expiry || '') : '', qty: q, date: m.date, kind: m.kind, party: m.party_id, doc: m.doc_no || '' });
        continue;
      }
      let need = -q;
      const parts = [];
      lots.sort(receivedFirst);
      for (const lot of lots) {
        if (need <= 0) break;
        const x = Math.min(need, lot.qty);
        if (x <= 0) continue;
        lot.qty = r6(lot.qty - x); need = r6(need - x);
        parts.push({ qty: x, lot });
      }
      lots = lots.filter((l) => l.qty > 0);
      if (need > 0) parts.push({ qty: need, lot: null });   // more out than recorded in: no batch known
      taken.set(m.movement_id || m.client_id, parts);
    }
  }
  return taken;
}

function trace(p, movs) {
  const isSection = (id) => ['section', 'shop', 'affiliate'].includes((Data.parties.get(id) || {}).kind);
  // what the chosen departments received in the period
  const out = movs.filter((m) => inRange(m, p) && Number(m.qty) < 0
    && m.kind === 'ISSUE' && isSection(m.party_id) && p.sections.has(m.party_id));
  const taken = batchesTaken(movs, new Set(out.map((m) => m.item_id)));
  const rows = [];
  out.sort((a, b) => (a.date === b.date ? byName(itemName(a.item_id), itemName(b.item_id)) : a.date < b.date ? -1 : 1)).forEach((m) => {
    const dept = partyName(m.party_id);
    const unit = (Data.items.get(m.item_id) || {}).unit || m.unit || '';
    (taken.get(m.movement_id || m.client_id) || [{ qty: -Number(m.qty), lot: null }]).forEach(({ qty, lot }) => {
      rows.push([m.date, dept, itemName(m.item_id), qty, unit, m.doc_no || '',
        lot ? lot.expiry : '', lot ? SOURCE[lot.kind] || lot.kind : 'Not known', lot ? lot.date : '',
        lot && lot.party ? partyName(lot.party) : '', lot ? lot.doc : '']);
    });
  });
  return { title: 'Traceability: materials issued and their batches', subtitle: periodText(p)
      + '  ·  Batch worked out by "first received, first out"',
    columns: cols(['Date issued', 'd'], ['Department', 't'], ['Item', 't'], ['Quantity', 'n'], ['Unit', 't'], ['Issue slip', 't'],
      ['Expiry', 'd'], ['Batch source', 't'], ['Received on', 'd'], ['Supplier', 't'], ['Invoice no.', 't']), rows };
}

function cols(...defs) { return defs.map(([label, type]) => ({ label, type })); }

/** Plain text of a report for WhatsApp (one line per row). */
export function reportText(rep, fmtNum, fmtDate) {
  const lines = [rep.title, rep.subtitle, '-'.repeat(32)];
  rep.rows.forEach((r) => {
    lines.push('- ' + r.map((v, i) => {
      if (v === '' || v === null || v === undefined) return '';
      const t = rep.columns[i].type;
      if (t === 'd') return fmtDate(v);
      if (t === 'p') return (Number(v) * 100).toFixed(1) + '%';
      if (t === 'n' || t === 'm') return fmtNum(v);
      return String(v);
    }).filter(Boolean).join(' | '));
  });
  if (!rep.rows.length) lines.push((rep.labels || {}).none || 'No data.');
  (rep.foot || []).forEach((x) => lines.push(x));
  return lines.join('\n');
}
