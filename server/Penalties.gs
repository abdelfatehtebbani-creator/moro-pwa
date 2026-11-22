/**
 * Penalties.gs – financial penalties on an employee for not keeping the company's internal rules.
 *
 *   HR records a penalty directly (issued), or a department head, the food safety officer or the production
 *   manager proposes one (hr.penalty_propose) and HR issues or dismisses it. The employee is told, sees it in
 *   "My penalties", and may acknowledge it or object within 24 hours of its issue; HR then keeps it or cancels it.
 *   No amounts list yet (the amount is written each time). The deduction is made in MyFiles with the salary
 *   (to be set later). Nothing is deleted: a penalty is dismissed or cancelled with a reason.
 *
 *   status: proposed → issued (or dismissed) → objected → kept / cancelled; an issued penalty not objected in
 *   24 hours stands. HR may cancel an issued or kept penalty with a reason.
 */
var PEN_OBJECT_HOURS = 24;
// the kinds of penalty HR picks from (HR can change the list), each "Arabic | English" (the app shows the user's language);
// a starting list until HR sets theirs
var PEN_CATEGORIES = ['النظافة الشخصية وغطاء الشعر | Personal hygiene and hair net', 'سلامة الغذاء | Food safety', 'التأخير والغياب | Lateness and absence', 'استعمال الهاتف أثناء العمل | Phone at work', 'السلوك والتعامل | Behaviour', 'إهمال المعدات والأدوات | Neglect of equipment and tools', 'أخرى | Other'];

