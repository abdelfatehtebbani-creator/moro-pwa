'use strict';
// The employees' requests to HR: a worker asks (leave, document), the head of the department sees it
// (information only), HR answers; the worker is told and may withdraw a request not answered yet.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

function env() {
  const g = createGas();
  g.seed('Parties', [{ party_id: 'P001', name: 'Baklava section', kind: 'section', active: true, producing: true },
    { party_id: 'P009', name: 'Cleaning', kind: 'section', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const admin = g.api('auth.login', { username: 'admin', pin: '1234' }).data.token;
  g.api('workers.import', { rows: [{ name: 'Sami', qid: '28401112222', job: 'Helper' }], apply: true }, admin);
  const worker = g.api('workers.register', { qid: '28401112222', dept: 'P001', username: 'sami', pin: '1111' }).data.token;
  // the head of the baklava section, and the head of cleaning
  g.api('users.save', { username: 'head', display_name: 'Head', role: 'section_head', pin: '2222' }, admin);
  g.api('users.save', { user_id: g.rows('Users').find((u) => u.username === 'head').user_id, depts: ['P001'] }, admin);
  g.api('users.save', { username: 'head2', display_name: 'Head 2', role: 'section_head', pin: '3333' }, admin);
  g.api('users.save', { user_id: g.rows('Users').find((u) => u.username === 'head2').user_id, depts: ['P009'] }, admin);
  const head = g.api('auth.login', { username: 'head', pin: '2222' }).data.token;
  const head2 = g.api('auth.login', { username: 'head2', pin: '3333' }).data.token;
  return { g, admin, worker, head, head2 };
}

test('hr: a leave asked by a worker, seen by the head of their department only, approved by HR', () => {
  const { g, admin, worker, head, head2 } = env();
  assert.equal(g.api('hr.create', { kind: 'leave', type: 'annual', date_from: '2026-12-10', date_to: '2026-12-01' }, worker).error.code, 'hr_dates_order');
  assert.equal(g.api('hr.create', { kind: 'leave', type: 'holiday', date_from: '2026-12-01', date_to: '2026-12-10' }, worker).error.code, 'hr_type');
  const r = g.api('hr.create', { kind: 'leave', type: 'annual', date_from: '2026-12-01', date_to: '2026-12-10', reason: 'family', client_id: 'c1' }, worker);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.request.days, 10);
  assert.equal(r.data.request.emp_qid, undefined, 'the ID card stays on the server');
  assert.equal(g.rows('HrRequests')[0].emp_qid, '28401112222');
  assert.equal(g.api('hr.create', { kind: 'leave', type: 'annual', date_from: '2026-12-01', date_to: '2026-12-10', client_id: 'c1' }, worker).data.duplicate, true);
  const id = r.data.request.request_id;
  const todo = (t) => g.api('data.bootstrap', {}, t).data.hr_todo;
  assert.deepEqual([todo(admin), todo(head), todo(head2), todo(worker)], [1, 1, 0, 0]);
  // the head sees it (information only), the other head does not; neither decides
  assert.equal(g.api('hr.list', {}, head).data.length, 1);
  assert.equal(g.api('hr.list', {}, head2).data.length, 0);
  assert.equal(g.api('hr.decide', { request_id: id, status: 'approved' }, head).error.code, 'forbidden');
  assert.equal(g.api('hr.list', {}, worker).error.code, 'forbidden');
  g.api('hr.seen', { request_id: id }, head);
  assert.equal(todo(head), 0);
  assert.equal(g.api('hr.seen', { request_id: id }, head2).error.code, 'not_found');
  // HR: a refusal needs a reason; a leave is approved (not "ready")
  assert.equal(g.api('hr.decide', { request_id: id, status: 'rejected' }, admin).error.code, 'hr_note_required');
  assert.equal(g.api('hr.decide', { request_id: id, status: 'ready' }, admin).error.code, 'hr_status');
  const d = g.api('hr.decide', { request_id: id, status: 'approved', note: 'ok' }, admin);
  assert.equal(d.data.request.status, 'approved');
  assert.equal(d.data.request.seen_name, 'Head');
  assert.equal(g.api('hr.decide', { request_id: id, status: 'rejected', note: 'x' }, admin).error.code, 'hr_already_decided');
  assert.equal(g.api('hr.cancel', { request_id: id }, worker).error.code, 'hr_already_decided');
  assert.equal(g.api('hr.mine', {}, worker).data[0].status, 'approved');
  assert.equal(todo(admin), 0);
});

test('hr: a document request, prepared by HR; a request withdrawn before the answer', () => {
  const { g, admin, worker } = env();
  assert.equal(g.api('hr.create', { kind: 'doc', type: 'other' }, worker).error.code, 'hr_reason_required');
  const a = g.api('hr.create', { kind: 'doc', type: 'work_cert', addressed_to: 'Embassy' }, worker).data.request;
  assert.equal(g.api('hr.decide', { request_id: a.request_id, status: 'approved' }, admin).error.code, 'hr_status');
  assert.equal(g.api('hr.decide', { request_id: a.request_id, status: 'ready', note: 'At the office' }, admin).data.request.status, 'ready');
  const b = g.api('hr.create', { kind: 'doc', type: 'salary_cert' }, worker).data.request;
  assert.equal(g.api('hr.cancel', { request_id: b.request_id }, admin).error.code, 'not_found', 'only the requester withdraws');
  assert.equal(g.api('hr.cancel', { request_id: b.request_id }, worker).ok, true);
  assert.deepEqual(g.api('hr.mine', {}, worker).data.map((r) => r.status), ['cancelled', 'ready']);
  assert.deepEqual(g.api('hr.list', { status: 'pending' }, admin).data.length, 0);
});
