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
  user('baklava', 'section_head', { depts: ['P001'] });   // every store ticked (the default): still only their department
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
  // a number on "Prepare orders" for those who prepare its lines
  const todo = (who) => g.api('data.bootstrap', {}, tok[who]).data.shop_todo;
  assert.deepEqual([todo('baklava'), todo('store'), todo('dist')], [1, 1, 0]);
  // the department head sees the baklava line, the storekeeper the flour line, the production manager both
  const view = (who) => g.api('shop.list', {}, tok[who]).data.map((l) => [l.item_id, l.can]);
  assert.deepEqual(view('baklava'), [['I0002', true]]);
  assert.deepEqual(view('store'), [['I0001', true]]);
  assert.deepEqual(view('prod'), [['I0001', false], ['I0002', true]]);   // the production manager: departments only
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

test('trips: distribution sends ready orders with a driver; loaded then delivered; the cashier receives, less needs a reason', () => {
  const { g, tok, user } = env();
  user('driver', 'driver');
  const o = g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 4 }], send: true }, tok.cashier).data.order;
  const driverId = g.rows('Users').find((u) => u.username === 'driver').user_id;
  g.api('orders.approve', { order_id: o.order_id }, tok.dist);
  assert.equal(g.api('trips.save', { driver_id: driverId, order_ids: [o.order_id] }, tok.dist).error.code, 'order_not_ready');
  const line = g.api('shop.list', {}, tok.store).data[0];
  g.api('shop.hand', { date: '2026-11-01', client_id: 'h', lines: [{ line_id: line.line_id, qty: 4 }] }, tok.store);
  assert.deepEqual(g.api('orders.list', { status: 'ready' }, tok.dist).data.map((x) => x.order_id), [o.order_id]);
  assert.equal(g.api('trips.save', { driver_id: driverId, order_ids: [o.order_id] }, tok.cashier).error.code, 'forbidden');
  const trip = g.api('trips.save', { driver_id: driverId, order_ids: [o.order_id] }, tok.dist).data.trip;
  assert.equal(trip.stops.length, 1);
  assert.equal(g.api('trips.list', {}, tok.driver).data.length, 1);
  assert.equal(g.api('trips.deliver', { trip_id: trip.trip_id, order_id: o.order_id }, tok.driver).error.code, 'stop_not_loaded');
  assert.equal(g.api('trips.load', { trip_id: trip.trip_id, order_id: o.order_id }, tok.driver).ok, true);
  assert.equal(g.api('trips.cancel', { trip_id: trip.trip_id }, tok.dist).error.code, 'trip_loaded');
  assert.equal(g.api('orders.receive', { order_id: o.order_id }, tok.cashier).error.code, 'not_found', 'not delivered yet');
  assert.equal(g.api('trips.deliver', { trip_id: trip.trip_id, order_id: o.order_id }, tok.driver).data.trip.status, 'completed');
  assert.equal(g.api('orders.receive', { order_id: o.order_id, lines: [{ line_no: 1, qty: 3 }] }, tok.cashier).error.code, 'reason_required');
  assert.equal(g.api('orders.receive', { order_id: o.order_id, lines: [{ line_no: 1, qty: 5, reason: 'other' }] }, tok.cashier).error.code, 'qty_too_much');
  const r = g.api('orders.receive', { order_id: o.order_id, lines: [{ line_no: 1, qty: 3, reason: 'damaged', note: 'one bag torn' }] }, tok.cashier).data.order;
  assert.equal(r.status, 'received');
  assert.deepEqual([r.lines[0].received_qty, r.lines[0].short_reason], [3, 'damaged']);
  // the invoice: from what was received, at the item's price, frozen; an item without a price stops it
  assert.equal(g.api('invoices.create', { order_id: o.order_id }, tok.cashier).error.code, 'forbidden');
  assert.equal(g.api('invoices.create', { order_id: o.order_id }, tok.dist).error.code, 'diff_not_accepted');
  g.api('orders.acceptDiff', { order_id: o.order_id, lines: [{ line_no: 1, decision: 'lost' }] }, tok.dist);
  assert.equal(g.api('invoices.create', { order_id: o.order_id }, tok.dist).error.code, 'price_missing');
  g.seed('Movements', [{ movement_id: 'M900001', date: '2026-10-01', kind: 'RECEIPT', item_id: 'I0001', qty: 10, unit: 'BAG', amount: 130, final_amount: 125, status: 'active' }]);
  const inv = g.api('invoices.create', { order_id: o.order_id }, tok.dist).data.invoice;
  assert.deepEqual([inv.total_store, inv.total_final, inv.total, inv.items[0].qty, inv.items[0].price], [37.5, 0, 37.5, 3, 12.5]);
  assert.equal(g.api('invoices.create', { order_id: o.order_id }, tok.dist).error.code, 'order_not_received');
  g.seed('Movements', [{ movement_id: 'M900002', date: '2026-10-30', kind: 'RECEIPT', item_id: 'I0001', qty: 1, unit: 'BAG', amount: 99, final_amount: 99, status: 'active' }]);
  assert.equal(g.api('invoices.get', { invoice_id: inv.invoice_id }, tok.dist).data.total, 37.5, 'the price stays as it was');
  const rep = g.api('orders.report', {}, tok.dist).data;
  assert.equal(rep.invoices[0].total, 37.5);
  assert.equal(rep.orders.find((x) => x.order_id === o.order_id).lines[0].short_reason, 'damaged');
  assert.equal(g.api('orders.list', {}, tok.cashier).data.find((x) => x.order_id === o.order_id).status, 'invoiced');
});

