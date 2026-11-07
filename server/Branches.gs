/**
 * Branches.gs – the branch manager: one or more shops (Users.branches) to follow, nothing to approve.
 *
 * They see their shops' orders (and how late they are), the cashiers' shifts and what was collected,
 * the daily sales sheets, the returns and what was received short. They may add a note to an order
 * (shown to distribution and the shop's cashier) or to a daily sales sheet (shown to the accountant and
 * the admin); a note never changes or holds anything. They are told of their shops' problems
 * (a short receipt, a return, a shift closed without its amount, a difference in the takings).
 */
var Branches = {
  /** Shop IDs of a user row. */
  ofUser: function (u) { return String(u.branches || '').split(',').map(function (x) { return x.trim(); }).filter(String); },

  /** The shops a session follows: its own list; the admin (and the general manager) every shop. */
  of: function (session) {
    if (session.role === 'admin' || session.role === 'pdg') {
      return Repo.all('Parties').filter(function (p) { return p.kind === 'shop' && p.active === true; }).map(function (p) { return p.party_id; });
    }
    return (session.branches || []).slice();
  },

  /** The branch managers of a shop (to tell them). */
  managers: function (shop) {
    return Repo.all('Users').filter(function (u) {
      return u.active === true && u.developer !== true && Branches.ofUser(u).indexOf(shop) >= 0 && Perm.permsOf(u).indexOf('branches.summary') >= 0;
    }).map(function (u) { return u.user_id; });
  },

  /** Tells the managers of a shop (the one who did it is not told). */
  tell: function (shop, session, ar, en) {
    var ids = Branches.managers(shop);
    if (ids.length) OrderNotify.send(ids, session, 'branches', ar, en);
  },

  /** Orders of the session's shops late on their way (the number on the menu). */
  late: function (session) {
    var mine = Branches.of(session);
    return Orders.follow().orders.filter(function (x) { return x.level !== 'ok' && mine.indexOf(x.shop_party_id) >= 0; }).length;
  },

  /**
   * p: {from, to, shop?}. Everything of the session's shops in the period (orders: sent in it, or still on their way).
   */
  summary: function (session, p) {
    p = p || {};
    var from = Util.isDate(p.from) ? p.from : Util.today(), to = Util.isDate(p.to) ? p.to : Util.today();
    var mine = Branches.of(session);
    var shops = p.shop ? mine.filter(function (s) { return s === p.shop; }) : mine;
    var inShops = function (s) { return shops.indexOf(s) >= 0; };
    var inRange = function (d) { d = String(d || '').slice(0, 10); return d && d >= from && d <= to; };
    var follow = {};
    Orders.follow().orders.forEach(function (x) { follow[x.order_id] = x; });
    var orders = [], shorts = [];
    Repo.all('Orders').forEach(function (o) {
      if (!inShops(o.shop_party_id) || o.status === 'draft' || !o.sent_at) return;
      var open = ['invoiced', 'rejected', 'cancelled'].indexOf(o.status) < 0;
      if (!inRange(o.sent_at) && !(open && String(o.sent_at).slice(0, 10) <= to)) return;
      var v = Orders.view(o), f = follow[o.order_id];
      var short = v.lines.filter(function (l) { return l.short_reason; });
      orders.push({ order_id: o.order_id, order_no: o.order_no, shop_party_id: o.shop_party_id, kind: o.kind || '', status: v.status,
        sent_at: o.sent_at, delivery_date: o.delivery_date, received_at: o.received_at || '', note: o.note || '', reason: o.reason || '',
        diff_status: o.diff_status || '', lines: v.lines.length, short: short.length,
        level: f ? f.level : 'ok', hours: f ? f.hours : '', limit: f ? f.limit : '',
        mgr_note: o.mgr_note || '', mgr_note_at: o.mgr_note_at || '' });
      if (o.received_at && inRange(o.received_at)) short.forEach(function (l) {
        shorts.push({ order_id: o.order_id, order_no: o.order_no, shop_party_id: o.shop_party_id, received_at: o.received_at, item_id: l.item_id,
          qty: l.approved_qty === '' ? l.qty : l.approved_qty, received_qty: l.received_qty, unit: l.unit, reason: l.short_reason, note: l.short_note,
          decision: l.short_decision });
      });
    });
    var shifts = Repo.all('Shifts').filter(function (s) { return inShops(s.shop_party_id) && (s.closed_at ? inRange(s.closed_at) : true); }).map(function (s) {
      var v = s.closed_at ? Takings.view(s) : { shift_id: s.shift_id, user_id: s.user_id, cashier: (Repo.find('Users', 'user_id', s.user_id) || {}).display_name || s.user_id,
        shop_party_id: s.shop_party_id, opened_at: s.opened_at, closed_at: '', amount: '', undeclared: false, received_amount: '', diff: '' };
      v.open = !s.closed_at;
      return v;
    }).sort(function (a, b) { return String(b.closed_at || '9').localeCompare(String(a.closed_at || '9')) || String(b.opened_at).localeCompare(String(a.opened_at)); });
    var sales = Repo.all('DailySales').filter(function (r) { return inShops(r.shop_party_id) && r.date >= from && r.date <= to; }).map(function (r) {
      var v = Sales.view(r);
      v.mgr_note = r.mgr_note || ''; v.mgr_note_at = r.mgr_note_at || '';
      return v;
    }).sort(function (a, b) { return a.date === b.date ? String(a.shop_party_id).localeCompare(String(b.shop_party_id)) : a.date < b.date ? 1 : -1; });
    var returns = Repo.all('Returns').filter(function (r) { return inShops(r.shop_party_id) && inRange(r.date || r.created_at); }).map(Returns.view)
      .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
    // per shop: what it sold (approved sheets, else its shifts), what was collected short or over, the orders late, the returns
    var bySales = Sales.byShop(from, to), per = {};
    shops.forEach(function (s) { per[s] = { shop_party_id: s, sales: bySales[s] || 0, diff: 0, open_shifts: 0, undeclared: 0, orders: 0, late: 0, returns: 0, short: 0 }; });
    orders.forEach(function (o) { per[o.shop_party_id].orders++; if (o.level !== 'ok') per[o.shop_party_id].late++; });
    shifts.forEach(function (s) {
      if (s.open) per[s.shop_party_id].open_shifts++;
      if (s.undeclared) per[s.shop_party_id].undeclared++;
      if (s.diff !== '' && s.diff !== undefined) per[s.shop_party_id].diff = Util.round(per[s.shop_party_id].diff + Number(s.diff));
    });
    returns.forEach(function (r) { per[r.shop_party_id].returns++; });
    shorts.forEach(function (x) { per[x.shop_party_id].short++; });
    return { from: from, to: to, shops: mine, per: shops.map(function (s) { return per[s]; }), orders: orders, shifts: shifts, sales: sales,
      returns: returns, shorts: shorts, version: Version.get() };
  },

  /**
   * A note of the branch manager. p: {kind: 'order' | 'sales', id, note} ('' removes it).
   * Order: shown to distribution and the shop's cashier; daily sales sheet: to the accountant and the admin.
   */
  note: function (session, p) {
    var note = Util.clean(p.note);
    Util.require(note.length <= 500, 'note_too_long');
    var table = p.kind === 'order' ? 'Orders' : p.kind === 'sales' ? 'DailySales' : '';
    Util.require(table, 'bad_request');
    var key = table === 'Orders' ? 'order_id' : 'day_id';
    return withLock(function () {
      var r = Repo.find(table, key, p.id);
      Util.require(r, 'not_found');
      Util.require(Branches.of(session).indexOf(r.shop_party_id) >= 0, 'forbidden');
      var now = Util.nowIso();
      var res = Repo.update(table, key, r[key], { mgr_note: note, mgr_note_by: note ? session.user_id : '', mgr_note_at: note ? now : '' });
      Audit.log(session.user_id, 'branch_note', table, r[key], { note: r.mgr_note || '' }, { note: note });
      if (note) {
        var shop = (Repo.find('Parties', 'party_id', r.shop_party_id) || {}).name || r.shop_party_id;
        var who = session.display_name || session.username;
        if (table === 'Orders') {
          OrderNotify.send(Push.usersWith('orders.approve').concat(OrderNotify.cashiers(r)), session, 'orderapprove',
            ['ملاحظة مدير الفرع على ' + r.order_no, shop + ' – ' + who + ': ' + note], ['Branch manager note on ' + r.order_no, shop + ' – ' + who + ': ' + note]);
        } else {
          OrderNotify.send(Push.usersWith('sales.decide').concat([r.created_by]), session, 'accounts',
            ['ملاحظة مدير الفرع على يومية ' + r.date, shop + ' – ' + who + ': ' + note], ['Branch manager note on the sales of ' + r.date, shop + ' – ' + who + ': ' + note]);
        }
      }
      return { id: r[key], note: res.after.mgr_note, at: res.after.mgr_note_at, version: Version.bump() };
    });
  }
};
