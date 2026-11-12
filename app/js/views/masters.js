// Items, suppliers/departments and recipes. Changes need a connection (saved directly).
// Renaming changes one cell: every movement keeps pointing at the same ID.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, fmtDate, trackFilled, dialog } from '../ui.js';
import { combo, field, storePill } from '../components.js';
import { STORES } from '../data.js';

let tab = 'items';
let cleanup = null;

export function render(root) {
  if (cleanup) cleanup();
  // tabs and renames follow the user's ticks, tab by tab
  const tabs = h('div.tabs');
  const body = h('div');
  const names = { items: t('items'), parties: t('parties'), locations: t('locations'), units: t('units'), recipes: t('recipes') };
  const may = (k) => Data.can('tab.' + k);
  if (!may(tab)) tab = Object.keys(names).find(may) || 'items';
  Object.keys(names).filter(may).forEach((k) =>
    tabs.append(h('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; render(root); } }, names[k])));
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('masters')), tabs), body));
  ({ items, parties, locations, units, recipes })[tab](body, Data.can('rename.' + tab));
}

function watch(fill) {
  window.addEventListener('moro:data', fill);
  cleanup = () => { window.removeEventListener('moro:data', fill); cleanup = null; };
}

export function dispose() { if (cleanup) cleanup(); }

// the window closes as soon as the server has saved; the data on the device is read again in the background
// (the list follows when it arrives) instead of keeping the window open for a second slow request
const refreshSoon = (then) => Data.refresh().then(() => { if (then) then(); }).catch(() => { /* the next sync */ });
async function save(action, payload, close, err, after) {
  try {
    await call(action, payload);
    toast(t('saved'), 'ok');
    close(true);
    if (after) after();
    refreshSoon();
  } catch (e) { err.textContent = errText(e); }
}

