/**
 * BatchRec.gs – the production batch and traceability record (the food safety officer's report).
 *
 * Every production gets a batch number when it is recorded (B-YYYY-MMDD-NN). Its record is worked out from the
 * data, nothing is typed twice: the product, the quantity, the date and who made it; the materials that went into
 * it – from the product's recipe (a cost-only recipe will do: nothing is taken from the stores), or, with no recipe
 * yet, what the store issued to the product's department that day – and for each material the receipts it came
 * from (the oldest stock on hand that day first): the supplier, the supplier's lot (or the invoice), the date
 * received and the expiry. The officer adds the shift, the times, the checks and the notes, and prints it.
 */
var BATCH_CHECKS = ['raw_state', 'fefo', 'process_log', 'final_qty', 'labelling', 'storage'];
var TRACE_STEPS = ['product_batch', 'batch_record', 'record_materials', 'materials_supplier', 'batch_packaging'];

var BatchRec = {
  /** The batch of a production output movement (inside the lock): made once, numbered by the day. */
  ensure: function (m, session) {
    var cur = Repo.find('BatchRecords', 'movement_id', m.movement_id);
    if (cur) return cur;
    var day = String(m.date);
    var n = Repo.all('BatchRecords').filter(function (r) { return r.date === day; }).length + 1;
    var it = Repo.find('Items', 'item_id', m.item_id) || {};
    var row = { batch_no: 'B-' + day.slice(0, 4) + '-' + day.slice(5, 7) + day.slice(8, 10) + '-' + Util.pad(n, 2), movement_id: m.movement_id,
      date: day, item_id: m.item_id, qty: Number(m.qty) || 0, unit: m.unit, dept: it.dept || '', created_by: m.created_by || (session ? session.user_id : ''),
      created_at: Util.nowIso(), shift: '', start_time: '', end_time: '', checks: '', notes: '', status: '', prepared_by: '', prepared_at: '', updated_at: '' };
    Repo.append('BatchRecords', [row]);
    return row;
  },

  /** After a production is saved: its batch number. */
  afterProduction: function (session, saved) {
    var out = (saved.saved || []).filter(function (s) { return s && s.movement_id; }).map(function (s) { return Repo.find('Movements', 'movement_id', s.movement_id); })
      .filter(function (m) { return m && m.kind === 'PROD_OUTPUT'; })[0];
    if (!out) return '';
    return withLock(function () { return BatchRec.ensure(out, session).batch_no; });
  },

  /** p: {from, to}. The productions of the period, with their batch (made now for those recorded before batches existed). */
  list: function (session, p) {
    p = p || {};
    var from = Util.isDate(p.from) ? p.from : Util.today(), to = Util.isDate(p.to) ? p.to : Util.today();
    var outs = Repo.all('Movements').filter(function (m) { return m.kind === 'PROD_OUTPUT' && m.status !== 'deleted' && m.date >= from && m.date <= to; });
    var rows = withLock(function () { return outs.map(function (m) { return BatchRec.ensure(m, session); }); });
    var users = {};
    Repo.all('Users').forEach(function (u) { users[u.user_id] = u.display_name; });
    return rows.map(function (r) {
      return { batch_no: r.batch_no, date: r.date, item_id: r.item_id, qty: Number(r.qty), unit: r.unit, dept: r.dept, made_by: users[r.created_by] || r.created_by,
        status: r.status || '' };
    }).sort(function (a, b) { return a.date === b.date ? (a.batch_no < b.batch_no ? 1 : -1) : (a.date < b.date ? 1 : -1); });
  },

  /** The receipts a quantity used on a day came from: the stock on hand that day, the oldest of it first. */
  lots: function (itemId, day, need, moves) {
    var mine = moves.filter(function (m) { return m.item_id === itemId && m.status !== 'deleted' && String(m.date) <= day; });
    var balance = mine.reduce(function (a, m) { return a + (Number(m.qty) || 0); }, 0);
    // the newest inflows cover what is on hand; the oldest of those go first
    var ins = mine.filter(function (m) { return Number(m.qty) > 0 && INFLOW_KINDS.indexOf(m.kind) >= 0 && m.kind !== 'DEPT_RETURN' && m.kind !== 'ADJUST'; })
      .sort(function (a, b) { return String(a.date) === String(b.date) ? (String(a.movement_id) < String(b.movement_id) ? 1 : -1) : (String(a.date) < String(b.date) ? 1 : -1); });
    var cover = [], left = Math.max(balance, need);
    for (var i = 0; i < ins.length && left > 0; i++) { var q = Math.min(left, Number(ins[i].qty)); cover.push({ m: ins[i], qty: q }); left -= q; }
    cover.reverse();
    var out = [], want = need;
    for (var j = 0; j < cover.length && want > 0; j++) {
      var take = Math.min(want, cover[j].qty);
      var r = cover[j].m;
      out.push({ movement_id: r.movement_id, qty: Util.round(take), party_id: r.party_id, lot: r.supplier_lot || r.doc_no || '', received: String(r.date), expiry: String(r.expiry || ''), kind: r.kind });
      want = Util.round(want - take);
    }
    return out;
  },

  /** p: {batch_no}. The whole record, worked out from the data, with what the officer added. */
  get: function (session, p) {
    var r = Repo.find('BatchRecords', 'batch_no', p.batch_no);
    Util.require(r, 'not_found');
    var item = Repo.find('Items', 'item_id', r.item_id) || {};
    var qty = Number(r.qty) || 0;
    var moves = Repo.all('Movements');
    // the materials: the recipe (any recipe), else the store's issues to the department that day
    var recipe = Repo.all('Recipes').filter(function (x) { return Util.key(x.product) === Util.key(item.name); });
    var source = recipe.length ? 'recipe' : 'issues';
    var need = {};
    if (recipe.length) recipe.forEach(function (x) { need[x.item_id] = Util.round((need[x.item_id] || 0) + (Number(x.qty_per_unit) || 0) * qty); });
    else if (r.dept) moves.forEach(function (m) {
      if (m.kind === 'ISSUE' && m.status !== 'deleted' && m.party_id === r.dept && String(m.date) === r.date) need[m.item_id] = Util.round((need[m.item_id] || 0) + Math.abs(Number(m.qty) || 0));
    });
    var parties = {};
    Repo.all('Parties').forEach(function (x) { parties[x.party_id] = x.name; });
    var lines = Object.keys(need).map(function (id) {
      var it = Repo.find('Items', 'item_id', id) || {};
      var lots = BatchRec.lots(id, r.date, need[id], moves).map(function (l) { l.supplier = parties[l.party_id] || ''; return l; });
      return { item_id: id, name: it.name || id, name_ar: it.name_ar || '', unit: it.unit || '', store: Stores.of(it), qty: need[id], lots: lots };
    });
    var checks = {};
    try { checks = JSON.parse(r.checks || '{}'); } catch (e) { checks = {}; }
    var users = {};
    Repo.all('Users').forEach(function (u) { users[u.user_id] = u.display_name; });
    var traced = lines.length > 0 && lines.every(function (l) { return l.lots.length; });
    return { batch_no: r.batch_no, date: r.date, item_id: r.item_id, product: item.name || r.item_id, product_ar: item.name_ar || '', qty: qty, unit: r.unit,
      dept: parties[r.dept] || '', made_by: users[r.created_by] || r.created_by, source: source,
      raw: lines.filter(function (l) { return l.store !== 'PACK'; }), packaging: lines.filter(function (l) { return l.store === 'PACK'; }),
      shift: r.shift || '', start_time: r.start_time || '', end_time: r.end_time || '', checks: checks, notes: r.notes || '', status: r.status || '',
      prepared_by: users[r.prepared_by] || '', prepared_at: r.prepared_at || '', traced: traced, version: Version.get() };
  },

  /** The officer's part. p: {batch_no, shift, start_time, end_time, checks: {key: {ok, note}}, notes}. */
  save: function (session, p) {
    var time = function (v) { v = Util.clean(v); Util.require(!v || /^\d{2}:\d{2}$/.test(v), 'time_invalid'); return v; };
    var checks = {};
    Object.keys(p.checks || {}).forEach(function (k) {
      var c = p.checks[k] || {};
      if (BATCH_CHECKS.indexOf(k) < 0 && TRACE_STEPS.indexOf(k) < 0 && !/^m_I\d+$/.test(k)) return;
      checks[k] = { ok: c.ok === true, note: Util.clean(c.note).slice(0, 200) };
    });
    var shift = ['morning', 'evening', 'night', ''].indexOf(p.shift) >= 0 ? p.shift : '';
    return withLock(function () {
      var r = Repo.find('BatchRecords', 'batch_no', p.batch_no);
      Util.require(r, 'not_found');
      var now = Util.nowIso();
      var res = Repo.update('BatchRecords', 'batch_no', r.batch_no, { shift: shift, start_time: time(p.start_time), end_time: time(p.end_time),
        checks: JSON.stringify(checks), notes: Util.clean(p.notes).slice(0, 1000), status: 'prepared', prepared_by: session.user_id, prepared_at: now, updated_at: now });
      Audit.log(session.user_id, 'batch_record', 'BatchRecords', r.batch_no, null, { shift: shift, checks: Object.keys(checks).length });
      return { batch_no: r.batch_no, version: Version.bump() };
    });
  }
};
