const CACHE_NAME = 'jewelria-v0.1.29';
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
