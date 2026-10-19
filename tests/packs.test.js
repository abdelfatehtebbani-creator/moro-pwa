'use strict';
// Packaging units: eggs kept in PC, received in BOX (= 12 TRAY = 360 PC), issued in PC or TRAY.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(new Date());

function env() {
  const g = createGas();
  g.seed('Items', [{ item_id: 'I0001', name: 'EGGS', category: 'Food', unit: 'PC', min_stock: 0, active: true },
                   { item_id: 'I0002', name: 'OLD EGGS', category: 'Food', unit: 'BOX', min_stock: 2, active: true }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Section Kitchen', kind: 'section', active: true },
                     { party_id: 'P002', name: 'Farm', kind: 'supplier', active: true }]);
  g.seed('Balances', [{ item_id: 'I0002', qty: 3, unit: 'BOX', last_expiry: '', updated_at: '' }]);
  g.seed('Movements', [{ movement_id: 'M000001', date: '2026-01-01', kind: 'OPENING', party_id: 'P002', item_id: 'I0002', qty: 3, unit: 'BOX', status: 'active' }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  for (const [u, role] of [['store', 'storekeeper'], ['buyer', 'purchasing']]) {
    g.api('users.save', { username: u, display_name: u, role, pin: '5678' }, tok.admin);
    tok[u] = g.api('auth.login', { username: u, pin: '5678' }).data.token;
  }
  const bal = (id) => Number((g.rows('Balances').find((x) => x.item_id === id) || {}).qty || 0);
  return { g, tok, bal };
}

const receipt = (extra) => ({ kind: 'RECEIPT', date: TODAY, party_id: 'P002', item_id: 'I0001', qty: 10, unit: 'BOX', price: 90, per: 'BOX',
  amount: 900, discount: 0, doc_no: 'INV-1', location: 'Chiller 1', expiry: '2027-01-01', ...extra });

test('packaging units: set by admin, purchasing and the storekeeper of the item store; factors checked', () => {
  const { g, tok } = env();
  const sk = g.rows('Users').find((u) => u.username === 'store');
  g.api('users.save', { user_id: sk.user_id, stores: ['PACK'] }, tok.admin);
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'EGGS', pack_units: 'TRAY=30, BOX=360' }, tok.store).error.code, 'store_forbidden');
  g.api('users.save', { user_id: sk.user_id, stores: ['DRY'] }, tok.admin);
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'EGGS', pack_units: '1 BOX = 360 PC' }, tok.store).ok, true);
  // the purchase-unit permission alone does not add items
  g.api('users.save', { user_id: sk.user_id, caps: ['receive', 'issue', 'packaging'] }, tok.admin);
  assert.equal(g.api('items.save', { name: 'NEW CUPS', store: 'DRY', unit: 'PC' }, tok.store).error.code, 'forbidden');
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'EGGS', pack_units: '1 BOX = 30 PC' }, tok.store).ok, true);
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'EGGS', pack_units: 'PC=1' }, tok.buyer).error.code, 'pack_invalid');
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'EGGS', pack_units: [{ unit: 'tray', factor: 30 }, { unit: 'box', factor: 360 }], report_unit: 'BOX' }, tok.buyer).ok, true);
  const it = g.rows('Items').find((i) => i.item_id === 'I0001');
  assert.equal(it.pack_units, 'TRAY=30, BOX=360');
  assert.equal(it.report_unit, 'BOX');
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'EGGS', report_unit: 'CRATE' }, tok.buyer).error.code, 'unit_not_defined');
});

test('received in BOX, kept in PC; issued in TRAY or PC; what was typed is kept', () => {
  const { g, tok, bal } = env();
  g.api('items.save', { item_id: 'I0001', name: 'EGGS', pack_units: 'TRAY=30, BOX=360', report_unit: 'BOX' }, tok.admin);
  const r = g.api('movements.save', { movements: [receipt()] }, tok.store);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(bal('I0001'), 3600);
  const m = g.rows('Movements').find((x) => x.movement_id === r.data.saved[0].movement_id);
  assert.deepEqual([m.qty, m.unit, m.entry_qty, m.entry_unit, m.price, m.per, m.amount], [3600, 'PC', 10, 'BOX', 90, 'BOX', 900]);
  const iss = (qty, unit) => ({ kind: 'ISSUE', date: TODAY, party_id: 'P001', item_id: 'I0001', qty, unit });
  assert.equal(g.api('movements.save', { movements: [iss(2, 'TRAY'), iss(45, 'PC')] }, tok.store).ok, true);
  assert.equal(bal('I0001'), 3600 - 60 - 45);
  assert.equal(g.api('movements.save', { movements: [iss(1, 'CRATE')] }, tok.store).error.code, 'unit_not_defined');
  // edit: a new date keeps "10 BOX"; a new quantity in BOX is converted again
  const id = r.data.saved[0].movement_id;
  assert.equal(g.api('movements.update', { movement_id: id, changes: { date: TODAY } }, tok.store).ok, true);
  assert.equal(g.rows('Movements').find((x) => x.movement_id === id).entry_unit, 'BOX');
  assert.equal(g.api('movements.update', { movement_id: id, changes: { qty: 5, unit: 'BOX', amount: 450 } }, tok.store).ok, true);
  assert.equal(bal('I0001'), 1800 - 60 - 45);
  // MORO's catalogue for Masar: last purchase price per PC
  const key = g.run('Link.newSecret()');
  const cat = g.api('link.catalog', { key }).data.items.find((i) => i.item_id === 'I0001');
  assert.equal(cat.unit, 'PC');
  assert.equal(cat.last_purchase_price, 0.25);
});

