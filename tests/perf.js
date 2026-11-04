'use strict';
/**
 * Speed check (not a test): runs the main actions on the real-size data of migration/out plus a few hundred
 * shop orders, and prints, per action, the spreadsheet calls made (each costs time in Apps Script, a read of
 * a big sheet the most) and the time the server code itself took.
 *   node tests/perf.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { createGas } = require('./helpers/gas');

const OUT = path.join(__dirname, '..', 'migration', 'out');
const NUMERIC = new Set(['qty', 'price', 'amount', 'discount', 'final_amount', 'min_stock', 'qty_per_unit']);
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const g = createGas();
for (const f of fs.readdirSync(OUT).filter((n) => n.endsWith('.csv'))) {
  const name = f.slice(0, -4);
  if (!g.spreadsheet.sheets[name]) continue;
  const [head, ...body] = parseCsv(fs.readFileSync(path.join(OUT, f), 'utf8').replace(/^﻿/, ''));
  g.seed(name, body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => {
    const v = r[i] ?? '';
    if (NUMERIC.has(h) && v !== '') return [h, Number(v)];
    if (h === 'active') return [h, v.toUpperCase() === 'TRUE'];
    return [h, v];
  }))));
}

// count the spreadsheet calls (patched on the prototypes of the fakes)
const count = {};
const tick = (k) => { count[k] = (count[k] || 0) + 1; };
const anySheet = Object.values(g.spreadsheet.sheets)[0];
const SP = Object.getPrototypeOf(anySheet);
['getLastRow', 'getLastColumn', 'getMaxRows', 'insertRowsAfter'].forEach((m) => { const f = SP[m]; SP[m] = function (...a) { tick(m); return f.apply(this, a); }; });
const RP = Object.getPrototypeOf(anySheet.getRange(1, 1, 1, 1));
['getValues', 'setValues', 'setNumberFormat', 'setNumberFormats', 'setValue'].forEach((m) => { const f = RP[m]; if (f) RP[m] = function (...a) { tick(m); return f.apply(this, a); }; });
const PP = Object.getPrototypeOf(g.spreadsheet);
const gs = PP.getSheetByName; PP.getSheetByName = function (...a) { tick('getSheetByName'); return gs.apply(this, a); };

g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
const admin = g.api('auth.login', { username: 'admin', pin: '1234' }).data.token;
const users = {};
const user = (u, role, extra) => {
  g.api('users.save', Object.assign({ username: u, display_name: u, role, pin: '5678' }, extra || {}), admin);
  const id = g.rows('Users').find((x) => x.username === u).user_id;
  if (extra) g.api('users.save', Object.assign({ user_id: id }, extra), admin);
  users[u] = g.api('auth.login', { username: u, pin: '5678' }).data.token;
  return id;
};
const shops = g.rows('Parties').filter((p) => p.kind === 'shop').map((p) => p.party_id);
if (!shops.length) { g.seed('Parties', [{ party_id: 'P901', name: 'Shop X', kind: 'shop', active: true }]); shops.push('P901'); }
user('cash', 'cashier', { shop: shops[0] });
user('dist', 'distribution');
user('store', 'storekeeper', { stores: ['DRY', 'CHILLED', 'PACK', 'CLEAN', 'FINAL'] });
const items = g.rows('Items').filter((i) => i.active === true && i.store !== 'FINAL').slice(0, 40).map((i) => i.item_id);

// a few hundred orders in the history, as after some weeks of use
for (let n = 0; n < 300; n++) {
  const o = g.api('orders.save', { lines: items.slice(n % 30, n % 30 + 5).map((id) => ({ item_id: id, qty: 1 })), send: true }, users.cash);
  if (o.ok && n % 2) g.api('orders.approve', { order_id: o.data.order.order_id }, users.dist);
}

function measure(label, fn) {
  Object.keys(count).forEach((k) => delete count[k]);
  const t0 = process.hrtime.bigint();
  const r = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const reads = count.getValues || 0, writes = (count.setValues || 0) + (count.setValue || 0), fmt = (count.setNumberFormat || 0) + (count.setNumberFormats || 0);
  const other = (count.getLastRow || 0) + (count.getLastColumn || 0) + (count.getMaxRows || 0) + (count.getSheetByName || 0) + (count.insertRowsAfter || 0);
  console.log(label.padEnd(26), 'reads', String(reads).padStart(3), ' writes', String(writes).padStart(3), ' formats', String(fmt).padStart(3),
    ' other', String(other).padStart(4), ' code', ms.toFixed(0).padStart(5) + ' ms', r && r.ok === false ? '  ERROR ' + JSON.stringify(r.error) : '');
  return r;
}

const today = JSON.parse(g.run('JSON.stringify(Util.today())'));
measure('data.bootstrap (admin)', () => g.api('data.bootstrap', {}, admin));
measure('data.bootstrap (store)', () => g.api('data.bootstrap', {}, users.store));
measure('data.version', () => g.api('data.version', {}, admin));
const supplier = g.rows('Parties').find((p) => p.kind === 'supplier').party_id;
measure('movements.save receipt', () => g.api('movements.save', { movements: [{ client_id: 'perf-r', kind: 'RECEIPT', date: today, party_id: supplier, item_id: items[0], qty: 1,
  unit: g.rows('Items').find((i) => i.item_id === items[0]).unit, doc_no: 'PERF', price: 1, per: g.rows('Items').find((i) => i.item_id === items[0]).unit, amount: 1, location: 'X', expiry: '2099-01-01' }] }, admin));
const o = measure('orders.save (send)', () => g.api('orders.save', { lines: items.slice(0, 5).map((id) => ({ item_id: id, qty: 1 })), send: true }, users.cash));
measure('orders.approve', () => g.api('orders.approve', { order_id: o.data.order.order_id }, users.dist));
const line = (g.api('shop.list', { native: true }, users.store).data || []).find((l) => l.order_id === o.data.order.order_id) || {};
measure('shop.list', () => g.api('shop.list', { native: true }, users.store));
if (line.line_id) measure('shop.hand', () => g.api('shop.hand', { date: today, client_id: 'perf-h', lines: [{ line_id: line.line_id, qty: 1 }] }, users.store));
measure('orders.list (dist)', () => g.api('orders.list', { limit: 1000 }, users.dist));
measure('report.losses', () => g.api('report.losses', {}, admin));

// which sheets a cashier's send reads
const seen = [];
const RP2 = Object.getPrototypeOf(anySheet.getRange(1, 1, 1, 1));
const gv = RP2.getValues; RP2.getValues = function (...a) { seen.push(this.sheet.name + ':' + this.rows); return gv.apply(this, a); };
g.api('orders.save', { lines: items.slice(0, 5).map((id) => ({ item_id: id, qty: 1 })), send: true }, users.cash);
console.log('orders.save reads:', seen.join(', '));
