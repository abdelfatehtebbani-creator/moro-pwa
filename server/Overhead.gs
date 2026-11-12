/**
 * Overhead.gs – the running costs of the factory (electricity, salaries, gas, rent…) spread over the products.
 *
 *   The admin writes the costs of a period (from, to) by line. The rate of the period is those costs divided by the
 *   material cost of everything produced in it (each production at its recipe's cost): 30,000 / 120,000 = 25%.
 *   Each product then carries that share on top of the cost of its materials, whatever its unit (KG, piece, bag).
 *   The latest period (by its end date) is the rate in use.
 */
var Overhead = {
  rows: function () {
    return Repo.all('Overheads').filter(function (r) { return r.status !== 'deleted'; })
      .map(function (r) {
        var lines = [];
        try { lines = JSON.parse(r.lines || '[]'); } catch (e) { lines = []; }
        return { period_id: r.period_id, from: String(r.from), to: String(r.to), lines: lines, total: Number(r.total) || 0,
                 material: Number(r.material) || 0, rate: Number(r.rate) || 0, missing: Number(r.missing) || 0, by: r.by, at: r.at };
      })
      .sort(function (a, b) { return a.to < b.to ? 1 : a.to > b.to ? -1 : 0; });
  },

  /** The rate in use: the latest period's {rate, from, to}, or null. */
  current: function () { return Overhead.rows()[0] || null; },
  rate: function () { var c = Overhead.current(); return c ? c.rate : 0; },

  list: function () { return { periods: Overhead.rows() }; },

  /** The material cost of what was produced from..to: {material, missing (products with no cost known)}. */
  material: function (from, to) {
    var qty = {};
    Repo.all('Movements').forEach(function (m) {
      if (m.kind !== 'PROD_OUTPUT' || m.status === 'deleted' || String(m.date) < from || String(m.date) > to) return;
      qty[m.item_id] = (qty[m.item_id] || 0) + (Number(m.qty) || 0);
    });
    var costs = Masters.lastCosts(), total = 0, missing = 0;
    Object.keys(qty).forEach(function (id) {
      var it = Repo.find('Items', 'item_id', id);
      var c = it ? Masters.recipeCost(it.name, costs).cost : '';
      if (c === '') { missing++; return; }
      total += c * qty[id];
    });
    return { material: Util.round(total * 100) / 100, missing: missing };
  },

  /** p: {period_id?, from, to, lines: [{label, amount}]}. */
  save: function (session, p) {
    Util.require(Util.isDate(p.from || '') && Util.isDate(p.to || '') && p.from <= p.to, 'date_invalid');
    var lines = (p.lines || []).map(function (l) { return { label: Util.clean(l.label), amount: Util.num(l.amount) }; })
      .filter(function (l) { return l.label || l.amount; });
    lines.forEach(function (l) { Util.require(l.label && l.amount !== null && l.amount >= 0, 'overhead_line_invalid', l.label); });
    Util.require(lines.length, 'nothing_to_save');
    var total = Util.round(lines.reduce(function (a, l) { return a + l.amount; }, 0) * 100) / 100;
    var m = Overhead.material(p.from, p.to);
    Util.require(m.material > 0, 'overhead_no_production');
    var rate = Math.round(total / m.material * 10000) / 10000;
    return withLock(function () {
      var row = { from: p.from, to: p.to, lines: JSON.stringify(lines), total: total, material: m.material, rate: rate, missing: m.missing,
                  by: session.user_id, at: Util.nowIso(), status: 'active' };
      var id = p.period_id;
      if (id) {
        var old = Repo.find('Overheads', 'period_id', id);
        Util.require(old && old.status !== 'deleted', 'not_found');
        Repo.update('Overheads', 'period_id', id, row);
      } else {
        var n = 0;
        Repo.column('Overheads', 'period_id').forEach(function (x) { n = Math.max(n, Number(String(x).slice(2)) || 0); });
        id = 'OH' + Util.pad(n + 1, 3);
        row.period_id = id;
        Repo.append('Overheads', [row]);
      }
      Audit.log(session.user_id, 'overhead_save', 'Overheads', id, null, { from: p.from, to: p.to, total: total, material: m.material, rate: rate });
      return { period_id: id, total: total, material: m.material, rate: rate, missing: m.missing, version: Version.bump() };
    });
  },

  remove: function (session, p) {
    return withLock(function () {
      var old = Repo.find('Overheads', 'period_id', p.period_id);
      Util.require(old && old.status !== 'deleted', 'not_found');
      Repo.update('Overheads', 'period_id', p.period_id, { status: 'deleted', at: Util.nowIso(), by: session.user_id });
      Audit.log(session.user_id, 'overhead_delete', 'Overheads', p.period_id, { total: old.total, rate: old.rate }, null);
      return { version: Version.bump() };
    });
  }
};
