// Shop orders made in MORO (server/Orders.gs). One module, two screens:
//  - "My order" (route orders, the cashier): the cashier opens a shift in the shop they work in now (no other
//    cashier can take it until the shift ends), writes the shop's order (every item may be ordered, picked
//    by store or department; only "available / not available" shows, never a quantity or a price), keeps it
//    as a draft or sends it (for the next day), follows it, and receives it when it arrives.
//  - "Approve orders" (route orderapprove, distribution): the quantities of a sent order are approved (a line
//    may be changed or set to 0), or the order is rejected with a reason.
import { call } from '../api.js';
import { Data, STORES } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, fmtDate, trackFilled, dialog } from '../ui.js';
import { combo, field, newId } from '../components.js';

const PILL = { draft: 'out', sent: 'soon', approved: 'soon', ready: 'in', in_trip: 'soon', loaded: 'soon', delivered: 'soon', received: 'in',
  invoiced: 'in', rejected: 'low', cancelled: 'out' };
const SHORT_REASONS = ['damaged', 'short_in_trip', 'loading_error', 'other'];
// the cashier's tabs: a tab shows the orders of these statuses
const CASHIER_TABS = { new: null, draft: ['draft'], sent: ['sent', 'approved', 'ready', 'in_trip', 'loaded'], delivered: ['delivered'],
  archive: ['received', 'invoiced', 'rejected', 'cancelled'] };
const APPROVE_TABS = ['sent', 'approved', 'ready', 'rejected', ''];
const tabs = { orders: 'new', orderapprove: 'sent' };
let cleanup = null;

