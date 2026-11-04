// Returns from the shops (server/Returns.gs). One screen, two uses:
//  - the cashier (returns.create) sends goods back: item, quantity, reason (and a note), and follows them;
//  - the production manager (returns.decide) checks what waits in quarantine and decides each item:
//    back in the stock, damaged or expired. Nothing is picked for them: the choice starts empty.
import { call } from '../api.js';
import { Outbox } from '../outbox.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, fmtDate } from '../ui.js';
import { combo, field, newId } from '../components.js';

const REASONS = ['expired', 'damaged', 'unsold', 'complaint', 'other'];
const DECISIONS = ['available', 'damaged', 'expired'];
const PILL = { quarantine: 'soon', available: 'in', damaged: 'low', expired: 'low' };
let tab = '';

export async function render(root) {
  const decider = Data.can('returns.decide');
  const maker = Data.can('returns.create');
  const shop = (Data.user || {}).shop;
  const shopName = (id) => (Data.parties.get(id) || {}).name || id;
  const itemName = (id) => Data.nameOf(Data.items.get(id) || { name: id });
  // a receipt difference keeps the cashier's reason of the short (short_damaged, short_loading_error…)
  const reasonText = (r) => (r.source === 'diff' ? t('return_from_diff') + ' · ' + t('short_' + r.reason) : t('return_r_' + r.reason)) + (r.note ? ': ' + r.note : '');
  const keys = [].concat(maker ? ['new'] : [], decider ? ['quarantine'] : [], ['mine']);
  if (!keys.includes(tab)) tab = keys[0];

  const box = h('div');
  const bar = h('div.tabs');
  keys.forEach((k) => bar.append(h('button', { type: 'button', class: k === tab ? 'on' : '',
    onclick: (e) => { tab = k; [...bar.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); show(); } },
    t('rtab_' + (k === 'mine' && decider ? 'resolved' : k)))));

  function row(r, extra) {
    return h('div.req-card', h('div.card-head', h('b', h('bdi', itemName(r.item_id))), h('span.num', fmtNum(r.qty) + ' ' + (r.unit || '')),
      h('span', { class: 'pill ' + (PILL[r.decision || r.status] || '') }, t(r.status === 'quarantine' ? 'return_st_quarantine' : 'return_d_' + r.decision))),
      h('small.muted', h('bdi', shopName(r.shop_party_id)), ' · ', h('span.num', fmtDate(r.date)), r.order_no ? ' · ' + r.order_no : '', ' · ', r.return_id),
      h('small', reasonText(r)), r.decision_note ? h('small.muted', t('note') + ': ' + r.decision_note) : null, extra || null);
  }

  // ---------- the cashier: what goes back
  function newForm() {
    if (!shop) return h('p.empty', t('return_need_shift'));
    const lines = [];
    const list = h('div.req-list');
    const item = combo({ id: 'rt-item', placeholder: t('lookup_hint'),
      options: () => Data.activeItems().sort((a, b) => Data.nameOf(a).localeCompare(Data.nameOf(b))).map((i) => ({ value: i.item_id, label: Data.nameOf(i), alt: i.name, hint: i.unit })) });
    const qty = h('input.input#rt-qty', { type: 'number', min: 0, step: 'any', inputmode: 'decimal' });
    const why = h('select.input#rt-why', h('option', { value: '' }, '—'), REASONS.map((r) => h('option', { value: r }, t('return_r_' + r))));
    const note = h('input.input#rt-note', { type: 'text', maxlength: 200 });
    const draw = () => list.replaceChildren(...lines.map((l, i) => h('div.req-card', h('div.card-head', h('b', h('bdi', itemName(l.item_id))),
      h('span.num', fmtNum(l.qty) + ' ' + ((Data.items.get(l.item_id) || {}).unit || '')),
      h('button.link', { type: 'button', onclick: () => { lines.splice(i, 1); draw(); } }, t('return_remove'))),
      h('small', t('return_r_' + l.reason) + (l.note ? ': ' + l.note : '')))));
    const add = () => {
      if (!item.value) return flash(item.input);
      if (!(Number(qty.value) > 0)) return flash(qty);
      if (!why.value) return flash(why);
      if (why.value === 'other' && !note.value.trim()) return flash(note);
      lines.push({ item_id: item.value, qty: Number(qty.value), reason: why.value, note: note.value.trim() });
      item.input.value = ''; qty.value = ''; note.value = ''; why.value = '';
      draw();
    };
    let cid = newId();
    const send = h('button.btn.save-btn', { type: 'button', onclick: async () => {
      if (!lines.length) return toast(t('return_add_first'), 'err');
      send.disabled = true;
      // queued and sent in the background (the client id keeps a resend from making a second return)
      try {
        await Outbox.add('returns.create', { client_id: cid, lines: lines.slice() }, t('returns'));
        toast(t('return_sent'), 'ok');
        cid = newId(); lines.length = 0; draw();
      } catch (e) { toast(errText(e), 'err'); }
      send.disabled = false;
    } }, t('return_send'));
    return h('div.form-card', h('small.muted', t('return_help', { shop: shopName(shop) })),
      h('div.form-grid', field(t('item'), item.el), field(t('qty'), qty), field(t('return_reason'), why), field(t('note'), note)),
      h('div.form-actions', h('button.btn.secondary', { type: 'button', onclick: add }, t('return_add'))), list, h('div.form-actions', send));
  }

  // ---------- the production manager: each item in quarantine gets its fate
  function decideCard(r) {
    const sel = h('select.input.small', h('option', { value: '' }, '—'), DECISIONS.map((d) => h('option', { value: d }, t('return_d_' + d))));
    const note = h('input.input.small', { type: 'text', maxlength: 200, placeholder: t('note') });
    const btn = h('button.btn.save-btn', { type: 'button', onclick: async () => {
      if (!sel.value) { flash(sel); return toast(t('err.decision_required'), 'err'); }
      btn.disabled = true;
      try { await Outbox.add('returns.decide', { lines: [{ return_id: r.return_id, decision: sel.value, note: note.value.trim() }] }, r.return_id); toast(t('return_decided'), 'ok'); load(); }
      catch (e) { toast(errText(e), 'err'); btn.disabled = false; }
    } }, t('return_decide'));
    const going = Outbox.queued('returns.decide').some((j) => j.payload.lines.some((x) => x.return_id === r.return_id));
    return row(r, going ? h('span.pill.soon', t('sending')) : h('div.form-actions', sel, note, btn));
  }

  async function load() {
    if (tab === 'new') { box.replaceChildren(newForm()); return; }
    box.replaceChildren(h('p.muted', t('loading')));
    try {
      const list = await call('returns.list', { status: tab === 'quarantine' ? 'quarantine' : (decider ? 'resolved' : '') });
      box.replaceChildren(h('div.req-list', list.length ? list.map((r) => (tab === 'quarantine' ? decideCard(r) : row(r))) : [h('p.empty', t('no_rows'))]));
    } catch (e) { box.replaceChildren(h('p.empty', errText(e))); }
  }
  const show = () => load();
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('returns')), bar), decider ? h('small.muted', t('return_decide_help')) : null, box));
  show();
}

export function dispose() {}
