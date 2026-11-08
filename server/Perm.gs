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
var ALL_ROLES = ['admin', 'pdg', 'branch_manager', 'storekeeper', 'purchasing', 'production', 'accountant', 'cashier', 'distribution', 'section_head', 'driver'];

/** Actions every signed-in user may call. */
var BASE_PERMS = ['push.flush', 'photos.get', 'auth.me', 'auth.changePin', 'data.bootstrap', 'data.version', 'movements.query', 'requests.list', 'push.register', 'push.unregister'];

var REPORT_IDS = ['fast', 'min', 'sensitive', 'expiry', 'near', 'changes', 'bySection', 'byItem', 'itemOut', 'itemIn', 'multiMonth', 'prices', 'production', 'trace',
                  'slow', 'cover', 'losses', 'orderTimes', 'receiptShort', 'unavailable', 'shopSales', 'valuation', 'margin', 'takings', 'salesChannels'];
/** Reports built from the shop orders (they read orders.report). */
var ORDER_REPORTS = ['orderTimes', 'receiptShort', 'unavailable', 'shopSales'];

/** Screens → tabs → buttons, in the order of the menu. A node with `leaf` is a tick box. */
var PERM_TREE = [
  { key: 'exec', children: [{ leaf: 'exec.view' }] },
  { key: 'branches', children: [{ leaf: 'branches.view' }, { leaf: 'branches.note' }] },
  { key: 'dashboard', children: [{ leaf: 'dash.view' }, { leaf: 'dash.min' }, { leaf: 'dash.takings' }] },
  { key: 'receive', children: [{ leaf: 'receive.view' }, { leaf: 'receive.save' }, { leaf: 'receive.return' },
    { leaf: 'receive.edit_own' }, { leaf: 'receive.edit_all' }, { leaf: 'receive.delete' }] },
  { key: 'issue', children: [{ leaf: 'issue.view' }, { leaf: 'issue.post' }, { leaf: 'issue.dept_return' }, { leaf: 'issue.disposal' },
    { leaf: 'issue.edit_own' }, { leaf: 'issue.edit_all' }, { leaf: 'issue.delete' }] },
  { key: 'production', children: [{ leaf: 'production.view' }, { leaf: 'production.post' }, { leaf: 'production.edit' }] },
  { key: 'requests', children: [{ leaf: 'requests.view' }, { leaf: 'requests.create' }, { leaf: 'requests.fulfil' }] },
  { key: 'orders', children: [{ leaf: 'orders.create' }, { leaf: 'orders.receive' }] },
  { key: 'orderapprove', children: [{ leaf: 'orders.approve' }, { leaf: 'orders.route' }] },
  { key: 'trips', children: [{ leaf: 'trips.manage' }, { leaf: 'trips.drive' }] },
  { key: 'invoices', children: [{ leaf: 'invoices.manage' }] },
  { key: 'accounts', children: [
    { key: 'tab_acc_balances', children: [{ leaf: 'accounts.balances' }] },
    { key: 'tab_acc_statement', children: [{ leaf: 'accounts.statement' }] },
    { key: 'tab_acc_pay', children: [{ leaf: 'accounts.pay' }] },
    { key: 'tab_acc_lpo', children: [{ leaf: 'accounts.lpo' }] },
    { key: 'tab_acc_takings', children: [{ leaf: 'accounts.takings' }] },
    { key: 'tab_acc_sales', children: [{ leaf: 'accounts.sales' }, { leaf: 'accounts.salesApprove' }] },
    { key: 'tab_acc_opening', children: [{ leaf: 'accounts.opening' }, { leaf: 'accounts.start' }] }] },
  { key: 'returns', children: [{ leaf: 'returns.create' }, { leaf: 'returns.decide' }] },
  { key: 'shoporders', children: [{ leaf: 'shop.view' }, { leaf: 'shop.hand' }, { leaf: 'shop.unavailable' }, { leaf: 'shop.return' },
    { leaf: 'shop.shortage' }, { leaf: 'shop.special' }, { leaf: 'shop.depts' }] },
  { key: 'reports', children: [{ leaf: 'reports.view' }, { leaf: 'reports.charts' }].concat(REPORT_IDS.map(function (id) { return { leaf: 'report.' + id }; }))
},
  { key: 'lpo', children: [{ leaf: 'lpo.view' }, { leaf: 'lpo.create' }, { leaf: 'lpo.approve' }, { leaf: 'lpo.terms' },
    { leaf: 'cash.create' }, { leaf: 'cash.approve' }, { leaf: 'cash.handover' }] },
  { key: 'counts', children: [{ leaf: 'counts.view' }, { leaf: 'counts.open' }, { leaf: 'counts.save' }, { leaf: 'counts.approve' }, { leaf: 'counts.cancel' }] },
  { key: 'masters', children: [
    { key: 'tab_items', children: [{ leaf: 'items.view' }, { leaf: 'items.add' }, { leaf: 'items.rename' }, { leaf: 'items.min' },
      { leaf: 'items.packaging' }, { leaf: 'items.convert' }, { leaf: 'items.final_price' }] },
    { key: 'tab_parties', children: [{ leaf: 'parties.view' }, { leaf: 'parties.add' }, { leaf: 'parties.rename' }] },
    { key: 'tab_locations', children: [{ leaf: 'locations.view' }, { leaf: 'locations.add' }, { leaf: 'locations.rename' }] },
    { key: 'tab_units', children: [{ leaf: 'units.view' }, { leaf: 'units.add' }, { leaf: 'units.rename' }] },
    { key: 'tab_recipes', children: [{ leaf: 'recipes.view' }, { leaf: 'recipes.edit' }] }] },
  { key: 'coffee', children: [{ leaf: 'coffee.view' }, { leaf: 'coffee.pack' }] },
  { key: 'users', children: [{ leaf: 'users.manage' }] },
  { key: 'general', children: [{ leaf: 'prices.see' }] }
];

