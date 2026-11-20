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
  // a recipe that only prices the product: produced like a product without one (nothing taken from the stores)
  const live = (r) => r.cost_only !== true && r.off !== true;
  const withRecipe = new Set(Data.recipes.filter(live).map((r) => norm(r.product)));
  const finals = Data.activeItems().filter((i) => Data.storeOf(i) === 'FINAL' && !withRecipe.has(norm(i.name)));
  // a department head: only what their departments make
  const head = (Data.user || {}).role === 'section_head' || ((Data.user || {}).role === 'branch_manager' && ((Data.user || {}).depts || []).length > 0);
  const myDepts = new Set((Data.user || {}).depts || []);
  const mine = (name) => !head || Data.activeItems().some((i) => norm(i.name) === norm(name) && myDepts.has(String(i.dept || '')));
  const base = [...new Map(Data.recipes.filter(live).map((r) => [norm(r.product), r.product])).values()].sort().filter(mine).map((p) => ({ value: p, label: p }))
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
  // ---------- the recipe calculator (on request): one number changed, the others follow
  const calcBtn = h('button.btn.secondary#p-calc', { type: 'button', hidden: true, onclick: () => (calcBox.isConnected ? calcBox.remove() : openCalc()) }, '🧮 ' + t('calc_title'));
  let calcBox = h('div');
  let calcFor = '';
  function openCalc() {
    calcFor = norm(product.value);
    const rec = Data.recipes.filter((r) => norm(r.product) === calcFor);
    const costOnly = rec.some((r) => r.cost_only === true);
    const fin = Data.activeItems().find((i) => norm(i.name) === calcFor);
    const pUnit = fin ? fin.unit : (unit.value || 'KG');
    let size = Number(qty.value) > 0 ? Number(qty.value) : 1;      // how much product is calculated
    // per: the ingredient for one unit of the product (the recipe); the shown amount is per × size
    const rows = rec.map((r) => ({ item_id: r.item_id, per: Number(r.qty_per_unit) || 0, off: r.off === true }));
    let together = true;                                            // a change moves the others (else: only that one)
    const r6 = (n) => Math.round(n * 1e6) / 1e6;
    const sizeIn = h('input.input.num#calc-size', { type: 'number', step: 'any', min: 0, value: r6(size) });
    const tbody = h('tbody');
    const note = h('p.form-status', '');
    const inputs = [];
    const refresh = (except) => {
      if (except !== sizeIn) sizeIn.value = r6(size);
      inputs.forEach((x, i) => { if (x !== except) x.value = r6(rows[i].per * size); });
    };
    const draw = () => {
      inputs.length = 0;
      tbody.replaceChildren(...rows.map((r, i) => {
        const part = Data.recipePart(r.item_id);
        const q = h('input.input.num', { type: 'number', step: 'any', min: 0, value: r6(r.per * size), disabled: r.off });
        q.addEventListener('input', () => {
          const v = Number(q.value);
          if (!(v >= 0)) return;
          if (together && r.per > 0 && v > 0) { size = v / r.per; refresh(q); }
          else { r.per = size > 0 ? v / size : 0; }
        });
        inputs.push(q);
        const off = h('input', { type: 'checkbox', checked: !r.off });
        off.addEventListener('change', () => { r.off = !off.checked; draw(); });
        return h('tr', { class: r.off ? 'rc-off' : '' }, h('td.wrap', part.family ? h('b', '◆ ', h('bdi', part.name)) : h('bdi', part.name)),
          h('td', q), h('td', part.unit || ''), h('td', h('label.check', off, ' ', t('calc_on'))));
      }));
    };
    sizeIn.addEventListener('input', () => { const v = Number(sizeIn.value); if (v > 0) { size = v; refresh(sizeIn); } });
    const tog = h('input#calc-together', { type: 'checkbox', checked: true });
    tog.addEventListener('change', () => { together = tog.checked; });
    // a new ingredient: a generic material or a food item, with its amount for the size shown
    const add = combo({ id: 'calc-add', placeholder: t('calc_add_ph'), options: () => [...Data.families.values()].filter((f) => f.active === true)
      .sort((a, b) => Data.nameOf(a).localeCompare(Data.nameOf(b))).map((f) => ({ value: f.family_id, label: '◆ ' + Data.nameOf(f), alt: f.name, hint: f.unit }))
      .concat(Data.activeItems().filter((i) => i.category === 'Food').map((i) => ({ value: i.item_id, label: Data.nameOf(i), alt: i.name, hint: i.unit }))) });
    const addQty = h('input.input.num#calc-add-qty', { type: 'number', step: 'any', min: 0, placeholder: t('qty') });
    const addLine = () => {
      if (!add.value) return flash(add.input);
      if (!(Number(addQty.value) > 0)) return flash(addQty);
      if (rows.some((r) => r.item_id === add.value)) { toast(t('calc_already'), 'err'); return; }
      rows.push({ item_id: add.value, per: Number(addQty.value) / size, off: false });
      add.clear(); addQty.value = ''; draw();
    };
    addQty.addEventListener('keydown', (e) => { if (e.key === 'Enter') addLine(); });
    const use = h('button.btn', { type: 'button', onclick: () => { qty.value = r6(size); qty.dispatchEvent(new Event('input')); qty.dispatchEvent(new Event('change')); toast(t('calc_used'), 'ok'); } }, t('calc_use'));
    const save = Data.can('recipes.save') ? h('button.btn.secondary', { type: 'button', onclick: async () => {
      const lines = rows.filter((r) => r.per > 0).map((r) => ({ item_id: r.item_id, qty_per_unit: r6(r.per), off: r.off }));
      if (!lines.some((l) => !l.off)) { note.textContent = t('calc_need_one'); note.className = 'form-status warn'; return; }
      save.disabled = true;
      try {
        await call('recipes.save', { product: rec.length ? rec[0].product : product.value, lines, cost_only: costOnly, from_calc: true });
        await Data.refresh();
        note.textContent = t('calc_saved'); note.className = 'form-status ok';
        preview();
      } catch (e) { note.textContent = errText(e); note.className = 'form-status err'; }
      save.disabled = false;
    } }, t('calc_save')) : '';
    draw();
    calcBox = h('div.calc-box',
      h('div.calc-head', h('b', '🧮 ' + t('calc_title')), h('button.link', { type: 'button', onclick: () => calcBox.remove() }, '✕')),
      h('div.calc-size', h('bdi', product.value), sizeIn, h('span', pUnit)),
      h('label.check', tog, ' ', t('calc_together')),
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('qty')), h('th', t('unit')), h('th', ''))), tbody)),
      h('div.calc-add', add.el, addQty, h('button.btn.secondary', { type: 'button', onclick: addLine }, '+ ' + t('calc_add'))),
      h('small.muted', t(Data.can('recipes.save') ? 'calc_help' : 'calc_help_view')), note,
      h('div.form-actions', use, save));
    calcBtn.after(calcBox);
  }
  const needNote = h('small.muted', Object.keys(lastNeed).length ? t('prod_need_note', { n: Object.keys(lastNeed).length }) : '');
  let lines = [];

  const noRecipe = () => product.value && !withRecipe.has(norm(product.value)) && finals.some((i) => i.name === product.value);
  function preview() {
    calcBtn.hidden = !product.value || !Data.recipes.some((r) => norm(r.product) === norm(product.value));
    if (calcBox.isConnected && calcFor !== norm(product.value)) calcBox.remove();
    const q = Number(qty.value);
    const recipe = Data.recipes.filter((r) => live(r) && norm(r.product) === norm(product.value));
    lines = recipe.map((r) => {
      // a generic material (a family): what all its brands hold, in its unit (the brand is taken when saving)
      const fam = Data.isFamily(r.item_id);
      const part = Data.recipePart(r.item_id);
      const need = Math.round(Number(r.qty_per_unit) * (q || 0) * 1e6) / 1e6;
      const have = fam ? Math.round(Data.familyQty(r.item_id) * 1000) / 1000 : Data.qty(r.item_id);
      return { part, fam, need, have, ok: have >= need };
    });
    body.replaceChildren(...(lines.length ? lines.map((l) => h('tr', h('td.wrap', l.fam ? h('b', '◆ ', h('bdi', l.part.name)) : h('bdi', l.part.name)), h('td.num', fmtNum(l.need)),
      h('td.num', fmtNum(l.have)), h('td', l.part.unit), h('td', (Data.settings || {}).recipes_take_stock === '1' ? h('span', { class: 'pill ' + (l.ok ? 'in' : 'low') }, l.ok ? t('enough') : t('short')) : '')))
      : [h('tr', h('td.empty', { colspan: 5 }, !product.value ? t('choose_product') : noRecipe() ? t('no_recipe_help') : t('recipe_missing')))]));
    // taking from the stores switched off: the recipe is shown only, nothing is taken, a shortage does not matter
    const takes = (Data.settings || {}).recipes_take_stock === '1';
    const short = takes ? lines.filter((l) => !l.ok).length : 0;
    summary.textContent = lines.length ? (takes ? t('ingredients_summary', { n: lines.length, s: short }) : t('recipe_stock_off_note')) : '';
    summary.className = 'form-status ' + (short ? 'warn' : '');
  }
  qty.addEventListener('input', preview);
  product.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && product.value) { e.preventDefault(); qty.focus(); } });
  qty.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); btn.focus(); } });

  async function post() {
    if (!product.value) { flash(product.input); product.input.focus(); return; }
    if (!(Number(qty.value) > 0)) { flash(qty); qty.focus(); return; }
    if (!lines.length && !noRecipe()) { flash(product.input); return; }
    if ((Data.settings || {}).recipes_take_stock === '1' && lines.some((l) => !l.ok) && !doublePress('prod')) { flash(btn); summary.textContent = t('short_press_again'); summary.className = 'form-status warn'; return; }
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
    summary, h('div.form-actions', btn, calcBtn)));
  preview();
  product.input.focus();
  loadNeed();
  const onRejected = (e) => { if (e.detail.action === 'production.post') toast(errText({ code: e.detail.error, detail: e.detail.detail }), 'err'); };
  window.addEventListener('moro:rejected', onRejected, { once: true });
}
