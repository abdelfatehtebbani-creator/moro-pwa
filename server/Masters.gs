/**
 * Masters.gs – items, parties (suppliers/departments), lists, recipes and the bootstrap payload.
 * Names are display text only; every relation uses the stable ID, so a rename touches one cell.
 */
var CATEGORIES = ['Food', 'Packaging'];
var PARTY_KINDS = ['supplier', 'section'];
/** A supplier's contact details, printed on its LPOs. */
var PARTY_CONTACT = ['tel', 'fax', 'email', 'contact', 'contact_phone'];
var DEFAULT_UNITS = ['BAG', 'BOX', 'PC', 'PK', 'KG', 'L', 'G'];

var Masters = {
  /** The admin's fixed price of a final product (per stock unit); '' = not set. */
  finalPrice: function (v) {
    if (v === '' || v === null || v === undefined) return '';
    var n = Util.num(v);
    Util.require(n !== null && n >= 0, 'price_invalid');
    return Util.round(n);
  },

  /** payload: {item_id?, name, store (or category from older apps), unit, min_stock, image, active} */
  saveItem: function (session, p) {
    return withLock(function () {
      var name = Util.clean(p.name);
      Util.require(name, 'name_required');
      var dup = Repo.all('Items').filter(function (i) { return Util.key(i.name) === Util.key(name) && i.item_id !== p.item_id; });
      Util.require(!dup.length, 'name_taken', dup.length ? dup[0].item_id : '');
      var store = p.store !== undefined ? p.store : (p.category === 'Packaging' ? 'PACK' : p.category === 'Food' ? 'DRY' : '');
      if (!p.item_id) {
        Perm.require(session, 'add_items');
        Util.require(Stores.valid(store), 'store_invalid');
        Util.require(Util.clean(p.unit), 'unit_required');
        var n = 0;
        Repo.column('Items', 'item_id').forEach(function (id) { n = Math.max(n, Number(String(id).slice(1)) || 0); });
        var item = { item_id: 'I' + Util.pad(n + 1, 4), name: name, category: Stores.categoryOf(store), unit: Util.clean(p.unit).toUpperCase(),
                     min_stock: Util.num(p.min_stock) || 0, image: Util.clean(p.image), active: true, aliases: '',
                     created_at: Util.nowIso(), store: store,
                     pack_units: p.pack_units !== undefined && Perm.has(session, 'packaging') ? Packs.pack(Util.clean(p.unit).toUpperCase(), p.pack_units) : '',
                     report_unit: p.report_unit !== undefined && Perm.has(session, 'packaging') ? Util.clean(p.report_unit).toUpperCase() : '',
                     store_unit: p.store_unit !== undefined && Perm.has(session, 'packaging') ? Util.clean(p.store_unit).toUpperCase() : '',
                     final_price: p.final_price !== undefined && Perm.has(session, 'final_price') ? Masters.finalPrice(p.final_price) : '' };
        Repo.append('Items', [item]);
        Audit.log(session.user_id, 'item_create', 'Items', item.item_id, null, item);
        return { item: item, version: Version.bump() };
      }
      var cur = Repo.find('Items', 'item_id', p.item_id);
      Util.require(cur, 'not_found');
      var ch = {};
      if (Util.key(name) !== Util.key(cur.name) || name !== cur.name) {
        Perm.require(session, 'rename.items');
        ch.name = name;
        var aliases = String(cur.aliases || '').split(' | ').filter(String);
        if (aliases.indexOf(cur.name) < 0) aliases.push(cur.name);
        ch.aliases = aliases.join(' | ');
      }
      if (p.unit !== undefined && Util.clean(p.unit) && Util.clean(p.unit).toUpperCase() !== String(cur.unit).toUpperCase()) {
        var used = Repo.all('Movements').some(function (m) { return m.item_id === cur.item_id; });
        Util.require(!used, 'unit_change_use_convert');
        ch.unit = Util.clean(p.unit).toUpperCase();
      }
      // moving an item to another store is the admin's (like a rename); older apps send only a category
      if (p.store !== undefined || p.category !== undefined) {
        var curStore = Stores.of(cur);
        var to = p.store !== undefined ? p.store : (Stores.categoryOf(curStore) === p.category ? curStore : store);
        Util.require(Stores.valid(to), 'store_invalid');
        if (to !== curStore || to !== cur.store) {
          if (to !== curStore) Perm.require(session, 'rename.items');
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
      if (p.final_price !== undefined && String(p.final_price) !== String(cur.final_price === undefined ? '' : cur.final_price)) {
        Perm.require(session, 'final_price');
        ch.final_price = Masters.finalPrice(p.final_price);
      }
      if (p.pack_units !== undefined || p.report_unit !== undefined || p.store_unit !== undefined) {
        Perm.require(session, 'packaging');
        // a storekeeper sets units only for the items of their own stores
        if (session.role === 'storekeeper') Stores.require(session, Stores.of(cur));
        var stockUnit = ch.unit || cur.unit;
        var packs = p.pack_units !== undefined ? Packs.pack(stockUnit, p.pack_units) : cur.pack_units;
        var defined = function (u) { return !u || u === String(stockUnit).toUpperCase() || Packs.factor({ unit: stockUnit, pack_units: packs }, u); };
        // display units: purchasing chooses its own (receiving, reports), the storekeeper theirs (issues, dashboard)
        var ru = p.report_unit !== undefined ? Util.clean(p.report_unit).toUpperCase() : String(cur.report_unit || '');
        var su = p.store_unit !== undefined ? Util.clean(p.store_unit).toUpperCase() : String(cur.store_unit || '');
        if (ru !== String(cur.report_unit || '')) Util.require(session.role !== 'storekeeper', 'forbidden');
        if (su !== String(cur.store_unit || '')) Util.require(session.role !== 'purchasing', 'forbidden');
        if (p.report_unit !== undefined) Util.require(defined(ru), 'unit_not_defined', ru);
        if (p.store_unit !== undefined) Util.require(defined(su), 'unit_not_defined', su);
        // a unit no longer defined (the larger unit removed) falls back to the base unit
        ch.pack_units = packs;
        ch.report_unit = defined(ru) ? ru : '';
        ch.store_unit = defined(su) ? su : '';
      }
      if (p.active !== undefined && (p.active === true) !== (cur.active === true)) {
        Perm.require(session, 'rename.items');
        ch.active = p.active === true;
      }
      var res = Repo.update('Items', 'item_id', cur.item_id, ch);
      if (ch.unit) Repo.update('Balances', 'item_id', cur.item_id, { unit: ch.unit });
      Audit.log(session.user_id, 'item_update', 'Items', cur.item_id, res.before, res.after);
      return { item: res.after, version: Version.bump() };
    });
  },

  /** payload: {party_id?, name, kind, active} */
  /** payload: {party_id?, name, kind, active, tel, fax, email, contact, contact_phone} */
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
        PARTY_CONTACT.forEach(function (c) { if (p[c] !== undefined) party[c] = Util.clean(p[c]); });
        Repo.append('Parties', [party]);
        Audit.log(session.user_id, 'party_create', 'Parties', party.party_id, null, party);
        return { party: party, version: Version.bump() };
      }
      var cur = Repo.find('Parties', 'party_id', p.party_id);
      Util.require(cur, 'not_found');
      var ch = {};
      if (name !== cur.name) { Perm.require(session, 'rename.parties'); ch.name = name; }
      if (p.active !== undefined && (p.active === true) !== (cur.active === true)) {
        Perm.require(session, 'rename.parties');
        ch.active = p.active === true;
      }
      // a supplier's contact details (printed on the LPO): whoever may add suppliers keeps them up to date
      PARTY_CONTACT.forEach(function (c) { if (p[c] !== undefined && Util.clean(p[c]) !== String(cur[c] || '')) ch[c] = Util.clean(p[c]); });
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
      if (name !== cur.name) { Perm.require(session, 'rename.locations'); ch.name = name; }
      if ((p.store !== undefined || p.category !== undefined) && store !== Stores.of(cur) &&
          !(p.store === undefined && Stores.categoryOf(Stores.of(cur)) === p.category)) {
        Util.require(Stores.valid(store), 'store_invalid');
        Perm.require(session, 'rename.locations');
        ch.store = store;
        ch.category = Stores.categoryOf(store);
      }
      if (p.active !== undefined && (p.active === true) !== (cur.active === true)) {
        Perm.require(session, 'rename.locations');
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
      Perm.require(session, 'rename.units');
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
      // each user keeps their own list; the others' lists (and the shared one) stay as they are.
      // An emptied list is remembered by a marker row (LIST#), so the shared list does not come back.
      Perm.require(session, 'report.' + (p.list === 'FAST' ? 'fast' : 'sensitive'));
      var me = session.user_id;
      var keep = Repo.all('Lists').filter(function (r) {
        return !((r.list === p.list || r.list === p.list + '#') && String(r.user_id || '') === me);
      });
      var rows = ids.length ? ids.map(function (id) { return { list: p.list, item_id: id, user_id: me }; })
                            : [{ list: p.list + '#', item_id: '', user_id: me }];
      Repo.replaceAll('Lists', keep.concat(rows));
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
    var batches = Batches.all();
    ['seq_movement', 'migrated_from', 'migrated_at'].forEach(function (k) { delete settings[k]; });
    return {
      user: session,
      permissions: session.perms,
      caps: session.caps,
      // who entered a record: names only, shown in the records lists
      user_names: (function () { var o = {}; Repo.all('Users').forEach(function (u) { o[u.user_id] = u.display_name; }); return o; })(),
      perm_tree: Perm.has(session, 'users.save') ? PERM_TREE : [],
      role_caps: Perm.has(session, 'users.save') ? ROLE_CAPS : {},
      version: Version.get(),
      today: Util.today(),
      settings: settings,
      items: Repo.raw('Items'),
      parties: Repo.raw('Parties'),
      locations: Repo.raw('Locations'),
      units: Repo.raw('Units'),
      purposes: Repo.raw('Purposes'),
      // the user's own report lists; a list they never edited is the shared one (from before personal lists)
      lists: (function () {
        var all = Repo.all('Lists'), me = session.user_id, out = [];
        ['FAST', 'SENSITIVE'].forEach(function (name) {
          var own = all.filter(function (r) { return (r.list === name || r.list === name + '#') && String(r.user_id || '') === me; });
          var rows = own.length ? own.filter(function (r) { return r.list === name; })
                                : all.filter(function (r) { return r.list === name && !r.user_id; });
          rows.forEach(function (r) { out.push([r.list, r.item_id]); });
        });
        return { columns: ['list', 'item_id'], rows: out };
      })(),
      recipes: Repo.raw('Recipes'),
      balances: (function () {
        // last_expiry = the nearest expiry of what is still in stock (not the last receipt's)
        var raw = Repo.raw('Balances'), near = Batches.nearest(batches), c = raw.columns.indexOf('last_expiry'), k = raw.columns.indexOf('item_id');
        raw.rows.forEach(function (r) { if (near[r[k]] !== undefined) r[c] = near[r[k]]; });
        return raw;
      })(),
      batches: (function () {
        var o = {};
        Object.keys(batches).forEach(function (id) { o[id] = batches[id].map(function (x) { return [x.expiry, x.qty]; }); });
        return o;
      })(),
      lpo_pending: Perm.has(session, 'lpo.decide') ? Repo.all('LPOs').filter(function (l) { return l.status === 'submitted'; }).length : 0,
      // the writer's own LPOs that were approved or rejected: the app shows a mark until they are opened
      lpo_decided: Perm.has(session, 'lpo.save') ? Repo.all('LPOs').filter(function (l) {
        return l.created_by === session.user_id && (l.status === 'approved' || l.status === 'rejected');
      }).map(function (l) { return [l.lpo_id, l.status, l.decided_at]; }) : [],
      cash_pending: Perm.has(session, 'cash.decide') ? Repo.all('CashSheets').filter(function (l) { return l.status === 'submitted'; }).length : 0,
      cash_decided: Perm.has(session, 'cash.save') ? Repo.all('CashSheets').filter(function (l) {
        return l.created_by === session.user_id && (l.status === 'approved' || l.status === 'rejected');
      }).map(function (l) { return [l.sheet_id, l.status, l.decided_at]; }) : [],
      lpo_terms: Perm.has(session, 'nav.lpo') ? Settings.get('lpo_terms', LPO_DEFAULT_TERMS) : '',
      lpo_company: Perm.has(session, 'nav.lpo') ? Settings.get('lpo_company', LPO_DEFAULT_COMPANY) : '',
      contacts: Perm.has(session, 'see_prices') ? Repo.raw('Contacts') : { columns: [], rows: [] }
    };
  }
};
