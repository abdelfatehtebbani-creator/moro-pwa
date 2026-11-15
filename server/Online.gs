/**
 * Online.gs – the customers' orders from their phone (hot kunafa trays delivered where they say).
 *
 *   A public page (order.html, no account) shows the products offered online: the required ones first (trays: at least
 *   the minimum the admin set), then the others. The customer sends the order with their name, mobile, address, the day
 *   and time, a note and the fees (per tray or per order, refundable or not) they agree to. It reaches the shop that
 *   makes and delivers these orders (Salwa): it calls the customer, accepts or refuses, sends it with a driver and marks
 *   it delivered. The customer follows it with the link of the order (its token) and can cancel it while it is new.
 *
 *   Fast on purpose: the catalogue is built once per data version and kept in the script cache; the page keeps its own
 *   copy and asks only whether it changed. Prices are fixed in the order when it is sent.
 */
var ONLINE_STATUSES = ['new', 'accepted', 'out', 'delivered', 'rejected', 'cancelled'];
var ONLINE_DEFAULTS = {
  shop: '', whatsapp: '', min_req: 1, lead_min: 180, reply_min: 15, max_open: 2, return_days: 7,
  terms_ar: '', terms_en: '', fees: [],
  // per day of the week (0 = Sunday): the hours orders may be delivered in; off = no delivery that day
  hours: { 0: { from: '10:00', to: '22:00', off: false }, 1: { from: '10:00', to: '22:00', off: false }, 2: { from: '10:00', to: '22:00', off: false },
           3: { from: '10:00', to: '22:00', off: false }, 4: { from: '10:00', to: '22:00', off: false }, 5: { from: '14:00', to: '23:00', off: false },
           6: { from: '10:00', to: '22:00', off: false } }
};

