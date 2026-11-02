/**
 * Orders.gs – shop orders made in MORO (stage 1 of bringing Masar's order cycle into MORO).
 *
 *   The cashier of a shop (Users.shop) writes the order (draft) and sends it. It is for the next day.
 *   The distribution manager approves the quantities (may change or remove lines) or rejects the order.
 *   On approval each line becomes a ShopOrderLines row, the same lines the shop orders screen already
 *   works with: a final product goes to the department that makes it (Items.dept), other items to the
 *   storekeeper of their store. Each line is handed to distribution (an ISSUE to the shop) or marked
 *   "cannot be supplied" with a reason; the order is ready for distribution when all its lines are done.
 *
 * No prices anywhere in an order. Nothing is deleted: a draft is cancelled, an order is rejected.
 * Order status: draft → sent → approved (→ ready, worked out from its lines) | rejected | cancelled.
 */
var ORDER_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'cancelled'];

var Orders = {
  /** The shop of a cashier (the session's user row). */
  shopOf: function (session) {
    var u = Repo.find('Users', 'user_id', session.user_id);
    return u ? String(u.shop || '') : '';
  },

  /** Next day of a date (YYYY-MM-DD): a normal order is delivered the day after it is sent. */
  nextDay: function (iso) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  },

  /** Lines of an order (OrderItems), and how each stands in the shop order lines once approved. */
  view: function (o) {
    var items = Repo.all('OrderItems').filter(function (x) { return x.order_id === o.order_id; });
    var shop = {};
    Repo.all('ShopOrderLines').forEach(function (l) { if (l.order_id === o.order_id) shop[l.order_item_id] = l; });
    var lines = items.map(function (x) {
      var s = shop[o.order_id + '-' + x.line_no];
      return { line_no: Number(x.line_no), item_id: x.item_id, qty: Number(x.qty), unit: x.unit, approved_qty: x.approved_qty === '' ? '' : Number(x.approved_qty),
        status: s ? s.status : x.status, handed_qty: s ? Number(s.handed_qty) || 0 : 0, reason: s ? s.reason : '',
        received_qty: x.received_qty === '' || x.received_qty === undefined ? '' : Number(x.received_qty), short_reason: x.short_reason || '', short_note: x.short_note || '' };
    });
    var out = {};
    Object.keys(o).forEach(function (k) { out[k] = o[k]; });
    out.lines = lines;
    // approved and every line handed or not available: ready for distribution
    if (o.status === 'approved' && lines.length && lines.every(function (l) { return l.status !== 'open' && l.status !== 'partial'; })) out.status = 'ready';
    return out;
  },

  /** Cashier: their shop's orders; distribution (and admin): every shop's. p.status filters. */
  list: function (session, p) {
    p = p || {};
    var all = Perm.has(session, 'orders.approve');
    var shop = Orders.shopOf(session);
    return Repo.all('Orders').filter(function (o) {
      // a draft is only its writer's
      if (o.status === 'draft' && o.created_by !== session.user_id) return false;
      if (!all && (!shop || o.shop_party_id !== shop)) return false;
      return !p.status || o.status === p.status || (p.status === 'ready' && o.status === 'approved');
    }).reverse().map(Orders.view).filter(function (o) { return !p.status || o.status === p.status; }).slice(0, Number(p.limit) || 200);
  },

  /**
   * Cashier: writes a draft or changes it. p: {order_id?, client_id, note, lines: [{item_id, qty}], send}.
   * Every active item may be ordered; availability is only shown to the cashier, it does not stop the order.
   */
  save: function (session, p) {
    var shop = Orders.shopOf(session);
    Util.require(shop, 'cashier_no_shop');
    var lines = (p.lines || []).filter(function (l) { return Util.num(l.qty) > 0; });
    Util.require(lines.length, 'nothing_to_save');
    return withLock(function () {
      var cur = p.order_id ? Repo.find('Orders', 'order_id', p.order_id) : null;
      if (!cur && p.client_id) cur = Repo.find('Orders', 'client_id', p.client_id);
      if (cur) {
        Util.require(cur.shop_party_id === shop, 'forbidden', 'own_only');
        // a sent order is no longer the cashier's to change
        if (cur.status !== 'draft') return { order: Orders.view(cur), duplicate: true, version: Version.get() };
      }
      var now = Util.nowIso(), today = Util.today();
      var id = cur ? cur.order_id : 'O' + Util.pad(Settings.next('seq_order', 0), 5);
      var rows = lines.map(function (l, i) {
        var item = Repo.find('Items', 'item_id', l.item_id);
        Util.require(item && item.active === true, 'item_unknown', l.item_id);
        return { order_id: id, line_no: i + 1, item_id: item.item_id, qty: Util.round(Util.num(l.qty)), unit: item.unit, approved_qty: '', status: 'open' };
      });
      var send = p.send === true;
      var row = { shop_party_id: shop, status: send ? 'sent' : 'draft', order_date: today, delivery_date: Orders.nextDay(today),
        note: Util.clean(p.note), sent_at: send ? now : '', updated_at: now };
      if (cur) {
        Repo.update('Orders', 'order_id', id, row);
        Repo.replaceAll('OrderItems', Repo.all('OrderItems').filter(function (x) { return x.order_id !== id; }).concat(rows));
      } else {
        row.order_id = id; row.order_no = id; row.client_id = Util.clean(p.client_id); row.created_by = session.user_id; row.created_at = now;
        row.decided_by = ''; row.decided_at = ''; row.reason = '';
        Repo.append('Orders', [row]);
        Repo.append('OrderItems', rows);
      }
      Audit.log(session.user_id, send ? 'order_send' : 'order_save', 'Orders', id, null, { lines: rows.length });
      return { order: Orders.view(Repo.find('Orders', 'order_id', id)), version: Version.bump() };
    });
  },

  /** Cashier: cancels a draft (a sent order is decided by distribution). */
  cancel: function (session, p) {
    return withLock(function () {
      var o = Repo.find('Orders', 'order_id', p.order_id);
      Util.require(o && o.status === 'draft' && o.shop_party_id === Orders.shopOf(session), 'not_found');
      Repo.update('Orders', 'order_id', o.order_id, { status: 'cancelled', updated_at: Util.nowIso() });
      Audit.log(session.user_id, 'order_cancel', 'Orders', o.order_id, null, null);
      return { order_id: o.order_id, version: Version.bump() };
    });
  },

  /**
   * Distribution: approves a sent order, with the quantities to make (p.lines [{line_no, qty}]; 0 = removed;
   * a line not given keeps its quantity). The lines go to the shop order lines (departments and stores).
   */
  approve: function (session, p) {
    return withLock(function () {
      var o = Repo.find('Orders', 'order_id', p.order_id);
      Util.require(o && o.status === 'sent', 'not_found');
      var want = {};
      (p.lines || []).forEach(function (x) { want[Number(x.line_no)] = Util.num(x.qty); });
      var items = Repo.all('OrderItems').filter(function (x) { return x.order_id === o.order_id; });
      var now = Util.nowIso(), shopLines = [];
      items.forEach(function (x) {
        var q = Number(x.line_no) in want ? want[Number(x.line_no)] : Number(x.qty);
        Util.require(q !== null && q >= 0, 'qty_invalid', x.line_no);
        q = Util.round(q);
        Repo.updateWhere('OrderItems', function (r) { return r.order_id === o.order_id && Number(r.line_no) === Number(x.line_no); },
          { approved_qty: q, status: q > 0 ? 'open' : 'removed' });
        if (q > 0) shopLines.push({ order_item_id: o.order_id + '-' + x.line_no, item_id: x.item_id, qty: q, unit: x.unit });
      });
      Util.require(shopLines.length, 'nothing_to_save');
      Shop.addLines(o, shopLines, now);
      Shop.notifyNew(o, shopLines);
      Repo.update('Orders', 'order_id', o.order_id, { status: 'approved', decided_by: session.user_id, decided_at: now, updated_at: now });
      Audit.log(session.user_id, 'order_approve', 'Orders', o.order_id, null, { lines: shopLines.length });
      return { order: Orders.view(Repo.find('Orders', 'order_id', o.order_id)), version: Version.bump() };
    });
  },

  /** Distribution: rejects a sent order with a reason (the cashier sees it). */
  /**
   * Distribution accepts what was handed of an order being prepared and closes what is left (given in part,
   * or not given at all): the order goes on to the trips with what was handed. Nothing handed at all: the
   * order is closed as not supplied. p: {order_id, reason}.
   */
  closeShort: function (session, p) {
    var reason = Util.clean(p.reason) || 'Closed by distribution';
    return withLock(function () {
      var o = Repo.find('Orders', 'order_id', p.order_id);
      Util.require(o && o.status === 'approved', 'not_found');
      var now = Util.nowIso(), touched = {}, handed = 0;
      Repo.all('ShopOrderLines').forEach(function (l) {
        if (l.order_id !== o.order_id) return;
        handed += Number(l.handed_qty) || 0;
        if (l.status !== 'open' && l.status !== 'partial') return;
        Repo.update('ShopOrderLines', 'line_id', l.line_id, { status: Number(l.handed_qty) > 0 ? 'handed' : 'unavailable', reserved_qty: 0,
          reason: reason, updated_at: now });
        touched[l.item_id] = true;
      });
      Shop.rebalance(Object.keys(touched));
      var ch = { updated_at: now };
      if (!(handed > 0)) { ch.status = 'cancelled'; ch.reason = reason; }
      Repo.update('Orders', 'order_id', o.order_id, ch);
      Audit.log(session.user_id, 'order_close_short', 'Orders', o.order_id, null, { reason: reason, handed: handed });
      return { order: Orders.view(Repo.find('Orders', 'order_id', o.order_id)), version: Version.bump() };
    });
  },

  reject: function (session, p) {
    var reason = Util.clean(p.reason);
    Util.require(reason, 'reason_required');
    return withLock(function () {
      var o = Repo.find('Orders', 'order_id', p.order_id);
      Util.require(o && o.status === 'sent', 'not_found');
      var now = Util.nowIso();
      Repo.update('Orders', 'order_id', o.order_id, { status: 'rejected', reason: reason, decided_by: session.user_id, decided_at: now, updated_at: now });
      Audit.log(session.user_id, 'order_reject', 'Orders', o.order_id, null, { reason: reason });
      return { order_id: o.order_id, version: Version.bump() };
    });
  },

  /**
   * The cashier's shift: the shop they work in now (cashiers move between shops). A shop has one cashier
   * at a time: it is taken until that cashier ends the shift (or the admin clears it in the users screen).
   */
  shift: function (session, p) {
    return withLock(function () {
      var shop = String(p.shop || '');
      var party = Repo.find('Parties', 'party_id', shop);
      Util.require(party && party.kind === 'shop' && party.active === true, 'shop_invalid');
      var taken = Repo.all('Users').filter(function (x) { return x.user_id !== session.user_id && x.active === true && String(x.shop || '') === shop; })[0];
      Util.require(!taken, 'shop_taken', taken ? taken.display_name : '');
      Repo.update('Users', 'user_id', session.user_id, { shop: shop });
      Audit.log(session.user_id, 'shift_open', 'Users', session.user_id, null, { shop: shop });
      return { shop: shop, version: Version.bump() };
    });
  },

  shiftEnd: function (session) {
    return withLock(function () {
      var u = Repo.find('Users', 'user_id', session.user_id);
      Repo.update('Users', 'user_id', session.user_id, { shop: '' });
      Audit.log(session.user_id, 'shift_end', 'Users', session.user_id, null, { shop: u ? u.shop : '' });
      return { version: Version.bump() };
    });
  },

  /** Sent orders waiting for distribution (the badge). */
  pending: function () {
    return Repo.all('Orders').filter(function (o) { return o.status === 'sent'; }).length;
  }
};
