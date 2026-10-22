'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(new Date());

/** A database with two items, a supplier, a section, and four users (one per role). */
function env() {
  const g = createGas();
  g.seed('Items', [
    { item_id: 'I0001', name: 'FLOUR NO 1', category: 'Food', unit: 'BAG', min_stock: 10, active: true },
    { item_id: 'I0002', name: '12 OZ CUPS', category: 'Packaging', unit: 'BOX', min_stock: 0, active: true },
    { item_id: 'I0003', name: 'OLD ITEM', category: 'Food', unit: 'PC', min_stock: 0, active: false },
  ]);
  g.seed('Parties', [
    { party_id: 'P001', name: 'Section Kitchen', kind: 'section', active: true },
    { party_id: 'P002', name: 'Al Bayader', kind: 'supplier', active: true },
  ]);
  g.seed('Balances', [{ item_id: 'I0001', qty: 5, unit: 'BAG', last_expiry: '', updated_at: '' }]);
  g.seed('Movements', [{ movement_id: 'M000007', date: '2026-01-01', kind: 'OPENING', party_id: 'P002', item_id: 'I0001', qty: 5,
                         unit: 'BAG', status: 'active' }]);
  const setup = g.api('auth.setup', { username: 'admin', display_name: 'Abdelfateh', pin: '1234' });
  assert.equal(setup.ok, true, JSON.stringify(setup));
  const tok = { admin: g.api('auth.login', { username: 'admin', pin: '1234' }).data.token };
  for (const role of ['storekeeper', 'purchasing', 'production']) {
    const r = g.api('users.save', { username: role, display_name: role, role, pin: '5678' }, tok.admin);
    assert.equal(r.ok, true, JSON.stringify(r));
    tok[role] = g.api('auth.login', { username: role, pin: '5678' }).data.token;
  }
  const bal = (id) => { const b = g.rows('Balances').find((x) => x.item_id === id); return b ? Number(b.qty) : 0; };
  return { g, tok, bal };
}

const receipt = (extra) => ({ kind: 'RECEIPT', date: TODAY, party_id: 'P002', item_id: 'I0001', qty: 10, unit: 'BAG', price: 50,
  per: 'BAG', amount: 500, discount: 10, doc_no: 'INV-1', location: 'Shelves F 01', expiry: '2027-01-31', ...extra });
const issue = (extra) => ({ kind: 'ISSUE', date: TODAY, party_id: 'P001', item_id: 'I0001', qty: 2, unit: 'BAG', ...extra });

test('ping reports setup status; setup works once only', () => {
  const g = createGas();
  assert.equal(g.api('ping').data.setup_needed, true);
  assert.equal(g.api('auth.setup', { username: 'admin', pin: '1234' }).ok, true);
  assert.equal(g.api('ping').data.setup_needed, false);
  assert.equal(g.api('auth.setup', { username: 'x', pin: '1234' }).error.code, 'already_setup');
});

test('login: wrong PIN is rejected and locks after five tries; PIN is never stored in clear', () => {
  const { g } = env();
  for (let i = 0; i < 5; i++) assert.equal(g.api('auth.login', { username: 'admin', pin: '0000' }).error.code, 'login_failed');
  assert.equal(g.api('auth.login', { username: 'admin', pin: '1234' }).error.code, 'login_locked');
  const u = g.rows('Users').find((x) => x.username === 'admin');
  assert.notEqual(u.pin_hash, '1234');
  assert.ok(!JSON.stringify(g.rows('Users')).includes('"1234"'));
});

test('tokens: tampering, deactivation and PIN change all invalidate the session', () => {
  const { g, tok } = env();
  assert.equal(g.api('auth.me', {}, tok.storekeeper).ok, true);
  assert.equal(g.api('auth.me', {}, tok.storekeeper.slice(0, -2) + 'xx').error.code, 'auth_required');
  assert.equal(g.api('auth.me', {}, undefined).error.code, 'auth_required');
  const changed = g.api('auth.changePin', { old_pin: '5678', new_pin: '9999' }, tok.purchasing);
  assert.equal(changed.ok, true);
  assert.equal(g.api('auth.me', {}, tok.purchasing).error.code, 'auth_expired');
  assert.equal(g.api('auth.me', {}, changed.data.token).ok, true);
  const sk = g.rows('Users').find((u) => u.username === 'storekeeper');
  assert.equal(g.api('users.save', { user_id: sk.user_id, active: false }, tok.admin).ok, true);
  assert.equal(g.api('auth.me', {}, tok.storekeeper).error.code, 'auth_required');
});

