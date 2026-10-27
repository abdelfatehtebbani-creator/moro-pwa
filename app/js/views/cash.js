// Cash purchases (petty cash), a tab of the LPO screen: the purchasing officer writes the day's cash payments
// (shop materials, expenses, payments to suppliers), sends the sheet to the admin, and prints it once approved.
// The cash in hand is a running balance: what the admin hands over less every sent or approved sheet.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText, fmtDateTime } from '../i18n.js';
import { h, toast, flash, fmtDate, trackFilled, dialog } from '../ui.js';
import { field } from '../components.js';

const KINDS = ['material', 'expense', 'supplier'];
const STATUSES = ['submitted', 'draft', 'approved', 'rejected'];
const PILL = { draft: 'out', submitted: 'soon', approved: 'in', rejected: 'low' };
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const userName = (id) => (Data.userNames || {})[id] || '';
const SEEN_KEY = 'moro.cash_seen';

/** Sheets waiting for the admin, and this writer's sheets decided and not opened yet (the menu badge). */
export function badgeCount() {
  const b = Data.boot || {};
  let seen = '';
  try { seen = localStorage.getItem(SEEN_KEY) || ''; } catch { /* storage blocked */ }
  return (Number(b.cash_pending) || 0) + (b.cash_decided || []).filter((x) => String(x[2] || '') > seen).length;
}
function markSeen() {
  const last = (Data.boot && Data.boot.cash_decided || []).map((x) => String(x[2] || '')).sort().pop();
  if (last) try { localStorage.setItem(SEEN_KEY, last); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent('moro:badge'));
}

/** "Al Madina for White napkin 1 box" – how the sheet has always read. */
const lineText = (x) => {
  const who = x.party_id ? (Data.parties.get(x.party_id) || {}).name || '' : x.payee || '';
  return (who ? who + ' – ' : '') + x.description;
};

