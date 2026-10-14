// App start: service worker, sign-in, the shell (side menu / phone bottom bar), routing and sync.
import { call, session, ApiError } from './api.js';
import { APP_VERSION } from './config.js';
import { Outbox } from './outbox.js';
import { MovStore } from './movstore.js';
import { kv } from './db.js';
import { Data } from './data.js';
import { t, applyLang, getLang, setLang, errText } from './i18n.js';
import { h, icon, toast, flash, trackFilled, dialog, fmtDate } from './ui.js';
import { showAuth } from './views/login.js';
import * as dashboard from './views/dashboard.js';
import * as soon from './views/soon.js';
import * as receive from './views/receive.js';
import * as issue from './views/issue.js';
import * as production from './views/production.js';
import * as requests from './views/requests.js';
import * as masters from './views/masters.js';
import * as users from './views/users.js';
import * as reports from './views/reports.js';

const ROUTES = {
  dashboard: { view: dashboard, perm: 'data.bootstrap', group: 'nav_main' },
  receive:   { view: receive, perm: 'kind.RECEIPT', group: 'nav_ops' },
  issue:     { view: issue, perm: 'kind.ISSUE', group: 'nav_ops' },
  production:{ view: production, perm: 'production.post', group: 'nav_ops' },
  requests:  { view: requests, perm: 'requests.list', group: 'nav_ops' },
  reports:   { view: reports, perm: 'movements.query', group: 'nav_ops' },
  masters:   { view: masters, perm: 'items.save', group: 'nav_admin' },
  users:     { view: users, perm: 'users.list', group: 'nav_admin' },
};

const root = document.getElementById('app');
let content, title, syncEl;

applyLang();
// updates: the service worker file is never taken from the browser cache, and when a new version
// takes over, the page reloads itself once so the new screens appear without closing the app
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}

window.addEventListener('moro:signed-out', async () => {
  await kv.clear();
  toast(t('signed_out'), 'err');
  start();
});

async function start() {
  if (!session.token) {
    let setupNeeded = false;
    try { setupNeeded = (await call('ping')).setup_needed; } catch { /* offline: show login */ }
    await showAuth(root, setupNeeded);
  }
  const cached = await Data.loadCached();
  if (!cached) {
    root.replaceChildren(h('div.boot', h('img', { src: 'icons/logo.png', alt: '', width: 96, height: 96 }), h('span', t('refreshing'))));
    try {
      await Data.refresh();
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'auth_required' || e.code === 'auth_expired')) return;
      root.replaceChildren(h('div.auth', h('div.auth-card', h('h1', errText(e)),
        h('button.btn.block', { onclick: () => location.reload() }, '↻'))));
      return;
    }
  }
  await Outbox.init();
  buildShell();
  route();
  if (cached) sync(true);
  setInterval(() => { if (document.visibilityState === 'visible') sync(false); }, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(false); });
}

function allowed(name) { return Data.can(ROUTES[name].perm); }

function buildShell() {
  const u = Data.user;
  const navLinks = [];
  let group = '';
  for (const name of Object.keys(ROUTES)) {
    if (!allowed(name)) continue;
    if (ROUTES[name].group !== group) { group = ROUTES[name].group; navLinks.push(h('div.nav-group', t(group))); }
    navLinks.push(h('a', { href: '#/' + name, 'data-route': name }, icon(name), h('span', t(name))));
  }
  const side = h('aside.side',
    h('div.brand', h('img', { src: 'icons/logo.png', alt: '' }), h('div', h('b', t('app_name')), h('small', h('bdi', t('app_sub'))))),
    h('nav.nav', navLinks),
    h('div.side-foot',
      h('div', u.display_name, h('br'), h('small', t('role_' + u.role) + ' · v' + APP_VERSION)),
      h('button', { type: 'button', onclick: changePin }, t('change_pin')),
      h('button', { type: 'button', onclick: toggleLang }, t('lang_other')),
      h('button', { type: 'button', onclick: logout }, t('logout'))));

  // phone: the first four allowed screens + "more" (opens the full menu)
  const phoneRoutes = Object.keys(ROUTES).filter(allowed).slice(0, 4);
  const bottom = h('nav.bottom-nav',
    phoneRoutes.map((name) => h('a', { href: '#/' + name, 'data-route': name }, icon(name), h('span', t(name)))),
    h('a', { href: '#/more', 'data-route': 'more' }, icon('more'), h('span', t('more'))));

  title = h('h1', '');
  // a click on the indicator opens the list of refused saves (the phone also has it under "more")
  syncEl = h('div.sync', { onclick: () => { if (Outbox.failed.length) location.hash = '#/failed'; } }, h('span.dot'), h('span', ''));
  content = h('section.content');
  root.replaceChildren(h('div.shell', side, h('div.main', h('header.topbar', title, h('div.spacer'), syncEl), content)), bottom);
  updateSync();
}

const AUTO_REFRESH_MS = 30000;
let current = null;
function route() {
  if (current && current.dispose) current.dispose();
  let name = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  if (name === 'more') return showMore();
  if (name === 'failed') return showFailed();
  if (!ROUTES[name] || !allowed(name)) name = 'dashboard';
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  title.textContent = t(name);
  current = ROUTES[name].view;
  current.render(content, name);
  window.scrollTo(0, 0);
}

