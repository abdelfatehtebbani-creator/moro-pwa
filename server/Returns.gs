/**
 * Returns.gs – goods coming back from the shops, held in quarantine until the production manager decides.
 *
 * Two sources: the cashier returns goods (expired, damaged, not sold, a complaint…), and distribution
 * says a receipt difference came back to the store. Either way each item is one row of Returns, in
 * quarantine: it is not in the stock (it left it at the handover) until it is decided:
 *   available → back in the stock (a DEPT_RETURN movement from the shop), damaged or expired → stays out, recorded.
 * The shop chooses where it goes (dest): the factory ('', the production manager decides; what is fit waits for the
 * store to confirm what came in before it enters the stock) or a branch where a department works (Salwa: its manager
 * decides, and what is fit is back in its stock at once – the manager has it in hand).
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
        decided_by: '', decided_at: '', movement_id: '', created_by: session.user_id, created_at: now, client_id: clientId + '-' + (i + 1),
        dest: x.dest || '', received_qty: '', received_by: '', received_at: '', store_note: '' };
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
    // where the goods go: the factory, or a branch where a department works (Salwa)
    var dest = Util.clean(p.dest);
    Util.require(!dest || Shop.hostsDept(dest), 'return_dest_invalid');
    var rows = (p.lines || []).map(function (x) {
      var it = Repo.find('Items', 'item_id', x.item_id);
      Util.require(it, 'not_found', x.item_id);
      var q = Number(x.qty);
      Util.require(q > 0, 'qty_invalid', x.item_id);
      Util.require(RETURN_REASONS.indexOf(x.reason) >= 0, 'return_reason_required', x.item_id);
      var note = Util.clean(x.note);
      Util.require(x.reason !== 'other' || note, 'return_note_required', x.item_id);
      return { item_id: it.item_id, qty: q, unit: it.unit, reason: x.reason, note: note, dest: dest };
    });
    Util.require(rows.length, 'nothing_to_save');
    return withLock(function () {
      var again = Repo.all('Returns').filter(function (r) { return String(r.client_id).indexOf(cid + '-') === 0; });
      if (again.length) return { returns: again.map(Returns.view), duplicate: true, version: Version.get() };
      var made = Returns.add(session, shop, 'shop', cid, rows);
      Audit.log(session.user_id, 'return_create', 'Returns', made[0].return_id, null, { shop: shop, lines: made.map(function (r) { return [r.item_id, r.qty, r.reason]; }) });
      Returns.notifyNew(shop, made.length, session, dest);
      return { returns: made.map(Returns.view), version: Version.bump() };
    });
  },

  notifyNew: function (shop, n, session, dest) {
    var name = (Repo.find('Parties', 'party_id', shop) || {}).name || shop;
    if (dest) {
      // to a branch (Salwa): its manager checks it
      OrderNotify.send(Branches.managers(dest), session, 'returns', ['مرتجع إليك للفحص', name + ' – ' + n + ' صنف'], ['A return to check', name + ' – ' + n + ' item(s)']);
    } else {
      OrderNotify.send(Push.usersWith('returns.decide').filter(function (id) { return (Repo.find('Users', 'user_id', id) || {}).role !== 'branch_manager'; }),
        session, 'returns', ['مرتجع في الحجر', name + ' – ' + n + ' صنف للفحص'], ['Return in quarantine', name + ' – ' + n + ' item(s) to check']);
    }
    Branches.tell(shop, session, ['مرتجع من ' + name, n + ' صنف'], ['Return from ' + name, n + ' item(s)']);
  },

  /** Who decides a return: the production manager for the factory, the branch's manager for a branch (and the admin). */
  mayDecide: function (session, r) {
    if (r.dest) return session.role === 'admin' || (session.role === 'branch_manager' && Branches.of(session).indexOf(r.dest) >= 0);
    return Perm.has(session, 'returns.decide') && session.role !== 'branch_manager';
  },

  /** Who confirms a return sent back to the factory store: whoever takes returns into that store. */
  mayReceive: function (session, r) {
    if (!Perm.has(session, 'returns.receive') && session.role !== 'admin') return false;
    return session.role === 'admin' || Stores.allows(session, Stores.of(Repo.find('Items', 'item_id', r.item_id)), 'issue');
  },

  /**
   * Cashier: their shop's returns; who decides: the returns they decide; a storekeeper: what waits for their stores,
   * and what they confirmed. p.status: quarantine | to_store | resolved.
   */
  list: function (session, p) {
    p = p || {};
    var shop = Orders.shopOf(session);
    return Repo.all('Returns').filter(function (r) {
      var mine = (shop && r.shop_party_id === shop) || Returns.mayDecide(session, r)
        || ((r.status === 'to_store' || r.received_by === session.user_id) && Returns.mayReceive(session, r));
      if (!mine) return false;
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
      Util.require(Returns.mayDecide(session, r), 'forbidden');
      Util.require(RETURN_DECISIONS.indexOf(x.decision) >= 0, 'decision_required', r.return_id);
      return { r: r, decision: x.decision, note: Util.clean(x.note) };
    });
    // what is fit goes back into the stock: at a branch at once (its manager has it); at the factory once the store confirms
    var back = rows.filter(function (x) { return x.decision === 'available' && x.r.dest; }).map(function (x) {
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
        var toStore = x.decision === 'available' && !cur.dest;
        Repo.update('Returns', 'return_id', cur.return_id, { status: toStore ? 'to_store' : 'resolved', decision: x.decision, decision_note: x.note,
          decided_by: session.user_id, decided_at: now, movement_id: x.decision === 'available' && cur.dest ? (moved[cur.return_id] || '') : '' });
        if (toStore) Returns.tellStore(cur, session);
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

  /** The store an item goes back to is told: confirm what came in. */
  tellStore: function (r, session) {
    var store = Stores.of(Repo.find('Items', 'item_id', r.item_id));
    var it = Repo.find('Items', 'item_id', r.item_id) || {};
    var ids = Repo.all('Users').filter(function (u) {
      if (u.active !== true || u.developer === true || u.role === 'admin') return false;
      var s = Shop.sessionOf(u);
      return Perm.has(s, 'returns.receive') && Stores.allows(s, store, 'issue');
    }).map(function (u) { return u.user_id; });
    OrderNotify.send(ids, session, 'returns', ['مرتجع يعود إلى مخزنك', (it.name_ar || it.name || r.item_id) + ' – ' + r.qty + ' ' + r.unit + ': أكّد ما وصل'],
      ['A return comes back to your store', (it.name || r.item_id) + ' – ' + r.qty + ' ' + r.unit + ': confirm what came in']);
  },

  /**
   * The store confirms a return sent back to it: what came in enters the stock (a DEPT_RETURN movement from the shop);
   * what did not come is recorded short. p: {return_id, qty, note}.
   */
  receive: function (session, p) {
    var r = Repo.find('Returns', 'return_id', p.return_id);
    Util.require(r, 'not_found');
    if (r.status === 'resolved' && r.received_at) return { return: Returns.view(r), duplicate: true, version: Version.get() };
    Util.require(r.status === 'to_store', 'return_decided', r.return_id);
    Util.require(Returns.mayReceive(session, r), 'forbidden');
    var q = Util.num(p.qty);
    Util.require(q !== null && q >= 0 && q <= Number(r.qty), 'qty_invalid', r.return_id);
    q = Util.round(q);
    var note = Util.clean(p.note);
    Util.require(q === Util.round(Number(r.qty)) || note, 'reason_required');
    var saved = q > 0 ? Movements.save(session, { movements: [{ client_id: 'return-' + r.return_id, kind: 'DEPT_RETURN', date: Util.today(), party_id: r.shop_party_id,
      item_id: r.item_id, qty: q, unit: r.unit, purpose: 'Return confirmed by the store (' + r.return_id + (r.order_no ? ', ' + r.order_no : '') + ')' }] }, null, '_checked') : null;
    return withLock(function () {
      var cur = Repo.find('Returns', 'return_id', r.return_id);
      if (cur.status !== 'to_store') return { return: Returns.view(cur), duplicate: true, version: Version.get() };
      var now = Util.nowIso();
      var res = Repo.update('Returns', 'return_id', cur.return_id, { status: 'resolved', received_qty: q, received_by: session.user_id, received_at: now,
        store_note: note, movement_id: saved && saved.saved[0] ? saved.saved[0].movement_id : '' });
      Audit.log(session.user_id, 'return_receive', 'Returns', cur.return_id, res.before, res.after);
      if (q < Number(cur.qty)) {
        OrderNotify.send([cur.decided_by], session, 'returns', ['مرتجع وصل ناقصًا', cur.return_id + ': ' + q + ' / ' + cur.qty + ' – ' + note],
          ['A return came in short', cur.return_id + ': ' + q + ' / ' + cur.qty + ' – ' + note]);
      }
      return { return: Returns.view(res.after), version: Version.bump() };
    });
  },

  /** Returns waiting for this user: to decide, or to confirm in their store (the menu number). */
  waiting: function (session) {
    return Repo.all('Returns').filter(function (r) {
      return (r.status === 'quarantine' && Returns.mayDecide(session, r)) || (r.status === 'to_store' && Returns.mayReceive(session, r));
    }).length;
  }
};
