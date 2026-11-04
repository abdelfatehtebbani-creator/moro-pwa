/**
 * Finance.gs – what the accountant needs beyond the stock: the period closed for changes, and the data
 * of the losses that are not stock movements (returns decided damaged or expired, receipt differences lost).
 */
var Period = {
  /** The last closed day ('' = nothing closed). */
  closedUntil: function () { return String(Settings.get('closed_until', '') || ''); },

  /** Stops a change dated in the closed period: a correction is a new movement dated after it. */
  require: function (date) {
    var c = Period.closedUntil();
    Util.require(!c || !date || String(date).slice(0, 10) > c, 'period_closed', c);
  },

  /** The admin closes up to a date (or opens: ''). Audited, as it decides what may still change. */
  save: function (session, p) {
    var d = Util.clean(p.date);
    Util.require(d === '' || (/^\d{4}-\d{2}-\d{2}$/.test(d) && d <= Util.today()), 'close_date_invalid');
    return withLock(function () {
      var before = Period.closedUntil();
      Settings.set('closed_until', d);
      Audit.log(session.user_id, 'period_close', 'Settings', 'closed_until', before, d);
      return { closed_until: d, version: Version.bump() };
    });
  }
};

var Finance = {
  /** p: {from, to}. Losses kept outside the movements. */
  losses: function (session, p) {
    p = p || {};
    var inP = function (d) { d = String(d || '').slice(0, 10); return (!p.from || d >= p.from) && (!p.to || d <= p.to); };
    var returns = Repo.all('Returns').filter(function (r) { return r.status === 'resolved' && (r.decision === 'damaged' || r.decision === 'expired') && inP(r.decided_at); })
      .map(function (r) {
        return { date: String(r.decided_at).slice(0, 10), shop_party_id: r.shop_party_id, item_id: r.item_id, qty: -Number(r.qty), unit: r.unit,
          decision: r.decision, reason: r.reason, source: r.source, ref: r.return_id + (r.order_no ? ' / ' + r.order_no : '') };
      });
    var orders = {};
    Repo.all('Orders').forEach(function (o) { orders[o.order_id] = o; });
    var lost = [];
    Repo.all('OrderItems').forEach(function (x) {
      var o = orders[x.order_id];
      if (x.short_decision !== 'lost' || !o || !inP(o.received_at)) return;
      var s = Repo.all('ShopOrderLines').filter(function (l) { return l.order_item_id === x.order_id + '-' + x.line_no; })[0] || {};
      var q = Util.round((Number(s.handed_qty) || 0) - (Number(x.received_qty) || 0));
      if (q > 0) lost.push({ date: String(o.received_at).slice(0, 10), shop_party_id: o.shop_party_id, item_id: x.item_id, description: x.description || '',
        qty: -q, unit: x.unit, reason: x.short_reason, note: x.short_note || '', ref: o.order_no });
    });
    return { returns: returns, lost: lost };
  },

  /** p: {from, to}. The invoice lines of the period, for cost and margin (the costs are worked out in the app from the movements). */
  margin: function (session, p) {
    p = p || {};
    var inP = function (d) { return (!p.from || String(d) >= p.from) && (!p.to || String(d) <= p.to); };
    var inv = {};
    Repo.all('Invoices').forEach(function (v) { if (inP(v.date)) inv[v.invoice_id] = v; });
    var lines = Repo.all('InvoiceItems').filter(function (x) { return inv[x.invoice_id]; }).map(function (x) {
      var v = inv[x.invoice_id];
      return { date: v.date, invoice_no: v.invoice_no, shop_party_id: v.shop_party_id, item_id: x.item_id, description: x.description || '',
        section: x.section, qty: Number(x.qty), unit: x.unit, price: Number(x.price), amount: Number(x.amount) };
    });
    // the cash the cashiers collected in the period, per shop (declared when each shift ended)
    // (the approved daily sales sheet of a day, all channels; a day without one: the cash of its shifts)
    var takings = Sales.byShop(p.from, p.to);
    return { lines: lines, takings: takings,
      recipes: Repo.all('Recipes').map(function (r) { return { product: r.product, item_id: r.item_id, qty_per_unit: Number(r.qty_per_unit) }; }) };
  }
};

/**
 * Accounts: what each supplier is owed and what each shop owes, with the payments recorded here.
 *   supplier: receipts (net amount) less supplier returns less payments made → owed to the supplier;
 *   shop: invoices less payments received → owed by the shop.
 * A payment is never deleted: a mistake is voided (and stays in the history).
 */
var PAY_METHODS = ['cash', 'bank', 'cheque'];

