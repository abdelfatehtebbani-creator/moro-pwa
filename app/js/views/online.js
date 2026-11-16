// Customers' orders from their phones (server/Online.gs). Two parts:
//  - the shop that makes them (Salwa): the new orders first, a call to confirm, accept or refuse with a reason,
//    sent with a driver, delivered; the products sold out today;
//  - the admin's settings: the products offered (and the trays, which are required), their photos, the fees, the
//    days and hours, the notice, the WhatsApp number, the terms, the blocked numbers, the page's link for each shop.
// The list is kept between visits and read again in the background (every 30 s while the screen is open).
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, dialog, fmtNum } from '../ui.js';
import { shrink } from '../photos.js';

let tab = '';
let cached = null;            // the last list, shown at once on the next visit
let timer = null;
const money = (n) => fmtNum(Math.round(Number(n || 0) * 100) / 100) + ' ' + t('ol_qr');
const nameOf = (x) => Data.nameOf(x);
const OPEN = ['new', 'accepted', 'handed', 'out'];
// delivered, paid on delivery, and the money not yet with the cashier: still to do
const cashOpen = (o) => o.status === 'delivered' && o.pay !== 'shop' && !o.cash_received_at;
// a step pressed shows at once; it is sent in the background, and a list read meanwhile keeps it until the server has it
const NEXT = { 'online.accept': 'accepted', 'online.hand': 'handed', 'online.reject': 'rejected', 'online.cashIn': 'delivered' };
const pending = {};

export function render(root) {
  const b = Data.boot || {};
  const keys = [].concat(b.online_mine ? ['orders', 'done'] : [], b.online_drive >= 0 ? ['drive'] : [], b.online_pay >= 0 ? ['pay'] : [],
    b.online_pay >= 0 || (Data.user || {}).role === 'admin' ? ['trays'] : [], Data.can('online.settings') ? ['settings'] : []);
  if (!keys.includes(tab)) tab = keys[0];
  const box = h('div');
  const bar = h('div.tabs.lpo-sections');
  const draw = () => {
    clearInterval(timer); timer = null;
    bar.replaceChildren(...keys.map((k) => h('button', { type: 'button', class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, t('ol_tab_' + k))));
    if (tab === 'settings') settings(box); else if (tab === 'drive') driverOrders(box); else if (tab === 'pay') payOrders(box); else if (tab === 'trays') trayOrders(box); else orders(box);
  };
  root.replaceChildren(keys.length > 1 ? bar : '', box);
  if (!keys.length) { box.append(h('p.empty', t('ol_not_shop'))); return; }
  draw();
  return () => { clearInterval(timer); timer = null; };
}

// ---------- the shop
function orders(box) {
  const list = h('div.ol-list');
  const out = h('div.ol-out');
  box.replaceChildren(out, list);
  const show = (d) => {
    cached = d;
    d.orders.forEach((o) => { if (pending[o.no]) Object.assign(o, pending[o.no]); });
    // the number on the menu follows the list
    const fresh = d.orders.filter((o) => o.status === 'new').length;
    if (Data.boot && Data.boot.online_new !== fresh) { Data.boot.online_new = fresh; window.dispatchEvent(new Event('moro:badge')); }
    const late = (o) => o.status === 'new' && !o.called_at && (Date.now() - Date.parse(o.created_at)) / 60000 > (d.reply_min || 15);
    const rows = d.orders.filter((o) => (tab === 'done' ? !OPEN.includes(o.status) && !cashOpen(o) : OPEN.includes(o.status) || cashOpen(o)))
      .sort((a, b) => (tab === 'done' ? 0 : (OPEN.indexOf(a.status) - OPEN.indexOf(b.status)) || String(a.date + a.time).localeCompare(String(b.date + b.time))));
    list.replaceChildren(...(rows.length ? rows.map((o) => card(o, d, late(o), reload, () => show(d))) : [h('p.empty', t(tab === 'done' ? 'ol_none_done' : 'ol_none'))]));
    // sold out today: one tap per product
    out.replaceChildren(tab === 'done' || !d.items.length ? '' : h('details.ol-sold', h('summary', '🚫 ' + t('ol_sold_out'), ' ',
      h('small.muted', d.items.filter((i) => i.out).length ? t('ol_sold_n', { n: d.items.filter((i) => i.out).length }) : '')),
      h('div.ol-chips', d.items.map((i) => h('button.chip', { type: 'button', class: i.out ? 'ol-off' : '', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { await call('online.soldOut', { item_id: i.id, out: !i.out }); i.out = !i.out; show(d); } catch (ex) { toast(errText(ex), 'err'); e.currentTarget.disabled = false; }
      } }, (i.out ? '✕ ' : '') + nameOf(i))))));
  };
  async function reload() {
    try { const d = await call('online.list'); if (box.isConnected) show(d); } catch (e) { if (!cached) list.replaceChildren(h('p.empty', errText(e))); }
  }
  if (cached) show(cached); else list.replaceChildren(h('p.empty', t('refreshing')));
  reload();
  timer = setInterval(() => { if (!box.isConnected) { clearInterval(timer); timer = null; return; } if (document.visibilityState === 'visible') reload(); }, 30000);
}

