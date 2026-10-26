'use strict';
// LPO: the purchasing officer writes and sends it, the admin approves or rejects it, the number is proposed and unique.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

function env() {
  const g = createGas();
  g.seed('Items', [{ item_id: 'I0001', name: 'CREAM', category: 'Food', unit: 'PC', min_stock: 0, active: true, store: 'CHILLED' }]);
  g.seed('Parties', [{ party_id: 'P001', name: 'Farm', kind: 'supplier', active: true }, { party_id: 'P002', name: 'Kitchen', kind: 'section', active: true }]);
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  g.api('users.save', { username: 'buyer', display_name: 'Buyer', role: 'purchasing', pin: '5678' }, tok.admin);
  g.api('users.save', { username: 'store', display_name: 'Store', role: 'storekeeper', pin: '4321' }, tok.admin);
  tok.buyer = g.api('auth.login', { username: 'buyer', pin: '5678' }).data.token;
  tok.store = g.api('auth.login', { username: 'store', pin: '4321' }).data.token;
  return { g, tok };
}
const lpo = (over) => Object.assign({ date: '2026-10-26', party_id: 'P001', requisitioner: 'Ali',
  lines: [{ item_id: 'I0001', qty: 10, unit: 'box', price: 2.5 }, { description: 'Gloves', qty: 2, unit: 'PC', price: 4 }] }, over);

test('LPO: number proposed after 319, saved as draft, sent, approved by the admin', () => {
  const { g, tok } = env();
  assert.equal(g.api('lpo.list', {}, tok.buyer).data.next_no, 320);
  assert.equal(g.api('lpo.list', {}, tok.store).error.code, 'forbidden');
  const r = g.api('lpo.save', lpo(), tok.buyer);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.data.lpo_no, r.data.status], [320, 'draft']);
  const got = g.api('lpo.get', { lpo_id: r.data.lpo_id }, tok.buyer).data;
  assert.equal(got.lpo.total, 33);
  assert.deepEqual(got.lines.map((l) => [l.description, l.unit, l.total]), [['CREAM', 'BOX', 25], ['Gloves', 'PC', 8]]);
  // the buyer cannot approve; a draft cannot be approved
  assert.equal(g.api('lpo.decide', { lpo_id: r.data.lpo_id, approve: true }, tok.buyer).error.code, 'forbidden');
  assert.equal(g.api('lpo.decide', { lpo_id: r.data.lpo_id, approve: true }, tok.admin).error.code, 'lpo_not_submitted');
  assert.equal(g.api('lpo.save', lpo({ lpo_id: r.data.lpo_id, lpo_no: 320, submit: true }), tok.buyer).data.status, 'submitted');
  assert.equal(g.api('data.bootstrap', {}, tok.admin).data.lpo_pending, 1);
  // a sent LPO is locked
  assert.equal(g.api('lpo.save', lpo({ lpo_id: r.data.lpo_id }), tok.buyer).error.code, 'lpo_locked');
  assert.equal(g.api('lpo.decide', { lpo_id: r.data.lpo_id, approve: true }, tok.admin).data.status, 'approved');
  const boot = g.api('data.bootstrap', {}, tok.buyer).data;
  assert.deepEqual(boot.lpo_decided.map((x) => x.slice(0, 2)), [[r.data.lpo_id, 'approved']]);
  assert.match(boot.lpo_terms, /Bank transfer/);
  assert.equal(g.api('data.bootstrap', {}, tok.admin).data.lpo_pending, 0);
  assert.equal(g.api('lpo.list', {}, tok.buyer).data.next_no, 321);
});

test('LPO: a changed number must stay unique; a rejection needs a reason and can be edited and sent again', () => {
  const { g, tok } = env();
  const a = g.api('lpo.save', lpo({ lpo_no: 400, submit: true }), tok.buyer).data;
  assert.equal(a.lpo_no, 400);
  assert.equal(g.api('lpo.save', lpo({ lpo_no: 400 }), tok.buyer).error.code, 'lpo_no_taken');
  assert.equal(g.api('lpo.save', lpo({ party_id: 'P002' }), tok.buyer).error.code, 'party_not_supplier');
  assert.equal(g.api('lpo.save', lpo({ lines: [] }), tok.buyer).error.code, 'nothing_to_save');
  assert.equal(g.api('lpo.decide', { lpo_id: a.lpo_id, approve: false }, tok.admin).error.code, 'reason_required');
  assert.equal(g.api('lpo.decide', { lpo_id: a.lpo_id, approve: false, note: 'Price too high' }, tok.admin).data.status, 'rejected');
  const again = g.api('lpo.save', lpo({ lpo_id: a.lpo_id, lpo_no: 400, submit: true, lines: [{ item_id: 'I0001', qty: 10, unit: 'BOX', price: 2 }] }), tok.buyer);
  assert.equal(again.data.status, 'submitted');
  assert.equal(g.rows('LPOLines').filter((l) => l.lpo_id === a.lpo_id).length, 1);
  assert.equal(g.rows('LPOs')[0].decision_note, '');
});

test('LPO: terms and the starting number are set by the admin; supplier contact details are kept on the supplier', () => {
  const { g, tok } = env();
  assert.equal(g.api('lpo.settings', { terms: 'A\nB' }, tok.buyer).error.code, 'forbidden');
  g.api('lpo.settings', { terms: 'Term one\nTerm two', start: 500 }, tok.admin);
  assert.equal(g.api('data.bootstrap', {}, tok.buyer).data.lpo_terms, 'Term one\nTerm two');
  assert.equal(g.api('lpo.list', {}, tok.buyer).data.next_no, 500);
  const p = g.api('parties.save', { party_id: 'P001', name: 'Farm', tel: '4444 1111', email: 'a@farm.qa', contact: 'Sami', contact_phone: '5555' }, tok.buyer);
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.deepEqual([p.data.party.tel, p.data.party.email, p.data.party.contact], ['4444 1111', 'a@farm.qa', 'Sami']);
});
