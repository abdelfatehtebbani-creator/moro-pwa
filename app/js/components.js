// Form building blocks shared by the work screens, carrying over the MORO v13 habits:
// search from any part of a name, Enter moves to the next field (and stops on an empty
// required field with a red flash), filled fields tinted, F2 switches Food/Packaging.
import { h, flash, trackFilled } from './ui.js';
import { t } from './i18n.js';
import { Data, STORES } from './data.js';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Searchable list. options(): [{value, label, hint}]. Typing filters by any part of the label.
 * Enter picks the highlighted match (or the only one); the component then fires 'commit'.
 */
export function combo({ id, options, placeholder = '', onPick }) {
  const input = trackFilled(h('input.input', { id, autocomplete: 'off', placeholder, role: 'combobox', 'aria-expanded': 'false' }));
  const list = h('ul.combo-list', { role: 'listbox', hidden: true });
  // the arrow (or a click in the field) opens the whole list, to pick without typing
  const arrow = h('button.combo-arrow', { type: 'button', tabindex: -1, 'aria-label': 'open list',
    onmousedown: (e) => { e.preventDefault(); if (list.hidden) { input.focus(); render(true); } else close(); } }, '▾');
  const wrap = h('div.combo', input, arrow, list);
  let value = '';
  let shown = [];
  let hi = -1;

  /** full = show every option (browsing); otherwise filter by what is typed. */
  const render = (full) => {
    const q = full || value ? '' : norm(input.value);
    const all = options();
    shown = (q ? all.filter((o) => norm(o.label).includes(q)) : all).slice(0, 600);
    hi = shown.length ? Math.max(0, shown.findIndex((o) => o.value === value)) : -1;
    list.replaceChildren(...shown.map((o, i) => h('li', { role: 'option', 'data-i': i, class: (i === hi ? 'hi ' : '') + (o.value === value ? 'cur' : ''),
      onmousedown: (e) => { e.preventDefault(); pick(o); } }, h('bdi', o.label), o.hint ? h('small.num', o.hint) : null)));
    list.hidden = !shown.length || document.activeElement !== input;
    input.setAttribute('aria-expanded', String(!list.hidden));
    if (!list.hidden && hi > 0) list.children[hi].scrollIntoView({ block: 'nearest' });
  };
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const move = (d) => {
    if (list.hidden || !shown.length) return;
    hi = (hi + d + shown.length) % shown.length;
    [...list.children].forEach((li, i) => li.classList.toggle('hi', i === hi));
    list.children[hi].scrollIntoView({ block: 'nearest' });
  };
  const pick = (o) => {
    value = o ? o.value : '';
    input.value = o ? o.label : '';
    input.dispatchEvent(new Event('change'));
    close();
    if (onPick) onPick(value, o);
  };

  input.addEventListener('input', () => { value = ''; if (onPick) onPick('', null); render(false); });
  input.addEventListener('mousedown', () => { if (list.hidden) setTimeout(() => render(true), 0); });
  input.addEventListener('blur', () => {
    close();
    if (!value) {   // typed text that exactly matches one option counts as picked
      const exact = options().find((o) => norm(o.label) === norm(input.value));
      if (exact) pick(exact);
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) render(!input.value.trim() || !!value); else move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape') { close(); }
    else if (e.key === 'Enter' && !e.shiftKey) {
      // the highlighted row of an open list, or the only match of what was typed
      const o = !list.hidden && hi >= 0 ? shown[hi] : (!value && input.value.trim() && shown.length === 1 ? shown[0] : null);
      if (o) pick(o);
    }
  });

  return {
    el: wrap, input,
    get value() { return value; },
    set(v) { const o = options().find((x) => x.value === v); pick(o || null); if (!o) input.value = ''; },
    clear() { value = ''; input.value = ''; input.dispatchEvent(new Event('change')); },
    refresh: render,
  };
}

/** Labelled field. */
export function field(label, control, opts = {}) {
  const el = control.el || control;
  const input = control.input || control;
  return h('div.field', { class: opts.wide ? 'wide' : '' }, h('label', { for: input.id }, label), el);
}

/**
 * Enter-key navigation over an ordered list of steps: {input, required(): bool, valid(): bool}.
 * Enter on an empty required (or invalid) field flashes it and stays; Shift+Enter goes back.
 * The last step's Enter calls onLast().
 */
export function enterNav(steps, onLast) {
  steps.forEach((s, i) => {
    s.input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (e.shiftKey) { if (i > 0) steps[i - 1].input.focus(); return; }
      if (!stepOk(s)) { flash(s.input); return; }
      const next = steps.slice(i + 1).find((x) => !x.input.disabled && x.input.offsetParent !== null);
      if (next) next.input.focus(); else if (onLast) onLast();
    });
  });
}

