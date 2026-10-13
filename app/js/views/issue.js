// Department issues – an issue slip with several lines, posted together (MORO v13 frmIssue).
// Enter: department → item → quantity → adds the line and returns to item; Enter on an empty item
// moves to "Post"; Enter there posts. The slip number D-MMDD-NNN is given by the server.
import { Data } from '../data.js';
import { MovStore } from '../movstore.js';
import { Outbox } from '../outbox.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtNum, fmtDate, trackFilled, dialog } from '../ui.js';
import { combo, field, zoneToggle, doublePress, newId } from '../components.js';

let cleanup = null;

export async function render(root) {
  if (cleanup) cleanup();
  let lines = [];          // {item_id, qty, unit, category}
  let editIndex = -1;

  const zone = zoneToggle(() => { item.clear(); info.textContent = ''; item.input.focus(); }, 'Food');
  const deptOpts = () => [...Data.parties.values()].filter((p) => p.kind === 'section' && p.active === true)
    .sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.party_id, label: p.name }));
  const itemOpts = () => Data.activeItems().filter((i) => i.category === zone.value)
    .sort((a, b) => a.name.localeCompare(b.name)).map((i) => ({ value: i.item_id, label: i.name, hint: fmtNum(Data.qty(i.item_id)) + ' ' + i.unit }));

  const dept = combo({ id: 'i-dept', options: deptOpts });
  const date = trackFilled(h('input.input#i-date', { type: 'date', value: Data.todayIso() }));
  const item = combo({ id: 'i-item', options: itemOpts, placeholder: t('lookup_hint'), onPick: showItem });
  const qty = trackFilled(h('input.input.num#i-qty', { type: 'number', step: 'any', min: 0, inputmode: 'decimal' }));
  const info = h('p.item-info', '');
  const addBtn = h('button.btn#i-add', { type: 'button', onclick: addLine }, t('add_line'));
  const postBtn = h('button.btn.save-btn#i-post', { type: 'button', onclick: post }, t('post_slip'));
  const clearBtn = h('button.btn.secondary', { type: 'button', onclick: clearSlip }, t('new_slip'));
  const status = h('p.form-status', '');
  const lineBody = h('tbody');
  const count = h('span.muted', '');

  function showItem(id) {
    const it = Data.items.get(id);
    if (!it) { info.textContent = ''; return; }
    const q = Data.qty(id);
    const low = Number(it.min_stock) > 0 && q <= Number(it.min_stock);
    info.className = 'item-info' + (low ? ' low' : '');
    info.textContent = t('available') + ': ' + fmtNum(q) + ' ' + it.unit + (Number(it.min_stock) > 0 ? '   |   ' + t('min_stock') + ': ' + fmtNum(it.min_stock) : '');
  }

  function drawLines() {
    lineBody.replaceChildren(...(lines.length ? lines.map((l, i) => {
      const it = Data.items.get(l.item_id);
      return h('tr.click', { class: i === editIndex ? 'selected' : '', onclick: () => pickLine(i) },
        h('td.num', i + 1), h('td.wrap', h('bdi', it.name)), h('td', h('span', { class: 'pill ' + (it.category === 'Food' ? 'food' : 'pack') }, t(it.category === 'Food' ? 'food' : 'packaging'))),
        h('td.num', fmtNum(l.qty) + ' ' + l.unit),
        h('td', h('button.link', { type: 'button', onclick: (e) => { e.stopPropagation(); removeLine(i, e.currentTarget); } }, t('delete'))));
    }) : [h('tr', h('td.empty', { colspan: 5 }, t('no_lines')))]));
    count.textContent = t('lines_count', { n: lines.length });
    dept.input.disabled = lines.length > 0;      // department fixed while the slip has lines (v13)
  }

  function addLine() {
    const bad = [];
    if (!dept.value) bad.push(dept.input);
    if (!date.value) bad.push(date);
    if (!item.value) bad.push(item.input);
    if (!(Number(qty.value) > 0)) bad.push(qty);
    if (bad.length) { bad.forEach((b) => flash(b)); bad[0].focus(); status.textContent = t('fill_highlighted'); status.className = 'form-status err'; return; }
    const it = Data.items.get(item.value);
    const line = { item_id: it.item_id, qty: Number(qty.value), unit: it.unit, category: it.category };
    if (editIndex >= 0) lines[editIndex] = line; else lines.push(line);
    editIndex = -1;
    addBtn.textContent = t('add_line');
    item.clear(); qty.value = ''; qty.dispatchEvent(new Event('change')); info.textContent = '';
    status.textContent = t('dont_forget_post'); status.className = 'form-status warn';
    drawLines();
    item.input.focus();
  }

  function pickLine(i) {
    editIndex = i;
    const l = lines[i];
    zone.set(l.category, true);
    item.set(l.item_id); qty.value = String(l.qty); qty.dispatchEvent(new Event('change'));
    addBtn.textContent = t('update_line');
    drawLines();
    qty.focus();
  }

  function removeLine(i, btn) {
    if (!doublePress('line-' + i)) { flash(btn); status.textContent = t('press_again_delete'); status.className = 'form-status warn'; return; }
    lines.splice(i, 1);
    editIndex = -1;
    addBtn.textContent = t('add_line');
    drawLines();
  }

  async function post() {
    if (!lines.length) { flash(item.input); status.textContent = t('no_lines'); status.className = 'form-status warn'; item.input.focus(); return; }
    if (!dept.value) { flash(dept.input); dept.input.disabled = false; dept.input.focus(); return; }
    const movements = lines.map((l) => ({ client_id: newId(), kind: 'ISSUE', date: date.value, party_id: dept.value,
      item_id: l.item_id, qty: l.qty, unit: l.unit }));
    const deptName = Data.parties.get(dept.value).name;
    const n = lines.length;
    lines = []; editIndex = -1;          // cleared before the await: a second Enter finds nothing to post
    drawLines();
    dept.input.disabled = false; dept.clear();
    await Outbox.add('movements.save', { movements }, deptName);
    status.textContent = t('posted_lines', { n }); status.className = 'form-status ok';
    loadRecords();
    dept.input.focus();
  }

  function clearSlip() {
    if (lines.length && !doublePress('clear-slip')) { flash(clearBtn); status.textContent = t('press_again_clear'); status.className = 'form-status warn'; return; }
    lines = []; editIndex = -1; drawLines(); dept.input.disabled = false; dept.clear(); item.clear(); qty.value = '';
    status.textContent = ''; dept.input.focus();
  }

  // keyboard: department → item → qty → add; Enter on an empty item with lines → Post
  dept.input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return; e.preventDefault();
    if (!dept.value) { flash(dept.input); return; }
    item.input.focus();
  });
  item.input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return; e.preventDefault();
    if (e.shiftKey) { if (!dept.input.disabled) dept.input.focus(); return; }
    if (!item.input.value.trim()) { if (lines.length) postBtn.focus(); else flash(item.input); return; }
    if (!item.value) { flash(item.input); return; }
    qty.focus();
  });
  qty.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return; e.preventDefault();
    if (e.shiftKey) { item.input.focus(); return; }
    addLine();
  });

  // ---------- recent issues
  const search = trackFilled(h('input.input#i-search', { type: 'search', placeholder: t('search_records') }));
  const recBody = h('tbody');
  let records = [];
  const fillRecords = () => {
    const q = search.value.trim().toLowerCase();
    const rows = records.filter((m) => {
      if (!q) return true;
      const it = Data.items.get(m.item_id); const p = Data.parties.get(m.party_id);
      return [it && it.name, p && p.name, m.doc_no].some((x) => String(x || '').toLowerCase().includes(q));
    }).slice(0, 300);
    recBody.replaceChildren(...(rows.length ? rows.map((m) => {
      const it = Data.items.get(m.item_id); const p = Data.parties.get(m.party_id);
      return h('tr.click', { class: m.pending ? 'pending' : '', onclick: () => editRecord(m) },
        h('td.num', fmtDate(m.date)), h('td.wrap', h('bdi', p ? p.name : '')),
        h('td.wrap', h('bdi', it ? it.name : m.item_id)), h('td.num.qty-neg', fmtNum(Math.abs(Number(m.qty))) + ' ' + (m.unit || '')),
        h('td', m.pending ? h('span.pill.soon', t('pending')) : ''), h('td.num', m.doc_no || ''));
    }) : [h('tr', h('td.empty', { colspan: 6 }, t('no_rows')))]));
  };
  search.addEventListener('input', fillRecords);

  async function loadRecords() {
    try {
      const res = await MovStore.all();          // local copy: works without internet
      records = res.list.filter((m) => m.kind === 'ISSUE').map((m) => (m.pending ? { ...m, doc_no: '…' } : m)).slice(0, 1500);
      fillRecords();
    } catch (e) { if (!records.length) recBody.replaceChildren(h('tr', h('td.empty', { colspan: 6 }, errText(e)))); }
  }

  async function editRecord(m) {
    if (m.pending) return;
    const own = Data.can('edit_any') || m.created_by === Data.user.user_id;
    if (!own) { toast(t('err.forbidden'), 'err'); return; }
    const it = Data.items.get(m.item_id);
    const res = await dialog((close) => {
      const q = trackFilled(h('input.input.num#e-qty', { type: 'number', step: 'any', min: 0, value: Math.abs(Number(m.qty)) }));
      const d = trackFilled(h('input.input#e-date', { type: 'date', value: m.date }));
      const del = h('button.btn.danger', { type: 'button', hidden: !Data.can('movements.delete'),
        onclick: () => { if (doublePress('del-' + m.movement_id)) close({ del: true }); else flash(del); } }, t('delete'));
      const ok = () => { if (!(Number(q.value) > 0)) return flash(q); close({ qty: Number(q.value), date: d.value }); };
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      return [h('h3', h('bdi', it ? it.name : m.item_id)), h('p.muted', (m.doc_no || '') + ' · ' + (Data.parties.get(m.party_id) || {}).name),
        field(t('date'), d), field(t('qty'), q),
        h('div.actions', del, h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
    });
    if (!res) return;
    if (res.del) await Outbox.add('movements.delete', { movement_id: m.movement_id }, it && it.name);
    else await Outbox.add('movements.update', { movement_id: m.movement_id, changes: { qty: res.qty, date: res.date } }, it && it.name);
    toast(res.del ? t('deleted') : t('updated'), 'ok');
    loadRecords();
  }

  root.replaceChildren(h('div.work',
    h('div.card.form-card',
      h('div.card-head', h('h2', t('issue_slip')), zone.el),
      h('div.form-grid',
        field(t('department'), dept, { wide: true }), field(t('date'), date), h('div.field', h('label', t('slip_no')), h('div.slip-auto', t('slip_auto'))),
        field(t('item'), item, { wide: true }), info, field(t('qty'), qty), h('div.field.end', addBtn)),
      h('div.card-head', h('h2', t('slip_lines')), count),
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', '#'), h('th', t('item')), h('th', t('kind')), h('th', t('qty')), h('th', ''))), lineBody)),
      h('div.form-actions', postBtn, clearBtn), status,
      h('small.muted', t('issue_help'))),
    h('div.card', h('div.card-head', h('h2', t('recent_issues'))), search,
      h('div.table-wrap.tall', h('table', h('thead', h('tr', h('th', t('date')), h('th', t('department')), h('th', t('item')), h('th', t('qty')), h('th', ''), h('th', t('slip_no')))), recBody)))));

  const onSent = (e) => {
    const r = e.detail.result;
    if (e.detail.action === 'movements.save' && r && r.saved && r.saved[0] && /^D-/.test(r.saved[0].doc_no || '')) toast(t('slip_saved', { no: r.saved[0].doc_no }), 'ok');
    loadRecords();
  };
  const onRejected = (e) => { toast(t('rejected', { what: e.detail.label || '' }) + ': ' + errText({ code: e.detail.error, detail: e.detail.detail }), 'err'); loadRecords(); };
  window.addEventListener('moro:sent', onSent);
  window.addEventListener('moro:rejected', onRejected);
  window.addEventListener('moro:data', loadRecords);      // new server data → refresh the records list
  cleanup = () => { zone.dispose(); window.removeEventListener('moro:sent', onSent); window.removeEventListener('moro:rejected', onRejected);
    window.removeEventListener('moro:data', loadRecords); cleanup = null; };
  drawLines();
  loadRecords();
  dept.input.focus();
}

export function dispose() { if (cleanup) cleanup(); }
