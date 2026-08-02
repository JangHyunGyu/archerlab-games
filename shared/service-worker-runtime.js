(function installSharedServiceWorker(scope) {
    'use strict';

    scope.ArcherGameServiceWorker = Object.freeze({
        install: function (options) {
            options = options || {};
            var gameId = String(options.gameId || 'game');
            var version = String(options.version || '1');
            var cacheName = 'archer-game-' + gameId + '-' + version;
            var shell = Array.isArray(options.shell) && options.shell.length ? options.shell : ['./', './index.html'];

            scope.addEventListener('install', function (event) {
                event.waitUntil(caches.open(cacheName).then(function (cache) {
                    return cache.addAll(shell);
                }).then(function () { return scope.skipWaiting(); }));
            });

            scope.addEventListener('activate', function (event) {
                event.waitUntil(caches.keys().then(function (names) {
                    return Promise.all(names.filter(function (name) {
                        return name.indexOf('archer-game-' + gameId + '-') === 0 && name !== cacheName;
                    }).map(function (name) { return caches.delete(name); }));
                }).then(function () { return scope.clients.claim(); }));
            });

            function fetchAndCache(request, cacheKey) {
                return fetch(request).then(function (response) {
                    var cacheWrite = Promise.resolve();
                    if (response.ok) {
                        // Clone while the network response is still fresh. Delaying this
                        // until caches.open() resolves can leave a stale-while-revalidate
                        // response with an already-consumed body.
                        var copy = response.clone();
                        cacheWrite = caches.open(cacheName).then(function (cache) {
                            return cache.put(cacheKey, copy);
                        });
                    }
                    return { response: response, cacheWrite: cacheWrite };
                });
            }

            function keepAlive(event, result) {
                event.waitUntil(result.then(function (entry) {
                    return entry.cacheWrite;
                }).catch(function () {
                    // A failed refresh must not break an already cached response.
                }));
            }

            scope.addEventListener('fetch', function (event) {
                if (event.request.method !== 'GET') return;
                var url = new URL(event.request.url);
                if (url.origin !== scope.location.origin) return;
                if (event.request.mode === 'navigate') {
                    var navigation = fetchAndCache(event.request, './index.html');
                    keepAlive(event, navigation);
                    event.respondWith(navigation.then(function (entry) {
                        return entry.response;
                    }).catch(function () { return caches.match('./index.html'); }));
                    return;
                }
                var update = fetchAndCache(event.request, event.request);
                keepAlive(event, update);
                event.respondWith(caches.match(event.request).then(function (cached) {
                    return cached || update.then(function (entry) {
                        return entry.response;
                    });
                }));
            });
        }
    });
})(self);
