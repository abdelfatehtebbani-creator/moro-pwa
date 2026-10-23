'use strict';
// Expiry by batch: the stock on hand is the batches that expire last (stock is taken earliest-expiry first).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

function env(balance) {
  const g = createGas();
  g.seed('Items', [{ item_id: 'I0001', name: 'MILK', category: 'Food', unit: 'TIN', min_stock: 0, active: true, store: 'CHILLED' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Farm', kind: 'supplier', active: true }, { party_id: 'P002', name: 'Kitchen', kind: 'section', active: true }]);
  g.seed('Movements', [
    { movement_id: 'M000001', date: '2026-10-01', kind: 'RECEIPT', party_id: 'P001', item_id: 'I0001', qty: 100, unit: 'TIN', expiry: '2026-10-24', status: 'active' },
    { movement_id: 'M000002', date: '2026-10-23', kind: 'RECEIPT', party_id: 'P001', item_id: 'I0001', qty: 1, unit: 'TIN', expiry: '2026-11-23', status: 'active' }]);
  g.seed('Balances', [{ item_id: 'I0001', qty: balance, unit: 'TIN', last_expiry: '2026-11-23' }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = g.api('auth.login', { username: 'admin', pin: '1234' }).data.token;
  const boot = () => g.api('data.bootstrap', {}, tok).data;
  return { g, tok, boot };
}
const lastExpiry = (d) => d.balances.rows[0][d.balances.columns.indexOf('last_expiry')];

test('101 tins: 100 expire tomorrow, 1 next month; the nearest expiry is tomorrow, not the last receipt', () => {
  const d = env(101).boot();
  assert.deepEqual(d.batches.I0001, [['2026-10-24', 100], ['2026-11-23', 1]]);
  assert.equal(lastExpiry(d), '2026-10-24');
});

test('90 tins: 89 tomorrow and 1 next month; 1 tin: only next month', () => {
  assert.deepEqual(env(90).boot().batches.I0001, [['2026-10-24', 89], ['2026-11-23', 1]]);
  const d = env(1).boot();
  assert.deepEqual(d.batches.I0001, [['2026-11-23', 1]]);
  assert.equal(lastExpiry(d), '2026-11-23');
});

test('a count that corrects the expiry replaces the batches up to the count date', () => {
  const { g, tok, boot } = env(101);
  const id = g.api('counts.open', { store: 'CHILLED', date: '2026-10-23', period: 'monthly' }, tok).data.count.count_id;
  g.api('counts.save', { count_id: id, lines: [{ item_id: 'I0001', counted_qty: 101, unit: 'TIN', counted_expiry: '2026-12-31' }] }, tok);
  assert.equal(g.api('counts.approve', { count_id: id }, tok).ok, true);
  assert.deepEqual(boot().batches.I0001, [['2026-12-31', 101]]);
});

test('a batch used up long ago does not hide new stock: replayed in date order', () => {
  const g = createGas();
  g.seed('Items', [{ item_id: 'I0001', name: 'MILK', category: 'Food', unit: 'TIN', min_stock: 0, active: true, store: 'CHILLED' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Farm', kind: 'supplier', active: true }, { party_id: 'P002', name: 'Kitchen', kind: 'section', active: true }]);
  g.seed('Movements', [
    { movement_id: 'M000001', date: '2026-01-01', kind: 'RECEIPT', party_id: 'P001', item_id: 'I0001', qty: 10, unit: 'TIN', expiry: '2027-12-31', status: 'active' },
    { movement_id: 'M000002', date: '2026-02-01', kind: 'ISSUE', party_id: 'P002', item_id: 'I0001', qty: -10, unit: 'TIN', status: 'active' },
    { movement_id: 'M000003', date: '2026-10-01', kind: 'RECEIPT', party_id: 'P001', item_id: 'I0001', qty: 5, unit: 'TIN', expiry: '2026-10-10', status: 'active' }]);
  g.seed('Balances', [{ item_id: 'I0001', qty: 5, unit: 'TIN', last_expiry: '2026-10-10' }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = g.api('auth.login', { username: 'admin', pin: '1234' }).data.token;
  assert.deepEqual(g.api('data.bootstrap', {}, tok).data.batches.I0001, [['2026-10-10', 5]]);
});