test('the last admin cannot remove their own admin access', () => {
  const { g, tok } = env();
  const admin = g.rows('Users').find((u) => u.username === 'admin');
  assert.equal(g.api('users.save', { user_id: admin.user_id, role: 'storekeeper' }, tok.admin).error.code, 'last_admin');
});

test('receipt: saved with server-side net amount, balance and last expiry updated', () => {
  const { g, tok, bal } = env();
  const r = g.api('movements.save', { movements: [receipt()] }, tok.storekeeper);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.saved[0].movement_id, 'M000008');
  const m = g.rows('Movements').find((x) => x.movement_id === 'M000008');
  assert.equal(m.final_amount, 450);
  assert.equal(m.category, 'Food');
  assert.equal(m.created_by, g.rows('Users').find((u) => u.username === 'storekeeper').user_id);
  assert.equal(bal('I0001'), 15);
  assert.equal(g.rows('Balances').find((b) => b.item_id === 'I0001').last_expiry, '2027-01-31');
  assert.ok(r.data.version >= 1);
});

test('receipt validation follows the v13 rules', () => {
  const { g, tok } = env();
  const code = (m) => g.api('movements.save', { movements: [m] }, tok.admin).error?.code;
  assert.equal(code(receipt({ doc_no: '' })), 'doc_required');
  assert.equal(code(receipt({ location: '' })), 'location_required');
  assert.equal(code(receipt({ expiry: '' })), 'expiry_required');
  assert.equal(code(receipt({ price: '' })), 'price_invalid');
  assert.equal(code(receipt({ party_id: 'P001' })), 'party_not_supplier');
  assert.equal(code(receipt({ item_id: 'I0003' })), 'item_inactive');
  assert.equal(code(receipt({ date: '2026-02-30' })), 'date_invalid');
  assert.equal(code(receipt({ qty: 0 })), 'qty_invalid');
  // packaging needs no expiry; a supplier return needs no invoice, price or location
  assert.equal(code(receipt({ item_id: 'I0002', unit: 'BOX', expiry: '' })), undefined);
  assert.equal(code({ kind: 'SUPPLIER_RETURN', date: TODAY, party_id: 'P002', item_id: 'I0001', qty: 1, unit: 'BAG' }), undefined);
});

test('receipt discount: a percentage, or a value taken off the amount', () => {
  const { g, tok } = env();
  const net = (id) => g.rows('Movements').find((m) => m.movement_id === id).final_amount;
  const r1 = g.api('movements.save', { movements: [receipt({ client_id: 'd1', amount: 50, discount: 10 })] }, tok.admin);
  assert.equal(net(r1.data.saved[0].movement_id), 45);
  const r2 = g.api('movements.save', { movements: [receipt({ client_id: 'd2', amount: 50, discount: 7, discount_kind: 'value' })] }, tok.admin);
  assert.equal(net(r2.data.saved[0].movement_id), 43);
  assert.equal(g.api('movements.save', { movements: [receipt({ client_id: 'd3', amount: 50, discount: 60, discount_kind: 'value' })] }, tok.admin).error.code, 'discount_invalid');
});

test('saving the same client_id twice records it once (offline resend)', () => {
  const { g, tok, bal } = env();
  const m = receipt({ client_id: 'dev1-0001' });
  const a = g.api('movements.save', { movements: [m] }, tok.admin);
  const b = g.api('movements.save', { movements: [m] }, tok.admin);
  assert.equal(b.data.saved[0].duplicate, true);
  assert.equal(b.data.saved[0].movement_id, a.data.saved[0].movement_id);
  assert.equal(g.rows('Movements').filter((x) => x.client_id === 'dev1-0001').length, 1);
  assert.equal(bal('I0001'), 15);
});

