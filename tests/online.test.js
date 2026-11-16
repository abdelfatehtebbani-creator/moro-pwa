'use strict';
// Customers' orders from their phone: the public catalogue, the order (required trays, hours, notice, fees),
// following and cancelling it; the shop that makes them calls, accepts or refuses, sends and delivers them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

const day = (n) => { const d = new Date(Date.now() + n * 864e5); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(d); };

function env() {
  const g = createGas();
  g.seed('Items', [
    { item_id: 'I0001', name: 'KUNAFA TRAY CHEESE', category: 'Food', store: 'FINAL', unit: 'PC', active: true, final_price: 120 },
    { item_id: 'I0002', name: 'KUNAFA TRAY CREAM', category: 'Food', store: 'FINAL', unit: 'PC', active: true, final_price: 110 },
    { item_id: 'I0003', name: 'BAKLAVA BOX', category: 'Food', store: 'FINAL', unit: 'BOX', active: true, final_price: 45 },
    { item_id: 'I0004', name: 'FLOUR', category: 'Food', store: 'DRY', unit: 'BAG', active: true }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Salwa Branch', kind: 'shop', active: true }, { party_id: 'P002', name: 'Lulua Branch', kind: 'shop', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const admin = g.api('auth.login', { username: 'admin', pin: '1234' }).data.token;
  const user = (username, role, shop) => {
    g.api('users.save', { username, display_name: username, role, pin: '5678' }, admin);
    const tok = g.api('auth.login', { username, pin: '5678' }).data.token;
    if (shop) g.api('orders.shift', { shop }, tok);
    return tok;
  };
  const salwa = user('salwa1', 'cashier', 'P001');
  const lulua = user('lulua1', 'cashier', 'P002');
  g.api('online.saveSettings', { cfg: { min_req: 1, lead_min: 60, max_open: 2, reply_min: 15, whatsapp: '+974 5555 1234',
    fees: [{ name_ar: 'تأمين صينية', amount: 30, per: 'tray', refundable: true }, { name_ar: 'توصيل', amount: 15, per: 'order' }] },
    items: [{ item_id: 'I0001', online: true, req: true }, { item_id: 'I0002', online: true, req: true }, { item_id: 'I0003', online: true }] }, admin);
  return { g, admin, salwa, lulua };
}
const base = (over) => Object.assign({ client_id: 'c1', from: 'P002', name: 'Huda', phone: '5551 2345', address: 'Doha, Al Sadd, street 9',
  date: day(2), time: '12:00', note: 'less sugar', lines: [{ id: 'I0001', qty: 2 }, { id: 'I0003', qty: 1 }], terms: true }, over);

test('online: the catalogue, the order with its fees, following and cancelling it', () => {
  const { g } = env();
  const cat = g.api('online.catalog', {}).data;
  assert.deepEqual(cat.items.map((i) => [i.id, i.req]), [['I0001', true], ['I0002', true], ['I0003', false]]);
  assert.equal(g.api('online.catalog', { v: cat.v }).data.same, true, 'unchanged: the page keeps its copy');
  assert.equal(cat.cfg.whatsapp, '55551234');
  // the rules of the order
  assert.equal(g.api('online.order', base({ lines: [{ id: 'I0003', qty: 3 }] })).error.code, 'online_min_req');
  assert.equal(g.api('online.order', base({ terms: false })).error.code, 'online_terms_required');
  assert.equal(g.api('online.order', base({ time: '23:30' })).error.code, 'online_outside_hours');
  assert.equal(g.api('online.order', base({ lines: [{ id: 'I0004', qty: 1 }] })).error.code, 'online_item_gone');
  // 2 trays x 120 + 45, a deposit of 30 a tray (refundable) and 15 for the delivery
  const r = g.api('online.order', base()).data;
  assert.equal(r.total, 240 + 45 + 60 + 15);
  assert.equal(g.api('online.order', base()).data.duplicate, true, 'sent twice: one order');
  const t = g.api('online.track', { token: r.token }).data;
  assert.deepEqual([t.status, t.deposit, t.note, t.lines.length], ['new', 60, 'less sugar', 2]);
  assert.equal(g.api('online.track', { token: 'nope' }).error.code, 'not_found');
  assert.ok(!JSON.stringify(g.rows('OnlineOrders')).includes(r.token), 'only a hash of the link is kept');
  // no more open orders from one number than allowed
  g.api('online.order', base({ client_id: 'c2' }));
  assert.equal(g.api('online.order', base({ client_id: 'c3' })).error.code, 'online_too_many');
  // the customer cancels while it is new
  assert.equal(g.api('online.cancel', { token: r.token }).data.status, 'cancelled');
});

test('online: the shop calls, accepts or refuses, sends and delivers; sold out today; blocked numbers', () => {
  const { g, admin, salwa, lulua } = env();
  const r = g.api('online.order', base()).data;
  assert.equal(g.api('online.list', {}, lulua).error.code, 'forbidden', 'another shop does not see them');
  const list = g.api('online.list', {}, salwa).data;
  assert.equal(list.orders[0].no, r.no);
  assert.ok(!('token_hash' in list.orders[0]));
  const boot = g.api('data.bootstrap', {}, salwa).data;
  assert.deepEqual([boot.online_mine, boot.online_new], [true, 1], 'the shop sees the screen, with the new order on the menu');
  assert.equal(g.api('data.bootstrap', {}, lulua).data.online_mine, false);
  g.api('online.called', { no: r.no }, salwa);
  g.api('online.accept', { no: r.no }, salwa);
  assert.equal(g.api('online.cancel', { token: r.token }).error.code, 'online_cancel_late', 'accepted: the customer can no longer cancel');
  g.api('online.out', { no: r.no }, salwa);
  assert.equal(g.api('online.delivered', { no: r.no }, salwa).data.order.status, 'delivered');
  assert.equal(g.api('online.track', { token: r.token }).data.status, 'delivered');
  // refused with a reason
  const r2 = g.api('online.order', base({ client_id: 'c9' })).data;
  assert.equal(g.api('online.reject', { no: r2.no }, salwa).error.code, 'reason_required');
  g.api('online.reject', { no: r2.no, reason: 'No driver free' }, salwa);
  assert.deepEqual([g.api('online.track', { token: r2.token }).data.status, g.api('online.track', { token: r2.token }).data.reason], ['rejected', 'No driver free']);
  // sold out today: off the page, and an order of it is refused
  g.api('online.soldOut', { item_id: 'I0001', out: true }, salwa);
  assert.equal(g.api('online.catalog', {}).data.items.find((i) => i.id === 'I0001').out, true);
  assert.equal(g.api('online.order', base({ client_id: 'c10' })).error.code, 'online_item_gone');
  // photos: several in one call, only those of the products offered
  const ph = g.api('online.setPhoto', { item_id: 'I0002', photo: 'data:image/jpeg;base64,AAAA' }, admin).data.photo;
  assert.deepEqual(g.api('online.photos', { ids: [ph, 'PH999'] }).data, { [ph]: 'data:image/jpeg;base64,AAAA' });
  // a blocked number
  g.api('online.saveSettings', { cfg: { min_req: 1, lead_min: 60 }, blocked: ['55512345'] }, admin);
  assert.equal(g.api('online.order', base({ client_id: 'c11', lines: [{ id: 'I0002', qty: 1 }] })).error.code, 'online_blocked');
});
