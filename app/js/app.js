// App start: service worker, sign-in, the shell (side menu / phone bottom bar), routing and sync.
import { call, session, ApiError } from './api.js';
import { kv } from './db.js';
import { Data } from './data.js';
import { t, applyLang, getLang, setLang, errText } from './i18n.js';
import { h, icon, toast } from './ui.js';
import { showAuth } from './views/login.js';
import * as dashboard from './views/dashboard.js';
import * as soon from './views/soon.js';

const ROUTES = {
  dashboard: { view: dashboard, perm: 'data.bootstrap', group: 'nav_main' },
  receive:   { view: soon, perm: 'kind.RECEIPT', group: 'nav_ops' },
  issue:     { view: soon, perm: 'kind.ISSUE', group: 'nav_ops' },
  production:{ view: soon, perm: 'kind.PROD_OUTPUT', group: 'nav_ops' },
  requests:  { view: soon, perm: 'requests.list', group: 'nav_ops' },
  reports:   { view: soon, perm: 'movements.query', group: 'nav_ops' },
  masters:   { view: soon, perm: 'items.save', group: 'nav_admin' },
  users:     { view: soon, perm: 'users.list', group: 'nav_admin' },
};

const root = document.getElementById('app');
let content, title, syncEl;

applyLang();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

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
  buildShell();
  route();
  if (cached) sync(true);
  setInterval(() => { if (document.visibilityState === 'visible') sync(false); }, 60000);
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
    h('div.brand', h('img', { src: 'icons/logo.png', alt: '' }), h('div', h('b', t('app_name')), h('small', t('app_sub')))),
    h('nav.nav', navLinks),
    h('div.side-foot',
      h('div', u.display_name, h('br'), h('small', t('role_' + u.role))),
      h('button', { type: 'button', onclick: toggleLang }, t('lang_other')),
      h('button', { type: 'button', onclick: logout }, t('logout'))));

  // phone: the first four allowed screens + "more" (opens the full menu)
  const phoneRoutes = Object.keys(ROUTES).filter(allowed).slice(0, 4);
  const bottom = h('nav.bottom-nav',
    phoneRoutes.map((name) => h('a', { href: '#/' + name, 'data-route': name }, icon(name), h('span', t(name)))),
    h('a', { href: '#/more', 'data-route': 'more' }, icon('more'), h('span', t('more'))));

  title = h('h1', '');
  syncEl = h('div.sync', h('span.dot'), h('span', ''));
  content = h('section.content');
  root.replaceChildren(h('div.shell', side, h('div.main', h('header.topbar', title, h('div.spacer'), syncEl), content)), bottom);
  updateSync();
}

function route() {
  let name = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  if (name === 'more') return showMore();
  if (!ROUTES[name] || !allowed(name)) name = 'dashboard';
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  title.textContent = t(name);
  ROUTES[name].view.render(content, name);
  window.scrollTo(0, 0);
}

function showMore() {
  title.textContent = t('more');
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === 'more'));
  const u = Data.user;
  content.replaceChildren(h('div.card',
    h('div', h('b', u.display_name), ' · ', h('span.muted', t('role_' + u.role))),
    h('nav.nav', { style: 'display:grid;gap:4px' }, Object.keys(ROUTES).filter(allowed).map((name) =>
      h('a', { href: '#/' + name, style: 'color:var(--ink)' }, icon(name), h('span', t(name))))),
    h('button.btn.secondary', { type: 'button', onclick: toggleLang }, t('lang_other')),
    h('button.btn.danger', { type: 'button', onclick: logout }, t('logout'))));
}

window.addEventListener('hashchange', () => { if (content) route(); });
window.addEventListener('moro:data', () => { if (content) route(); });
window.addEventListener('online', () => sync(false));
window.addEventListener('offline', updateSync);

let lastSyncOk = navigator.onLine;
async function sync(force) {
  try {
    if (force) await Data.refresh(); else await Data.refreshIfChanged();
    lastSyncOk = true;
  } catch (e) {
    lastSyncOk = false;
  }
  updateSync();
}

function updateSync() {
  if (!syncEl) return;
  const online = navigator.onLine && lastSyncOk;
  syncEl.classList.toggle('offline', !online);
  const at = Data.syncedAt ? new Date(Data.syncedAt).toLocaleTimeString(getLang() === 'ar' ? 'ar-QA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  syncEl.lastChild.textContent = (online ? t('online') : t('offline')) + (at ? ' · ' + t('updated_at', { t: at }) : '');
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
