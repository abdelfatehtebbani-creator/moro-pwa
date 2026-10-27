// LPO (local purchase order): the purchasing officer writes it, sends it to the admin for approval,
// and prints it in the company's LPO layout once approved. Picking a supplier lists what it supplied
// before; picking an item shows the prices paid for it and the other suppliers of it (from the receipts).
import { call } from '../api.js';
import { Data } from '../data.js';
import { MovStore } from '../movstore.js';
import { t, errText, fmtDateTime } from '../i18n.js';
import { h, toast, flash, fmtNum, fmtDate, trackFilled, dialog } from '../ui.js';
import { combo, field } from '../components.js';
import * as cash from './cash.js';

const STATUSES = ['submitted', 'draft', 'approved', 'rejected'];
const PILL = { draft: 'out', submitted: 'soon', approved: 'in', rejected: 'low', cancelled: 'out' };
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const partyName = (id) => (Data.parties.get(id) || {}).name || id || '';
const itemName = (id) => (Data.items.get(id) || {}).name || id || '';
const SEEN_KEY = 'moro.lpo_seen';

/** Approved / rejected LPOs of this writer not opened yet, and LPOs waiting for the admin: the menu badge. */
export function badgeCount() {
  const b = Data.boot || {};
  let seen = '';
  try { seen = localStorage.getItem(SEEN_KEY) || ''; } catch { /* storage blocked */ }
  const news = (b.lpo_decided || []).filter((x) => String(x[2] || '') > seen).length;
  return (Number(b.lpo_pending) || 0) + news + cash.badgeCount();
}
function markSeen() {
  const last = (Data.boot && Data.boot.lpo_decided || []).map((x) => String(x[2] || '')).sort().pop();
  if (last) try { localStorage.setItem(SEEN_KEY, last); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent('moro:badge'));
}

/** Receipts (not returns) grouped for the history panels. */
async function receipts() {
  try {
    const { list } = await MovStore.all();
    return list.filter((m) => m.kind === 'RECEIPT' && m.status !== 'deleted' && m.status !== 'cancelled' && m.price !== '' && m.price !== undefined)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  } catch { return []; }
}

// the screen has two tabs: purchase orders and cash purchases (each shown to whoever may open it)
let section = '';
export async function render(root) {
  const parts = [Data.can('lpo.list') ? 'lpo' : null, Data.can('cash.list') ? 'cash' : null].filter(Boolean);
  if (!parts.includes(section)) section = parts[0] || 'lpo';
  const box = h('div');
  const bar = h('div.tabs.lpo-sections');
  const draw = () => {
    bar.replaceChildren(...parts.map((p) => h('button', { type: 'button', class: section === p ? 'on' : '', onclick: () => { section = p; draw(); } },
      t(p === 'lpo' ? 'lpo_tab' : 'cash_purchases'), h('span.badge', { hidden: !(p === 'cash' ? cash.badgeCount() : lpoCount()) }, String(p === 'cash' ? cash.badgeCount() : lpoCount())))));
    (section === 'cash' ? cash.render : renderLpo)(box);
  };
  root.replaceChildren(parts.length > 1 ? bar : '', box);
  draw();
}
function lpoCount() {
  const b = Data.boot || {};
  let seen = '';
  try { seen = localStorage.getItem(SEEN_KEY) || ''; } catch { /* storage blocked */ }
  return (Number(b.lpo_pending) || 0) + (b.lpo_decided || []).filter((x) => String(x[2] || '') > seen).length;
}

