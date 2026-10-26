// Small DOM helpers shared by the views.

/** h('div.card', {onclick}, child, 'text', ...) – element builder. */
export function h(tag, attrs, ...kids) {
  // 'input.input.pin#pin' → <input class="input pin" id="pin">
  const parts = tag.match(/[.#]?[^.#]+/g) || ['div'];
  const el = document.createElement(parts[0][0] === '.' || parts[0][0] === '#' ? 'div' : parts.shift());
  const classes = parts.filter((p) => p[0] === '.').map((p) => p.slice(1));
  const idPart = parts.find((p) => p[0] === '#');
  if (classes.length) el.className = classes.join(' ');
  if (idPart) el.id = idPart.slice(1);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ' ' + v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

let toastTimer;
export function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

/** Flashes a field red (or green) instead of a message box. */
export function flash(el, ok = false) {
  const cls = ok ? 'flash-ok' : 'flash-err';
  el.classList.remove(cls);
  void el.offsetWidth;                       // restart the animation
  el.classList.add(cls);
}

/** Filled fields get a light tint; empty ones stay white. */
export function trackFilled(input) {
  const upd = () => input.classList.toggle('filled', String(input.value).trim() !== '');
  input.addEventListener('input', upd);
  input.addEventListener('change', upd);
  upd();
  return input;
}

export function fmtNum(n) {
  if (n === '' || n === null || n === undefined) return '';
  const v = Number(n);
  return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10-12' → '12-Oct-26' (same style as MORO v13). */
/** Quantity of a movement as typed, with the stock quantity when a packaging unit was used. */
export function fmtMoveQty(m) {
  const q = fmtNum(Math.abs(Number(m.qty))) + ' ' + (m.unit || '');
  return m.entry_unit && m.entry_unit !== m.unit ? fmtNum(m.entry_qty) + ' ' + m.entry_unit + ' (' + q + ')' : q;
}

export function fmtDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return s || '';
  return s.slice(8, 10) + '-' + MONTHS[Number(s.slice(5, 7)) - 1] + '-' + s.slice(2, 4);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86400000);
}

/** Simple modal with custom content; resolves with the value passed to close(). */
export function dialog(build) {
  return new Promise((resolve) => {
    const back = h('div.dialog-back');
    const close = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', (e) => { if (e.target === back) close(undefined); });
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(undefined); });
    back.append(h('div.dialog', { role: 'dialog', 'aria-modal': 'true' }, build(close)));
    document.body.append(back);
    const first = back.querySelector('input, button');
    if (first) first.focus();
  });
}

const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  receive: 'M19 12v7H5v-7H3v9h18v-9h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z',
  issue: 'M19 12v7H5v-7H3v9h18v-9h-2zM11 6.83L8.41 9.41 7 8l5-5 5 5-1.41 1.41L13 6.83V16h-2V6.83z',
  production: 'M12 3L2 8v13h20V8L12 3zm6 16h-3v-6H9v6H6V9.2l6-3 6 3V19z',
  requests: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 0a1 1 0 110 2 1 1 0 010-2zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
  reports: 'M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z',
  shoporders: 'M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z',
  counts: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
  masters: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z',
  users: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  lpo: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  more: 'M6 10a2 2 0 100 4 2 2 0 000-4zm12 0a2 2 0 100 4 2 2 0 000-4zm-6 0a2 2 0 100 4 2 2 0 000-4z',
};
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || ICONS.more);
  p.setAttribute('fill', 'currentColor');
  svg.append(p);
  return svg;
}