test('issue: negative quantity, lines of one store saved together share one slip number per day', () => {
  const { g, tok, bal } = env();
  const r = g.api('movements.save', { movements: [issue(), issue({ qty: 1 }), issue({ item_id: 'I0002', unit: 'BOX', qty: 3 })] }, tok.storekeeper);
  assert.equal(r.ok, true, JSON.stringify(r));
  const slip = 'D-' + TODAY.slice(5, 7) + TODAY.slice(8, 10) + '-001';
  // flour (dry store) shares one slip; cups (packaging store) get the next number
  assert.deepEqual(r.data.saved.map((s) => s.doc_no), [slip, slip, slip.replace('-001', '-002')]);
  assert.equal(bal('I0001'), 2);
  assert.equal(bal('I0002'), -3);
  const r2 = g.api('movements.save', { movements: [issue()] }, tok.storekeeper);
  assert.equal(r2.data.saved[0].doc_no, slip.replace('-001', '-003'));
  assert.equal(g.api('movements.save', { movements: [issue({ party_id: 'P002' })] }, tok.admin).error.code, 'party_not_section');
});

test('roles: who may save which kind, edit and delete', () => {
  const { g, tok } = env();
  assert.equal(g.api('movements.save', { movements: [issue()] }, tok.purchasing).error.code, 'forbidden');
  assert.equal(g.api('movements.save', { movements: [receipt()] }, tok.production).error.code, 'forbidden');
  const id = g.api('movements.save', { movements: [receipt()] }, tok.purchasing).data.saved[0].movement_id;
  // storekeeper cannot edit someone else's entry nor delete anything
  assert.equal(g.api('movements.update', { movement_id: id, changes: { qty: 4 } }, tok.storekeeper).error.code, 'forbidden');
  assert.equal(g.api('movements.delete', { movement_id: id }, tok.storekeeper).error.code, 'forbidden');
  assert.equal(g.api('movements.update', { movement_id: id, changes: { qty: 4 } }, tok.purchasing).ok, true);
  assert.equal(g.api('users.list', {}, tok.purchasing).error.code, 'forbidden');
});

test('update and delete keep the balance right and are audited', () => {
  const { g, tok, bal } = env();
  const id = g.api('movements.save', { movements: [receipt()] }, tok.admin).data.saved[0].movement_id;
  assert.equal(bal('I0001'), 15);
  const u = g.api('movements.update', { movement_id: id, changes: { qty: 4, item_id: 'I0002', unit: 'BOX', expiry: '' } }, tok.admin);
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(bal('I0001'), 5);
  assert.equal(bal('I0002'), 4);
  assert.equal(g.api('movements.update', { movement_id: id, changes: { kind: 'ISSUE' } }, tok.admin).error.code, 'field_not_editable');
  assert.equal(g.api('movements.delete', { movement_id: id }, tok.admin).ok, true);
  assert.equal(bal('I0002'), 0);
  assert.equal(g.rows('Movements').find((m) => m.movement_id === id).status, 'deleted');
  assert.deepEqual(g.rows('Audit').map((a) => a.action).filter((a) => a.startsWith('movement')), ['movement_update', 'movement_delete']);
  // deleting again changes nothing; editing a deleted row says who deleted it and when
  const again = g.api('movements.delete', { movement_id: id }, tok.admin);
  assert.equal(again.ok, true);
  assert.equal(again.data.already_deleted, true);
  assert.equal(bal('I0002'), 0);
  const late = g.api('movements.update', { movement_id: id, changes: { qty: 1 } }, tok.admin).error;
  assert.equal(late.code, 'already_deleted');
  assert.match(late.detail, /^.+\|\d{4}-\d{2}-\d{2}T/);
  assert.equal(g.api('movements.update', { movement_id: 'M999999', changes: { qty: 1 } }, tok.admin).error.code, 'not_found');
  // deleted rows are hidden from queries unless asked
  const q = g.api('movements.query', {}, tok.admin).data;
  assert.ok(!q.rows.some((r) => r[q.columns.indexOf('movement_id')] === id));
});

test('production role sees balances and history without prices or contacts', () => {
  const { g, tok } = env();
  g.api('movements.save', { movements: [receipt()] }, tok.admin);
  const q = g.api('movements.query', {}, tok.production).data;
  const row = q.rows.find((r) => r[q.columns.indexOf('kind')] === 'RECEIPT');
  assert.equal(row[q.columns.indexOf('price')], '');
  assert.equal(row[q.columns.indexOf('final_amount')], '');
  const b = g.api('data.bootstrap', {}, tok.production).data;
  assert.equal(b.contacts.rows.length, 0);
  assert.ok(b.balances.rows.length > 0);
  assert.ok(b.permissions.includes('requests.create'));
  assert.ok(!b.permissions.includes('movements.save'));
});

