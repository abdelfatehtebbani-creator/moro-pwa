/**
 * Util.gs – small shared helpers: errors, dates, numbers, text keys.
 */

/** An expected, user-facing failure. `code` is translated by the app (see app/i18n). */
function AppError(code, detail) {
  this.name = 'AppError';
  this.code = code;
  this.detail = detail || '';
  this.message = code + (detail ? ': ' + detail : '');
}
AppError.prototype = Object.create(Error.prototype);

var TZ = 'Asia/Qatar';

var Util = {
  today: function () {
    return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  },
  nowIso: function () {
    return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
  },
  /** 'YYYY-MM-DD' that is a real calendar date. */
  isDate: function (s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  },
  num: function (v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  },
  round: function (n) {
    return Math.round(Number(n) * 1e6) / 1e6;
  },
  /** Name key: trimmed, inner spaces collapsed, upper case – used for duplicate checks. */
  key: function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase();
  },
  clean: function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
  },
  pad: function (n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  },
  require: function (cond, code, detail) {
    if (!cond) throw new AppError(code, detail);
  }
};
