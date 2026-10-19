/* Service worker: keeps the app shell available offline. Data never goes through here –
   it is cached in IndexedDB by the app (js/db.js). Bump VERSION on every release. */
const VERSION = 'moro-v0.9.16';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/api.js', 'js/db.js', 'js/i18n.js', 'js/ui.js', 'js/data.js',
  'js/views/login.js', 'js/views/dashboard.js', 'js/views/soon.js', 'js/components.js', 'js/outbox.js',
  'js/views/receive.js', 'js/views/issue.js', 'js/views/production.js', 'js/views/requests.js', 'js/views/masters.js', 'js/views/users.js',
  'js/reports.js', 'js/xlsx.js', 'js/views/reports.js', 'js/movstore.js', 'js/views/shoporders.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/logo.png'
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
