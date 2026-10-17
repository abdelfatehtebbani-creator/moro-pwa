/**
 * Shop.gs – shop orders coming from Masar (the cashiers' order system), their stock reservations,
 * and special purchase requests (items not in the catalogue).
 *
 * A Masar order line for a MORO item becomes one ShopOrderLines row. Its stock is reserved at once
 * (as much as is available); the rest is a shortage that the purchasing officer sees and that is
 * reserved automatically, oldest order first, when stock comes in. The storekeeper of the item's
 * store prepares it and hands it to distribution: that writes an ISSUE to the shop and tells Masar
 * the quantity handed (Masar reads changes with link.orders.status).
 *
 * Line status: open → partial → handed, or unavailable (cannot be supplied, with a reason), or cancelled.
 * available(item) = balance − reserved quantity of open/partial lines.
 */
var LINE_OPEN = ['open', 'partial'];

var Shop = {
  /** {item_id: reserved qty} of the lines still waiting. */
  reservedMap: function () {
    var m = {};
    Repo.all('ShopOrderLines').forEach(function (l) {
      if (LINE_OPEN.indexOf(l.status) < 0) return;
      var r = Number(l.reserved_qty) || 0;
      if (r) m[l.item_id] = Util.round((m[l.item_id] || 0) + r);
    });
    return m;
  },

  balance: function (itemId) {
    var b = Repo.find('Balances', 'item_id', itemId);
    return b ? Number(b.qty) || 0 : 0;
  },

  available: function (itemId, reserved) {
    var r = reserved || Shop.reservedMap();
    return Util.round(Shop.balance(itemId) - (r[itemId] || 0));
  },

  /** Still to hand (asked − handed) and still not covered (to hand − reserved) of a line. */
  left: function (l) { return Math.max(0, Util.round(Number(l.qty) - (Number(l.handed_qty) || 0))); },
  /** Approved by Masar's distribution manager. Before that the line is shown for information only (no reservation, no handing). */
  approved: function (l) { return l.approved !== false && l.approved !== 'FALSE'; },
  shortage: function (l) { return LINE_OPEN.indexOf(l.status) < 0 || !Shop.approved(l) ? 0 : Math.max(0, Util.round(Shop.left(l) - (Number(l.reserved_qty) || 0))); },

  /** Finds or creates the shop party for a Masar shop {id, name}. */
  shopParty: function (shop) {
    Util.require(shop && (shop.id || shop.name), 'shop_required');
    var ext = String(shop.id || '');
    var p = ext ? Repo.all('Parties').filter(function (x) { return x.kind === 'shop' && String(x.ext_id) === ext; })[0] : null;
    if (!p) p = Repo.all('Parties').filter(function (x) { return x.kind === 'shop' && Util.key(x.name) === Util.key(shop.name); })[0];
    if (p) {
      if (shop.name && Util.clean(shop.name) !== p.name && !Repo.all('Parties').some(function (x) { return x.party_id !== p.party_id && Util.key(x.name) === Util.key(shop.name); })) {
        Repo.update('Parties', 'party_id', p.party_id, { name: Util.clean(shop.name) });
      }
      return p.party_id;
    }
    var n = 0;
    Repo.column('Parties', 'party_id').forEach(function (id) { n = Math.max(n, Number(String(id).slice(1)) || 0); });
    var name = Util.clean(shop.name) || ext;
    if (Repo.all('Parties').some(function (x) { return Util.key(x.name) === Util.key(name); })) name = name + ' (' + ext + ')';
    var party = { party_id: 'P' + Util.pad(n + 1, 3), name: name, kind: 'shop', active: true, ext_id: ext };
    Repo.append('Parties', [party]);
    return party.party_id;
  },

  /** Gives free stock to waiting lines of these items, oldest first (after a receipt, a release, a cancel). */
  rebalance: function (itemIds) {
    var ids = {};
    (itemIds || []).forEach(function (id) { ids[id] = true; });
    var lines = Repo.all('ShopOrderLines').filter(function (l) { return ids[l.item_id] && Shop.shortage(l) > 0; })
      .sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); });
    if (!lines.length) return;
    var reserved = Shop.reservedMap();
    var now = Util.nowIso();
    lines.forEach(function (l) {
      var free = Util.round(Shop.balance(l.item_id) - (reserved[l.item_id] || 0));
      var give = Math.min(Shop.shortage(l), Math.max(0, free));
      if (give <= 0) return;
      reserved[l.item_id] = Util.round((reserved[l.item_id] || 0) + give);
      Repo.update('ShopOrderLines', 'line_id', l.line_id, { reserved_qty: Util.round((Number(l.reserved_qty) || 0) + give), updated_at: now });
    });
  },

  /**
   * From Masar: adds or updates order lines. lines: [{order_item_id, order_id, order_no, shop:{id,name}, item_id, qty, note}].
   * Sending the same order_item_id again updates its quantity (an order edit); nothing is duplicated.
   */
  push: function (lines) {
    Util.require(lines && lines.length && lines.length <= 300, 'nothing_to_save');
    return withLock(function () {
      var now = Util.nowIso();
      var out = [], touched = {};
      lines.forEach(function (src) {
        var oid = String(src.order_item_id || '');
        Util.require(oid, 'order_item_required');
        var item = Repo.find('Items', 'item_id', src.item_id);
        Util.require(item && item.active === true, 'item_unknown', src.item_id);
        var qty = Util.num(src.qty);
        Util.require(qty !== null && qty > 0, 'qty_invalid', oid);
        var cur = Repo.find('ShopOrderLines', 'order_item_id', oid);
        var approved = src.approved !== false;
        if (!cur) {
          var avail = approved ? Shop.available(item.item_id) : 0;
          var row = { line_id: 'SL' + Util.pad(Settings.next('seq_shopline', 0), 6), order_id: String(src.order_id || ''),
            order_no: Util.clean(src.order_no), order_item_id: oid, shop_party_id: Shop.shopParty(src.shop), item_id: item.item_id,
            qty: Util.round(qty), unit: item.unit, reserved_qty: Math.max(0, Math.min(Util.round(qty), avail)), handed_qty: 0,
            status: 'open', reason: '', note: Util.clean(src.note), created_at: now, updated_at: now, handed_by: '', handed_at: '',
            movement_ids: '', approved: approved };
          Repo.append('ShopOrderLines', [row]);
          out.push(Shop.view(row));
          return;
        }
        Util.require(cur.item_id === item.item_id, 'item_changed', oid);
        var wasApproved = Shop.approved(cur);
        if (LINE_OPEN.indexOf(cur.status) < 0 || (Util.round(qty) === Number(cur.qty) && wasApproved === approved)) { out.push(Shop.view(cur)); return; }
        // edit: never below what was already handed; a smaller line gives its extra reservation back
        var newQty = Math.max(Util.round(qty), Number(cur.handed_qty) || 0);
        var left = Util.round(newQty - (Number(cur.handed_qty) || 0));
        var res = Math.min(Number(cur.reserved_qty) || 0, left);
        var ch = { qty: newQty, reserved_qty: approved ? res : 0, approved: approved, updated_at: now, note: src.note !== undefined ? Util.clean(src.note) : cur.note };
        if (left <= 0) ch.status = 'handed';
        var after = Repo.update('ShopOrderLines', 'line_id', cur.line_id, ch).after;
        touched[item.item_id] = true;
        out.push(Shop.view(after));
      });
      Shop.rebalance(Object.keys(touched));
      Audit.log('masar', 'shop_orders_push', 'ShopOrderLines', '', null, { lines: lines.length });
      // the lines as they are after the reservation was spread
      out = out.map(function (v) { return Shop.view(Repo.find('ShopOrderLines', 'line_id', v.line_id)); });
      return { lines: out, version: Version.bump() };
    });
  },

  /** From Masar: an order (or some of its lines) cancelled. What was handed stays handed. */
  cancel: function (orderItemIds, reason) {
    return withLock(function () {
      var now = Util.nowIso(), touched = {}, n = 0;
      (orderItemIds || []).forEach(function (oid) {
        var l = Repo.find('ShopOrderLines', 'order_item_id', String(oid));
        if (!l || LINE_OPEN.indexOf(l.status) < 0) return;
        Repo.update('ShopOrderLines', 'line_id', l.line_id, { status: 'cancelled', reserved_qty: 0, reason: Util.clean(reason), updated_at: now });
        touched[l.item_id] = true; n++;
      });
      Shop.rebalance(Object.keys(touched));
      return { cancelled: n, version: n ? Version.bump() : Version.get() };
    });
  },

  view: function (l) {
    return { line_id: l.line_id, order_id: l.order_id, order_no: l.order_no, order_item_id: l.order_item_id, shop_party_id: l.shop_party_id,
      item_id: l.item_id, qty: Number(l.qty), unit: l.unit, reserved_qty: Number(l.reserved_qty) || 0, handed_qty: Number(l.handed_qty) || 0,
      shortage: Shop.shortage(l), status: l.status, approved: Shop.approved(l), reason: l.reason, note: l.note, created_at: l.created_at, updated_at: l.updated_at,
      handed_at: l.handed_at, returned_qty: Number(l.returned_qty) || 0, store: Stores.of(Repo.find('Items', 'item_id', l.item_id)) };
  },

  /**
   * For the app. Storekeepers see the lines of their stores; "shortage" (purchasing) sees every store.
   * p.status: 'open' (default) | 'shortage' | 'done'.
   */
  list: function (session, p) {
    p = p || {};
    var status = p.status || 'open';
    var allStores = status === 'shortage' && Perm.has(session, 'shop.shortage');
    var lines = Repo.all('ShopOrderLines').filter(function (l) {
      var store = Stores.of(Repo.find('Items', 'item_id', l.item_id));
      if (!allStores && (session.stores || []).indexOf(store) < 0) return false;
      if (status === 'open') return LINE_OPEN.indexOf(l.status) >= 0;
      if (status === 'shortage') return Shop.shortage(l) > 0;
      return LINE_OPEN.indexOf(l.status) < 0;
    });
    lines.sort(function (a, b) { return status === 'done' ? String(b.updated_at).localeCompare(String(a.updated_at)) : String(a.created_at).localeCompare(String(b.created_at)); });
    return lines.slice(0, Number(p.limit) || 500).map(Shop.view);
  },

  /**
   * Storekeeper hands lines to distribution. payload: {date, client_id, lines: [{line_id, qty}]}.
   * Writes one ISSUE per line to the shop (one slip per store), consumes the reservation.
   */
  hand: function (session, p) {
    var give = (p.lines || []).filter(function (x) { return Util.num(x.qty) > 0; });
    Util.require(give.length, 'nothing_to_save');
    var movs = [], plan = [];
    give.forEach(function (x) {
      var l = Repo.find('ShopOrderLines', 'line_id', x.line_id);
      Util.require(l && LINE_OPEN.indexOf(l.status) >= 0, 'not_found', x.line_id);
      Util.require(Shop.approved(l), 'not_approved', l.line_id);
      Stores.requireItem(session, l.item_id);
      var q = Util.round(Util.num(x.qty));
      Util.require(q <= Shop.left(l), 'qty_too_much', l.line_id);
      plan.push({ line: l, qty: q });
      movs.push({ client_id: (p.client_id || l.line_id) + '-' + l.line_id, kind: 'ISSUE', date: p.date || Util.today(),
        party_id: l.shop_party_id, item_id: l.item_id, qty: q, unit: l.unit, purpose: 'Shop order ' + (l.order_no || l.order_id) });
    });
    var saved = Movements.save(session, { movements: movs });
    return withLock(function () {
      var now = Util.nowIso(), touched = {};
      plan.forEach(function (x, i) {
        var s = saved.saved[i];
        if (s.duplicate) return;
        var l = Repo.find('ShopOrderLines', 'line_id', x.line.line_id);
        var handed = Util.round((Number(l.handed_qty) || 0) + x.qty);
        var res = Math.max(0, Util.round((Number(l.reserved_qty) || 0) - x.qty));
        var ids = String(l.movement_ids || '').split(' ').filter(String).concat([s.movement_id]).join(' ');
        Repo.update('ShopOrderLines', 'line_id', l.line_id, { handed_qty: handed, reserved_qty: res,
          status: handed >= Number(l.qty) ? 'handed' : 'partial', handed_by: session.user_id, handed_at: now, updated_at: now, movement_ids: ids });
        touched[l.item_id] = true;
      });
      Shop.rebalance(Object.keys(touched));
      return { saved: saved.saved, version: Version.bump() };
    });
  },

  /** Storekeeper: the rest of a line cannot be supplied (reason required). */
  unavailable: function (session, p) {
    var reason = Util.clean(p.reason);
    Util.require(reason, 'reason_required');
    return withLock(function () {
      var l = Repo.find('ShopOrderLines', 'line_id', p.line_id);
      Util.require(l && LINE_OPEN.indexOf(l.status) >= 0, 'not_found');
      Util.require(Shop.approved(l), 'not_approved', l.line_id);
      Stores.requireItem(session, l.item_id);
      var res = Repo.update('ShopOrderLines', 'line_id', l.line_id, { status: 'unavailable', reserved_qty: 0, reason: reason,
        handed_by: session.user_id, updated_at: Util.nowIso() });
      Audit.log(session.user_id, 'shop_line_unavailable', 'ShopOrderLines', l.line_id, null, { reason: reason });
      Shop.rebalance([l.item_id]);
      return { line: Shop.view(res.after), version: Version.bump() };
    });
  },

  /**
   * Storekeeper: goods handed to distribution but not sent come back to the store.
   * payload: {line_id, qty, reason, date, client_id}. Stock goes back up at once (a return from the shop);
   * Masar sees returned_qty on the line.
   */
  returnLine: function (session, p) {
    var reason = Util.clean(p.reason);
    Util.require(reason, 'reason_required');
    var l = Repo.find('ShopOrderLines', 'line_id', p.line_id);
    Util.require(l, 'not_found');
    Stores.requireItem(session, l.item_id);
    var q = Util.round(Util.num(p.qty) || 0);
    var can = Util.round((Number(l.handed_qty) || 0) - (Number(l.returned_qty) || 0));
    Util.require(q > 0 && q <= can, 'qty_too_much', l.line_id);
    var saved = Movements.save(session, { movements: [{ client_id: (p.client_id || l.line_id + '-r') + '-ret', kind: 'DEPT_RETURN',
      date: p.date || Util.today(), party_id: l.shop_party_id, item_id: l.item_id, qty: q, unit: l.unit,
      purpose: 'Not sent: ' + reason + ' (' + (l.order_no || l.order_id) + ')' }] });
    return withLock(function () {
      if (saved.saved[0].duplicate) return { line: Shop.view(l), version: Version.get() };
      var cur = Repo.find('ShopOrderLines', 'line_id', l.line_id);
      var ids = String(cur.movement_ids || '').split(' ').filter(String).concat([saved.saved[0].movement_id]).join(' ');
      var res = Repo.update('ShopOrderLines', 'line_id', l.line_id, { returned_qty: Util.round((Number(cur.returned_qty) || 0) + q),
        reason: reason, movement_ids: ids, updated_at: Util.nowIso() });
      Audit.log(session.user_id, 'shop_line_return', 'ShopOrderLines', l.line_id, null, { qty: q, reason: reason });
      Shop.rebalance([l.item_id]);
      return { line: Shop.view(res.after), version: Version.bump() };
    });
  },

  // ---------- special purchase requests (off-catalogue items Masar asks to buy)

  /** From Masar: {ext_id, order_id, order_no, shop:{id,name}, description, qty, unit, image}. Idempotent by ext_id. */
  pushSpecial: function (p) {
    Util.require(p && p.ext_id && Util.clean(p.description), 'description_required');
    return withLock(function () {
      var cur = Repo.find('SpecialRequests', 'ext_id', String(p.ext_id));
      if (cur) return { request: cur, version: Version.get() };
      var now = Util.nowIso();
      var row = { request_id: 'SR' + Util.pad(Settings.next('seq_special', 0), 5), ext_id: String(p.ext_id), order_id: String(p.order_id || ''),
        order_no: Util.clean(p.order_no), shop_party_id: p.shop ? Shop.shopParty(p.shop) : '', description: Util.clean(p.description),
        qty: Util.num(p.qty) || '', unit: Util.clean(p.unit).toUpperCase(), image: Util.clean(p.image), status: 'pending',
        decided_by: '', decided_at: '', comment: '', item_id: '', created_at: now, updated_at: now };
      Repo.append('SpecialRequests', [row]);
      return { request: row, version: Version.bump() };
    });
  },

  listSpecial: function (session, p) {
    var status = (p && p.status) || 'pending';
    return Repo.all('SpecialRequests').filter(function (r) { return status === 'all' || r.status === status; }).reverse();
  },

  /** Purchasing officer: approve (creates the item in the chosen store) or reject (comment required). */
  decideSpecial: function (session, p) {
    var r0 = Repo.find('SpecialRequests', 'request_id', p.request_id);
    Util.require(r0 && r0.status === 'pending', 'not_found');
    var comment = Util.clean(p.comment);
    var itemId = '';
    if (p.decision === 'approved') {
      // an item already in MORO, or a new one
      if (p.item_id) { Util.require(Repo.find('Items', 'item_id', p.item_id), 'item_unknown', p.item_id); itemId = p.item_id; }
      else itemId = Masters.saveItem(session, { name: p.name || r0.description, store: p.store, unit: p.unit || r0.unit || 'PC',
        image: r0.image, shop_orderable: true }).item.item_id;
    } else {
      Util.require(p.decision === 'rejected', 'decision_invalid');
      Util.require(comment, 'reason_required');
    }
    return withLock(function () {
      var res = Repo.update('SpecialRequests', 'request_id', r0.request_id, { status: p.decision, decided_by: session.user_id,
        decided_at: Util.nowIso(), comment: comment, item_id: itemId, updated_at: Util.nowIso() });
      Audit.log(session.user_id, 'special_' + p.decision, 'SpecialRequests', r0.request_id, null, { item_id: itemId });
      return { request: res.after, version: Version.bump() };
    });
  }
};
