/**
 * Workers.gs – the list of the factory's workers, so that each one opens their own account.
 *
 *   The admin uploads the list (name, ID card number (QID), job). Only a hash of the QID is kept. On the sign-in
 *   screen a worker types their QID: their name shows, they pick their department, a username and a PIN, and the
 *   account is made with the rights of their job (a chef, an assistant). One account per worker.
 */
// the rights given by job: a chef prepares shop orders, records production and asks the store; an assistant asks the store
var WORKER_JOBS = {
  chef: ['shop.view', 'shop.hand', 'shop.unavailable', 'production.view', 'production.post', 'requests.view', 'requests.create'],
  assistant: ['requests.view', 'requests.create']
};

var Workers = {
  hash: function (qid) { return Auth.hashPin(String(qid || '').replace(/\D/g, ''), 'qid'); },

  /** The job of a row: chef or assistant (anything that is not a chef has the assistant's rights). */
  jobOf: function (text) {
    var s = String(text || '').toLowerCase();
    // an assistant chef is an assistant
    if (/assist|helper|مساعد/.test(s)) return 'assistant';
    return /chef|cook|شيف|شف|طاه|طباخ/.test(s) ? 'chef' : 'assistant';
  },

  /** The admin: the list of workers. p: {rows: [{name, qid, job}], apply}. A worker already there is updated (by the QID). */
  importRows: function (session, p) {
    var rows = (p.rows || []).map(function (r) {
      return { name: Util.clean(r.name), qid: String(r.qid || '').replace(/\D/g, ''), job: Util.clean(r.job) };
    });
    var bad = rows.filter(function (r) { return !r.name || r.qid.length < 6; }).length;
    rows = rows.filter(function (r) { return r.name && r.qid.length >= 6; });
    var known = {};
    Repo.all('Workers').forEach(function (w) { known[w.qid_hash] = w; });
    var out = { workers: rows.length, new_workers: rows.filter(function (r) { return !known[Workers.hash(r.qid)]; }).length, bad: bad,
                chefs: rows.filter(function (r) { return Workers.jobOf(r.job) === 'chef'; }).length };
    if (!p.apply) return out;
    return withLock(function () {
      rows.forEach(function (r) {
        var h = Workers.hash(r.qid);
        var row = { name: r.name, job: r.job, kind: Workers.jobOf(r.job), active: true };
        if (Repo.find('Workers', 'qid_hash', h)) Repo.update('Workers', 'qid_hash', h, row);
        else Repo.append('Workers', [Object.assign({ qid_hash: h, user_id: '', created_at: Util.nowIso() }, row)]);
      });
      Audit.log(session.user_id, 'workers_import', 'Workers', '', null, { workers: out.workers, new_workers: out.new_workers });
      out.done = true;
      out.version = Version.bump();
      return out;
    });
  },

  /** The admin: how many are on the list and how many opened their account. */
  summary: function () {
    var all = Repo.all('Workers').filter(function (w) { return w.active === true; });
    return { workers: all.length, registered: all.filter(function (w) { return w.user_id; }).length };
  },

  find: function (qid) {
    // card numbers guessed one after the other: after too many wrong ones, nobody is looked up for a while
    var cache = CacheService.getScriptCache();
    var fails = Number(cache.get('worker_fail') || 0);
    Util.require(fails < 30, 'login_locked', String(LOCK_MINUTES));
    var w = Repo.find('Workers', 'qid_hash', Workers.hash(qid));
    if (!(w && w.active === true)) cache.put('worker_fail', String(fails + 1), LOCK_MINUTES * 60);
    Util.require(w && w.active === true, 'worker_unknown');
    Util.require(!w.user_id, 'worker_registered');
    return w;
  },

  /** No session: the worker's name and the departments to pick from. p: {qid} */
  lookup: function (p) {
    var w = Workers.find(p.qid);
    var depts = Repo.all('Parties').filter(function (x) {
      return x.kind === 'section' && x.active === true && (x.producing === true || Repo.all('Items').some(function (i) { return String(i.dept || '') === x.party_id; }));
    }).map(function (x) { return { party_id: x.party_id, name: x.name }; }).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return { name: w.name, job: w.kind, depts: depts };
  },

  /** No session: the worker opens their account. p: {qid, dept, username, pin}. Signs them in. */
  register: function (p) {
    return withLock(function () {
      var w = Workers.find(p.qid);
      var dept = Repo.find('Parties', 'party_id', p.dept);
      Util.require(dept && dept.kind === 'section' && dept.active === true, 'party_not_section');
      var u = Auth.createUser({ username: p.username, display_name: w.name, role: 'section_head', pin: p.pin }, 'self');
      Repo.update('Users', 'user_id', u.user_id, { caps: (WORKER_JOBS[w.kind] || WORKER_JOBS.assistant).join(','), depts: dept.party_id });
      Repo.update('Workers', 'qid_hash', w.qid_hash, { user_id: u.user_id, registered_at: Util.nowIso() });
      Audit.log(u.user_id, 'worker_register', 'Users', u.user_id, null, { name: w.name, job: w.kind, dept: dept.party_id });
      return Auth.login({ username: p.username, pin: p.pin });
    });
  }
};
