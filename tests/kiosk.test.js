'use strict';
// The shared device in the factory: the admin turns a device into one; it lists its people with its key only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

test('shared device: enabled by the admin, lists the people who record production, hand orders or ask the store', () => {
  const g = createGas();
  g.seed('Parties', [{ party_id: 'P001', name: 'Baklava section', kind: 'section', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const admin = g.api('auth.login', { username: 'admin', pin: '1234' }).data.token;
  const add = (username, role, extra) => {
    g.api('users.save', { username, display_name: username.toUpperCase(), role, pin: '5678' }, admin);
    const id = g.rows('Users').find((u) => u.username === username).user_id;
    if (extra) g.api('users.save', Object.assign({ user_id: id }, extra), admin);
    const r = g.api('auth.login', { username, pin: '5678' });
    return r.ok ? r.data.token : '';
  };
  const head = add('baklava', 'section_head', { depts: ['P001'] });
  add('cash1', 'cashier');
  add('prod1', 'production');
  add('gone', 'section_head', { active: false });

  assert.equal(g.api('kiosk.users', { key: 'nope' }).error.code, 'kiosk_unknown');
  assert.equal(g.api('kiosk.enable', { name: 'Factory' }, head).error.code, 'forbidden');
  const dev = g.api('kiosk.enable', { name: 'Factory' }, admin).data;
  assert.ok(dev.key.length > 30);
  assert.ok(!JSON.stringify(g.rows('Settings')).includes(dev.key), 'only the hash is kept');
  const list = g.api('kiosk.users', { key: dev.key }).data;
  assert.equal(list.device, 'Factory');
  assert.deepEqual(list.users.map((u) => [u.username, u.depts.join()]), [['baklava', 'Baklava section'], ['prod1', '']]);
  // the person signs in as themselves with their PIN
  assert.equal(g.api('auth.login', { username: 'baklava', pin: '5678' }).ok, true);
  // switched off: the device must be set up again
  g.api('kiosk.reset', {}, admin);
  assert.equal(g.api('kiosk.users', { key: dev.key }).error.code, 'kiosk_unknown');
});
