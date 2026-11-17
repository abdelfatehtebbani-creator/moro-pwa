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
        // the card number is kept too, for the admin's list (the sign-in looks it up by its hash)
        var row = { name: r.name, job: r.job, kind: Workers.jobOf(r.job), active: true, qid: r.qid, deleted_at: '', deleted_by: '' };
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
    var users = {};
    Repo.all('Users').forEach(function (u) { users[u.user_id] = u; });
    // the list (never the card numbers): who has opened their account and who not yet
    var list = all.map(function (w) { var u = users[w.user_id] || null;
      return { id: w.qid_hash, name: w.name, job: w.job, kind: w.kind, qid: String(w.qid || ''), registered: !!u, username: u ? u.username : '', at: w.registered_at || '' }; })
      .sort(function (a, b) { return (a.registered - b.registered) || String(a.name).localeCompare(String(b.name)); });
    return { workers: all.length, registered: all.filter(function (w) { return w.user_id; }).length, list: list };
  },

  /** The admin corrects a worker: name, job, card number. p: {id (its key), name, job, qid} */
  save: function (session, p) {
    var name = Util.clean(p.name), job = Util.clean(p.job), qid = String(p.qid || '').replace(/\D/g, '');
    Util.require(name, 'name_required');
    Util.require(qid.length >= 6, 'qid_invalid');
    return withLock(function () {
      var w = Repo.find('Workers', 'qid_hash', String(p.id || ''));
      Util.require(w && w.active === true, 'not_found');
      var h = Workers.hash(qid);
      if (h !== w.qid_hash) Util.require(!Repo.find('Workers', 'qid_hash', h), 'qid_taken');
      var ch = { qid_hash: h, qid: qid, name: name, job: job, kind: Workers.jobOf(job) };
      Repo.update('Workers', 'qid_hash', w.qid_hash, ch);
      // a worker with an account: its rights follow the job
      if (w.user_id && ch.kind !== w.kind) Repo.update('Users', 'user_id', w.user_id, { caps: (WORKER_JOBS[ch.kind] || WORKER_JOBS.assistant).join(',') });
      Audit.log(session.user_id, 'worker_save', 'Workers', w.user_id || name, { name: w.name, job: w.job }, { name: name, job: job });
      return { id: h, version: Version.bump() };
    });
  },
  /** The admin takes a worker off the list (kept, marked removed; an account they opened stays as it is). p: {id} */
  remove: function (session, p) {
    return withLock(function () {
      var w = Repo.find('Workers', 'qid_hash', String(p.id || ''));
      Util.require(w && w.active === true, 'not_found');
      Repo.update('Workers', 'qid_hash', w.qid_hash, { active: false, deleted_at: Util.nowIso(), deleted_by: session.user_id });
      Audit.log(session.user_id, 'worker_remove', 'Workers', w.user_id || w.name, { name: w.name }, null);
      return { version: Version.bump() };
    });
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
