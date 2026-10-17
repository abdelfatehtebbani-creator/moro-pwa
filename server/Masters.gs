/**
 * Masters.gs – items, parties (suppliers/departments), lists, recipes and the bootstrap payload.
 * Names are display text only; every relation uses the stable ID, so a rename touches one cell.
 */
var CATEGORIES = ['Food', 'Packaging'];
var PARTY_KINDS = ['supplier', 'section'];
var DEFAULT_UNITS = ['BAG', 'BOX', 'PC', 'PK', 'KG', 'L', 'G'];

var Masters = {
  /** payload: {item_id?, name, store (or category from older apps), unit, min_stock, image, active} */
  saveItem: function (session, p) {
    return withLock(function () {
      var name = Util.clean(p.name);
      Util.require(name, 'name_required');
      var dup = Repo.all('Items').filter(function (i) { return Util.key(i.name) === Util.key(name) && i.item_id !== p.item_id; });
      Util.require(!dup.length, 'name_taken', dup.length ? dup[0].item_id : '');
      var store = p.store !== undefined ? p.store : (p.category === 'Packaging' ? 'PACK' : p.category === 'Food' ? 'DRY' : '');
      if (!p.item_id) {
        Util.require(Stores.valid(store), 'store_invalid');
        Util.require(Util.clean(p.unit), 'unit_required');
        var n = 0;
        Repo.column('Items', 'item_id').forEach(function (id) { n = Math.max(n, Number(String(id).slice(1)) || 0); });
        var item = { item_id: 'I' + Util.pad(n + 1, 4), name: name, category: Stores.categoryOf(store), unit: Util.clean(p.unit).toUpperCase(),
                     min_stock: Util.num(p.min_stock) || 0, image: Util.clean(p.image), active: true, aliases: '',
                     created_at: Util.nowIso(), store: store,
                     pack_units: p.pack_units !== undefined && Perm.has(session, 'packaging') ? Packs.pack(Util.clean(p.unit).toUpperCase(), p.pack_units) : '',
                     report_unit: p.report_unit !== undefined && Perm.has(session, 'packaging') ? Util.clean(p.report_unit).toUpperCase() : '' };
        Repo.append('Items', [item]);
        Audit.log(session.user_id, 'item_create', 'Items', item.item_id, null, item);
        return { item: item, version: Version.bump() };
      }
      var cur = Repo.find('Items', 'item_id', p.item_id);
      Util.require(cur, 'not_found');
      var ch = {};
      if (Util.key(name) !== Util.key(cur.name) || name !== cur.name) {
        Perm.require(session, 'rename');
        ch.name = name;
        var aliases = String(cur.aliases || '').split(' | ').filter(String);
        if (aliases.indexOf(cur.name) < 0) aliases.push(cur.name);
        ch.aliases = aliases.join(' | ');
      }
      if (p.unit !== undefined) ch.unit = Util.clean(p.unit).toUpperCase() || cur.unit;
      // moving an item to another store is the admin's (like a rename); older apps send only a category
      if (p.store !== undefined || p.category !== undefined) {
        var curStore = Stores.of(cur);
        var to = p.store !== undefined ? p.store : (Stores.categoryOf(curStore) === p.category ? curStore : store);
        Util.require(Stores.valid(to), 'store_invalid');
        if (to !== curStore || to !== cur.store) {
          if (to !== curStore) Perm.require(session, 'rename');
          ch.store = to;
          ch.category = Stores.categoryOf(to);
        }
      }
      if (p.min_stock !== undefined) {
        Perm.require(session, 'min_stock');
        var mn = Util.num(p.min_stock);
        Util.require(mn !== null && mn >= 0, 'min_invalid');
        ch.min_stock = mn;
      }
      if (p.image !== undefined) ch.image = Util.clean(p.image);
      if (p.pack_units !== undefined || p.report_unit !== undefined) {
        Perm.require(session, 'packaging');
        // a storekeeper sets the purchase unit only for the items of their own stores
        if (session.role === 'storekeeper') Stores.require(session, Stores.of(cur));
        var stockUnit = ch.unit || cur.unit;
        var packs = p.pack_units !== undefined ? Packs.pack(stockUnit, p.pack_units) : cur.pack_units;
        var ru = p.report_unit !== undefined ? Util.clean(p.report_unit).toUpperCase() : String(cur.report_unit || '');
        Util.require(!ru || ru === String(stockUnit).toUpperCase() || Packs.factor({ unit: stockUnit, pack_units: packs }, ru), 'unit_not_defined', ru);
        ch.pack_units = packs;
        ch.report_unit = ru;
      }
      if (p.active !== undefined && (p.active === true) !== (cur.active === true)) {
        Perm.require(session, 'rename');
        ch.active = p.active === true;
      }
      var res = Repo.update('Items', 'item_id', cur.item_id, ch);
      if (ch.unit) Repo.update('Balances', 'item_id', cur.item_id, { unit: ch.unit });
      Audit.log(session.user_id, 'item_update', 'Items', cur.item_id, res.before, res.after);
      return { item: res.after, version: Version.bump() };
    });
  },

  /** payload: {party_id?, name, kind, active} */
  saveParty: function (session, p) {
    return withLock(function () {
      var name = Util.clean(p.name);
      Util.require(name, 'name_required');
      var dup = Repo.all('Parties').filter(function (x) { return Util.key(x.name) === Util.key(name) && x.party_id !== p.party_id; });
      Util.require(!dup.length, 'name_taken', dup.length ? dup[0].party_id : '');
      if (!p.party_id) {
        Util.require(PARTY_KINDS.indexOf(p.kind) >= 0, 'kind_invalid');
        var n = 0;
        Repo.column('Parties', 'party_id').forEach(function (id) { n = Math.max(n, Number(String(id).slice(1)) || 0); });
        var party = { party_id: 'P' + Util.pad(n + 1, 3), name: name, kind: p.kind, active: true };
        Repo.append('Parties', [party]);
        Audit.log(session.user_id, 'party_create', 'Parties', party.party_id, null, party);
        return { party: party, version: Version.bump() };
      }
      var cur = Repo.find('Parties', 'party_id', p.party_id);
      Util.require(cur, 'not_found');
      var ch = {};
      if (name !== cur.name) { Perm.require(session, 'rename'); ch.name = name; }
      if (p.active !== undefined && (p.active === true) !== (cur.active === true)) {
        Perm.require(session, 'rename');
        ch.active = p.active === true;
      }
      var res = Repo.update('Parties', 'party_id', cur.party_id, ch);
      Audit.log(session.user_id, 'party_update', 'Parties', cur.party_id, res.before, res.after);
      return { party: res.after, version: Version.bump() };
    });
  },

  /**
   * payload: {location_id?, name, store, active}. Receipts keep the location's name as it was,
   * so a rename shows in new receipts only. Like parties: anyone with "masters" adds, the admin
   * renames or switches off (a switched-off location leaves the list, its history stays).
   */
  saveLocation: function (session, p) {
    return withLock(function () {
      var name = Util.clean(p.name);
      Util.require(name, 'name_required');
      var dup = Repo.all('Locations').filter(function (x) { return Util.key(x.name) === Util.key(name) && x.location_id !== p.location_id; });
      Util.require(!dup.length, 'name_taken', dup.length ? dup[0].location_id : '');
      var store = p.store !== undefined ? p.store : (p.category === 'Packaging' ? 'PACK' : p.category === 'Food' ? 'DRY' : '');
      if (!p.location_id) {
        Util.require(Stores.valid(store), 'store_invalid');
        var n = 0;
        Repo.column('Locations', 'location_id').forEach(function (id) { n = Math.max(n, Number(String(id).slice(1)) || 0); });
        var loc = { location_id: 'L' + Util.pad(n + 1, 2), name: name, category: Stores.categoryOf(store), active: true, store: store };
        Repo.append('Locations', [loc]);
        Audit.log(session.user_id, 'location_create', 'Locations', loc.location_id, null, loc);
        return { location: loc, version: Version.bump() };
      }
      var cur = Repo.find('Locations', 'location_id', p.location_id);
      Util.require(cur, 'not_found');
      var ch = {};
      if (name !== cur.name) { Perm.require(session, 'rename'); ch.name = name; }
      if ((p.store !== undefined || p.category !== undefined) && store !== Stores.of(cur) &&
          !(p.store === undefined && Stores.categoryOf(Stores.of(cur)) === p.category)) {
        Util.require(Stores.valid(store), 'store_invalid');
        Perm.require(session, 'rename');
        ch.store = store;
        ch.category = Stores.categoryOf(store);
      }
      if (p.active !== undefined && (p.active === true) !== (cur.active === true)) {
        Perm.require(session, 'rename');
        ch.active = p.active === true;
      }
      var res = Repo.update('Locations', 'location_id', cur.location_id, ch);
      Audit.log(session.user_id, 'location_update', 'Locations', cur.location_id, res.before, res.after);
      return { location: res.after, version: Version.bump() };
    });
  },

  /** First run of the Units sheet: the usual units plus every unit the items already use. */
  seedUnits: function () {
    if (Repo.all('Units').length) return;
    var seen = {};
    var units = DEFAULT_UNITS.concat(Repo.column('Items', 'unit')).map(function (u) { return Util.clean(u).toUpperCase(); })
      .filter(function (u) { if (!u || seen[u]) return false; seen[u] = true; return true; });
    Repo.append('Units', units.map(function (u) { return { unit: u, active: true }; }));
  },

  /**
   * payload: {unit, active}. Items, balances and movements keep the unit as text, so a unit is never
   * renamed: a new one is added and the old one switched off (it leaves the lists, history stays).
   */
  saveUnit: function (session, p) {
    return withLock(function () {
      var unit = Util.clean(p.unit).toUpperCase();
      Util.require(unit, 'name_required');
      var cur = Repo.find('Units', 'unit', unit);
      if (!cur) {
        Repo.append('Units', [{ unit: unit, active: true }]);
        Audit.log(session.user_id, 'unit_create', 'Units', unit, null, { unit: unit, active: true });
        return { unit: unit, version: Version.bump() };
      }
      Util.require(p.active !== undefined, 'name_taken', unit);
      if ((p.active === true) === (cur.active === true)) return { unit: unit, version: Version.get() };
      Perm.require(session, 'rename');
      var res = Repo.update('Units', 'unit', unit, { active: p.active === true });
      Audit.log(session.user_id, 'unit_update', 'Units', unit, res.before, res.after);
      return { unit: unit, version: Version.bump() };
    });
  },

  /** payload: {list: 'FAST'|'SENSITIVE', item_ids: [...]} – replaces that list. */
  saveList: function (session, p) {
    Util.require(['FAST', 'SENSITIVE'].indexOf(p.list) >= 0, 'list_invalid');
    return withLock(function () {
      var ids = (p.item_ids || []).filter(function (id, i, a) { return a.indexOf(id) === i; });
      ids.forEach(function (id) { Util.require(Repo.find('Items', 'item_id', id), 'item_unknown', id); });
      var keep = Repo.all('Lists').filter(function (r) { return r.list !== p.list; });
      Repo.replaceAll('Lists', keep.concat(ids.map(function (id) { return { list: p.list, item_id: id }; })));
      Audit.log(session.user_id, 'list_save', 'Lists', p.list, null, { count: ids.length });
      return { count: ids.length, version: Version.bump() };
    });
  },

  /** payload: {product, lines: [{item_id, qty_per_unit}]} – replaces that product's recipe. */
  saveRecipe: function (session, p) {
    var product = Util.clean(p.product);
    Util.require(product, 'name_required');
    return withLock(function () {
      var lines = (p.lines || []).filter(function (l) { return Util.num(l.qty_per_unit) > 0; });
      lines.forEach(function (l) { Util.require(Repo.find('Items', 'item_id', l.item_id), 'item_unknown', l.item_id); });
      var keep = Repo.all('Recipes').filter(function (r) { return Util.key(r.product) !== Util.key(product); });
      Repo.replaceAll('Recipes', keep.concat(lines.map(function (l) {
        return { product: product, item_id: l.item_id, qty_per_unit: Util.num(l.qty_per_unit) };
      })));
      Audit.log(session.user_id, 'recipe_save', 'Recipes', product, null, { lines: lines.length });
      return { lines: lines.length, version: Version.bump() };
    });
  },

  /** Everything the app needs to work offline, except the movement history. */
  bootstrap: function (session) {
    var settings = Settings.all();
    ['seq_movement', 'migrated_from', 'migrated_at'].forEach(function (k) { delete settings[k]; });
    return {
      user: session,
      permissions: session.perms,
      caps: session.caps,
      cap_list: Perm.has(session, 'users.save') ? Object.keys(CAPS) : [],
      role_caps: Perm.has(session, 'users.save') ? ROLE_CAPS : {},
      version: Version.get(),
      today: Util.today(),
      settings: settings,
      items: Repo.raw('Items'),
      parties: Repo.raw('Parties'),
      locations: Repo.raw('Locations'),
      units: Repo.raw('Units'),
      purposes: Repo.raw('Purposes'),
      lists: Repo.raw('Lists'),
      recipes: Repo.raw('Recipes'),
      balances: Repo.raw('Balances'),
      contacts: Perm.has(session, 'see_prices') ? Repo.raw('Contacts') : { columns: [], rows: [] }
    };
  }
};