function card(o, d, late, reload, redraw) {
  const act = async (btn, action, extra) => {
    const before = Object.assign({}, o);
    const change = { status: NEXT[action] };
    if (extra && extra.driver !== undefined) change.driver = extra.driver;
    if (extra && extra.reason) change.reason = extra.reason;
    if (action === 'online.cashIn') change.cash_received_at = new Date().toISOString();
    pending[o.no] = change;
    Object.assign(o, change);
    redraw();
    toast(o.no + ' · ' + t('ol_st_' + change.status), 'ok');
    try { const r = await call(action, Object.assign({ no: o.no }, extra || {})); delete pending[o.no]; Object.assign(o, r.order); redraw(); }
    catch (e) { delete pending[o.no]; Object.assign(o, before); redraw(); toast(errText(e), 'err'); }
  };
  const tel = 'tel:+974' + String(o.phone || '').replace(/\D/g, '').replace(/^974/, '');
  const btns = [];
  if (o.status === 'new' || o.status === 'accepted') btns.push(h('a.btn.secondary', { href: tel, onclick: () => { if (!o.called_at) call('online.called', { no: o.no }).then(() => { o.called_at = new Date().toISOString(); }).catch(() => {}); } }, '📞 ' + t('ol_call')));
  if (o.status === 'new') btns.push(h('button.btn', { type: 'button', onclick: (e) => act(e.currentTarget, 'online.accept') }, '✓ ' + t('ol_accept')));
  const unpaid = o.pay === 'shop' && !o.paid_at;
  // given to a driver at the shop; the driver confirms when they leave with it, and delivers it
  if ((o.status === 'accepted' && !unpaid) || o.status === 'handed') btns.push(h('button.btn', { type: 'button', class: o.status === 'handed' ? 'secondary' : '', onclick: async (e) => {
    const btn = e.currentTarget;
    if (!d.drivers.length) { toast(t('ol_no_drivers'), 'err'); return; }
    const driver = await dialog((close) => {
      const sel = h('select.input', d.drivers.map((x) => h('option', { value: x.id }, x.name)));
      if (o.driver) sel.value = o.driver;
      return [h('h3', t('ol_hand')), h('p.muted', t('ol_hand_hint')), h('div.field', h('label', t('ol_driver')), sel),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(undefined) }, t('cancel')), h('button.btn', { type: 'button', onclick: () => close(sel.value) }, t('ol_hand')))];
    });
    if (driver) act(btn, 'online.hand', { driver });
  } }, o.status === 'handed' ? '🔁 ' + t('ol_change_driver') : '🤝 ' + t('ol_hand')));
  // the money of a delivery: the cashier confirms they have it from the driver
  if (cashOpen(o)) btns.push(h('button.btn', { type: 'button', onclick: async (e) => {
    const btn = e.currentTarget;
    const ok = await dialog((close) => [h('h3', t('ol_cash_q', { m: money(o.total) })), h('p.muted', t('ol_cash_from', { d: driverNameOf(o, d) })),
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')), h('button.btn', { type: 'button', onclick: () => close(true) }, t('ol_cash_got')))]);
    if (ok) act(btn, 'online.cashIn');
  } }, '💵 ' + t('ol_cash_got') + ' ' + money(o.total)));
  if (o.status === 'new' || o.status === 'accepted') btns.push(h('button.btn.danger', { type: 'button', onclick: async (e) => {
    const btn = e.currentTarget;
    const reason = await dialog((close) => {
      const ta = h('textarea.input', { rows: 3, placeholder: t('ol_reason_ph') });
      return [h('h3', t('ol_reject')), h('p.muted', t('ol_reason_hint')), ta,
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close('') }, t('cancel')), h('button.btn.danger', { type: 'button', onclick: () => close(ta.value.trim()) }, t('ol_reject')))];
    });
    if (reason) act(btn, 'online.reject', { reason });
  } }, t('ol_reject')));
  const driverName = driverNameOf(o, d);
  return h('div.ol-card', { class: 'st-' + o.status + (late ? ' late' : '') },
    h('div.ol-top', h('b.num', o.no), h('span.ol-pill', { class: o.status }, t('ol_st_' + o.status)), pending[o.no] ? h('span.ol-pill.called', '⏳') : '', late ? h('span.ol-pill.late', '⏰ ' + t('ol_late')) : '',
      o.called_at && o.status === 'new' ? h('span.ol-pill.called', '📞 ' + t('ol_called')) : '', h('span.ol-when', '🗓 ', h('bdi', o.date + ' ' + o.time))),
    o.delivered_at ? h('div.ol-delivered', '✔ ' + t('ol_delivered_at', { t: fmtTime(o.delivered_at) })) : '',
    h('div.ol-who', h('b', h('bdi', o.name)), ' · ', h('a', { href: tel, dir: 'ltr' }, o.phone)),
    h('div.ol-addr', '📍 ', h('bdi', o.address), o.map ? [' ', h('a', { href: o.map, target: '_blank', rel: 'noopener' }, t('ol_map'))] : ''),
    h('div.ol-lines', o.lines.map((l) => h('div', h('bdi', fmtNum(l.qty) + ' × ' + nameOf(l)), l.req ? h('small.muted', ' (' + t('ol_tray') + ')') : ''))),
    o.note ? h('div.ol-note', '📝 ', h('bdi', o.note)) : '',
    h('div.ol-sum', h('span', t('ol_goods') + ' ' + money(o.goods)), o.fee_total ? h('span', t('ol_fees') + ' ' + money(o.fee_total)) : '',
      o.deposit ? h('span', t('ol_deposit') + ' ' + money(o.deposit)) : '', h('b', t('ol_total') + ' ' + money(o.total))),
    payLine(o),
    o.reason && o.status !== 'cancelled' ? h('div.ol-note', t('reason') + ': ', h('bdi', o.reason)) : '',
    // not paid in time: a ready WhatsApp message for the customer
    o.status === 'cancelled' && o.reason === 'unpaid' ? h('div.ol-note', t('ol_unpaid_cancel'), ' ',
      h('a.btn.secondary', { href: 'https://wa.me/974' + String(o.phone).replace(/\D/g, '').replace(/^974/, '') + '?text=' + encodeURIComponent(t('ol_unpaid_msg', { no: o.no })), target: '_blank', rel: 'noopener' }, '💬 ' + t('ol_wa_customer'))) : '',
    driverName ? h('div.ol-driver', '🚚 ' + driverName + ' · ' + t('ol_drv_' + (o.status === 'handed' ? 'handed' : o.status === 'out' ? 'out' : 'done'))
      + (cashOpen(o) ? ' · ' + t(o.cash_given_at ? 'ol_cash_given' : 'ol_cash_with', { m: money(o.total) }) : '') + (o.cash_received_at && o.pay !== 'shop' ? ' · ✅ ' + t('ol_cash_in') : '')) : '',
    btns.length ? h('div.ol-btns', btns) : '');
}

