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
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
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

    function _sendError(message, stack, url) {
        var key = message + (url || '');
        if (key === _lastError) { _errorCount++; if (_errorCount > 3) return; }
        else { _lastError = key; _errorCount = 1; }
        try {
            navigator.sendBeacon(ERROR_ENDPOINT, JSON.stringify({
                appId: APP_ID, userId: localStorage.getItem('blockpang_player_name') || '',
                message: (message || '').substring(0, 500),
                stack: (stack || '').substring(0, 2000),
                url: (url || '').substring(0, 500)
            }));
        } catch (_) {}
    }

    window.addEventListener('error', function(e) {
        _sendError(e.message, e.error?.stack || '', e.filename + ':' + e.lineno + ':' + e.colno);
    });
    window.addEventListener('unhandledrejection', function(e) {
        var reason = e.reason;
        _sendError(reason?.message || String(reason || 'Unhandled rejection'), reason?.stack || '', location.href);
    });
})();
