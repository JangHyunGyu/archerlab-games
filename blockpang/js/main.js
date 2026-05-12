// ─── Entry Point ───
(async function () {
    'use strict';

    // Wait for DOM
    if (document.readyState === 'loading') {
        await new Promise(r => document.addEventListener('DOMContentLoaded', r));
    }

    const container = document.getElementById('game-container');

    // Create PixiJS Application (v8 async init)
    const app = new PIXI.Application();
    await app.init({
        resizeTo: container,
        backgroundColor: 0xF5ECDA,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        powerPreference: 'high-performance',
    });

    container.appendChild(app.canvas);

    // Prevent context menu on long press (mobile)
    app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.BLOCKPANG_ASSETS = {};
    if (window.BLOCKPANG_ASSET_MANIFEST && PIXI.Assets) {
        try {
            const manifest = window.getBlockpangAssetManifest
                ? window.getBlockpangAssetManifest(false)
                : window.BLOCKPANG_ASSET_MANIFEST;
            PIXI.Assets.addBundle('blockpang-ui', manifest);
            window.BLOCKPANG_ASSETS = await PIXI.Assets.loadBundle('blockpang-ui');
        } catch (e) {
            console.warn('[Blockpang] WebP UI asset load failed; trying PNG fallback.', e);
            try {
                const fallbackManifest = window.getBlockpangAssetManifest
                    ? window.getBlockpangAssetManifest(true)
                    : window.BLOCKPANG_ASSET_MANIFEST;
                PIXI.Assets.addBundle('blockpang-ui-png-fallback', fallbackManifest);
                window.BLOCKPANG_ASSETS = await PIXI.Assets.loadBundle('blockpang-ui-png-fallback');
            } catch (fallbackError) {
                console.warn('[Blockpang] UI asset load failed; using vector fallback.', fallbackError);
                window.BLOCKPANG_ASSETS = {};
            }
        }
    }

    // Create game
    const game = new Game(app);
    window.__blockpangGame = game;

    // Handle resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            game.resize();
        }, 150);
    });

    // Handle orientation change
    let orientTimer;
    window.addEventListener('orientationchange', () => {
        clearTimeout(orientTimer);
        orientTimer = setTimeout(() => {
            game.resize();
        }, 300);
    });

    // Ensure audio context on first interaction
    const resumeAudio = () => {
        game.sound.ensureContext();
        document.removeEventListener('pointerdown', resumeAudio);
    };
    document.addEventListener('pointerdown', resumeAudio);

    // Prevent pull-to-refresh on mobile
    document.body.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
        }
    }, { passive: false });

    // DOM-level fallback for UI buttons (bypasses PixiJS event system)
    app.canvas.addEventListener('pointerdown', (e) => {
        if (game.ui.shouldBlockDomFallback && game.ui.shouldBlockDomFallback()) return;
        if (!game.ui._activeButtons || game.ui._activeButtons.length === 0) return;
        const rect = app.canvas.getBoundingClientRect();
        const scaleX = app.screen.width / rect.width;
        const scaleY = app.screen.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        for (const btn of game.ui._activeButtons) {
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                btn.action();
                return;
            }
        }
    }, { passive: true });

    console.log('%c블럭팡', 'color: #E57A54; font-size: 14px; font-weight: bold;');
})();