const driverNameOf = (o, d) => (o.driver ? ((d.drivers || []).find((x) => x.id === o.driver) || {}).name || '' : '');
const fmtTime = (iso) => { const x = String(iso || ''); return x.slice(11, 16) + ' · ' + x.slice(0, 10); };
/** How the order is paid: on delivery (the driver takes it), or cash at a shop (paid or waiting). */
function payLine(o) {
  if (o.pay !== 'shop') return h('div.ol-pay', '💵 ' + t('ol_pay_delivery') + (OPEN.includes(o.status) ? ' · ' + t('ol_collect', { m: money(o.total) }) : ''));
  return h('div.ol-pay', '🏪 ' + t('ol_pay_shop_in', { s: o.pay_shop_name || '' }) + ' · ',
    o.paid_at ? h('span.paid', '✅ ' + t('ol_paid_at', { s: o.paid_shop_name || '' })) : h('span.wait', '⏳ ' + t('ol_unpaid_yet')));
}

// ---------- the driver: the customers' orders they take
let driveCache = null;
function driverOrders(box) {
  const list = h('div.ol-list');
  box.replaceChildren(list);
  const show = (d) => {
    driveCache = d;
    const fresh = d.orders.filter((o) => o.status === 'out' || o.status === 'handed').length;
    if (Data.boot && Data.boot.online_drive !== fresh) { Data.boot.online_drive = fresh; window.dispatchEvent(new Event('moro:badge')); }
    const rank = (o) => ({ handed: 0, out: 1 })[o.status] ?? (cashOpen(o) ? 2 : 3);
    const rows = d.orders.slice().sort((a, b) => rank(a) - rank(b) || String(a.date + a.time).localeCompare(String(b.date + b.time)));
    list.replaceChildren(...(rows.length ? rows.map((o) => {
      const tel = 'tel:+974' + String(o.phone || '').replace(/\D/g, '').replace(/^974/, '');
      const map = o.map || 'https://maps.google.com/?q=' + encodeURIComponent(o.address);
      // a step shows at once and is sent in the background (back as it was if the server refuses it)
      const step = (action, change, label, cls) => h('button.btn' + (cls || ''), { type: 'button', onclick: async () => {
        const before = Object.assign({}, o);
        Object.assign(o, change); show(d); toast(o.no + ' · ' + label, 'ok');
        try { await call(action, { no: o.no }); } catch (e) { Object.assign(o, before); show(d); toast(errText(e), 'err'); }
      } }, label);
      const done = step('online.delivered', { status: 'delivered', delivered_at: new Date().toISOString() }, '✔ ' + t('ol_delivered'));
      return h('div.ol-card', { class: 'st-' + o.status },
        h('div.ol-top', h('b.num', o.no), h('span.ol-pill', { class: o.status }, t('ol_st_' + o.status)), h('span.ol-when', '🗓 ', h('bdi', o.date + ' ' + o.time))),
        h('div.ol-who', h('b', h('bdi', o.name)), ' · ', h('a', { href: tel, dir: 'ltr' }, o.phone)),
        h('div.ol-addr', '📍 ', h('bdi', o.address)),
        h('div.ol-lines', o.lines.map((l) => h('div', h('bdi', fmtNum(l.qty) + ' × ' + nameOf(l))))),
        o.note ? h('div.ol-note', '📝 ', h('bdi', o.note)) : '',
        o.pay === 'shop' ? h('div.ol-pay.paid', '✅ ' + t('ol_paid_nothing')) : h('div.ol-collect', t(cashOpen(o) ? (o.cash_given_at ? 'ol_cash_wait' : 'ol_cash_give') : o.cash_received_at ? 'ol_cash_done' : 'ol_collect', { m: money(o.total) })),
        o.status === 'handed' ? h('div.ol-btns', step('online.depart', { status: 'out' }, '🚚 ' + t('ol_depart'))) : '',
        o.status === 'out' ? h('div.ol-btns', h('a.btn.secondary', { href: tel }, '📞 ' + t('ol_call')), h('a.btn.secondary', { href: map, target: '_blank', rel: 'noopener' }, '🗺 ' + t('ol_map')), done) : '',
        cashOpen(o) && !o.cash_given_at ? h('div.ol-btns', step('online.cashGiven', { cash_given_at: new Date().toISOString() }, '💵 ' + t('ol_cash_gave'))) : '');
    }) : [h('p.empty', t('ol_drive_none'))]));
  };
  const reload = () => call('online.driverList').then((d) => { if (box.isConnected) show(d); }).catch((e) => { if (!driveCache) list.replaceChildren(h('p.empty', errText(e))); });
  if (driveCache) show(driveCache); else list.replaceChildren(h('p.empty', t('refreshing')));
  reload();
  timer = setInterval(() => { if (!box.isConnected) { clearInterval(timer); timer = null; return; } if (document.visibilityState === 'visible') reload(); }, 30000);
}

