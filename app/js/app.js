// App start: service worker, sign-in, the shell (side menu / phone bottom bar), routing and sync.
import { call, session, ApiError } from './api.js';
import { APP_VERSION } from './config.js';
import { CHANGELOG, cmpVersion } from './changelog.js';
import { Outbox } from './outbox.js';
import { Push } from './push.js';
import { MovStore } from './movstore.js';
import { kv } from './db.js';
import { Data } from './data.js';
import { t, applyLang, getLang, setLang, errText, fmtDateTime } from './i18n.js';
import { h, icon, toast, flash, trackFilled, dialog, fmtDate } from './ui.js';
import { showAuth } from './views/login.js';
import * as home from './views/home.js';
import * as dashboard from './views/dashboard.js';
import * as soon from './views/soon.js';
import * as receive from './views/receive.js';
import * as issue from './views/issue.js';
import * as production from './views/production.js';
import * as requests from './views/requests.js';
import * as masters from './views/masters.js';
import * as users from './views/users.js';
import * as reports from './views/reports.js';
import * as shoporders from './views/shoporders.js';
import * as counts from './views/counts.js';
import * as lpo from './views/lpo.js';
import * as coffee from './views/coffee.js';

const ROUTES = {
  home:      { view: home, perm: 'data.bootstrap', group: 'nav_main' },
  dashboard: { view: dashboard, perm: 'data.bootstrap', group: 'nav_main' },
  receive:   { view: receive, perm: 'nav.receive', group: 'nav_ops' },
  lpo:       { view: lpo, perm: 'nav.lpo', group: 'nav_ops' },
  issue:     { view: issue, perm: 'nav.issue', group: 'nav_ops' },
  production:{ view: production, perm: 'nav.production', group: 'nav_ops' },
  requests:  { view: requests, perm: 'nav.requests', group: 'nav_ops' },
  shoporders:{ view: shoporders, perm: 'nav.shoporders', group: 'nav_ops' },
  reports:   { view: reports, perm: 'nav.reports', group: 'nav_ops' },
  counts:    { view: counts, perm: 'nav.counts', group: 'nav_ops' },
  coffee:    { view: coffee, perm: 'nav.coffee', group: 'nav_tools' },
  masters:   { view: masters, perm: 'nav.masters', group: 'nav_admin' },
  users:     { view: users, perm: 'nav.users', group: 'nav_admin' },
};

const root = document.getElementById('app');
let content, title, syncEl, shellEl;

applyLang();
// updates: the service worker file is never taken from the browser cache, and when a new version
// takes over, the page reloads itself once so the new screens appear without closing the app
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    reg.update().catch(() => {});
    setInterval(() => reg.update().catch(() => {}), 15 * 60 * 1000);
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

const step = (s) => { window.__moroStep = s + ' ' + APP_VERSION; };
async function start() {
  step('start');
  if (!session.token) {
    step('ping');
    let setupNeeded = false;
    root.replaceChildren(h('div.boot', h('img', { src: 'icons/logo.png', alt: '', width: 96, height: 96 }), h('span', 'MORO'),
      h('small', t('connecting'))));
    // a slow or missing answer (8 s at most) only means "show the sign-in screen"
    try { setupNeeded = (await call('ping')).setup_needed; } catch { /* offline: show login */ }
    window.__moroStarted = true;           // the sign-in screen is up
    await showAuth(root, setupNeeded);
    // just signed in: the home screen first
    history.replaceState(null, '', location.pathname + location.search);
  }
  step('cache');
  const cached = await Data.loadCached();
  if (!cached) {
    step('refresh');
    root.replaceChildren(h('div.boot', h('img', { src: 'icons/logo.png', alt: '', width: 96, height: 96 }), h('span', t('refreshing'))));
    window.__moroStarted = true;           // "Updating…" is shown; a failure shows its own message
    try {
      await Data.refresh();
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'auth_required' || e.code === 'auth_expired')) return;
      root.replaceChildren(h('div.auth', h('div.auth-card', h('h1', errText(e)),
        h('button.btn.block', { onclick: () => location.reload() }, '↻'))));
      return;
    }
  }
  step('outbox');
  await Outbox.init();
  step('shell');
  buildShell();
  route();
  window.__moroStarted = true;
  whatsNew(false);
  if (allowed('lpo')) Push.refresh();
  if (cached) sync(true);
  setInterval(() => { if (document.visibilityState === 'visible') sync(false); }, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(false); });
}

// the dashboard is about stock: shown to whoever works with stock (or the minimum levels), not to the accountant
const STOCK_PERMS = ['nav.receive', 'nav.issue', 'nav.production', 'nav.requests', 'nav.shoporders', 'nav.reports', 'nav.counts', 'nav.masters', 'min_stock'];
function allowed(name) {
  if (name === 'dashboard') return STOCK_PERMS.some((p) => Data.can(p));
  return Data.can(ROUTES[name].perm);
}
// the first screen: home (every user may open it)
function firstScreen() { return Object.keys(ROUTES).find(allowed) || 'home'; }