function showMore() {
  if (current && current.dispose) current.dispose();
  current = null;
  title.textContent = t('more');
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === 'more'));
  const u = Data.user;
  content.replaceChildren(h('div.card',
    h('div', h('b', u.display_name), ' · ', h('span.muted', t('role_' + u.role) + ' · v' + APP_VERSION)),
    h('nav.nav', { style: 'display:grid;gap:4px' }, Object.keys(ROUTES).filter(allowed).map((name) =>
      h('a', { href: '#/' + name, style: 'color:var(--ink)' }, icon(name), h('span', t(name))))),
    h('button.btn.secondary', { type: 'button', onclick: changePin }, t('change_pin')),
    h('button.btn.secondary', { type: 'button', onclick: toggleLang }, t('lang_other')),
    h('button.btn.danger', { type: 'button', onclick: logout }, t('logout'))),
    failedCard());
}

/** The refused saves alone (opened from the connection indicator). */
function showFailed() {
  if (current && current.dispose) current.dispose();
  current = null;
  title.textContent = t('rejected_title');
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.remove('active'));
  content.replaceChildren(failedCard(showFailed) || h('div.card', h('p.empty', t('no_rows'))));
  window.scrollTo(0, 0);
}

/** Saves the server refused (a rule failed): shown so nothing is lost silently. */
function failedCard(redraw = showMore) {
  const list = Outbox.failed;
  if (!list.length) return '';
  return h('div.card', h('h2', t('rejected_title')), h('small.muted', t('rejected_help')),
    list.map((f) => h('div.req-card', h('b', f.label || f.action), h('span.muted', ' · ' + fmtDate(f.at.slice(0, 10))),
      h('p.err-text', errText({ code: f.error, detail: f.detail })),
      h('button.link', { type: 'button', onclick: async () => { await Outbox.dropFailed(f.id); redraw(); } }, t('dismiss')))));
}

async function changePin() {
  const ok = await dialog((close) => {
    const oldPin = trackFilled(h('input.input.pin#c-old', { type: 'password', inputmode: 'numeric', maxlength: 8 }));
    const newPin = trackFilled(h('input.input.pin#c-new', { type: 'password', inputmode: 'numeric', maxlength: 8 }));
    const newPin2 = trackFilled(h('input.input.pin#c-new2', { type: 'password', inputmode: 'numeric', maxlength: 8 }));
    const err = h('p.err-text', '');
    const go = async () => {
      for (const f of [oldPin, newPin, newPin2]) if (!f.value) return flash(f);
      if (newPin.value !== newPin2.value) { err.textContent = t('pin_mismatch'); return flash(newPin2); }
      try { const r = await call('auth.changePin', { old_pin: oldPin.value, new_pin: newPin.value }); session.token = r.token; close(true); }
      catch (e) { err.textContent = errText(e); }
    };
    return [h('h3', t('change_pin')), h('div.field', h('label', t('old_pin')), oldPin), h('div.field', h('label', t('pin')), newPin),
      h('div.field', h('label', t('pin_repeat')), newPin2), err,
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: go }, t('save')))];
  });
  if (ok) toast(t('saved'), 'ok');
}

window.addEventListener('hashchange', () => { if (content) route(); });
// fresh data redraws the dashboard only; work screens read the data live and keep what is being typed
window.addEventListener('moro:data', () => { if (content && current === dashboard) route(); });
window.addEventListener('online', () => sync(false));
window.addEventListener('offline', updateSync);
window.addEventListener('moro:outbox', updateSync);
// every server call tells whether the connection works, so the indicator follows at once
window.addEventListener('moro:net', (e) => {
  if (lastSyncOk !== e.detail) { lastSyncOk = e.detail; updateSync(); if (e.detail && Outbox.pending) Outbox.flush(); }
});

let lastSyncOk = navigator.onLine;
async function sync(force) {
  try {
    if (force) await Data.refresh(); else await Data.refreshIfChanged();
    lastSyncOk = true;
    MovStore.prefetch();
  } catch (e) {
    lastSyncOk = false;
  }
  updateSync();
}

function updateSync() {
  if (!syncEl) return;
  const online = navigator.onLine && lastSyncOk;
  syncEl.classList.toggle('offline', !online);
  syncEl.classList.toggle('pending', online && Outbox.pending > 0);
  syncEl.classList.toggle('has-failed', Outbox.failed.length > 0);
  syncEl.title = Outbox.failed.length ? t('rejected_title') : '';
  const at = Data.syncedAt ? new Date(Data.syncedAt).toLocaleTimeString(getLang() === 'ar' ? 'ar-QA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  syncEl.lastChild.textContent = (online ? t('online') : t('offline')) + (at ? ' · ' + t('updated_at', { t: at }) : '') +
    (Outbox.pending ? ' · ' + t('waiting_to_send', { n: Outbox.pending }) : '') + (Outbox.failed.length ? ' · ⚠ ' + Outbox.failed.length : '');
}

function toggleLang() {
  setLang(getLang() === 'ar' ? 'en' : 'ar');
  buildShell();
  route();
}

async function logout() {
  session.token = '';
  await kv.clear();
  location.hash = '';
  location.reload();
}

start();
