'use strict';
// Cash purchases: daily sheets paid from a running cash balance, sent to the admin like an LPO.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

function env() {
  const g = createGas();
  g.seed('Items', [{ item_id: 'I0001', name: 'NAPKIN', category: 'Packaging', unit: 'BOX', min_stock: 0, active: true, store: 'PACK' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Al Madina', kind: 'supplier', active: true }, { party_id: 'P002', name: 'Kitchen', kind: 'section', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  g.api('users.save', { username: 'buyer', display_name: 'Buyer', role: 'purchasing', pin: '5678' }, tok.admin);
  g.api('users.save', { username: 'store', display_name: 'Store', role: 'storekeeper', pin: '4321' }, tok.admin);
  tok.buyer = g.api('auth.login', { username: 'buyer', pin: '5678' }).data.token;
  tok.store = g.api('auth.login', { username: 'store', pin: '4321' }).data.token;
  return { g, tok };
}
const sheet = (over) => Object.assign({ date: '2026-10-27', lines: [
  { kind: 'material', party_id: 'P001', item_id: 'I0001', description: 'White napkin 1 box', amount: 90, paid_by: 'Nassif', requested_by: 'Chef Sameer' },
  { kind: 'expense', payee: 'Petrol', description: 'Petrol for Nassif', amount: 50, paid_by: 'Nassif' }] }, over);

test('cash: running balance; a sent sheet takes from it; a rejection gives it back; approval keeps it out', () => {
  const { g, tok } = env();
  assert.equal(g.api('cash.list', {}, tok.store).error.code, 'forbidden');
  assert.equal(g.api('cash.float', { date: '2026-10-27', amount: 675 }, tok.buyer).error.code, 'forbidden');
  assert.equal(g.api('cash.float', { date: '2026-10-27', amount: 675, note: 'from the manager' }, tok.admin).data.balance, 675);
  const r = g.api('cash.save', sheet(), tok.buyer).data;
  assert.deepEqual([r.status, r.total], ['draft', 140]);
  assert.equal(g.api('cash.list', {}, tok.buyer).data.balance, 675, 'a draft does not take money yet');
  assert.equal(g.api('cash.save', sheet({ sheet_id: r.sheet_id, submit: true }), tok.buyer).data.status, 'submitted');
  const got = g.api('cash.get', { sheet_id: r.sheet_id }, tok.buyer).data;
  assert.equal(got.sheet.opening, 675);
  assert.equal(got.balance, 675, 'cash on hand before this sheet');
  assert.equal(g.api('cash.list', {}, tok.admin).data.balance, 535);
  assert.equal(g.api('data.bootstrap', {}, tok.admin).data.cash_pending, 1);
  assert.equal(g.api('cash.decide', { sheet_id: r.sheet_id, approve: false }, tok.admin).error.code, 'reason_required');
  g.api('cash.decide', { sheet_id: r.sheet_id, approve: false, note: 'receipt missing' }, tok.admin);
  assert.equal(g.api('cash.list', {}, tok.admin).data.balance, 675);
  g.api('cash.save', sheet({ sheet_id: r.sheet_id, submit: true }), tok.buyer);
  assert.equal(g.api('cash.decide', { sheet_id: r.sheet_id, approve: true }, tok.admin).data.status, 'approved');
  assert.equal(g.api('cash.list', {}, tok.admin).data.balance, 535);
  assert.deepEqual(g.api('data.bootstrap', {}, tok.buyer).data.cash_decided.map((x) => x[1]), ['approved']);
  // stock is not touched by a cash sheet (materials are received in the receive screen)
  assert.equal(g.rows('Movements').length, 0);
});

test('cash: amounts are required and numeric; a supplier payment needs a supplier', () => {
  const { g, tok } = env();
  assert.equal(g.api('cash.save', sheet({ lines: [{ kind: 'expense', description: 'x', amount: '' }] }), tok.buyer).error.code, 'amount_invalid');
  assert.equal(g.api('cash.save', sheet({ lines: [{ kind: 'supplier', description: 'part payment', amount: 6000 }] }), tok.buyer).error.code, 'party_not_supplier');
  assert.equal(g.api('cash.save', sheet({ lines: [{ kind: 'supplier', party_id: 'P002', description: 'x', amount: 5 }] }), tok.buyer).error.code, 'party_not_supplier');
  assert.equal(g.api('cash.save', sheet({ lines: [{ kind: 'supplier', party_id: 'P001', description: 'part payment', amount: 6000 }] }), tok.buyer).ok, true);
});
