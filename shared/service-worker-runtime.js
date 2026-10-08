(function installSharedServiceWorker(scope) {
    'use strict';

    scope.ArcherGameServiceWorker = Object.freeze({
        install: function (options) {
            options = options || {};
            var gameId = String(options.gameId || 'game');
            var version = String(options.version || '1');
            var cacheName = 'archer-game-' + gameId + '-' + version;
            var shell = Array.isArray(options.shell) && options.shell.length ? options.shell : ['./', './index.html'];

            // /index.html 308s to the directory. cache.add follows that redirect and
            // stores redirected:true. Returning that entry for a navigation is a
            // network error, so the offline shell must be a plain response.
            function settledResponse(response) {
                if (!response || !response.redirected) return response;
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });
            }

            scope.addEventListener('install', function (event) {
                event.waitUntil(caches.open(cacheName).then(function (cache) {
                    return Promise.all(shell.map(function (asset) {
                        return fetch(new Request(asset, { cache: 'reload' })).then(function (response) {
                            if (!response.ok) throw new TypeError('shell request failed');
                            return cache.put(asset, settledResponse(response));
                        });
                    }));
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
                    var served = response.ok ? settledResponse(response) : response;
                    if (response.ok) {
                        // Clone while the network response is still fresh. Delaying this
                        // until caches.open() resolves can leave a stale-while-revalidate
                        // response with an already-consumed body.
                        var copy = served.clone();
                        cacheWrite = caches.open(cacheName).then(function (cache) {
                            return cache.put(cacheKey, copy);
                        });
                    }
                    return { response: served, cacheWrite: cacheWrite };
                });
            }

            function keepAlive(event, result) {
                event.waitUntil(result.then(function (entry) {
                    return entry.cacheWrite;
                }).catch(function () {
                    // A failed refresh must not break an already cached response.
                }));
            }

            function unavailableResponse() {
                return new Response('', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            function navigationKey(request) {
                var url = new URL(request.url);
                url.search = '';
                url.hash = '';
                if (url.pathname.endsWith('/')) url.pathname += 'index.html';
                else if (/\/index(?:-[a-z]{2})?$/.test(url.pathname)) url.pathname += '.html';
                return url.href;
            }

            function matchCurrent(request) {
                return caches.match(request, { cacheName: cacheName }).catch(function () { return undefined; });
            }

            scope.addEventListener('fetch', function (event) {
                if (event.request.method !== 'GET') return;
                var url = new URL(event.request.url);
                if (url.origin !== scope.location.origin) return;
                if (url.pathname.startsWith('/_account/')) return;
                if (event.request.mode === 'navigate') {
                    var documentKey = navigationKey(event.request);
                    var navigation = fetchAndCache(event.request, documentKey);
                    keepAlive(event, navigation);
                    event.respondWith(navigation.then(function (entry) {
                        return entry.response;
                    }).catch(function () {
                        return matchCurrent(documentKey).then(function (cached) {
                            return cached || unavailableResponse();
                        });
                    }));
                    return;
                }
                var update = fetchAndCache(event.request, event.request);
                keepAlive(event, update);
                event.respondWith(matchCurrent(event.request).then(function (cached) {
                    return cached || update.then(function (entry) {
                        return entry.response;
                    });
                }).catch(function () { return unavailableResponse(); }));
            });
        }
    });
})(self);