test('department request: created by production, issued in two parts by the storekeeper', () => {
  const { g, tok, bal } = env();
  const c = g.api('requests.create', { date: TODAY, party_id: 'P001', client_id: 'req-1',
    lines: [{ item_id: 'I0001', qty: 3 }, { item_id: 'I0002', qty: 1 }] }, tok.production);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(g.api('requests.create', { date: TODAY, party_id: 'P001', client_id: 'req-1', lines: [{ item_id: 'I0001', qty: 3 }] },
    tok.production).data.duplicate, true);
  const id = c.data.request_id;
  const f1 = g.api('requests.fulfil', { request_id: id, lines: [{ line_no: 1, qty: 2 }] }, tok.storekeeper);
  assert.equal(f1.data.status, 'partial', JSON.stringify(f1));
  assert.equal(bal('I0001'), 3);
  const f2 = g.api('requests.fulfil', { request_id: id, client_id: 'f2' }, tok.storekeeper);
  assert.equal(f2.data.status, 'fulfilled', JSON.stringify(f2));
  assert.equal(bal('I0001'), 2);
  assert.equal(bal('I0002'), -1);
  const lines = g.rows('RequestLines');
  assert.deepEqual(lines.map((l) => Number(l.issued_qty)), [3, 1]);
  assert.equal(g.api('requests.fulfil', { request_id: id }, tok.production).error.code, 'forbidden');
});

test('items: duplicates by name, renames and deactivation are admin-only, min stock by purchasing', () => {
  const { g, tok } = env();
  assert.equal(g.api('items.save', { name: ' flour  no 1 ', category: 'Food', unit: 'BAG' }, tok.storekeeper).error.code, 'name_taken');
  const n = g.api('items.save', { name: 'Sugar 50kg', category: 'Food', unit: 'bag' }, tok.storekeeper);
  assert.equal(n.data.item.item_id, 'I0004');
  assert.equal(n.data.item.unit, 'BAG');
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'FLOUR No.1' }, tok.purchasing).error.code, 'forbidden');
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'FLOUR NO 1', min_stock: 12 }, tok.storekeeper).error.code, 'forbidden');
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'FLOUR NO 1', min_stock: 12 }, tok.purchasing).data.item.min_stock, 12);
  const r = g.api('items.save', { item_id: 'I0001', name: 'FLOUR No.1 (Blue)' }, tok.admin).data.item;
  assert.equal(r.name, 'FLOUR No.1 (Blue)');
  assert.equal(r.aliases, 'FLOUR NO 1');
  // movements keep pointing at the same ID, so history follows the rename
  assert.equal(g.rows('Movements')[0].item_id, 'I0001');
});

test('storage locations: added by masters users, renamed and switched off by the admin only', () => {
  const { g, tok } = env();
  const add = g.api('locations.save', { name: ' Cold Room 2 ', category: 'Food' }, tok.storekeeper);
  assert.equal(add.ok, true, JSON.stringify(add));
  const id = add.data.location.location_id;
  assert.match(id, /^L\d{2,}$/);
  assert.equal(g.api('locations.save', { name: 'cold room 2', category: 'Packaging' }, tok.purchasing).error.code, 'name_taken');
  assert.equal(g.api('locations.save', { name: 'X', store: 'OTHER' }, tok.admin).error.code, 'store_invalid');
  assert.equal(g.api('locations.save', { name: 'Y', category: 'Food' }, tok.production).error.code, 'forbidden');
  assert.equal(g.api('locations.save', { location_id: id, name: 'Cold Room B' }, tok.storekeeper).error.code, 'forbidden');
  assert.equal(g.api('locations.save', { location_id: id, name: 'Cold Room 2', active: false }, tok.storekeeper).error.code, 'forbidden');
  assert.equal(g.api('locations.save', { location_id: id, name: 'Cold Room B', active: false }, tok.admin).ok, true);
  const row = g.rows('Locations').find((l) => l.location_id === id);
  assert.equal(row.name, 'Cold Room B');
  assert.equal(row.active, false);
  assert.deepEqual(g.rows('Audit').map((a) => a.action).filter((a) => a.startsWith('location')), ['location_create', 'location_update']);
});

