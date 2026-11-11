/**
 * Dispatch.gs – the dispatching and delivery record (the food safety officer's report).
 *
 *   One row per product loaded on a trip, worked out from the data, nothing typed twice: the day and the time it
 *   was loaded, the product and the quantity handed, its production batch with the production and expiry dates
 *   (the oldest stock on hand that day first, as in the batch records), the shop, the vehicle, the driver, the
 *   temperature the driver wrote when leaving, the time of leaving, who received it (the cashier's confirmation)
 *   and who handed it over: distribution, who made the trip (a branch's own trip: the branch). The quality officer reviews each day's record: complete or not, with a note.
 */
var Dispatch = {
  /** p: {from, to} (the day loaded). {rows, reviews}. */
  report: function (session, p) {
    p = p || {};
    var from = Util.isDate(p.from) ? p.from : Util.today(), to = Util.isDate(p.to) ? p.to : Util.today();
    var day = function (iso) { return String(iso || '').slice(0, 10); };
    var clock = function (iso) { return String(iso || '').slice(11, 16); };
    var users = {};
    Repo.all('Users').forEach(function (u) { users[u.user_id] = u.display_name; });
    var trips = {};
    Repo.all('Trips').forEach(function (t) { if (t.status !== 'cancelled') trips[t.trip_id] = t; });
    var lines = Repo.groupBy('ShopOrderLines', 'order_id');
    var moves = Repo.all('Movements');
    var batchOf = {};
    Repo.all('BatchRecords').forEach(function (b) { batchOf[b.movement_id] = b.batch_no; });
    var missing = [];
    var rows = [];
    Repo.all('TripStops').forEach(function (s) {
      var t = trips[s.trip_id];
      if (!t || !s.loaded_at || day(s.loaded_at) < from || day(s.loaded_at) > to) return;
      var o = Repo.find('Orders', 'order_id', s.order_id) || {};
      (lines[s.order_id] || []).forEach(function (l) {
        var qty = Number(l.handed_qty) || 0;
        if (!(qty > 0) || l.direct === true) return;
        var on = day(l.handed_at) || day(s.loaded_at);
        // where the product came from: production batches (or a purchase), the oldest stock first
        var lots = BatchRec.lots(l.item_id, on, qty, moves);
        rows.push({ trip_id: t.trip_id, date: day(s.loaded_at), loaded: clock(s.loaded_at), item_id: l.item_id, description: l.description || '', qty: qty, unit: l.unit,
          lots: lots, shop_party_id: o.shop_party_id || '', address: o.place === 'customer' ? (o.customer_name || '') + ' ' + String(o.address || '').replace(/https?:\/\/\S+/, '').trim() : '',
          vehicle: t.vehicle || '', driver: users[t.driver_id] || t.driver_id, temp: t.temp === '' || t.temp === undefined ? '' : Number(t.temp), departed: clock(t.departed_at),
          departed_day: day(t.departed_at), received_by: users[o.received_by] || '', received_at: o.received_at || '', arrival_temp: o.arrival_temp === '' || o.arrival_temp === undefined ? '' : Number(o.arrival_temp), handed_by: users[t.created_by] || t.created_by || '',
          seq: Number(s.seq), order_no: o.order_no || '' });
      });
    });
    // the batch numbers of the productions behind each row (made now for productions recorded before batches existed)
    var need = {};
    rows.forEach(function (r) { r.lots.forEach(function (x) { if (x.kind === 'PROD_OUTPUT' && x.movement_id && !batchOf[x.movement_id]) need[x.movement_id] = true; }); });
    if (Object.keys(need).length) withLock(function () {
      Object.keys(need).forEach(function (id) { var m = Repo.find('Movements', 'movement_id', id); if (m) batchOf[id] = BatchRec.ensure(m, session).batch_no; });
    });
    rows.forEach(function (r) {
      r.batches = r.lots.map(function (x) {
        return { batch: x.kind === 'PROD_OUTPUT' ? batchOf[x.movement_id] || '' : x.lot, made: x.kind === 'PROD_OUTPUT' ? x.received : '', expiry: x.expiry, qty: x.qty };
      });
      delete r.lots;
    });
    rows.sort(function (a, b) { return a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.trip_id !== b.trip_id ? (a.trip_id < b.trip_id ? -1 : 1) : a.seq - b.seq; });
    var reviews = Repo.all('DispatchReviews').filter(function (v) { return String(v.date) >= from && String(v.date) <= to; }).map(function (v) {
      return { date: String(v.date), ok: v.ok === true, note: v.note || '', by: users[v.by] || v.by, at: v.at };
    });
    return { rows: rows, reviews: reviews };
  },

  /** The quality officer's review of a day's record. p: {date, ok (true / false), note}. */
  review: function (session, p) {
    Util.require(Util.isDate(p.date) && p.date <= Util.today(), 'date_invalid');
    Util.require(p.ok === true || p.ok === false, 'nothing_to_save');
    var note = Util.clean(p.note).slice(0, 500);
    return withLock(function () {
      var cur = Repo.find('DispatchReviews', 'date', p.date);
      var row = { date: p.date, ok: p.ok, note: note, by: session.user_id, at: Util.nowIso() };
      if (cur) Repo.update('DispatchReviews', 'date', p.date, row); else Repo.append('DispatchReviews', [row]);
      Audit.log(session.user_id, 'dispatch_review', 'DispatchReviews', p.date, cur ? { ok: cur.ok, note: cur.note } : null, { ok: p.ok, note: note });
      return { date: p.date, version: Version.bump() };
    });
  }
};
