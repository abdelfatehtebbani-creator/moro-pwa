// Stock counts (monthly, quarterly, yearly): the storekeeper opens a count for a store and a date,
// types what is on the shelves (in any unit of the item), and the admin approves. Approval books one
// adjustment per counted line with a difference, dated the count date; nothing changes before that.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, fmtDate, trackFilled, dialog } from '../ui.js';
import { field, storePill } from '../components.js';
import { reportToXlsx } from '../xlsx.js';

const PERIODS = ['monthly', 'quarterly', 'yearly'];
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const money = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function render(root) {
  const canOpen = Data.can('counts.open');
  const canApprove = Data.can('counts.approve');
  const list = h('tbody', h('tr', h('td.empty', { colspan: 5 }, '…')));
  const detail = h('div');

  async function loadList(openId) {
    let res;
    try { res = await call('counts.list', {}); } catch (e) { toast(errText(e), 'err'); return; }
    const rows = res.counts;
    list.replaceChildren(...(rows.length ? rows.map((c) => h('tr.click', { onclick: () => show(c.count_id) },
      h('td.num', c.count_id), h('td.num', fmtDate(c.date)), h('td', storePill(c.store)), h('td', t('period_' + c.period)),
      h('td', h('span', { class: 'pill ' + (c.status === 'open' ? 'soon' : c.status === 'approved' ? 'in' : 'out') }, t('count_st_' + c.status)))))
      : [h('tr', h('td.empty', { colspan: 5 }, t('no_counts')))]));
    if (openId) show(openId);
  }

  async function newCount() {
    const mine = Data.myStores();
    const asked = await dialog((close) => {
      const store = h('select.input#c-store', mine.map((s) => h('option', { value: s }, t('store_' + s))));
      const date = trackFilled(h('input.input#c-date', { type: 'date', value: Data.todayIso() }));
      const period = h('select.input#c-period', PERIODS.map((p) => h('option', { value: p }, t('period_' + p))));
      const ok = () => { if (!date.value) return flash(date); close({ store: store.value, date: date.value, period: period.value }); };
      return [h('h3', t('new_count')), field(t('store'), store), field(t('count_date'), date), field(t('count_period'), period),
        h('small.muted', t('new_count_help')),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('open_count')))];
    });
    if (!asked) return;
    try { const r = await call('counts.open', asked); toast(t('saved'), 'ok'); loadList(r.count.count_id); }
    catch (e) { toast(errText(e), 'err'); }
  }

  async function show(id) {
    let res;
    try { res = await call('counts.get', { count_id: id }); } catch (e) { toast(errText(e), 'err'); return; }
    const c = res.count;
    const open = c.status === 'open';
    const editable = open && Data.canStore(c.store);
    const prices = Data.can('see_prices');
    // one row per item: theory and counted shown in the storekeeper's unit; typed in any unit of the item
    const rows = res.lines.map((l) => {
      const it = Data.items.get(l.item_id) || { item_id: l.item_id, name: l.item_id, unit: '' };
      const units = Data.unitsOf(it).length ? Data.unitsOf(it) : [it.unit];
      const show = it.store_unit && units.includes(String(it.store_unit).toUpperCase()) ? String(it.store_unit).toUpperCase() : it.unit;
      const f = (u) => Data.factorOf(it, u) || 1;
      const counted = l.counted_qty === '' || l.counted_qty === null || l.counted_qty === undefined ? '' : Number(l.counted_qty);
      const inp = h('input.input.num.count-qty', { type: 'number', min: 0, step: 'any', value: counted === '' ? '' : r6(counted / f(show)), disabled: !editable });
      const sel = h('select.input.count-unit', { disabled: !editable }, units.map((u) => h('option', { value: u }, u)));
      sel.value = show;
      const diffCell = h('td.num'), valueCell = h('td.num');
      const row = { l, it, inp, sel, f, base: () => (inp.value === '' ? '' : r6(Number(inp.value) * f(sel.value))) };
      row.paint = () => {
        const b = row.base();
        const d = b === '' ? '' : r6(b - Number(l.theory_qty));
        diffCell.textContent = d === '' ? '' : (d > 0 ? '+' : '') + fmtNum(r6(d / f(sel.value))) + ' ' + sel.value;
        diffCell.className = 'num' + (d < 0 ? ' qty-neg' : d > 0 ? ' qty-pos' : '');
        valueCell.textContent = d === '' || l.price === '' || l.price === undefined ? '' : money(d * Number(l.price));
      };
      row.dirty = false;
      inp.addEventListener('input', () => { row.dirty = true; row.paint(); });
      sel.addEventListener('change', () => {
        // the typed quantity keeps its meaning: 7 BOX shown as 84 PC
        if (inp.value !== '') inp.value = String(r6(Number(inp.value) * f(row.lastUnit || show) / f(sel.value)));
        row.lastUnit = sel.value; row.paint();
      });
      row.lastUnit = show;
      row.tr = h('tr', h('td.wrap', h('bdi', it.name)), h('td.num', fmtNum(r6(Number(l.theory_qty) / f(show))) + ' ' + show),
        h('td', h('div.count-in', inp, sel)), diffCell, prices ? valueCell : null);
      row.paint();
      return row;
    });
    const search = trackFilled(h('input.input', { type: 'search', placeholder: t('lookup_hint') }));
    const onlyDiff = h('input', { type: 'checkbox' });
    const body = h('tbody');
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      body.replaceChildren(...rows.filter((r) => (!q || r.it.name.toLowerCase().includes(q)) &&
        (!onlyDiff.checked || (r.base() !== '' && r6(r.base() - Number(r.l.theory_qty)) !== 0))).map((r) => r.tr));
    };
    search.addEventListener('input', draw);
    onlyDiff.addEventListener('change', draw);
    draw();
    const counted = () => rows.filter((r) => r.base() !== '').length;
    const status = h('p.form-status', t('count_progress', { n: counted(), total: rows.length }));

    async function save(silent) {
      const lines = rows.filter((r) => r.dirty).map((r) => ({ item_id: r.l.item_id, counted_qty: r.inp.value === '' ? '' : Number(r.inp.value), unit: r.sel.value }));
      if (!lines.length) { if (!silent) toast(t('nothing_changed')); return true; }
      try {
        await call('counts.save', { count_id: c.count_id, lines });
        rows.forEach((r) => { if (r.dirty) { r.l.counted_qty = r.base(); r.dirty = false; } });
        status.textContent = t('count_progress', { n: counted(), total: rows.length });
        if (!silent) toast(t('saved'), 'ok');
        return true;
      } catch (e) { toast(errText(e), 'err'); return false; }
    }
    async function approve() {
      if (!(await save(true))) return;
      const diffs = rows.filter((r) => r.base() !== '' && r6(r.base() - Number(r.l.theory_qty)) !== 0).length;
      const go = await dialog((close) => [h('h3', t('approve_count'), ': ', c.count_id),
        h('p', t('approve_count_help', { n: diffs, c: counted(), total: rows.length })),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn.danger', { type: 'button', onclick: () => close(true) }, t('approve_count')))]);
      if (!go) return;
      try { const r = await call('counts.approve', { count_id: c.count_id }); await Data.refresh(); toast(t('count_approved', { n: r.adjustments }), 'ok'); loadList(c.count_id); }
      catch (e) { toast(errText(e), 'err'); }
    }
    async function cancel() {
      const go = await dialog((close) => [h('h3', t('cancel_count')), h('p', t('cancel_count_help')),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('back')), h('button.btn.danger', { type: 'button', onclick: () => close(true) }, t('cancel_count')))]);
      if (!go) return;
      try { await call('counts.cancel', { count_id: c.count_id }); toast(t('saved'), 'ok'); detail.replaceChildren(); loadList(); }
      catch (e) { toast(errText(e), 'err'); }
    }
    // the count report: theoretical, counted, correction (and its value), in the storekeeper's unit
    const report = () => {
      const columns = [{ label: 'Item', type: 't' }, { label: 'Unit', type: 't' }, { label: 'Theoretical', type: 'n' }, { label: 'Counted', type: 'n' },
        { label: 'Correction', type: 'n' }, ...(prices ? [{ label: 'Value', type: 'm' }] : [])];
      const out = rows.map((r) => {
        const u = r.sel.value, b = r.base();
        const d = b === '' ? '' : r6(b - Number(r.l.theory_qty));
        return [r.it.name, u, r6(Number(r.l.theory_qty) / r.f(u)), b === '' ? '' : r6(b / r.f(u)), d === '' ? '' : r6(d / r.f(u)),
          ...(prices ? [d === '' || r.l.price === '' ? '' : Math.round(d * Number(r.l.price) * 100) / 100] : [])];
      });
      return { title: 'Stock Count ' + c.count_id, subtitle: t('store_' + c.store) + ' · ' + c.period + ' · ' + c.date, columns, rows: out, company: 'ALAKER SWEETS' };
    };
    const excel = () => {
      const blob = reportToXlsx(report());
      const a = h('a', { href: URL.createObjectURL(blob), download: 'Stock count ' + c.count_id + '_' + c.date + '.xlsx' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    const pdf = () => {
      const rep = report();
      const area = h('div#print-area', { dir: 'ltr' }, h('div.pr-company', 'ALAKER SWEETS'), h('div.pr-sub', 'Inventory Management System'),
        h('div.pr-title', rep.title), h('div.pr-meta', h('b', rep.subtitle), h('span', 'Printed: ' + new Date().toLocaleString('en-GB'))),
        h('table.pr-table', h('thead', h('tr', rep.columns.map((col) => h('th', col.label)))),
          h('tbody', rep.rows.map((r) => h('tr', r.map((v, i) => h('td', { class: rep.columns[i].type === 't' ? '' : 'num' },
            v === '' ? '' : rep.columns[i].type === 'm' ? money(v) : rep.columns[i].type === 'n' ? fmtNum(v) : String(v))))))),
        h('div.pr-count', 'Number of items: ' + rep.rows.length));
      document.body.append(area);
      const done = () => { area.remove(); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      window.print();
    };

    detail.replaceChildren(h('div.card',
      h('h2', t('count'), ' ', c.count_id, ' ', storePill(c.store), ' ', h('span.muted', fmtDate(c.date) + ' · ' + t('period_' + c.period) + ' · ' + t('count_st_' + c.status))),
      h('div.search', search), h('label.check', onlyDiff, ' ', t('only_differences')),
      h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('theoretical')), h('th', t('counted')), h('th', t('correction')),
        prices ? h('th', t('value')) : null)), body)),
      status,
      h('div.form-actions',
        editable ? h('button.btn', { type: 'button', onclick: () => save(false) }, t('save')) : null,
        open && canApprove ? h('button.btn.danger', { type: 'button', onclick: approve }, t('approve_count')) : null,
        open && canApprove ? h('button.btn.secondary', { type: 'button', onclick: cancel }, t('cancel_count')) : null,
        h('button.btn.secondary', { type: 'button', onclick: pdf }, t('save_pdf')),
        h('button.btn.secondary', { type: 'button', onclick: excel }, t('save_excel')))));
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  root.replaceChildren(h('div.card', h('h2', t('counts')),
    canOpen ? h('div.form-actions', h('button.btn', { type: 'button', onclick: newCount }, '+ ' + t('new_count'))) : null,
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', 'ID'), h('th', t('count_date')), h('th', t('store')), h('th', t('count_period')), h('th', ''))), list))),
    detail);
  loadList();
}