// ---------- what's new: shown once after each update, with what the user needs to do
const SEEN_KEY = 'moro.seen_version';
function whatsNew(always) {
  let seen = '';
  try { seen = localStorage.getItem(SEEN_KEY) || ''; } catch { /* storage blocked */ }
  if (!always && seen === APP_VERSION) return;
  try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* storage blocked */ }
  // every version since the last one this device saw (the latest one only on a first visit)
  const list = always ? CHANGELOG.slice(0, 5)
    : CHANGELOG.filter((c) => cmpVersion(c.v, APP_VERSION) <= 0 && (seen ? cmpVersion(c.v, seen) > 0 : c.v === CHANGELOG[0].v));
  if (!list.length) return;
  const lang = getLang();
  const admin = Data.can('users.save');
  dialog((close) => [
    h('h3', t('whats_new_title', { v: APP_VERSION })),
    ...list.map((c) => {
      const x = c[lang] || c.ar;
      return h('div.wn-entry',
        h('div.wn-ver', h('b', 'v' + c.v), ' ', h('span.muted', fmtDate(c.date))),
        h('ul', x.news.map((n) => h('li', n))),
        x.todo ? h('div.wn-todo', h('b', t('whats_new_todo')), ' ', x.todo) : null,
        admin && x.admin ? h('div.wn-todo.admin', h('b', t('whats_new_admin')), ' ', x.admin) : null);
    }),
    h('div.actions', h('button.btn', { type: 'button', onclick: () => close() }, t('whats_new_ok')))]);
}

function buildShell() {
  const u = Data.user;
  const navLinks = [];
  let group = '';
  for (const name of Object.keys(ROUTES)) {
    if (!allowed(name)) continue;
    if (ROUTES[name].group !== group) { group = ROUTES[name].group; navLinks.push(h('div.nav-group', t(group))); }
    navLinks.push(h('a', { href: '#/' + name, 'data-route': name }, icon(name), h('span', t(name)), name === 'lpo' ? h('span.badge', { hidden: true }) : null));
  }
  const side = h('aside.side',
    h('div.brand', h('img', { src: 'icons/logo.png', alt: '' }), h('div', h('b', t('app_name')), h('small', h('bdi', t('app_sub'))))),
    h('nav.nav', navLinks),
    h('div.side-foot',
      h('div', u.display_name, h('br'), h('small', t('role_' + u.role) + ' · v' + APP_VERSION)),
      accountButtons()));

  // phone: the first four allowed screens + "more" (opens the full menu)
  const phoneRoutes = Object.keys(ROUTES).filter(allowed).slice(0, 4);
  const bottom = h('nav.bottom-nav',
    phoneRoutes.map((name) => h('a', { href: '#/' + name, 'data-route': name }, icon(name), h('span', t(name)), name === 'lpo' ? h('span.badge', { hidden: true }) : null)),
    h('a', { href: '#/more', 'data-route': 'more' }, icon('more'), h('span', t('more'))));

  title = h('h1', '');
  // a click on the indicator opens the list of refused saves (the phone also has it under "more")
  syncEl = h('div.sync', { title: t('refresh_now') }, h('span.dot'),
    h('button.sync-text', { type: 'button', onclick: refreshNow }, ''),
    h('button.sync-warn', { type: 'button', hidden: true, title: t('rejected_title'), onclick: () => { location.hash = '#/failed'; } }, ''));
  content = h('section.content');
  shellEl = h('div.shell', side, h('div.main', h('header.topbar', title, h('div.spacer'), syncEl), content));
  root.replaceChildren(shellEl, bottom);
  updateSync();
  updateBadges();
}

/** The user's own buttons: in the side menu, and on the home screen (where the side menu is hidden). */
function accountButtons() {
  return [
    h('button', { type: 'button', onclick: () => whatsNew(true) }, t('whats_new')),
    pushButton('button'),
    h('button', { type: 'button', onclick: changePin }, t('change_pin')),
    h('button', { type: 'button', onclick: toggleLang }, t('lang_other')),
    h('button', { type: 'button', onclick: logout }, t('logout'))];
}

