// Coffee bags. Three parts:
//  - the calculator (the former "حاسبة أكياس القهوة 200غ" app, same formulas as its Excel sheet): how much
//    green coffee to buy before roasting for a number of bags, split between the two origins of the blend;
//    its values are kept on this device;
//  - preparing bags (server/Coffee.gs): the storekeeper enters what really happened, the stock moves and the
//    real roasting loss and waste are worked out and set against the calculator's;
//  - the stock of bags and green coffee, the batches and the bags given out (from the issue screen).
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtDate, fmtNum, trackFilled } from '../ui.js';
import { combo, field, newId } from '../components.js';

const DEFAULTS = { count: 100, weight: 200, waste: 7, loss: 20, ratio: 20 };
const KEY = 'moro.coffee_calc';
const kg = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const PACK_KEY = 'moro.coffee_pack';
const pct = (n) => (n === null || n === undefined ? '–' : (Math.round(n * 10) / 10).toLocaleString('en-US') + '%');
const grams = (n) => (n === null || n === undefined ? '–' : (Math.round(n * 10) / 10).toLocaleString('en-US') + ' ' + t('cf_g'));
const userName = (id) => (Data.userNames || {})[id] || '';
function calcValues() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* storage blocked */ }
  const n = (f) => { const v = parseFloat(c[f]); return isFinite(v) ? v : DEFAULTS[f]; };
  return { weight: n('weight'), waste: n('waste'), loss: n('loss') };
}
// stock units of the pouch item per filled bag (same reading as Coffee.pouchFactor on the server)
function pouchFactor(item) {
  const unit = String(item.unit || '').toUpperCase();
  if (unit === 'PC' || unit === 'PCS') return 1;
  const p = Data.packsOf(item).find((x) => x.unit === 'PC' || x.unit === 'PCS');
  if (p) return p.factor;
  const m = String(item.name || '').match(/(\d+)\s*pcs?\b/i);
  return m && Number(m[1]) > 0 ? 1 / Number(m[1]) : null;
}
function packMemory() {
  try { return JSON.parse(localStorage.getItem(PACK_KEY) || '{}') || {}; } catch { return {}; }
}

let section = 'calc';
export function render(root) {
  const parts = ['calc', Data.can('coffee.pack') ? 'pack' : null, Data.can('coffee.list') ? 'log' : null].filter(Boolean);
  if (!parts.includes(section)) section = parts[0];
  const box = h('div');
  const bar = h('div.tabs.lpo-sections');
  const draw = () => {
    bar.replaceChildren(...parts.map((p) => h('button', { type: 'button', class: section === p ? 'on' : '', onclick: () => { section = p; draw(); } }, t('cf_tab_' + p))));
    ({ calc: renderCalc, pack: renderPack, log: renderLog })[section](box, (next) => { section = next; draw(); });
  };
  root.replaceChildren(parts.length > 1 ? bar : '', box);
  draw();
}

