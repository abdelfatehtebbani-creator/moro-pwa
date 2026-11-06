/**
 * Store.gs – audit log, settings counters, data version and balances.
 */
var Audit = {
  log: function (userId, action, entity, entityId, before, after) {
    Repo.append('Audit', [{
      audit_id: 'AU' + Date.now() + Math.floor(Math.random() * 1000),
      at: Util.nowIso(), user_id: userId || '', action: action, entity: entity, entity_id: entityId || '',
      before: before ? JSON.stringify(before) : '', after: after ? JSON.stringify(after) : ''
    }]);
  },
  list: function (p) {
    var rows = Repo.all('Audit');
    var limit = Math.min(Number(p.limit) || 200, 2000);
    return rows.slice(-limit).reverse();
  }
};

var Settings = {
  get: function (key, dflt) {
    var r = Repo.find('Settings', 'key', key);
    return r ? r.value : dflt;
  },
  set: function (key, value) {
    if (!Repo.update('Settings', 'key', key, { value: String(value) })) Repo.append('Settings', [{ key: key, value: String(value) }]);
  },
  /** Next number of a named counter. Call only while holding the script lock. */
  next: function (key, start) {
    var n = Number(Settings.get(key, '')) || start || 0;
    n += 1;
    Settings.set(key, n);
    return n;
  },
  all: function () {
    var o = {};
    Repo.all('Settings').forEach(function (r) { o[r.key] = r.value; });
    return o;
  }
};

var Version = {
  get: function () { return Number(Settings.get('data_version', 0)) || 0; },
  bump: function () { return Settings.next('data_version', 0); }
};

var Balances = {
  /** deltas: {item_id: qty_change}; expiries: {item_id: 'YYYY-MM-DD'} from receipts. */
  apply: function (deltas, expiries) {
    var now = Util.nowIso();
    Object.keys(deltas).forEach(function (itemId) {
      var cur = Repo.find('Balances', 'item_id', itemId);
      var item = Repo.find('Items', 'item_id', itemId);
      var exp = expiries && expiries[itemId];
      if (cur) {
        var ch = { qty: Util.round(Number(cur.qty || 0) + deltas[itemId]), updated_at: now };
        if (exp) ch.last_expiry = exp;
        Repo.update('Balances', 'item_id', itemId, ch);
      } else {
        Repo.append('Balances', [{ item_id: itemId, qty: Util.round(deltas[itemId]), unit: item ? item.unit : '',
                                    last_expiry: exp || '', updated_at: now }]);
      }
    });
  }
};

/** Runs fn while holding the script lock (all writes go through here). */
// work to do once the outermost lock is released (phone messages: slow, and nothing for others to wait on)
var LOCK_DEPTH = 0;
var AFTER_LOCK = [];

function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new AppError('busy');
  var out;
  // what this request read before the lock may be old by now (another request wrote meanwhile: a counter,
  // a balance): then everything is read again from the sheets. Nobody wrote since: what was read stands.
  if (!LOCK_DEPTH && Repo.stale()) Repo.reset();
  LOCK_DEPTH++;
  try {
    out = fn();
    // the changes reach the sheets together, before the lock is released
    if (LOCK_DEPTH === 1) Repo.flush();
  } catch (e) {
    if (LOCK_DEPTH === 1) { AFTER_LOCK = []; Repo.discard(); }   // the operation failed: nothing written, nothing to tell
    throw e;
  } finally {
    LOCK_DEPTH--;
    if (!LOCK_DEPTH) lock.releaseLock();
  }
  if (!LOCK_DEPTH) afterLock();
  return out;
}

/** Runs now outside a lock, or when the lock is released. */
function whenUnlocked(job) {
  if (LOCK_DEPTH) AFTER_LOCK.push(job); else job();
}

function afterLock() {
  var jobs = AFTER_LOCK;
  AFTER_LOCK = [];
  jobs.forEach(function (j) { try { j(); } catch (e) { console.error('after lock ' + (e && e.stack || e)); } });
}