function items(body, isAdmin) {
  const canMin = Data.can('min_stock');
  const search = trackFilled(h('input.input#m-search', { type: 'search', placeholder: t('lookup_hint') }));
  const showInactive = h('input#m-inactive', { type: 'checkbox' });
  // by department, or by store (the four material stores)
  const deptFilter = h('select.input#m-dept', h('option', { value: '' }, t('all_depts')),
    h('optgroup', { label: t('departments') }, Data.producingDepts().map((p) => h('option', { value: p.party_id }, p.name))),
    h('optgroup', { label: t('m_stores') }, ['CHILLED', 'DRY', 'PACK', 'CLEAN', 'EQUIP'].map((s) => h('option', { value: 'st:' + s }, t('store_' + s)))));
  const byFilter = (i) => !deptFilter.value || (deptFilter.value.startsWith('st:') ? Data.storeOf(i) === deptFilter.value.slice(3) : String(i.dept || '') === deptFilter.value);
  const tb = h('tbody');
  // the fixed price of a final product (the price list); other materials have none here
  const showPrice = Data.can('see_prices') || Data.can('final_price');
  const priceOf = (i) => (i.final_price === '' || i.final_price === undefined || i.final_price === null ? '' : Number(i.final_price));
  // the price list of the department chosen (or of every department), printed
  // the columns printed are chosen first (remembered on this device)
  const PRINT_COLS = [['id', 'ID', (i) => i.item_id], ['name', 'Product', (i) => i.name], ['name_ar', 'الاسم', (i) => i.name_ar || ''],
    ['unit', 'Unit', (i) => i.unit], ['price', 'Price', (i) => (priceOf(i) === '' ? '—' : fmtNum(priceOf(i)))]];
  const choosePrint = async () => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('moro.priceCols') || 'null'); } catch (e) { /* none */ }
    const boxes = PRINT_COLS.map(([k]) => h('input', { type: 'checkbox', checked: !saved || saved.includes(k) }));
    const cols = await dialog((close) => [h('h3', t('price_list_print')), h('p', t('price_list_cols')),
      h('div.pcols', PRINT_COLS.map(([k, label], ix) => h('label.check', boxes[ix], ' ', t('pcol_' + k)))),
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
        h('button.btn', { type: 'button', onclick: () => { const on = PRINT_COLS.filter((c, ix) => boxes[ix].checked).map((c) => c[0]); if (on.length) close(on); else flash(boxes[0]); } }, t('print')))]);
    if (!cols) return;
    try { localStorage.setItem('moro.priceCols', JSON.stringify(cols)); } catch (e) { /* private mode */ }
    printPrices(PRINT_COLS.filter((c) => cols.includes(c[0])));
  };
  const printPrices = (cols) => {
    const st = deptFilter.value.startsWith('st:') ? deptFilter.value.slice(3) : '';
    const depts = st ? [{ party_id: '', name: t('store_' + st) }] : deptFilter.value ? [Data.parties.get(deptFilter.value)].filter(Boolean) : Data.producingDepts();
    const groups = depts.map((d) => ({ d, rows: [...Data.items.values()].filter((i) => i.active === true && (st ? Data.storeOf(i) === st : String(i.dept || '') === d.party_id))
      .sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.rows.length);
    if (!groups.length) { toast(t('price_list_empty'), 'err'); return; }
    const area = h('div#print-area', { dir: 'ltr' }, h('div.pr-company', 'ALAKER SWEETS'), h('div.pr-sub', 'Inventory Management System'),
      h('div.pr-title', 'Price list'), h('div.pr-meta', h('b', deptFilter.value ? groups[0].d.name : 'All departments'), h('span', 'Printed: ' + new Date().toLocaleString('en-GB'))),
      groups.map((g) => [groups.length > 1 ? h('div.pr-title', g.d.name) : null,
        h('table.pr-table', h('thead', h('tr', cols.map((c) => h('th', c[1])))),
          h('tbody', g.rows.map((i) => h('tr', cols.map(([k, , v]) => h('td', k === 'price' ? { class: 'num' } : k === 'name_ar' ? { dir: 'rtl' } : {}, v(i))))))),
        h('div.pr-count', 'Number of products: ' + g.rows.length)]));
    document.body.append(area);
    const done = () => { area.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  const fill = () => {
    const q = search.value.trim().toLowerCase();
    const rows = [...Data.items.values()].filter((i) => (showInactive.checked || i.active === true) && (!q || (i.name + ' ' + (i.name_ar || '')).toLowerCase().includes(q))
      && byFilter(i))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 400);
    tb.replaceChildren(...rows.map((i) => h('tr.click', { onclick: () => edit(i) },
      h('td.num', i.item_id), h('td.wrap', h('bdi', i.name), i.name_ar ? h('small.muted.name-ar', h('bdi', i.name_ar)) : null), h('td', storePill(Data.storeOf(i))),
      h('td', i.unit), showPrice ? h('td.num', priceOf(i) === '' ? '' : fmtNum(priceOf(i))) : null, h('td.num', fmtNum(Data.qty(i.item_id))),
      h('td', i.active === true ? '' : h('span.pill.out', t('inactive'))))));
  };
  search.addEventListener('input', fill);
  showInactive.addEventListener('change', fill);
  deptFilter.addEventListener('change', fill);
  watch(fill);

  const edit = (it) => dialog((close) => {
    const name = trackFilled(h('input.input#e-name', { value: it ? it.name : '', disabled: it && !isAdmin }));
    // shown to Arabic users instead of the name (the name stays the item's name in the data and the reports)
    const nameAr = trackFilled(h('input.input#e-name-ar', { value: it ? it.name_ar || '' : '', dir: 'rtl', disabled: it && !Data.can('rename.items') }));
    const cat = storeSelect('e-cat', it ? Data.storeOf(it) : 'DRY', it && !isAdmin);
    // a final product is made by one department: its shop-order lines go to that department
    const deptSel = h('select.input#e-dept', { disabled: it && !Data.can('rename.items') }, h('option', { value: '' }, '—'),
      Data.producingDepts().map((p) => h('option', { value: p.party_id }, p.name)));
    deptSel.value = it ? it.dept || '' : '';
    const deptField = field(t('made_by_dept'), deptSel);
    const showDept = () => { deptField.hidden = cat.value !== 'FINAL'; };
    cat.addEventListener('change', showDept);
    showDept();
    const unit = combo({ id: 'e-unit', options: () => Data.unitOptions(it && it.unit) });
    // a raw material is classed in a generic material (family), with what one of its units holds; a new one can be made here
    const RAW = ['DRY', 'CHILLED'];
    const canFam = Data.can('add_items') || Data.can('rename.items') || Data.can('families.save');
    const famSel = h('select.input#e-fam', { disabled: !canFam }, h('option', { value: '' }, '—'),
      [...Data.families.values()].filter((f) => f.active === true || (it && f.family_id === it.family_id)).sort((a, b) => Data.nameOf(a).localeCompare(Data.nameOf(b)))
        .map((f) => h('option', { value: f.family_id }, Data.nameOf(f) + ' (' + f.unit + ')')),
      h('option', { value: 'new' }, '+ ' + t('fam_new')));
    famSel.value = it ? String(it.family_id || '') : '';
    const nfName = trackFilled(h('input.input#e-nf-name', { placeholder: 'Vegetable ghee', dir: 'ltr' }));
    const nfAr = trackFilled(h('input.input#e-nf-ar', { placeholder: 'سمنة نباتية', dir: 'rtl' }));
    const nfUnit = trackFilled(h('input.input#e-nf-unit', { value: 'KG', dir: 'ltr' }));
    const newBox = h('div.form-grid', field(t('fam_name'), nfName, { wide: true }), field(t('fam_name_ar'), nfAr, { wide: true }), field(t('fam_unit'), nfUnit));
    const famFactor = trackFilled(h('input.input.num#e-fam-factor', { type: 'number', min: 0, step: 'any', disabled: !canFam,
      value: it && it.family_factor !== undefined && it.family_factor !== '' ? it.family_factor : '' }));
    const factorLbl = h('label', { for: 'e-fam-factor' });
    const famUnit = () => famSel.value === 'new' ? (nfUnit.value.trim().toUpperCase() || 'KG') : ((Data.families.get(famSel.value) || {}).unit || '…');
    const drawFam = () => {
      newBox.hidden = famSel.value !== 'new';
      factorLbl.textContent = t('fam_factor', { f: famUnit(), u: (unit.input.value.trim().toUpperCase() || '…') });
    };
    const famField = h('div.fam-field', field(t('fam_word_title'), famSel), newBox, h('div.field', factorLbl, famFactor), h('small.muted', t('fam_item_help')));
    const showFam = () => { famField.hidden = !RAW.includes(cat.value) && !(it && it.family_id); };
    [famSel, nfUnit].forEach((x) => x.addEventListener('input', drawFam));
    famSel.addEventListener('change', drawFam);
    unit.input.addEventListener('input', drawFam);
    unit.input.addEventListener('change', drawFam);
    cat.addEventListener('change', showFam);
    drawFam(); showFam();
    if (it) { unit.set(it.unit); unit.input.readOnly = true; unit.input.classList.add('locked'); }
    const convertBtn = it && Data.can('items.convertUnit') ? h('button.link', { type: 'button', onclick: () => ok(() => convertUnit(Data.items.get(it.item_id) || it)) }, t('change_stock_unit')) : null;
    // an item kept in its larger unit (TIN while KG exists): the admin moves it to the smallest unit once
    const smaller = it ? Data.packsOf(it).filter((x) => x.factor < 1).sort((a, b) => a.factor - b.factor)[0] : null;
    const toBaseBtn = smaller && Data.can('items.convertUnit')
      ? h('div.notice', t('base_not_smallest', { u: smaller.unit }), ' ',
        h('button.link', { type: 'button', onclick: () => ok(() => convertUnit(Data.items.get(it.item_id) || it, { new_unit: smaller.unit, factor: Math.round((1 / smaller.factor) * 1e6) / 1e6 })) }, t('make_base', { u: smaller.unit })))
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
    const image = trackFilled(h('input.input#e-image', { type: 'url', value: it ? it.image || '' : '', placeholder: 'https://…', dir: 'ltr' }));
    // final products: a fixed price per stock unit, set by the admin, used by every receipt
    const canFinal = Data.can('final_price');
    const finalPrice = trackFilled(h('input.input.num#e-fprice', { type: 'number', min: 0, step: 'any', value: it && it.final_price !== undefined ? it.final_price : '', disabled: !canFinal }));
    const costBox = h('div.cost-box');
    // its shelf life in days: the expiry of each production is worked out from it
    const shelf = trackFilled(h('input.input.num#e-shelf', { type: 'number', min: 1, max: 3650, step: 1, inputmode: 'numeric', value: it && it.shelf_days !== undefined ? it.shelf_days : '', disabled: !canFinal }));
    const finalField = h('div', h('div.field', h('label', { for: 'e-fprice' }, t('final_price')), finalPrice), costBox,
      h('div.field', h('label', { for: 'e-shelf' }, t('shelf_days')), shelf, h('small.muted', t('shelf_days_help'))));
    if (it && canFinal && Data.recipes.some((r) => String(r.product).trim().toUpperCase() === String(it.name).trim().toUpperCase())) {
      call('recipes.cost', { product: it.name }).then((c) => {
        if (!c.lines.length) return;
        const nm = (id) => Data.nameOf(Data.items.get(id) || { name: id });
        costBox.replaceChildren(
          h('div', h('b', t('recipe_cost')), ' ', c.cost === '' ? h('span.err-text', t('recipe_cost_missing')) : h('b.num', fmtNum(c.cost) + ' QR / ' + it.unit)),
          // the running costs (electricity, salaries…) as a share of the materials, and the full cost
          c.cost !== '' && c.overhead_rate ? h('div', t('overhead_line', { p: fmtNum(Math.round(c.overhead_rate * 1000) / 10), v: fmtNum(c.overhead) }), ' · ',
            h('b', t('overhead_total')), ' ', h('b.num', fmtNum(c.total) + ' QR / ' + it.unit)) : null,
          c.cost !== '' && finalPrice.value !== '' && (c.total || c.cost) > Number(finalPrice.value) ? h('span.pill.low', t('cost_over_price')) : null,
          h('small.muted', c.lines.map((l) => nm(l.item_id) + ' ' + fmtNum(l.qty) + ' × ' + (l.unit_cost === '' ? '?' : fmtNum(l.unit_cost)) + (l.date ? ' (' + l.date + ')' : '')).join(' · ')),
          c.cost !== '' ? h('button.link', { type: 'button', onclick: () => { finalPrice.value = String(c.total || c.cost); finalPrice.dispatchEvent(new Event('input')); } }, t('recipe_cost_use')) : null);
      }).catch(() => {});
    }
    const showFinal = () => { finalField.hidden = cat.value !== 'FINAL'; };
    cat.addEventListener('change', showFinal);
    showFinal();
    const err = h('p.err-text', '');
    // after: what to open once the item is saved (the unit windows)
    const ok = (after) => {
      if (!name.value.trim()) return flash(name);
      if (!unit.input.value.trim()) return flash(unit.input);
      const p = { name: name.value, store: cat.value, unit: it ? it.unit : unit.input.value.trim().toUpperCase() };
      if (it) { p.item_id = it.item_id; if (!isAdmin) p.name = it.name; p.active = active.checked; }
      if (canMin) p.min_stock = Number(min.value) || 0;
      p.image = image.value.trim();
      if (!it || Data.can('rename.items')) p.dept = cat.value === 'FINAL' ? deptSel.value : '';
      if (!it || Data.can('rename.items')) p.name_ar = nameAr.value.trim();
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
      // the generic material: required for a new raw material; sent when it was chosen or changed
      if (!famField.hidden && canFam) {
        const was = it ? String(it.family_id || '') : '', wasF = it && it.family_factor !== undefined ? String(it.family_factor) : '';
        if (!it && RAW.includes(cat.value) && !famSel.value) return flash(famSel);
        if (famSel.value && !(Number(famFactor.value) > 0)) return flash(famFactor);
        if (famSel.value === 'new' && !nfName.value.trim()) return flash(nfName);
        if (famSel.value !== was || (famSel.value && String(Number(famFactor.value)) !== wasF)) {
          if (famSel.value === 'new') p.new_family = { name: nfName.value.trim(), name_ar: nfAr.value.trim(), unit: nfUnit.value.trim() || 'KG' };
          else p.family_id = famSel.value;
          p.family_factor = famSel.value ? Number(famFactor.value) : '';
        }
      }
      if (canFinal && cat.value === 'FINAL') {
        if (finalPrice.value !== '' && !(Number(finalPrice.value) >= 0)) return flash(finalPrice);
        p.final_price = finalPrice.value;
        const sd = shelf.value.trim();
        if (sd !== '' && !(Number(sd) >= 1 && Number.isInteger(Number(sd)))) return flash(shelf);
        p.shelf_days = sd;
      }
      save('items.save', p, close, err, typeof after === 'function' ? after : null);
    };
    return [h('h3', it ? t('edit_item') : t('new_item')), field(t('name'), name), field(t('name_ar'), nameAr), field(t('store'), cat), deptField, finalField,
      h('fieldset.units-box', h('legend', t('units_of_item')),
        field(t('base_unit'), unit), toBaseBtn,
        h('div.field', h('label', { for: 'e-buyunit' }, t('big_unit')),
          h('div.buy-line', { dir: 'ltr' }, h('span', '1'), buyUnit, h('span', '='), buyQty, stockLbl)),
        h('div.show-units', field(t('show_purchasing'), buyShow), field(t('show_store'), storeShow)),
        h('small.muted', t('item_units_help')), convertBtn),
      famField,
      field(t('min_stock_in', { u: it ? it.unit : '' }), min),
      field(t('picture_link'), image), h('label.check', active, ' ', t('active')), it && !isAdmin ? h('small.muted', t('rename_admin_only')) : null, err,
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
  }).then((r) => { if (r) fill(); });

  // a list of Arabic names (CSV: item_id, …, name_ar) read from a file and saved at once
  const importAr = async () => {
    const file = h('input', { type: 'file', accept: '.csv,text/csv' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      const rows = csvRows(await fileText(f));
      const head = (rows.shift() || []).map((x) => x.trim().toLowerCase());
      const ci = head.indexOf('item_id'), ai = head.indexOf('name_ar');
      if (ci < 0 || ai < 0) { toast(t('names_ar_bad_file'), 'err'); return; }
      const names = rows.filter((r) => r[ci] && Data.items.has(r[ci].trim())).map((r) => ({ item_id: r[ci].trim(), name_ar: (r[ai] || '').trim() }));
      if (!names.length) { toast(t('names_ar_bad_file'), 'err'); return; }
      try { const r = await call('items.namesAr', { names }); toast(t('names_ar_saved', { n: r.changed }), 'ok'); refreshSoon(fill); }
      catch (e) { toast(errText(e), 'err'); }
    });
    file.click();
  };
  // final products from a price list (CSV: dept, name, name_ar, unit, price): checked first, then saved at once
  const importItems = async () => {
    const file = h('input', { type: 'file', accept: '.csv,text/csv' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      const all = csvRows(await fileText(f));
      const head = (all.shift() || []).map((x) => x.trim().toLowerCase());
      const col = (k) => head.indexOf(k);
      if (col('name') < 0 || col('dept') < 0) { toast(t('import_bad_file'), 'err'); return; }
      const rows = all.map((r) => ({ dept: r[col('dept')] || '', name: r[col('name')] || '', name_ar: col('name_ar') >= 0 ? r[col('name_ar')] || '' : '',
        unit: col('unit') >= 0 ? r[col('unit')] || '' : '', price: col('price') >= 0 ? r[col('price')] || '' : '',
        old_name: col('old_name') >= 0 ? r[col('old_name')] || '' : '' }));
      let pv;
      try { pv = await call('items.import', { rows }); } catch (e) { toast(errText(e), 'err'); return; }
      const c = pv.counts || {};
      const tag = (a) => h('span.pill.imp-' + a, t('imp_' + a));
      const go = await dialog((close) => [h('h3', t('import_items')),
        h('p', t('import_summary', { n: c.new || 0, u: c.update || 0, s: c.same || 0, x: (c.conflict || 0) + (c.dup || 0) + (c.bad || 0) })),
        pv.new_depts.length ? h('p', t('import_new_depts'), ' ', h('b', pv.new_depts.join('، '))) : null,
        pv.prices ? null : h('p.muted', t('import_no_prices')),
        h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', '#'), h('th', t('item')), h('th', t('department')), h('th', t('unit')), h('th', t('final_price')), h('th', ''))),
          h('tbody', pv.plan.map((l) => h('tr', h('td', String(l.line)), h('td', h('bdi', l.name), l.name_ar ? h('small.muted', ' ', l.name_ar) : null, l.renamed_from ? h('small.muted', ' ← ', h('bdi', l.renamed_from)) : null),
            h('td', l.dept_name || l.dept, l.dept_id ? h('small.muted', ' ' + l.dept_id) : l.dept_name ? h('small.muted', ' ' + t('imp_new')) : null), h('td', l.unit, l.unit_differs ? h('small.muted', ' (' + l.unit_differs + ')') : null), h('td.num', l.price === '' ? '—' : fmtNum(l.price)),
            h('td', tag(l.action), l.action === 'conflict' ? h('small.muted', ' ' + t('imp_conflict_help', { s: l.why })) : l.action === 'dup' ? h('small.muted', ' #' + l.why) : null)))))),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
          h('button.btn', { type: 'button', disabled: !(c.new || c.update), onclick: () => close(true) }, t('import_save')))]);
      if (!go) return;
      try {
        const r = await call('items.import', { rows, apply: true });
        toast(t('import_done', { n: r.created, u: r.updated, d: r.departments }), 'ok');
        refreshSoon(fill);
      } catch (e) { toast(errText(e), 'err'); }
    });
    file.click();
  };
  // the search and the filter on one line (the search takes the room), the buttons on the next
  body.replaceChildren(h('div.search', search, deptFilter), h('div.tool-row', Data.can('add_items') ? h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_item')) : null,
      Data.can('items.namesAr') ? h('button.btn.secondary', { type: 'button', onclick: importAr }, t('names_ar_import')) : null,
      Data.can('items.import') ? h('button.btn.secondary', { type: 'button', onclick: importItems }, t('import_items')) : null,
      showPrice ? h('button.btn.secondary', { type: 'button', onclick: choosePrint }, t('price_list_print')) : null),
    h('label.check', showInactive, ' ', t('show_inactive')),
    h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', 'ID'), h('th', t('item')), h('th', t('store')), h('th', t('unit')),
      showPrice ? h('th', t('price')) : null, h('th', t('balance')), h('th', ''))), tb)));
  fill();
}

