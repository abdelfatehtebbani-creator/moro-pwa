// The branch manager's screen (server/Branches.gs): their shops' orders, shifts, daily sales, returns and
// what was received short, in a period. Nothing is approved here; a note may be added to an order (seen by
// distribution and the cashier) or to a daily sales sheet (seen by the accountant and the admin).
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, fmtDate, fmtNum, dialog } from '../ui.js';

const TABS = ['overview', 'orders', 'shifts', 'sales', 'returns'];
const KEEP = 'moro.branches.';
let tab = 'overview';
let period = 'today';
let shop = '';

const qr = (n) => (n === '' || n === null || n === undefined ? '—' : (Math.round(Number(n) * 100) / 100).toLocaleString('en-US'));
const party = (id) => (Data.parties.get(id) || {}).name || id;
const item = (id) => Data.nameOf(Data.items.get(id) || { name: id });
const iso = (d) => d.toISOString().slice(0, 10);
const back = (s, days) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - days); return iso(d); };
const time = (s) => String(s || '').slice(11, 16);
const dur = (hrs) => (hrs < 1 ? t('fu_min', { n: Math.round(hrs * 60) }) : hrs < 48 ? t('fu_h', { n: Math.round(hrs * 10) / 10 }) : t('fu_d', { n: Math.round(hrs / 24) }));

function range() {
  const today = Data.todayIso();
  if (period === 'week') return { from: back(today, 6), to: today };
  if (period === 'month') return { from: today.slice(0, 8) + '01', to: today };
  return { from: today, to: today };
}
const kept = (k) => { try { return JSON.parse(localStorage.getItem(KEEP + k) || 'null'); } catch { return null; } };
const keep = (k, d) => { try { localStorage.setItem(KEEP + k, JSON.stringify(d)); } catch { /* storage full or blocked */ } };

function kpi(label, value, tone) {
  return h('div', { class: 'ex-kpi' + (tone ? ' ' + tone : '') }, h('div.ex-kpi-label', label), h('div.ex-kpi-value', h('span.num', value)));
}

/** The manager's note: shown, and written or changed (one per order or sheet). */
function noteBox(kind, row, after) {
  const can = Data.can('branches.note');
  const edit = async () => {
    const area = h('textarea.input', { rows: 3, maxlength: 500 }, row.mgr_note || '');
    const v = await dialog((close) => [h('h3', t('br_note_title')), h('p.muted', t(kind === 'order' ? 'br_note_help_order' : 'br_note_help_sales')), area,
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
        h('button.btn', { type: 'button', onclick: () => close({ note: area.value.trim() }) }, t('save')))]);
    if (!v) return;
    try {
      await call('branches.note', { kind, id: kind === 'order' ? row.order_id : row.day_id, note: v.note });
      row.mgr_note = v.note;
      toast(t('saved'), 'ok');
      after();
    } catch (e) { toast(errText(e), 'err'); }
  };
  return h('div.br-note', row.mgr_note ? h('p', '📝 ', row.mgr_note) : null,
    can ? h('button.btn.secondary.small', { type: 'button', onclick: edit }, row.mgr_note ? t('br_note_edit') : '+ ' + t('br_note_add')) : null);
}

