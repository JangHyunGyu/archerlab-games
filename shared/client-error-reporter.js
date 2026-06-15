(function () {
    if (window.__ARCHERLAB_CLIENT_ERROR_REPORTER__) return;
    window.__ARCHERLAB_CLIENT_ERROR_REPORTER__ = true;

    var script = document.currentScript;
    var apiBase = (
        (script && script.getAttribute('data-api-base')) ||
        window.__ARCHERLAB_GAME_API_BASE__ ||
        'https://game-api.yama5993.workers.dev'
    ).replace(/\/+$/, '');
    var endpoint = apiBase + '/client-errors';
    var gameId = getGameId();
    var appVersion = (
        (script && script.getAttribute('data-app-version')) ||
        window.__ARCHERLAB_APP_VERSION__ ||
        ''
    );
    var sentCount = 0;
    var sentKeys = Object.create(null);
    var MAX_REPORTS_PER_PAGE = 20;

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
            value.context = { serialization_failed: true };
            return JSON.stringify(value);
        }
    }

    function report(payload) {
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
        payload.game_id = gameId;
        payload.url = window.location.href;
        payload.app_version = appVersion || null;
        payload.context = Object.assign({
            language: document.documentElement.lang || navigator.language || '',
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio || 1
            }
        }, payload.context || {});

        var body = safeJson(payload);
        try {
            if (navigator.sendBeacon) {
                var blob = new Blob([body], { type: 'application/json' });
                if (navigator.sendBeacon(endpoint, blob)) return;
            }
        } catch {
            // Fall through to fetch.
        }

        try {
            fetch(endpoint, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
                body: body
            }).catch(function () {});
        } catch {
            // Reporting must never break the game.
        }
    }

    window.addEventListener('error', function (event) {
        var target = event && event.target;
        if (target && target !== window && target !== document) {
            var source = target.currentSrc || target.src || target.href || '';
            report({
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
            });
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
        }
    };
})();
