// Items, suppliers/departments and recipes. Changes need a connection (saved directly).
// Renaming changes one cell: every movement keeps pointing at the same ID.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, trackFilled, dialog } from '../ui.js';
import { combo, field, storePill } from '../components.js';
import { STORES } from '../data.js';

let tab = 'items';
let cleanup = null;

export function render(root) {
  if (cleanup) cleanup();
  const isAdmin = Data.can('rename');
  const tabs = h('div.tabs');
  const body = h('div');
  const names = { items: t('items'), parties: t('parties'), locations: t('locations'), units: t('units'), recipes: t('recipes') };
  const may = { recipes: 'recipes.save', locations: 'locations.save', units: 'units.save' };
  if (may[tab] && !Data.can(may[tab])) tab = 'items';
  Object.keys(names).filter((k) => !may[k] || Data.can(may[k])).forEach((k) =>
    tabs.append(h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; render(root); } }, names[k])));
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('masters')), tabs), body));
  ({ items, parties, locations, units, recipes })[tab](body, isAdmin);
}

function watch(fill) {
  window.addEventListener('moro:data', fill);
  cleanup = () => { window.removeEventListener('moro:data', fill); cleanup = null; };
}

export function dispose() { if (cleanup) cleanup(); }

async function save(action, payload, close, err) {
  try {
    await call(action, payload);
    await Data.refresh();
    toast(t('saved'), 'ok');
    close(true);
  } catch (e) { err.textContent = errText(e); }
}