export function stepOk(s) {
  const empty = String(s.input.value || '').trim() === '';
  if (s.required && s.required() && empty) return false;
  if (s.valid && !empty && !s.valid()) return false;
  return true;
}

/** Checks all steps; flashes every bad one and focuses the first. Returns true when all are fine. */
export function checkAll(steps) {
  const bad = steps.filter((s) => s.input.offsetParent !== null && !stepOk(s));
  bad.forEach((s) => flash(s.input));
  if (bad.length) bad[0].input.focus();
  return !bad.length;
}

/**
 * The four store buttons. Only the user's stores can be chosen; F2 moves to the next of them.
 * Returns {el, value, set(store, silent), lock(bool), dispose}; onChange(store) on every change.
 */
export function storePicker(onChange) {
  const allowed = Data.myStores();
  // the last store used on this device, else Dry foods, else the first one allowed
  let last = '';
  try { last = localStorage.getItem('moro.store') || ''; } catch { /* private window */ }
  let value = allowed.includes(last) ? last : allowed.includes('DRY') ? 'DRY' : allowed[0] || '';
  let locked = false;
  const btns = STORES.map((s) => h('button.zone-btn', { type: 'button', 'data-store': s, disabled: !allowed.includes(s),
    title: allowed.includes(s) ? '' : t('store_not_yours'), onclick: () => set(s) }, t('store_' + s)));
  const el = h('div.zone.stores', ...btns, allowed.length > 1 ? h('small.muted', 'F2') : null);
  function set(store, silent) {
    if (!allowed.includes(store) || (locked && store !== value)) return;
    value = store;
    btns.forEach((b) => b.classList.toggle('on', b.dataset.store === store));
    document.body.dataset.zone = store.toLowerCase();
    try { localStorage.setItem('moro.store', store); } catch { /* private window */ }
    if (!silent) { flash(btns[STORES.indexOf(store)], true); onChange(store); }
  }
  const onKey = (e) => {
    if (e.key !== 'F2' || allowed.length < 2 || locked) return;
    e.preventDefault();
    set(allowed[(allowed.indexOf(value) + 1) % allowed.length]);
  };
  document.addEventListener('keydown', onKey);
  if (value) set(value, true);
  return { el, get value() { return value; }, set,
    lock(on) { locked = on; btns.forEach((b) => { b.disabled = !allowed.includes(b.dataset.store) || (on && b.dataset.store !== value); }); },
    dispose: () => { document.removeEventListener('keydown', onKey); delete document.body.dataset.zone; } };
}

/** A small coloured tag with the store's name. */
/** Filters for a records list: who entered it, and a date range. onChange redraws the list. */
export function recordFilters(onChange, zone) {
  const names = Data.userNames || {};
  // the store tab's records, or all the user's stores at once
  const where = h('select.input.rf-store', h('option', { value: '' }, t('this_store')), h('option', { value: '*' }, t('all_stores')));
  const who = h('select.input.rf-who', h('option', { value: '' }, t('all_users')),
    ...Object.keys(names).sort((a, b) => String(names[a]).localeCompare(String(names[b]))).map((id) => h('option', { value: id }, names[id])));
  const from = h('input.input.rf-date', { type: 'date', title: t('from') });
  const to = h('input.input.rf-date', { type: 'date', title: t('to') });
  [where, who, from, to].forEach((x) => x.addEventListener('change', onChange));
  const inStore = (m) => {
    const s = Data.storeOf(Data.items.get(m.item_id));
    return where.value === '*' ? Data.myStores().includes(s) : s === zone.value;
  };
  return {
    el: h('div.rec-filters', where, who, h('span.muted', t('from')), from, h('span.muted', t('to')), to),
    all: () => where.value === '*',
    test: (m) => inStore(m) && (!who.value || m.created_by === who.value) && (!from.value || String(m.date) >= from.value) && (!to.value || String(m.date) <= to.value),
  };
}
/** "Entered by" of a record. */
export const enteredBy = (m) => (m.pending ? Data.user && Data.user.display_name : m.created_by === 'migration' ? t('migrated') : (Data.userNames || {})[m.created_by]) || m.created_by || '';

export function storePill(store) {
  return h('span', { class: 'pill st-' + String(store || 'DRY').toLowerCase() }, t('store_' + (store || 'DRY')));
}

/** Two quick presses confirm a risky action (instead of a "are you sure?" box). */
export function doublePress(key) {
  const now = Date.now();
  if (doublePress.last && doublePress.last.key === key && now - doublePress.last.at < 5000) { doublePress.last = null; return true; }
  doublePress.last = { key, at: now };
  return false;
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
