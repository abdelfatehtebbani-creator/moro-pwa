'use strict';
// Customers' orders from their phone: the public catalogue, the order (required trays, hours, notice, fees),
// following and cancelling it; the shop that makes them calls, accepts or refuses, sends and delivers them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

// a day n days ahead in Qatar, moved past a Friday (its delivery hours start at 14:00, after the orders' 12:00)
const day = (n) => {
  for (let k = n; ; k++) {
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(new Date(Date.now() + k * 864e5));
    if (new Date(iso + 'T12:00:00Z').getUTCDay() !== 5) return iso;
  }
};

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
    if (role === 'driver') g.api('fleet.add', { client_id: 'shift-' + username, kind: 'start', plate: '931287' }, tok);
    return tok;
  };
  const salwa = user('salwa1', 'cashier', 'P001');
  const lulua = user('lulua1', 'cashier', 'P002');
  const drv = user('drv0', 'driver');
  const drvId = g.rows('Users').find((u) => u.username === 'drv0').user_id;
  g.api('online.saveSettings', { cfg: { min_req: 1, lead_min: 60, max_open: 2, reply_min: 15, whatsapp: '+974 5555 1234',
    fees: [{ name_ar: 'تأمين صينية', amount: 30, per: 'tray', refundable: true }, { name_ar: 'توصيل', amount: 15, per: 'order' }] },
    items: [{ item_id: 'I0001', online: true, req: true }, { item_id: 'I0002', online: true, req: true }, { item_id: 'I0003', online: true }] }, admin);
  // the customer of these tests pays on delivery: a trusted number
  g.api('online.setTrusted', { phone: '5551 2345', on: true }, salwa);
  return { g, admin, salwa, lulua, drv, drvId };
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
  const { g, admin, salwa, lulua, drv, drvId } = env();
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
  // given to the driver at the shop; the customer sees "on its way" only when the driver leaves
  assert.equal(g.api('online.hand', { no: r.no }, salwa).error.code, 'driver_invalid', 'a driver is needed');
  g.api('online.hand', { no: r.no, driver: drvId }, salwa);
  assert.equal(g.api('online.track', { token: r.token }).data.status, 'handed');
  assert.equal(g.api('online.depart', { no: r.no }, salwa).error.code, 'forbidden', 'only the driver leaves with it');
  g.api('online.depart', { no: r.no }, drv);
  assert.equal(g.api('online.track', { token: r.token }).data.status, 'out');
  // the driver's phone sends its position; the customer sees it while the order is on its way
  assert.ok(g.api('online.where', { lat: 25.2854, lng: 51.531 }, drv).data.sharing >= 1, 'the order on its way (and the shift)');
  assert.deepEqual([g.api('online.track', { token: r.token }).data.driver_pos.lat], [25.2854]);
  assert.equal(g.api('online.where', { lat: 25.2854, lng: 51.531 }, salwa).error.code, 'forbidden');
  assert.equal(g.api('online.delivered', { no: r.no }, salwa).error.code, 'forbidden', 'only the driver delivers');
  assert.equal(g.api('online.delivered', { no: r.no }, drv).data.order.status, 'delivered');
  // the money of the delivery: the driver hands it, the cashier confirms
  assert.equal(g.api('online.driverList', {}, drv).data.orders[0].no, r.no, 'until the cashier has the money, the driver still sees it');
  g.api('online.cashGiven', { no: r.no }, drv);
  g.api('online.cashIn', { no: r.no }, salwa);
  assert.ok(g.rows('OnlineOrders').find((o) => o.no === r.no).cash_received_at);
  // the trays: 2 out (60 of deposit); one comes back to another shop, which pays 30 back
  let ts = g.api('online.track', { token: r.token }).data.trays_state;
  assert.deepEqual([ts.out, ts.per], [2, 30]);
  assert.equal(g.api('online.trays', {}, lulua).data.orders.find((o) => o.no === r.no).out, 2);
  assert.equal(g.api('online.trayReturn', { no: r.no, n: 3 }, lulua).error.code, 'online_trays_too_many');
  assert.equal(g.api('online.trayReturn', { no: r.no, n: 1 }, lulua).data.amount, 30);
  ts = g.api('online.track', { token: r.token }).data.trays_state;
  assert.deepEqual([ts.out, ts.back, ts.deposit_back], [1, 1, 30]);
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