/** Leaf → the server actions and tokens it opens. */
var CAPS = (function () {
  var c = {
    // the general manager's screen: the business at a glance, read only
    'exec.view':         ['nav.exec', 'exec.summary', 'see_prices'],
    // the branch manager: their shops' orders, shifts, sales, returns (read), and a note on an order or a sales sheet
    'branches.view':     ['nav.branches', 'branches.summary'],
    'branches.note':     ['branches.note'],
    'dash.view':         ['nav.dashboard'],
    'dash.min':          ['nav.dashboard', 'items.save', 'min_stock'],
    // today's takings of the shops (money: for the admin, not the stores)
    'dash.takings':      ['nav.dashboard', 'dash.takings', 'see_prices'],
    'receive.view':      ['nav.receive'],
    'receive.save':      ['nav.receive', 'movements.save', 'kind.RECEIPT'],
    'receive.return':    ['nav.receive', 'movements.save', 'kind.SUPPLIER_RETURN'],
    'receive.edit_own':  ['movements.update', 'edit_own.receive'],
    'receive.edit_all':  ['movements.update', 'edit_own.receive', 'edit_all.receive'],
    'receive.delete':    ['movements.delete', 'delete.receive'],
    'issue.view':        ['nav.issue'],
    'issue.post':        ['nav.issue', 'movements.save', 'kind.ISSUE'],
    'issue.dept_return': ['nav.issue', 'movements.save', 'kind.DEPT_RETURN'],
    'issue.disposal':    ['nav.issue', 'movements.save', 'kind.DISPOSAL'],
    'shop.view':         ['nav.shoporders', 'shop.list'],
    // every department's lines (and the stores', to see): records for the departments (the production manager)
    'shop.depts':        ['nav.shoporders', 'shop.list', 'shop.depts', 'shop.hand', 'shop.unavailable', 'kind.ISSUE'],
    'orders.create':     ['nav.orders', 'orders.list', 'orders.save', 'orders.cancel', 'orders.shift', 'orders.shiftEnd'],
    'orders.approve':    ['nav.orderapprove', 'orders.list', 'orders.follow', 'orders.approve', 'orders.reject', 'orders.closeShort', 'orders.acceptDiff'],
    'orders.receive':    ['nav.orders', 'orders.list', 'orders.receive'],
    // special orders: the production manager reads them and sends each special line to a department (or purchasing)
    'orders.route':      ['nav.orderapprove', 'orders.list', 'orders.route', 'orders.reject'],
    'trips.manage':      ['nav.trips', 'trips.list', 'trips.drivers', 'trips.save', 'trips.cancel', 'orders.list'],
    'trips.drive':       ['nav.trips', 'trips.list', 'trips.load', 'trips.deliver'],
    'returns.create':    ['nav.returns', 'returns.list', 'returns.create'],
    'returns.decide':    ['nav.returns', 'returns.list', 'returns.decide'],
    // the accounts of the suppliers and shops: money, so prices are seen
    // one leaf per tab of the accounts screen
    // the opening balances of the suppliers and shops (the accountant), and the day the accounts start (the admin)
    'accounts.opening':  ['nav.accounts', 'accounts.openings', 'accounts.setOpening', 'see_prices'],
    'accounts.start':    ['nav.accounts', 'accounts.openings', 'accounts.setStart', 'see_prices'],
    'accounts.balances': ['nav.accounts', 'accounts.balances', 'see_prices'],
    'accounts.statement': ['nav.accounts', 'accounts.statement', 'see_prices'],
    'accounts.lpo':      ['nav.accounts', 'accounts.lpo', 'see_prices'],
    // the cash each cashier collected in a shift, received by the accountant
    // the daily sales sheet of each shop: the accountant writes and sends it, the admin approves it
    'accounts.sales':    ['nav.accounts', 'sales.list', 'sales.save', 'see_prices'],
    'accounts.salesApprove': ['nav.accounts', 'sales.list', 'sales.decide', 'see_prices'],
    'accounts.takings':  ['nav.accounts', 'shifts.list', 'shifts.receive', 'see_prices'],
    'accounts.pay':      ['nav.accounts', 'accounts.pay', 'accounts.void', 'see_prices'],
    'invoices.manage':   ['nav.invoices', 'invoices.list', 'invoices.get', 'invoices.create', 'orders.list'],
    'shop.hand':         ['nav.shoporders', 'shop.list', 'shop.hand', 'kind.ISSUE', 'trips.direct', 'trips.drivers'],
    'shop.unavailable':  ['shop.unavailable'],
    'shop.return':       ['shop.return', 'kind.DEPT_RETURN'],
    'shop.shortage':     ['nav.shoporders', 'shop.list', 'shop.shortage'],
    // purchasing also prepares the special lines sent to purchasing (bought ready-made)
    'shop.special':      ['nav.shoporders', 'shop.list', 'special.list', 'special.decide', 'shop.hand', 'shop.unavailable', 'shop.purchase'],
    'issue.edit_own':    ['movements.update', 'edit_own.issue'],
    'issue.edit_all':    ['movements.update', 'edit_own.issue', 'edit_all.issue'],
    'issue.delete':      ['movements.delete', 'delete.issue'],
    'production.view':   ['nav.production', 'production.preview'],
    'production.post':   ['nav.production', 'production.preview', 'production.post', 'kind.PROD_CONSUME', 'kind.PROD_OUTPUT'],
    'production.edit':   ['movements.update', 'movements.delete', 'edit_own.production', 'edit_all.production', 'delete.production'],
    'requests.view':     ['nav.requests'],
    'requests.create':   ['nav.requests', 'requests.create', 'requests.cancel', 'requests.followup'],
    'requests.fulfil':   ['nav.requests', 'requests.fulfil', 'requests.cancel', 'requests.all', 'requests.reject'],
    'reports.view':      ['nav.reports'],
    'reports.charts':    ['nav.reports', 'charts.view'],
    'lpo.view':          ['nav.lpo', 'lpo.list', 'lpo.get'],
    'lpo.create':        ['nav.lpo', 'lpo.list', 'lpo.get', 'lpo.save', 'lpo.delete'],
    'lpo.approve':       ['nav.lpo', 'lpo.list', 'lpo.get', 'lpo.decide'],
    'lpo.terms':         ['lpo.settings'],
    'cash.create':       ['nav.lpo', 'cash.list', 'cash.get', 'cash.save', 'cash.delete', 'cash.ledger'],
    'cash.approve':      ['nav.lpo', 'cash.list', 'cash.get', 'cash.decide', 'cash.ledger'],
    'cash.handover':     ['nav.lpo', 'cash.list', 'cash.get', 'cash.float', 'cash.ledger'],
    'counts.view':       ['nav.counts', 'counts.list', 'counts.get'],
    'counts.open':       ['nav.counts', 'counts.list', 'counts.get', 'counts.open'],
    'counts.save':       ['nav.counts', 'counts.list', 'counts.get', 'counts.save'],
    'counts.approve':    ['nav.counts', 'counts.list', 'counts.get', 'counts.approve', 'kind.ADJUST'],
    'counts.cancel':     ['counts.cancel'],
    'items.view':        ['nav.masters', 'tab.items'],
    'items.add':         ['items.save', 'add_items'],
    'items.rename':      ['items.save', 'rename.items', 'items.namesAr'],
    'items.min':         ['items.save', 'min_stock'],
    'items.packaging':   ['items.save', 'packaging'],
    'items.convert':     ['items.convertUnit'],
    'items.final_price': ['items.save', 'final_price', 'items.import', 'recipes.cost'],
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
    'coffee.view':       ['nav.coffee', 'coffee.list'],
    'coffee.pack':       ['nav.coffee', 'coffee.list', 'coffee.pack', 'kind.PROD_CONSUME', 'kind.PROD_OUTPUT', 'coffee.defaults'],
    'users.manage':      ['nav.users', 'users.list', 'users.save', 'audit.list', 'settings.idle', 'settings.close', 'sales.setChannels', 'orders.setFollowHours'],
    'prices.see':        ['see_prices']
  };
  // the fast-moving and sensitive reports each keep a personal list of items: their tick opens editing it
  REPORT_IDS.forEach(function (id) { c['report.' + id] = ['nav.reports', 'report.' + id].concat(id === 'fast' || id === 'sensitive' ? ['lists.save'] : [])
    .concat(ORDER_REPORTS.indexOf(id) >= 0 ? ['orders.report'] : []); });
  return c;
})();

