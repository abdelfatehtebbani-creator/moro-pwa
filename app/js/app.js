// App start: service worker, sign-in, the shell (side menu / phone bottom bar), routing and sync.
import { call, session, ApiError } from './api.js';
import { APP_VERSION, IDLE_HOME_MINUTES } from './config.js';
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
import * as orders from './views/orders.js';
import * as trips from './views/trips.js';
import * as invoices from './views/invoices.js';
import * as returns from './views/returns.js';
import * as accounts from './views/accounts.js';
import * as exec from './views/exec.js';
import * as branches from './views/branches.js';
import * as guide from './views/guide.js';
import * as batches from './views/batches.js';
import { GROUPS, Counts } from './groups.js';
import * as counts from './views/counts.js';
import * as lpo from './views/lpo.js';
import * as coffee from './views/coffee.js';

const ROUTES = {
  home:      { view: home, perm: 'data.bootstrap', group: 'nav_main' },
  exec:      { view: exec, perm: 'nav.exec', group: 'nav_main' },
  branches:  { view: branches, perm: 'nav.branches', group: 'nav_main' },
  dashboard: { view: dashboard, perm: 'nav.dashboard', group: 'nav_main' },
  orders:    { view: orders, perm: 'nav.orders', group: 'nav_ops' },
  orderapprove: { view: orders, perm: 'nav.orderapprove', group: 'nav_ops' },
  trips:     { view: trips, perm: 'nav.trips', group: 'nav_ops' },
  invoices:  { view: invoices, perm: 'nav.invoices', group: 'nav_ops' },
  returns:   { view: returns, perm: 'nav.returns', group: 'nav_ops' },
  accounts:  { view: accounts, perm: 'nav.accounts', group: 'nav_ops' },
  receive:   { view: receive, perm: 'nav.receive', group: 'nav_ops' },
  lpo:       { view: lpo, perm: 'nav.lpo', group: 'nav_ops' },
  issue:     { view: issue, perm: 'nav.issue', group: 'nav_ops' },
  production:{ view: production, perm: 'nav.production', group: 'nav_ops' },
  batches:   { view: batches, perm: 'nav.batches', group: 'nav_ops' },
  requests:  { view: requests, perm: 'nav.requests', group: 'nav_ops' },
  shoporders:{ view: shoporders, perm: 'nav.shoporders', group: 'nav_ops' },
  reports:   { view: reports, perm: 'nav.reports', group: 'nav_ops' },
  counts:    { view: counts, perm: 'nav.counts', group: 'nav_ops' },
  coffee:    { view: coffee, perm: 'nav.coffee', group: 'nav_tools' },
  masters:   { view: masters, perm: 'nav.masters', group: 'nav_admin' },
  users:     { view: users, perm: 'nav.users', group: 'nav_admin' },
  // the user guide: everyone
  guide:     { view: guide, perm: 'data.bootstrap', group: 'nav_admin' },
};

const root = document.getElementById('app');
let content, title, syncEl, shellEl, homeLayer, helpBtn;
// the screen the guide was opened from: "✕" goes back to it
let guideFrom = '';

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
    let setupNeeded = false, noPin = false;
    root.replaceChildren(h('div.boot', h('img', { src: 'icons/logo.png', alt: '', width: 96, height: 96 }), h('span', 'MORO'),
      h('small', t('connecting'))));
    // a slow or missing answer (8 s at most) only means "show the sign-in screen"
    try { const p = await call('ping'); setupNeeded = p.setup_needed; noPin = p.no_pin === true; } catch { /* offline: show login */ }
    window.__moroStarted = true;           // the sign-in screen is up
    await showAuth(root, setupNeeded, noPin);
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
  Push.refresh();
  if (cached) sync(true);
  setInterval(() => { if (document.visibilityState === 'visible') sync(false); }, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(false); });
}

function allowed(name) { return Data.can(ROUTES[name].perm); }
// the first screen: home (every user may open it)
function firstScreen() {
  if (Data.user && Data.user.role === 'pdg' && allowed('exec')) return 'exec';
  if (Data.user && Data.user.role === 'branch_manager' && allowed('branches')) return 'branches';
  if (Data.user && Data.user.role === 'food_safety' && allowed('batches')) return 'batches';
  return Object.keys(ROUTES).find(allowed) || 'home';
}

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

/** The group of the screen being opened is unfolded (without changing what is remembered). */
function openNavOf(name) {
  const a = document.querySelector('.nav [data-route="' + name + '"]');
  const sec = a && a.closest('.nav-sec');
  if (sec && sec.classList.contains('folded')) sec.classList.remove('folded');
}

