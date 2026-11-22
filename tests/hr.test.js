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
  // the HR screen sends nothing until the admin switches it on
  assert.equal(g.api('hr.create', { kind: 'doc', type: 'work_cert' }, admin).error.code, 'hr_preview');
  g.api('settings.hrLive', { on: true }, admin);
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

test('hr: a leave asked by a worker, seen by the head of their department only (information), approved by HR', () => {
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
  // HR: a refusal needs a reason; a leave is approved (not "ready")
  assert.equal(g.api('hr.decide', { request_id: id, status: 'rejected' }, admin).error.code, 'hr_note_required');
  assert.equal(g.api('hr.decide', { request_id: id, status: 'ready' }, admin).error.code, 'hr_status');
  const d = g.api('hr.decide', { request_id: id, status: 'approved', note: 'ok' }, admin);
  assert.equal(d.data.request.status, 'approved');
  assert.equal(g.api('hr.decide', { request_id: id, status: 'rejected', note: 'x' }, admin).error.code, 'hr_already_decided');
  assert.equal(g.api('hr.cancel', { request_id: id }, worker).error.code, 'hr_already_decided');
  assert.equal(g.api('hr.mine', {}, worker).data[0].status, 'approved');
  assert.deepEqual([todo(admin), todo(head)], [0, 0]);
});

test('hr: a document request, prepared by HR; a request withdrawn before the answer', () => {
  const { g, admin, worker } = env();
  assert.equal(g.api('hr.create', { kind: 'doc', type: 'other' }, worker).error.code, 'hr_reason_required');
  assert.equal(g.api('hr.create', { kind: 'doc', type: 'resignation' }, worker).ok, true);
  g.api('hr.cancel', { request_id: g.api('hr.mine', {}, worker).data[0].request_id }, worker);
  const a = g.api('hr.create', { kind: 'doc', type: 'work_cert', addressed_to: 'Embassy' }, worker).data.request;
  assert.equal(g.api('hr.decide', { request_id: a.request_id, status: 'approved' }, admin).error.code, 'hr_status');
  assert.equal(g.api('hr.decide', { request_id: a.request_id, status: 'ready', note: 'At the office' }, admin).data.request.status, 'ready');
  const b = g.api('hr.create', { kind: 'doc', type: 'salary_cert' }, worker).data.request;
  assert.equal(g.api('hr.cancel', { request_id: b.request_id }, admin).error.code, 'not_found', 'only the requester withdraws');
  assert.equal(g.api('hr.cancel', { request_id: b.request_id }, worker).ok, true);
  assert.deepEqual(g.api('hr.mine', {}, worker).data.map((r) => r.status), ['cancelled', 'ready', 'cancelled']);
  assert.deepEqual(g.api('hr.list', { status: 'pending' }, admin).data.length, 0);
});

test('hr: a resignation or a transfer is approved (not "ready"); a certificate is made ready', () => {
  const { g, admin, worker } = env();
  const r = g.api('hr.create', { kind: 'doc', type: 'sponsor_transfer', reason: 'new sponsor' }, worker).data.request;
  assert.equal(g.api('hr.decide', { request_id: r.request_id, status: 'ready' }, admin).error.code, 'hr_status');
  assert.equal(g.api('hr.decide', { request_id: r.request_id, status: 'approved' }, admin).data.request.status, 'approved');
  const c = g.api('hr.create', { kind: 'doc', type: 'experience_cert' }, worker).data.request;
  assert.equal(g.api('hr.decide', { request_id: c.request_id, status: 'approved' }, admin).error.code, 'hr_status');
  assert.equal(g.api('hr.create', { kind: 'doc', type: 'promotion' }, worker).ok, true);
});

test('hr: an advance asked with its amount, answered approved or refused; the copy of a document is no more', () => {
  const { g, admin, worker } = env();
  assert.equal(g.api('hr.create', { kind: 'advance', type: 'advance' }, worker).error.code, 'amount_invalid');
  assert.equal(g.api('hr.create', { kind: 'doc', type: 'doc_copy' }, worker).error.code, 'hr_type');
  const a = g.api('hr.create', { kind: 'advance', type: 'advance', amount: '1500', reason: 'rent' }, worker).data.request;
  assert.equal(a.amount, 1500);
  assert.equal(g.api('hr.decide', { request_id: a.request_id, status: 'ready' }, admin).error.code, 'hr_status');
  assert.equal(g.api('hr.decide', { request_id: a.request_id, status: 'approved' }, admin).data.request.status, 'approved');
});

