'use strict';
// Every file of the app parses: a broken one stops the whole app on the phone before anything shows.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const APP = path.join(__dirname, '..', 'app');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : e.name.endsWith('.js') ? [p] : [];
  });
}

test('every app script parses', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moro-syntax-'));
  const bad = [];
  for (const f of files(APP)) {
    const copy = path.join(tmp, 'x.mjs');
    fs.copyFileSync(f, copy);
    try { execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' }); }
    catch (e) { bad.push(path.relative(APP, f) + ': ' + String(e.stderr).split('\n').find((l) => /Error/.test(l))); }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.deepEqual(bad, []);
});