/** Leaves split in several (lists saved before keep what they opened). */
var SPLIT_CAPS = { 'accounts.view': ['accounts.balances', 'accounts.statement', 'accounts.lpo'] };

/** The bundles used before the tree, read as leaves (lists saved in Users.caps stay valid). */
var OLD_CAPS = {
  receive: ['receive.view', 'receive.save', 'receive.return'],
  issue: ['issue.view', 'issue.post', 'issue.dept_return', 'issue.disposal'],
  shop_orders: ['shop.view', 'shop.hand', 'shop.unavailable', 'shop.return'],
  special: ['shop.special', 'shop.shortage'],
  production: ['production.view', 'production.post'],
  request_create: ['requests.view', 'requests.create'],
  request_fulfil: ['requests.view', 'requests.fulfil'],
  edit_own: ['receive.edit_own', 'issue.edit_own'],
  edit_all: ['receive.edit_all', 'issue.edit_all', 'production.edit'],
  delete: ['receive.delete', 'issue.delete'],
  masters: ['items.view', 'items.add', 'parties.view', 'parties.add', 'locations.view', 'locations.add', 'units.view', 'units.add'],
  min_stock: ['dash.view', 'dash.min', 'items.view', 'items.min'],
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
  // the accountant hands over the cash, not the admin (the admin can still be given it by hand)
  admin:       Object.keys(CAPS).filter(function (l) { return l !== 'cash.handover'; }),
  storekeeper: ['dash.view'].concat(leavesFromOld(['receive', 'issue', 'shop_orders', 'production', 'request_create', 'request_fulfil', 'edit_own', 'masters', 'see_prices', 'packaging', 'count'])).concat(['coffee.view', 'coffee.pack']),
  purchasing:  leavesFromOld(['receive', 'edit_own', 'masters', 'min_stock', 'lists', 'see_prices', 'special', 'packaging']).concat(['lpo.view', 'lpo.create', 'cash.create', 'coffee.view']),
  production:  ['dash.view'].concat(leavesFromOld(['request_create'])).concat(['shop.depts', 'production.view', 'production.post', 'returns.decide', 'orders.route']),
  // the shop's cashier writes and sends its orders; distribution approves them; a department head prepares
  // the lines of their department (Users.depts) and records what they make
  cashier:     ['orders.create', 'orders.receive', 'returns.create'],
  distribution: ['orders.approve', 'shop.view', 'trips.manage', 'invoices.manage', 'reports.view', 'report.orderTimes', 'report.receiptShort',
                 'report.unavailable', 'report.shopSales', 'prices.see'],
  driver:      ['trips.drive'],
  section_head: ['shop.view', 'shop.hand', 'shop.unavailable', 'production.view', 'production.post'],
  // the general manager: their screen only, nothing to change
  pdg:         ['exec.view'],
  // a manager of one or more branches (Users.branches): follows them, approves nothing
  branch_manager: ['branches.view', 'branches.note'],
  accountant:  ['lpo.view', 'cash.handover', 'accounts.balances', 'accounts.statement', 'accounts.lpo', 'accounts.pay', 'accounts.takings', 'accounts.sales', 'accounts.opening', 'reports.view', 'report.salesChannels', 'report.valuation', 'report.margin', 'report.losses', 'report.takings']
};

