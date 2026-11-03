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

  // quantities typed and not yet sent stay as they were through a refresh
  const load = async (quiet) => {
    const typed = new Map([...body.querySelectorAll('input[data-key]')].filter((x) => x.value !== x.defaultValue).map((x) => [x.dataset.key, x.value]));
    if (quiet !== true) body.replaceChildren(h('p.empty', '…'));
    try {
      if (tab === 'special') drawSpecial(await call('special.list', { status: 'pending' }));
      else drawLines(await call('shop.list', { status: tab, native: true }));
      body.querySelectorAll('input[data-key]').forEach((x) => { if (typed.has(x.dataset.key)) { x.value = typed.get(x.dataset.key); x.dispatchEvent(new Event('input')); } });
    } catch (e) { body.replaceChildren(h('p.empty', errText(e))); }
  };

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
      const open = tab === 'open' && left > 0 && l.approved !== false && l.can && !sending;
      const inp = open ? trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, 'data-key': l.line_id, value: Math.min(left, l.reserved_qty) || '' })) : null;
      if (inp) inputs.push({ line: l, inp, left });
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
        h('td', inp || '', ' ', no || ''));
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
        const bad = inputs.filter((x) => Number(x.inp.value) > x.left);
        if (bad.length) { bad.forEach((x) => flash(x.inp)); return; }
        const give = inputs.map((x) => ({ line_id: x.line.line_id, qty: Number(x.inp.value) })).filter((x) => x.qty > 0);
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
        h('th', t('reserved')), h('th', ''), h('th', tab === 'open' ? t('to_issue') : ''))), h('tbody', rows))),
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

  const onData = () => { if (!(document.activeElement && document.activeElement.tagName === 'INPUT' && body.contains(document.activeElement))) load(true); };
  const timer = setInterval(() => { if (document.visibilityState === 'visible') onData(); }, 15000);
  // the server answered: the list shows the new state; a refusal (e.g. not enough final products) is said
  const onSent = (e) => { if (e.detail && (e.detail.action === 'shop.hand' || e.detail.action === 'shop.return')) load(true); };
  const onRejected = (e) => {
    if (!e.detail || (e.detail.action !== 'shop.hand' && e.detail.action !== 'shop.return')) return;
    toast(errText({ code: e.detail.error, detail: e.detail.detail }), 'err');
    load(true);
  };
  window.addEventListener('moro:data', onData);
  window.addEventListener('moro:sent', onSent);
  window.addEventListener('moro:rejected', onRejected);
  cleanup = () => { clearInterval(timer); window.removeEventListener('moro:data', onData); window.removeEventListener('moro:sent', onSent);
    window.removeEventListener('moro:rejected', onRejected); cleanup = null; };
  load();
}

export function dispose() { if (cleanup) cleanup(); }
