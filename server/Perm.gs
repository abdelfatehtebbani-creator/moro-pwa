/**
 * Perm.gs – who may call what. One table, checked once in the router for every action,
 * plus finer checks inside services (movement kinds, own records).
 *
 * admin        everything
 * storekeeper  receipts, issues, returns, production; edits own entries; no delete, users or archive
 * purchasing   receipts and supplier returns, items/suppliers, min stock, price data; edits own entries
 * production   reads balances, creates department requests
 */
var ALL_ROLES = ['admin', 'storekeeper', 'purchasing', 'production'];

var PERMISSIONS = {
  'auth.me':            ALL_ROLES,
  'auth.changePin':     ALL_ROLES,
  'data.bootstrap':     ALL_ROLES,
  'data.version':       ALL_ROLES,
  'movements.query':    ALL_ROLES,
  'movements.save':     ['admin', 'storekeeper', 'purchasing'],
  'movements.update':   ['admin', 'storekeeper', 'purchasing'],
  'movements.delete':   ['admin'],
  'items.save':         ['admin', 'storekeeper', 'purchasing'],
  'parties.save':       ['admin', 'storekeeper', 'purchasing'],
  'lists.save':         ['admin', 'purchasing'],
  'recipes.save':       ['admin'],
  'requests.list':      ALL_ROLES,
  'requests.create':    ['admin', 'storekeeper', 'production'],
  'requests.fulfil':    ['admin', 'storekeeper'],
  'requests.cancel':    ['admin', 'storekeeper', 'production'],
  'users.list':         ['admin'],
  'users.save':         ['admin'],
  'audit.list':         ['admin']
};

/** Movement kinds each role may create. */
var KIND_ROLES = {
  RECEIPT:         ['admin', 'storekeeper', 'purchasing'],
  SUPPLIER_RETURN: ['admin', 'storekeeper', 'purchasing'],
  ISSUE:           ['admin', 'storekeeper'],
  DEPT_RETURN:     ['admin', 'storekeeper'],
  PROD_CONSUME:    ['admin', 'storekeeper'],
  PROD_OUTPUT:     ['admin', 'storekeeper'],
  ADJUST:          ['admin']
};

/** Item/party changes only admin may make (renames and deactivation). */
var ADMIN_ONLY_CHANGES = ['rename', 'deactivate'];

var Perm = {
  check: function (action, session) {
    var roles = PERMISSIONS[action];
    if (!roles) throw new AppError('unknown_action', action);
    if (roles.indexOf(session.role) < 0) throw new AppError('forbidden', action);
  },
  canKind: function (session, kind) {
    var roles = KIND_ROLES[kind];
    Util.require(roles, 'kind_invalid', kind);
    Util.require(roles.indexOf(session.role) >= 0, 'forbidden', kind);
  },
  /** Actions this role may call, sent to the app so it can hide what the user cannot do. */
  forRole: function (role) {
    return Object.keys(PERMISSIONS).filter(function (a) { return PERMISSIONS[a].indexOf(role) >= 0; })
      .concat(Object.keys(KIND_ROLES).filter(function (k) { return KIND_ROLES[k].indexOf(role) >= 0; })
        .map(function (k) { return 'kind.' + k; }));
  }
};
