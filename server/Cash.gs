/**
 * Cash.gs – cash purchases (petty cash): the purchasing officer writes a daily sheet of what was paid in cash
 * (shop materials, expenses, payments to suppliers) and sends it to the admin, like an LPO.
 *
 * The cash in hand is a running balance: what the admin hands over (CashFloat) less every sent or
 * approved sheet. A rejected sheet gives its money back to the balance until it is sent again.
 * Materials bought in cash are received in stock as usual (receive screen); a sheet only records the payment.
 * Bank transfers are not part of a cash sheet.
 * Status: draft → submitted → approved | rejected (a draft or rejected sheet can be edited and sent again).
 */
var CASH_KINDS = ['material', 'expense', 'supplier'];

var Cash = {
  /** Cash in hand now: handed over − sheets sent or approved (excluding `except`, the sheet being written). */
  balance: function (except) {
    var inn = 0, out = 0;
    Repo.all('CashFloat').forEach(function (f) { inn += Number(f.amount) || 0; });
    Repo.all('CashSheets').forEach(function (s) { if (s.sheet_id !== except) out += Cash.spent(s); });
    return Util.round(inn - out);
  },

  /** What a sheet takes from the cash: its total while waiting, the approved lines once decided (0 for a draft or rejection). */
  spent: function (s) {
    if (s.status === 'submitted') return Number(s.total) || 0;
    if (s.status === 'approved') return Number(s.approved_total === '' || s.approved_total === undefined ? s.total : s.approved_total) || 0;
    return 0;
  },

  /** The cash history: every hand-over (+) and every sent sheet (−), oldest first, with the balance after each. */
  ledger: function (session) {
    var rows = [];
    Repo.all('CashFloat').forEach(function (f) {
      rows.push({ at: f.created_at, date: f.date, kind: 'float', ref: f.entry_id, note: f.note, by: f.created_by, amount: Number(f.amount) || 0 });
    });
    Repo.all('CashSheets').forEach(function (s) {
      var out = Cash.spent(s);
      if (out) rows.push({ at: s.submitted_at || s.created_at, date: s.date, kind: 'sheet', ref: s.sheet_id, status: s.status, note: s.note,
        by: s.created_by, amount: -out });
    });
    rows.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    var bal = 0;
    rows.forEach(function (r) { bal = Util.round(bal + r.amount); r.balance = bal; });
    return { rows: rows.reverse().slice(0, 500), balance: bal };
  },

  list: function (session, p) {
    var all = Repo.all('CashSheets').filter(function (s) { return s.status !== 'cancelled'; });
    if (!Perm.has(session, 'cash.decide')) all = all.filter(function (s) { return s.created_by === session.user_id; });
    if (p && p.status) all = all.filter(function (s) { return s.status === p.status; });
    all.sort(function (a, b) { return String(b.sheet_id).localeCompare(String(a.sheet_id)); });
    // names typed before (shops, who received the money, who asked): offered while typing
    var names = { payee: {}, paid_by: {}, requested_by: {} };
    Repo.all('CashLines').forEach(function (x) { Object.keys(names).forEach(function (k) { if (x[k]) names[k][x[k]] = true; }); });
    Object.keys(names).forEach(function (k) { names[k] = Object.keys(names[k]).sort(); });
    return { sheets: all.slice(0, 500), balance: Cash.balance(), names: names,
      floats: Repo.all('CashFloat').sort(function (a, b) { return String(b.entry_id).localeCompare(String(a.entry_id)); }).slice(0, 50) };
  },

  get: function (session, p) {
    var s = Repo.find('CashSheets', 'sheet_id', p.sheet_id);
    Util.require(s, 'not_found');
    Util.require(Perm.has(session, 'cash.decide') || s.created_by === session.user_id, 'forbidden');
    var lines = Repo.all('CashLines').filter(function (x) { return x.sheet_id === s.sheet_id; })
      .sort(function (a, b) { return Number(a.line) - Number(b.line); });
    return { sheet: s, lines: lines, balance: Cash.balance(s.sheet_id) };
  },

  /**
   * p: {sheet_id?, date, note, submit,
   *     lines: [{kind, party_id, payee, item_id, description, amount, paid_by, requested_by}]}
   * party_id: a supplier (required for a supplier payment); payee: a shop or person not in the list.
   */
  save: function (session, p) {
    var res = withLock(function () {
      var cur = p.sheet_id ? Repo.find('CashSheets', 'sheet_id', p.sheet_id) : null;
      if (p.sheet_id) {
        Util.require(cur, 'not_found');
        Util.require(cur.created_by === session.user_id || Perm.has(session, 'cash.decide'), 'forbidden');
        Util.require(cur.status === 'draft' || cur.status === 'rejected', 'lpo_locked');
      }
      Util.require(Util.isDate(String(p.date || '')), 'date_invalid');
      var lines = (p.lines || []).map(function (x, i) {
        var kind = CASH_KINDS.indexOf(x.kind) >= 0 ? x.kind : 'expense';
        var amount = Util.num(x.amount);
        Util.require(amount !== null && amount > 0, 'amount_invalid', i + 1);
        var party = x.party_id ? Repo.find('Parties', 'party_id', x.party_id) : null;
        if (x.party_id) Util.require(party && party.kind === 'supplier', 'party_not_supplier', i + 1);
        if (kind === 'supplier') Util.require(party, 'party_not_supplier', i + 1);
        var item = x.item_id ? Repo.find('Items', 'item_id', x.item_id) : null;
        var desc = Util.clean(x.description) || (item ? item.name : '');
        Util.require(desc, 'name_required', i + 1);
        return { line: i + 1, kind: kind, party_id: party ? party.party_id : '', payee: party ? '' : Util.clean(x.payee),
                 item_id: item ? item.item_id : '', description: desc, amount: Util.round(amount),
                 paid_by: Util.clean(x.paid_by), requested_by: Util.clean(x.requested_by), status: '', reject_note: '' };
      });
      Util.require(lines.length > 0, 'nothing_to_save');
      var total = Util.round(lines.reduce(function (s, x) { return s + x.amount; }, 0));
      var now = Util.nowIso();
      var row = { date: String(p.date), note: Util.clean(p.note), total: total, status: p.submit ? 'submitted' : 'draft',
        // the cash in hand when it was sent (printed as "cash on hand")
        opening: p.submit ? Cash.balance(cur ? cur.sheet_id : '') : '',
        submitted_at: p.submit ? now : '', decided_by: '', decided_at: '', decision_note: '', approved_total: '', updated_at: now };
      var id;
      if (cur) {
        id = cur.sheet_id;
        Repo.update('CashSheets', 'sheet_id', id, row);
        var keep = Repo.all('CashLines').filter(function (x) { return x.sheet_id !== id; });
        Repo.replaceAll('CashLines', keep.concat(lines.map(function (x) { x.sheet_id = id; return x; })));
      } else {
        var n = 0;
        Repo.column('CashSheets', 'sheet_id').forEach(function (v) { n = Math.max(n, Number(String(v).slice(2)) || 0); });
        id = 'PC' + Util.pad(n + 1, 4);
        row.sheet_id = id; row.created_by = session.user_id; row.created_at = now;
        Repo.append('CashSheets', [row]);
        Repo.append('CashLines', lines.map(function (x) { x.sheet_id = id; return x; }));
      }
      Audit.log(session.user_id, p.submit ? 'cash_submit' : 'cash_save', 'CashSheets', id, cur, { total: total, lines: lines.length });
      return { sheet_id: id, status: row.status, total: total, version: Version.bump() };
    });
    if (p.submit) Notify.cashSubmitted(res.sheet_id, p.date, res.total, session);
    return res;
  },

  /** The admin: approve or reject (with a reason) a sent sheet. */
  decide: function (session, p) {
    var out = withLock(function () {
      var s = Repo.find('CashSheets', 'sheet_id', p.sheet_id);
      Util.require(s, 'not_found');
      Util.require(s.status === 'submitted', 'lpo_not_submitted');
      var ok = p.approve === true;
      if (!ok) Util.require(Util.clean(p.note), 'reason_required');
      // approving, the admin may refuse single lines, each with its reason: they are not paid from the cash
      var refused = {};
      (ok ? p.rejected_lines || [] : []).forEach(function (r) {
        Util.require(Util.clean(r.note), 'reason_required', r.line);
        refused[String(r.line)] = Util.clean(r.note);
      });
      var lines = Repo.all('CashLines').filter(function (x) { return x.sheet_id === s.sheet_id; });
      var kept = lines.filter(function (x) { return !refused[String(x.line)]; });
      if (ok) Util.require(kept.length > 0, 'cash_all_rejected');
      if (Object.keys(refused).length) {
        var others = Repo.all('CashLines').filter(function (x) { return x.sheet_id !== s.sheet_id; });
        Repo.replaceAll('CashLines', others.concat(lines.map(function (x) {
          var note = refused[String(x.line)];
          x.status = note ? 'rejected' : ''; x.reject_note = note || '';
          return x;
        })));
      }
      var approved = Util.round(kept.reduce(function (sum, x) { return sum + (Number(x.amount) || 0); }, 0));
      var res = Repo.update('CashSheets', 'sheet_id', s.sheet_id, { status: ok ? 'approved' : 'rejected', decided_by: session.user_id,
        decided_at: Util.nowIso(), decision_note: Util.clean(p.note), approved_total: ok ? approved : '', updated_at: Util.nowIso() });
      Audit.log(session.user_id, ok ? 'cash_approve' : 'cash_reject', 'CashSheets', s.sheet_id, res.before, res.after);
      return { sheet: s, ok: ok, status: res.after.status, version: Version.bump() };
    });
    Notify.cashDecided(out.sheet, out.ok, Util.clean(p.note), session, (p.rejected_lines || []).length);
    return { status: out.status, version: out.version };
  },

  remove: function (session, p) {
    return withLock(function () {
      var s = Repo.find('CashSheets', 'sheet_id', p.sheet_id);
      Util.require(s, 'not_found');
      Util.require(s.created_by === session.user_id || Perm.has(session, 'cash.decide'), 'forbidden');
      Util.require(s.status === 'draft' || s.status === 'rejected', 'lpo_locked');
      Repo.update('CashSheets', 'sheet_id', s.sheet_id, { status: 'cancelled', updated_at: Util.nowIso() });
      Audit.log(session.user_id, 'cash_cancel', 'CashSheets', s.sheet_id, s, null);
      return { version: Version.bump() };
    });
  },

  /** The admin hands over cash (or takes some back with a negative amount): p {date, amount, note}. */
  addFloat: function (session, p) {
    var res = withLock(function () {
      Util.require(Util.isDate(String(p.date || '')), 'date_invalid');
      var amount = Util.num(p.amount);
      Util.require(amount !== null && amount !== 0, 'amount_invalid');
      var n = 0;
      Repo.column('CashFloat', 'entry_id').forEach(function (v) { n = Math.max(n, Number(String(v).slice(1)) || 0); });
      var row = { entry_id: 'F' + Util.pad(n + 1, 4), date: String(p.date), amount: Util.round(amount), note: Util.clean(p.note),
                  created_by: session.user_id, created_at: Util.nowIso() };
      Repo.append('CashFloat', [row]);
      Audit.log(session.user_id, 'cash_float', 'CashFloat', row.entry_id, null, row);
      return { row: row, balance: Cash.balance(), version: Version.bump() };
    });
    Notify.cashFloat(res.row, res.balance, session);
    return { balance: res.balance, version: res.version };
  }
};