export async function render(root) {
  const canWrite = Data.can('cash.save');
  const canDecide = Data.can('cash.decide');
  const list = h('tbody', h('tr', h('td.empty', { colspan: 6 }, '…')));
  const detail = h('div');
  const balanceEl = h('b.num', '…');
  let filter = canDecide && Data.boot.cash_pending > 0 ? 'submitted' : '';
  let names = { payee: [], paid_by: [], requested_by: [] };
  let balance = 0;
  const tabs = h('div.tabs');
  const drawTabs = () => tabs.replaceChildren(...['', ...STATUSES].map((s) => h('button', { type: 'button', class: filter === s ? 'on' : '',
    onclick: () => { filter = s; drawTabs(); loadList(); } }, s ? t('lpo_st_' + s) : t('all'))));

  async function loadList(openId) {
    let res;
    try { res = await call('cash.list', filter ? { status: filter } : {}); } catch (e) { toast(errText(e), 'err'); return; }
    names = res.names || names;
    Object.keys(names).forEach((k) => { names[k] = (names[k] || []).map(String); });
    balance = res.balance;
    balanceEl.textContent = money(balance) + ' QR';
    balanceEl.classList.toggle('qty-neg', balance < 0);
    list.replaceChildren(...(res.sheets.length ? res.sheets.map((s) => h('tr.click', { onclick: () => show(s.sheet_id) },
      h('td.num', s.sheet_id), h('td.num', fmtDate(s.date)), h('td.num', money(s.total)),
      h('td', h('span', { class: 'pill ' + PILL[s.status] }, t('lpo_st_' + s.status))), h('td', userName(s.created_by)),
      h('td', h('button.btn.small', { type: 'button', onclick: (e) => { e.stopPropagation(); show(s.sheet_id); } }, t('view')))))
      : [h('tr', h('td.empty', { colspan: 6 }, t('cash_none')))]));
    if (openId) show(openId);
  }

  async function show(id) {
    let res;
    try { res = await call('cash.get', { sheet_id: id }); } catch (e) { toast(errText(e), 'err'); return; }
    const s = res.sheet;
    if (s.created_by === Data.user.user_id) markSeen();
    if (canWrite && (s.created_by === Data.user.user_id || canDecide) && (s.status === 'draft' || s.status === 'rejected')) return editor(s, res.lines, res.balance);
    viewer(s, res.lines);
  }

  function viewer(s, lines) {
    const decide = async (approve) => {
      let note = '';
      if (!approve) {
        note = await dialog((close) => {
          const why = trackFilled(h('textarea.input#cash-why', { rows: 3 }));
          return [h('h3', t('lpo_reject')), field(t('lpo_reject_why'), why),
            h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
              h('button.btn.danger', { type: 'button', onclick: () => (why.value.trim() ? close(why.value.trim()) : flash(why)) }, t('lpo_reject')))];
        });
        if (!note) return;
      }
      // lines the admin refuses while approving: each needs its reason
      const rejected_lines = [];
      if (approve) {
        for (const r of refuse) {
          if (!r.box.checked) continue;
          if (!r.why.value.trim()) { toast(t('err.reason_required'), 'err'); return flash(r.why); }
          rejected_lines.push({ line: r.line, note: r.why.value.trim() });
        }
        if (rejected_lines.length === lines.length) { toast(t('err.cash_all_rejected'), 'err'); return; }
      }
      try { await call('cash.decide', { sheet_id: s.sheet_id, approve, note, rejected_lines }); toast(t(approve ? 'cash_approved_msg' : 'lpo_rejected_msg'), 'ok'); }
      catch (e) { toast(errText(e), 'err'); return; }
      Data.refresh().catch(() => {});
      loadList(s.sheet_id);
    };
    const deciding = canDecide && s.status === 'submitted';
    const refuse = [];
    const approvedTotal = s.status === 'approved' && s.approved_total !== '' ? Number(s.approved_total) : Number(s.total);
    const lineRow = (x) => {
      const cells = [h('td', t('cash_k_' + x.kind)), h('td.wrap', h('bdi', lineText(x)),
        x.status === 'rejected' ? h('div.err-text.cash-refused', t('cash_line_refused') + ': ' + x.reject_note) : null),
        h('td.num', x.status === 'rejected' ? h('s', money(x.amount)) : money(x.amount)), h('td', x.paid_by), h('td', x.requested_by)];
      let tr;
      if (deciding) {
        const why = h('input.input.cash-why', { placeholder: t('lpo_reject_why'), hidden: true });
        const box = h('input', { type: 'checkbox', onchange: () => { why.hidden = !box.checked; tr.classList.toggle('cash-off', box.checked); if (box.checked) why.focus(); } });
        refuse.push({ line: x.line, box, why });
        cells.push(h('td', h('label.check', box, ' ', t('cash_refuse_line')), why));
      }
      tr = h('tr', { class: x.status === 'rejected' ? 'cash-off' : '' }, cells);
      return tr;
    };
    detail.replaceChildren(h('div.card',
      h('h2', t('cash_sheet'), ' ', s.sheet_id, ' ', h('span', { class: 'pill ' + PILL[s.status] }, t('lpo_st_' + s.status))),
      h('div.lpo-facts',
        fact(t('date'), fmtDate(s.date)), fact(t('cash_on_hand'), s.opening === '' ? '' : money(s.opening)),
        fact(t('total'), money(s.total)), approvedTotal !== Number(s.total) ? fact(t('cash_approved_total'), h('b', money(approvedTotal))) : null,
        fact(t('cash_after'), s.opening === '' ? '' : money(Number(s.opening) - approvedTotal)),
        fact(t('note'), s.note),
        fact(t('lpo_written_by'), userName(s.created_by) + (s.submitted_at ? ' · ' + fmtDateTime(new Date(s.submitted_at + '+03:00')) : '')),
        s.decided_by ? fact(t(s.status === 'approved' ? 'lpo_approved_by' : 'lpo_rejected_by'),
          userName(s.decided_by) + ' · ' + fmtDateTime(new Date(s.decided_at + '+03:00'))) : null,
        s.decision_note ? fact(t('lpo_reject_why'), h('b.err-text', s.decision_note)) : null),
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('cash_kind')), h('th', t('lpo_desc')), h('th', t('cash_amount')), h('th', t('cash_paid_by')), h('th', t('cash_requested_by')),
        deciding ? h('th', '') : null)),
        h('tbody', lines.map(lineRow),
          h('tr', h('td', { colspan: 2 }, h('b', t('total') + ' (QR)')), h('td.num', h('b', money(approvedTotal))), h('td'), h('td'), deciding ? h('td') : null)))),
      deciding ? h('small.muted', t('cash_refuse_help')) : null,
      h('div.form-actions',
        canDecide && s.status === 'submitted' ? h('button.btn', { type: 'button', onclick: () => decide(true) }, t('lpo_approve')) : null,
        canDecide && s.status === 'submitted' ? h('button.btn.danger', { type: 'button', onclick: () => decide(false) }, t('lpo_reject')) : null,
        s.status === 'approved' ? h('button.btn', { type: 'button', onclick: () => printSheet(s, lines) }, t('cash_print')) : null,
        h('button.btn.secondary', { type: 'button', onclick: () => detail.replaceChildren() }, t('close')))));
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function editor(s, lines, before) {
    const suppliers = [...Data.parties.values()].filter((p) => p.kind === 'supplier' && p.active === true).sort((a, b) => a.name.localeCompare(b.name));
    const byName = new Map(suppliers.map((p) => [p.name.trim().toLowerCase(), p.party_id]));
    const lists = h('div', { hidden: true },
      h('datalist#cash-who', [...new Set([...suppliers.map((p) => p.name), ...names.payee])].map((n) => h('option', { value: n }))),
      h('datalist#cash-paid', names.paid_by.map((n) => h('option', { value: n }))),
      h('datalist#cash-req', names.requested_by.map((n) => h('option', { value: n }))));
    const date = trackFilled(h('input.input#cash-date', { type: 'date', value: s ? s.date : Data.todayIso() }));
    const note = trackFilled(h('input.input#cash-note', { value: s ? s.note : '' }));
    const body = h('tbody');
    const totalEl = h('b.num', '0.00'), afterEl = h('b.num', '');
    const onHand = s ? before : balance;
    const rows = [];
    const recalc = () => {
      const tot = rows.reduce((sum, r) => sum + (Number(r.amount.value) || 0), 0);
      totalEl.textContent = money(tot);
      afterEl.textContent = money(onHand - tot);
      afterEl.classList.toggle('qty-neg', onHand - tot < 0);
    };

    function addLine(x = {}) {
      const kind = h('select.input.cash-kind', KINDS.map((k) => h('option', { value: k }, t('cash_k_' + k))));
      kind.value = x.kind || 'material';
      const who = trackFilled(h('input.input.cash-who', { list: 'cash-who', placeholder: t('cash_who_hint'),
        value: x.party_id ? (Data.parties.get(x.party_id) || {}).name || '' : x.payee || '' }));
      const desc = trackFilled(h('input.input.cash-desc', { value: x.description || '', placeholder: t('cash_desc_hint') }));
      const amount = trackFilled(h('input.input.num.cash-amount', { type: 'number', min: 0, step: 'any', value: x.amount === undefined ? '' : x.amount }));
      const paid = trackFilled(h('input.input.cash-paid', { list: 'cash-paid', value: x.paid_by || '' }));
      const req = trackFilled(h('input.input.cash-req', { list: 'cash-req', value: x.requested_by || '' }));
      amount.addEventListener('input', recalc);
      const row = { kind, who, desc, amount, paid, req, item_id: x.item_id || '' };
      row.tr = h('tr', h('td', kind), h('td', who), h('td', desc), h('td', amount), h('td', paid), h('td', req),
        h('td', h('button.btn.small.secondary', { type: 'button', title: t('delete'), onclick: () => { rows.splice(rows.indexOf(row), 1); row.tr.remove(); recalc(); } }, '✕')));
      rows.push(row);
      body.append(row.tr);
      recalc();
      if (!x.description) kind.focus();
    }

    const payload = (submit) => ({
      sheet_id: s ? s.sheet_id : undefined, date: date.value, note: note.value, submit,
      lines: rows.map((r) => {
        const pid = byName.get(r.who.value.trim().toLowerCase()) || '';
        return { kind: r.kind.value, party_id: pid, payee: pid ? '' : r.who.value, item_id: r.item_id, description: r.desc.value,
                 amount: r.amount.value, paid_by: r.paid.value, requested_by: r.req.value };
      }),
    });
    const save = async (submit) => {
      if (!date.value) return flash(date);
      for (const r of rows) {
        if (r.kind.value === 'supplier' && !byName.get(r.who.value.trim().toLowerCase())) { toast(t('cash_need_supplier'), 'err'); return flash(r.who); }
        if (!r.desc.value.trim()) return flash(r.desc);
        if (!(Number(r.amount.value) > 0)) return flash(r.amount);
      }
      if (!rows.length) { toast(t('err.nothing_to_save'), 'err'); return; }
      if (submit && !(await confirmBox(t('cash_send_confirm', { total: totalEl.textContent })))) return;
      try {
        const r = await call('cash.save', payload(submit));
        toast(t(submit ? 'lpo_sent_msg' : 'saved'), 'ok');
        loadList(r.sheet_id);
      } catch (e) { toast(errText(e), 'err'); }
    };
    const remove = async () => {
      if (!(await confirmBox(t('lpo_delete_confirm')))) return;
      try { await call('cash.delete', { sheet_id: s.sheet_id }); toast(t('deleted'), 'ok'); detail.replaceChildren(); loadList(); }
      catch (e) { toast(errText(e), 'err'); }
    };

    detail.replaceChildren(h('div.card',
      h('h2', s ? t('cash_sheet') + ' ' + s.sheet_id : t('cash_new'), s ? [' ', h('span', { class: 'pill ' + PILL[s.status] }, t('lpo_st_' + s.status))] : null),
      s && s.decision_note ? h('p.err-text', t('lpo_rejected_by') + ' ' + userName(s.decided_by) + ': ' + s.decision_note) : null,
      h('div.lpo-form', field(t('date'), date), field(t('note'), note, { wide: true })),
      h('div.cash-sum', h('span', t('cash_on_hand') + ': ', h('b.num', money(onHand))), h('span', t('total') + ': ', totalEl), h('span', t('cash_after') + ': ', afterEl)),
      h('div.table-wrap', h('table.lpo-edit.cash-edit', h('thead', h('tr', h('th', t('cash_kind')), h('th', t('cash_who')), h('th', t('lpo_desc')),
        h('th', t('cash_amount')), h('th', t('cash_paid_by')), h('th', t('cash_requested_by')), h('th', ''))), body)),
      h('div', h('button.btn.secondary', { type: 'button', onclick: () => addLine() }, '+ ' + t('lpo_add_line'))),
      h('small.muted', t('cash_help')),
      lists,
      h('div.form-actions',
        h('button.btn.secondary', { type: 'button', onclick: () => save(false) }, t('lpo_save_draft')),
        h('button.btn', { type: 'button', onclick: () => save(true) }, t('lpo_send')),
        s ? h('button.btn.danger', { type: 'button', onclick: remove }, t('delete')) : null,
        h('button.btn.secondary', { type: 'button', onclick: () => detail.replaceChildren() }, t('close')))));
    if (lines && lines.length) lines.forEach((x) => addLine(x)); else addLine();
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // the cash history: every hand-over and every sheet, with the balance after each
  async function ledger() {
    let res;
    try { res = await call('cash.ledger', {}); } catch (e) { toast(errText(e), 'err'); return; }
    await dialog((close) => [h('h3', t('cash_ledger')),
      h('div', t('cash_balance') + ': ', h('b.num', money(res.balance) + ' QR')),
      h('div.table-wrap.cash-ledger', h('table', h('thead', h('tr', h('th', t('date')), h('th', t('cash_movement')), h('th', t('cash_amount')), h('th', t('cash_balance')), h('th', t('entered_by')))),
        h('tbody', res.rows.length ? res.rows.map((r) => h('tr',
          h('td.num', fmtDate(r.date)),
          h('td.wrap', r.kind === 'float' ? t(r.amount > 0 ? 'cash_l_float' : 'cash_l_back') : t('cash_sheet') + ' ' + r.ref + ' · ' + t('lpo_st_' + r.status), r.note ? h('small.muted', ' · ' + r.note) : null),
          h('td.num', { class: r.amount < 0 ? 'qty-neg' : 'qty-pos' }, (r.amount > 0 ? '+' : '') + money(r.amount)),
          h('td.num', h('b', money(r.balance))), h('td', userName(r.by)))) : [h('tr', h('td.empty', { colspan: 5 }, t('no_rows')))]))),
      h('div.actions', h('button.btn', { type: 'button', onclick: () => close() }, t('close')))]);
  }

  // admin: cash handed over to the purchasing officer (a negative amount takes cash back)
  async function handOver() {
    const r = await dialog((close) => {
      const date = trackFilled(h('input.input#cf-date', { type: 'date', value: Data.todayIso() }));
      const amount = trackFilled(h('input.input.num#cf-amount', { type: 'number', step: 'any' }));
      const note = trackFilled(h('input.input#cf-note'));
      const ok = () => { if (!date.value) return flash(date); if (!Number(amount.value)) return flash(amount); close({ date: date.value, amount: amount.value, note: note.value }); };
      return [h('h3', t('cash_hand_over')), h('small.muted', t('cash_hand_over_help')), field(t('date'), date), field(t('cash_amount'), amount), field(t('note'), note),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
    });
    if (!r) return;
    try { const res = await call('cash.float', r); toast(t('saved') + ' · ' + t('cash_balance') + ' ' + money(res.balance), 'ok'); loadList(); }
    catch (e) { toast(errText(e), 'err'); }
  }

  drawTabs();
  root.replaceChildren(h('div.card',
    h('div.cash-head', h('h2', t('cash_purchases')),
      h('button.btn.secondary.cash-bal', { type: 'button', title: t('cash_ledger'), onclick: ledger }, t('cash_balance') + ': ', balanceEl, ' ›')),
    h('div.form-actions', tabs, h('div.spacer'),
      canWrite ? h('button.btn', { type: 'button', onclick: () => { try { editor(null, [], balance); } catch (e) { toast(String(e && e.message || e), 'err'); } } }, '+ ' + t('cash_new')) : null,
      Data.can('cash.float') ? h('button.btn.secondary', { type: 'button', onclick: handOver }, t('cash_hand_over')) : null),
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', 'ID'), h('th', t('date')), h('th', t('total') + ' (QR)'), h('th', ''), h('th', t('lpo_written_by')), h('th', ''))), list))),
    detail);
  await loadList();
  if (!canDecide) markSeen();
}

function fact(label, value) {
  return value === '' || value === null || value === undefined ? null : h('div', h('small.muted', label), h('div', value));
}

function confirmBox(text) {
  return dialog((close) => [h('p', text), h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')),
    h('button.btn', { type: 'button', onclick: () => close(true) }, t('ok')))]);
}

/** The approved sheet on A4, like the paper "CASH PURCHASE" sheet. */
function printSheet(s, lines) {
  const d = String(s.date);
  const by = (Data.userNames || {})[s.decided_by] || '';
  const opening = s.opening === '' ? null : Number(s.opening);
  const approved = s.approved_total !== '' && s.approved_total !== undefined ? Number(s.approved_total) : Number(s.total);
  const area = h('div#print-area.lpo-print.cash-print', { dir: 'ltr' },
    h('table.cp-grid',
      h('colgroup', h('col', { style: 'width:62%' }), h('col', { style: 'width:14%' }), h('col', { style: 'width:24%' })),
      h('tbody',
        h('tr.cp-head', h('td', 'CASH PURCHASE - ' + d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4)), h('td', 'QAR'), h('td', 'Beneficiary')),
        opening !== null ? h('tr.cp-hand', h('td', 'CASH ON HAND'), h('td.cp-num', money(opening)), h('td')) : null,
        lines.map((x) => h('tr', { class: x.status === 'rejected' ? 'cp-off' : '' },
          h('td', lineText(x) + (x.requested_by ? ' - ' + x.requested_by : ''), x.status === 'rejected' ? h('div.cp-note', 'NOT APPROVED: ' + x.reject_note) : null),
          h('td.cp-num', x.status === 'rejected' ? h('s', money(x.amount)) : money(x.amount)), h('td', x.paid_by || ''))),
        h('tr.cp-total', h('td', 'TOTAL'), h('td.cp-num', money(approved)), h('td')),
        opening !== null ? h('tr.cp-total', h('td', 'BALANCE'), h('td.cp-num', money(opening - approved)), h('td')) : null)),
    h('div.lp-ok', 'Approved by ' + by + ' on ' + fmtDate(String(s.decided_at).slice(0, 10))),
    h('div.lp-sign', h('div', h('span'), 'Purchasing Manager'), h('div', h('span'), 'Finance Manager')));
  document.body.append(area);
  const done = () => { area.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}