var Accounts = {
  money: function (m) {
    var a = Number(m.final_amount !== '' && m.final_amount !== undefined ? m.final_amount : m.amount);
    if (!isNaN(a) && a) return Math.abs(a);
    return Math.abs(Number(m.qty) || 0) * (Number(m.price) || 0);
  },

  /** Every entry of a party, oldest first: {date, kind, ref, debit, credit} (debit raises what is owed to us). */
  entries: function (party) {
    var out = [];
    if (party.kind === 'supplier') {
      Repo.all('Movements').concat(Repo.all('Archive')).forEach(function (m) {
        if (m.party_id !== party.party_id || m.status === 'deleted') return;
        if (m.kind === 'RECEIPT') out.push({ date: m.date, kind: 'receipt', ref: m.doc_no, debit: 0, credit: Util.round(Accounts.money(m)) });
        if (m.kind === 'SUPPLIER_RETURN') out.push({ date: m.date, kind: 'supplier_return', ref: m.doc_no, debit: Util.round(Accounts.money(m)), credit: 0 });
      });
    } else {
      Repo.all('Invoices').forEach(function (v) {
        if (v.shop_party_id === party.party_id) out.push({ date: v.date, kind: 'invoice', ref: v.invoice_no + ' / ' + v.order_no, debit: Number(v.total), credit: 0 });
      });
    }
    Repo.all('Payments').forEach(function (x) {
      if (x.party_id !== party.party_id || x.status === 'void') return;
      var a = Number(x.amount);
      out.push({ date: x.date, kind: 'payment', ref: x.payment_id + (x.ref ? ' / ' + x.ref : '') + ' · ' + x.method, payment_id: x.payment_id,
        debit: party.kind === 'supplier' ? a : 0, credit: party.kind === 'supplier' ? 0 : a });
    });
    // receipts of one slip are one line: one supplier invoice
    var merged = [], key = {};
    out.forEach(function (e) {
      if (e.kind !== 'receipt' && e.kind !== 'supplier_return') { merged.push(e); return; }
      var k = e.kind + '|' + e.date + '|' + e.ref;
      if (key[k]) { key[k].debit = Util.round(key[k].debit + e.debit); key[k].credit = Util.round(key[k].credit + e.credit); return; }
      key[k] = e; merged.push(e);
    });
    return merged.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  },

  /** p: {party_id, from, to} → {party, opening, lines (with running balance), closing}. Balance > 0: they owe us; < 0: we owe them. */
  statement: function (session, p) {
    var party = Repo.find('Parties', 'party_id', p.party_id);
    Util.require(party && (party.kind === 'supplier' || party.kind === 'shop'), 'not_found');
    var opening = 0, bal, lines = [];
    Accounts.entries(party).forEach(function (e) {
      if (p.from && String(e.date) < p.from) { opening = Util.round(opening + e.debit - e.credit); return; }
      if (p.to && String(e.date) > p.to) return;
      lines.push(e);
    });
    bal = opening;
    lines.forEach(function (e) { bal = Util.round(bal + e.debit - e.credit); e.balance = bal; });
    return { party: { party_id: party.party_id, name: party.name, kind: party.kind }, opening: opening, lines: lines, closing: bal };
  },

  /** Every supplier and shop with its balance today. */
  balances: function () {
    return Repo.all('Parties').filter(function (x) { return x.kind === 'supplier' || x.kind === 'shop'; }).map(function (x) {
      var b = 0;
      Accounts.entries(x).forEach(function (e) { b = Util.round(b + e.debit - e.credit); });
      return { party_id: x.party_id, name: x.name, kind: x.kind, balance: b };
    }).filter(function (x) { return x.balance; });
  },

  /** p: {client_id, date, party_id, amount, method, ref, note}. */
  pay: function (session, p) {
    var party = Repo.find('Parties', 'party_id', p.party_id);
    Util.require(party && (party.kind === 'supplier' || party.kind === 'shop'), 'party_invalid');
    var a = Util.num(p.amount);
    Util.require(a !== null && a > 0, 'amount_invalid');
    Util.require(Util.isDate(p.date || ''), 'date_invalid');
    Period.require(p.date);
    Util.require(PAY_METHODS.indexOf(p.method) >= 0, 'method_required');
    var cid = Util.clean(p.client_id);
    Util.require(cid, 'client_id_required');
    return withLock(function () {
      var again = Repo.find('Payments', 'client_id', cid);
      if (again) return { payment: again, duplicate: true, version: Version.get() };
      var row = { payment_id: 'PY' + Util.pad(Settings.next('seq_payment', 0), 5), date: p.date, party_id: party.party_id, amount: Util.round(a),
        method: p.method, ref: Util.clean(p.ref), note: Util.clean(p.note), status: 'ok', created_by: session.user_id, created_at: Util.nowIso(),
        voided_by: '', voided_at: '', client_id: cid };
      Repo.append('Payments', [row]);
      Audit.log(session.user_id, 'payment_save', 'Payments', row.payment_id, null, row);
      return { payment: row, version: Version.bump() };
    });
  },

  void: function (session, p) {
    return withLock(function () {
      var x = Repo.find('Payments', 'payment_id', p.payment_id);
      Util.require(x && x.status !== 'void', 'not_found');
      Period.require(x.date);
      var res = Repo.update('Payments', 'payment_id', x.payment_id, { status: 'void', voided_by: session.user_id, voided_at: Util.nowIso() });
      Audit.log(session.user_id, 'payment_void', 'Payments', x.payment_id, res.before, res.after);
      return { payment: res.after, version: Version.bump() };
    });
  },

  /**
   * Purchase orders against what came in: for each approved LPO, the receipts of the same supplier and items
   * from its date until the next LPO of that supplier (receipts do not name their LPO: the match is by supplier, items and dates).
   */
  lpoMatch: function (session, p) {
    p = p || {};
    var lpos = Repo.all('LPOs').filter(function (l) { return l.status === 'approved'; })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var lines = {};
    Repo.all('LPOLines').forEach(function (x) { (lines[x.lpo_id] = lines[x.lpo_id] || []).push(x); });
    var recs = Repo.all('Movements').filter(function (m) { return m.kind === 'RECEIPT' && m.status !== 'deleted'; });
    return lpos.filter(function (l) { return (!p.from || String(l.date) >= p.from) && (!p.to || String(l.date) <= p.to); }).map(function (l) {
      var next = lpos.filter(function (x) { return x.party_id === l.party_id && String(x.date) > String(l.date); })[0];
      var until = next ? String(next.date) : '9999-12-31';
      var items = {};
      (lines[l.lpo_id] || []).forEach(function (x) { if (x.item_id) items[x.item_id] = true; });
      // a receipt naming this LPO is its own; a receipt naming none is matched by supplier, items and dates
      var named = recs.filter(function (m) { return String(m.lpo_no || '') === String(l.lpo_no); });
      var got = named.concat(recs.filter(function (m) { return !m.lpo_no && m.party_id === l.party_id && items[m.item_id] && String(m.date) >= String(l.date) && String(m.date) < until; }));
      var received = 0, docs = {};
      got.forEach(function (m) { received += Accounts.money(m); if (m.doc_no) docs[m.doc_no] = true; });
      return { lpo_no: l.lpo_no, date: l.date, party_id: l.party_id, ordered: Number(l.total) || 0, received: Util.round(received),
        invoices: Object.keys(docs).join(', '), lines: (lines[l.lpo_id] || []).length, exact: named.length === got.length && got.length > 0 };
    });
  }
};

