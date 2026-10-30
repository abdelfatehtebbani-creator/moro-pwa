// Department requests: the production manager (or storekeeper) asks for items for a department;
// the storekeeper sees open requests and issues them – all, or edited quantities – in one action.
import { call } from '../api.js';
import { Data } from '../data.js';
import { Outbox } from '../outbox.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, fmtDate, trackFilled } from '../ui.js';
import { combo, field, doublePress, newId, storePill } from '../components.js';

let cleanup = null;

export async function render(root) {
  const canCreate = Data.can('requests.create');
  const canFulfil = Data.can('requests.fulfil');
  const parts = [];

  // ---------- new request
  if (canCreate) {
    let lines = [];
    const dept = combo({ id: 'q-dept', options: () => [...Data.parties.values()].filter((p) => p.kind === 'section' && p.active === true)
      .sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.party_id, label: p.name })) });
    const item = combo({ id: 'q-item', options: () => Data.activeItems().sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => ({ value: i.item_id, label: i.name, hint: fmtNum(Data.qty(i.item_id)) + ' ' + i.unit })) });
    const qty = trackFilled(h('input.input.num#q-qty', { type: 'number', step: 'any', min: 0 }));
    const note = trackFilled(h('input.input#q-note'));
    const body = h('tbody');
    const draw = () => body.replaceChildren(...(lines.length ? lines.map((l, i) => h('tr',
      h('td.wrap', h('bdi', Data.items.get(l.item_id).name)), h('td.num', fmtNum(l.qty) + ' ' + Data.items.get(l.item_id).unit),
      h('td', h('button.link', { type: 'button', onclick: () => { lines.splice(i, 1); draw(); } }, t('delete')))))
      : [h('tr', h('td.empty', { colspan: 3 }, t('no_lines')))]));
    const add = () => {
      if (!item.value) { flash(item.input); item.input.focus(); return; }
      if (!(Number(qty.value) > 0)) { flash(qty); qty.focus(); return; }
      lines.push({ item_id: item.value, qty: Number(qty.value) });
      item.clear(); qty.value = ''; qty.dispatchEvent(new Event('change')); draw(); item.input.focus();
    };
    item.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && item.value) { e.preventDefault(); qty.focus(); } });
    qty.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const send = async () => {
      if (!dept.value) { flash(dept.input); dept.input.focus(); return; }
      if (!lines.length) { flash(item.input); item.input.focus(); return; }
      await Outbox.add('requests.create', { date: Data.todayIso(), party_id: dept.value, note: note.value, client_id: newId(), lines },
        Data.parties.get(dept.value).name);
      toast(t('request_sent'), 'ok');
      lines = []; draw(); note.value = ''; dept.clear(); dept.input.focus();
      setTimeout(loadList, 1500);
    };
    parts.push(h('div.card.form-card', h('h2', t('new_request')),
      h('div.form-grid', field(t('department'), dept, { wide: true }), field(t('item'), item, { wide: true }), field(t('qty'), qty),
        h('div.field.end', h('button.btn', { type: 'button', onclick: add }, t('add_line'))), field(t('note'), note, { wide: true })),
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('qty')), h('th', ''))), body)),
      h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: send }, t('send_request')))));
    draw();
  }

  // ---------- list
  const listBox = h('div.req-list');
  const tabs = h('div.tabs');
  let status = canFulfil ? 'open' : '';
  ['open', 'partial', 'fulfilled', ''].forEach((s) => tabs.append(h('button', { type: 'button', class: s === status ? 'on' : '',
    onclick: (e) => { status = s; [...tabs.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); loadList(); } },
    t('req_' + (s || 'all')))));
  parts.push(h('div.card', h('div.card-head', h('h2', t('requests')), tabs), listBox));

  let touched = false;      // quantities being edited in a request: the auto refresh waits
  listBox.addEventListener('input', () => { touched = true; });
  async function loadList(quiet) {
    touched = false;
    if (quiet !== true) listBox.replaceChildren(h('p.empty', '…'));
    try {
      const reqs = await call('requests.list', { status, all: true });
      listBox.replaceChildren(...(reqs.length ? reqs.map(card) : [h('p.empty', t('no_rows'))]));
    } catch (e) { listBox.replaceChildren(h('p.empty', errText(e))); }
  }

  function card(r) {
    const p = Data.parties.get(r.party_id);
    const inputs = [];
    const rows = r.lines.map((l) => {
      const it = Data.items.get(l.item_id) || { name: l.item_id, unit: l.unit };
      const left = Math.round((Number(l.qty) - Number(l.issued_qty || 0)) * 1e6) / 1e6;
      const store = l.store || Data.storeOf(Data.items.get(l.item_id));
      const inp = canFulfil && left > 0 && (r.status === 'open' || r.status === 'partial') && Data.canStore(store, 'requests')
        ? trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, value: Math.min(left, Math.max(Data.qty(l.item_id), 0)) || left })) : null;
      if (inp) inputs.push({ line_no: l.line_no, inp });
      const other = canFulfil && left > 0 && !inp && (r.status === 'open' || r.status === 'partial');
      return h('tr', h('td.wrap', h('bdi', it.name)), h('td', storePill(store)), h('td.num', fmtNum(l.qty) + ' ' + (it.unit || '')), h('td.num', fmtNum(l.issued_qty || 0)),
        h('td.num', { class: Data.qty(l.item_id) < left ? 'qty-neg' : '' }, fmtNum(Data.qty(l.item_id))),
        h('td', inp || (other ? h('small.muted', t('other_store')) : '')));
    });
    const actions = h('div.form-actions');
    if (inputs.length) {
      actions.append(h('button.btn.save-btn', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        const lines = inputs.map((x) => ({ line_no: x.line_no, qty: Number(x.inp.value) })).filter((x) => x.qty > 0);
        if (!lines.length) { inputs.forEach((x) => flash(x.inp)); return; }
        btn.disabled = true;
        await Outbox.add('requests.fulfil', { request_id: r.request_id, date: Data.todayIso(), client_id: newId(), lines }, r.request_id);
        toast(t('request_issued'), 'ok');
        setTimeout(loadList, 2000);
      } }, t('issue_request')));
    }
    if (r.status === 'open' && (canFulfil || r.requested_by === Data.user.user_id)) {
      const cancel = h('button.btn.secondary', { type: 'button', onclick: async () => {
        if (!doublePress('cancel-' + r.request_id)) { flash(cancel); return; }
        await Outbox.add('requests.cancel', { request_id: r.request_id }, r.request_id);
        setTimeout(loadList, 1500);
      } }, t('cancel_request'));
      actions.append(cancel);
    }
    return h('div.req-card',
      h('div.card-head', h('b', r.request_id), h('span', h('bdi', p ? p.name : r.party_id)), h('span.muted.num', fmtDate(r.date)),
        h('span', { class: 'pill ' + ({ open: 'soon', partial: 'soon', fulfilled: 'in', cancelled: 'out' }[r.status] || '') }, t('req_' + r.status))),
      r.note ? h('p.muted', r.note) : null,
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('store')), h('th', t('requested')), h('th', t('issued')), h('th', t('balance')), h('th', canFulfil ? t('to_issue') : ''))), h('tbody', rows))),
      actions);
  }

  root.replaceChildren(...parts);
  loadList();
  const onData = () => { if (!touched && !listBox.contains(document.activeElement)) loadList(true); };
  window.addEventListener('moro:data', onData);
  cleanup = () => { window.removeEventListener('moro:data', onData); cleanup = null; };
}

export function dispose() { if (cleanup) cleanup(); }
