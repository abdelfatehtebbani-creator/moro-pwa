'use strict';
// Two requests at once: what one read before taking the lock is read again inside it, so counters never repeat.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

test('a counter taken under the lock sees what another request wrote meanwhile', () => {
  const g = createGas();
  g.run("withLock(function () { Settings.set('seq_order', 1); })");
  // this request reads the counter before its lock (as every request reads the settings first) …
  assert.equal(g.run("Settings.get('seq_order', '')"), '1');
  // … another request takes number 2 meanwhile, straight in the sheet
  // (a request that writes moves the write counter on when its changes reach the sheets)
  const sh = g.spreadsheet.sheets.Settings;
  const row = sh.data.findIndex((r) => r[0] === 'seq_order');
  sh.data[row][1] = '2';
  g.props.repo_seq = String(Number(g.props.repo_seq || 0) + 1);
  assert.equal(g.run("withLock(function () { return Settings.next('seq_order', 0); })"), 3);
});

test('nobody wrote since this request read: the lock keeps what was read (no second read of the sheets)', () => {
  const g = createGas();
  g.run("withLock(function () { Settings.set('seq_order', 1); })");
  g.run('Repo.discard()');
  assert.equal(g.run("Settings.get('seq_order', '')"), '1');
  // the sheet changes behind the request's back, but nobody moved the write counter: what was read stands
  const sh = g.spreadsheet.sheets.Settings;
  sh.data[sh.data.findIndex((r) => r[0] === 'seq_order')][1] = '9';
  assert.equal(g.run("withLock(function () { return Settings.next('seq_order', 0); })"), 2);
});

test('an operation that fails under the lock writes nothing', () => {
  const g = createGas();
  g.run("withLock(function () { Settings.set('seq_order', 1); })");
  assert.throws(() => g.run("withLock(function () { Settings.set('seq_order', 5); throw new Error('boom'); })"));
  g.run('Repo.discard()');
  assert.equal(g.run("Settings.get('seq_order', '')"), '1');
});