function buildShell() {
  const u = Data.user;
  const navLinks = [];
  let group = '';
  // the admin: the menu in the same groups as the home screen
  const groupOf = (name) => (u.role === 'admin' && name !== 'home' ? ((GROUPS.find((g) => g[1].includes(name)) || ['grp_other'])[0]) : ROUTES[name].group);
  const order = u.role === 'admin' ? ['home'].concat(GROUPS.flatMap((g) => g[1]).filter((r) => ROUTES[r]), Object.keys(ROUTES).filter((r) => r !== 'home' && !GROUPS.some((g) => g[1].includes(r))))
    : Object.keys(ROUTES);
  // each group of the menu folds with a press on its title; what was folded is remembered on this device
  let folded = [];
  try { folded = JSON.parse(localStorage.getItem('moro.navFold') || '[]'); } catch (e) { folded = []; }
  let items = null;
  for (const name of order) {
    if (!allowed(name)) continue;
    if (groupOf(name) !== group) {
      group = groupOf(name);
      const key = group;
      items = h('div.nav-items');
      const sec = h('div.nav-sec', { class: folded.includes(key) ? 'folded' : '' });
      sec.append(h('button.nav-group', { type: 'button', 'aria-expanded': String(!folded.includes(key)), onclick: () => {
        const now = !sec.classList.toggle('folded');
        sec.querySelector('.nav-group').setAttribute('aria-expanded', String(now));
        let f = [];
        try { f = JSON.parse(localStorage.getItem('moro.navFold') || '[]'); } catch (e) { f = []; }
        f = f.filter((k) => k !== key).concat(now ? [] : [key]);
        try { localStorage.setItem('moro.navFold', JSON.stringify(f)); } catch (e) { /* private mode */ }
      } }, h('span', t(group)), h('span.nav-arrow', '▾')), items);
      navLinks.push(sec);
    }
    (items || { append: (x) => navLinks.push(x) }).append(h('a', { href: '#/' + name, 'data-route': name }, icon(name), h('span', t(name)), ['lpo', 'requests', 'orderapprove', 'shoporders', 'production', 'orders', 'trips', 'invoices', 'returns'].includes(name) ? h('span.badge', { hidden: true }) : null));
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
    phoneRoutes.map((name) => h('a', { href: '#/' + name, 'data-route': name }, icon(name), h('span', t(name)), ['lpo', 'requests', 'orderapprove', 'shoporders', 'production', 'orders', 'trips', 'invoices', 'returns'].includes(name) ? h('span.badge', { hidden: true }) : null)),
    h('a', { href: '#/more', 'data-route': 'more' }, icon('more'), h('span', t('more'))));

  title = h('h1', '');
  // a click on the indicator opens the list of refused saves (the phone also has it under "more")
  syncEl = h('div.sync', { title: t('refresh_now') }, h('span.dot'),
    h('button.sync-text', { type: 'button', onclick: refreshNow }, ''),
    h('button.sync-warn', { type: 'button', hidden: true, title: t('rejected_title'), onclick: () => { location.hash = '#/failed'; } }, ''));
  content = h('section.content');
  // the home screen shown over an idle screen (that screen stays as it is, behind it)
  homeLayer = h('section.content', { hidden: true });
  // "?": the guide, at the chapter that explains this screen
  // "?" opens the guide at this screen's chapter; in the guide it turns into "✕" and goes back to that screen
  const help = helpBtn = h('button.help-btn', { type: 'button', title: t('guide'), 'aria-label': t('guide'), onclick: () => {
    if (currentName === 'guide') { location.hash = '#/' + (guideFrom || firstScreen()); return; }
    guideFrom = currentName || '';
    location.hash = '#/guide?s=' + guideFrom;
  } }, '?');
  shellEl = h('div.shell', side, h('div.main', h('header.topbar', title, help, h('div.spacer'),
    // who is signed in, on every screen
    h('div.top-user', { title: Data.user.display_name + ' · ' + t('role_' + Data.user.role) }, h('span.top-user-ico', '👤'), h('bdi', Data.user.display_name)), syncEl,
    // the admin (and the developer's account): the version, the language and sign out always at hand
    Data.user.role === 'admin' ? h('div.top-admin', h('span.top-ver', { title: t('whats_new'), onclick: () => whatsNew(true) }, 'v' + APP_VERSION),
      h('button.btn.secondary.small', { type: 'button', onclick: toggleLang }, t('lang_other')),
      h('button.btn.secondary.small', { type: 'button', onclick: logout }, t('logout'))) : null), content, homeLayer));
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
let currentName = '';
const hashName = () => (location.hash.replace(/^#\/?/, '') || firstScreen()).split('?')[0];
/** What the home screen needs: the other screens this user may open, the user's own buttons, the screen to resume. */
function homeCtx(resume) {
  const u = Data.user;
  return { links: Object.keys(ROUTES).filter((r) => r !== 'home' && allowed(r)), resume,
    account: { info: h('div.home-user', h('b', u.display_name), h('small', t('role_' + u.role) + ' · v' + APP_VERSION)),
      // what's new and notifications with the name; PIN, language and sign out on the other side
      buttons: accountButtons() } };
}
function route() {
  closeIdleHome();
  if (current && current.dispose) current.dispose();
  let name = hashName();
  currentName = '';
  shellEl.classList.remove('at-home');
  if (name === 'more') return showMore();
  if (name === 'failed' && canSeeFailed()) return showFailed();
  if (!ROUTES[name] || !allowed(name)) name = firstScreen();
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  openNavOf(name);
  title.textContent = t(name);
  if (helpBtn) { helpBtn.textContent = name === 'guide' ? '✕' : '?'; helpBtn.title = name === 'guide' ? t('guide_close') : t('guide'); }
  current = ROUTES[name].view;
  currentName = name;
  // home shows the other screens this user may open, as the menu does, and takes the menu's place (wide screens)
  shellEl.classList.toggle('at-home', name === 'home');
  current.render(content, name, name === 'home' ? homeCtx(null) : { links: [] });
  if (name === 'home') updateBadges();
  window.scrollTo(0, 0);
}

// ---------- back to the home screen after IDLE_HOME_MINUTES without a touch or a key
// The open screen is not closed: it is hidden behind the home screen with everything typed in it, and its
// button there says "continue" and brings it back as it was. Not while a window (dialog) is open.
let idleFrom = '';
let lastActive = Date.now();
['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'].forEach((ev) => document.addEventListener(ev, () => { lastActive = Date.now(); }, { capture: true, passive: true }));
setInterval(() => {
  if (!content || idleFrom || !currentName || currentName === 'home' || !ROUTES.home) return;
  if (document.querySelector('.dialog-back')) return;
  const set = Number((Data.settings || {}).idle_home_minutes);
  const minutes = (Data.settings || {}).idle_home_minutes !== undefined && (Data.settings || {}).idle_home_minutes !== '' && isFinite(set) ? set : IDLE_HOME_MINUTES;
  if (minutes > 0 && Date.now() - lastActive >= minutes * 60000) showIdleHome();
}, 15000);

function showIdleHome() {
  idleFrom = currentName;
  content.hidden = true;
  homeLayer.hidden = false;
  shellEl.classList.add('at-home');
  title.textContent = t('home');
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === 'home'));
  home.render(homeLayer, 'home', homeCtx({ name: idleFrom, onResume: resumeIdle }));
  updateBadges();
}
function closeIdleHome() {
  if (!idleFrom) return;
  idleFrom = '';
  home.dispose();
  homeLayer.replaceChildren();
  homeLayer.hidden = true;
  content.hidden = false;
}
/** Back to the screen left behind the home screen, exactly as it was. */
function resumeIdle() {
  const name = idleFrom;
  closeIdleHome();
  lastActive = Date.now();
  shellEl.classList.toggle('at-home', name === 'home');
  title.textContent = t(name);
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  openNavOf(name);
}
/** Something typed in the screen and not saved yet: a field that differs from what it showed when it was drawn. */
function hasUnsaved(root) {
  return [...root.querySelectorAll('input, select, textarea')].some((el) => {
    if (el.disabled || el.readOnly || el.type === 'hidden' || el.type === 'file') return false;
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked !== el.defaultChecked;
    if (el.tagName === 'SELECT') { const d = [...el.options].findIndex((o) => o.defaultSelected); return el.options.length > 0 && el.selectedIndex !== Math.max(0, d); }
    return String(el.value).trim() !== String(el.defaultValue).trim();
  });
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
  // department requests waiting for this user: lines to give, or their own requests to answer
  const r = allowed('requests') ? Number((Data.boot || {}).requests_todo) || 0 : 0;
  document.querySelectorAll('a[data-route="requests"] .badge').forEach((b) => { b.hidden = !r; b.textContent = String(r); });
  document.querySelectorAll('.home-note-req').forEach((x) => { x.hidden = !r; x.textContent = t('open_requests', { n: r }); });
  // sent orders waiting for distribution's approval
  // orders waiting for distribution's approval, and orders late on their way (the follow-up tab)
  const o = allowed('orderapprove') ? (Number((Data.boot || {}).orders_pending) || 0) + (Number((Data.boot || {}).follow_late) || 0) : 0;
  document.querySelectorAll('a[data-route="orderapprove"] .badge').forEach((b) => { b.hidden = !o; b.textContent = String(o); });
  // the branch manager: their shops' orders late on their way
  const bl = allowed('branches') ? Number((Data.boot || {}).branch_late) || 0 : 0;
  document.querySelectorAll('a[data-route="branches"] .badge').forEach((b) => { b.hidden = !bl; b.textContent = String(bl); });
  // orders whose lines this user prepares (their stores, their departments)
  const sp = allowed('shoporders') ? Number((Data.boot || {}).shop_todo) || 0 : 0;
  document.querySelectorAll('a[data-route="shoporders"] .badge').forEach((b) => { b.hidden = !sp; b.textContent = String(sp); });
  // products the orders wait for that are not made yet (the department's production screen)
  const pr = allowed('production') ? Number((Data.boot || {}).prod_todo) || 0 : 0;
  document.querySelectorAll('a[data-route="production"] .badge').forEach((b) => { b.hidden = !pr; b.textContent = String(pr); });
  // the rest of the order cycle: the cashier's orders to receive, trips to make or drive, orders to invoice
  const ot = (Data.boot || {}).order_todo || {};
  const more = [['orders', 'orders'], ['trips', 'trips'], ['invoices', 'invoices'], ['returns', 'returns']].map(([route, key]) => {
    const c = allowed(route) ? Number(ot[key]) || 0 : 0;
    document.querySelectorAll('a[data-route="' + route + '"] .badge').forEach((b) => { b.hidden = !c; b.textContent = String(c); });
    return c;
  }).reduce((a, b) => a + b, 0);
  Push.badge(n + r + o + bl + sp + pr + more);
  // the same numbers for "waiting for you" on the admin's home screen
  const ot2 = (Data.boot || {}).order_todo || {};
  Counts.now = { lpo: n, requests: r, orderapprove: o, shoporders: sp, production: pr, orders: allowed('orders') ? Number(ot2.orders) || 0 : 0,
    trips: allowed('trips') ? Number(ot2.trips) || 0 : 0, invoices: allowed('invoices') ? Number(ot2.invoices) || 0 : 0, returns: allowed('returns') ? Number(ot2.returns) || 0 : 0 };
  window.dispatchEvent(new Event('moro:badges'));
}

/** "Turn on notifications" for the users of the LPO screen, until this device receives them. */
function pushButton(tag) {
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

window.addEventListener('hashchange', async () => {
  if (!content) return;
  if (idleFrom) {
    // the home screen over an idle screen: its own button brings it back; another screen asks first if it has unsaved data
    if (hashName() === idleFrom) { resumeIdle(); return; }
    if (hasUnsaved(content)) {
      const leave = await dialog((close) => [h('h3', t('idle_unsaved_title')), h('p', t('idle_unsaved', { screen: t(idleFrom) })),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('idle_stay')),
          h('button.btn', { type: 'button', onclick: () => close(true) }, t('idle_leave')))]);
      if (!leave) { history.replaceState(null, '', '#/' + idleFrom); resumeIdle(); return; }
    }
  }
  route();
});
// fresh data redraws the dashboard only; work screens read the data live and keep what is being typed
let storesSeen = '';
window.addEventListener('moro:data', () => {
  // the admin changed this user's stores: redraw the screen so the store buttons follow at once
  const now = Data.myStores().join(',');
  const changed = storesSeen && now !== storesSeen;
  storesSeen = now;
  updateBadges();
  if (content && !idleFrom && (current === dashboard || changed)) route();
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
  Push.refresh();      // notifications follow the language of the app
  buildShell();
  route();
}

async function logout() {
  // a cashier still on shift: the shift is ended with its amount first (or kept open on purpose)
  if (Data.user && Data.user.shop && Data.can('orders.shiftEnd')) {
    const res = await dialog((close) => {
      const amount = h('input.input.num#lo-amount', { type: 'number', step: 'any', min: 0, inputmode: 'decimal' });
      const note = h('input.input#lo-note');
      return [h('h3', t('logout_shift_title')), h('p', t('logout_shift_help')),
        h('div.field', h('label', t('shift_amount')), amount), h('div.field', h('label', t('note')), note),
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close('keep') }, t('logout_keep')),
          h('button.btn', { type: 'button', onclick: () => (amount.value === '' || Number(amount.value) < 0 ? flash(amount) : close({ amount: Number(amount.value), note: note.value.trim() })) }, t('logout_end_shift')))];
    });
    if (!res) return;
    if (res !== 'keep') { try { await call('orders.shiftEnd', res); } catch (e) { toast(errText(e), 'err'); return; } }
  }
  await Push.signOut();
  session.token = '';
  await kv.clear();
  location.hash = '';
  location.reload();
}

start();