function parties(body, isAdmin) {
  const tb = h('tbody');
  // search by name or ID, and by kind (suppliers / departments)
  const search = trackFilled(h('input.input#p-search', { type: 'search', placeholder: t('party_search_hint') }));
  const kindSel = h('select.input#p-kind', h('option', { value: '' }, t('all')), h('option', { value: 'supplier' }, t('party_supplier')), h('option', { value: 'section' }, t('party_section')), h('option', { value: 'shop' }, t('party_shop')), h('option', { value: 'affiliate' }, t('party_affiliate')));
  const pInactive = h('input#p-inactive', { type: 'checkbox' });
  const fill = () => tb.replaceChildren(...[...Data.parties.values()].filter((p) => ['supplier', 'section', 'shop', 'affiliate'].includes(p.kind))
    .filter((p) => (pInactive.checked || p.active === true) && (!kindSel.value || p.kind === kindSel.value) &&
      (!search.value.trim() || (p.name + ' ' + p.party_id).toLowerCase().includes(search.value.trim().toLowerCase())))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    .map((p) => h('tr.click', { onclick: () => edit(p) }, h('td.num', p.party_id), h('td.wrap', h('bdi', p.name)),
      h('td', t('party_' + p.kind)), h('td', p.active === true ? '' : h('span.pill.out', t('inactive'))))));
  watch(fill);
  const edit = (p) => dialog((close) => {
    const name = trackFilled(h('input.input#e-pname', { value: p ? p.name : '', disabled: p && !isAdmin }));
    // the admin may turn a department into a shop (or back): its ID and history stay
    const swap = p && isAdmin && ['section', 'shop', 'affiliate'].includes(p.kind);
    const kind = h('select.input#e-kind', { disabled: !!p && !swap }, swap ? null : h('option', { value: 'supplier' }, t('party_supplier')), h('option', { value: 'section' }, t('party_section')), h('option', { value: 'shop' }, t('party_shop')), h('option', { value: 'affiliate' }, t('party_affiliate')));
    kind.value = p ? p.kind : 'supplier';
    const active = h('input#e-pactive', { type: 'checkbox', checked: !p || p.active === true, disabled: !isAdmin });
    // a supplier's contact details, printed on its LPOs
    const canSave = Data.can('parties.save');
    const contact = Object.fromEntries(['tel', 'fax', 'email', 'contact', 'contact_phone'].map((c) =>
      [c, trackFilled(h('input.input#e-p' + c, { value: p ? p[c] || '' : '', disabled: !canSave, dir: c === 'contact' ? 'auto' : 'ltr' }))]));
    const contactBox = h('div.party-contact', h('small.muted', t('party_contact_help')),
      ...Object.entries(contact).map(([c, el]) => field(t('party_' + c), el)));
    // a department makes products, or not (cleaning, management…): only those that make products take shop orders
    const producing = h('input#e-pproducing', { type: 'checkbox', checked: !!(p && p.producing === true), disabled: p && !isAdmin });
    const atShop = h('select.input#e-patshop', { disabled: p && !isAdmin }, h('option', { value: '' }, t('dept_at_factory')),
      [...Data.parties.values()].filter((x) => x.kind === 'shop' && x.active === true).sort((a, b) => a.name.localeCompare(b.name)).map((x) => h('option', { value: x.party_id }, x.name)));
    atShop.value = p ? p.at_shop || '' : '';
    const producingBox = h('div', h('label.check', producing, ' ', t('dept_producing')), field(t('dept_at'), atShop), h('small.muted', t('dept_at_help')));
    const showContact = () => { contactBox.hidden = kind.value !== 'supplier'; producingBox.hidden = kind.value !== 'section'; };
    kind.addEventListener('change', showContact);
    showContact();
    const err = h('p.err-text', '');
    const ok = () => {
      if (!name.value.trim()) return flash(name);
      const pl = { name: name.value, kind: kind.value };
      if (p) { pl.party_id = p.party_id; pl.active = active.checked; }
      if (kind.value === 'supplier') Object.entries(contact).forEach(([c, el]) => { pl[c] = el.value; });
      if (kind.value === 'section') { pl.producing = producing.checked; pl.at_shop = atShop.value; }
      save('parties.save', pl, close, err);
    };
    return [h('h3', p ? t('edit_party') : t('new_party')), field(t('name'), name), field(t('kind'), kind),
      h('label.check', active, ' ', t('active')), producingBox, contactBox, err,
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
  }).then((r) => { if (r) fill(); });
  search.addEventListener('input', fill);
  kindSel.addEventListener('change', fill);
  pInactive.addEventListener('change', fill);
  body.replaceChildren(h('div.search', search, kindSel, Data.can('parties.save') ? h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_party')) : null),
    h('label.check', pInactive, ' ', t('show_inactive')),
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
  try { await call('items.convertUnit', { item_id: it.item_id, ...asked }); toast(t('saved'), 'ok'); refreshSoon(); }
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
        try { await call('units.save', { unit: u.unit, active: box.checked }); toast(t('saved'), 'ok'); refreshSoon(); }
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
    try { await call('units.save', { unit: unit.value }); unit.value = ''; toast(t('saved'), 'ok'); refreshSoon(fill); }
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
  // the final products, picked from a list, narrowed by the department that makes them (a recipe is linked to its product by the name)
  const deptFilter = h('select.input#rc-dept', h('option', { value: '' }, t('all_depts')), Data.producingDepts().map((p) => h('option', { value: p.party_id }, p.name)));
  const hasRecipe = new Set(products().map(norm));
  const productOptions = () => {
    const finals = Data.activeItems().filter((i) => Data.storeOf(i) === 'FINAL' && (!deptFilter.value || String(i.dept || '') === deptFilter.value));
    const opts = finals.map((i) => ({ value: i.name, label: Data.nameOf(i), alt: i.name,
      hint: [(Data.parties.get(String(i.dept || '')) || {}).name, hasRecipe.has(norm(i.name)) ? '✓ ' + t('rc_has') : ''].filter(Boolean).join(' · ') }));
    // a recipe whose product is not a final product (an older one) is still offered, with no department
    if (!deptFilter.value) {
      const known = new Set(Data.activeItems().filter((i) => Data.storeOf(i) === 'FINAL').map((i) => norm(i.name)));
      products().filter((n) => !known.has(norm(n))).forEach((n) => opts.push({ value: n, label: n, hint: '✓ ' + t('rc_has') }));
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  };
  const product = combo({ id: 'rc-product', placeholder: t('product'), options: productOptions, onPick: (v) => load(v) });
  deptFilter.addEventListener('change', () => { product.clear(); load(''); product.input.focus(); });
  // a line names a generic material (a family: the brand is taken when producing) or one item
  const item = combo({ id: 'rc-item', options: () => [...Data.families.values()].filter((f) => f.active === true)
    .sort((a, b) => Data.nameOf(a).localeCompare(Data.nameOf(b)))
    .map((f) => ({ value: f.family_id, label: '◆ ' + Data.nameOf(f), alt: f.name, hint: f.unit + ' · ' + t('fam_word') }))
    .concat(Data.activeItems().filter((i) => i.category === 'Food').map((i) => ({ value: i.item_id, label: i.name, hint: i.unit }))) });
  const qty = trackFilled(h('input.input.num#rc-qty', { type: 'number', step: 'any', min: 0 }));
  // a recipe that only prices the product: producing it takes nothing from the stores
  const costOnly = h('input#rc-costonly', { type: 'checkbox' });
  const tb = h('tbody');
  const err = h('p.err-text', '');
  const draw = () => tb.replaceChildren(...(lines.length ? lines.map((l, i) => { const part = Data.recipePart(l.item_id); return h('tr',
    h('td.wrap', part.family ? h('b', '◆ ', h('bdi', part.name)) : h('bdi', part.name), part.family ? h('small.muted', ' · ' + t('fam_word')) : ''),
    h('td.num', fmtNum(l.qty_per_unit) + ' ' + (part.unit || '')),
    h('td', h('button.link', { type: 'button', onclick: () => { lines.splice(i, 1); draw(); } }, t('delete')))); })
    : [h('tr', h('td.empty', { colspan: 3 }, t('no_lines')))]));
  function load(name) {
    const mine = name ? Data.recipes.filter((r) => norm(r.product) === norm(name)) : [];
    lines = mine.map((r) => ({ item_id: r.item_id, qty_per_unit: Number(r.qty_per_unit) }));
    costOnly.checked = mine.some((r) => r.cost_only === true);
    draw();
  }
  const add = () => {
    if (!item.value) return flash(item.input);
    if (!(Number(qty.value) > 0)) return flash(qty);
    lines = lines.filter((l) => l.item_id !== item.value).concat([{ item_id: item.value, qty_per_unit: Number(qty.value) }]);
    item.clear(); qty.value = ''; draw(); item.input.focus();
  };
  qty.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const saveRecipe = async () => {
    if (!product.value) return flash(product.input);
    try {
      await call('recipes.save', { product: product.value.trim(), lines, cost_only: costOnly.checked });
      refreshSoon();
      toast(t('saved'), 'ok');
    } catch (e) { err.textContent = errText(e); }
  };
  body.replaceChildren(Data.can('overhead.save') ? overheadBox(body) : '', familiesBox(body), h('small.muted', t('recipe_help')),
    h('div.form-grid', field(t('made_by_dept'), deptFilter), field(t('product'), product.el, { wide: true }), field(t('item'), item, { wide: true }), field(t('qty_per_unit'), qty),
      h('div.field.end', h('button.btn', { type: 'button', onclick: add }, t('add_line')))),
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('qty_per_unit')), h('th', ''))), tb)),
    h('label.check', costOnly, ' ', h('b', t('recipe_cost_only'))), h('small.muted', t('recipe_cost_only_help')), err,
    h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: saveRecipe }, t('save'))));
  draw();
}

