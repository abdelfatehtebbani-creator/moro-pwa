'use strict';
// A worker on the list opens their own account with their ID card number; the rights follow the job.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

test('workers: the list kept by a hash of the card; a worker opens one account, with the rights of the job', () => {
  const g = createGas();
  g.seed('Parties', [{ party_id: 'P001', name: 'Baklava section', kind: 'section', active: true, producing: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const admin = g.api('auth.login', { username: 'admin', pin: '1234' }).data.token;
  const rows = [{ name: 'Ahmed Ali', qid: '284 0123 4567', job: 'Chef' }, { name: 'Sami', qid: '28401112222', job: 'مساعد شيف' },
    { name: 'Omar', qid: '28409998888', job: 'Helper' }, { name: '', qid: '1', job: 'x' }];
  const pv = g.api('workers.import', { rows }, admin).data;
  assert.deepEqual([pv.workers, pv.new_workers, pv.bad, pv.chefs], [3, 3, 1, 1]);
  g.api('workers.import', { rows, apply: true }, admin);
  assert.ok(!JSON.stringify(g.rows('Workers')).includes('28401234567'), 'only a hash of the card is kept');
  // the sign-in screen: the card shows the name and the departments
  assert.equal(g.api('workers.lookup', { qid: '00000000000' }).error.code, 'worker_unknown');
  const lk = g.api('workers.lookup', { qid: '28401234567' }).data;
  assert.deepEqual([lk.name, lk.job, lk.depts.map((d) => d.party_id)], ['Ahmed Ali', 'chef', ['P001']]);
  const r = g.api('workers.register', { qid: '28401234567', dept: 'P001', username: 'ahmed', pin: '4321' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.user.caps.slice().sort(), ['production.post', 'production.view', 'requests.create', 'requests.view', 'shop.hand', 'shop.unavailable', 'shop.view']);
  assert.deepEqual(r.data.user.depts, ['P001']);
  // once only
  assert.equal(g.api('workers.lookup', { qid: '28401234567' }).error.code, 'worker_registered');
  // "assistant" in the job: the assistant's rights (an assistant chef is an assistant)
  const s = g.api('workers.register', { qid: '28401112222', dept: 'P001', username: 'sami', pin: '1111' }).data;
  assert.deepEqual(s.user.caps.slice().sort(), ['requests.create', 'requests.view']);
  assert.equal(g.api('workers.summary', {}, admin).data.registered, 2);
});
