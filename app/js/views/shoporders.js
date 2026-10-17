// Shop orders (from the cashiers' system, Masar): each storekeeper sees the lines of their own
// stores, prepares them and hands them to distribution, or marks what cannot be supplied.
// The purchasing officer also sees the shortages of every store and the special purchase requests.
import { call } from '../api.js';
import { Data, STORES } from '../data.js';
import { Outbox } from '../outbox.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, fmtDate, trackFilled, dialog } from '../ui.js';
import { combo, field, storePill, newId } from '../components.js';

let tab = 'open';
let cleanup = null;

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

  let touched = false;             // quantities being typed: the auto refresh waits
  body.addEventListener('input', () => { touched = true; });
  const load = async (quiet) => {
    touched = false;
    if (quiet !== true) body.replaceChildren(h('p.empty', '…'));
    try {
      if (tab === 'special') drawSpecial(await call('special.list', { status: 'pending' }));
      else drawLines(await call('shop.list', { status: tab }));
    } catch (e) { body.replaceChildren(h('p.empty', errText(e))); }
  };

  const shopName = (id) => (Data.parties.get(id) || {}).name || id;
  const itemOf = (id) => Data.items.get(id) || { name: id, unit: '' };

  function drawLines(lines) {
    if (!lines.length) { body.replaceChildren(h('p.empty', t('no_rows'))); return; }
    if (tab === 'shortage') {
      body.replaceChildren(h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('store')), h('th', t('shop')),
        h('th', t('order_no')), h('th', t('missing')), h('th', t('balance')))),
        h('tbody', lines.map((l) => h('tr', h('td.wrap', h('bdi', itemOf(l.item_id).name)), h('td', storePill(l.store)),
          h('td.wrap', h('bdi', shopName(l.shop_party_id))), h('td.num', l.order_no || l.order_id),
          h('td.num.qty-neg', fmtNum(l.shortage) + ' ' + l.unit), h('td.num', fmtNum(Data.qty(l.item_id)))))))));
      return;
    }
    // one card per order
    const orders = new Map();
    lines.forEach((l) => { if (!orders.has(l.order_id)) orders.set(l.order_id, []); orders.get(l.order_id).push(l); });
    body.replaceChildren(...[...orders.values()].map((ls) => orderCard(ls)));
  }

  function orderCard(ls) {
    const first = ls[0];
    const inputs = [];
    const rows = ls.map((l) => {
      const it = itemOf(l.item_id);
      const left = Math.max(0, Math.round((l.qty - l.handed_qty) * 1e6) / 1e6);
      const open = tab === 'open' && left > 0 && l.approved !== false;
      const inp = open ? trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, value: Math.min(left, l.reserved_qty) || '' })) : null;
      if (inp) inputs.push({ line: l, inp, left });
      const canBack = l.handed_qty - (l.returned_qty || 0) > 0;
      const no = h('span', open ? h('button.link', { type: 'button', onclick: () => cannot(l) }, t('cannot_supply')) : '',
        canBack && Data.canStore(l.store) ? h('button.link', { type: 'button', onclick: () => notSent(l) }, ' ' + t('not_sent')) : '');
      const state = tab === 'done' ? h('span', { class: 'pill ' + ({ handed: 'in', unavailable: 'low', cancelled: 'out' }[l.status] || 'soon') },
        t('line_' + l.status)) : l.approved === false ? h('span.pill.soon', t('awaiting_approval'))
        : (l.shortage > 0 ? h('span.pill.low', t('missing') + ' ' + fmtNum(l.shortage)) : '');
      return h('tr', h('td.wrap', h('bdi', it.name)), h('td', storePill(l.store)), h('td.num', fmtNum(l.qty) + ' ' + l.unit),
        h('td.num', fmtNum(l.handed_qty), l.returned_qty ? h('small.qty-neg', ' −' + fmtNum(l.returned_qty)) : ''), h('td.num', fmtNum(l.reserved_qty)), h('td', state, l.reason ? h('small.muted', ' ' + l.reason) : ''),
        h('td', inp || '', ' ', no || ''));
    });
    const actions = h('div.form-actions');
    if (inputs.length) {
      actions.append(h('button.btn.save-btn', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        const bad = inputs.filter((x) => Number(x.inp.value) > x.left);
        if (bad.length) { bad.forEach((x) => flash(x.inp)); return; }
        const give = inputs.map((x) => ({ line_id: x.line.line_id, qty: Number(x.inp.value) })).filter((x) => x.qty > 0);
        if (!give.length) { inputs.forEach((x) => flash(x.inp)); return; }
        btn.disabled = true;
        await Outbox.add('shop.hand', { date: Data.todayIso(), client_id: newId(), lines: give }, shopName(first.shop_party_id));
        toast(t('handed_to_distribution'), 'ok');
        setTimeout(load, 2000);
      } }, t('hand_to_distribution')));
    }
    return h('div.req-card',
      h('div.card-head', h('b', first.order_no || first.order_id), h('span', h('bdi', shopName(first.shop_party_id))),
        h('span.muted.num', fmtDate(String(first.created_at).slice(0, 10)))),
      first.note ? h('p.muted', first.note) : null,
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('store')), h('th', t('requested')), h('th', t('issued')),
        h('th', t('reserved')), h('th', ''), h('th', tab === 'open' ? t('to_issue') : ''))), h('tbody', rows))),
      actions);
  }

  async function cannot(l) {
    const reason = await dialog((close) => {
      const r = trackFilled(h('input.input#sl-reason', { placeholder: t('reason') }));
      const ok = () => { if (!r.value.trim()) return flash(r); close(r.value.trim()); };
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      return [h('h3', t('cannot_supply'), ': ', h('bdi', itemOf(l.item_id).name)), field(t('reason'), r),
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
      return [h('h3', t('not_sent'), ': ', h('bdi', itemOf(l.item_id).name)), h('small.muted', t('not_sent_help')),
        field(t('qty'), q), field(t('reason'), r),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
    });
    if (!res) return;
    await Outbox.add('shop.return', { line_id: l.line_id, date: Data.todayIso(), client_id: newId(), ...res }, itemOf(l.item_id).name);
    toast(t('saved'), 'ok');
    setTimeout(load, 2000);
  }

  function drawSpecial(list) {
    if (!list.length) { body.replaceChildren(h('p.empty', t('no_rows'))); return; }
    body.replaceChildren(...list.map((r) => h('div.req-card',
      h('div.card-head', h('b', h('bdi', r.description)), h('span', h('bdi', shopName(r.shop_party_id))),
        h('span.muted.num', fmtDate(String(r.created_at).slice(0, 10)))),
      h('p', (r.qty ? fmtNum(r.qty) + ' ' + (r.unit || '') : ''), r.order_no ? h('span.muted', ' · ' + r.order_no) : '',
        r.image ? h('a.link', { href: r.image, target: '_blank', rel: 'noopener' }, ' ' + t('picture')) : ''),
      h('div.form-actions',
        h('button.btn', { type: 'button', onclick: () => approve(r) }, t('approve_buy')),
        h('button.btn.secondary', { type: 'button', onclick: () => reject(r) }, t('reject'))))));
  }

  async function approve(r) {
    const res = await dialog((close) => {
      const existing = combo({ id: 'sp-item', options: () => Data.activeItems().map((i) => ({ value: i.item_id, label: i.name, hint: i.unit })) });
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

  const onData = () => { if (!touched && !body.contains(document.activeElement)) load(true); };
  const onSent = (e) => { if (e.detail && (e.detail.action === 'shop.hand' || e.detail.action === 'shop.return')) load(true); };
  window.addEventListener('moro:data', onData);
  window.addEventListener('moro:sent', onSent);
  cleanup = () => { window.removeEventListener('moro:data', onData); window.removeEventListener('moro:sent', onSent); cleanup = null; };
  load();
}

export function dispose() { if (cleanup) cleanup(); }
