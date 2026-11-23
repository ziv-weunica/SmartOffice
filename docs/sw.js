/* Unica Smart Office service worker: app shell works offline; updates are picked up when online.
   Radio API / streams / station logos are never cached (cross-origin passes straight through). */
const CACHE = 'unica-home-v5';
const SHELL = ['./', 'index.html', 'style.css?v=5', 'app.js?v=5', 'radio.js?v=5', 'manifest.webmanifest',
  'assets/logo.svg', 'assets/fonts/heebo-hebrew-wght-normal.woff2', 'assets/fonts/heebo-latin-wght-normal.woff2',
  'assets/icon-192.png', 'assets/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // network first (fresh after every deploy), cache as the offline fallback
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});
