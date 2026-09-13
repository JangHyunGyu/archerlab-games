(function installRankingDelivery(global) {
    'use strict';
    if (global.ArcherRanking || typeof global.fetch !== 'function') return;
    var API = 'https://game-api.yama5993.workers.dev';
    var PREFIX = 'archer-ranking-outbox-v1:';
    var originalFetch = global.fetch.bind(global);
    var entries = new Map();
    var sessions = new Map();
    var tails = new Map();
    var inflight = new Map();
    var waiters = new Map();
    var timer = null;
    var dismissed = false;
    var database;
    var lastCreatedAt = 0;

    function uuid() {
        if (global.crypto.randomUUID) return global.crypto.randomUUID();
        var bytes = new Uint8Array(16);
        global.crypto.getRandomValues(bytes);
        return Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    }
    function pendingText() {
        var language = String(global.document?.documentElement?.lang || 'ko').slice(0, 2);
        return language === 'en' ? 'Record kept. Ranking will sync automatically.'
            : language === 'ja' ? '記録を保存しました。接続が戻ると自動でランキングに登録します。'
                : '기록을 보관했어요. 연결되면 자동으로 등록합니다.';
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function key(entry) { return PREFIX + entry.id; }
    function putLocal(entry) {
        try { global.localStorage.setItem(key(entry), JSON.stringify(entry)); return true; }
        catch (_) { return false; }
    }
    function openDatabase() {
        if (database) return database;
        database = new Promise(function (resolve) {
            try {
                var request = global.indexedDB.open('archer-ranking-delivery', 1);
                request.onupgradeneeded = function () { request.result.createObjectStore('outbox', { keyPath: 'id' }); };
                request.onsuccess = function () { resolve(request.result); };
                request.onerror = request.onblocked = function () { resolve(null); };
            } catch (_) { resolve(null); }
        });
        return database;
    }
    async function putDatabase(entry, remove) {
        var db = await openDatabase();
        if (!db) return false;
        return new Promise(function (resolve) {
            try {
                var transaction = db.transaction('outbox', 'readwrite');
                var store = transaction.objectStore('outbox');
                if (remove) store.delete(entry.id); else store.put(clone(entry));
                transaction.oncomplete = function () { resolve(true); };
                transaction.onerror = transaction.onabort = function () { resolve(false); };
            } catch (_) { resolve(false); }
        });
    }
    function remember(entry) {
        var current = entries.get(entry.id);
        if (current) return current;
        entries.set(entry.id, entry);
        lastCreatedAt = Math.max(lastCreatedAt, entry.createdAt);
        var previous = entries.get(tails.get(entry.sessionId));
        if (!previous || previous.createdAt <= entry.createdAt) tails.set(entry.sessionId, entry.id);
        return entry;
    }
    async function restore() {
        try {
            for (var i = 0; i < global.localStorage.length; i += 1) {
                var storedKey = global.localStorage.key(i);
                if (storedKey && storedKey.indexOf(PREFIX) === 0) {
                    try { var restored = JSON.parse(global.localStorage.getItem(storedKey)); restored.localSaved = true; remember(restored); } catch (_) {}
                }
            }
        } catch (_) {}
        var db = await openDatabase();
        if (db) await new Promise(function (resolve) {
            try {
                var request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
                request.onsuccess = function () { request.result.forEach(function (entry) { entry.localSaved = true; remember(entry); }); resolve(); };
                request.onerror = function () { resolve(); };
            } catch (_) { resolve(); }
        });
        renderStatus();
        schedule(0);
    }
    function schedule(delay) {
        if (timer !== null) global.clearTimeout(timer);
        timer = global.setTimeout(function () { timer = null; void pump(); }, delay === undefined ? 1500 : delay);
    }
    function enqueue(path, body, sessionId, id) {
        id = id || uuid();
        var existing = entries.get(id);
        if (existing) return existing;
        var entry = {
            id: id, path: path, gameId: body.game_id, sessionId: sessionId,
            body: clone(body), after: tails.get(sessionId) || null,
            createdAt: Math.max(Date.now(), lastCreatedAt + 1), state: 'pending', accepted: false, attempts: 0,
        };
        remember(entry);
        entry.localSaved = putLocal(entry);
        // Each command has its own storage key: another tab cannot overwrite a queue.
        entry.durable = putDatabase(entry, false).then(function (saved) {
            entry.localSaved = entry.localSaved || saved;
            renderStatus();
            return entry.localSaved;
        });
        schedule(0);
        renderStatus();
        return entry;
    }
    function track(gameId, event, sessionId, extra) {
        if (!event || typeof event !== 'object') return event;
        sessionId = sessionId || sessions.get(gameId);
        if (!sessionId) return event;
        if (!event._delivery_id) event._delivery_id = uuid();
        enqueue('/score-events', Object.assign({}, extra || {}, {
            game_id: gameId, session_id: sessionId, events: [event],
        }), sessionId, event._delivery_id);
        return event;
    }
    function notify(entry) {
        var callbacks = waiters.get(entry.id) || [];
        waiters.delete(entry.id);
        callbacks.forEach(function (resolve) { resolve(entry); });
    }
    function waitFor(entry, signal) {
        if (entry.state === 'done' || entry.state === 'review') return Promise.resolve(entry);
        return new Promise(function (resolve, reject) {
            var callbacks = waiters.get(entry.id) || [];
            function finish(value) { if (signal) signal.removeEventListener('abort', abort); resolve(value); }
            function abort() {
                var current = waiters.get(entry.id) || [];
                waiters.set(entry.id, current.filter(function (callback) { return callback !== finish; }));
                reject(new DOMException('The UI stopped waiting; the ranking record is still queued.', 'AbortError'));
            }
            if (signal && signal.aborted) { abort(); return; }
            if (signal) signal.addEventListener('abort', abort, { once: true });
            callbacks.push(finish);
            waiters.set(entry.id, callbacks);
        });
    }
    function responseFor(entry) {
        return new Response(JSON.stringify(entry.data || { pending: true, accepted: entry.accepted, request_id: entry.id }), {
            status: entry.state === 'done' ? 200 : entry.state === 'review' ? (entry.status || 400) : 202,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    async function sendSession(sessionId) {
        if (inflight.has(sessionId)) return inflight.get(sessionId);
        var task = (async function () {
            var batch = Array.from(entries.values()).filter(function (entry) {
                return entry.sessionId === sessionId && entry.state === 'pending';
            }).sort(function (a, b) { return a.createdAt - b.createdAt; }).slice(0, 20);
            if (!batch.length) return;
            await Promise.all(batch.map(function (entry) { return entry.durable; }));
            var controller = new AbortController();
            var timeout = global.setTimeout(function () { controller.abort(); }, 12000);
            try {
                var response = await originalFetch(API + '/ranking-delivery', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({ game_id: batch[0].gameId, session_id: sessionId,
                        commands: batch.map(function (entry) { return {
                            id: entry.id, path: entry.path, body: entry.body, after: entry.after,
                        }; }),
                    }),
                });
                if (!response.ok) throw new Error('delivery HTTP ' + response.status);
                var result = await response.json();
                if (!Array.isArray(result.results)) throw new Error('invalid delivery response');
                for (var item of result.results) {
                    var entry = entries.get(item.id);
                    if (!entry || !batch.includes(entry)) continue;
                    entry.accepted = true;
                    entry.state = item.state;
                    entry.status = item.status;
                    entry.data = item.data;
                    if (entry.state === 'done') {
                        // Keep a tiny in-memory receipt for the active game's flush;
                        // remove durable client data only after server confirmation.
                        await putDatabase(entry, true);
                        try { global.localStorage.removeItem(key(entry)); } catch (_) {}
                        notify(entry);
                    } else {
                        putLocal(entry);
                        await putDatabase(entry, false);
                        if (entry.state === 'review') notify(entry);
                    }
                }
            } catch (_) {
                batch.forEach(function (entry) { entry.attempts += 1; });
            } finally {
                global.clearTimeout(timeout);
                renderStatus();
            }
        })();
        inflight.set(sessionId, task);
        try { await task; } finally { inflight.delete(sessionId); }
    }
    async function pump() {
        var pending = Array.from(entries.values()).filter(function (entry) { return entry.state === 'pending'; });
        if (!pending.length) return;
        if (!global.navigator || global.navigator.onLine !== false) {
            // Limit concurrent sessions so a large restored journal stays mobile-friendly.
            var ids = Array.from(new Set(pending.map(function (entry) { return entry.sessionId; })));
            for (var i = 0; i < ids.length; i += 3) await Promise.all(ids.slice(i, i + 3).map(sendSession));
        }
        if (Array.from(entries.values()).some(function (entry) { return entry.state === 'pending'; })) schedule(2500);
    }
    async function submit(body) {
        var sessionId = body.session_id || sessions.get(body.game_id);
        if (!sessionId) throw new Error('ranking session unavailable');
        var entry = enqueue('/rankings', Object.assign({}, body, { session_id: sessionId }), sessionId, 'submit_' + sessionId);
        dismissed = false;
        renderStatus();
        await entry.durable;
        // Bound the UI wait. Pending is explicitly different from saved.
        var timeout;
        await Promise.race([sendSession(sessionId), new Promise(function (resolve) { timeout = global.setTimeout(resolve, 4000); })]);
        global.clearTimeout(timeout);
        if (entry.state === 'review') throw new Error(entry.data.error || 'ranking requires review');
        if (entry.state === 'done') return entry.data;
        if (!entry.localSaved && !entry.accepted) throw new Error('기록을 보관하지 못했습니다. 이 화면을 닫지 말고 다시 시도해 주세요.');
        return { pending: true, accepted: entry.accepted, request_id: entry.id, player_name: body.player_name, score: body.score };
    }
    async function deliveryFetch(url, options) {
        var path;
        try {
            var parsed = new URL(typeof url === 'string' ? url : url.url, global.location?.href);
            if (parsed.origin !== API) return originalFetch(url, options);
            path = parsed.pathname;
        } catch (_) { return originalFetch(url, options); }
        if (!options || options.method !== 'POST' || !['/score-sessions', '/score-events', '/rankings'].includes(path)) {
            return originalFetch(url, options);
        }
        var body = JSON.parse(options.body);
        if (path === '/rankings') {
            var data = await submit(body);
            return new Response(JSON.stringify(data), { status: data.pending ? 202 : 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (path === '/score-sessions') {
            var sessionId = uuid();
            sessions.set(body.game_id, sessionId);
            var start = enqueue(path, body, sessionId, sessionId);
            return responseFor(await waitFor(start));
        }
        var events = body.events || (body.event ? [body.event] : []);
        var requests = events.map(function (event) {
            var extra = Object.assign({}, body);
            delete extra.event; delete extra.events;
            track(body.game_id, event, body.session_id, extra);
            return entries.get(event._delivery_id);
        });
        if (!requests.length) return originalFetch(url, options);
        var completed = await Promise.all(requests.map(function (entry) { return waitFor(entry, options.signal); }));
        var failed = completed.find(function (entry) { return entry.state === 'review'; });
        return responseFor(failed || completed[completed.length - 1]);
    }
    function renderStatus() {
        var document = global.document;
        if (!document || !document.body) return;
        var language = String(document.documentElement?.lang || 'ko').slice(0, 2);
        var copy = language === 'en' ? {
            label: 'Ranking save status', close: 'Dismiss notice. Your record will keep syncing.',
            unsafe: 'This record could not be stored. Please keep this page open.',
            review: 'Your record is retained and waiting for score verification.',
        } : language === 'ja' ? {
            label: 'ランキング保存状況', close: '通知を閉じる。記録の送信は継続します。',
            unsafe: '記録を保存できませんでした。この画面を閉じないでください。',
            review: '記録を保存しました。スコアの確認を待っています。',
        } : {
            label: '랭킹 저장 상태', close: '알림 닫기. 기록은 계속 저장됩니다',
            unsafe: '기록을 보관하지 못했습니다. 이 화면을 닫지 말아 주세요.',
            review: '기록을 보관했습니다. 점수 확인이 필요해 랭킹 반영을 기다리고 있습니다.',
        };
        var submissions = Array.from(entries.values()).filter(function (entry) { return entry.path === '/rankings'; });
        var pending = submissions.filter(function (entry) { return entry.state !== 'done'; });
        var element = document.getElementById('ranking-delivery-status');
        if (!pending.length || dismissed) { if (element) element.remove(); return; }
        if (!element) {
            element = document.createElement('aside');
            element.id = 'ranking-delivery-status';
            element.setAttribute('aria-label', copy.label);
            element.style.cssText = 'position:fixed;z-index:2147483646;top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));max-width:480px;margin:0 auto;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:8px 8px 8px 14px;border:1px solid #64748b;border-radius:12px;background:#101827;color:#fff;box-shadow:0 4px 20px #0006;font:14px/1.5 system-ui,sans-serif;pointer-events:auto;';
            var text = document.createElement('span');
            text.setAttribute('role', 'status');
            text.setAttribute('aria-live', 'polite');
            text.style.cssText = 'flex:1;min-width:0;word-break:keep-all;overflow-wrap:anywhere;';
            var close = document.createElement('button');
            close.type = 'button'; close.textContent = '×';
            close.setAttribute('aria-label', copy.close);
            close.style.cssText = 'flex:0 0 44px;width:44px;height:44px;border:0;border-radius:8px;background:#334155;color:#fff;font-size:24px;cursor:pointer;';
            close.addEventListener('click', function () { dismissed = true; renderStatus(); });
            element.append(text, close); document.body.appendChild(element);
        }
        var unsafe = pending.some(function (entry) { return !entry.localSaved && !entry.accepted; });
        var review = pending.some(function (entry) { return entry.state === 'review'; });
        element.firstChild.textContent = unsafe ? copy.unsafe : review ? copy.review : pendingText();
    }
    global.ArcherRanking = Object.freeze({ track: track, submit: submit, fetch: deliveryFetch, pendingText: pendingText,
        sessionId: function (gameId) { return sessions.get(gameId) || null; },
        flush: pump,
        pending: function () { return Array.from(entries.values()).filter(function (entry) { return entry.state !== 'done'; }).map(clone); },
    });
    // Only the three game ranking mutation URLs are intercepted. Existing game
    // modules keep their response API; unrelated requests are passed through.
    global.fetch = deliveryFetch;
    if (global.addEventListener) {
        global.addEventListener('online', function () { schedule(0); });
        global.addEventListener('pageshow', function () { schedule(0); });
        global.addEventListener('storage', function (event) {
            if (event.key && event.key.indexOf(PREFIX) === 0 && event.newValue) {
                try { remember(JSON.parse(event.newValue)); schedule(0); } catch (_) {}
            }
        });
    }
    if (global.document) global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') schedule(0);
    });
    void restore();
})(window);
