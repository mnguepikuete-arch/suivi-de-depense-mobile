const CACHE = 'bp-v1';
const ASSETS = ['./index.html','./style.css','./db.js','./app.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e => { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })).catch(() => caches.match('./index.html'))); });