const VIEWS = {
  overview(d) {
    const tot = d.per.reduce((a, x) => ({ sales: a.sales + x.sales, diff: a.diff + x.diff, late: a.late + x.late, ret: a.ret + x.returns, short: a.short + x.short,
      open: a.open + x.open_shifts, undecl: a.undecl + x.undeclared }), { sales: 0, diff: 0, late: 0, ret: 0, short: 0, open: 0, undecl: 0 });
    return [
      h('div.ex-kpis', kpi(t('br_sales'), qr(tot.sales)), kpi(t('br_diff'), qr(tot.diff), tot.diff < 0 ? 'bad' : ''),
        kpi(t('br_late'), String(tot.late), tot.late ? 'bad' : ''), kpi(t('br_open_shifts'), String(tot.open)),
        kpi(t('br_short'), String(tot.short), tot.short ? 'warn' : ''), kpi(t('br_returns'), String(tot.ret))),
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('br_branch')), h('th', t('br_sales')), h('th', t('br_diff')), h('th', t('br_orders')),
        h('th', t('br_late')), h('th', t('br_short')), h('th', t('br_returns')), h('th', t('br_open_shifts')))),
        h('tbody', d.per.map((x) => h('tr.click', { onclick: () => { shop = x.shop_party_id; tab = 'orders'; redraw(); } },
          h('td', h('bdi', party(x.shop_party_id))), h('td.num', qr(x.sales)), h('td', { class: 'num' + (x.diff < 0 ? ' qty-neg' : '') }, qr(x.diff)),
          h('td.num', String(x.orders)), h('td', { class: 'num' + (x.late ? ' qty-neg' : '') }, String(x.late)), h('td.num', String(x.short)),
          h('td.num', String(x.returns)), h('td.num', String(x.open_shifts) + (x.undeclared ? ' · ' + t('br_undeclared_n', { n: x.undeclared }) : ''))))))),
    ];
  },
  orders(d) {
    if (!d.orders.length) return [h('p.ex-empty', t('ex_nothing'))];
    const rank = { very: 0, late: 1, ok: 2 };
    return d.orders.slice().sort((a, b) => rank[a.level] - rank[b.level] || String(b.sent_at).localeCompare(String(a.sent_at))).map((o) =>
      h('div', { class: 'req-card br-card ' + (o.level !== 'ok' ? 'fu-row ' + o.level : '') },
        h('div.card-head', h('b', o.order_no), h('bdi', party(o.shop_party_id)), h('span.pill', t('order_st_' + o.status)),
          o.kind === 'special' ? h('span.pill.soon', t('special')) : null,
          o.level !== 'ok' ? h('span.pill.low', t('fu_since', { d: dur(o.hours) }) + ' · ' + t('fu_usual', { d: dur(o.limit) })) : null,
          o.short ? h('span.pill.low', t('br_short_n', { n: o.short })) : null),
        h('small.muted', t('br_sent_at', { d: fmtDate(o.sent_at) + ' ' + time(o.sent_at) }), ' · ', t('order_for'), ' ', fmtDate(o.delivery_date),
          ' · ', t('br_lines_n', { n: o.lines })),
        o.note ? h('p.muted', o.note) : null,
        o.reason ? h('p.err-text', o.reason) : null,
        noteBox('order', o, redraw)));
  },
  shifts(d) {
    if (!d.shifts.length) return [h('p.ex-empty', t('ex_nothing'))];
    return [h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('br_branch')), h('th', t('br_cashier')), h('th', t('br_opened')), h('th', t('br_closed')),
      h('th', t('br_declared')), h('th', t('br_received')), h('th', t('br_diff')))),
      h('tbody', d.shifts.map((s) => h('tr', h('td', h('bdi', party(s.shop_party_id))), h('td', h('bdi', s.cashier)),
        h('td.num', fmtDate(s.opened_at) + ' ' + time(s.opened_at)),
        h('td', s.open ? h('span.pill.soon', t('br_shift_open')) : h('span.num', fmtDate(s.closed_at) + ' ' + time(s.closed_at))),
        h('td.num', s.open ? '' : s.undeclared ? h('span.pill.low', t('br_undeclared')) : qr(s.amount)),
        h('td.num', s.received_amount === '' ? '—' : qr(s.received_amount)),
        h('td', { class: 'num' + (Number(s.diff) < 0 ? ' qty-neg' : '') }, s.diff === '' || s.diff === undefined ? '' : qr(s.diff)))))))];
  },
  sales(d) {
    if (!d.sales.length) return [h('p.ex-empty', t('br_no_sales'))];
    return d.sales.map((v) => h('div.req-card.br-card',
      h('div.card-head', h('b', fmtDate(v.date)), h('bdi', party(v.shop_party_id)), h('span.pill', t('sl_st_' + v.status)), h('span', t('total'), ': ', h('b.num', qr(v.total)))),
      h('small.muted', t('sl_cash'), ': ', qr(v.cash), ...Object.keys(v.channels || {}).map((k) => ' · ' + k + ': ' + qr(v.channels[k]))),
      v.note ? h('p.muted', v.note) : null,
      noteBox('sales', v, redraw)));
  },
  returns(d) {
    const out = [];
    out.push(h('h3', t('br_short_title')));
    out.push(d.shorts.length ? h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('br_order')), h('th', t('br_branch')), h('th', t('item')),
      h('th', t('br_sent_qty')), h('th', t('received')), h('th', t('reason')))),
      h('tbody', d.shorts.map((x) => h('tr', h('td', x.order_no), h('td', h('bdi', party(x.shop_party_id))), h('td', h('bdi', item(x.item_id))),
        h('td.num', fmtNum(x.qty)), h('td.num', x.received_qty === '' ? '' : fmtNum(x.received_qty)),
        h('td', t('short_' + x.reason), x.note ? ': ' + x.note : '')))))) : h('p.ex-empty', t('ex_nothing')));
    out.push(h('h3', t('br_returns_title')));
    out.push(d.returns.length ? h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('date')), h('th', t('br_branch')), h('th', t('item')),
      h('th', t('qty')), h('th', t('reason')), h('th', ''))),
      h('tbody', d.returns.map((r) => h('tr', h('td.num', fmtDate(r.date || r.created_at)), h('td', h('bdi', party(r.shop_party_id))), h('td', h('bdi', item(r.item_id))),
        h('td.num', fmtNum(r.qty) + ' ' + (r.unit || '')),
        h('td', r.source === 'diff' ? t('short_' + r.reason) : t('return_r_' + r.reason), r.note ? ': ' + r.note : ''),
        h('td', h('span.pill', t(r.status === 'quarantine' ? 'return_st_quarantine' : 'return_d_' + r.decision)))))))) : h('p.ex-empty', t('ex_nothing')));
    return out;
  },
};

