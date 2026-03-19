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

// Handle orientation change: recalculate and resize game
function handleResize() {
    if (!game || !game.scale) return;

    setTimeout(() => {
        const newSize = calcGameSize();

        // Only resize if aspect ratio changed significantly
        if (Math.abs(newSize.w - GAME_WIDTH) > 10 || Math.abs(newSize.h - GAME_HEIGHT) > 10) {
            setGameDimensions(newSize.w, newSize.h);
            game.scale.resize(newSize.w, newSize.h);
        }

        game.scale.refresh();
    }, 200);
}

window.addEventListener('orientationchange', handleResize);
window.addEventListener('resize', handleResize);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
}

// 【글로벌 에러 핸들러】
(function() {
    var ERROR_ENDPOINT = 'https://chatbot-api.yama5993.workers.dev/error-logs';
    var lang = (document.documentElement.lang || 'ko').substring(0, 2);
    var APP_ID = lang === 'ko' ? 'solo-leveling' : 'solo-leveling-' + lang;
    var _lastError = '';
    var _errorCount = 0;

    function _sendError(message, stack, url) {
        var key = message + (url || '');
        if (key === _lastError) { _errorCount++; if (_errorCount > 3) return; }
        else { _lastError = key; _errorCount = 1; }
        try {
            navigator.sendBeacon(ERROR_ENDPOINT, JSON.stringify({
                appId: APP_ID, userId: '',
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
