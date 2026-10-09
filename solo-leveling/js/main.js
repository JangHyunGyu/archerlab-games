// 그림자 서바이벌: 서바이버즈 - Phaser 기반 뱀서라이크 게임
import { setGameDimensions, GAME_WIDTH, GAME_HEIGHT } from './utils/Constants.js';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js?v=20260913-crafted-ui-v1';
import { MenuScene } from './scenes/MenuScene.js?v=20260928-locale-exports-v1&ranking=20261006-client-exception-v1&levelup=20261009-audio-v3&orient=20261009-orient-v1&audit=20261009-v1';
import { GameScene } from './scenes/GameScene.js?v=20260928-locale-exports-v1&ranking=20261006-client-exception-v1&levelup=20261009-audio-v3&orient=20261009-orient-v1&audit=20261009-v1';
import { LevelUpScene } from './scenes/LevelUpScene.js?v=20260915-locale-v1&audio=20261009-clean-v1&orient=20261009-orient-v1';
import { generateLevelUpChoices } from './scenes/LevelUpChoices.js?v=20260922-tskill-v1&audit=20261009-v1';
import { installInRunLocalePatches } from './utils/inrun-locale-patches.js?v=20260928-locale-exports-v1&orient=20261009-orient-v1';
import { GameOverScene } from './scenes/GameOverScene.js?v=20260904-continuation-rank-v1&ranking=20261004-ranking-audit-v1';

installInRunLocalePatches();

// Calculate game dimensions to match screen aspect ratio
// This eliminates black bars on all devices
const MIN_W = 1024;
const MIN_H = 768;

function visualViewportBox() {
    const viewport = window.visualViewport;
    return {
        w: Math.max(1, Math.round(viewport?.width || window.innerWidth || 1)),
        h: Math.max(1, Math.round(viewport?.height || window.innerHeight || 1)),
        top: Math.round(viewport?.offsetTop || 0),
        left: Math.round(viewport?.offsetLeft || 0),
    };
}

// iOS keeps the fixed page box on the previous orientation for a while after a
// rotate. Pin the document to the visual viewport before measuring the game.
function lockDocumentToVisualViewport() {
    const box = visualViewportBox();
    const root = document.documentElement;
    const body = document.body;
    root.style.width = `${box.w}px`;
    root.style.height = `${box.h}px`;
    if (!body) return box;
    body.style.width = `${box.w}px`;
    body.style.height = `${box.h}px`;
    body.style.top = `${box.top}px`;
    body.style.left = `${box.left}px`;
    body.style.right = 'auto';
    body.style.bottom = 'auto';
    return box;
}

function getViewportSize() {
    const visual = visualViewportBox();
    const container = document.getElementById('game-container');
    const boxW = Math.round(container?.clientWidth || 0);
    const boxH = Math.round(container?.clientHeight || 0);
    const visualPortrait = visual.h > visual.w;
    const boxPortrait = boxH > boxW;
    // A stale container stays on the previous orientation and would lay the
    // whole HUD out sideways. Fall back to the visual viewport until it catches up.
    if (boxW >= 2 && boxH >= 2 && boxPortrait === visualPortrait) {
        return { w: boxW, h: boxH };
    }
    const style = document.body ? getComputedStyle(document.body) : null;
    const padX = style ? (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0) : 0;
    const padY = style ? (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0) : 0;
    return {
        w: Math.max(1, Math.round(visual.w - padX)),
        h: Math.max(1, Math.round(visual.h - padY)),
    };
}

function calcGameSize() {
    const { w: screenW, h: screenH } = getViewportSize();
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

function syncCanvasDisplaySize(viewport = getViewportSize()) {
    const canvas = game?.canvas || document.querySelector('#game-container canvas');
    if (!canvas) return;

    const scale = Math.min(viewport.w / GAME_WIDTH, viewport.h / GAME_HEIGHT);
    const displayW = Math.max(1, Math.round(GAME_WIDTH * scale));
    const displayH = Math.max(1, Math.round(GAME_HEIGHT * scale));
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
    // A percentage max-size shrinks only one axis when the box is 1px tight,
    // which stretches the buffer after a portrait/landscape swap.
    canvas.style.maxWidth = `${displayW}px`;
    canvas.style.maxHeight = `${displayH}px`;
    // The container's flex layout centers the canvas without stale resize offsets.
    canvas.style.marginLeft = '0';
    canvas.style.marginTop = '0';
}

lockDocumentToVisualViewport();
const size = calcGameSize();
const viewport = getViewportSize();
setGameDimensions(size.w, size.h, viewport.w, viewport.h);

// Locale-aware level-up cards (keeps LevelUpScene.js free of hardcoded Korean).
LevelUpScene.prototype._generateChoices = function _generateChoicesLocalized() {
    return generateLevelUpChoices(this.player, this.weaponManager, (key) => this._iconTexture(key));
};

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
        // Phaser FIT can leave stale CSS dimensions after dynamic game-size changes.
        // We resize the internal game buffer and the canvas display size together.
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.NO_CENTER,
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
    // Phaser's Web Audio manager opens a second AudioContext. This game never
    // uses it, and Chrome crackles when two contexts share the device — worst
    // while the level-up screen is rendering.
    audio: {
        noAudio: true,
    },
};

