// Reports and sending: report cards in three groups, the options each report needs, a preview table,
// then PDF (formal print layout), Excel (formatted .xlsx) or WhatsApp. The preview clears after
// sending/saving and when switching report (as in MORO v8).
import { call } from '../api.js';
import { Data } from '../data.js';
import { MovStore } from '../movstore.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, fmtDate, trackFilled, dialog } from '../ui.js';
import { REPORTS, reportText } from '../reports.js';
import { reportToXlsx } from '../xlsx.js';

let selected = 'fast';
const state = {};        // options per report, kept while the app is open


function multiSelect(id, options, chosen) {
  const search = trackFilled(h('input.input#' + id + '-q', { type: 'search', placeholder: t('lookup_hint') }));
  const box = h('div.ms-list');
  const count = h('small.muted', '');
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const opts = options().filter((o) => !q || o.label.toLowerCase().includes(q));
    box.replaceChildren(...opts.slice(0, 500).map((o) => {
      const cb = h('input', { type: 'checkbox', checked: chosen.has(o.value) });
      cb.addEventListener('change', () => { cb.checked ? chosen.add(o.value) : chosen.delete(o.value); count.textContent = t('selected_n', { n: chosen.size }); });
      return h('label.ms-row', cb, h('bdi', o.label));
    }));
    count.textContent = t('selected_n', { n: chosen.size });
  };
  search.addEventListener('input', draw);
  const all = h('button.link', { type: 'button', onclick: () => { options().filter((o) => !search.value || o.label.toLowerCase().includes(search.value.toLowerCase())).forEach((o) => chosen.add(o.value)); draw(); } }, t('select_all'));
  const none = h('button.link', { type: 'button', onclick: () => { chosen.clear(); draw(); } }, t('select_none'));
  draw();
  return h('div.ms', search, box, h('div.ms-foot', count, all, none));
}