// ---------- running costs of the factory: electricity, salaries… of a period, as a share of the materials produced in it
function overheadBox(body) {
  const box = h('details.fam-box', h('summary', h('b', t('overhead_title')), ' ', h('small.muted', '…')));
  call('overhead.list', {}).then((r) => {
    const ps = r.periods || [];
    const cur = ps[0];
    const pct = (x) => fmtNum(Math.round(x * 1000) / 10) + '%';
    box.replaceChildren(h('summary', h('b', t('overhead_title')), ' ', h('small.muted', cur ? '(' + pct(cur.rate) + ')' : '(' + t('overhead_none') + ')')),
      h('small.muted', t('overhead_help')),
      ps.length ? h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('overhead_period')), h('th', t('overhead_costs')), h('th', t('overhead_material')), h('th', t('overhead_rate')), h('th', ''))),
        h('tbody', ps.map((p, i) => h('tr', { class: i ? 'muted' : '' }, h('td', fmtDate(p.from) + ' – ' + fmtDate(p.to)),
          h('td.wrap', h('b.num', fmtNum(p.total)), h('small.muted', ' ' + p.lines.map((l) => l.label + ' ' + fmtNum(l.amount)).join(' · '))),
          h('td.num', fmtNum(p.material), p.missing ? h('small.err-text', ' ' + t('overhead_missing', { n: p.missing })) : ''),
          h('td.num', h('b', pct(p.rate)), i === 0 ? h('small.muted', ' ' + t('overhead_in_use')) : ''),
          h('td', h('button.link', { type: 'button', onclick: () => editOverhead(p, body) }, t('fam_edit')),
            ' ', h('button.link', { type: 'button', onclick: async () => { if (!confirm(t('overhead_delete_q'))) return;
              try { await call('overhead.delete', { period_id: p.period_id }); toast(t('saved'), 'ok'); recipes(body); } catch (e) { toast(errText(e), 'err'); } } }, t('delete')))))))) : '',
      h('div.form-actions', h('button.btn.secondary', { type: 'button', onclick: () => editOverhead(null, body) }, '+ ' + t('overhead_new'))));
    if (!ps.length) box.open = true;
  }).catch(() => box.replaceChildren(h('summary', h('b', t('overhead_title'))), h('small.err-text', t('err.server_error'))));
  return box;
}

