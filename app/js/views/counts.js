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
  const list = h('tbody', h('tr', h('td.empty', { colspan: 8 }, '…')));
  const detail = h('div');

  async function loadList(openId) {
    let res;
    try { res = await call('counts.list', {}); } catch (e) { toast(errText(e), 'err'); return; }
    const rows = res.counts;
    list.replaceChildren(...(rows.length ? rows.map((c) => h('tr.click', { onclick: () => show(c.count_id) },
      h('td.num', c.count_id), h('td.num', fmtDate(c.date)), h('td', storePill(c.store)), h('td', t('period_' + c.period)),
      h('td.num', h('bdi', { dir: 'ltr' }, fmtNum(c.counted) + ' / ' + fmtNum(c.items))), h('td.num', c.status === 'approved' ? fmtNum(c.corrected) : ''),
      h('td', h('span', { class: 'pill ' + (c.status === 'open' ? 'soon' : c.status === 'approved' ? 'in' : 'out') }, t('count_st_' + c.status))),
      h('td', h('button.btn.small', { type: 'button', onclick: (e) => { e.stopPropagation(); show(c.count_id); } }, t(c.status === 'open' ? 'open_it' : 'view')))))
      : [h('tr', h('td.empty', { colspan: 8 }, t('no_counts')))]));
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
      const exp = h('input.input.count-exp', { type: 'date', value: l.counted_expiry || '', disabled: !editable, title: t('expiry_on_shelf') });
      const row = { l, it, inp, sel, f, base: () => (inp.value === '' ? '' : r6(Number(inp.value) * f(sel.value))) };
      row.paint = () => {
        const b = row.base();
        const d = b === '' ? '' : r6(b - Number(l.theory_qty));
        diffCell.textContent = d === '' ? '' : (d > 0 ? '+' : '') + fmtNum(r6(d / f(sel.value))) + ' ' + sel.value;
        diffCell.className = 'num' + (d < 0 ? ' qty-neg' : d > 0 ? ' qty-pos' : '');
        valueCell.textContent = d === '' || l.price === '' || l.price === undefined ? '' : money(d * Number(l.price));
      };
      row.dirty = false;
      row.exp = exp;
      const markEl = h('span.count-mark');
      row.saved = () => String(l.counted_qty === undefined ? '' : l.counted_qty) !== '' || !!l.counted_expiry;
      row.state = () => {
        markEl.className = 'count-mark' + (row.dirty ? ' unsaved' : row.saved() ? ' saved' : '');
        markEl.textContent = row.dirty ? '●' : row.saved() ? '✓' : '';
        markEl.title = row.dirty ? t('count_unsaved') : row.saved() ? t('count_saved') : '';
      };
      const expCell = h('td', h('div.count-exp-cell', h('small.muted', l.theory_expiry ? fmtDate(l.theory_expiry) : '—'), exp));
      const paintExp = () => { expCell.classList.toggle('exp-changed', !!exp.value && exp.value !== String(l.theory_expiry || '')); row.mark && row.mark(); };
      paintExp();
      exp.addEventListener('change', () => { row.dirty = true; paintExp(); row.state(); refresh(); });
      inp.addEventListener('input', () => { row.dirty = true; row.paint(); row.state(); refresh(); });
      sel.addEventListener('change', () => {
        // the typed quantity keeps its meaning: 7 BOX shown as 84 PC
        if (inp.value !== '') inp.value = String(r6(Number(inp.value) * f(row.lastUnit || show) / f(sel.value)));
        row.lastUnit = sel.value; row.paint();
      });
      row.lastUnit = show;
      row.tr = h('tr', h('td.wrap', markEl, h('bdi', it.name)), h('td.num', fmtNum(r6(Number(l.theory_qty) / f(show))) + ' ' + show),
        h('td', h('div.count-in', inp, sel)), diffCell, prices ? valueCell : null, expCell);
      // a line with a correction (quantity or expiry) stands out
      row.mark = () => {
        const b = row.base();
        const q = b !== '' && r6(b - Number(l.theory_qty)) !== 0;
        const e = !!exp.value && exp.value !== String(l.theory_expiry || '');
        row.tr.classList.toggle('count-diff', q || e);
      };
      const paint0 = row.paint;
      row.paint = () => { paint0(); row.mark(); };
      row.paint();
      paintExp();
      row.state();
      return row;
    });
    const search = trackFilled(h('input.input', { type: 'search', placeholder: t('lookup_hint') }));
    const filter = h('select.input.count-filter', ['all', 'saved', 'uncounted', 'diff', 'unsaved'].map((k) => h('option', { value: k }, t('cf_' + k))));
    const isDiff = (r) => (r.base() !== '' && r6(r.base() - Number(r.l.theory_qty)) !== 0) || (r.exp.value && r.exp.value !== String(r.l.theory_expiry || ''));
    const keep = { all: () => true, saved: (r) => r.saved(), uncounted: (r) => !r.saved() && !r.dirty, diff: isDiff, unsaved: (r) => r.dirty };
    const body = h('tbody');
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      body.replaceChildren(...rows.filter((r) => (!q || r.it.name.toLowerCase().includes(q)) && keep[filter.value](r)).map((r) => r.tr));
    };
    search.addEventListener('input', draw);
    filter.addEventListener('change', draw);
    draw();
    const counted = () => rows.filter((r) => r.saved()).length;
    const status = h('p.form-status');
    // progress: saved / all, and how many changes are still waiting for "Save"
    function refresh() {
      const waiting = rows.filter((r) => r.dirty).length;
      status.replaceChildren(t('count_progress', { n: counted(), total: rows.length }),
        waiting ? h('b.count-waiting', ' ' + t('count_waiting', { n: waiting })) : '');
    }
    refresh();
    // closing the page with changes not saved asks first
    const leaving = (e) => { if (rows.some((r) => r.dirty)) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', leaving);
    window.addEventListener('hashchange', () => window.removeEventListener('beforeunload', leaving), { once: true });

    async function save(silent) {
      const lines = rows.filter((r) => r.dirty).map((r) => ({ item_id: r.l.item_id, counted_qty: r.inp.value === '' ? '' : Number(r.inp.value), unit: r.sel.value,
        counted_expiry: r.exp.value || '' }));
      if (!lines.length) { if (!silent) toast(t('nothing_changed')); return true; }
      try {
        await call('counts.save', { count_id: c.count_id, lines });
        rows.forEach((r) => { if (r.dirty) { r.l.counted_qty = r.base(); r.l.counted_expiry = r.exp.value || ''; r.dirty = false; r.state(); } });
        refresh();
        draw();
        if (!silent) toast(t('saved'), 'ok');
        return true;
      } catch (e) { toast(errText(e), 'err'); return false; }
    }
    async function approve() {
      if (!(await save(true))) return;
      const diffs = rows.filter((r) => r.base() !== '' && r6(r.base() - Number(r.l.theory_qty)) !== 0).length;
      const exps = rows.filter((r) => r.exp.value && r.exp.value !== String(r.l.theory_expiry || '')).length;
      const go = await dialog((close) => [h('h3', t('approve_count'), ': ', c.count_id),
        h('p', t('approve_count_help', { n: diffs, c: counted(), total: rows.length })),
        exps ? h('p', t('approve_count_expiry', { n: exps })) : null,
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn.danger', { type: 'button', onclick: () => close(true) }, t('approve_count')))]);
      if (!go) return;
      try { const r = await call('counts.approve', { count_id: c.count_id }); await Data.refresh(); toast(t('count_approved', { n: r.adjustments }) + (r.expiries ? ' · ' + t('count_expiries', { n: r.expiries }) : ''), 'ok'); loadList(c.count_id); }
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
        { label: 'Correction', type: 'n' }, ...(prices ? [{ label: 'Value', type: 'm' }] : []),
        { label: 'Expiry (books)', type: 'd' }, { label: 'Expiry (counted)', type: 'd' }];
      const out = rows.map((r) => {
        const u = r.sel.value, b = r.base();
        const d = b === '' ? '' : r6(b - Number(r.l.theory_qty));
        return [r.it.name, u, r6(Number(r.l.theory_qty) / r.f(u)), b === '' ? '' : r6(b / r.f(u)), d === '' ? '' : r6(d / r.f(u)),
          ...(prices ? [d === '' || r.l.price === '' ? '' : Math.round(d * Number(r.l.price) * 100) / 100] : []),
          r.l.theory_expiry || '', r.exp.value || ''];
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
            v === '' ? '' : rep.columns[i].type === 'm' ? money(v) : rep.columns[i].type === 'n' ? fmtNum(v) : rep.columns[i].type === 'd' ? fmtDate(v) : String(v))))))),
        h('div.pr-count', 'Number of items: ' + rep.rows.length));
      document.body.append(area);
      const done = () => { area.remove(); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      window.print();
    };

    detail.replaceChildren(h('div.card',
      h('h2', t('count'), ' ', c.count_id, ' ', storePill(c.store), ' ', h('span.muted', fmtDate(c.date) + ' · ' + t('period_' + c.period) + ' · ' + t('count_st_' + c.status))),
      h('div.count-tools', search, filter),
      h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', t('item')), h('th', t('theoretical')), h('th', t('counted')), h('th', t('correction')),
        prices ? h('th', t('value')) : null, h('th', t('expiry_books_shelf')))), body)),
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
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', 'ID'), h('th', t('count_date')), h('th', t('store')), h('th', t('count_period')), h('th', t('counted_items')), h('th', t('corrected_items')), h('th', ''), h('th', ''))), list))),
    detail);
  loadList();
}
