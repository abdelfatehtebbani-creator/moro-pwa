/**
 * Perm.gs – who may do what, screen by screen and button by button.
 *
 * PERM_TREE is what the admin ticks in the user window: a heading per screen (and per tab), its
 * "access" leaf first, then one leaf per button. Each leaf (CAPS) opens the server actions and
 * permission tokens behind that button. A role is only a template of leaves (ROLE_CAPS); the admin
 * can tick a different set for a user (Users.caps, comma separated; empty = the role's template).
 * Lists saved before the tree (receive, issue, masters…) are read through OLD_CAPS.
 * Every server action is checked once in the router; the finer rules (own records, stores…) in the services.
 */
var ALL_ROLES = ['admin', 'storekeeper', 'purchasing', 'production'];

/** Actions every signed-in user may call. */
var BASE_PERMS = ['auth.me', 'auth.changePin', 'data.bootstrap', 'data.version', 'movements.query', 'requests.list', 'push.register', 'push.unregister'];

var REPORT_IDS = ['fast', 'min', 'sensitive', 'expiry', 'near', 'changes', 'bySection', 'byItem', 'itemOut', 'itemIn', 'multiMonth', 'prices', 'production'];

/** Screens → tabs → buttons, in the order of the menu. A node with `leaf` is a tick box. */
var PERM_TREE = [
  { key: 'dashboard', children: [{ leaf: 'dash.min' }] },
  { key: 'receive', children: [{ leaf: 'receive.view' }, { leaf: 'receive.save' }, { leaf: 'receive.return' },
    { leaf: 'receive.edit_own' }, { leaf: 'receive.edit_all' }, { leaf: 'receive.delete' }] },
  { key: 'issue', children: [{ leaf: 'issue.view' }, { leaf: 'issue.post' }, { leaf: 'issue.dept_return' },
    { leaf: 'issue.edit_own' }, { leaf: 'issue.edit_all' }, { leaf: 'issue.delete' }] },
  { key: 'production', children: [{ leaf: 'production.view' }, { leaf: 'production.post' }, { leaf: 'production.edit' }] },
  { key: 'requests', children: [{ leaf: 'requests.view' }, { leaf: 'requests.create' }, { leaf: 'requests.fulfil' }] },
  { key: 'reports', children: [{ leaf: 'reports.view' }].concat(REPORT_IDS.map(function (id) { return { leaf: 'report.' + id }; }))
},
  { key: 'lpo', children: [{ leaf: 'lpo.view' }, { leaf: 'lpo.create' }, { leaf: 'lpo.approve' }, { leaf: 'lpo.terms' }] },
  { key: 'counts', children: [{ leaf: 'counts.view' }, { leaf: 'counts.open' }, { leaf: 'counts.save' }, { leaf: 'counts.approve' }, { leaf: 'counts.cancel' }] },
  { key: 'masters', children: [
    { key: 'tab_items', children: [{ leaf: 'items.view' }, { leaf: 'items.add' }, { leaf: 'items.rename' }, { leaf: 'items.min' },
      { leaf: 'items.packaging' }, { leaf: 'items.convert' }, { leaf: 'items.final_price' }] },
    { key: 'tab_parties', children: [{ leaf: 'parties.view' }, { leaf: 'parties.add' }, { leaf: 'parties.rename' }] },
    { key: 'tab_locations', children: [{ leaf: 'locations.view' }, { leaf: 'locations.add' }, { leaf: 'locations.rename' }] },
    { key: 'tab_units', children: [{ leaf: 'units.view' }, { leaf: 'units.add' }, { leaf: 'units.rename' }] },
    { key: 'tab_recipes', children: [{ leaf: 'recipes.view' }, { leaf: 'recipes.edit' }] }] },
  { key: 'coffee', children: [{ leaf: 'coffee.view' }] },
  { key: 'users', children: [{ leaf: 'users.manage' }] },
  { key: 'general', children: [{ leaf: 'prices.see' }] }
];

