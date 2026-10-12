'use strict';
/**
 * Loads every server/*.gs file into one VM context with in-memory fakes of the Apps Script
 * services, the way Apps Script shares one global scope between files.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const SERVER = path.join(__dirname, '..', '..', 'server');

class FakeRange {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.cols; c++) { const v = src[this.col - 1 + c]; line.push(v === undefined ? '' : v); }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (this.row + values.length - 1 > this.sheet.maxRows) throw new Error('Range out of bounds');
    values.forEach((line, r) => {
      const idx = this.row - 1 + r;
      while (this.sheet.data.length <= idx) this.sheet.data.push([]);
      line.forEach((v, c) => { this.sheet.data[idx][this.col - 1 + c] = v; });
    });
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  clearContent() {
    for (let r = 0; r < this.rows; r++) {
      const line = this.sheet.data[this.row - 1 + r];
      if (line) for (let c = 0; c < this.cols; c++) line[this.col - 1 + c] = '';
    }
    // trailing empty rows do not count for getLastRow, as in Sheets
    while (this.sheet.data.length && this.sheet.data[this.sheet.data.length - 1].every((v) => v === '' || v === undefined)) this.sheet.data.pop();
    return this;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
}

class FakeSheet {
  constructor(name, data) { this.name = name; this.data = data || []; this.maxRows = 1000; }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(_after, n) { this.maxRows += n; }
  getRange(row, col, rows, cols) { return new FakeRange(this, row, col, rows || 1, cols || 1); }
  getDataRange() { return new FakeRange(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  setFrozenRows() {}
}

class FakeSpreadsheet {
  constructor() { this.sheets = {}; }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) { this.sheets[name] = new FakeSheet(name); return this.sheets[name]; }
  getSheets() { return Object.values(this.sheets); }
  deleteSheet(s) { delete this.sheets[s.name]; }
}

function createGas(opts = {}) {
  const spreadsheet = new FakeSpreadsheet();
  const props = {};
  const cache = {};
  const logs = [];
  const lock = { held: false, acquirable: opts.lockAcquirable !== false };
  const fmt = (date, tz, pattern) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((x) => [x.type, x.value]));
    if (pattern === 'yyyy-MM-dd') return `${p.year}-${p.month}-${p.day}`;
    if (pattern === "yyyy-MM-dd'T'HH:mm:ss") return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
    throw new Error('fake formatDate: unsupported pattern ' + pattern);
  };
  const context = {
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    Logger: { log: (...a) => logs.push(a.join(' ')) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (value, key) =>
        Array.from(new Int8Array(crypto.createHmac('sha256', key).update(value, 'utf8').digest())),
      base64EncodeWebSafe: (data) => Buffer.from(Uint8Array.from(data, (b) => b & 0xff)).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_'),
      formatDate: fmt,
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({
      tryLock: () => { if (!lock.acquirable) return false; lock.held = true; return true; },
      releaseLock: () => { lock.held = false; } }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
    SpreadsheetApp: { getActive: () => spreadsheet, flush: () => {} },
  };
  vm.createContext(context);
  for (const f of fs.readdirSync(SERVER).filter((n) => n.endsWith('.gs')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(SERVER, f), 'utf8'), context, { filename: f });
  }
  const run = (code) => vm.runInContext(code, context);
  run('setupSheets()');
  return {
    run, spreadsheet, props, cache, logs, lock,
    /** Adds rows (objects) to a sheet after its header. */
    seed(sheetName, records) {
      const sh = spreadsheet.sheets[sheetName];
      const head = sh.data[0];
      records.forEach((r) => sh.data.push(head.map((c) => (r[c] === undefined ? '' : r[c]))));
    },
    rows(sheetName) {
      const sh = spreadsheet.sheets[sheetName];
      const [head, ...rows] = sh.data;
      return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
    },
    /** Calls the web app like the PWA does and returns the parsed response. */
    api(action, payload, token) {
      context.__body = JSON.stringify({ action, payload, token });
      return JSON.parse(run('doPost({postData: {contents: __body}}).text'));
    },
  };
}

module.exports = { createGas };
