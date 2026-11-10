'use strict';
// Final products: the admin sets a fixed price; every receipt in the FINAL store uses it, whatever is sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(new Date());

function env() {
  const g = createGas();
  g.seed('Items', [{ item_id: 'I0001', name: 'BAKLAVA TRAY', category: 'Food', unit: 'PC', min_stock: 0, active: true, store: 'FINAL' },
                   { item_id: 'I0002', name: 'SUGAR', category: 'Food', unit: 'KG', min_stock: 0, active: true, store: 'DRY' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Production', kind: 'supplier', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  g.api('users.save', { username: 'store', display_name: 'store', role: 'storekeeper', pin: '5678' }, tok.admin);
  const sk = g.rows('Users').find((u) => u.username === 'store');
  g.api('users.save', { user_id: sk.user_id, stores: ['FINAL', 'DRY'] }, tok.admin);
  tok.store = g.api('auth.login', { username: 'store', pin: '5678' }).data.token;
  return { g, tok };
}

const receipt = (extra) => ({ kind: 'RECEIPT', date: TODAY, party_id: 'P001', item_id: 'I0001', qty: 10, unit: 'PC', price: 99, per: 'PC',
  amount: 990, discount: 0, doc_no: 'P-1', location: 'Shelf', expiry: '2027-01-01', ...extra });

test('final product: no price set yet, the receipt is refused; only the admin sets the price', () => {
  const { g, tok } = env();
  assert.equal(g.api('movements.save', { movements: [receipt()] }, tok.store).error.code, 'final_price_missing');
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'BAKLAVA TRAY', final_price: 12.5 }, tok.store).error.code, 'forbidden');
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'BAKLAVA TRAY', final_price: 12.5 }, tok.admin).ok, true);
});

test('final product: the receipt takes the fixed price whatever is sent; an edit keeps the price it was saved with', () => {
  const { g, tok } = env();
  g.api('items.save', { item_id: 'I0001', name: 'BAKLAVA TRAY', final_price: 12.5 }, tok.admin);
  const r = g.api('movements.save', { movements: [receipt()] }, tok.store);
  assert.equal(r.ok, true, JSON.stringify(r));
  const id = r.data.saved[0].movement_id;
  const m = () => g.rows('Movements').find((x) => x.movement_id === id);
  assert.deepEqual([m().price, m().per, m().amount, m().final_amount], [12.5, 'PC', 125, 125]);
  // the admin raises the price later: the old receipt keeps 12.5, a new one takes 14
  g.api('items.save', { item_id: 'I0001', name: 'BAKLAVA TRAY', final_price: 14 }, tok.admin);
  assert.equal(g.api('movements.update', { movement_id: id, changes: { qty: 4, price: 1 } }, tok.store).ok, true);
  assert.deepEqual([m().price, m().amount], [12.5, 50]);
  const r2 = g.api('movements.save', { movements: [receipt({ client_id: 'b', qty: 2 })] }, tok.store);
  assert.equal(g.rows('Movements').find((x) => x.movement_id === r2.data.saved[0].movement_id).amount, 28);
  // other stores are not touched
  const r3 = g.api('movements.save', { movements: [receipt({ client_id: 'c', item_id: 'I0002', unit: 'KG', per: 'KG', price: 3, amount: 30 })] }, tok.store);
  assert.equal(g.rows('Movements').find((x) => x.movement_id === r3.data.saved[0].movement_id).price, 3);
});

