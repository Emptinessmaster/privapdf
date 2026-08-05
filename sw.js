/* =========================================================================
   PrivaPDF — Service Worker
   Rende l'app installabile e completamente funzionante OFFLINE.
   Strategia: cache-first per l'app shell e le librerie PDF (CDN),
   con fallback di rete per tutto il resto.
   ========================================================================= */
var CACHE = 'privapdf-v2';

var APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  // Librerie PDF (necessarie per l'uso offline)
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Cache-iamo ogni risorsa singolarmente per resilienza. Usiamo fetch+put
      // (non cache.add) perché cache.add rifiuta le risposte opache: i CDN
      // (jsdelivr) inviano header CORS, quindi un fetch normale restituisce 200.
      return Promise.all(APP_SHELL.map(function (url) {
        return fetch(url, { cache: 'reload' }).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) return cache.put(url, res);
        }).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        // Metti in cache le nuove GET riuscite (incluse le librerie CDN).
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); }).catch(function () {});
        return res;
      }).catch(function () {
        // Offline e non in cache: per le navigazioni, mostra l'app shell.
        if (req.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
