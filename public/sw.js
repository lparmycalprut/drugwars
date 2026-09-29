const CACHE = 'bpwars-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/art.js', '/img/icon.png', '/img/boss.png', '/manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return; // always live, server is the authority
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
    const copy = res.clone();
    if (res.ok && e.request.method === 'GET') caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match('/index.html'))));
});