test('a price list imported at once: checked first, departments made, products added or updated, raw materials left alone', () => {
  const { g, tok } = env();
  const rows = [{ dept: 'Kunafa', name: 'NAMA', name_ar: 'كنافة ناعمة', unit: 'Pc/Pcs', price: '40' },
                { dept: 'Kunafa', name: 'baklava  tray', price: 12 },
                { dept: 'Kunafa', name: 'SUGAR', price: 5 },
                { dept: 'Kunafa', name: 'NAMA', price: 41 },
                { dept: 'Bakery', name: 'SAMOON', unit: 'BAG', price: '' }];
  assert.equal(g.api('items.import', { rows }, tok.store).error.code, 'forbidden');
  const pv = g.api('items.import', { rows }, tok.admin).data;
  assert.deepEqual(pv.plan.map((l) => l.action), ['new', 'update', 'conflict', 'dup', 'new']);
  assert.deepEqual(pv.new_depts, ['Kunafa', 'Bakery']);
  assert.equal(g.rows('Items').length, 2);                       // nothing saved yet
  const r = g.api('items.import', { rows, apply: true }, tok.admin).data;
  assert.deepEqual([r.created, r.updated, r.departments], [2, 1, 2]);
  const dept = (n) => g.rows('Parties').find((x) => x.name === n);
  assert.deepEqual([dept('Kunafa').kind, dept('Kunafa').producing], ['section', true]);
  const it = (n) => g.rows('Items').find((x) => x.name === n);
  assert.deepEqual([it('NAMA').store, it('NAMA').unit, it('NAMA').final_price, it('NAMA').dept, it('NAMA').name_ar], ['FINAL', 'PC', 40, dept('Kunafa').party_id, 'كنافة ناعمة']);
  assert.deepEqual([it('BAKLAVA TRAY').final_price, it('BAKLAVA TRAY').dept], [12, dept('Kunafa').party_id]);
  assert.deepEqual([it('SUGAR').store, it('SUGAR').dept || ''], ['DRY', '']);
  assert.equal(it('SAMOON').final_price, '');
  // run again: nothing new
  const again = g.api('items.import', { rows }, tok.admin).data;
  assert.deepEqual(again.plan.map((l) => l.action), ['same', 'same', 'conflict', 'dup', 'same']);
});

test('a price list: a department written another way is the existing one', () => {
  const { g, tok } = env();
  g.api('parties.save', { name: 'Section (الكنافة) Kunafa', kind: 'section', producing: true }, tok.admin);
  g.api('parties.save', { name: '(المخبز و المعجنات)Bakery', kind: 'section', producing: true }, tok.admin);
  const rows = [{ dept: 'Kunafa', name: 'NAMA', unit: 'KG' }, { dept: 'Section (المخبز و المعجنات) Bakery', name: 'SAMOON', unit: 'BAG' },
                { dept: 'الكنافة', name: 'KISHNA', unit: 'KG' }, { dept: 'Section (المطبخ) Kitchen', name: 'HUMUS', unit: 'KG' }];
  const pv = g.api('items.import', { rows }, tok.admin).data;
  assert.deepEqual(pv.plan.map((l) => l.dept_name), ['Section (الكنافة) Kunafa', '(المخبز و المعجنات)Bakery', 'Section (الكنافة) Kunafa', 'Section (المطبخ) Kitchen']);
  assert.deepEqual(pv.new_depts, ['Section (المطبخ) Kitchen']);
  g.api('items.import', { rows, apply: true }, tok.admin);
  assert.equal(g.rows('Parties').filter((x) => x.kind === 'section').length, 3);
});

test('a price list: a product renamed in the list keeps its ID; a raw material is never renamed', () => {
  const { g, tok } = env();
  g.api('items.import', { rows: [{ dept: 'Kunafa', name: 'NUTELLA', unit: 'KG', price: 110 }], apply: true }, tok.admin);
  const rows = [{ dept: 'Kunafa', name: 'KUNAFA NUTELLA', old_name: 'NUTELLA', unit: 'KG', price: 115 },
                { dept: 'Kunafa', name: 'SUGAR (PREPARED)', old_name: 'SUGAR', unit: 'KG' }];
  const pv = g.api('items.import', { rows }, tok.admin).data;
  assert.deepEqual(pv.plan.map((l) => [l.action, l.renamed_from || '']), [['update', 'NUTELLA'], ['new', '']]);
  g.api('items.import', { rows, apply: true }, tok.admin);
  const it = (n) => g.rows('Items').find((x) => x.name === n);
  assert.deepEqual([it('KUNAFA NUTELLA').final_price, it('KUNAFA NUTELLA').aliases, it('NUTELLA')], [115, 'NUTELLA', undefined]);
  assert.equal(it('SUGAR').store, 'DRY');
  assert.equal(it('SUGAR (PREPARED)').store, 'FINAL');
});

