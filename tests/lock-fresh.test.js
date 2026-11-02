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
  const sh = g.spreadsheet.sheets.Settings;
  const row = sh.data.findIndex((r) => r[0] === 'seq_order');
  sh.data[row][1] = '2';
  assert.equal(g.run("withLock(function () { return Settings.next('seq_order', 0); })"), 3);
});
