/* =========================================================================
   PrivaPDF — Service Worker
   Rende l'app installabile e completamente funzionante OFFLINE.

   Strategia:
   - App shell same-origin (HTML/CSS/JS/manifest/icone) e navigazioni:
     NETWORK-FIRST. Online prende sempre l'ultima versione (l'app non resta
     "congelata" su una copia vecchia in cache); offline usa la cache.
   - Librerie CDN (pdf-lib, pdf.js) con URL versionati e immutabili:
     CACHE-FIRST (veloci e sufficienti per l'uso offline).
   ========================================================================= */
var CACHE = 'privapdf-v5';

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
      // fetch+put (non cache.add) perché cache.add rifiuta le risposte opache:
      // i CDN (jsdelivr) inviano header CORS, quindi un fetch normale dà 200.
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

// Permette alla pagina di forzare l'attivazione immediata del nuovo SW.
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function putInCache(req, res) {
  var copy = res.clone();
  caches.open(CACHE).then(function (cache) { cache.put(req, copy); }).catch(function () {});
  return res;
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var isNav = req.mode === 'navigate';

  if (sameOrigin || isNav) {
    // NETWORK-FIRST: prova la rete (aggiorna la cache), altrimenti la cache.
    event.respondWith(
      fetch(req).then(function (res) {
        return putInCache(req, res);
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || (isNav ? caches.match('./index.html') : Response.error());
        });
      })
    );
    return;
  }

  // CROSS-ORIGIN (CDN immutabili): CACHE-FIRST con fallback di rete.
  event.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) { return putInCache(req, res); });
    })
  );
});
