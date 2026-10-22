/**
 * Stores.gs – the stores (Chilled foods, Dry foods, Packaging, Final products, Cleaning materials).
 *
 * Every item and every storage location belongs to one store. A user may receive, issue and
 * fulfil requests only in the stores ticked for them (Users.stores, comma separated); the admin
 * role has every store. Viewing balances and reports is not limited by store.
 * The old Food / Packaging category follows the store (Packaging → Packaging, the others → Food),
 * so the expiry rule and the history keep working unchanged.
 */
var STORES = ['CHILLED', 'DRY', 'PACK', 'FINAL', 'CLEAN'];
var COLD_LOCATION = /freezer|chiller/i;

var Stores = {
  // cleaning materials are not food: no expiry date is required, as for packaging
  categoryOf: function (store) { return store === 'PACK' || store === 'CLEAN' ? 'Packaging' : 'Food'; },

  valid: function (store) { return STORES.indexOf(store) >= 0; },

  /** Store of an item or location row (rows not yet sorted fall back to their category). */
  of: function (row) {
    if (!row) return '';
    if (Stores.valid(row.store)) return row.store;
    return row.category === 'Packaging' ? 'PACK' : 'DRY';
  },

  /** Stores of a user row. */
  ofUser: function (u) {
    if (u.role === 'admin') return STORES.slice();
    return String(u.stores || '').split(',').map(function (s) { return s.trim(); }).filter(Stores.valid);
  },

  /** Cleans a list from the app into the stored text. */
  pack: function (list) {
    return (list || []).filter(function (s, i, a) { return Stores.valid(s) && a.indexOf(s) === i; }).join(',');
  },

  require: function (session, store) {
    Util.require((session.stores || []).indexOf(store) >= 0, 'store_forbidden', store);
  },

  requireItem: function (session, itemId) {
    Stores.require(session, Stores.of(Repo.find('Items', 'item_id', itemId)));
  },

  /**
   * First run (schema 5): proposes a store for every item and location, and gives every
   * existing user all stores so nobody is blocked until the admin sets them.
   *   items: Packaging → PACK; produced in the factory → FINAL; last received into a Freezer/Chiller → CHILLED; else DRY
   *   locations: Packaging → PACK; name with Freezer/Chiller → CHILLED; else DRY
   */
  seed: function () {
    Stores.backup(['Items', 'Locations', 'Users']);
    var lastLoc = {}, lastKey = {}, produced = {};
    Repo.all('Movements').forEach(function (m) {
      if (m.status === 'deleted') return;
      if (m.kind === 'PROD_OUTPUT') produced[m.item_id] = true;
      if (m.kind !== 'RECEIPT') return;
      var k = String(m.date) + '|' + String(m.created_at) + '|' + String(m.movement_id);
      if (!lastKey[m.item_id] || k > lastKey[m.item_id]) { lastKey[m.item_id] = k; lastLoc[m.item_id] = String(m.location || ''); }
    });
    Repo.setColumn('Items', 'store', function (i) {
      if (Stores.valid(i.store)) return i.store;
      if (i.category === 'Packaging') return 'PACK';
      if (produced[i.item_id]) return 'FINAL';
      return COLD_LOCATION.test(lastLoc[i.item_id] || '') ? 'CHILLED' : 'DRY';
    });
    Repo.setColumn('Locations', 'store', function (l) {
      if (Stores.valid(l.store)) return l.store;
      if (l.category === 'Packaging') return 'PACK';
      return COLD_LOCATION.test(String(l.name)) ? 'CHILLED' : 'DRY';
    });
    Repo.setColumn('Users', 'stores', function (u) { return String(u.stores || '') || STORES.join(','); });
    Stores.addDropdowns();
    Version.bump();          // every device reloads items and locations with their store
  },

  /** Copies the sheets the store change writes to, inside the same spreadsheet ("Items backup 2026-10-16"). */
  backup: function (names) {
    var ss = SpreadsheetApp.getActive();
    names.forEach(function (name) {
      var sh = ss.getSheetByName(name);
      var copyName = name + ' backup ' + Util.today();
      if (!sh || typeof sh.copyTo !== 'function' || ss.getSheetByName(copyName)) return;
      sh.copyTo(ss).setName(copyName);
    });
  },

  /** A drop-down of the stores in the store column of Items and Locations (Google Sheets only). */
  addDropdowns: function () {
    if (typeof SpreadsheetApp.newDataValidation !== 'function') return;
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(STORES, true).setAllowInvalid(false).build();
    ['Items', 'Locations'].forEach(function (name) {
      var sh = SpreadsheetApp.getActive().getSheetByName(name);
      var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      var c = head.indexOf('store') + 1;
      if (c > 0) sh.getRange(2, c, sh.getMaxRows() - 1, 1).setDataValidation(rule);
    });
  },

  /**
   * After the owner edits stores directly in the sheet: keeps the category in line with the store,
   * fills any empty store, and tells every device to reload. Returns {items, locations} changed.
   */
  applySheetEdits: function () {
    return withLock(function () {
      Repo.reset();
      var n = { items: 0, locations: 0 };
      ['Items', 'Locations'].forEach(function (name) {
        var key = name === 'Items' ? 'items' : 'locations';
        Repo.setColumn(name, 'store', function (r) { var s = Stores.of(r); if (s !== r.store) n[key]++; return s; });
        Repo.setColumn(name, 'category', function (r) { var c = Stores.categoryOf(Stores.of(r)); if (c !== r.category) n[key]++; return c; });
      });
      Audit.log('sheet-owner', 'stores_sheet_apply', 'Items', '', null, n);
      Version.bump();
      return n;
    });
  }
};
