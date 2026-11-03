/**
 * Invoices.gs – shop orders stage 3: the invoice of a received order, and the data of the order reports.
 *
 *   Distribution issues the invoice once the shop has received the order (never before), from the
 *   quantities received. One invoice per order, in two parts: final products (at the item's final price)
 *   and store items (at the price of their last purchase). The prices are copied when the invoice is issued and never change
 *   after; an item without a price stops the invoice until its price is set. No tax, no discount.
 *   The order is then "invoiced". Only distribution (and the admin) see invoices.
 */
var Invoices = {
  /**
   * Price of an item on a shop invoice, per stock unit: the final price for final products; for the rest
   * the price of their last purchase (the net amount of the latest receipt ÷ its quantity).
   */
  priceOf: function (item, lastCost) {
    if (Stores.of(item) !== 'FINAL') return lastCost && item.item_id in lastCost ? lastCost[item.item_id] : null;
    var v = item.final_price;
    return v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v);
  },

  /** {item_id: net cost per stock unit of the latest receipt}. */
  lastCosts: function (ids) {
    var want = {}, best = {}, out = {};
    ids.forEach(function (id) { want[id] = true; });
    Repo.all('Movements').forEach(function (m) {
      if (m.kind !== 'RECEIPT' || m.status === 'deleted' || !want[m.item_id] || !(Number(m.qty) > 0)) return;
      var amount = Number(m.final_amount !== '' && m.final_amount !== undefined ? m.final_amount : m.amount);
      if (!(amount > 0)) return;
      var k = String(m.date) + '|' + String(m.movement_id);
      if (!best[m.item_id] || k > best[m.item_id]) { best[m.item_id] = k; out[m.item_id] = Util.round(amount / Number(m.qty)); }
    });
    return out;
  },

  view: function (inv) {
    var out = {};
    Object.keys(inv).forEach(function (k) { out[k] = inv[k]; });
    out.items = Repo.all('InvoiceItems').filter(function (x) { return x.invoice_id === inv.invoice_id; })
      .sort(function (a, b) { return Number(a.line_no) - Number(b.line_no); });
    return out;
  },

  /** p: {order_id}. */
  create: function (session, p) {
    return withLock(function () {
      var o = Repo.find('Orders', 'order_id', p.order_id);
      Util.require(o && o.status === 'received', 'order_not_received');
      Util.require(o.diff_status !== 'pending', 'diff_not_accepted');
      Util.require(!Repo.find('Invoices', 'order_id', o.order_id), 'already_invoiced');
      var lines = Orders.view(o).lines.filter(function (l) { return Number(l.received_qty) > 0; });
      Util.require(lines.length, 'nothing_to_save');
      var missing = [];
      var costs = Invoices.lastCosts(lines.map(function (l) { return l.item_id; }).filter(String));
      var rows = lines.map(function (l, i) {
        if (!l.item_id) {
          var qq = Number(l.received_qty);
          return { line_no: i + 1, item_id: '', section: 'final', qty: qq, unit: l.unit, price: Number(l.price) || 0,
                   amount: Util.round((Number(l.price) || 0) * qq), description: l.description };
        }
        var item = Repo.find('Items', 'item_id', l.item_id);
        var price = Invoices.priceOf(item, costs);
        if (price === null) missing.push(item ? item.name : l.item_id);
        var q = Number(l.received_qty);
        return { line_no: i + 1, item_id: l.item_id, section: Stores.of(item) === 'FINAL' ? 'final' : 'store', qty: q, unit: l.unit,
                 price: price, amount: Util.round((price || 0) * q) };
      });
      Util.require(!missing.length, 'price_missing', missing.join(', '));
      // final products first, then the store items
      rows.sort(function (a, b) { return a.section === b.section ? a.line_no - b.line_no : a.section === 'final' ? -1 : 1; });
      var tf = 0, ts = 0;
      rows.forEach(function (r, i) { r.line_no = i + 1; if (r.section === 'final') tf += r.amount; else ts += r.amount; });
      var now = Util.nowIso();
      var n = Settings.next('seq_invoice', 0);
      var inv = { invoice_id: 'V' + Util.pad(n, 5), invoice_no: 'INV-' + Util.pad(n, 5), order_id: o.order_id, order_no: o.order_no,
        shop_party_id: o.shop_party_id, date: Util.today(), total_final: Util.round(tf), total_store: Util.round(ts), total: Util.round(tf + ts),
        created_by: session.user_id, created_at: now };
      Repo.append('Invoices', [inv]);
      Repo.append('InvoiceItems', rows.map(function (r) { r.invoice_id = inv.invoice_id; return r; }));
      Repo.update('Orders', 'order_id', o.order_id, { status: 'invoiced', updated_at: now });
      Audit.log(session.user_id, 'invoice_create', 'Invoices', inv.invoice_id, null, { order: o.order_id, total: inv.total });
      return { invoice: Invoices.view(inv), version: Version.bump() };
    });
  },

  /** p: {from, to, shop} – by invoice date. */
  list: function (session, p) {
    p = p || {};
    return Repo.all('Invoices').filter(function (v) {
      return (!p.from || String(v.date) >= p.from) && (!p.to || String(v.date) <= p.to) && (!p.shop || v.shop_party_id === p.shop);
    }).reverse().slice(0, Number(p.limit) || 300);
  },

  get: function (session, p) {
    var v = Repo.find('Invoices', 'invoice_id', p.invoice_id) || Repo.find('Invoices', 'order_id', p.order_id);
    Util.require(v, 'not_found');
    return Invoices.view(v);
  },

  /**
   * The order reports: orders of a period (by order date) with their lines, the times of each step, what
   * could not be supplied and what came short; and the invoices of the period (sums only with prices).
   */
  report: function (session, p) {
    p = p || {};
    var inP = function (d) { return (!p.from || String(d) >= p.from) && (!p.to || String(d) <= p.to); };
    var orders = Repo.all('Orders').filter(function (o) { return o.status !== 'draft' && inP(o.order_date); });
    var shopLines = {};
    Repo.all('ShopOrderLines').forEach(function (l) { if (l.order_id) (shopLines[l.order_id] = shopLines[l.order_id] || []).push(l); });
    var items = {};
    Repo.all('OrderItems').forEach(function (x) { (items[x.order_id] = items[x.order_id] || []).push(x); });
    var out = orders.map(function (o) {
      var sl = shopLines[o.order_id] || [];
      // ready: when the last line was handed or marked not available
      var done = sl.filter(function (l) { return l.status !== 'open' && l.status !== 'partial'; });
      var ready = sl.length && done.length === sl.length ? done.map(function (l) { return String(l.handed_at || l.updated_at || ''); }).sort().pop() : '';
      return { order_id: o.order_id, order_no: o.order_no, shop_party_id: o.shop_party_id, status: o.status, order_date: o.order_date,
        sent_at: o.sent_at, approved_at: o.decided_at, ready_at: ready, loaded_at: o.loaded_at, delivered_at: o.delivered_at, received_at: o.received_at,
        lines: (items[o.order_id] || []).map(function (x) {
          var s = sl.filter(function (l) { return l.order_item_id === o.order_id + '-' + x.line_no; })[0] || {};
          return { item_id: x.item_id, qty: Number(x.qty), approved_qty: x.approved_qty, received_qty: x.received_qty, short_reason: x.short_reason,
            short_note: x.short_note, handed_qty: Number(s.handed_qty) || 0, line_status: s.status || x.status, reason: s.reason || '' };
        }) };
    });
    var prices = Perm.has(session, 'see_prices');
    var invoices = Repo.all('Invoices').filter(function (v) { return inP(v.date); }).map(function (v) {
      return { invoice_no: v.invoice_no, order_no: v.order_no, shop_party_id: v.shop_party_id, date: v.date,
        total_final: prices ? Number(v.total_final) : '', total_store: prices ? Number(v.total_store) : '', total: prices ? Number(v.total) : '' };
    });
    return { orders: out, invoices: invoices };
  }
};
