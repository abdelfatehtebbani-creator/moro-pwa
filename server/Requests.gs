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
    return Repo.all('Requests').filter(function (r) {
      if (p.status && r.status !== p.status) return false;
      if (!Perm.has(session, 'requests.all') && r.requested_by !== session.user_id) return false;
      return true;
    }).reverse().slice(0, Number(p.limit) || 300).map(function (r) {
      r.lines = lines.filter(function (l) { return l.request_id === r.request_id; })
        .map(function (l) { l.store = storeOf[l.item_id] || ''; return l; });
      return r;
    });
  },

  /** payload: {request_id, date, lines: [{line_no, qty}], client_id} – qty defaults to what is left. */
  fulfil: function (session, p) {
    var req = Repo.find('Requests', 'request_id', p.request_id);
    Util.require(req && (req.status === 'open' || req.status === 'partial'), 'not_found');
    var lines = Repo.all('RequestLines').filter(function (l) { return l.request_id === req.request_id; });
    var give = {};
    (p.lines || lines.map(function (l) { return { line_no: l.line_no }; })).forEach(function (x) { give[x.line_no] = x.qty; });
    var movs = [];
    var mine = function (l) { return (session.stores || []).indexOf(Stores.of(Repo.find('Items', 'item_id', l.item_id))) >= 0; };
    // asked for explicitly: the line must be in the user's stores; "everything left" means their lines only
    if (p.lines) lines.forEach(function (l) { if (l.line_no in give && !mine(l)) Stores.requireItem(session, l.item_id); });
    lines.forEach(function (l) {
      if (!(l.line_no in give) || !mine(l)) return;
      var left = Util.round(Number(l.qty) - Number(l.issued_qty || 0));
      var q = give[l.line_no] === undefined || give[l.line_no] === '' ? left : Util.num(give[l.line_no]);
      if (q > 0) movs.push({ client_id: (p.client_id || req.request_id) + '-' + l.line_no, kind: 'ISSUE',
        date: p.date || Util.today(), party_id: req.party_id, item_id: l.item_id, qty: q, unit: l.unit,
        purpose: 'Request ' + req.request_id, _line: l.line_no });
    });
    Util.require(movs.length, 'nothing_to_save');
    var saved = Movements.save(session, { movements: movs });
    return withLock(function () {
      var byClient = {};
      saved.saved.forEach(function (s) { byClient[s.client_id] = s; });
      var all = true;
      lines.forEach(function (l) {
        var mv = movs.filter(function (m) { return m._line === l.line_no; })[0];
        var issued = Number(l.issued_qty || 0);
        if (mv && !byClient[mv.client_id].duplicate) {
          issued = Util.round(issued + Number(mv.qty));
          var ids = String(l.movement_id || '').split(' ').filter(String).concat([byClient[mv.client_id].movement_id]);
          Repo.updateWhere('RequestLines', function (x) {
            return x.request_id === l.request_id && Number(x.line_no) === Number(l.line_no);
          }, { issued_qty: issued, movement_id: ids.join(' ') });
        }
        if (issued < Number(l.qty)) all = false;
      });
      Repo.update('Requests', 'request_id', req.request_id,
        { status: all ? 'fulfilled' : 'partial', fulfilled_by: session.user_id, fulfilled_at: Util.nowIso() });
      return { request_id: req.request_id, status: all ? 'fulfilled' : 'partial', doc_no: saved.saved[0].doc_no,
               version: Version.bump() };
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