function items(body, isAdmin) {
  const canMin = Data.can('min_stock');
  const search = trackFilled(h('input.input#m-search', { type: 'search', placeholder: t('lookup_hint') }));
  const showInactive = h('input#m-inactive', { type: 'checkbox' });
  const tb = h('tbody');
  const fill = () => {
    const q = search.value.trim().toLowerCase();
    const rows = [...Data.items.values()].filter((i) => (showInactive.checked || i.active === true) && (!q || i.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 400);
    tb.replaceChildren(...rows.map((i) => h('tr.click', { onclick: () => edit(i) },
      h('td.num', i.item_id), h('td.wrap', h('bdi', i.name)), h('td', storePill(Data.storeOf(i))),
      h('td', i.unit), h('td.num', Number(i.min_stock) > 0 ? fmtNum(i.min_stock) : ''), h('td.num', fmtNum(Data.qty(i.item_id))),
      h('td', i.active === true ? '' : h('span.pill.out', t('inactive'))))));
  };
  search.addEventListener('input', fill);
  showInactive.addEventListener('change', fill);
  watch(fill);

  const edit = (it) => dialog((close) => {
    const name = trackFilled(h('input.input#e-name', { value: it ? it.name : '', disabled: it && !isAdmin }));
    const cat = storeSelect('e-cat', it ? Data.storeOf(it) : 'DRY', it && !isAdmin);
    const unit = combo({ id: 'e-unit', options: () => Data.unitOptions(it && it.unit) });
    if (it) { unit.set(it.unit); unit.input.readOnly = true; unit.input.classList.add('locked'); }
    const convertBtn = it && Data.can('items.convertUnit') ? h('button.link', { type: 'button', onclick: () => { close(); convertUnit(it); } }, t('change_stock_unit')) : null;
    // an item kept in its larger unit (TIN while KG exists): the admin moves it to the smallest unit once
    const smaller = it ? Data.packsOf(it).filter((x) => x.factor < 1).sort((a, b) => a.factor - b.factor)[0] : null;
    const toBaseBtn = smaller && Data.can('items.convertUnit')
      ? h('div.notice', t('base_not_smallest', { u: smaller.unit }), ' ',
        h('button.link', { type: 'button', onclick: () => { close(); convertUnit(it, { new_unit: smaller.unit, factor: Math.round((1 / smaller.factor) * 1e6) / 1e6 }); } }, t('make_base', { u: smaller.unit })))
      : null;
    const min = trackFilled(h('input.input.num#e-min', { type: 'number', min: 0, step: 'any', value: it ? Number(it.min_stock) || 0 : 0, disabled: !canMin }));
    const active = h('input#e-active', { type: 'checkbox', checked: !it || it.active === true, disabled: !isAdmin });
    const canPack = Data.can('packaging');
    // the purchase unit (carton, box…) with how many stock units it holds; reports and the dashboard use it
    const allPacks = it ? Data.packsOf(it) : [];
    // the larger unit of the item (BOX = 12 PC); the base unit is always the smallest
    const cur = allPacks.find((x) => x.factor > 1 && x.unit === String((it && it.report_unit) || '').toUpperCase())
      || allPacks.find((x) => x.factor > 1 && x.unit === String((it && it.store_unit) || '').toUpperCase())
      || allPacks.find((x) => x.factor > 1) || null;
    const r6 = (n) => Math.round(n * 1e6) / 1e6;
    const buyUnit = trackFilled(h('input.input#e-buyunit', { value: cur ? cur.unit : '', placeholder: 'BOX', dir: 'ltr', disabled: !canPack, autocomplete: 'off' }));
    const buyQty = trackFilled(h('input.input.num#e-buyqty', { type: 'number', min: 0, step: 'any', value: cur ? r6(cur.factor) : '', placeholder: '12', disabled: !canPack }));
    const stockLbl = h('span.buy-stock', it ? it.unit : '');
    // display units: chosen from the item's two units only
    const role = (Data.user && Data.user.role) || '';
    const buyShow = h('select.input#e-buyshow', { disabled: !canPack || role === 'storekeeper' });
    const storeShow = h('select.input#e-storeshow', { disabled: !canPack || role === 'purchasing' });
    const fillShow = () => {
      const base = unit.input.value.trim().toUpperCase(), big = buyUnit.value.trim().toUpperCase();
      const opts = [base, ...(big && big !== base ? [big] : [])].filter(Boolean);
      [[buyShow, (it && it.report_unit) || ''], [storeShow, (it && it.store_unit) || '']].forEach(([s, saved]) => {
        const keep = s.options.length ? s.value : String(saved).toUpperCase();
        s.replaceChildren(...opts.map((u) => h('option', { value: u }, u)));
        s.value = opts.includes(keep) ? keep : base;
      });
    };
    unit.input.addEventListener('input', () => { stockLbl.textContent = unit.input.value.trim().toUpperCase(); fillShow(); });
    unit.input.addEventListener('change', () => { stockLbl.textContent = unit.input.value.trim().toUpperCase(); fillShow(); });
    buyUnit.addEventListener('input', fillShow);
    fillShow();
    // final products: a fixed price per stock unit, set by the admin, used by every receipt
    const canFinal = Data.can('final_price');
    const finalPrice = trackFilled(h('input.input.num#e-fprice', { type: 'number', min: 0, step: 'any', value: it && it.final_price !== undefined ? it.final_price : '', disabled: !canFinal }));
    const finalField = h('div.field', h('label', { for: 'e-fprice' }, t('final_price')), finalPrice);
    const showFinal = () => { finalField.hidden = cat.value !== 'FINAL'; };
    cat.addEventListener('change', showFinal);
    showFinal();
    const err = h('p.err-text', '');
    const ok = () => {
      if (!name.value.trim()) return flash(name);
      if (!unit.input.value.trim()) return flash(unit.input);
      const p = { name: name.value, store: cat.value, unit: it ? it.unit : unit.input.value.trim().toUpperCase() };
      if (it) { p.item_id = it.item_id; if (!isAdmin) p.name = it.name; p.active = active.checked; }
      if (canMin) p.min_stock = Number(min.value) || 0;
      if (canPack) {
        const bu = buyUnit.value.trim().toUpperCase(), bq = Number(buyQty.value);
        // the larger unit holds more than one base unit (the base is the smallest)
        if (bu && !(bq > 1)) return flash(buyQty);
        if (bu && bu === unit.input.value.trim().toUpperCase()) return flash(buyUnit);
        if (!bu && buyQty.value !== '') return flash(buyUnit);
        // other units written in the sheet (TRAY…) are kept as they are
        const others = allPacks.filter((x) => !cur || x.unit !== cur.unit).filter((x) => x.unit !== bu).map((x) => ({ unit: x.unit, factor: x.factor }));
        p.pack_units = [...(bu ? [{ unit: bu, factor: bq }] : []), ...others];
        if (!buyShow.disabled) p.report_unit = buyShow.value === unit.input.value.trim().toUpperCase() ? '' : buyShow.value;
        if (!storeShow.disabled) p.store_unit = storeShow.value === unit.input.value.trim().toUpperCase() ? '' : storeShow.value;
      }
      if (canFinal && cat.value === 'FINAL') {
        if (finalPrice.value !== '' && !(Number(finalPrice.value) >= 0)) return flash(finalPrice);
        p.final_price = finalPrice.value;
      }
      save('items.save', p, close, err);
    };
    return [h('h3', it ? t('edit_item') : t('new_item')), field(t('name'), name), field(t('store'), cat), finalField,
      h('fieldset.units-box', h('legend', t('units_of_item')),
        field(t('base_unit'), unit), toBaseBtn,
        h('div.field', h('label', { for: 'e-buyunit' }, t('big_unit')),
          h('div.buy-line', { dir: 'ltr' }, h('span', '1'), buyUnit, h('span', '='), buyQty, stockLbl)),
        h('div.show-units', field(t('show_purchasing'), buyShow), field(t('show_store'), storeShow)),
        h('small.muted', t('item_units_help')), convertBtn),
      field(t('min_stock_in', { u: it ? it.unit : '' }), min), h('label.check', active, ' ', t('active')), it && !isAdmin ? h('small.muted', t('rename_admin_only')) : null, err,
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
  }).then((r) => { if (r) fill(); });

  body.replaceChildren(h('div.search', search, Data.can('add_items') ? h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_item')) : null),
    h('label.check', showInactive, ' ', t('show_inactive')),
    h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', 'ID'), h('th', t('item')), h('th', t('store')), h('th', t('unit')),
      h('th', t('min_stock')), h('th', t('balance')), h('th', ''))), tb)));
  fill();
}

