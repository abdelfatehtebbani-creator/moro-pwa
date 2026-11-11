/**
 * Kiosk.gs – a shared device in the factory (kiosk.html): one touch screen for every producing department.
 *
 *   The admin turns a device into a shared device once (kiosk.enable): it gets a device key, kept on the device. With
 *   that key the device lists the people who work on it (kiosk.users, no session): a name is pressed, the person's PIN
 *   is typed, and they sign in as themselves (auth.login), so every entry is theirs. Only the key's hash is stored.
 */
var KIOSK_LEAVES = ['production.post', 'shop.hand', 'requests.create'];

var Kiosk = {
  keys: function () {
    try { return JSON.parse(Settings.get('kiosk_keys', '[]')) || []; } catch (e) { return []; }
  },

  /** The admin: this device becomes a shared device. p: {name}. {key} (kept on the device). */
  enable: function (session, p) {
    var name = Util.clean(p.name).slice(0, 40) || 'Factory';
    return withLock(function () {
      var key = Utilities.getUuid() + Utilities.getUuid();
      var list = Kiosk.keys();
      var id = 'K' + Util.pad(list.length + 1, 2);
      list.push({ id: id, name: name, hash: Auth.hashPin(key, 'kiosk'), at: Util.nowIso(), by: session.user_id });
      Settings.set('kiosk_keys', JSON.stringify(list));
      Audit.log(session.user_id, 'kiosk_enable', 'Settings', id, null, { name: name });
      return { key: key, id: id, name: name };
    });
  },

  /** The admin: every shared device is switched off (each must be set up again). */
  reset: function (session) {
    return withLock(function () {
      var n = Kiosk.keys().length;
      Settings.set('kiosk_keys', '[]');
      Audit.log(session.user_id, 'kiosk_reset', 'Settings', 'kiosk_keys', { devices: n }, null);
      return { removed: n };
    });
  },

  check: function (key) {
    var hash = Auth.hashPin(String(key || ''), 'kiosk');
    var dev = Kiosk.keys().filter(function (k) { return k.hash === hash; })[0];
    if (!key || !dev) throw new AppError('kiosk_unknown');
    return dev;
  },

  /** The people of the shared device (not the admin nor the storekeeper): active, allowed to record production, hand shop orders or ask the store. p: {key}. */
  users: function (p) {
    var dev = Kiosk.check(p.key);
    var parties = {};
    Repo.all('Parties').forEach(function (x) { parties[x.party_id] = x.name; });
    var people = Repo.all('Users').filter(function (u) { return u.active === true && u.role !== 'admin' && u.role !== 'storekeeper'; }).map(function (u) {
      var caps = Perm.capsOf(u).filter(function (c) { return KIOSK_LEAVES.indexOf(c) >= 0; });
      if (!caps.length) return null;
      var depts = Auth.deptsOf(u).map(function (d) { return parties[d] || ''; }).filter(String);
      return { username: u.username, name: u.display_name, depts: depts, role: u.role };
    }).filter(Boolean).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return { device: dev.name, users: people, no_pin: Auth.noPin(), today: Util.today() };
  }
};
