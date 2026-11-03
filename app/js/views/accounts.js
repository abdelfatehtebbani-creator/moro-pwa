// Accounts (server/Finance.gs, Accounts): what each supplier is owed and each shop owes, with the payments.
//  - balances: every supplier and shop with a balance;
//  - statement: one party over a period: opening balance, each entry, running balance;
//  - payment: a payment made to a supplier or received from a shop (a mistake is voided, never deleted);
//  - purchase orders: each approved LPO against the receipts that followed it (matched by supplier, items and dates).
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtDate, trackFilled, dialog } from '../ui.js';
import { combo, field, newId } from '../components.js';

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const state = { tab: 'balances', party: '', from: '', to: '' };

export async function render(root) {
  const today = Data.todayIso();
  if (!state.from) { state.from = today.slice(0, 8) + '01'; state.to = today; }
  const parties = () => [...Data.parties.values()].filter((p) => (p.kind === 'supplier' || p.kind === 'shop') && p.active === true)
    .sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.party_id, label: p.name, hint: t('kind_' + p.kind) }));
  const body = h('div');
  const bar = h('div.tabs');
  const keys = ['balances', 'statement'].concat(Data.can('accounts.pay') ? ['pay'] : [], ['lpo']);
  keys.forEach((k) => bar.append(h('button', { type: 'button', class: k === state.tab ? 'on' : '',
    onclick: (e) => { state.tab = k; [...bar.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); show(); } }, t('acc_tab_' + k))));
  const dates = (onChange) => {
    const from = trackFilled(h('input.input#ac-from', { type: 'date', value: state.from }));
    const to = trackFilled(h('input.input#ac-to', { type: 'date', value: state.to }));
    [from, to].forEach((x) => x.addEventListener('change', () => { state.from = from.value; state.to = to.value; onChange(); }));
    return h('div.form-grid', field(t('from'), from), field(t('to'), to));
  };
  const side = (b, kind) => (b > 0 ? t(kind === 'supplier' ? 'acc_they_owe_back' : 'acc_shop_owes') : b < 0 ? t(kind === 'supplier' ? 'acc_we_owe' : 'acc_we_owe_shop') : '');

  async function balances() {
    body.replaceChildren(h('p.muted', t('loading')));
    try {
      const list = await call('accounts.balances', {});
      const row = (x) => h('tr.click', { onclick: () => { state.party = x.party_id; state.tab = 'statement'; [...bar.children].forEach((b, i) => b.classList.toggle('on', keys[i] === 'statement')); show(); } },
        h('td.wrap', h('bdi', x.name)), h('td', t('kind_' + x.kind)), h('td.num', h('b', money(Math.abs(x.balance)))), h('td', side(x.balance, x.kind)));
      body.replaceChildren(h('small.muted', t('acc_balances_help')), h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('party')), h('th', ''), h('th', t('balance')), h('th', ''))),
        h('tbody', list.length ? list.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)).map(row) : [h('tr', h('td.empty', { colspan: 4 }, t('no_rows')))]))));
    } catch (e) { body.replaceChildren(h('p.empty', errText(e))); }
  }

  function statement() {
    const who = combo({ id: 'ac-party', options: parties, placeholder: t('lookup_hint'), onPick: () => { state.party = who.value; load(); } });
    if (state.party) who.set(state.party);
    const out = h('div');
    async function load() {
      if (!state.party) { out.replaceChildren(h('p.empty', t('acc_pick_party'))); return; }
      out.replaceChildren(h('p.muted', t('loading')));
      try {
        const s = await call('accounts.statement', { party_id: state.party, from: state.from, to: state.to });
        const tr = (e) => h('tr', h('td.num', fmtDate(e.date)), h('td', t('acc_' + e.kind)), h('td.wrap', e.ref || ''), h('td.num', e.debit ? money(e.debit) : ''),
          h('td.num', e.credit ? money(e.credit) : ''), h('td.num', money(e.balance)),
          h('td', e.payment_id && Data.can('accounts.void') ? h('button.link', { type: 'button', onclick: () => voidIt(e.payment_id, load) }, t('acc_void')) : ''));
        out.replaceChildren(h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('date')), h('th', ''), h('th', t('reference')), h('th', t('acc_debit')),
          h('th', t('acc_credit')), h('th', t('balance')), h('th', ''))),
          h('tbody', h('tr', h('td', ''), h('td', h('b', t('acc_opening'))), h('td', ''), h('td', ''), h('td', ''), h('td.num', h('b', money(s.opening))), h('td', '')),
            ...s.lines.map(tr),
            h('tr', h('td', ''), h('td', h('b', t('acc_closing'))), h('td', ''), h('td', ''), h('td', ''), h('td.num', h('b', money(s.closing))), h('td', side(s.closing, s.party.kind)))))),
          h('small.muted', t(s.party.kind === 'supplier' ? 'acc_supplier_help' : 'acc_shop_help')));
      } catch (e) { out.replaceChildren(h('p.empty', errText(e))); }
    }
    body.replaceChildren(field(t('party'), who), dates(load), out);
    load();
  }

  async function voidIt(id, after) {
    const ok = await dialog((close) => [h('p', t('acc_void_confirm', { id })), h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')),
      h('button.btn.danger', { type: 'button', onclick: () => close(true) }, t('acc_void')))]);
    if (!ok) return;
    try { await call('accounts.void', { payment_id: id }); toast(t('saved'), 'ok'); after(); } catch (e) { toast(errText(e), 'err'); }
  }

  function pay() {
    const who = combo({ id: 'ac-pparty', options: parties, placeholder: t('lookup_hint') });
    const date = trackFilled(h('input.input#ac-date', { type: 'date', value: today }));
    const amount = trackFilled(h('input.input.num#ac-amount', { type: 'number', step: 'any', min: 0 }));
    const method = h('select.input#ac-method', h('option', { value: '' }, '—'), ['cash', 'bank', 'cheque'].map((m) => h('option', { value: m }, t('acc_m_' + m))));
    const ref = trackFilled(h('input.input#ac-ref'));
    const note = trackFilled(h('input.input#ac-note'));
    let cid = newId();
    const save = async (e) => {
      if (!who.value) return flash(who.input);
      if (!(Number(amount.value) > 0)) return flash(amount);
      if (!method.value) return flash(method);
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const r = await call('accounts.pay', { client_id: cid, party_id: who.value, date: date.value, amount: Number(amount.value), method: method.value, ref: ref.value, note: note.value });
        toast(t('acc_paid', { id: r.payment.payment_id }), 'ok'); cid = newId(); amount.value = ''; ref.value = ''; note.value = '';
      } catch (ex) { toast(errText(ex), 'err'); }
      btn.disabled = false;
    };
    body.replaceChildren(h('div.form-card', h('small.muted', t('acc_pay_help')),
      h('div.form-grid', field(t('party'), who), field(t('date'), date), field(t('amount'), amount), field(t('acc_method'), method), field(t('reference'), ref), field(t('note'), note, { wide: true })),
      h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: save }, t('save')))));
  }

  function lpo() {
    const out = h('div');
    async function load() {
      out.replaceChildren(h('p.muted', t('loading')));
      try {
        const list = await call('accounts.lpo', { from: state.from, to: state.to });
        out.replaceChildren(h('div.table-wrap', h('table', h('thead', h('tr', h('th', 'LPO'), h('th', t('date')), h('th', t('party')), h('th', t('acc_ordered')),
          h('th', t('acc_received')), h('th', t('acc_diff')), h('th', t('acc_invoices')))),
          h('tbody', list.length ? list.map((x) => { const d = Math.round((x.received - x.ordered) * 100) / 100;
            return h('tr', h('td.num', x.lpo_no), h('td.num', fmtDate(x.date)), h('td.wrap', h('bdi', (Data.parties.get(x.party_id) || {}).name || x.party_id)),
              h('td.num', money(x.ordered)), h('td.num', money(x.received)), h('td.num', { class: d ? 'err-text' : '' }, money(d)), h('td.wrap', x.invoices)); })
            : [h('tr', h('td.empty', { colspan: 7 }, t('no_rows')))]))), h('small.muted', t('acc_lpo_help')));
      } catch (e) { out.replaceChildren(h('p.empty', errText(e))); }
    }
    body.replaceChildren(dates(load), out);
    load();
  }

  const show = () => ({ balances, statement, pay, lpo })[state.tab]();
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('accounts')), bar), body));
  show();
}

export function dispose() {}
