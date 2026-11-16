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
// handed: given to the driver at the shop; out: the driver left with it (the customer is told then)
var ONLINE_STATUSES = ['new', 'accepted', 'handed', 'out', 'delivered', 'rejected', 'cancelled'];
var ONLINE_OPEN = ['new', 'accepted', 'handed', 'out'];
var ONLINE_DEFAULTS = {
  shop: '', whatsapp: '', min_req: 1, lead_min: 180, reply_min: 15, max_open: 2, return_days: 7,
  // paying cash at a shop before the delivery: allowed or not, and how many minutes before the delivery time at the latest
  pay_shop: true, pay_min: 120,
  // a bank transfer with Fawran (after the shop accepts): the number or alias to transfer to; empty = not offered
  fawran: '',
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
  /** The trusted customers (by mobile): they may pay on delivery, in cash or by card. */
  trusted: function () {
    try { return JSON.parse(Settings.get('online_trusted', '[]')) || []; } catch (e) { return []; }
  },
  /** Paying on delivery is open to all when no other way is offered (else nobody could order). */
  codOpen: function (cfg) { return !cfg.pay_shop && !cfg.fawran; },
  /** The customer's page: may this mobile pay on delivery? p: {phone} */
  trust: function (p) {
    var cfg = Online.cfg(), ph = Online.phone(p.phone);
    return { cod: Online.codOpen(cfg) || (ph.length >= 8 && Online.trusted().indexOf(ph) >= 0) };
  },
  /** The shop marks a customer trusted (or not) after calling them. p: {phone, on} */
  setTrusted: function (session, p) {
    var cfg = Online.cfg();
    Util.require(Online.mine(session, cfg.shop), 'forbidden');
    var ph = Online.phone(p.phone);
    Util.require(ph.length >= 8, 'online_phone_invalid');
    return withLock(function () {
      var list = Online.trusted().filter(function (x) { return x !== ph; });
      if (p.on === true) list.push(ph);
      Settings.set('online_trusted', JSON.stringify(list));
      Audit.log(session.user_id, 'online_trusted', 'Settings', ph, null, { on: p.on === true });
      return { phone: ph, trusted: p.on === true };
    });
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
      pay_shop: c.pay_shop !== false, pay_min: num(c.pay_min, 15, 7 * 24 * 60, 120), fawran: Util.clean(c.fawran).slice(0, 60),
      terms_ar: String(c.terms_ar || '').slice(0, 2000), terms_en: String(c.terms_en || '').slice(0, 2000), fees: fees, hours: hours };
    var blocked = (p.blocked || []).map(Online.phone).filter(function (x) { return x.length >= 6; });
    return withLock(function () {
      Settings.set('online_cfg', JSON.stringify(cfg));
      if (p.blocked !== undefined) Settings.set('online_blocked', JSON.stringify(blocked));
      if (p.trusted !== undefined) Settings.set('online_trusted', JSON.stringify((p.trusted || []).map(Online.phone).filter(function (x) { return x.length >= 8; })));
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
             terms_ar: cfg.terms_ar, terms_en: cfg.terms_en, whatsapp: cfg.whatsapp, pay_shop: cfg.pay_shop, pay_min: cfg.pay_min, fawran: !!cfg.fawran } };
    try { cache.put('online_cat_' + v, JSON.stringify(out), 600); } catch (e) { /* too big for the cache: built each time */ }
    return out;
  },

  /** A product photo of the page (only photos of the products offered). p: {id} */
  photo: function (p) {
    var id = String(p.id || '');
    Util.require(Repo.all('Items').some(function (i) { return i.online === true && i.online_photo === id; }), 'not_found');
    return Photos.get(null, { photo_id: id });
  },

  /** Several photos of the page in one call (the page asks for all it lacks at once). p: {ids} -> {id: data URL} */
  photos: function (p) {
    var offered = {};
    Repo.all('Items').forEach(function (i) { if (i.online === true && i.online_photo) offered[i.online_photo] = true; });
    var want = {};
    (p.ids || []).slice(0, 60).forEach(function (id) { if (offered[String(id)]) want[String(id)] = []; });
    Repo.all('Photos').forEach(function (x) { if (want[x.photo_id]) want[x.photo_id].push(x); });
    var out = {};
    Object.keys(want).forEach(function (id) {
      if (!want[id].length) return;
      out[id] = want[id].sort(function (a, b) { return Number(a.part) - Number(b.part); }).map(function (x) { return String(x.data); }).join('');
    });
    return out;
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
    // cash on delivery, or cash at a shop the customer chooses (before the delivery, by the time the admin set)
    // how it is paid: cash at a shop, a Fawran transfer (both before it leaves), or on delivery in cash or by card (trusted customers)
    var pay = String(p.pay || '');
    if (pay === 'shop') Util.require(cfg.pay_shop, 'online_pay_method');
    else if (pay === 'fawran') Util.require(cfg.fawran, 'online_pay_method');
    else {
      pay = pay === 'card' ? 'card' : 'delivery';
      Util.require(Online.codOpen(cfg) || Online.trusted().indexOf(phone) >= 0, 'online_pay_method');
    }
    var payShop = '';
    if (pay === 'fawran') Util.require(Online.untilMinutes(p.date, p.time) >= cfg.pay_min + 30, 'online_pay_too_late', String(cfg.pay_min + 30));
    if (pay === 'shop') {
      var ps = Repo.find('Parties', 'party_id', String(p.pay_shop || ''));
      Util.require(ps && ps.kind === 'shop' && ps.active === true, 'online_pay_shop');
      payShop = ps.party_id;
      Util.require(Online.untilMinutes(p.date, p.time) >= cfg.pay_min + 30, 'online_pay_too_late', String(cfg.pay_min + 30));
    }
    var pushToken = '';
    try { pushToken = p.push_token ? Push.token(p.push_token) : ''; } catch (e) { pushToken = ''; }
    return withLock(function () {
      var cid = Util.clean(p.client_id);
      if (cid) {
        var dup = Repo.find('OnlineOrders', 'client_id', cid);
        if (dup) return { no: dup.no, duplicate: true };
      }
      // no more open orders from the same number than the admin allows (orders sent in jest)
      var open = Repo.all('OnlineOrders').filter(function (o) { return o.phone === phone && ONLINE_OPEN.indexOf(o.status) >= 0; }).length;
      Util.require(open < cfg.max_open, 'online_too_many');
      var no = 'W' + Util.pad(Settings.next('seq_online', 0), 5);
      var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
      var now = Util.nowIso();
      var from = Repo.find('Parties', 'party_id', String(p.from || ''));
      var row = { no: no, token_hash: Auth.hashPin(token, 'online'), client_id: cid, created_at: now, from_shop: from && from.kind === 'shop' ? from.party_id : '',
        shop: cfg.shop, name: name, phone: phone, address: address, map: Util.clean(p.map).slice(0, 300), date: p.date, time: p.time,
        note: String(p.note || '').slice(0, 600), lines: JSON.stringify(lines), fees: JSON.stringify(fees), goods: goods, fee_total: feeSum,
        deposit: deposit, trays: trays, total: Util.round(goods + feeSum), pay: pay, pay_shop: payShop, status: 'new', reason: '', terms_at: now,
        called_at: '', called_by: '', decided_at: '', decided_by: '', out_at: '', driver: '', delivered_at: '', cancelled_at: '', alert_at: '',
        paid_at: '', paid_by: '', paid_shop: '', paid_shift: '', push_token: pushToken, push_lang: p.lang === 'en' ? 'en' : 'ar', alt_hashes: '' };
      Repo.append('OnlineOrders', [row]);
      Audit.log('online', 'online_order', 'OnlineOrders', no, null, { phone: phone, total: row.total, trays: trays });
      Online.tell(cfg.shop, ['طلبية زبون ' + no, name + ' – ' + p.date + ' ' + p.time + ' – ' + row.total + ' ر.ق'],
        ['Customer order ' + no, name + ' – ' + p.date + ' ' + p.time + ' – ' + row.total + ' QR']);
      Version.bump();
      return { no: no, token: token, total: row.total };
    });
  },

  find: function (token) {
    var hash = Auth.hashPin(String(token || ''), 'online');
    var o = Repo.find('OnlineOrders', 'token_hash', hash);
    // a link given again to the customer on another phone (online.recover)
    if (!o) o = Repo.all('OnlineOrders').filter(function (x) { return x.alt_hashes && String(x.alt_hashes).indexOf(hash) >= 0; })[0];
    Util.require(o, 'not_found');
    return o;
  },

  /** Paid before it leaves (at a shop or by Fawran). */
  prepaid: function (o) { return o.pay === 'shop' || o.pay === 'fawran'; },
  /** Paid on delivery in cash: the driver hands the money to the shop. */
  cashDue: function (o) { return o.pay !== 'shop' && o.pay !== 'fawran' && o.pay !== 'card'; },

  shopName: function (id) { var x = id ? Repo.find('Parties', 'party_id', id) : null; return x ? x.name : ''; },
  /** The latest time to pay at the shop: the delivery time less the minutes the admin set ("YYYY-MM-DD HH:MM"). */
  payBy: function (o, cfg) {
    var t = new Date(o.date + 'T' + o.time + ':00Z').getTime() - (cfg || Online.cfg()).pay_min * 60000;
    return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
  },

  /** The customer's phone: a notification about their order (when they allowed them). */
  notify: function (o, ar, en) {
    if (!o.push_token) return;
    var lang = o.push_lang === 'en' ? en : ar;
    Push.toTokens([o.push_token], { ar: { title: lang[0], body: lang[1] || '' }, page: 'order:' + o.no, badge: 1 });
  },

  /** The customer allowed notifications: their orders on this phone send to it. p: {tokens: [order links], push_token, lang} */
  subscribe: function (p) {
    var pt = Push.token(p.push_token);
    var lang = p.lang === 'en' ? 'en' : 'ar';
    var rows = (p.tokens || []).slice(0, 30).map(function (t) { try { return Online.find(t); } catch (e) { return null; } }).filter(Boolean);
    if (!rows.length) return { subscribed: 0 };
    return withLock(function () {
      rows.forEach(function (o) { Repo.update('OnlineOrders', 'no', o.no, { push_token: pt, push_lang: lang }); });
      return { subscribed: rows.length };
    });
  },

  /** On another phone (or the app added to the home screen): the order found again by its number and the customer's mobile. p: {no, phone} */
  recover: function (p) {
    var o = Repo.find('OnlineOrders', 'no', String(p.no || '').trim().toUpperCase());
    Util.require(o && o.phone === Online.phone(p.phone), 'not_found');
    return withLock(function () {
      var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
      var alt = String(o.alt_hashes || '').split(',').filter(Boolean).slice(-4).concat([Auth.hashPin(token, 'online')]);
      Repo.update('OnlineOrders', 'no', o.no, { alt_hashes: alt.join(',') });
      Audit.log('online', 'online_recover', 'OnlineOrders', o.no, null, null);
      return { no: o.no, token: token, date: o.date, time: o.time, total: Number(o.total) };
    });
  },

  /** What the customer sees of their order. p: {token} */
  track: function (p) {
    Online.checkUnpaid();
    Online.checkKept();
    var o = Online.find(p.token);
    var cfg = Online.cfg();
    return { no: o.no, status: o.status, reason: o.reason || '', date: o.date, time: o.time, name: o.name, address: o.address, note: o.note,
             lines: JSON.parse(o.lines || '[]'), fees: JSON.parse(o.fees || '[]'), goods: Number(o.goods), fee_total: Number(o.fee_total),
             deposit: Number(o.deposit), total: Number(o.total), created_at: o.created_at, called: !!o.called_at, whatsapp: cfg.whatsapp,
             pay: o.pay || 'delivery', pay_shop: Online.shopName(o.pay_shop), paid: !!o.paid_at, pay_by: Online.prepaid(o) ? Online.payBy(o, cfg) : '',
             fawran: o.pay === 'fawran' ? cfg.fawran : '',
             delivered_at: o.delivered_at || '', trays_state: o.status === 'delivered' && Number(o.trays) > 0 && Number(o.deposit) > 0 ? Online.trayState(o, cfg) : null };
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
    if (ids.length) Push.toUsers(ids, { ar: { title: ar[0], body: ar[1] || '' }, en: { title: en[0], body: en[1] || '' }, page: 'custorders', badge: 1 });
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
    Online.checkUnpaid();
    var since = Util.today().slice(0, 8) + '01';
    var rows = Repo.all('OnlineOrders').filter(function (o) {
      return o.shop === cfg.shop && (ONLINE_OPEN.indexOf(o.status) >= 0 || String(o.date) >= since
        || (o.status === 'delivered' && Online.cashDue(o) && !o.cash_received_at));
    }).sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }).slice(0, 200).map(Online.view);
    var drivers = Repo.all('Users').filter(function (u) { return u.role === 'driver' && u.active === true; }).map(function (u) { return { id: u.user_id, name: u.display_name }; });
    var items = Repo.all('Items').filter(function (i) { return i.active === true && i.online === true; })
      .map(function (i) { return { id: i.item_id, name: i.name, name_ar: i.name_ar || '', out: String(i.online_out || '') === Util.today() }; });
    var names = {};
    Repo.all('Parties').forEach(function (x) { if (x.kind === 'shop') names[x.party_id] = x.name; });
    var trusted = Online.trusted();
    rows.forEach(function (o) { o.pay_shop_name = names[o.pay_shop] || ''; o.paid_shop_name = names[o.paid_shop] || ''; o.trusted = trusted.indexOf(o.phone) >= 0; });
    return { orders: rows, drivers: drivers, items: items, shop: cfg.shop, reply_min: cfg.reply_min };
  },

  /** An order of the shop, for one of its steps. */
  act: function (session, p, from, change, auditName) {
    return withLock(function () {
      var o = Repo.find('OnlineOrders', 'no', String(p.no || ''));
      Util.require(o, 'not_found');
      // the driver's steps are theirs only (the order they took); the rest are the shop's
      var driverStep = ['online_depart', 'online_delivered', 'online_cash_given'].indexOf(auditName) >= 0;
      Util.require(driverStep ? (o.driver && o.driver === session.user_id) : Online.mine(session, o.shop), 'forbidden');
      Util.require(from.indexOf(o.status) >= 0, 'online_status', o.status);
      var ch = change(o);
      Repo.update('OnlineOrders', 'no', o.no, ch);
      Audit.log(session.user_id, auditName, 'OnlineOrders', o.no, { status: o.status }, ch);
      Online.afterStep(Object.assign({}, o, ch), auditName);
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
  /** The shop gives it to a driver (the driver confirms when they leave with it). p: {no, driver} */
  hand: function (session, p) {
    var d = Repo.find('Users', 'user_id', String(p.driver || ''));
    Util.require(d && d.role === 'driver' && d.active === true, 'driver_invalid');
    return Online.act(session, p, ['accepted', 'handed'], function (o) {
      // to be paid at a shop: it leaves only once paid
      Util.require(!Online.prepaid(o) || o.paid_at, 'online_unpaid');
      return { status: 'handed', handed_at: Util.nowIso(), handed_by: session.user_id, driver: d.user_id };
    }, 'online_hand');
  },
  /** The driver got it and leaves: the customer is told it is on its way. */
  depart: function (session, p) {
    return Online.act(session, p, ['handed'], function () { return { status: 'out', out_at: Util.nowIso() }; }, 'online_depart');
  },
  /** The driver gave the money of an order paid on delivery to the shop (the cashier confirms it). */
  cashGiven: function (session, p) {
    return Online.act(session, p, ['delivered'], function (o) {
      Util.require(Online.cashDue(o), 'online_status', 'paid');
      return { cash_given_at: o.cash_given_at || Util.nowIso() };
    }, 'online_cash_given');
  },
  /** The shop's cashier got the money from the driver. */
  cashIn: function (session, p) {
    var u = Repo.find('Users', 'user_id', session.user_id) || {};
    return Online.act(session, p, ['delivered'], function (o) {
      Util.require(Online.cashDue(o), 'online_status', 'paid');
      if (o.cash_received_at) return {};
      var shift = Repo.all('Shifts').filter(function (s) { return s.user_id === session.user_id && s.shop_party_id === u.shop && !s.closed_at; }).pop();
      return { cash_received_at: Util.nowIso(), cash_received_by: session.user_id, cash_shift: shift ? shift.shift_id : '' };
    }, 'online_cash_in');
  },

  /** After a step: the customer is told, and the driver of an order sent with them. */
  afterStep: function (o, step) {
    var no = o.no;
    if (step === 'online_accept') {
      if (o.pay === 'shop') Online.notify(o, ['قُبلت طلبيتك ' + no, 'ادفع ' + o.total + ' ر.ق نقدًا في ' + Online.shopName(o.pay_shop) + ' قبل ' + Online.payBy(o)],
        ['Your order ' + no + ' is accepted', 'Pay ' + o.total + ' QR cash at ' + Online.shopName(o.pay_shop) + ' before ' + Online.payBy(o)]);
      else if (o.pay === 'fawran') Online.notify(o, ['قُبلت طلبيتك ' + no, 'حوّل ' + o.total + ' ر.ق عبر فورا إلى ' + Online.cfg().fawran + ' قبل ' + Online.payBy(o) + '، وأرسل الإثبات على واتساب'],
        ['Your order ' + no + ' is accepted', 'Transfer ' + o.total + ' QR with Fawran to ' + Online.cfg().fawran + ' before ' + Online.payBy(o) + ', and send the proof on WhatsApp']);
      else Online.notify(o, ['قُبلت طلبيتك ' + no, 'نجهّزها الآن للتسليم ' + o.date + ' ' + o.time], ['Your order ' + no + ' is accepted', 'Being prepared for ' + o.date + ' ' + o.time]);
    }
    if (step === 'online_fawran_ok') Online.notify(o, ['وصل تحويلك، شكرًا – ' + no, Number(o.total) + ' ر.ق'], ['Your transfer arrived, thank you – ' + no, Number(o.total) + ' QR']);
    if (step === 'online_reject') Online.notify(o, ['تعذر تنفيذ طلبيتك ' + no, o.reason], ['Your order ' + no + ' could not be made', o.reason]);
    if (step === 'online_hand' && o.driver) Push.toUsers([o.driver], { ar: { title: 'طلبية زبون للتوصيل ' + no, body: o.name + ' – ' + o.address },
      en: { title: 'Customer order to deliver ' + no, body: o.name + ' – ' + o.address }, page: 'custorders', badge: 1 });
    if (step === 'online_depart') Online.notify(o, ['طلبيتك في الطريق إليك', no], ['Your order is on its way', no]);
    if (step === 'online_delivered') {
      var days = Online.cfg().return_days;
      Online.notify(o, ['سُلّمت طلبيتك ' + no, Number(o.trays) && Number(o.deposit) ? 'أرجع الصواني إلى أي محل خلال ' + days + ' يوم لتسترد ' + Number(o.deposit) + ' ر.ق' : 'بالهناء والعافية'],
        ['Your order ' + no + ' is delivered', Number(o.trays) && Number(o.deposit) ? 'Return the trays to any shop within ' + days + ' days to get ' + Number(o.deposit) + ' QR back' : 'Enjoy!']);
      Online.tell(o.shop, ['سلّم السائق الطلبية ' + no, Online.cashDue(o) ? 'معه ' + Number(o.total) + ' ر.ق' : 'مدفوعة'], ['Driver delivered ' + no, Online.cashDue(o) ? 'Holding ' + Number(o.total) + ' QR' : 'Paid']);
    }
    if (step === 'online_cash_given') Online.tell(o.shop, ['السائق سلّم مبلغ الطلبية ' + no, Number(o.total) + ' ر.ق – أكّد الاستلام'], ['Driver handed the money of ' + no, Number(o.total) + ' QR – confirm']);
  },

  /** The driver: the customers' orders they take (on the way) and those they delivered today. */
  driverList: function (session) {
    var today = Util.today();
    var names = {};
    Repo.all('Parties').forEach(function (x) { if (x.kind === 'shop') names[x.party_id] = x.name; });
    var rows = Repo.all('OnlineOrders').filter(function (o) {
      return o.driver === session.user_id && (o.status === 'handed' || o.status === 'out'
        || (o.status === 'delivered' && (String(o.delivered_at).slice(0, 10) === today || (Online.cashDue(o) && !o.cash_received_at))));
    }).map(Online.view).map(function (o) { o.pay_shop_name = names[o.pay_shop] || ''; o.paid_shop_name = names[o.paid_shop] || ''; return o; });
    return { orders: rows };
  },

  /** Any shop's cashier: the accepted orders to be paid at a shop, not paid yet (only what the cashier needs). */
  payList: function (session) {
    Online.checkUnpaid();
    var u = Repo.find('Users', 'user_id', session.user_id) || {};
    Util.require(session.role === 'admin' || u.shop, 'online_need_shift');
    var cfg = Online.cfg(), names = {};
    Repo.all('Parties').forEach(function (x) { if (x.kind === 'shop') names[x.party_id] = x.name; });
    var today = Util.today();
    var rows = Repo.all('OnlineOrders').filter(function (o) {
      return o.pay === 'shop' && ((o.status === 'accepted' && !o.paid_at) || (o.paid_at && String(o.paid_at).slice(0, 10) === today && o.paid_shop === u.shop));
    }).map(function (o) {
      return { no: o.no, name: o.name, phone: o.phone, total: Number(o.total), date: o.date, time: o.time, pay_shop: o.pay_shop,
               pay_shop_name: names[o.pay_shop] || '', pay_by: Online.payBy(o, cfg), paid: !!o.paid_at, paid_at: o.paid_at || '' };
    });
    return { orders: rows, shop: u.shop || '' };
  },

  /** The shop saw the Fawran transfer arrive (the proof on WhatsApp): the order is paid. p: {no} */
  fawranOk: function (session, p) {
    return Online.act(session, p, ['accepted'], function (o) {
      Util.require(o.pay === 'fawran', 'online_status', o.pay);
      if (o.paid_at) return {};
      return { paid_at: Util.nowIso(), paid_by: session.user_id, paid_shop: o.shop };
    }, 'online_fawran_ok');
  },

  /** A cashier took the money: the order is paid at their shop, in their shift. p: {no} */
  pay: function (session, p) {
    var u = Repo.find('Users', 'user_id', session.user_id) || {};
    Util.require(u.shop, 'online_need_shift');
    return withLock(function () {
      var o = Repo.find('OnlineOrders', 'no', String(p.no || ''));
      Util.require(o && o.pay === 'shop', 'not_found');
      if (o.paid_at) return { order: { no: o.no, paid: true }, duplicate: true };
      Util.require(o.status === 'accepted', 'online_status', o.status);
      var shift = Repo.all('Shifts').filter(function (s) { return s.user_id === session.user_id && s.shop_party_id === u.shop && !s.closed_at; }).pop();
      var ch = { paid_at: Util.nowIso(), paid_by: session.user_id, paid_shop: u.shop, paid_shift: shift ? shift.shift_id : '' };
      Repo.update('OnlineOrders', 'no', o.no, ch);
      Audit.log(session.user_id, 'online_paid', 'OnlineOrders', o.no, null, { total: Number(o.total), shop: u.shop });
      Online.notify(o, ['تم دفع طلبيتك ' + o.no, Number(o.total) + ' ر.ق – شكرًا لك'], ['Your order ' + o.no + ' is paid', Number(o.total) + ' QR – thank you']);
      Online.tell(o.shop, ['دُفعت طلبية الزبون ' + o.no, Online.shopName(u.shop) + ' – ' + Number(o.total) + ' ر.ق'], ['Customer order paid ' + o.no, Online.shopName(u.shop) + ' – ' + Number(o.total) + ' QR']);
      return { order: { no: o.no, paid: true }, version: Version.bump() };
    });
  },

  // ---------- the trays at the customers (and their deposit)
  /** An order's trays: how many are out, the deposit of each, until when they may come back. */
  trayState: function (o, cfg) {
    var trays = Number(o.trays) || 0, back = Number(o.trays_back) || 0, dep = Number(o.deposit) || 0;
    var per = trays ? Util.round(dep / trays) : 0;
    var until = o.delivered_at ? Online.addDays(String(o.delivered_at).slice(0, 10), (cfg || Online.cfg()).return_days) : '';
    return { trays: trays, back: back, out: Math.max(0, trays - back), per: per, until: until, kept: !!o.trays_kept_at,
             deposit_back: Number(o.deposit_back) || 0, log: JSON.parse(o.tray_log || '[]') };
  },
  addDays: function (iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },

  /** Past the days to return them: the deposit of the trays not returned is kept (the tray's price). */
  checkKept: function () {
    var cfg = Online.cfg(), today = Util.today();
    var due = Repo.all('OnlineOrders').filter(function (o) {
      if (o.status !== 'delivered' || o.trays_kept_at || !(Number(o.deposit) > 0)) return false;
      var st = Online.trayState(o, cfg);
      return st.out > 0 && st.until && st.until < today;
    });
    if (!due.length) return 0;
    withLock(function () {
      due.forEach(function (o) {
        Repo.update('OnlineOrders', 'no', o.no, { trays_kept_at: Util.nowIso() });
        Audit.log('online', 'online_trays_kept', 'OnlineOrders', o.no, null, { trays: Online.trayState(o, cfg).out });
        var st = Online.trayState(o, cfg);
        Online.notify(o, ['انتهت مدة إرجاع الصواني ' + o.no, 'احتُسب التأمين ' + Util.round(st.out * st.per) + ' ر.ق ثمنًا لـ ' + st.out + ' صينية'],
          ['Time to return the trays is over ' + o.no, 'The deposit of ' + Util.round(st.out * st.per) + ' QR is kept for ' + st.out + ' tray(s)']);
      });
    });
    return due.length;
  },

  /** Any shop's cashier: the customers who have trays (to take them back and pay the deposit). */
  trays: function (session) {
    Online.checkKept();
    var u = Repo.find('Users', 'user_id', session.user_id) || {};
    Util.require(session.role === 'admin' || u.shop, 'online_need_shift');
    var cfg = Online.cfg(), today = Util.today();
    var rows = Repo.all('OnlineOrders').filter(function (o) { return o.status === 'delivered' && Number(o.trays) > 0 && Number(o.deposit) > 0; }).map(function (o) {
      var st = Online.trayState(o, cfg);
      return { no: o.no, name: o.name, phone: o.phone, trays: st.trays, out: st.out, back: st.back, per: st.per, until: st.until, kept: st.kept,
               delivered: String(o.delivered_at).slice(0, 10), deposit_back: st.deposit_back,
               today_back: st.log.filter(function (l) { return String(l.at).slice(0, 10) === today && l.shop === u.shop; }).reduce(function (s, l) { return s + l.n; }, 0) };
    }).filter(function (r) { return (r.out > 0 && !r.kept) || r.today_back > 0; });
    return { orders: rows, shop: u.shop || '', return_days: cfg.return_days };
  },

  /** A cashier took back trays of an order and paid their deposit from the drawer. p: {no, n} */
  trayReturn: function (session, p) {
    var u = Repo.find('Users', 'user_id', session.user_id) || {};
    Util.require(u.shop, 'online_need_shift');
    var n = Util.num(p.n);
    Util.require(n !== null && n > 0 && Math.round(n) === n, 'qty_invalid');
    return withLock(function () {
      var o = Repo.find('OnlineOrders', 'no', String(p.no || ''));
      Util.require(o && o.status === 'delivered', 'not_found');
      var st = Online.trayState(o);
      Util.require(!st.kept, 'online_trays_kept');
      Util.require(n <= st.out, 'online_trays_too_many', String(st.out));
      var shift = Repo.all('Shifts').filter(function (s) { return s.user_id === session.user_id && s.shop_party_id === u.shop && !s.closed_at; }).pop();
      var amount = Util.round(n * st.per);
      var log = st.log.concat([{ at: Util.nowIso(), by: session.user_id, shop: u.shop, shift: shift ? shift.shift_id : '', n: n, amount: amount }]);
      var ch = { trays_back: st.back + n, deposit_back: Util.round(st.deposit_back + amount), tray_log: JSON.stringify(log) };
      Repo.update('OnlineOrders', 'no', o.no, ch);
      Audit.log(session.user_id, 'online_trays_back', 'OnlineOrders', o.no, null, { n: n, amount: amount, shop: u.shop });
      Online.notify(o, ['استلمنا ' + n + ' صينية – ' + o.no, 'استرددت ' + amount + ' ر.ق في ' + Online.shopName(u.shop) + (st.out - n ? ' – باقي ' + (st.out - n) : '')],
        ['We got ' + n + ' tray(s) back – ' + o.no, amount + ' QR paid back at ' + Online.shopName(u.shop) + (st.out - n ? ' – ' + (st.out - n) + ' left' : '')]);
      return { no: o.no, out: st.out - n, amount: amount, version: Version.bump() };
    });
  },

  /** Orders to be paid at a shop and not paid by their time are cancelled, and the customer and the shop are told. */
  checkUnpaid: function () {
    var cfg = Online.cfg();
    var late = Repo.all('OnlineOrders').filter(function (o) {
      return o.status === 'accepted' && Online.prepaid(o) && !o.paid_at && Online.untilMinutes(o.date, o.time) <= cfg.pay_min;
    });
    if (!late.length) return 0;
    withLock(function () {
      late.forEach(function (o) {
        var cur = Repo.find('OnlineOrders', 'no', o.no);
        if (!cur || cur.status !== 'accepted' || cur.paid_at) return;
        Repo.update('OnlineOrders', 'no', o.no, { status: 'cancelled', reason: 'unpaid', cancelled_at: Util.nowIso() });
        Audit.log('online', 'online_unpaid_cancel', 'OnlineOrders', o.no, null, null);
        Online.notify(o, ['أُلغيت طلبيتك ' + o.no, 'لم تُدفع قبل الموعد'], ['Your order ' + o.no + ' was cancelled', 'It was not paid in time']);
        Online.tell(o.shop, ['أُلغيت طلبية زبون لعدم الدفع ' + o.no, o.name], ['Customer order cancelled, not paid ' + o.no, o.name]);
      });
      Version.bump();
    });
    return late.length;
  },
  delivered: function (session, p) {
    return Online.act(session, p, ['out'], function () { return { status: 'delivered', delivered_at: Util.nowIso() }; }, 'online_delivered');
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
      page: 'custorders', badge: 1 });
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
    return { cfg: Online.cfg(), items: items, blocked: Online.blocked(), trusted: Online.trusted(),
             shops: Repo.all('Parties').filter(function (x) { return x.kind === 'shop' && x.active === true; }).map(function (x) { return { id: x.party_id, name: x.name }; }) };
  }
};