function renderCalc(root) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* storage blocked */ }
  const val = (f) => (saved[f] !== undefined && saved[f] !== '' ? saved[f] : DEFAULTS[f]);

  const out = {};
  ['green', 'roasted', 'g1', 'g2', 'p1', 'p2', 'ratioOut', 'ratio2Out'].forEach((k) => { out[k] = h('span.num', ''); });
  const err = h('p.err-text', { hidden: true });
  const barA = h('div.cf-a'), barB = h('div.cf-b');

  const inputs = {};
  const stepper = (f, step, max) => {
    const inp = trackFilled(h('input.input.num#cf-' + f, { type: 'number', min: 0, max, step: 'any', inputmode: 'decimal', value: val(f) }));
    inputs[f] = inp;
    const bump = (d) => () => {
      let v = Math.max(0, (parseFloat(inp.value) || 0) + d);
      if (max !== undefined) v = Math.min(max, v);
      inp.value = String(Math.round(v * 1000) / 1000);
      calc();
    };
    inp.addEventListener('input', calc);
    return h('div.cf-stepper', h('button.btn.secondary', { type: 'button', 'aria-label': '-', onclick: bump(-step) }, '−'), inp,
      h('button.btn.secondary', { type: 'button', 'aria-label': '+', onclick: bump(step) }, '+'));
  };
  const row = (f, step, unit, max) => h('div.cf-row', h('label', { for: 'cf-' + f }, t('cf_' + f), unit ? h('small.muted', unit) : null), stepper(f, step, max));
  const ratio = h('input#cf-ratio', { type: 'range', min: 0, max: 100, step: 1, value: val('ratio') });
  inputs.ratio = ratio;
  ratio.addEventListener('input', calc);

  function calc() {
    const n = (f) => { const v = parseFloat(inputs[f].value); return isFinite(v) ? v : 0; };
    const count = n('count'), weight = n('weight'), waste = n('waste');
    const loss = n('loss') / 100, r1 = Math.min(100, Math.max(0, n('ratio'))) / 100, r2 = 1 - r1;
    // the Excel sheet's formulas: roasted = bags × (bag weight + waste); green = roasted ÷ (1 − roast loss)
    const roasted = count * (weight + waste) / 1000;
    let e = '';
    if (count < 0 || weight < 0 || waste < 0 || loss < 0) e = t('cf_err_neg');
    else if (loss >= 1) e = t('cf_err_loss');
    const green = e ? 0 : roasted / (1 - loss);
    err.hidden = !e; err.textContent = e;
    out.green.textContent = kg(green);
    out.roasted.textContent = kg(e ? 0 : roasted);
    out.g1.textContent = kg(green * r1);
    out.g2.textContent = kg(green * r2);
    const p1 = Math.round(r1 * 100), p2 = 100 - p1;
    out.p1.textContent = out.ratioOut.textContent = p1 + '%';
    out.p2.textContent = out.ratio2Out.textContent = p2 + '%';
    barA.style.width = p1 + '%'; barB.style.width = p2 + '%';
    const s = {};
    Object.keys(inputs).forEach((f) => { s[f] = inputs[f].value; });
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  }

  const reset = () => { Object.keys(DEFAULTS).forEach((f) => { inputs[f].value = DEFAULTS[f]; inputs[f].dispatchEvent(new Event('input')); }); calc(); };

  root.replaceChildren(h('div.cf',
    h('div.card.cf-result', { 'aria-live': 'polite' },
      h('small.muted', t('cf_green_total')),
      h('div.cf-big', out.green, ' ', h('span', t('cf_kg'))),
      err,
      h('div.cf-split', { 'aria-hidden': 'true' }, barA, barB),
      h('div.cf-buy',
        h('div', h('div.cf-lbl', h('span.cf-dot.a'), t('cf_buy1')), h('b', out.g1, ' ', t('cf_kg')), h('small.muted', out.p1)),
        h('div', h('div.cf-lbl', h('span.cf-dot.b'), t('cf_buy2')), h('b', out.g2, ' ', t('cf_kg')), h('small.muted', out.p2))),
      h('div.cf-roasted', h('span', t('cf_roasted_total')), h('b', out.roasted, ' ', t('cf_kg')))),
    h('div.card',
      row('count', 1, ''), row('weight', 10, t('cf_grams')), row('waste', 1, t('cf_grams')), row('loss', 1, '%', 99),
      h('div.cf-blend',
        h('div.cf-blend-head', h('label', { for: 'cf-ratio' }, t('cf_ratio')), out.ratioOut),
        ratio,
        h('div.cf-blend-ends', h('span', t('cf_first')), h('span', t('cf_second'), ' ', out.ratio2Out))),
      h('div.cf-foot', h('small.muted', t('cf_hint')), h('button.link', { type: 'button', onclick: reset }, t('cf_reset'))))));
  calc();
}

