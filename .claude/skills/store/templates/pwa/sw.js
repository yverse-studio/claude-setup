// Makes the app installable and gives it an offline page. The API is never cached: ideas and taps
// always come fresh from the Worker. Bump VERSION when a cached file changes shape.
const VERSION = 'v1'
const SHELL = ['/', '/offline', '/app.css', '/app.js', '/manifest.webmanifest', '/icons/icon-192.png',
  '/fonts/kalam-latin-700-normal.woff2', '/fonts/atkinson-hyperlegible-latin-400-normal.woff2', '/fonts/atkinson-hyperlegible-latin-700-normal.woff2']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return
  // network first, so a deploy shows at once; the cache only covers being offline
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)) }
    return res
  }).catch(async () => (await caches.match(e.request)) || (e.request.mode === 'navigate' ? caches.match('/offline') : Response.error())))
})
