/* Service worker: keeps the app shell available offline. Data never goes through here –
   it is cached in IndexedDB by the app (js/db.js). Bump VERSION on every release. */
const VERSION = 'moro-v0.8.36';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/api.js', 'js/db.js', 'js/i18n.js', 'js/ui.js', 'js/data.js',
  'js/views/login.js', 'js/views/home.js', 'js/disc.js', 'css/disc.css', 'js/views/dashboard.js', 'js/views/soon.js', 'js/components.js', 'js/outbox.js',
  'js/views/receive.js', 'js/views/issue.js', 'js/views/production.js', 'js/views/requests.js', 'js/views/masters.js', 'js/views/users.js',
  'js/reports.js', 'js/xlsx.js', 'js/views/reports.js', 'js/movstore.js', 'js/views/counts.js', 'js/views/lpo.js', 'js/views/cash.js', 'js/views/coffee.js', 'js/changelog.js', 'js/push.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/logo.png', 'icons/lpo-logo.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;   // API and fonts go to the network
  // network first, so a new release is picked up when online; cache when offline.
  // 'no-cache' makes the browser check the server every time (GitHub Pages lets files be reused
  // for 10 minutes otherwise, which kept an old version running after an update).
  e.respondWith(
    fetch(new Request(e.request, { cache: 'no-cache' })).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

// ---------- notifications (Firebase Cloud Messaging delivers a standard Web Push: data {title, body, page, badge})
// every push shows a notification (an iPhone drops subscriptions that receive silent pushes)
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = {}; }
  const d = p.data || p;
  const badge = Number(d.badge || 0);
  const shown = self.registration.showNotification(d.title || 'MORO', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'moro-' + (d.page || 'app'), renotify: true, vibrate: [200, 100, 200],
    data: { page: d.page || '' },
  });
  const counted = badge > 0 && self.navigator.setAppBadge ? self.navigator.setAppBadge(badge).catch(() => {}) : Promise.resolve();
  e.waitUntil(Promise.all([shown, counted]));
});

// a tap opens the app on the screen the notification is about, reusing an open window
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const page = e.notification.data && e.notification.data.page;
  const url = new URL(page ? './#/' + page : './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) return open.navigate(url).then((c) => (c || open).focus()).catch(() => open.focus());
    return self.clients.openWindow(url);
  }));
});
