// Form building blocks shared by the work screens, carrying over the MORO v13 habits:
// search from any part of a name, Enter moves to the next field (and stops on an empty
// required field with a red flash), filled fields tinted, F2 switches Food/Packaging.
import { h, flash, trackFilled } from './ui.js';
import { t } from './i18n.js';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Searchable list. options(): [{value, label, hint}]. Typing filters by any part of the label.
 * Enter picks the highlighted match (or the only one); the component then fires 'commit'.
 */
export function combo({ id, options, placeholder = '', onPick }) {
  const input = trackFilled(h('input.input', { id, autocomplete: 'off', placeholder, role: 'combobox', 'aria-expanded': 'false' }));
  const list = h('ul.combo-list', { role: 'listbox', hidden: true });
  const wrap = h('div.combo', input, list);
  let value = '';
  let shown = [];
  let hi = -1;

  const render = () => {
    const q = norm(input.value);
    const all = options();
    shown = (q ? all.filter((o) => norm(o.label).includes(q)) : all).slice(0, 60);
    hi = shown.length ? 0 : -1;
    list.replaceChildren(...shown.map((o, i) => h('li', { role: 'option', 'data-i': i, class: i === hi ? 'hi' : '',
      onmousedown: (e) => { e.preventDefault(); pick(o); } }, h('bdi', o.label), o.hint ? h('small.num', o.hint) : null)));
    list.hidden = !shown.length || document.activeElement !== input;
    input.setAttribute('aria-expanded', String(!list.hidden));
  };
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
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    if (onPick) onPick(value, o);
  };

  input.addEventListener('input', () => { value = ''; if (onPick) onPick('', null); render(); });
  input.addEventListener('focus', () => { if (input.value.trim() && !value) render(); });
  input.addEventListener('blur', () => {
    list.hidden = true;
    if (!value) {   // typed text that exactly matches one option counts as picked
      const exact = options().find((o) => norm(o.label) === norm(input.value));
      if (exact) pick(exact);
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) render(); else move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape') { list.hidden = true; }
    else if (e.key === 'Enter' && !e.shiftKey && !value && input.value.trim()) {
      const o = !list.hidden && hi >= 0 ? shown[hi] : (shown.length === 1 ? shown[0] : null);
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
 * Food / Packaging switch. F2 anywhere on the screen toggles it (as in MORO v13).
 * Returns {el, value, set(cat)}; onChange(cat) is called on every change.
 */
export function zoneToggle(onChange, initial = 'Food') {
  let value = initial;
  const food = h('button.zone-btn', { type: 'button', onclick: () => set('Food') }, t('food'));
  const pack = h('button.zone-btn', { type: 'button', onclick: () => set('Packaging') }, t('packaging'));
  const el = h('div.zone', food, pack, h('small.muted', 'F2'));
  function set(cat, silent) {
    value = cat;
    food.classList.toggle('on', cat === 'Food');
    pack.classList.toggle('on', cat === 'Packaging');
    document.body.dataset.zone = cat === 'Food' ? 'food' : 'pack';
    if (!silent) { flash(cat === 'Food' ? food : pack, true); onChange(cat); }
  }
  const onKey = (e) => { if (e.key === 'F2') { e.preventDefault(); set(value === 'Food' ? 'Packaging' : 'Food'); } };
  document.addEventListener('keydown', onKey);
  set(initial, true);
  return { el, get value() { return value; }, set, dispose: () => { document.removeEventListener('keydown', onKey); delete document.body.dataset.zone; } };
}

/** Two quick presses confirm a risky action (instead of a "are you sure?" box). */
export function doublePress(key) {
  const now = Date.now();
  if (doublePress.last && doublePress.last.key === key && now - doublePress.last.at < 5000) { doublePress.last = null; return true; }
  doublePress.last = { key, at: now };
  return false;
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
