// Department requests: the production manager (or storekeeper) asks for items for a department;
// the storekeeper sees open requests and issues them – all, or edited quantities – in one action.
import { call } from '../api.js';
import { Data } from '../data.js';
import { Outbox } from '../outbox.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, fmtDate, trackFilled, dialog } from '../ui.js';
import { combo, field, newId, storePill } from '../components.js';

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
      // not more than the stock (with what this request already asks for the same item)
      const it = Data.items.get(item.value);
      const asked = lines.filter((l) => l.item_id === item.value).reduce((s, l) => s + l.qty, 0);
      const avail = Math.max(0, Data.qty(item.value));
      if (asked + Number(qty.value) > avail + 1e-9) {
        toast(t('req_over_stock', { n: fmtNum(Math.max(0, avail - asked)), u: it.unit }), 'err'); flash(qty); qty.focus(); return;
      }
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
      // "open": everything still running, so a request given in part and asked again shows here too
      // for the storekeeper a request given in part is done: it comes back only when the rest is asked for
      const todo = (r) => r.lines.some((l) => Number(l.issued_qty || 0) < Number(l.qty) && l.wait !== 'yes');
      const reqs = status === 'open' ? (await call('requests.list', { status: '', all: true }))
          .filter((r) => (r.status === 'open' || r.status === 'partial') && (todo(r) || r.requested_by === Data.user.user_id))
        : await call('requests.list', { status, all: true });
      listBox.replaceChildren(...(reqs.length ? reqs.map(card) : [h('p.empty', t('no_rows'))]));
    } catch (e) { listBox.replaceChildren(h('p.empty', errText(e))); }
  }

  // a request already sent for issuing (or cancelling) and not yet answered by the server: no second press
  const waiting = (r) => ['requests.fulfil', 'requests.cancel', 'requests.followup'].some((a) => Outbox.queued(a).some((j) => j.payload.request_id === r.request_id));

  function card(r) {
    const p = Data.parties.get(r.party_id);
    const busy = waiting(r);
    const inputs = [];
    const live = r.status === 'open' || r.status === 'partial';
    // the person who asked answers for the lines given in part: still wanted now, or keep what was given
    const mineReq = r.requested_by === Data.user.user_id;
    const answers = [];
    const rows = r.lines.map((l) => {
      const it = Data.items.get(l.item_id) || { name: l.item_id, unit: l.unit };
      const left = Math.round((Number(l.qty) - Number(l.issued_qty || 0)) * 1e6) / 1e6;
      const store = l.store || Data.storeOf(Data.items.get(l.item_id));
      const waits = live && left > 0 && l.wait === 'yes';
      const stock = Math.max(0, Data.qty(l.item_id));
      const inp = canFulfil && live && left > 0 && !waits && Data.canStore(store, 'requests')
        ? trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, disabled: busy, value: Math.min(left, Math.max(Data.qty(l.item_id), 0)) || left })) : null;
      if (inp) inputs.push({ line_no: l.line_no, inp });
      // the rest can be asked for only when the stock now allows it
      const can = Math.min(left, stock);
      const ans = waits && mineReq && can > 0 ? trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, max: can, disabled: busy, value: can })) : null;
      if (ans) ans.addEventListener('change', () => { if (Number(ans.value) > can) { ans.value = can; flash(ans); } });
      if (ans) answers.push({ line_no: l.line_no, inp: ans });
      const other = canFulfil && live && left > 0 && !inp && !waits;
      return h('tr', h('td.wrap', h('bdi', it.name)), h('td', storePill(store)), h('td.num', fmtNum(l.qty) + ' ' + (it.unit || '')), h('td.num', fmtNum(l.issued_qty || 0)),
        h('td.num', { class: Data.qty(l.item_id) < left ? 'qty-neg' : '' }, fmtNum(Data.qty(l.item_id))),
        h('td', inp || ans || (other ? h('small.muted', t('other_store')) : '')));
    });
    const actions = h('div.form-actions');
    if (answers.length) {
      // not asking for the rest is keeping what was given
      const askRest = async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        const lines = answers.map((x) => ({ line_no: x.line_no, qty: Number(x.inp.value) || 0 }));
        if (!lines.some((x) => x.qty > 0)) { answers.forEach((x) => flash(x.inp)); return; }
        btn.disabled = true; btn.textContent = t('sending');
        answers.forEach((x) => { x.inp.disabled = true; });
        await Outbox.add('requests.followup', { request_id: r.request_id, lines }, r.request_id);
        toast(t('req_rest_asked'), 'ok');
      };
      actions.append(h('small.muted', t('req_answer_help')),
        h('button.btn', { type: 'button', disabled: busy, onclick: askRest }, busy ? t('sending') : t('req_ask_rest')));
    }
    if (inputs.length) {
      actions.append(h('button.btn.save-btn', { type: 'button', disabled: busy, onclick: async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        const lines = inputs.map((x) => ({ line_no: x.line_no, qty: Number(x.inp.value) })).filter((x) => x.qty > 0);
        if (!lines.length) { inputs.forEach((x) => flash(x.inp)); return; }
        btn.disabled = true; btn.textContent = t('sending');
        inputs.forEach((x) => { x.inp.disabled = true; });
        await Outbox.add('requests.fulfil', { request_id: r.request_id, date: Data.todayIso(), client_id: newId(), lines }, r.request_id);
        toast(t('request_issued'), 'ok');
      } }, busy ? t('sending') : t('issue_request')));
    }
    // cancelling is for the person who asked (nothing given yet); the storekeeper simply does not issue
    if (r.status === 'open' && r.requested_by === Data.user.user_id) {
      const cancel = h('button.btn.secondary', { type: 'button', disabled: busy, onclick: async () => {
        if (cancel.disabled) return;
        const ok = await dialog((close) => [h('p', t('cancel_request_confirm', { id: r.request_id })),
          h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')),
            h('button.btn.danger', { type: 'button', onclick: () => close(true) }, t('cancel_request')))]);
        if (!ok) return;
        cancel.disabled = true; cancel.textContent = t('sending');
        await Outbox.add('requests.cancel', { request_id: r.request_id }, r.request_id);
        toast(t('request_cancelled'), 'ok');
      } }, t('cancel_request'));
      actions.append(cancel);
    }
    return h('div.req-card',
      h('div.card-head', h('b', r.request_id), h('span', h('bdi', p ? p.name : r.party_id)), h('span.muted.num', fmtDate(r.date)),
        h('span', { class: 'pill ' + ({ open: 'soon', partial: 'soon', fulfilled: 'in', cancelled: 'out' }[r.status] || '') }, t('req_' + r.status))),
      r.note ? h('p.muted', r.note) : null,
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('store')), h('th', t('requested')), h('th', t('issued')), h('th', t('balance')), h('th', canFulfil || answers.length ? t('to_issue') : ''))), h('tbody', rows))),
      actions);
  }

  root.replaceChildren(...parts);
  loadList();
  const onData = () => { if (!touched && !listBox.contains(document.activeElement)) loadList(true); };
  // new requests show quickly: the list is read again every 15 s while this screen is open and on show
  const timer = setInterval(() => { if (document.visibilityState === 'visible') onData(); }, 15000);
  // the server answered an issue or a cancel: the list shows the new state (the buttons come back only then)
  const onSent = (e) => { if (String(e.detail && e.detail.action).startsWith('requests.')) loadList(true); };
  window.addEventListener('moro:data', onData);
  window.addEventListener('moro:sent', onSent);
  window.addEventListener('moro:rejected', onSent);
  cleanup = () => { clearInterval(timer); window.removeEventListener('moro:data', onData); window.removeEventListener('moro:sent', onSent);
    window.removeEventListener('moro:rejected', onSent); cleanup = null; };
}

export function dispose() { if (cleanup) cleanup(); }