var Perm = {
  /** Leaves of a user row: its own list (old bundles read as leaves), or its role's template. */
  capsOf: function (u) {
    var own = String(u.caps || '').split(',').map(function (c) { return c.trim(); }).filter(String);
    // a leaf split in several since it was saved: read as all of them
    own = own.reduce(function (a, c) { return a.concat(SPLIT_CAPS[c] || [c]); }, []);
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
    // the cashier of a shop where a department works (Salwa): hands that department's lines to the driver
    if (u.role === 'cashier' && Shop.hostsDept(u.shop)) CAPS['shop.hand'].forEach(function (p) { set[p] = true; });
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
  },

  /**
   * Schema 26: the dashboard got its own tick (dash.view). Users with their own list of ticks who saw it
   * before (they worked with stock) get the tick, so nobody loses it; the others never had it.
   */
  addDashView: function () {
    var before = ['nav.receive', 'nav.issue', 'nav.production', 'nav.requests', 'nav.shoporders', 'nav.reports', 'nav.counts', 'nav.masters', 'min_stock'];
    Repo.setColumn('Users', 'caps', function (u) {
      var own = String(u.caps || '').trim();
      if (!own) return own;
      var caps = Perm.capsOf(u);
      if (caps.indexOf('dash.view') >= 0) return caps.join(',');
      var perms = Perm.permsOf(u);
      return before.some(function (p) { return perms.indexOf(p) >= 0; }) ? caps.concat(['dash.view']).join(',') : own;
    });
  }
};
