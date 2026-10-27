/**
 * Coffee.gs – coffee bags prepared in-house. Green coffee (one or two origins) is roasted and packed
 * into bags; the storekeeper enters what really happened: the green coffee taken, the roasted weight
 * (optional) and the bags filled. The stock moves like a production (PROD_CONSUME for the green coffee,
 * PROD_OUTPUT for the bags), and the batch keeps the real roasting loss and packing waste so they can be
 * compared with the calculator. The bags leave the stock from the issue screen, like any item.
 */
var Coffee = {
  bagName: function (grams) { return 'COFFEE BAG ' + grams + 'G'; },

  /** p: {client_id, date, green: [{item_id, qty}], roasted, bags, bag_g, note} */
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
    movs.push({ client_id: cid + '-b', kind: 'PROD_OUTPUT', date: p.date, party_id: setup.output, item_id: setup.item.item_id,
                qty: bags, unit: setup.item.unit, doc_no: doc, purpose: purpose });
    Movements.save(session, { movements: movs }, ['PROD_CONSUME', 'PROD_OUTPUT']);

    return withLock(function () {
      if (Repo.find('CoffeeBatches', 'batch_id', cid)) return { batch_id: cid, duplicate: true, version: Version.get() };
      var row = { batch_id: cid, date: p.date, green: green.map(function (x) { return x.item.item_id + ':' + x.qty; }).join(';'),
        green_kg: greenKg, roasted_kg: roasted === null ? '' : Util.round(roasted), bags: bags, bag_g: grams, bag_item: setup.item.item_id,
        packed_kg: packedKg, note: Util.clean(p.note), created_by: session.user_id, created_at: Util.nowIso() };
      Repo.append('CoffeeBatches', [row]);
      Audit.log(session.user_id, 'coffee_pack', 'CoffeeBatches', cid, null, row);
      return { batch_id: cid, bag_item: setup.item.item_id, version: Version.bump() };
    });
  },

  /** The batches (newest first) with their real loss and waste, and the bags given out (issues). */
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
    return { batches: batches, out: out, bag_items: Object.keys(bagIds) };
  },

  /** Real figures of a batch: total loss %, roasting loss % and waste per bag (g) when the roasted weight is known. */
  figures: function (b) {
    var green = Number(b.green_kg) || 0, packed = Number(b.packed_kg) || 0, bags = Number(b.bags) || 0;
    var roasted = b.roasted_kg === '' || b.roasted_kg === null ? null : Number(b.roasted_kg);
    return { batch_id: b.batch_id, date: b.date, green: String(b.green || '').split(';').filter(String).map(function (s) {
        var k = s.split(':'); return { item_id: k[0], qty: Number(k[1]) };
      }),
      green_kg: green, roasted_kg: roasted, bags: bags, bag_g: Number(b.bag_g), bag_item: b.bag_item, packed_kg: packed, note: b.note,
      created_by: b.created_by, created_at: b.created_at,
      loss_pct: green ? Util.round((green - packed) / green * 100) : 0,
      roast_loss_pct: roasted !== null && green ? Util.round((green - roasted) / green * 100) : null,
      waste_g: roasted !== null && bags ? Util.round((roasted - packed) * 1000 / bags) : null };
  }
};
