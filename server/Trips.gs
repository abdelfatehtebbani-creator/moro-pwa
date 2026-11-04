/**
 * Trips.gs – shop orders stage 2: from "ready for distribution" to the shop's receipt.
 *
 *   Distribution makes a trip: a driver and one or more ready orders, in the order of the stops.
 *   The driver confirms each stop twice: loaded, then delivered. From "loaded" the order is no longer
 *   changed or cancelled. The cashier receives the order: the quantity received per line; less than
 *   handed needs a reason (a difference for the reports – no stock moves: the stock left when the lines
 *   were handed to distribution).
 *
 * Order status (Orders.status) after approval: approved (→ ready, from its lines) → in_trip → loaded →
 * delivered → received. Each step keeps its time and who did it.
 */
var SHORT_REASONS = ['damaged', 'short_in_trip', 'loading_error', 'other'];

var Trips = {
  view: function (t) {
    var stops = Repo.all('TripStops').filter(function (s) { return s.trip_id === t.trip_id; })
      .sort(function (a, b) { return Number(a.seq) - Number(b.seq); })
      .map(function (s) {
        var o = Repo.find('Orders', 'order_id', s.order_id) || {};
        var n = (Repo.groupBy('OrderItems', 'order_id')[s.order_id] || []).filter(function (x) { return x.status !== 'removed'; }).length;
        // the load of this stop: what was handed to distribution for the order, for the driver to check
        var load = (Repo.groupBy('ShopOrderLines', 'order_id')[s.order_id] || []).filter(function (l) { return Number(l.handed_qty) > 0 && l.direct !== true; })
          .map(function (l) {
            var it = Repo.find('Items', 'item_id', l.item_id) || {};
            return { item_id: l.item_id, name: l.description || it.name || l.item_id, name_ar: l.description ? '' : it.name_ar || '', qty: Number(l.handed_qty), unit: l.unit };
          });
        return { order_id: s.order_id, order_no: o.order_no, shop_party_id: o.shop_party_id, seq: Number(s.seq), lines: n, load: load,
                 loaded_at: s.loaded_at, delivered_at: s.delivered_at, order_status: o.status, kind: o.kind || '', place: o.place || '',
                 customer_name: o.customer_name || '', customer_phone: o.customer_phone || '', address: o.address || '',
                 delivery_date: o.delivery_date || '', delivery_time: o.delivery_time || '' };
      });
    var out = {};
    Object.keys(t).forEach(function (k) { out[k] = t[k]; });
    out.stops = stops;
    // preparing → loaded (all loaded) → in_transit (one delivered) → completed (all delivered)
    var loaded = stops.filter(function (s) { return s.loaded_at; }).length, delivered = stops.filter(function (s) { return s.delivered_at; }).length;
    if (t.status !== 'cancelled') {
      out.status = !stops.length ? 'preparing' : delivered === stops.length ? 'completed' : delivered ? 'in_transit' : loaded === stops.length ? 'loaded' : 'preparing';
    }
    return out;
  },

  /** Distribution: every trip (p.open: not completed); the driver: theirs. */
  list: function (session, p) {
    p = p || {};
    var all = Perm.has(session, 'trips.save');
    return Repo.all('Trips').filter(function (t) { return all || t.driver_id === session.user_id; })
      .reverse().map(Trips.view)
      .filter(function (t) { return !p.open || (t.status !== 'completed' && t.status !== 'cancelled'); })
      .slice(0, Number(p.limit) || 100);
  },

  /** Distribution: a new trip. p: {driver_id, order_ids: [in the order of the stops], note}. */
  save: function (session, p) {
    var ids = (p.order_ids || []).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    Util.require(ids.length, 'nothing_to_save');
    var driver = Repo.find('Users', 'user_id', p.driver_id);
    Util.require(driver && driver.active === true && driver.role === 'driver', 'driver_invalid');
    return withLock(function () {
      ids.forEach(function (id) {
        var o = Repo.find('Orders', 'order_id', id);
        Util.require(o && Orders.view(o).status === 'ready', 'order_not_ready', o ? o.order_no : id);
      });
      var now = Util.nowIso();
      var trip = { trip_id: 'T' + Util.pad(Settings.next('seq_trip', 0), 5), driver_id: driver.user_id, status: 'open',
                   note: Util.clean(p.note), created_by: session.user_id, created_at: now, updated_at: now };
      Repo.append('Trips', [trip]);
      Repo.append('TripStops', ids.map(function (id, i) {
        return { trip_id: trip.trip_id, order_id: id, seq: i + 1, loaded_at: '', loaded_by: '', delivered_at: '', delivered_by: '' };
      }));
      ids.forEach(function (id) { Repo.update('Orders', 'order_id', id, { status: 'in_trip', trip_id: trip.trip_id, updated_at: now }); });
      Audit.log(session.user_id, 'trip_create', 'Trips', trip.trip_id, null, { driver: driver.user_id, orders: ids });
      Notify.tripAssigned(trip, ids.length);
      return { trip: Trips.view(trip), version: Version.bump() };
    });
  },

  /** Distribution: cancels a trip nothing of which was loaded yet; its orders are ready again. */
  cancel: function (session, p) {
    return withLock(function () {
      var t = Repo.find('Trips', 'trip_id', p.trip_id);
      Util.require(t && t.status !== 'cancelled', 'not_found');
      var stops = Repo.all('TripStops').filter(function (s) { return s.trip_id === t.trip_id; });
      Util.require(!stops.some(function (s) { return s.loaded_at; }), 'trip_loaded');
      var now = Util.nowIso();
      stops.forEach(function (s) { Repo.update('Orders', 'order_id', s.order_id, { status: 'approved', trip_id: '', updated_at: now }); });
      Repo.update('Trips', 'trip_id', t.trip_id, { status: 'cancelled', updated_at: now });
      Audit.log(session.user_id, 'trip_cancel', 'Trips', t.trip_id, null, null);
      OrderNotify.tripCancelled(t, session);
      return { trip_id: t.trip_id, version: Version.bump() };
    });
  },

  /** The driver: one stop loaded (step 'load') or delivered (step 'deliver'). p: {trip_id, order_id}. */
  confirm: function (session, p, step) {
    return withLock(function () {
      var t = Repo.find('Trips', 'trip_id', p.trip_id);
      Util.require(t && t.status !== 'cancelled' && t.driver_id === session.user_id, 'not_found');
      var s = Repo.all('TripStops').filter(function (x) { return x.trip_id === t.trip_id && x.order_id === p.order_id; })[0];
      Util.require(s, 'not_found');
      var now = Util.nowIso(), ch = {};
      if (step === 'load') {
        if (s.loaded_at) return { trip: Trips.view(t), version: Version.get() };
        ch = { loaded_at: now, loaded_by: session.user_id };
      } else {
        Util.require(s.loaded_at, 'stop_not_loaded');
        // the car leaves with the whole trip: no delivery before every order of it is loaded
        Util.require(Repo.all('TripStops').every(function (x) { return x.trip_id !== t.trip_id || x.loaded_at; }), 'trip_not_all_loaded');
        if (s.delivered_at) return { trip: Trips.view(t), version: Version.get() };
        ch = { delivered_at: now, delivered_by: session.user_id };
      }
      Repo.updateWhere('TripStops', function (x) { return x.trip_id === t.trip_id && x.order_id === p.order_id; }, ch);
      Repo.update('Orders', 'order_id', p.order_id, step === 'load' ? { status: 'loaded', loaded_at: now, updated_at: now }
        : { status: 'delivered', delivered_at: now, updated_at: now });
      Audit.log(session.user_id, step === 'load' ? 'trip_loaded' : 'trip_delivered', 'Orders', p.order_id, null, { trip: t.trip_id });
      var after = Repo.find('Orders', 'order_id', p.order_id);
      // handed to the customer by the driver: the order is received as it was handed, and goes to its invoice
      if (step === 'deliver' && after.place === 'customer') {
        Orders.view(after).lines.forEach(function (l) {
          Repo.updateWhere('OrderItems', function (r) { return r.order_id === after.order_id && Number(r.line_no) === l.line_no; },
            { received_qty: l.status === 'removed' ? 0 : l.handed_qty, short_reason: '', short_note: '' });
        });
        Repo.update('Orders', 'order_id', after.order_id, { status: 'received', received_at: now, received_by: session.user_id, diff_status: '' });
        after = Repo.find('Orders', 'order_id', after.order_id);
        OrderNotify.send(OrderNotify.cashiers(after), session, 'orders', ['سُلّمت للزبون ' + after.order_no, after.customer_name],
          ['Delivered to the customer ' + after.order_no, after.customer_name]);
        OrderNotify.invoiceReady(after, session);
      } else if (step === 'deliver') Notify.orderDelivered(after);
      else OrderNotify.loaded(after, session);
      return { trip: Trips.view(t), version: Version.bump() };
    });
  },

  /**
   * The cashier receives a delivered order. p: {order_id, lines: [{line_no, qty, reason, note}]}.
   * Received ≤ handed; less needs a reason from the list. A line not given: all of what was handed.
   */
  receive: function (session, p) {
    return withLock(function () {
      var o = Repo.find('Orders', 'order_id', p.order_id);
      Util.require(o && o.status === 'delivered' && o.shop_party_id === Orders.shopOf(session), 'not_found');
      var given = {};
      (p.lines || []).forEach(function (x) { given[Number(x.line_no)] = x; });
      var view = Orders.view(o), short = false;
      view.lines.forEach(function (l) {
        if (l.status === 'removed') return;
        var x = given[l.line_no] || {};
        var q = x.qty === undefined || x.qty === '' ? l.handed_qty : Util.num(x.qty);
        Util.require(q !== null && q >= 0 && q <= l.handed_qty, 'qty_too_much', l.line_no);
        var ch = { received_qty: Util.round(q), short_reason: '', short_note: '' };
        if (q < l.handed_qty) {
          Util.require(SHORT_REASONS.indexOf(x.reason) >= 0, 'reason_required', l.line_no);
          ch.short_reason = x.reason; ch.short_note = Util.clean(x.note);
          short = true;
        }
        Repo.updateWhere('OrderItems', function (r) { return r.order_id === o.order_id && Number(r.line_no) === l.line_no; }, ch);
      });
      var now = Util.nowIso();
      // received less than handed: distribution reviews the difference before the invoice
      Repo.update('Orders', 'order_id', o.order_id, { status: 'received', received_at: now, received_by: session.user_id, updated_at: now,
        diff_status: short ? 'pending' : '' });
      Audit.log(session.user_id, 'order_receive', 'Orders', o.order_id, null, { lines: view.lines.length });
      var after = Repo.find('Orders', 'order_id', o.order_id);
      OrderNotify.received(after, Orders.view(after), session);
      return { order: Orders.view(after), version: Version.bump() };
    });
  },

  /** Active drivers, for the trip form. */
  drivers: function () {
    return Repo.all('Users').filter(function (u) { return u.role === 'driver' && u.active === true; })
      .map(function (u) { return { user_id: u.user_id, name: u.display_name }; });
  }
};

/** Phone messages of the trips. */
Notify.tripAssigned = function (trip, n) {
  Push.toUsers([trip.driver_id], {
    ar: { title: 'رحلة جديدة ' + trip.trip_id, body: n + ' محل' }, en: { title: 'New trip ' + trip.trip_id, body: n + ' shop(s)' },
    page: 'trips', badge: 1 });
};
Notify.orderDelivered = function (o) {
  var cashiers = Repo.all('Users').filter(function (u) { return u.active === true && String(u.shop || '') === o.shop_party_id; })
    .map(function (u) { return u.user_id; });
  Push.toUsers(cashiers, {
    ar: { title: 'وصلت الطلبية ' + o.order_no, body: 'أكّد استلامها' }, en: { title: 'Order ' + o.order_no + ' delivered', body: 'Confirm the receipt' },
    page: 'orders', badge: 1 });
};