// 【글로벌 에러 핸들러】
(function() {
    var ERROR_ENDPOINT = 'https://chatbot-api.yama5993.workers.dev/error-logs';
    var APP_ID = 'blockpang';
    var _lastError = '';
    var _errorCount = 0;
    var _session = Math.random().toString(36).substring(2, 8);

    function _trimString(value, maxLength) {
        return String(value || '').substring(0, maxLength);
    }

    function _normalizeExtra(extra) {
        if (extra === undefined || extra === null) return null;
        if (typeof extra === 'string') return { note: extra };
        if (typeof extra === 'object') {
            try {
                return JSON.parse(JSON.stringify(extra));
            } catch (_) {
                return { note: String(extra) };
            }
        }
        return { value: String(extra) };
    }

    function _countFilledCells(grid) {
        if (!Array.isArray(grid)) return null;
        var count = 0;
        for (var r = 0; r < grid.length; r++) {
            if (!Array.isArray(grid[r])) continue;
            for (var c = 0; c < grid[r].length; c++) {
                if (grid[r][c] !== -1) count++;
            }
        }
        return count;
    }

    function _getGameSnapshot() {
        try {
            var game = window.__blockpangGame;
            if (!game) return null;

            var trayFilledSlots = 0;
            if (game.tray && Array.isArray(game.tray.slots)) {
                for (var i = 0; i < game.tray.slots.length; i++) {
                    if (game.tray.slots[i]) trayFilledSlots++;
                }
            }

            return {
                state: game.state || '',
                isAnimating: !!game.isAnimating,
                isGameOver: !!game.isGameOver,
                placementToken: typeof game._placementAnimationToken === 'number' ? game._placementAnimationToken : null,
                pendingTimeouts: Array.isArray(game._pendingTimeouts) ? game._pendingTimeouts.length : 0,
                filledCells: _countFilledCells(game.board && game.board.grid),
                trayFilledSlots: trayFilledSlots,
                score: game.scoreManager ? game.scoreManager.score : null,
                level: game.scoreManager ? game.scoreManager.level : null,
                combo: game.scoreManager ? game.scoreManager.combo : null,
            };
        } catch (_) {
            return { snapshotError: true };
        }
    }

    function _getContext() {
        try {
            return {
                sessionId: _session,
                path: location.pathname,
                href: location.href,
                referrer: document.referrer || 'direct',
                online: navigator.onLine,
                language: navigator.language || '',
                visibility: document.visibilityState || (document.hidden ? 'hidden' : 'visible'),
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight,
                },
                capturedAt: new Date().toISOString(),
                game: _getGameSnapshot(),
            };
        } catch (_) {
            return {
                sessionId: _session,
                contextError: true,
            };
        }
    }

    function _classifyError(msg, stack, src) {
        if (!msg) return 'noise';
        if (msg === 'Script error.' && !stack) return 'noise';
        if (/Can't find variable: (gmo|__gCrWeb|ytcfg|__)/.test(msg)) return 'noise';
        if (/ResizeObserver loop/.test(msg)) return 'noise';
        // External scripts
        if (src && /googletagmanager|google-analytics|gtag\/js|cloudflare|chrome-extension|moz-extension|safari-extension/.test(src)) return 'external';
        if (src && /^undefined:/.test(src) && !(stack || '').match(/\/(assets|js|modules)\//)) return 'external';
        if (/Loading chunk|dynamically imported module/.test(msg)) return 'network';
        return 'app';
    }

    function _sendPayload(payload) {
        var body = JSON.stringify(payload);
        try {
            if (navigator.sendBeacon && navigator.sendBeacon(ERROR_ENDPOINT, body)) {
                return;
            }
        } catch (_) {}

        try {
            fetch(ERROR_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body,
                keepalive: true,
            });
        } catch (_) {}
    }

    function _sendError(type, msg, stack, src, extra) {
        var errClass = _classifyError(msg, stack, src);
        if (!msg) return;
        var key = type + '|' + msg + '|' + src;
        if (key === _lastError) { _errorCount++; if (_errorCount > 5) return; }
        else { _lastError = key; _errorCount = 1; }

        var context = _getContext();
        var extraData = _normalizeExtra(extra);
        var payload = {
            appId: APP_ID, userId: '',
            message: ('[' + errClass + ':' + type + '] ' + (msg || '')).substring(0, 500),
            stack: [
                '[ctx] ' + _trimString(JSON.stringify(context), 1500),
                '[src] ' + (src || 'N/A'),
                '[extra] ' + (extraData ? _trimString(JSON.stringify(extraData), 1200) : 'null'),
                '[ua] ' + navigator.userAgent.substring(0, 300),
                '[trace]',
                stack || 'no stack'
            ].join('\n').substring(0, 4000),
            url: _trimString(location.href, 500),
            source: _trimString(src || 'N/A', 500),
            errorType: _trimString(type || 'Error', 100),
            errorClass: _trimString(errClass, 50),
            sessionId: _trimString(_session, 32),
            context: context,
            extra: extraData,
        };

        _sendPayload(payload);
    }

    // 게임 코드에서 호출 가능하도록 전역 노출
    window._sendGameError = _sendError;

    window.addEventListener('error', function(e) {
        var src = (e.filename || '') + ':' + e.lineno + ':' + e.colno;
        _sendError(e.error?.name || 'Error', e.message, e.error?.stack || '', src, {
            handler: 'window.error',
            filename: e.filename || '',
            line: e.lineno || 0,
            column: e.colno || 0,
        });
    });

    window.addEventListener('unhandledrejection', function(e) {
        var reason = e.reason;
        var msg = reason?.message || String(reason || 'Unhandled rejection');
        _sendError('UnhandledRejection', msg, reason?.stack || '', location.href, {
            handler: 'window.unhandledrejection',
            reasonType: reason?.name || typeof reason,
        });
    });
})();