const game = new Phaser.Game(config);

// Export the existing instance so browser smoke tests can inspect live scene
// transforms without creating a second Phaser game.
export { game };

// Handle orientation/resize: keep internal game size and CSS canvas size in sync.
// Phaser's pointer math (displayScale) is baseSize / canvas CSS box. It must be
// refreshed after the CSS size changes, or a rotation leaves touches on the old axis.
let resizeRefreshTimer = null;
const orientationFollowups = [];

function clearOrientationFollowups() {
    while (orientationFollowups.length) clearTimeout(orientationFollowups.pop());
}

function syncSceneCameras(width, height) {
    const scenes = game.scene?.scenes || [];
    for (const scene of scenes) {
        const cameras = scene.cameras?.cameras || [];
        for (const camera of cameras) {
            if (!camera) continue;
            if (camera.x !== 0 || camera.y !== 0) continue;
            if (camera.width === width && camera.height === height) continue;
            camera.setSize(width, height);
        }
    }
}

function applyViewport() {
    if (!game?.scale) return;
    lockDocumentToVisualViewport();
    const nextViewport = getViewportSize();
    const nextSize = calcGameSize();
    const changed = nextSize.w !== GAME_WIDTH || nextSize.h !== GAME_HEIGHT;

    if (!changed) {
        const canvas = game.canvas;
        const rect = canvas?.getBoundingClientRect?.();
        const fitted = Math.min(nextViewport.w / nextSize.w, nextViewport.h / nextSize.h);
        const wantW = Math.max(1, Math.round(nextSize.w * fitted));
        const wantH = Math.max(1, Math.round(nextSize.h * fitted));
        const cssMatches = rect && Math.abs(rect.width - wantW) <= 1 && Math.abs(rect.height - wantH) <= 1;
        const scale = game.scale.displayScale;
        const scaleMatches = cssMatches && scale && rect.width > 2
            && Math.abs(scale.x - nextSize.w / rect.width) < 0.04
            && Math.abs(scale.y - nextSize.h / rect.height) < 0.04;
        if (scaleMatches) return;
    }

    setGameDimensions(nextSize.w, nextSize.h, nextViewport.w, nextViewport.h);
    if (changed) game.scale.resize(nextSize.w, nextSize.h);
    syncSceneCameras(GAME_WIDTH, GAME_HEIGHT);
    syncCanvasDisplaySize(nextViewport);
    // Read the canvas box after the CSS write so touch coordinates match the new orientation.
    game.scale.refresh();
    syncSceneCameras(GAME_WIDTH, GAME_HEIGHT);
    if (!changed) return;

    const scenes = game.scene.scenes || game.scene.getScenes();
    scenes.forEach(scene => {
        scene.events.emit('game-resize', nextSize);
    });
}

function scheduleViewportSync(delay) {
    if (!game?.scale) return;
    if (resizeRefreshTimer) clearTimeout(resizeRefreshTimer);
    resizeRefreshTimer = setTimeout(() => {
        resizeRefreshTimer = null;
        applyViewport();
    }, delay);
}

function handleResize() {
    scheduleViewportSync(50);
}

function handleOrientationChange() {
    clearOrientationFollowups();
    scheduleViewportSync(0);
    // Mobile browsers publish the final visual viewport late, after the first resize.
    for (const delay of [80, 200, 450, 800]) {
        orientationFollowups.push(setTimeout(() => applyViewport(), delay));
    }
}

window.addEventListener('orientationchange', handleOrientationChange);
window.addEventListener('resize', handleResize);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
}
window.screen?.orientation?.addEventListener?.('change', handleOrientationChange);
requestAnimationFrame(() => applyViewport());

game.events.on('destroy', () => {
    if (resizeRefreshTimer) {
        clearTimeout(resizeRefreshTimer);
        resizeRefreshTimer = null;
    }
    clearOrientationFollowups();
    window.removeEventListener('orientationchange', handleOrientationChange);
    window.removeEventListener('resize', handleResize);
    if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
    }
    window.screen?.orientation?.removeEventListener?.('change', handleOrientationChange);
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
        if (errClass === 'noise') return;
        var key = msg + '|' + src;
        if (key === _lastError) { _errorCount++; if (_errorCount > 5) return; }
        else { _lastError = key; _errorCount = 1; }

        if (window.ArcherLabClientErrorReporter) {
            window.ArcherLabClientErrorReporter.reportPayload({
                error_type: type || 'Error',
                message: msg,
                stack: stack || '',
                source: src || '',
                error_class: errClass,
                context: { sessionId: _session },
            });
            return;
        }

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

    if (!window.ArcherLabClientErrorReporter) {
    window.addEventListener('error', function(e) {
        var src = (e.filename || '') + ':' + e.lineno + ':' + e.colno;
        _sendError(e.error?.name || 'Error', e.message, e.error?.stack || '', src);
    });

    window.addEventListener('unhandledrejection', function(e) {
        var reason = e.reason;
        var msg = reason?.message || String(reason || 'Unhandled rejection');
        _sendError('UnhandledRejection', msg, reason?.stack || '', location.href);
    });
    }
})();
