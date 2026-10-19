'use strict';
// Stock counts: theory on the count date, counted quantities in any unit, adjustments only on approval.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

function env() {
  const g = createGas();
  g.seed('Items', [{ item_id: 'I0001', name: 'CREAM', category: 'Food', unit: 'PC', min_stock: 0, active: true, store: 'CHILLED', pack_units: 'BOX=12' },
                   { item_id: 'I0002', name: 'BUTTER', category: 'Food', unit: 'KG', min_stock: 0, active: true, store: 'CHILLED' },
                   { item_id: 'I0003', name: 'MILK', category: 'Food', unit: 'L', min_stock: 0, active: true, store: 'CHILLED' },
                   { item_id: 'I0004', name: 'SUGAR', category: 'Food', unit: 'KG', min_stock: 0, active: true, store: 'DRY' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Farm', kind: 'supplier', active: true }]);
  g.seed('Movements', [
    { movement_id: 'M000001', date: '2026-09-01', kind: 'OPENING', party_id: 'P001', item_id: 'I0001', qty: 96, unit: 'PC', status: 'active' },
    { movement_id: 'M000002', date: '2026-09-01', kind: 'RECEIPT', party_id: 'P001', item_id: 'I0002', qty: 10, unit: 'KG', price: 5, per: 'KG', amount: 50, final_amount: 50, status: 'active' },
    { movement_id: 'M000003', date: '2026-09-01', kind: 'OPENING', party_id: 'P001', item_id: 'I0003', qty: 20, unit: 'L', status: 'active' },
    // after the count date: not part of the count's theory
    { movement_id: 'M000004', date: '2026-10-05', kind: 'OPENING', party_id: 'P001', item_id: 'I0002', qty: 4, unit: 'KG', status: 'active' }]);
  g.seed('Balances', [{ item_id: 'I0001', qty: 96, unit: 'PC' }, { item_id: 'I0002', qty: 14, unit: 'KG' }, { item_id: 'I0003', qty: 20, unit: 'L' }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  g.api('users.save', { username: 'store', display_name: 'store', role: 'storekeeper', pin: '5678' }, tok.admin);
  const sk = g.rows('Users').find((u) => u.username === 'store');
  g.api('users.save', { user_id: sk.user_id, stores: ['CHILLED'] }, tok.admin);
  tok.store = g.api('auth.login', { username: 'store', pin: '5678' }).data.token;
  const bal = (id) => Number((g.rows('Balances').find((x) => x.item_id === id) || {}).qty || 0);
  return { g, tok, bal };
}

test('count: opened by the storekeeper of the store, theory on the count date, nothing changes before approval', () => {
  const { g, tok, bal } = env();
  assert.equal(g.api('counts.open', { store: 'DRY', date: '2026-09-30', period: 'monthly' }, tok.store).error.code, 'store_forbidden');
  const r = g.api('counts.open', { store: 'CHILLED', date: '2026-09-30', period: 'monthly' }, tok.store);
  assert.equal(r.ok, true, JSON.stringify(r));
  const id = r.data.count.count_id;
  assert.equal(g.api('counts.open', { store: 'CHILLED', date: '2026-09-30', period: 'monthly' }, tok.store).error.code, 'count_open_exists');
  const lines = g.api('counts.get', { count_id: id }, tok.store).data.lines;
  assert.deepEqual(lines.map((l) => [l.item_id, l.theory_qty]), [['I0001', 96], ['I0002', 10], ['I0003', 20]]);
  // 7 BOX of cream = 84 PC; butter 9 KG; milk not counted
  assert.equal(g.api('counts.save', { count_id: id, lines: [{ item_id: 'I0001', counted_qty: 7, unit: 'BOX' }, { item_id: 'I0002', counted_qty: 9, unit: 'KG' }] }, tok.store).data.saved, 2);
  assert.equal(bal('I0001'), 96);
  assert.equal(g.api('counts.approve', { count_id: id }, tok.store).error.code, 'forbidden');
  // a storekeeper sees only the counts of their own stores; the admin sees all
  const dry = g.api('counts.open', { store: 'DRY', date: '2026-09-30', period: 'monthly' }, tok.admin).data.count.count_id;
  assert.deepEqual(g.api('counts.list', {}, tok.store).data.counts.map((c) => c.count_id), [id]);
  assert.equal(g.api('counts.get', { count_id: dry }, tok.store).error.code, 'store_forbidden');
  assert.equal(g.api('counts.list', {}, tok.admin).data.counts.length, 2);
});

test('count: the expiry found on the shelf replaces the last expiry on approval (with or without a quantity)', () => {
  const { g, tok } = env();
  g.run("Repo.update('Balances', 'item_id', 'I0002', { last_expiry: '2026-12-01' })");
  const id = g.api('counts.open', { store: 'CHILLED', date: '2026-09-30', period: 'monthly' }, tok.store).data.count.count_id;
  assert.equal(g.api('counts.get', { count_id: id }, tok.store).data.lines.find((l) => l.item_id === 'I0002').theory_expiry, '2026-12-01');
  assert.equal(g.api('counts.save', { count_id: id, lines: [{ item_id: 'I0002', counted_expiry: 'bad' }] }, tok.store).error.code, 'expiry_invalid');
  g.api('counts.save', { count_id: id, lines: [{ item_id: 'I0002', counted_expiry: '2026-11-15' }, { item_id: 'I0003', counted_qty: 20, unit: 'L', counted_expiry: '2026-10-20' }] }, tok.store);
  const r = g.api('counts.approve', { count_id: id }, tok.admin).data;
  assert.deepEqual([r.adjustments, r.expiries], [0, 2]);
  const exp = (i) => g.rows('Balances').find((b) => b.item_id === i).last_expiry;
  assert.deepEqual([exp('I0002'), exp('I0003')], ['2026-11-15', '2026-10-20']);
  assert.equal(g.rows('Audit').filter((a) => a.action === 'count_expiry').length, 2);
});

test('count approved: adjustments dated the count date for counted lines only; then closed and protected', () => {
  const { g, tok, bal } = env();
  const id = g.api('counts.open', { store: 'CHILLED', date: '2026-09-30', period: 'quarterly' }, tok.store).data.count.count_id;
  g.api('counts.save', { count_id: id, lines: [{ item_id: 'I0001', counted_qty: 7, unit: 'BOX' }, { item_id: 'I0002', counted_qty: 9, unit: 'KG' }] }, tok.store);
  const r = g.api('counts.approve', { count_id: id }, tok.admin);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.adjustments, 2);
  assert.deepEqual([bal('I0001'), bal('I0002'), bal('I0003')], [84, 13, 20]);   // butter: 9 on the 30th + 4 after
  const adj = g.rows('Movements').filter((m) => m.kind === 'ADJUST');
  assert.deepEqual(adj.map((m) => [m.item_id, m.qty, m.date, m.doc_no]), [['I0001', -12, '2026-09-30', id], ['I0002', -1, '2026-09-30', id]]);
  const c = g.api('counts.get', { count_id: id }, tok.admin).data;
  assert.equal(c.count.status, 'approved');
  assert.equal(c.lines.find((l) => l.item_id === 'I0002').price, 5);
  assert.equal(g.api('counts.save', { count_id: id, lines: [{ item_id: 'I0003', counted_qty: 1 }] }, tok.store).error.code, 'count_closed');
  assert.equal(g.api('movements.delete', { movement_id: adj[0].movement_id }, tok.admin).error.code, 'count_adjustment');
  // a new count of the same store may now be opened
  assert.equal(g.api('counts.open', { store: 'CHILLED', date: '2026-10-31', period: 'monthly' }, tok.store).ok, true);
});
