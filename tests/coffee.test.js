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
    { item_id: 'I0002', name: 'GREEN COFFEE ETHIOPIA', category: 'Food', unit: 'KG', min_stock: 0, active: true, store: 'DRY' },
    { item_id: 'I0003', name: 'Coffee Pouch 2500pcs/box', category: 'Packaging', unit: 'BOX', min_stock: 0, active: true, store: 'PACK' },
    { item_id: 'I0004', name: 'POUCH', category: 'Packaging', unit: 'BOX', min_stock: 0, active: true, store: 'PACK' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Farm', kind: 'supplier', active: true }, { party_id: 'P002', name: 'Army', kind: 'section', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  g.api('users.save', { username: 'store', display_name: 'Store', role: 'storekeeper', pin: '4321' }, tok.admin);
  g.api('users.save', { username: 'prod', display_name: 'Prod', role: 'production', pin: '5678' }, tok.admin);
  tok.store = g.api('auth.login', { username: 'store', pin: '4321' }).data.token;
  tok.prod = g.api('auth.login', { username: 'prod', pin: '5678' }).data.token;
  g.seed('Balances', [{ item_id: 'I0001', qty: 30, unit: 'KG', last_expiry: '' }, { item_id: 'I0002', qty: 10, unit: 'KG', last_expiry: '' },
    { item_id: 'I0003', qty: 2, unit: 'BOX', last_expiry: '' }]);
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

test('coffee: one empty pouch per bag, in the unit of the pouch item', () => {
  const { g, tok } = env();
  assert.equal(g.api('coffee.pack', batch({ pouch_item: 'I0004' }), tok.store).error.code, 'coffee_pouch_unit');
  g.api('coffee.pack', batch({ pouch_item: 'I0003' }), tok.store);
  assert.equal(qty(g, 'I0003'), 1.9552); // 2 boxes − 112 pouches (2500 a box)
});

test('coffee: the calculator defaults are saved for every device by whoever prepares bags', () => {
  const { g, tok } = env();
  const d = { count: 120, weight: 200, waste: 6.5, loss: 18, ratio: 25 };
  assert.equal(g.api('coffee.defaults', d, tok.prod).error.code, 'forbidden');
  assert.equal(g.api('coffee.defaults', Object.assign({}, d, { loss: 100 }), tok.store).error.code, 'coffee_default_invalid');
  assert.deepEqual(g.api('coffee.defaults', d, tok.store).data.defaults, d);
  assert.deepEqual(JSON.parse(g.api('data.bootstrap', {}, tok.prod).data.settings.coffee_calc_defaults), d);
});

test('coffee in three steps on their own days: taken for roasting, ground coffee in, bags packed from it', () => {
  const { g, tok } = env();
  // 1. taken for roasting: the green coffee leaves the stock, a roast is open
  const r = g.api('coffee.roastStart', { client_id: 'r1', date: '2026-11-01', green: [{ item_id: 'I0001', qty: 20 }, { item_id: 'I0002', qty: 5 }] }, tok.store).data;
  assert.deepEqual([qty(g, 'I0001'), qty(g, 'I0002')], [10, 5]);
  let list = g.api('coffee.list', {}, tok.store).data;
  assert.deepEqual([list.roasts[0].status, list.roasts[0].green_kg], ['roasting', 25]);
  assert.equal(g.api('coffee.roastStart', { client_id: 'r1', date: '2026-11-01', green: [{ item_id: 'I0001', qty: 20 }] }, tok.store).data.duplicate, true);
  // 2. roasted and ground: 20.5 kg in (18% lost); no more than the green taken, not before it was taken
  assert.equal(g.api('coffee.roastFinish', { roast_id: r.roast_id, date: '2026-11-02', ground_kg: 26 }, tok.store).error.code, 'coffee_roasted_invalid');
  assert.equal(g.api('coffee.roastFinish', { roast_id: r.roast_id, date: '2026-10-30', ground_kg: 20 }, tok.store).error.code, 'date_invalid');
  const f = g.api('coffee.roastFinish', { roast_id: r.roast_id, date: '2026-11-02', ground_kg: 20.5 }, tok.store).data;
  assert.equal(f.loss_pct, 18);
  list = g.api('coffee.list', {}, tok.store).data;
  const ground = list.ground_item;
  assert.equal(qty(g, ground), 20.5);
  assert.equal(list.roasts[0].status, 'done');
  // 3. bags packed on two days from the ground coffee (with the pouches)
  g.api('coffee.packBags', { client_id: 'p1', date: '2026-11-03', bags: 50, bag_g: 200, ground_kg: 10.3, pouch_item: 'I0003' }, tok.store);
  assert.equal(qty(g, ground), 10.2);
  assert.equal(g.api('coffee.packBags', { client_id: 'p2', date: '2026-11-04', bags: 50, bag_g: 200, ground_kg: 9 }, tok.store).error.code, 'coffee_more_than_roasted');
  g.api('coffee.packBags', { client_id: 'p2', date: '2026-11-04', bags: 50, bag_g: 200 }, tok.store);
  assert.equal(qty(g, ground), 0.2);
  const bag = g.rows('Items').find((i) => i.name === 'COFFEE BAG 200G');
  assert.equal(qty(g, bag.item_id), 100);
  assert.equal(qty(g, 'I0003'), 1.98);
  // a packing shows its green coffee and losses worked out from the roasts before it (estimates)
  const p1 = g.api('coffee.list', {}, tok.store).data.batches.find((b) => b.batch_id === 'p1');
  assert.deepEqual([p1.estimated, p1.green_kg, p1.roast_loss_pct, p1.loss_pct], [true, 12.56, 18, 20.4]);
});
