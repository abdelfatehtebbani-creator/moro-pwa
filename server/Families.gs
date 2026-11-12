/**
 * Families.gs – a generic material (a family) that recipes use instead of one brand.
 *
 *   The factory does not keep to one brand per material (ghee: twenty brands in a year). A family, like
 *   "Vegetable ghee" in KG, stands between the recipe and the brands: each brand item is linked to it with how many
 *   family units one unit of the brand holds (QBB 4*4 kg = 16 KG). A recipe line names the family; producing takes
 *   the brands in the store, the oldest received first, and the movements keep which brand was really used.
 *   Its cost per family unit is the average of the brands in the store, else the latest bought.
 */
var Families = {
  isId: function (id) { return /^F\d+$/.test(String(id || '')); },

  /** The brands of a family: [{item, factor}] (active, with a factor). */
  members: function (familyId) {
    return Repo.all('Items').filter(function (i) { return String(i.family_id || '') === familyId && i.active === true && Number(i.family_factor) > 0; })
      .map(function (i) { return { item: i, factor: Number(i.family_factor) }; });
  },

  /**
   * need family units → the brands to take: [{item_id, qty (brand units), unit}].
   * have(item_id) is the stock of a brand; day and moves tell which was received first.
   */
  allocate: function (familyId, need, have, day, moves) {
    var fam = Repo.find('Families', 'family_id', familyId);
    var ms = Families.members(familyId);
    Util.require(fam && ms.length, 'family_empty', fam ? fam.name : familyId);
    var received = function (id) {   // the oldest receipt still in the store (what goes first)
      var lots = BatchRec.lots(id, day, Math.max(0, have(id)), moves);
      return lots.length ? lots[0].received + '|' + lots[0].movement_id : '9999';
    };
    var stocked = ms.filter(function (m) { return have(m.item.item_id) > 0; })
      .map(function (m) { m.first = received(m.item.item_id); return m; })
      .sort(function (a, b) { return a.first < b.first ? -1 : a.first > b.first ? 1 : 0; });
    var left = need, out = {};
    stocked.forEach(function (m) {
      if (left <= 1e-9) return;
      var take = Math.min(left, have(m.item.item_id) * m.factor);
      out[m.item.item_id] = (out[m.item.item_id] || 0) + take / m.factor;
      left = Util.round(left - take);
    });
    if (left > 1e-9) {
      // not enough in the store (production is not blocked): the rest goes on the brand bought last
      var last = Families.lastBought(ms, moves) || ms[0];
      out[last.item.item_id] = (out[last.item.item_id] || 0) + left / last.factor;
    }
    return ms.filter(function (m) { return out[m.item.item_id]; }).map(function (m) {
      return { item_id: m.item.item_id, qty: Util.round(out[m.item.item_id]), unit: m.item.unit, family_id: familyId };
    });
  },

  lastBought: function (ms, moves) {
    var best = null, key = '';
    moves.forEach(function (mv) {
      if (mv.kind !== 'RECEIPT' || mv.status === 'deleted') return;
      var m = ms.filter(function (x) { return x.item.item_id === mv.item_id; })[0];
      var k = String(mv.date) + '|' + String(mv.movement_id);
      if (m && k > key) { key = k; best = m; }
    });
    return best;
  },

  /** Cost of one family unit: {unit, date} – the brands in the store by their latest prices, else the latest bought. */
  cost: function (familyId, costs) {
    var ms = Families.members(familyId);
    var qty = 0, value = 0, latest = null;
    ms.forEach(function (m) {
      var c = costs[m.item.item_id];
      if (!c) return;
      var per = c.unit / m.factor;
      if (!latest || c.date > latest.date) latest = { unit: per, date: c.date };
      var bal = Repo.find('Balances', 'item_id', m.item.item_id);
      var h = bal ? Math.max(0, Number(bal.qty) || 0) * m.factor : 0;
      if (h > 0) { qty += h; value += h * per; }
    });
    if (qty > 0) return { unit: value / qty, date: latest ? latest.date : '' };
    return latest;
  },

  /** The raw materials (food stores): a new one is classed in a family with what one of its units holds. */
  RAW_STORES: ['DRY', 'CHILLED'],

  /**
   * The family of an item being saved (inside the lock): p.family_id (an existing one) or p.new_family {name, name_ar, unit}.
   * Returns {family_id, factor}, or null when neither is given.
   */
  ofItem: function (session, p) {
    if (!p.family_id && !p.new_family) return null;
    var factor = Util.num(p.family_factor);
    Util.require(factor > 0, 'family_factor', Util.clean(p.name));
    if (p.family_id) {
      var f = Repo.find('Families', 'family_id', p.family_id);
      Util.require(f && f.active === true, 'family_unknown');
      return { family_id: f.family_id, factor: factor };
    }
    var nf = p.new_family || {};
    var name = Util.clean(nf.name);
    Util.require(name, 'family_name_required');
    var same = Repo.all('Families').filter(function (x) { return Util.key(x.name) === Util.key(name); })[0];
    Util.require(!same, 'family_exists', name);
    var n = 0;
    Repo.column('Families', 'family_id').forEach(function (x) { n = Math.max(n, Number(String(x).slice(1)) || 0); });
    var id = 'F' + Util.pad(n + 1, 3);
    Repo.append('Families', [{ family_id: id, name: name, name_ar: Util.clean(nf.name_ar), unit: Util.clean(nf.unit).toUpperCase() || 'KG', active: true, created_at: Util.nowIso() }]);
    Audit.log(session.user_id, 'family_save', 'Families', id, null, { name: name, from_item: true });
    return { family_id: id, factor: factor };
  },

  /** p: {family_id?, name, name_ar, unit, active, members: [{item_id, factor}]}. Creates or changes a family and its brands. */
  save: function (session, p) {
    var name = Util.clean(p.name);
    Util.require(name, 'name_required');
    var unit = Util.clean(p.unit).toUpperCase() || 'KG';
    var members = (p.members || []).map(function (m) { return { item_id: String(m.item_id || ''), factor: Util.num(m.factor) }; });
    members.forEach(function (m) {
      var it = Repo.find('Items', 'item_id', m.item_id);
      Util.require(it, 'item_unknown', m.item_id);
      Util.require(Stores.of(it) !== 'FINAL', 'family_final', it.name);
      Util.require(m.factor > 0, 'family_factor', it.name);
    });
    return withLock(function () {
      var same = Repo.all('Families').filter(function (f) { return Util.key(f.name) === Util.key(name) && f.family_id !== p.family_id; })[0];
      Util.require(!same, 'family_exists', name);
      var id = p.family_id;
      if (id) {
        var old = Repo.find('Families', 'family_id', id);
        Util.require(old, 'not_found');
        Repo.update('Families', 'family_id', id, { name: name, name_ar: Util.clean(p.name_ar), unit: unit, active: p.active !== false });
      } else {
        var n = 0;
        Repo.column('Families', 'family_id').forEach(function (x) { n = Math.max(n, Number(String(x).slice(1)) || 0); });
        id = 'F' + Util.pad(n + 1, 3);
        Repo.append('Families', [{ family_id: id, name: name, name_ar: Util.clean(p.name_ar), unit: unit, active: p.active !== false, created_at: Util.nowIso() }]);
      }
      // the brands: those listed are linked with their factor; those no longer listed are unlinked
      var want = {};
      members.forEach(function (m) { want[m.item_id] = m.factor; });
      Repo.all('Items').forEach(function (i) {
        var was = String(i.family_id || '') === id;
        if (want[i.item_id] !== undefined) {
          if (!was || Number(i.family_factor) !== want[i.item_id]) Repo.update('Items', 'item_id', i.item_id, { family_id: id, family_factor: want[i.item_id] });
        } else if (was) Repo.update('Items', 'item_id', i.item_id, { family_id: '', family_factor: '' });
      });
      Audit.log(session.user_id, 'family_save', 'Families', id, null, { name: name, unit: unit, brands: members.length });
      return { family_id: id, version: Version.bump() };
    });
  }
};
