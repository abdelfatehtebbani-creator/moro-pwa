/**
 * Packs.gs – packaging units of an item (eggs: stock unit PC; TRAY = 30 PC; BOX = 360 PC).
 *
 * The balance and every movement are kept in the item's stock unit (Items.unit). A movement may be
 * entered in a packaging unit: it is converted to the stock unit on save, and what was typed is kept
 * in entry_qty / entry_unit (the supplier invoice stays "10 BOX × 90"). Items.pack_units is plain text,
 * editable in the sheet too: "TRAY=30, BOX=360" (each factor in stock units). Items.report_unit is the
 * unit the reports show (empty = stock unit). An item without packaging units works exactly as before.
 */
var Packs = {
  /** [{unit, factor}] of an item row. */
  list: function (item) {
    return String((item && item.pack_units) || '').split(/[,;\n]/).map(function (p) {
      var m = p.split('=');
      var unit = Util.clean(m[0]).toUpperCase(), factor = Util.num(m[1]);
      return unit && factor > 0 ? { unit: unit, factor: factor } : null;
    }).filter(Boolean);
  },

  /** Stock units in one `unit` of the item (1 for the stock unit), or null when the unit is not defined. */
  factor: function (item, unit) {
    var u = Util.clean(unit).toUpperCase();
    if (!item || !u || u === String(item.unit).toUpperCase()) return 1;
    var p = Packs.list(item).filter(function (x) { return x.unit === u; })[0];
    return p ? p.factor : null;
  },

  /** Cleans packaging units sent by the app ([{unit, factor}] or text) into the stored text. */
  pack: function (stockUnit, value) {
    var list = Array.isArray(value) ? value : Packs.list({ pack_units: value });
    var seen = {};
    return list.map(function (p) {
      var unit = Util.clean(p.unit).toUpperCase(), factor = Util.num(p.factor);
      Util.require(unit && factor > 0, 'pack_invalid', unit);
      Util.require(unit !== String(stockUnit).toUpperCase() && !seen[unit], 'pack_invalid', unit);
      seen[unit] = true;
      return unit + '=' + Util.round(factor);
    }).join(', ');
  },

  /**
   * Admin: the item's stock unit becomes `newUnit`, 1 old unit = `factor` new units (BOX → PC: 360).
   * Balance, minimum, every movement (what was typed is kept in entry_qty/entry_unit), open requests,
   * shop order lines and recipes are multiplied by the factor; the old unit becomes a packaging unit.
   * p.preview = true only reports what would change.
   */
  convert: function (session, p) {
    var item = Repo.find('Items', 'item_id', p.item_id);
    Util.require(item, 'not_found');
    var newUnit = Util.clean(p.new_unit).toUpperCase(), factor = Util.num(p.factor);
    var oldUnit = String(item.unit).toUpperCase();
    Util.require(newUnit && newUnit !== oldUnit, 'unit_required');
    Util.require(factor > 0 && factor !== 1, 'factor_invalid');
    var bal = Repo.find('Balances', 'item_id', item.item_id);
    var before = bal ? Number(bal.qty) || 0 : 0;
    var movs = Repo.all('Movements').filter(function (m) { return m.item_id === item.item_id; });
    var preview = { item_id: item.item_id, name: item.name, old_unit: oldUnit, new_unit: newUnit, factor: factor,
      balance_before: before, balance_after: Util.round(before * factor), min_before: Number(item.min_stock) || 0,
      min_after: Util.round((Number(item.min_stock) || 0) * factor), movements: movs.length };
    if (p.preview) return preview;
    return withLock(function () {
      var x = function (v) { return v === '' || v === null || v === undefined ? v : Util.round(Number(v) * factor); };
      Repo.setColumn('Movements', 'entry_qty', function (m) {
        if (m.item_id !== item.item_id) return m.entry_qty;
        return m.entry_qty !== '' && m.entry_qty !== undefined ? m.entry_qty : Math.abs(Number(m.qty));
      });
      Repo.setColumn('Movements', 'entry_unit', function (m) {
        if (m.item_id !== item.item_id) return m.entry_unit;
        return m.entry_unit ? m.entry_unit : (m.unit || oldUnit);
      });
      Repo.setColumn('Movements', 'qty', function (m) { return m.item_id === item.item_id ? x(m.qty) : m.qty; });
      Repo.setColumn('Movements', 'unit', function (m) { return m.item_id === item.item_id ? newUnit : m.unit; });
      if (bal) Repo.update('Balances', 'item_id', item.item_id, { qty: x(bal.qty), unit: newUnit });
      ['RequestLines', 'ShopOrderLines'].forEach(function (t) {
        ['qty', 'issued_qty', 'reserved_qty', 'handed_qty', 'returned_qty'].forEach(function (c) {
          if (Repo.raw(t).columns.indexOf(c) < 0) return;
          Repo.setColumn(t, c, function (r) { return r.item_id === item.item_id ? x(r[c]) : r[c]; });
        });
        if (Repo.raw(t).columns.indexOf('unit') >= 0) Repo.setColumn(t, 'unit', function (r) { return r.item_id === item.item_id ? newUnit : r.unit; });
      });
      Repo.setColumn('Recipes', 'qty_per_unit', function (r) { return r.item_id === item.item_id ? x(r.qty_per_unit) : r.qty_per_unit; });
      // packaging units were counted in the old unit; the old unit itself becomes one
      var packs = Packs.list(item).map(function (q) { return { unit: q.unit, factor: q.factor * factor }; })
        .filter(function (q) { return q.unit !== newUnit; });
      if (!packs.some(function (q) { return q.unit === oldUnit; })) packs.push({ unit: oldUnit, factor: factor });
      Repo.update('Items', 'item_id', item.item_id, { unit: newUnit, min_stock: x(item.min_stock) || 0,
        pack_units: Packs.pack(newUnit, packs), report_unit: item.report_unit || oldUnit });
      Audit.log(session.user_id, 'item_unit_convert', 'Items', item.item_id, null, preview);
      preview.done = true;
      preview.version = Version.bump();
      return preview;
    });
  }
};
