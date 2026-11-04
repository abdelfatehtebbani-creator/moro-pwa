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
  const keys = (Data.can('accounts.statement') ? ['balances', 'statement'] : []).concat(Data.can('accounts.pay') ? ['pay'] : [],
    Data.can('accounts.statement') ? ['lpo'] : [], Data.can('shifts.receive') ? ['takings'] : [], Data.can('sales.list') ? ['sales'] : []);
  if (!keys.includes(state.tab)) state.tab = keys[0];
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
      body.replaceChildren(h('small.muted', t('acc_balances_help')), h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('acc_party')), h('th', ''), h('th', t('balance')), h('th', ''))),
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
    body.replaceChildren(field(t('acc_party'), who), dates(load), out);
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
      h('div.form-grid', field(t('acc_party'), who), field(t('date'), date), field(t('amount'), amount), field(t('acc_method'), method), field(t('reference'), ref), field(t('note'), note, { wide: true })),
      h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: save }, t('save')))));
  }

  function lpo() {
    const out = h('div');
    async function load() {
      out.replaceChildren(h('p.muted', t('loading')));
      try {
        const list = await call('accounts.lpo', { from: state.from, to: state.to });
        out.replaceChildren(h('div.table-wrap', h('table', h('thead', h('tr', h('th', 'LPO'), h('th', t('date')), h('th', t('acc_party')), h('th', t('acc_ordered')),
          h('th', t('acc_received')), h('th', t('acc_diff')), h('th', t('acc_invoices')))),
          h('tbody', list.length ? list.map((x) => { const d = Math.round((x.received - x.ordered) * 100) / 100;
            return h('tr', h('td.num', x.lpo_no), h('td.num', fmtDate(x.date)), h('td.wrap', h('bdi', (Data.parties.get(x.party_id) || {}).name || x.party_id)),
              h('td.num', money(x.ordered)), h('td.num', money(x.received)), h('td.num', { class: d ? 'err-text' : '' }, money(d)), h('td.wrap', x.invoices, ' ', h('small.muted', x.exact ? '✓ ' + t('acc_exact') : t('acc_approx')))); })
            : [h('tr', h('td.empty', { colspan: 7 }, t('no_rows')))]))), h('small.muted', t('acc_lpo_help')));
      } catch (e) { out.replaceChildren(h('p.empty', errText(e))); }
    }
    body.replaceChildren(dates(load), out);
    load();
  }

  // ---- the cash of the shifts: waiting to be received, then the period
  function takings() {
    const waitBox = h('div.req-list');
    const out = h('div');
    const name = (id) => (Data.parties.get(id) || {}).name || id;
    async function loadWait() {
      try {
        const list = await call('shifts.list', { waiting: true });
        waitBox.replaceChildren(...(list.length ? list.map((s) => {
          const got = trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, value: s.amount }));
          const note = trackFilled(h('input.input.small', { placeholder: t('note') }));
          const btn = h('button.btn.save-btn', { type: 'button', onclick: async () => {
            if (got.value === '' || Number(got.value) < 0) return flash(got);
            btn.disabled = true;
            try { await call('shifts.receive', { shift_id: s.shift_id, amount: Number(got.value), note: note.value }); toast(t('saved'), 'ok'); loadWait(); loadPeriod(); }
            catch (e) { toast(errText(e), 'err'); btn.disabled = false; }
          } }, t('tk_receive'));
          return h('div.req-card', h('div.card-head', h('b', h('bdi', name(s.shop_party_id))), h('span', h('bdi', s.cashier)),
            h('span.muted.num', String(s.closed_at).replace('T', ' ').slice(0, 16))),
            h('p', t('tk_declared'), ': ', h('b', money(s.amount) + ' QR'), s.note ? h('small.muted', ' · ' + s.note) : ''),
            h('div.form-actions', field(t('tk_received'), got), note, btn));
        }) : [h('p.empty', t('tk_none_waiting'))]));
      } catch (e) { waitBox.replaceChildren(h('p.empty', errText(e))); }
    }
    async function loadPeriod() {
      out.replaceChildren(h('p.muted', t('loading')));
      try {
        const list = await call('shifts.list', { from: state.from, to: state.to });
        let a = 0, r = 0, d = 0;
        list.forEach((s) => { a += s.amount; if (s.received_amount !== '') { r += s.received_amount; d += s.diff; } });
        out.replaceChildren(h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('date')), h('th', t('shop')), h('th', t('tk_cashier')), h('th', t('tk_declared')),
          h('th', t('tk_received')), h('th', t('acc_diff')))),
          h('tbody', list.length ? list.map((s) => h('tr', h('td.num', fmtDate(s.date)), h('td.wrap', h('bdi', name(s.shop_party_id))), h('td.wrap', h('bdi', s.cashier)),
            h('td.num', money(s.amount)), h('td.num', s.received_amount === '' ? '—' : money(s.received_amount)),
            h('td.num', { class: s.diff ? 'err-text' : '' }, s.diff === '' ? '' : money(s.diff))))
            .concat([h('tr', h('td', h('b', t('total'))), h('td', ''), h('td', ''), h('td.num', h('b', money(a))), h('td.num', h('b', money(r))), h('td.num', h('b', money(d))))])
            : [h('tr', h('td.empty', { colspan: 6 }, t('no_rows')))]))), h('small.muted', t('tk_help')));
      } catch (e) { out.replaceChildren(h('p.empty', errText(e))); }
    }
    body.replaceChildren(h('h3', t('tk_waiting')), waitBox, h('h3', t('tk_period')), dates(loadPeriod), out);
    loadWait(); loadPeriod();
  }

  // ---- the daily sales sheet: one line per shop, cash from the shifts and the other channels typed by the accountant
  const lang = () => (document.documentElement.lang === 'ar' ? 'name_ar' : 'name_en');
  const chName = (c) => c[lang()] || c.name_ar || c.name_en || c.id;
  const PILL = { draft: 'out', submitted: 'soon', approved: 'in', returned: 'low' };
  function sales() {
    const channels = ((Data.boot || {}).sales_channels || []);
    const shopName = (id) => (Data.parties.get(id) || {}).name || id;
    const day = trackFilled(h('input.input#sl-date', { type: 'date', value: state.salesDate || today, max: today }));
    const out = h('div.req-list');
    const decideBox = h('div.req-list');
    day.addEventListener('change', () => { state.salesDate = day.value; load(); });
    const sheet = (v) => {
      const fixed = v.status === 'submitted' || v.status === 'approved';
      const mine = channels.filter((c) => (c.active || v.channels[c.id] !== undefined) && (!c.shops.length || c.shops.includes(v.shop_party_id)));
      const inputs = mine.map((c) => {
        const x = trackFilled(h('input.input.num.small', { type: 'number', step: 'any', min: 0, value: v.channels[c.id] === undefined ? '' : v.channels[c.id], disabled: fixed || !Data.can('sales.save') }));
        return { c, x };
      });
      const total = h('b.num');
      const sum = () => { total.textContent = money(v.cash + inputs.reduce((a, i) => a + (Number(i.x.value) || 0), 0)) + ' QR'; };
      inputs.forEach((i) => i.x.addEventListener('input', sum)); sum();
      const note = trackFilled(h('input.input.small', { value: v.note, placeholder: t('note'), disabled: fixed || !Data.can('sales.save') }));
      const send = (submit) => async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        const ch = {}; inputs.forEach((i) => { if (i.x.value !== '') ch[i.c.id] = Number(i.x.value); });
        try { await call('sales.save', { date: v.date, shop_party_id: v.shop_party_id, channels: ch, note: note.value, submit, client_id: newId() }); toast(t(submit ? 'sl_sent' : 'saved'), 'ok'); load(); }
        catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
      };
      const cash = h('input.input.num.small', { type: 'text', value: money(v.cash), disabled: true });
      // folded: the shop, its state and its total; open (a sheet still to write) shows the channels
      return h('details.req-card.fold', { open: !fixed && !!v.return_note },
        h('summary.card-head', h('b', h('bdi', shopName(v.shop_party_id))),
          v.status ? h('span', { class: 'pill ' + (PILL[v.status] || '') }, t('sl_st_' + v.status)) : null, h('span', t('total'), ': ', total)),
        v.return_note ? h('p.err-text', t('sl_returned_why', { why: v.return_note })) : null,
        h('div.form-grid', field(t('sl_cash'), cash), ...inputs.map((i) => field(chName(i.c), i.x)), field(t('note'), note)),
        v.not_received ? h('small.muted', t('sl_not_received', { n: v.not_received })) : null,
        !fixed && Data.can('sales.save') ? h('div.form-actions', h('button.btn.secondary', { type: 'button', onclick: send(false) }, t('save_draft')),
          h('button.btn.save-btn', { type: 'button', onclick: send(true) }, t('sl_send'))) : null);
    };
    async function load() {
      out.replaceChildren(h('p.muted', t('loading')));
      try { const list = await call('sales.list', { date: day.value }); out.replaceChildren(...(list.length ? list.map(sheet) : [h('p.empty', t('no_rows'))])); }
      catch (e) { out.replaceChildren(h('p.empty', errText(e))); }
    }
    // the admin: the sheets sent, to approve or return
    async function loadDecide() {
      if (!Data.can('sales.decide')) return;
      try {
        const list = await call('sales.list', { status: 'submitted' });
        if (!list.length) { decideBox.replaceChildren(h('p.empty', t('sl_none_sent'))); return; }
        const used = channels.filter((c) => list.some((v) => v.channels[c.id] !== undefined));
        const col = (f) => list.reduce((a, v) => a + (Number(f(v)) || 0), 0);
        const cell = (n) => h('td.num', n === undefined || n === '' ? '—' : money(n));
        decideBox.replaceChildren(h('div.table-wrap', h('table.sales-grid',
          h('thead', h('tr', h('th', t('date')), h('th', t('shop')), h('th', t('sl_cash')), ...used.map((c) => h('th', chName(c))), h('th', t('total')), h('th', ''))),
          h('tbody', ...list.map((v) => h('tr', h('td.num', fmtDate(v.date)), h('td.wrap', h('bdi', shopName(v.shop_party_id)), v.note ? h('small.muted', h('br'), v.note) : ''),
            cell(v.cash), ...used.map((c) => cell(v.channels[c.id])), h('td.num', h('b', money(v.total))),
            h('td', h('div.row-actions', h('button.btn.save-btn.small', { type: 'button', onclick: () => decide(v, true) }, t('sl_approve')),
              h('button.btn.danger.small', { type: 'button', onclick: () => decide(v, false) }, t('sl_return'))))))),
          h('tfoot', h('tr', h('td', h('b', t('total'))), h('td', ''), h('td.num', h('b', money(col((v) => v.cash)))),
            ...used.map((c) => h('td.num', h('b', money(col((v) => v.channels[c.id]))))), h('td.num', h('b', money(col((v) => v.total)))),
            h('td', list.length > 1 ? h('button.btn.save-btn.small', { type: 'button', onclick: approveAll }, t('sl_approve_all')) : ''))))));
        async function approveAll() {
          for (const v of list) { try { await call('sales.decide', { day_id: v.day_id, ok: true }); } catch (e) { toast(errText(e), 'err'); break; } }
          toast(t('saved'), 'ok'); loadDecide(); load(); Data.refresh().catch(() => {});
        }
      } catch (e) { decideBox.replaceChildren(h('p.empty', errText(e))); }
    }
    async function decide(v, ok) {
      let note = '';
      if (!ok) {
        note = await dialog((close) => {
          const r = trackFilled(h('input.input#sl-why'));
          return [h('h3', t('sl_return')), field(t('reason'), r), h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
            h('button.btn.danger', { type: 'button', onclick: () => (r.value.trim() ? close(r.value.trim()) : flash(r)) }, t('sl_return')))];
        });
        if (!note) return;
      }
      try { await call('sales.decide', { day_id: v.day_id, ok, note }); toast(t('saved'), 'ok'); loadDecide(); load(); Data.refresh().catch(() => {}); }
      catch (e) { toast(errText(e), 'err'); }
    }
    body.replaceChildren(...(Data.can('sales.decide') ? [h('h3', t('sl_to_approve')), decideBox] : []), h('h3', t('sl_day')), field(t('date'), day), out,
      h('small.muted', t('sl_help')));
    load(); loadDecide();
  }

  const show = () => ({ balances, statement, pay, lpo, takings, sales })[state.tab]();
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('accounts')), bar), body));
  show();
}

export function dispose() {}