let redraw = () => {};

export async function render(root) {
  const tabsBar = h('div.ex-tabs');
  const shopsBar = h('div.fu-chips');
  const body = h('div.ex-body');
  const stamp = h('small.muted.ex-stamp');
  let data = null;

  const draw = () => {
    tabsBar.replaceChildren(...TABS.map((k) => h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; draw(); } }, t('br_tab_' + k))));
    if (!data) { body.replaceChildren(h('div.ex-skeleton', [1, 2, 3].map(() => h('div')))); return; }
    if (!data.shops.length) { shopsBar.replaceChildren(); body.replaceChildren(h('p.ex-empty', t('br_no_branches'))); return; }
    // one branch or all of them
    shopsBar.replaceChildren(...(data.shops.length > 1 ? [''].concat(data.shops).map((s) => h('button', { type: 'button', class: 'fu-chip' + (shop === s ? ' on' : ''),
      onclick: () => { shop = s; draw(); } }, h('span', s ? party(s) : t('br_all_branches')))) : []));
    const mine = (x) => !shop || x.shop_party_id === shop;
    const view = Object.assign({}, data, { per: data.per.filter(mine), orders: data.orders.filter(mine), shifts: data.shifts.filter(mine),
      sales: data.sales.filter(mine), returns: data.returns.filter(mine), shorts: data.shorts.filter(mine) });
    body.replaceChildren(...VIEWS[tab](view));
  };
  redraw = draw;

  const chips = h('div.ex-periods', ['today', 'week', 'month'].map((k) => h('button', { type: 'button', class: k === period ? 'on' : '',
    onclick: () => { period = k; [...chips.children].forEach((b, i) => b.classList.toggle('on', ['today', 'week', 'month'][i] === k)); load(); } }, t('ex_p_' + k))));

  async function load() {
    const r = range(), k = r.from + '|' + r.to;
    data = kept(k); draw();
    stamp.textContent = t('ex_period', { a: fmtDate(r.from), b: fmtDate(r.to) }) + (data ? ' · ' + t('ex_updating') : '');
    try {
      const d = await call('branches.summary', r);
      keep(k, d);
      if (k !== range().from + '|' + range().to) return;
      data = d; draw();
      stamp.textContent = t('ex_period', { a: fmtDate(d.from), b: fmtDate(d.to) });
    } catch (e) { if (!data) body.replaceChildren(h('p.ex-empty', errText(e))); else toast(errText(e), 'err'); }
  }

  root.replaceChildren(h('div.card.ex', h('div.card-head', h('h2', t('branches')), chips), stamp, shopsBar, tabsBar, body));
  load();
}
