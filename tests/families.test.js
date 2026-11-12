'use strict';
// A family (a generic material, e.g. "Vegetable ghee" in KG) stands between a recipe and the brands:
// producing takes the brands in the store, the oldest received first; the cost follows the brands in the store.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(new Date());

function env() {
  const g = createGas();
  g.seed('Items', [
    { item_id: 'I0001', name: 'QBB PURE GHEE 4*4 KG', category: 'Food', store: 'DRY', unit: 'PC', active: true },
    { item_id: 'I0002', name: 'FRESH GHEE 9 KG', category: 'Food', store: 'DRY', unit: 'TIN', active: true },
    { item_id: 'I0003', name: 'SUGAR 50KG', category: 'Food', store: 'DRY', unit: 'BAG', active: true },
    { item_id: 'I0009', name: 'BASBOUSA', category: 'Food', store: 'FINAL', unit: 'KG', active: true },
  ]);
  g.seed('Parties', [{ party_id: 'P002', name: 'Al Bayader', kind: 'supplier', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const admin = g.api('auth.login', { username: 'admin', pin: '1234' }).data.token;
  const rec = (item_id, qty, unit, amount, date) => ({ kind: 'RECEIPT', date, party_id: 'P002', item_id, qty, unit, price: amount / qty, per: unit,
    amount, discount: 0, doc_no: 'INV-' + item_id, location: 'Shelves F 01', expiry: '2027-06-30' });
  // the Fresh tin came first, the QBB cartons after it
  const r = g.api('movements.save', { movements: [rec('I0002', 1, 'TIN', 90, '2026-01-02'), rec('I0001', 2, 'PC', 640, '2026-01-05')] }, admin);
  assert.equal(r.ok, true, JSON.stringify(r));
  const bal = (id) => { const b = g.rows('Balances').find((x) => x.item_id === id); return b ? Number(b.qty) : 0; };
  return { g, admin, bal };
}

test('a family: brands linked with their factor, a recipe written with it, production takes the oldest brand first', () => {
  const { g, admin, bal } = env();
  // only one who edits recipes; no final products in a family; a factor is needed
  assert.equal(g.api('families.save', { name: 'Ghee', members: [{ item_id: 'I0009', factor: 1 }] }, admin).error.code, 'family_final');
  assert.equal(g.api('families.save', { name: 'Ghee', members: [{ item_id: 'I0001', factor: 0 }] }, admin).error.code, 'family_factor');
  const f = g.api('families.save', { name: 'Vegetable ghee', name_ar: 'سمنة نباتية', unit: 'kg',
    members: [{ item_id: 'I0001', factor: 16 }, { item_id: 'I0002', factor: 9 }] }, admin);
  assert.equal(f.ok, true, JSON.stringify(f));
  const fid = f.data.family_id;
  assert.equal(fid, 'F001');
  assert.equal(g.rows('Items').find((i) => i.item_id === 'I0001').family_factor, 16);
  assert.equal(g.api('families.save', { name: 'vegetable GHEE' }, admin).error.code, 'family_exists');
  assert.ok(g.api('data.bootstrap', {}, admin).data.families.rows.length === 1);

  assert.equal(g.api('recipes.save', { product: 'BASBOUSA', lines: [{ item_id: fid, qty_per_unit: 0.5 }, { item_id: 'I0003', qty_per_unit: 0.02 }] }, admin).ok, true);
  // switched off (the default): nothing is taken; the batch record still names the brand that was in the store first
  const p0 = g.api('production.post', { product: 'BASBOUSA', qty: 2, unit: 'KG', date: TODAY, client_id: 'pp0' }, admin);
  assert.equal(bal('I0002'), 1);
  assert.ok(g.api('batches.get', { batch_no: p0.data.batch_no }, admin).data.raw.some((l) => l.item_id === 'I0002'));
  g.api('settings.recipeStock', { on: true }, admin);
  // cost: the brands in the store by their latest prices (Fresh 10 QR/kg x 9 kg, QBB 20 QR/kg x 32 kg) = 17.80 per kg
  const c = g.api('recipes.cost', { product: 'BASBOUSA' }, admin).data;
  assert.deepEqual(c.missing, ['I0003']);
  assert.equal(Math.round(c.lines[0].unit_cost * 100) / 100, 17.8);

  // 20 KG of basbousa needs 10 kg of ghee: the whole Fresh tin (9 kg, received first), then 1 kg of QBB (1/16 of a carton)
  const pv = g.api('production.preview', { product: 'BASBOUSA', qty: 20 }, admin).data;
  assert.deepEqual(pv.filter((l) => l.family_id).map((l) => [l.item_id, l.need]), [['I0001', 0.0625], ['I0002', 1]]);
  const p = g.api('production.post', { product: 'BASBOUSA', qty: 20, unit: 'KG', date: TODAY, client_id: 'pp1' }, admin);
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(bal('I0002'), 0);
  assert.equal(bal('I0001'), 1.9375);
  // the batch record names the brands really used
  const rec = g.api('batches.get', { batch_no: p.data.batch_no }, admin).data;
  assert.deepEqual(rec.raw.map((l) => l.item_id).sort(), ['I0001', 'I0002', 'I0003']);

  // now only QBB is in the store: 20 QR/kg; with nothing left, the stock goes negative on the brand bought last
  assert.equal(Math.round(g.api('recipes.cost', { product: 'BASBOUSA' }, admin).data.lines[0].unit_cost * 100) / 100, 20);
  g.api('production.post', { product: 'BASBOUSA', qty: 70, unit: 'KG', date: TODAY, client_id: 'pp2' }, admin);
  assert.equal(bal('I0001'), -0.25);   // 31 kg in the store, 35 kg taken: 4 kg short on QBB

  // a brand taken out of the family is unlinked
  g.api('families.save', { family_id: fid, name: 'Vegetable ghee', unit: 'KG', members: [{ item_id: 'I0001', factor: 16 }] }, admin);
  assert.equal(g.rows('Items').find((i) => i.item_id === 'I0002').family_id, '');
});

test('running costs: a period of costs over the material cost of its production gives the rate added to each product', () => {
  const { g, admin } = env();
  g.api('recipes.save', { product: 'BASBOUSA', lines: [{ item_id: 'I0002', qty_per_unit: 0.1 }] }, admin);   // 0.1 tin x 90 = 9 QR per KG
  g.api('production.post', { product: 'BASBOUSA', qty: 100, unit: 'KG', date: TODAY, client_id: 'oh1' }, admin);   // 900 QR of materials
  assert.equal(g.api('overhead.save', { from: '2020-01-01', to: '2020-01-31', lines: [{ label: 'Electricity', amount: 100 }] }, admin).error.code, 'overhead_no_production');
  const r = g.api('overhead.save', { from: TODAY, to: TODAY, lines: [{ label: 'Electricity', amount: 180 }, { label: 'Salaries', amount: 270 }] }, admin).data;
  assert.equal(r.material, 900);
  assert.equal(r.rate, 0.5);   // 450 / 900
  const c = g.api('recipes.cost', { product: 'BASBOUSA' }, admin).data;
  assert.deepEqual([c.cost, c.overhead_rate, c.overhead, c.total], [9, 0.5, 4.5, 13.5]);
  assert.equal(g.api('overhead.list', {}, admin).data.periods.length, 1);
  g.api('overhead.delete', { period_id: r.period_id }, admin);
  assert.equal(g.api('recipes.cost', { product: 'BASBOUSA' }, admin).data.total, 9);
});

test('running costs of one product: its own estimate for a quantity replaces the factory rate for it only', () => {
  const { g, admin } = env();
  g.api('recipes.save', { product: 'BASBOUSA', lines: [{ item_id: 'I0002', qty_per_unit: 0.1 }] }, admin);   // 9 QR of materials per KG
  g.api('production.post', { product: 'BASBOUSA', qty: 100, unit: 'KG', date: TODAY, client_id: 'oh2' }, admin);
  g.api('overhead.save', { from: TODAY, to: TODAY, lines: [{ label: 'Electricity', amount: 450 }] }, admin);   // 50%
  assert.equal(g.api('recipes.cost', { product: 'BASBOUSA' }, admin).data.total, 13.5);
  // 200 QR of electricity and labour for 50 KG: 4 QR per KG in place of the 50%
  assert.equal(g.api('overhead.product', { item_id: 'I0009', lines: [{ label: 'Electricity', amount: 80 }, { label: 'Labour', amount: 120 }] }, admin).error.code, 'qty_invalid');
  assert.equal(g.api('overhead.product', { item_id: 'I0009', lines: [{ label: 'Electricity', amount: 80 }, { label: 'Labour', amount: 120 }], qty: 50 }, admin).data.per_unit, 4);
  const c = g.api('recipes.cost', { product: 'BASBOUSA' }, admin).data;
  assert.deepEqual([c.overhead, c.total, c.overhead_rate], [4, 13, '']);
  // back to the factory's rate
  g.api('overhead.product', { item_id: 'I0009', lines: [] }, admin);
  assert.equal(g.api('recipes.cost', { product: 'BASBOUSA' }, admin).data.total, 13.5);
});

test('changing the base unit of a brand keeps what it holds of its family right; only its own rows are rewritten', () => {
  const { g, admin } = env();
  g.api('families.save', { name: 'Vegetable ghee', unit: 'KG', members: [{ item_id: 'I0001', factor: 16 }] }, admin);
  const before = g.rows('Movements').filter((m) => m.item_id !== 'I0001').map((m) => JSON.stringify(m));
  const r = g.api('items.convertUnit', { item_id: 'I0001', new_unit: 'KG', factor: 16 }, admin);
  assert.equal(r.ok, true, JSON.stringify(r));
  const it = g.rows('Items').find((i) => i.item_id === 'I0001');
  assert.deepEqual([it.unit, it.family_factor], ['KG', 1]);
  assert.deepEqual(g.rows('Movements').filter((m) => m.item_id !== 'I0001').map((m) => JSON.stringify(m)), before);
});
