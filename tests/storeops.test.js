'use strict';
// Operations allowed store by store (Users.store_ops): a storekeeper may receive in one store and only issue in another.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

function env() {
  const g = createGas();
  g.seed('Items', [{ item_id: 'I0001', name: 'SUGAR', category: 'Food', unit: 'KG', min_stock: 0, active: true, store: 'DRY' },
                   { item_id: 'I0002', name: 'NAPKIN', category: 'Packaging', unit: 'BOX', min_stock: 0, active: true, store: 'PACK' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Farm', kind: 'supplier', active: true }, { party_id: 'P002', name: 'Kitchen', kind: 'section', active: true }]);
  g.seed('Locations', [{ location_id: 'L001', name: 'Shelf A', category: 'Food', store: 'DRY', active: true },
                       { location_id: 'L002', name: 'Shelf P', category: 'Packaging', store: 'PACK', active: true }]);
  g.seed('Balances', [{ item_id: 'I0001', qty: 50, unit: 'KG' }, { item_id: 'I0002', qty: 50, unit: 'BOX' }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  g.api('users.save', { username: 'store', display_name: 'store', role: 'storekeeper', pin: '5678' }, tok.admin);
  const id = g.rows('Users').find((u) => u.username === 'store').user_id;
  g.api('users.save', { user_id: id, stores: ['DRY', 'PACK'] }, tok.admin);
  tok.store = g.api('auth.login', { username: 'store', pin: '5678' }).data.token;
  return { g, tok, id };
}
const receipt = (cid, item, extra) => ({ movements: [Object.assign({ client_id: cid, kind: 'RECEIPT', date: '2026-10-30', party_id: 'P001', item_id: item,
  qty: 2, unit: item === 'I0001' ? 'KG' : 'BOX', price: 1, per: item === 'I0001' ? 'KG' : 'BOX', doc_no: 'F1' }, extra)] });
const issue = (cid, item) => ({ movements: [{ client_id: cid, kind: 'ISSUE', date: '2026-10-30', party_id: 'P002', item_id: item,
  qty: 1, unit: item === 'I0001' ? 'KG' : 'BOX' }] });

test('store ops: not set = every operation in every store of the user (as before)', () => {
  const { g, tok } = env();
  assert.equal(g.api('auth.me', {}, tok.store).data.store_ops, null);
  assert.equal(g.api('movements.save', receipt('r1', 'I0002', { location: 'Shelf P' }), tok.store).ok, true);
  assert.equal(g.api('movements.save', issue('i1', 'I0002'), tok.store).ok, true);
});

test('store ops: receive and issue in Dry foods, issue only in Packaging; the server refuses the rest', () => {
  const { g, tok, id } = env();
  const r = g.api('users.save', { user_id: id, store_ops: { DRY: ['receive', 'issue', 'counts'], PACK: ['issue', 'bogus'], XX: ['receive'] } }, tok.admin);
  assert.deepEqual(r.data.store_ops, { DRY: ['receive', 'issue', 'counts'], PACK: ['issue'] });
  assert.equal(g.api('movements.save', receipt('r1', 'I0002', { location: 'Shelf P' }), tok.store).error.code, 'store_op_forbidden');
  const ok = g.api('movements.save', receipt('r2', 'I0001', { location: 'Shelf A', expiry: '2027-01-01' }), tok.store);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(g.api('movements.save', issue('i1', 'I0002'), tok.store).ok, true);
  assert.equal(g.api('counts.open', { store: 'PACK', date: '2026-10-30', period: 'monthly' }, tok.store).error.code, 'store_op_forbidden');
  assert.equal(g.api('counts.open', { store: 'DRY', date: '2026-10-30', period: 'monthly' }, tok.store).ok, true);
  // a store the user does not have stays "not yours"
  g.api('users.save', { user_id: id, stores: ['DRY'] }, tok.admin);
  assert.equal(g.api('movements.save', issue('i2', 'I0002'), tok.store).error.code, 'store_forbidden');
  // the admin clears the limits: every operation again
  g.api('users.save', { user_id: id, stores: ['DRY', 'PACK'], store_ops: null }, tok.admin);
  assert.equal(g.rows('Users').find((u) => u.user_id === id).store_ops, '');
  assert.equal(g.api('movements.save', receipt('r3', 'I0002', { location: 'Shelf P' }), tok.store).ok, true);
});

test('store ops: editing or deleting a receipt follows the receiving operation of its store', () => {
  const { g, tok, id } = env();
  const m = g.api('movements.save', receipt('r1', 'I0002', { location: 'Shelf P' }), tok.store).data.saved[0].movement_id;
  g.api('users.save', { user_id: id, store_ops: { DRY: ['receive', 'issue'], PACK: ['issue'] } }, tok.admin);
  assert.equal(g.api('movements.update', { movement_id: m, changes: { qty: 3 } }, tok.store).error.code, 'store_op_forbidden');
  assert.equal(g.api('movements.delete', { movement_id: m }, tok.store).error.code, 'forbidden', 'the storekeeper has no delete permission at all');
});