test('units: seeded from the usual units and the items; added by masters users, switched off by the admin', () => {
  const { g, tok } = env();
  const units = g.rows('Units').map((u) => u.unit);
  assert.deepEqual(units, ['BAG', 'BOX', 'PC', 'PK', 'KG', 'L', 'G']);
  assert.equal(g.api('units.save', { unit: ' tray ' }, tok.storekeeper).ok, true);
  assert.equal(g.rows('Units').find((u) => u.unit === 'TRAY').active, true);
  assert.equal(g.api('units.save', { unit: 'Tray' }, tok.purchasing).error.code, 'name_taken');
  assert.equal(g.api('units.save', { unit: 'X' }, tok.production).error.code, 'forbidden');
  assert.equal(g.api('units.save', { unit: 'TRAY', active: false }, tok.storekeeper).error.code, 'forbidden');
  assert.equal(g.api('units.save', { unit: 'TRAY', active: false }, tok.admin).ok, true);
  assert.equal(g.rows('Units').find((u) => u.unit === 'TRAY').active, false);
  assert.equal(g.api('data.bootstrap', {}, tok.production).data.units.rows.length, 8);
  // seeding runs once: units stay as the users left them
  g.run("Masters.seedUnits()");
  assert.equal(g.rows('Units').length, 8);
});

test('stores: proposed on first run, and each storekeeper works only in their own stores', () => {
  const { g, tok } = env();
  const store = (id) => g.rows('Items').find((i) => i.item_id === id).store;
  assert.equal(store('I0001'), 'DRY');
  assert.equal(store('I0002'), 'PACK');
  assert.ok(g.rows('Users').every((u) => u.stores === 'CHILLED,DRY,PACK,FINAL,CLEAN'));
  // the admin gives the storekeeper the packaging store only
  const sk = g.rows('Users').find((u) => u.username === 'storekeeper');
  assert.equal(g.api('users.save', { user_id: sk.user_id, stores: ['PACK', 'BAD', 'PACK'] }, tok.admin).ok, true);
  assert.equal(g.rows('Users').find((u) => u.username === 'storekeeper').stores, 'PACK');
  assert.deepEqual(g.api('data.bootstrap', {}, tok.storekeeper).data.user.stores, ['PACK']);
  // receiving / issuing flour (dry) is refused, cups (packaging) are fine
  assert.equal(g.api('movements.save', { movements: [receipt()] }, tok.storekeeper).error.code, 'store_forbidden');
  assert.equal(g.api('movements.save', { movements: [issue()] }, tok.storekeeper).error.code, 'store_forbidden');
  const cups = g.api('movements.save', { movements: [issue({ item_id: 'I0002', unit: 'BOX', qty: 1 })] }, tok.storekeeper);
  assert.equal(cups.ok, true, JSON.stringify(cups));
  const mine = cups.data.saved[0].movement_id;
  // edit and delete: own records only, in own stores
  const adminFlour = g.api('movements.save', { movements: [issue()] }, tok.admin).data.saved[0].movement_id;
  const adminCups = g.api('movements.save', { movements: [issue({ item_id: 'I0002', unit: 'BOX', qty: 1 })] }, tok.admin).data.saved[0].movement_id;
  assert.equal(g.api('movements.update', { movement_id: adminCups, changes: { qty: 2 } }, tok.storekeeper).error.code, 'forbidden');
  assert.equal(g.api('movements.update', { movement_id: mine, changes: { item_id: 'I0001', unit: 'BAG' } }, tok.storekeeper).error.code, 'store_forbidden');
  assert.equal(g.api('movements.update', { movement_id: mine, changes: { qty: 2 } }, tok.storekeeper).ok, true);
  // the admin may edit and delete everyone's records
  assert.equal(g.api('movements.update', { movement_id: mine, changes: { qty: 3 } }, tok.admin).ok, true);
  assert.equal(g.api('movements.delete', { movement_id: adminFlour }, tok.admin).ok, true);
  // a user with delete rights still deletes only their own records
  g.api('users.save', { user_id: sk.user_id, caps: ['receive', 'issue', 'request_fulfil', 'edit_own', 'delete'] }, tok.admin);
  assert.equal(g.api('movements.delete', { movement_id: adminCups }, tok.storekeeper).error.code, 'forbidden');
  assert.equal(g.api('movements.delete', { movement_id: mine }, tok.storekeeper).ok, true);
  // moving an item to another store is the admin's
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'FLOUR NO 1', store: 'CHILLED' }, tok.purchasing).error.code, 'forbidden');
  assert.equal(g.api('items.save', { item_id: 'I0001', name: 'FLOUR NO 1', store: 'CHILLED' }, tok.admin).ok, true);
  assert.equal(store('I0001'), 'CHILLED');
  assert.equal(g.rows('Items').find((i) => i.item_id === 'I0001').category, 'Food');
  const box = g.api('items.save', { name: 'NEW BOX', store: 'PACK', unit: 'pc' }, tok.purchasing).data.item;
  assert.equal(box.category, 'Packaging');
});