test('cashier shift: the cashier chooses the shop they work in; another cashier cannot take it until the shift ends', () => {
  const { g, tok, user } = env();
  user('cash2', 'cashier');
  assert.equal(g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 1 }] }, tok.cash2).error.code, 'cashier_no_shop');
  assert.equal(g.api('orders.shift', { shop: 'P002' }, tok.cash2).error.code, 'shop_taken');
  assert.equal(g.api('orders.shiftEnd', { amount: 0 }, tok.cashier).ok, true);
  assert.equal(g.api('orders.shift', { shop: 'P002' }, tok.cash2).ok, true);
  assert.equal(g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 1 }], send: true }, tok.cash2).data.order.shop_party_id, 'P002');
});

test('distribution accepts what was handed and closes the rest: the order goes on to the trips; nothing handed: closed', () => {
  const { g, tok } = env();
  const o = g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 4 }, { item_id: 'I0002', qty: 2 }], send: true }, tok.cashier).data.order;
  g.api('orders.approve', { order_id: o.order_id }, tok.dist);
  const flour = g.api('shop.list', {}, tok.store).data[0];
  g.api('shop.hand', { date: '2026-11-01', client_id: 'h', lines: [{ line_id: flour.line_id, qty: 1 }] }, tok.store);
  assert.equal(g.api('orders.closeShort', { order_id: o.order_id }, tok.cashier).error.code, 'forbidden');
  const r = g.api('orders.closeShort', { order_id: o.order_id, reason: 'No more' }, tok.dist).data.order;
  assert.equal(r.status, 'ready');
  assert.deepEqual(r.lines.map((l) => [l.status, l.handed_qty]), [['handed', 1], ['unavailable', 0]]);
  const o2 = g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 1 }], send: true }, tok.cashier).data.order;
  g.api('orders.approve', { order_id: o2.order_id }, tok.dist);
  assert.equal(g.api('orders.closeShort', { order_id: o2.order_id }, tok.dist).data.order.status, 'cancelled');
});

test('notifications: each step of an order tells whoever acts next, and the menu numbers follow', () => {
  const { g, tok, user } = env();
  const driver = user('drv', 'driver');
  user('acc', 'accountant', { caps: ['invoices.manage'] });
  g.run('__sent = []; Push.toUsers = function (ids, m) { __sent.push({ to: ids.map(function (i) { return Repo.find("Users", "user_id", i).username; }).sort(), title: m.ar.title, page: m.page }); return ids.length; }');
  const sent = () => { const x = JSON.parse(g.run('JSON.stringify(__sent)')); g.run('__sent = []'); return x; };
  const todo = (who) => g.api('data.bootstrap', {}, tok[who]).data;
  const o = g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 4 }, { item_id: 'I0002', qty: 2 }], send: true }, tok.cashier).data.order;
  assert.deepEqual(sent().map((x) => [x.page, x.to.includes('dist')]), [['orderapprove', true]]);
  g.api('orders.approve', { order_id: o.order_id }, tok.dist);
  const s1 = sent();
  assert.ok(s1.some((x) => x.page === 'orders' && x.to.join() === 'cashier'), JSON.stringify(s1));
  assert.ok(s1.some((x) => x.page === 'shoporders'));
  const lines = g.api('shop.list', {}, tok.prod).data;
  const flour = lines.find((l) => l.item_id === 'I0001'), box = lines.find((l) => l.item_id === 'I0002');
  g.api('shop.hand', { date: '2026-11-01', client_id: 'h1', lines: [{ line_id: flour.line_id, qty: 1 }] }, tok.store);
  assert.deepEqual(sent().map((x) => [x.page, x.title]), [['orderapprove', 'نقص في الطلبية ' + o.order_no]]);
  assert.equal(todo('dist').orders_pending, 1, 'an order short: distribution decides');
  g.api('shop.hand', { date: '2026-11-01', client_id: 'h2', lines: [{ line_id: box.line_id, qty: 2 }] }, tok.baklava);
  assert.deepEqual(sent().map((x) => x.page), [], 'still short of flour: told once already');
  g.api('orders.closeShort', { order_id: o.order_id, reason: 'No more' }, tok.dist);
  const s2 = sent();
  assert.deepEqual(s2.map((x) => [x.page, x.to.join()]), [['orders', 'cashier'], ['trips', 'admin']]);
  assert.deepEqual([todo('dist').order_todo.trips, todo('dist').orders_pending], [1, 0]);
  const trip = g.api('trips.save', { driver_id: driver, order_ids: [o.order_id] }, tok.dist).data.trip;
  assert.deepEqual(sent().map((x) => [x.page, x.to.join()]), [['trips', 'drv']]);
  assert.equal(todo('drv').order_todo.trips, 1);
  // the driver sees the load of each stop: what was handed
  const mine = g.api('trips.list', { open: true }, tok.drv).data[0];
  assert.deepEqual(mine.stops[0].load.map((x) => [x.item_id, x.qty]), [['I0001', 1], ['I0002', 2]]);
  g.api('trips.load', { trip_id: trip.trip_id, order_id: o.order_id }, tok.drv);
  assert.deepEqual(sent().map((x) => [x.page, x.to.join()]), [['orders', 'cashier']]);
  g.api('trips.deliver', { trip_id: trip.trip_id, order_id: o.order_id }, tok.drv);
  assert.deepEqual(sent().map((x) => [x.page, x.to.join()]), [['orders', 'cashier']]);
  assert.deepEqual([todo('cashier').order_todo.orders, todo('drv').order_todo.trips], [1, 0]);
  g.api('orders.receive', { order_id: o.order_id, lines: [{ line_no: 1, qty: 0, reason: 'damaged' }] }, tok.cashier);
  // received short: distribution reviews the difference first, then the invoicing is told
  assert.deepEqual(sent().map((x) => [x.page, x.to.includes('dist')]), [['orderapprove', true]]);
  assert.equal(todo('acc').order_todo.invoices, 0);
  g.api('orders.acceptDiff', { order_id: o.order_id, lines: [{ line_no: 1, decision: 'lost' }] }, tok.dist);
  const s3 = sent();
  assert.deepEqual(s3.map((x) => x.page), ['invoices']);
  assert.ok(s3[0].to.includes('acc'));
  assert.deepEqual([todo('acc').order_todo.invoices, todo('cashier').order_todo.orders], [1, 0]);
});

