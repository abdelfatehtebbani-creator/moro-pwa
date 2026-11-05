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
