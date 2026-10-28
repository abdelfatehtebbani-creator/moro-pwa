// The 13 MORO v13 reports, computed on the device from the movements and balances.
// Every report returns {title, subtitle, columns:[{label, type}], rows:[[...]]}.
// Column types: t text, n number, m money, d date (YYYY-MM-DD), p share (0–1).
import { Data, STORES } from './data.js';
import { daysBetween } from './ui.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const itemName = (id) => (Data.items.get(id) || {}).name || id;
/** [qty, unit] of a stock-unit quantity in the item's report unit (eggs: 720 PC -> 2 BOX). */
const ru = (id, qty) => Data.inReportUnit(Data.items.get(id), qty);
const partyName = (id) => (Data.parties.get(id) || {}).name || id;
const byName = (a, b) => String(a).localeCompare(String(b));
const inRange = (m, p) => (!p.from || m.date >= p.from) && (!p.to || m.date <= p.to);
const periodText = (p) => 'Period: ' + p.from + '  to  ' + p.to;
const todayText = () => 'Date: ' + Data.todayIso();
const STORE_NAMES = { CHILLED: 'Chilled foods', DRY: 'Dry foods', PACK: 'Packaging', FINAL: 'Final products', CLEAN: 'Cleaning' };
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
];

function itemList(list, title) {
  const ids = Data.list(list);
  const rows = [...ids].map((id) => Data.items.get(id)).filter(Boolean)
    .sort((a, b) => (a.category === b.category ? byName(a.name, b.name) : a.category === 'Food' ? -1 : 1))
    .map((it) => [it.category, it.name, ...ru(it.item_id, Data.qty(it.item_id))]);
  return { title, subtitle: todayText(), columns: cols(['Category', 't'], ['Item', 't'], ['Quantity', 'n'], ['Unit', 't']), rows };
}

function minStock(p) {
  const rows = Data.lowStock().filter((x) => inStores(p, x.item.item_id)).map((x) => { const [q, u] = ru(x.item.item_id, x.qty); return [x.item.name, q, ru(x.item.item_id, x.min)[0], u]; });
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
      if (q > 0 && dated.length) Data.batchesOf(it.item_id).forEach((x) => rows.push(['Food', it.name, ...ru(it.item_id, x.qty), x.expiry,
        x.expiry ? expiryStatus(daysBetween(today, x.expiry)) : 'No expiry']));
      else rows.push(['Food', it.name, ...ru(it.item_id, q), exp, expiryStatus(daysBetween(today, exp))]);
    } else {
      if (p.foodOnly) continue;
      rows.push(['Packaging', it.name, ...ru(it.item_id, q), '', 'No expiry']);
    }
  }
  rows.sort((a, b) => (a[0] === b[0] ? byName(a[1], b[1]) : a[0] === 'Packaging' ? -1 : 1));
  return { title: 'Stock with expiry', subtitle: todayText() + storesText(p),
    columns: cols(['Category', 't'], ['Item', 't'], ['Quantity', 'n'], ['Unit', 't'], ['Expiry date', 'd'], ['Status', 't']), rows };
}

function nearExpiry(p) {
  const days = Number(p.days) || 90;
  const rows = Data.expiring(days).filter((x) => x.left >= 0 && (p.zero || x.qty > 0) && inStores(p, x.item.item_id))
    .map((x) => [x.item.name, x.expiry, x.left, ...ru(x.item.item_id, x.qty)]);
  if (p.zero) {
    const today = Data.todayIso();
    for (const b of Data.balances.values()) {
      const it = Data.items.get(b.item_id);
      if (!it || !b.last_expiry || Number(b.qty) > 0 || !inStores(p, it.item_id)) continue;
      const left = daysBetween(today, b.last_expiry);
      if (left >= 0 && left <= days) rows.push([it.name, b.last_expiry, left, ...ru(it.item_id, Number(b.qty))]);
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
  const isSection = (id) => (Data.parties.get(id) || {}).kind === 'section';
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
// Issues do not record the batch. It is worked out like the stock's batches on the server (Batches.gs):
// the whole history of the item is replayed in date order, every inflow is a batch (its expiry, supplier,
// invoice), and every outflow takes from the batch that expires first (FEFO). A stock count that set the
// expiry starts again from what was counted.
const INFLOWS = new Set(['RECEIPT', 'OPENING', 'DEPT_RETURN', 'PROD_OUTPUT', 'ADJUST', 'SHOP_RETURN']);
const SOURCE = { RECEIPT: 'Receipt', OPENING: 'Opening balance', DEPT_RETURN: 'Department return', PROD_OUTPUT: 'Production',
  ADJUST: 'Stock adjustment', SHOP_RETURN: 'Shop return', COUNT: 'Stock count' };
const expiryFirst = (a, b) => (a.expiry === b.expiry ? (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) : !a.expiry ? 1 : !b.expiry ? -1 : (a.expiry < b.expiry ? -1 : 1));

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
      lots.sort(expiryFirst);
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
  const isSection = (id) => (Data.parties.get(id) || {}).kind === 'section';
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
      + '  ·  Batch worked out by "first to expire, first out"',
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
  if (!rep.rows.length) lines.push('No data.');
  return lines.join('\n');
}