test('an order decided already says so (a second press, or two people at once)', () => {
  const { g, tok } = env();
  const o = g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 1 }], send: true }, tok.cashier).data.order;
  assert.equal(g.api('orders.approve', { order_id: o.order_id }, tok.dist).ok, true);
  const again = g.api('orders.approve', { order_id: o.order_id }, tok.dist).error;
  assert.deepEqual([again.code, again.detail], ['order_decided', 'approved']);
  assert.equal(g.api('orders.reject', { order_id: o.order_id, reason: 'x' }, tok.dist).error.code, 'order_decided');
  assert.equal(g.api('orders.approve', { order_id: 'NOPE' }, tok.dist).error.code, 'not_found');
});

test('trips: no delivery before every order of the trip is loaded', () => {
  const { g, tok, user } = env();
  const driver = user('drv', 'driver');
  const ready = () => {
    const o = g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 1 }], send: true }, tok.cashier).data.order;
    g.api('orders.approve', { order_id: o.order_id }, tok.dist);
    const l = g.api('shop.list', {}, tok.store).data.find((x) => x.order_id === o.order_id);
    g.api('shop.hand', { date: '2026-11-01', client_id: 'h' + o.order_id, lines: [{ line_id: l.line_id, qty: 1 }] }, tok.store);
    return o.order_id;
  };
  const a = ready(), b = ready();
  const trip = g.api('trips.save', { driver_id: driver, order_ids: [a, b] }, tok.dist).data.trip;
  g.api('trips.load', { trip_id: trip.trip_id, order_id: a }, tok.drv);
  assert.equal(g.api('trips.deliver', { trip_id: trip.trip_id, order_id: a }, tok.drv).error.code, 'trip_not_all_loaded');
  g.api('trips.load', { trip_id: trip.trip_id, order_id: b }, tok.drv);
  assert.equal(g.api('trips.deliver', { trip_id: trip.trip_id, order_id: a }, tok.drv).ok, true);
});

test('a receipt short waits for distribution: back to the store or lost, then the invoice', () => {
  const { g, tok, user, bal } = env();
  const driver = user('drv', 'driver');
  const o = g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 5 }, { item_id: 'I0002', qty: 2 }], send: true }, tok.cashier).data.order;
  g.api('orders.approve', { order_id: o.order_id }, tok.dist);
  const ls = g.api('shop.list', {}, tok.prod).data;
  g.api('shop.hand', { date: '2026-11-01', client_id: 'h1', lines: [{ line_id: ls.find((l) => l.item_id === 'I0001').line_id, qty: 5 }] }, tok.store);
  g.api('shop.hand', { date: '2026-11-01', client_id: 'h2', lines: [{ line_id: ls.find((l) => l.item_id === 'I0002').line_id, qty: 2 }] }, tok.baklava);
  const trip = g.api('trips.save', { driver_id: driver, order_ids: [o.order_id] }, tok.dist).data.trip;
  g.api('trips.load', { trip_id: trip.trip_id, order_id: o.order_id }, tok.drv);
  g.api('trips.deliver', { trip_id: trip.trip_id, order_id: o.order_id }, tok.drv);
  g.api('orders.receive', { order_id: o.order_id, lines: [{ line_no: 1, qty: 3, reason: 'loading_error' }, { line_no: 2, qty: 1, reason: 'damaged' }] }, tok.cashier);
  assert.equal(bal('I0001'), 5);
  assert.equal(g.api('data.bootstrap', {}, tok.dist).data.orders_pending, 1, 'a difference to review');
  assert.equal(g.api('invoices.create', { order_id: o.order_id }, tok.dist).error.code, 'diff_not_accepted');
  assert.equal(g.api('orders.acceptDiff', { order_id: o.order_id, lines: [{ line_no: 1, decision: 'returned' }] }, tok.dist).error.code, 'decision_required');
  assert.equal(g.api('orders.acceptDiff', { order_id: o.order_id, lines: [] }, tok.cashier).error.code, 'forbidden');
  const res = g.api('orders.acceptDiff', { order_id: o.order_id, lines: [{ line_no: 1, decision: 'returned' }, { line_no: 2, decision: 'lost' }] }, tok.dist);
  assert.equal(res.ok, true, JSON.stringify(res));
  const r = res.data.order;
  assert.equal(r.diff_status, 'accepted');
  assert.deepEqual(r.lines.map((l) => l.short_decision), ['returned', 'lost']);
  assert.equal(bal('I0001'), 5, 'the 2 bags wait in quarantine, not in the stock');
  const q = g.api('returns.list', { status: 'quarantine' }, tok.prod).data;
  assert.deepEqual(q.map((x) => [x.item_id, x.qty, x.source, x.reason]), [['I0001', 2, 'diff', 'loading_error']]);
  g.api('returns.decide', { lines: [{ return_id: q[0].return_id, decision: 'available' }] }, tok.prod);
  assert.equal(bal('I0001'), 7, 'fit: back in the stock');
  assert.equal(bal('I0002'), 1, 'the damaged box does not');
  assert.equal(g.api('orders.acceptDiff', { order_id: o.order_id, lines: [] }, tok.dist).error.code, 'order_decided');
  assert.equal(g.api('data.bootstrap', {}, tok.dist).data.orders_pending, 0);
});

test('the sheet menu lists numbers used twice and changes nothing', () => {
  const { g, tok } = env();
  assert.deepEqual(JSON.parse(g.run('JSON.stringify(Recovery.duplicates())')), []);
  g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 1 }], send: true }, tok.cashier);
  g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 2 }], send: true }, tok.cashier);
  const o = g.rows('Orders');
  const sh = g.spreadsheet.sheets.Orders.data;                       // two orders, one number (the old bug)
  sh[2][sh[0].indexOf('order_no')] = o[0].order_no;
  g.run('Repo.reset()');
  const before = JSON.stringify(g.rows('Orders'));
  const d = JSON.parse(g.run('JSON.stringify(Recovery.duplicates())'));
  assert.deepEqual(d.map((x) => [x.sheet, x.key, x.value, x.rows]), [['Orders', 'order_no', o[0].order_no, [2, 3]]]);
  assert.equal(JSON.stringify(g.rows('Orders')), before);
});

