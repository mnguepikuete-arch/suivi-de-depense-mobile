/**
 * sw.js — Service Worker Budget Pro
 *
 * Rôle : mettre en cache TOUS les fichiers de l'app lors de
 * l'installation, puis les servir depuis le cache même sans réseau.
 * C'est ce qui permet d'ouvrir l'app comme WhatsApp : aucune
 * connexion requise après le premier chargement.
 */

const CACHE = 'budgetpro-v1';

// Tous les fichiers à mettre en cache (App Shell)
const ASSETS = [
  './index.html',
  './style.css',
  './db.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Chart.js sera mis en cache à la première visite
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// ── Installation : télécharger et cacher tous les fichiers ────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()) // Activer immédiatement
  );
});

// ── Activation : supprimer les anciens caches ─────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()) // Prendre le contrôle de toutes les pages
  );
});

// ── Fetch : intercepter toutes les requêtes réseau ────────────
// Stratégie : Cache d'abord, puis réseau si pas en cache
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached; // Réponse du cache (instantané)
      // Pas en cache : télécharger et mettre en cache pour la prochaine fois
      return fetch(e.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      });
    }).catch(() => {
      // Hors ligne et pas en cache : retourner index.html (app shell)
      return caches.match('./index.html');
    })
  );
});
