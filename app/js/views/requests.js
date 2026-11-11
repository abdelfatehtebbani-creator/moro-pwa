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
    // after the department: the items this user asked for it before, most asked first, to pick with one press
    const before = h('div.req-before');
    const showBefore = async (deptId) => {
      before.replaceChildren();
      if (!deptId) return;
      let reqs = [];
      try { reqs = await call('requests.list', { limit: 300 }); } catch { return; }
      const times = new Map();
      reqs.filter((r) => r.party_id === deptId && r.requested_by === Data.user.user_id)
        .forEach((r) => r.lines.forEach((l) => times.set(l.item_id, (times.get(l.item_id) || 0) + 1)));
      const ids = [...times].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => { const i = Data.items.get(id); return i && i.active === true; }).slice(0, 40);
      if (!ids.length || dept.value !== deptId) return;
      before.replaceChildren(h('small.muted', t('req_asked_before')), h('div.req-chips', ids.map((id) => h('button.chip', { type: 'button',
        onclick: () => { item.set(id); qty.focus(); } }, h('bdi', Data.nameOf(Data.items.get(id))), h('small', ' ' + fmtNum(Data.qty(id)))))));
    };
    // a section head asks for their own departments only; with one department, it is chosen and the field is not shown
    const own = (p) => Data.user.role !== 'section_head' || !(Data.user.depts || []).length || Data.user.depts.includes(p.party_id);
    const dept = combo({ id: 'q-dept', options: () => [...Data.parties.values()].filter((p) => p.kind === 'section' && p.active === true && own(p))
      .sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.party_id, label: p.name })), onPick: (v) => showBefore(v) });
    const mineList = [...Data.parties.values()].filter((p) => p.kind === 'section' && p.active === true && own(p));
    const onlyDept = Data.user.role === 'section_head' && mineList.length === 1 ? mineList[0] : null;
    const item = combo({ id: 'q-item', options: () => Data.activeItems().sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => ({ value: i.item_id, label: Data.nameOf(i), alt: i.name, hint: fmtNum(Data.qty(i.item_id)) + ' ' + i.unit })) });
    const qty = trackFilled(h('input.input.num#q-qty', { type: 'number', step: 'any', min: 0 }));
    const note = trackFilled(h('input.input#q-note'));
    const body = h('tbody');
    const draw = () => body.replaceChildren(...(lines.length ? lines.map((l, i) => h('tr',
      h('td.wrap', h('bdi', Data.nameOf(Data.items.get(l.item_id)))), h('td.num', fmtNum(l.qty) + ' ' + Data.items.get(l.item_id).unit),
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
      lines = []; draw(); note.value = ''; if (onlyDept) item.input.focus(); else { dept.clear(); dept.input.focus(); }
      setTimeout(loadList, 1500);
    };
    parts.push(h('div.card.form-card', h('h2', t('new_request')),
      h('div.form-grid', onlyDept ? h('div.field.wide', h('b', h('bdi', onlyDept.name))) : field(t('department'), dept, { wide: true }), h('div.field.wide', before), field(t('item'), item, { wide: true }), field(t('qty'), qty),
        h('div.field.end', h('button.btn', { type: 'button', onclick: add }, t('add_line'))), field(t('note'), note, { wide: true })),
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('qty')), h('th', ''))), body)),
      h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: send }, t('send_request')))));
    draw();
    if (onlyDept) { dept.set(onlyDept.party_id); showBefore(onlyDept.party_id); }
  }

  // ---------- list
  const listBox = h('div.req-list');
  const tabs = h('div.tabs');
  let status = canFulfil ? 'open' : '';
  ['open', 'partial', 'fulfilled', ''].forEach((s) => tabs.append(h('button', { type: 'button', class: s === status ? 'on' : '',
    onclick: (e) => { status = s; [...tabs.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); loadList(); } },
    t('req_' + (s || 'all')))));
  // the person who only asks sees the new request; their requests (the archive) open with a button.
  // The rest of a request given in part is asked for from the "partial" tab of the archive.
  const archiveMode = canCreate && !canFulfil;
  let archiveOpen = !archiveMode;
  const listCard = h('div.card', { hidden: !archiveOpen }, h('div.card-head', h('h2', t('req_archive')), tabs), listBox);
  const archiveBtn = archiveMode ? h('button.btn.secondary', { type: 'button', onclick: () => {
    archiveOpen = !archiveOpen; listCard.hidden = !archiveOpen; archiveBtn.textContent = t(archiveOpen ? 'req_archive_hide' : 'req_archive');
    if (archiveOpen) loadList();
  } }, t('req_archive')) : null;
  if (archiveMode) parts.push(h('div.form-actions', archiveBtn));
  parts.push(listCard);

  async function loadList(quiet) {
    // quantities typed and not yet sent stay as they were through a refresh
    const typed = new Map([...listBox.querySelectorAll('input[data-key]')].filter((x) => x.value !== x.defaultValue).map((x) => [x.dataset.key, x.value]));
    if (quiet !== true) listBox.replaceChildren(h('p.empty', '…'));
    try {
      // "open": everything still running, so a request given in part and asked again shows here too
      // for the storekeeper a request given in part is done: it comes back only when the rest is asked for
      const todo = (r) => r.lines.some((l) => Number(l.issued_qty || 0) < Number(l.qty) && l.wait !== 'yes' && !l.reason);
      const reqs = status === 'open' ? (await call('requests.list', { status: '', all: true }))
          .filter((r) => (r.status === 'open' || r.status === 'partial') && (todo(r) || r.requested_by === Data.user.user_id))
        : await call('requests.list', { status, all: true });
      listBox.replaceChildren(...(!archiveOpen ? [] : reqs.length ? reqs.map(card) : [h('p.empty', t('no_rows'))]));
      listBox.querySelectorAll('input[data-key]').forEach((x) => { if (typed.has(x.dataset.key)) { x.value = typed.get(x.dataset.key); x.dispatchEvent(new Event('input')); } });
    } catch (e) { listBox.replaceChildren(h('p.empty', errText(e))); }
  }

  // a request already sent for issuing (or cancelling) and not yet answered by the server: no second press
  const waiting = (r) => ['requests.fulfil', 'requests.cancel', 'requests.followup', 'requests.reject'].some((a) => Outbox.queued(a).some((j) => j.payload.request_id === r.request_id));

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
      // a line refused by the storekeeper has nothing left to give
      const left = l.reason ? 0 : Math.round((Number(l.qty) - Number(l.issued_qty || 0)) * 1e6) / 1e6;
      const store = l.store || Data.storeOf(Data.items.get(l.item_id));
      const waits = live && left > 0 && l.wait === 'yes';
      const stock = Math.max(0, Data.qty(l.item_id));
      const inp = canFulfil && live && left > 0 && !waits && Data.canStore(store, 'requests')
        ? trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, disabled: busy, 'data-key': r.request_id + ':' + l.line_no, value: Math.min(left, Math.max(Data.qty(l.item_id), 0)) || left })) : null;
      if (inp) inputs.push({ line_no: l.line_no, inp });
      // the rest can be asked for only when the stock now allows it
      const can = Math.min(left, stock);
      const ans = waits && mineReq && can > 0 && status === 'partial' ? trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, max: can, disabled: busy, 'data-key': r.request_id + ':a' + l.line_no, value: can })) : null;
      if (ans) ans.addEventListener('change', () => { if (Number(ans.value) > can) { ans.value = can; flash(ans); } });
      if (ans) answers.push({ line_no: l.line_no, inp: ans });
      const other = canFulfil && live && left > 0 && !inp && !waits;
      // nothing in the store for a line still to give: the row stands out
      const none = live && left > 0 && stock <= 0;
      return h('tr', { class: none ? 'req-none' : '' }, h('td.wrap', h('bdi', Data.nameOf(it))), h('td', storePill(store)), h('td.num', fmtNum(l.qty) + ' ' + (it.unit || '')), h('td.num', fmtNum(l.issued_qty || 0)),
        h('td.num', { class: Data.qty(l.item_id) < left ? 'qty-neg' : '' }, fmtNum(Data.qty(l.item_id)), none ? h('span.pill.low', t('req_no_stock')) : ''),
        h('td', inp || ans || (l.reason ? h('small.err-text', t('req_rejected_why', { why: l.reason })) : other ? h('small.muted', t('other_store')) : '')));
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
    // the storekeeper may refuse what is left of their lines, with a reason the person who asked sees
    if (inputs.length) {
      const reject = h('button.btn.danger', { type: 'button', disabled: busy, onclick: async () => {
        if (reject.disabled) return;
        const why = await dialog((close) => {
          const reason = trackFilled(h('textarea.input#rq-why', { rows: 3 }));
          return [h('h3', t('reject_request'), ' ', r.request_id), field(t('reason'), reason),
            h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
              h('button.btn.danger', { type: 'button', onclick: () => (reason.value.trim() ? close(reason.value.trim()) : flash(reason)) }, t('reject_request')))];
        });
        if (!why) return;
        actions.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        reject.textContent = t('sending');
        await Outbox.add('requests.reject', { request_id: r.request_id, reason: why }, r.request_id);
        toast(t('request_rejected'), 'ok');
      } }, t('reject_request'));
      actions.append(reject);
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
        h('span', { class: 'pill ' + ({ open: 'soon', partial: 'soon', fulfilled: 'in', cancelled: 'out', rejected: 'low' }[r.status] || '') }, t('req_' + r.status))),
      r.note ? h('p.muted', r.note) : null,
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('store')), h('th', t('requested')), h('th', t('issued')), h('th', t('balance')), h('th', canFulfil || answers.length ? t('to_issue') : ''))), h('tbody', rows))),
      actions);
  }

  root.replaceChildren(...parts);
  loadList();
  // not while a quantity is being typed (what was typed is kept through the refresh)
  const onData = () => { if (!(document.activeElement && document.activeElement.tagName === 'INPUT' && listBox.contains(document.activeElement))) loadList(true); };
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