// ---------- preparing bags: what really happened, and the real loss against the calculator's
function renderPack(root, go) {
  const mem = packMemory();
  const calc = calcValues();
  const items = () => Data.activeItems().map((i) => ({ value: i.item_id, label: i.name, hint: fmtNum(Data.qty(i.item_id)) + ' ' + (i.unit || '') }));
  const num = (id, extra) => trackFilled(h('input.input.num#' + id, Object.assign({ type: 'number', min: 0, step: 'any', inputmode: 'decimal' }, extra || {})));
  const date = trackFilled(h('input.input#cp-date', { type: 'date', value: Data.todayIso() }));
  const o1 = combo({ id: 'cp-o1', options: items, onPick: update });
  const o2 = combo({ id: 'cp-o2', options: items, onPick: update });
  const q1 = num('cp-q1'), q2 = num('cp-q2'), roasted = num('cp-roasted');
  const bags = num('cp-bags', { step: 1 }), bagG = num('cp-bag-g', { value: mem.bag_g || calc.weight });
  const note = trackFilled(h('input.input#cp-note'));
  const pouch = combo({ id: 'cp-pouch', options: items, onPick: update });
  const pouchNote = h('small.muted', '');
  const out = {};
  ['packed', 'loss', 'roast', 'waste'].forEach((k) => { out[k] = h('b.num', '–'); });
  const warn = h('p.err-text', { hidden: true });
  const btn = h('button.btn.save-btn', { type: 'button', onclick: save }, t('cf_save'));
  let cid = newId();
  let busy = false;

  function figures() {
    const v = (el) => { const x = parseFloat(el.value); return isFinite(x) ? x : 0; };
    const green = (o1.value ? v(q1) : 0) + (o2.value ? v(q2) : 0);
    const r = roasted.value.trim() === '' ? null : v(roasted);
    const n = v(bags), g = v(bagG) || calc.weight;
    const packed = n * g / 1000;
    return { green, roasted: r, bags: n, g, packed,
      loss: green ? (green - packed) / green * 100 : null,
      roast: r !== null && green ? (green - r) / green * 100 : null,
      waste: r !== null && n ? (r - packed) * 1000 / n : null };
  }
  function update() {
    const f = figures();
    const it = pouch.value ? Data.items.get(pouch.value) : null;
    const pf = it ? pouchFactor(it) : null;
    pouchNote.textContent = !it ? '' : pf === null ? t('err.coffee_pouch_unit')
      : t('cf_pouch_take', { n: fmtNum(f.bags || 0), q: fmtNum(Math.round((f.bags || 0) * pf * 1e4) / 1e4), u: it.unit || '' });
    out.packed.textContent = f.packed ? fmtNum(Math.round(f.packed * 1000) / 1000) + ' ' + t('cf_kg') : '–';
    out.loss.textContent = pct(f.loss);
    out.roast.textContent = pct(f.roast);
    out.waste.textContent = grams(f.waste);
    let e = '';
    if (f.green && f.packed > f.green) e = t('err.coffee_more_than_green');
    else if (f.roasted !== null && f.roasted > f.green && f.green) e = t('err.coffee_roasted_invalid');
    else if (f.roasted !== null && f.packed > f.roasted) e = t('err.coffee_more_than_roasted');
    warn.hidden = !e; warn.textContent = e;
  }
  [q1, q2, roasted, bags, bagG].forEach((el) => el.addEventListener('input', update));

  async function save() {
    if (busy) return;
    const green = [[o1, q1], [o2, q2]].filter(([o, q]) => o.value && parseFloat(q.value) > 0).map(([o, q]) => ({ item_id: o.value, qty: parseFloat(q.value) }));
    if (!green.length) { toast(t('err.coffee_no_green'), 'err'); return flash(o1.input); }
    const f = figures();
    if (!(f.bags > 0) || Math.round(f.bags) !== f.bags) { toast(t('err.qty_invalid'), 'err'); return flash(bags); }
    busy = true; btn.disabled = true;
    try {
      await call('coffee.pack', { client_id: cid, date: date.value, green, roasted: roasted.value.trim(), bags: f.bags, bag_g: f.g,
        pouch_item: pouch.value, note: note.value });
      try { localStorage.setItem(PACK_KEY, JSON.stringify({ o1: o1.value, o2: o2.value, bag_g: f.g, pouch: pouch.value })); } catch { /* storage blocked */ }
      toast(t('cf_saved', { bags: f.bags }), 'ok');
      cid = newId();
      Data.refresh().catch(() => {});
      go('log');
    } catch (e) { toast(errText(e), 'err'); }
    busy = false; btn.disabled = false;
  }

  const vs = (label, el, expected) => h('div.cp-fig', h('small.muted', label), el, expected ? h('small.muted', t('cf_expected') + ': ' + expected) : null);
  root.replaceChildren(h('div.cf',
    h('div.card',
      h('p.muted', t('cf_pack_help')),
      h('div.form-grid',
        field(t('cf_origin1'), o1), field(t('cf_green_kg'), q1),
        field(t('cf_origin2'), o2), field(t('cf_green_kg'), q2),
        field(t('cf_bags'), bags), field(t('cf_bag_g'), bagG),
        field(t('cf_roasted_kg'), roasted), field(t('date'), date),
        h('div.field.wide', h('label', { for: 'cp-pouch' }, t('cf_pouch')), pouch.el, pouchNote),
        field(t('note'), note, { wide: true }))),
    h('div.card.cf-result', { 'aria-live': 'polite' },
      h('div.cp-figs',
        vs(t('cf_packed'), out.packed),
        vs(t('cf_loss_total'), out.loss),
        vs(t('cf_roast_loss'), out.roast, pct(calc.loss)),
        vs(t('cf_waste_bag'), out.waste, grams(calc.waste))),
      warn),
    h('div.actions', btn)));
  // the items used last time on this device; the empty pouches: else the item called "Coffee Pouch…"
  if (mem.o1) o1.set(mem.o1);
  if (mem.o2) o2.set(mem.o2);
  const pouchGuess = mem.pouch || (Data.activeItems().find((i) => /coffee\s*pouch/i.test(i.name)) || {}).item_id;
  if (pouchGuess) pouch.set(pouchGuess);
  update();
}