function editOverhead(p, body) {
  const today = Data.todayIso();
  const from = trackFilled(h('input.input#oh-from', { type: 'date', value: p ? p.from : today.slice(0, 8) + '01' }));
  const to = trackFilled(h('input.input#oh-to', { type: 'date', value: p ? p.to : today }));
  const lines = (p ? p.lines : [{ label: t('overhead_electricity'), amount: '' }, { label: t('overhead_salaries'), amount: '' }]).map((l) => ({ ...l }));
  const tb = h('tbody');
  const sum = h('b.num');
  const err = h('p.err-text', '');
  const total = () => lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const draw = () => {
    tb.replaceChildren(...lines.map((l, i) => {
      const label = trackFilled(h('input.input', { value: l.label, oninput: (e) => { l.label = e.target.value; } }));
      const amount = trackFilled(h('input.input.num', { type: 'number', min: 0, step: 'any', value: l.amount, oninput: (e) => { l.amount = e.target.value; sum.textContent = fmtNum(total()); } }));
      return h('tr', h('td', label), h('td', amount), h('td', h('button.link', { type: 'button', onclick: () => { lines.splice(i, 1); draw(); } }, t('delete'))));
    }));
    sum.textContent = fmtNum(total());
  };
  draw();
  return dialog((close) => [h('h3', p ? t('overhead_edit') : t('overhead_new')), h('small.muted', t('overhead_help')),
    h('div.form-grid', field(t('from'), from), field(t('to'), to)),
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('overhead_item')), h('th', t('amount_oh')), h('th', ''))), tb)),
    h('div.form-actions', h('button.btn.secondary', { type: 'button', onclick: () => { lines.push({ label: '', amount: '' }); draw(); } }, '+ ' + t('overhead_add_line')),
      h('span', t('overhead_costs'), ': ', sum)),
    err,
    h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
      h('button.btn', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; err.textContent = '';
        try {
          const r = await call('overhead.save', { period_id: p ? p.period_id : '', from: from.value, to: to.value, lines });
          toast(t('overhead_saved', { p: fmtNum(Math.round(r.rate * 1000) / 10) }), 'ok'); close(true); recipes(body);
        } catch (ex) { err.textContent = errText(ex); btn.disabled = false; }
      } }, t('save')))]);
}

