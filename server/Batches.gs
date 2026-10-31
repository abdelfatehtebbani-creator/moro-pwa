/**
 * Batches.gs – what is left of each expiry date, worked out from the movements (nothing new to type).
 *
 * The stock on hand is the latest receipts: going back from the newest dated inflow (a receipt, an
 * opening balance, a production output…), each one covers part of the balance until all of it is
 * covered, and each part keeps the expiry of the inflow it came from (the older stock was used first).
 *   17 bags in stock, received 5 (31-Mar-28) today, 4 (31-Mar-28) and 8 (31-Mar-28) before,
 *   and 4 (22-Nov-28) last month  →  17 bags 31-Mar-28.
 * Inflows without a date (returns from a department, adjustments) do not cover the stock: what comes
 * back came from earlier receipts.
 * A count that corrects the expiry (Balances.expiry_reset) is the oldest batch: what was counted, with
 * the counted date; only inflows after the count come before it.
 */
var INFLOW_KINDS = ['RECEIPT', 'OPENING', 'DEPT_RETURN', 'PROD_OUTPUT', 'ADJUST', 'SHOP_RETURN'];

var Batches = {
  /** {item_id: [{expiry, qty}]} nearest expiry first, only the quantities still in stock. */
  all: function () {
    var ins = {};
    Repo.all('Movements').forEach(function (m) {
      var q = Number(m.qty) || 0;
      var expiry = Util.isDate(String(m.expiry || '')) ? String(m.expiry) : '';
      if (m.status === 'deleted' || q <= 0 || !expiry || INFLOW_KINDS.indexOf(m.kind) < 0) return;
      (ins[m.item_id] = ins[m.item_id] || []).push({ date: String(m.date), id: String(m.movement_id), qty: q, expiry: expiry });
    });
    var out = {};
    Repo.all('Balances').forEach(function (b) {
      var balance = Number(b.qty) || 0;
      if (balance <= 0) return;
      var reset = Util.isDate(String(b.expiry_reset || '')) ? String(b.expiry_reset) : '';
      var on = String(b.expiry_reset_on || '');
      // newest first; a count that set the expiry stands for everything received up to its date
      var list = (ins[b.item_id] || []).filter(function (m) { return !reset || m.date > on; })
        .sort(function (a, c) { return a.date === c.date ? (a.id < c.id ? 1 : -1) : (a.date < c.date ? 1 : -1); });
      if (reset) list.push({ expiry: reset, qty: Number(b.expiry_reset_qty) || balance });
      if (!list.length) return;
      var kept = {}, left = balance, last = '';
      for (var i = 0; i < list.length && left > 0; i++) {
        var x = Math.min(left, list[i].qty);
        kept[list[i].expiry] = Util.round((kept[list[i].expiry] || 0) + x);
        left = Util.round(left - x);
        last = list[i].expiry;
      }
      // more in stock than all the dated inflows (old data): the rest is as old as the oldest batch
      if (left > 0) kept[last] = Util.round(kept[last] + left);
      out[b.item_id] = Object.keys(kept).filter(function (e) { return kept[e] > 0; }).sort()
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
