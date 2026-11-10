// The production batch and traceability record (server/BatchRec.gs), the food safety officer's report.
// The list of the productions of a period with their batch numbers; a batch opens its record, worked out from
// the data (the materials and the receipts they came from); the officer adds the shift, the times, the checks
// and the notes, and prints it in the layout of the company's form.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, fmtDate, fmtNum } from '../ui.js';
import { field } from '../components.js';

const CHECKS = ['raw_state', 'fefo', 'process_log', 'final_qty', 'labelling', 'storage'];
const TRACE = ['product_batch', 'batch_record', 'record_materials', 'materials_supplier', 'batch_packaging'];
let period = 'week';

const iso = (d) => d.toISOString().slice(0, 10);
const back = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return iso(d); };
const itemName = (x) => (document.documentElement.lang === 'ar' && x.name_ar ? x.name_ar : x.name);

export async function render(root) {
  const box = h('div');
  const canEdit = Data.can('batches.save');
  const chips = h('div.ex-periods', ['today', 'week', 'month'].map((k) => h('button', { type: 'button', class: k === period ? 'on' : '',
    onclick: () => { period = k; [...chips.children].forEach((b, i) => b.classList.toggle('on', ['today', 'week', 'month'][i] === k)); list(); } }, t('ex_p_' + k))));

  async function list() {
    const today = Data.todayIso();
    const from = period === 'today' ? today : period === 'week' ? back(today, 6) : today.slice(0, 8) + '01';
    box.replaceChildren(h('p.muted', t('loading')));
    try {
      const rows = await call('batches.list', { from, to: today });
      box.replaceChildren(rows.length ? h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('bt_batch')), h('th', t('date')), h('th', t('product')),
        h('th', t('qty')), h('th', t('bt_made_by')), h('th', ''))),
        h('tbody', rows.map((r) => h('tr.click', { onclick: () => open(r.batch_no) }, h('td.num', h('b', r.batch_no)), h('td.num', fmtDate(r.date)),
          h('td.wrap', h('bdi', Data.nameOf(Data.items.get(r.item_id) || { name: r.item_id }))), h('td.num', fmtNum(r.qty) + ' ' + r.unit),
          h('td', h('bdi', r.made_by)), h('td', r.status === 'prepared' ? h('span.pill.in', t('bt_prepared')) : h('span.pill.soon', t('bt_to_prepare'))))))))
        : h('p.empty', t('bt_none')));
    } catch (e) { box.replaceChildren(h('p.empty', errText(e))); }
  }

  async function open(no) {
    box.replaceChildren(h('p.muted', t('loading')));
    let r;
    try { r = await call('batches.get', { batch_no: no }); } catch (e) { box.replaceChildren(h('p.empty', errText(e))); return; }
    const dis = !canEdit;
    const shift = h('select.input', { disabled: dis }, h('option', { value: '' }, '—'), ['morning', 'evening', 'night'].map((s) => h('option', { value: s }, t('bt_shift_' + s))));
    shift.value = r.shift;
    const start = h('input.input', { type: 'time', value: r.start_time, disabled: dis });
    const end = h('input.input', { type: 'time', value: r.end_time, disabled: dis });
    const notes = h('textarea.input', { rows: 2, disabled: dis }, r.notes || '');
    const ticks = {};
    const tick = (key) => {
      const c = r.checks[key] || {};
      const ok = h('input', { type: 'checkbox', checked: c.ok === true, disabled: dis });
      const note = h('input.input.small', { type: 'text', value: c.note || '', maxlength: 200, disabled: dis, placeholder: t('note') });
      ticks[key] = { ok, note };
      return { ok, note };
    };
    const lotsText = (l) => l.lots.map((x) => x.lot || '—').join(' · ');
    const firstOf = (l, f) => l.lots.map((x) => x[f] ? fmtDate(x[f]) : '—').join(' · ');
    const suppliers = (l) => [...new Set(l.lots.map((x) => x.supplier).filter(Boolean))].join('، ');
    const matRows = (ls, pack) => ls.map((l, i) => {
      const k = tick('m_' + l.item_id);
      return h('tr', h('td.num', String(i + 1)), h('td.wrap', h('bdi', itemName(l))), h('td.wrap', h('bdi', suppliers(l) || '—')), h('td.num', lotsText(l) || '—'),
        h('td.num', fmtNum(l.qty) + ' ' + l.unit), pack ? null : h('td.num', firstOf(l, 'received')), pack ? null : h('td.num', firstOf(l, 'expiry')), h('td', k.ok));
    });
    const status = r.traced ? t('bt_match') : t('bt_incomplete');
    const view = h('div.card.batch',
      h('div.card-head', h('button.btn.secondary.small', { type: 'button', onclick: list }, '← ' + t('bt_list')), h('h2', r.batch_no),
        h('button.btn.secondary.small', { type: 'button', onclick: () => print(r) }, '⎙ ' + t('print'))),
      h('div.form-grid', field(t('product'), h('input.input', { value: r.product_ar || r.product, disabled: true })), field(t('date'), h('input.input', { value: fmtDate(r.date), disabled: true })),
        field(t('qty'), h('input.input', { value: fmtNum(r.qty) + ' ' + r.unit, disabled: true })), field(t('bt_made_by'), h('input.input', { value: r.made_by, disabled: true })),
        field(t('bt_shift'), shift), field(t('bt_start'), start), field(t('bt_end'), end)),
      h('small.muted', r.source === 'recipe' ? t('bt_from_recipe') : t('bt_from_issues', { d: r.dept || '—' })),
      h('h3', t('bt_raw')),
      r.raw.length ? h('div.table-wrap', h('table', h('thead', h('tr', h('th', '#'), h('th', t('item')), h('th', t('bt_supplier')), h('th', t('bt_lot')), h('th', t('qty')),
        h('th', t('bt_received')), h('th', t('expiry')), h('th', t('bt_check')))), h('tbody', matRows(r.raw, false)))) : h('p.empty', t('bt_no_materials')),
      h('h3', t('bt_pack')),
      r.packaging.length ? h('div.table-wrap', h('table', h('thead', h('tr', h('th', '#'), h('th', t('item')), h('th', t('bt_supplier')), h('th', t('bt_lot')), h('th', t('qty')),
        h('th', t('bt_check')))), h('tbody', matRows(r.packaging, true)))) : h('p.empty', t('bt_no_materials')),
      h('h3', t('bt_checks')),
      h('div.table-wrap', h('table', h('tbody', CHECKS.map((c) => { const k = tick(c); return h('tr', h('td', t('bt_c_' + c)), h('td', k.ok), h('td', k.note)); })))),
      h('h3', t('bt_trace')),
      h('div.table-wrap', h('table', h('tbody', TRACE.map((c) => { const k = tick(c); return h('tr', h('td', t('bt_t_' + c)), h('td', h('span', { class: 'pill ' + (r.traced ? 'in' : 'low') }, status)), h('td', k.ok), h('td', k.note)); })))),
      field(t('note'), notes),
      r.prepared_at ? h('small.muted', t('bt_prepared_by', { u: r.prepared_by, d: fmtDate(r.prepared_at.slice(0, 10)) })) : null,
      canEdit ? h('div.form-actions', h('button.btn.save-btn', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        const checks = {};
        Object.keys(ticks).forEach((k) => { checks[k] = { ok: ticks[k].ok.checked, note: ticks[k].note.value.trim() }; });
        try { await call('batches.save', { batch_no: r.batch_no, shift: shift.value, start_time: start.value, end_time: end.value, checks, notes: notes.value.trim() }); toast(t('saved'), 'ok'); open(r.batch_no); }
        catch (ex) { toast(errText(ex), 'err'); btn.disabled = false; }
      } }, t('save'))) : null);
    box.replaceChildren(view);

    // the printed form: the company's layout, filled with what is on the screen now
    function print(rec) {
      const v = (k) => (ticks[k] && ticks[k].ok.checked ? '✓' : '');
      const n = (k) => (ticks[k] ? ticks[k].note.value.trim() : '');
      const shiftTxt = shift.value ? t('bt_shift_' + shift.value) : '';
      const tbl = (head, rows) => h('table.bt-t', h('thead', h('tr', head.map((x) => h('th', x)))), h('tbody', rows));
      const area = h('div#print-area.bt-print', { dir: 'rtl' },
        h('div.bt-title', h('div', 'مصنع حلويات العكر'), h('div', 'سجل تتبع الإنتاج والتشغيلات والمواد الخام'), h('div.bt-en', 'Production Batch & Product Traceability Record')),
        tbl([], [h('tr', h('th', 'اسم المنتج / Product Name'), h('td', rec.product_ar || rec.product), h('th', 'رقم التشغيلة / Batch No.'), h('td', rec.batch_no)),
          h('tr', h('th', 'تاريخ الإنتاج / Production Date'), h('td', fmtDate(rec.date)), h('th', 'الوردية / Shift'), h('td', shiftTxt)),
          h('tr', h('th', 'وقت بدء الإنتاج'), h('td', start.value), h('th', 'وقت انتهاء الإنتاج'), h('td', end.value)),
          h('tr', h('th', 'الكمية المنتجة'), h('td', fmtNum(rec.qty) + ' ' + rec.unit), h('th', 'مسؤول الإنتاج'), h('td', rec.made_by))]),
        h('h4', 'أولاً: المواد الخام المستخدمة في التشغيلة'),
        tbl(['م', 'اسم المادة الخام', 'المورد', 'رقم تشغيلة المادة', 'الكمية المستخدمة', 'تاريخ الاستلام', 'الصلاحية', 'التحقق'],
          rec.raw.map((l, i) => h('tr', h('td', String(i + 1)), h('td', itemName(l)), h('td', suppliers(l)), h('td', lotsText(l)), h('td', fmtNum(l.qty) + ' ' + l.unit),
            h('td', firstOf(l, 'received')), h('td', firstOf(l, 'expiry')), h('td', v('m_' + l.item_id))))),
        h('h4', 'ثانياً: مواد التعبئة والتغليف'),
        tbl(['م', 'نوع مادة التعبئة', 'المورد', 'رقم التشغيلة', 'الكمية المستخدمة', 'التحقق'],
          rec.packaging.map((l, i) => h('tr', h('td', String(i + 1)), h('td', itemName(l)), h('td', suppliers(l)), h('td', lotsText(l)), h('td', fmtNum(l.qty) + ' ' + l.unit), h('td', v('m_' + l.item_id))))),
        h('h4', 'ثالثاً: بيانات الإنتاج والتتبع'),
        tbl(['البيان', 'التحقق', 'ملاحظات'], CHECKS.map((c) => h('tr', h('td', t('bt_c_' + c)), h('td', v(c)), h('td', n(c))))),
        h('h4', 'رابعاً: اختبار تتبع المنتج Traceability Test'),
        tbl(['خطوة التتبع', 'الحالة', 'التحقق', 'ملاحظات'], TRACE.map((c) => h('tr', h('td', t('bt_t_' + c)), h('td', status), h('td', v(c)), h('td', n(c))))),
        h('h4', 'خامساً: نتيجة اختبار التتبع'),
        h('p', rec.traced ? 'تمكنت المنشأة من تتبع المنتج النهائي رقم التشغيلة ' + rec.batch_no + ' إلى المواد الخام ومواد التعبئة المستخدمة، وتحديد أرقام التشغيلات والموردين والسجلات ذات الصلة. النتيجة: مطابق.'
          : 'لم يكتمل تتبع المنتج النهائي رقم التشغيلة ' + rec.batch_no + ' إلى كل مواده. النتيجة: غير مكتمل.'),
        notes.value.trim() ? h('p', 'ملاحظات: ' + notes.value.trim()) : null,
        h('h4', 'سادساً: الاعتماد والمراجعة'),
        tbl(['مراجعة', 'إعداد', 'اعتماد', 'التاريخ'], [h('tr', h('td', 'مشرف الإنتاج'), h('td', 'مسؤول الجودة وسلامة الغذاء'), h('td', 'مدير الإنتاج'), h('td', fmtDate(rec.date))),
          h('tr', h('td', 'التوقيع:'), h('td', 'التوقيع:'), h('td', 'التوقيع:'), h('td', ''))]));
      document.body.append(area);
      const done = () => { area.remove(); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      window.print();
    }
  }

  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('batches')), chips), h('small.muted', t('bt_help')), box));
  list();
}
