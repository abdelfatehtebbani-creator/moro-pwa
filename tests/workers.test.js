'use strict';
// A worker on the list opens their own account with their ID card number; the rights follow the job.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

test('workers: the list kept by a hash of the card; a worker opens one account, with the rights of the job', () => {
  const g = createGas();
  g.seed('Parties', [{ party_id: 'P001', name: 'Baklava section', kind: 'section', active: true, producing: true },
    { party_id: 'P009', name: 'Cleaning', kind: 'section', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const admin = g.api('auth.login', { username: 'admin', pin: '1234' }).data.token;
  const rows = [{ name: 'Ahmed Ali', qid: '284 0123 4567', job: 'Chef' }, { name: 'Sami', qid: '28401112222', job: 'مساعد شيف' },
    { name: 'Omar', qid: '28409998888', job: 'Helper' }, { name: '', qid: '1', job: 'x' }];
  const pv = g.api('workers.import', { rows }, admin).data;
  assert.deepEqual([pv.workers, pv.new_workers, pv.bad, pv.chefs], [3, 3, 1, 1]);
  g.api('workers.import', { rows, apply: true }, admin);
  // the card is kept for the admin's list (asked on 2026-11-17); the sign-in still finds it by its hash
  const list = g.api('workers.summary', {}, admin).data.list;
  assert.equal(list.find((w) => w.name === 'Ahmed Ali').qid, '28401234567');
  // corrected and removed from the list
  const omar = list.find((w) => w.name === 'Omar');
  assert.equal(g.api('workers.save', { id: omar.id, name: 'Omar K', qid: '28401234567', job: 'Helper' }, admin).error.code, 'qid_taken');
  g.api('workers.save', { id: omar.id, name: 'Omar K', qid: '28409998889', job: 'Chef' }, admin);
  assert.equal(g.api('workers.lookup', { qid: '28409998889' }).data.name, 'Omar K');
  const omar2 = g.api('workers.summary', {}, admin).data.list.find((w) => w.name === 'Omar K');
  assert.equal(omar2.kind, 'chef');
  g.api('workers.remove', { id: omar2.id }, admin);
  assert.equal(g.api('workers.summary', {}, admin).data.workers, 2);
  assert.equal(g.api('workers.lookup', { qid: '28409998889' }).error.code, 'worker_unknown', 'removed: no account from the sign-in screen');
  // the sign-in screen: the card shows the name and the departments
  assert.equal(g.api('workers.lookup', { qid: '00000000000' }).error.code, 'worker_unknown');
  const lk = g.api('workers.lookup', { qid: '28401234567' }).data;
  assert.deepEqual([lk.name, lk.job, lk.depts.map((d) => d.party_id)], ['Ahmed Ali', 'chef', ['P001']]);
  // a helper asks the store only: any department, producing or not (cleaning, administration…)
  assert.deepEqual(g.api('workers.lookup', { qid: '28401112222' }).data.depts.map((d) => d.party_id).sort(), ['P001', 'P009']);
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
