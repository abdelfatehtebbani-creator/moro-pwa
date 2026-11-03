// Shop invoices (server/Invoices.gs), for distribution only: the received orders waiting for their invoice,
// and the invoices issued (a period, a shop), printed in the company's paper layout like the LPO.
// One invoice per order in two parts: final products, then store items, each with its own sum.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, fmtNum, fmtDate, trackFilled } from '../ui.js';

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isoMinus = (iso, days) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
const state = { from: '', to: '', tab: 'wait' };

export async function render(root) {
  const today = Data.todayIso();
  if (!state.from) { state.from = today.slice(0, 8) + '01'; state.to = today; }
  const shopName = (id) => (Data.parties.get(id) || {}).name || id;
  // each line as it went: ordered, handed by the stores and departments, received by the cashier
  const qtyTable = (o) => h('div.table-wrap', h('table.table.inv-qty', h('thead', h('tr', h('th', t('item')),
    h('th.num', t('qty_ordered')), h('th.num', t('qty_handed')), h('th.num', t('qty_received')))),
    h('tbody', o.lines.filter((l) => l.status !== 'removed').map((l) => {
      const got = l.received_qty === '' ? 0 : Number(l.received_qty);
      const off = got !== Number(l.qty) || Number(l.handed_qty) !== Number(l.qty);
      return h('tr', { class: off ? 'inv-off' : '' }, h('td.wrap', h('bdi', Data.nameOf(Data.items.get(l.item_id) || { name: l.item_id }))),
        h('td.num', fmtNum(l.qty)), h('td.num', fmtNum(l.handed_qty)), h('td.num', fmtNum(got) + ' ' + (l.unit || '')));
    }))));

  // ---------- received orders waiting for their invoice
  const waitBox = h('div.req-list');
  async function loadWaiting() {
    try {
      const list = await call('orders.list', { status: 'received' });
      waitBox.replaceChildren(...(list.length ? list.map((o) => h('div.req-card', h('div.card-head', h('b', o.order_no), h('span', h('bdi', shopName(o.shop_party_id))),
        h('span.muted', t('order_st_received'), ' ', h('span.num', fmtDate(String(o.received_at || '').slice(0, 10))))),
        h('small.muted', t('lines_n', { n: o.lines.filter((l) => Number(l.received_qty) > 0).length })),
        qtyTable(o),
        o.diff_status === 'pending' ? h('p', h('span.pill.low', t('diff_pending')), ' ', h('small.muted', t('diff_wait_invoice'))) : null,
        o.diff_status === 'pending' ? null : h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: async (e) => {
          const btn = e.currentTarget; btn.disabled = true;
          try { const r = await call('invoices.create', { order_id: o.order_id }); toast(t('invoice_issued', { n: r.invoice.invoice_no }), 'ok'); loadWaiting(); loadList(); printInvoice(r.invoice); }
          catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
        } }, t('invoice_issue'))))) : [h('p.empty', t('no_orders_to_invoice'))]));
    } catch (e) { waitBox.replaceChildren(h('p.empty', errText(e))); }
  }

  // ---------- issued invoices
  const from = trackFilled(h('input.input#iv-from', { type: 'date', value: state.from }));
  const to = trackFilled(h('input.input#iv-to', { type: 'date', value: state.to }));
  [from, to].forEach((x) => x.addEventListener('change', () => { state.from = from.value; state.to = to.value; loadList(); }));
  const tb = h('tbody');
  const sums = h('div.inv-sums');
  async function loadList() {
    try {
      const list = await call('invoices.list', { from: state.from, to: state.to });
      let f = 0, s = 0;
      list.forEach((v) => { f += Number(v.total_final) || 0; s += Number(v.total_store) || 0; });
      tb.replaceChildren(...(list.length ? list.map((v) => h('tr', h('td.num', v.invoice_no), h('td.num', fmtDate(v.date)), h('td.wrap', h('bdi', shopName(v.shop_party_id))),
        h('td.num', v.order_no), h('td.num', money(v.total_final)), h('td.num', money(v.total_store)), h('td.num', h('b', money(v.total))),
        h('td', h('button.link', { type: 'button', onclick: async () => { try { printInvoice(await call('invoices.get', { invoice_id: v.invoice_id })); } catch (e) { toast(errText(e), 'err'); } } }, t('print')))))
        : [h('tr', h('td.empty', { colspan: 8 }, t('no_rows')))]));
      // each part's sum for the period (final products, store items) and the total
      sums.replaceChildren(h('span', t('inv_final'), ': ', h('b', money(f))), h('span', t('inv_store'), ': ', h('b', money(s))),
        h('span', t('total'), ': ', h('b', money(f + s) + ' QR')));
    } catch (e) { tb.replaceChildren(h('tr', h('td.empty', { colspan: 8 }, errText(e)))); }
  }

  const issued = h('div',
      h('div.form-grid', h('div.field', h('label', t('from')), from), h('div.field', h('label', t('to')), to)),
      h('div.quick', h('button.link', { type: 'button', onclick: () => { from.value = state.from = today.slice(0, 8) + '01'; to.value = state.to = today; loadList(); } }, t('an_this_month')),
        h('button.link', { type: 'button', onclick: () => { from.value = state.from = isoMinus(today, 29); to.value = state.to = today; loadList(); } }, t('last_30'))),
      sums,
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('invoice_no')), h('th', t('date')), h('th', t('shop')), h('th', t('order_no')),
        h('th', t('inv_final')), h('th', t('inv_store')), h('th', t('total')), h('th', ''))), tb)));
  const bar = h('div.tabs');
  const show = () => { waitBox.hidden = state.tab !== 'wait'; issued.hidden = state.tab !== 'issued'; (state.tab === 'wait' ? loadWaiting : loadList)(); };
  ['wait', 'issued'].forEach((k) => bar.append(h('button', { type: 'button', class: k === state.tab ? 'on' : '',
    onclick: (e) => { state.tab = k; [...bar.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); show(); } }, t('inv_tab_' + k))));
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('invoices')), bar), waitBox, issued));
  show();
}

