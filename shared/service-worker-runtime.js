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

            scope.addEventListener('fetch', function (event) {
                if (event.request.method !== 'GET') return;
                var url = new URL(event.request.url);
                if (url.origin !== scope.location.origin) return;
                if (event.request.mode === 'navigate') {
                    event.respondWith(fetch(event.request).then(function (response) {
                        var copy = response.clone();
                        caches.open(cacheName).then(function (cache) { cache.put('./index.html', copy); });
                        return response;
                    }).catch(function () { return caches.match('./index.html'); }));
                    return;
                }
                event.respondWith(caches.match(event.request).then(function (cached) {
                    var update = fetch(event.request).then(function (response) {
                        if (response.ok) caches.open(cacheName).then(function (cache) { cache.put(event.request, response.clone()); });
                        return response;
                    });
                    return cached || update;
                }));
            });
        }
    });
})(self);