// ---------- generic materials (families): one name for the recipes, the brands linked to it with how much each holds
function familiesBox(body) {
  const fams = [...Data.families.values()].sort((a, b) => Data.nameOf(a).localeCompare(Data.nameOf(b)));
  const canEdit = Data.can('families.save');
  const rows = fams.map((f) => {
    const brands = Data.familyBrands(f.family_id);
    return h('tr', { class: f.active === true ? '' : 'muted' }, h('td.wrap', h('b', h('bdi', Data.nameOf(f)))), h('td', f.unit),
      h('td.wrap', brands.length ? brands.map((b) => h('span.fam-brand', h('bdi', b.it.name), h('small', ' · ', h('bdi', { dir: 'ltr' }, fmtNum(b.factor) + ' ' + f.unit)))) : h('small.err-text', t('fam_no_brands'))),
      h('td.num', fmtNum(Math.round(Data.familyQty(f.family_id) * 100) / 100) + ' ' + f.unit),
      h('td', canEdit ? h('button.link', { type: 'button', onclick: () => editFamily(f, body) }, t('fam_edit')) : ''));
  });
  const box = h('details.fam-box', h('summary', h('b', t('fam_title')), ' ', h('small.muted', '(' + fams.length + ')')),
    h('small.muted', t('fam_help')),
    fams.length ? h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('fam_name')), h('th', t('unit')), h('th', t('fam_brands')), h('th', t('available')), h('th', ''))),
      h('tbody', rows))) : '',
    canEdit ? h('div.form-actions', h('button.btn.secondary', { type: 'button', onclick: () => editFamily(null, body) }, '+ ' + t('fam_new'))) : '');
  if (!fams.length) box.open = true;
  return box;
}

