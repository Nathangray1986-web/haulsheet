/* Haul Sheet app shell. Bump CACHE to refresh installed copies. */
var CACHE = 'haul-sheet-shell-v20';
var SHELL = [
  './',
  './index.html',
  './computer.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* Bypass the HTTP cache so a new worker never precaches stale files. */
      return cache.addAll(SHELL.map(function (url) {
        return new Request(url, { cache: 'reload' });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key !== CACHE;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.indexOf('shared-loads.json') !== -1) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }
  if (req.mode === 'navigate') {
    /* Cache each page under its own key so computer.html never overwrites index.html. */
    var path = '';
    try { path = new URL(req.url).pathname; } catch (e) {}
    var key = /\/computer\.html$/i.test(path) ? './computer.html'
      : (/\/$/.test(path) || /\/index\.html$/i.test(path)) ? './index.html'
      : null;
    event.respondWith(
      (key ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
        return (res && res.redirected) ? fetch(req) : res;
      }, function () {
        return fetch(req);
      }) : fetch(req)).then(function (res) {
        if (key && res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(key, copy);
          });
        }
        return res;
      }).catch(function () {
        return caches.match(key || req).then(function (hit) {
          return hit || caches.match('./index.html');
        }).then(function (hit) {
          return hit || caches.match('./');
        });
      })
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      var sameOrigin = false;
      try { sameOrigin = new URL(req.url).origin === self.location.origin; } catch (e) {}
      /* Revalidate same-origin misses with the server instead of trusting the HTTP cache. */
      return (sameOrigin ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req)).then(function (res) {
        try {
          if (res && res.ok && sameOrigin) {
            var copy = res.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put(req, copy);
            });
          }
        } catch (e) {}
        return res;
      });
    })
  );
});
