'use strict';
// Coffee bags: green coffee taken from stock is roasted and packed; the stock moves like a production
// and the batch keeps the real roasting loss and packing waste.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

function env() {
  const g = createGas();
  g.seed('Items', [
    { item_id: 'I0001', name: 'GREEN COFFEE BRAZIL', category: 'Food', unit: 'KG', min_stock: 0, active: true, store: 'DRY' },
    { item_id: 'I0002', name: 'GREEN COFFEE ETHIOPIA', category: 'Food', unit: 'KG', min_stock: 0, active: true, store: 'DRY' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Farm', kind: 'supplier', active: true }, { party_id: 'P002', name: 'Army', kind: 'section', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  g.api('users.save', { username: 'store', display_name: 'Store', role: 'storekeeper', pin: '4321' }, tok.admin);
  g.api('users.save', { username: 'prod', display_name: 'Prod', role: 'production', pin: '5678' }, tok.admin);
  tok.store = g.api('auth.login', { username: 'store', pin: '4321' }).data.token;
  tok.prod = g.api('auth.login', { username: 'prod', pin: '5678' }).data.token;
  g.seed('Balances', [{ item_id: 'I0001', qty: 30, unit: 'KG', last_expiry: '' }, { item_id: 'I0002', qty: 10, unit: 'KG', last_expiry: '' }]);
  return { g, tok };
}
const qty = (g, id) => Number((g.rows('Balances').find((b) => b.item_id === id) || {}).qty || 0);
const batch = (over) => Object.assign({ client_id: 'b1', date: '2026-10-27', green: [{ item_id: 'I0001', qty: 24 }, { item_id: 'I0002', qty: 6 }],
  roasted: 24, bags: 112, bag_g: 200 }, over);

test('coffee: a batch takes the green coffee, adds the bags, and keeps the real loss and waste', () => {
  const { g, tok } = env();
  assert.equal(g.api('coffee.pack', batch(), tok.prod).error.code, 'forbidden');
  const r = g.api('coffee.pack', batch(), tok.store).data;
  assert.ok(r.bag_item);
  assert.equal(qty(g, 'I0001'), 6);
  assert.equal(qty(g, 'I0002'), 4);
  assert.equal(qty(g, r.bag_item), 112);
  assert.equal(g.rows('Items').find((i) => i.item_id === r.bag_item).name, 'COFFEE BAG 200G');
  // sent twice (a retry): nothing moves twice
  assert.equal(g.api('coffee.pack', batch(), tok.store).data.duplicate, true);
  assert.equal(qty(g, r.bag_item), 112);
  const b = g.api('coffee.list', {}, tok.store).data.batches[0];
  assert.equal(b.green_kg, 30);
  assert.equal(b.packed_kg, 22.4);
  assert.equal(b.roast_loss_pct, 20);
  assert.equal(b.waste_g, 14.285714);
  assert.equal(b.loss_pct, 25.333333);
});

test('coffee: the roasted weight is optional; impossible figures are refused', () => {
  const { g, tok } = env();
  assert.equal(g.api('coffee.pack', batch({ bags: 200 }), tok.store).error.code, 'coffee_more_than_green');
  assert.equal(g.api('coffee.pack', batch({ roasted: 20, bags: 110 }), tok.store).error.code, 'coffee_more_than_roasted');
  assert.equal(g.api('coffee.pack', batch({ roasted: 31 }), tok.store).error.code, 'coffee_roasted_invalid');
  assert.equal(g.api('coffee.pack', batch({ green: [] }), tok.store).error.code, 'coffee_no_green');
  assert.equal(g.api('coffee.pack', batch({ bags: 10.5 }), tok.store).error.code, 'qty_invalid');
  const b = g.api('coffee.pack', batch({ roasted: '' }), tok.store).data;
  assert.ok(b.bag_item);
  const row = g.api('coffee.list', {}, tok.store).data.batches[0];
  assert.equal(row.roast_loss_pct, null);
  assert.equal(row.waste_g, null);
});

test('coffee: the bags given to the customer appear in the coffee list', () => {
  const { g, tok } = env();
  const bag = g.api('coffee.pack', batch(), tok.store).data.bag_item;
  g.api('movements.save', { movements: [{ client_id: 'i1', kind: 'ISSUE', date: '2026-10-27', party_id: 'P002', item_id: bag, qty: 100, unit: 'BAG' }] }, tok.admin);
  assert.equal(qty(g, bag), 12);
  const out = g.api('coffee.list', {}, tok.store).data.out;
  assert.deepEqual(out.map((o) => [o.party, o.qty]), [['Army', 100]]);
});
