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

test('direct issue permission: open to all (default), closed to all, or open to chosen departments; requests still issue', () => {
  const { g, tok } = env();
  g.seed('Parties', [{ party_id: 'P003', name: 'Bakery', kind: 'section', active: true }, { party_id: 'P004', name: 'Owner', kind: 'affiliate', active: true }]);
  const to = (cid, party) => ({ movements: [{ client_id: cid, kind: 'ISSUE', date: '2026-10-30', party_id: party, item_id: 'I0001', qty: 1, unit: 'KG' }] });
  assert.equal(g.api('movements.save', to('a1', 'P002'), tok.store).ok, true);
  assert.equal(g.api('settings.issueDirect', { mode: 'none' }, tok.store).error.code, 'forbidden');
  assert.equal(g.api('settings.issueDirect', { mode: 'bogus' }, tok.admin).error.code, 'issue_direct_mode');
  assert.equal(g.api('settings.issueDirect', { mode: 'chosen', parties: [] }, tok.admin).error.code, 'issue_direct_none_chosen');
  assert.equal(g.api('settings.issueDirect', { mode: 'none' }, tok.admin).ok, true);
  assert.equal(g.api('movements.save', to('n1', 'P002'), tok.store).error.code, 'issue_direct_closed');
  assert.equal(g.api('movements.save', to('n2', 'P004'), tok.store).ok, true, 'the owner\'s parties are not concerned');
  // a department's request is still issued
  const r = g.api('requests.create', { date: g.api('data.bootstrap', {}, tok.admin).data.today, party_id: 'P002', lines: [{ item_id: 'I0001', qty: 1 }] }, tok.admin);
  assert.equal(r.ok, true, JSON.stringify(r));
  const f = g.api('requests.fulfil', { request_id: r.data.request_id }, tok.store);
  assert.equal(f.ok, true, JSON.stringify(f));
  // open to the bakery only (the supplier is not taken into the list)
  assert.equal(g.api('settings.issueDirect', { mode: 'chosen', parties: ['P003', 'P001'] }, tok.admin).ok, true);
  assert.equal(g.rows('Settings').find((s) => s.key === 'issue_direct_list').value, 'P003');
  assert.equal(g.api('movements.save', to('c1', 'P003'), tok.store).ok, true);
  assert.equal(g.api('movements.save', to('c2', 'P002'), tok.store).error.code, 'issue_direct_closed');
  // an issue cannot be moved to a department that is closed
  const m = g.api('movements.save', to('c3', 'P003'), tok.admin).data.saved[0].movement_id;
  assert.equal(g.api('movements.update', { movement_id: m, changes: { party_id: 'P002' } }, tok.admin).error.code, 'issue_direct_closed');
  assert.equal(g.api('settings.issueDirect', { mode: 'all' }, tok.admin).ok, true);
  assert.equal(g.api('movements.save', to('c4', 'P002'), tok.store).ok, true);
});

test('raw materials from a sheet: checked, then made with their generic material (made once); names already there kept', () => {
  const { g, tok } = env();
  const rows = [
    { name: 'CHEF DEEMA BIRYANI 90G', unit: 'un', store: 'DRY', family: 'KARMA SPICES', family_ar: 'بهارات الكرمة', family_unit: 'KG', factor: 0.09 },
    { name: 'ASA GARAM MASALA 90G', unit: 'PC', store: 'DRY', family: 'KARMA SPICES', family_ar: 'بهارات الكرمة', family_unit: 'KG', factor: '0.09' },
    { name: 'sugar', unit: 'KG', store: 'DRY', family: 'KARMA SPICES', factor: 1 },
    { name: 'NO FACTOR', unit: 'PC', store: 'DRY', family: 'KARMA SPICES', factor: '' },
  ];
  const pv = g.api('items.importRaw', { rows }, tok.admin).data;
  assert.deepEqual(pv.plan.map((l) => l.action), ['new', 'new', 'exists', 'bad']);
  assert.deepEqual(pv.new_families, ['KARMA SPICES']);
  const r = g.api('items.importRaw', { rows, apply: true }, tok.admin);
  assert.equal(r.data.created, 2, JSON.stringify(r));
  const fams = g.rows('Families');
  assert.equal(fams.length, 1);
  assert.equal(fams[0].name_ar, 'بهارات الكرمة');
  const made = g.rows('Items').filter((i) => /90G/.test(i.name));
  assert.deepEqual(made.map((i) => [i.unit, i.store, i.family_id, Number(i.family_factor)]), [['UN', 'DRY', fams[0].family_id, 0.09], ['PC', 'DRY', fams[0].family_id, 0.09]]);
  // again: nothing new
  assert.deepEqual(g.api('items.importRaw', { rows }, tok.admin).data.plan.map((l) => l.action), ['exists', 'exists', 'exists', 'bad']);
});
