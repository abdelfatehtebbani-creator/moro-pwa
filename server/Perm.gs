/**
 * Perm.gs – who may do what.
 *
 * Permissions are grouped into capabilities (CAPS). Each role has default capabilities; the admin
 * can give a user a different set (Users.caps, comma separated). Empty caps = the role's defaults.
 * Every server action is checked once in the router against the user's effective permissions.
 */
var ALL_ROLES = ['admin', 'storekeeper', 'purchasing', 'production'];

/** Actions every signed-in user may call. */
var BASE_PERMS = ['auth.me', 'auth.changePin', 'data.bootstrap', 'data.version', 'movements.query', 'requests.list'];

/** Capability → the actions/permissions it opens. Order = order shown in the app. */
var CAPS = {
  receive:        ['movements.save', 'kind.RECEIPT', 'kind.SUPPLIER_RETURN'],
  issue:          ['movements.save', 'kind.ISSUE', 'kind.DEPT_RETURN', 'kind.DISPOSAL'],
  shop_orders:    ['shop.list', 'shop.hand', 'shop.unavailable', 'shop.return', 'kind.ISSUE', 'kind.DEPT_RETURN', 'movements.save'],
  production:     ['production.preview', 'production.post', 'kind.PROD_CONSUME', 'kind.PROD_OUTPUT'],
  request_create: ['requests.create', 'requests.cancel'],
  request_fulfil: ['requests.fulfil', 'requests.cancel', 'requests.all'],
  edit_own:       ['movements.update'],
  edit_all:       ['movements.update', 'edit_any'],
  delete:         ['movements.delete'],
  masters:        ['items.save', 'parties.save', 'locations.save', 'units.save'],
  min_stock:      ['items.save', 'min_stock'],
  rename:         ['items.save', 'parties.save', 'locations.save', 'units.save', 'rename'],
  lists:          ['lists.save'],
  recipes:        ['recipes.save'],
  see_prices:     ['see_prices'],
  special:        ['special.list', 'special.decide', 'shop.list', 'shop.shortage'],
  users:          ['users.list', 'users.save', 'audit.list']
};

var ROLE_CAPS = {
  admin:       Object.keys(CAPS),
  storekeeper: ['receive', 'issue', 'shop_orders', 'production', 'request_create', 'request_fulfil', 'edit_own', 'masters', 'see_prices'],
  purchasing:  ['receive', 'edit_own', 'masters', 'min_stock', 'lists', 'see_prices', 'special'],
  production:  ['request_create']
};

var Perm = {
  /** Capabilities of a user row: its own list, or its role's defaults. */
  capsOf: function (u) {
    var own = String(u.caps || '').split(',').map(function (c) { return c.trim(); }).filter(function (c) { return CAPS[c]; });
    return own.length ? own : (ROLE_CAPS[u.role] || []).slice();
  },

  /** Effective permissions for a user row (array, no duplicates). */
  permsOf: function (u) {
    var set = {};
    BASE_PERMS.forEach(function (p) { set[p] = true; });
    Perm.capsOf(u).forEach(function (c) { CAPS[c].forEach(function (p) { set[p] = true; }); });
    return Object.keys(set);
  },

  has: function (session, perm) {
    return session.perms.indexOf(perm) >= 0;
  },

  check: function (action, session) {
    if (!ROUTES[action]) throw new AppError('unknown_action', action);
    if (!Perm.has(session, action)) throw new AppError('forbidden', action);
  },

  canKind: function (session, kind) {
    Util.require(SIGN[kind] !== undefined || kind === 'ADJUST', 'kind_invalid', kind);
    Util.require(Perm.has(session, 'kind.' + kind), 'forbidden', kind);
  },

  require: function (session, perm) {
    Util.require(Perm.has(session, perm), 'forbidden', perm);
  }
};