// ---------- any shop's cashier: orders paid in cash at the shop
let payCache = null;
function payOrders(box) {
  const q = h('input.input', { type: 'search', inputmode: 'search', placeholder: t('ol_pay_search') });
  const list = h('div.ol-list');
  box.replaceChildren(h('p.muted', t('ol_pay_hint')), q, list);
  const show = (d) => {
    payCache = d;
    const mine = d.orders.filter((o) => !o.paid && o.pay_shop === d.shop).length;
    if (Data.boot && Data.boot.online_pay !== mine) { Data.boot.online_pay = mine; window.dispatchEvent(new Event('moro:badge')); }
    const k = q.value.trim().toLowerCase().replace(/\s/g, '');
    const rows = d.orders.filter((o) => !k || o.no.toLowerCase().includes(k) || String(o.phone).includes(k))
      .sort((a, b) => (a.paid - b.paid) || ((b.pay_shop === d.shop) - (a.pay_shop === d.shop)) || String(a.pay_by).localeCompare(String(b.pay_by)));
    list.replaceChildren(...(rows.length ? rows.map((o) => h('div.ol-card', { class: o.paid ? 'st-delivered' : 'st-new' },
      h('div.ol-top', h('b.num', o.no), o.paid ? h('span.ol-pill.delivered', '✅ ' + t('ol_paid')) : h('span.ol-pill.new', '⏳ ' + t('ol_unpaid')),
        h('span.ol-when', t('ol_pay_by') + ' ', h('bdi', o.pay_by))),
      h('div.ol-who', h('b', h('bdi', o.name)), ' · ', h('span', { dir: 'ltr' }, '•••• ' + String(o.phone).slice(-4)), ' · 🏪 ', h('bdi', o.pay_shop_name)),
      h('div.ol-amount', money(o.total)),
      o.paid ? '' : h('div.ol-btns', h('button.btn', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        const ok = await dialog((close) => [h('h3', t('ol_pay_q', { no: o.no })), h('p.ol-amount', money(o.total)),
          h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')), h('button.btn', { type: 'button', onclick: () => close(true) }, t('ol_took')))]);
        if (!ok) return;
        btn.disabled = true; o.paid = true; show(d); toast(o.no + ' · ' + t('ol_paid'), 'ok');
        try { await call('online.pay', { no: o.no }); } catch (ex) { o.paid = false; show(d); toast(errText(ex), 'err'); }
      } }, '💵 ' + t('ol_took') + ' ' + money(o.total))))) : [h('p.empty', t('ol_pay_none'))]));
  };
  q.addEventListener('input', () => payCache && show(payCache));
  const reload = () => call('online.payList').then((d) => { if (box.isConnected) show(d); }).catch((e) => { if (!payCache) list.replaceChildren(h('p.empty', errText(e))); });
  if (payCache) show(payCache); else list.replaceChildren(h('p.empty', t('refreshing')));
  reload();
  timer = setInterval(() => { if (!box.isConnected) { clearInterval(timer); timer = null; return; } if (document.visibilityState === 'visible') reload(); }, 30000);
}

