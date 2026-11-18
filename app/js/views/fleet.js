// The company's vehicles day to day (server/Fleet.gs).
//  - the driver ("my car"): a check before leaving, a fuel refill, a fault (with photos), on their vehicle;
//  - the car park manager: each vehicle's figures (odometer, km in 30 days, fuel use, last check, open problems),
//    the problems to close, every record, the drivers on the map, and the list of vehicles.
// The records are kept in one log whose fields are free per kind, so new kinds come later without a new table.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, dialog, fmtNum, fmtDate } from '../ui.js';
import { field, newId } from '../components.js';
import { shrink, photoButton } from '../photos.js';
import { driverMap } from '../drivermap.js';

let tab = '';
const CHECKS = ['tyres', 'oil', 'cooling', 'clean'];
const when = (iso) => (iso ? fmtDate(String(iso).slice(0, 10)) + ' ' + String(iso).slice(11, 16) : '');

export function render(root) {
  const manage = Data.can('fleet.list'), drive = Data.can('fleet.add');
  const keys = [].concat(drive ? ['mycar'] : [], manage ? ['cars', 'problems', 'log', 'map'] : []);
  if (!keys.includes(tab)) tab = keys[0];
  const box = h('div');
  const bar = h('div.tabs');
  const draw = () => {
    bar.replaceChildren(...keys.map((k) => h('button', { type: 'button', class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, t('fl_tab_' + k))));
    ({ mycar: myCar, cars, problems, log, map: (b) => driverMap(b) })[tab](box);
  };
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('fleet')), keys.length > 1 ? bar : ''), box));
  draw();
}

// ---------- a record's text, for both screens
function describe(l) {
  const d = l.data || {};
  if (l.kind === 'check') {
    const bad = CHECKS.filter((k) => d[k] === 'bad');
    return [bad.length ? '⚠️ ' + bad.map((k) => t('fl_c_' + k)).join('، ') : '✅ ' + t('fl_all_ok'),
      d.fuel !== '' && d.fuel !== undefined ? ' · ⛽ ' + t('fl_fuel_' + d.fuel) : '', d.cold !== '' && d.cold !== undefined ? ' · ❄️ ' + d.cold + '°' : ''].join('');
  }
  if (l.kind === 'fuel') return '⛽ ' + fmtNum(d.liters) + ' ' + t('fl_l') + ' · ' + fmtNum(d.amount) + ' ' + t('ol_qr');
  return (d.urgent ? '🚨 ' : '🔧 ') + (d.text || '');
}
function logRow(l, extra) {
  return h('div.fl-row', { class: l.status === 'open' ? 'open' : '' },
    h('div.fl-top', h('b', t('fl_k_' + l.kind)), h('span.num', l.plate), l.odometer ? h('span.muted', fmtNum(l.odometer) + ' ' + t('fl_km')) : '',
      h('small.muted', when(l.at)), l.by_name ? h('small.muted', '· ' + l.by_name) : ''),
    h('div', describe(l)), l.note ? h('small.muted', '📝 ' + l.note) : '',
    l.photos && l.photos.length ? photoButton(l.photos) : '',
    l.status === 'closed' ? h('small.fl-closed', '✓ ' + t('fl_closed', { t: when(l.closed_at), n: l.closed_by_name || '' })) : '',
    extra || '');
}

// ---------- the driver
let mineCache = null;
function myCar(box) {
  const body = h('div.fl-mine');
  box.replaceChildren(body);
  const draw = (m) => {
    mineCache = m;
    const sel = h('select.input', h('option', { value: '' }, t('fl_pick_car')), m.vehicles.map((v) => h('option', { value: v.plate }, v.plate + (v.model ? ' – ' + v.model : ''))));
    sel.value = m.plate || '';
    const status = h('div.fl-status', { class: m.checked_today ? 'ok' : 'todo' }, m.checked_today ? '✅ ' + t('fl_checked_today') : '⏳ ' + t('fl_check_todo'));
    const go = (kind) => () => { if (!sel.value) { toast(t('fl_pick_car'), 'err'); return; } form(kind, sel.value, m.plate === sel.value ? m.last_odo : 0, reload); };
    body.replaceChildren(field(t('fl_car'), sel), sel.value === m.plate ? status : '',
      h('div.fl-big', h('button.btn', { type: 'button', onclick: go('check') }, '🔍 ' + t('fl_k_check')),
        h('button.btn', { type: 'button', onclick: go('fuel') }, '⛽ ' + t('fl_k_fuel')),
        h('button.btn.danger', { type: 'button', onclick: go('issue') }, '🔧 ' + t('fl_k_issue'))),
      h('h3', t('fl_my_last')), ...(m.logs.length ? m.logs.map((l) => logRow(l)) : [h('p.empty', t('fl_none'))]));
  };
  const reload = () => call('fleet.mine').then((m) => { if (box.isConnected) draw(m); }).catch((e) => { if (!mineCache) body.replaceChildren(h('p.empty', errText(e))); });
  if (mineCache) draw(mineCache); else body.replaceChildren(h('p.empty', t('refreshing')));
  reload();
}