function parties(body, isAdmin) {
  const tb = h('tbody');
  // search by name or ID, and by kind (suppliers / departments)
  const search = trackFilled(h('input.input#p-search', { type: 'search', placeholder: t('party_search_hint') }));
  const kindSel = h('select.input#p-kind', h('option', { value: '' }, t('all')), h('option', { value: 'supplier' }, t('party_supplier')), h('option', { value: 'section' }, t('party_section')));
  const fill = () => tb.replaceChildren(...[...Data.parties.values()].filter((p) => p.kind === 'supplier' || p.kind === 'section')
    .filter((p) => (!kindSel.value || p.kind === kindSel.value) &&
      (!search.value.trim() || (p.name + ' ' + p.party_id).toLowerCase().includes(search.value.trim().toLowerCase())))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    .map((p) => h('tr.click', { onclick: () => edit(p) }, h('td.num', p.party_id), h('td.wrap', h('bdi', p.name)),
      h('td', t('party_' + p.kind)), h('td', p.active === true ? '' : h('span.pill.out', t('inactive'))))));
  watch(fill);
  const edit = (p) => dialog((close) => {
    const name = trackFilled(h('input.input#e-pname', { value: p ? p.name : '', disabled: p && !isAdmin }));
    const kind = h('select.input#e-kind', { disabled: !!p }, h('option', { value: 'supplier' }, t('party_supplier')), h('option', { value: 'section' }, t('party_section')));
    kind.value = p ? p.kind : 'supplier';
    const active = h('input#e-pactive', { type: 'checkbox', checked: !p || p.active === true, disabled: !isAdmin });
    const err = h('p.err-text', '');
    const ok = () => {
      if (!name.value.trim()) return flash(name);
      const pl = { name: name.value, kind: kind.value };
      if (p) { pl.party_id = p.party_id; pl.active = active.checked; }
      save('parties.save', pl, close, err);
    };
    return [h('h3', p ? t('edit_party') : t('new_party')), field(t('name'), name), field(t('kind'), kind),
      h('label.check', active, ' ', t('active')), err,
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
  }).then((r) => { if (r) fill(); });
  search.addEventListener('input', fill);
  kindSel.addEventListener('change', fill);
  body.replaceChildren(h('div.search', search, kindSel, Data.can('parties.save') ? h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_party')) : null),
    h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', 'ID'), h('th', t('name')), h('th', t('kind')), h('th', ''))), tb)));
  fill();
}

/** Admin: the item's stock unit becomes a smaller one (BOX → PC, 1 BOX = 360 PC); preview first. */
async function convertUnit(it, preset) {
  const asked = await dialog((close) => {
    // written as the relation itself, "1 TIN = [18.4] [KG]", with no factor filled in by default
    const nu = trackFilled(h('input.input#cv-unit', { placeholder: 'KG', dir: 'ltr', value: preset ? preset.new_unit : '', autocomplete: 'off' }));
    const f = trackFilled(h('input.input.num#cv-factor', { type: 'number', min: 0, step: 'any', value: preset ? preset.factor : '', placeholder: '18.4' }));
    // a unit the item already knows (1 TIN = 18 KG) fills in its factor
    nu.addEventListener('input', () => {
      const p = Data.packsOf(it).find((x) => x.unit === nu.value.trim().toUpperCase());
      if (p && f.value === '') f.value = String(Math.round((1 / p.factor) * 1e6) / 1e6);
    });
    const ok = () => { if (!nu.value.trim()) return flash(nu); if (!(Number(f.value) > 0)) return flash(f); close({ new_unit: nu.value.trim().toUpperCase(), factor: Number(f.value) }); };
    return [h('h3', t('change_stock_unit'), ': ', h('bdi', it.name)), h('small.muted', t('change_stock_unit_help', { u: it.unit })),
      h('div.field', h('label', { for: 'cv-factor' }, t('convert_relation')),
        h('div.buy-line', { dir: 'ltr' }, h('span.nowrap', '1 ' + it.unit + ' ='), f, nu)),
      h('small.muted', ...t('factor_one_rename').split(/(\d[\d.]* [A-Z]+ = [\d.]+ [A-Z]+)/).map((s, i) => (i % 2 ? h('bdi', { dir: 'ltr' }, s) : s))),
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('preview_change')))];
  });
  if (!asked) return;
  let pv;
  try { pv = await call('items.convertUnit', { item_id: it.item_id, ...asked, preview: true }); } catch (e) { toast(errText(e), 'err'); return; }
  const go = await dialog((close) => [h('h3', t('change_stock_unit'), ': ', h('bdi', pv.name)),
    pv.factor === 1 ? h('p.notice.warn', t('convert_rename_warn', { a: pv.old_unit, b: pv.new_unit }))
      : h('p', h('bdi', { dir: 'ltr' }, '1 ' + pv.old_unit + ' = ' + fmtNum(pv.factor) + ' ' + pv.new_unit)),
    h('p', t('convert_balance', { a: fmtNum(pv.balance_before) + ' ' + pv.old_unit, b: fmtNum(pv.balance_after) + ' ' + pv.new_unit })),
    h('p', t('convert_min', { a: fmtNum(pv.min_before) + ' ' + pv.old_unit, b: fmtNum(pv.min_after) + ' ' + pv.new_unit })),
    h('p.muted', t('convert_history', { n: pv.movements, f: pv.factor })),
    h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn.danger', { type: 'button', onclick: () => close(true) }, t('convert_now')))]);
  if (!go) return;
  try { await call('items.convertUnit', { item_id: it.item_id, ...asked }); await Data.refresh(); toast(t('saved'), 'ok'); }
  catch (e) { toast(errText(e), 'err'); }
}

function locations(body, isAdmin) {
  const tb = h('tbody');
  const fill = () => tb.replaceChildren(...[...Data.locations]
    .sort((a, b) => STORES.indexOf(Data.storeOf(a)) - STORES.indexOf(Data.storeOf(b)) || a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((l) => h('tr.click', { onclick: () => edit(l) }, h('td.num', l.location_id), h('td.wrap', h('bdi', l.name)),
      h('td', storePill(Data.storeOf(l))),
      h('td', l.active === false ? h('span.pill.out', t('inactive')) : ''))));
  watch(fill);
  const edit = (l) => dialog((close) => {
    const name = trackFilled(h('input.input#e-lname', { value: l ? l.name : '', disabled: l && !isAdmin }));
    const cat = storeSelect('e-lcat', l ? Data.storeOf(l) : 'DRY', l && !isAdmin);
    const active = h('input#e-lactive', { type: 'checkbox', checked: !l || l.active !== false, disabled: !isAdmin });
    const err = h('p.err-text', '');
    const ok = () => {
      if (!name.value.trim()) return flash(name);
      const pl = { name: name.value, store: cat.value };
      if (l) { pl.location_id = l.location_id; pl.active = active.checked; }
      save('locations.save', pl, close, err);
    };
    return [h('h3', l ? t('edit_location') : t('new_location')), field(t('name'), name), field(t('store'), cat),
      h('label.check', active, ' ', t('active')), l && !isAdmin ? h('small.muted', t('rename_admin_only')) : null,
      h('small.muted', t('location_help')), err,
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
  }).then((r) => { if (r) fill(); });
  body.replaceChildren(h('div.form-actions', Data.can('locations.save') ? h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_location')) : null),
    h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', 'ID'), h('th', t('name')), h('th', t('store')), h('th', ''))), tb)));
  fill();
}

function storeSelect(id, value, disabled) {
  const s = h('select.input#' + id, { disabled: !!disabled }, STORES.map((x) => h('option', { value: x }, t('store_' + x))));
  s.value = value;
  return s;
}

function units(body, isAdmin) {
  const tb = h('tbody');
  const used = () => { const n = new Map(); Data.items.forEach((i) => { if (i.active === true) n.set(i.unit, (n.get(i.unit) || 0) + 1); }); return n; };
  const fill = () => {
    const n = used();
    tb.replaceChildren(...[...Data.units].sort((a, b) => String(a.unit).localeCompare(String(b.unit))).map((u) => {
      const box = h('input', { type: 'checkbox', checked: u.active !== false, disabled: !isAdmin, 'aria-label': t('active') });
      box.addEventListener('change', async () => {
        box.disabled = true;
        try { await call('units.save', { unit: u.unit, active: box.checked }); await Data.refresh(); toast(t('saved'), 'ok'); }
        catch (e) { box.checked = !box.checked; toast(errText(e), 'err'); }
        box.disabled = false;
      });
      return h('tr', h('td.num', u.unit), h('td.num', n.get(u.unit) || ''), h('td', h('label.check', box, ' ', t('active'))));
    }));
  };
  watch(fill);
  const unit = trackFilled(h('input.input#e-newunit', { autocapitalize: 'characters', placeholder: 'TRAY' }));
  const add = async () => {
    if (!unit.value.trim()) return flash(unit);
    try { await call('units.save', { unit: unit.value }); unit.value = ''; await Data.refresh(); toast(t('saved'), 'ok'); fill(); }
    catch (e) { toast(errText(e), 'err'); flash(unit); }
  };
  unit.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  body.replaceChildren(h('small.muted', t(isAdmin ? 'units_help' : 'units_help_add')),
    h('div.search', unit, h('button.btn', { type: 'button', onclick: add }, '+ ' + t('new_unit'))),
    h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', t('unit')), h('th', t('items_using')), h('th', ''))), tb)));
  fill();
}

function recipes(body) {
  const norm = (s) => String(s || '').trim().toUpperCase();
  const products = () => [...new Map(Data.recipes.map((r) => [norm(r.product), r.product])).values()].sort();
  let lines = [];
  const product = trackFilled(h('input.input#rc-product', { list: 'rc-products', placeholder: t('product') }));
  const dl = h('datalist#rc-products', products().map((p) => h('option', { value: p })));
  const item = combo({ id: 'rc-item', options: () => Data.activeItems().filter((i) => i.category === 'Food').map((i) => ({ value: i.item_id, label: i.name, hint: i.unit })) });
  const qty = trackFilled(h('input.input.num#rc-qty', { type: 'number', step: 'any', min: 0 }));
  const tb = h('tbody');
  const err = h('p.err-text', '');
  const draw = () => tb.replaceChildren(...(lines.length ? lines.map((l, i) => h('tr', h('td.wrap', h('bdi', (Data.items.get(l.item_id) || {}).name || l.item_id)),
    h('td.num', fmtNum(l.qty_per_unit) + ' ' + ((Data.items.get(l.item_id) || {}).unit || '')),
    h('td', h('button.link', { type: 'button', onclick: () => { lines.splice(i, 1); draw(); } }, t('delete')))))
    : [h('tr', h('td.empty', { colspan: 3 }, t('no_lines')))]));
  product.addEventListener('change', () => {
    lines = Data.recipes.filter((r) => norm(r.product) === norm(product.value)).map((r) => ({ item_id: r.item_id, qty_per_unit: Number(r.qty_per_unit) }));
    draw();
  });
  const add = () => {
    if (!item.value) return flash(item.input);
    if (!(Number(qty.value) > 0)) return flash(qty);
    lines = lines.filter((l) => l.item_id !== item.value).concat([{ item_id: item.value, qty_per_unit: Number(qty.value) }]);
    item.clear(); qty.value = ''; draw(); item.input.focus();
  };
  qty.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const saveRecipe = async () => {
    if (!product.value.trim()) return flash(product);
    try {
      await call('recipes.save', { product: product.value.trim(), lines });
      await Data.refresh();
      toast(t('saved'), 'ok');
    } catch (e) { err.textContent = errText(e); }
  };
  body.replaceChildren(h('small.muted', t('recipe_help')),
    h('div.form-grid', field(t('product'), product, { wide: true }), dl, field(t('item'), item, { wide: true }), field(t('qty_per_unit'), qty),
      h('div.field.end', h('button.btn', { type: 'button', onclick: add }, t('add_line')))),
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('qty_per_unit')), h('th', ''))), tb)), err,
    h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: saveRecipe }, t('save'))));
  draw();
}