// ---------- the stock of bags and green coffee, the batches, the bags given out
async function renderLog(root, go) {
  root.replaceChildren(h('div.card', h('p.muted', t('loading'))));
  let res;
  try { res = await call('coffee.list', {}); } catch (e) { root.replaceChildren(h('div.card', h('p.err-text', errText(e)))); return; }
  const mem = packMemory();
  const calc = calcValues();
  const name = (id) => (Data.items.get(id) || { name: id }).name;
  const unit = (id) => (Data.items.get(id) || {}).unit || '';
  const greens = [...new Set([mem.o1, mem.o2].concat(...res.batches.map((b) => b.green.map((x) => x.item_id))).filter(Boolean))];
  const greenKg = greens.reduce((sum, id) => sum + Math.max(0, Data.qty(id)), 0);
  const enough = Math.floor(greenKg * (1 - calc.loss / 100) * 1000 / (calc.weight + calc.waste));
  const stat = (label, value, sub) => h('div.card.cp-stat', h('small.muted', label), h('b.num', value), sub ? h('small.muted', sub) : null);
  const empty = (cols) => h('tr', h('td.empty', { colspan: cols }, t('cf_none')));
  root.replaceChildren(h('div.cf.cf-wide',
    h('div.cp-stats',
      res.bag_items.map((id) => stat(name(id), fmtNum(Data.qty(id)) + ' ' + unit(id))),
      greens.map((id) => stat(name(id), fmtNum(Data.qty(id)) + ' ' + unit(id))),
      greens.length ? stat(t('cf_enough_title'), fmtNum(Math.max(0, enough)), t('cf_enough_sub', { w: calc.weight })) : null),
    h('div.card',
      h('div.cp-head', h('h3', t('cf_batches')),
        Data.can('coffee.pack') ? h('button.btn', { type: 'button', onclick: () => go('pack') }, '+ ' + t('cf_new_batch'))
          : h('small.muted', t('cf_no_pack_perm'))),
      h('div.table-wrap', h('table',
        h('thead', h('tr', h('th', t('date')), h('th', t('cf_green_short')), h('th', t('cf_roasted_short')), h('th', t('cf_bags')),
          h('th', t('cf_loss_total')), h('th', t('cf_roast_loss')), h('th', t('cf_waste_bag')), h('th', t('entered_by')))),
        h('tbody', res.batches.length ? res.batches.map((b) => h('tr',
          h('td.num', fmtDate(b.date)),
          h('td.num', { title: b.green.map((x) => name(x.item_id) + ': ' + x.qty).join(' · ') }, fmtNum(b.green_kg)),
          h('td.num', b.roasted_kg === null ? '–' : fmtNum(b.roasted_kg)),
          h('td.num', fmtNum(b.bags) + (b.bag_g !== 200 ? ' × ' + b.bag_g + t('cf_g') : '')),
          h('td.num', pct(b.loss_pct)), h('td.num', pct(b.roast_loss_pct)), h('td.num', grams(b.waste_g)),
          h('td', userName(b.created_by)))) : [empty(8)])))),
    h('div.card',
      h('h3', t('cf_out')),
      h('p.muted', t('cf_out_help')),
      h('div.table-wrap', h('table',
        h('thead', h('tr', h('th', t('date')), h('th', t('cf_to')), h('th', t('cf_bags')), h('th', t('doc_no')))),
        h('tbody', res.out.length ? res.out.map((o) => h('tr', h('td.num', fmtDate(o.date)), h('td', h('bdi', o.party)),
          h('td.num', fmtNum(o.qty)), h('td.num', o.doc_no || ''))) : [empty(4)]))))));
}