const AUTO_REFRESH_MS = 30000;
let current = null;
function route() {
  if (current && current.dispose) current.dispose();
  let name = (location.hash.replace(/^#\/?/, '') || firstScreen()).split('?')[0];
  shellEl.classList.remove('at-home');
  if (name === 'more') return showMore();
  if (name === 'failed' && canSeeFailed()) return showFailed();
  if (!ROUTES[name] || !allowed(name)) name = firstScreen();
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  title.textContent = t(name);
  current = ROUTES[name].view;
  // home shows the other screens this user may open, as the menu does, and takes the menu's place (wide screens)
  shellEl.classList.toggle('at-home', name === 'home');
  const u = Data.user;
  current.render(content, name, { links: Object.keys(ROUTES).filter((r) => r !== 'home' && allowed(r)),
    account: name === 'home' ? { info: h('div.home-user', h('b', u.display_name), h('small', t('role_' + u.role) + ' · v' + APP_VERSION)),
      buttons: accountButtons().filter(Boolean) } : null });
  if (name === 'home') updateBadges();
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
    h('button.btn.secondary', { type: 'button', onclick: () => whatsNew(true) }, t('whats_new')),
    pushButton('button.btn.secondary'),
    h('button.btn.secondary', { type: 'button', onclick: changePin }, t('change_pin')),
    h('button.btn.secondary', { type: 'button', onclick: toggleLang }, t('lang_other')),
    h('button.btn.danger', { type: 'button', onclick: logout }, t('logout'))),
    canSeeFailed() ? failedCard() : '');
}

/** Only the admin (who manages users) opens the refused list from the indicator. */
const canSeeFailed = () => Outbox.failed.length > 0 && Data.can('users.save');

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
    list.map((f) => h('div.req-card', h('b', h('bdi', f.label || f.action)),
      h('span.muted', ' · ' + (t('job.' + f.action) === 'job.' + f.action ? f.action : t('job.' + f.action)) + ' · ' + fmtDateTime(new Date(f.at))),
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

/** LPOs waiting for the admin / decided for their writer: a number on the LPO menu link and on the app icon. */
function updateBadges() {
  const n = allowed('lpo') ? lpo.badgeCount() : 0;
  document.querySelectorAll('a[data-route="lpo"] .badge').forEach((b) => { b.hidden = !n; b.textContent = String(n); });
  Push.badge(n);
}

/** "Turn on notifications" for the users of the LPO screen, until this device receives them. */
function pushButton(tag) {
  if (!allowed('lpo')) return null;
  const st = Push.state();
  if (st === 'on' || st === 'off') return null;
  if (st === 'blocked') return h('small.muted.push-note', t('push_blocked'));
  const b = h(tag, { type: 'button', onclick: async () => {
    b.disabled = true;
    try {
      const now = await Push.enable();
      if (now === 'on') { toast(t('push_on'), 'ok'); b.remove(); }
      else { toast(t('push_blocked'), 'err'); b.disabled = false; }
    } catch { toast(t('push_failed'), 'err'); b.disabled = false; }
  } }, '🔔 ' + t('push_enable'));
  return b;
}
window.addEventListener('moro:badge', updateBadges);

window.addEventListener('hashchange', () => { if (content) route(); });
// fresh data redraws the dashboard only; work screens read the data live and keep what is being typed
let storesSeen = '';
window.addEventListener('moro:data', () => {
  // the admin changed this user's stores: redraw the screen so the store buttons follow at once
  const now = Data.myStores().join(',');
  const changed = storesSeen && now !== storesSeen;
  storesSeen = now;
  updateBadges();
  if (content && (current === dashboard || changed)) route();
});
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

/** Click on the connection line: send what is waiting, reload the data now, redraw the screen. */
let refreshing = false;
async function refreshNow() {
  if (refreshing) return;
  refreshing = true;
  syncEl.querySelector('.sync-text').textContent = t('refreshing');
  try {
    await Outbox.flush();
    await sync(true);
    toast(lastSyncOk ? t('refreshed') : t('offline'), lastSyncOk ? 'ok' : 'err');
  } finally { refreshing = false; updateSync(); }
}

function updateSync() {
  if (!syncEl || refreshing) return;
  const online = navigator.onLine && lastSyncOk;
  syncEl.classList.toggle('offline', !online);
  syncEl.classList.toggle('pending', online && Outbox.pending > 0);
  const at = Data.syncedAt ? new Date(Data.syncedAt).toLocaleTimeString(getLang() === 'ar' ? 'ar-QA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  syncEl.querySelector('.sync-text').textContent = (online ? t('online') : t('offline')) + (at ? ' · ' + t('updated_at', { t: at }) : '') +
    (Outbox.pending ? ' · ' + t('waiting_to_send', { n: Outbox.pending }) : '');
  const warn = syncEl.querySelector('.sync-warn');
  warn.hidden = !canSeeFailed();
  warn.textContent = '⚠ ' + Outbox.failed.length;
}

function toggleLang() {
  setLang(getLang() === 'ar' ? 'en' : 'ar');
  if (allowed('lpo')) Push.refresh();      // notifications follow the language of the app
  buildShell();
  route();
}

async function logout() {
  await Push.signOut();
  session.token = '';
  await kv.clear();
  location.hash = '';
  location.reload();
}

start();
