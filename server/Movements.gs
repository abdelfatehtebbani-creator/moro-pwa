/**
 * Movements.gs – receipts, issues and returns: save (idempotent), update, delete, query.
 *
 * Quantities arrive positive from the app; the sign comes from the kind:
 *   RECEIPT +   SUPPLIER_RETURN −   ISSUE −   DEPT_RETURN +   PROD_CONSUME −   PROD_OUTPUT +   ADJUST ±
 * Rules carried over from MORO v13:
 *   - a receipt needs supplier, date, item, unit, invoice no, price, per, location, and an expiry date for food
 *   - a return to the supplier needs only supplier, date, item, unit and quantity
 *   - an issue needs department, date, item and quantity; lines saved together share one slip number D-MMDD-NNN
 */
var SIGN = { RECEIPT: 1, SUPPLIER_RETURN: -1, ISSUE: -1, DEPT_RETURN: 1, PROD_CONSUME: -1, PROD_OUTPUT: 1, DISPOSAL: -1 };
var SAVE_KINDS = ['RECEIPT', 'SUPPLIER_RETURN', 'ISSUE', 'DEPT_RETURN', 'DISPOSAL'];
var EDITABLE = ['date', 'party_id', 'item_id', 'qty', 'unit', 'price', 'per', 'amount', 'discount', 'discount_kind', 'final_amount',
                'doc_no', 'location', 'expiry', 'purpose', 'image'];