function editFamily(f, body) {
  const name = trackFilled(h('input.input#fm-name', { value: f ? f.name : '' }));
  const nameAr = trackFilled(h('input.input#fm-name-ar', { value: f ? f.name_ar || '' : '', dir: 'rtl' }));
  const unit = trackFilled(h('input.input#fm-unit', { value: f ? f.unit : 'KG' }));
  const active = h('input#fm-active', { type: 'checkbox', checked: !f || f.active === true });
  const members = f ? [...Data.items.values()].filter((i) => String(i.family_id || '') === f.family_id).map((i) => ({ item_id: i.item_id, factor: Number(i.family_factor) })) : [];
  const famName = (id) => Data.nameOf(Data.families.get(id) || {});
  const brand = combo({ id: 'fm-brand', options: () => Data.activeItems().filter((i) => Data.storeOf(i) !== 'FINAL' && !members.some((m) => m.item_id === i.item_id))
    .map((i) => ({ value: i.item_id, label: i.name, hint: i.unit + (i.family_id && (!f || i.family_id !== f.family_id) ? ' · ' + famName(i.family_id) : '') })) });
  const factor = trackFilled(h('input.input.num#fm-factor', { type: 'number', step: 'any', min: 0 }));
  const factorLabel = h('label', { for: 'fm-factor' });
  const label = () => { const it = Data.items.get(brand.value); factorLabel.textContent = t('fam_factor', { u: it ? it.unit : '…', f: unit.value || 'KG' }); };
  const tb = h('tbody');
  const err = h('p.err-text', '');
  brand.input.addEventListener('change', label);
  const draw = () => tb.replaceChildren(...(members.length ? members.map((m, i) => { const it = Data.items.get(m.item_id) || { name: m.item_id, unit: '' };
    return h('tr', h('td.wrap', h('bdi', it.name)), h('td.num', '1 ' + it.unit + ' = ' + fmtNum(m.factor) + ' ' + (unit.value || 'KG')),
      h('td', h('button.link', { type: 'button', onclick: () => { members.splice(i, 1); draw(); } }, t('delete')))); })
    : [h('tr', h('td.empty', { colspan: 3 }, t('fam_no_brands')))]));
  unit.addEventListener('input', () => { draw(); label(); });
  const add = () => {
    if (!brand.value) return flash(brand.input);
    if (!(Number(factor.value) > 0)) return flash(factor);
    members.push({ item_id: brand.value, factor: Number(factor.value) });
    brand.clear(); factor.value = ''; draw(); label(); brand.input.focus();
  };
  factor.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  draw(); label();
  return dialog((close) => [h('h3', f ? Data.nameOf(f) : t('fam_new')), h('small.muted', t('fam_help')),
    h('div.form-grid', field(t('fam_name'), name, { wide: true }), field(t('fam_name_ar'), nameAr, { wide: true }), field(t('fam_unit'), unit)),
    h('h4', t('fam_brands')),
    h('div.form-grid', field(t('item'), brand, { wide: true }), h('div.field', factorLabel, factor),
      h('div.field.end', h('button.btn', { type: 'button', onclick: add }, t('add_line')))),
    h('div.table-wrap', h('table', tb)),
    f ? h('label.check', active, ' ', t('fam_active')) : '', err,
    h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
      h('button.btn', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        if (!name.value.trim()) return flash(name);
        btn.disabled = true;
        try {
          await call('families.save', { family_id: f ? f.family_id : '', name: name.value, name_ar: nameAr.value, unit: unit.value, active: active.checked, members });
          toast(t('saved'), 'ok'); close(true);
          refreshSoon(() => recipes(body));
        } catch (ex) { err.textContent = errText(ex); btn.disabled = false; }
      } }, t('save')))]);
}

/** Rows of a CSV text (quotes, commas and new lines inside quotes). */
// a CSV saved by Excel on an Arabic Windows is not UTF-8 but Windows-1256: read either
async function fileText(f) {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { return new TextDecoder('windows-1256').decode(buf); }
}
function csvRows(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  // Excel's "Unicode text" is separated by tabs
  const first = text.split('\n')[0];
  const sep = first.includes('\t') && !first.includes(',') ? '\t' : ',';
  text = text.replace(/^\ufeff/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
