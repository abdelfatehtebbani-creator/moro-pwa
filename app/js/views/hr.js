// The employees' requests to HR: every user asks for themselves (a leave, a document or certificate) and
// follows their requests; the head of a department sees their department's requests (information only);
// HR answers them. Penalties: HR records one, or a head / food safety / production proposes it and HR issues it;
// the employee may object within 24 hours. The server checks who may do what; the screen only shows it.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtDate, trackFilled } from '../ui.js';
import { field, newId, combo } from '../components.js';
import { shrink, photoButton } from '../photos.js';

const LEAVE_TYPES = ['annual', 'emergency', 'sick', 'unpaid'];
const DOC_TYPES = ['work_cert', 'salary_cert', 'experience_cert', 'to_whom', 'resignation', 'sponsor_transfer', 'secondment', 'promotion', 'other'];
// a certificate or a copy is made ready; a leave or a request (resignation, transfer…) is approved
const PAPERS = ['work_cert', 'salary_cert', 'experience_cert', 'to_whom'];
const ST_CLASS = { pending: 'soon', approved: 'in', ready: 'in', rejected: 'out', cancelled: 'low' };
const PEN_CLASS = { proposed: 'soon', issued: 'out', objected: 'soon', kept: 'out', cancelled: 'low', dismissed: 'low' };
let tab = 'new';
let hrTab = 'pending';

const typeName = (r) => (r.kind === 'advance' ? t('hr_advance') : t((r.kind === 'leave' ? 'hr_lt_' : 'hr_dt_') + r.type));
const stamp = (iso) => (iso ? fmtDate(String(iso).slice(0, 10)) + ' ' + String(iso).slice(11, 16) : '');
const cats = () => { try { const l = JSON.parse((Data.settings || {}).pen_categories || 'null'); if (l && l.length) return l; } catch { /* the starting list */ } return t('pen_cats_default').split('|'); };
// a penalty that needs nothing more: kept, cancelled, not issued, or issued and past the 24 hours
const closed = (r) => ['kept', 'cancelled', 'dismissed'].includes(r.status) || (r.status === 'issued' && !r.can_object);

/** Opens the screen on a tab (the banners: a new penalty → My penalties, a request accepted → My requests). */
export function openTab(name) { tab = name; if (location.hash === '#/hr') window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = '#/hr'; }

