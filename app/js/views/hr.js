// The employees' requests to HR: every user asks for themselves (a leave, a document or certificate) and
// follows their requests; the head of a department sees their department's requests (information only);
// HR answers them. The server checks who may do what; the screen only shows it.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtDate, trackFilled } from '../ui.js';
import { field, newId } from '../components.js';

const LEAVE_TYPES = ['annual', 'emergency', 'sick', 'unpaid'];
const DOC_TYPES = ['work_cert', 'salary_cert', 'experience_cert', 'to_whom', 'resignation', 'sponsor_transfer', 'secondment', 'promotion', 'other'];
// a certificate or a copy is made ready; a leave or a request (resignation, transfer…) is approved
const PAPERS = ['work_cert', 'salary_cert', 'experience_cert', 'to_whom'];
const ST_CLASS = { pending: 'soon', approved: 'in', ready: 'in', rejected: 'out', cancelled: 'low' };
let tab = 'new';
let hrTab = 'pending';

const typeName = (r) => (r.kind === 'advance' ? t('hr_advance') : t((r.kind === 'leave' ? 'hr_lt_' : 'hr_dt_') + r.type));
const stamp = (iso) => (iso ? fmtDate(String(iso).slice(0, 10)) + ' ' + String(iso).slice(11, 16) : '');

