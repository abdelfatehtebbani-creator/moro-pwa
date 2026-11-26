'use strict';
// The script lock: a write reaches the sheets before the lock is released.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

test('a write is applied to the sheets before the lock is released (two requests one second apart never share a number)', () => {
  const g = createGas();
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const admin = g.api('auth.login', { username: 'admin', pin: '1234' }).data.token;
  g.run(`var __order = []; SpreadsheetApp.flush = function () { __order.push('flush'); };
    var __lock = LockService.getScriptLock; LockService.getScriptLock = function () { var l = __lock(); var r = l.releaseLock; l.releaseLock = function () { __order.push('release'); r(); }; return l; };`);
  g.api('settings.idle', { minutes: 7 }, admin);
  const order = JSON.parse(g.run('JSON.stringify(__order)'));
  assert.ok(order.indexOf('flush') >= 0 && order.indexOf('flush') < order.lastIndexOf('release'), order.join(','));
});
