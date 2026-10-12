// Production: choose a product with a recipe and a quantity, see the ingredients it uses and
// whether stock is enough, then confirm (two presses when something is short). Sent through the outbox.
import { Data } from '../data.js';
import { Outbox } from '../outbox.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, trackFilled } from '../ui.js';
import { combo, field, doublePress, newId } from '../components.js';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();

export function render(root) {
  const products = [...new Map(Data.recipes.map((r) => [norm(r.product), r.product])).values()].sort();
  const product = combo({ id: 'p-product', options: () => products.map((p) => ({ value: p, label: p })), onPick: preview });
  const qty = trackFilled(h('input.input.num#p-qty', { type: 'number', step: 'any', min: 0, inputmode: 'decimal' }));
  const unit = trackFilled(h('input.input#p-unit', { value: 'KG' }));
  const date = trackFilled(h('input.input#p-date', { type: 'date', value: Data.todayIso() }));
  const body = h('tbody');
  const summary = h('p.form-status', '');
  const btn = h('button.btn.save-btn#p-post', { type: 'button', onclick: post }, t('confirm_production'));
  let lines = [];

  function preview() {
    const q = Number(qty.value);
    const recipe = Data.recipes.filter((r) => norm(r.product) === norm(product.value));
    lines = recipe.map((r) => {
      const it = Data.items.get(r.item_id) || { name: r.item_id, unit: '' };
      const need = Math.round(Number(r.qty_per_unit) * (q || 0) * 1e6) / 1e6;
      const have = Data.qty(r.item_id);
      return { it, need, have, ok: have >= need };
    });
    body.replaceChildren(...(lines.length ? lines.map((l) => h('tr', h('td.wrap', h('bdi', l.it.name)), h('td.num', fmtNum(l.need)),
      h('td.num', fmtNum(l.have)), h('td', l.it.unit), h('td', h('span', { class: 'pill ' + (l.ok ? 'in' : 'low') }, l.ok ? t('enough') : t('short')))))
      : [h('tr', h('td.empty', { colspan: 5 }, product.value ? t('recipe_missing') : t('choose_product')))]));
    const short = lines.filter((l) => !l.ok).length;
    summary.textContent = lines.length ? t('ingredients_summary', { n: lines.length, s: short }) : '';
    summary.className = 'form-status ' + (short ? 'warn' : '');
  }
  qty.addEventListener('input', preview);
  product.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && product.value) { e.preventDefault(); qty.focus(); } });
  qty.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); btn.focus(); } });

  async function post() {
    if (!product.value) { flash(product.input); product.input.focus(); return; }
    if (!(Number(qty.value) > 0)) { flash(qty); qty.focus(); return; }
    if (!lines.length) { flash(product.input); return; }
    if (lines.some((l) => !l.ok) && !doublePress('prod')) { flash(btn); summary.textContent = t('short_press_again'); summary.className = 'form-status warn'; return; }
    await Outbox.add('production.post', { product: product.value, qty: Number(qty.value), unit: unit.value.trim().toUpperCase() || 'KG',
      date: date.value, client_id: newId() }, product.value);
    toast(t('production_saved', { q: qty.value, u: unit.value, p: product.value }), 'ok');
    qty.value = ''; qty.dispatchEvent(new Event('change')); preview();
    product.input.focus();
  }

  root.replaceChildren(h('div.card.form-card',
    h('h2', t('production')),
    h('div.form-grid', field(t('product'), product, { wide: true }), field(t('qty'), qty), field(t('unit'), unit), field(t('date'), date)),
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('needed')), h('th', t('available')), h('th', t('unit')), h('th', ''))), body)),
    summary, h('div.form-actions', btn)));
  preview();
  product.input.focus();
  const onRejected = (e) => { if (e.detail.action === 'production.post') toast(errText({ code: e.detail.error, detail: e.detail.detail }), 'err'); };
  window.addEventListener('moro:rejected', onRejected, { once: true });
}
