/* ArcherLab environment guard (kept identical across harem / cupid / nevergrad / games).
 * Feature-detection first; the UA is only a hint. Every step is wrapped so the guard can never throw.
 *  1. Web Storage shim: replaces localStorage/sessionStorage with an in-memory Storage only when
 *     the real one is missing, throws on access, or silently drops writes (Samsung/iOS in-app WebViews).
 *  2. Canvas getImageData: returns a blank ImageData instead of throwing InvalidStateError/IndexSizeError.
 *  3. Audio: AudioContext.resume() rejections ("Failed to start the audio device") are swallowed and
 *     retried on the next user gesture; related unhandled rejections are marked handled.
 */
(function (root) {
    'use strict';
    if (!root || root.__archerEnvGuard) return;
    var guard = root.__archerEnvGuard = { version: '1.0.0', memoryStorage: {}, env: {} };

    function attempt(fn, fallback) {
        try { return fn(); } catch (e) { return fallback; }
    }

    /* ---- environment hints (auxiliary only) ---- */
    var ua = attempt(function () { return String(root.navigator.userAgent || ''); }, '');
    var inApp = '';
    var inAppRules = [
        ['kakao', /KAKAOTALK/i], ['naver', /NAVER\(|NaverApp/i], ['instagram', /Instagram/i],
        ['facebook', /FBAN|FBAV|FB_IAB|FB4A|FBIOS/i], ['line', /\bLine\//i], ['band', /\bBAND[\/; ]/i],
        ['twitter', /Twitter/i], ['tiktok', /TikTok|musical_ly|BytedanceWebview|trill_/i], ['daum', /DaumApps/i]
    ];
    for (var r = 0; r < inAppRules.length; r++) {
        if (inAppRules[r][1].test(ua)) { inApp = inAppRules[r][0]; break; }
    }
    var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && attempt(function () { return root.navigator.maxTouchPoints > 1; }, false));
    var isAndroid = /Android/i.test(ua);
    var isSamsung = /SamsungBrowser/i.test(ua);
    var isWebView = (isAndroid && /;\s*wv\)|\bVersion\/[\d.]+ Chrome\/[\d.]+ Mobile/i.test(ua) && !isSamsung) ||
        (isIOS && !/Safari\//i.test(ua));
    guard.env = { inApp: inApp, ios: isIOS, android: isAndroid, samsung: isSamsung, webview: !!(isWebView || inApp) };
    var strictProbe = !!(inApp || isWebView || isSamsung);

    /* ---- 1. Web Storage shim ---- */
    function createMemoryStorage() {
        var data = Object.create(null);
        var api = {
            getItem: function (key) { key = String(key); return key in data ? data[key] : null; },
            setItem: function (key, value) { data[String(key)] = String(value); },
            removeItem: function (key) { delete data[String(key)]; },
            clear: function () { data = Object.create(null); },
            key: function (index) { var keys = Object.keys(data); return index >= 0 && index < keys.length ? keys[index] : null; }
        };
        var proto = (root.Storage && root.Storage.prototype) ? Object.create(root.Storage.prototype) : {};
        Object.keys(api).forEach(function (name) {
            Object.defineProperty(proto, name, { value: api[name], writable: true, configurable: true, enumerable: false });
        });
        Object.defineProperty(proto, 'length', { get: function () { return Object.keys(data).length; }, configurable: true });
        if (typeof root.Proxy === 'function') {
            return new root.Proxy(proto, {
                get: function (target, prop) {
                    if (typeof prop === 'string' && prop !== 'length' && !(prop in proto) && prop in data) return data[prop];
                    return target[prop];
                },
                set: function (target, prop, value) { if (typeof prop === 'string') data[prop] = String(value); return true; },
                has: function (target, prop) { return (typeof prop === 'string' && prop in data) || prop in target; },
                deleteProperty: function (target, prop) { if (typeof prop === 'string') delete data[prop]; return true; },
                ownKeys: function () { return Object.keys(data); },
                getOwnPropertyDescriptor: function (target, prop) {
                    return typeof prop === 'string' && prop in data
                        ? { value: data[prop], writable: true, enumerable: true, configurable: true } : undefined;
                }
            });
        }
        return proto;
    }

    function storageIsUsable(name) {
        var store;
        try { store = root[name]; } catch (e) { return false; }
        if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function') return false;
        var probeKey = '__archer_env_probe__';
        try {
            store.setItem(probeKey, '1');
            var ok = store.getItem(probeKey) === '1';
            if (typeof store.removeItem === 'function') store.removeItem(probeKey);
            return ok;
        } catch (e) {
            var quota = e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
            if (quota && !strictProbe) {
                // Full storage in a normal browser: leave it to the app's own quota handling, but only if reads work.
                try { store.getItem(probeKey); return true; } catch (readError) { return false; }
            }
            return false;
        }
    }

    function installStorage(name) {
        if (storageIsUsable(name)) return;
        var memory = createMemoryStorage();
        var done = false;
        try {
            Object.defineProperty(root, name, { value: memory, configurable: true, writable: true, enumerable: true });
            done = root[name] === memory;
        } catch (e) { /* try the next strategy */ }
        if (!done) {
            try {
                var proto = root.Window && root.Window.prototype;
                if (proto) {
                    Object.defineProperty(proto, name, { get: function () { return memory; }, configurable: true });
                    done = attempt(function () { return root[name] === memory; }, false);
                }
            } catch (e) { /* give up silently */ }
        }
        if (!done) { try { root[name] = memory; done = root[name] === memory; } catch (e) { /* ignore */ } }
        guard.memoryStorage[name] = done;
    }
    attempt(function () { installStorage('localStorage'); });
    attempt(function () { installStorage('sessionStorage'); });

    /* ---- 2. Canvas getImageData ---- */
    function isCanvasStateError(e) {
        var name = e && e.name;
        return name === 'InvalidStateError' || name === 'IndexSizeError' ||
            (e && /getImageData|source width|source height|The source (width|height)/i.test(String(e.message || '')) && name !== 'SecurityError');
    }
    function patchGetImageData(Ctor) {
        var proto = Ctor && Ctor.prototype;
        var original = proto && proto.getImageData;
        if (typeof original !== 'function' || original.__archerGuarded) return;
        var guarded = function getImageData(sx, sy, sw, sh) {
            try {
                return original.apply(this, arguments);
            } catch (e) {
                if (!isCanvasStateError(e)) throw e;
                var w = Math.max(1, Math.abs(Math.floor(Number(sw)) || 1));
                var h = Math.max(1, Math.abs(Math.floor(Number(sh)) || 1));
                try { return new root.ImageData(w, h); } catch (e1) { /* fall through */ }
                try { return this.createImageData(w, h); } catch (e2) { /* fall through */ }
                throw e;
            }
        };
        guarded.__archerGuarded = true;
        try { Object.defineProperty(proto, 'getImageData', { value: guarded, writable: true, configurable: true }); } catch (e) { /* ignore */ }
    }
    attempt(function () { patchGetImageData(root.CanvasRenderingContext2D); });
    attempt(function () { patchGetImageData(root.OffscreenCanvasRenderingContext2D); });

    /* ---- 3. Audio ---- */
    var pendingAudio = [];
    var gestureBound = false;
    var GESTURES = ['pointerdown', 'touchend', 'mousedown', 'keydown', 'click'];
    function retryAudioOnGesture(ctx) {
        if (pendingAudio.indexOf(ctx) < 0) pendingAudio.push(ctx);
        if (gestureBound || !root.document) return;
        gestureBound = true;
        var handler = function () {
            var list = pendingAudio.slice();
            pendingAudio.length = 0;
            list.forEach(function (c) {
                attempt(function () {
                    if (c && c.state !== 'running' && c.state !== 'closed') {
                        var p = c.resume();
                        if (p && typeof p.catch === 'function') p.catch(function () {});
                    }
                });
            });
            if (!pendingAudio.length) {
                GESTURES.forEach(function (type) { attempt(function () { root.document.removeEventListener(type, handler, true); }); });
                gestureBound = false;
            }
        };
        GESTURES.forEach(function (type) {
            attempt(function () { root.document.addEventListener(type, handler, { capture: true, passive: true }); });
        });
    }
    function patchAudioResume(Ctor) {
        var proto = Ctor && Ctor.prototype;
        var original = proto && proto.resume;
        if (typeof original !== 'function' || original.__archerGuarded) return;
        var guarded = function resume() {
            var ctx = this;
            var result;
            try { result = original.apply(ctx, arguments); } catch (e) { retryAudioOnGesture(ctx); return Promise.resolve(); }
            if (result && typeof result.then === 'function') {
                return result.then(function (value) { return value; }, function () { retryAudioOnGesture(ctx); });
            }
            return result;
        };
        guarded.__archerGuarded = true;
        try { Object.defineProperty(proto, 'resume', { value: guarded, writable: true, configurable: true }); } catch (e) { /* ignore */ }
    }
    attempt(function () { patchAudioResume(root.AudioContext); });
    attempt(function () { if (root.webkitAudioContext !== root.AudioContext) patchAudioResume(root.webkitAudioContext); });

    // Safety net: environment-only rejections never surface as uncaught errors.
    function isEnvAudioIssue(reason) {
        var text = String((reason && (reason.message || reason.name)) || reason || '');
        return /Failed to start the audio device|audio device|AudioContext was not allowed to start|The play\(\) request was interrupted|play\(\) failed because the user didn't interact|NotAllowedError/i.test(text);
    }
    attempt(function () {
        root.addEventListener('unhandledrejection', function (event) {
            attempt(function () { if (event && isEnvAudioIssue(event.reason)) event.preventDefault(); });
        });
    });
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));

(function () {
    if (window.__ARCHERLAB_CLIENT_ERROR_REPORTER__) return;
    window.__ARCHERLAB_CLIENT_ERROR_REPORTER__ = true;

    var script = document.currentScript;
    var endpoint = (
        (script && script.getAttribute('data-error-endpoint')) ||
        window.__ARCHERLAB_ERROR_ENDPOINT__ ||
        'https://game-api.yama5993.workers.dev/client-errors'
    );
    var gameId = getGameId();
    var appVersion = (
        (script && script.getAttribute('data-app-version')) ||
        window.__ARCHERLAB_APP_VERSION__ ||
        ''
    );
    var sentCount = 0;
    var sentKeys = Object.create(null);
    var MAX_REPORTS_PER_PAGE = 20;
    var MAX_QUEUED_REPORTS = 50;
    var QUEUE_KEY = 'archerlab-client-error-queue:v2';
    var queue = loadQueue();
    var flushPromise = null;
    var flushTimer = null;
    var suppressConsoleCapture = false;

    function getGameId() {
        var fromScript = script && script.getAttribute('data-game-id');
        var fromGlobal = window.__ARCHERLAB_GAME_ID__;
        var id = String(fromScript || fromGlobal || '').trim();
        if (id) return id;

        var parts = window.location.pathname.split('/').filter(Boolean);
        return parts[0] || 'archerlab-games';
    }

    function safeString(value, fallback) {
        if (value === undefined || value === null) return fallback || '';
        try {
            return String(value);
        } catch {
            return fallback || '';
        }
    }

    function isAutomatedUserAgent(value) {
        return /Google-Read-Aloud|Yeti\/|(?:bot|crawler|spider)(?:[\/\s;,)]|$)|HeadlessChrome/i.test(safeString(value, ''));
    }

    function isAutomatedAgent() {
        var userAgent = safeString(window.navigator && window.navigator.userAgent, '');
        return isAutomatedUserAgent(userAgent);
    }

    function stackFrom(value) {
        if (!value) return '';
        if (value.stack) return safeString(value.stack);
        if (value.error && value.error.stack) return safeString(value.error.stack);
        return '';
    }

    function reasonPayload(reason) {
        if (reason instanceof Error) {
            return {
                message: reason.message || reason.name || 'Unhandled promise rejection',
                stack: reason.stack || '',
                context: { name: reason.name || 'Error' }
            };
        }
        if (reason && typeof reason === 'object') {
            return {
                message: reason.message || reason.reason || JSON.stringify(reason).slice(0, 300),
                stack: reason.stack || '',
                context: { reason: reason }
            };
        }
        return {
            message: safeString(reason, 'Unhandled promise rejection'),
            stack: '',
            context: { reason: safeString(reason, '') }
        };
    }

    // Only real fetch/network failures are transient. A TypeError from our own code
    // ("x is not a function", "Assignment to constant variable") is a bug and must
    // reach D1 instead of being hidden as a dropped connection.
    var NETWORK_FAILURE_PATTERN = /Failed to fetch|Load failed|NetworkError|network ?error|The network connection was lost|Internet connection appears to be offline|fetch failed|Network request failed/i;

    function isNetworkFailure(error) {
        if (!error) return false;
        // HTTP status / invalid-response errors tagged by a fetch wrapper are transport results.
        if (error.archerTransport === true) return true;
        if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
        if (window.navigator && window.navigator.onLine === false) return true;
        return NETWORK_FAILURE_PATTERN.test(safeString(error.message !== undefined ? error.message : error, ''));
    }

    function safeJson(value) {
        try {
            return JSON.stringify(value);
        } catch {
            return JSON.stringify({ serialization_failed: true });
        }
    }

    function safePreview(value) {
        if (value instanceof Error) return value.message || value.name || 'Error';
        if (typeof value === 'string') return value;
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch {
                return Object.prototype.toString.call(value);
            }
        }
        return safeString(value, '');
    }

    function truncate(value, maxLength) {
        var text = safeString(value, '');
        return text.length > maxLength ? text.slice(0, maxLength) : text;
    }

    function resolveUrl(value) {
        try {
            return new URL(value, window.location.href).href;
        } catch {
            return safeString(value, '');
        }
    }

    function isWebpUrl(value) {
        return /\.webp(?:[?#]|$)/i.test(safeString(value, ''));
    }

    function getImageFallbackUrl(source, target) {
        if (!target || !target.getAttribute) return '';
        var explicitFallback = (
            target.getAttribute('data-png-fallback') ||
            target.getAttribute('data-fallback-src') ||
            target.dataset && (target.dataset.pngFallback || target.dataset.fallbackSrc) ||
            ''
        );
        var fallback = explicitFallback || target.getAttribute('src') || '';
        if (!fallback) return '';

        var sourceUrl = resolveUrl(source);
        var fallbackUrl = resolveUrl(fallback);
        if (!sourceUrl || !fallbackUrl || sourceUrl === fallbackUrl) return '';
        if (!isWebpUrl(sourceUrl)) return '';
        return fallbackUrl;
    }

    function applyImageFallback(source, target) {
        var fallbackUrl = getImageFallbackUrl(source, target);
        if (!fallbackUrl || target.__archerlabImageFallbackApplied) return false;

        target.__archerlabImageFallbackApplied = true;
        target.__archerlabImageFallbackFrom = resolveUrl(source);
        try {
            var parent = target.parentElement;
            if (parent && parent.tagName && parent.tagName.toUpperCase() === 'PICTURE') {
                Array.prototype.forEach.call(parent.querySelectorAll('source'), function (sourceEl) {
                    var srcset = sourceEl.getAttribute('srcset') || '';
                    var type = sourceEl.getAttribute('type') || '';
                    if (/image\/webp/i.test(type) || isWebpUrl(srcset)) {
                        sourceEl.setAttribute('data-archerlab-disabled-srcset', srcset);
                        sourceEl.removeAttribute('srcset');
                    }
                });
            }
            target.src = fallbackUrl;
        } catch {
            return false;
        }
        return true;
    }

    function isIgnorableResourceError(source, target) {
        var src = safeString(source, '');
        var tag = safeString(target && (target.tagName || target.nodeName), '').toUpperCase();
        var userAgent = safeString(window.navigator && window.navigator.userAgent, '');
        // Search/rendering agents do not execute a complete browser lifecycle and
        // commonly cancel otherwise healthy image requests. Their resource errors
        // are not actionable player failures.
        if (isAutomatedUserAgent(userAgent)) {
            return true;
        }
        if (tag === 'IMG') {
            if (applyImageFallback(src, target)) return true;
            if (target && target.__archerlabImageFallbackApplied && target.naturalWidth > 0) return true;
        }
        return tag === 'SCRIPT' && (
            src.indexOf('https://www.googletagmanager.com/gtag/js') === 0 ||
            src.indexOf('https://www.google-analytics.com/') === 0
        );
    }

    function retryStylesheetResource(source, target) {
        var tag = safeString(target && (target.tagName || target.nodeName), '').toUpperCase();
        if (tag !== 'LINK' || !target || typeof target.getAttribute !== 'function'
            || typeof target.setAttribute !== 'function'
            || document.visibilityState === 'hidden' || window.navigator.onLine === false) return false;
        var rel = safeString(target.getAttribute('rel'), '').toLowerCase();
        if (rel !== 'stylesheet') return false;

        try {
            var parsed = new URL(source, window.location.href);
            if (parsed.origin !== window.location.origin) return false;
            var attempt = Number(target.getAttribute('data-archerlab-stylesheet-retry') || 0);
            if (!Number.isFinite(attempt) || attempt < 0) attempt = 0;
            if (attempt >= 2) return false;
            attempt += 1;
            target.setAttribute('data-archerlab-stylesheet-retry', String(attempt));
            parsed.searchParams.set('__resource_retry', Date.now().toString(36) + '-' + attempt);
            window.setTimeout(function () { target.href = parsed.href; }, 500 * attempt);
            return true;
        } catch {
            return false;
        }
    }

    function probeImageResource(source) {
        if (!source || typeof window.Image !== 'function') return Promise.resolve(false);
        return new Promise(function (resolve) {
            var settled = false;
            var probe = new window.Image();
            var timer = window.setTimeout(function () { finish(false); }, 4000);
            function finish(reachable) {
                if (settled) return;
                settled = true;
                if (typeof window.clearTimeout === 'function') window.clearTimeout(timer);
                probe.onload = null;
                probe.onerror = null;
                resolve(reachable);
            }
            probe.onload = function () { finish(true); };
            probe.onerror = function () { finish(false); };
            try {
                var probeUrl = new URL(source, window.location.href);
                probeUrl.searchParams.set('__resource_probe', Date.now().toString(36));
                probe.src = probeUrl.href;
            } catch {
                finish(false);
            }
        });
    }

    var pendingImageFailures = [];
    var imageFailureFlushTimer = null;
    var IMAGE_RESOURCE_REPROBE_DELAY_MS = 3000;

    function flushImageResourceErrors() {
        imageFailureFlushTimer = null;
        var failures = pendingImageFailures.splice(0);
        if (!failures.length || document.visibilityState === 'hidden' || (window.navigator && window.navigator.onLine === false)) return;
        if (failures.length < 3) {
            failures.forEach(function (failure) { report(failure.payload); });
            return;
        }
        var first = failures[0].payload;
        first.message = 'Multiple image resources failed to load';
        first.context = Object.assign({}, first.context || {}, {
            failedImageCount: failures.length,
            failedImageSources: failures.map(function (failure) { return failure.source; }).slice(0, 20)
        });
        report(first);
    }

    function queueImageResourceError(source, payload) {
        pendingImageFailures.push({ source: source, payload: payload });
        if (imageFailureFlushTimer !== null) return;
        imageFailureFlushTimer = window.setTimeout(flushImageResourceErrors, 750);
    }

    function queueImageResourceErrorAfterReprobe(source, payload) {
        window.setTimeout(function () {
            if (document.visibilityState === 'hidden' || (window.navigator && window.navigator.onLine === false)) return;
            probeImageResource(source).then(function (reachableAfterDelay) {
                if (!reachableAfterDelay && document.visibilityState !== 'hidden') {
                    queueImageResourceError(source, payload);
                }
            }).catch(function () {
                if (document.visibilityState !== 'hidden') queueImageResourceError(source, payload);
            });
        }, IMAGE_RESOURCE_REPROBE_DELAY_MS);
    }

    function reportImageResourceErrorAfterProbe(source, payload) {
        if (document.visibilityState === 'hidden' || (window.navigator && window.navigator.onLine === false)) return;
        probeImageResource(source).then(function (reachable) {
            if (reachable || document.visibilityState === 'hidden') return;
            queueImageResourceErrorAfterReprobe(source, payload);
        }).catch(function () {
            if (document.visibilityState === 'hidden') return;
            queueImageResourceErrorAfterReprobe(source, payload);
        });
    }

    function loadQueue() {
        try {
            var parsed = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]');
            return Array.isArray(parsed) ? parsed.slice(-MAX_QUEUED_REPORTS) : [];
        } catch {
            return [];
        }
    }

    function persistQueue() {
        try {
            window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUED_REPORTS)));
        } catch {
            // Keep the in-memory queue when storage is blocked.
        }
    }

    function createReportId() {
        var random = '';
        try {
            var bytes = new Uint32Array(2);
            window.crypto.getRandomValues(bytes);
            random = bytes[0].toString(36) + bytes[1].toString(36);
        } catch {
            random = Math.random().toString(36).slice(2);
        }
        return Date.now().toString(36) + '-' + random;
    }

    function enqueue(body) {
        var id = createReportId();
        body.context = Object.assign({}, body.context || {}, { clientReportId: id });
        queue.push({ id: id, body: body, queuedAt: Date.now() });
        if (queue.length > MAX_QUEUED_REPORTS) {
            queue = queue.slice(-MAX_QUEUED_REPORTS);
        }
        persistQueue();
        scheduleFlush(0);
    }

    function scheduleFlush(delay) {
        if (flushTimer !== null) return;
        flushTimer = window.setTimeout(function () {
            flushTimer = null;
            flushQueue();
        }, delay || 0);
    }

    function flushQueue() {
        if (flushPromise || !queue.length || typeof window.fetch !== 'function') {
            return flushPromise || Promise.resolve();
        }

        flushPromise = (async function () {
            while (queue.length) {
                var item = queue[0];
                try {
                    var response = await window.fetch(endpoint, {
                        method: 'POST',
                        mode: 'cors',
                        credentials: 'omit',
                        keepalive: true,
                        headers: { 'Content-Type': 'application/json' },
                        body: safeJson(item.body)
                    });
                    if (!response.ok) throw new Error('error reporter HTTP ' + response.status);
                    queue.shift();
                    persistQueue();
                } catch {
                    break;
                }
            }
        })().finally(function () {
            flushPromise = null;
        });
        return flushPromise;
    }

    function suppressConsoleForCurrentTask() {
        suppressConsoleCapture = true;
        window.setTimeout(function () {
            suppressConsoleCapture = false;
        }, 0);
    }

    function report(payload) {
        if (isAutomatedAgent()) return;
        if (!gameId || sentCount >= MAX_REPORTS_PER_PAGE) return;
        if (!payload || !payload.message) return;

        var key = [
            payload.error_type || '',
            payload.message || '',
            payload.source || '',
            payload.lineno || 0,
            payload.colno || 0
        ].join('|');
        if (sentKeys[key]) return;
        sentKeys[key] = true;

        if (
            payload.message === 'Script error.' &&
            !payload.stack &&
            !payload.source &&
            !payload.lineno &&
            !payload.colno
        ) {
            return;
        }

        sentCount += 1;
        var context = Object.assign({
            language: document.documentElement.lang || navigator.language || '',
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio || 1
            }
        }, payload.context || {});
        var errorType = payload.error_type || 'error';
        var body = {
            appId: gameId,
            userId: '',
            message: truncate('[' + errorType + '] ' + payload.message, 500),
            stack: truncate(payload.stack || '', 4000),
            url: truncate(window.location.href, 500),
            source: truncate(payload.source || '', 500),
            errorType: truncate(errorType, 100),
            errorClass: truncate(payload.error_class || '', 50),
            context: context,
            extra: Object.assign({
                lineno: payload.lineno || 0,
                colno: payload.colno || 0,
                appVersion: appVersion || '',
                pageTitle: document.title || ''
            }, payload.extra || {})
        };
        enqueue(body);
    }

    window.addEventListener('error', function (event) {
        suppressConsoleForCurrentTask();
        var target = event && event.target;
        if (target && target !== window && target !== document) {
            var source = target.currentSrc || target.src || target.href || '';
            if (isIgnorableResourceError(source, target)) return;
            if (retryStylesheetResource(source, target)) return;
            var resourcePayload = {
                error_type: 'resource_error',
                message: 'Failed to load resource: ' + safeString(target.tagName || target.nodeName, 'unknown'),
                source: source,
                lineno: 0,
                colno: 0,
                stack: '',
                context: {
                    tag: target.tagName || target.nodeName || '',
                    id: target.id || '',
                    className: target.className || ''
                }
            };
            if (safeString(target.tagName || target.nodeName, '').toUpperCase() === 'IMG') {
                reportImageResourceErrorAfterProbe(source, resourcePayload);
                return;
            }
            report(resourcePayload);
            return;
        }

        report({
            error_type: 'error',
            message: safeString(event.message, 'Client script error'),
            source: event.filename || '',
            lineno: event.lineno || 0,
            colno: event.colno || 0,
            stack: stackFrom(event),
            context: event.error && event.error.name ? { name: event.error.name } : {}
        });
    }, true);

    window.addEventListener('unhandledrejection', function (event) {
        suppressConsoleForCurrentTask();
        var details = reasonPayload(event.reason);
        report({
            error_type: 'unhandledrejection',
            message: details.message || 'Unhandled promise rejection',
            source: '',
            lineno: 0,
            colno: 0,
            stack: details.stack || '',
            context: details.context || {}
        });
    }, true);

    document.addEventListener('securitypolicyviolation', function (event) {
        report({
            error_type: 'securitypolicyviolation',
            message: 'Blocked by Content Security Policy: ' + safeString(event.violatedDirective, 'unknown directive'),
            source: event.blockedURI || event.sourceFile || '',
            lineno: event.lineNumber || 0,
            colno: event.columnNumber || 0,
            stack: '',
            context: {
                effectiveDirective: event.effectiveDirective || '',
                disposition: event.disposition || '',
                statusCode: event.statusCode || 0
            }
        });
    }, true);

    if (window.console && typeof window.console.error === 'function') {
        var originalConsoleError = window.console.error;
        window.console.error = function () {
            originalConsoleError.apply(window.console, arguments);
            if (suppressConsoleCapture) return;
            var args = Array.prototype.slice.call(arguments);
            var errorArg = args.find(function (value) { return value instanceof Error; });
            report({
                error_type: 'console_error',
                message: args.map(safePreview).join(' ').slice(0, 500) || 'console.error',
                source: '',
                lineno: 0,
                colno: 0,
                stack: errorArg && errorArg.stack ? errorArg.stack : '',
                context: { argumentCount: args.length }
            });
        };
    }

    window.addEventListener('online', function () { scheduleFlush(0); });
    window.addEventListener('pagehide', function () { flushQueue(); });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flushQueue();
    });

    window.ArcherLabClientErrorReporter = {
        report: function (error, context) {
            var details = reasonPayload(error);
            report({
                error_type: 'manual',
                message: details.message || 'Manual client error',
                source: '',
                lineno: 0,
                colno: 0,
                stack: details.stack || '',
                context: Object.assign({}, details.context || {}, context || {})
            });
        },
        reportPayload: function (payload) {
            report(payload || {});
        },
        isNetworkFailure: isNetworkFailure,
        // Reports everything except real network failures with a distinct errorType.
        reportClientException: function (error, context, errorType) {
            if (isNetworkFailure(error)) return false;
            var details = reasonPayload(error);
            var name = safeString(error && error.name, '') || 'Error';
            report({
                error_type: errorType || 'game_client_exception',
                message: name + ': ' + (details.message || 'Client exception'),
                source: '',
                lineno: 0,
                colno: 0,
                stack: details.stack || '',
                error_class: name,
                context: Object.assign({}, details.context || {}, context || {})
            });
            return true;
        },
        // For best-effort paths whose own transport/HTTP errors are plain Error objects:
        // only built-in JS exceptions (TypeError, ReferenceError, RangeError) are code bugs.
        reportCodeException: function (error, context, errorType) {
            var name = safeString(error && error.name, '');
            if (!/^(?:TypeError|ReferenceError|RangeError|EvalError|URIError)$/.test(name)) return false;
            return window.ArcherLabClientErrorReporter.reportClientException(error, context, errorType);
        },
        flush: flushQueue
    };

    if (!window.ArcherGames && script && script.src) {
        var runtimeScript = document.createElement('script');
        runtimeScript.src = script.src.replace(/client-error-reporter\.js(?:\?.*)?$/, 'game-runtime.js?v=20260905-bot-filter-v2&ranking=20261006-client-exception-v1');
        runtimeScript.async = false;
        runtimeScript.setAttribute('data-game-id', gameId);
        if (!/^(?:jewelria|solo-leveling|archerlab-games)$/.test(gameId)) {
            runtimeScript.setAttribute('data-service-worker', 'sw.js');
        }
        document.head.appendChild(runtimeScript);
    }

    scheduleFlush(0);
})();