test('department request with two stores: each storekeeper issues their own lines', () => {
  const { g, tok, bal } = env();
  const sk = g.rows('Users').find((u) => u.username === 'storekeeper');
  g.api('users.save', { user_id: sk.user_id, stores: ['PACK'] }, tok.admin);
  const req = g.api('requests.create', { date: TODAY, party_id: 'P001', lines: [{ item_id: 'I0001', qty: 2 }, { item_id: 'I0002', qty: 4 }] }, tok.production).data;
  const list = g.api('requests.list', { status: 'open' }, tok.storekeeper).data;
  assert.deepEqual(list[0].lines.map((l) => l.store), ['DRY', 'PACK']);
  // asking for the flour line is refused; "issue everything" issues the cups line only
  assert.equal(g.api('requests.fulfil', { request_id: req.request_id, lines: [{ line_no: 1, qty: 2 }] }, tok.storekeeper).error.code, 'store_forbidden');
  const f = g.api('requests.fulfil', { request_id: req.request_id }, tok.storekeeper);
  assert.equal(f.ok, true, JSON.stringify(f));
  assert.equal(f.data.status, 'partial');
  assert.equal(bal('I0002'), -4);
  assert.equal(bal('I0001'), 5);
  const f2 = g.api('requests.fulfil', { request_id: req.request_id }, tok.admin);
  assert.equal(f2.data.status, 'fulfilled');
  assert.equal(bal('I0001'), 3);
});

test('stores changed by hand in the sheet are put in line by the menu command', () => {
  const { g } = env();
  const sh = g.spreadsheet.sheets.Items;
  const c = sh.data[0].indexOf('store');
  sh.data[1][c] = 'PACK';            // flour moved to packaging by hand
  sh.data[2][c] = '';                // cups left empty
  const n = JSON.parse(g.run('JSON.stringify(Stores.applySheetEdits())'));
  assert.ok(n.items >= 2);
  const rows = g.rows('Items');
  assert.equal(rows[0].category, 'Packaging');
  assert.equal(rows[1].store, 'PACK');
});

test('lists and recipes are replaced as a whole', () => {
  const { g, tok } = env();
  assert.equal(g.api('lists.save', { list: 'FAST', item_ids: ['I0001', 'I0002', 'I0001'] }, tok.purchasing).data.count, 2);
  assert.equal(g.api('lists.save', { list: 'SENSITIVE', item_ids: ['I0002'] }, tok.admin).data.count, 1);
  assert.equal(g.api('lists.save', { list: 'FAST', item_ids: ['I0002'] }, tok.admin).data.count, 1);
  assert.deepEqual(g.rows('Lists').map((r) => r.list + ':' + r.item_id).sort(), ['FAST:I0002', 'SENSITIVE:I0002']);
  g.api('recipes.save', { product: 'maamoul tamr', lines: [{ item_id: 'I0001', qty_per_unit: 0.08 }] }, tok.admin);
  g.api('recipes.save', { product: 'MAAMOUL TAMR', lines: [{ item_id: 'I0002', qty_per_unit: 0.6 }] }, tok.admin);
  assert.deepEqual(g.rows('Recipes').map((r) => r.item_id), ['I0002']);
});

test('a busy lock is reported, not a crash; bad JSON is a clean error', () => {
  const g = createGas({ lockAcquirable: false });
  assert.equal(g.api('auth.setup', { username: 'admin', pin: '1234' }).error.code, 'busy');
  g.run('handle("{not json")');
  assert.equal(JSON.parse(g.run('JSON.stringify(handle("{not json"))')).error.code, 'bad_request');
});