test('returns: the cashier sends goods back, they wait in quarantine, the production manager decides each item', () => {
  const { g, tok, bal } = env();
  assert.equal(g.api('returns.create', { client_id: 'r1', lines: [{ item_id: 'I0002', qty: 2 }] }, tok.cashier).error.code, 'return_reason_required');
  assert.equal(g.api('returns.create', { client_id: 'r1', lines: [{ item_id: 'I0002', qty: 2, reason: 'other' }] }, tok.cashier).error.code, 'return_note_required');
  assert.equal(g.api('returns.create', { client_id: 'r1', lines: [{ item_id: 'I0002', qty: 1, reason: 'unsold' }] }, tok.dist).error.code, 'forbidden');
  const lines = [{ item_id: 'I0002', qty: 2, reason: 'unsold' }, { item_id: 'I0002', qty: 1, reason: 'expired' }];
  const made = g.api('returns.create', { client_id: 'r1', lines }, tok.cashier).data.returns;
  assert.equal(g.api('returns.create', { client_id: 'r1', lines }, tok.cashier).data.duplicate, true, 'sent twice: kept once');
  assert.equal(bal('I0002'), 3, 'nothing in the stock yet');
  assert.equal(g.api('data.bootstrap', {}, tok.prod).data.order_todo.returns, 2);
  assert.equal(g.api('returns.decide', { lines: [{ return_id: made[0].return_id, decision: 'available' }] }, tok.cashier).error.code, 'forbidden');
  assert.equal(g.api('returns.decide', { lines: [{ return_id: made[0].return_id }] }, tok.prod).error.code, 'decision_required');
  g.api('returns.decide', { lines: [{ return_id: made[0].return_id, decision: 'available' }, { return_id: made[1].return_id, decision: 'expired', note: 'old' }] }, tok.prod);
  assert.equal(bal('I0002'), 5, 'the fit 2 are back, the expired one is not');
  assert.equal(g.api('returns.decide', { lines: [{ return_id: made[0].return_id, decision: 'damaged' }] }, tok.prod).error.code, 'return_decided');
  const mine = g.api('returns.list', {}, tok.cashier).data;
  assert.deepEqual(mine.map((r) => r.decision).sort(), ['available', 'expired']);
  assert.equal(g.api('data.bootstrap', {}, tok.prod).data.order_todo.returns, 0);
});

test('a special order: described by the cashier, routed by the production manager, made by its department, delivered to the customer, invoiced at the agreed price', () => {
  const { g, tok, user, bal } = env();
  const driver = user('drv', 'driver');
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(100000);
  const base = { kind: 'special', customer_name: 'Sara', customer_phone: '5555', delivery_date: '2099-01-02', delivery_time: '16:30', place: 'customer', address: 'Villa 3, map link' };
  const cake = { description: 'Birthday cake, blue, name Sara', qty: 1, unit: 'pc', price: 250, photos: [photo] };
  assert.equal(g.api('orders.save', Object.assign({}, base, { address: '', lines: [cake], send: true }), tok.cashier).error.code, 'address_required');
  assert.equal(g.api('orders.save', Object.assign({}, base, { lines: [Object.assign({}, cake, { price: '' })], send: true }), tok.cashier).error.code, 'price_required');
  assert.equal(g.api('orders.save', { lines: [{ description: 'x', qty: 1, price: 1 }], send: true }, tok.cashier).error.code, 'item_unknown', 'a normal order: catalogue only');
  const o = g.api('orders.save', Object.assign({}, base, { lines: [cake, { item_id: 'I0002', qty: 1 }], send: true }), tok.cashier).data.order;
  assert.deepEqual([o.kind, o.delivery_date, o.lines[0].item_id, o.lines[0].photos.length], ['special', '2099-01-02', '', 1]);
  assert.equal(g.api('photos.get', { photo_id: o.lines[0].photos[0] }, tok.prod).data.data, photo, 'the photo comes back whole');
  // distribution does not approve it; the production manager sees it and routes the cake
  assert.equal(g.api('orders.approve', { order_id: o.order_id }, tok.dist).error.code, 'special_needs_route');
  assert.equal(g.api('data.bootstrap', {}, tok.prod).data.orders_pending, 1);
  assert.deepEqual(g.api('orders.list', {}, tok.prod).data.map((x) => x.order_id), [o.order_id]);
  assert.equal(g.api('orders.route', { order_id: o.order_id, lines: [] }, tok.prod).error.code, 'dept_required');
  assert.equal(g.api('orders.route', { order_id: o.order_id, lines: [{ line_no: 1, dept: 'P001' }] }, tok.prod).ok, true);
  // the baklava department makes it: handed without any stock movement
  const lines = g.api('shop.list', {}, tok.baklava).data;
  const sp = lines.find((l) => l.special);
  assert.deepEqual([sp.description, sp.deadline], ['Birthday cake, blue, name Sara', '2099-01-02 16:30']);
  const moves = g.rows('Movements').length;
  g.api('shop.hand', { date: '2026-11-01', client_id: 'hs', lines: [{ line_id: sp.line_id, qty: 1 }] }, tok.baklava);
  g.api('shop.hand', { date: '2026-11-01', client_id: 'hs', lines: [{ line_id: sp.line_id, qty: 1 }] }, tok.baklava);
  assert.equal(g.rows('Movements').length, moves);
  g.api('shop.hand', { date: '2026-11-01', client_id: 'hb', lines: [{ line_id: lines.find((l) => !l.special).line_id, qty: 1 }] }, tok.baklava);
  assert.equal(bal('I0002'), 2);
  // the driver sees where and when, and delivering to the customer receives it
  const trip = g.api('trips.save', { driver_id: driver, order_ids: [o.order_id] }, tok.dist).data.trip;
  const stop = g.api('trips.list', { open: true }, tok.drv).data[0].stops[0];
  assert.deepEqual([stop.place, stop.address, stop.customer_phone, stop.delivery_time], ['customer', 'Villa 3, map link', '5555', '16:30']);
  g.api('trips.load', { trip_id: trip.trip_id, order_id: o.order_id }, tok.drv);
  g.api('trips.deliver', { trip_id: trip.trip_id, order_id: o.order_id }, tok.drv);
  const got = g.api('orders.list', {}, tok.cashier).data.find((x) => x.order_id === o.order_id);
  assert.equal(got.status, 'received');
  g.run("Repo.update('Items', 'item_id', 'I0002', { final_price: 10 }); Repo.flush()");
  const inv = g.api('invoices.create', { order_id: o.order_id }, tok.dist).data.invoice;
  assert.deepEqual(inv.items.map((x) => [x.description || x.item_id, x.amount]), [['Birthday cake, blue, name Sara', 250], ['I0002', 10]]);
  assert.equal(inv.shop_party_id, 'P002', 'invoiced to the shop that took it');
});

