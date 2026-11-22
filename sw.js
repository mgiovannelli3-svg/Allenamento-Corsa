// Permette all'app di aprirsi anche senza connessione.
const CACHE = 'corsa-v8';
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'js/app.js', 'js/analysis.js', 'js/plan.js', 'js/store.js', 'js/fit.js', 'js/zip.js', 'js/csv.js', 'js/schedule.js', 'js/chat.js', 'js/feedback.js', 'js/coach.js', 'icons/icon.svg', 'icons/icon-192.png'];
// "no-cache": chiede sempre al sito se c'è una versione nuova, così dopo un aggiornamento
// non restano mai pezzi vecchi e pezzi nuovi mescolati.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'no-cache' })))));
  self.skipWaiting();
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
// Prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata se sei offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
