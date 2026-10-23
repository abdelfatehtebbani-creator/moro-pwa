/**
 * Batches.gs – what is left of each expiry date, worked out from the movements (nothing new to type).
 *
 * Every inflow with an expiry date (a receipt, an opening balance, a return…) is a batch. Stock is
 * taken earliest-expiry first (FEFO), so what is still on the shelf is the batches that expire last:
 * the current balance is laid over the batches from the furthest expiry backwards until it is covered.
 *   100 tins expiring tomorrow + 1 tin next month, balance 90  →  1 next month, 89 tomorrow.
 * A count that corrects the expiry (Balances.expiry_reset) replaces every batch up to the count date
 * with one batch of what was counted; later inflows are batches again.
 * Inflows without a date count as the furthest (nothing known to expire).
 */
var INFLOW_KINDS = ['RECEIPT', 'OPENING', 'DEPT_RETURN', 'PROD_OUTPUT', 'ADJUST', 'SHOP_RETURN'];

var Batches = {
  /** {item_id: [{expiry, qty}]} nearest expiry first, only the quantities still in stock. */
  all: function () {
    var inflows = {};
    Repo.all('Movements').forEach(function (m) {
      var q = Number(m.qty) || 0;
      if (m.status === 'deleted' || q <= 0 || INFLOW_KINDS.indexOf(m.kind) < 0) return;
      (inflows[m.item_id] = inflows[m.item_id] || []).push({ date: String(m.date), expiry: Util.isDate(String(m.expiry || '')) ? String(m.expiry) : '', qty: q });
    });
    var out = {};
    Repo.all('Balances').forEach(function (b) {
      var left = Number(b.qty) || 0;
      if (left <= 0) return;
      var list = inflows[b.item_id] || [];
      var reset = Util.isDate(String(b.expiry_reset || '')) ? String(b.expiry_reset) : '';
      if (reset) {
        var on = String(b.expiry_reset_on || '');
        list = list.filter(function (x) { return x.date > on; });
        list.push({ date: on, expiry: reset, qty: Number(b.expiry_reset_qty) || 0 });
      }
      if (!list.some(function (x) { return x.expiry; })) return;            // no dates at all: nothing to show
      // furthest expiry first ('' = no date = furthest), the newest inflow first within a date
      list.sort(function (a, c) {
        if (a.expiry !== c.expiry) return !a.expiry ? -1 : !c.expiry ? 1 : (a.expiry < c.expiry ? 1 : -1);
        return a.date < c.date ? 1 : -1;
      });
      var kept = {};
      for (var i = 0; i < list.length && left > 0; i++) {
        var take = Math.min(left, list[i].qty);
        kept[list[i].expiry] = Util.round((kept[list[i].expiry] || 0) + take);
        left = Util.round(left - take);
      }
      // more in stock than the inflows explain (old data): the rest shows on the earliest date known
      if (left > 0) {
        var dated = list.filter(function (x) { return x.expiry; });
        var oldest = dated.length ? dated[dated.length - 1].expiry : '';
        kept[oldest] = Util.round((kept[oldest] || 0) + left);
      }
      out[b.item_id] = Object.keys(kept).filter(function (e) { return kept[e] > 0; })
        .sort(function (a, c) { return !a ? 1 : !c ? -1 : (a < c ? -1 : 1); })
        .map(function (e) { return { expiry: e, qty: kept[e] }; });
    });
    return out;
  },

  /** Nearest expiry of the stock on hand of each item ('' when none). */
  nearest: function (batches) {
    var out = {};
    Object.keys(batches).forEach(function (id) {
      var d = batches[id].filter(function (x) { return x.expiry; })[0];
      out[id] = d ? d.expiry : '';
    });
    return out;
  }
};
