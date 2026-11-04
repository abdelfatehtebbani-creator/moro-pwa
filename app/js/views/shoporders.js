// Shop orders (from the cashiers' system, Masar): each storekeeper sees the lines of their own
// stores, prepares them and hands them to distribution, or marks what cannot be supplied.
// The purchasing officer also sees the shortages of every store and the special purchase requests.
import { call } from '../api.js';
import { Data, STORES } from '../data.js';
import { Outbox } from '../outbox.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, fmtDate, trackFilled, dialog } from '../ui.js';
import { combo, field, storePill, newId } from '../components.js';
import { photoButton } from '../photos.js';

let tab = 'open';
let group = '';            // the department or store tab
let cleanup = null;
// the last lines of each tab: shown at once when the screen opens, then checked against the server
const last = {};

export async function render(root) {
  if (cleanup) cleanup();
  const tabs = h('div.tabs');
  const body = h('div');
  const names = { open: t('shop_open'), shortage: t('shop_shortage'), special: t('special_requests'), done: t('shop_done') };
  const may = { shortage: 'shop.shortage', special: 'special.list' };
  if (may[tab] && !Data.can(may[tab])) tab = 'open';
  Object.keys(names).filter((k) => !may[k] || Data.can(may[k])).forEach((k) =>
    tabs.append(h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; render(root); } }, names[k])));
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('shoporders')), tabs), body));

  // quantities typed and not yet sent stay as they were through a refresh; the screen is drawn again only when
  // the lines changed, and where it was scrolled to stays
  const toBuy = (l) => l.special && l.dept === 'PURCHASE';
  const draw = (got) => {
    const typed = new Map([...body.querySelectorAll('input[data-key]')].filter((x) => x.value !== x.defaultValue).map((x) => [x.dataset.key, x.value]));
    const y = window.scrollY;
    if (tab === 'special') drawSpecial(got.reqs, got.open.filter(toBuy));
    else drawLines(got.lines.filter((l) => tab !== 'open' || !toBuy(l)));
    body.querySelectorAll('input[data-key]').forEach((x) => { if (typed.has(x.dataset.key)) { x.value = typed.get(x.dataset.key); x.dispatchEvent(new Event('input')); } });
    window.scrollTo(0, y);
  };
  let shown = '';
  const load = async (quiet) => {
    const key = tab;
    // what was there last time, at once (the server is asked meanwhile)
    if (quiet !== true) { if (last[key]) { shown = JSON.stringify(last[key]); draw(last[key]); } else body.replaceChildren(h('p.empty', '…')); }
    try {
      const got = tab === 'special'
        ? await Promise.all([call('special.list', { status: 'pending' }), call('shop.list', { status: 'open', native: true })]).then(([reqs, open]) => ({ reqs, open }))
        : { lines: await call('shop.list', { status: tab, native: true }) };
      if (key !== tab) return;
      last[key] = got;
      const now = JSON.stringify(got);
      if (now === shown) return;                 // nothing changed: the screen stays as it is
      shown = now;
      draw(got);
    } catch (e) { if (!last[key]) body.replaceChildren(h('p.empty', errText(e))); }
  };
  // a save sent and the data refreshed after it come one after the other: one reload for both
  let soon = null;
  const reloadSoon = () => { clearTimeout(soon); soon = setTimeout(() => load(true), 800); };

  const shopName = (id) => (Data.parties.get(id) || {}).name || id;
  const itemOf = (id) => Data.items.get(id) || { name: id, unit: '' };

  function drawLines(lines) {
    if (!lines.length) { body.replaceChildren(h('p.empty', t('no_rows'))); return; }
    if (tab === 'shortage') {
      body.replaceChildren(h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('store')), h('th', t('shop')),
        h('th', t('order_no')), h('th', t('missing')), h('th', t('balance')))),
        h('tbody', lines.map((l) => h('tr', h('td.wrap', h('bdi', Data.nameOf(itemOf(l.item_id)))), h('td', storePill(l.store)),
          h('td.wrap', h('bdi', shopName(l.shop_party_id))), h('td.num', l.order_no || l.order_id),
          h('td.num.qty-neg', fmtNum(l.shortage) + ' ' + l.unit), h('td.num', fmtNum(Data.qty(l.item_id)))))))));
      return;
    }
    // a tab per department (final products) and per store, when the lines belong to more than one
    const groupOf = (l) => (l.special ? (l.dept === 'PURCHASE' ? 'p:' : 'd:' + l.dept) : l.store === 'FINAL' && l.dept ? 'd:' + l.dept : 's:' + l.store);
    const groupName = (g) => (g === 'p:' ? t('route_purchase') : g.startsWith('d:') ? ((Data.parties.get(g.slice(2)) || {}).name || g.slice(2)) : t('store_' + g.slice(2)));
    const groups = [...new Set(lines.map(groupOf))].sort((a, b) => (a[0] === b[0] ? groupName(a).localeCompare(groupName(b)) : a < b ? -1 : 1));
    if (!groups.includes(group)) group = groups.length > 1 ? '' : groups[0];
    const groupBar = groups.length > 1 ? h('div.tabs.shop-groups', h('button', { type: 'button', class: group === '' ? 'on' : '', onclick: () => { group = ''; drawLines(lines); } }, t('order_st_all')),
      groups.map((g) => h('button', { type: 'button', class: group === g ? 'on' : '', onclick: () => { group = g; drawLines(lines); } },
        h('bdi', groupName(g)), ' ', h('small', String(lines.filter((l) => groupOf(l) === g).length))))) : null;
    const shown = group ? lines.filter((l) => groupOf(l) === group) : lines;
    // one card per order
    const orders = new Map();
    shown.forEach((l) => { if (!orders.has(l.order_id)) orders.set(l.order_id, []); orders.get(l.order_id).push(l); });
    body.replaceChildren(groupBar || '', ...[...orders.values()].map((ls) => orderCard(ls)));
  }

  function orderCard(ls) {
    const first = ls[0];
    const inputs = [];
    const rows = ls.map((l) => {
      const it = itemOf(l.item_id);
      const left = Math.max(0, Math.round((l.qty - l.handed_qty) * 1e6) / 1e6);
      // a line already sent for handing and not yet answered by the server: shown as sending, no second press
      const sending = Outbox.queued('shop.hand').some((j) => (j.payload.lines || []).some((x) => x.line_id === l.line_id));
      const open = (tab === 'open' || tab === 'special') && left > 0 && l.approved !== false && l.can && !sending;
      const inp = open ? trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, 'data-key': l.line_id, value: (l.special ? left : Math.min(left, l.reserved_qty)) || '' })) : null;
      // bought by purchasing: to distribution, or straight to the shop
      const dest = inp && l.special && l.dept === 'PURCHASE' ? h('select.input.small', h('option', { value: '' }, '—'), h('option', { value: 'dist' }, t('hand_to_dist_short')), h('option', { value: 'shop' }, t('hand_to_shop'))) : null;
      if (inp) inputs.push({ line: l, inp, left, dest });
      const canBack = !l.special && l.handed_qty - (l.returned_qty || 0) > 0;
      const no = h('span', open ? h('button.link', { type: 'button', onclick: () => cannot(l) }, t('cannot_supply')) : '',
        canBack && l.can ? h('button.link', { type: 'button', onclick: () => notSent(l) }, ' ' + t('not_sent')) : '');
      const state = tab === 'done' ? h('span', { class: 'pill ' + ({ handed: 'in', unavailable: 'low', cancelled: 'out' }[l.status] || 'soon') },
        t('line_' + l.status)) : l.approved === false ? h('span.pill.soon', t('awaiting_approval'))
        : (l.shortage > 0 ? h('span.pill.low', t('missing') + ' ' + fmtNum(l.shortage)) : '');
      const where = l.special ? h('span.pill.st-final', h('bdi', l.dept === 'PURCHASE' ? t('route_purchase') : (Data.parties.get(l.dept) || {}).name || l.dept))
        : l.store === 'FINAL' && l.dept ? h('span.pill.st-final', h('bdi', (Data.parties.get(l.dept) || {}).name || l.dept)) : storePill(l.store);
      const label = l.special ? h('span', h('span.pill.soon', t('special')), ' ', h('bdi', l.description), ' ', h('small.err-text', '⏰ ' + l.deadline), ' ', photoButton(l.photos) || '')
        : h('bdi', Data.nameOf(it));
      return h('tr', h('td.wrap', label), h('td', where), h('td.num', fmtNum(l.qty) + ' ' + l.unit),
        h('td.num', fmtNum(l.handed_qty), l.returned_qty ? h('small.qty-neg', ' −' + fmtNum(l.returned_qty)) : ''), h('td.num', fmtNum(l.reserved_qty)), h('td', state, l.reason ? h('small.muted', ' ' + l.reason) : ''),
        h('td', inp || '', ' ', dest || '', ' ', no || ''));
    });
    const actions = h('div.form-actions');
    // lines still awaiting Masar's distribution approval: the button shows, greyed out, until approval
    if (!inputs.length && tab === 'open' && ls.some((l) => l.approved === false)) {
      actions.append(h('button.btn.save-btn', { type: 'button', disabled: true, title: t('awaiting_approval') }, t('hand_to_distribution')),
        h('small.muted', ' ' + t('awaiting_approval')));
    }
    if (inputs.length) {
      actions.append(h('button.btn.save-btn', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        const bad = inputs.filter((x) => Number(x.inp.value) > x.left || (x.dest && Number(x.inp.value) > 0 && !x.dest.value));
        if (bad.length) { bad.forEach((x) => flash(x.dest && !x.dest.value && Number(x.inp.value) <= x.left ? x.dest : x.inp)); return; }
        const give = inputs.map((x) => Object.assign({ line_id: x.line.line_id, qty: Number(x.inp.value) }, x.dest && x.dest.value === 'shop' ? { direct: true } : {})).filter((x) => x.qty > 0);
        if (!give.length) { inputs.forEach((x) => flash(x.inp)); return; }
        btn.disabled = true; btn.textContent = t('sending');
        inputs.forEach((x) => { x.inp.disabled = true; });
        await Outbox.add('shop.hand', { date: Data.todayIso(), client_id: newId(), lines: give }, shopName(first.shop_party_id));
        toast(t('handed_to_distribution'), 'ok');
      } }, t('hand_to_distribution')));
    }
    return h('div.req-card',
      h('div.card-head', h('b', first.order_no || first.order_id), h('span', h('bdi', shopName(first.shop_party_id))),
        h('span.muted.num', fmtDate(String(first.created_at).slice(0, 10)))),
      first.note ? h('p.muted', first.note) : null,
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('store')), h('th', t('requested')), h('th', t('issued')),
        h('th', t('reserved')), h('th', ''), h('th', tab === 'open' || tab === 'special' ? t('to_issue') : ''))), h('tbody', rows))),
      actions);
  }

  async function cannot(l) {
    const reason = await dialog((close) => {
      const r = trackFilled(h('input.input#sl-reason', { placeholder: t('reason') }));
      const ok = () => { if (!r.value.trim()) return flash(r); close(r.value.trim()); };
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      return [h('h3', t('cannot_supply'), ': ', h('bdi', Data.nameOf(itemOf(l.item_id)))), field(t('reason'), r),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
    });
    if (!reason) return;
    try { await call('shop.unavailable', { line_id: l.line_id, reason }); toast(t('saved'), 'ok'); load(); }
    catch (e) { toast(errText(e), 'err'); }
  }

  async function notSent(l) {
    const can = Math.round((l.handed_qty - (l.returned_qty || 0)) * 1e6) / 1e6;
    const res = await dialog((close) => {
      const q = trackFilled(h('input.input.num#sl-back', { type: 'number', step: 'any', min: 0, value: can }));
      const r = trackFilled(h('input.input#sl-back-why', { placeholder: t('reason') }));
      const ok = () => {
        if (!(Number(q.value) > 0) || Number(q.value) > can) return flash(q);
        if (!r.value.trim()) return flash(r);
        close({ qty: Number(q.value), reason: r.value.trim() });
      };
      return [h('h3', t('not_sent'), ': ', h('bdi', Data.nameOf(itemOf(l.item_id)))), h('small.muted', t('not_sent_help')),
        field(t('qty'), q), field(t('reason'), r),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
    });
    if (!res) return;
    await Outbox.add('shop.return', { line_id: l.line_id, date: Data.todayIso(), client_id: newId(), ...res }, itemOf(l.item_id).name);
    toast(t('saved'), 'ok');
    setTimeout(load, 2000);
  }

  function drawSpecial(list, toBuy) {
    if (!list.length && !(toBuy || []).length) { body.replaceChildren(h('p.empty', t('no_rows'))); return; }
    // special orders' products to buy ready-made (routed to purchasing): bought, then handed to distribution
    // decided "buy": handed like any line; not decided yet: from the store, buy, or not available
    const orders = new Map();
    (toBuy || []).filter((l) => l.purchase === 'buy').forEach((l) => { if (!orders.has(l.order_id)) orders.set(l.order_id, []); orders.get(l.order_id).push(l); });
    body.replaceChildren(...(toBuy || []).filter((l) => !l.purchase).map(decideCard), ...[...orders.values()].map((ls) => orderCard(ls)), ...list.map((r) => h('div.req-card',
      h('div.card-head', h('b', h('bdi', r.description)), h('span', h('bdi', shopName(r.shop_party_id))),
        h('span.muted.num', fmtDate(String(r.created_at).slice(0, 10)))),
      h('p', (r.qty ? fmtNum(r.qty) + ' ' + (r.unit || '') : ''), r.order_no ? h('span.muted', ' · ' + r.order_no) : '',
        r.image ? h('a.link', { href: r.image, target: '_blank', rel: 'noopener' }, ' ' + t('picture')) : ''),
      h('div.form-actions',
        h('button.btn', { type: 'button', onclick: () => approve(r) }, t('approve_buy')),
        h('button.btn.secondary', { type: 'button', onclick: () => reject(r) }, t('reject'))))));
  }

  function decideCard(l) {
    const done = async (payload, okText) => {
      try { await call('shop.purchase', Object.assign({ line_id: l.line_id }, payload)); toast(t(okText), 'ok'); load(); }
      catch (e) { toast(errText(e), 'err'); if (e.code === 'purchase_decided') load(); }
    };
    const fromStore = async () => {
      const res = await dialog((close) => {
        const opts = () => Data.activeItems().filter((i) => Data.storeOf(i) !== 'FINAL').sort((a, b) => Data.nameOf(a).localeCompare(Data.nameOf(b)))
          .map((i) => ({ value: i.item_id, label: Data.nameOf(i), alt: i.name, hint: fmtNum(Data.qty(i.item_id)) + ' ' + i.unit }));
        const it = combo({ id: 'sp-item', options: opts, placeholder: t('lookup_hint') });
        const q = trackFilled(h('input.input.num#sp-qty', { type: 'number', step: 'any', min: 0, value: l.qty }));
        const ok = () => { if (!it.value) return flash(it.input); if (!(Number(q.value) > 0)) return flash(q); close({ item_id: it.value, qty: Number(q.value) }); };
        return [h('h3', t('buy_from_store'), ': ', h('bdi', l.description)), h('small.muted', t('buy_from_store_help')), field(t('item'), it), field(t('qty'), q),
          h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
      });
      if (res) done(Object.assign({ choice: 'store' }, res), 'buy_sent_store');
    };
    const buy = async () => {
      const price = await dialog((close) => {
        const pr = trackFilled(h('input.input.num#sp-price', { type: 'number', step: 'any', min: 0, value: l.price }));
        const ok = () => (pr.value === '' || Number(pr.value) < 0 ? flash(pr) : close(Number(pr.value)));
        return [h('h3', t('buy_it'), ': ', h('bdi', l.description)), h('small.muted', t('buy_it_help', { p: fmtNum(l.price) })), field(t('price_final'), pr),
          h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
      });
      if (price !== undefined && price !== null) done({ choice: 'buy', price }, 'buy_priced');
    };
    const none = async () => {
      const reason = await dialog((close) => {
        const r = trackFilled(h('input.input#sp-why', { placeholder: t('reason') }));
        return [h('h3', t('cannot_supply'), ': ', h('bdi', l.description)), field(t('reason'), r),
          h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
            h('button.btn', { type: 'button', onclick: () => (r.value.trim() ? close(r.value.trim()) : flash(r)) }, t('save')))];
      });
      if (reason) done({ choice: 'unavailable', reason }, 'saved');
    };
    return h('div.req-card',
      h('div.card-head', h('b', h('span.pill.soon', t('special')), ' ', h('bdi', l.description)), h('span', h('bdi', shopName(l.shop_party_id))),
        h('span.muted', l.order_no)),
      h('p', fmtNum(l.qty) + ' ' + (l.unit || ''), ' · ', t('price_estimate'), ': ', h('b', fmtNum(l.price) + ' QR'), ' · ', h('span.err-text', '⏰ ' + l.deadline), ' ', photoButton(l.photos) || ''),
      h('div.form-actions', h('button.btn', { type: 'button', onclick: fromStore }, t('buy_from_store')),
        h('button.btn', { type: 'button', onclick: buy }, t('buy_it')),
        h('button.btn.secondary', { type: 'button', onclick: none }, t('cannot_supply'))));
  }

  async function approve(r) {
    const res = await dialog((close) => {
      const existing = combo({ id: 'sp-item', options: () => Data.activeItems().map((i) => ({ value: i.item_id, label: Data.nameOf(i), alt: i.name, hint: i.unit })) });
      const name = trackFilled(h('input.input#sp-name', { value: r.description }));
      const store = h('select.input#sp-store', STORES.filter((s) => s !== 'FINAL').map((s) => h('option', { value: s }, t('store_' + s))));
      const unit = combo({ id: 'sp-unit', options: () => Data.unitOptions(r.unit) });
      if (r.unit) unit.set(r.unit);
      const err = h('p.err-text', '');
      const ok = () => {
        if (existing.value) return close({ item_id: existing.value });
        if (!name.value.trim()) return flash(name);
        if (!unit.input.value.trim()) return flash(unit.input);
        close({ name: name.value.trim(), store: store.value, unit: unit.input.value.trim().toUpperCase() });
      };
      return [h('h3', t('approve_buy'), ': ', h('bdi', r.description)), h('small.muted', t('approve_buy_help')),
        field(t('existing_item'), existing, { wide: true }), field(t('name'), name), field(t('store'), store), field(t('unit'), unit), err,
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
    });
    if (!res) return;
    try { await call('special.decide', { request_id: r.request_id, decision: 'approved', ...res }); await Data.refresh(); toast(t('saved'), 'ok'); load(); }
    catch (e) { toast(errText(e), 'err'); }
  }

  async function reject(r) {
    const comment = await dialog((close) => {
      const c = trackFilled(h('input.input#sp-why', { placeholder: t('reason') }));
      const ok = () => { if (!c.value.trim()) return flash(c); close(c.value.trim()); };
      return [h('h3', t('reject'), ': ', h('bdi', r.description)), field(t('reason'), c),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
    });
    if (!comment) return;
    try { await call('special.decide', { request_id: r.request_id, decision: 'rejected', comment }); toast(t('saved'), 'ok'); load(); }
    catch (e) { toast(errText(e), 'err'); }
  }

  const onData = () => { if (!(document.activeElement && document.activeElement.tagName === 'INPUT' && body.contains(document.activeElement))) reloadSoon(); };
  const timer = setInterval(() => { if (document.visibilityState === 'visible') onData(); }, 15000);
  // the server answered: the list shows the new state; a refusal (e.g. not enough final products) is said
  const onSent = (e) => { if (e.detail && (e.detail.action === 'shop.hand' || e.detail.action === 'shop.return')) reloadSoon(); };
  const onRejected = (e) => {
    if (!e.detail || (e.detail.action !== 'shop.hand' && e.detail.action !== 'shop.return')) return;
    toast(errText({ code: e.detail.error, detail: e.detail.detail }), 'err');
    shown = '';                                   // drawn again: the line is no longer sending
    load(true);
  };
  window.addEventListener('moro:data', onData);
  window.addEventListener('moro:sent', onSent);
  window.addEventListener('moro:rejected', onRejected);
  cleanup = () => { clearInterval(timer); clearTimeout(soon); window.removeEventListener('moro:data', onData); window.removeEventListener('moro:sent', onSent);
    window.removeEventListener('moro:rejected', onRejected); cleanup = null; };
  load();
}

export function dispose() { if (cleanup) cleanup(); }