test('shortages: a storekeeper sees their own store only, purchasing sees all', () => {
  const { g, tok, user } = env();
  user('buyer', 'purchasing');
  g.api('users.save', { user_id: g.rows('Users').find((u) => u.username === 'store').user_id, caps: ['shop.view', 'shop.hand', 'shop.shortage'] }, tok.admin);
  tok.store = g.api('auth.login', { username: 'store', pin: '5678' }).data.token;
  const o = g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 50 }, { item_id: 'I0002', qty: 50 }], send: true }, tok.cashier).data.order;
  g.api('orders.approve', { order_id: o.order_id }, tok.dist);
  assert.deepEqual(g.api('shop.list', { status: 'shortage' }, tok.store).data.map((l) => l.item_id), ['I0001']);
  assert.deepEqual(g.api('shop.list', { status: 'shortage' }, tok.buyer).data.map((l) => l.item_id).sort(), ['I0001', 'I0002']);
});

test('a special product sent to purchasing: from the store, bought at a final price, or not available', () => {
  const { g, tok, user, bal } = env();
  user('buyer', 'purchasing');
  const base = { kind: 'special', customer_name: 'Ali', delivery_date: '2099-01-02', delivery_time: '10:00', place: 'shop' };
  const o = g.api('orders.save', Object.assign({}, base, { send: true, lines: [{ description: 'Gold candles', qty: 2, unit: 'pc', price: 5 },
    { description: 'Flour for the cake', qty: 1, unit: 'bag', price: 1 }, { description: 'Rare toy', qty: 1, price: 9 }] }), tok.cashier).data.order;
  g.api('orders.route', { order_id: o.order_id, lines: [1, 2, 3].map((n) => ({ line_no: n, dept: 'PURCHASE' })) }, tok.prod);
  const mine = g.api('shop.list', { status: 'open', native: true }, tok.buyer).data;
  assert.equal(mine.length, 3);
  const [candles, flour, toy] = ['Gold candles', 'Flour for the cake', 'Rare toy'].map((d) => mine.find((l) => l.description === d));
  assert.equal(g.api('shop.hand', { client_id: 'x', lines: [{ line_id: candles.line_id, qty: 2 }] }, tok.buyer).error.code, 'purchase_not_decided');
  assert.equal(g.api('shop.purchase', { line_id: candles.line_id, choice: 'buy', price: 7.5 }, tok.buyer).ok, true);
  assert.equal(g.api('shop.purchase', { line_id: candles.line_id, choice: 'buy', price: 8 }, tok.buyer).error.code, 'purchase_decided');
  g.api('shop.purchase', { line_id: flour.line_id, choice: 'store', item_id: 'I0001', qty: 1 }, tok.buyer);
  g.api('shop.purchase', { line_id: toy.line_id, choice: 'unavailable', reason: 'none in town' }, tok.buyer);
  // bought: purchasing hands it; from the store: the storekeeper hands it from the stock
  g.api('shop.hand', { client_id: 'c', lines: [{ line_id: candles.line_id, qty: 2 }] }, tok.buyer);
  const fl = g.api('shop.list', { status: 'open', native: true }, tok.store).data.find((l) => l.line_id === flour.line_id);
  assert.deepEqual([fl.item_id, fl.reserved_qty], ['I0001', 1]);
  g.api('shop.hand', { client_id: 'f', lines: [{ line_id: flour.line_id, qty: 1 }] }, tok.store);
  assert.equal(bal('I0001'), 9);
  const v = g.api('orders.list', {}, tok.cashier).data.find((x) => x.order_id === o.order_id);
  assert.equal(v.status, 'ready');
  assert.deepEqual(v.lines.map((l) => [l.item_id, l.price, l.purchase]), [['', 7.5, 'buy'], ['I0001', 1, 'store'], ['', 9, 'unavailable']]);
});

