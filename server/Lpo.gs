/**
 * Lpo.gs – local purchase orders (LPO): the purchasing officer writes them, the admin approves them,
 * then they are printed in the company's LPO layout.
 *
 * Status: draft → submitted → approved | rejected (a rejected or draft LPO can be edited and sent again).
 * The number is proposed (the highest + 1) and may be changed, but must stay unique.
 * The terms printed at the bottom are one text in Settings (lpo_terms), one term per line.
 */
var LPO_DEFAULT_TERMS = [
  'Supply this order in accordance with the price, terms, delivery method and specifications listed above.',
  'Please notify us immediately if you are unable to ship as specified.',
  'For local orders LPO is considered void after 4 days if the goods are not delivered with in this time frame',
  'Bank transfer'
].join('\n');
/** The company block printed at the top right (one line each). */
var LPO_DEFAULT_COMPANY = ['Al Aker', 'New Industrial Area', 'Street Number 13', 'Mobile : 3002 3774'].join('\n');

var Lpo = {
  /** The number proposed for a new LPO: the highest so far + 1 (Settings lpo_start before the first one). */
  nextNo: function () {
    var max = 0;
    Repo.column('LPOs', 'lpo_no').forEach(function (n) { max = Math.max(max, Number(n) || 0); });
    return max ? max + 1 : Number(Settings.get('lpo_start', 320)) || 320;
  },

  list: function (session, p) {
    var all = Repo.all('LPOs');
    // the purchasing officer sees their own; whoever approves sees all
    if (!Perm.has(session, 'lpo.decide')) all = all.filter(function (l) { return l.created_by === session.user_id; });
    if (p && p.status) all = all.filter(function (l) { return l.status === p.status; });
    all.sort(function (a, b) { return (Number(b.lpo_no) || 0) - (Number(a.lpo_no) || 0); });
    return { lpos: all.slice(0, 500), next_no: Lpo.nextNo(), pending: Repo.all('LPOs').filter(function (l) { return l.status === 'submitted'; }).length };
  },

  get: function (session, p) {
    var l = Repo.find('LPOs', 'lpo_id', p.lpo_id);
    Util.require(l, 'not_found');
    Util.require(Perm.has(session, 'lpo.decide') || l.created_by === session.user_id, 'forbidden');
    var lines = Repo.all('LPOLines').filter(function (x) { return x.lpo_id === l.lpo_id; })
      .sort(function (a, b) { return Number(a.line) - Number(b.line); });
    return { lpo: l, lines: lines };
  },

  /**
   * p: {lpo_id?, lpo_no, date, delivery_date, party_id, requisitioner, tender, non_tender_reason, pr_no, note,
   *     lines: [{item_id, description, qty, unit, price}], submit}
   */
  save: function (session, p) {
    return withLock(function () {
      var cur = p.lpo_id ? Repo.find('LPOs', 'lpo_id', p.lpo_id) : null;
      if (p.lpo_id) {
        Util.require(cur, 'not_found');
        Util.require(cur.created_by === session.user_id || Perm.has(session, 'lpo.decide'), 'forbidden');
        Util.require(cur.status === 'draft' || cur.status === 'rejected', 'lpo_locked');
      }
      var party = Repo.find('Parties', 'party_id', p.party_id);
      Util.require(party && party.kind === 'supplier', 'party_not_supplier');
      Util.require(Util.isDate(String(p.date || '')), 'date_invalid');
      var no = Number(p.lpo_no) || Lpo.nextNo();
      Util.require(no > 0, 'lpo_no_invalid');
      var taken = Repo.all('LPOs').some(function (l) { return Number(l.lpo_no) === no && (!cur || l.lpo_id !== cur.lpo_id); });
      Util.require(!taken, 'lpo_no_taken', no);
      var lines = (p.lines || []).map(function (x, i) {
        var qty = Util.num(x.qty), price = Util.num(x.price);
        Util.require(qty !== null && qty > 0, 'qty_invalid', i + 1);
        Util.require(price !== null && price >= 0, 'price_invalid', i + 1);
        var item = x.item_id ? Repo.find('Items', 'item_id', x.item_id) : null;
        var desc = Util.clean(x.description) || (item ? item.name : '');
        Util.require(desc, 'name_required', i + 1);
        return { line: i + 1, item_id: item ? item.item_id : '', description: desc, qty: Util.round(qty),
                 unit: Util.clean(x.unit).toUpperCase() || (item ? item.unit : ''), price: Util.round(price), total: Util.round(qty * price) };
      });
      Util.require(lines.length > 0, 'nothing_to_save');
      var total = Util.round(lines.reduce(function (s, x) { return s + x.total; }, 0));
      var now = Util.nowIso();
      var row = { lpo_no: no, date: String(p.date), delivery_date: Util.isDate(String(p.delivery_date || '')) ? String(p.delivery_date) : '',
        party_id: party.party_id, requisitioner: Util.clean(p.requisitioner), tender: Util.clean(p.tender),
        non_tender_reason: Util.clean(p.non_tender_reason), pr_no: Util.clean(p.pr_no), note: Util.clean(p.note), total: total,
        status: p.submit ? 'submitted' : 'draft', submitted_at: p.submit ? now : '', decided_by: '', decided_at: '', decision_note: '', updated_at: now };
      var id;
      if (cur) {
        id = cur.lpo_id;
        Repo.update('LPOs', 'lpo_id', id, row);
        var keep = Repo.all('LPOLines').filter(function (x) { return x.lpo_id !== id; });
        Repo.replaceAll('LPOLines', keep.concat(lines.map(function (x) { x.lpo_id = id; return x; })));
      } else {
        var n = 0;
        Repo.column('LPOs', 'lpo_id').forEach(function (v) { n = Math.max(n, Number(String(v).slice(1)) || 0); });
        id = 'L' + Util.pad(n + 1, 5);
        row.lpo_id = id; row.created_by = session.user_id; row.created_at = now;
        Repo.append('LPOs', [row]);
        Repo.append('LPOLines', lines.map(function (x) { x.lpo_id = id; return x; }));
      }
      Audit.log(session.user_id, p.submit ? 'lpo_submit' : 'lpo_save', 'LPOs', id, cur, { lpo_no: no, total: total, lines: lines.length });
      if (p.submit) Notify.lpoSubmitted(id, no, party.name, total, session);
      return { lpo_id: id, lpo_no: no, status: row.status, version: Version.bump() };
    });
  },

  /** The admin: approve or reject (with a reason) a submitted LPO. */
  decide: function (session, p) {
    return withLock(function () {
      var l = Repo.find('LPOs', 'lpo_id', p.lpo_id);
      Util.require(l, 'not_found');
      Util.require(l.status === 'submitted', 'lpo_not_submitted');
      var ok = p.approve === true;
      if (!ok) Util.require(Util.clean(p.note), 'reason_required');
      var res = Repo.update('LPOs', 'lpo_id', l.lpo_id, { status: ok ? 'approved' : 'rejected', decided_by: session.user_id,
        decided_at: Util.nowIso(), decision_note: Util.clean(p.note), updated_at: Util.nowIso() });
      Audit.log(session.user_id, ok ? 'lpo_approve' : 'lpo_reject', 'LPOs', l.lpo_id, res.before, res.after);
      Notify.lpoDecided(l, ok, Util.clean(p.note), session);
      return { status: res.after.status, version: Version.bump() };
    });
  },

  /** A draft (or rejected) LPO is removed by its writer. */
  remove: function (session, p) {
    return withLock(function () {
      var l = Repo.find('LPOs', 'lpo_id', p.lpo_id);
      Util.require(l, 'not_found');
      Util.require(l.created_by === session.user_id || Perm.has(session, 'lpo.decide'), 'forbidden');
      Util.require(l.status === 'draft' || l.status === 'rejected', 'lpo_locked');
      Repo.update('LPOs', 'lpo_id', l.lpo_id, { status: 'cancelled', updated_at: Util.nowIso() });
      Audit.log(session.user_id, 'lpo_cancel', 'LPOs', l.lpo_id, l, null);
      return { version: Version.bump() };
    });
  },

  /** The admin: the terms printed under every LPO and the company block (one per line), and the number to start from. */
  settings: function (session, p) {
    return withLock(function () {
      if (p.terms !== undefined) Settings.set('lpo_terms', String(p.terms || '').replace(/\r/g, '').trim());
      if (p.company !== undefined) Settings.set('lpo_company', String(p.company || '').replace(/\r/g, '').trim());
      if (p.start !== undefined) { var s = Number(p.start); Util.require(s > 0, 'lpo_no_invalid'); Settings.set('lpo_start', s); }
      Audit.log(session.user_id, 'lpo_settings', 'Settings', 'lpo', null, { terms: p.terms !== undefined, company: p.company !== undefined, start: p.start });
      return { version: Version.bump() };
    });
  }
};

/**
 * Notify – who is told about an LPO: the badge in the app, and a phone / computer notification (Push.gs).
 * A sent LPO goes to whoever approves; the decision goes back to its writer.
 */
var Notify = {
  lpoSubmitted: function (id, no, supplier, total, session) {
    var pending = Repo.all('LPOs').filter(function (l) { return l.status === 'submitted'; }).length;
    Push.toUsers(Push.usersWith('lpo.decide').filter(function (u) { return u !== session.user_id; }), {
      title: 'LPO ' + no + ' بانتظار اعتمادك', body: supplier + ' · ' + Number(total).toFixed(2) + ' QR · ' + session.display_name,
      page: 'lpo', badge: pending });
  },
  lpoDecided: function (lpo, ok, note, session) {
    if (lpo.created_by === session.user_id) return;
    var party = Repo.find('Parties', 'party_id', lpo.party_id) || {};
    Push.toUsers([lpo.created_by], {
      title: 'LPO ' + lpo.lpo_no + (ok ? ' اعتُمد' : ' رُفض'), body: (party.name || '') + (ok ? ' · يمكنك طباعته الآن' : ' · ' + note),
      page: 'lpo', badge: 1 });
  }
};
