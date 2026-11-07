/**
 * Returns.gs – goods coming back from the shops, held in quarantine until the production manager decides.
 *
 * Two sources: the cashier returns goods (expired, damaged, not sold, a complaint…), and distribution
 * says a receipt difference came back to the store. Either way each item is one row of Returns, in
 * quarantine: it is not in the stock (it left it at the handover) until it is decided:
 *   available → back in the stock (a DEPT_RETURN movement from the shop), damaged or expired → stays out, recorded.
 */
var RETURN_REASONS = ['expired', 'damaged', 'unsold', 'complaint', 'other'];
var RETURN_DECISIONS = ['available', 'damaged', 'expired'];

var Returns = {
  view: function (r) {
    var out = {};
    Object.keys(r).forEach(function (k) { out[k] = r[k]; });
    out.qty = Number(r.qty);
    out.line_no = r.line_no === '' ? '' : Number(r.line_no);
    return out;
  },

  /** Rows for the quarantine (call inside the lock). rows: [{item_id, qty, unit, reason, note, order_id?, order_no?, line_no?}]. */
  add: function (session, shop, source, clientId, rows) {
    var now = Util.nowIso();
    var made = rows.map(function (x, i) {
      return { return_id: 'RT' + Util.pad(Settings.next('seq_return', 0), 5), date: Util.today(), shop_party_id: shop,
        order_id: x.order_id || '', order_no: x.order_no || '', line_no: x.line_no || '', item_id: x.item_id, qty: Util.round(x.qty),
        unit: x.unit, reason: x.reason, note: x.note || '', source: source, status: 'quarantine', decision: '', decision_note: '',
        decided_by: '', decided_at: '', movement_id: '', created_by: session.user_id, created_at: now, client_id: clientId + '-' + (i + 1) };
    });
    if (made.length) Repo.append('Returns', made);
    return made;
  },

  /** Cashier: their shop's goods back to the factory. p: {client_id, lines: [{item_id, qty, reason, note}]}. */
  create: function (session, p) {
    var shop = Orders.shopOf(session);
    Util.require(shop, 'cashier_no_shop');
    var cid = Util.clean(p.client_id);
    Util.require(cid, 'client_id_required');
    var rows = (p.lines || []).map(function (x) {
      var it = Repo.find('Items', 'item_id', x.item_id);
      Util.require(it, 'not_found', x.item_id);
      var q = Number(x.qty);
      Util.require(q > 0, 'qty_invalid', x.item_id);
      Util.require(RETURN_REASONS.indexOf(x.reason) >= 0, 'return_reason_required', x.item_id);
      var note = Util.clean(x.note);
      Util.require(x.reason !== 'other' || note, 'return_note_required', x.item_id);
      return { item_id: it.item_id, qty: q, unit: it.unit, reason: x.reason, note: note };
    });
    Util.require(rows.length, 'nothing_to_save');
    return withLock(function () {
      var again = Repo.all('Returns').filter(function (r) { return String(r.client_id).indexOf(cid + '-') === 0; });
      if (again.length) return { returns: again.map(Returns.view), duplicate: true, version: Version.get() };
      var made = Returns.add(session, shop, 'shop', cid, rows);
      Audit.log(session.user_id, 'return_create', 'Returns', made[0].return_id, null, { shop: shop, lines: made.map(function (r) { return [r.item_id, r.qty, r.reason]; }) });
      Returns.notifyNew(shop, made.length, session);
      return { returns: made.map(Returns.view), version: Version.bump() };
    });
  },

  notifyNew: function (shop, n, session) {
    var name = (Repo.find('Parties', 'party_id', shop) || {}).name || shop;
    OrderNotify.send(Push.usersWith('returns.decide'), session, 'returns',
      ['مرتجع في الحجر', name + ' – ' + n + ' صنف للفحص'], ['Return in quarantine', name + ' – ' + n + ' item(s) to check']);
    Branches.tell(shop, session, ['مرتجع من ' + name, n + ' صنف'], ['Return from ' + name, n + ' item(s)']);
  },

  /** Cashier: their shop's returns; the production manager: every shop's. p.status: quarantine | resolved. */
  list: function (session, p) {
    p = p || {};
    var all = Perm.has(session, 'returns.decide');
    var shop = Orders.shopOf(session);
    return Repo.all('Returns').filter(function (r) {
      if (!all && (!shop || r.shop_party_id !== shop)) return false;
      return !p.status || r.status === p.status;
    }).reverse().slice(0, Number(p.limit) || 300).map(Returns.view);
  },

  /** Production manager: the fate of each item in quarantine. p: {lines: [{return_id, decision, note}]}. */
  decide: function (session, p) {
    var want = (p.lines || []).filter(function (x) { return x && x.return_id; });
    Util.require(want.length, 'nothing_to_save');
    var rows = want.map(function (x) {
      var r = Repo.find('Returns', 'return_id', x.return_id);
      Util.require(r, 'not_found', x.return_id);
      Util.require(r.status === 'quarantine', 'return_decided', r.return_id);
      Util.require(RETURN_DECISIONS.indexOf(x.decision) >= 0, 'decision_required', r.return_id);
      return { r: r, decision: x.decision, note: Util.clean(x.note) };
    });
    // what is fit goes back into the stock: a return from the shop (its own lock; the client id keeps it once)
    var back = rows.filter(function (x) { return x.decision === 'available'; }).map(function (x) {
      return { client_id: 'return-' + x.r.return_id, kind: 'DEPT_RETURN', date: Util.today(), party_id: x.r.shop_party_id, item_id: x.r.item_id,
        qty: Number(x.r.qty), unit: x.r.unit, purpose: 'Return from quarantine (' + x.r.return_id + (x.r.order_no ? ', ' + x.r.order_no : '') + ')' };
    });
    if (back.length) Movements.save(session, { movements: back }, null, '_checked');
    return withLock(function () {
      var now = Util.nowIso();
      var moved = {};
      Repo.all('Movements').forEach(function (m) { if (String(m.client_id).indexOf('return-') === 0) moved[String(m.client_id).slice(7)] = m.movement_id; });
      var done = [];
      rows.forEach(function (x) {
        var cur = Repo.find('Returns', 'return_id', x.r.return_id);
        if (cur.status !== 'quarantine') return;
        Repo.update('Returns', 'return_id', cur.return_id, { status: 'resolved', decision: x.decision, decision_note: x.note,
          decided_by: session.user_id, decided_at: now, movement_id: x.decision === 'available' ? (moved[cur.return_id] || '') : '' });
        done.push(cur);
      });
      if (done.length) {
        Audit.log(session.user_id, 'return_decide', 'Returns', done[0].return_id, null, { lines: rows.map(function (x) { return [x.r.return_id, x.decision]; }) });
        var byShop = {};
        done.forEach(function (r) { byShop[r.shop_party_id] = (byShop[r.shop_party_id] || 0) + 1; });
        Object.keys(byShop).forEach(function (shop) {
          OrderNotify.send(OrderNotify.cashiers({ shop_party_id: shop, created_by: done[0].created_by }), session, 'returns',
            ['قرار المرتجعات', byShop[shop] + ' صنف فُحص'], ['Returns decided', byShop[shop] + ' item(s) checked']);
        });
      }
      return { returns: rows.map(function (x) { return Returns.view(Repo.find('Returns', 'return_id', x.r.return_id)); }), version: done.length ? Version.bump() : Version.get() };
    });
  },

  /** Items waiting in quarantine, for the production manager's menu number. */
  waiting: function (session) {
    if (!Perm.has(session, 'returns.decide')) return 0;
    return Repo.all('Returns').filter(function (r) { return r.status === 'quarantine'; }).length;
  }
};
