/**
 * OrderNotify.gs – phone messages of the shop order cycle, to whoever has to act next (or should know):
 *
 *   sent                         → distribution, to approve
 *   approved / rejected          → the cashier (the preparers are told by Shop.notifyNew)
 *   a line short or not supplied → distribution, to decide (accept what was handed, or wait)
 *   every line done              → distribution, to put it in a trip
 *   shortfall accepted / closed  → the cashier
 *   trip made / cancelled        → the driver (made: Notify.tripAssigned)
 *   loaded                       → the cashier: on the way
 *   delivered                    → the cashier, to receive (Notify.orderDelivered)
 *   received                     → whoever issues the invoices; received short → distribution too
 *
 * The one who did the step is not told. The numbers on the menu come with the data (Masters.bootstrap).
 */
var OrderNotify = {
  shopName: function (o) { return (Repo.find('Parties', 'party_id', o.shop_party_id) || {}).name || ''; },

  /** The cashier on shift in the order's shop; nobody on shift: the one who wrote it. */
  cashiers: function (o) {
    var ids = Repo.all('Users').filter(function (u) { return u.active === true && String(u.shop || '') === o.shop_party_id; })
      .map(function (u) { return u.user_id; });
    return ids.length ? ids : [o.created_by];
  },

  send: function (to, session, page, ar, en) {
    var actor = session ? session.user_id : '';
    var ids = to.filter(function (x, i, a) { return x && x !== actor && a.indexOf(x) === i; });
    Push.toUsers(ids, { ar: { title: ar[0], body: ar[1] || '' }, en: { title: en[0], body: en[1] || '' }, page: page, badge: 1 });
  },

  sent: function (o, session) {
    var shop = OrderNotify.shopName(o);
    if (o.kind === 'special') {
      OrderNotify.send(Push.usersWith('orders.route'), session, 'orderapprove',
        ['طلبية خاصة ' + o.order_no, shop + ' – للتوجيه، التسليم ' + o.delivery_date + ' ' + o.delivery_time],
        ['Special order ' + o.order_no, shop + ' – to route, due ' + o.delivery_date + ' ' + o.delivery_time]);
      return;
    }
    OrderNotify.send(Push.usersWith('orders.approve'), session, 'orderapprove',
      ['طلبية جديدة ' + o.order_no, shop + ' – للاعتماد'], ['New order ' + o.order_no, shop + ' – to approve']);
  },

  decided: function (o, ok, reason, session) {
    OrderNotify.send(OrderNotify.cashiers(o), session, 'orders',
      ok ? ['اعتُمدت طلبيتك ' + o.order_no, 'قيد التجهيز'] : ['رُفضت طلبيتك ' + o.order_no, reason],
      ok ? ['Your order ' + o.order_no + ' is approved', 'Being prepared'] : ['Your order ' + o.order_no + ' is rejected', reason]);
  },

  /**
   * Lines of orders changed (handed, given in part, not supplied, closed). changes: [{order_id, item_id, short}].
   * An order now ready → distribution, for a trip; still being prepared with a line short → distribution, to decide.
   */
  lines: function (changes, session) {
    var byOrder = {};
    changes.forEach(function (c) {
      var x = byOrder[c.order_id] || (byOrder[c.order_id] = []);
      if (c.short) x.push(c.item_id);
    });
    Object.keys(byOrder).forEach(function (id) {
      var o = Repo.find('Orders', 'order_id', id);
      if (!o) return;                                   // a Masar order: not told here
      var v = Orders.view(o), shop = OrderNotify.shopName(o);
      if (v.status === 'ready') {
        var short = v.lines.some(function (l) { return l.status === 'unavailable' || (l.status === 'handed' && l.handed_qty < Number(l.approved_qty)); });
        OrderNotify.send(Push.usersWith('trips.save'), session, 'trips',
          ['جاهزة للتوزيع ' + o.order_no, shop + (short ? ' – ناقصة' : '')], ['Ready for distribution ' + o.order_no, shop + (short ? ' – short' : '')]);
      } else if (v.status === 'approved' && byOrder[id].length) {
        var items = byOrder[id].map(function (it) { return Repo.find('Items', 'item_id', it) || { name: it }; });
        OrderNotify.send(Push.usersWith('orders.approve'), session, 'orderapprove',
          ['نقص في الطلبية ' + o.order_no, shop + ': ' + items.map(function (x) { return x.name_ar || x.name; }).join('، ')],
          ['Short in order ' + o.order_no, shop + ': ' + items.map(function (x) { return x.name; }).join(', ')]);
      }
    });
  },

  /** Distribution accepted what was handed (or closed an order of which nothing was handed). */
  closed: function (o, reason, session) {
    var none = o.status === 'cancelled';
    OrderNotify.send(OrderNotify.cashiers(o), session, 'orders',
      none ? ['أُغلقت طلبيتك ' + o.order_no, 'لم يُجهَّز منها شيء: ' + reason] : ['طلبيتك ' + o.order_no + ' ستصل ناقصة', reason],
      none ? ['Your order ' + o.order_no + ' is closed', 'Nothing of it could be prepared: ' + reason] : ['Your order ' + o.order_no + ' will come short', reason]);
  },

  tripCancelled: function (t, session) {
    OrderNotify.send([t.driver_id], session, 'trips', ['أُلغيت الرحلة ' + t.trip_id, ''], ['Trip ' + t.trip_id + ' cancelled', '']);
  },

  loaded: function (o, session) {
    OrderNotify.send(OrderNotify.cashiers(o), session, 'orders',
      ['طلبيتك ' + o.order_no + ' في الطريق', 'حُمّلت في السيارة'], ['Your order ' + o.order_no + ' is on the way', 'Loaded in the car']);
  },

  received: function (o, v, session) {
    var shop = OrderNotify.shopName(o);
    if (o.diff_status !== 'pending') OrderNotify.invoiceReady(o, session);
    var short = v.lines.filter(function (l) { return l.short_reason; }).length;
    if (short) OrderNotify.send(Push.usersWith('orders.acceptDiff'), session, 'orderapprove',
      ['فرق استلام للمراجعة ' + o.order_no, shop + ' – ' + short + ' سطر'], ['Receipt difference to review ' + o.order_no, shop + ' – ' + short + ' line(s)']);
  },

  invoiceReady: function (o, session) {
    var shop = OrderNotify.shopName(o);
    OrderNotify.send(Push.usersWith('invoices.create'), session, 'invoices',
      ['طلبية للفوترة ' + o.order_no, shop], ['Order to invoice ' + o.order_no, shop]);
  },

  /** The numbers on the menu: what waits for this user in the order cycle. */
  todo: function (session) {
    var orders = Repo.all('Orders'), out = { orders: 0, trips: 0, invoices: 0, returns: Returns.waiting(session) };
    if (Perm.has(session, 'orders.receive')) {
      var shop = Orders.shopOf(session);
      out.orders = orders.filter(function (o) { return shop && o.shop_party_id === shop && o.status === 'delivered'; }).length;
    }
    if (Perm.has(session, 'trips.save')) {
      out.trips = orders.filter(function (o) { return o.status === 'approved' && Orders.view(o).status === 'ready'; }).length;
    } else if (Perm.has(session, 'trips.load')) {
      var mine = {};
      Repo.all('Trips').forEach(function (t) { if (t.driver_id === session.user_id && t.status !== 'cancelled') mine[t.trip_id] = true; });
      out.trips = Repo.all('TripStops').filter(function (s) { return mine[s.trip_id] && !s.delivered_at; }).length;
    }
    if (Perm.has(session, 'invoices.create')) out.invoices = orders.filter(function (o) { return o.status === 'received' && o.diff_status !== 'pending'; }).length;
    return out;
  }
};