test('renaming the stock unit (factor 1): PC -> TIN in the item, balance and history, quantities unchanged', () => {
  const { g, tok, bal } = env();
  assert.equal(g.api('items.save', { item_id: 'I0002', name: 'OLD EGGS', unit: 'TIN' }, tok.admin).error.code, 'unit_change_use_convert');
  assert.equal(g.api('items.convertUnit', { item_id: 'I0002', new_unit: 'TIN', factor: 1 }, tok.admin).ok, true);
  assert.equal(bal('I0002'), 3);
  const it = g.rows('Items').find((i) => i.item_id === 'I0002');
  assert.deepEqual([it.unit, it.min_stock, it.pack_units, it.report_unit], ['TIN', 2, '', '']);
  const open = g.rows('Movements').find((m) => m.movement_id === 'M000001');
  assert.deepEqual([open.qty, open.unit, open.entry_unit], [3, 'TIN', '']);
  // then the purchase unit the other way round: 1 TIN = 18 KG, reports in KG
  assert.equal(g.api('items.save', { item_id: 'I0002', name: 'OLD EGGS', pack_units: [{ unit: 'KG', factor: 1 / 18 }], report_unit: 'KG' }, tok.admin).ok, true);
  assert.equal(g.rows('Items').find((i) => i.item_id === 'I0002').pack_units, '1 TIN=18 KG');
  assert.equal(g.api('movements.save', { movements: [{ kind: 'ISSUE', date: TODAY, party_id: 'P001', item_id: 'I0002', qty: 36, unit: 'KG' }] }, tok.admin).ok, true);
  assert.equal(bal('I0002'), 1);
});

test('display units: purchasing and the storekeeper each choose theirs; quantities stay in the base unit', () => {
  const { g, tok, bal } = env();
  g.api('items.save', { item_id: 'I0001', name: 'EGGS', pack_units: [{ unit: 'BOX', factor: 12 }] }, tok.admin);
  const sk = g.rows('Users').find((u) => u.username === 'store');
  g.api('users.save', { user_id: sk.user_id, stores: ['DRY'] }, tok.admin);
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'EGGS', report_unit: 'PC' }, tok.buyer).ok, true);
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'EGGS', store_unit: 'BOX' }, tok.store).ok, true);
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'EGGS', store_unit: 'PC' }, tok.buyer).error.code, 'forbidden');
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'EGGS', report_unit: 'BOX' }, tok.store).error.code, 'forbidden');
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'EGGS', store_unit: 'CRATE' }, tok.store).error.code, 'unit_not_defined');
  const it = g.rows('Items').find((i) => i.item_id === 'I0001');
  assert.deepEqual([it.unit, it.report_unit, it.store_unit], ['PC', 'PC', 'BOX']);
  // 8 BOX received = 96 PC kept; changing a display unit changes no quantity
  assert.equal(g.api('movements.save', { movements: [receipt({ qty: 8, unit: 'BOX', per: 'BOX', price: 10, amount: 80 })] }, tok.store).ok, true);
  assert.equal(bal('I0001'), 96);
  g.api('items.save', { item_id: 'I0001', name: 'EGGS', report_unit: 'BOX' }, tok.buyer);
  assert.equal(bal('I0001'), 96);
});

test('undoing a rename by mistake: rename back (factor 1), then convert with the real factor', () => {
  const { g, tok, bal } = env();
  const cv = (u, f) => g.api('items.convertUnit', { item_id: 'I0002', new_unit: u, factor: f }, tok.admin).ok;
  assert.equal(cv('KG', 1), true);                         // the mistake: 3 BOX became 3 KG
  assert.equal(bal('I0002'), 3);
  assert.equal(cv('BOX', 1), true);                        // back to 3 BOX
  assert.equal(cv('KG', 18.4), true);                      // 1 BOX = 18.4 KG
  assert.equal(bal('I0002'), 55.2);
  const it = g.rows('Items').find((i) => i.item_id === 'I0002');
  assert.deepEqual([it.unit, it.pack_units], ['KG', 'BOX=18.4']);
});

test('changing the stock unit: preview first, then balance, history and minimum converted (admin only)', () => {
  const { g, tok, bal } = env();
  const pv = g.api('items.convertUnit', { item_id: 'I0002', new_unit: 'PC', factor: 360, preview: true }, tok.admin).data;
  assert.deepEqual([pv.old_unit, pv.new_unit, pv.balance_before, pv.balance_after, pv.min_after], ['BOX', 'PC', 3, 1080, 720]);
  assert.equal(bal('I0002'), 3);                            // the preview changes nothing
  assert.equal(g.api('items.convertUnit', { item_id: 'I0002', new_unit: 'PC', factor: 360 }, tok.buyer).error.code, 'forbidden');
  // the admin may give the permission to another user
  const buyer = g.rows('Users').find((u) => u.username === 'buyer');
  g.api('users.save', { user_id: buyer.user_id, caps: ['receive', 'convert_unit'] }, tok.admin);
  assert.equal(g.api('items.convertUnit', { item_id: 'I0002', new_unit: 'PC', factor: 360, preview: true }, tok.buyer).ok, true);
  assert.equal(g.api('items.convertUnit', { item_id: 'I0002', new_unit: 'PC', factor: 360 }, tok.admin).ok, true);
  assert.equal(bal('I0002'), 1080);
  const it = g.rows('Items').find((i) => i.item_id === 'I0002');
  assert.deepEqual([it.unit, it.min_stock, it.pack_units, it.report_unit], ['PC', 720, 'BOX=360', 'BOX']);
  const open = g.rows('Movements').find((m) => m.movement_id === 'M000001');
  assert.deepEqual([open.qty, open.unit, open.entry_qty, open.entry_unit], [1080, 'PC', 3, 'BOX']);
  assert.equal(g.rows('Audit').filter((a) => a.action === 'item_unit_convert').length, 1);
});