export function render(root) {
  const decide = Data.can('hr.decide');
  const head = !decide && Data.can('hr.seen') && ((Data.user || {}).depts || []).length > 0;
  const tabs = [['new', 'hr_tab_new'], ['mine', 'hr_tab_mine']].concat(head ? [['dept', 'hr_tab_dept']] : []).concat(decide ? [['hr', 'hr_tab_hr']] : []);
  if (!tabs.some(([k]) => k === tab)) tab = 'new';
  const box = h('div');
  const bar = h('div.tabs', tabs.map(([k, label]) => h('button', { type: 'button', class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, t(label))));
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('hr')), bar), box));

  function draw() {
    bar.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', tabs[i][0] === tab));
    if (tab === 'new') newForm();
    else if (tab === 'mine') listOf('hr.mine', {}, 'mine');
    else if (tab === 'dept') listOf('hr.list', {}, 'dept');
    else hrList();
  }

  // ---------- a new request
  function newForm() {
    let kind = 'leave';
    const kindBar = h('div.tabs.hr-kind');
    const type = h('select.input#hr-type');
    const from = trackFilled(h('input.input#hr-from', { type: 'date', min: Data.todayIso() }));
    const to = trackFilled(h('input.input#hr-to', { type: 'date', min: Data.todayIso() }));
    const days = h('p.muted.hr-days', '');
    const to2 = trackFilled(h('input.input#hr-addr', { placeholder: t('hr_addressed_ph') }));
    const reason = trackFilled(h('textarea.input#hr-reason', { rows: 3, maxlength: 500 }));
    const status = h('p.form-status', '');
    const leaveBox = h('div.form-grid', field(t('hr_from'), from), field(t('hr_to'), to), days);
    const docBox = h('div.form-grid', field(t('hr_addressed'), to2, { wide: true }));
    const amount = trackFilled(h('input.input.num#hr-amount', { type: 'number', min: 0, step: 'any', inputmode: 'decimal' }));
    const advBox = h('div.form-grid', field(t('hr_amount'), amount), h('small.muted.hr-adv-note', t('hr_advance_note')));
    const typeField = h('div.form-grid', field(t('hr_type'), type, { wide: true }));
    const showDays = () => {
      const n = from.value && to.value && to.value >= from.value ? Math.round((Date.parse(to.value) - Date.parse(from.value)) / 864e5) + 1 : 0;
      days.textContent = n ? t('hr_days_n', { n }) : '';
    };
    from.addEventListener('change', () => { if (!to.value || to.value < from.value) to.value = from.value; to.min = from.value; showDays(); });
    to.addEventListener('change', showDays);
    const setKind = (k) => {
      kind = k;
      kindBar.replaceChildren(...[['leave', 'hr_kind_leave'], ['doc', 'hr_kind_doc'], ['advance', 'hr_kind_advance']].map(([v, l]) => h('button', { type: 'button', class: kind === v ? 'on' : '', onclick: () => setKind(v) }, t(l))));
      type.replaceChildren(...(kind === 'leave' ? LEAVE_TYPES.map((v) => h('option', { value: v }, t('hr_lt_' + v))) : kind === 'advance' ? [h('option', { value: 'advance' }, t('hr_advance'))] : DOC_TYPES.map((v) => h('option', { value: v }, t('hr_dt_' + v)))));
      leaveBox.hidden = kind !== 'leave';
      docBox.hidden = kind !== 'doc';
      advBox.hidden = kind !== 'advance';
      typeField.hidden = kind === 'advance';
    };
    setKind('leave');
    const send = h('button.btn.save-btn#hr-send', { type: 'button', onclick: async () => {
      status.textContent = '';
      if (kind === 'leave' && (!from.value || !to.value)) { flash(from.value ? to : from); return; }
      if (kind === 'advance' && !(Number(amount.value) > 0)) { flash(amount); amount.focus(); return; }
      if (kind === 'doc' && type.value === 'other' && !reason.value.trim()) { flash(reason); status.textContent = t('err.hr_reason_required'); status.className = 'form-status warn'; return; }
      send.disabled = true;
      try {
        await call('hr.create', { kind, type: type.value, date_from: from.value, date_to: to.value, addressed_to: to2.value, amount: amount.value, reason: reason.value, client_id: newId() });
        toast(t('hr_sent'), 'ok');
        tab = 'mine'; draw();
      } catch (e) { status.textContent = errText(e); status.className = 'form-status err'; send.disabled = false; }
    } }, t('hr_send'));
    const dept = ((Data.user || {}).depts || [])[0];
    box.replaceChildren(h('div.hr-form', kindBar,
      typeField, leaveBox, docBox, advBox,
      field(t('hr_reason'), reason, { wide: true }),
      h('small.muted', t(dept ? 'hr_new_help' : 'hr_new_help_nodept', { d: dept ? (Data.parties.get(dept) || {}).name || '' : '' })),
      status, h('div.form-actions', send)));
  }

  // ---------- a request as a card
  function card(r, mode) {
    const lines = [h('div.hr-head', h('b', typeName(r)), h('span', { class: 'pill ' + (ST_CLASS[r.status] || '') }, t('hr_st_' + r.status)), h('small.muted.num', r.request_id))];
    if (mode !== 'mine') lines.push(h('div', h('b', h('bdi', r.user_name)), r.dept_name ? h('span.muted', ' · ', h('bdi', r.dept_name)) : ''));
    if (r.kind === 'leave') lines.push(h('div', t('hr_period', { a: fmtDate(r.date_from), b: fmtDate(r.date_to), n: r.days })));
    if (r.kind === 'advance') lines.push(h('div', h('b', t('hr_amount') + ': '), h('bdi.num', String(r.amount) + ' QR')));
    if (r.addressed_to) lines.push(h('div', t('hr_addressed') + ': ', h('bdi', r.addressed_to)));
    if (r.reason) lines.push(h('div.muted', h('bdi', r.reason)));
    lines.push(h('small.muted', t('hr_asked_at', { t: stamp(r.created_at) })));
    if (r.status !== 'pending' && r.status !== 'cancelled') lines.push(h('div.hr-answer', h('b', t('hr_answer') + ': '), t('hr_st_' + r.status),
      r.decision_note ? h('span', ' – ', h('bdi', r.decision_note)) : '', h('small.muted', ' · ', h('bdi', r.decided_name || ''), ' ', stamp(r.decided_at))));
    const act = h('div.form-actions');
    if (mode === 'mine' && r.status === 'pending') act.append(h('button.btn.secondary', { type: 'button', onclick: async (e) => {
      e.target.disabled = true;
      try { await call('hr.cancel', { request_id: r.request_id }); toast(t('hr_cancelled'), 'ok'); draw(); } catch (er) { toast(errText(er), 'err'); e.target.disabled = false; }
    } }, t('hr_cancel')));
    if (mode === 'hr' && r.status === 'pending') {
      const note = trackFilled(h('input.input', { placeholder: t('hr_note_ph') }));
      const answer = (st) => async (e) => {
        if (st === 'rejected' && !note.value.trim()) { flash(note); toast(t('err.hr_note_required'), 'err'); return; }
        e.target.disabled = true;
        try { await call('hr.decide', { request_id: r.request_id, status: st, note: note.value }); toast(t('saved'), 'ok'); Data.refresh().catch(() => {}); draw(); }
        catch (er) { toast(errText(er), 'err'); e.target.disabled = false; }
      };
      const paper = r.kind === 'doc' && PAPERS.includes(r.type);
      act.append(note, h('button.btn', { type: 'button', onclick: answer(paper ? 'ready' : 'approved') }, t(paper ? 'hr_ready' : 'hr_approve')),
        r.type === 'other' ? h('button.btn.secondary', { type: 'button', onclick: answer('ready') }, t('hr_ready')) : '',
        h('button.btn.danger', { type: 'button', onclick: answer('rejected') }, t('hr_reject')));
    }
    return h('div.hr-card', { class: 'hr-' + r.status }, lines, act.children.length ? act : '');
  }

  async function listOf(action, p, mode, holder) {
    const out = holder || box;
    out.replaceChildren(h('p.empty', '…'));
    try {
      const rows = await call(action, p);
      out.replaceChildren(...(rows.length ? rows.map((r) => card(r, mode)) : [h('p.empty', t(mode === 'mine' ? 'hr_none_mine' : 'hr_none'))]));
      if (mode === 'dept') out.prepend(h('small.muted', t('hr_dept_help')));
    } catch (e) { out.replaceChildren(h('p.empty', errText(e))); }
  }

  function hrList() {
    const inner = h('div');
    const sub = h('div.tabs.hr-sub', [['pending', 'hr_pending'], ['done', 'hr_done']].map(([k, l]) => h('button', { type: 'button', class: hrTab === k ? 'on' : '',
      onclick: () => { hrTab = k; hrList(); } }, t(l))));
    box.replaceChildren(sub, inner);
    listOf('hr.list', { status: hrTab }, 'hr', inner);
  }

  draw();
}
