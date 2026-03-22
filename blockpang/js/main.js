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
        backgroundColor: 0x030318,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        powerPreference: 'high-performance',
    });

    container.appendChild(app.canvas);

    // Prevent context menu on long press (mobile)
    app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Create game
    const game = new Game(app);

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

    console.log('%c🎮 블럭팡 Premium Edition', 'color: #00E5FF; font-size: 14px; font-weight: bold;');
})();

// 【글로벌 에러 핸들러】
(function() {
    var ERROR_ENDPOINT = 'https://chatbot-api.yama5993.workers.dev/error-logs';
    var APP_ID = 'blockpang';
    var _lastError = '';
    var _errorCount = 0;
    var _session = Math.random().toString(36).substring(2, 8);

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

    function _sendError(type, msg, stack, src) {
        var errClass = _classifyError(msg, stack, src);
        if (!msg) return;
        var key = msg + '|' + src;
        if (key === _lastError) { _errorCount++; if (_errorCount > 5) return; }
        else { _lastError = key; _errorCount = 1; }

        var ctx = 'sess:' + _session + ' | path:' + location.pathname + ' | online:' + navigator.onLine + ' | vw:' + innerWidth + 'x' + innerHeight;
        var payload = {
            appId: APP_ID, userId: '',
            message: ('[' + errClass + ':' + type + '] ' + (msg || '')).substring(0, 500),
            stack: (
                '[ctx] ' + ctx +
                '\n[src] ' + (src || 'N/A') +
                '\n[ua] ' + navigator.userAgent.substring(0, 150) +
                '\n[ref] ' + (document.referrer || 'direct') +
                '\n[time] ' + new Date().toISOString() +
                '\n[trace]\n' + (stack || 'no stack')
            ).substring(0, 2000),
            url: (src || location.href).substring(0, 500)
        };

        try { navigator.sendBeacon(ERROR_ENDPOINT, JSON.stringify(payload)); } catch (_) {}
    }

    window.addEventListener('error', function(e) {
        var src = (e.filename || '') + ':' + e.lineno + ':' + e.colno;
        _sendError(e.error?.name || 'Error', e.message, e.error?.stack || '', src);
    });

    window.addEventListener('unhandledrejection', function(e) {
        var reason = e.reason;
        var msg = reason?.message || String(reason || 'Unhandled rejection');
        _sendError('UnhandledRejection', msg, reason?.stack || '', location.href);
    });
})();