/**
 * Takings: the cash each cashier says they collected in a shift (Shifts.amount, written when the shift ends),
 * and what the accountant received of it. The difference (short or over) stays with the shift.
 */
var Takings = {
  view: function (s) {
    var u = Repo.find('Users', 'user_id', s.user_id) || {};
    var got = s.received_amount === '' || s.received_amount === undefined ? '' : Number(s.received_amount);
    return { shift_id: s.shift_id, user_id: s.user_id, cashier: u.display_name || s.user_id, shop_party_id: s.shop_party_id,
      opened_at: s.opened_at, closed_at: s.closed_at, date: String(s.closed_at || '').slice(0, 10), amount: Number(s.amount) || 0, note: s.note || '',
      received_amount: got, received_at: s.received_at || '', received_note: s.received_note || '', received_action: s.received_action || '',
      diff: got === '' ? '' : Util.round(got - (Number(s.amount) || 0)) };
  },

  /** p: {from, to, waiting}. Closed shifts by closing date; waiting: not received yet (whatever their date). */
  list: function (session, p) {
    p = p || {};
    return Repo.all('Shifts').filter(function (s) {
      if (!s.closed_at) return false;
      if (p.waiting) return s.received_amount === '' || s.received_amount === undefined;
      var d = String(s.closed_at).slice(0, 10);
      return (!p.from || d >= p.from) && (!p.to || d <= p.to);
    }).map(Takings.view).sort(function (a, b) { return String(b.closed_at).localeCompare(String(a.closed_at)); });
  },

  /** The accountant received the cash of a shift. p: {shift_id, amount, note}. */
  receive: function (session, p) {
    var a = Util.num(p.amount);
    Util.require(a !== null && a >= 0, 'amount_invalid');
    var action = Util.clean(p.action);
    return withLock(function () {
      var s = Repo.find('Shifts', 'shift_id', p.shift_id);
      // a difference needs the action taken (asked the cashier, deducted, recounted…)
      Util.require(Util.round(a) === Util.round(Number(s && s.amount) || 0) || action, 'action_required');
      Util.require(s && s.closed_at, 'not_found');
      Util.require(s.received_amount === '' || s.received_amount === undefined, 'shift_received', s.shift_id);
      Period.require(Util.today());
      var res = Repo.update('Shifts', 'shift_id', s.shift_id, { received_amount: Util.round(a), received_by: session.user_id, received_at: Util.nowIso(),
        received_note: Util.clean(p.note), received_action: action });
      Audit.log(session.user_id, 'shift_receive', 'Shifts', s.shift_id, res.before, res.after);
      if (action) {
        var shop = (Repo.find('Parties', 'party_id', s.shop_party_id) || {}).name || s.shop_party_id;
        var d = Util.round(a - (Number(s.amount) || 0));
        OrderNotify.send(Push.usersWith('sales.decide'), session, 'accounts', ['فرق في مقبوضات نوبة', shop + ': ' + d + ' QR – ' + action],
          ['Difference in shift takings', shop + ': ' + d + ' QR – ' + action]);
      }
      return { shift: Takings.view(res.after), version: Version.bump() };
    });
  }
};
