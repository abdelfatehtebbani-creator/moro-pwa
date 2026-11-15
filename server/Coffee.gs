/**
 * Coffee.gs – coffee bags prepared in-house. Green coffee (one or two origins) is roasted and packed
 * into bags; the storekeeper enters what really happened: the green coffee taken, the roasted weight
 * (optional) and the bags filled. The stock moves like a production (PROD_CONSUME for the green coffee,
 * PROD_OUTPUT for the bags), and the batch keeps the real roasting loss and packing waste so they can be
 * compared with the calculator. One empty pouch is taken for every bag filled. The bags leave the stock
 * from the issue screen, like any item.
 */
var Coffee = {
  bagName: function (grams) { return 'COFFEE BAG ' + grams + 'G'; },

  /**
   * Stock units of the pouch item taken by one filled bag: 1 when it is counted in pieces; else its
   * packaging unit PC/PCS ("1 BOX = 2500 PC"); else the pieces in its name ("Coffee Pouch 2500pcs/box").
   */
  pouchFactor: function (item) {
    var unit = String(item.unit || '').toUpperCase();
    if (unit === 'PC' || unit === 'PCS') return 1;
    var f = Packs.factor(item, 'PC') || Packs.factor(item, 'PCS');
    if (f) return f;
    var m = String(item.name || '').match(/(\d+)\s*pcs?\b/i);
    return m && Number(m[1]) > 0 ? 1 / Number(m[1]) : null;
  },


  /** p: {client_id, date, green: [{item_id, qty}], roasted, bags, bag_g, pouch_item, note} */
  pack: function (session, p) {
    Util.require(Util.isDate(String(p.date || '')), 'date_invalid');
    var bags = Util.num(p.bags), grams = Util.num(p.bag_g) || 200;
    Util.require(bags > 0 && Math.round(bags) === bags, 'qty_invalid');
    Util.require(grams > 0, 'qty_invalid');
    var green = (p.green || []).filter(function (x) { return x && x.item_id && Util.num(x.qty) > 0; }).map(function (x) {
      var item = Repo.find('Items', 'item_id', String(x.item_id));
      Util.require(item, 'not_found', x.item_id);
      return { item: item, qty: Util.round(Util.num(x.qty)) };
    });
    Util.require(green.length, 'coffee_no_green');
    var greenKg = Util.round(green.reduce(function (s, x) { return s + x.qty; }, 0));
    var packedKg = Util.round(bags * grams / 1000);
    Util.require(packedKg <= greenKg, 'coffee_more_than_green');
    var roasted = p.roasted === '' || p.roasted === null || p.roasted === undefined ? null : Util.num(p.roasted);
    if (roasted !== null) {
      Util.require(roasted > 0 && roasted <= greenKg, 'coffee_roasted_invalid');
      Util.require(packedKg <= roasted, 'coffee_more_than_roasted');
    }
    var pouch = null;
    if (p.pouch_item) {
      var pItem = Repo.find('Items', 'item_id', String(p.pouch_item));
      Util.require(pItem, 'not_found', p.pouch_item);
      var factor = Coffee.pouchFactor(pItem);
      Util.require(factor, 'coffee_pouch_unit', pItem.name);
      pouch = { item: pItem, qty: Util.round(bags * factor) };
    }
    var cid = Util.clean(p.client_id) || Utilities.getUuid();
    var done = Repo.find('CoffeeBatches', 'batch_id', cid);
    if (done) return { batch_id: cid, duplicate: true, version: Version.get() };

    var setup = withLock(function () {
      return { consume: Production.partyId('Coffee roasting'), output: Production.partyId('Coffee bags'),
               item: Production.productItem(Coffee.bagName(grams), 'BAG') };
    });
    var doc = 'CF-' + p.date.replace(/-/g, '').slice(2);
    var purpose = Coffee.bagName(grams);
    var movs = green.map(function (x, i) {
      return { client_id: cid + '-g' + i, kind: 'PROD_CONSUME', date: p.date, party_id: setup.consume, item_id: x.item.item_id,
               qty: x.qty, unit: x.item.unit, doc_no: doc, purpose: purpose };
    });
    if (pouch) movs.push({ client_id: cid + '-p', kind: 'PROD_CONSUME', date: p.date, party_id: setup.consume, item_id: pouch.item.item_id,
      qty: pouch.qty, unit: pouch.item.unit, doc_no: doc, purpose: purpose });
    movs.push({ client_id: cid + '-b', kind: 'PROD_OUTPUT', date: p.date, party_id: setup.output, item_id: setup.item.item_id,
                qty: bags, unit: setup.item.unit, doc_no: doc, purpose: purpose });
    Movements.save(session, { movements: movs }, ['PROD_CONSUME', 'PROD_OUTPUT']);

    return withLock(function () {
      if (Repo.find('CoffeeBatches', 'batch_id', cid)) return { batch_id: cid, duplicate: true, version: Version.get() };
      var row = { batch_id: cid, date: p.date, green: green.map(function (x) { return x.item.item_id + ':' + x.qty; }).join(';'),
        green_kg: greenKg, roasted_kg: roasted === null ? '' : Util.round(roasted), bags: bags, bag_g: grams, bag_item: setup.item.item_id,
        packed_kg: packedKg, pouch: pouch ? pouch.item.item_id + ':' + pouch.qty : '', note: Util.clean(p.note), created_by: session.user_id, created_at: Util.nowIso() };
      Repo.append('CoffeeBatches', [row]);
      Audit.log(session.user_id, 'coffee_pack', 'CoffeeBatches', cid, null, row);
      return { batch_id: cid, bag_item: setup.item.item_id, version: Version.bump() };
    });
  },

  // ---------- in three steps, on their own days: green coffee taken for roasting → roasted ground coffee in → bags packed
  GROUND_NAME: 'COFFEE POWDER FOR PACKAGING',

  /** The roasted ground coffee waiting to be packed (an item of the stock), made if it is not there. */
  groundItem: function () {
    var it = Repo.all('Items').filter(function (i) { return Util.key(i.name) === Coffee.GROUND_NAME; })[0];
    if (it && !String(it.unit || '').trim()) {
      // an item written with no unit: it is weighed in KG from now on
      withLock(function () { Repo.update('Items', 'item_id', it.item_id, { unit: 'KG' }); });
      Audit.log('system', 'item_unit_set', 'Items', it.item_id, { unit: '' }, { unit: 'KG' });
      it = Repo.find('Items', 'item_id', it.item_id);
    }
    return it || withLock(function () { return Production.productItem('Coffee Powder For Packaging', 'KG'); });
  },
  /** kg of ground coffee in the item's own stock unit. */
  groundQty: function (item, kg) {
    var unit = String(item.unit || '').toUpperCase();
    if (unit === 'KG') return Util.round(kg);
    if (unit === 'G' || unit === 'GR' || unit === 'GM') return Util.round(kg * 1000);
    var f = Packs.factor(item, 'KG');
    Util.require(f, 'coffee_ground_unit', item.name);
    return Util.round(kg * f);
  },

  greenOf: function (list) {
    var green = (list || []).filter(function (x) { return x && x.item_id && Util.num(x.qty) > 0; }).map(function (x) {
      var item = Repo.find('Items', 'item_id', String(x.item_id));
      Util.require(item, 'not_found', x.item_id);
      return { item: item, qty: Util.round(Util.num(x.qty)) };
    });
    Util.require(green.length, 'coffee_no_green');
    return green;
  },

  /** Step 1: the green coffee taken from the store for roasting. p: {client_id, date, green: [{item_id, qty}], note}. Opens a roast. */
  roastStart: function (session, p) {
    Util.require(Util.isDate(String(p.date || '')), 'date_invalid');
    var green = Coffee.greenOf(p.green);
    var cid = Util.clean(p.client_id) || Utilities.getUuid();
    if (Repo.find('CoffeeRoasts', 'roast_id', cid)) return { roast_id: cid, duplicate: true, version: Version.get() };
    var party = withLock(function () { return Production.partyId('Coffee roasting'); });
    var doc = 'CR-' + p.date.replace(/-/g, '').slice(2);
    Movements.save(session, { movements: green.map(function (x, i) {
      return { client_id: cid + '-g' + i, kind: 'PROD_CONSUME', date: p.date, party_id: party, item_id: x.item.item_id, qty: x.qty, unit: x.item.unit,
               doc_no: doc, purpose: 'Coffee roasting' };
    }) }, ['PROD_CONSUME']);
    return withLock(function () {
      if (Repo.find('CoffeeRoasts', 'roast_id', cid)) return { roast_id: cid, duplicate: true, version: Version.get() };
      var row = { roast_id: cid, date_out: p.date, green: green.map(function (x) { return x.item.item_id + ':' + x.qty; }).join(';'),
        green_kg: Util.round(green.reduce(function (s, x) { return s + x.qty; }, 0)), status: 'roasting', date_in: '', ground_kg: '',
        note: Util.clean(p.note), by_out: session.user_id, at_out: Util.nowIso(), by_in: '', at_in: '' };
      Repo.append('CoffeeRoasts', [row]);
      Audit.log(session.user_id, 'coffee_roast_start', 'CoffeeRoasts', cid, null, row);
      return { roast_id: cid, version: Version.bump() };
    });
  },

  /** Step 2: what came out of roasting and grinding goes in as ground coffee. p: {roast_id, date, ground_kg}. Closes the roast. */
  roastFinish: function (session, p) {
    Util.require(Util.isDate(String(p.date || '')), 'date_invalid');
    var r = Repo.find('CoffeeRoasts', 'roast_id', String(p.roast_id || ''));
    Util.require(r, 'not_found');
    if (r.status === 'done') return { roast_id: r.roast_id, duplicate: true, version: Version.get() };
    var kg = Util.num(p.ground_kg);
    Util.require(kg > 0 && kg <= Number(r.green_kg), 'coffee_roasted_invalid');
    Util.require(String(p.date) >= String(r.date_out), 'date_invalid');
    var ground = Coffee.groundItem();
    var party = withLock(function () { return Production.partyId('Coffee roasting'); });
    Movements.save(session, { movements: [{ client_id: r.roast_id + '-in', kind: 'PROD_OUTPUT', date: p.date, party_id: party, item_id: ground.item_id,
      qty: Coffee.groundQty(ground, kg), unit: ground.unit, doc_no: 'CR-' + String(p.date).replace(/-/g, '').slice(2), purpose: 'Coffee roasting' }] }, ['PROD_OUTPUT']);
    return withLock(function () {
      Repo.update('CoffeeRoasts', 'roast_id', r.roast_id, { status: 'done', date_in: p.date, ground_kg: Util.round(kg), by_in: session.user_id, at_in: Util.nowIso() });
      Audit.log(session.user_id, 'coffee_roast_finish', 'CoffeeRoasts', r.roast_id, null, { ground_kg: kg });
      return { roast_id: r.roast_id, loss_pct: Util.round((Number(r.green_kg) - kg) / Number(r.green_kg) * 100), version: Version.bump() };
    });
  },

  /**
   * Step 3: bags packed from the ground coffee in the stock. p: {client_id, date, bags, bag_g, ground_kg (used, with the waste;
   * the bags' weight when not given), pouch_item, note}.
   */
  packBags: function (session, p) {
    Util.require(Util.isDate(String(p.date || '')), 'date_invalid');
    var bags = Util.num(p.bags), grams = Util.num(p.bag_g) || 200;
    Util.require(bags > 0 && Math.round(bags) === bags && grams > 0, 'qty_invalid');
    var packedKg = Util.round(bags * grams / 1000);
    var usedKg = p.ground_kg === '' || p.ground_kg === null || p.ground_kg === undefined ? packedKg : Util.num(p.ground_kg);
    Util.require(usedKg >= packedKg, 'coffee_more_than_roasted');
    var cid = Util.clean(p.client_id) || Utilities.getUuid();
    if (Repo.find('CoffeeBatches', 'batch_id', cid)) return { batch_id: cid, duplicate: true, version: Version.get() };
    var ground = Coffee.groundItem();
    var pouch = null;
    if (p.pouch_item) {
      var pItem = Repo.find('Items', 'item_id', String(p.pouch_item));
      Util.require(pItem, 'not_found', p.pouch_item);
      var factor = Coffee.pouchFactor(pItem);
      Util.require(factor, 'coffee_pouch_unit', pItem.name);
      pouch = { item: pItem, qty: Util.round(bags * factor) };
    }
    var setup = withLock(function () {
      return { consume: Production.partyId('Coffee roasting'), output: Production.partyId('Coffee bags'), item: Production.productItem(Coffee.bagName(grams), 'BAG') };
    });
    var doc = 'CF-' + p.date.replace(/-/g, '').slice(2), purpose = Coffee.bagName(grams);
    var movs = [{ client_id: cid + '-g', kind: 'PROD_CONSUME', date: p.date, party_id: setup.consume, item_id: ground.item_id,
                  qty: Coffee.groundQty(ground, usedKg), unit: ground.unit, doc_no: doc, purpose: purpose }];
    if (pouch) movs.push({ client_id: cid + '-p', kind: 'PROD_CONSUME', date: p.date, party_id: setup.consume, item_id: pouch.item.item_id,
      qty: pouch.qty, unit: pouch.item.unit, doc_no: doc, purpose: purpose });
    movs.push({ client_id: cid + '-b', kind: 'PROD_OUTPUT', date: p.date, party_id: setup.output, item_id: setup.item.item_id, qty: bags, unit: setup.item.unit,
                doc_no: doc, purpose: purpose });
    Movements.save(session, { movements: movs }, ['PROD_CONSUME', 'PROD_OUTPUT']);
    return withLock(function () {
      if (Repo.find('CoffeeBatches', 'batch_id', cid)) return { batch_id: cid, duplicate: true, version: Version.get() };
      var row = { batch_id: cid, date: p.date, green: '', green_kg: '', roasted_kg: '', bags: bags, bag_g: grams, bag_item: setup.item.item_id,
        packed_kg: packedKg, pouch: pouch ? pouch.item.item_id + ':' + pouch.qty : '', note: Util.clean(p.note), created_by: session.user_id,
        created_at: Util.nowIso(), mode: 'pack', ground_kg: Util.round(usedKg) };
      Repo.append('CoffeeBatches', [row]);
      Audit.log(session.user_id, 'coffee_pack_bags', 'CoffeeBatches', cid, null, row);
      return { batch_id: cid, bag_item: setup.item.item_id, version: Version.bump() };
    });
  },

  /** The batches (newest first) with their real loss and waste, and the bags given out (issues). */
  /**
   * The calculator's default values for every device (Settings.coffee_calc_defaults):
   * {count, weight (g), waste (g per bag), loss (% roast loss), ratio (% of the first origin)}.
   */
  saveDefaults: function (session, p) {
    var d = {};
    var lim = { count: [0, 100000], weight: [1, 100000], waste: [0, 10000], loss: [0, 99], ratio: [0, 100] };
    Object.keys(lim).forEach(function (f) {
      var v = Util.num(p[f]);
      Util.require(v !== null && v >= lim[f][0] && v <= lim[f][1], 'coffee_default_invalid', f);
      d[f] = v;
    });
    return withLock(function () {
      var before = Settings.get('coffee_calc_defaults', '');
      Settings.set('coffee_calc_defaults', JSON.stringify(d));
      Audit.log(session.user_id, 'coffee_defaults', 'Settings', 'coffee_calc_defaults', before, d);
      return { defaults: d, version: Version.bump() };
    });
  },

  list: function (session) {
    var batches = Repo.all('CoffeeBatches').sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); })
      .slice(0, 60).map(Coffee.figures);
    var bagIds = {};
    Repo.all('Items').forEach(function (i) { if (String(i.name).indexOf('COFFEE BAG ') === 0) bagIds[i.item_id] = true; });
    var parties = {};
    Repo.all('Parties').forEach(function (x) { parties[x.party_id] = x.name; });
    var out = Repo.all('Movements').filter(function (m) { return bagIds[m.item_id] && m.kind === 'ISSUE'; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 60)
      .map(function (m) { return { date: m.date, item_id: m.item_id, party: parties[m.party_id] || m.party_id, qty: Math.abs(Number(m.qty)), doc_no: m.doc_no }; });
    var roasts = Repo.all('CoffeeRoasts').sort(function (a, b) { return String(b.at_out).localeCompare(String(a.at_out)); }).slice(0, 60).map(function (r) {
      var g = Number(r.green_kg) || 0, k = r.ground_kg === '' ? null : Number(r.ground_kg);
      return { roast_id: r.roast_id, date_out: r.date_out, date_in: r.date_in, status: r.status, green_kg: g, ground_kg: k, note: r.note,
               green: String(r.green || '').split(';').filter(String).map(function (s) { var x = s.split(':'); return { item_id: x[0], qty: Number(x[1]) }; }),
               by_out: r.by_out, by_in: r.by_in, loss_pct: k !== null && g ? Util.round((g - k) / g * 100) : null };
    });
    var ground = Repo.all('Items').filter(function (i) { return Util.key(i.name) === Coffee.GROUND_NAME; })[0];
    return { batches: batches, out: out, bag_items: Object.keys(bagIds), roasts: roasts, ground_item: ground ? ground.item_id : '' };
  },

  /** Real figures of a batch: total loss %, roasting loss % and waste per bag (g) when the roasted weight is known. */
  figures: function (b) {
    var green = Number(b.green_kg) || 0, packed = Number(b.packed_kg) || 0, bags = Number(b.bags) || 0;
    var roasted = b.roasted_kg === '' || b.roasted_kg === null ? null : Number(b.roasted_kg);
    return { batch_id: b.batch_id, date: b.date, green: String(b.green || '').split(';').filter(String).map(function (s) {
        var k = s.split(':'); return { item_id: k[0], qty: Number(k[1]) };
      }),
      green_kg: green, roasted_kg: roasted, bags: bags, bag_g: Number(b.bag_g), bag_item: b.bag_item, packed_kg: packed, note: b.note,
      created_by: b.created_by, created_at: b.created_at, mode: b.mode || '', ground_kg: b.ground_kg === '' || b.ground_kg === undefined ? null : Number(b.ground_kg),
      loss_pct: green ? Util.round((green - packed) / green * 100) : 0,
      roast_loss_pct: roasted !== null && green ? Util.round((green - roasted) / green * 100) : null,
      waste_g: roasted !== null && bags ? Util.round((roasted - packed) * 1000 / bags) : null };
  }
};
