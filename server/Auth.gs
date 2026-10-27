/**
 * Auth.gs – users, PIN login and signed session tokens.
 *
 * A token is "<user_id>.<issued_ms>.<expires_ms>.<signature>", signed with HMAC-SHA256 using a
 * secret kept in Script Properties (never in code). Tokens stay valid offline on the device;
 * every request re-checks that the user still exists, is active and has not changed PIN since.
 */
var ROLES = ['admin', 'storekeeper', 'purchasing', 'production', 'accountant'];
var TOKEN_DAYS = 30;
var MAX_TRIES = 5;          // wrong PINs before a temporary lock
var LOCK_MINUTES = 10;

var Auth = {
  secret: function () {
    var p = PropertiesService.getScriptProperties();
    var s = p.getProperty('TOKEN_SECRET');
    if (!s) {
      s = Utilities.getUuid() + Utilities.getUuid();
      p.setProperty('TOKEN_SECRET', s);
    }
    return s;
  },

  hashPin: function (pin, salt) {
    var bytes = Utilities.computeHmacSha256Signature(salt + '|' + pin, Auth.secret());
    return Utilities.base64EncodeWebSafe(bytes);
  },

  checkPinFormat: function (pin) {
    Util.require(/^\d{4,8}$/.test(String(pin || '')), 'pin_format');
  },

  sign: function (payload) {
    return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, Auth.secret())).replace(/=+$/, '');
  },

  issueToken: function (user) {
    var now = Date.now();
    var body = user.user_id + '.' + now + '.' + (now + TOKEN_DAYS * 86400000);
    return body + '.' + Auth.sign(body);
  },

  /** Returns the session {user_id, username, display_name, role, caps, perms} or throws auth_required. */
  verify: function (token) {
    var parts = String(token || '').split('.');
    if (parts.length !== 4) throw new AppError('auth_required');
    var body = parts.slice(0, 3).join('.');
    if (Auth.sign(body) !== parts[3]) throw new AppError('auth_required');
    if (Number(parts[2]) < Date.now()) throw new AppError('auth_expired');
    var u = Repo.find('Users', 'user_id', parts[0]);
    if (!u || u.active !== true) throw new AppError('auth_required');
    // a PIN change or reset invalidates tokens issued before it
    if (u.pin_changed_ms && Number(parts[1]) < Number(u.pin_changed_ms)) throw new AppError('auth_expired');
    return { user_id: u.user_id, username: u.username, display_name: u.display_name, role: u.role,
             caps: Perm.capsOf(u), perms: Perm.permsOf(u), stores: Stores.ofUser(u) };
  },

  publicUser: function (u) {
    return { user_id: u.user_id, username: u.username, display_name: u.display_name, role: u.role, caps: Perm.capsOf(u),
             custom_caps: !!String(u.caps || '').trim(), stores: Stores.ofUser(u) };
  },

  /** First run only: creates the admin account when the Users sheet is empty. */
  setup: function (p) {
    Util.require(Repo.all('Users').length === 0, 'already_setup');
    return Auth.createUser({ username: p.username, display_name: p.display_name, role: 'admin', pin: p.pin }, 'setup');
  },

  createUser: function (p, by) {
    var username = Util.clean(p.username).toLowerCase();
    Util.require(/^[a-z0-9._-]{3,30}$/.test(username), 'username_format');
    Util.require(ROLES.indexOf(p.role) >= 0, 'role_invalid');
    Auth.checkPinFormat(p.pin);
    Util.require(!Repo.find('Users', 'username', username), 'username_taken');
    var salt = Utilities.getUuid();
    var user = {
      user_id: 'U' + Util.pad(Repo.all('Users').length + 1, 3),
      username: username,
      display_name: Util.clean(p.display_name) || username,
      role: p.role,
      pin_hash: Auth.hashPin(String(p.pin), salt),
      pin_salt: salt,
      active: true,
      created_at: Util.nowIso(),
      last_login: '',
      pin_changed_ms: String(Date.now()),
      // a new user gets the stores the admin ticked, or every store when none were sent
      stores: p.stores === undefined ? STORES.join(',') : Stores.pack(p.stores)
    };
    Repo.append('Users', [user]);
    Audit.log(by, 'user_create', 'Users', user.user_id, null, Auth.publicUser(user));
    return Auth.publicUser(user);
  },

  login: function (p) {
    var username = Util.clean(p.username).toLowerCase();
    var cache = CacheService.getScriptCache();
    var lockKey = 'login_fail_' + username;
    var fails = Number(cache.get(lockKey) || 0);
    Util.require(fails < MAX_TRIES, 'login_locked', String(LOCK_MINUTES));
    var u = Repo.find('Users', 'username', username);
    var ok = u && u.active === true && Auth.hashPin(String(p.pin || ''), u.pin_salt) === u.pin_hash;
    if (!ok) {
      cache.put(lockKey, String(fails + 1), LOCK_MINUTES * 60);
      throw new AppError('login_failed');
    }
    cache.remove(lockKey);
    Repo.update('Users', 'user_id', u.user_id, { last_login: Util.nowIso() });
    return { token: Auth.issueToken(u), user: Auth.publicUser(u) };
  },

  changePin: function (session, p) {
    var u = Repo.find('Users', 'user_id', session.user_id);
    Util.require(Auth.hashPin(String(p.old_pin || ''), u.pin_salt) === u.pin_hash, 'login_failed');
    Auth.checkPinFormat(p.new_pin);
    Auth.setPin(u.user_id, p.new_pin);
    Audit.log(session.user_id, 'pin_change', 'Users', u.user_id, null, null);
    return { token: Auth.issueToken(Repo.find('Users', 'user_id', u.user_id)) };
  },

  setPin: function (userId, pin) {
    var salt = Utilities.getUuid();
    Repo.update('Users', 'user_id', userId, {
      pin_hash: Auth.hashPin(String(pin), salt), pin_salt: salt, pin_changed_ms: String(Date.now())
    });
  },

  listUsers: function () {
    return Repo.all('Users').map(function (u) {
      var o = Auth.publicUser(u);
      o.active = u.active === true;
      o.last_login = u.last_login;
      return o;
    });
  },

  /** Admin: change name/role/active/capabilities, or reset a PIN. caps: array (custom) or null (role defaults). */
  saveUser: function (session, p) {
    if (!p.user_id) return Auth.createUser(p, session.user_id);
    var u = Repo.find('Users', 'user_id', p.user_id);
    Util.require(u, 'not_found');
    var changes = {};
    if (p.display_name !== undefined) changes.display_name = Util.clean(p.display_name) || u.username;
    if (p.role !== undefined) { Util.require(ROLES.indexOf(p.role) >= 0, 'role_invalid'); changes.role = p.role; }
    if (p.active !== undefined) changes.active = p.active === true;
    if (p.stores !== undefined) changes.stores = Stores.pack(p.stores);
    if (p.caps !== undefined) {
      // leaves of the tree; a list of the older bundles (receive, issue…) is read as leaves
      var input = p.caps || [];
      if (input.some(function (c) { return OLD_CAPS[c]; }) && !input.some(function (c) { return CAPS[c]; })) input = leavesFromOld(input);
      var caps = input.filter(function (c, i, a) { return CAPS[c] && a.indexOf(c) === i; });
      var role = changes.role || u.role;
      var same = caps.length === ROLE_CAPS[role].length && caps.every(function (c) { return ROLE_CAPS[role].indexOf(c) >= 0; });
      changes.caps = p.caps === null || same ? '' : caps.join(',');
    }
    // at least one active user must keep the right to manage users
    var after = {};
    Object.keys(u).forEach(function (k) { after[k] = u[k]; });
    Object.keys(changes).forEach(function (k) { after[k] = changes[k]; });
    if (Perm.capsOf(u).indexOf('users.manage') >= 0 && u.active === true && (after.active !== true || Perm.capsOf(after).indexOf('users.manage') < 0)) {
      var managers = Repo.all('Users').filter(function (x) { return x.user_id !== u.user_id && x.active === true && Perm.capsOf(x).indexOf('users.manage') >= 0; });
      Util.require(managers.length > 0, 'last_admin');
    }
    var res = Repo.update('Users', 'user_id', u.user_id, changes);
    if (p.pin) { Auth.checkPinFormat(p.pin); Auth.setPin(u.user_id, p.pin); }
    Audit.log(session.user_id, 'user_update', 'Users', u.user_id, Auth.publicUser(res.before), Auth.publicUser(res.after));
    return Auth.publicUser(res.after);
  }
};