export async function render(root, name) {
  if (cleanup) cleanup();
  const approveMode = name === 'orderapprove';
  const shop = (Data.user || {}).shop;
  const shopName = (id) => (Data.parties.get(id) || {}).name || id;

  // ---------- the cashier's shift: the shop they work in now
  if (!approveMode && !shop) {
    const shops = [...Data.parties.values()].filter((p) => p.kind === 'shop' && p.active === true).sort((a, b) => a.name.localeCompare(b.name));
    const sel = h('select.input#o-shop', h('option', { value: '' }, '—'), shops.map((p) => h('option', { value: p.party_id }, p.name)));
    root.replaceChildren(h('div.card.form-card', h('h2', t('shift_open')), h('small.muted', t('shift_open_help')), field(t('shop'), sel),
      h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: async (e) => {
        if (!sel.value) return flash(sel);
        const btn = e.currentTarget; btn.disabled = true;
        try { await call('orders.shift', { shop: sel.value }); await Data.refresh(); render(root, name); }
        catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
      } }, t('shift_start')))));
    return;
  }
  const parts = [];
  if (!approveMode) {
    parts.push(h('div.shift-bar', h('span', t('shift_in'), ' ', h('b', h('bdi', shopName(shop)))),
      h('button.btn.secondary', { type: 'button', onclick: async () => {
        if (!(await confirm(t('shift_end_confirm')))) return;
        try { await call('orders.shiftEnd', {}); await Data.refresh(); render(root, name); } catch (e) { toast(errText(e), 'err'); }
      } }, t('shift_end'))));
  }

  // ---------- tabs
  let tab = tabs[name];
  const tabBar = h('div.tabs');
  const keys = approveMode ? APPROVE_TABS : Object.keys(CASHIER_TABS);
  if (!keys.includes(tab)) tab = keys[0];
  keys.forEach((k) => tabBar.append(h('button', { type: 'button', class: k === tab ? 'on' : '',
    onclick: (e) => { tab = tabs[name] = k; [...tabBar.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); show(); } },
    t(approveMode ? 'order_st_' + (k || 'all') : 'otab_' + k))));
  const editorBox = h('div');
  const listBox = h('div.req-list');
  parts.push(h('div.card', h('div.card-head', h('h2', t(approveMode ? 'orderapprove' : 'orders')), tabBar), editorBox, listBox));

  function show() {
    const isNew = !approveMode && tab === 'new';
    editorBox.hidden = !isNew;
    listBox.hidden = isNew;
    if (isNew) drawEditor(); else loadList();
  }

  // ---------- a new order (or a draft being changed)
  let editing = null;
  let lines = [];
  let source = 'all';        // the item picker: all, a store, or a department
  function drawEditor() {
    // the stores (final products come by department) and the producing departments
    const depts = Data.producingDepts();
    const inSource = (i) => source === 'all' || (source.startsWith('s:') ? Data.storeOf(i) === source.slice(2) && Data.storeOf(i) !== 'FINAL'
      : Data.storeOf(i) === 'FINAL' && i.dept === source.slice(2));
    const item = combo({ id: 'o-item', options: () => Data.activeItems().filter(inSource).sort((a, b) => Data.nameOf(a).localeCompare(Data.nameOf(b)))
      .map((i) => ({ value: i.item_id, label: Data.nameOf(i), alt: i.name, hint: Data.qty(i.item_id) > 0 ? t('ord_available') : t('ord_not_available') })) });
    // two searchable lists narrow the items: a store, or a department (choosing one clears the other; none = all)
    const storeBox = combo({ id: 'o-store', placeholder: t('order_st_all'), options: () => STORES.filter((s) => s !== 'FINAL').map((s) => ({ value: s, label: t('store_' + s) })),
      onPick: (v) => { if (v) { deptBox.clear(); source = 's:' + v; } else if (!deptBox.value) source = 'all'; item.clear(); } });
    const deptBox = combo({ id: 'o-dept', placeholder: t('all_depts'), options: () => depts.map((p) => ({ value: p.party_id, label: p.name })),
      onPick: (v) => { if (v) { storeBox.clear(); source = 'd:' + v; } else if (!storeBox.value) source = 'all'; item.clear(); } });
    if (source.startsWith('s:')) storeBox.set(source.slice(2)); else if (source.startsWith('d:')) deptBox.set(source.slice(2));
    const srcBar = h('div.form-grid.order-src', field(t('store'), storeBox), field(t('department'), deptBox));
    const qty = trackFilled(h('input.input.num#o-qty', { type: 'number', step: 'any', min: 0 }));
    const note = trackFilled(h('input.input#o-note', { value: editing ? editing.note || '' : '' }));
    const body = h('tbody');
    const draw = () => body.replaceChildren(...(lines.length ? lines.map((l, i) => {
      const it = Data.items.get(l.item_id) || { name: l.item_id, unit: '' };
      return h('tr', h('td.wrap', h('bdi', Data.nameOf(it))), h('td.num', fmtNum(l.qty) + ' ' + (it.unit || '')),
        h('td', Data.qty(l.item_id) > 0 ? h('span.pill.in', t('ord_available')) : h('span.pill.low', t('ord_not_available'))),
        h('td', h('button.link', { type: 'button', onclick: () => { lines.splice(i, 1); draw(); } }, t('delete'))));
    }) : [h('tr', h('td.empty', { colspan: 4 }, t('no_lines')))]));
    const add = () => {
      if (!item.value) { flash(item.input); item.input.focus(); return; }
      if (!(Number(qty.value) > 0)) { flash(qty); qty.focus(); return; }
      const same = lines.find((l) => l.item_id === item.value);
      if (same) same.qty = Math.round((same.qty + Number(qty.value)) * 1e6) / 1e6; else lines.push({ item_id: item.value, qty: Number(qty.value) });
      item.clear(); qty.value = ''; qty.dispatchEvent(new Event('change')); draw(); item.input.focus();
    };
    item.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && item.value) { e.preventDefault(); qty.focus(); } });
    qty.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const save = async (send, btn) => {
      if (!lines.length) { flash(item.input); item.input.focus(); return; }
      if (send && !(await confirm(t('order_send_confirm')))) return;
      btn.disabled = true;
      try {
        await call('orders.save', { order_id: editing ? editing.order_id : undefined, client_id: newId(), note: note.value, lines, send });
        toast(t(send ? 'order_sent' : 'saved'), 'ok');
        editing = null; lines = []; drawEditor();
      } catch (e) { toast(errText(e), 'err'); btn.disabled = false; }
    };
    editorBox.replaceChildren(h('div.form-card', h('h3', editing ? t('order_edit_draft', { n: editing.order_no }) : t('order_new')),
      h('small.muted', t('order_new_help')), srcBar,
      h('div.form-grid', field(t('item'), item, { wide: true }), field(t('qty'), qty),
        h('div.field.end', h('button.btn', { type: 'button', onclick: add }, t('add_line'))), field(t('note'), note, { wide: true })),
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('qty')), h('th', ''), h('th', ''))), body)),
      h('div.form-actions',
        h('button.btn.secondary', { type: 'button', onclick: (e) => save(false, e.currentTarget) }, t('save_draft')),
        h('button.btn.save-btn', { type: 'button', onclick: (e) => save(true, e.currentTarget) }, t('order_send')),
        editing ? h('button.btn.secondary', { type: 'button', onclick: () => { editing = null; lines = []; drawEditor(); } }, t('close')) : null)));
    draw();
  }

  // ---------- the orders of the tab
  async function loadList(quiet) {
    if (quiet !== true) listBox.replaceChildren(h('p.empty', '…'));
    try {
      let list;
      if (approveMode) list = await call('orders.list', tab ? { status: tab } : {});
      else { const want = CASHIER_TABS[tab] || []; list = (await call('orders.list', {})).filter((o) => want.includes(o.status)); }
      listBox.replaceChildren(...(list.length ? list.map(card) : [h('p.empty', t('no_rows'))]));
    } catch (e) { listBox.replaceChildren(h('p.empty', errText(e))); }
  }

  function card(o) {
    const approving = approveMode && Data.can('orders.approve') && o.status === 'sent';
    // the cashier receives a delivered order: what came, per line; less than handed needs a reason
    const receiving = !approveMode && Data.can('orders.receive') && o.status === 'delivered' && o.shop_party_id === shop;
    const got = [];
    const inputs = [];
    const rows = o.lines.map((l) => {
      const it = Data.items.get(l.item_id) || { name: l.item_id, unit: l.unit };
      const inp = approving ? trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, value: l.qty })) : null;
      if (inp) inputs.push({ line_no: l.line_no, inp });
      let recv = null;
      if (receiving && l.status !== 'removed' && l.handed_qty > 0) {
        const q = trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, max: l.handed_qty, value: l.handed_qty }));
        const why = h('select.input.small', h('option', { value: '' }, t('short_reason')), SHORT_REASONS.map((r) => h('option', { value: r }, t('short_' + r))));
        const note = trackFilled(h('input.input.small', { placeholder: t('note') }));
        const extra = h('span.recv-short', { hidden: true }, why, note);
        q.addEventListener('input', () => { extra.hidden = !(Number(q.value) < l.handed_qty); });
        got.push({ line: l, q, why, note });
        recv = h('span', q, extra);
      }
      const received = l.received_qty !== '' && l.received_qty !== undefined
        ? h('span', fmtNum(l.received_qty), l.short_reason ? h('small.err-text', ' ' + t('short_' + l.short_reason) + (l.short_note ? ': ' + l.short_note : '')) : '') : '';
      const state = o.status === 'approved' || o.status === 'ready'
        ? h('span', { class: 'pill ' + ({ handed: 'in', unavailable: 'low', removed: 'out' }[l.status] || 'soon') }, t('line_' + l.status))
        : approving ? (Data.qty(l.item_id) > 0 ? h('span.pill.in', t('ord_available')) : h('span.pill.low', t('ord_not_available'))) : '';
      return h('tr', h('td.wrap', h('bdi', Data.nameOf(it))), h('td.num', fmtNum(l.qty) + ' ' + (it.unit || '')),
        h('td.num', l.approved_qty === '' ? '' : fmtNum(l.approved_qty)), h('td.num', l.handed_qty ? fmtNum(l.handed_qty) : ''),
        h('td', state, l.reason ? h('small.muted', ' ' + l.reason) : ''), h('td', inp || recv || received));
    });
    const actions = h('div.form-actions');
    if (receiving && got.length) {
      actions.append(h('button.btn.save-btn', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        for (const x of got) {
          const v = Number(x.q.value);
          if (x.q.value === '' || v < 0 || v > x.line.handed_qty) return flash(x.q);
          if (v < x.line.handed_qty && !x.why.value) return flash(x.why);
        }
        btn.disabled = true;
        try {
          await call('orders.receive', { order_id: o.order_id, lines: got.map((x) => ({ line_no: x.line.line_no, qty: Number(x.q.value), reason: x.why.value, note: x.note.value })) });
          toast(t('order_received'), 'ok'); loadList();
        } catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
      } }, t('order_receive')));
    }
    if (approving) {
      actions.append(
        h('button.btn.save-btn', { type: 'button', onclick: async (e) => {
          const btn = e.currentTarget;
          const ls = inputs.map((x) => ({ line_no: x.line_no, qty: Number(x.inp.value) || 0 }));
          if (!ls.some((x) => x.qty > 0)) { inputs.forEach((x) => flash(x.inp)); return; }
          btn.disabled = true;
          try { await call('orders.approve', { order_id: o.order_id, lines: ls }); toast(t('order_approved'), 'ok'); Data.refresh().catch(() => {}); loadList(); }
          catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
        } }, t('order_approve')),
        h('button.btn.danger', { type: 'button', onclick: async () => {
          const why = await dialog((close) => {
            const r = trackFilled(h('textarea.input#o-why', { rows: 3 }));
            return [h('h3', t('order_reject'), ' ', o.order_no), field(t('reason'), r),
              h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
                h('button.btn.danger', { type: 'button', onclick: () => (r.value.trim() ? close(r.value.trim()) : flash(r)) }, t('order_reject')))];
          });
          if (!why) return;
          try { await call('orders.reject', { order_id: o.order_id, reason: why }); toast(t('order_rejected'), 'ok'); Data.refresh().catch(() => {}); loadList(); }
          catch (ex) { toast(errText(ex), 'err'); }
        } }, t('order_reject')));
    }
    // being prepared: distribution may take what was handed and close the rest (the order goes on to the trips)
    if (approveMode && Data.can('orders.closeShort') && o.status === 'approved') {
      const handed = o.lines.some((l) => l.handed_qty > 0);
      actions.append(h('small.muted', t('close_short_help')), h('button.btn.secondary', { type: 'button', onclick: async (e) => {
        const why = await dialog((close) => {
          const r = trackFilled(h('input.input#o-short', { value: t('close_short_default') }));
          return [h('h3', t(handed ? 'close_short' : 'close_none'), ' ', o.order_no), h('p', t(handed ? 'close_short_confirm' : 'close_none_confirm')), field(t('reason'), r),
            h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
              h('button.btn', { type: 'button', onclick: () => (r.value.trim() ? close(r.value.trim()) : flash(r)) }, t(handed ? 'close_short' : 'close_none')))];
        });
        if (!why) return;
        const btn = e.target; btn.disabled = true;
        try { await call('orders.closeShort', { order_id: o.order_id, reason: why }); toast(t(handed ? 'close_short_done' : 'close_none_done'), 'ok'); loadList(); }
        catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
      } }, t(handed ? 'close_short' : 'close_none')));
    }
    if (!approveMode && o.status === 'draft' && o.created_by === Data.user.user_id) {
      actions.append(
        h('button.btn', { type: 'button', onclick: () => {
          editing = o; lines = o.lines.map((l) => ({ item_id: l.item_id, qty: l.qty }));
          tab = tabs[name] = 'new'; [...tabBar.children].forEach((b, i) => b.classList.toggle('on', keys[i] === 'new')); show(); window.scrollTo(0, 0);
        } }, t('edit')),
        h('button.btn.secondary', { type: 'button', onclick: async () => {
          if (!(await confirm(t('order_cancel_confirm')))) return;
          try { await call('orders.cancel', { order_id: o.order_id }); toast(t('order_cancelled'), 'ok'); loadList(); } catch (e) { toast(errText(e), 'err'); }
        } }, t('order_cancel')));
    }
    return h('div.req-card',
      h('div.card-head', h('b', o.order_no), h('span', h('bdi', shopName(o.shop_party_id))),
        h('span.muted', t('order_for'), ' ', h('span.num', fmtDate(o.delivery_date))),
        h('span', { class: 'pill ' + (PILL[o.status] || '') }, t('order_st_' + o.status))),
      o.note ? h('p.muted', o.note) : null,
      o.status === 'rejected' && o.reason ? h('p.err-text', t('order_rejected_why', { why: o.reason })) : null,
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('requested')), h('th', t('approved_qty')), h('th', t('issued')),
        h('th', ''), h('th', approving ? t('approved_qty') : receiving || o.status === 'received' || o.status === 'invoiced' ? t('received') : ''))), h('tbody', rows))),
      actions);
  }

  function confirm(text) {
    return dialog((close) => [h('p', text), h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')),
      h('button.btn', { type: 'button', onclick: () => close(true) }, t('ok')))]);
  }

  root.replaceChildren(...parts);
  show();
  const onData = () => { if (!listBox.hidden && !(document.activeElement && document.activeElement.tagName === 'INPUT' && listBox.contains(document.activeElement))) loadList(true); };
  const timer = setInterval(() => { if (document.visibilityState === 'visible') onData(); }, 20000);
  window.addEventListener('moro:data', onData);
  cleanup = () => { clearInterval(timer); window.removeEventListener('moro:data', onData); cleanup = null; };
}

export function dispose() { if (cleanup) cleanup(); }
