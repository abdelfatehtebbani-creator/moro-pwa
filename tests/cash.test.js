'use strict';
// Cash purchases: daily sheets paid from a running cash balance, sent to the admin like an LPO.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

function env() {
  const g = createGas();
  g.seed('Items', [{ item_id: 'I0001', name: 'NAPKIN', category: 'Packaging', unit: 'BOX', min_stock: 0, active: true, store: 'PACK' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Al Madina', kind: 'supplier', active: true }, { party_id: 'P002', name: 'Kitchen', kind: 'section', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  g.api('users.save', { username: 'buyer', display_name: 'Buyer', role: 'purchasing', pin: '5678' }, tok.admin);
  g.api('users.save', { username: 'store', display_name: 'Store', role: 'storekeeper', pin: '4321' }, tok.admin);
  g.api('users.save', { username: 'acc', display_name: 'Accountant', role: 'accountant', pin: '2468' }, tok.admin);
  tok.acc = g.api('auth.login', { username: 'acc', pin: '2468' }).data.token;
  tok.buyer = g.api('auth.login', { username: 'buyer', pin: '5678' }).data.token;
  tok.store = g.api('auth.login', { username: 'store', pin: '4321' }).data.token;
  return { g, tok };
}
const sheet = (over) => Object.assign({ date: '2026-10-27', lines: [
  { kind: 'material', party_id: 'P001', item_id: 'I0001', description: 'White napkin 1 box', amount: 90, paid_by: 'Nassif', requested_by: 'Chef Sameer' },
  { kind: 'expense', payee: 'Petrol', description: 'Petrol for Nassif', amount: 50, paid_by: 'Nassif' }] }, over);

test('cash: running balance; a sent sheet takes from it; a rejection gives it back; approval keeps it out', () => {
  const { g, tok } = env();
  assert.equal(g.api('cash.list', {}, tok.store).error.code, 'forbidden');
  assert.equal(g.api('cash.float', { date: '2026-10-27', amount: 675 }, tok.buyer).error.code, 'forbidden');
  assert.equal(g.api('cash.float', { date: '2026-10-27', amount: 675 }, tok.admin).error.code, 'forbidden', 'the accountant hands over the cash');
  assert.equal(g.api('cash.float', { date: '2026-10-27', amount: 675, note: 'from the manager' }, tok.acc).data.balance, 675);
  const r = g.api('cash.save', sheet(), tok.buyer).data;
  assert.deepEqual([r.status, r.total], ['draft', 140]);
  assert.equal(g.api('cash.list', {}, tok.buyer).data.balance, 675, 'a draft does not take money yet');
  assert.equal(g.api('cash.save', sheet({ sheet_id: r.sheet_id, submit: true }), tok.buyer).data.status, 'submitted');
  const got = g.api('cash.get', { sheet_id: r.sheet_id }, tok.buyer).data;
  assert.equal(got.sheet.opening, 675);
  assert.equal(got.balance, 675, 'cash on hand before this sheet');
  assert.equal(g.api('cash.list', {}, tok.admin).data.balance, 535);
  assert.equal(g.api('data.bootstrap', {}, tok.admin).data.cash_pending, 1);
  assert.equal(g.api('cash.decide', { sheet_id: r.sheet_id, approve: false }, tok.admin).error.code, 'reason_required');
  g.api('cash.decide', { sheet_id: r.sheet_id, approve: false, note: 'receipt missing' }, tok.admin);
  assert.equal(g.api('cash.list', {}, tok.admin).data.balance, 675);
  g.api('cash.save', sheet({ sheet_id: r.sheet_id, submit: true }), tok.buyer);
  assert.equal(g.api('cash.decide', { sheet_id: r.sheet_id, approve: true }, tok.admin).data.status, 'approved');
  assert.equal(g.api('cash.list', {}, tok.admin).data.balance, 535);
  assert.deepEqual(g.api('data.bootstrap', {}, tok.buyer).data.cash_decided.map((x) => x[1]), ['approved']);
  // stock is not touched by a cash sheet (materials are received in the receive screen)
  assert.equal(g.rows('Movements').length, 0);
});

test('cash: amounts are required and numeric; a supplier payment needs a supplier', () => {
  const { g, tok } = env();
  assert.equal(g.api('cash.save', sheet({ lines: [{ kind: 'expense', description: 'x', amount: '' }] }), tok.buyer).error.code, 'amount_invalid');
  assert.equal(g.api('cash.save', sheet({ lines: [{ kind: 'supplier', description: 'part payment', amount: 6000 }] }), tok.buyer).error.code, 'party_not_supplier');
  assert.equal(g.api('cash.save', sheet({ lines: [{ kind: 'supplier', party_id: 'P002', description: 'x', amount: 5 }] }), tok.buyer).error.code, 'party_not_supplier');
  assert.equal(g.api('cash.save', sheet({ lines: [{ kind: 'supplier', party_id: 'P001', description: 'part payment', amount: 6000 }] }), tok.buyer).ok, true);
});

test('cash: the admin refuses single lines with a reason; only the approved lines leave the cash; the ledger shows each step', () => {
  const { g, tok } = env();
  g.api('cash.float', { date: '2026-10-27', amount: 675 }, tok.acc);
  const id = g.api('cash.save', sheet({ submit: true }), tok.buyer).data.sheet_id;
  assert.equal(g.api('cash.decide', { sheet_id: id, approve: true, rejected_lines: [{ line: 2 }] }, tok.admin).error.code, 'reason_required');
  assert.equal(g.api('cash.decide', { sheet_id: id, approve: true, rejected_lines: [{ line: 1, note: 'a' }, { line: 2, note: 'b' }] }, tok.admin).error.code, 'cash_all_rejected');
  assert.equal(g.api('cash.decide', { sheet_id: id, approve: true, rejected_lines: [{ line: 2, note: 'no petrol receipt' }] }, tok.admin).data.status, 'approved');
  const got = g.api('cash.get', { sheet_id: id }, tok.buyer).data;
  assert.equal(got.sheet.approved_total, 90);
  assert.deepEqual(got.lines.map((l) => [l.status, l.reject_note]), [['', ''], ['rejected', 'no petrol receipt']]);
  const led = g.api('cash.ledger', {}, tok.buyer).data;
  assert.equal(led.balance, 585);
  assert.deepEqual(led.rows.map((r) => [r.kind, r.amount, r.balance]), [['sheet', -90, 585], ['float', 675, 675]]);
});

test('cash: handing over cash is its own permission and tells the purchasing officer, in the language of each device', () => {
  const { g, tok } = env();
  g.props.FCM_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'p', client_email: 'x@p.iam.gserviceaccount.com', private_key: 'K' });
  assert.equal(g.api('cash.float', { date: '2026-10-27', amount: 100 }, tok.buyer).error.code, 'forbidden');
  const admin = g.rows('Users').find((u) => u.username === 'admin');
  g.api('users.save', { username: 'cashier', display_name: 'Cashier', role: 'storekeeper', pin: '1111' }, tok.admin);
  const c = g.rows('Users').find((u) => u.username === 'cashier');
  g.api('users.save', { user_id: c.user_id, caps: ['cash.handover'] }, tok.admin);
  const ct = g.api('auth.login', { username: 'cashier', pin: '1111' }).data.token;
  assert.equal(g.api('cash.decide', { sheet_id: 'PC0001', approve: true }, ct).error.code, 'forbidden');
  g.api('push.register', { token: 'buyer-ar', device: 'Android', lang: 'ar' }, tok.buyer);
  g.api('push.register', { token: 'buyer-en', device: 'Windows', lang: 'en' }, tok.buyer);
  assert.equal(g.api('cash.float', { date: '2026-10-27', amount: 500, note: 'week' }, ct).data.balance, 500);
  const sent = g.fetches.filter((f) => f.url.includes('fcm')).map((f) => JSON.parse(f.o.payload).message);
  const by = Object.fromEntries(sent.map((m) => [m.token, m.data.title]));
  assert.match(by['buyer-ar'], /استلمت نقدًا/);
  assert.match(by['buyer-en'], /Cash handed to you/);
  assert.ok(admin);
});

test('cash: the accountant sees the sheets but cannot write or approve them, and is told when a sheet is approved', () => {
  const { g, tok } = env();
  g.props.FCM_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'p', client_email: 'x@p.iam.gserviceaccount.com', private_key: 'K' });
  g.api('cash.float', { date: '2026-10-27', amount: 675 }, tok.acc);
  const id = g.api('cash.save', sheet({ submit: true }), tok.buyer).data.sheet_id;
  assert.equal(g.api('cash.save', sheet(), tok.acc).error.code, 'forbidden');
  assert.equal(g.api('cash.decide', { sheet_id: id, approve: true }, tok.acc).error.code, 'forbidden');
  assert.equal(g.api('cash.get', { sheet_id: id }, tok.acc).data.sheet.sheet_id, id);
  assert.equal(g.api('lpo.list', {}, tok.acc).ok, true);
  assert.equal(g.api('lpo.save', { party_id: 'P001', lines: [] }, tok.acc).error.code, 'forbidden');
  assert.equal(g.api('movements.query', {}, tok.acc).ok, true);
  g.api('push.register', { token: 'acc-ar', device: 'Android', lang: 'ar' }, tok.acc);
  g.api('cash.decide', { sheet_id: id, approve: true, rejected_lines: [{ line: 2, note: 'no receipt' }] }, tok.admin);
  const sent = g.fetches.filter((f) => f.url.includes('fcm')).map((f) => JSON.parse(f.o.payload).message).filter((m) => m.token === 'acc-ar');
  assert.equal(sent.length, 1);
  assert.match(sent[0].data.title, /90\.00 QR/);
  assert.match(sent[0].data.body, /سلّم النقد/);
});
