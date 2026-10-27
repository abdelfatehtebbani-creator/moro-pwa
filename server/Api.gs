/**
 * Api.gs – the web app entry point used by the PWA.
 *
 * Request:  POST, body (sent as text/plain to avoid a CORS preflight) =
 *           {"action": "movements.save", "token": "...", "payload": {...}}
 * Response: {"ok": true, "data": {...}}  or  {"ok": false, "error": {"code": "...", "detail": "..."}}
 * Error codes are translated in the app; unexpected errors are logged and returned as "server_error".
 */
var API_VERSION = '1.0.0';

var ROUTES = {
  'auth.me':          function (s) { return s; },
  'auth.changePin':   function (s, p) { return Auth.changePin(s, p); },
  'data.bootstrap':   function (s) { return Masters.bootstrap(s); },
  'data.version':     function () { return { version: Version.get() }; },
  'movements.query':  function (s, p) { return Movements.query(s, p); },
  'movements.save':   function (s, p) { return Movements.save(s, p); },
  'movements.update': function (s, p) { return Movements.update(s, p); },
  'movements.delete': function (s, p) { return Movements.remove(s, p); },
  'items.save':       function (s, p) { return Masters.saveItem(s, p); },
  'parties.save':     function (s, p) { return Masters.saveParty(s, p); },
  'locations.save':   function (s, p) { return Masters.saveLocation(s, p); },
  'units.save':       function (s, p) { return Masters.saveUnit(s, p); },
  'items.convertUnit': function (s, p) { return Packs.convert(s, p); },
  'lists.save':       function (s, p) { return Masters.saveList(s, p); },
  'recipes.save':     function (s, p) { return Masters.saveRecipe(s, p); },
  'production.preview': function (s, p) { return Production.preview(p.product, Util.num(p.qty) || 1); },
  'production.post':  function (s, p) { return Production.post(s, p); },
  'requests.list':    function (s, p) { return Requests.list(s, p); },
  'counts.list':      function (s, p) { return Counts.list(s, p); },
  'counts.get':       function (s, p) { return Counts.get(s, p); },
  'counts.open':      function (s, p) { return Counts.open(s, p); },
  'counts.save':      function (s, p) { return Counts.save(s, p); },
  'counts.approve':   function (s, p) { return Counts.approve(s, p); },
  'counts.cancel':    function (s, p) { return Counts.cancel(s, p); },
  'push.register':    function (s, p) { return Push.register(s, p); },
  'push.unregister':  function (s, p) { return Push.unregister(s, p); },
  'cash.list':        function (s, p) { return Cash.list(s, p); },
  'cash.get':         function (s, p) { return Cash.get(s, p); },
  'cash.save':        function (s, p) { return Cash.save(s, p); },
  'cash.decide':      function (s, p) { return Cash.decide(s, p); },
  'cash.delete':      function (s, p) { return Cash.remove(s, p); },
  'cash.float':       function (s, p) { return Cash.addFloat(s, p); },
  'lpo.list':         function (s, p) { return Lpo.list(s, p); },
  'lpo.get':          function (s, p) { return Lpo.get(s, p); },
  'lpo.save':         function (s, p) { return Lpo.save(s, p); },
  'lpo.decide':       function (s, p) { return Lpo.decide(s, p); },
  'lpo.delete':       function (s, p) { return Lpo.remove(s, p); },
  'lpo.settings':     function (s, p) { return Lpo.settings(s, p); },
  'requests.create':  function (s, p) { return Requests.create(s, p); },
  'requests.fulfil':  function (s, p) { return Requests.fulfil(s, p); },
  'requests.cancel':  function (s, p) { return Requests.cancel(s, p); },
  'users.list':       function () { return Auth.listUsers(); },
  'users.save':       function (s, p) { return Auth.saveUser(s, p); },
  'audit.list':       function (s, p) { return Audit.list(p || {}); }
};

/** Actions that do not need a session. */
var PUBLIC = {
  'ping':        function () { return { api: API_VERSION, setup_needed: Repo.all('Users').length === 0, today: Util.today() }; },
  'auth.login':  function (p) { return Auth.login(p); },
  'auth.setup':  function (p) { return withLock(function () { return Auth.setup(p); }); }
};

function handle(body) {
  Repo.reset();
  var req;
  try {
    req = JSON.parse(body || '{}');
  } catch (e) {
    return { ok: false, error: { code: 'bad_request' } };
  }
  try {
    ensureSchema();
    var action = String(req.action || '');
    var payload = req.payload || {};
    if (PUBLIC[action]) return { ok: true, data: PUBLIC[action](payload) };
    var session = Auth.verify(req.token);
    Perm.check(action, session);
    return { ok: true, data: ROUTES[action](session, payload) };
  } catch (e) {
    if (e && e.name === 'AppError') return { ok: false, error: { code: e.code, detail: e.detail } };
    console.error('server_error ' + (req && req.action) + ' ' + (e && e.stack || e));
    return { ok: false, error: { code: 'server_error' } };
  }
}

/** Adds sheets/columns introduced by a newer version once, the first time a request reaches it. */
var SCHEMA_VERSION = '16';
function ensureSchema() {
  if (Settings.get('stores_list', '') !== STORES.join(',')) {
    withLock(function () { Stores.addDropdowns(); Settings.set('stores_list', STORES.join(',')); });
  }
  if (Settings.get('schema_version', '') === SCHEMA_VERSION) return;
  withLock(function () {
    setupSheets();
    Repo.reset();
    Masters.seedUnits();
    if (Number(Settings.get('schema_version', '0')) < 5) Stores.seed();
    Settings.set('schema_version', SCHEMA_VERSION);
  });
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  return json(handle(e && e.postData ? e.postData.contents : ''));
}

function doGet() {
  return json(handle(JSON.stringify({ action: 'ping' })));
}