test('a bought special product can go straight to the shop: an order of only that skips the trip', () => {
  const { g, tok, user } = env();
  user('buyer', 'purchasing');
  const base = { kind: 'special', customer_name: 'Ali', delivery_date: '2099-01-02', delivery_time: '10:00', place: 'shop', send: true };
  const only = g.api('orders.save', Object.assign({}, base, { lines: [{ description: 'Candles', qty: 2, price: 5 }] }), tok.cashier).data.order;
  const mixed = g.api('orders.save', Object.assign({}, base, { lines: [{ description: 'Balloons', qty: 1, price: 5 }, { item_id: 'I0001', qty: 1 }] }), tok.cashier).data.order;
  g.api('orders.route', { order_id: only.order_id, lines: [{ line_no: 1, dept: 'PURCHASE' }] }, tok.prod);
  g.api('orders.route', { order_id: mixed.order_id, lines: [{ line_no: 1, dept: 'PURCHASE' }] }, tok.prod);
  const mine = g.api('shop.list', { status: 'open', native: true }, tok.buyer).data;
  mine.forEach((l) => g.api('shop.purchase', { line_id: l.line_id, choice: 'buy', price: 6 }, tok.buyer));
  mine.forEach((l) => g.api('shop.hand', { client_id: 'd' + l.line_id, lines: [{ line_id: l.line_id, qty: l.qty, direct: true }] }, tok.buyer));
  const st = (id) => g.api('orders.list', {}, tok.cashier).data.find((x) => x.order_id === id);
  assert.equal(st(only.order_id).status, 'delivered', 'at the shop already: the cashier receives it');
  assert.equal(st(only.order_id).lines[0].direct, true);
  const fl = g.api('shop.list', { status: 'open', native: true }, tok.store).data.find((l) => l.order_id === mixed.order_id);
  g.api('shop.hand', { client_id: 'm', lines: [{ line_id: fl.line_id, qty: 1 }] }, tok.store);
  assert.equal(st(mixed.order_id).status, 'ready', 'the flour still goes by trip');
  const driver = user('drv', 'driver');
  g.api('trips.save', { driver_id: driver, order_ids: [mixed.order_id] }, tok.dist);
  const load = g.api('trips.list', { open: true }, tok.drv).data[0].stops[0].load;
  assert.deepEqual(load.map((x) => x.item_id), ['I0001'], 'the driver does not load the balloons');
  assert.equal(g.api('orders.receive', { order_id: only.order_id, lines: [] }, tok.cashier).ok, true);
});

test('the period closed: no movement saved, changed or deleted on or before it; returns and lost goods in the losses data', () => {
  const { g, tok } = env();
  g.seed('Parties', [{ party_id: 'P009', name: 'Supplier X', kind: 'supplier', active: true }]);
  const mv = (date, cid) => g.api('movements.save', { movements: [{ client_id: cid, kind: 'RECEIPT', date, party_id: 'P009', item_id: 'I0001', qty: 1, unit: 'BAG', doc_no: 'INV-' + cid, price: 10, per: 'BAG', amount: 10, location: 'Shelves F 01', expiry: '2027-01-31' }] }, tok.admin);
  const first = mv('2026-01-10', 'a');
  assert.equal(first.ok, true, JSON.stringify(first));
  const old = first.data.saved[0].movement_id;
  assert.equal(g.api('settings.close', { date: '2026-01-31' }, tok.cashier).error.code, 'forbidden');
  assert.equal(g.api('settings.close', { date: '2999-01-01' }, tok.admin).error.code, 'close_date_invalid');
  assert.equal(g.api('settings.close', { date: '2026-01-31' }, tok.admin).ok, true);
  assert.equal(mv('2026-01-20', 'b').error.code, 'period_closed');
  assert.equal(g.api('movements.update', { movement_id: old, changes: { qty: 2 } }, tok.admin).error.code, 'period_closed');
  assert.equal(g.api('movements.delete', { movement_id: old }, tok.admin).error.code, 'period_closed');
  assert.equal(mv('2026-02-01', 'c').ok, true, 'after it: as usual');
  // losses kept outside the movements
  const r = g.api('returns.create', { client_id: 'r', lines: [{ item_id: 'I0002', qty: 1, reason: 'expired' }] }, tok.cashier).data.returns[0];
  g.api('returns.decide', { lines: [{ return_id: r.return_id, decision: 'expired' }] }, tok.prod);
  const l = g.api('report.losses', {}, tok.admin).data;
  assert.deepEqual(l.returns.map((x) => [x.item_id, x.qty, x.decision]), [['I0002', -1, 'expired']]);
});

test('accounts: a supplier statement from receipts and payments, a shop statement from invoices and payments; a payment is voided, never deleted', () => {
  const { g, tok, user } = env();
  user('acc', 'accountant');
  g.seed('Parties', [{ party_id: 'P009', name: 'Supplier X', kind: 'supplier', active: true }]);
  const rec = (date, cid, amount) => g.api('movements.save', { movements: [{ client_id: cid, kind: 'RECEIPT', date, party_id: 'P009', item_id: 'I0001', qty: 1, unit: 'BAG',
    doc_no: 'INV-' + cid, price: amount, per: 'BAG', amount, location: 'Shelves F 01', expiry: '2027-01-31' }] }, tok.admin);
  rec('2026-01-05', 'a', 100); rec('2026-02-05', 'b', 50);
  assert.equal(g.api('accounts.pay', { client_id: 'p1', party_id: 'P009', date: '2026-02-10', amount: 120, method: 'bank' }, tok.cashier).error.code, 'forbidden');
  const p1 = g.api('accounts.pay', { client_id: 'p1', party_id: 'P009', date: '2026-02-10', amount: 120, method: 'bank', ref: 'TR-1' }, tok.acc).data.payment;
  assert.equal(g.api('accounts.pay', { client_id: 'p1', party_id: 'P009', date: '2026-02-10', amount: 120, method: 'bank' }, tok.acc).data.duplicate, true);
  const s = g.api('accounts.statement', { party_id: 'P009', from: '2026-02-01', to: '2026-02-28' }, tok.acc).data;
  assert.deepEqual([s.opening, s.lines.map((e) => [e.kind, e.debit, e.credit, e.balance]), s.closing],
    [-100, [['receipt', 0, 50, -150], ['payment', 120, 0, -30]], -30], 'we owe the supplier 30');
  g.api('accounts.void', { payment_id: p1.payment_id }, tok.acc);
  assert.equal(g.api('accounts.statement', { party_id: 'P009' }, tok.acc).data.closing, -150);
  assert.equal(g.rows('Payments').length, 1, 'kept, as void');
  assert.deepEqual(g.api('accounts.balances', {}, tok.acc).data.map((x) => [x.party_id, x.balance]), [['P009', -150]]);
});