async function renderLpo(root) {
  const canWrite = Data.can('lpo.save');
  const canDecide = Data.can('lpo.decide');
  const list = h('tbody', h('tr', h('td.empty', { colspan: 7 }, '…')));
  const detail = h('div');
  let filter = canDecide && (Data.boot.lpo_pending > 0) ? 'submitted' : '';
  let nextNo = '';
  const tabs = h('div.tabs');

  const drawTabs = () => tabs.replaceChildren(...['', ...STATUSES].map((s) => h('button', { type: 'button', class: filter === s ? 'on' : '',
    onclick: () => { filter = s; drawTabs(); loadList(); } }, s ? t('lpo_st_' + s) : t('all'))));

  async function loadList(openId) {
    let res;
    try { res = await call('lpo.list', filter ? { status: filter } : {}); } catch (e) { toast(errText(e), 'err'); return; }
    nextNo = res.next_no;
    const rows = res.lpos.filter((l) => l.status !== 'cancelled');
    list.replaceChildren(...(rows.length ? rows.map((l) => h('tr.click', { onclick: () => show(l.lpo_id) },
      h('td.num', l.lpo_no), h('td.num', fmtDate(l.date)), h('td.wrap', h('bdi', partyName(l.party_id))), h('td.num', money(l.total)),
      h('td', h('span', { class: 'pill ' + PILL[l.status] }, t('lpo_st_' + l.status))), h('td', (Data.userNames || {})[l.created_by] || ''),
      h('td', h('button.btn.small', { type: 'button', onclick: (e) => { e.stopPropagation(); show(l.lpo_id); } }, t('view')))))
      : [h('tr', h('td.empty', { colspan: 7 }, t('lpo_none')))]));
    if (openId) show(openId);
  }

  async function show(id) {
    let res;
    try { res = await call('lpo.get', { lpo_id: id }); } catch (e) { toast(errText(e), 'err'); return; }
    const l = res.lpo;
    if (l.created_by === Data.user.user_id) markSeen();
    const mine = l.created_by === Data.user.user_id || canDecide;
    if (canWrite && mine && (l.status === 'draft' || l.status === 'rejected')) return editor(l, res.lines);
    viewer(l, res.lines);
  }

  // ---------- read-only view: approve / reject (admin), print (approved)
  function viewer(l, lines) {
    const p = Data.parties.get(l.party_id) || {};
    const decide = async (approve) => {
      let note = '';
      if (!approve) {
        note = await dialog((close) => {
          const why = trackFilled(h('textarea.input#lpo-why', { rows: 3 }));
          return [h('h3', t('lpo_reject')), field(t('lpo_reject_why'), why),
            h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
              h('button.btn.danger', { type: 'button', onclick: () => (why.value.trim() ? close(why.value.trim()) : flash(why)) }, t('lpo_reject')))];
        });
        if (!note) return;
      }
      try { await call('lpo.decide', { lpo_id: l.lpo_id, approve, note }); toast(t(approve ? 'lpo_approved_msg' : 'lpo_rejected_msg'), 'ok'); }
      catch (e) { toast(errText(e), 'err'); return; }
      Data.refresh().catch(() => {});
      loadList(l.lpo_id);
    };
    detail.replaceChildren(h('div.card',
      h('h2', 'LPO ', l.lpo_no, ' ', h('span', { class: 'pill ' + PILL[l.status] }, t('lpo_st_' + l.status))),
      h('div.lpo-facts',
        fact(t('supplier'), h('bdi', p.name || l.party_id)), fact(t('date'), fmtDate(l.date)), fact(t('lpo_delivery'), fmtDate(l.delivery_date)),
        fact(t('lpo_pr'), l.pr_no), fact(t('lpo_requisitioner'), l.requisitioner), fact(t('lpo_tender'), l.tender),
        fact(t('lpo_non_tender'), l.non_tender_reason), fact(t('note'), l.note),
        fact(t('lpo_written_by'), ((Data.userNames || {})[l.created_by] || '') + (l.submitted_at ? ' · ' + fmtDateTime(new Date(l.submitted_at + '+03:00')) : '')),
        l.decided_by ? fact(t(l.status === 'approved' ? 'lpo_approved_by' : 'lpo_rejected_by'),
          ((Data.userNames || {})[l.decided_by] || '') + ' · ' + fmtDateTime(new Date(l.decided_at + '+03:00'))) : null,
        l.decision_note ? fact(t('lpo_reject_why'), h('b.err-text', l.decision_note)) : null),
      linesTable(lines),
      h('div.form-actions',
        canDecide && l.status === 'submitted' ? h('button.btn', { type: 'button', onclick: () => decide(true) }, t('lpo_approve')) : null,
        canDecide && l.status === 'submitted' ? h('button.btn.danger', { type: 'button', onclick: () => decide(false) }, t('lpo_reject')) : null,
        l.status === 'approved' ? h('button.btn', { type: 'button', onclick: () => printLpo(l, lines) }, t('lpo_print')) : null,
        h('button.btn.secondary', { type: 'button', onclick: () => detail.replaceChildren() }, t('close')))));
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- editor: new, draft or rejected
  async function editor(l, lines) {
    const movs = await receipts();
    const suppliers = () => [...Data.parties.values()].filter((p) => p.kind === 'supplier' && p.active === true)
      .sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.party_id, label: p.name }));
    const itemOpts = () => Data.activeItems().sort((a, b) => a.name.localeCompare(b.name)).map((i) => ({ value: i.item_id, label: i.name, hint: i.unit }));
    const no = trackFilled(h('input.input.num#lpo-no', { type: 'number', min: 1, step: 1, value: l ? l.lpo_no : nextNo }));
    const date = trackFilled(h('input.input#lpo-date', { type: 'date', value: l ? l.date : Data.todayIso() }));
    const delivery = trackFilled(h('input.input#lpo-delivery', { type: 'date', value: l ? l.delivery_date : Data.todayIso() }));
    const pr = trackFilled(h('input.input#lpo-pr', { value: l ? l.pr_no : '' }));
    const req = trackFilled(h('input.input#lpo-req', { value: l ? l.requisitioner : 'AL AKER' }));
    const tender = trackFilled(h('input.input#lpo-tender', { value: l ? l.tender : '' }));
    const nonTender = trackFilled(h('input.input#lpo-nontender', { value: l ? l.non_tender_reason : '' }));
    const note = trackFilled(h('input.input#lpo-note', { value: l ? l.note : '' }));
    const hist = h('div.lpo-hist');
    const sup = combo({ id: 'lpo-sup', options: suppliers, placeholder: t('lpo_pick_supplier'), onPick: () => supplierHistory() });
    const body = h('tbody');
    const totalEl = h('b.num', '0.00');
    const rows = [];
    let seq = 0;

    const recalc = () => { totalEl.textContent = money(rows.reduce((s, r) => s + r.total(), 0)); };

    // what this supplier delivered before: one line per item, the last price first; a click adds the item
    function supplierHistory() {
      const pid = sup.value;
      if (!pid) { hist.replaceChildren(h('p.muted', t('lpo_hist_help'))); return; }
      const by = new Map();
      movs.filter((m) => m.party_id === pid).forEach((m) => { if (!by.has(m.item_id)) by.set(m.item_id, []); by.get(m.item_id).push(m); });
      hist.replaceChildren(h('h3', t('lpo_supplied_before', { s: partyName(pid) })),
        by.size ? h('div.table-wrap.lpo-hist-table', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('lpo_last_price')), h('th', t('date')), h('th', t('lpo_times')), h('th', ''))),
          h('tbody', [...by.entries()].sort((a, b) => itemName(a[0]).localeCompare(itemName(b[0]))).map(([id, ms]) => h('tr.click', { onclick: () => itemHistory(id) },
            h('td.wrap', h('bdi', itemName(id))), h('td.num', money(ms[0].price) + ' / ' + (ms[0].per || ms[0].unit)), h('td.num', fmtDate(ms[0].date)), h('td.num', ms.length),
            h('td', h('button.btn.small', { type: 'button', onclick: (e) => { e.stopPropagation(); addLine({ item_id: id, unit: ms[0].per || ms[0].unit, price: ms[0].price }); } }, '+ ' + t('lpo_add'))))))))
          : h('p.muted', t('lpo_no_history')));
    }

    // prices paid for an item: with this supplier, then every other supplier (last price, how many times)
    function itemHistory(id, row) {
      const pid = sup.value;
      const all = movs.filter((m) => m.item_id === id);
      const here = all.filter((m) => m.party_id === pid);
      const others = new Map();
      all.filter((m) => m.party_id !== pid).forEach((m) => { if (!others.has(m.party_id)) others.set(m.party_id, []); others.get(m.party_id).push(m); });
      const use = (m) => (e) => {
        e.stopPropagation();
        if (row) { row.setUnit(m.per || m.unit); row.price.value = m.price; row.paint(); }
        else addLine({ item_id: id, unit: m.per || m.unit, price: m.price });
      };
      hist.replaceChildren(
        h('div.lpo-hist-head', h('h3', h('bdi', itemName(id))), pid ? h('button.link', { type: 'button', onclick: supplierHistory }, '← ' + t('lpo_back_supplier')) : null),
        pid ? h('h4', t('lpo_prices_with', { s: partyName(pid) })) : null,
        pid ? (here.length ? h('div.table-wrap.lpo-hist-table', h('table', h('thead', h('tr', h('th', t('date')), h('th', t('qty')), h('th', t('price')), h('th', ''))),
          h('tbody', here.slice(0, 30).map((m) => h('tr', h('td.num', fmtDate(m.date)), h('td.num', fmtNum(m.entry_qty || Math.abs(m.qty)) + ' ' + (m.entry_unit || m.unit)),
            h('td.num', money(m.price) + ' / ' + (m.per || m.unit)), h('td', h('button.btn.small', { type: 'button', onclick: use(m) }, t('lpo_use_price')))))))) : h('p.muted', t('lpo_never_from'))) : null,
        h('h4', t(pid ? 'lpo_other_suppliers' : 'lpo_all_suppliers')),
        others.size ? h('div.table-wrap.lpo-hist-table', h('table', h('thead', h('tr', h('th', t('supplier')), h('th', t('lpo_last_price')), h('th', t('date')), h('th', t('lpo_times')), h('th', ''))),
          h('tbody', [...others.entries()].sort((a, b) => Number(a[1][0].price) - Number(b[1][0].price)).map(([p, ms]) => h('tr',
            h('td.wrap', h('bdi', partyName(p))), h('td.num', money(ms[0].price) + ' / ' + (ms[0].per || ms[0].unit)), h('td.num', fmtDate(ms[0].date)), h('td.num', ms.length),
            h('td', h('button.btn.small.secondary', { type: 'button', title: t('lpo_switch_supplier'), onclick: () => { sup.set(p); itemHistory(id, row); } }, t('lpo_choose'))))))))
          : h('p.muted', t('lpo_no_others')));
    }

    function addLine(x = {}) {
      // an item added from the history fills the empty line left at the end, if any
      const last = rows[rows.length - 1];
      if (x.item_id && last && !last.it.value && !last.desc.value.trim() && !last.qty.value) { rows.pop(); last.tr.remove(); }
      const n = ++seq;
      const it = combo({ id: 'lpo-it-' + n, options: itemOpts, placeholder: t('lookup_hint'), onPick: (v) => {
        const item = Data.items.get(v);
        if (item) { desc.value = item.name; row.setUnit(item.report_unit || item.unit); itemHistory(v, row); }
        row.paint();
      } });
      const desc = trackFilled(h('input.input.lpo-desc', { value: x.description || '', placeholder: t('lpo_desc') }));
      const qty = trackFilled(h('input.input.num.lpo-qty', { type: 'number', min: 0, step: 'any', value: x.qty || '' }));
      const unit = h('input.input.lpo-unit', { list: 'lpo-units', value: x.unit || '' });
      const price = trackFilled(h('input.input.num.lpo-price', { type: 'number', min: 0, step: 'any', value: x.price === undefined ? '' : x.price }));
      const totalCell = h('td.num');
      const row = {
        it, desc, qty, unit, price,
        total: () => r2((Number(qty.value) || 0) * (Number(price.value) || 0)),
        paint: () => { totalCell.textContent = qty.value && price.value !== '' ? money(row.total()) : ''; recalc(); },
        setUnit: (u) => { unit.value = String(u || '').toUpperCase(); },
      };
      [qty, price].forEach((i) => i.addEventListener('input', row.paint));
      it.input.addEventListener('focus', () => { if (it.value) itemHistory(it.value, row); });
      row.tr = h('tr', h('td', it.el), h('td', desc), h('td', qty), h('td', unit), h('td', price), totalCell,
        h('td', h('button.btn.small.secondary', { type: 'button', title: t('delete'), onclick: () => { rows.splice(rows.indexOf(row), 1); row.tr.remove(); recalc(); } }, '✕')));
      rows.push(row);
      body.append(row.tr);
      if (x.item_id) { it.set(x.item_id); if (x.description) desc.value = x.description; if (x.unit) row.setUnit(x.unit); if (x.price !== undefined) price.value = x.price; }
      else if (x.description) { desc.value = x.description; row.setUnit(x.unit); }
      row.paint();
      if (!x.item_id && !x.description) it.input.focus(); else if (!x.qty) qty.focus();
      return row;
    }

    const payload = (submit) => ({
      lpo_id: l ? l.lpo_id : undefined, lpo_no: no.value, date: date.value, delivery_date: delivery.value, party_id: sup.value,
      pr_no: pr.value, requisitioner: req.value, tender: tender.value, non_tender_reason: nonTender.value, note: note.value, submit,
      lines: rows.map((r) => ({ item_id: r.it.value, description: r.desc.value, qty: r.qty.value, unit: r.unit.value, price: r.price.value })),
    });
    const save = async (submit) => {
      if (!no.value) return flash(no);
      if (!date.value) return flash(date);
      if (!sup.value) return flash(sup.input);
      for (const r of rows) {
        if (!r.desc.value.trim()) return flash(r.desc);
        if (!(Number(r.qty.value) > 0)) return flash(r.qty);
        if (r.price.value === '') return flash(r.price);
      }
      if (!rows.length) { toast(t('err.nothing_to_save'), 'err'); return; }
      if (submit && !(await confirmBox(t('lpo_send_confirm', { n: no.value, total: totalEl.textContent })))) return;
      try {
        const r = await call('lpo.save', payload(submit));
        toast(t(submit ? 'lpo_sent_msg' : 'saved'), 'ok');
        loadList(r.lpo_id);
      } catch (e) { toast(errText(e), 'err'); }
    };
    const remove = async () => {
      if (!(await confirmBox(t('lpo_delete_confirm')))) return;
      try { await call('lpo.delete', { lpo_id: l.lpo_id }); toast(t('deleted'), 'ok'); detail.replaceChildren(); loadList(); }
      catch (e) { toast(errText(e), 'err'); }
    };

    const units = h('datalist#lpo-units', Data.unitOptions().map((o) => h('option', { value: o.value })));
    detail.replaceChildren(h('div.card',
      h('h2', l ? 'LPO ' + l.lpo_no : t('lpo_new'), l ? [' ', h('span', { class: 'pill ' + PILL[l.status] }, t('lpo_st_' + l.status))] : null),
      l && l.decision_note ? h('p.err-text', t('lpo_rejected_by') + ' ' + ((Data.userNames || {})[l.decided_by] || '') + ': ' + l.decision_note) : null,
      h('div.lpo-form',
        field(t('lpo_no'), no), field(t('date'), date), field(t('supplier'), sup, { wide: true }), field(t('lpo_delivery'), delivery),
        field(t('lpo_pr'), pr), field(t('lpo_requisitioner'), req), field(t('lpo_tender'), tender), field(t('lpo_non_tender'), nonTender),
        field(t('note'), note, { wide: true })),
      h('div.lpo-work',
        h('div.lpo-lines', h('div.table-wrap', h('table.lpo-edit', h('thead', h('tr', h('th', t('item')), h('th', t('lpo_desc')), h('th', t('qty')), h('th', t('unit')),
          h('th', t('lpo_unit_price')), h('th', t('total')), h('th', ''))), body)),
          h('div.lpo-total', h('button.btn.secondary', { type: 'button', onclick: () => addLine() }, '+ ' + t('lpo_add_line')), h('span', t('total') + ' (QR): '), totalEl)),
        hist),
      units,
      h('div.form-actions',
        h('button.btn.secondary', { type: 'button', onclick: () => save(false) }, t('lpo_save_draft')),
        h('button.btn', { type: 'button', onclick: () => save(true) }, t('lpo_send')),
        l ? h('button.btn.danger', { type: 'button', onclick: remove }, t('delete')) : null,
        h('button.btn.secondary', { type: 'button', onclick: () => detail.replaceChildren() }, t('close')))));
    if (l) { sup.set(l.party_id); lines.forEach((x) => addLine(x)); } else addLine();
    supplierHistory();
    if (!l) sup.input.focus();
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- admin: terms, company block, first number
  async function settings() {
    const b = Data.boot;
    const r = await dialog((close) => {
      const terms = h('textarea.input#lpo-terms', { rows: 7 }, b.lpo_terms || '');
      const company = h('textarea.input#lpo-company', { rows: 4 }, b.lpo_company || '');
      const start = h('input.input.num#lpo-start', { type: 'number', min: 1, value: nextNo });
      return [h('h3', t('lpo_settings')), field(t('lpo_terms'), terms), h('small.muted', t('lpo_terms_help')), field(t('lpo_company'), company),
        field(t('lpo_next_no'), start), h('small.muted', t('lpo_next_help')),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
          h('button.btn', { type: 'button', onclick: () => close({ terms: terms.value, company: company.value, start: start.value }) }, t('save')))];
    });
    if (!r) return;
    const pl = { terms: r.terms, company: r.company };
    if (Number(r.start) !== Number(nextNo)) pl.start = Number(r.start);
    try { await call('lpo.settings', pl); toast(t('saved'), 'ok'); await Data.refresh(); loadList(); }
    catch (e) { toast(errText(e), 'err'); }
  }

  drawTabs();
  root.replaceChildren(h('div.card', h('h2', t('lpo')),
    h('div.form-actions', tabs, h('div.spacer'),
      canWrite ? h('button.btn', { type: 'button', onclick: () => editor(null, []) }, '+ ' + t('lpo_new')) : null,
      Data.can('lpo.settings') ? h('button.btn.secondary', { type: 'button', onclick: settings }, t('lpo_settings')) : null),
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('lpo_no')), h('th', t('date')), h('th', t('supplier')), h('th', t('total') + ' (QR)'),
      h('th', ''), h('th', t('lpo_written_by')), h('th', ''))), list))),
    detail);
  await loadList();
  if (!canDecide) markSeen();
}