var Penalties = {
  categories: function () {
    try { var l = JSON.parse(Settings.get('pen_categories', '') || 'null'); if (l && l.length) return l; } catch (e) { /* the starting list */ }
    return PEN_CATEGORIES.slice();
  },

  /** HR: the list of kinds. p: {list: [text]} */
  setCategories: function (session, p) {
    Hr.requireLive();
    // "Arabic | English" (one name alone serves both languages)
    var list = (p.list || []).map(function (x) { return Util.clean(x).split('|').map(function (y) { return Util.clean(y); }).filter(String).slice(0, 2).join(' | ').slice(0, 160); }).filter(String)
      .filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 40);
    Util.require(list.length, 'pen_categories_empty');
    return withLock(function () {
      var before = Settings.get('pen_categories', '');
      Settings.set('pen_categories', JSON.stringify(list));
      Audit.log(session.user_id, 'pen_categories', 'Settings', 'pen_categories', before, list.join(' | '));
      return { list: list, version: Version.bump() };
    });
  },

  /** The employee opened "My penalties": the issued ones are seen (no button; the red banner goes). */
  seenAll: function (session) {
    if (!Hr.live()) return { seen: 0 };
    return withLock(function () {
      var now = Util.nowIso(), n = 0;
      Repo.all('HrPenalties').forEach(function (r) {
        if (r.user_id === session.user_id && r.status === 'issued' && !r.ack_at) { Repo.update('HrPenalties', 'penalty_id', r.penalty_id, { ack_at: now }); n++; }
      });
      return { seen: n, version: n ? Version.bump() : Version.get() };
    });
  },

  hours: function (iso) { return iso ? (Date.now() - new Date(String(iso).length === 19 ? iso + '+03:00' : iso).getTime()) / 36e5 : 1e9; },
  /** Still open to an objection (issued less than 24 hours ago, not acknowledged). */
  canObject: function (r) { return r.status === 'issued' && Penalties.hours(r.issued_at) < PEN_OBJECT_HOURS; },

  view: function (r, names, forHr) {
    var out = {};
    Object.keys(r).forEach(function (k) { out[k] = r[k]; });
    out.amount = Number(r.amount) || 0;
    out.photos = String(r.photos || '').split(',').filter(String);
    out.category = r.category || '';
    out.can_object = Penalties.canObject(r);
    out.object_until = r.issued_at ? new Date(new Date(String(r.issued_at).length === 19 ? r.issued_at + '+03:00' : r.issued_at).getTime() + PEN_OBJECT_HOURS * 36e5).toISOString() : '';
    if (names) {
      out.user_name = names[r.user_id] || r.user_id;
      out.proposed_name = names[r.proposed_by] || '';
      out.issued_name = names[r.issued_by] || '';
      out.decided_name = names[r.decided_by] || '';
      var d = Repo.find('Parties', 'party_id', r.dept_id);
      out.dept_name = d ? d.name : '';
    }
    // who proposed it is shown to HR only
    if (!forHr) { delete out.proposed_by; delete out.proposed_name; }
    delete out.emp_qid; delete out.client_id;
    return out;
  },

  /** The employees a user may record or propose a penalty for: HR, food safety and production – everyone; a head – their departments. */
  people: function (session) {
    var all = Perm.has(session, 'hr.decide') || session.role === 'food_safety' || session.role === 'production' || session.role === 'admin';
    var mine = session.depts || [];
    var names = {};
    Repo.all('Parties').forEach(function (p) { names[p.party_id] = p.name; });
    return Repo.all('Users').filter(function (u) {
      if (u.active !== true || u.developer === true || u.user_id === session.user_id) return false;
      return all || Auth.deptsOf(u).some(function (d) { return mine.indexOf(d) >= 0; });
    }).map(function (u) { var d = Auth.deptsOf(u)[0] || ''; return { user_id: u.user_id, name: u.display_name, dept: names[d] || '' }; })
      .sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  },

  /** HR records (issued at once) or a proposer proposes. p: {user_id, date, reason, amount, client_id} */
  add: function (session, p) {
    Hr.requireLive();
    var hr = Perm.has(session, 'hr.decide');
    Util.require(hr || Perm.has(session, 'hr.penalty_propose'), 'forbidden');
    var target = Repo.find('Users', 'user_id', String(p.user_id || ''));
    Util.require(target && Penalties.people(session).some(function (x) { return x.user_id === target.user_id; }), 'pen_employee');
    Util.require(Util.isDate(p.date || '') && p.date <= Util.today(), 'date_invalid');
    var reason = Util.clean(p.reason).slice(0, 500);
    Util.require(reason, 'pen_reason_required');
    var amount = Util.num(p.amount);
    Util.require(amount !== null && amount > 0 && amount <= 1e5, 'amount_invalid');
    // its kind: HR picks it when recording; a proposer may pick it (HR picks it when issuing otherwise)
    var category = Util.clean(p.category);
    if (category) Util.require(Penalties.categories().indexOf(category) >= 0, 'pen_category');
    if (hr) Util.require(category, 'pen_category');
    return withLock(function () {
      var cid = Util.clean(p.client_id);
      if (cid) { var dup = Repo.find('HrPenalties', 'client_id', cid); if (dup) return { penalty: Penalties.view(dup, Penalties.names(), hr), duplicate: true }; }
      var w = Repo.all('Workers').filter(function (x) { return x.user_id === target.user_id; })[0];
      var now = Util.nowIso();
      var row = { penalty_id: 'PN' + Util.pad(Settings.next('seq_penalty', 0), 5), user_id: target.user_id, emp_qid: w ? String(w.qid || '') : '',
        dept_id: Auth.deptsOf(target)[0] || '', date: p.date, reason: reason, amount: Util.round(amount),
        status: hr ? 'issued' : 'proposed', proposed_by: session.user_id, proposed_at: now, issued_by: hr ? session.user_id : '', issued_at: hr ? now : '',
        ack_at: '', objection: '', objected_at: '', decided_by: '', decided_at: '', decision_note: '', client_id: cid, category: category, photos: '' };
      // a photo of it, when there is one
      if (p.photo) row.photos = Photos.add(session, row.penalty_id, [p.photo]).join(',');
      Repo.append('HrPenalties', [row]);
      Audit.log(session.user_id, hr ? 'penalty_issue' : 'penalty_propose', 'HrPenalties', row.penalty_id, null, { user: target.user_id });
      if (hr) Penalties.tellIssued(row, session.user_id);
      else {
        var to = Push.usersWith('hr.decide').filter(function (u) { return u !== session.user_id; });
        if (to.length) Push.toUsers(to, { ar: { title: 'اقتراح مخالفة', body: target.display_name + ' – ' + row.amount + ' ر.ق' },
          en: { title: 'Penalty proposed', body: target.display_name + ' – QR ' + row.amount }, page: 'hr', badge: 1 });
      }
      return { penalty: Penalties.view(row, Penalties.names(), hr), version: Version.bump() };
    });
  },

  /** The employee and the head of their department are told of an issued penalty. */
  tellIssued: function (row, by) {
    Push.toUsers([row.user_id], { ar: { title: 'مخالفة مالية ' + row.amount + ' ر.ق', body: row.reason + ' – يمكنك الاعتراض خلال 24 ساعة' },
      en: { title: 'Financial penalty QR ' + row.amount, body: row.reason + ' – you may object within 24 hours' }, page: 'hr', badge: 1 });
    var who = (Repo.find('Users', 'user_id', row.user_id) || {}).display_name || '';
    var heads = Hr.headsOf(row.dept_id).filter(function (u) { return u !== row.user_id && u !== by; });
    if (heads.length) Push.toUsers(heads, { ar: { title: 'مخالفة على أحد موظفي قسمك', body: who + ' – ' + row.amount + ' ر.ق' },
      en: { title: 'A penalty in your department', body: who + ' – QR ' + row.amount }, page: 'hr' });
  },

  names: function () { return Hr.names(); },

  /** The employee's own penalties (issued and after; not the proposals nor the dismissed ones). */
  mine: function (session) {
    var names = Penalties.names();
    return Repo.all('HrPenalties').filter(function (r) { return r.user_id === session.user_id && r.status !== 'proposed' && r.status !== 'dismissed'; })
      .slice(-100).reverse().map(function (r) { return Penalties.view(r, names, false); });
  },

  /** HR: every penalty; a proposer: what they proposed and their departments' penalties. */
  list: function (session) {
    var hr = Perm.has(session, 'hr.decide');
    Util.require(hr || Perm.has(session, 'hr.penalty_propose') || Perm.has(session, 'hr.seen'), 'forbidden');
    var depts = session.depts || [];
    var names = Penalties.names();
    return Repo.all('HrPenalties').filter(function (r) {
      return hr || r.proposed_by === session.user_id || (depts.indexOf(r.dept_id) >= 0 && r.status !== 'proposed' && r.status !== 'dismissed');
    }).slice(-300).reverse().map(function (r) { return Penalties.view(r, names, hr); });
  },

  /** HR on a proposal: issue it or dismiss it. p: {penalty_id, issue: true|false, note, amount} */
  review: function (session, p) {
    Hr.requireLive();
    return withLock(function () {
      var r = Repo.find('HrPenalties', 'penalty_id', String(p.penalty_id || ''));
      Util.require(r, 'not_found');
      Util.require(r.status === 'proposed', 'pen_state');
      var note = Util.clean(p.note).slice(0, 500);
      var ch;
      if (p.issue === true) {
        ch = { status: 'issued', issued_by: session.user_id, issued_at: Util.nowIso() };
        // HR may correct the amount proposed
        var amt = Util.num(p.amount);
        if (amt !== null) { Util.require(amt > 0 && amt <= 1e5, 'amount_invalid'); ch.amount = Util.round(amt); }
        var cat = Util.clean(p.category) || r.category;
        Util.require(cat && Penalties.categories().indexOf(cat) >= 0, 'pen_category');
        ch.category = cat;
      } else {
        Util.require(note, 'hr_note_required');
        ch = { status: 'dismissed', decided_by: session.user_id, decided_at: Util.nowIso(), decision_note: note };
      }
      Repo.update('HrPenalties', 'penalty_id', r.penalty_id, ch);
      Audit.log(session.user_id, 'penalty_' + ch.status, 'HrPenalties', r.penalty_id, { status: 'proposed', amount: r.amount }, ch);
      var row = Repo.find('HrPenalties', 'penalty_id', r.penalty_id);
      if (ch.status === 'issued') Penalties.tellIssued(row, session.user_id);
      return { penalty: Penalties.view(row, Penalties.names(), true), version: Version.bump() };
    });
  },

  /** The employee: "seen" (accepts), or an objection with its reason – within 24 hours of the issue. p: {penalty_id, object, text} */
  respond: function (session, p) {
    Hr.requireLive();
    return withLock(function () {
      var r = Repo.find('HrPenalties', 'penalty_id', String(p.penalty_id || ''));
      Util.require(r && r.user_id === session.user_id, 'not_found');
      if (p.object === true) {
        Util.require(Penalties.canObject(r), 'pen_object_late');
        var text = Util.clean(p.text).slice(0, 500);
        Util.require(text, 'pen_objection_required');
        Repo.update('HrPenalties', 'penalty_id', r.penalty_id, { status: 'objected', objection: text, objected_at: Util.nowIso() });
        Audit.log(session.user_id, 'penalty_object', 'HrPenalties', r.penalty_id, { status: 'issued' }, { status: 'objected' });
        var who = (Repo.find('Users', 'user_id', r.user_id) || {}).display_name || '';
        var to = Push.usersWith('hr.decide');
        if (to.length) Push.toUsers(to, { ar: { title: 'اعتراض على مخالفة', body: who + ' – ' + text }, en: { title: 'Penalty objection', body: who + ' – ' + text }, page: 'hr', badge: 1 });
      } else {
        Util.require(r.status === 'issued', 'pen_state');
        if (!r.ack_at) Repo.update('HrPenalties', 'penalty_id', r.penalty_id, { ack_at: Util.nowIso() });
      }
      return { penalty: Penalties.view(Repo.find('HrPenalties', 'penalty_id', r.penalty_id), Penalties.names(), false), version: Version.bump() };
    });
  },

  /** HR on an objection (keep or cancel), or cancels a penalty that stands. p: {penalty_id, keep: true|false, note} */
  decide: function (session, p) {
    Hr.requireLive();
    return withLock(function () {
      var r = Repo.find('HrPenalties', 'penalty_id', String(p.penalty_id || ''));
      Util.require(r, 'not_found');
      Util.require(['issued', 'objected', 'kept'].indexOf(r.status) >= 0, 'pen_state');
      var note = Util.clean(p.note).slice(0, 500);
      var keep = p.keep === true;
      Util.require(keep ? r.status === 'objected' : true, 'pen_state');
      Util.require(note, 'hr_note_required');
      var ch = { status: keep ? 'kept' : 'cancelled', decided_by: session.user_id, decided_at: Util.nowIso(), decision_note: note };
      Repo.update('HrPenalties', 'penalty_id', r.penalty_id, ch);
      Audit.log(session.user_id, 'penalty_' + ch.status, 'HrPenalties', r.penalty_id, { status: r.status }, ch);
      Push.toUsers([r.user_id], { ar: { title: keep ? 'رُفض اعتراضك وتبقى المخالفة' : 'أُلغيت المخالفة', body: note }, en: { title: keep ? 'Your objection was refused' : 'The penalty was cancelled', body: note }, page: 'hr', badge: 1 });
      return { penalty: Penalties.view(Repo.find('HrPenalties', 'penalty_id', r.penalty_id), Penalties.names(), true), version: Version.bump() };
    });
  },

  /** For the menu number: HR – proposals and objections to answer; the employee – penalties not seen yet. */
  todo: function (session) {
    var hr = Perm.has(session, 'hr.decide');
    return Repo.all('HrPenalties').filter(function (r) {
      if (hr && (r.status === 'proposed' || r.status === 'objected')) return true;
      return r.user_id === session.user_id && r.status === 'issued' && !r.ack_at;
    }).length;
  }
};