/** The record's form (a dialog): sent in one call, with its photos made small on the phone. */
async function form(kind, plate, lastOdo, done) {
  const odo = h('input.input', { type: 'number', inputmode: 'numeric', min: lastOdo || 0, placeholder: lastOdo ? t('fl_odo_last', { n: fmtNum(lastOdo) }) : '' });
  const parts = [];
  const data = {};
  if (kind === 'check') {
    CHECKS.forEach((k) => {
      data[k] = 'ok';
      const ok = h('button.chip.on', { type: 'button' }, '✓ ' + t('fl_ok')), bad = h('button.chip', { type: 'button' }, '✗ ' + t('fl_bad'));
      const set = (v) => { data[k] = v; ok.classList.toggle('on', v === 'ok'); bad.classList.toggle('on', v === 'bad'); bad.classList.toggle('fl-bad', v === 'bad'); };
      ok.addEventListener('click', () => set('ok')); bad.addEventListener('click', () => set('bad'));
      parts.push(h('div.fl-check', h('span', t('fl_c_' + k)), h('span.fl-pair', ok, bad)));
    });
    const fuel = h('select.input', [0, 1, 2, 3, 4].map((n) => h('option', { value: n }, t('fl_fuel_' + n))));
    fuel.value = 4;
    const cold = h('input.input', { type: 'number', inputmode: 'decimal', step: 'any', placeholder: '°C' });
    parts.push(field(t('fl_fuel_level'), fuel), field(t('fl_cold'), cold));
    data._read = () => { data.fuel = Number(fuel.value); data.cold = cold.value; };
  } else if (kind === 'fuel') {
    const liters = h('input.input', { type: 'number', inputmode: 'decimal', step: 'any' }), amount = h('input.input', { type: 'number', inputmode: 'decimal', step: 'any' });
    parts.push(field(t('fl_liters'), liters), field(t('fl_amount'), amount));
    data._read = () => { data.liters = liters.value; data.amount = amount.value; };
  } else {
    const text = h('textarea.input', { rows: 3, placeholder: t('fl_issue_ph') });
    const urgent = h('input', { type: 'checkbox' });
    parts.push(field(t('fl_issue_what'), text), h('label.fl-urgent', urgent, ' 🚨 ' + t('fl_urgent')));
    data._read = () => { data.text = text.value; data.urgent = urgent.checked; };
  }
  const photos = [];
  const file = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const phCount = h('small.muted', '');
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    try { photos.push(await shrink(f)); phCount.textContent = t('fl_photos_n', { n: photos.length }); } catch { toast(t('err.photo_invalid'), 'err'); }
    file.value = '';
  });
  const note = h('input.input', { placeholder: t('note') });
  const ok = await dialog((close) => [h('h3', t('fl_k_' + kind) + ' · ' + plate),
    kind !== 'issue' ? field(t('fl_odometer'), odo) : field(t('fl_odometer_opt'), odo), ...parts,
    h('div.fl-photo', h('button.btn.secondary', { type: 'button', onclick: () => { if (photos.length < 3) file.click(); } }, '📷 ' + t(kind === 'fuel' ? 'fl_photo_receipt' : 'fl_photo')), phCount, file),
    field(t('note'), note),
    h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')), h('button.btn', { type: 'button', onclick: () => close(true) }, t('save')))]);
  if (!ok) return;
  data._read();
  delete data._read;
  try {
    await call('fleet.add', { client_id: newId(), kind, plate, odometer: odo.value, data, photos, note: note.value });
    toast(t('saved'), 'ok');
    done();
  } catch (e) { toast(errText(e), 'err'); }
}

// ---------- the car park manager
let listCache = null;
function managerList(box, drawFn) {
  const body = h('div');
  box.replaceChildren(body);
  const reload = () => call('fleet.list').then((d) => {
    listCache = d;
    if (Data.boot) { const n = d.logs.filter((l) => l.status === 'open').length; if (Data.boot.fleet_open !== n) { Data.boot.fleet_open = n; window.dispatchEvent(new Event('moro:badge')); } }
    if (box.isConnected) drawFn(body, d, reload);
  }).catch((e) => { if (!listCache) body.replaceChildren(h('p.empty', errText(e))); });
  if (listCache) drawFn(body, listCache, reload); else body.replaceChildren(h('p.empty', t('refreshing')));
  reload();
}
function cars(box) {
  managerList(box, (body, d, reload) => {
    const edit = async (v) => {
      const plate = h('input.input', { value: v ? v.plate : '', dir: 'ltr' }), model = h('input.input', { value: v ? v.model : '', dir: 'ltr' });
      const active = h('input', { type: 'checkbox', checked: true });
      const ok = await dialog((close) => [h('h3', v ? v.plate : t('fl_new_car')), field(t('vehicle_no'), plate), field(t('vehicle_model'), model),
        v ? h('label', active, ' ' + t('fl_active')) : '',
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')), h('button.btn', { type: 'button', onclick: () => close(true) }, t('save')))]);
      if (!ok) return;
      try { await call('vehicles.save', { plate: plate.value, model: model.value, active: active.checked, old_plate: v ? v.plate : '' }); toast(t('saved'), 'ok'); reload(); } catch (e) { toast(errText(e), 'err'); }
    };
    body.replaceChildren(h('div.form-actions', h('button.btn.secondary', { type: 'button', onclick: () => edit(null) }, '+ ' + t('fl_new_car'))),
      h('div.table-wrap', h('table', h('thead', h('tr', ...['vehicle_no', 'vehicle_model', 'fl_odometer', 'fl_km30', 'fl_per100', 'fl_last_check', 'fl_open', ''].map((k) => h('th', k ? t(k) : '')))),
        h('tbody', d.cars.map((c) => h('tr', { class: c.open ? 'fl-open' : '' },
          h('td.num', c.plate), h('td', c.model), h('td.num', c.odometer ? fmtNum(c.odometer) : '—'), h('td.num', c.km30 ? fmtNum(c.km30) : '—'),
          h('td.num', c.per100 !== null ? fmtNum(c.per100) : '—'), h('td', c.last_check ? (c.checked_today ? '✅ ' : '') + when(c.last_check) : '—'),
          h('td', c.open ? h('span.pill.low', String(c.open)) : ''),
          h('td', h('button.link', { type: 'button', onclick: () => edit(c) }, t('wk_edit_btn')))))))));
  });
}
function problems(box) {
  managerList(box, (body, d, reload) => {
    const open = d.logs.filter((l) => l.status === 'open');
    body.replaceChildren(...(open.length ? open.map((l) => logRow(l, h('div.form-actions', h('button.btn', { type: 'button', onclick: async () => {
      const note = h('input.input', { placeholder: t('fl_close_ph') });
      const ok = await dialog((close) => [h('h3', t('fl_close_q')), note,
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')), h('button.btn', { type: 'button', onclick: () => close(true) }, t('fl_close')))]);
      if (!ok) return;
      try { await call('fleet.close', { log_id: l.log_id, note: note.value }); toast(t('saved'), 'ok'); reload(); } catch (e) { toast(errText(e), 'err'); }
    } }, '✓ ' + t('fl_close'))))) : [h('p.empty', t('fl_no_open'))]));
  });
}
let logPlate = '';
function log(box) {
  managerList(box, (body, d) => {
    const sel = h('select.input', h('option', { value: '' }, t('fl_all_cars')), d.cars.map((c) => h('option', { value: c.plate }, c.plate + (c.model ? ' – ' + c.model : ''))));
    sel.value = logPlate;
    const list = h('div.fl-list');
    const show = () => { const rows = d.logs.filter((l) => !logPlate || l.plate === logPlate); list.replaceChildren(...(rows.length ? rows.map((l) => logRow(l)) : [h('p.empty', t('fl_none'))])); };
    sel.addEventListener('change', () => { logPlate = sel.value; show(); });
    body.replaceChildren(field(t('fl_car'), sel), list);
    show();
  });
}
