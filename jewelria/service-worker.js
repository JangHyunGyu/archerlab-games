/* iOS < 13.4 compatibility polyfills */
(function () {
  'use strict';
  var root = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
  if (!root || root.__archerIos12CompatApplied) return;
  if (typeof globalThis === 'undefined') {
    try { root.globalThis = root; } catch (_e) {}
  }
  function def(obj, key, val) {
    if (!obj || typeof obj[key] === 'function') return;
    try {
      Object.defineProperty(obj, key, { value: val, writable: true, configurable: true });
    } catch (_e) {
      try { obj[key] = val; } catch (_e2) {}
    }
  }
  def(Object, 'hasOwn', function (obj, prop) {
    if (obj == null) throw new TypeError('Cannot convert undefined or null to object');
    return Object.prototype.hasOwnProperty.call(Object(obj), prop);
  });
  def(Object, 'fromEntries', function (entries) {
    var out = {};
    if (entries == null) throw new TypeError("Object.fromEntries requires an iterable");
    if (typeof Symbol === 'function' && Symbol.iterator && typeof entries[Symbol.iterator] === 'function') {
      var it = entries[Symbol.iterator]();
      var step;
      while (!(step = it.next()).done) {
        var pair = step.value;
        if (!pair || (typeof pair !== 'object' && typeof pair !== 'function')) throw new TypeError('Iterator value is not an entry object');
        out[pair[0]] = pair[1];
      }
      return out;
    }
    for (var i = 0; i < entries.length; i++) {
      out[entries[i][0]] = entries[i][1];
    }
    return out;
  });
  function atHelper(len, n) {
    var i = Number(n);
    i = i !== i ? 0 : (i < 0 ? Math.ceil(i) : Math.floor(i));
    if (i < 0) i += len;
    return (i < 0 || i >= len) ? -1 : i;
  }
  def(Array.prototype, 'at', function (n) {
    if (this == null) throw new TypeError("Array.prototype.at called on null or undefined");
    var list = Object(this);
    var k = atHelper(list.length >>> 0, n);
    return k < 0 ? undefined : list[k];
  });
  def(String.prototype, 'at', function (n) {
    if (this == null) throw new TypeError("String.prototype.at called on null or undefined");
    var s = String(this);
    var k = atHelper(s.length, n);
    return k < 0 ? undefined : s.charAt(k);
  });
  def(Array.prototype, 'findLastIndex', function (predicate, thisArg) {
    if (this == null) throw new TypeError("Array.prototype.findLastIndex called on null or undefined");
    if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
    var list = Object(this);
    for (var i = (list.length >>> 0) - 1; i >= 0; i--) {
      if (predicate.call(thisArg, list[i], i, list)) return i;
    }
    return -1;
  });
  def(Array.prototype, 'findLast', function (predicate, thisArg) {
    if (this == null) throw new TypeError("Array.prototype.findLast called on null or undefined");
    if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
    var list = Object(this);
    for (var i = (list.length >>> 0) - 1; i >= 0; i--) {
      if (predicate.call(thisArg, list[i], i, list)) return list[i];
    }
    return undefined;
  });
  def(String.prototype, 'replaceAll', function (search, replacement) {
    if (this == null) throw new TypeError("String.prototype.replaceAll called on null or undefined");
    var str = String(this);
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
      return str.replace(search, replacement);
    }
    var needle = String(search);
    var isFn = typeof replacement === 'function';
    var repStr = isFn ? null : String(replacement);
    var hasDollar = !isFn && repStr.indexOf("$") !== -1;
    function subst(idx) {
      if (!hasDollar) return repStr;
      var outR = "";
      for (var k = 0; k < repStr.length; k++) {
        if (repStr.charAt(k) === "$" && k + 1 < repStr.length) {
          var ch = repStr.charAt(k + 1);
          if (ch === "$") { outR += "$"; k++; continue; }
          if (ch === "&") { outR += needle; k++; continue; }
          if (ch === "`") { outR += str.slice(0, idx); k++; continue; }
          if (ch === "'") { outR += str.slice(idx + needle.length); k++; continue; }
        }
        outR += repStr.charAt(k);
      }
      return outR;
    }
    var out = "";
    var pos = 0;
    if (needle.length === 0) {
      for (var i = 0; i <= str.length; i++) {
        var piece = isFn ? String(replacement("", i, str)) : subst(i);
        out += piece + (i < str.length ? str.charAt(i) : "");
      }
      return out;
    }
    while (true) {
      var idx = str.indexOf(needle, pos);
      if (idx === -1) return out + str.slice(pos);
      var val = isFn ? String(replacement(needle, idx, str)) : subst(idx);
      out += str.slice(pos, idx) + val;
      pos = idx + needle.length;
    }
  });
  def(String.prototype, 'matchAll', function (regexp) {
    if (this == null) throw new TypeError("String.prototype.matchAll called on null or undefined");
    var str = String(this);
    var re;
    if (regexp instanceof RegExp) {
      if (!regexp.global) throw new TypeError('matchAll must be called with a global RegExp');
      re = new RegExp(regexp.source, regexp.flags);
      re.lastIndex = regexp.lastIndex;
    } else {
      re = new RegExp(regexp, 'g');
    }
    var iter = {
      next: function () {
        var m = re.exec(str);
        if (!m) return { value: undefined, done: true };
        if (m[0] === '') re.lastIndex = re.lastIndex + 1;
        return { value: m, done: false };
      }
    };
    if (typeof Symbol === 'function' && Symbol.iterator) {
      iter[Symbol.iterator] = function () { return this; };
    }
    return iter;
  });
  if (typeof Promise === 'function') {
    def(Promise, 'allSettled', function (promises) {
      var list = Array.from(promises);
      if (!list.length) return Promise.resolve([]);
      return new Promise(function (resolve) {
        var results = new Array(list.length);
        var remaining = list.length;
        function done(i, item) {
          results[i] = item;
          remaining -= 1;
          if (remaining === 0) resolve(results);
        }
        for (var i = 0; i < list.length; i++) {
          (function (idx) {
            Promise.resolve(list[idx]).then(
              function (value) { done(idx, { status: 'fulfilled', value: value }); },
              function (reason) { done(idx, { status: 'rejected', reason: reason }); }
            );
          })(i);
        }
      });
    });
    def(Promise, 'any', function (promises) {
      var list = Array.from(promises);
      return new Promise(function (resolve, reject) {
        if (!list.length) {
          var emptyErr = new Error('All promises were rejected');
          emptyErr.name = 'AggregateError'; emptyErr.errors = [];
          reject(emptyErr); return;
        }
        var errors = new Array(list.length);
        var remaining = list.length;
        for (var i = 0; i < list.length; i++) {
          (function (idx) {
            Promise.resolve(list[idx]).then(resolve, function (err) {
              errors[idx] = err;
              remaining -= 1;
              if (remaining === 0) {
                var agg = new Error('All promises were rejected');
                agg.name = 'AggregateError'; agg.errors = errors;
                reject(agg);
              }
            });
          })(i);
        }
      });
    });
  }
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function' && typeof AbortController === 'function') {
    def(AbortSignal, 'timeout', function (ms) {
      var controller = new AbortController();
      setTimeout(function () {
        try {
          controller.abort(typeof DOMException === 'function' ? new DOMException('The operation was aborted due to timeout', 'TimeoutError') : undefined);
        } catch (_e) {
          controller.abort();
        }
      }, Number(ms) || 0);
      return controller.signal;
    });
  }
  if (typeof root.crypto !== 'undefined' && typeof root.crypto.randomUUID !== 'function' && typeof root.crypto.getRandomValues === 'function') {
    def(root.crypto, 'randomUUID', function () {
      var b = new Uint8Array(16);
      root.crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < 16; i++) {
        hex.push((b[i] < 16 ? '0' : '') + b[i].toString(16));
      }
      return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10, 16).join('');
    });
  }
  try { root.__archerIos12CompatApplied = true; } catch (_e) {}
})();
self.__ARCHERLAB_GAME_ID__ = 'jewelria-service-worker';
importScripts('../shared/service-worker-error-reporter.js?v=20260710-d1-v2');

const CACHE_NAME = 'jewelria-20261103-japanese-ui-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './index-en.html',
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

function cacheableCopy(response) {
  if (!((response === null || response === void 0 ? void 0 : response.redirected))) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(CACHE_ASSETS.map((asset) =>
        fetch(new Request(asset, { cache: 'reload' })).then((response) => {
          if (!response.ok) throw new TypeError(`failed to cache ${asset}`);
          return cache.put(asset, cacheableCopy(response));
        })
      )))
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
  if (url.searchParams.get('lang') === 'en' && /\/jewelria\/(?:index\.html)?$/.test(url.pathname)) {
    url.pathname = '/jewelria/index-en.html';
  }
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
        const copy = cacheableCopy(response.clone());
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
        const copy = cacheableCopy(response.clone());
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
