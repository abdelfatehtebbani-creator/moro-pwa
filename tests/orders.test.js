'use strict';
// Shop orders made in MORO: the cashier sends, distribution approves, each line goes to its department or store.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

function env() {
  const g = createGas();
  g.seed('Items', [{ item_id: 'I0001', name: 'FLOUR', category: 'Food', unit: 'BAG', min_stock: 0, active: true, store: 'DRY' },
                   { item_id: 'I0002', name: 'BAKLAVA BOX', category: 'Food', unit: 'BOX', min_stock: 0, active: true, store: 'FINAL', dept: 'P001' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Baklava section', kind: 'section', active: true },
                     { party_id: 'P002', name: 'Shop A', kind: 'shop', active: true },
                     { party_id: 'P003', name: 'Shop B', kind: 'shop', active: true }]);
  g.seed('Balances', [{ item_id: 'I0001', qty: 10, unit: 'BAG' }, { item_id: 'I0002', qty: 3, unit: 'BOX' }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  const user = (username, role, extra) => {
    g.api('users.save', { username, display_name: username, role, pin: '5678' }, tok.admin);
    const id = g.rows('Users').find((u) => u.username === username).user_id;
    if (extra) { const r = g.api('users.save', Object.assign({ user_id: id }, extra), tok.admin); assert.equal(r.ok, true, JSON.stringify(r)); }
    tok[username] = g.api('auth.login', { username, pin: '5678' }).data.token;
    return id;
  };
  user('cashier', 'cashier', { shop: 'P002' });
  user('dist', 'distribution');
  user('baklava', 'section_head', { depts: ['P001'], stores: [] });
  user('store', 'storekeeper', { stores: ['DRY'] });
  user('prod', 'production', { stores: [] });
  const bal = (id) => Number(g.rows('Balances').find((b) => b.item_id === id).qty);
  return { g, tok, user, bal };
}

test('orders: one cashier per shop; a draft is sent for the next day; distribution approves; lines go to their department or store', () => {
  const { g, tok, user, bal } = env();
  g.api('users.save', { username: 'cashier2', display_name: 'c2', role: 'cashier', pin: '5678' }, tok.admin);
  const c2 = g.rows('Users').find((u) => u.username === 'cashier2').user_id;
  assert.equal(g.api('users.save', { user_id: c2, shop: 'P002' }, tok.admin).error.code, 'shop_taken');
  assert.equal(g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 1 }] }, tok.dist).error.code, 'forbidden');

  const d = g.api('orders.save', { client_id: 'c1', lines: [{ item_id: 'I0001', qty: 4 }, { item_id: 'I0002', qty: 5 }] }, tok.cashier).data.order;
  assert.equal(d.status, 'draft');
  assert.equal(g.api('orders.list', {}, tok.dist).data.length, 0, 'a draft is only the cashier’s');
  const s = g.api('orders.save', { order_id: d.order_id, lines: [{ item_id: 'I0001', qty: 4 }, { item_id: 'I0002', qty: 5 }], send: true }, tok.cashier).data.order;
  assert.equal(s.status, 'sent');
  assert.equal(s.delivery_date > s.order_date, true);
  assert.equal(g.api('data.bootstrap', {}, tok.dist).data.orders_pending, 1);
  // nothing to prepare before approval
  assert.equal(g.api('shop.list', {}, tok.baklava).data.length, 0);
  assert.equal(g.api('orders.approve', { order_id: d.order_id }, tok.cashier).error.code, 'forbidden');

  const a = g.api('orders.approve', { order_id: d.order_id, lines: [{ line_no: 2, qty: 2 }] }, tok.dist);
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.deepEqual(a.data.order.lines.map((l) => l.approved_qty), [4, 2]);
  // the department head sees the baklava line, the storekeeper the flour line, the production manager both
  const view = (who) => g.api('shop.list', {}, tok[who]).data.map((l) => [l.item_id, l.can]);
  assert.deepEqual(view('baklava'), [['I0002', true]]);
  assert.deepEqual(view('store'), [['I0001', true]]);
  assert.deepEqual(view('prod'), [['I0001', false], ['I0002', true]]);
  const lines = g.api('shop.list', {}, tok.prod).data;
  const flour = lines.find((l) => l.item_id === 'I0001'), box = lines.find((l) => l.item_id === 'I0002');
  assert.equal(g.api('shop.hand', { date: '2026-11-01', client_id: 'h0', lines: [{ line_id: flour.line_id, qty: 1 }] }, tok.prod).error.code, 'store_forbidden');
  g.api('shop.hand', { date: '2026-11-01', client_id: 'h1', lines: [{ line_id: box.line_id, qty: 2 }] }, tok.baklava);
  assert.equal(bal('I0002'), 1);
  // more than the final products stock: to be made first
  const o2 = g.api('orders.save', { lines: [{ item_id: 'I0002', qty: 5 }], send: true }, tok.cashier).data.order;
  g.api('orders.approve', { order_id: o2.order_id }, tok.dist);
  const big = g.api('shop.list', {}, tok.baklava).data.find((l) => l.order_id === o2.order_id);
  assert.equal(g.api('shop.hand', { date: '2026-11-01', client_id: 'h2', lines: [{ line_id: big.line_id, qty: 5 }] }, tok.baklava).error.code, 'final_needs_production');
  assert.equal(bal('I0002'), 1);
  g.api('shop.unavailable', { line_id: flour.line_id, reason: 'Not today' }, tok.store);
  const o = g.api('orders.list', {}, tok.cashier).data.find((x) => x.order_id === d.order_id);
  assert.equal(o.status, 'ready');
  assert.deepEqual(o.lines.map((l) => [l.status, l.handed_qty]), [['unavailable', 0], ['handed', 2]]);
});

test('orders: distribution rejects with a reason; the cashier cancels only a draft; another shop does not see it', () => {
  const { g, tok, user } = env();
  user('cashierb', 'cashier', { shop: 'P003' });
  const o = g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 1 }], send: true }, tok.cashier).data.order;
  assert.equal(g.api('orders.cancel', { order_id: o.order_id }, tok.cashier).error.code, 'not_found');
  assert.equal(g.api('orders.list', {}, tok.cashierb).data.length, 0);
  assert.equal(g.api('orders.reject', { order_id: o.order_id }, tok.dist).error.code, 'reason_required');
  assert.equal(g.api('orders.reject', { order_id: o.order_id, reason: 'Duplicate' }, tok.dist).ok, true);
  assert.equal(g.api('orders.list', {}, tok.cashier).data[0].reason, 'Duplicate');
  const d = g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 1 }] }, tok.cashier).data.order;
  assert.equal(g.api('orders.cancel', { order_id: d.order_id }, tok.cashier).ok, true);
});

test('production without a recipe: a final product’s stock goes up, nothing is taken', () => {
  const { g, tok, bal } = env();
  const r = g.api('production.post', { product: 'BAKLAVA BOX', qty: 4, date: '2026-11-01', client_id: 'p1' }, tok.baklava);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(bal('I0002'), 7);
  assert.equal(bal('I0001'), 10);
  assert.equal(g.api('production.post', { product: 'NO SUCH THING', qty: 1, date: '2026-11-01' }, tok.baklava).error.code, 'recipe_missing');
});