/** Leaf → the server actions and tokens it opens. */
var CAPS = (function () {
  var c = {
    'dash.min':          ['items.save', 'min_stock'],
    'receive.view':      ['nav.receive'],
    'receive.save':      ['nav.receive', 'movements.save', 'kind.RECEIPT'],
    'receive.return':    ['nav.receive', 'movements.save', 'kind.SUPPLIER_RETURN'],
    'receive.edit_own':  ['movements.update', 'edit_own.receive'],
    'receive.edit_all':  ['movements.update', 'edit_own.receive', 'edit_all.receive'],
    'receive.delete':    ['movements.delete', 'delete.receive'],
    'issue.view':        ['nav.issue'],
    'issue.post':        ['nav.issue', 'movements.save', 'kind.ISSUE'],
    'issue.dept_return': ['nav.issue', 'movements.save', 'kind.DEPT_RETURN'],
    'issue.edit_own':    ['movements.update', 'edit_own.issue'],
    'issue.edit_all':    ['movements.update', 'edit_own.issue', 'edit_all.issue'],
    'issue.delete':      ['movements.delete', 'delete.issue'],
    'production.view':   ['nav.production', 'production.preview'],
    'production.post':   ['nav.production', 'production.preview', 'production.post', 'kind.PROD_CONSUME', 'kind.PROD_OUTPUT'],
    'production.edit':   ['movements.update', 'movements.delete', 'edit_own.production', 'edit_all.production', 'delete.production'],
    'requests.view':     ['nav.requests'],
    'requests.create':   ['nav.requests', 'requests.create', 'requests.cancel'],
    'requests.fulfil':   ['nav.requests', 'requests.fulfil', 'requests.cancel', 'requests.all'],
    'reports.view':      ['nav.reports'],
    'lpo.view':          ['nav.lpo', 'lpo.list', 'lpo.get'],
    'lpo.create':        ['nav.lpo', 'lpo.list', 'lpo.get', 'lpo.save', 'lpo.delete'],
    'lpo.approve':       ['nav.lpo', 'lpo.list', 'lpo.get', 'lpo.decide'],
    'lpo.terms':         ['lpo.settings'],
    'counts.view':       ['nav.counts', 'counts.list', 'counts.get'],
    'counts.open':       ['nav.counts', 'counts.list', 'counts.get', 'counts.open'],
    'counts.save':       ['nav.counts', 'counts.list', 'counts.get', 'counts.save'],
    'counts.approve':    ['nav.counts', 'counts.list', 'counts.get', 'counts.approve', 'kind.ADJUST'],
    'counts.cancel':     ['counts.cancel'],
    'items.view':        ['nav.masters', 'tab.items'],
    'items.add':         ['items.save', 'add_items'],
    'items.rename':      ['items.save', 'rename.items'],
    'items.min':         ['items.save', 'min_stock'],
    'items.packaging':   ['items.save', 'packaging'],
    'items.convert':     ['items.convertUnit'],
    'items.final_price': ['items.save', 'final_price'],
    'parties.view':      ['nav.masters', 'tab.parties'],
    'parties.add':       ['parties.save'],
    'parties.rename':    ['parties.save', 'rename.parties'],
    'locations.view':    ['nav.masters', 'tab.locations'],
    'locations.add':     ['locations.save'],
    'locations.rename':  ['locations.save', 'rename.locations'],
    'units.view':        ['nav.masters', 'tab.units'],
    'units.add':         ['units.save'],
    'units.rename':      ['units.save', 'rename.units'],
    'recipes.view':      ['nav.masters', 'tab.recipes'],
    'recipes.edit':      ['recipes.save'],
    'coffee.view':       ['nav.coffee'],
    'users.manage':      ['nav.users', 'users.list', 'users.save', 'audit.list'],
    'prices.see':        ['see_prices']
  };
  // the fast-moving and sensitive reports each keep a personal list of items: their tick opens editing it
  REPORT_IDS.forEach(function (id) { c['report.' + id] = ['nav.reports', 'report.' + id].concat(id === 'fast' || id === 'sensitive' ? ['lists.save'] : []); });
  return c;
})();

/** The bundles used before the tree, read as leaves (lists saved in Users.caps stay valid). */
var OLD_CAPS = {
  receive: ['receive.view', 'receive.save', 'receive.return'],
  issue: ['issue.view', 'issue.post', 'issue.dept_return'],
  production: ['production.view', 'production.post'],
  request_create: ['requests.view', 'requests.create'],
  request_fulfil: ['requests.view', 'requests.fulfil'],
  edit_own: ['receive.edit_own', 'issue.edit_own'],
  edit_all: ['receive.edit_all', 'issue.edit_all', 'production.edit'],
  delete: ['receive.delete', 'issue.delete'],
  masters: ['items.view', 'items.add', 'parties.view', 'parties.add', 'locations.view', 'locations.add', 'units.view', 'units.add'],
  min_stock: ['dash.min', 'items.view', 'items.min'],
  rename: ['items.rename', 'parties.rename', 'locations.rename', 'units.rename'],
  convert_unit: ['items.view', 'items.convert'],
  packaging: ['items.view', 'items.packaging'],
  final_price: ['items.view', 'items.final_price'],
  count: ['counts.view', 'counts.open', 'counts.save'],
  count_approve: ['counts.view', 'counts.approve', 'counts.cancel'],
  lists: [],
  recipes: ['recipes.view', 'recipes.edit'],
  see_prices: ['prices.see'],
  users: ['users.manage']
};

/** Old bundles → leaves; everyone could open the reports before, so they keep them (prices only with prices.see). */
function leavesFromOld(list) {
  var set = {};
  list.forEach(function (c) { (OLD_CAPS[c] || []).forEach(function (l) { set[l] = true; }); });
  set['reports.view'] = true;
  REPORT_IDS.forEach(function (id) { if (id !== 'prices' || set['prices.see']) set['report.' + id] = true; });
  return Object.keys(CAPS).filter(function (l) { return set[l]; });
}

var ROLE_CAPS = {
  admin:       Object.keys(CAPS),
  storekeeper: leavesFromOld(['receive', 'issue', 'production', 'request_create', 'request_fulfil', 'edit_own', 'masters', 'see_prices', 'packaging', 'count']),
  purchasing:  leavesFromOld(['receive', 'edit_own', 'masters', 'min_stock', 'lists', 'see_prices', 'packaging']).concat(['lpo.view', 'lpo.create', 'coffee.view']),
  production:  leavesFromOld(['request_create'])
};

var Perm = {
  /** Leaves of a user row: its own list (old bundles read as leaves), or its role's template. */
  capsOf: function (u) {
    var own = String(u.caps || '').split(',').map(function (c) { return c.trim(); }).filter(String);
    if (!own.length) return (ROLE_CAPS[u.role] || []).slice();
    var leaves = own.filter(function (c) { return CAPS[c]; });
    var old = own.filter(function (c) { return OLD_CAPS[c]; });
    if (old.length && !leaves.length) return leavesFromOld(old);
    return leaves;
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