test('penalties: HR records one directly; a head proposes, HR issues; the employee objects within 24 hours; HR keeps or cancels', () => {
  const { g, admin, worker, head, head2 } = env();
  const sami = g.rows('Users').find((u) => u.username === 'sami').user_id;
  const today = g.api('data.bootstrap', {}, admin).data.today;
  // a head proposes only for their department; the worker cannot propose
  assert.equal(g.api('pen.add', { user_id: sami, date: today, reason: 'late', amount: 50 }, head2).error.code, 'pen_employee');
  assert.equal(g.api('pen.add', { user_id: sami, date: today, reason: 'late', amount: 50 }, worker).error.code, 'forbidden');
  assert.equal(g.api('pen.add', { user_id: sami, date: today, reason: '', amount: 50 }, head).error.code, 'pen_reason_required');
  const p = g.api('pen.add', { user_id: sami, date: today, reason: 'no hair net', amount: 50 }, head).data.penalty;
  assert.equal(p.status, 'proposed');
  assert.equal(g.api('pen.mine', {}, worker).data.length, 0, 'a proposal is not shown to the employee');
  assert.equal(g.api('data.bootstrap', {}, admin).data.hr_todo, 1);
  // HR issues it (with a corrected amount); the employee sees it and may object
  assert.equal(g.api('pen.review', { penalty_id: p.penalty_id, issue: true, amount: 40 }, admin).error.code, 'pen_category', 'HR picks the kind');
  const i = g.api('pen.review', { penalty_id: p.penalty_id, issue: true, amount: 40, category: 'سلامة الغذاء | Food safety' }, admin).data.penalty;
  assert.deepEqual([i.status, i.amount, i.category], ['issued', 40, 'سلامة الغذاء | Food safety']);
  assert.deepEqual(g.api('data.bootstrap', {}, worker).data.hr_counts.my_pen_new, 1);
  // opening My penalties marks it seen (no button); the objection stays open for 24 hours
  g.api('pen.seen', {}, worker);
  assert.deepEqual(g.api('data.bootstrap', {}, worker).data.hr_counts.my_pen_new, 0);
  const mine = g.api('pen.mine', {}, worker).data;
  assert.equal(mine[0].can_object, true);
  assert.equal(mine[0].proposed_by, undefined, 'who proposed it is shown to HR only');
  assert.equal(g.api('data.bootstrap', {}, worker).data.hr_todo, 0, 'seen: no number left, the objection stays open');
  assert.equal(g.api('pen.respond', { penalty_id: p.penalty_id, object: true, text: '' }, worker).error.code, 'pen_objection_required');
  assert.equal(g.api('pen.respond', { penalty_id: p.penalty_id, object: true, text: 'I had it on' }, worker).data.penalty.status, 'objected');
  assert.equal(g.api('pen.decide', { penalty_id: p.penalty_id, keep: true }, admin).error.code, 'hr_note_required');
  assert.equal(g.api('pen.decide', { penalty_id: p.penalty_id, keep: true, note: 'seen on camera' }, admin).data.penalty.status, 'kept');
  // HR records one directly: issued at once; after 24 hours no objection
  assert.equal(g.api('pen.add', { user_id: sami, date: today, reason: 'phone at work', amount: 20 }, admin).error.code, 'pen_category');
  assert.equal(g.api('pen.add', { user_id: sami, date: today, reason: 'phone at work', amount: 20, category: 'nope' }, admin).error.code, 'pen_category');
  const d = g.api('pen.add', { user_id: sami, date: today, reason: 'phone at work', amount: 20, category: 'استعمال الهاتف أثناء العمل | Phone at work', photo: 'data:image/jpeg;base64,AAAA' }, admin).data.penalty;
  assert.equal(d.photos.length, 1);
  assert.equal(d.status, 'issued');
  const row = g.spreadsheet.sheets.HrPenalties;
  const c = row.data[0].indexOf('issued_at');
  row.data.find((r) => r[0] === d.penalty_id)[c] = '2020-01-01T08:00:00';
  g.reset && g.reset();
  assert.equal(g.api('pen.respond', { penalty_id: d.penalty_id, object: true, text: 'no' }, worker).error.code, 'pen_object_late');
  // a dismissed proposal needs a reason; HR may cancel a penalty that stands
  const q = g.api('pen.add', { user_id: sami, date: today, reason: 'x', amount: 10 }, head).data.penalty;
  assert.equal(g.api('pen.review', { penalty_id: q.penalty_id, issue: false }, admin).error.code, 'hr_note_required');
  assert.equal(g.api('pen.review', { penalty_id: q.penalty_id, issue: false, note: 'not proven' }, admin).data.penalty.status, 'dismissed');
  assert.equal(g.api('pen.decide', { penalty_id: d.penalty_id, keep: false, note: 'first time' }, admin).data.penalty.status, 'cancelled');
  assert.equal(g.api('pen.list', {}, head2).data.length, 0);
});

test('hr: the requester sees the answer once (green banner); HR changes the kinds of penalty', () => {
  const { g, admin, worker } = env();
  const a = g.api('hr.create', { kind: 'doc', type: 'work_cert' }, worker).data.request;
  g.api('hr.decide', { request_id: a.request_id, status: 'ready' }, admin);
  const c = () => g.api('data.bootstrap', {}, worker).data.hr_counts;
  assert.deepEqual([c().my_req_new, c().my_req_ok], [1, 1]);
  g.api('hr.seenMine', {}, worker);
  assert.deepEqual([c().my_req_new, c().my_req_ok], [0, 0]);
  assert.equal(g.api('pen.setCategories', { list: ['Hygiene', ' Hygiene', 'Late'] }, worker).error.code, 'forbidden');
  assert.deepEqual(g.api('pen.setCategories', { list: ['Hygiene', ' Hygiene', 'تأخير|Late ', ''] }, admin).data.list, ['Hygiene', 'تأخير | Late']);
  assert.equal(g.api('pen.setCategories', { list: [] }, admin).error.code, 'pen_categories_empty');
});

test('hr: switched off again, nothing is sent (shown as being built)', () => {
  const { g, admin, worker } = env();
  g.api('settings.hrLive', { on: false }, admin);
  assert.equal(g.api('hr.create', { kind: 'leave', type: 'annual', date_from: '2026-12-01', date_to: '2026-12-02' }, worker).error.code, 'hr_preview');
  assert.equal(g.api('settings.hrLive', { on: true }, worker).error.code, 'forbidden');
  assert.equal(g.api('hr.mine', {}, worker).ok, true, 'the lists still open');
  assert.equal(g.rows('HrRequests').length, 0);
});