test('production: consumes the recipe, adds the product, shortage does not block', () => {
  const { g, tok, bal } = env();
  g.api('recipes.save', { product: 'maamoul tamr', lines: [{ item_id: 'I0001', qty_per_unit: 0.08 }, { item_id: 'I0002', qty_per_unit: 0.5 }] }, tok.admin);
  const pv = g.api('production.preview', { product: 'maamoul tamr', qty: 10 }, tok.storekeeper).data;
  assert.deepEqual(pv.map((l) => [l.item_id, l.need, l.enough]), [['I0001', 0.8, true], ['I0002', 5, false]]);
  const r = g.api('production.post', { product: 'maamoul tamr', qty: 10, date: TODAY, client_id: 'p1', unit: 'KG' }, tok.storekeeper);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(bal('I0001'), 4.2);
  assert.equal(bal('I0002'), -5);
  const prod = g.rows('Items').find((i) => i.name === 'maamoul tamr');
  assert.equal(bal(prod.item_id), 10);
  assert.equal(g.api('production.post', { product: 'maamoul tamr', qty: 10, date: TODAY, client_id: 'p1' }, tok.storekeeper).data.saved[0].duplicate, true);
  assert.equal(g.api('production.post', { product: 'x', qty: 1, date: TODAY }, tok.storekeeper).error.code, 'recipe_missing');
  assert.equal(g.api('production.post', { product: 'maamoul tamr', qty: 1, date: TODAY }, tok.purchasing).error.code, 'forbidden');
});

test('admin can give a user a custom set of capabilities, and reset it to the role defaults', () => {
  const { g, tok } = env();
  const prod = g.rows('Users').find((u) => u.username === 'production');
  // production manager also allowed to receive goods, but still not to issue
  const r = g.api('users.save', { user_id: prod.user_id, caps: ['request_create', 'receive'] }, tok.admin);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.caps, ['request_create', 'receive']);
  assert.equal(g.api('movements.save', { movements: [receipt()] }, tok.production).ok, true);
  assert.equal(g.api('movements.save', { movements: [issue()] }, tok.production).error.code, 'forbidden');
  assert.ok(g.api('data.bootstrap', {}, tok.production).data.permissions.includes('kind.RECEIPT'));
  // a caps list equal to the role defaults is stored as "defaults"
  g.api('users.save', { user_id: prod.user_id, caps: ['request_create'] }, tok.admin);
  assert.equal(g.rows('Users').find((u) => u.user_id === prod.user_id).caps, '');
  // nobody can be left without someone able to manage users
  const admin = g.rows('Users').find((u) => u.username === 'admin');
  assert.equal(g.api('users.save', { user_id: admin.user_id, caps: ['receive'] }, tok.admin).error.code, 'last_admin');
  const sk = g.rows('Users').find((u) => u.username === 'storekeeper');
  assert.equal(g.api('users.save', { user_id: sk.user_id, caps: ['receive', 'users'] }, tok.admin).ok, true);
  assert.equal(g.api('users.save', { user_id: admin.user_id, caps: ['receive'] }, tok.admin).ok, true);
  assert.equal(g.api('users.list', {}, tok.storekeeper).ok, true);
});

test('the spreadsheet owner can reset a forgotten PIN; the old PIN and sessions stop working', () => {
  const { g, tok } = env();
  for (let i = 0; i < 5; i++) g.api('auth.login', { username: 'admin', pin: '0000' });
  assert.equal(g.api('auth.login', { username: 'admin', pin: '1234' }).error.code, 'login_locked');
  g.run("Recovery.resetPin(' Admin ', '24680')");
  assert.equal(g.api('auth.login', { username: 'admin', pin: '1234' }).ok, false);
  assert.equal(g.api('auth.login', { username: 'admin', pin: '24680' }).ok, true);
  assert.equal(g.api('auth.me', {}, tok.admin).error.code, 'auth_expired');
  assert.equal(g.rows('Audit').filter((a) => a.action === 'pin_reset_owner').length, 1);
  assert.throws(() => g.run("Recovery.resetPin('nobody', '1234')"));
  assert.throws(() => g.run("Recovery.resetPin('admin', '12')"));
});
