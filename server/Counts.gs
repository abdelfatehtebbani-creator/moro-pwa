/**
 * Counts.gs – stock counts (monthly, quarterly, yearly) per store.
 *
 * A count is opened for one store and one date. Its lines hold, for every active item of the store,
 * the theoretical quantity on that date (sum of the movements up to it, base unit) and the counted
 * quantity typed by the storekeeper (base unit; empty = not counted). Nothing changes in the stock
 * until the admin approves: then one ADJUST movement per counted line with a difference, dated the
 * count date, brings the balance to what was counted. An uncounted line is never adjusted.
 * The expiry date on the shelf may be corrected the same way: a line's counted_expiry replaces the
 * item's last expiry (Balances.last_expiry) on approval; an empty one leaves it as it is.
 */
var COUNT_PERIODS = ['monthly', 'quarterly', 'yearly'];

var Counts = {
  /** Theoretical quantity of each item on `date` (movements dated up to it, deleted ones excluded). */
  theory: function (date, itemIds) {
    var want = {}, out = {};
    itemIds.forEach(function (id) { want[id] = true; out[id] = 0; });
    Repo.all('Movements').forEach(function (m) {
      if (!want[m.item_id] || m.status === 'deleted' || String(m.date) > date) return;
      out[m.item_id] += Number(m.qty) || 0;
    });
    Object.keys(out).forEach(function (id) { out[id] = Util.round(out[id]); });
    return out;
  },

  /** Last purchase price per base unit (amount / quantity of the latest receipt), '' when none. */
  prices: function (itemIds) {
    var want = {}, out = {};
    itemIds.forEach(function (id) { want[id] = true; out[id] = ''; });
    var last = {};
    Repo.all('Movements').forEach(function (m) {
      if (!want[m.item_id] || m.kind !== 'RECEIPT' || m.status === 'deleted' || !(Number(m.qty) > 0) || m.amount === '') return;
      var k = String(m.date) + String(m.created_at || '');
      if (!last[m.item_id] || k >= last[m.item_id].k) last[m.item_id] = { k: k, p: Number(m.final_amount !== '' ? m.final_amount : m.amount) / Number(m.qty) };
    });
    Object.keys(last).forEach(function (id) { out[id] = Util.round(last[id].p); });
    return out;
  },

  /** The last expiry on the books of every item. */
  expiries: function () {
    var out = {};
    Repo.all('Balances').forEach(function (b) { out[b.item_id] = String(b.last_expiry || ''); });
    return out;
  },

  /** Whoever approves counts sees every store; a storekeeper only the counts of their own stores. */
  visible: function (session, c) {
    return Perm.has(session, 'counts.approve') || (session.stores || []).indexOf(c.store) >= 0;
  },

  list: function (session) {
    return { counts: Repo.all('Counts').filter(function (c) { return Counts.visible(session, c); }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.count_id).localeCompare(String(a.count_id)); }) };
  },

  /** One count with its lines; an open count shows the theory as it stands now (late entries included). */
  get: function (session, p) {
    var c = Repo.find('Counts', 'count_id', p.count_id);
    Util.require(c, 'not_found');
    Util.require(Counts.visible(session, c), 'store_forbidden', c.store);
    var lines = Repo.all('CountLines').filter(function (l) { return l.count_id === c.count_id; });
    if (c.status === 'open') {
      var th = Counts.theory(String(c.date), lines.map(function (l) { return l.item_id; }));
      var ex = Counts.expiries();
      lines.forEach(function (l) { l.theory_qty = th[l.item_id]; l.theory_expiry = ex[l.item_id] || ''; });
    }
    var pr = Perm.has(session, 'see_prices') ? Counts.prices(lines.map(function (l) { return l.item_id; })) : {};
    lines.forEach(function (l) { l.price = c.status === 'open' ? (pr[l.item_id] === undefined ? '' : pr[l.item_id]) : (Perm.has(session, 'see_prices') ? l.price : ''); });
    return { count: c, lines: lines };
  },

  open: function (session, p) {
    var store = String(p.store || ''), date = String(p.date || ''), period = String(p.period || '');
    Util.require(Stores.valid(store), 'store_invalid');
    Util.require(Util.isDate(date), 'date_invalid');
    Util.require(COUNT_PERIODS.indexOf(period) >= 0, 'period_invalid');
    Stores.require(session, store);
    return withLock(function () {
      // one open count per store at a time
      var busy = Repo.all('Counts').filter(function (c) { return c.store === store && c.status === 'open'; })[0];
      Util.require(!busy, 'count_open_exists', busy ? busy.count_id : '');
      var n = 0;
      Repo.column('Counts', 'count_id').forEach(function (id) { n = Math.max(n, Number(String(id).slice(1)) || 0); });
      var c = { count_id: 'C' + Util.pad(n + 1, 4), store: store, date: date, period: period, status: 'open',
                created_by: session.user_id, created_at: Util.nowIso(), approved_by: '', approved_at: '', note: Util.clean(p.note) };
      var items = Repo.all('Items').filter(function (i) { return i.active === true && Stores.of(i) === store; });
      var th = Counts.theory(date, items.map(function (i) { return i.item_id; }));
      var ex = Counts.expiries();
      Repo.append('Counts', [c]);
      Repo.append('CountLines', items.map(function (i) {
        return { count_id: c.count_id, item_id: i.item_id, theory_qty: th[i.item_id], counted_qty: '', counted_by: '', counted_at: '',
                 adjust_movement_id: '', price: '', theory_expiry: ex[i.item_id] || '', counted_expiry: '' };
      }));
      Audit.log(session.user_id, 'count_open', 'Counts', c.count_id, null, c);
      return { count: c, version: Version.bump() };
    });
  },

  /** p.lines: [{item_id, counted_qty ('' = not counted), unit}] – the unit may be any unit of the item. */
  save: function (session, p) {
    return withLock(function () {
      var c = Repo.find('Counts', 'count_id', p.count_id);
      Util.require(c, 'not_found');
      Util.require(c.status === 'open', 'count_closed');
      Stores.require(session, c.store);
      var lines = {};
      Repo.all('CountLines').forEach(function (l) { if (l.count_id === c.count_id) lines[l.item_id] = l; });
      var n = 0;
      (p.lines || []).forEach(function (src) {
        var l = lines[src.item_id];
        Util.require(l, 'item_unknown', src.item_id);
        var ch = {};
        if (src.counted_expiry !== undefined) {
          var e = String(src.counted_expiry || '');
          Util.require(!e || Util.isDate(e), 'expiry_invalid', src.item_id);
          if (e !== String(l.counted_expiry || '')) ch.counted_expiry = e;
        }
        if (src.counted_qty === undefined) {
          if (!Object.keys(ch).length) return;
          ch.counted_by = session.user_id; ch.counted_at = Util.nowIso();
          Repo.updateWhere('CountLines', function (r) { return r.count_id === c.count_id && r.item_id === src.item_id; }, ch);
          n++;
          return;
        }
        var q = '';
        if (src.counted_qty !== '' && src.counted_qty !== null && src.counted_qty !== undefined) {
          var v = Util.num(src.counted_qty);
          Util.require(v !== null && v >= 0, 'qty_invalid', src.item_id);
          var item = Repo.find('Items', 'item_id', src.item_id);
          var f = Packs.factor(item, src.unit || item.unit);
          Util.require(f, 'unit_not_defined', src.unit);
          q = Util.round(v * f);
        }
        if (String(q) !== String(l.counted_qty)) ch.counted_qty = q;
        if (!Object.keys(ch).length) return;
        ch.counted_by = session.user_id; ch.counted_at = Util.nowIso();
        Repo.updateWhere('CountLines', function (r) { return r.count_id === c.count_id && r.item_id === src.item_id; }, ch);
        n++;
      });
      return { saved: n, version: n ? Version.bump() : Version.get() };
    });
  },

  /** Admin: the counted quantities become the stock (ADJUST movements dated the count date). */
  approve: function (session, p) {
    var c = Repo.find('Counts', 'count_id', p.count_id);
    Util.require(c, 'not_found');
    Util.require(c.status === 'open', 'count_closed');
    var lines = Repo.all('CountLines').filter(function (l) { return l.count_id === c.count_id; });
    var th = Counts.theory(String(c.date), lines.map(function (l) { return l.item_id; }));
    var pr = Counts.prices(lines.map(function (l) { return l.item_id; }));
    var party = Counts.partyId();
    var movs = [];
    lines.forEach(function (l) {
      if (l.counted_qty === '' || l.counted_qty === null || l.counted_qty === undefined) return;
      var diff = Util.round(Number(l.counted_qty) - th[l.item_id]);
      if (!diff) return;
      var item = Repo.find('Items', 'item_id', l.item_id);
      movs.push({ client_id: 'count-' + c.count_id + '-' + l.item_id, kind: 'ADJUST', date: String(c.date), party_id: party,
                  item_id: l.item_id, qty: diff, unit: item.unit, doc_no: c.count_id, purpose: 'count ' + c.period });
    });
    var saved = movs.length ? Movements.save(session, { movements: movs }, ['ADJUST']).saved : [];
    var byItem = {};
    saved.forEach(function (s) { byItem[String(s.client_id).split('-').pop()] = s.movement_id; });
    return withLock(function () {
      var ex = Counts.expiries(), fixed = 0;
      // the lines keep what the stock was when approved (one write per column, not per line)
      var mine = function (r) { return r.count_id === c.count_id; };
      Repo.setColumn('CountLines', 'theory_qty', function (r) { return mine(r) ? th[r.item_id] : r.theory_qty; });
      Repo.setColumn('CountLines', 'price', function (r) { return mine(r) ? (pr[r.item_id] === undefined ? '' : pr[r.item_id]) : r.price; });
      Repo.setColumn('CountLines', 'adjust_movement_id', function (r) { return mine(r) ? (byItem[r.item_id] || '') : r.adjust_movement_id; });
      Repo.setColumn('CountLines', 'theory_expiry', function (r) { return mine(r) ? (ex[r.item_id] || '') : r.theory_expiry; });
      lines.forEach(function (l) {
        // the expiry found on the shelf replaces the one on the books
        var e = String(l.counted_expiry || '');
        if (!e || e === (ex[l.item_id] || '')) return;
        var b = Repo.find('Balances', 'item_id', l.item_id);
        if (b) Repo.update('Balances', 'item_id', l.item_id, { last_expiry: e, updated_at: Util.nowIso() });
        else {
          var it = Repo.find('Items', 'item_id', l.item_id);
          Repo.append('Balances', [{ item_id: l.item_id, qty: 0, unit: it ? it.unit : '', last_expiry: e, updated_at: Util.nowIso() }]);
        }
        Audit.log(session.user_id, 'count_expiry', 'Balances', l.item_id, { last_expiry: ex[l.item_id] || '' }, { last_expiry: e, count_id: c.count_id });
        fixed++;
      });
      Repo.update('Counts', 'count_id', c.count_id, { status: 'approved', approved_by: session.user_id, approved_at: Util.nowIso() });
      Audit.log(session.user_id, 'count_approve', 'Counts', c.count_id, null, { adjustments: saved.length, expiries: fixed });
      return { adjustments: saved.length, expiries: fixed, version: Version.bump() };
    });
  },

  /** Admin: an open count is dropped (nothing was posted). */
  cancel: function (session, p) {
    return withLock(function () {
      var c = Repo.find('Counts', 'count_id', p.count_id);
      Util.require(c, 'not_found');
      Util.require(c.status === 'open', 'count_closed');
      Repo.update('Counts', 'count_id', c.count_id, { status: 'cancelled', approved_by: session.user_id, approved_at: Util.nowIso() });
      Audit.log(session.user_id, 'count_cancel', 'Counts', c.count_id, null, null);
      return { version: Version.bump() };
    });
  },

  /** The party every count adjustment is booked against. */
  partyId: function () {
    var p = Repo.all('Parties').filter(function (x) { return x.kind === 'stocktake'; })[0];
    if (p) return p.party_id;
    var n = 0;
    Repo.column('Parties', 'party_id').forEach(function (id) { n = Math.max(n, Number(String(id).slice(1)) || 0); });
    var id = 'P' + Util.pad(n + 1, 3);
    Repo.append('Parties', [{ party_id: id, name: 'Stocktake', kind: 'stocktake', active: true }]);
    return id;
  }
};
