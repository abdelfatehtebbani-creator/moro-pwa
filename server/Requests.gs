/**
 * Requests.gs – department requests: the production manager asks for items for a department,
 * the storekeeper issues them (fully or partly) with one action that creates the ISSUE movements.
 * Status: open → partial → fulfilled, or cancelled.
 */
var Requests = {
  create: function (session, p) {
    Util.require(Util.isDate(p.date || ''), 'date_invalid');
    var party = Repo.find('Parties', 'party_id', p.party_id);
    Util.require(party && party.kind === 'section', 'party_not_section');
    var lines = (p.lines || []).filter(function (l) { return Util.num(l.qty) > 0; });
    Util.require(lines.length, 'nothing_to_save');
    // a request asks for no more than the stock of each item
    var asked = {};
    lines.forEach(function (l) { asked[l.item_id] = Util.round((asked[l.item_id] || 0) + Util.num(l.qty)); });
    Object.keys(asked).forEach(function (id) {
      var b = Repo.find('Balances', 'item_id', id);
      var item = Repo.find('Items', 'item_id', id);
      Util.require(asked[id] <= Math.max(0, Number(b && b.qty) || 0), 'request_over_stock', item ? item.name : id);
    });
    return withLock(function () {
      if (p.client_id) {
        var dup = Repo.find('Requests', 'client_id', p.client_id);
        if (dup) return { request_id: dup.request_id, duplicate: true, version: Version.get() };
      }
      var id = 'R' + Util.pad(Settings.next('seq_request', 0), 5);
      Repo.append('Requests', [{ request_id: id, date: p.date, party_id: party.party_id, requested_by: session.user_id,
        status: 'open', note: Util.clean(p.note), created_at: Util.nowIso(), fulfilled_by: '', fulfilled_at: '',
        client_id: p.client_id || '' }]);
      Repo.append('RequestLines', lines.map(function (l, i) {
        var item = Repo.find('Items', 'item_id', l.item_id);
        Util.require(item && item.active === true, 'item_unknown', l.item_id);
        return { request_id: id, line_no: i + 1, item_id: item.item_id, qty: Util.round(Number(l.qty)), unit: item.unit,
                 issued_qty: 0, movement_id: '' };
      }));
      return { request_id: id, duplicate: false, version: Version.bump() };
    });
  },

  list: function (session, p) {
    p = p || {};
    var lines = Repo.all('RequestLines');
    var storeOf = {};
    Repo.all('Items').forEach(function (i) { storeOf[i.item_id] = Stores.of(i); });
    // a storekeeper sees the requests, and the lines, of the stores where they fulfil requests; the person
    // who asked sees their whole request
    var all = Perm.has(session, 'requests.all');
    return Repo.all('Requests').filter(function (r) {
      if (p.status && r.status !== p.status) return false;
      return r.requested_by === session.user_id || all;
    }).reverse().map(function (r) {
      var own = r.requested_by === session.user_id;
      r.lines = lines.filter(function (l) { return l.request_id === r.request_id; })
        .map(function (l) { l.store = storeOf[l.item_id] || ''; return l; })
        .filter(function (l) { return own || Stores.allows(session, l.store, 'requests'); });
      return r;
    }).filter(function (r) { return r.lines.length; }).slice(0, Number(p.limit) || 300);
  },

  /**
   * payload: {request_id, date, lines: [{line_no, qty}], client_id} – qty defaults to what is left.
   * The storekeeper gives what they can: what is left of their lines afterwards waits for the person who
   * asked (RequestLines.wait), who asks for the rest or keeps what was given (followup).
   */
  fulfil: function (session, p) {
    var req = Repo.find('Requests', 'request_id', p.request_id);
    Util.require(req && (req.status === 'open' || req.status === 'partial'), 'not_found');
    var lines = Repo.all('RequestLines').filter(function (l) { return l.request_id === req.request_id; });
    var waiting = function (l) { return String(l.wait || '') === 'yes'; };
    // lines waiting for the requester's answer are not issued
    if (p.lines) lines.forEach(function (l) { if (waiting(l) && p.lines.some(function (x) { return Number(x.line_no) === Number(l.line_no); })) throw new AppError('request_waiting'); });
    // nor the lines refused by a storekeeper
    lines = lines.filter(function (l) { return !waiting(l) && !String(l.reason || ''); });
    var give = {};
    (p.lines || lines.map(function (l) { return { line_no: l.line_no }; })).forEach(function (x) { give[x.line_no] = x.qty; });
    var movs = [];
    var mine = function (l) { return Stores.allows(session, Stores.of(Repo.find('Items', 'item_id', l.item_id)), 'requests'); };
    // asked for explicitly: the line must be in the user's stores; "everything left" means their lines only
    if (p.lines) lines.forEach(function (l) { if (l.line_no in give && !mine(l)) Stores.requireItem(session, l.item_id, 'requests'); });
    lines.forEach(function (l) {
      if (!(l.line_no in give) || !mine(l)) return;
      var left = Util.round(Number(l.qty) - Number(l.issued_qty || 0));
      var q = give[l.line_no] === undefined || give[l.line_no] === '' ? left : Util.num(give[l.line_no]);
      if (q > 0) movs.push({ client_id: (p.client_id || req.request_id) + '-' + l.line_no, kind: 'ISSUE',
        date: p.date || Util.today(), party_id: req.party_id, item_id: l.item_id, qty: q, unit: l.unit,
        purpose: 'Request ' + req.request_id, _line: l.line_no });
    });
    Util.require(movs.length, 'nothing_to_save');
    var saved = Movements.save(session, { movements: movs }, null, 'requests');
    return withLock(function () {
      var byClient = {};
      saved.saved.forEach(function (s) { byClient[s.client_id] = s; });
      lines.forEach(function (l) {
        var mv = movs.filter(function (m) { return m._line === l.line_no; })[0];
        var issued = Number(l.issued_qty || 0);
        var ch = {};
        if (mv && !byClient[mv.client_id].duplicate) {
          issued = Util.round(issued + Number(mv.qty));
          ch.issued_qty = issued;
          ch.movement_id = String(l.movement_id || '').split(' ').filter(String).concat([byClient[mv.client_id].movement_id]).join(' ');
        }
        // the storekeeper's lines not given in full: the requester decides about the rest
        if (mine(l) && issued < Number(l.qty)) ch.wait = 'yes';
        if (Object.keys(ch).length) Repo.updateWhere('RequestLines', function (x) {
          return x.request_id === l.request_id && Number(x.line_no) === Number(l.line_no);
        }, ch);
      });
      var status = Requests.statusOf(req.request_id);
      Repo.update('Requests', 'request_id', req.request_id, { status: status, fulfilled_by: session.user_id, fulfilled_at: Util.nowIso() });
      return { request_id: req.request_id, status: status, doc_no: saved.saved[0].doc_no, version: Version.bump() };
    });
  },

  /** Open while something is left to give, fulfilled when nothing is (rejected when nothing was given); partial once something was. */
  statusOf: function (requestId) {
    var lines = Repo.all('RequestLines').filter(function (l) { return l.request_id === requestId; });
    if (lines.every(function (l) { return Number(l.issued_qty || 0) >= Number(l.qty) || String(l.reason || ''); })) {
      return lines.some(function (l) { return Number(l.issued_qty || 0) > 0; }) ? 'fulfilled' : 'rejected';
    }
    return lines.some(function (l) { return Number(l.issued_qty || 0) > 0; }) ? 'partial' : 'open';
  },

  /**
   * The person who asked wants the rest of lines given in part: payload {request_id, lines: [{line_no, qty}]}.
   * qty > 0: still wanted (up to what is left, and within the stock), back to the storekeeper; 0: not wanted.
   * Not asking is keeping what was given.
   */
  followup: function (session, p) {
    return withLock(function () {
      var req = Repo.find('Requests', 'request_id', p.request_id);
      Util.require(req && (req.status === 'open' || req.status === 'partial'), 'not_found');
      Util.require(req.requested_by === session.user_id || Perm.has(session, 'users.save'), 'forbidden', 'own_only');
      var want = {};
      (p.lines || []).forEach(function (x) { want[Number(x.line_no)] = Util.num(x.qty); });
      var lines = Repo.all('RequestLines').filter(function (l) { return l.request_id === req.request_id && String(l.wait || '') === 'yes'; });
      Util.require(lines.length, 'nothing_to_save');
      var before = [], after = [];
      lines.forEach(function (l) {
        var issued = Number(l.issued_qty || 0), left = Util.round(Number(l.qty) - issued);
        var q = want[Number(l.line_no)];
        q = q === undefined || q === null ? 0 : Math.max(0, Math.min(left, q));
        var b = Repo.find('Balances', 'item_id', l.item_id);
        Util.require(q <= Math.max(0, Number(b && b.qty) || 0), 'request_over_stock', (Repo.find('Items', 'item_id', l.item_id) || {}).name || l.item_id);
        before.push({ line_no: l.line_no, qty: l.qty });
        after.push({ line_no: l.line_no, qty: Util.round(issued + q) });
        Repo.updateWhere('RequestLines', function (x) { return x.request_id === l.request_id && Number(x.line_no) === Number(l.line_no); },
          { qty: Util.round(issued + q), wait: '' });
      });
      var status = Requests.statusOf(req.request_id);
      Repo.update('Requests', 'request_id', req.request_id, { status: status });
      Audit.log(session.user_id, 'request_followup', 'Requests', req.request_id, before, after);
      return { request_id: req.request_id, status: status, version: Version.bump() };
    });
  },

  /** How many requests wait for this user: lines to give in their stores. */
  todo: function (session) {
    var reqs = {};
    Repo.all('Requests').forEach(function (r) { if (r.status === 'open' || r.status === 'partial') reqs[r.request_id] = r; });
    var give = {};
    var fulfil = Perm.has(session, 'requests.fulfil');
    Repo.all('RequestLines').forEach(function (l) {
      var r = reqs[l.request_id];
      if (!r || Number(l.issued_qty || 0) >= Number(l.qty) || String(l.reason || '')) return;
      // the rest of a line given in part waits in the requester's archive ("partial"): not counted
      if (String(l.wait || '') === 'yes') return;
      if (fulfil && Stores.allows(session, Stores.of(Repo.find('Items', 'item_id', l.item_id)), 'requests')) give[r.request_id] = true;
    });
    return Object.keys(give).length;
  },

  /**
   * The storekeeper refuses what is left of their lines, with a reason (shown to the person who asked):
   * payload {request_id, reason}. Lines of other stores are not touched.
   */
  reject: function (session, p) {
    var reason = Util.clean(p.reason);
    Util.require(reason, 'reason_required');
    return withLock(function () {
      var req = Repo.find('Requests', 'request_id', p.request_id);
      Util.require(req && (req.status === 'open' || req.status === 'partial'), 'not_found');
      var lines = Repo.all('RequestLines').filter(function (l) {
        return l.request_id === req.request_id && Number(l.issued_qty || 0) < Number(l.qty) && String(l.wait || '') !== 'yes'
          && !String(l.reason || '') && Stores.allows(session, Stores.of(Repo.find('Items', 'item_id', l.item_id)), 'requests');
      });
      Util.require(lines.length, 'nothing_to_save');
      var before = [];
      lines.forEach(function (l) {
        before.push({ line_no: l.line_no, qty: l.qty });
        Repo.updateWhere('RequestLines', function (x) { return x.request_id === l.request_id && Number(x.line_no) === Number(l.line_no); },
          { reason: reason, wait: '' });
      });
      var status = Requests.statusOf(req.request_id);
      Repo.update('Requests', 'request_id', req.request_id, { status: status, fulfilled_by: session.user_id, fulfilled_at: Util.nowIso() });
      Audit.log(session.user_id, 'request_reject', 'Requests', req.request_id, before, { reason: reason });
      return { request_id: req.request_id, status: status, version: Version.bump() };
    });
  },

  cancel: function (session, p) {
    return withLock(function () {
      var req = Repo.find('Requests', 'request_id', p.request_id);
      Util.require(req && req.status === 'open', 'not_found');
      if (!Perm.has(session, 'requests.fulfil')) Util.require(req.requested_by === session.user_id, 'forbidden', 'own_only');
      Repo.update('Requests', 'request_id', req.request_id, { status: 'cancelled', fulfilled_by: session.user_id,
                                                               fulfilled_at: Util.nowIso() });
      return { request_id: req.request_id, version: Version.bump() };
    });
  }
};
