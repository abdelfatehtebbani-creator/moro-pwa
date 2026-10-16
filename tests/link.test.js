'use strict';
// The Masar link and shop orders: reservation, shortage, handing to distribution, cancel, special requests.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(new Date());

function env() {
  const g = createGas();
  g.seed('Items', [
    { item_id: 'I0001', name: 'FLOUR NO 1', category: 'Food', unit: 'BAG', min_stock: 0, active: true },
    { item_id: 'I0002', name: 'CAKE BOX', category: 'Packaging', unit: 'BOX', min_stock: 0, active: true },
  ]);
  g.seed('Parties', [
    { party_id: 'P001', name: 'Section Kitchen', kind: 'section', active: true },
    { party_id: 'P002', name: 'Al Bayader', kind: 'supplier', active: true },
  ]);
  g.seed('Balances', [{ item_id: 'I0001', qty: 10, unit: 'BAG', last_expiry: '', updated_at: '' },
                      { item_id: 'I0002', qty: 5, unit: 'BOX', last_expiry: '', updated_at: '' }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  for (const [u, role, stores] of [['dry', 'storekeeper', ['DRY']], ['pack', 'storekeeper', ['PACK']], ['buyer', 'purchasing', ['DRY', 'PACK']]]) {
    assert.equal(g.api('users.save', { username: u, display_name: u, role, pin: '5678', stores }, tok.admin).ok, true);
    tok[u] = g.api('auth.login', { username: u, pin: '5678' }).data.token;
  }
  const key = g.run('Link.newSecret()');
  const link = (action, payload) => g.api(action, { key, ...payload });
  const bal = (id) => Number((g.rows('Balances').find((x) => x.item_id === id) || {}).qty || 0);
  return { g, tok, link, bal, key };
}

const line = (oid, item, qty, extra) => ({ order_item_id: oid, order_id: 'O1', order_no: 'ORD-1', shop: { id: 'S1', name: 'Shop Pearl' }, item_id: item, qty, ...extra });

test('link: wrong or missing key is refused; the catalogue shows stores, balances and availability', () => {
  const { g, link } = env();
  assert.equal(g.api('link.catalog', { key: 'nope' }).error.code, 'link_denied');
  assert.equal(g.api('link.catalog', {}).error.code, 'link_denied');
  const cat = link('link.catalog', {}).data.items;
  const flour = cat.find((i) => i.item_id === 'I0001');
  assert.equal(flour.store, 'DRY');
  assert.equal(flour.available, 10);
  assert.equal(cat.find((i) => i.item_id === 'I0002').store, 'PACK');
});

test('shop order: reserved at once, shortage for the rest, each storekeeper sees only their store, hand to distribution', () => {
  const { g, tok, link, bal } = env();
  const r = link('link.orders.push', { lines: [line('OI1', 'I0001', 4), line('OI2', 'I0002', 8)] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const [l1, l2] = r.data.lines;
  assert.equal(l1.reserved_qty, 4);
  assert.equal(l2.reserved_qty, 5);
  assert.equal(l2.shortage, 3);
  // the same line again changes nothing (resend)
  assert.equal(link('link.orders.push', { lines: [line('OI1', 'I0001', 4)] }).data.lines[0].line_id, l1.line_id);
  assert.equal(g.rows('ShopOrderLines').length, 2);
  // a shop party was created
  assert.equal(g.rows('Parties').filter((p) => p.kind === 'shop').length, 1);
  // availability in the catalogue drops by the reservation
  assert.equal(link('link.catalog', {}).data.items.find((i) => i.item_id === 'I0001').available, 6);
  // storekeepers: only their store
  assert.deepEqual(g.api('shop.list', {}, tok.dry).data.map((l) => l.item_id), ['I0001']);
  assert.deepEqual(g.api('shop.list', {}, tok.pack).data.map((l) => l.item_id), ['I0002']);
  // purchasing sees the shortage
  const sh = g.api('shop.list', { status: 'shortage' }, tok.buyer).data;
  assert.deepEqual(sh.map((l) => [l.item_id, l.shortage]), [['I0002', 3]]);
  // the dry storekeeper cannot hand the packaging line
  assert.equal(g.api('shop.hand', { lines: [{ line_id: l2.line_id, qty: 1 }] }, tok.dry).error.code, 'store_forbidden');
  // handing: issue to the shop, line done, Masar sees it
  const h = g.api('shop.hand', { date: TODAY, client_id: 'c1', lines: [{ line_id: l1.line_id, qty: 4 }] }, tok.dry);
  assert.equal(h.ok, true, JSON.stringify(h));
  assert.equal(bal('I0001'), 6);
  const mv = g.rows('Movements').find((m) => m.movement_id === h.data.saved[0].movement_id);
  assert.equal(mv.kind, 'ISSUE');
  assert.equal(g.rows('Parties').find((p) => p.party_id === mv.party_id).kind, 'shop');
  const st = link('link.orders.status', { since: '' }).data.lines.find((l) => l.order_item_id === 'OI1');
  assert.equal(st.status, 'handed');
  assert.equal(st.handed_qty, 4);
  assert.equal(link('link.catalog', {}).data.items.find((i) => i.item_id === 'I0001').available, 6);
  // handing more than left is refused
  assert.equal(g.api('shop.hand', { lines: [{ line_id: l2.line_id, qty: 9 }] }, tok.pack).error.code, 'qty_too_much');
});

test('stock that comes in covers waiting shop orders, oldest first', () => {
  const { g, tok, link } = env();
  link('link.orders.push', { lines: [line('A', 'I0002', 4)] });
  link('link.orders.push', { lines: [line('B', 'I0002', 4, { order_id: 'O2' })] });
  let ls = link('link.orders.status', {}).data.lines;
  assert.deepEqual(ls.map((l) => [l.order_item_id, l.reserved_qty]), [['A', 4], ['B', 1]]);
  const rec = g.api('movements.save', { movements: [{ kind: 'RECEIPT', date: TODAY, party_id: 'P002', item_id: 'I0002', qty: 10, unit: 'BOX',
    price: 1, per: 'BOX', amount: 10, discount: 0, doc_no: 'INV', location: 'Shelves D 01' }] }, tok.pack);
  assert.equal(rec.ok, true, JSON.stringify(rec));
  ls = link('link.orders.status', {}).data.lines;
  assert.deepEqual(ls.map((l) => [l.order_item_id, l.reserved_qty, l.shortage]), [['A', 4, 0], ['B', 4, 0]]);
});

test('order edit and cancel from Masar give the reservation back; cannot supply needs a reason', () => {
  const { g, tok, link } = env();
  link('link.orders.push', { lines: [line('A', 'I0002', 5), line('B', 'I0002', 3, { order_id: 'O2' })] });
  // A smaller: B gets the freed stock
  link('link.orders.push', { lines: [line('A', 'I0002', 2)] });
  let ls = link('link.orders.status', {}).data.lines;
  assert.deepEqual(ls.map((l) => [l.order_item_id, l.qty, l.reserved_qty]), [['A', 2, 2], ['B', 3, 3]]);
  assert.equal(link('link.orders.cancel', { order_item_ids: ['A'] }).data.cancelled, 1);
  const b = g.api('shop.list', {}, tok.pack).data[0];
  assert.equal(g.api('shop.unavailable', { line_id: b.line_id }, tok.pack).error.code, 'reason_required');
  assert.equal(g.api('shop.unavailable', { line_id: b.line_id, reason: 'damaged' }, tok.pack).ok, true);
  ls = link('link.orders.status', {}).data.lines;
  assert.deepEqual(ls.map((l) => [l.order_item_id, l.status, l.reserved_qty]), [['A', 'cancelled', 0], ['B', 'unavailable', 0]]);
});

test('special purchase request: approved by purchasing into a new item in the chosen store, or rejected with a reason', () => {
  const { g, tok, link } = env();
  assert.equal(link('link.special.push', { ext_id: 'X1', order_id: 'O9', shop: { id: 'S1', name: 'Shop Pearl' }, description: 'Gold ribbon', qty: 3, unit: 'roll' }).ok, true);
  link('link.special.push', { ext_id: 'X1', description: 'Gold ribbon' });          // resend: one request only
  link('link.special.push', { ext_id: 'X2', description: 'Blue candles' });
  assert.equal(g.rows('SpecialRequests').length, 2);
  const [r2, r1] = g.api('special.list', {}, tok.buyer).data;
  assert.equal(g.api('special.decide', { request_id: r1.request_id, decision: 'approved', store: 'PACK', unit: 'ROLL' }, tok.dry).error.code, 'forbidden');
  const ok = g.api('special.decide', { request_id: r1.request_id, decision: 'approved', store: 'PACK', unit: 'ROLL' }, tok.buyer);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const it = g.rows('Items').find((i) => i.item_id === ok.data.request.item_id);
  assert.equal(it.name, 'Gold ribbon');
  assert.equal(it.store, 'PACK');
  assert.equal(it.shop_orderable, true);
  assert.equal(g.api('special.decide', { request_id: r2.request_id, decision: 'rejected' }, tok.buyer).error.code, 'reason_required');
  assert.equal(g.api('special.decide', { request_id: r2.request_id, decision: 'rejected', comment: 'not sold here' }, tok.buyer).ok, true);
  const st = link('link.orders.status', {}).data.special;
  assert.deepEqual(st.map((s) => [s.ext_id, s.status]).sort(), [['X1', 'approved'], ['X2', 'rejected']]);
});

test('disposal: needs a reason, no party, lowers the balance, only in own store', () => {
  const { g, tok, bal } = env();
  const d = { kind: 'DISPOSAL', date: TODAY, item_id: 'I0001', qty: 2, unit: 'BAG' };
  assert.equal(g.api('movements.save', { movements: [d] }, tok.dry).error.code, 'reason_required');
  assert.equal(g.api('movements.save', { movements: [{ ...d, purpose: 'expired' }] }, tok.pack).error.code, 'store_forbidden');
  const r = g.api('movements.save', { movements: [{ ...d, purpose: 'expired' }] }, tok.dry);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(bal('I0001'), 8);
});

test('items keep the shop price (with price rights) and "cashier may order"', () => {
  const { g, tok } = env();
  assert.equal(g.api('items.save', { item_id: 'I0002', name: 'CAKE BOX', sale_price: 2.5, shop_orderable: true, image: 'https://x/y.png' }, tok.admin).ok, true);
  const it = g.rows('Items').find((i) => i.item_id === 'I0002');
  assert.equal(Number(it.sale_price), 2.5);
  assert.equal(it.shop_orderable, true);
  assert.equal(it.image, 'https://x/y.png');
  const pr = g.rows('Users').find((u) => u.username === 'pack');
  g.api('users.save', { user_id: pr.user_id, caps: ['receive', 'issue', 'masters'] }, tok.admin);
  assert.equal(g.api('items.save', { item_id: 'I0002', name: 'CAKE BOX', sale_price: 1 }, tok.pack).error.code, 'forbidden');
});
