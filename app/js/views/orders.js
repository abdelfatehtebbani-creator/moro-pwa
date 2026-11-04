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
import { shrink, photoButton } from '../photos.js';
import { Outbox } from '../outbox.js';

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PURCHASE = 'PURCHASE';

const PILL = { draft: 'out', sent: 'soon', approved: 'soon', ready: 'in', in_trip: 'soon', loaded: 'soon', delivered: 'soon', received: 'in',
  invoiced: 'in', rejected: 'low', cancelled: 'out' };
const SHORT_REASONS = ['damaged', 'short_in_trip', 'loading_error', 'other'];
// the cashier's tabs: a tab shows the orders of these statuses
const CASHIER_TABS = { new: null, draft: ['draft'], sent: ['sent', 'approved', 'ready', 'in_trip', 'loaded'], delivered: ['delivered'],
  archive: ['received', 'invoiced', 'rejected', 'cancelled'] };
const APPROVE_TABS = ['sent', 'approved', 'ready', 'diff', 'rejected', ''];
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
        // the amount collected in this shift, before the shop is free for another cashier
        const res = await dialog((close) => {
          const amount = trackFilled(h('input.input.num#sh-amount', { type: 'number', step: 'any', min: 0, inputmode: 'decimal' }));
          const note = trackFilled(h('input.input#sh-note'));
          const ok = () => (amount.value === '' || Number(amount.value) < 0 ? flash(amount) : close({ amount: Number(amount.value), note: note.value.trim() }));
          return [h('h3', t('shift_end')), h('p', t('shift_end_confirm')), field(t('shift_amount'), amount), field(t('note'), note),
            h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('shift_end')))];
        });
        if (!res) return;
        try { await call('orders.shiftEnd', res); await Data.refresh(); render(root, name); } catch (e) { toast(errText(e), 'err'); }
      } }, t('shift_end'))));
  }

  // ---------- tabs
  let tab = tabs[name];
  const tabBar = h('div.tabs');
  const keys = approveMode ? APPROVE_TABS : Object.keys(CASHIER_TABS);
  if (!keys.includes(tab)) tab = keys[0];
  // distribution: how many orders wait in each tab (rejected: those rejected since the tab was last opened)
  const counts = {};
  keys.forEach((k) => {
    counts[k] = h('span.tab-count', { hidden: true });
    tabBar.append(h('button', { type: 'button', class: k === tab ? 'on' : '',
      onclick: (e) => { tab = tabs[name] = k; [...tabBar.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); show(); } },
      t(approveMode ? 'order_st_' + (k || 'all') : 'otab_' + k), counts[k]));
  });
  const SEEN_REJECTED = 'moro.orders.rejectedSeen';
  const seenRejected = () => { try { return localStorage.getItem(SEEN_REJECTED) || ''; } catch { return ''; } };
  function drawCounts(all) {
    // the cashier: orders delivered to the shop, waiting to be received
    if (!approveMode) {
      const d = all.filter((o) => o.status === 'delivered').length;
      if (counts.delivered) { counts.delivered.hidden = !d; counts.delivered.textContent = String(d); }
      return;
    }
    if (tab === 'rejected') { try { localStorage.setItem(SEEN_REJECTED, new Date().toISOString().slice(0, 19)); } catch { /* storage blocked */ } }
    const seen = seenRejected();
    const n = { sent: 0, approved: 0, ready: 0, diff: 0, rejected: 0 };
    all.forEach((o) => {
      if (o.status === 'received' && o.diff_status === 'pending') n.diff++;
      else if (o.status === 'rejected') { if (tab !== 'rejected' && String(o.decided_at || '') > seen) n.rejected++; }
      else if (o.status in n) n[o.status]++;
    });
    Object.keys(n).forEach((k) => { if (counts[k]) { counts[k].hidden = !n[k]; counts[k].textContent = String(n[k]); } });
  }
  const editorBox = h('div');
  const listBox = h('div.req-list');
  parts.push(h('div.card', h('div.card-head', h('h2', t(approveMode ? 'orderapprove' : 'orders')), tabBar), editorBox, listBox));

  function show() {
    const isNew = !approveMode && tab === 'new';
    editorBox.hidden = !isNew;
    listBox.hidden = isNew;
    if (isNew) { drawEditor(); refreshCounts(); } else loadList();
  }

  // ---------- a new order (or a draft being changed)
  let editing = null;
  let lines = [];
  // a special order: the customer's date, time and place, and products described by the cashier
  let kind = 'normal';
  let sp = {};
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
      if (!l.item_id) {
        return h('tr', h('td.wrap', h('span.pill.soon', t('special')), ' ', h('bdi', l.description), ' ', photoButton(l.photo_ids, l.photos) || ''),
          h('td.num', fmtNum(l.qty) + ' ' + (l.unit || '')), h('td.num', money(l.price) + ' QR'),
          h('td', h('button.link', { type: 'button', onclick: () => { lines.splice(i, 1); draw(); } }, t('delete'))));
      }
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
    // ---- the special order: who, when, where, and the products described
    const special = kind === 'special';
    const kindBar = h('div.tabs.order-kind', ['normal', 'special'].map((k) => h('button', { type: 'button', class: k === kind ? 'on' : '',
      onclick: () => { if (k === kind) return; kind = k; if (k === 'normal') lines = lines.filter((l) => l.item_id); drawEditor(); } }, t('order_kind_' + k))));
    const inp = (id, type, v) => trackFilled(h('input.input#' + id, { type, value: v || '' }));
    const cName = inp('o-cname', 'text', sp.customer_name), cPhone = inp('o-cphone', 'tel', sp.customer_phone);
    const dDate = inp('o-ddate', 'date', sp.delivery_date), dTime = inp('o-dtime', 'time', sp.delivery_time);
    const place = h('select.input#o-place', ['shop', 'customer'].map((p) => h('option', { value: p, selected: (sp.place || 'shop') === p }, t('place_' + p))));
    const addr = inp('o-addr', 'text', sp.address);
    const addrField = field(t('address_map'), addr, { wide: true });
    const syncPlace = () => { addrField.hidden = place.value !== 'customer'; };
    place.addEventListener('change', syncPlace); syncPlace();
    const keep = () => { sp = { customer_name: cName.value.trim(), customer_phone: cPhone.value.trim(), delivery_date: dDate.value, delivery_time: dTime.value,
      place: place.value, address: addr.value.trim() }; };
    [cName, cPhone, dDate, dTime, place, addr].forEach((x) => x.addEventListener('change', keep));
    const desc = inp('o-desc', 'text'), sQty = trackFilled(h('input.input.num#o-sqty', { type: 'number', step: 'any', min: 0 }));
    const sUnit = inp('o-sunit', 'text', 'PC'), price = trackFilled(h('input.input.num#o-price', { type: 'number', step: 'any', min: 0 }));
    const files = h('input#o-photos', { type: 'file', accept: 'image/*', multiple: true });
    const addSpecial = async (e) => {
      if (!desc.value.trim()) return flash(desc);
      if (!(Number(sQty.value) > 0)) return flash(sQty);
      if (price.value === '' || Number(price.value) < 0) return flash(price);
      const picked = [...files.files].slice(0, 3);
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const photos = await Promise.all(picked.map(shrink));
        lines.push({ description: desc.value.trim(), qty: Number(sQty.value), unit: sUnit.value.trim() || 'PC', price: Number(price.value), photos, photo_ids: [] });
        desc.value = ''; sQty.value = ''; price.value = ''; files.value = ''; draw();
      } catch { toast(t('err.photo_invalid'), 'err'); }
      btn.disabled = false;
    };
    const addBtn = h('button.btn', { type: 'button', onclick: () => { addBtn.classList.remove('attn'); add(); } }, t('add_line'));
    const addSpecialBtn = special ? h('button.btn', { type: 'button', onclick: (e) => { addSpecialBtn.classList.remove('attn'); addSpecial(e); } }, t('add_line')) : null;
    const specialBox = special ? h('div',
      h('div.form-grid', field(t('customer_name'), cName), field(t('customer_phone'), cPhone), field(t('delivery_date'), dDate), field(t('delivery_time'), dTime),
        field(t('place'), place), addrField),
      h('h4', t('special_product')), h('small.muted', t('special_product_help')),
      h('div.form-grid', field(t('description'), desc, { wide: true }), field(t('qty'), sQty), field(t('unit'), sUnit), field(t('price_unit'), price),
        field(t('photos'), files), h('div.field.end', addSpecialBtn))) : null;
    // something typed and not added to the order: it would be lost, so nothing is saved until it is added or cleared
    const pending = () => {
      if (item.value || item.input.value.trim() || qty.value !== '') return addBtn;
      if (special && (desc.value.trim() || sQty.value !== '' || price.value !== '' || files.files.length)) return addSpecialBtn;
      return null;
    };
    // the lines by where they are made or kept: each department, then each store, then the special products
    const sendGroups = () => {
      const by = new Map();
      lines.forEach((l) => {
        const it = l.item_id ? Data.items.get(l.item_id) || {} : null;
        const st = it ? Data.storeOf(it) : '';
        const key = !it ? '3|' + t('special') : st === 'FINAL' && it.dept ? '1|' + ((Data.parties.get(it.dept) || {}).name || it.dept) : '2|' + t('store_' + st);
        if (!by.has(key)) by.set(key, []);
        by.get(key).push(l);
      });
      return [...by].sort((x, y) => x[0].localeCompare(y[0])).map(([k, ls]) => [k.slice(2),
        ls.slice().sort((a, b) => (a.item_id ? Data.nameOf(Data.items.get(a.item_id) || {}) : a.description).localeCompare(b.item_id ? Data.nameOf(Data.items.get(b.item_id) || {}) : b.description))]);
    };
    const save = async (send, btn) => {
      const left = pending();
      if (left) {
        left.classList.add('attn'); flash(left); left.scrollIntoView({ block: 'center', behavior: 'smooth' });
        toast(t('order_line_pending'), 'err');
        return;
      }
      if (!lines.length) { flash(special ? desc : item.input); return; }
      if (special) {
        keep();
        if (!sp.customer_name) return flash(cName);
        if (!sp.delivery_date) return flash(dDate);
        if (!sp.delivery_time) return flash(dTime);
        if (sp.place === 'customer' && !sp.address) return flash(addr);
        if (sp.place === 'customer' && !sp.customer_phone) return flash(cPhone);
      }
      // what is about to be sent, line by line, to be read once more
      if (send && !(await dialog((close) => [h('h3', t(special ? 'order_send_special_confirm' : 'order_send_confirm')),
        h('p.muted', t('order_send_lines', { n: lines.length })),
        h('div.table-wrap', h('table', h('tbody', sendGroups().flatMap(([g, ls]) => [h('tr.send-group', h('th', { colspan: 2 }, g, ' ', h('small.muted', String(ls.length))))]
          .concat(ls.map((l) => h('tr',
            h('td.wrap', h('bdi', l.item_id ? Data.nameOf(Data.items.get(l.item_id) || { name: l.item_id }) : l.description)),
            h('td.num', fmtNum(l.qty) + ' ' + (l.item_id ? (Data.items.get(l.item_id) || {}).unit || '' : l.unit || ''))))))))),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')),
          h('button.btn', { type: 'button', onclick: () => close(true) }, t('order_send')))]))) return;
      btn.disabled = true;
      // queued on the device and sent in the background: the cashier does not wait for the server (a refusal
      // shows in the list of refused saves; the client id keeps a resend from making a second order)
      try {
        await Outbox.add('orders.save', Object.assign({ order_id: editing ? editing.order_id : undefined, client_id: newId(), note: note.value, lines, send },
          special ? Object.assign({ kind: 'special' }, sp) : {}), t(special ? 'order_kind_special' : 'orders'));
        toast(t(send ? 'order_sent' : 'saved'), 'ok');
        editing = null; lines = []; sp = {}; drawEditor();
      } catch (e) { toast(errText(e), 'err'); btn.disabled = false; }
    };
    // the items of the list: always shown in a normal order; in a special order they open on demand
    const catalogBox = h('div', srcBar, h('div.form-grid', field(t('item'), item, { wide: true }), field(t('qty'), qty),
      h('div.field.end', addBtn)));
    const hasCatalog = lines.some((l) => l.item_id);
    catalogBox.hidden = special && !hasCatalog;
    const catalogToggle = special ? h('button.btn.secondary', { type: 'button', onclick: (e) => {
      catalogBox.hidden = !catalogBox.hidden;
      e.currentTarget.textContent = (catalogBox.hidden ? '▸ ' : '▾ ') + t('special_catalog');
    } }, (catalogBox.hidden ? '▸ ' : '▾ ') + t('special_catalog')) : null;
    editorBox.replaceChildren(h('div.form-card', editing ? null : kindBar, h('h3', editing ? t('order_edit_draft', { n: editing.order_no }) : t(special ? 'order_new_special' : 'order_new')),
      h('small.muted', t(special ? 'order_special_help' : 'order_new_help')), specialBox, catalogToggle, catalogBox,
      h('div.form-grid', field(t('note'), note, { wide: true })),
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('qty')), h('th', ''), h('th', ''))), body)),
      h('div.form-actions',
        h('button.btn.secondary', { type: 'button', onclick: (e) => save(false, e.currentTarget) }, t('save_draft')),
        h('button.btn.save-btn', { type: 'button', onclick: (e) => save(true, e.currentTarget) }, t('order_send')),
        editing ? h('button.btn.secondary', { type: 'button', onclick: () => { editing = null; lines = []; sp = {}; kind = 'normal'; drawEditor(); } }, t('close')) : null)));
    draw();
  }

  // ---------- the orders of the tab
  // the numbers on the tabs while the list is not shown (the cashier writing a new order)
  function refreshCounts() { call('orders.list', approveMode ? { limit: 1000 } : {}).then(drawCounts).catch(() => {}); }

  async function loadList(quiet) {
    if (quiet !== true) listBox.replaceChildren(h('p.empty', '…'));
    try {
      let list;
      if (approveMode) {
        const all = await call('orders.list', { limit: 1000 });
        drawCounts(all);
        const inTab = (o) => (tab === 'diff' ? o.status === 'received' && o.diff_status === 'pending' : o.status === tab);
        list = (tab ? all.filter(inTab) : all).slice(0, 200);
      }
      else { const all = await call('orders.list', {}); drawCounts(all); const want = CASHIER_TABS[tab] || []; list = all.filter((o) => want.includes(o.status)); }
      // orders saved on this device and still on their way to the server
      const going = approveMode ? 0 : Outbox.queued('orders.save').length;
      listBox.replaceChildren(...(going ? [h('p.pill.soon', t('orders_sending', { n: going }))] : []), ...(list.length ? list.map(card) : [h('p.empty', t('no_rows'))]));
    } catch (e) { listBox.replaceChildren(h('p.empty', errText(e))); }
  }

  // a decision on its way: the list is not refreshed under it (a fresh card would offer the button again)
  let busy = 0;
  // a decision on an order is queued on the device and sent in the background (the outbox): the screen does not
  // wait for the server. Until it is sent the card says so and offers no button (no second press); a refusal
  // (someone decided first…) shows in the list of refused saves.
  const ORDER_ACTIONS = ['orders.approve', 'orders.reject', 'orders.route', 'orders.closeShort', 'orders.acceptDiff', 'orders.receive', 'orders.cancel'];
  const sending = (id) => ORDER_ACTIONS.some((a) => Outbox.queued(a).some((j) => j.payload.order_id === id));
  const act = async (action, payload) => {
    const o = payload.order_id;
    await Outbox.add(action, payload, o);
    setTimeout(() => loadList(true), 0);
  };
  const onOutbox = () => { if (!listBox.hidden) loadList(true); };
  window.addEventListener('moro:outbox', onOutbox);

  function card(o) {
    const going = sending(o.order_id);
    const approving = !going && approveMode && Data.can('orders.approve') && o.status === 'sent' && o.kind !== 'special';
    // the production manager: each described line of a special order goes to the department that makes it
    const routing = !going && approveMode && Data.can('orders.route') && o.status === 'sent' && o.kind === 'special';
    const routes = [];
    // the cashier receives a delivered order: what came, per line; less than handed needs a reason
    const receiving = !going && !approveMode && Data.can('orders.receive') && o.status === 'delivered' && o.shop_party_id === shop;
    const got = [];
    const inputs = [];
    // distribution: an order received short – where the missing quantity went, per line
    const reviewing = !going && approveMode && Data.can('orders.acceptDiff') && o.status === 'received' && o.diff_status === 'pending';
    const decide = [];
    const rows = o.lines.map((l) => {
      const it = l.item_id ? Data.items.get(l.item_id) || { name: l.item_id, unit: l.unit } : { name: l.description, unit: l.unit };
      if (routing && !l.item_id) {
        const sel = h('select.input.small', h('option', { value: '' }, '—'), Data.producingDepts().map((p) => h('option', { value: p.party_id }, p.name)),
          h('option', { value: PURCHASE }, t('route_purchase')));
        routes.push({ line_no: l.line_no, sel });
      }
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
      let pick = null;
      if (reviewing && l.short_reason) {
        // empty until distribution chooses: nothing is assumed from the cashier's reason
        pick = h('select.input.small', h('option', { value: '' }, '—'), ['returned', 'lost'].map((d) => h('option', { value: d }, t('diff_' + d))));
        decide.push({ line_no: l.line_no, pick });
      }
      const received = l.received_qty !== '' && l.received_qty !== undefined
        ? h('span', fmtNum(l.received_qty), l.short_reason ? h('small.err-text', ' −' + fmtNum(l.handed_qty - l.received_qty) + ' ' + t('short_' + l.short_reason) + (l.short_note ? ': ' + l.short_note : '')) : '',
          l.short_decision ? h('small.muted', ' · ' + t('diff_' + l.short_decision)) : '', pick ? h('div', pick) : '') : '';
      const state = o.status === 'approved' || o.status === 'ready'
        ? h('span', { class: 'pill ' + ({ handed: 'in', unavailable: 'low', removed: 'out' }[l.status] || 'soon') }, t('line_' + l.status))
        : approving ? (Data.qty(l.item_id) > 0 ? h('span.pill.in', t('ord_available')) : h('span.pill.low', t('ord_not_available'))) : '';
      const route = routes.find((x) => x.line_no === l.line_no);
      const label = l.item_id ? h('bdi', Data.nameOf(it)) : h('span', h('span.pill.soon', t('special')), ' ', h('bdi', l.description), ' ',
        h('small.muted', money(l.price) + ' QR' + (l.purchase === 'buy' ? ' (' + t('price_final') + ')' : l.dept === PURCHASE && !l.purchase ? ' (' + t('price_estimate') + ')' : '')), l.dept ? h('small.muted', ' · ' + (l.dept === PURCHASE ? t('route_purchase') : (Data.parties.get(l.dept) || {}).name || l.dept)) : '',
        ' ', photoButton(l.photos) || '', l.direct ? h('small.muted', ' · ' + t('direct_to_shop')) : '');
      return h('tr', h('td.wrap', label), h('td.num', fmtNum(l.qty) + ' ' + (it.unit || '')),
        h('td.num', l.approved_qty === '' ? '' : fmtNum(l.approved_qty)), h('td.num', l.handed_qty ? fmtNum(l.handed_qty) : ''),
        h('td', state, l.reason ? h('small.muted', ' ' + l.reason) : ''), h('td', inp || recv || (route && route.sel) || received));
    });
    const actions = h('div.form-actions');
    if (reviewing) {
      actions.append(h('small.muted', t('diff_help')), h('button.btn.save-btn', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        const empty = decide.filter((x) => !x.pick.value);
        if (empty.length) { empty.forEach((x) => flash(x.pick)); toast(t('err.decision_required'), 'err'); return; }
        btn.disabled = true;
        try { await act('orders.acceptDiff', { order_id: o.order_id, lines: decide.map((x) => ({ line_no: x.line_no, decision: x.pick.value })) }); toast(t('diff_accepted'), 'ok'); }
        catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
      } }, t('diff_accept')));
    }
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
          await act('orders.receive', { order_id: o.order_id, lines: got.map((x) => ({ line_no: x.line.line_no, qty: Number(x.q.value), reason: x.why.value, note: x.note.value })) });
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
          try { await act('orders.approve', { order_id: o.order_id, lines: ls }); toast(t('order_approved'), 'ok'); }
          catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
        } }, t('order_approve')),
        rejectBtn());
    }
    if (routing) {
      actions.append(h('small.muted', t('route_help')), h('button.btn.save-btn', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        const empty = routes.filter((x) => !x.sel.value);
        if (empty.length) { empty.forEach((x) => flash(x.sel)); toast(t('err.dept_required'), 'err'); return; }
        btn.disabled = true;
        try { await act('orders.route', { order_id: o.order_id, lines: routes.map((x) => ({ line_no: x.line_no, dept: x.sel.value })) }); toast(t('order_routed'), 'ok'); }
        catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
      } }, t('order_route')), rejectBtn());
    }
    function rejectBtn() {
      return h('button.btn.danger', { type: 'button', onclick: async () => {
          const why = await dialog((close) => {
            const r = trackFilled(h('textarea.input#o-why', { rows: 3 }));
            return [h('h3', t('order_reject'), ' ', o.order_no), field(t('reason'), r),
              h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
                h('button.btn.danger', { type: 'button', onclick: () => (r.value.trim() ? close(r.value.trim()) : flash(r)) }, t('order_reject')))];
          });
          if (!why) return;
          try { await act('orders.reject', { order_id: o.order_id, reason: why }); toast(t('order_rejected'), 'ok'); }
          catch (ex) { toast(errText(ex), 'err'); }
        } }, t('order_reject'));
    }
    // being prepared: distribution may take what was handed and close the rest (the order goes on to the trips)
    if (!going && approveMode && Data.can('orders.closeShort') && o.status === 'approved') {
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
        try { await act('orders.closeShort', { order_id: o.order_id, reason: why }); toast(t(handed ? 'close_short_done' : 'close_none_done'), 'ok'); }
        catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
      } }, t(handed ? 'close_short' : 'close_none')));
    }
    if (!going && !approveMode && o.status === 'draft' && o.created_by === Data.user.user_id) {
      actions.append(
        h('button.btn', { type: 'button', onclick: () => {
          editing = o;
          lines = o.lines.map((l) => (l.item_id ? { item_id: l.item_id, qty: l.qty }
            : { description: l.description, qty: l.qty, unit: l.unit, price: l.price, photo_ids: l.photos, photos: [] }));
          kind = o.kind === 'special' ? 'special' : 'normal';
          sp = { customer_name: o.customer_name, customer_phone: o.customer_phone, delivery_date: o.delivery_date, delivery_time: o.delivery_time, place: o.place, address: o.address };
          tab = tabs[name] = 'new'; [...tabBar.children].forEach((b, i) => b.classList.toggle('on', keys[i] === 'new')); show(); window.scrollTo(0, 0);
        } }, t('edit')),
        h('button.btn.secondary', { type: 'button', onclick: async () => {
          if (!(await confirm(t('order_cancel_confirm')))) return;
          try { await act('orders.cancel', { order_id: o.order_id }); toast(t('order_cancelled'), 'ok'); } catch (e) { toast(errText(e), 'err'); }
        } }, t('order_cancel')));
    }
    return h('div.req-card',
      h('div.card-head', h('b', o.order_no), h('span', h('bdi', shopName(o.shop_party_id))),
        h('span.muted', t('order_for'), ' ', h('span.num', fmtDate(o.delivery_date) + (o.delivery_time ? ' ' + o.delivery_time : ''))),
        o.kind === 'special' ? h('span.pill.soon', t('order_kind_special')) : null,
        h('span', { class: 'pill ' + (PILL[o.status] || '') }, t('order_st_' + o.status)),
        o.diff_status === 'pending' ? h('span.pill.low', t('diff_pending')) : null,
        going ? h('span.pill.soon', t('sending')) : null),
      o.kind === 'special' ? h('p.muted', '👤 ', h('bdi', o.customer_name), o.customer_phone ? ' · ' + o.customer_phone : '', ' · ',
        o.place === 'customer' ? h('span', t('place_customer'), ': ', linkify(o.address)) : t('place_shop')) : null,
      o.note ? h('p.muted', o.note) : null,
      o.status === 'rejected' && o.reason ? h('p.err-text', t('order_rejected_why', { why: o.reason })) : null,
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('requested')), h('th', t('approved_qty')), h('th', t('issued')),
        h('th', ''), h('th', approving ? t('approved_qty') : receiving || o.status === 'received' || o.status === 'invoiced' ? t('received') : ''))), h('tbody', rows))),
      actions);
  }

  // an address with a map link: the link opens the map
  function linkify(text) {
    const m = String(text || '').match(/https?:\/\/\S+/);
    if (!m) return h('bdi', text || '');
    return h('span', h('bdi', text.replace(m[0], '').trim()), ' ', h('a', { href: m[0], target: '_blank', rel: 'noopener' }, t('map_open')));
  }

  function confirm(text) {
    return dialog((close) => [h('p', text), h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')),
      h('button.btn', { type: 'button', onclick: () => close(true) }, t('ok')))]);
  }

  root.replaceChildren(...parts);
  show();
  const onData = () => {
    if (busy) return;
    if (listBox.hidden) { refreshCounts(); return; }
    if (!(document.activeElement && document.activeElement.tagName === 'INPUT' && listBox.contains(document.activeElement))) loadList(true);
  };
  const timer = setInterval(() => { if (document.visibilityState === 'visible') onData(); }, 20000);
  window.addEventListener('moro:data', onData);
  cleanup = () => { clearInterval(timer); window.removeEventListener('moro:data', onData); window.removeEventListener('moro:outbox', onOutbox); cleanup = null; };
}

export function dispose() { if (cleanup) cleanup(); }
