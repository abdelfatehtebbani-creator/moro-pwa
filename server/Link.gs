/**
 * Link.gs – the server-to-server link used by Masar (no user session).
 *
 * Masar calls the same web app URL with {"action": "link.…", "payload": {"key": "<secret>", …}}.
 * The secret is kept in Script Properties (LINK_SECRET) of both projects, never in code; the
 * sheet owner creates or replaces it from the MORO menu of the MORO Data spreadsheet.
 *
 *   link.catalog         every item with its store, unit, picture, shop price, "cashier may order", balance, reserved, available
 *   link.orders.push     add / update shop order lines (idempotent by order_item_id)
 *   link.orders.cancel   cancel lines (order cancelled or line removed in Masar)
 *   link.orders.status   lines and special requests changed since a time stamp (Masar polls this)
 *   link.special.push    a request to buy an item that is not in the catalogue
 */
var LINK_ROUTES = {
  'link.catalog':       function (p) { return Link.catalog(p); },
  'link.orders.push':   function (p) { return Shop.push(p.lines); },
  'link.orders.cancel': function (p) { return Shop.cancel(p.order_item_ids, p.reason); },
  'link.orders.status': function (p) { return Link.status(p); },
  'link.special.push':  function (p) { return Shop.pushSpecial(p); }
};

var Link = {
  secret: function () { return PropertiesService.getScriptProperties().getProperty('LINK_SECRET') || ''; },

  /** Constant-time comparison of the key sent with the stored secret. */
  check: function (key) {
    var s = Link.secret();
    var k = String(key || '');
    Util.require(s && k.length === s.length, 'link_denied');
    var diff = 0;
    for (var i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ k.charCodeAt(i);
    Util.require(diff === 0, 'link_denied');
  },

  /** Creates (or replaces) the secret. Run by the sheet owner from the MORO menu. */
  newSecret: function () {
    var s = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    PropertiesService.getScriptProperties().setProperty('LINK_SECRET', s);
    Audit.log('sheet-owner', 'link_secret_new', 'Settings', 'LINK_SECRET', null, null);
    return s;
  },

  catalog: function () {
    var reserved = Shop.reservedMap();
    var items = Repo.all('Items').map(function (i) {
      var qty = Shop.balance(i.item_id);
      var r = reserved[i.item_id] || 0;
      return { item_id: i.item_id, name: i.name, store: Stores.of(i), category: i.category, unit: i.unit, image: i.image,
        sale_price: i.sale_price === '' ? '' : Number(i.sale_price), shop_orderable: i.shop_orderable === true, active: i.active === true,
        qty: qty, reserved: r, available: Util.round(qty - r) };
    });
    return { items: items, version: Version.get(), at: Util.nowIso() };
  },

  /** p.since: ISO time of the last poll ('' = everything). */
  status: function (p) {
    var since = String((p && p.since) || '');
    var lines = Repo.all('ShopOrderLines').filter(function (l) { return !since || String(l.updated_at) >= since; }).map(Shop.view);
    var special = Repo.all('SpecialRequests').filter(function (r) { return !since || String(r.updated_at) >= since; });
    return { lines: lines, special: special, version: Version.get(), at: Util.nowIso() };
  }
};
