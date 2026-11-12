/**
 * Exec.gs – the general manager's screen (read only): the business at a glance for a period, against the
 * period just before it. Everything comes from what the app already records; nothing new is typed by anyone.
 *
 *   sales      the shops' daily sales sheets (approved, every channel); a day without one: the cash of its shifts
 *   products   what was invoiced to the shops (quantity, amount)
 *   margin     invoices against their cost (recipe ingredients or the item at its last purchase price)
 *   stock      balances at the last purchase price; near expiry, slow-moving, below minimum
 *   losses     disposals, count differences, returns damaged or expired, goods lost on the way
 *   suppliers  what is owed, this period's purchases, the prices that went up
 *   service    what reached the shops of what they ordered, time from sent to received, what could not be supplied
 *
 * One request computes it all; the answer is kept in the cache until the data changes (the version moves).
 */
var EXEC_CACHE_SECONDS = 600;

var Exec = {
  summary: function (session, p) {
    p = p || {};
    var today = Util.today();
    var from = Util.isDate(p.from || '') ? p.from : today.slice(0, 8) + '01';
    var to = Util.isDate(p.to || '') ? p.to : today;
    if (to < from) { var x = from; from = to; to = x; }
    var key = 'exec|' + from + '|' + to + '|' + Version.get();
    var cache = CacheService.getScriptCache();
    try { var hit = cache.get(key); if (hit) return JSON.parse(hit); } catch (e) { /* computed again */ }
    var out = Exec.compute(from, to, today);
    try { cache.put(key, JSON.stringify(out), EXEC_CACHE_SECONDS); } catch (e) { /* too big for the cache: computed each time */ }
    return out;
  },

  /** The period of the same length just before [from, to]. */
  before: function (from, to) {
    var d0 = new Date(from + 'T00:00:00Z'), d1 = new Date(to + 'T00:00:00Z');
    var days = Math.round((d1 - d0) / 864e5) + 1;
    var pTo = new Date(d0.getTime() - 864e5), pFrom = new Date(d0.getTime() - days * 864e5);
    return { from: pFrom.toISOString().slice(0, 10), to: pTo.toISOString().slice(0, 10), days: days };
  },

  compute: function (from, to, today) {
    var prev = Exec.before(from, to);
    var inP = function (d, a, b) { d = String(d || '').slice(0, 10); return d >= a && d <= b; };
    var items = {};
    Repo.all('Items').forEach(function (i) { items[i.item_id] = i; });
    var name = function (id) { var i = items[id] || {}; return { name: i.name || id, name_ar: i.name_ar || '' }; };

    // ---- unit cost: the latest receipt of each item, per stock unit
    var cost = {}, lastKey = {}, prices = {};
    Repo.all('Movements').forEach(function (m) {
      if (m.kind !== 'RECEIPT' || m.status === 'deleted' || !(Number(m.qty) > 0)) return;
      var amount = Number(m.final_amount !== '' && m.final_amount !== undefined ? m.final_amount : m.amount);
      if (!(amount > 0)) return;
      var unit = amount / Number(m.qty);
      var k = String(m.date) + '|' + String(m.movement_id);
      if (!lastKey[m.item_id] || k > lastKey[m.item_id]) { lastKey[m.item_id] = k; cost[m.item_id] = unit; }
      (prices[m.item_id] = prices[m.item_id] || []).push({ k: k, date: String(m.date), unit: unit, party: m.party_id });
    });
    var recipes = {};
    Repo.all('Recipes').forEach(function (r) { var k = Util.key(r.product); (recipes[k] = recipes[k] || []).push(r); });
    var famCost = {};
    var costOf = function (id) {
      var it = items[id];
      if (!it) return null;
      if (Stores.of(it) !== 'FINAL') return id in cost ? cost[id] : null;
      var lines = recipes[Util.key(it.name)];
      if (!lines) return null;
      var c = 0;
      for (var i = 0; i < lines.length; i++) {
        var lid = lines[i].item_id;
        // a generic material (family): one of its units, from its brands
        if (Families.isId(lid)) { if (!(lid in famCost)) { var fc = Families.cost(lid, Masters.lastCosts()); famCost[lid] = fc ? fc.unit : null; } if (famCost[lid] === null) return null; c += Number(lines[i].qty_per_unit) * famCost[lid]; continue; }
        if (!(lid in cost)) return null; c += Number(lines[i].qty_per_unit) * cost[lid];
      }
      return c;
    };

    // ---- sales: approved daily sheets, else the cash of the shifts of that day
    var salesOf = function (a, b) {
      var sheet = {}, s = { total: 0, byShop: {}, byChannel: {}, byDay: {} };
      var add = function (shop, day, channel, v) {
        v = Number(v) || 0;
        if (!v) return;
        s.total += v; s.byShop[shop] = (s.byShop[shop] || 0) + v; s.byChannel[channel] = (s.byChannel[channel] || 0) + v; s.byDay[day] = (s.byDay[day] || 0) + v;
      };
      Repo.all('DailySales').forEach(function (r) {
        if (r.status !== 'approved' || !inP(r.date, a, b)) return;
        sheet[r.shop_party_id + '|' + r.date] = true;
        add(r.shop_party_id, r.date, 'cash', r.cash);
        var ch = {};
        try { ch = JSON.parse(r.channels || '{}'); } catch (e) { ch = {}; }
        Object.keys(ch).forEach(function (k) { add(r.shop_party_id, r.date, k, ch[k]); });
      });
      Repo.all('Shifts').forEach(function (x) {
        var d = String(x.closed_at || '').slice(0, 10);
        if (!d || !inP(d, a, b) || sheet[x.shop_party_id + '|' + d]) return;
        add(x.shop_party_id, d, 'cash', x.amount);
      });
      return s;
    };
    var sales = salesOf(from, to), salesPrev = salesOf(prev.from, prev.to);

    // ---- invoices: products and margin
    var inv = {}, invPrev = {};
    Repo.all('Invoices').forEach(function (v) { if (inP(v.date, from, to)) inv[v.invoice_id] = v; else if (inP(v.date, prev.from, prev.to)) invPrev[v.invoice_id] = v; });
    var prod = {}, shopInv = {}, invoiced = 0, invoicedPrev = 0, costKnown = 0, salesKnown = 0;
    Repo.all('InvoiceItems').forEach(function (x) {
      if (invPrev[x.invoice_id]) { invoicedPrev += Number(x.amount) || 0; return; }
      var v = inv[x.invoice_id];
      if (!v) return;
      var amount = Number(x.amount) || 0, qty = Number(x.qty) || 0;
      invoiced += amount;
      var k = x.item_id || ('special|' + x.description);
      var r = prod[k] || (prod[k] = { item_id: x.item_id, description: x.description || '', unit: x.unit, qty: 0, amount: 0, cost: 0, known: true });
      r.qty += qty; r.amount += amount;
      var c = x.item_id ? costOf(x.item_id) : null;
      if (c === null) r.known = false; else { r.cost += c * qty; costKnown += c * qty; salesKnown += amount; }
      var sh = shopInv[v.shop_party_id] || (shopInv[v.shop_party_id] = { amount: 0, cost: 0, known: 0 });
      sh.amount += amount; if (c !== null) { sh.cost += c * qty; sh.known += amount; }
    });
    var products = Object.keys(prod).map(function (k) {
      var r = prod[k];
      var n = r.item_id ? name(r.item_id) : { name: r.description, name_ar: r.description };
      return { name: n.name, name_ar: n.name_ar, unit: r.unit, qty: Util.round(r.qty), amount: Util.round(r.amount),
        margin: r.known && r.amount ? Util.round((r.amount - r.cost) / r.amount * 100) : null, profit: r.known ? Util.round(r.amount - r.cost) : null };
    });
    var top = products.slice().sort(function (a, b) { return b.amount - a.amount; }).slice(0, 10);
    var withMargin = products.filter(function (r) { return r.margin !== null && r.amount > 0; });
    var best = withMargin.slice().sort(function (a, b) { return b.profit - a.profit; }).slice(0, 8);
    var worst = withMargin.slice().sort(function (a, b) { return a.margin - b.margin; }).slice(0, 8);

    // ---- stock
    var batches = Batches.all();
    var stock = { value: 0, byStore: {}, near: 0, nearItems: [], slow: 0, slowItems: [], below: 0 };
    var lastOut = {};
    Repo.all('Movements').forEach(function (m) { if (m.status !== 'deleted' && Number(m.qty) < 0 && !(lastOut[m.item_id] >= m.date)) lastOut[m.item_id] = String(m.date); });
    var in30 = new Date(new Date(today + 'T00:00:00Z').getTime() + 30 * 864e5).toISOString().slice(0, 10);
    var ago90 = new Date(new Date(today + 'T00:00:00Z').getTime() - 90 * 864e5).toISOString().slice(0, 10);
    Repo.all('Balances').forEach(function (b) {
      var it = items[b.item_id], q = Number(b.qty) || 0;
      if (!it || it.active !== true) return;
      if (Number(it.min_stock) > 0 && q <= Number(it.min_stock)) stock.below++;
      if (q <= 0) return;
      var c = costOf(b.item_id);
      if (c === null) return;
      var v = q * c, st = Stores.of(it);
      stock.value += v; stock.byStore[st] = (stock.byStore[st] || 0) + v;
      var nearQty = (batches[b.item_id] || []).filter(function (x) { return x.expiry && x.expiry <= in30; }).reduce(function (s, x) { return s + x.qty; }, 0);
      if (nearQty > 0) { stock.near += nearQty * c; stock.nearItems.push({ name: it.name, name_ar: it.name_ar || '', value: Util.round(nearQty * c), qty: Util.round(nearQty), unit: it.unit }); }
      if (!lastOut[b.item_id] || lastOut[b.item_id] < ago90) { stock.slow += v; stock.slowItems.push({ name: it.name, name_ar: it.name_ar || '', value: Util.round(v), since: lastOut[b.item_id] || '' }); }
    });
    stock.nearItems = stock.nearItems.sort(function (a, b) { return b.value - a.value; }).slice(0, 8);
    stock.slowItems = stock.slowItems.sort(function (a, b) { return b.value - a.value; }).slice(0, 8);

    // ---- losses
    var lossesOf = function (a, b) {
      var l = { total: 0, byType: {}, byShop: {} };
      var add = function (type, shop, v) { if (!(v > 0)) return; l.total += v; l.byType[type] = (l.byType[type] || 0) + v; if (shop) l.byShop[shop] = (l.byShop[shop] || 0) + v; };
      Repo.all('Movements').forEach(function (m) {
        if (m.status === 'deleted' || !inP(m.date, a, b) || !(Number(m.qty) < 0)) return;
        if (m.kind !== 'DISPOSAL' && m.kind !== 'ADJUST') return;
        var c = costOf(m.item_id);
        if (c === null) return;
        add(m.kind === 'DISPOSAL' ? 'disposal' : 'count', '', -Number(m.qty) * c);
      });
      var f = Finance.losses(null, { from: a, to: b });
      f.returns.forEach(function (r) { var c = costOf(r.item_id); if (c !== null) add(r.decision === 'expired' ? 'expired' : 'damaged', r.shop_party_id, -r.qty * c); });
      f.lost.forEach(function (r) { var c = r.item_id ? costOf(r.item_id) : null; if (c !== null) add('lost', r.shop_party_id, -r.qty * c); });
      return l;
    };
    var losses = lossesOf(from, to), lossesPrev = lossesOf(prev.from, prev.to);

    // ---- suppliers
    var owed = Accounts.balances().filter(function (x) { return x.kind === 'supplier' && x.balance < 0; })
      .map(function (x) { return { party_id: x.party_id, name: x.name, owed: Util.round(-x.balance) }; })
      .sort(function (a, b) { return b.owed - a.owed; });
    var bought = {}, boughtTotal = 0, boughtPrev = 0;
    Repo.all('Movements').forEach(function (m) {
      if (m.kind !== 'RECEIPT' || m.status === 'deleted') return;
      var a = Number(m.final_amount !== '' && m.final_amount !== undefined ? m.final_amount : m.amount) || 0;
      if (inP(m.date, from, to)) { bought[m.party_id] = (bought[m.party_id] || 0) + a; boughtTotal += a; }
      else if (inP(m.date, prev.from, prev.to)) boughtPrev += a;
    });
    var rises = [];
    Object.keys(prices).forEach(function (id) {
      var list = prices[id].sort(function (a, b) { return a.k < b.k ? -1 : 1; });
      var last = list[list.length - 1];
      if (!inP(last.date, from, to)) return;
      var before = list.filter(function (x) { return x.k < last.k; }).pop();
      if (!before || !(before.unit > 0)) return;
      var pct = (last.unit - before.unit) / before.unit * 100;
      if (pct >= 5) { var n = name(id); rises.push({ name: n.name, name_ar: n.name_ar, pct: Util.round(pct), from: Util.round(before.unit), to: Util.round(last.unit), unit: (items[id] || {}).unit || '' }); }
    });
    rises.sort(function (a, b) { return b.pct - a.pct; });

    // ---- service
    var lines = Repo.groupBy('OrderItems', 'order_id');
    var shopLines = Repo.groupBy('ShopOrderLines', 'order_id');
    var svc = { orders: 0, ordered: 0, received: 0, hours: [], unavailable: 0, byShop: {} };
    Repo.all('Orders').forEach(function (o) {
      if (!o.sent_at || !inP(o.order_date || o.sent_at, from, to) || o.status === 'rejected' || o.status === 'cancelled') return;
      svc.orders++;
      var sh = svc.byShop[o.shop_party_id] || (svc.byShop[o.shop_party_id] = { orders: 0, ordered: 0, received: 0 });
      sh.orders++;
      var done = o.status === 'received' || o.status === 'invoiced';
      (lines[o.order_id] || []).forEach(function (x) {
        if (x.status === 'removed' || !done) return;
        var q = Number(x.qty) || 0, r = Number(x.received_qty) || 0;
        svc.ordered += q; svc.received += r; sh.ordered += q; sh.received += r;
      });
      (shopLines[o.order_id] || []).forEach(function (l) { if (l.status === 'unavailable') svc.unavailable++; });
      if (done && o.received_at) svc.hours.push((new Date(o.received_at) - new Date(o.sent_at)) / 36e5);
    });
    var avgH = svc.hours.length ? Util.round(svc.hours.reduce(function (a, b) { return a + b; }, 0) / svc.hours.length) : null;

    // ---- what waits on the team now
    var count = function (sheet, f) { return Repo.all(sheet).filter(f).length; };
    var pending = {
      orders: count('Orders', function (o) { return o.status === 'sent'; }),
      lpo: count('LPOs', function (l) { return l.status === 'submitted'; }),
      cash: count('CashSheets', function (s) { return s.status === 'submitted'; }),
      sales: count('DailySales', function (r) { return r.status === 'submitted'; }),
      returns: count('Returns', function (r) { return r.status === 'quarantine'; }),
      shifts: count('Shifts', function (s) { return s.closed_at && (s.received_amount === '' || s.received_amount === undefined); }),
      invoices: count('Orders', function (o) { return o.status === 'received' && o.diff_status !== 'pending'; })
    };
    var diffs = Repo.all('Shifts').filter(function (s) { return s.received_at && inP(s.received_at, from, to) && Util.round(Number(s.received_amount) || 0) !== Util.round(Number(s.amount) || 0); })
      .reduce(function (a, s) { return a + (Number(s.received_amount) - Number(s.amount)); }, 0);

    var round = function (o) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = Util.round(o[k]); }); return r; };
    return {
      from: from, to: to, prev: prev, today: today,
      channels: Sales.channels().map(function (c) { return { id: c.id, name_ar: c.name_ar, name_en: c.name_en }; }),
      sales: { total: Util.round(sales.total), prev: Util.round(salesPrev.total), byShop: round(sales.byShop), byShopPrev: round(salesPrev.byShop),
        byChannel: round(sales.byChannel), byDay: round(sales.byDay), takingsDiff: Util.round(diffs) },
      invoiced: { total: Util.round(invoiced), prev: Util.round(invoicedPrev), byShop: Object.keys(shopInv).map(function (k) {
        var s = shopInv[k]; return { shop: k, amount: Util.round(s.amount), margin: s.known ? Util.round((s.known - s.cost) / s.known * 100) : null }; }) },
      margin: { pct: salesKnown ? Util.round((salesKnown - costKnown) / salesKnown * 100) : null, profit: Util.round(salesKnown - costKnown), covered: invoiced ? Util.round(salesKnown / invoiced * 100) : 0 },
      products: { top: top, best: best, worst: worst },
      stock: { value: Util.round(stock.value), byStore: round(stock.byStore), near: Util.round(stock.near), nearItems: stock.nearItems,
        slow: Util.round(stock.slow), slowItems: stock.slowItems, below: stock.below },
      losses: { total: Util.round(losses.total), prev: Util.round(lossesPrev.total), byType: round(losses.byType), byShop: round(losses.byShop) },
      suppliers: { owed: Util.round(owed.reduce(function (a, x) { return a + x.owed; }, 0)), count: owed.length, top: owed.slice(0, 8),
        bought: Util.round(boughtTotal), boughtPrev: Util.round(boughtPrev),
        byParty: Object.keys(bought).map(function (k) { return { party_id: k, amount: Util.round(bought[k]) }; }).sort(function (a, b) { return b.amount - a.amount; }).slice(0, 8),
        rises: rises.slice(0, 8) },
      service: { orders: svc.orders, fill: svc.ordered ? Util.round(svc.received / svc.ordered * 100) : null, hours: avgH, unavailable: svc.unavailable,
        byShop: Object.keys(svc.byShop).map(function (k) { var s = svc.byShop[k]; return { shop: k, orders: s.orders, fill: s.ordered ? Util.round(s.received / s.ordered * 100) : null }; }) },
      pending: pending
    };
  }
};
