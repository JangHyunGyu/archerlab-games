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

    function isAutomatedAgent() {
        var userAgent = safeString(window.navigator && window.navigator.userAgent, '');
        return /Google-Read-Aloud|Yeti\/|(?:^|[^a-z])(?:bot|crawler|spider)(?:[^a-z]|$)|HeadlessChrome/i.test(userAgent);
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
        if (/Google-Read-Aloud|Yeti\/|(?:^|[^a-z])(?:bot|crawler|spider)(?:[^a-z]|$)|HeadlessChrome/i.test(userAgent)) {
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

    function reportImageResourceErrorAfterProbe(source, payload) {
        if (document.visibilityState === 'hidden' || (window.navigator && window.navigator.onLine === false)) return;
        probeImageResource(source).then(function (reachable) {
            if (reachable || document.visibilityState === 'hidden') return;
            queueImageResourceError(source, payload);
        }).catch(function () {
            if (document.visibilityState !== 'hidden') queueImageResourceError(source, payload);
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
        flush: flushQueue
    };

    if (!window.ArcherGames && script && script.src) {
        var runtimeScript = document.createElement('script');
        runtimeScript.src = script.src.replace(/client-error-reporter\.js(?:\?.*)?$/, 'game-runtime.js?v=20260817-yeti-v1');
        runtimeScript.async = false;
        runtimeScript.setAttribute('data-game-id', gameId);
        if (!/^(?:jewelria|solo-leveling|archerlab-games)$/.test(gameId)) {
            runtimeScript.setAttribute('data-service-worker', 'sw.js');
        }
        document.head.appendChild(runtimeScript);
    }

    scheduleFlush(0);
})();
