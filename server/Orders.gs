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
// a special order (Orders.kind): the customer's date, time and place, and lines described by the cashier
// (OrderItems.description, with a price and photos) that the production manager sends to a department
var PLACES = ['shop', 'customer'];
var PURCHASE = 'PURCHASE';
var DIFF_DECISIONS = ['returned', 'lost'];

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
    var items = Repo.groupBy('OrderItems', 'order_id')[o.order_id] || [];
    var shop = {};
    (Repo.groupBy('ShopOrderLines', 'order_id')[o.order_id] || []).forEach(function (l) { shop[l.order_item_id] = l; });
    var lines = items.map(function (x) {
      var s = shop[o.order_id + '-' + x.line_no];
      var direct = !!(s && s.direct === true);
      return { line_no: Number(x.line_no), item_id: x.item_id, qty: Number(x.qty), unit: x.unit, approved_qty: x.approved_qty === '' ? '' : Number(x.approved_qty),
        status: s ? s.status : x.status, handed_qty: s ? Number(s.handed_qty) || 0 : 0, reason: s ? s.reason : '',
        received_qty: x.received_qty === '' || x.received_qty === undefined ? '' : Number(x.received_qty), short_reason: x.short_reason || '', short_note: x.short_note || '',
        short_decision: x.short_decision || '', description: x.description || '', price: x.price === '' || x.price === undefined ? '' : Number(x.price),
        dept: x.dept || '', photos: String(x.photos || '').split(' ').filter(String), purchase: x.purchase || '', direct: direct };
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
    var all = Perm.has(session, 'orders.approve') || Perm.has(session, 'orders.route');
    var specialOnly = !Perm.has(session, 'orders.approve') && Perm.has(session, 'orders.route');
    var shop = Orders.shopOf(session);
    return Repo.all('Orders').filter(function (o) {
      if (specialOnly && o.kind !== 'special') return false;
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
    var special = p.kind === 'special';
    var sp = {};
    if (special) {
      sp = { customer_name: Util.clean(p.customer_name), customer_phone: Util.clean(p.customer_phone), delivery_date: Util.clean(p.delivery_date),
        delivery_time: Util.clean(p.delivery_time), place: PLACES.indexOf(p.place) >= 0 ? p.place : '', address: Util.clean(p.address) };
      Util.require(sp.customer_name, 'customer_required');
      Util.require(/^\d{4}-\d{2}-\d{2}$/.test(sp.delivery_date) && sp.delivery_date >= Util.today(), 'delivery_date_invalid');
      Util.require(/^\d{2}:\d{2}$/.test(sp.delivery_time), 'delivery_time_required');
      Util.require(sp.place, 'place_required');
      Util.require(sp.place === 'shop' || (sp.address && sp.customer_phone), 'address_required');
    }
    lines.forEach(function (l) {
      if (l.item_id) return;
      Util.require(special, 'item_unknown', '');
      Util.require(Util.clean(l.description), 'description_required');
      var pr = Util.num(l.price);
      Util.require(pr !== null && pr >= 0, 'price_required', Util.clean(l.description));
      Util.require((l.photos || []).length + (l.photo_ids || []).length <= 3, 'photo_invalid');
    });
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
      // photos kept from the draft are this order's own; new ones are saved now
      var own = {};
      Repo.all('OrderItems').forEach(function (x) { if (x.order_id === id) String(x.photos || '').split(' ').filter(String).forEach(function (ph) { own[ph] = true; }); });
      var rows = lines.map(function (l, i) {
        if (!l.item_id) {
          var keep = (l.photo_ids || []).filter(function (ph) { return own[ph]; });
          return { order_id: id, line_no: i + 1, item_id: '', qty: Util.round(Util.num(l.qty)), unit: Util.clean(l.unit).toUpperCase() || 'PC', approved_qty: '',
            status: 'open', description: Util.clean(l.description), price: Util.round(Util.num(l.price)), dept: '',
            photos: keep.concat(Photos.add(session, id, l.photos)).join(' ') };
        }
        var item = Repo.find('Items', 'item_id', l.item_id);
        Util.require(item && item.active === true, 'item_unknown', l.item_id);
        return { order_id: id, line_no: i + 1, item_id: item.item_id, qty: Util.round(Util.num(l.qty)), unit: item.unit, approved_qty: '', status: 'open' };
      });
      var send = p.send === true;
      var row = { shop_party_id: shop, status: send ? 'sent' : 'draft', order_date: today, delivery_date: special ? sp.delivery_date : Orders.nextDay(today),
        note: Util.clean(p.note), sent_at: send ? now : '', updated_at: now, kind: special ? 'special' : '',
        customer_name: sp.customer_name || '', customer_phone: sp.customer_phone || '', delivery_time: sp.delivery_time || '', place: sp.place || '', address: sp.address || '' };
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
      // the lines a branch makes (Salwa) go straight to that branch, in an order of their own
      if (send && !special) Orders.splitBranch(session, id);
      var sentNow = Repo.find('Orders', 'order_id', id);
      if (send && sentNow.status === 'sent') OrderNotify.sent(sentNow, session);
      return { order: Orders.view(Repo.find('Orders', 'order_id', id)), version: Version.bump() };
    });
  },

  /**
   * A sent order (inside the lock): the lines of products made in a branch (a department working in a shop, Salwa)
   * go to that branch in an order of their own (No. 1045-S), approved at once – the branch prepares it and sends
   * it with a driver, without distribution. An order made of such lines only is that branch's order itself.
   */
  splitBranch: function (session, id) {
    var o = Repo.find('Orders', 'order_id', id);
    var items = Repo.all('OrderItems').filter(function (x) { return x.order_id === id; });
    var at = {}, places = [];
    items.forEach(function (x) {
      var it = x.item_id ? Repo.find('Items', 'item_id', x.item_id) : null;
      var d = it && it.dept ? Repo.find('Parties', 'party_id', it.dept) : null;
      var s = d && d.at_shop && d.active === true ? String(d.at_shop) : '';
      if (!at[s]) { at[s] = []; if (s) places.push(s); }
      at[s].push(x);
    });
    if (!places.length) return [];
    var made = [], keep = at[''] || [], moved = [], now = Util.nowIso();
    places.forEach(function (s, k) {
      if (!keep.length && k === 0) {
        // nothing of it is made at the factory: the order is the branch's own
        Repo.update('Orders', 'order_id', id, { made_at: s, updated_at: now });
        keep = at[s];
        made.push(id);
        return;
      }
      var cid = 'O' + Util.pad(Settings.next('seq_order', 0), 5);
      var no = o.order_no + '-S' + (made.length && places.length > 1 ? String(k + 1) : '');
      Repo.append('Orders', [{ order_id: cid, order_no: no, client_id: '', shop_party_id: o.shop_party_id, status: 'sent', order_date: o.order_date,
        delivery_date: o.delivery_date, note: o.note, created_by: o.created_by, created_at: o.created_at, sent_at: o.sent_at, decided_by: '', decided_at: '',
        reason: '', updated_at: now, kind: '', made_at: s, parent_id: id }]);
      at[s].forEach(function (x, i) { moved.push(Object.assign({}, x, { order_id: cid, line_no: i + 1 })); });
      made.push(cid);
    });
    if (moved.length) {
      var rest = keep.map(function (x, i) { return Object.assign({}, x, { line_no: i + 1 }); });
      Repo.replaceAll('OrderItems', Repo.all('OrderItems').filter(function (x) { return x.order_id !== id; }).concat(rest).concat(moved));
    }
    made.forEach(function (bid) {
      var b = Repo.find('Orders', 'order_id', bid);
      Audit.log(session.user_id, 'order_branch', 'Orders', bid, null, { made_at: b.made_at, from: id });
      Orders.decide(session, b, [], {});
    });
    return made;
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
      Util.require(o, 'not_found');
      Util.require(o.status === 'sent', 'order_decided', o.status);
      Util.require(o.kind !== 'special', 'special_needs_route');
      return Orders.decide(session, o, p.lines, {});
    });
  },

  /**
   * Production manager: a special order is approved by sending each described line to the department
   * that makes it, or to purchasing (bought ready-made). p: {order_id, lines: [{line_no, dept, qty?}]}.
   */
  route: function (session, p) {
    return withLock(function () {
      var o = Repo.find('Orders', 'order_id', p.order_id);
      Util.require(o, 'not_found');
      Util.require(o.kind === 'special', 'not_found');
      Util.require(o.status === 'sent', 'order_decided', o.status);
      var depts = {};
      (p.lines || []).forEach(function (x) { if (x.dept) depts[Number(x.line_no)] = String(x.dept); });
      Repo.all('OrderItems').forEach(function (x) {
        if (x.order_id !== o.order_id || x.item_id) return;
        var d = depts[Number(x.line_no)];
        var party = d && d !== PURCHASE ? Repo.find('Parties', 'party_id', d) : null;
        Util.require(d === PURCHASE || (party && party.active === true && party.kind === 'section'), 'dept_required', x.line_no);
      });
      return Orders.decide(session, o, p.lines, depts);
    });
  },

  /** Approves (inside the lock): the quantities, and for a special line its department. */
  decide: function (session, o, lineList, depts) {
      var want = {};
      (lineList || []).forEach(function (x) { if (x.qty !== undefined && x.qty !== '') want[Number(x.line_no)] = Util.num(x.qty); });
      var items = Repo.all('OrderItems').filter(function (x) { return x.order_id === o.order_id; });
      var now = Util.nowIso(), shopLines = [];
      var deadline = o.kind === 'special' ? String(o.delivery_date || '') + (o.delivery_time ? ' ' + o.delivery_time : '') : '';
      items.forEach(function (x) {
        var q = Number(x.line_no) in want ? want[Number(x.line_no)] : Number(x.qty);
        Util.require(q !== null && q >= 0, 'qty_invalid', x.line_no);
        q = Util.round(q);
        var ch = { approved_qty: q, status: q > 0 ? 'open' : 'removed' };
        if (!x.item_id) ch.dept = depts[Number(x.line_no)] || '';
        Repo.updateWhere('OrderItems', function (r) { return r.order_id === o.order_id && Number(r.line_no) === Number(x.line_no); }, ch);
        if (q > 0) shopLines.push({ order_item_id: o.order_id + '-' + x.line_no, item_id: x.item_id, qty: q, unit: x.unit,
          description: x.item_id ? '' : x.description, dept: x.item_id ? '' : ch.dept, deadline: deadline });
      });
      Util.require(shopLines.length, 'nothing_to_save');
      Shop.addLines(o, shopLines, now);
      Shop.notifyNew(o, shopLines);
      Repo.update('Orders', 'order_id', o.order_id, { status: 'approved', decided_by: session.user_id, decided_at: now, updated_at: now });
      Audit.log(session.user_id, o.kind === 'special' ? 'order_route' : 'order_approve', 'Orders', o.order_id, null, { lines: shopLines.length, depts: depts });
      OrderNotify.decided(o, true, '', session);
      return { order: Orders.view(Repo.find('Orders', 'order_id', o.order_id)), version: Version.bump() };
  },

  /**
   * Distribution accepts what was handed of an order being prepared and closes what is left (given in part,
   * or not given at all): the order goes on to the trips with what was handed. Nothing handed at all: the
   * order is closed as not supplied. p: {order_id, reason}.
   */
  closeShort: function (session, p) {
    var reason = Util.clean(p.reason) || 'Closed by distribution';
    return withLock(function () {
      var o = Repo.find('Orders', 'order_id', p.order_id);
      Util.require(o, 'not_found');
      Util.require(o.status === 'approved', 'order_decided', o.status);
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
      OrderNotify.closed(Repo.find('Orders', 'order_id', o.order_id), reason, session);
      OrderNotify.lines([{ order_id: o.order_id }], session);
      return { order: Orders.view(Repo.find('Orders', 'order_id', o.order_id)), version: Version.bump() };
    });
  },

  /** Distribution: rejects a sent order with a reason (the cashier sees it). */
  /**
   * Distribution accepts the difference of an order received short: for each short line, where the missing
   * quantity went – 'returned' (a loading error, the goods are still here: they come back to the store) or
   * 'lost' (damaged or lost on the way: the shop is not charged, the loss stays with distribution).
   * Then the order can be invoiced. p: {order_id, lines: [{line_no, decision}]}.
   */
  acceptDiff: function (session, p) {
    var o0 = Repo.find('Orders', 'order_id', p.order_id);
    Util.require(o0, 'not_found');
    Util.require(o0.status === 'received' && o0.diff_status === 'pending', 'order_decided', o0.status);
    var want = {};
    (p.lines || []).forEach(function (x) { want[Number(x.line_no)] = x.decision; });
    var short = Orders.view(o0).lines.filter(function (l) { return l.short_reason; });
    short.forEach(function (l) { Util.require(DIFF_DECISIONS.indexOf(want[l.line_no]) >= 0, 'decision_required', l.line_no); });
    // what came back to the store goes to the quarantine first: the production manager decides if it is fit
    var back = short.filter(function (l) { return want[l.line_no] === 'returned'; }).map(function (l) {
      return { order_id: o0.order_id, order_no: o0.order_no, line_no: l.line_no, item_id: l.item_id,
        qty: Util.round(l.handed_qty - Number(l.received_qty)), unit: l.unit, reason: l.short_reason, note: l.short_note };
    }).filter(function (x) { return x.qty > 0 && x.item_id; });
    return withLock(function () {
      var o = Repo.find('Orders', 'order_id', o0.order_id);
      if (o.diff_status !== 'pending') return { order: Orders.view(o), duplicate: true, version: Version.get() };
      if (back.length) { Returns.add(session, o.shop_party_id, 'diff', o.order_id + '-diff', back); Returns.notifyNew(o.shop_party_id, back.length, session); }
      short.forEach(function (l) {
        Repo.updateWhere('OrderItems', function (r) { return r.order_id === o.order_id && Number(r.line_no) === l.line_no; }, { short_decision: want[l.line_no] });
      });
      var now = Util.nowIso();
      Repo.update('Orders', 'order_id', o.order_id, { diff_status: 'accepted', diff_by: session.user_id, diff_at: now, updated_at: now });
      Audit.log(session.user_id, 'order_diff_accept', 'Orders', o.order_id, null, { lines: short.map(function (l) { return [l.line_no, want[l.line_no]]; }) });
      OrderNotify.invoiceReady(o, session);
      return { order: Orders.view(Repo.find('Orders', 'order_id', o.order_id)), version: Version.bump() };
    });
  },

  reject: function (session, p) {
    var reason = Util.clean(p.reason);
    Util.require(reason, 'reason_required');
    return withLock(function () {
      var o = Repo.find('Orders', 'order_id', p.order_id);
      Util.require(o, 'not_found');
      Util.require(o.status === 'sent', 'order_decided', o.status);
      Util.require(Perm.has(session, o.kind === 'special' ? 'orders.route' : 'orders.approve') || Perm.has(session, 'orders.approve'), 'forbidden');
      var now = Util.nowIso();
      Repo.update('Orders', 'order_id', o.order_id, { status: 'rejected', reason: reason, decided_by: session.user_id, decided_at: now, updated_at: now });
      Audit.log(session.user_id, 'order_reject', 'Orders', o.order_id, null, { reason: reason });
      OrderNotify.decided(o, false, reason, session);
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
      Util.require(!taken || p.takeover === true, 'shop_taken', taken ? taken.display_name : '');
      var now = Util.nowIso();
      if (taken) {
        // the shift the other cashier left open (signed out without ending it): closed now, its amount not declared –
        // the accountant writes what was received, with the action taken
        var open = Repo.all('Shifts').filter(function (s) { return s.user_id === taken.user_id && s.shop_party_id === shop && !s.closed_at; }).pop();
        if (open) Repo.update('Shifts', 'shift_id', open.shift_id, { closed_at: now, amount: '', note: 'Left open: closed when ' + session.user_id + ' took the shop', closed_by: session.user_id });
        Repo.update('Users', 'user_id', taken.user_id, { shop: '' });
        Audit.log(session.user_id, 'shift_takeover', 'Users', taken.user_id, null, { shop: shop, shift: open ? open.shift_id : '' });
        OrderNotify.send([taken.user_id].concat(Push.usersWith('shifts.receive')), session, 'accounts',
          ['نوبة أُغلقت دون مبلغ', party.name + ': ' + taken.display_name + ' لم يُنهِ نوبته'], ['A shift closed without its amount', party.name + ': ' + taken.display_name + ' did not end the shift']);
        Branches.tell(shop, session, ['نوبة أُغلقت دون مبلغ', party.name + ': ' + taken.display_name + ' لم يُنهِ نوبته'], ['A shift closed without its amount', party.name + ': ' + taken.display_name + ' did not end the shift']);
      }
      Repo.update('Users', 'user_id', session.user_id, { shop: shop });
      Repo.append('Shifts', [{ shift_id: 'SH' + Util.pad(Settings.next('seq_shift', 0), 5), user_id: session.user_id, shop_party_id: shop,
        opened_at: Util.nowIso(), closed_at: '', amount: '', note: '', closed_by: '', client_id: '' }]);
      Audit.log(session.user_id, 'shift_open', 'Users', session.user_id, null, { shop: shop });
      return { shop: shop, version: Version.bump() };
    });
  },

  /** The cashier ends the shift with the amount collected in it. p: {amount, note}. */
  shiftEnd: function (session, p) {
    p = p || {};
    var amount = Util.num(p.amount);
    Util.require(amount !== null && amount >= 0, 'shift_amount_required');
    return withLock(function () {
      var u = Repo.find('Users', 'user_id', session.user_id);
      var shop = u ? String(u.shop || '') : '';
      if (!shop) return { version: Version.get() };          // ended already (pressed twice)
      var now = Util.nowIso();
      var open = Repo.all('Shifts').filter(function (s) { return s.user_id === session.user_id && s.shop_party_id === shop && !s.closed_at; }).pop();
      var ch = { closed_at: now, amount: Util.round(amount), note: Util.clean(p.note), closed_by: session.user_id };
      if (open) Repo.update('Shifts', 'shift_id', open.shift_id, ch);
      else Repo.append('Shifts', [Object.assign({ shift_id: 'SH' + Util.pad(Settings.next('seq_shift', 0), 5), user_id: session.user_id,
        shop_party_id: shop, opened_at: '', client_id: '' }, ch)]);       // a shift opened before shifts were recorded
      Repo.update('Users', 'user_id', session.user_id, { shop: '' });
      Audit.log(session.user_id, 'shift_end', 'Users', session.user_id, null, { shop: shop, amount: ch.amount });
      return { version: Version.bump() };
    });
  },

  /** The usual hours of each stage (the admin may change them): past it an order is late, past twice it very late. */
  followHours: function () {
    var dflt = { sent: 2, approved: 12, ready: 4, in_trip: 6, loaded: 6, delivered: 2, received: 24 };
    try { var own = JSON.parse(Settings.get('follow_hours', '') || '{}'); Object.keys(own).forEach(function (k) { if (k in dflt && Number(own[k]) > 0) dflt[k] = Number(own[k]); }); } catch (e) { /* the defaults */ }
    return dflt;
  },

  setFollowHours: function (session, p) {
    var cur = Orders.followHours(), out = {};
    Object.keys(cur).forEach(function (k) { var v = Util.num((p.hours || {})[k]); out[k] = v !== null && v > 0 ? Util.round(v) : cur[k]; });
    return withLock(function () {
      Settings.set('follow_hours', JSON.stringify(out));
      Audit.log(session.user_id, 'follow_hours', 'Settings', 'follow_hours', cur, out);
      return { hours: out, version: Version.bump() };
    });
  },

  /**
   * Every order on its way (sent and not invoiced yet): its stage, since when, and whether it is late.
   * [{order_id, order_no, shop_party_id, kind, stage, since, hours, limit, level: ok|late|very}], the latest first.
   */
  follow: function () {
    var limits = Orders.followHours(), now = new Date().getTime();
    var trips = {};
    Repo.all('Trips').forEach(function (t) { trips[t.trip_id] = t; });
    var lines = Repo.groupBy('ShopOrderLines', 'order_id');
    var out = [];
    Repo.all('Orders').forEach(function (o) {
      if (['draft', 'rejected', 'cancelled', 'invoiced'].indexOf(o.status) >= 0 || !o.sent_at) return;
      var v = Orders.view(o), stage = v.status, since = '';
      if (stage === 'sent') since = o.sent_at;
      else if (stage === 'approved') since = o.decided_at;
      else if (stage === 'ready') since = (lines[o.order_id] || []).map(function (l) { return String(l.handed_at || l.updated_at || ''); }).sort().pop() || o.decided_at;
      else if (stage === 'in_trip') since = (trips[o.trip_id] || {}).created_at || o.updated_at;
      else if (stage === 'loaded') since = o.loaded_at;
      else if (stage === 'delivered') since = o.delivered_at;
      else if (stage === 'received') since = o.received_at;
      if (!since || !(stage in limits)) return;
      var t0 = new Date(String(since).length === 19 ? since + '+03:00' : since).getTime();
      var hours = Math.max(0, Math.round((now - t0) / 36e5 * 10) / 10);
      var limit = limits[stage];
      out.push({ order_id: o.order_id, order_no: o.order_no, shop_party_id: o.shop_party_id, kind: o.kind || '', stage: stage, since: since,
        hours: hours, limit: limit, level: hours > 2 * limit ? 'very' : hours > limit ? 'late' : 'ok', diff_pending: o.diff_status === 'pending', mgr_note: o.mgr_note || '',
        made_at: o.made_at || '' });
    });
    var rank = { very: 0, late: 1, ok: 2 };
    return { hours: limits, orders: out.sort(function (a, b) { return rank[a.level] - rank[b.level] || b.hours - a.hours; }) };
  },

  /** How many orders are late (the number on the follow-up tab and the menu). */
  followLate: function () { return Orders.follow().orders.filter(function (x) { return x.level !== 'ok'; }).length; },

  /** Orders waiting for distribution (the badge): sent, to approve; being prepared with a line short, to decide. */
  /** Special orders waiting for the production manager. */
  pendingSpecial: function () {
    return Repo.all('Orders').filter(function (o) { return o.kind === 'special' && o.status === 'sent'; }).length;
  },

  pending: function () {
    return Repo.all('Orders').filter(function (o) {
      if (o.status === 'sent' && o.kind === 'special') return false;
      if (o.made_at) return false;
      if (o.status === 'sent' || (o.status === 'received' && o.diff_status === 'pending')) return true;
      if (o.status !== 'approved') return false;
      var v = Orders.view(o);
      return v.status === 'approved' && v.lines.some(function (l) { return l.status === 'unavailable' || l.status === 'partial'; });
    }).length;
  }
};