export function render(root) {
  const decide = Data.can('hr.decide');
  const head = !decide && Data.can('hr.seen') && ((Data.user || {}).depts || []).length > 0;
  const penAll = decide || Data.can('hr.penalty_propose') || head;
  const tabs = [['new', 'hr_tab_new'], ['mine', 'hr_tab_mine'], ['penmine', 'pen_tab_mine']].concat(head ? [['dept', 'hr_tab_dept']] : []).concat(decide ? [['hr', 'hr_tab_hr']] : [])
    .concat(penAll ? [['pen', 'pen_tab']] : []);
  if (!tabs.some(([k]) => k === tab)) tab = 'new';
  const box = h('div');
  // the numbers on the tabs: what waits for this user there
  const cnt = (k) => { const c = (Data.boot || {}).hr_counts || {}; return Number({ mine: c.my_req_new, penmine: c.my_pen_new, hr: c.hr_pending, pen: c.pen_todo }[k]) || 0; };
  const bar = h('div.tabs.hr-tabs', tabs.map(([k, label]) => h('button', { type: 'button', class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, t(label),
    cnt(k) ? h('span.tab-badge', String(cnt(k))) : '')));
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('hr')), bar), box));

  function draw() {
    bar.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', tabs[i][0] === tab));
    if (tab === 'new') newForm();
    else if (tab === 'mine') { listOf('hr.mine', {}, 'mine'); seen('mine', 'hr.seenMine'); }
    else if (tab === 'dept') listOf('hr.list', {}, 'dept');
    else if (tab === 'penmine') { penList('pen.mine', 'mine'); seen('penmine', 'pen.seen'); }
    else if (tab === 'pen') penBoard();
    else hrList();
  }

  // opening the tab is seeing what is new there (no button): its number and the banner go
  function seen(k, action) {
    if (!cnt(k)) return;
    call(action, {}).then(() => Data.refresh()).then(() => {
      const b = bar.querySelectorAll('button')[tabs.findIndex((x) => x[0] === k)];
      const s = b && b.querySelector('.tab-badge'); if (s) s.remove();
      window.dispatchEvent(new Event('moro:hrseen'));
    }).catch(() => {});
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
      let rows = await call(action, p);
      // my requests: waiting first, then the approved / ready ones, then the refused and cancelled (newest first in each)
      if (mode === 'mine') { const rank = { pending: 0, approved: 1, ready: 1, rejected: 2, cancelled: 3 }; rows = rows.map((r, i) => [r, i]).sort((a, b) => ((rank[a[0].status] ?? 4) - (rank[b[0].status] ?? 4)) || (a[1] - b[1])).map((x) => x[0]); }
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

  // ---------- penalties
  function penCard(r, mode) {
    const lines = [h('div.hr-head', h('b', '⚠ ' + t('pen_one') + ' · ', h('bdi.num', String(r.amount) + ' QR')), h('span', { class: 'pill ' + (PEN_CLASS[r.status] || '') }, t('pen_st_' + r.status)), h('small.muted.num', r.penalty_id))];
    if (mode !== 'mine') lines.push(h('div', h('b', h('bdi', r.user_name)), r.dept_name ? h('span.muted', ' · ', h('bdi', r.dept_name)) : ''));
    lines.push(h('div', r.category ? h('span.pill.pen-cat', r.category) : '', ' ', t('pen_date') + ': ' + fmtDate(r.date)), h('div', h('bdi', r.reason)));
    const ph = photoButton(r.photos);
    if (ph) lines.push(h('div', ph));
    if (r.proposed_name && r.status === 'proposed') lines.push(h('small.muted', t('pen_proposed_by', { n: r.proposed_name, t: stamp(r.proposed_at) })));
    if (r.issued_at) lines.push(h('small.muted', t('pen_issued_at', { t: stamp(r.issued_at) }), r.issued_name ? ' · ' + r.issued_name : ''));
    if (r.objection) lines.push(h('div.hr-answer', h('b', t('pen_objection') + ': '), h('bdi', r.objection), h('small.muted', ' · ' + stamp(r.objected_at))));
    if (r.decision_note) lines.push(h('div.hr-answer', h('b', t('hr_answer') + ': '), h('bdi', r.decision_note), h('small.muted', ' · ', h('bdi', r.decided_name || ''), ' ', stamp(r.decided_at))));
    if (r.ack_at && mode !== 'mine') lines.push(h('small.muted', t('pen_acked', { t: stamp(r.ack_at) })));
    const act = h('div.form-actions');
    const go = async (e, action, p) => {
      e.target.disabled = true;
      try { await call(action, p); toast(t('saved'), 'ok'); Data.refresh().catch(() => {}); draw(); } catch (er) { toast(errText(er), 'err'); e.target.disabled = false; }
    };
    if (mode === 'mine' && r.can_object) {
      const text = trackFilled(h('input.input', { placeholder: t('pen_objection_ph') }));
      lines.push(h('small.pen-deadline', t('pen_object_until', { t: stamp(new Date(new Date(r.object_until).getTime() + 3 * 36e5).toISOString()) })));
      act.append(text, h('button.btn.danger', { type: 'button', onclick: (e) => { if (!text.value.trim()) { flash(text); return; } go(e, 'pen.respond', { penalty_id: r.penalty_id, object: true, text: text.value }); } }, t('pen_object')));
    }
    if (mode === 'hr') {
      const note = trackFilled(h('input.input', { placeholder: t('pen_note_ph') }));
      if (r.status === 'proposed') {
        const amt = h('input.input.num.pen-amt', { type: 'number', min: 0, step: 'any', value: r.amount, title: t('hr_amount') });
        const cat = h('select.input.pen-catsel', h('option', { value: '' }, t('pen_category_ph')), cats().map((c) => h('option', { value: c, selected: c === r.category }, c)));
        act.append(cat, amt, h('button.btn', { type: 'button', onclick: (e) => { if (!cat.value) { flash(cat); return; } go(e, 'pen.review', { penalty_id: r.penalty_id, issue: true, amount: amt.value, category: cat.value }); } }, t('pen_issue')),
          note, h('button.btn.secondary', { type: 'button', onclick: (e) => { if (!note.value.trim()) { flash(note); return; } go(e, 'pen.review', { penalty_id: r.penalty_id, issue: false, note: note.value }); } }, t('pen_dismiss')));
      } else if (r.status === 'objected') {
        act.append(note, h('button.btn', { type: 'button', onclick: (e) => { if (!note.value.trim()) { flash(note); return; } go(e, 'pen.decide', { penalty_id: r.penalty_id, keep: true, note: note.value }); } }, t('pen_keep')),
          h('button.btn.secondary', { type: 'button', onclick: (e) => { if (!note.value.trim()) { flash(note); return; } go(e, 'pen.decide', { penalty_id: r.penalty_id, keep: false, note: note.value }); } }, t('pen_cancel')));
      } else if (r.status === 'issued' || r.status === 'kept') {
        act.append(note, h('button.btn.secondary', { type: 'button', onclick: (e) => { if (!note.value.trim()) { flash(note); return; } go(e, 'pen.decide', { penalty_id: r.penalty_id, keep: false, note: note.value }); } }, t('pen_cancel')));
      }
    }
    return h('div.hr-card', { class: 'pen-' + r.status }, lines, act.children.length ? act : '');
  }

  async function penList(action, mode, holder) {
    const out = holder || box;
    out.replaceChildren(h('p.empty', '…'));
    try {
      let rows = await call(action, {});
      // what needs an answer first
      const rank = { proposed: 0, objected: 0, issued: 1, kept: 2, cancelled: 3, dismissed: 3 };
      rows = rows.map((r, i) => [r, i]).sort((a, b) => ((rank[a[0].status] ?? 4) - (rank[b[0].status] ?? 4)) || (a[1] - b[1])).map((x) => x[0]);
      if (mode === 'mine') {
        out.replaceChildren(h('small.muted', t('pen_mine_help')), ...(rows.length ? rows.map((r) => penCard(r, mode)) : [h('p.empty', t('pen_none_mine'))]));
        return;
      }
      const open = rows.filter((r) => !closed(r)), old = rows.filter(closed);
      out.replaceChildren(...(open.length ? open.map((r) => penCard(r, mode)) : [h('p.empty', t('pen_none_open'))]), old.length ? archive(old, mode) : '');
    } catch (e) { out.replaceChildren(h('p.empty', errText(e))); }
  }

  // the closed penalties, folded; found again by name, date, state or kind
  function archive(list, mode) {
    const q = trackFilled(h('input.input', { type: 'search', placeholder: t('pen_search_ph') }));
    const day = trackFilled(h('input.input.pen-day', { type: 'date' }));
    const st = h('select.input', h('option', { value: '' }, t('pen_all_states')), ['kept', 'cancelled', 'dismissed', 'issued'].map((s) => h('option', { value: s }, t('pen_st_' + s))));
    const cat = h('select.input', h('option', { value: '' }, t('pen_all_cats')), [...new Set(list.map((r) => r.category).filter(Boolean))].map((c) => h('option', { value: c }, c)));
    const res = h('div');
    const fill = () => {
      const s = q.value.trim().toLowerCase();
      const hits = list.filter((r) => (!s || [r.user_name, r.reason, r.penalty_id, r.dept_name].some((x) => String(x || '').toLowerCase().includes(s)))
        && (!day.value || r.date === day.value) && (!st.value || r.status === st.value) && (!cat.value || r.category === cat.value));
      res.replaceChildren(...(hits.length ? hits.slice(0, 100).map((r) => penCard(r, mode)) : [h('p.empty', t('no_rows'))]));
    };
    [q, day].forEach((x) => x.addEventListener('input', fill));
    [st, cat, day].forEach((x) => x.addEventListener('change', fill));
    const d = h('details.fam-box.pen-archive', h('summary', h('b', '🗄 ' + t('pen_archive', { n: list.length }))),
      h('div.search.pen-search', q, day, st, cat), res);
    d.addEventListener('toggle', () => { if (d.open && !res.children.length) fill(); });
    return d;
  }

  // HR: the kinds of penalty, one per line
  function catsBox() {
    const ta = h('textarea.input', { rows: 6 });
    ta.value = cats().join('\n');
    const save = h('button.btn', { type: 'button', onclick: async () => {
      save.disabled = true;
      try { await call('pen.setCategories', { list: ta.value.split('\n') }); await Data.refresh(); toast(t('saved'), 'ok'); } catch (e) { toast(errText(e), 'err'); }
      save.disabled = false;
    } }, t('save'));
    return h('details.fam-box', h('summary', h('b', '⚙ ' + t('pen_cats_title'))), h('small.muted', t('pen_cats_help')), ta, h('div.form-actions', save));
  }

  // HR / a proposer: record (HR) or propose a penalty, and the list
  function penBoard() {
    const inner = h('div');
    const canAdd = decide || Data.can('hr.penalty_propose');
    const parts = [];
    if (canAdd) {
      let people = [];
      const who = combo({ id: 'pen-who', placeholder: t('pen_who_ph'), options: () => people.map((p) => ({ value: p.user_id, label: p.name, hint: p.dept })) });
      call('pen.people', {}).then((l) => { people = l; }).catch(() => {});
      const date = trackFilled(h('input.input#pen-date', { type: 'date', value: Data.todayIso(), max: Data.todayIso() }));
      const amount = trackFilled(h('input.input.num#pen-amount', { type: 'number', min: 0, step: 'any', inputmode: 'decimal' }));
      const reason = trackFilled(h('textarea.input#pen-reason', { rows: 2, maxlength: 500, placeholder: t('pen_reason_ph') }));
      const cat = h('select.input#pen-cat', h('option', { value: '' }, t(decide ? 'pen_category_ph' : 'pen_category_opt')), cats().map((c) => h('option', { value: c }, c)));
      // a photo of it, when there is one (made small on the phone)
      let photo = '';
      const file = h('input#pen-photo', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
      const phLabel = h('span.muted', '');
      file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; try { photo = await shrink(f); phLabel.textContent = '✓ ' + t('pen_photo_ok'); } catch { photo = ''; toast(t('err.photo_invalid'), 'err'); } });
      const phBtn = h('div.field', h('label', t('pen_photo')), h('div', h('button.btn.secondary', { type: 'button', onclick: () => file.click() }, '📷 ' + t('pen_photo_add')), ' ', phLabel, file));
      const status = h('p.form-status', '');
      const add = h('button.btn.save-btn#pen-add', { type: 'button', onclick: async () => {
        if (!who.value) { flash(who.input); return; }
        if (!(Number(amount.value) > 0)) { flash(amount); return; }
        if (!reason.value.trim()) { flash(reason); return; }
        if (decide && !cat.value) { flash(cat); return; }
        add.disabled = true;
        try {
          await call('pen.add', { user_id: who.value, date: date.value, amount: amount.value, reason: reason.value, category: cat.value, photo, client_id: newId() });
          toast(t(decide ? 'pen_issued' : 'pen_proposed'), 'ok'); draw();
        } catch (e) { status.textContent = errText(e); status.className = 'form-status err'; add.disabled = false; }
      } }, t(decide ? 'pen_add_hr' : 'pen_add_propose'));
      parts.push(h('details.fam-box.pen-form', h('summary', h('b', '+ ' + t(decide ? 'pen_add_hr' : 'pen_add_propose'))),
        h('div.form-grid', field(t('pen_employee'), who, { wide: true }), field(t('pen_category'), cat), field(t('pen_date'), date), field(t('hr_amount'), amount), phBtn),
        field(t('pen_reason'), reason, { wide: true }), h('small.muted', t(decide ? 'pen_hr_help' : 'pen_propose_help')), status, h('div.form-actions', add)));
    }
    if (decide) parts.push(catsBox());
    box.replaceChildren(...parts, inner);
    penList('pen.list', decide ? 'hr' : 'view', inner);
  }

  draw();
}
