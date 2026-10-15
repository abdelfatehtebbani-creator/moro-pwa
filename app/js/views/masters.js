// Items, suppliers/departments and recipes. Changes need a connection (saved directly).
// Renaming changes one cell: every movement keeps pointing at the same ID.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, trackFilled, dialog } from '../ui.js';
import { combo, field } from '../components.js';

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
      h('td.num', i.item_id), h('td.wrap', h('bdi', i.name)), h('td', h('span', { class: 'pill ' + (i.category === 'Food' ? 'food' : 'pack') }, t(i.category === 'Food' ? 'food' : 'packaging'))),
      h('td', i.unit), h('td.num', Number(i.min_stock) > 0 ? fmtNum(i.min_stock) : ''), h('td.num', fmtNum(Data.qty(i.item_id))),
      h('td', i.active === true ? '' : h('span.pill.out', t('inactive'))))));
  };
  search.addEventListener('input', fill);
  showInactive.addEventListener('change', fill);
  watch(fill);

  const edit = (it) => dialog((close) => {
    const name = trackFilled(h('input.input#e-name', { value: it ? it.name : '', disabled: it && !isAdmin }));
    const cat = h('select.input#e-cat', h('option', { value: 'Food' }, t('food')), h('option', { value: 'Packaging' }, t('packaging')));
    cat.value = it ? it.category : 'Food';
    const unit = combo({ id: 'e-unit', options: () => Data.unitOptions(it && it.unit) });
    if (it) unit.set(it.unit);
    const min = trackFilled(h('input.input.num#e-min', { type: 'number', min: 0, step: 'any', value: it ? Number(it.min_stock) || 0 : 0, disabled: !canMin }));
    const active = h('input#e-active', { type: 'checkbox', checked: !it || it.active === true, disabled: !isAdmin });
    const err = h('p.err-text', '');
    const ok = () => {
      if (!name.value.trim()) return flash(name);
      if (!unit.input.value.trim()) return flash(unit.input);
      const p = { name: name.value, category: cat.value, unit: unit.input.value.trim().toUpperCase() };
      if (it) { p.item_id = it.item_id; if (!isAdmin) p.name = it.name; p.active = active.checked; }
      if (canMin) p.min_stock = Number(min.value) || 0;
      save('items.save', p, close, err);
    };
    return [h('h3', it ? t('edit_item') : t('new_item')), field(t('name'), name), field(t('category'), cat), field(t('unit'), unit),
      field(t('min_stock'), min), h('label.check', active, ' ', t('active')), it && !isAdmin ? h('small.muted', t('rename_admin_only')) : null, err,
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
  }).then((r) => { if (r) fill(); });

  body.replaceChildren(h('div.search', search, h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_item'))),
    h('label.check', showInactive, ' ', t('show_inactive')),
    h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', 'ID'), h('th', t('item')), h('th', t('category')), h('th', t('unit')),
      h('th', t('min_stock')), h('th', t('balance')), h('th', ''))), tb)));
  fill();
}

function parties(body, isAdmin) {
  const tb = h('tbody');
  const fill = () => tb.replaceChildren(...[...Data.parties.values()].filter((p) => p.kind === 'supplier' || p.kind === 'section')
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
  body.replaceChildren(h('div.form-actions', h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_party'))),
    h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', 'ID'), h('th', t('name')), h('th', t('kind')), h('th', ''))), tb)));
  fill();
}

function locations(body, isAdmin) {
  const tb = h('tbody');
  const fill = () => tb.replaceChildren(...[...Data.locations]
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((l) => h('tr.click', { onclick: () => edit(l) }, h('td.num', l.location_id), h('td.wrap', h('bdi', l.name)),
      h('td', h('span', { class: 'pill ' + (l.category === 'Food' ? 'food' : 'pack') }, t(l.category === 'Food' ? 'food' : 'packaging'))),
      h('td', l.active === false ? h('span.pill.out', t('inactive')) : ''))));
  watch(fill);
  const edit = (l) => dialog((close) => {
    const name = trackFilled(h('input.input#e-lname', { value: l ? l.name : '', disabled: l && !isAdmin }));
    const cat = h('select.input#e-lcat', { disabled: l && !isAdmin }, h('option', { value: 'Food' }, t('food')), h('option', { value: 'Packaging' }, t('packaging')));
    cat.value = l ? l.category : 'Food';
    const active = h('input#e-lactive', { type: 'checkbox', checked: !l || l.active !== false, disabled: !isAdmin });
    const err = h('p.err-text', '');
    const ok = () => {
      if (!name.value.trim()) return flash(name);
      const pl = { name: name.value, category: cat.value };
      if (l) { pl.location_id = l.location_id; pl.active = active.checked; }
      save('locations.save', pl, close, err);
    };
    return [h('h3', l ? t('edit_location') : t('new_location')), field(t('name'), name), field(t('category'), cat),
      h('label.check', active, ' ', t('active')), l && !isAdmin ? h('small.muted', t('rename_admin_only')) : null,
      h('small.muted', t('location_help')), err,
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
  }).then((r) => { if (r) fill(); });
  body.replaceChildren(h('div.form-actions', h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_location'))),
    h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', 'ID'), h('th', t('name')), h('th', t('category')), h('th', ''))), tb)));
  fill();
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
