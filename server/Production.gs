/**
 * Production.gs – produce a quantity of a product from its recipe (MORO v13 frmProduction):
 * one PROD_CONSUME movement per ingredient (recipe qty × produced qty) and one PROD_OUTPUT for
 * the product. Shortages do not block production (v13 asked and allowed it); the app shows them first.
 */
var Production = {
  /** Ingredients needed for qty of product, with what is available. */
  preview: function (product, qty) {
    var k = Util.key(product);
    var lines = Repo.all('Recipes').filter(function (r) { return Util.key(r.product) === k; });
    Util.require(lines.length, 'recipe_missing', product);
    return lines.map(function (r) {
      var item = Repo.find('Items', 'item_id', r.item_id);
      var bal = Repo.find('Balances', 'item_id', r.item_id);
      var need = Util.round(Number(r.qty_per_unit) * qty);
      var have = bal ? Number(bal.qty) : 0;
      return { item_id: r.item_id, name: item ? item.name : r.item_id, unit: item ? item.unit : '', need: need, available: have,
               enough: have >= need };
    });
  },

  partyId: function (name) {
    var p = Repo.all('Parties').filter(function (x) { return Util.key(x.name) === Util.key(name); })[0];
    if (p) return p.party_id;
    var n = 0;
    Repo.column('Parties', 'party_id').forEach(function (id) { n = Math.max(n, Number(String(id).slice(1)) || 0); });
    var id = 'P' + Util.pad(n + 1, 3);
    Repo.append('Parties', [{ party_id: id, name: name, kind: 'production', active: true }]);
    return id;
  },

  /** The finished product as an item (created on first production, unit as given). */
  productItem: function (product, unit) {
    var it = Repo.all('Items').filter(function (x) { return Util.key(x.name) === Util.key(product); })[0];
    if (it) return it;
    var n = 0;
    Repo.column('Items', 'item_id').forEach(function (id) { n = Math.max(n, Number(String(id).slice(1)) || 0); });
    it = { item_id: 'I' + Util.pad(n + 1, 4), name: Util.clean(product), category: 'Food', store: 'FINAL', unit: (unit || 'KG').toUpperCase(),
           min_stock: 0, image: '', active: true, aliases: '', created_at: Util.nowIso() };
    Repo.append('Items', [it]);
    return it;
  },

  /** payload: {product, qty, date, client_id, unit} */
  post: function (session, p) {
    var qty = Util.num(p.qty);
    Util.require(qty > 0, 'qty_invalid');
    Util.require(Util.isDate(p.date || ''), 'date_invalid');
    var lines = Production.preview(p.product, qty);
    var setup = withLock(function () {
      return { consume: Production.partyId('Production'), output: Production.partyId('Final Production'),
               item: Production.productItem(p.product, p.unit) };
    });
    var cid = p.client_id || Utilities.getUuid();
    var doc = 'PR-' + p.date.replace(/-/g, '').slice(2);
    var movs = lines.map(function (l, i) {
      return { client_id: cid + '-c' + i, kind: 'PROD_CONSUME', date: p.date, party_id: setup.consume, item_id: l.item_id,
               qty: l.need, unit: l.unit, doc_no: doc, purpose: Util.clean(p.product) };
    });
    movs.push({ client_id: cid + '-o', kind: 'PROD_OUTPUT', date: p.date, party_id: setup.output, item_id: setup.item.item_id,
                qty: qty, unit: setup.item.unit, doc_no: doc, purpose: Util.clean(p.product) });
    return Movements.save(session, { movements: movs }, ['PROD_CONSUME', 'PROD_OUTPUT']);
  }
};