test('a recipe for the cost only: priced from the latest purchases, nothing taken when produced; the admin is told when the cost passes the price', () => {
  const { g, tok } = env();
  g.seed('Items', g.rows('Items').concat([{ item_id: 'I0003', name: 'GHEE ANIMAL', category: 'Food', unit: 'KG', min_stock: 0, active: true, store: 'DRY' },
    { item_id: 'I0004', name: 'GHEE VEG', category: 'Food', unit: 'KG', min_stock: 0, active: true, store: 'DRY' }]));
  g.seed('Parties', g.rows('Parties').concat([{ party_id: 'P009', name: 'Ghee supplier', kind: 'supplier', active: true }]));
  const rec = (id, price) => g.api('movements.save', { movements: [{ kind: 'RECEIPT', date: TODAY, party_id: 'P009', item_id: id, qty: 10, unit: 'KG',
    price, per: 'KG', amount: price * 10, discount: 0, doc_no: 'G' + id + price, location: 'Shelf', expiry: '2027-01-01' }] }, tok.admin);
  assert.equal(rec('I0003', 40).ok, true);
  rec('I0004', 20);
  assert.equal(g.api('recipes.save', { product: 'BAKLAVA TRAY', lines: [{ item_id: 'I0003', qty_per_unit: 0.6 }, { item_id: 'I0004', qty_per_unit: 0.4 }], cost_only: true }, tok.admin).ok, true);
  const c = g.api('recipes.cost', { product: 'BAKLAVA TRAY' }, tok.admin).data;
  assert.deepEqual([c.cost, c.cost_only], [32, true]);                  // 0.6 x 40 + 0.4 x 20
  assert.equal(g.api('recipes.cost', { product: 'BAKLAVA TRAY' }, tok.store).error.code, 'forbidden');
  g.api('items.save', { item_id: 'I0001', name: 'BAKLAVA TRAY', final_price: 30 }, tok.admin);
  const dec = (g.api('data.bootstrap', {}, tok.admin).data.decisions || []).find((d) => d.key === 'cost');
  assert.equal(dec && dec.count, 1, 'the cost (32) passed the price (30)');
  // produced: the product grows, the ghee stays
  const p = g.api('production.post', { product: 'BAKLAVA TRAY', qty: 5, unit: 'PC', date: TODAY }, tok.admin);
  assert.equal(p.ok, true, JSON.stringify(p));
  const bal = (id) => Number((g.rows('Balances').find((b) => b.item_id === id) || {}).qty || 0);
  assert.deepEqual([bal('I0003'), bal('I0004'), bal('I0001')], [10, 10, 5]);
});

test('a batch record: every production gets a batch number; its materials come from the recipe, with the receipts they came from', () => {
  const { g, tok } = env();
  g.seed('Items', g.rows('Items').concat([{ item_id: 'I0003', name: 'SUGAR B', category: 'Food', unit: 'KG', min_stock: 0, active: true, store: 'DRY' }]));
  g.seed('Parties', g.rows('Parties').concat([{ party_id: 'P009', name: 'Unit Star', kind: 'supplier', active: true }]));
  const rec = (date, q, lot, exp) => g.api('movements.save', { movements: [{ kind: 'RECEIPT', date, party_id: 'P009', item_id: 'I0003', qty: q, unit: 'KG',
    price: 2, per: 'KG', amount: 2 * q, discount: 0, doc_no: 'INV-' + lot, location: 'Shelf', expiry: exp, supplier_lot: lot }] }, tok.admin);
  assert.equal(rec('2026-09-01', 20, 'SUG-1', '2028-09-01').ok, true);
  rec('2026-09-10', 30, 'SUG-2', '2028-10-01');
  g.api('recipes.save', { product: 'BAKLAVA TRAY', lines: [{ item_id: 'I0003', qty_per_unit: 5 }], cost_only: true }, tok.admin);
  g.api('items.save', { item_id: 'I0001', name: 'BAKLAVA TRAY', final_price: 30 }, tok.admin);
  const p = g.api('production.post', { product: 'BAKLAVA TRAY', qty: 6, unit: 'PC', date: TODAY }, tok.admin);
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.match(p.data.batch_no, /^B-\d{4}-\d{4}-01$/);
  const list = g.api('batches.list', { from: TODAY, to: TODAY }, tok.admin).data;
  assert.deepEqual(list.map((x) => x.batch_no), [p.data.batch_no]);
  const r = g.api('batches.get', { batch_no: p.data.batch_no }, tok.admin).data;
  assert.equal(r.source, 'recipe');
  assert.deepEqual(r.raw.map((l) => [l.item_id, l.qty]), [['I0003', 30]]);
  assert.deepEqual(r.raw[0].lots.map((l) => [l.lot, l.qty, l.supplier]), [['SUG-1', 20, 'Unit Star'], ['SUG-2', 10, 'Unit Star']], 'the oldest stock first');
  assert.equal(g.api('batches.save', { batch_no: r.batch_no, shift: 'morning', start_time: '08:00', end_time: '12:30', checks: { fefo: { ok: true } }, notes: 'ok' }, tok.admin).ok, true);
  assert.deepEqual(g.api('batches.get', { batch_no: r.batch_no }, tok.admin).data.checks.fefo, { ok: true, note: '' });
  assert.equal(g.api('batches.list', {}, tok.store).error.code, 'forbidden');
});