function fact(label, value) {
  return value === '' || value === null || value === undefined ? null : h('div', h('small.muted', label), h('div', h('bdi', value)));
}

function linesTable(lines) {
  const total = lines.reduce((s, x) => s + Number(x.total || 0), 0);
  // the grand total also under the table: on a phone the table scrolls sideways
  return [h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('qty')), h('th', t('unit')), h('th', t('lpo_desc')), h('th', t('lpo_unit_price')), h('th', t('total')))),
    h('tbody', lines.map((x) => h('tr', h('td.num', fmtNum(x.qty)), h('td', x.unit), h('td.wrap', h('bdi', x.description)), h('td.num', money(x.price)), h('td.num', money(x.total))))),
    h('tfoot', h('tr', h('td', { colspan: 4 }, h('b', t('total') + ' (QR)')), h('td.num', h('b', money(total))))))),
    h('div.grand-total', t('lpo_grand_total') + ': ', h('b.num', money(total) + ' QR'))];
}

function confirmBox(text) {
  return dialog((close) => [h('p', text), h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')),
    h('button.btn', { type: 'button', onclick: () => close(true) }, t('ok')))]);
}

/** The LPO on one A4 page, laid out like the company's paper form. */
function printLpo(l, lines) {
  const p = Data.parties.get(l.party_id) || {};
  const b = Data.boot || {};
  const total = lines.reduce((s, x) => s + Number(x.total || 0), 0);
  const company = String(b.lpo_company || '').split('\n').filter((x) => x.trim());
  const terms = String(b.lpo_terms || '').split('\n').map((x) => x.trim()).filter(String);
  const by = (Data.userNames || {})[l.decided_by] || '';
  const area = h('div#print-area.lpo-print', { dir: 'ltr' },
    h('div.lp-head',
      h('div.lp-left',
        h('div.lp-u', 'The following number must appear on all related', h('br'), 'correspondence, shipping papers and invoices:'),
        h('div.lp-b', 'L.P.O NUMBER: ' + l.lpo_no),
        h('div', h('span.lp-b', 'PR NUMBER: '), l.pr_no || ''),
        h('table.lp-to', h('tbody',
          h('tr', h('td', 'To:'), h('td.lp-b', p.name || '')),
          h('tr', h('td', 'Tel:'), h('td', p.tel || '')),
          h('tr', h('td', 'Fax:'), h('td', p.fax || '')),
          h('tr', h('td', 'e-mail:'), h('td', p.email || '')),
          h('tr', h('td', 'Contact:'), h('td', h('span.lp-b', p.contact || ''), h('span.lp-gap', p.contact_phone || '')))))),
      h('div.lp-logo', h('img', { src: 'icons/lpo-logo.svg', alt: '' })),
      h('div.lp-co', company.map((x, i) => h('div', { class: i === 0 ? 'lp-co-name' : '' }, x)))),
    h('table.lp-grid',
      h('colgroup', [7, 8, 27, 18, 20, 20].map((w) => h('col', { style: 'width:' + w + '%' }))),
      h('tbody',
        h('tr.lp-th', h('td', { colspan: 2 }, 'P.O.DATE'), h('td', 'REQUISITIONER'), h('td', 'Tender Item'), h('td.lp-small', 'If Non Tender Reason'), h('td', 'Delivery Date')),
        h('tr.lp-c', h('td', { colspan: 2 }, fmtDate(l.date)), h('td', l.requisitioner || ''), h('td', l.tender || ''), h('td', l.non_tender_reason || ''), h('td', fmtDate(l.delivery_date))),
        h('tr.lp-th', h('td', 'QTY'), h('td', 'UNIT'), h('td', { colspan: 2 }, 'DESCRIPTION'), h('td', 'UNIT PRICE'), h('td', 'TOTAL (QR)')),
        lines.map((x) => h('tr.lp-line', h('td.lp-ctr', fmtNum(x.qty)), h('td.lp-ctr', x.unit), h('td.lp-desc', { colspan: 2 }, x.description),
          h('td.lp-ctr', money(x.price)), h('td.lp-ctr', money(x.total)))))),
    h('div.lp-foot',
      h('div.lp-admin', h('div.lp-b', 'For Admin use only'), h('div.lp-b', 'Al Aker'),
        l.status === 'approved' ? h('div.lp-ok', 'Approved by ' + by + ' on ' + fmtDate(String(l.decided_at).slice(0, 10))) : null),
      h('table.lp-sum', h('tbody',
        h('tr', h('td.lp-b', 'SubTotal'), h('td.lp-box', money(total))),
        h('tr', h('td.lp-b', 'Total (QR)'), h('td.lp-box', money(total)))))),
    h('ol.lp-terms', terms.map((x) => h('li', x.replace(/^\d+[.)]\s*/, '')))),
    h('div.lp-sign', h('div', h('span'), 'Purchasing Manager'), h('div', h('span'), 'Finance Manager')));
  document.body.append(area);
  const done = () => { area.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  // the logo must be loaded before the print dialog opens
  const img = area.querySelector('img');
  const go = () => window.print();
  if (img.complete) go(); else { img.onload = go; img.onerror = go; }
}