test('a receipt names its purchase order: an approved LPO of the same supplier only', () => {
  const { g, tok } = env();
  g.seed('Parties', [{ party_id: 'P009', name: 'Supplier X', kind: 'supplier', active: true }, { party_id: 'P010', name: 'Supplier Y', kind: 'supplier', active: true }]);
  g.seed('LPOs', [{ lpo_id: 'L1', lpo_no: 7, date: '2026-10-01', party_id: 'P009', total: 100, status: 'approved' }]);
  g.seed('LPOLines', [{ lpo_id: 'L1', line: 1, item_id: 'I0001', qty: 1, unit: 'BAG', price: 100, total: 100 }]);
  const rec = (party, lpo, cid) => g.api('movements.save', { movements: [{ client_id: cid, kind: 'RECEIPT', date: '2026-10-05', party_id: party, item_id: 'I0001', qty: 1, unit: 'BAG',
    doc_no: 'INV-' + cid, price: 100, per: 'BAG', amount: 100, location: 'Shelves F 01', expiry: '2027-01-31', lpo_no: lpo }] }, tok.admin);
  assert.equal(rec('P010', '7', 'a').error.code, 'lpo_unknown');
  assert.equal(rec('P009', '7', 'b').ok, true);
  const m = g.api('accounts.lpo', {}, tok.admin).data[0];
  assert.deepEqual([m.ordered, m.received, m.exact], [100, 100, true]);
});

test('the admin decisions: by the approval itself; the developer account decides nothing and gets no role messages', () => {
  const { g, tok, user } = env();
  user('boss', 'admin');
  const o = g.api('orders.save', { kind: 'special', customer_name: 'A', delivery_date: '2099-01-02', delivery_time: '10:00', place: 'shop', send: true,
    lines: [{ description: 'Cake', qty: 1, price: 10 }] }, tok.cashier).data.order;
  assert.ok(o);
  // the production manager routes special orders: the team's work, not the admin's decision
  assert.deepEqual(g.api('data.bootstrap', {}, tok.boss).data.decisions, []);
  g.seed('LPOs', [{ lpo_id: 'L1', lpo_no: 1, date: '2026-10-01', party_id: 'P001', total: 1, status: 'submitted' }]);
  g.run('Repo.reset()');
  assert.deepEqual(g.api('data.bootstrap', {}, tok.boss).data.decisions.map((d) => [d.key, d.count]), [['lpo', 1]], 'only an admin approves LPOs');
  // the developer: nothing to decide, no role messages
  const me = g.rows('Users').find((u) => u.username === 'admin').user_id;
  g.api('users.save', { user_id: me, developer: true }, tok.admin);
  assert.deepEqual(g.api('data.bootstrap', {}, tok.admin).data.decisions, []);
  assert.ok(!JSON.parse(g.run("JSON.stringify(Push.usersWith('lpo.decide'))")).includes(me));
});

test('the cashier ends a shift with the amount collected in it', () => {
  const { g, tok } = env();
  g.api('users.save', { user_id: g.rows('Users').find((u) => u.username === 'cashier').user_id, shop: '' }, tok.admin);
  g.api('orders.shift', { shop: 'P003' }, tok.cashier);
  assert.equal(g.api('orders.shiftEnd', {}, tok.cashier).error.code, 'shift_amount_required');
  assert.equal(g.api('orders.shiftEnd', { amount: 1250.5, note: 'card 300' }, tok.cashier).ok, true);
  const s = g.rows('Shifts');
  assert.deepEqual(s.map((x) => [x.shop_party_id, Number(x.amount), x.note, !!x.opened_at, !!x.closed_at]), [['P003', 1250.5, 'card 300', true, true]]);
  assert.equal(g.rows('Users').find((u) => u.username === 'cashier').shop, '', 'the shop is free');
});

test('takings: the accountant receives the cash of a closed shift; the difference stays with it', () => {
  const { g, tok, user } = env();
  user('acc', 'accountant');
  g.api('orders.shiftEnd', { amount: 1000 }, tok.cashier);
  const w = g.api('shifts.list', { waiting: true }, tok.acc).data;
  assert.equal(w.length, 1);
  assert.equal(g.api('shifts.receive', { shift_id: w[0].shift_id, amount: 990 }, tok.cashier).error.code, 'forbidden');
  assert.equal(g.api('shifts.receive', { shift_id: w[0].shift_id, amount: 990 }, tok.acc).error.code, 'action_required');
  const r = g.api('shifts.receive', { shift_id: w[0].shift_id, amount: 990, note: 'short 10', action: 'asked the cashier' }, tok.acc).data.shift;
  assert.equal(r.received_action, 'asked the cashier');
  assert.equal(g.api('data.bootstrap', {}, tok.admin).data.takings_diffs.length, 1, 'the admin is told');
  assert.deepEqual([r.amount, r.received_amount, r.diff], [1000, 990, -10]);
  assert.equal(g.api('shifts.receive', { shift_id: w[0].shift_id, amount: 1000 }, tok.acc).error.code, 'shift_received');
  assert.equal(g.api('shifts.list', { waiting: true }, tok.acc).data.length, 0);
});

test('takings in the margin data and on the dashboard', () => {
  const { g, tok } = env();
  g.api('orders.shiftEnd', { amount: 300 }, tok.cashier);
  assert.equal(g.api('report.margin', {}, tok.admin).data.takings.P002, 300);
  const d = g.api('data.bootstrap', {}, tok.admin).data.takings_today;
  assert.deepEqual(d.map((x) => [x.shop_party_id, x.amount, x.shifts]), [['P002', 300, 1]]);
  assert.deepEqual(g.api('data.bootstrap', {}, tok.cashier).data.takings_today, []);
  assert.deepEqual(g.api('data.bootstrap', {}, tok.store).data.takings_today, [], 'not the storekeeper, who sees prices');
});

