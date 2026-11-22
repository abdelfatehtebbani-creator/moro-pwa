/**
 * Hr.gs – the employees' requests to HR: a leave, or a document / certificate.
 *
 *   Every signed-in user asks for themselves. The head of their department is told and sees the request
 *   (for information only: they press "seen", they decide nothing); HR (hr.decide) approves or refuses
 *   a leave, and prepares or refuses a document. The requester is told of the answer.
 *   The table keeps stable text ids and the worker's ID card number (QID), the key shared with MyFiles,
 *   so the requests move as they are to the shared database later.
 */
var HR_KINDS = ['leave', 'doc'];
var HR_LEAVE_TYPES = ['annual', 'emergency', 'sick', 'unpaid'];
var HR_DOC_TYPES = ['work_cert', 'salary_cert', 'to_whom', 'doc_copy', 'other'];
// the answers: a leave is approved or refused; a document is ready or refused
var HR_ANSWERS = { leave: ['approved', 'rejected'], doc: ['ready', 'rejected'] };

var Hr = {
  /** The heads of a department: users who see their departments' requests (hr.dept_view). */
  headsOf: function (deptId) {
    if (!deptId) return [];
    return Repo.all('Users').filter(function (u) {
      return u.active === true && u.developer !== true && Auth.deptsOf(u).indexOf(deptId) >= 0 && Perm.permsOf(u).indexOf('hr.seen') >= 0;
    }).map(function (u) { return u.user_id; });
  },

  view: function (r, names) {
    var out = {};
    Object.keys(r).forEach(function (k) { out[k] = r[k]; });
    out.days = r.days === '' ? '' : Number(r.days);
    if (names) {
      out.user_name = names[r.user_id] || r.user_id;
      out.decided_name = names[r.decided_by] || '';
      out.seen_name = names[r.head_seen_by] || '';
      var d = Repo.find('Parties', 'party_id', r.dept_id);
      out.dept_name = d ? d.name : '';
    }
    // the ID card number stays on the server (HR sees it in MyFiles)
    delete out.emp_qid;
    delete out.client_id;
    return out;
  },

  names: function () {
    var o = {};
    Repo.all('Users').forEach(function (u) { o[u.user_id] = u.display_name; });
    return o;
  },

  /** The user asks. p: {kind, type, date_from, date_to, reason, addressed_to, client_id} */
  create: function (session, p) {
    var kind = String(p.kind || '');
    Util.require(HR_KINDS.indexOf(kind) >= 0, 'hr_kind');
    var type = String(p.type || '');
    Util.require((kind === 'leave' ? HR_LEAVE_TYPES : HR_DOC_TYPES).indexOf(type) >= 0, 'hr_type');
    var row = { kind: kind, type: type, date_from: '', date_to: '', days: '', reason: Util.clean(p.reason).slice(0, 500), addressed_to: '' };
    if (kind === 'leave') {
      Util.require(Util.isDate(p.date_from || '') && Util.isDate(p.date_to || ''), 'date_invalid');
      Util.require(p.date_to >= p.date_from, 'hr_dates_order');
      row.date_from = p.date_from;
      row.date_to = p.date_to;
      // calendar days, both ends counted (HR checks the balance in MyFiles)
      row.days = Math.round((new Date(p.date_to + 'T00:00:00Z') - new Date(p.date_from + 'T00:00:00Z')) / 864e5) + 1;
      Util.require(row.days <= 366, 'hr_dates_order');
    } else {
      row.addressed_to = Util.clean(p.addressed_to).slice(0, 200);
      if (type === 'other') Util.require(row.reason, 'hr_reason_required');
    }
    return withLock(function () {
      var cid = Util.clean(p.client_id);
      if (cid) { var dup = Repo.find('HrRequests', 'client_id', cid); if (dup) return { request: Hr.view(dup), duplicate: true, version: Version.get() }; }
      var w = Repo.all('Workers').filter(function (x) { return x.user_id === session.user_id; })[0];
      var id = 'HR' + Util.pad(Settings.next('seq_hr', 0), 5);
      row.request_id = id;
      row.user_id = session.user_id;
      row.emp_qid = w ? String(w.qid || '') : '';
      row.dept_id = (session.depts || [])[0] || '';
      row.status = 'pending';
      row.created_at = Util.nowIso();
      row.head_seen_at = ''; row.head_seen_by = ''; row.decided_at = ''; row.decided_by = ''; row.decision_note = '';
      row.client_id = cid;
      Repo.append('HrRequests', [row]);
      Audit.log(session.user_id, 'hr_request', 'HrRequests', id, null, { kind: kind, type: type, days: row.days });
      // HR and the head of the department are told
      var me = Repo.find('Users', 'user_id', session.user_id);
      var who = me ? me.display_name : session.user_id;
      var what = { ar: kind === 'leave' ? 'طلب إجازة ' + row.days + ' يوم' : 'طلب وثيقة', en: kind === 'leave' ? 'Leave request, ' + row.days + ' days' : 'Document request' };
      var to = Push.usersWith('hr.decide').concat(Hr.headsOf(row.dept_id)).filter(function (u, i, a) { return u !== session.user_id && a.indexOf(u) === i; });
      if (to.length) Push.toUsers(to, { ar: { title: what.ar, body: who }, en: { title: what.en, body: who }, page: 'hr', badge: 1 });
      return { request: Hr.view(row), version: Version.bump() };
    });
  },

  /** The user's own requests, newest first. */
  mine: function (session) {
    var names = Hr.names();
    return Repo.all('HrRequests').filter(function (r) { return r.user_id === session.user_id; }).slice(-100).reverse()
      .map(function (r) { return Hr.view(r, names); });
  },

  /** HR: every request; a head: their departments' requests. p: {status} */
  list: function (session, p) {
    p = p || {};
    var all = Perm.has(session, 'hr.decide');
    var depts = session.depts || [];
    Util.require(all || depts.length, 'forbidden');
    var names = Hr.names();
    return Repo.all('HrRequests').filter(function (r) {
      if (!all && depts.indexOf(r.dept_id) < 0) return false;
      if (p.status === 'pending') return r.status === 'pending';
      if (p.status === 'done') return r.status !== 'pending';
      return true;
    }).slice(-300).reverse().map(function (r) { return Hr.view(r, names); });
  },

  /** The head has seen a request of their department (information only). p: {request_id} */
  seen: function (session, p) {
    return withLock(function () {
      var r = Repo.find('HrRequests', 'request_id', String(p.request_id || ''));
      Util.require(r && (session.depts || []).indexOf(r.dept_id) >= 0, 'not_found');
      if (!r.head_seen_at) Repo.update('HrRequests', 'request_id', r.request_id, { head_seen_at: Util.nowIso(), head_seen_by: session.user_id });
      return { request: Hr.view(Repo.find('HrRequests', 'request_id', r.request_id), Hr.names()), version: Version.bump() };
    });
  },

  /** HR answers. p: {request_id, status, note} */
  decide: function (session, p) {
    return withLock(function () {
      var r = Repo.find('HrRequests', 'request_id', String(p.request_id || ''));
      Util.require(r, 'not_found');
      Util.require(r.status === 'pending', 'hr_already_decided');
      var st = String(p.status || '');
      Util.require((HR_ANSWERS[r.kind] || []).indexOf(st) >= 0, 'hr_status');
      var note = Util.clean(p.note).slice(0, 500);
      if (st === 'rejected') Util.require(note, 'hr_note_required');
      var ch = { status: st, decided_at: Util.nowIso(), decided_by: session.user_id, decision_note: note };
      Repo.update('HrRequests', 'request_id', r.request_id, ch);
      Audit.log(session.user_id, 'hr_decide', 'HrRequests', r.request_id, { status: 'pending' }, { status: st });
      var word = { approved: ['تمت الموافقة على طلبك', 'Your request was approved'], rejected: ['رُفض طلبك', 'Your request was refused'],
        ready: ['وثيقتك جاهزة', 'Your document is ready'] }[st];
      Push.toUsers([r.user_id], { ar: { title: word[0], body: note || r.request_id }, en: { title: word[1], body: note || r.request_id }, page: 'hr', badge: 1 });
      return { request: Hr.view(Repo.find('HrRequests', 'request_id', r.request_id), Hr.names()), version: Version.bump() };
    });
  },

  /** The requester withdraws a request not answered yet. p: {request_id} */
  cancel: function (session, p) {
    return withLock(function () {
      var r = Repo.find('HrRequests', 'request_id', String(p.request_id || ''));
      Util.require(r && r.user_id === session.user_id, 'not_found');
      Util.require(r.status === 'pending', 'hr_already_decided');
      Repo.update('HrRequests', 'request_id', r.request_id, { status: 'cancelled', decided_at: Util.nowIso(), decided_by: session.user_id });
      Audit.log(session.user_id, 'hr_cancel', 'HrRequests', r.request_id, { status: 'pending' }, { status: 'cancelled' });
      return { ok: true, version: Version.bump() };
    });
  },

  /** The number on the menu: HR – requests to answer; a head – their departments' requests not seen yet. */
  todo: function (session) {
    var all = Perm.has(session, 'hr.decide'), head = Perm.has(session, 'hr.seen'), depts = session.depts || [];
    if (!all && !(head && depts.length)) return 0;
    return Repo.all('HrRequests').filter(function (r) {
      if (r.status !== 'pending') return false;
      if (all) return true;
      return depts.indexOf(r.dept_id) >= 0 && !r.head_seen_at;
    }).length;
  },

  /** Schema 70: the department heads with their own ticks (not the workers' accounts) see their departments' requests. */
  addHeadLeaf: function () {
    var workers = {};
    Repo.all('Workers').forEach(function (w) { if (w.user_id) workers[w.user_id] = true; });
    Repo.setColumn('Users', 'caps', function (u) {
      var own = String(u.caps || '').trim();
      if (!own || u.role !== 'section_head' || workers[u.user_id]) return own;
      var caps = Perm.capsOf(u);
      return caps.indexOf('hr.dept_view') >= 0 ? own : caps.concat(['hr.dept_view']).join(',');
    });
  }
};
