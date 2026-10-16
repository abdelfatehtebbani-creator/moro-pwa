// Dashboard: KPI tiles, quick item search, alerts (minimum stock / expiry), latest movements.
import { call } from '../api.js';
import { kv } from '../db.js';
import { Data, objects, STORES } from '../data.js';
import { storePill } from '../components.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, trackFilled, fmtNum, fmtDate, dialog } from '../ui.js';

// the table shown under the four cards (none at first) and the store chosen in the quick search;
// kept while the app is open, so a refresh of the data does not close what the user opened
let panel = '';
let lookStore = '';



export async function render(root) {
  const canEditMin = Data.can('min_stock');

  // ---------- KPIs
  const kToday = h('b', '…');
  const card = (cls, key, num, label) => h('button.kpi.' + cls, { type: 'button', 'data-panel': key, 'aria-expanded': String(panel === key),
    onclick: () => open(panel === key ? '' : key) }, num, h('span', label));
  const kpis = h('div.kpis',
    card('k1', 'items', h('b', fmtNum(Data.inStockCount())), t('kpi_items')),
    card('k2', 'low', h('b', fmtNum(Data.lowStock().length)), t('kpi_low')),
    card('k3', 'exp', h('b', fmtNum(Data.expiring(30).length)), t('kpi_exp')),
    card('k4', 'today', kToday, t('kpi_today')));
  const hint = h('p.muted.kpi-hint', t('kpi_hint'));
  const panelBox = h('div.panel-box');

  // ---------- quick search
  const search = trackFilled(h('input.input#lookup', { type: 'search', placeholder: t('lookup_hint'), autocomplete: 'off' }));
  const count = h('span.muted.num', '');
  const lookBody = h('tbody');
  const fillLookup = () => {
    const q = search.value.trim().toLowerCase();
    const rows = Data.activeItems().filter((i) => (!q || i.name.toLowerCase().includes(q)) && (!lookStore || Data.storeOf(i) === lookStore))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 300);
    count.textContent = t('items_count', { n: rows.length });
    lookBody.replaceChildren(...rows.map((i) => {
      const b = Data.balances.get(i.item_id);
      const qty = Data.qty(i.item_id);
      const low = Number(i.min_stock) > 0 && qty <= Number(i.min_stock);
      return h('tr', { class: canEditMin ? 'click' : '', onclick: canEditMin ? () => editMin(i) : null },
        h('td.wrap', h('bdi', i.name), ' ', storePill(Data.storeOf(i))),
        h('td', i.unit),
        h('td.num', { class: low ? 'qty-neg' : '' }, fmtNum(qty), Data.reserved(i.item_id) ? h('small.muted.reserved', ' (' + t('reserved') + ' ' + fmtNum(Data.reserved(i.item_id)) + ')') : ''),
        h('td.num', Number(i.min_stock) > 0 ? fmtNum(i.min_stock) : ''),
        h('td.num', b && b.last_expiry ? fmtDate(b.last_expiry) : ''));
    }));
  };
  search.addEventListener('input', fillLookup);
  const storeTabs = h('div.tabs.store-tabs');
  const drawStoreTabs = () => storeTabs.replaceChildren(...['', ...STORES].map((s) => h('button', { type: 'button', class: s === lookStore ? 'on' : '',
    onclick: () => { lookStore = s; drawStoreTabs(); fillLookup(); search.focus(); } }, s ? t('store_' + s) : t('all_stores'))));
  drawStoreTabs();
  const lookup = h('div.card',
    h('div.card-head', h('h2', t('lookup')), count),
    storeTabs,
    h('div.search', search),
    canEditMin ? h('small.muted', t('click_to_edit')) : null,
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('unit')), h('th', t('balance')), h('th', t('min_stock')), h('th', t('last_expiry')))), lookBody)));

  // ---------- alerts
  const alertTitle = h('h2', '');
  const alertHead = h('thead');
  const alertBody = h('tbody');
  const alerts = h('div.card', h('div.card-head', alertTitle),
    h('div.table-wrap', h('table', alertHead, alertBody)));
  function showAlerts(tab) {
    alertTitle.textContent = t(tab === 'low' ? 'kpi_low' : 'kpi_exp');
    if (tab === 'low') {
      alertHead.replaceChildren(h('tr', h('th', t('item')), h('th', t('available')), h('th', t('min_stock'))));
      const rows = Data.lowStock();
      alertBody.replaceChildren(...(rows.length ? rows.map((r) => h('tr', { class: canEditMin ? 'click' : '', onclick: canEditMin ? () => editMin(r.item) : null },
        h('td.wrap', h('bdi', r.item.name)), h('td.num.qty-neg', fmtNum(r.qty) + ' ' + r.item.unit), h('td.num', fmtNum(r.min))))
        : [h('tr', h('td.empty', { colspan: 3 }, t('no_low')))]));
    } else {
      alertHead.replaceChildren(h('tr', h('th', t('item')), h('th', t('balance')), h('th', t('expiry'))));
      const rows = Data.expiring(30);
      alertBody.replaceChildren(...(rows.length ? rows.map((r) => h('tr',
        h('td.wrap', h('bdi', r.item.name)), h('td.num', fmtNum(r.qty) + ' ' + r.item.unit),
        h('td', fmtDate(r.expiry), ' ', h('span', { class: 'pill ' + (r.left < 0 ? 'low' : 'soon') }, r.left < 0 ? t('expired') : t('days_left', { n: r.left })))))
        : [h('tr', h('td.empty', { colspan: 3 }, t('no_exp')))]));
    }
  }

  // ---------- latest movements
  const recentBody = h('tbody', h('tr', h('td.empty', { colspan: 6 }, '…')));
  const recentCard = h('div.card', h('h2', t('recent')),
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('date')), h('th', t('kind')), h('th', t('party')), h('th', t('item')), h('th', t('qty')), h('th', t('doc')))), recentBody)));
  const fillRecent = (res) => {
    const rows = objects(res);
    recentBody.replaceChildren(...(rows.length ? rows.map((m) => {
      const it = Data.items.get(m.item_id);
      const p = Data.parties.get(m.party_id);
      const q = Number(m.qty);
      return h('tr', h('td.num', fmtDate(m.date)), h('td', h('span', { class: 'pill ' + (q >= 0 ? 'in' : 'out') }, t('kind_' + m.kind))),
        h('td.wrap', h('bdi', p ? p.name : m.party_id)), h('td.wrap', h('bdi', it ? it.name : m.item_id)),
        h('td.num', { class: q < 0 ? 'qty-neg' : '' }, fmtNum(q) + ' ' + (m.unit || '')), h('td.num', m.doc_no || ''));
    }) : [h('tr', h('td.empty', { colspan: 6 }, t('no_rows')))]));
  };

  const requestsNote = h('div');
  function open(key) {
    panel = key;
    kpis.querySelectorAll('.kpi').forEach((b) => { b.classList.toggle('on', b.dataset.panel === key); b.setAttribute('aria-expanded', String(b.dataset.panel === key)); });
    hint.hidden = !!key;
    if (key === 'low' || key === 'exp') showAlerts(key);
    panelBox.replaceChildren(...(key === 'items' ? [lookup] : key === 'low' || key === 'exp' ? [alerts] : key === 'today' ? [recentCard] : []));
    if (key === 'items') search.focus();
    if (key) panelBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  root.replaceChildren(requestsNote, kpis, hint, panelBox);
  fillLookup();
  open(panel);

  // movements: cached copy first (offline), then the server
  const cached = await kv.get('recent');
  if (cached) { fillRecent(cached.recent); kToday.textContent = cached.today; }
  try {
    const today = Data.todayIso();
    const [recent, todays] = await Promise.all([
      call('movements.query', { limit: 40, kinds: ['RECEIPT', 'ISSUE', 'SUPPLIER_RETURN', 'DEPT_RETURN', 'PROD_CONSUME', 'PROD_OUTPUT'] }),
      call('movements.query', { from: today, to: today }),
    ]);
    const tr = objects(todays);
    const tIn = tr.filter((m) => Number(m.qty) > 0).length;
    const tOut = tr.filter((m) => Number(m.qty) < 0).length;
    kToday.textContent = tIn + ' / ' + tOut;
    fillRecent(recent);
    kv.set('recent', { recent, today: kToday.textContent });
    if (Data.can('requests.fulfil')) {
      const open = (await call('requests.list', { status: 'open' })).length;
      requestsNote.replaceChildren(open ? h('div.card', h('a.link', { href: '#/requests' }, t('open_requests', { n: open }))) : '');
    }
  } catch (e) {
    if (!cached) { kToday.textContent = '–'; recentBody.replaceChildren(h('tr', h('td.empty', { colspan: 6 }, errText(e)))); }
  }

  async function editMin(item) {
    const val = await dialog((close) => {
      const inp = trackFilled(h('input.input.num#min', { type: 'number', min: 0, step: 'any', value: Number(item.min_stock) || 0 }));
      const err = h('p.err-text', '');
      const save = async () => {
        if (inp.value === '' || Number(inp.value) < 0) { flash(inp); return; }
        try {
          await call('items.save', { item_id: item.item_id, name: item.name, min_stock: Number(inp.value) });
          close(Number(inp.value));
        } catch (e) { err.textContent = errText(e); flash(inp); }
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
      return [h('h3', t('edit_min_for', { name: '' }), h('bdi', item.name)), inp, err,
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
          h('button.btn', { type: 'button', onclick: save }, t('save')))];
    });
    if (val === undefined) return;
    toast(t('saved'), 'ok');
    await Data.refresh();
  }
}