export function dispose() {}

/** The invoice in the company's paper layout (as the LPO), then the print window. */
function printInvoice(v) {
  const b = Data.boot || {};
  const company = String(b.lpo_company || '').split('\n').filter((x) => x.trim());
  const shop = Data.parties.get(v.shop_party_id) || {};
  const part = (section, title) => {
    const rows = v.items.filter((x) => x.section === section);
    if (!rows.length) return [];
    const sum = rows.reduce((s, x) => s + Number(x.amount || 0), 0);
    return [h('tr.lp-th', h('td', { colspan: 6 }, title)),
      ...rows.map((x) => { const it = Data.items.get(x.item_id) || { name: x.item_id };
        return h('tr.lp-line', h('td.lp-ctr', fmtNum(x.qty)), h('td.lp-ctr', x.unit), h('td.lp-desc', { colspan: 2 }, it.name), h('td.lp-ctr', money(x.price)), h('td.lp-ctr', money(x.amount))); }),
      h('tr', h('td', { colspan: 5, style: 'text-align:right;font-weight:700' }, 'Subtotal – ' + title), h('td.lp-ctr', { style: 'font-weight:700' }, money(sum)))];
  };
  const area = h('div#print-area.lpo-print', { dir: 'ltr' },
    h('div.lp-head',
      h('div.lp-left', h('div.lp-b', { style: 'font-size:16pt' }, 'INVOICE'), h('div.lp-b', 'No: ' + v.invoice_no), h('div', 'Date: ' + fmtDate(v.date)),
        h('div', 'Order: ' + v.order_no), h('table.lp-to', h('tbody', h('tr', h('td', 'To:'), h('td.lp-b', shop.name || ''))))),
      h('div.lp-logo', h('img', { src: 'icons/lpo-logo.svg', alt: '' })),
      h('div.lp-co', company.map((x, i) => h('div', { class: i === 0 ? 'lp-co-name' : '' }, x)))),
    h('table.lp-grid',
      h('colgroup', [9, 9, 30, 18, 17, 17].map((w) => h('col', { style: 'width:' + w + '%' }))),
      h('tbody',
        h('tr.lp-th', h('td', 'QTY'), h('td', 'UNIT'), h('td', { colspan: 2 }, 'DESCRIPTION'), h('td', 'UNIT PRICE'), h('td', 'TOTAL (QR)')),
        ...part('final', 'Final products'), ...part('store', 'Store items'))),
    h('div.lp-foot', h('div'), h('table.lp-sum', h('tbody', h('tr', h('td.lp-b', 'Total (QR)'), h('td.lp-box', money(v.total)))))),
    h('div.lp-sign', h('div', h('span'), 'Distribution'), h('div', h('span'), 'Received by')));
  document.body.append(area);
  const done = () => { area.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  const img = area.querySelector('img');
  const go = () => window.print();
  if (img.complete) go(); else { img.onload = go; img.onerror = go; }
}
