/**
 * Production.gs – produce a quantity of a product from its recipe (MORO v13 frmProduction):
 * one PROD_CONSUME movement per ingredient (recipe qty × produced qty) and one PROD_OUTPUT for
 * the product. Shortages do not block production (v13 asked and allowed it); the app shows them first.
 */
var Production = {
  /** Does producing take the recipe's ingredients from the stores? (a setting of the admin; off by default) */
  takesStock: function () { return Settings.get('recipes_take_stock', '') === '1'; },

  /** Ingredients needed for qty of product, with what is available. */
  preview: function (product, qty) {
    var k = Util.key(product);
    var lines = Repo.all('Recipes').filter(function (r) { return Util.key(r.product) === k && r.cost_only !== true; });
    Util.require(lines.length, 'recipe_missing', product);
    var have = function (id) { var bal = Repo.find('Balances', 'item_id', id); return bal ? Number(bal.qty) || 0 : 0; };
    var moves = null;
    var out = [];
    lines.forEach(function (r) {
      var need = Util.round(Number(r.qty_per_unit) * qty);
      // a family: the brands in the store, the oldest received first
      var parts = Families.isId(r.item_id) ? Families.allocate(r.item_id, need, have, Util.today(), moves || (moves = Repo.all('Movements')))
        : [{ item_id: r.item_id, qty: need }];
      parts.forEach(function (x) {
        var item = Repo.find('Items', 'item_id', x.item_id);
        var prev = out.filter(function (o) { return o.item_id === x.item_id; })[0];
        if (prev) { prev.need = Util.round(prev.need + x.qty); prev.enough = prev.available >= prev.need; return; }
        out.push({ item_id: x.item_id, name: item ? item.name : x.item_id, unit: item ? item.unit : '', need: x.qty, available: have(x.item_id),
                   enough: have(x.item_id) >= x.qty, family_id: x.family_id || '' });
      });
    });
    return out;
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
    // a final product without a recipe (a department's product): its stock goes up, no ingredient is taken
    var k = Util.key(p.product);
    var recipe = Repo.all('Recipes').some(function (r) { return Util.key(r.product) === k && r.cost_only !== true; });
    // taking the ingredients from the stores is switched on by the admin (off until the recipes are complete)
    var hasRecipe = recipe && Production.takesStock();
    if (!hasRecipe) {
      var fin = Repo.all('Items').filter(function (x) { return Util.key(x.name) === k && Stores.of(x) === 'FINAL' && x.active === true; })[0];
      Util.require(fin || recipe, 'recipe_missing', p.product);
      if (fin) p.unit = fin.unit;
    }
    if (session.role === 'section_head' || (session.role === 'branch_manager' && (session.depts || []).length)) {
      var mine = Repo.all('Items').filter(function (x) { return Util.key(x.name) === k; })[0];
      Util.require(mine && (session.depts || []).indexOf(String(mine.dept || '')) >= 0, 'not_your_product', p.product);
    }
    var lines = hasRecipe ? Production.preview(p.product, qty) : [];
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
    // the product's expiry: the production day plus its shelf life (set with its price), when it has one
    var shelf = Number(setup.item.shelf_days) || 0, expiry = '';
    if (shelf > 0) { var d = new Date(p.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + shelf); expiry = d.toISOString().slice(0, 10); }
    movs.push({ client_id: cid + '-o', kind: 'PROD_OUTPUT', date: p.date, party_id: setup.output, item_id: setup.item.item_id,
                qty: qty, unit: setup.item.unit, doc_no: doc, purpose: Util.clean(p.product), expiry: expiry });
    var saved = Movements.save(session, { movements: movs }, ['PROD_CONSUME', 'PROD_OUTPUT']);
    Shop.madeNotify(session, setup.item.item_id);
    // the batch number of this production (its traceability record)
    saved.batch_no = BatchRec.afterProduction(session, saved);
    return saved;
  }
};
