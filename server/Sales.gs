/**
 * Sales.gs – the daily sales sheet of each shop (it replaces the accountant's Excel sheet).
 *
 * One row per shop and day: the cash (from the shifts of that day: what the accountant received, else what
 * the cashiers declared) and the other channels the accountant types (bank card, delivery apps, qlub…).
 * The channels are a list in the settings (Settings.sales_channels), each for every shop or for some only.
 * The accountant sends the sheet; the admin approves it (then it is fixed) or returns it with a note.
 * Status: draft → submitted → approved | returned (→ submitted again).
 */
var SALES_DEFAULT = [
  { id: 'card', name_ar: 'البطاقة البنكية', name_en: 'Bank card', shops: [], active: true },
  { id: 'snoonu', name_ar: 'سنونو', name_en: 'Snoonu', shops: [], active: true },
  { id: 'keeta', name_ar: 'كيتا', name_en: 'Keeta', shops: [], active: true },
  { id: 'talabat', name_ar: 'طلبات', name_en: 'Talabat', shops: [], active: true },
  { id: 'qlub', name_ar: 'qlub', name_en: 'qlub', shops: ['pearl'], active: true }
];

var Sales = {
  /** The channels (the default list until the admin saves one; "pearl" in the default is the Pearl shop, found by name). */
  channels: function () {
    var raw = Settings.get('sales_channels', '');
    if (raw) { try { return JSON.parse(raw); } catch (e) { /* a broken setting: the default */ } }
    var pearl = Repo.all('Parties').filter(function (p) { return p.kind === 'shop' && /لؤلؤ|pearl/i.test(p.name); }).map(function (p) { return p.party_id; });
    // qlub with no Pearl shop found stays stopped (an empty list would mean every shop)
    return SALES_DEFAULT.map(function (c) { return c.shops[0] === 'pearl' ? Object.assign({}, c, { shops: pearl, active: pearl.length > 0 }) : Object.assign({}, c, { shops: [] }); });
  },

  /** The admin's list. p.channels: [{id, name_ar, name_en, shops, active}]. A channel is never removed, only stopped (old sheets keep it). */
  setChannels: function (session, p) {
    var list = (p.channels || []).map(function (c, i) {
      var id = Util.clean(c.id) || ('ch' + (i + 1));
      Util.require(/^[a-z0-9_]{1,20}$/.test(id), 'channel_invalid', id);
      Util.require(Util.clean(c.name_ar) || Util.clean(c.name_en), 'name_required');
      return { id: id, name_ar: Util.clean(c.name_ar), name_en: Util.clean(c.name_en), active: c.active !== false,
        shops: (c.shops || []).filter(function (s) { var x = Repo.find('Parties', 'party_id', s); return x && x.kind === 'shop'; }) };
    });
    Util.require(list.length, 'nothing_to_save');
    var ids = {};
    list.forEach(function (c) { Util.require(!ids[c.id], 'channel_invalid', c.id); ids[c.id] = true; });
    var old = Sales.channels();
    old.forEach(function (c) { if (!ids[c.id]) list.push(Object.assign({}, c, { active: false })); });
    return withLock(function () {
      Settings.set('sales_channels', JSON.stringify(list));
      Audit.log(session.user_id, 'sales_channels', 'Settings', 'sales_channels', null, list);
      return { channels: list, version: Version.bump() };
    });
  },

  /** The cash of a shop's shifts closed that day: received by the accountant, else declared. */
  cashOf: function (shop, date) {
    var c = 0, open = 0;
    Repo.all('Shifts').forEach(function (s) {
      if (s.shop_party_id !== shop || String(s.closed_at || '').slice(0, 10) !== date) return;
      var got = s.received_amount === '' || s.received_amount === undefined ? null : Number(s.received_amount);
      if (got === null) open++;
      c += got === null ? Number(s.amount) || 0 : got;
    });
    return { cash: Util.round(c), not_received: open };
  },

  view: function (r) {
    var ch = {};
    try { ch = JSON.parse(r.channels || '{}'); } catch (e) { ch = {}; }
    return { day_id: r.day_id, date: r.date, shop_party_id: r.shop_party_id, cash: Number(r.cash) || 0, channels: ch, total: Number(r.total) || 0,
      status: r.status, note: r.note || '', return_note: r.return_note || '', submitted_at: r.submitted_at || '', decided_at: r.decided_at || '',
      mgr_note: r.mgr_note || '' };
  },

  /** p: {date} → every active shop that day: its sheet, or a new one with the cash of its shifts. p: {from, to, status} → the sheets. */
  list: function (session, p) {
    p = p || {};
    if (p.date) {
      var rows = Repo.all('DailySales').filter(function (r) { return r.date === p.date; });
      return Repo.all('Parties').filter(function (x) { return x.kind === 'shop' && x.active === true; }).map(function (x) {
        var r = rows.filter(function (y) { return y.shop_party_id === x.party_id; })[0];
        var c = Sales.cashOf(x.party_id, p.date);
        var v = r ? Sales.view(r) : { day_id: '', date: p.date, shop_party_id: x.party_id, cash: c.cash, channels: {}, total: c.cash, status: '', note: '', return_note: '' };
        // a sheet not sent yet follows the shifts; a sent one keeps the cash it was sent with
        if (!r || r.status === 'draft' || r.status === 'returned') v.cash = c.cash;
        v.not_received = c.not_received;
        return v;
      });
    }
    return Repo.all('DailySales').filter(function (r) {
      return (!p.from || r.date >= p.from) && (!p.to || r.date <= p.to) && (!p.status || r.status === p.status);
    }).map(Sales.view).sort(function (a, b) { return a.date === b.date ? String(a.shop_party_id).localeCompare(String(b.shop_party_id)) : a.date < b.date ? 1 : -1; });
  },

  /** The accountant. p: {date, shop_party_id, channels: {id: amount}, note, submit, client_id}. */
  save: function (session, p) {
    var date = Util.clean(p.date);
    Util.require(Util.isDate(date) && date <= Util.today(), 'date_invalid');
    Period.require(date);
    var shop = Repo.find('Parties', 'party_id', p.shop_party_id);
    Util.require(shop && shop.kind === 'shop', 'party_invalid');
    var allowed = {};
    Sales.channels().forEach(function (c) { if (c.active && (!c.shops.length || c.shops.indexOf(shop.party_id) >= 0)) allowed[c.id] = true; });
    var ch = {};
    Object.keys(p.channels || {}).forEach(function (k) {
      if (p.channels[k] === '' || p.channels[k] === null || p.channels[k] === undefined) return;
      Util.require(allowed[k], 'channel_invalid', k);
      var a = Util.num(p.channels[k]);
      Util.require(a !== null && a >= 0, 'amount_invalid', k);
      ch[k] = Util.round(a);
    });
    return withLock(function () {
      var cur = Repo.all('DailySales').filter(function (r) { return r.date === date && r.shop_party_id === shop.party_id; })[0];
      Util.require(!cur || cur.status === 'draft' || cur.status === 'returned', 'sales_locked', cur ? cur.status : '');
      var cash = Sales.cashOf(shop.party_id, date).cash;
      var total = Util.round(cash + Object.keys(ch).reduce(function (s, k) { return s + ch[k]; }, 0));
      var now = Util.nowIso();
      var row = { date: date, shop_party_id: shop.party_id, cash: cash, channels: JSON.stringify(ch), total: total, note: Util.clean(p.note),
        status: p.submit === true ? 'submitted' : 'draft', submitted_at: p.submit === true ? now : '', updated_at: now };
      var id;
      if (cur) { id = cur.day_id; Repo.update('DailySales', 'day_id', id, row); }
      else {
        id = 'DS' + Util.pad(Settings.next('seq_sales', 0), 5);
        Repo.append('DailySales', [Object.assign({ day_id: id, created_by: session.user_id, created_at: now, return_note: '', decided_by: '', decided_at: '', client_id: Util.clean(p.client_id) }, row)]);
      }
      Audit.log(session.user_id, p.submit === true ? 'sales_submit' : 'sales_save', 'DailySales', id, null, row);
      if (p.submit === true) OrderNotify.send(Push.usersWith('sales.decide'), session, 'accounts',
        ['يومية مبيعات للاعتماد', shop.name + ' – ' + date + ' – ' + total + ' QR'], ['Daily sales to approve', shop.name + ' – ' + date + ' – ' + total + ' QR']);
      return { day: Sales.view(Repo.find('DailySales', 'day_id', id)), version: Version.bump() };
    });
  },

  /** The admin approves (fixed after) or returns with a note. p: {day_id, ok, note}. */
  decide: function (session, p) {
    return withLock(function () {
      var r = Repo.find('DailySales', 'day_id', p.day_id);
      Util.require(r, 'not_found');
      Util.require(r.status === 'submitted', 'sales_locked', r.status);
      var note = Util.clean(p.note);
      Util.require(p.ok === true || note, 'reason_required');
      var now = Util.nowIso();
      var res = Repo.update('DailySales', 'day_id', r.day_id, { status: p.ok === true ? 'approved' : 'returned', return_note: p.ok === true ? '' : note,
        decided_by: session.user_id, decided_at: now, updated_at: now });
      Audit.log(session.user_id, p.ok === true ? 'sales_approve' : 'sales_return', 'DailySales', r.day_id, res.before, res.after);
      var shop = (Repo.find('Parties', 'party_id', r.shop_party_id) || {}).name || r.shop_party_id;
      if (p.ok !== true) OrderNotify.send([r.created_by], session, 'accounts', ['أُعيدت يومية المبيعات', shop + ' – ' + r.date + ': ' + note],
        ['Daily sales returned', shop + ' – ' + r.date + ': ' + note]);
      return { day: Sales.view(res.after), version: Version.bump() };
    });
  },

  /** The sales of a shop over a period, per day: the approved sheet when there is one, else the cash of the shifts. */
  byShop: function (from, to) {
    var out = {}, sheet = {};
    Repo.all('DailySales').forEach(function (r) {
      if (r.status !== 'approved' || (from && r.date < from) || (to && r.date > to)) return;
      sheet[r.shop_party_id + '|' + r.date] = true;
      out[r.shop_party_id] = Util.round((out[r.shop_party_id] || 0) + (Number(r.total) || 0));
    });
    Repo.all('Shifts').forEach(function (s) {
      var d = String(s.closed_at || '').slice(0, 10);
      if (!d || (from && d < from) || (to && d > to) || sheet[s.shop_party_id + '|' + d]) return;
      out[s.shop_party_id] = Util.round((out[s.shop_party_id] || 0) + (Number(s.amount) || 0));
    });
    return out;
  }
};
