// Guscio offline: solo i file statici dell'app. Le risposte /api/* non passano mai dalla cache (dati personali).
const CACHE = 'studio-guscio-v1';
const SHELL = ['/', '/app.js', '/style.css', '/manifest.webmanifest', '/icon.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return; // in rete, mai in cache
  const key = req.mode === 'navigate' ? '/' : url.pathname;
  if (req.mode !== 'navigate' && !SHELL.includes(url.pathname)) return;
  // rete prima (dopo un deploy arrivano i file nuovi), ripiego sulla cache
  e.respondWith(fetch(req).then((r) => {
    if (r.ok && SHELL.includes(key)) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
    return r;
  }).catch(() => caches.match(key).then((m) => m || Response.error())));
});