// ---------- any shop's cashier: the trays at the customers, taken back and their deposit paid
let trayCache = null;
function trayOrders(box) {
  const q = h('input.input', { type: 'search', inputmode: 'search', placeholder: t('ol_pay_search') });
  const list = h('div.ol-list');
  box.replaceChildren(h('p.muted', t('ol_trays_hint')), q, list);
  const canWa = !!(Data.boot || {}).online_mine;
  const show = (d) => {
    trayCache = d;
    const k = q.value.trim().toLowerCase().replace(/\s/g, '');
    const today = new Date().toISOString().slice(0, 10);
    const rows = d.orders.filter((o) => !k || o.no.toLowerCase().includes(k) || String(o.phone).includes(k))
      .sort((a, b) => (b.out > 0) - (a.out > 0) || String(a.until).localeCompare(String(b.until)));
    list.replaceChildren(...(rows.length ? rows.map((o) => {
      const late = o.until && o.until < today;
      return h('div.ol-card', { class: o.out ? 'st-new' : 'st-delivered' },
        h('div.ol-top', h('b.num', o.no), o.out ? h('span.ol-pill.new', '🧺 ' + t('ol_trays_out', { n: o.out })) : h('span.ol-pill.delivered', '✅ ' + t('ol_trays_all_back')),
          h('span.ol-when', { class: late ? 'late' : '' }, t('ol_trays_until') + ' ', h('bdi', o.until))),
        h('div.ol-who', h('b', h('bdi', o.name)), ' · ', h('span', { dir: 'ltr' }, '•••• ' + String(o.phone).slice(-4)), ' · ', t('ol_per_tray_dep', { m: money(o.per) })),
        o.today_back ? h('small.muted', t('ol_trays_today', { n: o.today_back })) : '',
        o.out ? h('div.ol-btns', h('button.btn', { type: 'button', onclick: async (e) => {
          const btn = e.currentTarget;
          const n = await dialog((close) => {
            const inp = h('input.input', { type: 'number', min: 1, max: o.out, value: o.out, inputmode: 'numeric' });
            const pay = h('p.ol-amount', money(o.out * o.per));
            inp.addEventListener('input', () => { pay.textContent = money(Math.min(o.out, Math.max(0, Number(inp.value) || 0)) * o.per); });
            return [h('h3', t('ol_trays_q', { no: o.no })), h('div.field', h('label', t('ol_trays_n', { n: o.out })), inp), h('p.muted', t('ol_trays_pay')), pay,
              h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(0) }, t('cancel')), h('button.btn', { type: 'button', onclick: () => close(Number(inp.value) || 0) }, t('ol_trays_ok')))];
          });
          if (!(n > 0)) return;
          if (n > o.out) { toast(t('err.online_trays_too_many', { d: o.out }), 'err'); return; }
          btn.disabled = true;
          const before = o.out;
          o.out -= n; o.today_back = (o.today_back || 0) + n; show(d); toast(o.no + ' · ' + t('ol_trays_paid', { m: money(n * o.per) }), 'ok');
          try { await call('online.trayReturn', { no: o.no, n }); } catch (ex) { o.out = before; o.today_back -= n; show(d); toast(errText(ex), 'err'); }
        } }, '🧺 ' + t('ol_trays_btn')),
        canWa ? h('a.btn.secondary', { href: 'https://wa.me/974' + String(o.phone).replace(/\D/g, '').replace(/^974/, '') + '?text=' + encodeURIComponent(t('ol_trays_msg', { no: o.no, n: o.out, d: o.until, m: money(o.out * o.per) })), target: '_blank', rel: 'noopener' }, '💬 ' + t('ol_remind'))
          : '') : '');
    }) : [h('p.empty', t('ol_trays_none'))]));
  };
  q.addEventListener('input', () => trayCache && show(trayCache));
  const reload = () => call('online.trays').then((d) => { if (box.isConnected) show(d); }).catch((e) => { if (!trayCache) list.replaceChildren(h('p.empty', errText(e))); });
  if (trayCache) show(trayCache); else list.replaceChildren(h('p.empty', t('refreshing')));
  reload();
}

