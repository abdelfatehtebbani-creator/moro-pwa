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
  'lists.save':       function (s, p) { return Masters.saveList(s, p); },
  'recipes.save':     function (s, p) { return Masters.saveRecipe(s, p); },
  'production.preview': function (s, p) { return Production.preview(p.product, Util.num(p.qty) || 1); },
  'production.post':  function (s, p) { return Production.post(s, p); },
  'requests.list':    function (s, p) { return Requests.list(s, p); },
  'requests.create':  function (s, p) { return Requests.create(s, p); },
  'requests.fulfil':  function (s, p) { return Requests.fulfil(s, p); },
  'requests.cancel':  function (s, p) { return Requests.cancel(s, p); },
  'users.list':       function () { return Auth.listUsers(); },
  'users.save':       function (s, p) { return Auth.saveUser(s, p); },
  'audit.list':       function (s, p) { return Audit.list(p || {}); },
  'shop.list':        function (s, p) { return Shop.list(s, p); },
  'shop.hand':        function (s, p) { return Shop.hand(s, p); },
  'shop.unavailable': function (s, p) { return Shop.unavailable(s, p); },
  'special.list':     function (s, p) { return Shop.listSpecial(s, p); },
  'special.decide':   function (s, p) { return Shop.decideSpecial(s, p); }
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
    if (LINK_ROUTES[action]) { Link.check(payload.key); return { ok: true, data: LINK_ROUTES[action](payload) }; }
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
var SCHEMA_VERSION = '6';
function ensureSchema() {
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
