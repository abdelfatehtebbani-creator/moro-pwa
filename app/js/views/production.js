// Production: choose a product with a recipe and a quantity, see the ingredients it uses and
// whether stock is enough, then confirm (two presses when something is short). Sent through the outbox.
import { call } from '../api.js';
import { Data } from '../data.js';
import { Outbox } from '../outbox.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, trackFilled } from '../ui.js';
import { combo, field, doublePress, newId } from '../components.js';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
// what the open shop orders still need made, per product name (kept for the next opening of the screen)
let lastNeed = {};

export function render(root) {
  // products with a recipe, and the final products without one (a department's product: no ingredient is taken)
  const withRecipe = new Set(Data.recipes.map((r) => norm(r.product)));
  const finals = Data.activeItems().filter((i) => Data.storeOf(i) === 'FINAL' && !withRecipe.has(norm(i.name)));
  // a department head: only what their departments make
  const head = (Data.user || {}).role === 'section_head' || ((Data.user || {}).role === 'branch_manager' && ((Data.user || {}).depts || []).length > 0);
  const myDepts = new Set((Data.user || {}).depts || []);
  const mine = (name) => !head || Data.activeItems().some((i) => norm(i.name) === norm(name) && myDepts.has(String(i.dept || '')));
  const base = [...new Map(Data.recipes.map((r) => [norm(r.product), r.product])).values()].sort().filter(mine).map((p) => ({ value: p, label: p }))
    .concat(finals.filter((i) => mine(i.name)).map((i) => ({ value: i.name, label: Data.nameOf(i), alt: i.name, hint: t('no_recipe') })));
  // the products the shop orders wait for come first, with the quantity still to make
  let need = lastNeed;
  const products = () => {
    const withNeed = base.filter((o) => need[norm(o.value)] > 0).map((o) => Object.assign({}, o, { hint: t('prod_needed', { q: fmtNum(need[norm(o.value)].qty), u: need[norm(o.value)].unit }) }))
      .sort((a, b) => need[norm(b.value)].qty - need[norm(a.value)].qty);
    return withNeed.concat(base.filter((o) => !(need[norm(o.value)] > 0)));
  };
  const product = combo({ id: 'p-product', options: products, onPick: (v) => {
    const it = finals.find((i) => i.name === v);
    if (it) { unit.value = it.unit; unit.dispatchEvent(new Event('input')); }
    // the quantity the orders still need (what is in stock already taken off)
    const n = need[norm(v)];
    if (n && n.qty > 0 && !qty.value) { qty.value = String(n.qty); qty.dispatchEvent(new Event('input')); qty.dispatchEvent(new Event('change')); }
    preview();
  } });
  async function loadNeed() {
    if (!Data.can('shop.list')) return;
    try {
      const lines = await call('shop.list', { status: 'open', native: true });
      const by = {};
      lines.forEach((l) => {
        if (!l.item_id || l.special || l.approved === false) return;
        const it = Data.items.get(l.item_id);
        if (!it || Data.storeOf(it) !== 'FINAL') return;
        const k = norm(it.name);
        const x = by[k] || (by[k] = { left: 0, unit: it.unit, id: it.item_id });
        x.left += Math.max(0, l.qty - l.handed_qty);
      });
      const out = {};
      Object.keys(by).forEach((k) => {
        const q = Math.round(Math.max(0, by[k].left - Math.max(0, Data.qty(by[k].id))) * 1e6) / 1e6;
        if (q > 0) out[k] = { qty: q, unit: by[k].unit, valueOf() { return q; } };
      });
      need = lastNeed = out;
      needNote.textContent = Object.keys(out).length ? t('prod_need_note', { n: Object.keys(out).length }) : '';
    } catch { /* the list works without it */ }
  }
  const qty = trackFilled(h('input.input.num#p-qty', { type: 'number', step: 'any', min: 0, inputmode: 'decimal' }));
  const unit = trackFilled(h('input.input#p-unit', { value: 'KG' }));
  const date = trackFilled(h('input.input#p-date', { type: 'date', value: Data.todayIso() }));
  const body = h('tbody');
  const summary = h('p.form-status', '');
  const btn = h('button.btn.save-btn#p-post', { type: 'button', onclick: post }, t('confirm_production'));
  const needNote = h('small.muted', Object.keys(lastNeed).length ? t('prod_need_note', { n: Object.keys(lastNeed).length }) : '');
  let lines = [];

  const noRecipe = () => product.value && !withRecipe.has(norm(product.value)) && finals.some((i) => i.name === product.value);
  function preview() {
    const q = Number(qty.value);
    const recipe = Data.recipes.filter((r) => norm(r.product) === norm(product.value));
    lines = recipe.map((r) => {
      const it = Data.items.get(r.item_id) || { name: r.item_id, unit: '' };
      const need = Math.round(Number(r.qty_per_unit) * (q || 0) * 1e6) / 1e6;
      const have = Data.qty(r.item_id);
      return { it, need, have, ok: have >= need };
    });
    body.replaceChildren(...(lines.length ? lines.map((l) => h('tr', h('td.wrap', h('bdi', Data.nameOf(l.it))), h('td.num', fmtNum(l.need)),
      h('td.num', fmtNum(l.have)), h('td', l.it.unit), h('td', h('span', { class: 'pill ' + (l.ok ? 'in' : 'low') }, l.ok ? t('enough') : t('short')))))
      : [h('tr', h('td.empty', { colspan: 5 }, !product.value ? t('choose_product') : noRecipe() ? t('no_recipe_help') : t('recipe_missing')))]));
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
    if (!lines.length && !noRecipe()) { flash(product.input); return; }
    if (lines.some((l) => !l.ok) && !doublePress('prod')) { flash(btn); summary.textContent = t('short_press_again'); summary.className = 'form-status warn'; return; }
    await Outbox.add('production.post', { product: product.value, qty: Number(qty.value), unit: unit.value.trim().toUpperCase() || 'KG',
      date: date.value, client_id: newId() }, product.value);
    toast(t('production_saved', { q: qty.value, u: unit.value, p: product.value }), 'ok');
    // done: the form is empty again, ready for the next product
    qty.value = ''; qty.dispatchEvent(new Event('change')); product.clear(); preview();
    product.input.focus();
  }

  root.replaceChildren(h('div.card.form-card',
    h('h2', t('production')),
    needNote,
    h('div.form-grid', field(t('product'), product, { wide: true }), field(t('qty'), qty), field(t('unit'), unit), field(t('date'), date)),
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('needed')), h('th', t('available')), h('th', t('unit')), h('th', ''))), body)),
    summary, h('div.form-actions', btn)));
  preview();
  product.input.focus();
  loadNeed();
  const onRejected = (e) => { if (e.detail.action === 'production.post') toast(errText({ code: e.detail.error, detail: e.detail.detail }), 'err'); };
  window.addEventListener('moro:rejected', onRejected, { once: true });
}