test('daily sales: cash from the shifts, other channels by the accountant, sent and approved by the admin', () => {
  const { g, tok, user } = env();
  user('acc', 'accountant');
  g.api('orders.shiftEnd', { amount: 500 }, tok.cashier);
  const today = JSON.parse(g.run('JSON.stringify(Util.today())'));
  const day = g.api('sales.list', { date: today }, tok.acc).data.find((x) => x.shop_party_id === 'P002');
  assert.deepEqual([day.cash, day.not_received], [500, 1]);
  assert.equal(g.api('sales.save', { date: today, shop_party_id: 'P002', channels: { qlub: 10 } }, tok.acc).error.code, 'channel_invalid', 'qlub is not this shop\'s');
  const sent = g.api('sales.save', { date: today, shop_party_id: 'P002', channels: { card: 300, talabat: 120 }, submit: true }, tok.acc).data.day;
  assert.deepEqual([sent.status, sent.total], ['submitted', 920]);
  assert.equal(g.api('sales.save', { date: today, shop_party_id: 'P002', channels: { card: 1 } }, tok.acc).error.code, 'sales_locked');
  assert.deepEqual(g.api('data.bootstrap', {}, tok.admin).data.decisions.map((d) => d.key), ['sales']);
  assert.equal(g.api('sales.decide', { day_id: sent.day_id, ok: true }, tok.acc).error.code, 'forbidden');
  g.api('sales.decide', { day_id: sent.day_id, ok: true }, tok.admin);
  assert.equal(g.api('report.margin', {}, tok.admin).data.takings.P002, 920, 'the margin reads the approved sheet');
});

test('accounts: one permission per tab; a list saved with the old one keeps its tabs', () => {
  const { g, tok, user } = env();
  const id = user('acc2', 'accountant');
  const sh = g.spreadsheet.sheets.Users.data;                     // a list saved before the split
  sh.find((r) => r[sh[0].indexOf('user_id')] === id)[sh[0].indexOf('caps')] = 'accounts.view';
  g.run('Repo.reset()');
  const perms = g.api('data.bootstrap', {}, tok.acc2).data.permissions;
  ['accounts.balances', 'accounts.statement', 'accounts.lpo'].forEach((p) => assert.ok(perms.includes(p), p));
  assert.ok(!perms.includes('accounts.pay'));
  g.api('users.save', { user_id: id, caps: ['accounts.balances'] }, tok.admin);
  const tok2 = g.api('auth.login', { username: 'acc2', pin: '5678' }).data.token;
  assert.equal(g.api('accounts.statement', { party_id: 'P002' }, tok2).error.code, 'forbidden');
  assert.equal(g.api('accounts.balances', {}, tok2).ok, true);
});

test('a shop account: invoices against its approved daily sales; payments are the suppliers only', () => {
  const { g, tok, user } = env();
  user('acc', 'accountant');
  assert.equal(g.api('accounts.pay', { client_id: 'x', party_id: 'P002', date: '2026-11-01', amount: 10, method: 'cash' }, tok.acc).error.code, 'party_invalid');
  g.api('orders.shiftEnd', { amount: 400 }, tok.cashier);
  const today = JSON.parse(g.run('JSON.stringify(Util.today())'));
  const d = g.api('sales.save', { date: today, shop_party_id: 'P002', channels: { card: 100 }, submit: true }, tok.acc).data.day;
  g.api('sales.decide', { day_id: d.day_id, ok: true }, tok.admin);
  const s = g.api('accounts.statement', { party_id: 'P002' }, tok.acc).data;
  assert.deepEqual(s.lines.map((e) => [e.kind, e.credit]), [['daily_sales', 500]]);
});

test('a trip sent twice (a resend after a lost reply) is made once', () => {
  const { g, tok, user } = env();
  const driver = user('drv', 'driver');
  const o = g.api('orders.save', { lines: [{ item_id: 'I0001', qty: 1 }], send: true }, tok.cashier).data.order;
  g.api('orders.approve', { order_id: o.order_id }, tok.dist);
  const l = g.api('shop.list', {}, tok.store).data.find((x) => x.order_id === o.order_id);
  g.api('shop.hand', { date: '2026-11-01', client_id: 'h', lines: [{ line_id: l.line_id, qty: 1 }] }, tok.store);
  const a = g.api('trips.save', { driver_id: driver, order_ids: [o.order_id], client_id: 'trip-1' }, tok.dist).data;
  const b = g.api('trips.save', { driver_id: driver, order_ids: [o.order_id], client_id: 'trip-1' }, tok.dist).data;
  assert.equal(b.duplicate, true);
  assert.equal(a.trip.trip_id, b.trip.trip_id);
  assert.equal(g.rows('Trips').length, 1);
});

test('a department product not in stock counts on Production first, then on Prepare orders once made', () => {
  const { g, tok } = env();
  const o = g.api('orders.save', { lines: [{ item_id: 'I0002', qty: 5 }], send: true }, tok.cashier).data.order;
  g.api('orders.approve', { order_id: o.order_id }, tok.dist);
  const b = () => g.api('data.bootstrap', {}, tok.baklava).data;
  assert.deepEqual([b().prod_todo, b().shop_todo], [1, 1], 'stock 3 of 5: some can be handed, the rest made');
  const l = g.api('shop.list', {}, tok.baklava).data.find((x) => x.order_id === o.order_id);
  g.api('shop.hand', { date: '2026-11-01', client_id: 'h', lines: [{ line_id: l.line_id, qty: 3 }] }, tok.baklava);
  assert.deepEqual([b().prod_todo, b().shop_todo], [1, 0], 'no stock left: only Production counts it');
  g.api('production.post', { product: 'BAKLAVA BOX', qty: 2, date: '2026-11-01', client_id: 'p1' }, tok.baklava);
  assert.deepEqual([b().prod_todo, b().shop_todo], [0, 1], 'made: back on Prepare orders');
});
