self.__ARCHERLAB_GAME_ID__ = 'jewelria-service-worker';
importScripts('../shared/service-worker-error-reporter.js?v=20260710-d1-v2');

const CACHE_NAME = 'jewelria-20261008-fullscreen-link-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './version.json',
  './assets/css/style.css',
  './assets/css/premium.css',
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
  './assets/images/gems/citrine.png',
  './assets/images/effects/gem-shatter-strip.png',
  './assets/images/effects/gem-shatter-ruby.png',
  './assets/images/effects/gem-shatter-sapphire.png',
  './assets/images/effects/gem-shatter-emerald.png',
  './assets/images/effects/gem-shatter-topaz.png',
  './assets/images/effects/gem-shatter-amethyst.png',
  './assets/images/effects/gem-shatter-citrine.png',
  './assets/images/effects/gem-shards-atlas.png',
  './assets/images/effects/gem-shards-ruby.png',
  './assets/images/effects/gem-shards-sapphire.png',
  './assets/images/effects/gem-shards-emerald.png',
  './assets/images/effects/gem-shards-topaz.png',
  './assets/images/effects/gem-shards-amethyst.png',
  './assets/images/effects/gem-shards-citrine.png',
  './assets/images/effects/gem-land-sparkle-strip.png',
  './assets/images/ui/ui-board-frame.png',
  './assets/images/ui/ui-hud-panel.png',
  './assets/images/ui/ui-modal-panel.png',
  './assets/images/ui/ui-title-plaque.png',
  './assets/images/ui/ui-button-primary.png',
  './assets/images/ui/ui-button-secondary.png',
  './assets/images/ui/ui-button-ghost.png',
  './assets/images/ui/ui-icon-button.png',
  './assets/images/ui/crafted-button-v1.webp',
  './assets/images/ui/crafted-frame-v1.webp',
  './assets/sounds/bgm_main_loop.mp3',
  './assets/sounds/bgm_game_loop.mp3',
  './assets/sounds/sfx/swap.mp3',
  './assets/sounds/sfx/invalid.mp3',
  './assets/sounds/sfx/match.mp3',
  './assets/sounds/sfx/combo.mp3',
  './assets/sounds/sfx/special.mp3',
  './assets/sounds/sfx/cascade.mp3',
  './assets/sounds/sfx/clear.mp3',
  './assets/sounds/sfx/fail.mp3',
  './assets/sounds/sfx/button.mp3'
];
const CACHE_ASSETS = [...new Set(CORE_ASSETS.map((asset) => (
  asset.endsWith('.png') ? asset.replace(/\.png$/i, '.webp') : asset
)))];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(CACHE_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('jewelria-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function matchCurrent(request) {
  return caches.match(request, { cacheName: CACHE_NAME }).catch(() => undefined);
}

function navigationKey(request) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  if (url.pathname.endsWith('/')) url.pathname += 'index.html';
  else if (/\/index(?:-[a-z]{2})?$/.test(url.pathname)) url.pathname += '.html';
  return url.href;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/_account/')) return;

  // Refresh documents so an installed app can receive its native session script.
  // Keep the previous document only as an offline fallback.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    const documentKey = navigationKey(event.request);
    const navigation = fetch(event.request).then((response) => {
      let cacheWrite = Promise.resolve();
      if (response.ok) {
        const copy = response.clone();
        cacheWrite = caches.open(CACHE_NAME).then((cache) => cache.put(documentKey, copy));
      }
      return { response, cacheWrite };
    });
    event.waitUntil(navigation.then(entry => entry.cacheWrite).catch(() => {}));
    event.respondWith(navigation.then(entry => entry.response).catch(async () =>
      await matchCurrent(documentKey) || new Response('', { status: 503, statusText: 'Offline document unavailable' })
    ));
    return;
  }

  const result = matchCurrent(event.request).then((cached) => {
    if (cached) return { response: cached, cacheWrite: Promise.resolve() };
    return fetch(event.request).then((response) => {
      let cacheWrite = Promise.resolve();
      if (response && response.ok) {
        const copy = response.clone();
        cacheWrite = caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return { response, cacheWrite };
    });
  }).catch(() => ({
    response: event.request.mode === 'navigate' || event.request.destination === 'document'
      ? caches.match('./index.html')
      : new Response('', { status: 504, statusText: 'Offline asset unavailable' }),
    cacheWrite: Promise.resolve()
  }));

  event.waitUntil(
    result
      .then((entry) => entry.cacheWrite)
      .catch(() => {})
  );
  event.respondWith(
    result.then((entry) => entry.response)
  );
});
