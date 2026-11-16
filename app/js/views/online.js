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
const OPEN = ['new', 'accepted', 'out'];
// a step pressed shows at once; it is sent in the background, and a list read meanwhile keeps it until the server has it
const NEXT = { 'online.accept': 'accepted', 'online.out': 'out', 'online.delivered': 'delivered', 'online.reject': 'rejected' };
const pending = {};

export function render(root) {
  const keys = [].concat((Data.boot || {}).online_mine ? ['orders', 'done'] : [], Data.can('online.settings') ? ['settings'] : []);
  if (!keys.includes(tab)) tab = keys[0];
  const box = h('div');
  const bar = h('div.tabs.lpo-sections');
  const draw = () => {
    clearInterval(timer); timer = null;
    bar.replaceChildren(...keys.map((k) => h('button', { type: 'button', class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, t('ol_tab_' + k))));
    if (tab === 'settings') settings(box); else orders(box);
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
    const rows = d.orders.filter((o) => (tab === 'done' ? !OPEN.includes(o.status) : OPEN.includes(o.status)))
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
  if (o.status === 'accepted') btns.push(h('button.btn', { type: 'button', onclick: async (e) => {
    const btn = e.currentTarget;
    if (!d.drivers.length) return act(btn, 'online.out');
    const driver = await dialog((close) => {
      const sel = h('select.input', h('option', { value: '' }, t('ol_no_driver')), d.drivers.map((x) => h('option', { value: x.id }, x.name)));
      return [h('h3', t('ol_send')), h('div.field', h('label', t('ol_driver')), sel),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(undefined) }, t('cancel')), h('button.btn', { type: 'button', onclick: () => close(sel.value) }, t('ol_send')))];
    });
    if (driver !== undefined) act(btn, 'online.out', { driver });
  } }, '🚚 ' + t('ol_send')));
  if (o.status === 'out' || o.status === 'accepted') btns.push(h('button.btn', { type: 'button', class: o.status === 'accepted' ? 'secondary' : '', onclick: (e) => act(e.currentTarget, 'online.delivered') }, '✔ ' + t('ol_delivered')));
  if (o.status === 'new' || o.status === 'accepted') btns.push(h('button.btn.danger', { type: 'button', onclick: async (e) => {
    const btn = e.currentTarget;
    const reason = await dialog((close) => {
      const ta = h('textarea.input', { rows: 3, placeholder: t('ol_reason_ph') });
      return [h('h3', t('ol_reject')), h('p.muted', t('ol_reason_hint')), ta,
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close('') }, t('cancel')), h('button.btn.danger', { type: 'button', onclick: () => close(ta.value.trim()) }, t('ol_reject')))];
    });
    if (reason) act(btn, 'online.reject', { reason });
  } }, t('ol_reject')));
  const driverName = o.driver ? ((d.drivers.find((x) => x.id === o.driver) || {}).name || '') : '';
  return h('div.ol-card', { class: 'st-' + o.status + (late ? ' late' : '') },
    h('div.ol-top', h('b.num', o.no), h('span.ol-pill', { class: o.status }, t('ol_st_' + o.status)), pending[o.no] ? h('span.ol-pill.called', '⏳') : '', late ? h('span.ol-pill.late', '⏰ ' + t('ol_late')) : '',
      o.called_at && o.status === 'new' ? h('span.ol-pill.called', '📞 ' + t('ol_called')) : '', h('span.ol-when', '🗓 ', h('bdi', o.date + ' ' + o.time))),
    h('div.ol-who', h('b', h('bdi', o.name)), ' · ', h('a', { href: tel, dir: 'ltr' }, o.phone)),
    h('div.ol-addr', '📍 ', h('bdi', o.address), o.map ? [' ', h('a', { href: o.map, target: '_blank', rel: 'noopener' }, t('ol_map'))] : ''),
    h('div.ol-lines', o.lines.map((l) => h('div', h('bdi', fmtNum(l.qty) + ' × ' + nameOf(l)), l.req ? h('small.muted', ' (' + t('ol_tray') + ')') : ''))),
    o.note ? h('div.ol-note', '📝 ', h('bdi', o.note)) : '',
    h('div.ol-sum', h('span', t('ol_goods') + ' ' + money(o.goods)), o.fee_total ? h('span', t('ol_fees') + ' ' + money(o.fee_total)) : '',
      o.deposit ? h('span', t('ol_deposit') + ' ' + money(o.deposit)) : '', h('b', t('ol_total') + ' ' + money(o.total)), h('span.muted', '💵 ' + t('ol_pay_delivery'))),
    o.reason && o.status !== 'cancelled' ? h('div.ol-note', t('reason') + ': ', h('bdi', o.reason)) : '',
    driverName ? h('small.muted', '🚚 ' + driverName) : '',
    btns.length ? h('div.ol-btns', btns) : '');
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
        h('div.field', h('label', t('ol_return_days')), num('return_days', { min: 0 })))),
    sec(t('ol_s_fees'), h('p.muted', t('ol_fees_hint')), feeBox),
    sec(t('ol_s_hours'), hours),
    sec(t('ol_s_terms'), h('p.muted', t('ol_terms_hint')), h('div.field', h('label', 'العربية'), text('terms_ar', { rows: 4 })),
      h('div.field', h('label', 'English'), text('terms_en', { rows: 4, dir: 'ltr' }))),
    sec(t('ol_s_blocked'), h('p.muted', t('ol_blocked_hint')), blocked),
    sec(t('ol_s_links'), h('p.muted', t('ol_links_hint')), links),
    save));
}
