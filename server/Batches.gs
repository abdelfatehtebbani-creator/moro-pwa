/**
 * Batches.gs – what is left of each expiry date, worked out from the movements (nothing new to type).
 *
 * Every inflow with an expiry date (a receipt, an opening balance, a return…) is a batch. Stock is
 * taken earliest-expiry first (FEFO): each outflow takes from the batch in stock that expires first.
 *   100 tins expiring tomorrow + 1 tin next month, 11 issued  →  89 tomorrow, 1 next month.
 * A count that corrects the expiry (Balances.expiry_reset) replaces every batch up to the count date
 * with one batch of what was counted; later inflows are batches again.
 * Inflows without a date count as the furthest (nothing known to expire).
 */
var INFLOW_KINDS = ['RECEIPT', 'OPENING', 'DEPT_RETURN', 'PROD_OUTPUT', 'ADJUST', 'SHOP_RETURN'];

var Batches = {
  /**
   * {item_id: [{expiry, qty}]} nearest expiry first, only the quantities still in stock.
   * The history is replayed in date order: an inflow adds a batch, an outflow takes from the batch
   * that expires first among those in stock at that moment (FEFO).
   */
  all: function () {
    var moves = {};
    Repo.all('Movements').forEach(function (m) {
      var q = Number(m.qty) || 0;
      if (m.status === 'deleted' || !q) return;
      (moves[m.item_id] = moves[m.item_id] || []).push({ date: String(m.date), id: String(m.movement_id), qty: q,
        inflow: q > 0 && INFLOW_KINDS.indexOf(m.kind) >= 0, expiry: Util.isDate(String(m.expiry || '')) ? String(m.expiry) : '' });
    });
    var earliestFirst = function (a, c) { return a.expiry === c.expiry ? 0 : !a.expiry ? 1 : !c.expiry ? -1 : (a.expiry < c.expiry ? -1 : 1); };
    var out = {};
    Repo.all('Balances').forEach(function (b) {
      var balance = Number(b.qty) || 0;
      if (balance <= 0) return;
      var list = (moves[b.item_id] || []).sort(function (a, c) { return a.date === c.date ? (a.id < c.id ? -1 : 1) : (a.date < c.date ? -1 : 1); });
      var reset = Util.isDate(String(b.expiry_reset || '')) ? String(b.expiry_reset) : '';
      var on = String(b.expiry_reset_on || '');
      var lots = [];
      var take = function (q) {
        lots.sort(earliestFirst);
        for (var i = 0; i < lots.length && q > 0; i++) { var x = Math.min(q, lots[i].qty); lots[i].qty = Util.round(lots[i].qty - x); q = Util.round(q - x); }
        lots = lots.filter(function (l) { return l.qty > 0; });
      };
      var applied = false;
      list.forEach(function (m) {
        // a count that set the expiry: what was counted carries that date from the count date on
        if (reset && !applied && m.date > on) { lots = [{ expiry: reset, qty: Number(b.expiry_reset_qty) || 0 }]; applied = true; }
        if (m.qty > 0) lots.push({ expiry: m.inflow ? m.expiry : '', qty: m.qty });
        else take(-m.qty);
      });
      if (reset && !applied) lots = [{ expiry: reset, qty: Number(b.expiry_reset_qty) || 0 }];
      if (!lots.some(function (l) { return l.expiry; })) return;
      // the replay and the balance may differ (old data, pending lines): fit the batches to the balance
      var sum = lots.reduce(function (s, l) { return s + l.qty; }, 0);
      if (sum > balance) take(Util.round(sum - balance));
      else if (sum < balance) { lots.sort(earliestFirst); lots[0].qty = Util.round(lots[0].qty + balance - sum); }
      var kept = {};
      lots.forEach(function (l) { kept[l.expiry] = Util.round((kept[l.expiry] || 0) + l.qty); });
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