test('online: paid at a shop before it leaves, cancelled when not paid in time; the driver sees and delivers it', () => {
  const { g, admin, salwa, lulua, drv, drvId } = env();
  assert.equal(g.api('online.order', base({ pay: 'shop', pay_shop: 'P999' })).error.code, 'online_pay_shop');
  const r = g.api('online.order', base({ pay: 'shop', pay_shop: 'P002' })).data;
  g.api('online.accept', { no: r.no }, salwa);
  let t = g.api('online.track', { token: r.token }).data;
  assert.deepEqual([t.pay, t.pay_shop, t.paid], ['shop', 'Lulua Branch', false]);
  assert.equal(g.api('online.hand', { no: r.no, driver: drvId }, salwa).error.code, 'online_unpaid', 'not paid: it does not leave');
  // any shop's cashier sees it and takes the money
  const pl = g.api('online.payList', {}, lulua).data;
  assert.equal(pl.orders.find((o) => o.no === r.no).total, r.total);
  assert.equal(g.api('data.bootstrap', {}, lulua).data.online_pay, 1);
  g.api('online.pay', { no: r.no }, lulua);
  const row = g.rows('OnlineOrders').find((o) => o.no === r.no);
  assert.equal(row.paid_shop, 'P002');
  assert.equal(g.api('online.track', { token: r.token }).data.paid, true);
  // it leaves with the driver, who sees it and marks it delivered
  g.api('online.hand', { no: r.no, driver: drvId }, salwa);
  g.api('online.depart', { no: r.no }, drv);
  assert.equal(g.api('data.bootstrap', {}, drv).data.online_drive, 1);
  assert.equal(g.api('online.driverList', {}, drv).data.orders[0].no, r.no);
  assert.equal(g.api('online.delivered', { no: r.no }, drv).data.order.status, 'delivered');
  // not paid by its time: cancelled
  const r2 = g.api('online.order', base({ client_id: 'c5', pay: 'shop', pay_shop: 'P001' })).data;
  g.api('online.accept', { no: r2.no }, salwa);
  g.api('online.saveSettings', { cfg: { min_req: 1, lead_min: 60, pay_min: 24 * 60 * 4 } }, admin);
  assert.deepEqual([g.api('online.track', { token: r2.token }).data.status, g.api('online.track', { token: r2.token }).data.reason], ['cancelled', 'unpaid']);
  // the order found again on another phone by its number and mobile
  assert.equal(g.api('online.recover', { no: r.no, phone: '0000' }).error.code, 'not_found');
  const rc = g.api('online.recover', { no: r.no, phone: '974 5551 2345' }).data;
  assert.equal(g.api('online.track', { token: rc.token }).data.no, r.no);
  assert.equal(g.api('online.track', { token: r.token }).data.no, r.no, 'the first link still works');
});

test('online: paying on delivery (cash or card) only for trusted customers; a Fawran transfer after acceptance', () => {
  const { g, admin, salwa, drv, drvId } = env();
  g.api('online.saveSettings', { cfg: { min_req: 1, lead_min: 60, fawran: '5555 0000', pay_shop: true } }, admin);
  g.api('online.setTrusted', { phone: '5551 2345', on: false }, salwa);
  assert.equal(g.api('online.trust', { phone: '5551 2345' }).data.cod, false);
  assert.equal(g.api('online.order', base({ pay: 'card' })).error.code, 'online_pay_method', 'not trusted: no payment on delivery');
  g.api('online.setTrusted', { phone: '5551 2345', on: true }, salwa);
  assert.equal(g.api('online.trust', { phone: '974 5551 2345' }).data.cod, true);
  const c = g.api('online.order', base({ pay: 'card' })).data;
  g.api('online.accept', { no: c.no }, salwa);
  g.api('online.hand', { no: c.no, driver: drvId }, salwa);
  g.api('online.depart', { no: c.no }, drv);
  g.api('online.delivered', { no: c.no }, drv);
  assert.equal(g.api('online.cashGiven', { no: c.no }, drv).error.code, 'online_status', 'by card: no cash to hand');
  // Fawran: the number shows once accepted; the shop confirms the transfer; it leaves only then
  const f = g.api('online.order', base({ client_id: 'f2', pay: 'fawran' })).data;
  g.api('online.accept', { no: f.no }, salwa);
  const t = g.api('online.track', { token: f.token }).data;
  assert.deepEqual([t.pay, t.fawran, t.paid], ['fawran', '5555 0000', false]);
  assert.equal(g.api('online.hand', { no: f.no, driver: drvId }, salwa).error.code, 'online_unpaid');
  g.api('online.fawranOk', { no: f.no }, salwa);
  assert.equal(g.api('online.track', { token: f.token }).data.paid, true);
  assert.equal(g.api('online.hand', { no: f.no, driver: drvId }, salwa).data.order.status, 'handed');
});
