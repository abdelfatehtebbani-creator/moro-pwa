// Dashboard: KPI tiles, quick item search, alerts (minimum stock / expiry), latest movements.
import { call } from '../api.js';
import { kv } from '../db.js';
import { Data, objects } from '../data.js';
import { MovStore } from '../movstore.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, trackFilled, fmtNum, fmtDate, dialog } from '../ui.js';

let alertTab = 'low';

// Food kept cold: the latest receipt of the item went to a "Freezer …" or "Chiller …" location
const COLD = /freezer|chiller/i;
async function coldItems() {
  const { list } = await MovStore.all();
  const last = new Map();
  for (const m of list) {
    if (m.kind !== 'RECEIPT' || m.status === 'deleted') continue;
    const k = (m.date || '') + '|' + (m.created_at || '');
    const cur = last.get(m.item_id);
    if (!cur || k > cur.k) last.set(m.item_id, { k, location: m.location || '' });
  }
  const out = new Map();
  last.forEach((v, id) => { if (COLD.test(v.location)) out.set(id, v.location); });
  return out;
}

export async function render(root) {
  const canEditMin = Data.can('min_stock');

  // ---------- KPIs
  const kToday = h('b', '…');
  const kpis = h('div.kpis',
    h('button.kpi.k1', { type: 'button', onclick: () => search.focus() }, h('b', fmtNum(Data.inStockCount())), h('span', t('kpi_items'))),
    h('button.kpi.k2', { type: 'button', onclick: () => showAlerts('low') }, h('b', fmtNum(Data.lowStock().length)), h('span', t('kpi_low'))),
    h('button.kpi.k3', { type: 'button', onclick: () => showAlerts('exp') }, h('b', fmtNum(Data.expiring(30).length)), h('span', t('kpi_exp'))),
    h('button.kpi.k4', { type: 'button', onclick: () => recentCard.scrollIntoView({ behavior: 'smooth' }) }, kToday, h('span', t('kpi_today'))));

  // ---------- quick search
  const search = trackFilled(h('input.input#lookup', { type: 'search', placeholder: t('lookup_hint'), autocomplete: 'off' }));
  const count = h('span.muted.num', '');
  const lookBody = h('tbody');
  let cold = new Map();
  const zonePill = (i) => {
    if (i.category !== 'Food') return h('span.pill.pack', t('packaging'));
    const where = cold.get(i.item_id);
    return h('span', { class: 'pill ' + (where ? 'cold' : 'food'), title: where || '' }, t('food'));
  };
  const fillLookup = () => {
    const q = search.value.trim().toLowerCase();
    const rows = Data.activeItems().filter((i) => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 300);
    count.textContent = t('items_count', { n: rows.length });
    lookBody.replaceChildren(...rows.map((i) => {
      const b = Data.balances.get(i.item_id);
      const qty = Data.qty(i.item_id);
      const low = Number(i.min_stock) > 0 && qty <= Number(i.min_stock);
      return h('tr', { class: canEditMin ? 'click' : '', onclick: canEditMin ? () => editMin(i) : null },
        h('td.wrap', h('bdi', i.name), ' ', zonePill(i)),
        h('td', i.unit),
        h('td.num', { class: low ? 'qty-neg' : '' }, fmtNum(qty)),
        h('td.num', Number(i.min_stock) > 0 ? fmtNum(i.min_stock) : ''),
        h('td.num', b && b.last_expiry ? fmtDate(b.last_expiry) : ''));
    }));
  };
  search.addEventListener('input', fillLookup);
  coldItems().then((m) => { cold = m; fillLookup(); }).catch(() => {});
  const lookup = h('div.card',
    h('div.card-head', h('h2', t('lookup')), count),
    h('div.search', search),
    canEditMin ? h('small.muted', t('click_to_edit')) : null,
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('unit')), h('th', t('balance')), h('th', t('min_stock')), h('th', t('last_expiry')))), lookBody)));

  // ---------- alerts
  const tabLow = h('button', { type: 'button', onclick: () => showAlerts('low') }, t('tab_low'));
  const tabExp = h('button', { type: 'button', onclick: () => showAlerts('exp') }, t('tab_exp'));
  const alertHead = h('thead');
  const alertBody = h('tbody');
  const alerts = h('div.card', h('div.card-head', h('h2', t('alerts')), h('div.tabs', tabLow, tabExp)),
    h('div.table-wrap', h('table', alertHead, alertBody)));
  function showAlerts(tab) {
    alertTab = tab;
    tabLow.classList.toggle('on', tab === 'low');
    tabExp.classList.toggle('on', tab === 'exp');
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
  root.replaceChildren(requestsNote, kpis, h('div.grid-2', lookup, alerts), recentCard);
  fillLookup();
  showAlerts(alertTab);

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
