(function installArcherGamesRuntime(global) {
    'use strict';

    if (global.ArcherGames) return;

    var DEFAULT_API_BASE = 'https://game-api.yama5993.workers.dev';

    function normalizeGameId(value) {
        return String(value || 'archerlab-games').trim().replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    }

    function isAutomatedAgent() {
        var userAgent = String(global.navigator && global.navigator.userAgent || '');
        return /Google-Read-Aloud|Yeti\/|(?:^|[^a-z])(?:bot|crawler|spider)(?:[^a-z]|$)|HeadlessChrome/i.test(userAgent);
    }

    function Storage(namespace, storage) {
        this.namespace = normalizeGameId(namespace);
        this.storage = storage || global.localStorage;
    }

    Storage.prototype.key = function (key) {
        return this.namespace + ':' + String(key || '');
    };
    Storage.prototype.getString = function (key, fallback) {
        try {
            var value = this.storage.getItem(this.key(key));
            return value === null ? (fallback === undefined ? '' : fallback) : value;
        } catch (_) {
            return fallback === undefined ? '' : fallback;
        }
    };
    Storage.prototype.setString = function (key, value) {
        try {
            this.storage.setItem(this.key(key), String(value));
            return true;
        } catch (_) {
            return false;
        }
    };
    Storage.prototype.getJSON = function (key, fallback) {
        var value = this.getString(key, '');
        if (!value) return fallback;
        try { return JSON.parse(value); } catch (_) { return fallback; }
    };
    Storage.prototype.setJSON = function (key, value) {
        try { return this.setString(key, JSON.stringify(value)); } catch (_) { return false; }
    };
    Storage.prototype.remove = function (key) {
        try {
            this.storage.removeItem(this.key(key));
            return true;
        } catch (_) {
            return false;
        }
    };

    function AudioRuntime(gameId, storage) {
        this.storage = storage || new Storage(gameId);
        this.preferenceKey = 'sound-enabled';
    }

    AudioRuntime.prototype.isEnabled = function (fallback) {
        var value = this.storage.getString(this.preferenceKey, '');
        return value === '' ? fallback !== false : value === '1';
    };
    AudioRuntime.prototype.setEnabled = function (enabled) {
        return this.storage.setString(this.preferenceKey, enabled ? '1' : '0');
    };
    AudioRuntime.prototype.resumeContext = function (context) {
        if (!context || context.state !== 'suspended' || typeof context.resume !== 'function') {
            return Promise.resolve(context);
        }
        return context.resume().then(function () { return context; });
    };
    AudioRuntime.prototype.safePlay = function (audio) {
        if (!audio || !this.isEnabled(true) || typeof audio.play !== 'function') return Promise.resolve(false);
        try {
            var result = audio.play();
            return result && typeof result.then === 'function'
                ? result.then(function () { return true; }).catch(function () { return false; })
                : Promise.resolve(true);
        } catch (_) {
            return Promise.resolve(false);
        }
    };

    function RankingClient(options) {
        options = options || {};
        this.gameId = normalizeGameId(options.gameId);
        this.apiBase = String(options.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
        this.maxQueue = Math.max(1, Number(options.maxQueue) || 96);
        this.fetch = options.fetch || (typeof global.fetch === 'function'
            ? global.fetch.bind(global)
            : function () { return Promise.reject(new Error('fetch unavailable')); });
        this.now = options.now || Date.now;
        this.sessionId = '';
        this.queue = [];
        this.disabled = false;
        this.syncing = false;
    }

    RankingClient.prototype.request = async function (path, options) {
        var response = await this.fetch(this.apiBase + path, options || {});
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(data.error || path + ' ' + response.status);
        return data;
    };
    RankingClient.prototype.start = async function (extra) {
        this.sessionId = '';
        this.queue = [];
        this.disabled = false;
        try {
            var data = await this.request('/score-sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(Object.assign({ game_id: this.gameId }, extra || {}))
            });
            this.sessionId = String(data.session_id || '');
            if (!this.sessionId) throw new Error('empty ranking session');
            return this.sessionId;
        } catch (_) {
            this.disabled = true;
            return '';
        }
    };
    RankingClient.prototype.record = function (event) {
        if (this.disabled || !this.sessionId || !event) return false;
        var normalized = Object.assign({}, event, { at: event.at || this.now() });
        this.queue.push(normalized);
        if (this.queue.length > this.maxQueue) this.queue.splice(0, this.queue.length - this.maxQueue);
        return true;
    };
    RankingClient.prototype.flush = async function () {
        if (this.disabled || !this.sessionId || this.syncing || this.queue.length === 0) return false;
        this.syncing = true;
        try {
            while (this.queue.length) {
                var events = this.queue.slice(0, 20);
                await this.request('/score-events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ game_id: this.gameId, session_id: this.sessionId, events: events })
                });
                this.queue.splice(0, events.length);
            }
            return true;
        } catch (_) {
            this.disabled = true;
            this.queue = [];
            return false;
        } finally {
            this.syncing = false;
        }
    };
    RankingClient.prototype.submit = async function (playerName, score, extraData) {
        if (this.disabled || !this.sessionId) throw new Error('ranking offline');
        if (this.queue.length && !(await this.flush())) throw new Error('score sync failed');
        return this.request('/rankings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                game_id: this.gameId,
                player_name: playerName,
                score: Math.floor(Number(score) || 0),
                session_id: this.sessionId,
                extra_data: extraData
            })
        });
    };
    RankingClient.prototype.fetchTop = async function (limit) {
        var safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
        var data = await this.request('/rankings?game_id=' + encodeURIComponent(this.gameId) + '&limit=' + safeLimit, {
            headers: { Accept: 'application/json' }
        });
        return Array.isArray(data.rankings) ? data.rankings : [];
    };

    function registerServiceWorker(url) {
        if (!url || isAutomatedAgent() || !global.navigator || !global.navigator.serviceWorker) return Promise.resolve(null);
        return global.navigator.serviceWorker.register(url).catch(function (error) {
            if (global.ArcherLabClientErrorReporter) {
                global.ArcherLabClientErrorReporter.report(error, { source: 'shared-service-worker', url: url });
            }
            return null;
        });
    }

    var currentScript = global.document && global.document.currentScript;
    var currentGameId = normalizeGameId(
        currentScript && currentScript.getAttribute('data-game-id')
        || global.__ARCHERLAB_GAME_ID__
        || (global.location && global.location.pathname.split('/').filter(Boolean)[0])
    );
    var runtimeStorage = new Storage(currentGameId);

    global.ArcherGames = Object.freeze({
        version: '1.0.0',
        gameId: currentGameId,
        Storage: Storage,
        storage: runtimeStorage,
        AudioRuntime: AudioRuntime,
        audio: new AudioRuntime(currentGameId, runtimeStorage),
        RankingClient: RankingClient,
        createRankingClient: function (options) {
            return new RankingClient(Object.assign({ gameId: currentGameId }, options || {}));
        },
        registerServiceWorker: registerServiceWorker,
        reportError: function (error, context) {
            if (global.ArcherLabClientErrorReporter) global.ArcherLabClientErrorReporter.report(error, context || {});
        }
    });

    var workerUrl = currentScript && currentScript.getAttribute('data-service-worker');
    if (workerUrl && global.addEventListener) {
        global.addEventListener('load', function () { registerServiceWorker(workerUrl); }, { once: true });
    }
})(window);
