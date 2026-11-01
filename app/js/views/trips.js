// Trips (server/Trips.gs): distribution sends the orders ready for distribution with a driver, in the
// order of the stops; the driver confirms each stop: loaded, then delivered. From "loaded" an order is
// no longer changed. The cashier then receives it (the shop orders screen).
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText, fmtDateTime } from '../i18n.js';
import { h, toast, flash, fmtDate, trackFilled } from '../ui.js';
import { field } from '../components.js';

const PILL = { preparing: 'soon', loaded: 'soon', in_transit: 'soon', completed: 'in', cancelled: 'out' };
let tab = 'open';
let cleanup = null;

export async function render(root) {
  if (cleanup) cleanup();
  const manage = Data.can('trips.save');
  const drive = Data.can('trips.load');
  const shopName = (id) => (Data.parties.get(id) || {}).name || id;
  const time = (iso) => (iso ? fmtDateTime(new Date(iso.length === 19 ? iso + '+03:00' : iso)) : '');
  const parts = [];

  // ---------- a new trip (distribution)
  const newBox = h('div');
  async function drawNew() {
    let ready = [], drivers = [];
    try { [ready, drivers] = await Promise.all([call('orders.list', { status: 'ready' }), call('trips.drivers', {})]); }
    catch (e) { newBox.replaceChildren(h('div.card', h('p.empty', errText(e)))); return; }
    const chosen = [];           // order ids, in the order of the stops
    const list = h('div.trip-pick');
    const drawPick = () => list.replaceChildren(...(ready.length ? ready.map((o) => {
      const i = chosen.indexOf(o.order_id);
      const cb = h('input', { type: 'checkbox', checked: i >= 0 });
      cb.addEventListener('change', () => { const k = chosen.indexOf(o.order_id); if (cb.checked && k < 0) chosen.push(o.order_id); if (!cb.checked && k >= 0) chosen.splice(k, 1); drawPick(); });
      return h('label.check.trip-row', cb, h('b.num', i >= 0 ? String(i + 1) : ''), ' ', h('bdi', shopName(o.shop_party_id)),
        h('small.muted', ' ' + o.order_no + ' · ' + t('order_for') + ' ' + fmtDate(o.delivery_date) + ' · ' + t('lines_n', { n: o.lines.filter((l) => l.status !== 'removed').length })));
    }) : [h('p.empty', t('no_ready_orders'))]));
    const driver = h('select.input#t-driver', h('option', { value: '' }, '—'), drivers.map((d) => h('option', { value: d.user_id }, d.name)));
    const note = trackFilled(h('input.input#t-note'));
    const create = async (e) => {
      if (!chosen.length) { flash(list); return; }
      if (!driver.value) { flash(driver); return; }
      const btn = e.currentTarget; btn.disabled = true;
      try { await call('trips.save', { driver_id: driver.value, order_ids: chosen, note: note.value }); toast(t('trip_created'), 'ok'); drawNew(); loadList(); }
      catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
    };
    drawPick();
    newBox.replaceChildren(h('div.card.form-card', h('h2', t('trip_new')), h('small.muted', t('trip_new_help')), list,
      h('div.form-grid', field(t('driver'), driver), field(t('note'), note, { wide: true })),
      drivers.length ? null : h('p.err-text', t('no_drivers')),
      h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: create }, t('trip_create')))));
  }
  if (manage) { parts.push(newBox); drawNew(); }

  // ---------- the trips
  const listBox = h('div.req-list');
  const tabs = h('div.tabs');
  ['open', 'all'].forEach((s) => tabs.append(h('button', { type: 'button', class: s === tab ? 'on' : '',
    onclick: (e) => { tab = s; [...tabs.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); loadList(); } }, t('trips_' + s))));
  parts.push(h('div.card', h('div.card-head', h('h2', t(drive && !manage ? 'my_trips' : 'trips')), tabs), listBox));

  async function loadList(quiet) {
    if (quiet !== true) listBox.replaceChildren(h('p.empty', '…'));
    try {
      const trips = await call('trips.list', tab === 'open' ? { open: true } : {});
      listBox.replaceChildren(...(trips.length ? trips.map(card) : [h('p.empty', t('no_rows'))]));
    } catch (e) { listBox.replaceChildren(h('p.empty', errText(e))); }
  }

  function card(trip) {
    const driverName = (Data.userNames || {})[trip.driver_id] || trip.driver_id;
    const stops = trip.stops.map((s) => {
      const act = (step) => async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        try { await call('trips.' + step, { trip_id: trip.trip_id, order_id: s.order_id }); toast(t(step === 'load' ? 'stop_loaded' : 'stop_delivered'), 'ok'); loadList(true); }
        catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
      };
      const button = drive && trip.status !== 'cancelled' && trip.driver_id === Data.user.user_id
        ? (!s.loaded_at ? h('button.btn', { type: 'button', onclick: act('load') }, t('stop_load'))
          : !s.delivered_at ? h('button.btn.save-btn', { type: 'button', onclick: act('deliver') }, t('stop_deliver')) : null) : null;
      return h('div.trip-stop', h('b.num', String(s.seq)), h('div.trip-stop-main', h('b', h('bdi', shopName(s.shop_party_id))),
        h('small.muted', s.order_no + ' · ' + t('lines_n', { n: s.lines })),
        s.loaded_at ? h('small', '✓ ' + t('stop_loaded') + ' ' + time(s.loaded_at)) : null,
        s.delivered_at ? h('small', '✓ ' + t('stop_delivered') + ' ' + time(s.delivered_at)) : null), button);
    });
    const actions = h('div.form-actions');
    if (manage && trip.status === 'preparing' && !trip.stops.some((s) => s.loaded_at)) {
      actions.append(h('button.btn.secondary', { type: 'button', onclick: async () => {
        try { await call('trips.cancel', { trip_id: trip.trip_id }); toast(t('trip_cancelled'), 'ok'); drawNew(); loadList(); } catch (e) { toast(errText(e), 'err'); }
      } }, t('trip_cancel')));
    }
    return h('div.req-card', h('div.card-head', h('b', trip.trip_id), h('span', '🚚 ', h('bdi', driverName)), h('span.muted.num', fmtDate(String(trip.created_at).slice(0, 10))),
      h('span', { class: 'pill ' + (PILL[trip.status] || '') }, t('trip_st_' + trip.status))), trip.note ? h('p.muted', trip.note) : null, ...stops, actions);
  }

  root.replaceChildren(...parts);
  loadList();
  const timer = setInterval(() => { if (document.visibilityState === 'visible') loadList(true); }, 20000);
  cleanup = () => { clearInterval(timer); cleanup = null; };
}

export function dispose() { if (cleanup) cleanup(); }
