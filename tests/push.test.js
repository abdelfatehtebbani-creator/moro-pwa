'use strict';
// Push: devices subscribe; a sent LPO notifies whoever approves, the decision notifies its writer.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

function env(opts) {
  const g = createGas(opts);
  g.seed('Items', [{ item_id: 'I0001', name: 'CREAM', category: 'Food', unit: 'PC', min_stock: 0, active: true, store: 'CHILLED' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Farm', kind: 'supplier', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  g.api('users.save', { username: 'buyer', display_name: 'Buyer', role: 'purchasing', pin: '5678' }, tok.admin);
  tok.buyer = g.api('auth.login', { username: 'buyer', pin: '5678' }).data.token;
  g.props.FCM_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'moro-test', client_email: 'x@moro-test.iam.gserviceaccount.com', private_key: 'KEY' });
  return { g, tok };
}
const sends = (g) => g.fetches.filter((f) => f.url.includes('fcm.googleapis.com')).map((f) => JSON.parse(f.o.payload).message);
const lpo = { date: '2026-10-26', party_id: 'P001', lines: [{ item_id: 'I0001', qty: 2, unit: 'PC', price: 5 }], submit: true };

test('push: a sent LPO reaches the admin devices, the decision reaches the writer', () => {
  const { g, tok } = env();
  assert.equal(g.api('push.register', { token: 'tok-admin-phone', device: 'Android' }, tok.admin).data.subscribed, true);
  g.api('push.register', { token: 'tok-admin-pc', device: 'Windows' }, tok.admin);
  g.api('push.register', { token: 'tok-buyer', device: 'iPhone' }, tok.buyer);
  assert.equal(g.api('push.register', { token: 'bad token!' }, tok.buyer).error.code, 'token_invalid');
  const id = g.api('lpo.save', lpo, tok.buyer).data.lpo_id;
  let m = sends(g);
  assert.deepEqual(m.map((x) => x.token).sort(), ['tok-admin-pc', 'tok-admin-phone']);
  assert.match(m[0].data.title, /LPO 320/);
  assert.equal(m[0].data.page, 'lpo');
  assert.equal(m[0].data.badge, '1');
  g.fetches.length = 0;
  g.api('lpo.decide', { lpo_id: id, approve: false, note: 'Too expensive' }, tok.admin);
  m = sends(g);
  assert.deepEqual(m.map((x) => x.token), ['tok-buyer']);
  assert.match(m[0].data.body, /Too expensive/);
});

test('push: off without the Firebase key; an expired device is dropped; sign-out unsubscribes', () => {
  const { g, tok } = env({ fetchReply: (url) => (url.includes('oauth2') ? [200, '{"access_token":"AT"}'] : [404, '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}']) });
  g.api('push.register', { token: 'tok-old', device: 'Android' }, tok.admin);
  g.api('lpo.save', lpo, tok.buyer);
  assert.ok(g.rows('PushDevices')[0].revoked_at, 'expired token revoked');
  delete g.props.FCM_SERVICE_ACCOUNT;
  g.api('push.register', { token: 'tok-new', device: 'Android' }, tok.admin);
  g.fetches.length = 0;
  g.api('lpo.save', Object.assign({}, lpo, { lpo_no: 330 }), tok.buyer);
  assert.equal(g.fetches.length, 0);
  // another user cannot unsubscribe someone else's device; the owner can
  g.api('push.unregister', { token: 'tok-new' }, tok.buyer);
  assert.equal(g.rows('PushDevices').find((d) => d.token === 'tok-new').revoked_at, '');
  g.api('push.unregister', { token: 'tok-new' }, tok.admin);
  assert.ok(g.rows('PushDevices').find((d) => d.token === 'tok-new').revoked_at);
});
