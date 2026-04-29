// 그림자 서바이벌: 서바이버즈 - Phaser 기반 뱀서라이크 게임
import { setGameDimensions, GAME_WIDTH, GAME_HEIGHT } from './utils/Constants.js';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { LevelUpScene } from './scenes/LevelUpScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

// Calculate game dimensions to match screen aspect ratio
// This eliminates black bars on all devices
const MIN_W = 1024;
const MIN_H = 768;

function calcGameSize() {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const aspect = screenW / screenH;
    const designAspect = MIN_W / MIN_H;

    let w, h;
    if (aspect >= designAspect) {
        // Screen is wider than design (landscape phone, ultrawide PC)
        // Keep height, expand width
        h = MIN_H;
        w = Math.round(MIN_H * aspect);
    } else {
        // Screen is taller than design (portrait phone)
        // Keep width, expand height
        w = MIN_W;
        h = Math.round(MIN_W / aspect);
    }
    return { w, h };
}

const size = calcGameSize();
setGameDimensions(size.w, size.h);

const config = {
    type: Phaser.WEBGL,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#0a0a1a',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false,
        },
    },
    scene: [BootScene, PreloadScene, MenuScene, GameScene, LevelUpScene, GameOverScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        expandParent: false,
    },
    input: {
        activePointers: 3,
        touch: {
            capture: true,
        },
    },
    render: {
        pixelArt: false,
        antialias: true,
    },
};

const game = new Phaser.Game(config);

// Handle orientation/resize: CSS scaling only (Phaser FIT mode handles the rest)
let resizeRefreshTimer = null;
function handleResize() {
    if (!game || !game.scale) return;
    if (resizeRefreshTimer) clearTimeout(resizeRefreshTimer);
    resizeRefreshTimer = setTimeout(() => {
        resizeRefreshTimer = null;
        if (game && game.scale) game.scale.refresh();
    }, 200);
}

window.addEventListener('orientationchange', handleResize);
window.addEventListener('resize', handleResize);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
}

game.events.on('destroy', () => {
    if (resizeRefreshTimer) {
        clearTimeout(resizeRefreshTimer);
        resizeRefreshTimer = null;
    }
    window.removeEventListener('orientationchange', handleResize);
    window.removeEventListener('resize', handleResize);
    if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
    }
});

// 【글로벌 에러 핸들러】
(function() {
    var ERROR_ENDPOINT = 'https://chatbot-api.yama5993.workers.dev/error-logs';
    var lang = (document.documentElement.lang || 'ko').substring(0, 2);
    var APP_ID = lang === 'ko' ? 'solo-leveling' : 'solo-leveling-' + lang;
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
