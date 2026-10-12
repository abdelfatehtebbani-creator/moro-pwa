/**
 * Repo.gs – the only code that touches SpreadsheetApp.
 * Each sheet is read once per request into memory (header + rows) and kept in sync on writes.
 */
var Repo = (function () {
  var tables = {};

  function sheet(name) {
    var sh = SpreadsheetApp.getActive().getSheetByName(name);
    if (!sh) throw new Error('Missing sheet ' + name);
    return sh;
  }

  function table(name) {
    if (tables[name]) return tables[name];
    var sh = sheet(name);
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    var values = lastRow > 0 ? sh.getRange(1, 1, lastRow, lastCol).getValues() : [[]];
    var head = values[0].map(String);
    var idx = {};
    head.forEach(function (h, i) { idx[h] = i; });
    tables[name] = { name: name, sh: sh, head: head, idx: idx, rows: values.slice(1) };
    return tables[name];
  }

  function toObj(t, row) {
    var o = {};
    t.head.forEach(function (h, i) { o[h] = row[i] === undefined ? '' : row[i]; });
    return o;
  }

  function all(name) {
    var t = table(name);
    return t.rows.map(function (r) { return toObj(t, r); });
  }

  /** Header + raw rows: compact payload for the app. */
  function raw(name) {
    var t = table(name);
    return { columns: t.head.slice(), rows: t.rows.map(function (r) { return r.slice(); }) };
  }

  function find(name, col, value) {
    var t = table(name);
    var i = t.idx[col];
    for (var r = 0; r < t.rows.length; r++) {
      if (String(t.rows[r][i]) === String(value)) return toObj(t, t.rows[r]);
    }
    return null;
  }

  function column(name, col) {
    var t = table(name);
    var i = t.idx[col];
    return t.rows.map(function (r) { return r[i]; });
  }

  function append(name, objs) {
    if (!objs.length) return;
    var t = table(name);
    var data = objs.map(function (o) {
      return t.head.map(function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; });
    });
    var start = t.sh.getLastRow() + 1;
    var need = start + data.length - 1 - t.sh.getMaxRows();
    if (need > 0) t.sh.insertRowsAfter(t.sh.getMaxRows(), need + 100);
    t.head.forEach(function (h, c) {
      if (TEXT_COLUMNS.indexOf(h) >= 0) t.sh.getRange(start, c + 1, data.length, 1).setNumberFormat('@');
    });
    t.sh.getRange(start, 1, data.length, t.head.length).setValues(data);
    data.forEach(function (r) { t.rows.push(r); });
  }

  /** Updates the first row whose `col` equals `value`. Returns {before, after} or null. */
  function update(name, col, value, changes) {
    var t = table(name);
    var k = t.idx[col];
    for (var r = 0; r < t.rows.length; r++) {
      if (String(t.rows[r][k]) !== String(value)) continue;
      var before = toObj(t, t.rows[r]);
      Object.keys(changes).forEach(function (c) {
        if (!(c in t.idx)) throw new Error('Unknown column ' + name + '.' + c);
        t.rows[r][t.idx[c]] = changes[c] === null || changes[c] === undefined ? '' : changes[c];
      });
      t.sh.getRange(r + 2, 1, 1, t.head.length).setValues([t.rows[r]]);
      return { before: before, after: toObj(t, t.rows[r]) };
    }
    return null;
  }

  /** Updates the first row for which match(rowObject) is true. Returns {before, after} or null. */
  function updateWhere(name, match, changes) {
    var t = table(name);
    for (var r = 0; r < t.rows.length; r++) {
      if (!match(toObj(t, t.rows[r]))) continue;
      var before = toObj(t, t.rows[r]);
      Object.keys(changes).forEach(function (c) {
        if (!(c in t.idx)) throw new Error('Unknown column ' + name + '.' + c);
        t.rows[r][t.idx[c]] = changes[c] === null || changes[c] === undefined ? '' : changes[c];
      });
      t.sh.getRange(r + 2, 1, 1, t.head.length).setValues([t.rows[r]]);
      return { before: before, after: toObj(t, t.rows[r]) };
    }
    return null;
  }

  /** Replaces every data row (used for small lists such as Lists and Recipes). */
  function replaceAll(name, objs) {
    var t = table(name);
    var n = t.rows.length;
    if (n) t.sh.getRange(2, 1, n, t.head.length).clearContent();
    t.rows = [];
    append(name, objs);
  }

  function reset() { tables = {}; }

  return { all: all, raw: raw, find: find, column: column, append: append, update: update, updateWhere: updateWhere,
           replaceAll: replaceAll, reset: reset };
})();
