const CACHE_NAME = 'jewelria-v0.1.0';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './version.json',
  './assets/css/style.css',
  './assets/js/main.js',
  './assets/js/board.js',
  './assets/js/gem.js',
  './assets/js/input.js',
  './assets/js/score.js',
  './assets/js/stage.js',
  './assets/js/ui.js',
  './assets/js/audio.js',
  './assets/js/storage.js',
  './assets/js/ga.js',
  './assets/js/browser-check.js',
  './assets/images/ui/jewelria-splash.png',
  './assets/images/ui/jewelria-link.png',
  './assets/images/ui/icon-192.png',
  './assets/images/ui/icon-512.png',
  './assets/images/gems/ruby.png',
  './assets/images/gems/sapphire.png',
  './assets/images/gems/emerald.png',
  './assets/images/gems/topaz.png',
  './assets/images/gems/amethyst.png',
  './assets/images/gems/citrine.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
