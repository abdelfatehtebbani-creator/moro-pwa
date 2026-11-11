// Trips (server/Trips.gs): distribution sends the orders ready for distribution with a driver, in the
// order of the stops; the driver confirms each stop: loaded, then delivered. From "loaded" an order is
// no longer changed. The cashier then receives it (the shop orders screen).
import { call } from '../api.js';
import { Outbox } from '../outbox.js';
import { Data } from '../data.js';
import { t, errText, fmtDateTime } from '../i18n.js';
import { h, toast, flash, fmtDate, fmtNum, trackFilled, dialog } from '../ui.js';
import { field, newId } from '../components.js';

const PILL = { preparing: 'soon', loaded: 'soon', in_transit: 'soon', completed: 'in', cancelled: 'out' };
let tab = 'open';
let cleanup = null;
let lastNew = null;            // the ready orders and drivers seen last time (the new-trip form opens at once)

export async function render(root) {
  if (cleanup) cleanup();
  const manage = Data.can('trips.save');
  const drive = Data.can('trips.load');
  const shopName = (id) => (Data.parties.get(id) || {}).name || id;
  const time = (iso) => (iso ? fmtDateTime(new Date(iso.length === 19 ? iso + '+03:00' : iso)) : '');
  const parts = [];

  // ---------- a new trip (distribution)
  const newBox = h('div');
  // orders put in a trip on this device and not sent yet are not offered again
  const inTrip = () => new Set(Outbox.queued('trips.save').flatMap((j) => j.payload.order_ids));
  async function drawNew(quiet) {
    // what was there last time, at once; then the server
    const cached = quiet !== true && !!lastNew;
    if (cached) build(lastNew.ready, lastNew.drivers);
    else if (quiet !== true) newBox.replaceChildren(h('p.empty', '…'));
    try {
      const [ready, drivers] = await Promise.all([call('orders.list', { status: 'ready' }), call('trips.drivers', {})]);
      const changed = !lastNew || JSON.stringify(lastNew) !== JSON.stringify({ ready, drivers });
      lastNew = { ready, drivers };
      // drawn again only when something changed (what was ticked meanwhile stays)
      if (changed || (!cached && quiet !== true)) build(ready, drivers);
    } catch (e) { if (!lastNew) newBox.replaceChildren(h('div.card', h('p.empty', errText(e)))); }
  }
  function build(readyAll, drivers) {
    const going = inTrip();
    // a branch's order (made in Salwa) is sent by the branch itself
    const ready = readyAll.filter((o) => !going.has(o.order_id) && !o.made_at);
    const chosen = [];           // order ids, in the order of the stops
    const list = h('div.trip-pick');
    const drawPick = () => list.replaceChildren(...(ready.length ? ready.map((o) => {
      const i = chosen.indexOf(o.order_id);
      const cb = h('input', { type: 'checkbox', checked: i >= 0 });
      cb.addEventListener('change', () => { const k = chosen.indexOf(o.order_id); if (cb.checked && k < 0) chosen.push(o.order_id); if (!cb.checked && k >= 0) chosen.splice(k, 1); drawPick(); });
      const atCustomer = o.kind === 'special' && o.place === 'customer';
      return h('label.check.trip-row', { class: o.kind === 'special' ? 'trip-special' : '' }, cb, h('b.num', i >= 0 ? String(i + 1) : ''),
        h('div.trip-row-main',
          h('div', o.kind === 'special' ? h('span.pill.low', t(atCustomer ? 'special_at_customer' : 'special_at_shop')) : null, ' ', h('bdi', shopName(o.shop_party_id)),
            h('small.muted', ' ' + o.order_no + ' · ' + t('lines_n', { n: o.lines.filter((l) => l.status !== 'removed').length }))),
          o.kind === 'special'
            ? h('small', '⏰ ', h('b.num', fmtDate(o.delivery_date) + ' ' + (o.delivery_time || '')),
              atCustomer ? h('span', ' · 👤 ', h('bdi', o.customer_name), ' · 📍 ', h('bdi', String(o.address || '').replace(/https?:\/\/\S+/, '').trim() || t('map_open'))) : '')
            : h('small.muted', t('order_for') + ' ' + fmtDate(o.delivery_date))));
    }) : [h('p.empty', t('no_ready_orders'))]));
    const driver = h('select.input#t-driver', h('option', { value: '' }, '—'), drivers.map((d) => h('option', { value: d.user_id }, d.name)));
    const note = trackFilled(h('input.input#t-note'));
    const create = async (e) => {
      if (!chosen.length) { flash(list); return; }
      if (!driver.value) { flash(driver); return; }
      const btn = e.currentTarget; btn.disabled = true;
      // queued and sent in the background (the client id makes a resend the same trip)
      try { await Outbox.add('trips.save', { driver_id: driver.value, order_ids: chosen.slice(), note: note.value, client_id: newId() }, t('trip_new')); toast(t('trip_created'), 'ok');
        build(lastNew ? lastNew.ready : readyAll, drivers); }
      catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
    };
    drawPick();
    newBox.replaceChildren(h('div.form-card', h('h3', t('trip_new')), h('small.muted', t('trip_new_help')),
      ready.some((o) => o.kind === 'special' && o.place === 'customer') ? h('small.muted', t('trip_special_help')) : null, list,
      h('div.form-grid', field(t('driver'), driver), field(t('note'), note, { wide: true })),
      drivers.length ? null : h('p.err-text', t('no_drivers')),
      going.size ? h('p.pill.soon', t('trips_sending', { n: Outbox.queued('trips.save').length })) : null,
      h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: create }, t('trip_create')))));
  }
  // ---------- the trips
  const listBox = h('div.req-list');
  const tabs = h('div.tabs');
  const keys = (manage ? ['new'] : []).concat(['open', 'all']);
  if (!keys.includes(tab)) tab = keys[0];
  keys.forEach((s) => tabs.append(h('button', { type: 'button', class: s === tab ? 'on' : '',
    onclick: (e) => { tab = s; [...tabs.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); show(); } }, t('trips_' + s))));
  parts.push(h('div.card', h('div.card-head', h('h2', t(drive && !manage ? 'my_trips' : 'trips')), tabs), newBox, listBox));
  function show() {
    newBox.hidden = tab !== 'new'; listBox.hidden = tab === 'new';
    if (tab === 'new') drawNew(); else loadList();
  }

  async function loadList(quiet) {
    if (tab === 'new') return;
    if (quiet !== true) listBox.replaceChildren(h('p.empty', '…'));
    try {
      const trips = await call('trips.list', tab === 'open' ? { open: true } : {});
      listBox.replaceChildren(...(trips.length ? trips.map(card) : [h('p.empty', t('no_rows'))]));
    } catch (e) { listBox.replaceChildren(h('p.empty', errText(e))); }
  }

  // the load: what was handed for these orders, item by item, for the driver to check against the car
  const itemName = (x) => Data.nameOf(Data.items.get(x.item_id) || { name: x.name, name_ar: x.name_ar });
  const oneTable = (rows) => h('table.table.trip-load', h('thead', h('tr', h('th', t('item')), h('th.num', t('qty')))),
    h('tbody', rows.length ? rows.map((x) => h('tr', h('td.wrap', h('bdi', itemName(x))), h('td.num', fmtNum(x.qty) + ' ' + (x.unit || ''))))
      : [h('tr', h('td', { colspan: 2 }, h('p.empty', t('load_empty'))))]));
  // what is picked up in a shop (a department working there) is listed apart, under the shop's name
  const loadTable = (rows) => {
    const places = [...new Set(rows.map((x) => x.pickup || ''))];
    if (places.length < 2 && !places[0]) return oneTable(rows);
    return h('div', places.sort().map((p) => [h('p.pickup', '📍 ', p ? t('pickup_at', { p: (Data.parties.get(p) || {}).name || p }) : t('pickup_factory')),
      oneTable(rows.filter((x) => (x.pickup || '') === p))]));
  };
  const toggle = (label, make) => {
    const box = h('div', { hidden: true });
    const btn = h('button.btn.secondary.small', { type: 'button', onclick: () => {
      box.hidden = !box.hidden;
      if (!box.hidden && !box.firstChild) box.append(make());
      btn.textContent = box.hidden ? label : t('load_hide');
    } }, label);
    return [btn, box];
  };
  const tripLoad = (trip) => {
    const sum = new Map();
    trip.stops.forEach((s) => (s.load || []).forEach((x) => {
      const k = x.item_id + '|' + x.unit + '|' + (x.pickup || '');
      const cur = sum.get(k) || Object.assign({}, x, { qty: 0 });
      cur.qty += x.qty; sum.set(k, cur);
    }));
    return loadTable([...sum.values()].sort((a, b) => itemName(a).localeCompare(itemName(b))));
  };

  // a step (loaded, delivered, trip cancelled) is queued and sent in the background; until then the stop says so
  let busy = 0;
  const act = async (action, payload) => { await Outbox.add(action, payload, payload.trip_id); setTimeout(() => loadList(true), 0); };
  const stepGoing = (tripId, orderId) => ['trips.load', 'trips.depart', 'trips.deliver', 'trips.cancel'].some((a) => Outbox.queued(a).some((j) => j.payload.trip_id === tripId && (!orderId || !j.payload.order_id || j.payload.order_id === orderId)));

  // the customer's address: a map link in it opens the map
  function mapText(text) {
    const m = String(text || '').match(/https?:\/\/\S+/);
    if (!m) return h('bdi', text || '');
    return h('span', h('bdi', text.replace(m[0], '').trim()), ' ', h('a', { href: m[0], target: '_blank', rel: 'noopener' }, t('map_open')));
  }

  function card(trip) {
    const driverName = (Data.userNames || {})[trip.driver_id] || trip.driver_id;
    // the trip left: the driver said so (a trip already on its way before this step existed: one stop delivered)
    const left = !!trip.departed_at || trip.stops.some((x) => x.delivered_at);
    const stops = trip.stops.map((s) => {
      const doStep = (step) => async (e) => {
        const btn = e.currentTarget;
        // a shop delivered before one earlier in the order of the stops: asked once more
        const before = step === 'deliver' ? trip.stops.find((x) => x.seq < s.seq && !x.delivered_at) : null;
        if (before) {
          const ok = await dialog((close) => [h('p', t('deliver_out_of_order', { n: before.seq, shop: shopName(before.shop_party_id) })),
            h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')),
              h('button.btn', { type: 'button', onclick: () => close(true) }, t('stop_deliver')))]);
          if (!ok) return;
        }
        btn.disabled = true;
        try { await act('trips.' + step, { trip_id: trip.trip_id, order_id: s.order_id }); toast(t(step === 'load' ? 'stop_loaded' : 'stop_delivered'), 'ok'); loadList(true); }
        catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
      };
      const button = stepGoing(trip.trip_id, s.order_id) ? h('span.pill.soon', t('sending')) : drive && trip.status !== 'cancelled' && trip.driver_id === Data.user.user_id
        ? (!s.loaded_at ? h('button.btn', { type: 'button', onclick: doStep('load') }, t('stop_load'))
          : !s.delivered_at ? (!trip.stops.every((x) => x.loaded_at) ? h('small.muted', t('deliver_after_all_loaded'))
            : !left ? h('small.muted', t('deliver_after_depart'))
            : h('button.btn.save-btn', { type: 'button', onclick: doStep('deliver') }, t('stop_deliver'))) : null) : null;
      const [showBtn, loadBox] = toggle(t('load_show'), () => loadTable(s.load || []));
      return h('div', h('div.trip-stop', h('b.num', String(s.seq)), h('div.trip-stop-main', h('b', h('bdi', shopName(s.shop_party_id))),
        h('small.muted', s.order_no + ' · ' + t('lines_n', { n: s.lines })),
        s.kind === 'special' ? h('small', h('span.pill.soon', t('order_kind_special')), ' ⏰ ', h('span.num', fmtDate(s.delivery_date) + ' ' + (s.delivery_time || ''))) : null,
        s.place === 'customer' ? h('small', '👤 ', h('bdi', s.customer_name), ' · ', h('a', { href: 'tel:' + s.customer_phone }, s.customer_phone)) : null,
        s.place === 'customer' ? h('small', '📍 ', mapText(s.address)) : null,
        s.loaded_at ? h('small', '✓ ' + t('stop_loaded') + ' ' + time(s.loaded_at)) : null,
        s.delivered_at ? h('small', '✓ ' + t('stop_delivered') + ' ' + time(s.delivered_at)) : null), showBtn, button), loadBox);
    });
    // leaving: the whole trip loaded, the driver writes the vehicle and the temperature of the products (the dispatching record)
    let departBox = null;
    const mine = drive && trip.status !== 'cancelled' && trip.driver_id === Data.user.user_id;
    if (mine && !left && trip.stops.length && trip.stops.every((x) => x.loaded_at)) {
      if (stepGoing(trip.trip_id)) departBox = h('p', h('span.pill.soon', t('sending')));
      else {
        const vehicle = trackFilled(h('input.input', { type: 'text', maxlength: 30, value: trip.vehicle || trip.vehicle_hint || '', autocapitalize: 'characters' }));
        const temp = trackFilled(h('input.input.num', { type: 'number', step: '0.1', inputmode: 'decimal' }));
        departBox = h('div.form-card.trip-depart', h('div', h('b', t('trip_depart_title'))), h('small.muted', t('trip_depart_help')),
          h('div.form-grid', field(t('vehicle_no'), vehicle), field(t('temp_c'), temp)),
          h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: async (e) => {
            if (!vehicle.value.trim()) { flash(vehicle); return; }
            if (temp.value === '' || !isFinite(Number(temp.value))) { flash(temp); return; }
            const btn = e.currentTarget; btn.disabled = true;
            try { await act('trips.depart', { trip_id: trip.trip_id, vehicle: vehicle.value.trim(), temp: Number(temp.value) }); toast(t('trip_departed'), 'ok'); loadList(true); }
            catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
          } }, t('trip_depart'))));
      }
    }
    const leftLine = trip.departed_at ? h('small.trip-left', '🚚 ' + t('trip_departed_at', { t: time(trip.departed_at) }),
      trip.vehicle ? ' · ' + t('vehicle_no') + ': ' : '', trip.vehicle ? h('bdi', trip.vehicle) : '', trip.temp !== '' && trip.temp !== undefined ? ' · 🌡 ' + fmtNum(trip.temp) + '°' : '') : null;
    const actions = h('div.form-actions');
    const [allBtn, allBox] = toggle(t('load_all'), () => tripLoad(trip));
    if (trip.stops.length > 1) actions.append(allBtn);
    if (manage && trip.status === 'preparing' && !trip.stops.some((s) => s.loaded_at)) {
      actions.append(h('button.btn.secondary', { type: 'button', onclick: async () => {
        try { await act('trips.cancel', { trip_id: trip.trip_id }); toast(t('trip_cancelled'), 'ok'); } catch (e) { toast(errText(e), 'err'); }
      } }, t('trip_cancel')));
    }
    return h('div.req-card', h('div.card-head', h('b', trip.trip_id), h('span', '🚚 ', h('bdi', driverName)), h('span.muted.num', fmtDate(String(trip.created_at).slice(0, 10))),
      h('span', { class: 'pill ' + (PILL[trip.status] || '') }, t('trip_st_' + trip.status))), trip.note ? h('p.muted', trip.note) : null, leftLine, ...stops, departBox, actions, allBox);
  }

  root.replaceChildren(...parts);
  show();
  const timer = setInterval(() => { if (!busy && document.visibilityState === 'visible') loadList(true); }, 20000);
  // a step or a trip sent (or refused): the lists follow
  const onOutbox = () => { if (tab === 'new') drawNew(true); else loadList(true); };
  window.addEventListener('moro:outbox', onOutbox);
  cleanup = () => { clearInterval(timer); window.removeEventListener('moro:outbox', onOutbox); cleanup = null; };
}

export function dispose() { if (cleanup) cleanup(); }