var Movements = {
  /** Validates one movement (fields already normalised) and returns an error code or ''. */
  validate: function (m) {
    Util.require(Util.isDate(m.date), 'date_invalid');
    var item = Repo.find('Items', 'item_id', m.item_id);
    Util.require(item, 'item_unknown', m.item_id);
    Util.require(item.active === true, 'item_inactive', item.name);
    // a disposal (damaged / expired stock thrown away) has no party but needs a reason
    if (m.kind === 'DISPOSAL') { Util.require(m.purpose, 'reason_required'); return item; }
    var party = Repo.find('Parties', 'party_id', m.party_id);
    Util.require(party, 'party_unknown', m.party_id);
    Util.require(typeof m.qty === 'number' && m.qty !== 0, 'qty_invalid');
    Util.require(m.unit, 'unit_required');
    if (m.kind === 'RECEIPT') {
      Util.require(party.kind === 'supplier', 'party_not_supplier');
      Util.require(m.doc_no, 'doc_required');
      Util.require(m.price !== '' && Util.num(m.price) !== null && Util.num(m.price) >= 0, 'price_invalid');
      Util.require(m.per, 'per_required');
      Util.require(m.location, 'location_required');
      if (item.category === 'Food') Util.require(Util.isDate(m.expiry), 'expiry_required');
    }
    if (m.kind === 'SUPPLIER_RETURN') Util.require(party.kind === 'supplier', 'party_not_supplier');
    // issues go to a department, or to a shop (a shop order handed to distribution)
    if (m.kind === 'ISSUE') Util.require(party.kind === 'section' || party.kind === 'shop', 'party_not_section');
    // returns come back from a department, or from a shop (goods handed for a shop order but not sent)
    if (m.kind === 'DEPT_RETURN') Util.require(party.kind === 'section' || party.kind === 'shop', 'party_not_section');
    if (m.expiry) Util.require(Util.isDate(m.expiry), 'expiry_invalid');
    return item;
  },

  normalise: function (src, item) {
    var kind = String(src.kind || '');
    // an adjustment keeps its own sign (a count found more or less than the books)
    var qty = kind === 'ADJUST' ? (Util.num(src.qty) || 0) : Math.abs(Util.num(src.qty) || 0) * (SIGN[kind] || 1);
    var amount = Util.num(src.amount);
    var discount = Util.num(src.discount) || 0;
    // discount_kind '' = percent of the amount, 'value' = an amount taken off
    var dkind = src.discount_kind === 'value' ? 'value' : '';
    Util.require(discount >= 0 && (dkind === 'value' ? (amount === null || discount <= amount) : discount <= 100), 'discount_invalid');
    var m = {
      kind: kind,
      date: String(src.date || ''),
      party_id: String(src.party_id || ''),
      item_id: String(src.item_id || ''),
      qty: Util.round(qty),
      unit: Util.clean(src.unit).toUpperCase() || (item ? item.unit : ''),
      price: Util.num(src.price) === null ? '' : Util.num(src.price),
      per: Util.clean(src.per).toUpperCase(),
      amount: amount === null ? '' : Util.round(amount),
      discount: discount,
      discount_kind: dkind,
      // the net amount is always derived from amount and discount
      final_amount: amount === null ? '' : Movements.net(amount, discount, dkind),
      doc_no: Util.clean(src.doc_no),
      location: Util.clean(src.location),
      expiry: String(src.expiry || ''),
      purpose: Util.clean(src.purpose),
      image: Util.clean(src.image),
      entry_qty: '',
      entry_unit: ''
    };
    if (item && Packs.list(item).length && m.unit !== String(item.unit).toUpperCase()) {
      var f = Packs.factor(item, m.unit);
      Util.require(f, 'unit_not_defined', m.unit);
      m.entry_qty = Math.abs(m.qty);
      m.entry_unit = m.unit;
      m.qty = Util.round(m.qty * f);
      m.unit = String(item.unit).toUpperCase();
    }
    return m;
  },

  /**
   * Final products (FINAL store): the price of a receipt is the admin's fixed price of the product, per
   * stock unit, whatever was sent. `keep` = the price already on a record being edited (same product).
   */
  fixedPrice: function (m, item, keep) {
    if (!item || Stores.of(item) !== 'FINAL' || (m.kind !== 'RECEIPT' && m.kind !== 'SUPPLIER_RETURN')) return;
    var fp = keep !== undefined && keep !== '' && keep !== null ? Number(keep) : Util.num(item.final_price);
    Util.require(fp !== null && fp >= 0 && (keep !== undefined || String(item.final_price) !== ''), 'final_price_missing', item.name);
    m.price = fp;
    m.per = String(item.unit).toUpperCase();
    m.amount = Util.round(Math.abs(m.qty) * fp);
    if (m.discount_kind === 'value') m.discount = Math.min(Number(m.discount) || 0, m.amount);
    m.final_amount = Movements.net(m.amount, m.discount, m.discount_kind);
  },

  /** Net amount: amount less the discount (a percentage, or a value when kind is 'value'). */
  net: function (amount, discount, kind) {
    var d = Number(discount) || 0;
    return Util.round(kind === 'value' ? amount - d : amount - amount * d / 100);
  },

  /** The screen a kind of movement belongs to (for edit and delete rights). */
  screenOf: function (kind) {
    if (kind === 'RECEIPT' || kind === 'SUPPLIER_RETURN') return 'receive';
    if (kind === 'ISSUE' || kind === 'DEPT_RETURN' || kind === 'DISPOSAL') return 'issue';
    if (kind === 'PROD_CONSUME' || kind === 'PROD_OUTPUT') return 'production';
    return 'other';
  },

  nextId: function () {
    if (!Settings.get('seq_movement', '')) {
      var max = 0;
      Repo.column('Movements', 'movement_id').forEach(function (id) {
        var n = Number(String(id).slice(1));
        if (n > max) max = n;
      });
      Settings.set('seq_movement', max);
    }
    return 'M' + Util.pad(Settings.next('seq_movement', 0), 6);
  },

  /** Issue slip number for a date: D-MMDD-NNN, NNN = next free number that day (taken: {key: no} of this save). */
  nextSlip: function (date, taken) {
    var prefix = 'D-' + date.slice(5, 7) + date.slice(8, 10) + '-';
    var max = 0;
    var given = Object.keys(taken || {}).map(function (k) { return taken[k]; });
    Repo.column('Movements', 'doc_no').concat(given).forEach(function (d) {
      d = String(d);
      if (d.indexOf(prefix) === 0) {
        var n = Number(d.slice(prefix.length));
        if (n > max) max = n;
      }
    });
    return prefix + Util.pad(max + 1, 3);
  },

  /**
   * payload.movements: [{client_id, kind, date, party_id, item_id, qty, unit, price, per, amount, discount,
   *                      doc_no, location, expiry, purpose, image}]
   * Returns {saved: [{client_id, movement_id, doc_no, duplicate}], version}
   */
  save: function (session, payload, internalKinds, storeOp) {
    var list = payload.movements || [];
    var kinds = internalKinds || SAVE_KINDS;
    Util.require(list.length > 0 && list.length <= 200, 'nothing_to_save');
    return withLock(function () {
      var known = {};
      Repo.all('Movements').forEach(function (r) { if (r.client_id) known[r.client_id] = r; });
      var rows = [], out = [], deltas = {}, expiries = {}, slip = {};
      list.forEach(function (src) {
        if (src.client_id && known[src.client_id]) {
          var k = known[src.client_id];
          out.push({ client_id: src.client_id, movement_id: k.movement_id, doc_no: k.doc_no, duplicate: true });
          return;
        }
        Util.require(kinds.indexOf(src.kind) >= 0, 'kind_invalid', src.kind);
        Perm.canKind(session, src.kind);
        var item = Repo.find('Items', 'item_id', src.item_id);
        var m = Movements.normalise(src, item);
        Movements.fixedPrice(m, item);
        item = Movements.validate(m);
        // receiving, issuing and returns only in the user's stores (production is not limited for now)
        // (storeOp: the screen that saves for the user – department requests, shop orders – instead of the kind's)
        if (SAVE_KINDS.indexOf(m.kind) >= 0) Stores.require(session, Stores.of(item), storeOp || Stores.opOfKind(m.kind));
        if (m.kind === 'ISSUE' && !m.doc_no) {
          // one slip per save and date: what one person hands over together is one slip, whatever the stores
          var sk = m.date;
          slip[sk] = slip[sk] || Movements.nextSlip(m.date, slip);
          m.doc_no = slip[sk];
        }
        Util.require(m.kind !== 'ISSUE' || m.doc_no, 'doc_required');
        m.movement_id = Movements.nextId();
        m.category = item.category;
        m.expiry_text = '';
        m.created_by = session.user_id;
        m.created_at = Util.nowIso();
        m.legacy_ref = '';
        m.status = 'active';
        m.client_id = src.client_id || '';
        rows.push(m);
        if (src.client_id) known[src.client_id] = m;
        deltas[m.item_id] = (deltas[m.item_id] || 0) + m.qty;
        if (m.kind === 'RECEIPT' && m.expiry) expiries[m.item_id] = m.expiry;
        out.push({ client_id: m.client_id, movement_id: m.movement_id, doc_no: m.doc_no, duplicate: false });
      });
      Repo.append('Movements', rows);
      Balances.apply(deltas, expiries);
      // stock that came in goes first to shop orders still waiting for it
      var inc = Object.keys(deltas).filter(function (id) { return deltas[id] > 0; });
      if (inc.length) Shop.rebalance(inc);
      var v = rows.length ? Version.bump() : Version.get();
      return { saved: out, version: v };
    });
  },

  /** Throws not_found, or already_deleted with "<who>|<when ISO>" when someone deleted the row. */
  requireActive: function (cur) {
    Util.require(cur, 'not_found');
    if (cur.status === 'deleted') {
      var by = Repo.find('Users', 'user_id', cur.updated_by);
      throw new AppError('already_deleted', (by ? by.display_name : cur.updated_by || '') + '|' + (cur.updated_at || ''));
    }
    Util.require(cur.status === 'active', 'not_found');
  },

  /** payload: {movement_id, changes: {...EDITABLE}} */
  update: function (session, payload) {
    return withLock(function () {
      var cur = Repo.find('Movements', 'movement_id', payload.movement_id);
      Movements.requireActive(cur);
      // a count's adjustment is part of an approved count: it is not edited by hand
      Util.require(cur.kind !== 'ADJUST' || String(cur.doc_no).charAt(0) !== 'C', 'count_adjustment');
      // per screen: own entries with edit_own.<screen>, anyone's with edit_all.<screen>
      var grp = Movements.screenOf(cur.kind);
      Util.require(Perm.has(session, 'edit_all.' + grp) || (cur.created_by === session.user_id && Perm.has(session, 'edit_own.' + grp)),
        'forbidden', cur.created_by === session.user_id ? grp : 'own_only');
      if (SAVE_KINDS.indexOf(cur.kind) >= 0) {
        Stores.requireItem(session, cur.item_id, Stores.opOfKind(cur.kind));
        if (payload.changes && payload.changes.item_id) Stores.requireItem(session, payload.changes.item_id, Stores.opOfKind(cur.kind));
      }
      var src = {};
      EDITABLE.forEach(function (f) { src[f] = cur[f]; });
      src.qty = Math.abs(Number(cur.qty));
      var ch = payload.changes || {};
      Object.keys(ch).forEach(function (f) { Util.require(EDITABLE.indexOf(f) >= 0, 'field_not_editable', f); src[f] = ch[f]; });
      src.kind = cur.kind;
      var item = Repo.find('Items', 'item_id', src.item_id);
      var m = Movements.normalise(src, item);
      // an edited final-product receipt keeps its own price (the product's price may have changed since)
      Movements.fixedPrice(m, item, src.item_id === cur.item_id && cur.price !== '' ? cur.price : undefined);
      var newItem = Movements.validate(m);
      var changes = {};
      EDITABLE.forEach(function (f) { changes[f] = m[f]; });
      // a change of date or price alone keeps what was typed; a new quantity or unit replaces it
      var retyped = 'qty' in ch || 'unit' in ch;
      changes.entry_qty = retyped ? m.entry_qty : (cur.entry_qty === undefined ? '' : cur.entry_qty);
      changes.entry_unit = retyped ? m.entry_unit : (cur.entry_unit || '');
      changes.category = newItem.category;
      changes.updated_by = session.user_id;
      changes.updated_at = Util.nowIso();
      var res = Repo.update('Movements', 'movement_id', cur.movement_id, changes);
      var deltas = {};
      deltas[cur.item_id] = (deltas[cur.item_id] || 0) - Number(cur.qty);
      deltas[m.item_id] = (deltas[m.item_id] || 0) + m.qty;
      Balances.apply(deltas, m.kind === 'RECEIPT' && m.expiry ? (function () { var e = {}; e[m.item_id] = m.expiry; return e; })() : null);
      Audit.log(session.user_id, 'movement_update', 'Movements', cur.movement_id, res.before, res.after);
      return { movement: res.after, version: Version.bump() };
    });
  },

  remove: function (session, payload) {
    return withLock(function () {
      var cur = Repo.find('Movements', 'movement_id', payload.movement_id);
      // already deleted (on another device, or this delete sent twice): the wanted result is there
      if (cur && cur.status === 'deleted') return { movement_id: cur.movement_id, already_deleted: true, version: Version.get() };
      Movements.requireActive(cur);
      Util.require(cur.kind !== 'ADJUST' || String(cur.doc_no).charAt(0) !== 'C', 'count_adjustment');
      // per screen: delete.<screen>; someone else's entry also needs edit_all.<screen>
      var screen = Movements.screenOf(cur.kind);
      Util.require(Perm.has(session, 'delete.' + screen), 'forbidden', screen);
      if (cur.created_by !== session.user_id) Util.require(Perm.has(session, 'edit_all.' + screen), 'forbidden', 'own_only');
      if (SAVE_KINDS.indexOf(cur.kind) >= 0) Stores.requireItem(session, cur.item_id, Stores.opOfKind(cur.kind));
      var res = Repo.update('Movements', 'movement_id', cur.movement_id,
        { status: 'deleted', updated_by: session.user_id, updated_at: Util.nowIso() });
      var d = {};
      d[cur.item_id] = -Number(cur.qty);
      Balances.apply(d, null);
      Audit.log(session.user_id, 'movement_delete', 'Movements', cur.movement_id, res.before, null);
      return { movement_id: cur.movement_id, version: Version.bump() };
    });
  },

  /**
   * Filters: from, to, kinds[], item_id, party_id, doc_no, created_by, since_id, include_deleted,
   * include_archive, limit. Returns {columns, rows} newest first.
   */
  query: function (session, p) {
    p = p || {};
    var res = Repo.raw('Movements');
    var rows = res.rows;
    if (p.include_archive) rows = Repo.raw('Archive').rows.concat(rows);
    var c = {};
    res.columns.forEach(function (h, i) { c[h] = i; });
    var kinds = p.kinds && p.kinds.length ? p.kinds : null;
    var out = rows.filter(function (r) {
      if (!p.include_deleted && r[c.status] === 'deleted') return false;
      if (p.from && String(r[c.date]) < p.from) return false;
      if (p.to && String(r[c.date]) > p.to) return false;
      if (kinds && kinds.indexOf(r[c.kind]) < 0) return false;
      if (p.item_id && r[c.item_id] !== p.item_id) return false;
      if (p.party_id && r[c.party_id] !== p.party_id) return false;
      if (p.doc_no && String(r[c.doc_no]) !== String(p.doc_no)) return false;
      if (p.created_by && r[c.created_by] !== p.created_by) return false;
      if (p.since_id && String(r[c.movement_id]) <= String(p.since_id)) return false;
      return true;
    });
    // production users see quantities, not prices
    if (!Perm.has(session, 'see_prices')) {
      ['price', 'per', 'amount', 'discount', 'discount_kind', 'final_amount'].forEach(function (f) {
        out = out.map(function (r) { r = r.slice(); r[c[f]] = ''; return r; });
      });
    }
    out.sort(function (a, b) {
      var d = String(b[c.date]).localeCompare(String(a[c.date]));
      return d || String(b[c.movement_id]).localeCompare(String(a[c.movement_id]));
    });
    var limit = Math.min(Number(p.limit) || 20000, 50000);
    return { columns: res.columns, rows: out.slice(0, limit), total: out.length, version: Version.get() };
  }
};
