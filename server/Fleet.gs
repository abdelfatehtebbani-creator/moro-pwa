/**
 * Fleet.gs – the vehicles followed day to day (the car park manager and the drivers).
 *
 * One log for everything the driver records on a vehicle: a check before leaving, a fuel refill, a fault.
 * Each record keeps its own fields in `data` (JSON), so a new kind (a wash, a fine, a service…) is added
 * without changing the table. A fault, or a check with a problem, stays open until the manager closes it.
 */
var FLEET_KINDS = ['check', 'fuel', 'issue', 'start', 'end'];
// a shift left open longer than this is taken as ended (a driver who forgot to end it)
var FLEET_SHIFT_HOURS = 16;
var FLEET_CHECKS = ['tyres', 'oil', 'cooling', 'clean'];

var Fleet = {
  vehicles: function () {
    return Repo.all('Vehicles').filter(function (v) { return v.active !== false; })
      .map(function (v) { return { plate: String(v.plate), model: v.model || '' }; });
  },

  /** The last odometer reading recorded for a vehicle (0 when none). */
  lastOdo: function (plate, logs) {
    return (logs || Repo.all('VehicleLogs')).filter(function (l) { return String(l.plate) === plate && Number(l.odometer) > 0; })
      .reduce(function (m, l) { return Math.max(m, Number(l.odometer)); }, 0);
  },

  view: function (l) {
    var d = {};
    try { d = JSON.parse(l.data || '{}'); } catch (e) { d = {}; }
    return { log_id: l.log_id, plate: String(l.plate), kind: l.kind, at: l.at, by: l.by, odometer: Number(l.odometer) || 0, data: d,
             photos: String(l.photos || '').split(',').filter(String), status: l.status || '', closed_at: l.closed_at || '', closed_by: l.closed_by || '',
             note: l.note || '' };
  },

  /**
   * The driver records something on a vehicle. p: {client_id, kind, plate, odometer, data, photos: [data URL], note}
   *   check: data {tyres|oil|cooling|clean: 'ok'|'bad', fuel: 0..4 (quarters), cold: °C or ''}
   *   fuel:  data {liters, amount}
   *   issue: data {text, urgent}
   */
  add: function (session, p) {
    var kind = String(p.kind || '');
    Util.require(FLEET_KINDS.indexOf(kind) >= 0, 'fleet_kind');
    var plate = Util.clean(p.plate).toUpperCase();
    Util.require(Repo.find('Vehicles', 'plate', plate), 'vehicle_required');
    var src = p.data || {}, data = {}, open = false;
    var odo = Util.num(p.odometer);
    if (kind === 'check') {
      FLEET_CHECKS.forEach(function (k) { data[k] = src[k] === 'bad' ? 'bad' : 'ok'; if (data[k] === 'bad') open = true; });
      var fuel = Util.num(src.fuel);
      data.fuel = fuel === null ? '' : Math.max(0, Math.min(4, Math.round(fuel)));
      var cold = Util.num(src.cold);
      data.cold = cold === null ? '' : Util.round(cold);
    } else if (kind === 'fuel') {
      var liters = Util.num(src.liters), amount = Util.num(src.amount);
      Util.require(liters !== null && liters > 0 && liters < 1000, 'fleet_liters');
      Util.require(amount !== null && amount >= 0, 'amount_invalid');
      data.liters = Util.round(liters); data.amount = Util.round(amount);
    } else if (kind === 'start' || kind === 'end') {
      // the driver's shift: their phone shares its position from start to end; the position at the end is where the car is left
      var la = Util.num(src.lat), ln = Util.num(src.lng);
      if (la !== null && ln !== null && Math.abs(la) <= 90 && Math.abs(ln) <= 180) { data.lat = Math.round(la * 1e5) / 1e5; data.lng = Math.round(ln * 1e5) / 1e5; }
      if (kind === 'end') Util.require(Fleet.onShift(session.user_id), 'fleet_not_on_shift');
      else Util.require(!Fleet.onShift(session.user_id), 'fleet_on_shift');
    } else {
      data.text = Util.clean(src.text).slice(0, 600);
      Util.require(data.text, 'fleet_text');
      data.urgent = src.urgent === true;
      open = true;
    }
    if (kind === 'check' || kind === 'fuel') Util.require(odo !== null && odo > 0, 'fleet_odometer');
    return withLock(function () {
      var cid = Util.clean(p.client_id);
      if (cid) { var dup = Repo.find('VehicleLogs', 'client_id', cid); if (dup) return { log: Fleet.view(dup), duplicate: true }; }
      var logs = Repo.all('VehicleLogs');
      if (odo !== null && odo > 0) Util.require(odo >= Fleet.lastOdo(plate, logs), 'fleet_odometer_back', String(Fleet.lastOdo(plate, logs)));
      var id = 'VL' + Util.pad(Settings.next('seq_vlog', 0), 6);
      var photos = (p.photos || []).slice(0, 3).length ? Photos.add(session, id, (p.photos || []).slice(0, 3)) : [];
      var row = { log_id: id, plate: plate, kind: kind, at: Util.nowIso(), by: session.user_id, odometer: odo || '', data: JSON.stringify(data),
                  photos: photos.join(','), status: open ? 'open' : '', closed_at: '', closed_by: '', note: Util.clean(p.note).slice(0, 300), client_id: cid };
      Repo.append('VehicleLogs', [row]);
      // where the car is left at the end of a shift
      if (kind === 'end' && data.lat !== undefined) Fleet.park(plate, data.lat, data.lng, session.user_id);
      Audit.log(session.user_id, 'fleet_' + kind, 'VehicleLogs', id, null, { plate: plate, odometer: odo });
      // the driver's vehicle is remembered for their next records and trips
      var me = Repo.find('Users', 'user_id', session.user_id);
      if (me && String(me.vehicle || '') !== plate) Repo.update('Users', 'user_id', me.user_id, { vehicle: plate });
      // a fault, or a check with a problem: the car park managers are told (at once for an urgent one)
      if (open) {
        var to = Push.usersWith('fleet.close');
        var who = me ? me.display_name : session.user_id;
        if (to.length) Push.toUsers(to, {
          ar: { title: (data.urgent ? '🚨 عطل عاجل ' : kind === 'issue' ? 'عطل في سيارة ' : 'مشكلة في فحص سيارة ') + plate, body: who + (data.text ? ' – ' + data.text : '') },
          en: { title: (data.urgent ? '🚨 Urgent fault ' : kind === 'issue' ? 'Vehicle fault ' : 'Vehicle check problem ') + plate, body: who + (data.text ? ' – ' + data.text : '') },
          page: 'fleet', badge: 1 });
      }
      return { log: Fleet.view(row), version: Version.bump() };
    });
  },

  /** The driver's shift now: the start record when on shift (not ended, not older than the limit), else null. */
  onShift: function (userId, logs) {
    var last = (logs || Repo.all('VehicleLogs')).filter(function (l) { return l.by === userId && (l.kind === 'start' || l.kind === 'end'); }).pop();
    if (!last || last.kind !== 'start') return null;
    var t0 = new Date(String(last.at).length === 19 ? last.at + '+03:00' : last.at).getTime();
    return Date.now() - t0 < FLEET_SHIFT_HOURS * 36e5 ? last : null;
  },

  /** A driver loads, leaves and delivers only once their shift is started (they may look before). */
  requireShift: function (session) {
    if (session.role === 'driver') Util.require(Fleet.onShift(session.user_id), 'fleet_need_shift');
  },

  /** The last place a vehicle was seen (kept on the vehicle: the manager sees parked cars too). */
  park: function (plate, lat, lng, userId) {
    if (!plate || !Repo.find('Vehicles', 'plate', plate)) return;
    Repo.update('Vehicles', 'plate', plate, { last_lat: lat, last_lng: lng, last_at: Util.nowIso(), last_by: userId });
  },

  /** The driver's screen: the vehicles, theirs first, whether it was checked today, their last records. */
  mine: function (session) {
    var me = Repo.find('Users', 'user_id', session.user_id) || {};
    var logs = Repo.all('VehicleLogs');
    var plate = String(me.vehicle || '');
    var today = Util.today();
    var shift = Fleet.onShift(session.user_id, logs);
    return { vehicles: Fleet.vehicles(), plate: plate, shift: shift ? { at: shift.at, plate: String(shift.plate) } : null,
      checked_today: logs.some(function (l) { return l.kind === 'check' && String(l.plate) === plate && String(l.at).slice(0, 10) === today; }),
      last_odo: plate ? Fleet.lastOdo(plate, logs) : 0,
      logs: logs.filter(function (l) { return l.by === session.user_id; }).slice(-20).reverse().map(Fleet.view) };
  },

  /** The car park manager: every vehicle with its figures, the open problems, the last records. p: {plate} */
  list: function (session, p) {
    p = p || {};
    var logs = Repo.all('VehicleLogs');
    var today = Util.today();
    var since30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    var users = {};
    Repo.all('Users').forEach(function (u) { users[u.user_id] = u.display_name; });
    var cars = Fleet.vehicles().map(function (v) {
      var mine = logs.filter(function (l) { return String(l.plate) === v.plate; });
      var odos = mine.filter(function (l) { return Number(l.odometer) > 0; });
      var recent = odos.filter(function (l) { return String(l.at).slice(0, 10) >= since30; });
      var km30 = recent.length > 1 ? Math.max.apply(null, recent.map(function (l) { return Number(l.odometer); })) - Math.min.apply(null, recent.map(function (l) { return Number(l.odometer); })) : 0;
      // fuel use: the litres filled after the first refill, over the distance between the first and the last refill
      var fills = mine.filter(function (l) { return l.kind === 'fuel' && Number(l.odometer) > 0; })
        .sort(function (a, b) { return Number(a.odometer) - Number(b.odometer); });
      var per100 = null;
      if (fills.length > 1) {
        var dist = Number(fills[fills.length - 1].odometer) - Number(fills[0].odometer);
        var liters = fills.slice(1).reduce(function (s, l) { return s + (Fleet.view(l).data.liters || 0); }, 0);
        if (dist > 0) per100 = Util.round(liters / dist * 100);
      }
      var lastCheck = mine.filter(function (l) { return l.kind === 'check'; }).map(function (l) { return String(l.at); }).sort().pop() || '';
      return { plate: v.plate, model: v.model, odometer: Fleet.lastOdo(v.plate, logs), km30: km30, per100: per100, last_check: lastCheck,
               checked_today: lastCheck.slice(0, 10) === today, open: mine.filter(function (l) { return l.status === 'open'; }).length };
    }).sort(function (a, b) { return (b.open - a.open) || ((b.odometer > 0) - (a.odometer > 0)) || String(a.plate).localeCompare(String(b.plate)); });
    var rows = logs.filter(function (l) { return !p.plate || String(l.plate) === p.plate; }).slice(-300).reverse().map(function (l) {
      var v = Fleet.view(l); v.by_name = users[l.by] || l.by; v.closed_by_name = users[l.closed_by] || ''; return v;
    });
    return { cars: cars, logs: rows };
  },

  /** The manager closes a fault (or a check's problem) once dealt with. p: {log_id, note} */
  close: function (session, p) {
    return withLock(function () {
      var l = Repo.find('VehicleLogs', 'log_id', String(p.log_id || ''));
      Util.require(l, 'not_found');
      if (l.status !== 'open') return { log: Fleet.view(l) };
      var ch = { status: 'closed', closed_at: Util.nowIso(), closed_by: session.user_id, note: Util.clean(p.note).slice(0, 300) || l.note || '' };
      Repo.update('VehicleLogs', 'log_id', l.log_id, ch);
      Audit.log(session.user_id, 'fleet_close', 'VehicleLogs', l.log_id, { status: 'open' }, ch);
      return { log: Fleet.view(Repo.find('VehicleLogs', 'log_id', l.log_id)), version: Version.bump() };
    });
  },

  /** The open problems (the number on the menu of the car park manager). */
  openCount: function () { return Repo.all('VehicleLogs').filter(function (l) { return l.status === 'open'; }).length; }
};
