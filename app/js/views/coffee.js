// Coffee bag calculator (the former "حاسبة أكياس القهوة 200غ" app, same formulas as its Excel sheet):
// how much green coffee to buy before roasting for a number of bags, split between the two origins
// of the blend. Nothing is saved on the server; the last values are kept on this device.
import { t } from '../i18n.js';
import { h, trackFilled } from '../ui.js';

const DEFAULTS = { count: 100, weight: 200, waste: 7, loss: 20, ratio: 20 };
const KEY = 'moro.coffee_calc';
const kg = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function render(root) {
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
