// Goods receiving – same fields and rules as MORO v13 (frmReceive), with the v7–v13 habits:
// Enter through the fields, red flash on an empty required field, Enter on Save saves,
// fields clear at once while the save goes out in the background, F2 switches Food/Packaging.
import { Data } from '../data.js';
import { MovStore } from '../movstore.js';
import { Outbox } from '../outbox.js';
import { t, errText } from '../i18n.js';
import { h, toast, fmtNum, fmtDate, trackFilled } from '../ui.js';
import { combo, field, enterNav, checkAll, zoneToggle, doublePress, newId } from '../components.js';

const UNITS = ['BAG', 'BOX', 'PC', 'PK', 'KG', 'L', 'G'];
let cleanup = null;

export async function render(root) {
  if (cleanup) cleanup();
  let editing = null;            // movement being edited (from the records list)
  const today = Data.todayIso();

  // ---------- fields
  const zone = zoneToggle(onZone, 'Food');
  const itemOpts = () => Data.activeItems().filter((i) => i.category === zone.value)
    .sort((a, b) => a.name.localeCompare(b.name)).map((i) => ({ value: i.item_id, label: i.name, hint: fmtNum(Data.qty(i.item_id)) + ' ' + i.unit }));
  const supplierOpts = () => [...Data.parties.values()].filter((p) => p.kind === 'supplier' && p.active === true)
    .sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.party_id, label: p.name }));
  const unitOpts = () => [...new Set([...UNITS, ...Data.activeItems().map((i) => i.unit).filter(Boolean)])].map((u) => ({ value: u, label: u }));
  const locOpts = () => Data.locations.filter((l) => l.category === zone.value).map((l) => ({ value: l.name, label: l.name }));

  const item = combo({ id: 'r-item', options: itemOpts, placeholder: t('lookup_hint'), onPick: showItem });
  const supplier = combo({ id: 'r-supplier', options: supplierOpts });
  const date = trackFilled(h('input.input#r-date', { type: 'date', value: today }));
  const invoice = trackFilled(h('input.input#r-invoice', { autocomplete: 'off' }));
  const parcels = trackFilled(h('input.input.num#r-parcels', { type: 'number', step: 'any', inputmode: 'decimal' }));
  const retail = trackFilled(h('input.input.num#r-retail', { type: 'number', step: 'any', inputmode: 'decimal', value: 1 }));
  const qty = trackFilled(h('input.input.num#r-qty', { type: 'number', step: 'any', inputmode: 'decimal' }));
  const unit = combo({ id: 'r-unit', options: unitOpts });
  const price = trackFilled(h('input.input.num#r-price', { type: 'number', step: 'any', inputmode: 'decimal' }));
  const per = combo({ id: 'r-per', options: unitOpts });
  const amount = trackFilled(h('input.input.num#r-amount', { type: 'number', step: 'any', readonly: true, tabindex: -1 }));
  const discount = trackFilled(h('input.input.num#r-discount', { type: 'number', step: 'any', inputmode: 'decimal', value: 0 }));
  const net = trackFilled(h('input.input.num#r-net', { type: 'number', step: 'any', readonly: true, tabindex: -1 }));
  const expiry = trackFilled(h('input.input#r-expiry', { type: 'date' }));
  const location = combo({ id: 'r-location', options: locOpts });
  const isReturn = h('input#r-return', { type: 'checkbox' });
  const info = h('p.item-info', '');
  const saveBtn = h('button.btn.save-btn#r-save', { type: 'button', onclick: save }, t('save_entry'));
  const newBtn = h('button.btn.secondary', { type: 'button', onclick: () => reset(true) }, t('new_entry'));
  const delBtn = h('button.btn.danger', { type: 'button', hidden: true, onclick: remove }, t('delete'));
  const status = h('p.form-status', '');

  const recalc = () => {
    const p = parcels.value === '' ? null : Number(parcels.value);
    const r = retail.value === '' ? null : Number(retail.value);
    if (p !== null && r !== null) qty.value = String(Math.round(p * r * 1e6) / 1e6);
    if (p !== null && price.value !== '') {
      const a = Math.round(p * Number(price.value) * 100) / 100;
      amount.value = String(a);
      const d = Number(discount.value) || 0;
      net.value = String(Math.round((a - a * d / 100) * 100) / 100);
    } else if (price.value !== '' && qty.value !== '') {
      const a = Math.round(Math.abs(Number(qty.value)) * Number(price.value) * 100) / 100;
      amount.value = String(a);
      net.value = String(Math.round((a - a * (Number(discount.value) || 0) / 100) * 100) / 100);
    } else { amount.value = ''; net.value = ''; }
    [qty, amount, net].forEach((x) => x.dispatchEvent(new Event('change')));
  };
  [parcels, retail, price, discount].forEach((x) => x.addEventListener('input', recalc));

  function showItem(id) {
    const it = Data.items.get(id);
    if (!it) { info.textContent = ''; return; }
    if (!unit.value) unit.set(it.unit);
    if (!per.value) per.set(it.unit);
    const q = Data.qty(id);
    const b = Data.balances.get(id);
    const low = Number(it.min_stock) > 0 && q <= Number(it.min_stock);
    info.className = 'item-info' + (low ? ' low' : '');
    info.textContent = t('available') + ': ' + fmtNum(q) + ' ' + it.unit +
      (Number(it.min_stock) > 0 ? '   |   ' + t('min_stock') + ': ' + fmtNum(it.min_stock) : '') +
      (b && b.last_expiry ? '   |   ' + t('last_expiry') + ': ' + fmtDate(b.last_expiry) : '');
  }

  // required fields follow v13: a return to the supplier needs only supplier, date, item, unit and quantity
  const isRet = () => isReturn.checked;
  const steps = [
    { input: item.input, required: () => true, valid: () => !!item.value },
    { input: supplier.input, required: () => true, valid: () => !!supplier.value },
    { input: date, required: () => true },
    { input: invoice, required: () => !isRet() },
    { input: parcels, required: () => qty.value === '' },
    { input: retail, required: () => parcels.value !== '' },
    { input: qty, required: () => true, valid: () => Number(qty.value) !== 0 },
    { input: unit.input, required: () => true },
    { input: price, required: () => !isRet() },
    { input: per.input, required: () => !isRet() },
    { input: discount, required: () => false, valid: () => Number(discount.value) >= 0 && Number(discount.value) <= 100 },
    { input: expiry, required: () => !isRet() && zone.value === 'Food' },
    { input: location.input, required: () => !isRet() },
  ];
  enterNav(steps, () => saveBtn.focus());

  function onZone() {
    item.clear(); location.clear(); info.textContent = '';
    loadRecords();
    item.input.focus();
  }

  function reset(full) {
    editing = null;
    item.clear(); parcels.value = ''; retail.value = '1'; qty.value = ''; unit.clear(); price.value = '';
    per.clear(); amount.value = ''; discount.value = '0'; net.value = ''; expiry.value = ''; isReturn.checked = false;
    if (full) { supplier.clear(); invoice.value = ''; location.clear(); date.value = Data.todayIso(); }
    [parcels, retail, qty, price, amount, discount, net, expiry, invoice, date].forEach((x) => x.dispatchEvent(new Event('change')));
    info.textContent = '';
    saveBtn.textContent = t('save_entry');
    delBtn.hidden = true;
    item.input.focus();
  }

  function movement() {
    return {
      client_id: newId(), kind: isRet() ? 'SUPPLIER_RETURN' : 'RECEIPT', date: date.value, party_id: supplier.value,
      item_id: item.value, qty: Math.abs(Number(qty.value)), unit: unit.input.value.trim().toUpperCase(),
      price: price.value, per: per.input.value.trim().toUpperCase(), amount: amount.value, discount: discount.value || 0,
      doc_no: invoice.value.trim(), location: location.input.value.trim(), expiry: expiry.value,
    };
  }

  let saving = false;
  async function save() {
    if (saving) return;                  // a second Enter while saving must not save twice
    if (!checkAll(steps)) { status.textContent = t('fill_highlighted'); status.className = 'form-status err'; return; }
    saving = true;
    const m = movement();
    const name = Data.items.get(m.item_id).name;
    const wasEditing = editing;
    reset(false);                        // the form is free again at once; the save continues in the background
    status.textContent = (wasEditing ? t('updated') : t('entry_saved')) + ' ' + new Date().toLocaleTimeString('en-GB');
    status.className = 'form-status ok';
    try {
      if (wasEditing) {
        const changes = { ...m };
        ['client_id', 'kind'].forEach((k) => delete changes[k]);
        await Outbox.add('movements.update', { movement_id: wasEditing.movement_id, changes }, name);
      } else {
        await Outbox.add('movements.save', { movements: [m] }, name);
      }
    } finally { saving = false; }
    loadRecords();
  }

  async function remove() {
    if (!editing) return;
    if (!doublePress('del-' + editing.movement_id)) {
      status.textContent = t('press_again_delete'); status.className = 'form-status warn'; return;
    }
    await Outbox.add('movements.delete', { movement_id: editing.movement_id }, Data.items.get(editing.item_id)?.name);
    status.textContent = t('deleted'); status.className = 'form-status ok';
    reset(false);
    loadRecords();
  }

  function edit(m) {
    if (m.pending) return;
    if (!(Data.can('edit_any') || m.created_by === Data.user.user_id)) { toast(t('err.forbidden'), 'err'); return; }
    const it = Data.items.get(m.item_id);
    if (it && it.category !== zone.value) zone.set(it.category, true);
    editing = m;
    item.set(m.item_id); supplier.set(m.party_id); date.value = m.date; invoice.value = m.doc_no;
    parcels.value = ''; retail.value = '1'; qty.value = String(Math.abs(Number(m.qty)));
    unit.set(m.unit); per.set(m.per); price.value = m.price; discount.value = m.discount || 0;
    amount.value = m.amount; net.value = m.final_amount; expiry.value = m.expiry || '';
    location.set(m.location); isReturn.checked = m.kind === 'SUPPLIER_RETURN';
    if (!location.value && m.location) location.input.value = m.location;
    [date, invoice, parcels, retail, qty, price, discount, amount, net, expiry].forEach((x) => x.dispatchEvent(new Event('change')));
    saveBtn.textContent = t('save_changes');
    delBtn.hidden = !Data.can('movements.delete');
    status.textContent = t('editing_record', { id: m.movement_id }); status.className = 'form-status';
    item.input.focus();
  }

  // ---------- records (latest receipts, searchable)
  const search = trackFilled(h('input.input#r-search', { type: 'search', placeholder: t('search_records') }));
  const recBody = h('tbody');
  let records = [];
  const fillRecords = () => {
    const q = search.value.trim().toLowerCase();
    const rows = records.filter((m) => {
      if (!q) return true;
      const it = Data.items.get(m.item_id); const p = Data.parties.get(m.party_id);
      return [it && it.name, p && p.name, m.doc_no].some((x) => String(x || '').toLowerCase().includes(q));
    }).slice(0, 300);
    recBody.replaceChildren(...(rows.length ? rows.map((m) => {
      const it = Data.items.get(m.item_id); const p = Data.parties.get(m.party_id);
      return h('tr.click', { class: m.pending ? 'pending' : '', onclick: () => edit(m) },
        h('td.num', fmtDate(m.date)), h('td.wrap', h('bdi', it ? it.name : m.item_id)),
        h('td.num', { class: Number(m.qty) < 0 || m.kind === 'SUPPLIER_RETURN' ? 'qty-neg' : '' },
          (m.kind === 'SUPPLIER_RETURN' ? '-' : '') + fmtNum(Math.abs(Number(m.qty))) + ' ' + (m.unit || '')),
        h('td.num', m.final_amount === '' ? '' : fmtNum(m.final_amount)), h('td.num', m.doc_no || ''),
        h('td', m.pending ? h('span.pill.soon', t('pending')) : ''), h('td.wrap', h('bdi', p ? p.name : '')));
    }) : [h('tr', h('td.empty', { colspan: 7 }, t('no_rows')))]));
  };
  search.addEventListener('input', fillRecords);

  async function loadRecords() {
    const keep = (m) => (m.kind === 'RECEIPT' || m.kind === 'SUPPLIER_RETURN') && (Data.items.get(m.item_id) || {}).category === zone.value;
    try {
      const res = await MovStore.all();          // local copy: works without internet
      records = res.list.filter(keep).slice(0, 1500);
      fillRecords();
    } catch (e) { if (!records.length) recBody.replaceChildren(h('tr', h('td.empty', { colspan: 7 }, errText(e)))); }
  }

  root.replaceChildren(h('div.work',
    h('div.card.form-card',
      h('div.card-head', h('h2', t('entry_data')), zone.el),
      h('div.form-grid',
        field(t('item'), item, { wide: true }), info,
        field(t('supplier'), supplier, { wide: true }),
        field(t('date'), date), field(t('invoice_no'), invoice),
        field(t('parcels'), parcels), field(t('per_parcel'), retail),
        field(t('qty'), qty), field(t('unit'), unit),
        field(t('price'), price), field(t('per'), per),
        field(t('amount'), amount), field(t('discount_pct'), discount),
        field(t('net'), net), field(t('expiry'), expiry),
        field(t('location'), location, { wide: true }),
        h('label.check.wide', isReturn, ' ', t('supplier_return'))),
      h('div.form-actions', saveBtn, newBtn, delBtn), status,
      h('small.muted', t('receive_help'))),
    h('div.card',
      h('div.card-head', h('h2', t('records'))), search,
      h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', t('date')), h('th', t('item')),
        h('th', t('qty')), h('th', t('net')), h('th', t('invoice_no')), h('th', ''), h('th', t('supplier')))), recBody)))));

  const onSent = () => loadRecords();
  const onRejected = (e) => { toast(t('rejected', { what: e.detail.label || '' }) + ': ' + errText({ code: e.detail.error, detail: e.detail.detail }), 'err'); loadRecords(); };
  window.addEventListener('moro:sent', onSent);
  window.addEventListener('moro:rejected', onRejected);
  window.addEventListener('moro:data', loadRecords);      // new server data → refresh the records list
  cleanup = () => { zone.dispose(); window.removeEventListener('moro:sent', onSent); window.removeEventListener('moro:rejected', onRejected);
    window.removeEventListener('moro:data', loadRecords); cleanup = null; };
  item.input.focus();
  loadRecords();
}

export function dispose() { if (cleanup) cleanup(); }