export function render(root) {
  const reports = REPORTS.filter((r) => !r.prices || Data.can('see_prices'));
  const cards = h('div.rep-cards');
  const opts = h('div.rep-opts');
  const preview = h('div.rep-preview');
  const status = h('p.form-status', '');
  let current = null;            // last built report

  const itemOpts = (cat) => () => Data.activeItems().filter((i) => !cat || i.category === cat).sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => ({ value: i.item_id, label: i.name }));
  const sectionOpts = () => [...Data.parties.values()].filter((p) => p.kind === 'section').sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.party_id, label: p.name }));

  function drawCards() {
    const groups = { stock: t('rep_group_stock'), move: t('rep_group_move'), other: t('rep_group_other') };
    cards.replaceChildren(...Object.keys(groups).map((g) => h('div.rep-group', h('div.rep-group-title', groups[g]),
      reports.filter((r) => r.group === g).map((r) => h('button.rep-card', { type: 'button', class: r.id === selected ? 'on' : '',
        onclick: () => { selected = r.id; clearPreview(); drawCards(); drawOpts(); } }, t('rep_' + r.id))))));
  }

  function opt(id) {
    if (!state[id]) {
      const today = Data.todayIso();
      state[id] = { from: today.slice(0, 8) + '01', to: today, mode: 'all', detail: 'summary', days: 90, zero: false, foodOnly: false,
        packOnly: false, items: new Set(), sections: new Set(), zone: 'Food', year: Number(today.slice(0, 4)),
        months: new Set([Number(today.slice(5, 7))]), period: 'monthly' };
    }
    return state[id];
  }

  function drawOpts() {
    const rep = reports.find((r) => r.id === selected);
    const p = opt(selected);
    const parts = [];
    const o = rep.opts;
    if (o.includes('dates')) {
      const from = trackFilled(h('input.input#rp-from', { type: 'date', value: p.from }));
      const to = trackFilled(h('input.input#rp-to', { type: 'date', value: p.to }));
      from.addEventListener('change', () => { p.from = from.value; });
      to.addEventListener('change', () => { p.to = to.value; });
      const quick = (days) => () => { const d = new Date(Data.todayIso() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - days); from.value = p.from = d.toISOString().slice(0, 10); to.value = p.to = Data.todayIso(); from.dispatchEvent(new Event('change')); };
      parts.push(h('div.form-grid', h('div.field', h('label', t('from')), from), h('div.field', h('label', t('to')), to)),
        h('div.quick', h('button.link', { type: 'button', onclick: quick(0) }, t('today')), h('button.link', { type: 'button', onclick: quick(6) }, t('last_7')),
          h('button.link', { type: 'button', onclick: quick(29) }, t('last_30')), h('button.link', { type: 'button', onclick: quick(364) }, t('last_year'))));
    }
    if (o.includes('days')) {
      const d = trackFilled(h('input.input.num#rp-days', { type: 'number', min: 1, value: p.days }));
      d.addEventListener('input', () => { p.days = Number(d.value) || 90; });
      parts.push(h('div.field', h('label', t('days_period')), d));
    }
    if (o.includes('mode')) {
      const tabs = h('div.tabs');
      ['all', 'in', 'out'].forEach((m) => tabs.append(h('button', { type: 'button', class: p.mode === m ? 'on' : '', onclick: () => { p.mode = m; drawOpts(); } }, t('mode_' + m))));
      parts.push(tabs);
    }
    if (o.includes('detail')) {
      const tabs = h('div.tabs');
      ['summary', 'detailed'].forEach((m) => tabs.append(h('button', { type: 'button', class: p.detail === m ? 'on' : '', onclick: () => { p.detail = m; drawOpts(); } }, t('detail_' + m))));
      parts.push(tabs);
    }
    if (o.includes('period')) {
      const tabs = h('div.tabs');
      ['weekly', 'monthly', 'yearly'].forEach((m) => tabs.append(h('button', { type: 'button', class: p.period === m ? 'on' : '', onclick: () => { p.period = m; drawOpts(); } }, t('period_' + m))));
      parts.push(tabs);
    }
    if (o.includes('foodPack')) {
      const f = h('input', { type: 'checkbox', checked: p.foodOnly }); const k = h('input', { type: 'checkbox', checked: p.packOnly });
      f.addEventListener('change', () => { p.foodOnly = f.checked; if (f.checked) { p.packOnly = false; k.checked = false; } });
      k.addEventListener('change', () => { p.packOnly = k.checked; if (k.checked) { p.foodOnly = false; f.checked = false; } });
      parts.push(h('label.check', f, ' ', t('food_only')), h('label.check', k, ' ', t('pack_only')));
    }
    if (o.includes('zero')) {
      const z = h('input', { type: 'checkbox', checked: p.zero });
      z.addEventListener('change', () => { p.zero = z.checked; });
      parts.push(h('label.check', z, ' ', t('show_zero')));
    }
    if (o.includes('year')) {
      const y = h('select.input#rp-year');
      const now = Number(Data.todayIso().slice(0, 4));
      for (let v = now - 3; v <= now + 1; v++) y.append(h('option', { value: v, selected: v === p.year }, v));
      y.addEventListener('change', () => { p.year = Number(y.value); });
      const months = h('div.months', Array.from({ length: 12 }, (_, i) => {
        const cb = h('input', { type: 'checkbox', checked: p.months.has(i + 1) });
        cb.addEventListener('change', () => { cb.checked ? p.months.add(i + 1) : p.months.delete(i + 1); });
        return h('label.check', cb, ' ', t('month_' + (i + 1)));
      }));
      parts.push(h('div.field', h('label', t('year')), y), months);
    }
    if (o.includes('list')) {
      const list = selected === 'fast' ? 'FAST' : 'SENSITIVE';
      parts.push(h('p.muted', t('list_count', { n: Data.list(list).size })));
      if (Data.can('lists.save')) parts.push(h('button.btn.secondary', { type: 'button', onclick: () => editList(list) }, t('edit_list')));
    }
    if (o.includes('sections')) parts.push(h('div.field', h('label', t('departments')), multiSelect('rp-sec', sectionOpts, p.sections)));
    if (o.includes('zoneItems')) {
      const tabs = h('div.tabs');
      ['Food', 'Packaging'].forEach((z) => tabs.append(h('button', { type: 'button', class: p.zone === z ? 'on' : '', onclick: () => { p.zone = z; p.items.clear(); drawOpts(); } }, t(z === 'Food' ? 'food' : 'packaging'))));
      parts.push(tabs, h('div.field', h('label', t('items')), multiSelect('rp-items', itemOpts(p.zone), p.items)));
    }
    if (o.includes('items') || o.includes('items?')) {
      parts.push(h('div.field', h('label', t(o.includes('items?') ? 'items_optional' : 'items')), multiSelect('rp-items', itemOpts(), p.items)));
    }
    opts.replaceChildren(h('h2', t('rep_' + selected)), ...parts,
      h('div.form-actions', h('button.btn.save-btn#rp-run', { type: 'button', onclick: run }, t('create_report'))), status);
  }

  async function editList(list) {
    const chosen = new Set(Data.list(list));
    const ok = await dialog((close) => [h('h3', t('edit_list')), multiSelect('dl', itemOpts(), chosen),
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')),
        h('button.btn', { type: 'button', onclick: async () => {
          try { await call('lists.save', { list, item_ids: [...chosen] }); await Data.refresh(); close(true); } catch (e) { toast(errText(e), 'err'); }
        } }, t('save')))]);
    if (ok) { toast(t('saved'), 'ok'); drawOpts(); }
  }

  async function run() {
    const rep = reports.find((r) => r.id === selected);
    const p = opt(selected);
    if ((rep.opts.includes('items') || rep.opts.includes('zoneItems')) && !p.items.size) { status.textContent = t('choose_items'); status.className = 'form-status warn'; return; }
    if (rep.opts.includes('sections') && !p.sections.size) { status.textContent = t('choose_departments'); status.className = 'form-status warn'; return; }
    if (rep.opts.includes('dates') && (!p.from || !p.to || p.from > p.to)) { status.textContent = t('dates_invalid'); status.className = 'form-status err'; return; }
    status.textContent = t('loading'); status.className = 'form-status';
    let movs = [];
    let note = '';
    try {
      if (!['fast', 'sensitive', 'min', 'expiry', 'near'].includes(selected)) {
        const res = await MovStore.all();
        movs = res.list;
        if (res.stale) note = '  ·  ' + t('offline_data', { at: new Date(res.at).toLocaleString('en-GB') });
        if (res.list.some((m) => m.pending)) note += '  ·  ' + t('includes_pending');
      }
    } catch (e) { status.textContent = errText(e); status.className = 'form-status err'; return; }
    current = rep.build(p, movs.filter((m) => m.status !== 'deleted'));
    status.textContent = t('report_rows', { n: current.rows.length }) + note; status.className = 'form-status ' + (note ? 'warn' : 'ok');
    drawPreview();
  }

  function cellText(v, type) {
    if (v === '' || v === null || v === undefined) return '';
    if (type === 'd') return fmtDate(v);
    if (type === 'p') return (Number(v) * 100).toFixed(1) + '%';
    if (type === 'm') return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (type === 'n') return fmtNum(v);
    return String(v);
  }

  function drawPreview() {
    if (!current) { preview.replaceChildren(h('p.empty', t('preview_empty'))); return; }
    const c = current;
    preview.replaceChildren(
      h('div.rep-head', h('b', c.title), h('span.muted', c.subtitle)),
      h('div.table-wrap.tall', h('table.rep-table', { dir: 'ltr' }, h('thead', h('tr', c.columns.map((col) => h('th', col.label)))),
        h('tbody', c.rows.length ? c.rows.map((r) => h('tr', r.map((v, i) => h('td', { class: ['n', 'm', 'p'].includes(c.columns[i].type) ? 'num' : '' }, cellText(v, c.columns[i].type))))) :
          h('tr', h('td.empty', { colspan: c.columns.length }, 'No data'))))),
      h('div.form-actions',
        h('button.btn', { type: 'button', onclick: pdf }, t('save_pdf')),
        h('button.btn', { type: 'button', onclick: excel }, t('save_excel')),
        h('button.btn.wa', { type: 'button', onclick: whatsapp }, t('send_whatsapp'))));
  }

  function clearPreview() { current = null; drawPreview(); status.textContent = ''; }

  const fileName = (ext) => current.title.replace(/[\\/:*?"<>|]/g, '-') + '_' + Data.todayIso() + '.' + ext;

  function excel() {
    const blob = reportToXlsx({ ...current, company: 'ALAKER SWEETS' });
    const a = h('a', { href: URL.createObjectURL(blob), download: fileName('xlsx') });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(t('excel_saved'), 'ok');
    clearPreview();
  }

  function pdf() {
    const c = current;
    const area = h('div#print-area', { dir: 'ltr' },
      h('div.pr-company', 'ALAKER SWEETS'), h('div.pr-sub', 'Inventory Management System'),
      h('div.pr-title', c.title),
      h('div.pr-meta', h('b', c.subtitle), h('span', 'Printed: ' + new Date().toLocaleString('en-GB'))),
      h('table.pr-table', h('thead', h('tr', c.columns.map((col) => h('th', col.label)))),
        h('tbody', c.rows.map((r) => h('tr', r.map((v, i) => h('td', { class: ['n', 'm', 'p'].includes(c.columns[i].type) ? 'num' : c.columns[i].type === 'd' ? 'ctr' : '' }, cellText(v, c.columns[i].type))))))),
      h('div.pr-count', 'Number of records: ' + c.rows.length),
      h('div.pr-note', 'This report was generated by MORO. To keep it as a file choose "Save as PDF" in the print window.'));
    document.body.append(area);
    document.title = fileName('pdf').replace(/\.pdf$/, '');
    const done = () => { area.remove(); document.title = 'MORO'; window.removeEventListener('afterprint', done); clearPreview(); };
    window.addEventListener('afterprint', done);
    window.print();
  }

  async function whatsapp() {
    const text = reportText(current, fmtNum, fmtDate);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch { /* not allowed */ }
    if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ text }); clearPreview(); return; } catch { /* cancelled */ }
    }
    // long reports do not fit in a link: the text is in the clipboard, WhatsApp opens to paste it
    const url = text.length <= 1800 ? 'https://wa.me/?text=' + encodeURIComponent(text) : 'https://web.whatsapp.com/';
    window.open(url, '_blank', 'noopener');
    toast(copied ? t('wa_copied') : t('wa_opened'), 'ok');
    clearPreview();
  }

  root.replaceChildren(h('div.rep-layout', h('div.card', h('h2', t('report_type')), cards), h('div.card', opts), h('div.card.rep-out', h('h2', t('preview')), preview)));
  drawCards();
  drawOpts();
  drawPreview();
}