var Online = {
  // ---------- the admin's settings
  cfg: function () {
    var c = {};
    try { c = JSON.parse(Settings.get('online_cfg', '{}')) || {}; } catch (e) { c = {}; }
    var out = JSON.parse(JSON.stringify(ONLINE_DEFAULTS));
    Object.keys(c).forEach(function (k) { out[k] = c[k]; });
    if (!out.shop) {
      // the shop that makes these orders: the one called Salwa, until the admin chooses
      var s = Repo.all('Parties').filter(function (p) { return p.kind === 'shop' && p.active === true && /salwa|سلوى/i.test(p.name); })[0];
      out.shop = s ? s.party_id : '';
    }
    return out;
  },

  blocked: function () {
    try { return JSON.parse(Settings.get('online_blocked', '[]')) || []; } catch (e) { return []; }
  },

  phone: function (v) { return String(v || '').replace(/\D/g, '').replace(/^00974|^974/, ''); },

  /** The admin: the settings, the products offered and the blocked numbers. p: {cfg, items: [{item_id, online, req}], blocked} */
  saveSettings: function (session, p) {
    var c = p.cfg || {};
    var num = function (v, lo, hi, d) { var n = Util.num(v); return n === null ? d : Math.max(lo, Math.min(hi, Math.round(n))); };
    var hours = {};
    for (var d = 0; d < 7; d++) {
      var h = (c.hours || {})[d] || ONLINE_DEFAULTS.hours[d];
      var ok = function (t) { return /^\d{2}:\d{2}$/.test(String(t || '')); };
      Util.require(h.off === true || (ok(h.from) && ok(h.to) && h.from < h.to), 'online_hours_invalid', String(d));
      hours[d] = { from: String(h.from || ''), to: String(h.to || ''), off: h.off === true };
    }
    var fees = (c.fees || []).map(function (f, i) {
      var amount = Util.num(f.amount);
      Util.require(Util.clean(f.name_ar || f.name_en) && amount !== null && amount >= 0, 'online_fee_invalid', String(i + 1));
      return { id: f.id || 'F' + (i + 1), name_ar: Util.clean(f.name_ar), name_en: Util.clean(f.name_en), amount: Util.round(amount),
               per: f.per === 'tray' ? 'tray' : 'order', refundable: f.refundable === true };
    });
    var shop = String(c.shop || '');
    if (shop) { var sp = Repo.find('Parties', 'party_id', shop); Util.require(sp && sp.kind === 'shop', 'shop_invalid'); }
    var cfg = { shop: shop, whatsapp: Online.phone(c.whatsapp), min_req: num(c.min_req, 0, 100, 1), lead_min: num(c.lead_min, 0, 7 * 24 * 60, 180),
      reply_min: num(c.reply_min, 1, 24 * 60, 15), max_open: num(c.max_open, 1, 50, 2), return_days: num(c.return_days, 0, 365, 7),
      terms_ar: String(c.terms_ar || '').slice(0, 2000), terms_en: String(c.terms_en || '').slice(0, 2000), fees: fees, hours: hours };
    var blocked = (p.blocked || []).map(Online.phone).filter(function (x) { return x.length >= 6; });
    return withLock(function () {
      Settings.set('online_cfg', JSON.stringify(cfg));
      if (p.blocked !== undefined) Settings.set('online_blocked', JSON.stringify(blocked));
      (p.items || []).forEach(function (x) {
        var it = Repo.find('Items', 'item_id', x.item_id);
        if (!it) return;
        Repo.update('Items', 'item_id', it.item_id, { online: x.online === true, online_req: x.online === true && x.req === true });
      });
      Audit.log(session.user_id, 'online_settings', 'Settings', 'online_cfg', null, { fees: fees.length, items: (p.items || []).length });
      return { cfg: cfg, version: Version.bump() };
    });
  },

  /** The admin: a product's photo (a small JPEG made by the app). p: {item_id, photo (data URL) | ''} */
  setPhoto: function (session, p) {
    var it = Repo.find('Items', 'item_id', p.item_id);
    Util.require(it, 'not_found');
    return withLock(function () {
      var id = p.photo ? Photos.add(session, 'ONLINE', [p.photo])[0] : '';
      Repo.update('Items', 'item_id', it.item_id, { online_photo: id });
      Audit.log(session.user_id, 'online_photo', 'Items', it.item_id, null, { photo: id });
      return { photo: id, version: Version.bump() };
    });
  },

  /** The shop: a product sold out for today (hidden from the page until tomorrow), or back. p: {item_id, out} */
  soldOut: function (session, p) {
    var it = Repo.find('Items', 'item_id', p.item_id);
    Util.require(it && it.online === true, 'not_found');
    return withLock(function () {
      Repo.update('Items', 'item_id', it.item_id, { online_out: p.out === true ? Util.today() : '' });
      Audit.log(session.user_id, 'online_sold_out', 'Items', it.item_id, null, { out: p.out === true });
      return { version: Version.bump() };
    });
  },

  // ---------- the public page
  /** The catalogue (built once per data version, kept in the cache). p: {v}: the version the page has – {same: true} when unchanged. */
  catalog: function (p) {
    var v = String(Version.get());
    if (p && String(p.v || '') === v) return { same: true, v: v };
    var cache = CacheService.getScriptCache();
    var hit = cache.get('online_cat_' + v);
    if (hit) return JSON.parse(hit);
    var cfg = Online.cfg(), today = Util.today();
    var items = Repo.all('Items').filter(function (i) { return i.active === true && i.online === true; }).map(function (i) {
      return { id: i.item_id, name: i.name, name_ar: i.name_ar || '', unit: i.unit, price: Number(i.final_price) || 0, req: i.online_req === true,
               photo: i.online_photo || '', out: String(i.online_out || '') === today };
    }).sort(function (a, b) { return (b.req - a.req) || (a.name < b.name ? -1 : 1); });
    var shops = Repo.all('Parties').filter(function (x) { return x.kind === 'shop' && x.active === true; })
      .map(function (x) { return { id: x.party_id, name: x.name }; });
    var out = { v: v, today: today, items: items, shops: shops,
      cfg: { min_req: cfg.min_req, lead_min: cfg.lead_min, hours: cfg.hours, fees: cfg.fees, return_days: cfg.return_days,
             terms_ar: cfg.terms_ar, terms_en: cfg.terms_en, whatsapp: cfg.whatsapp } };
    try { cache.put('online_cat_' + v, JSON.stringify(out), 600); } catch (e) { /* too big for the cache: built each time */ }
    return out;
  },

  /** A product photo of the page (only photos of the products offered). p: {id} */
  photo: function (p) {
    var id = String(p.id || '');
    Util.require(Repo.all('Items').some(function (i) { return i.online === true && i.online_photo === id; }), 'not_found');
    return Photos.get(null, { photo_id: id });
  },

  minutes: function (hhmm) { var m = String(hhmm || '').match(/^(\d{2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; },

  /** Minutes from now (Qatar time) to a day and time. */
  untilMinutes: function (date, time) {
    var now = Util.nowIso();                               // YYYY-MM-DDTHH:MM:SS in the script's time zone
    var a = new Date(now.slice(0, 16) + ':00Z').getTime();
    var b = new Date(date + 'T' + time + ':00Z').getTime();
    return Math.round((b - a) / 60000);
  },

  /**
   * The customer sends the order. p: {client_id, from (shop id of the link), name, phone, address, map, date, time, note,
   * lines: [{id, qty}], pay: 'delivery', terms: true}. Returns {no, token} – the token is the customer's to follow it.
   */
  order: function (p) {
    var cfg = Online.cfg();
    Util.require(cfg.shop, 'online_closed');
    var name = Util.clean(p.name).slice(0, 80), phone = Online.phone(p.phone), address = Util.clean(p.address).slice(0, 400);
    Util.require(name, 'customer_required');
    Util.require(phone.length >= 8, 'online_phone_invalid');
    Util.require(address, 'address_required');
    Util.require(p.terms === true, 'online_terms_required');
    Util.require(Online.blocked().indexOf(phone) < 0, 'online_blocked');
    Util.require(/^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) && /^\d{2}:\d{2}$/.test(String(p.time || '')), 'delivery_date_invalid');
    // the day's hours and the notice before delivery
    var day = new Date(p.date + 'T12:00:00Z').getUTCDay();
    var h = cfg.hours[day] || cfg.hours[String(day)] || {};
    var t = Online.minutes(p.time);
    Util.require(h.off !== true && t !== null && t >= Online.minutes(h.from) && t <= Online.minutes(h.to), 'online_outside_hours');
    Util.require(Online.untilMinutes(p.date, p.time) >= cfg.lead_min, 'online_too_soon', String(cfg.lead_min));
    // the lines at today's prices; the required products (trays) at least the minimum
    var today = Util.today(), trays = 0;
    var lines = (p.lines || []).filter(function (l) { return Util.num(l.qty) > 0; }).map(function (l) {
      var it = Repo.find('Items', 'item_id', String(l.id || ''));
      Util.require(it && it.active === true && it.online === true && String(it.online_out || '') !== today, 'online_item_gone', it ? it.name : String(l.id));
      var q = Util.num(l.qty);
      Util.require(q > 0 && q <= 500 && Math.round(q * 1000) === q * 1000, 'qty_invalid');
      if (it.online_req === true) trays += q;
      return { id: it.item_id, name: it.name, name_ar: it.name_ar || '', unit: it.unit, qty: q, price: Number(it.final_price) || 0, req: it.online_req === true };
    });
    Util.require(lines.length, 'nothing_to_save');
    Util.require(trays >= cfg.min_req, 'online_min_req', String(cfg.min_req));
    var fees = cfg.fees.map(function (f) {
      var n = f.per === 'tray' ? trays : 1;
      return { name_ar: f.name_ar, name_en: f.name_en, per: f.per, refundable: f.refundable, amount: f.amount, qty: n, total: Util.round(f.amount * n) };
    }).filter(function (f) { return f.total > 0; });
    var goods = Util.round(lines.reduce(function (s, l) { return s + l.qty * l.price; }, 0));
    var feeSum = Util.round(fees.reduce(function (s, f) { return s + f.total; }, 0));
    var deposit = Util.round(fees.filter(function (f) { return f.refundable; }).reduce(function (s, f) { return s + f.total; }, 0));
    return withLock(function () {
      var cid = Util.clean(p.client_id);
      if (cid) {
        var dup = Repo.find('OnlineOrders', 'client_id', cid);
        if (dup) return { no: dup.no, duplicate: true };
      }
      // no more open orders from the same number than the admin allows (orders sent in jest)
      var open = Repo.all('OnlineOrders').filter(function (o) { return o.phone === phone && (o.status === 'new' || o.status === 'accepted' || o.status === 'out'); }).length;
      Util.require(open < cfg.max_open, 'online_too_many');
      var no = 'W' + Util.pad(Settings.next('seq_online', 0), 5);
      var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
      var now = Util.nowIso();
      var from = Repo.find('Parties', 'party_id', String(p.from || ''));
      var row = { no: no, token_hash: Auth.hashPin(token, 'online'), client_id: cid, created_at: now, from_shop: from && from.kind === 'shop' ? from.party_id : '',
        shop: cfg.shop, name: name, phone: phone, address: address, map: Util.clean(p.map).slice(0, 300), date: p.date, time: p.time,
        note: String(p.note || '').slice(0, 600), lines: JSON.stringify(lines), fees: JSON.stringify(fees), goods: goods, fee_total: feeSum,
        deposit: deposit, trays: trays, total: Util.round(goods + feeSum), pay: 'delivery', status: 'new', reason: '', terms_at: now,
        called_at: '', called_by: '', decided_at: '', decided_by: '', out_at: '', driver: '', delivered_at: '', cancelled_at: '', alert_at: '' };
      Repo.append('OnlineOrders', [row]);
      Audit.log('online', 'online_order', 'OnlineOrders', no, null, { phone: phone, total: row.total, trays: trays });
      Online.tell(cfg.shop, ['طلبية زبون ' + no, name + ' – ' + p.date + ' ' + p.time + ' – ' + row.total + ' ر.ق'],
        ['Customer order ' + no, name + ' – ' + p.date + ' ' + p.time + ' – ' + row.total + ' QR']);
      Version.bump();
      return { no: no, token: token, total: row.total };
    });
  },

  find: function (token) {
    var o = Repo.find('OnlineOrders', 'token_hash', Auth.hashPin(String(token || ''), 'online'));
    Util.require(o, 'not_found');
    return o;
  },

  /** What the customer sees of their order. p: {token} */
  track: function (p) {
    var o = Online.find(p.token);
    var cfg = Online.cfg();
    return { no: o.no, status: o.status, reason: o.reason || '', date: o.date, time: o.time, name: o.name, address: o.address, note: o.note,
             lines: JSON.parse(o.lines || '[]'), fees: JSON.parse(o.fees || '[]'), goods: Number(o.goods), fee_total: Number(o.fee_total),
             deposit: Number(o.deposit), total: Number(o.total), created_at: o.created_at, called: !!o.called_at, whatsapp: cfg.whatsapp };
  },

  /** The customer cancels while it is new. p: {token} */
  cancel: function (p) {
    return withLock(function () {
      var o = Online.find(p.token);
      if (o.status === 'cancelled') return { status: 'cancelled' };
      Util.require(o.status === 'new', 'online_cancel_late');
      Repo.update('OnlineOrders', 'no', o.no, { status: 'cancelled', cancelled_at: Util.nowIso(), reason: 'customer' });
      Audit.log('online', 'online_cancel', 'OnlineOrders', o.no, null, null);
      Online.tell(o.shop, ['ألغى الزبون ' + o.no, o.name], ['Customer cancelled ' + o.no, o.name]);
      Version.bump();
      return { status: 'cancelled' };
    });
  },

  // ---------- the shop that makes them
  /** The people told of these orders: who decides them in that shop (its cashier, its manager) and the admin. */
  people: function (shop) {
    return Repo.all('Users').filter(function (u) {
      if (u.active !== true || u.developer === true) return false;
      var perms = Perm.permsOf(u);
      if (perms.indexOf('online.list') < 0) return false;
      return u.role === 'admin' || String(u.shop || '') === shop || Branches.ofUser(u).indexOf(shop) >= 0;
    }).map(function (u) { return u.user_id; });
  },
  tell: function (shop, ar, en) {
    var ids = Online.people(shop);
    if (ids.length) Push.toUsers(ids, { ar: { title: ar[0], body: ar[1] || '' }, en: { title: en[0], body: en[1] || '' }, page: 'online', badge: 1 });
  },

  /** May this session work on that shop's orders? The admin, its cashier (on shift there) or its manager. */
  mine: function (session, shop) {
    if (session.role === 'admin') return true;
    var u = Repo.find('Users', 'user_id', session.user_id) || {};
    return String(u.shop || '') === shop || Branches.ofUser(u).indexOf(shop) >= 0;
  },

  view: function (o) {
    var out = {};
    Object.keys(o).forEach(function (k) { if (k !== 'token_hash' && k !== 'client_id') out[k] = o[k]; });
    out.lines = JSON.parse(o.lines || '[]');
    out.fees = JSON.parse(o.fees || '[]');
    ['goods', 'fee_total', 'deposit', 'total', 'trays'].forEach(function (k) { out[k] = Number(o[k]) || 0; });
    return out;
  },

  /** The shop's orders: the open ones and the last days'. Also tells of orders left without an answer. */
  list: function (session) {
    var cfg = Online.cfg();
    Util.require(Online.mine(session, cfg.shop), 'forbidden');
    Online.checkLate();
    var since = Util.today().slice(0, 8) + '01';
    var rows = Repo.all('OnlineOrders').filter(function (o) {
      return o.shop === cfg.shop && (['new', 'accepted', 'out'].indexOf(o.status) >= 0 || String(o.date) >= since);
    }).sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }).slice(0, 200).map(Online.view);
    var drivers = Repo.all('Users').filter(function (u) { return u.role === 'driver' && u.active === true; }).map(function (u) { return { id: u.user_id, name: u.display_name }; });
    var items = Repo.all('Items').filter(function (i) { return i.active === true && i.online === true; })
      .map(function (i) { return { id: i.item_id, name: i.name, name_ar: i.name_ar || '', out: String(i.online_out || '') === Util.today() }; });
    return { orders: rows, drivers: drivers, items: items, shop: cfg.shop, reply_min: cfg.reply_min };
  },

  /** An order of the shop, for one of its steps. */
  act: function (session, p, from, change, auditName) {
    return withLock(function () {
      var o = Repo.find('OnlineOrders', 'no', String(p.no || ''));
      Util.require(o, 'not_found');
      Util.require(Online.mine(session, o.shop), 'forbidden');
      Util.require(from.indexOf(o.status) >= 0, 'online_status', o.status);
      var ch = change(o);
      Repo.update('OnlineOrders', 'no', o.no, ch);
      Audit.log(session.user_id, auditName, 'OnlineOrders', o.no, { status: o.status }, ch);
      return { order: Online.view(Repo.find('OnlineOrders', 'no', o.no)), version: Version.bump() };
    });
  },

  called: function (session, p) {
    return Online.act(session, p, ['new', 'accepted'], function () { return { called_at: Util.nowIso(), called_by: session.user_id }; }, 'online_called');
  },
  accept: function (session, p) {
    return Online.act(session, p, ['new'], function () { return { status: 'accepted', decided_at: Util.nowIso(), decided_by: session.user_id }; }, 'online_accept');
  },
  reject: function (session, p) {
    var reason = Util.clean(p.reason);
    Util.require(reason, 'reason_required');
    return Online.act(session, p, ['new', 'accepted'], function () { return { status: 'rejected', reason: reason, decided_at: Util.nowIso(), decided_by: session.user_id }; }, 'online_reject');
  },
  out: function (session, p) {
    var d = p.driver ? Repo.find('Users', 'user_id', String(p.driver)) : null;
    Util.require(!p.driver || (d && d.role === 'driver'), 'driver_invalid');
    return Online.act(session, p, ['accepted'], function () { return { status: 'out', out_at: Util.nowIso(), driver: d ? d.user_id : '' }; }, 'online_out');
  },
  delivered: function (session, p) {
    return Online.act(session, p, ['out', 'accepted'], function () { return { status: 'delivered', delivered_at: Util.nowIso() }; }, 'online_delivered');
  },

  /** New orders left without an answer past the minutes the admin set: the shop's manager and the admin are told (once). */
  checkLate: function () {
    var cfg = Online.cfg();
    var late = Repo.all('OnlineOrders').filter(function (o) {
      if (o.status !== 'new' || o.alert_at) return false;
      var t0 = new Date(String(o.created_at).slice(0, 16) + ':00Z').getTime();
      var now = new Date(Util.nowIso().slice(0, 16) + ':00Z').getTime();
      return (now - t0) / 60000 >= cfg.reply_min;
    });
    if (!late.length) return 0;
    withLock(function () { late.forEach(function (o) { Repo.update('OnlineOrders', 'no', o.no, { alert_at: Util.nowIso() }); }); });
    var to = Branches.managers(cfg.shop).concat(Repo.all('Users').filter(function (u) { return u.role === 'admin' && u.active === true && u.developer !== true; }).map(function (u) { return u.user_id; }));
    if (to.length) Push.toUsers(to.filter(function (x, i, a) { return a.indexOf(x) === i; }), {
      ar: { title: 'طلبية زبون بلا رد', body: late.map(function (o) { return o.no; }).join('، ') + ' – أكثر من ' + cfg.reply_min + ' دقيقة' },
      en: { title: 'Customer order not answered', body: late.map(function (o) { return o.no; }).join(', ') + ' – over ' + cfg.reply_min + ' min' },
      page: 'online', badge: 1 });
    return late.length;
  },

  /** The orders of the shop waiting for an answer (the number on the menu). */
  pending: function (session) {
    var cfg = Online.cfg();
    if (!Online.mine(session, cfg.shop)) return 0;
    return Repo.all('OnlineOrders').filter(function (o) { return o.shop === cfg.shop && o.status === 'new'; }).length;
  },

  /** The admin's settings screen: the settings, every final product with its online marks, the shops, the blocked numbers. */
  settings: function () {
    var items = Repo.all('Items').filter(function (i) { return i.active === true && Stores.of(i) === 'FINAL'; })
      .map(function (i) { return { id: i.item_id, name: i.name, name_ar: i.name_ar || '', price: Number(i.final_price) || 0, online: i.online === true,
                                   req: i.online_req === true, photo: i.online_photo || '' }; })
      .sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return { cfg: Online.cfg(), items: items, blocked: Online.blocked(),
             shops: Repo.all('Parties').filter(function (x) { return x.kind === 'shop' && x.active === true; }).map(function (x) { return { id: x.party_id, name: x.name }; }) };
  }
};
