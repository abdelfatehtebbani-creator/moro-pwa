/**
 * Repo.gs – the only code that touches SpreadsheetApp.
 * Each sheet is read once per request into memory (header + rows). Writes change the rows in memory at
 * once and reach the sheet together at the end of the operation (flush: one write per block of rows),
 * since every call to the spreadsheet costs time. An operation that fails writes nothing (discard).
 *
 * A counter in the script properties (repo_seq) grows with every flush: a request that finds it unchanged
 * when it takes the lock knows nobody wrote since it read, and keeps what it read instead of reading again.
 */
var Repo = (function () {
  var tables = {};
  var seenSeq = null;       // repo_seq when this request first read a sheet

  function props() { return PropertiesService.getScriptProperties(); }
  function seqNow() { return String(props().getProperty('repo_seq') || '0'); }

  var book = null;
  function sheet(name) {
    var sh = (book || (book = SpreadsheetApp.getActive())).getSheetByName(name);
    if (!sh) throw new Error('Missing sheet ' + name);
    return sh;
  }

  function make(name, sh, head, rows, base) {
    var idx = {};
    head.forEach(function (h, i) { idx[h] = i; });
    // which columns hold text (dates, ids): looked up once, not for every cell
    var text = head.map(function (h) { return TEXT_COLUMNS.indexOf(h) >= 0; });
    var stamp = head.map(function (h) { return /(^|_)at$/.test(h); });
    return { name: name, sh: sh, head: head, idx: idx, rows: rows, text: text, stamp: stamp, saved: rows.length, base: base, dirty: {}, groups: {}, index: {} };
  }

  function table(name) {
    var t = tables[name];
    if (t && !t.light) return t;
    if (seenSeq === null) seenSeq = seqNow();
    var sh = t ? t.sh : sheet(name);
    // one call: the used area of the sheet
    var values = sh.getDataRange().getValues();
    if (!values.length) values = [[]];
    var full = make(name, sh, values[0].map(String), values.slice(1), 0);
    // a sheet only appended to so far: its rows not written yet follow what the sheet holds
    if (t) { t.rows.slice(t.saved).forEach(function (r) { full.rows.push(r); }); full.groups = {}; }
    tables[name] = full;
    return full;
  }

  /**
   * For adding rows only (the audit log, new movements…): the header and the number of rows, not the rows
   * themselves – a sheet of many thousand rows is not read just to add one. Read in full when needed.
   */
  function tableToAdd(name) {
    if (tables[name]) return tables[name];
    if (seenSeq === null) seenSeq = seqNow();
    var sh = sheet(name);
    var last = sh.getLastRow();
    var head = last > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
    var t = make(name, sh, head, [], Math.max(0, last - 1));
    t.light = true;
    tables[name] = t;
    return t;
  }

  /**
   * A text column (dates, ids) that Sheets turned into a Date – a cell typed or pasted by hand, or one
   * without text format – reads back as the text it stands for: 2027-06-02, or 2027-06-02T09:15:00.
   */
  function cell(t, i, v) {
    if (v === undefined) return '';
    if (t.text[i] && v && typeof v.getTime === 'function' && typeof v.getFullYear === 'function') {
      return Utilities.formatDate(v, TZ, t.stamp[i] ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd');
    }
    return v;
  }

  function toObj(t, row) {
    var o = {};
    for (var i = 0; i < t.head.length; i++) o[t.head[i]] = cell(t, i, row[i]);
    return o;
  }

  function changed(t, r) { t.dirty[r] = true; t.groups = {}; t.index = {}; }

  function all(name) {
    var t = table(name);
    return t.rows.map(function (r) { return toObj(t, r); });
  }

  /** Header + raw rows: compact payload for the app. */
  function raw(name) {
    var t = table(name);
    return { columns: t.head.slice(), rows: t.rows.map(function (r) { return t.head.map(function (h, i) { return cell(t, i, r[i]); }); }) };
  }

  /** The first row whose `col` equals `value` (a new object). The rows are looked up by an index built once per column. */
  function find(name, col, value) {
    var t = table(name);
    var ix = t.index[col];
    if (!ix) {
      var i = t.idx[col];
      ix = t.index[col] = {};
      for (var r = t.rows.length - 1; r >= 0; r--) ix[String(t.rows[r][i])] = r;     // backwards: the first match wins
    }
    var at = ix[String(value)];
    return at === undefined ? null : toObj(t, t.rows[at]);
  }

  /**
   * The rows of a sheet by the value of one column ({value: [row objects]}), built once until the sheet
   * changes. For reading only: the objects are shared by every caller of the same request.
   */
  function groupBy(name, col) {
    var t = table(name);
    if (t.groups[col]) return t.groups[col];
    var i = t.idx[col], out = {};
    t.rows.forEach(function (r) { var k = String(r[i] === undefined ? '' : r[i]); (out[k] = out[k] || []).push(toObj(t, r)); });
    t.groups[col] = out;
    return out;
  }

  function column(name, col) {
    var t = table(name);
    var i = t.idx[col];
    return t.rows.map(function (r) { return r[i]; });
  }

  function append(name, objs) {
    if (!objs.length) return;
    var t = tableToAdd(name);
    objs.forEach(function (o) {
      t.rows.push(t.head.map(function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; }));
    });
    t.groups = {}; t.index = {};
  }

  function apply(t, r, changes, name) {
    var before = toObj(t, t.rows[r]);
    Object.keys(changes).forEach(function (c) {
      if (!(c in t.idx)) throw new Error('Unknown column ' + name + '.' + c);
      t.rows[r][t.idx[c]] = changes[c] === null || changes[c] === undefined ? '' : changes[c];
    });
    changed(t, r);
    return { before: before, after: toObj(t, t.rows[r]) };
  }

  /** Updates the first row whose `col` equals `value`. Returns {before, after} or null. */
  function update(name, col, value, changes) {
    var t = table(name);
    var k = t.idx[col], v = String(value);
    for (var r = 0; r < t.rows.length; r++) {
      if (String(t.rows[r][k]) === v) return apply(t, r, changes, name);
    }
    return null;
  }

  /** Updates the first row for which match(rowObject) is true. Returns {before, after} or null. */
  function updateWhere(name, match, changes) {
    var t = table(name);
    for (var r = 0; r < t.rows.length; r++) {
      if (match(toObj(t, t.rows[r]))) return apply(t, r, changes, name);
    }
    return null;
  }

  /** Sets one column for every row in a single write: value = fn(rowObject). */
  function setColumn(name, col, fn) {
    var t = table(name);
    var c = t.idx[col];
    if (c === undefined) throw new Error('Unknown column ' + name + '.' + col);
    if (!t.rows.length) return;
    // only the rows whose value really changes are written back (a whole sheet rewritten took long)
    t.rows.forEach(function (r, i) {
      var v = fn(toObj(t, r));
      v = v === null || v === undefined ? '' : v;
      if (String(v) === String(r[c] === null || r[c] === undefined ? '' : r[c])) return;
      r[c] = v; changed(t, i);
    });
  }

  /** Replaces every data row (used for small lists such as Lists and Recipes). */
  function replaceAll(name, objs) {
    var t = table(name);
    flushTable(t);
    var n = t.rows.length;
    if (n) t.sh.getRange(2, 1, n, t.head.length).clearContent();
    t.rows = [];
    t.saved = 0;
    t.base = 0;
    t.groups = {}; t.index = {};
    append(name, objs);
  }

  /** Text format on the text columns of rows the sheet did not have (added at the bottom): one call per run of text columns. */
  function textFormat(t, startRow, n) {
    var c = 0;
    while (c < t.head.length) {
      if (!t.text[c]) { c++; continue; }
      var from = c;
      while (c < t.head.length && t.text[c]) c++;
      t.sh.getRange(startRow, from + 1, n, c - from).setNumberFormat('@');
    }
  }

  function flushTable(t) {
    var wrote = false;
    // changed rows already in the sheet: one write per block of neighbouring rows
    var rows = Object.keys(t.dirty).map(Number).filter(function (r) { return r < t.saved; }).sort(function (a, b) { return a - b; });
    var i = 0;
    while (i < rows.length) {
      var j = i;
      while (j + 1 < rows.length && rows[j + 1] === rows[j] + 1) j++;
      t.sh.getRange(rows[i] + 2, 1, j - i + 1, t.head.length).setValues(t.rows.slice(rows[i], rows[j] + 1));
      wrote = true;
      i = j + 1;
    }
    t.dirty = {};
    // new rows: one write at the bottom (the sheet grows first when it is full)
    if (t.rows.length > t.saved) {
      var start = t.base + t.saved + 2, n = t.rows.length - t.saved;
      var max = t.sh.getMaxRows();
      if (start + n - 1 > max) {
        t.sh.insertRowsAfter(max, start + n - 1 - max + 100);
        textFormat(t, max + 1, start + n - 1 - max + 100);
      }
      t.sh.getRange(start, 1, n, t.head.length).setValues(t.rows.slice(t.saved));
      t.saved = t.rows.length;
      wrote = true;
    }
    return wrote;
  }

  /** Writes every change of this request to the sheets. Returns true when something was written. */
  function flush() {
    var wrote = false;
    Object.keys(tables).forEach(function (k) { if (flushTable(tables[k])) wrote = true; });
    if (wrote) {
      var next = String(Number(seqNow()) + 1);
      props().setProperty('repo_seq', next);
      seenSeq = next;
    }
    return wrote;
  }

  /** Did anybody write since this request read? (false: what is in memory is still what the sheets hold) */
  function stale() {
    if (seenSeq === null) return false;          // nothing read yet
    return seqNow() !== seenSeq;
  }

  /** Forgets what was read (changes not written yet are written first). */
  function reset() { flush(); tables = {}; seenSeq = null; }

  /** Forgets what was read and the changes not written (an operation that failed). */
  function discard() { tables = {}; seenSeq = null; }

  return { all: all, raw: raw, find: find, groupBy: groupBy, column: column, append: append, update: update, updateWhere: updateWhere,
           replaceAll: replaceAll, setColumn: setColumn, flush: flush, stale: stale, reset: reset, discard: discard };
})();
