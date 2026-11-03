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
  assert.equal(g.api('orders.shiftEnd', {}, tok.cashier).ok, true);
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
  g.run("Repo.update('Items', 'item_id', 'I0002', { final_price: 10 })");
  const inv = g.api('invoices.create', { order_id: o.order_id }, tok.dist).data.invoice;
  assert.deepEqual(inv.items.map((x) => [x.description || x.item_id, x.amount]), [['Birthday cake, blue, name Sara', 250], ['I0002', 10]]);
  assert.equal(inv.shop_party_id, 'P002', 'invoiced to the shop that took it');
});