// ---------- the admin's settings
const DAYS = [0, 1, 2, 3, 4, 5, 6];
let setCache = null;
function settings(box) {
  // the last settings at once; the server's are drawn when they differ, unless something was already changed here
  let touched = false;
  const mark = () => { touched = true; };
  box.addEventListener('input', mark); box.addEventListener('change', mark);
  if (setCache) drawSettings(box, JSON.parse(setCache)); else box.replaceChildren(h('p.empty', t('refreshing')));
  call('online.settings').then((s) => {
    const j = JSON.stringify(s);
    if (j !== setCache && !touched && box.isConnected) { setCache = j; drawSettings(box, s); } else setCache = setCache || j;
  }).catch((e) => { if (!setCache) box.replaceChildren(h('p.empty', errText(e))); });
}
function drawSettings(box, s) {
  const cfg = JSON.parse(JSON.stringify(s.cfg));
  const marks = Object.fromEntries(s.items.map((i) => [i.id, { online: i.online, req: i.req }]));
  const num = (k, attrs) => { const i = h('input.input', Object.assign({ type: 'number', inputmode: 'numeric', value: cfg[k] }, attrs || {})); i.addEventListener('input', () => { cfg[k] = i.value; }); return i; };
  const text = (k, attrs) => { const i = h(attrs && attrs.rows ? 'textarea.input' : 'input.input', Object.assign({}, attrs || {})); i.value = cfg[k] || ''; i.addEventListener('input', () => { cfg[k] = i.value; }); return i; };
  const shopSel = h('select.input', s.shops.map((p) => h('option', { value: p.id }, p.name)));
  shopSel.value = cfg.shop; shopSel.addEventListener('change', () => { cfg.shop = shopSel.value; });

  // the products: offered, a tray (required), the photo
  const search = h('input.input', { type: 'search', placeholder: t('lookup_hint') });
  const prodBox = h('div.ol-prods');
  const drawProds = () => {
    const q = search.value.trim().toLowerCase();
    const rows = s.items.filter((i) => !q || (i.name + ' ' + i.name_ar).toLowerCase().includes(q))
      .sort((a, b) => (marks[b.id].online - marks[a.id].online) || (a.name < b.name ? -1 : 1));
    prodBox.replaceChildren(...rows.slice(0, 120).map((i) => {
      const m = marks[i.id];
      const on = h('input', { type: 'checkbox', checked: m.online });
      const req = h('input', { type: 'checkbox', checked: m.req, disabled: !m.online });
      on.addEventListener('change', () => { m.online = on.checked; if (!on.checked) m.req = false; drawProds(); });
      req.addEventListener('change', () => { m.req = req.checked; });
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
      const ph = h('button.btn.secondary.ol-ph-btn', { type: 'button', onclick: () => file.click() }, i.photo ? '🖼 ' + t('ol_photo_change') : '📷 ' + t('ol_photo_add'));
      file.addEventListener('change', async () => {
        const f = file.files[0]; if (!f) return;
        ph.disabled = true;
        try { const data = await shrink(f); const r = await call('online.setPhoto', { item_id: i.id, photo: data }); i.photo = r.photo; setCache = null; toast(t('saved'), 'ok'); drawProds(); }
        catch (e) { toast(errText(e), 'err'); ph.disabled = false; }
      });
      return h('div.ol-prod', { class: m.online ? 'on' : '' }, h('label.ol-ck', on, h('span', h('bdi', nameOf(i)), h('small.muted', ' ' + money(i.price)))),
        m.online ? h('label.ol-ck.small', req, h('span', t('ol_is_tray'))) : '', m.online ? ph : '', file);
    }));
  };
  search.addEventListener('input', drawProds);
  drawProds();

  // the fees
  const feeBox = h('div.ol-fees');
  const drawFees = () => {
    feeBox.replaceChildren(...cfg.fees.map((f, n) => {
      const inp = (k, attrs) => { const i = h('input.input', Object.assign({ value: f[k] === undefined ? '' : f[k] }, attrs)); i.addEventListener('input', () => { f[k] = i.value; }); return i; };
      const per = h('select.input', h('option', { value: 'tray' }, t('ol_per_tray')), h('option', { value: 'order' }, t('ol_per_order')));
      per.value = f.per || 'order'; per.addEventListener('change', () => { f.per = per.value; });
      const ref = h('input', { type: 'checkbox', checked: f.refundable === true });
      ref.addEventListener('change', () => { f.refundable = ref.checked; });
      return h('div.ol-fee', inp('name_ar', { placeholder: t('ol_fee_ar') }), inp('name_en', { placeholder: t('ol_fee_en'), dir: 'ltr' }),
        inp('amount', { type: 'number', inputmode: 'decimal', step: 'any', placeholder: t('ol_amount') }), per,
        h('label.ol-ck.small', ref, h('span', t('ol_refundable'))),
        h('button.btn.secondary', { type: 'button', onclick: () => { cfg.fees.splice(n, 1); drawFees(); } }, '✕'));
    }), h('button.btn.secondary', { type: 'button', onclick: () => { cfg.fees.push({ name_ar: '', name_en: '', amount: '', per: 'tray', refundable: true }); drawFees(); } }, '+ ' + t('ol_add_fee')));
  };
  drawFees();

  // the days and hours
  const hours = h('div.ol-hours', DAYS.map((d) => {
    const x = cfg.hours[d] || (cfg.hours[d] = { from: '10:00', to: '22:00', off: false });
    const from = h('input.input', { type: 'time', value: x.from, step: 1800 }), to = h('input.input', { type: 'time', value: x.to, step: 1800 });
    const off = h('input', { type: 'checkbox', checked: x.off });
    const sync = () => { x.from = from.value; x.to = to.value; x.off = off.checked; from.disabled = to.disabled = off.checked; };
    [from, to, off].forEach((i) => i.addEventListener('change', sync));
    from.disabled = to.disabled = x.off;
    return h('div.ol-day', h('b', t('ol_day_' + d)), from, h('span', '–'), to, h('label.ol-ck.small', off, h('span', t('ol_day_off'))));
  }));

  const blocked = h('textarea.input', { rows: 3, dir: 'ltr', placeholder: '5555 1234' });
  blocked.value = (s.blocked || []).join('\n');

  // the page's link for each shop (its QR is printed from it)
  const base = location.origin + location.pathname.replace(/[^/]*$/, '') + 'order.html';
  const links = h('div.ol-links', s.shops.map((p) => {
    const url = base + '?shop=' + encodeURIComponent(p.id);
    return h('div.ol-link', h('b', h('bdi', p.name)), h('a', { href: url, target: '_blank', rel: 'noopener', dir: 'ltr' }, url),
      h('button.btn.secondary', { type: 'button', onclick: () => navigator.clipboard.writeText(url).then(() => toast(t('ol_copied'), 'ok')).catch(() => {}) }, t('ol_copy')));
  }));

  const save = h('button.btn.block', { type: 'button', onclick: async () => {
    save.disabled = true;
    const items = s.items.filter((i) => marks[i.id].online !== i.online || marks[i.id].req !== i.req).map((i) => ({ item_id: i.id, online: marks[i.id].online, req: marks[i.id].req }));
    try {
      await call('online.saveSettings', { cfg, items, blocked: blocked.value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean) });
      items.forEach((x) => { const i = s.items.find((y) => y.id === x.item_id); i.online = x.online; i.req = x.req; });
      setCache = null;
      toast(t('saved'), 'ok');
    } catch (e) { toast(errText(e), 'err'); }
    save.disabled = false;
  } }, t('save'));

  const sec = (title, ...kids) => h('section.card', h('h2', title), ...kids);
  box.replaceChildren(h('div.ol-set',
    sec(t('ol_s_products'), h('p.muted', t('ol_products_hint')), search, prodBox),
    sec(t('ol_s_rules'),
      h('div.ol-grid2', h('div.field', h('label', t('ol_shop')), shopSel), h('div.field', h('label', t('ol_whatsapp')), text('whatsapp', { dir: 'ltr', inputmode: 'tel' })),
        h('div.field', h('label', t('ol_min_req')), num('min_req', { min: 0 })), h('div.field', h('label', t('ol_lead')), num('lead_min', { min: 0 })),
        h('div.field', h('label', t('ol_reply')), num('reply_min', { min: 1 })), h('div.field', h('label', t('ol_max_open')), num('max_open', { min: 1 })),
        h('div.field', h('label', t('ol_return_days')), num('return_days', { min: 0 })),
        h('div.field', h('label', t('ol_pay_min')), num('pay_min', { min: 15 })),
        h('label.ol-ck', (() => { const c = h('input', { type: 'checkbox', checked: cfg.pay_shop !== false }); c.addEventListener('change', () => { cfg.pay_shop = c.checked; }); return c; })(), h('span', t('ol_pay_shop_on'))))),
    sec(t('ol_s_fees'), h('p.muted', t('ol_fees_hint')), feeBox),
    sec(t('ol_s_hours'), hours),
    sec(t('ol_s_terms'), h('p.muted', t('ol_terms_hint')), h('div.field', h('label', 'العربية'), text('terms_ar', { rows: 4 })),
      h('div.field', h('label', 'English'), text('terms_en', { rows: 4, dir: 'ltr' }))),
    sec(t('ol_s_blocked'), h('p.muted', t('ol_blocked_hint')), blocked),
    sec(t('ol_s_links'), h('p.muted', t('ol_links_hint')), links),
    save));
}
