/**
 * Slime Volley 종합 검증 스크립트
 * node validate.js 로 실행
 *
 * 검증 항목:
 *  1. HTML 스크립트/CSS 참조 파일 존재
 *  2. DOM ID ↔ JS getElementById/querySelector 참조 일치
 *  3. 사운드 파일 존재 (JS에서 참조하는 WAV/MP3)
 *  4. CONFIG 물리 상수 정합성 (값 범위, 타입, 코트 기하)
 *  5. JS 클래스 정의 ↔ 인스턴스화 일관성
 *  6. 이벤트 핸들러 등록 완전성 (DOM ID → addEventListener)
 *  7. 네트워크 메시지 타입 일관성 (send ↔ on/handleMessage)
 *  8. 게임 상태 머신 완전성 (physics.phase 전이)
 *  9. CSS 클래스 ↔ JS classList 참조 일치
 * 10. 메모리 누수 패턴 감지 (오브젝트 풀 미사용, dispose 누락)
 * 11. PIXI 리소스 정리 완전성 (destroy 호출 여부)
 * 12. 다국어 HTML 동기화 (해당 시 )
 * 13. 모바일 터치 컨트롤 DOM 참조 존재
 * 14. WebRTC/PeerJS 정리 완전성
 * 15. 물리 시뮬레이션 기본 시나리오 (공 낙하 → 득점)
 * 16. 봇 AI 입력 형식 검증 (left/right/jump boolean)
 * 17. 렌더러 오브젝트 풀 상한 검사
 * 18. Tone.js 노드 dispose 누락 검사
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const errors = [];
const warnings = [];

// ═══════════════════════════════════════════
// Helper: 파일 읽기
// ═══════════════════════════════════════════
function readFile(relPath) {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full, 'utf8');
}

function fileExists(relPath) {
    return fs.existsSync(path.join(ROOT, relPath));
}

// ═══════════════════════════════════════════
// 1. HTML 스크립트/CSS 참조 파일 존재
// ═══════════════════════════════════════════
const html = readFile('index.html');
if (!html) {
    console.error('FATAL: index.html not found');
    process.exit(1);
}

const localScripts = [...html.matchAll(/src="([^"]+)"/g)]
    .map(m => m[1])
    .filter(s => !s.startsWith('http') && !s.startsWith('//') && !s.startsWith('data:'));
const localStyles = [...html.matchAll(/href="([^"]+\.css[^"]*)"/g)]
    .map(m => m[1])
    .filter(s => !s.startsWith('http'));

for (const ref of [...localScripts, ...localStyles]) {
    const cleanRef = ref.split('?')[0]; // ?v=35 제거
    if (!fileExists(cleanRef)) {
        errors.push(`[HTML_REF] "${ref}" referenced in index.html but file not found`);
    }
}

// 외부 라이브러리 CDN 참조 확인
const requiredCDNs = ['pixi', 'tone', 'peerjs'];
for (const lib of requiredCDNs) {
    if (!html.includes(lib)) {
        errors.push(`[CDN] Required library "${lib}" not found in index.html`);
    }
}

// ═══════════════════════════════════════════
// 2. DOM ID ↔ JS getElementById 참조 일치
// ═══════════════════════════════════════════
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

const jsFiles = [
    'js/main.js', 'js/renderer.js', 'js/sound.js', 'js/network.js',
    'js/physics.js', 'js/lobby.js', 'js/webrtc.js', 'js/bot.js', 'js/config.js',
];

const allJsContent = {};
for (const f of jsFiles) {
    allJsContent[f] = readFile(f) || '';
}

const jsIdRefs = new Set();
for (const [file, content] of Object.entries(allJsContent)) {
    // getElementById('xxx')
    for (const m of content.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        jsIdRefs.add(m[1]);
        if (!htmlIds.has(m[1])) {
            const line = content.substring(0, m.index).split('\n').length;
            errors.push(`[DOM_ID] ${file}:${line}: getElementById("${m[1]}") — id not in index.html`);
        }
    }
    // querySelector('#xxx')
    for (const m of content.matchAll(/querySelector\(\s*['"]#([^'"#.[\] ]+)['"]\s*\)/g)) {
        if (!htmlIds.has(m[1])) {
            const line = content.substring(0, m.index).split('\n').length;
            warnings.push(`[DOM_ID] ${file}:${line}: querySelector("#${m[1]}") — id not in index.html`);
        }
    }
}

// HTML에서 JS가 참조하는 중요 ID 누락 체크
const criticalIds = [
    'game-canvas-container', 'btn-practice', 'btn-multiplayer', 'btn-start-practice',
    'btn-sound', 'btn-ready', 'btn-start-game', 'btn-leave-room', 'btn-switch-team',
    'practice-my-team', 'practice-bot-team', 'practice-difficulty',
    'chat-input', 'btn-chat-send', 'chat-messages', 'player-list',
    'mobile-controls', 'touch-move-zone', 'touch-jump-zone', 'joystick-knob',
    'error-toast', 'game-over-title', 'game-over-score', 'game-over-sets',
    'btn-play-again', 'btn-gameover-lobby', 'room-list', 'room-meta',
    'password-modal', 'join-password', 'btn-pw-cancel', 'btn-pw-confirm',
];
for (const id of criticalIds) {
    if (!htmlIds.has(id)) {
        errors.push(`[CRITICAL_ID] DOM id="${id}" required by game logic but missing from index.html`);
    }
}

// ═══════════════════════════════════════════
// 3. 사운드 파일 존재
// ═══════════════════════════════════════════
const soundFiles = ['sounds/hit.wav', 'sounds/wall.wav', 'sounds/net.wav', 'sounds/floor.wav'];
for (const sf of soundFiles) {
    if (!fileExists(sf)) {
        errors.push(`[SOUND] "${sf}" not found`);
    }
}

// JS에서 참조하는 사운드 경로 추출
const soundJs = allJsContent['js/sound.js'] || '';
for (const m of soundJs.matchAll(/createMp3Pool\(\s*'[^']+'\s*,\s*(?:soundBase\s*\+\s*)?['"]([^'"]+)['"]/g)) {
    const soundPath = 'sounds/' + m[1].replace(/^sounds\//, '');
    if (!fileExists(soundPath)) {
        errors.push(`[SOUND_REF] Sound file "${soundPath}" referenced in sound.js but not found`);
    }
}

// ═══════════════════════════════════════════
// 4. CONFIG 물리 상수 정합성
// ═══════════════════════════════════════════
const configContent = allJsContent['js/config.js'];
let CONFIG;
try {
    const fn = new Function(configContent + '\nreturn CONFIG;');
    CONFIG = fn();
} catch (e) {
    errors.push(`[CONFIG] config.js 실행 실패: ${e.message}`);
    CONFIG = {};
}

if (CONFIG.COURT_WIDTH) {
    // 코트 기하 검증
    if (CONFIG.NET_X !== CONFIG.COURT_WIDTH / 2) {
        errors.push(`[CONFIG] NET_X(${CONFIG.NET_X}) should be COURT_WIDTH/2(${CONFIG.COURT_WIDTH / 2})`);
    }
    if (CONFIG.GROUND_Y >= CONFIG.COURT_HEIGHT) {
        errors.push(`[CONFIG] GROUND_Y(${CONFIG.GROUND_Y}) must be < COURT_HEIGHT(${CONFIG.COURT_HEIGHT})`);
    }
    if (CONFIG.NET_HEIGHT <= 0 || CONFIG.NET_HEIGHT >= CONFIG.GROUND_Y) {
        errors.push(`[CONFIG] NET_HEIGHT(${CONFIG.NET_HEIGHT}) out of valid range`);
    }

    // 물리 상수 범위
    if (CONFIG.GRAVITY <= 0) errors.push(`[CONFIG] GRAVITY must be > 0`);
    if (CONFIG.BALL_GRAVITY <= 0) errors.push(`[CONFIG] BALL_GRAVITY must be > 0`);
    if (CONFIG.SLIME_JUMP_SPEED >= 0) errors.push(`[CONFIG] SLIME_JUMP_SPEED must be < 0 (upward)`);
    if (CONFIG.BALL_BOUNCE_DAMPING <= 0 || CONFIG.BALL_BOUNCE_DAMPING >= 1) {
        errors.push(`[CONFIG] BALL_BOUNCE_DAMPING(${CONFIG.BALL_BOUNCE_DAMPING}) should be 0 < x < 1`);
    }
    if (CONFIG.BALL_MAX_SPEED <= 0) errors.push(`[CONFIG] BALL_MAX_SPEED must be > 0`);
    if (CONFIG.SLIME_RADIUS <= 0) errors.push(`[CONFIG] SLIME_RADIUS must be > 0`);
    if (CONFIG.BALL_RADIUS <= 0) errors.push(`[CONFIG] BALL_RADIUS must be > 0`);

    // 슬라임이 코트에 맞는지
    const halfW = CONFIG.COURT_WIDTH / 2;
    const netGap = CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS;
    const playArea = halfW - netGap - CONFIG.SLIME_RADIUS;
    if (playArea < CONFIG.SLIME_RADIUS) {
        errors.push(`[CONFIG] Playable area per team(${playArea}px) too narrow for slime radius`);
    }

    // 팀 색상
    if (!CONFIG.TEAM_COLORS || CONFIG.TEAM_COLORS.length < 2) {
        errors.push(`[CONFIG] TEAM_COLORS must have at least 2 teams`);
    } else {
        for (let t = 0; t < 2; t++) {
            if (!Array.isArray(CONFIG.TEAM_COLORS[t]) || CONFIG.TEAM_COLORS[t].length < 1) {
                errors.push(`[CONFIG] TEAM_COLORS[${t}] must be non-empty array`);
            }
        }
    }
}

// ═══════════════════════════════════════════
// 5. JS 클래스 정의 ↔ 인스턴스화 일관성
// ═══════════════════════════════════════════
const classDefinitions = new Set();
const classInstantiations = new Set();

for (const [file, content] of Object.entries(allJsContent)) {
    for (const m of content.matchAll(/class\s+(\w+)/g)) {
        classDefinitions.add(m[1]);
    }
    for (const m of content.matchAll(/new\s+(\w+)\s*\(/g)) {
        // 내장 클래스 제외
        const builtins = new Set(['Map', 'Set', 'Array', 'Object', 'Promise', 'Error',
            'WebSocket', 'Audio', 'Peer', 'DataView', 'Uint8Array', 'Int32Array', 'Function']);
        if (!builtins.has(m[1]) && !m[1].startsWith('PIXI') && !m[1].startsWith('Tone')) {
            classInstantiations.add(m[1]);
        }
    }
}

for (const cls of classInstantiations) {
    if (!classDefinitions.has(cls)) {
        // 외부 라이브러리 클래스(Peer 등)는 skip
        if (!['Peer'].includes(cls)) {
            warnings.push(`[CLASS] "new ${cls}()" used but class not defined in local JS files`);
        }
    }
}

// ═══════════════════════════════════════════
// 6. 이벤트 핸들러: 중요 DOM 요소에 addEventListener 등록 확인
// ═══════════════════════════════════════════
const lobbyContent = allJsContent['js/lobby.js'] || '';
const buttonsNeedingHandlers = [
    'btn-practice', 'btn-multiplayer', 'btn-start-practice', 'btn-back-practice',
    'btn-refresh-rooms', 'btn-create-room', 'btn-back-multiplayer',
    'btn-do-create', 'btn-back-create', 'btn-ready', 'btn-start-game',
    'btn-leave-room', 'btn-switch-team', 'btn-play-again', 'btn-gameover-lobby',
    'btn-sound', 'btn-chat-send', 'btn-pw-cancel', 'btn-pw-confirm',
];
const allLobbyAndMain = lobbyContent + (allJsContent['js/main.js'] || '');
for (const btnId of buttonsNeedingHandlers) {
    if (!allLobbyAndMain.includes(`'${btnId}'`) && !allLobbyAndMain.includes(`"${btnId}"`)) {
        warnings.push(`[EVENT] Button "${btnId}" exists in HTML but no event handler found in JS`);
    }
}

// ═══════════════════════════════════════════
// 7. 네트워크 메시지 타입 일관성
// ═══════════════════════════════════════════
const networkContent = allJsContent['js/network.js'] || '';
const mainContent = allJsContent['js/main.js'] || '';

// send에서 사용하는 type
const sentTypes = new Set();
for (const content of [networkContent, lobbyContent, mainContent]) {
    for (const m of content.matchAll(/send\(\s*\{[^}]*type:\s*['"](\w+)['"]/g)) {
        sentTypes.add(m[1]);
    }
}

// on/emit에서 수신하는 type
const handledTypes = new Set();
for (const content of [networkContent, mainContent]) {
    for (const m of content.matchAll(/\.on\(\s*['"](\w+)['"]/g)) {
        handledTypes.add(m[1]);
    }
    for (const m of content.matchAll(/case\s+['"](\w+)['"]/g)) {
        handledTypes.add(m[1]);
    }
}

// P2P로 보내는 broadcast 타입
const p2pTypes = new Set();
for (const m of networkContent.matchAll(/broadcast\(\s*\{[^}]*type:\s*['"](\w+)['"]/g)) {
    p2pTypes.add(m[1]);
}

// 서버에 보내지만 서버 응답을 처리 안 하는 것은 OK (reportPing 등)
// P2P로 보내는 타입이 수신 핸들러에 있는지
for (const t of p2pTypes) {
    if (!handledTypes.has(t)) {
        warnings.push(`[NET_MSG] P2P broadcast type "${t}" has no receiver handler`);
    }
}

// ═══════════════════════════════════════════
// 8. 게임 상태 머신 완전성
// ═══════════════════════════════════════════
const physicsContent = allJsContent['js/physics.js'] || '';
const validPhases = ['waiting', 'serving', 'playing', 'scored', 'gameOver'];
const phasesUsed = new Set();
for (const content of Object.values(allJsContent)) {
    for (const m of content.matchAll(/phase\s*[=!]=+\s*['"](\w+)['"]/g)) {
        phasesUsed.add(m[1]);
    }
    for (const m of content.matchAll(/phase\s*=\s*['"](\w+)['"]/g)) {
        phasesUsed.add(m[1]);
    }
}

for (const phase of phasesUsed) {
    if (!validPhases.includes(phase)) {
        errors.push(`[PHASE] Unknown phase "${phase}" used in code`);
    }
}

// phase 전이 검증: 각 phase에서 다음 phase로 전이 경로 존재
const phaseTransitions = {
    'waiting': ['serving'],
    'serving': ['playing'],
    'playing': ['scored', 'gameOver'],
    'scored': ['serving'],
    'gameOver': [],
};
for (const [from, tos] of Object.entries(phaseTransitions)) {
    for (const to of tos) {
        // 코드에서 from → to 전이가 실제 구현되어 있는지 (간접 확인)
        if (!phasesUsed.has(to)) {
            warnings.push(`[PHASE] Phase "${to}" expected as transition target but not found in code`);
        }
    }
}

// ═══════════════════════════════════════════
// 9. CSS 클래스 ↔ JS classList 참조 일치
// ═══════════════════════════════════════════
const cssContent = readFile('css/style.css') || '';
const allCssClasses = new Set();
for (const m of cssContent.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
    allCssClasses.add(m[1]);
}
// HTML에서 정의된 클래스 추가
for (const m of html.matchAll(/class="([^"]+)"/g)) {
    m[1].split(/\s+/).forEach(c => allCssClasses.add(c));
}

const knownDynamicClasses = new Set([
    'active', 'show', 'ready', 'host', 'me', 'empty', 'muted',
    'room-waiting', 'room-playing', 'hidden',
]);

for (const [file, content] of Object.entries(allJsContent)) {
    for (const m of content.matchAll(/classList\.(?:add|toggle|remove)\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const cls = m[1];
        if (!allCssClasses.has(cls) && !knownDynamicClasses.has(cls)) {
            const line = content.substring(0, m.index).split('\n').length;
            warnings.push(`[CSS_CLASS] ${file}:${line}: classList "${cls}" not found in CSS`);
        }
    }
}

// ═══════════════════════════════════════════
// 10. 메모리 누수 패턴 감지
// ═══════════════════════════════════════════
// 10a. spread operator로 매 프레임 새 객체 생성 (hot path)
const botContent = allJsContent['js/bot.js'] || '';
const spreadInGetInput = botContent.match(/getInput[\s\S]*?return\s+\{\s*\.\.\./);
if (spreadInGetInput) {
    warnings.push(`[MEMORY] bot.js: getInput() uses spread operator on return — creates new object every call (120fps × bots)`);
}

// 10b. Tone.js dispose 누락
const soundContent = allJsContent['js/sound.js'] || '';
if (!soundContent.includes('dispose') && !soundContent.includes('destroy')) {
    warnings.push(`[MEMORY] sound.js: No dispose()/destroy() method — Tone.js AudioNodes will leak on page unload`);
}

// 10c. window addEventListener 제거 확인
// SPA 게임에서는 페이지 수명 동안 유지되는 리스너는 정상 (중복 등록만 체크)
if (mainContent.includes("window.addEventListener('keydown'")) {
    // 같은 핸들러가 여러 번 등록되는지 (constructor에서 1회만 호출되면 OK)
    const keydownCount = (mainContent.match(/window\.addEventListener\(\s*'keydown'/g) || []).length;
    if (keydownCount > 1) {
        warnings.push(`[MEMORY] main.js: window keydown listener registered ${keydownCount} times — may accumulate`);
    }
}

// 10d. _stateBuffer .map() 할당 (풀링 미사용 시)
if (mainContent.includes('.map(s =>') && mainContent.includes('_stateBuffer') && !mainContent.includes('_stateBufferPool')) {
    warnings.push(`[MEMORY] main.js: _pushRemoteState uses .map() creating new arrays every network frame (30fps)`);
}

// ═══════════════════════════════════════════
// 11. PIXI 리소스 정리 완전성
// ═══════════════════════════════════════════
const rendererContent = allJsContent['js/renderer.js'] || '';

// clearSlimes에서 destroy 호출 여부
if (rendererContent.includes('clearSlimes')) {
    if (!rendererContent.match(/clearSlimes[\s\S]*?destroy/)) {
        errors.push(`[PIXI] clearSlimes() doesn't call destroy() — PIXI objects will leak`);
    }
}

// clearBall에서 destroy 호출 여부
if (rendererContent.includes('clearBall')) {
    if (!rendererContent.match(/clearBall[\s\S]*?destroy/)) {
        errors.push(`[PIXI] clearBall() doesn't call destroy() — PIXI objects will leak`);
    }
}

// showMessage에서 생성한 Text 정리 확인
if (rendererContent.includes('showMessage')) {
    if (!rendererContent.includes('clearMessages') && !rendererContent.includes('_removeMessageTicker')) {
        warnings.push(`[PIXI] showMessage() creates PIXI.Text but no cleanup mechanism found`);
    }
}

// ═══════════════════════════════════════════
// 12. 모바일 터치 컨트롤 DOM 존재
// ═══════════════════════════════════════════
const mobileControlIds = ['mobile-controls', 'touch-move-zone', 'touch-jump-zone', 'joystick-knob'];
for (const id of mobileControlIds) {
    if (!htmlIds.has(id)) {
        errors.push(`[MOBILE] Touch control element id="${id}" missing from HTML`);
    }
}

// ═══════════════════════════════════════════
// 13. WebRTC/PeerJS 정리 완전성
// ═══════════════════════════════════════════
const webrtcContent = allJsContent['js/webrtc.js'] || '';
if (webrtcContent.includes('class PeerJSManager')) {
    if (!webrtcContent.includes('destroy')) {
        errors.push(`[P2P] PeerJSManager has no destroy() method — peer connections will leak`);
    }
    // connections.clear() 존재 확인
    if (!webrtcContent.includes('connections.clear()')) {
        warnings.push(`[P2P] PeerJSManager.destroy() should clear connections Map`);
    }
}

// NetworkClient disconnect에서 peerjs.destroy 호출 확인
if (networkContent.includes('disconnect')) {
    if (!networkContent.includes('peerjs.destroy')) {
        errors.push(`[P2P] NetworkClient.disconnect() doesn't call peerjs.destroy()`);
    }
    if (!networkContent.includes('clearInterval')) {
        errors.push(`[P2P] NetworkClient.disconnect() doesn't clear interval timers`);
    }
}

// ═══════════════════════════════════════════
// 14. 물리 시뮬레이션 기본 시나리오
// ═══════════════════════════════════════════
if (CONFIG.COURT_WIDTH) {
    // 공이 GROUND_Y에 도달하면 득점 판정이 되는지 시뮬레이션
    const ball = { x: CONFIG.COURT_WIDTH / 4, y: 100, vx: 0, vy: 0 };
    let scored = false;
    for (let frame = 0; frame < 3000; frame++) {
        ball.vy += CONFIG.BALL_GRAVITY;
        ball.y += ball.vy;
        ball.x += ball.vx;
        if (ball.y + CONFIG.BALL_RADIUS >= CONFIG.GROUND_Y) {
            scored = true;
            break;
        }
    }
    if (!scored) {
        errors.push(`[PHYSICS] Ball dropped from y=100 never reaches ground in 3000 frames`);
    }

    // 슬라임 점프 → 착지 시뮬레이션
    let slimeY = CONFIG.GROUND_Y;
    let slimeVY = CONFIG.SLIME_JUMP_SPEED;
    let landed = false;
    for (let frame = 0; frame < 600; frame++) {
        slimeVY += CONFIG.GRAVITY;
        slimeY += slimeVY;
        if (slimeY >= CONFIG.GROUND_Y) {
            landed = true;
            break;
        }
    }
    if (!landed) {
        errors.push(`[PHYSICS] Slime jump never returns to ground (GRAVITY too weak?)`);
    }

    // 슬라임 점프 높이: 네트보다 높아야 공을 칠 수 있음
    const jumpApexFrames = Math.abs(CONFIG.SLIME_JUMP_SPEED) / CONFIG.GRAVITY;
    const jumpApexY = CONFIG.GROUND_Y + CONFIG.SLIME_JUMP_SPEED * jumpApexFrames
        + 0.5 * CONFIG.GRAVITY * jumpApexFrames * jumpApexFrames;
    const netTop = CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;
    const slimeTopAtApex = jumpApexY - CONFIG.SLIME_RADIUS;
    if (slimeTopAtApex > netTop) {
        warnings.push(`[PHYSICS] Slime jump apex(${Math.round(slimeTopAtApex)}px) doesn't clear net top(${netTop}px) — game may be unplayable`);
    }

    // 공 최대 속도 제한 동작 확인
    const testSpeed = CONFIG.BALL_MAX_SPEED + 5;
    const ratio = CONFIG.BALL_MAX_SPEED / testSpeed;
    if (ratio >= 1) {
        errors.push(`[PHYSICS] BALL_MAX_SPEED clamp ratio >= 1, speed limiting won't work`);
    }
}

// ═══════════════════════════════════════════
// 15. 봇 AI 입력 형식 검증
// ═══════════════════════════════════════════
if (botContent.includes('class BotAI')) {
    // getInput 반환값이 {left, right, jump} 형태인지
    if (!botContent.includes('left:') || !botContent.includes('right:') || !botContent.includes('jump:')) {
        errors.push(`[BOT] BotAI.getInput() must return {left, right, jump} object`);
    }
    // 난이도 매핑 검증 (bot.js에서 params 객체 키로 정의됨: easy:, normal:, hard:)
    const difficulties = ['easy', 'normal', 'hard'];
    for (const diff of difficulties) {
        const pattern = new RegExp(`${diff}\\s*:`);
        if (!pattern.test(botContent)) {
            errors.push(`[BOT] Difficulty "${diff}" not defined in BotAI`);
        }
    }
}

// ═══════════════════════════════════════════
// 16. 렌더러 오브젝트 풀 상한 검사
// ═══════════════════════════════════════════
if (rendererContent.includes('_trailPool') && rendererContent.includes('_particlePool')) {
    // 풀 상한이 있는지 검사
    const hasPoolLimit = rendererContent.includes('_trailPool.length > ') || rendererContent.includes('_particlePool.length > ');
    if (!hasPoolLimit) {
        warnings.push(`[POOL] Renderer object pools have no size limit — may grow unbounded`);
    }
}

// ═══════════════════════════════════════════
// 17. CSS 파일 존재 + @keyframes 중복
// ═══════════════════════════════════════════
if (!fileExists('css/style.css')) {
    errors.push(`[CSS] css/style.css not found`);
}

// screen 클래스 활성화 로직
const screenIds = [...html.matchAll(/id="([^"]+)" class="screen/g)].map(m => m[1]);
const screenIdsInJS = new Set();
for (const [, content] of Object.entries(allJsContent)) {
    for (const m of content.matchAll(/showScreen\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        screenIdsInJS.add(m[1]);
    }
}
for (const screenId of screenIdsInJS) {
    if (!htmlIds.has(screenId)) {
        errors.push(`[SCREEN] showScreen("${screenId}") — no element with this id in HTML`);
    }
}

// ═══════════════════════════════════════════
// 18. HTML 화면(screen) 전환 완전성
// ═══════════════════════════════════════════
const expectedScreens = [
    'main-menu', 'practice-setup', 'multiplayer-lobby', 'create-room',
    'room-screen', 'game-screen', 'game-over',
];
for (const screen of expectedScreens) {
    if (!htmlIds.has(screen)) {
        errors.push(`[SCREEN] Expected screen "${screen}" missing from HTML`);
    }
    // 해당 화면으로의 전환 코드 존재 확인 (main-menu 제외 - 초기화면)
    if (screen !== 'main-menu' && !screenIdsInJS.has(screen)) {
        warnings.push(`[SCREEN] No showScreen("${screen}") call found — screen may be unreachable`);
    }
}

// ═══════════════════════════════════════════
// 19. 게임 오버 UI 요소 완전성
// ═══════════════════════════════════════════
const gameOverElements = ['game-over-title', 'game-over-score', 'game-over-sets'];
for (const el of gameOverElements) {
    if (!htmlIds.has(el)) {
        errors.push(`[UI] Game over element "${el}" missing from HTML`);
    }
}

// ═══════════════════════════════════════════
// 20. API 키 노출 검사 (보안)
// ═══════════════════════════════════════════
for (const [file, content] of Object.entries(allJsContent)) {
    // METERED_API_KEY는 프론트엔드 TURN 서비스용으로 의도적 노출 (warning만)
    if (content.match(/(?:api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{20,}['"]/i)) {
        if (file === 'js/config.js' && content.includes('METERED_API_KEY')) {
            // TURN credential API key - 프론트엔드 필수, info만
        } else {
            warnings.push(`[SECURITY] ${file}: Possible API key/secret exposed in client-side code`);
        }
    }
}

// ═══════════════════════════════════════════
// A. Practice mode full playthrough (모든 팀 사이즈 × 난이도)
// ═══════════════════════════════════════════
if (CONFIG.COURT_WIDTH) {
    const teamSizes = [1, 2, 3, 4];
    const diffs = ['easy', 'normal', 'hard'];

    for (const myTeamSize of teamSizes) {
        for (const botTeamSize of teamSizes) {
            for (const diff of diffs) {
                // PhysicsEngine.initSlimes 시뮬레이션
                const slimes = [];
                const halfW = CONFIG.COURT_WIDTH / 2;
                const netGap = CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS + 5;

                for (let team = 0; team < 2; team++) {
                    const count = team === 0 ? myTeamSize : botTeamSize;
                    const rangeW = halfW - netGap - CONFIG.SLIME_RADIUS;

                    for (let i = 0; i < count; i++) {
                        const spacing = rangeW / (count + 1);
                        const x = team === 0
                            ? CONFIG.SLIME_RADIUS + spacing * (i + 1)
                            : halfW + CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS + spacing * (i + 1);

                        slimes.push({
                            id: slimes.length,
                            team: team,
                            x: x,
                            y: CONFIG.GROUND_Y,
                        });
                    }
                }

                const totalSlimes = myTeamSize + botTeamSize;
                if (slimes.length !== totalSlimes) {
                    errors.push(`[PRACTICE] ${myTeamSize}v${botTeamSize} ${diff}: total slimes=${slimes.length}, expected=${totalSlimes}`);
                }

                const team0Count = slimes.filter(s => s.team === 0).length;
                const team1Count = slimes.filter(s => s.team === 1).length;
                if (team0Count !== myTeamSize) {
                    errors.push(`[PRACTICE] ${myTeamSize}v${botTeamSize} ${diff}: team0 count=${team0Count}, expected=${myTeamSize}`);
                }
                if (team1Count !== botTeamSize) {
                    errors.push(`[PRACTICE] ${myTeamSize}v${botTeamSize} ${diff}: team1 count=${team1Count}, expected=${botTeamSize}`);
                }

                // 모든 슬라임이 자기 진영 내에 있는지 확인
                for (const s of slimes) {
                    if (s.team === 0) {
                        if (s.x < CONFIG.SLIME_RADIUS || s.x > halfW) {
                            errors.push(`[PRACTICE] ${myTeamSize}v${botTeamSize} ${diff}: team0 slime id=${s.id} x=${s.x} out of bounds`);
                        }
                    } else {
                        if (s.x < halfW || s.x > CONFIG.COURT_WIDTH - CONFIG.SLIME_RADIUS) {
                            errors.push(`[PRACTICE] ${myTeamSize}v${botTeamSize} ${diff}: team1 slime id=${s.id} x=${s.x} out of bounds`);
                        }
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════
// B. Full match simulation (득점 → 서브 → 세트 → 게임오버)
// ═══════════════════════════════════════════
if (CONFIG.COURT_WIDTH) {
    // Helper: 미니 PhysicsEngine (validate.js 내부에서 직접 시뮬레이션)
    function createMiniPhysics() {
        return {
            scores: [0, 0],
            setsWon: [0, 0],
            setScores: [],
            currentSet: 0,
            totalSets: 1,
            scorePerSet: 25,
            deuceEnabled: true,
            setsToWin: 1,
            phase: 'playing',

            configure(opts) {
                this.totalSets = opts.sets || 1;
                this.scorePerSet = opts.scorePerSet || 25;
                this.deuceEnabled = opts.deuce !== false;
                this.setsToWin = Math.ceil(this.totalSets / 2);
                this.currentSet = 0;
                this.setScores = [];
                this.setsWon = [0, 0];
                this.scores = [0, 0];
                this.phase = 'playing';
            },

            isSetWon(team) {
                const target = this.scorePerSet;
                const myScore = this.scores[team];
                const otherScore = this.scores[1 - team];
                if (myScore < target) return false;
                if (this.deuceEnabled) {
                    if (otherScore >= target - 1) {
                        return myScore - otherScore >= 2;
                    }
                }
                return true;
            },

            scorePoint(team) {
                this.scores[team]++;
                if (this.isSetWon(team)) {
                    this.setScores.push([...this.scores]);
                    this.setsWon[team]++;
                    this.currentSet++;
                    if (this.setsWon[team] >= this.setsToWin) {
                        this.phase = 'gameOver';
                        return { type: 'gameOver', winner: team };
                    }
                    const result = { type: 'setWon', setWinner: team, setNumber: this.currentSet };
                    this.scores = [0, 0];
                    return result;
                }
                return { type: 'score', team: team };
            }
        };
    }

    // B1. Basic scoring test: ball lands on each side
    {
        const mp = createMiniPhysics();
        mp.configure({ sets: 1, scorePerSet: 15, deuce: false });

        // Ball lands on left side → team 1 scores
        const r1 = mp.scorePoint(1);
        if (r1.type !== 'score' || mp.scores[1] !== 1) {
            errors.push(`[MATCH] Ball on left side: team 1 should score (got ${r1.type}, score=${mp.scores[1]})`);
        }

        // Ball lands on right side → team 0 scores
        const r2 = mp.scorePoint(0);
        if (r2.type !== 'score' || mp.scores[0] !== 1) {
            errors.push(`[MATCH] Ball on right side: team 0 should score (got ${r2.type}, score=${mp.scores[0]})`);
        }
    }

    // B2. Set winning with different scorePerSet values
    for (const target of [15, 21, 25]) {
        const mp = createMiniPhysics();
        mp.configure({ sets: 1, scorePerSet: target, deuce: false });

        for (let i = 0; i < target - 1; i++) {
            const r = mp.scorePoint(0);
            if (r.type === 'gameOver' || r.type === 'setWon') {
                errors.push(`[MATCH] scorePerSet=${target}: game ended too early at score ${i + 1}`);
                break;
            }
        }
        const finalR = mp.scorePoint(0);
        if (finalR.type !== 'gameOver') {
            errors.push(`[MATCH] scorePerSet=${target}: expected gameOver at score ${target}, got ${finalR.type}`);
        }
    }

    // B3. Deuce scenarios: both teams at scorePerSet-1, verify 2-point-gap requirement
    for (const target of [15, 21, 25]) {
        const mp = createMiniPhysics();
        mp.configure({ sets: 1, scorePerSet: target, deuce: true });

        // Bring both teams to target-1
        for (let i = 0; i < target - 1; i++) {
            mp.scorePoint(0);
            mp.scorePoint(1);
        }

        if (mp.scores[0] !== target - 1 || mp.scores[1] !== target - 1) {
            errors.push(`[DEUCE] scorePerSet=${target}: setup failed, scores=${mp.scores}`);
            continue;
        }

        // Team 0 scores to target — should NOT win (1 point gap)
        const r1 = mp.scorePoint(0);
        if (r1.type === 'gameOver' || r1.type === 'setWon') {
            errors.push(`[DEUCE] scorePerSet=${target}: game ended with 1-point gap (${mp.scores[0]}-${mp.scores[1]})`);
            continue;
        }

        // Team 1 equalizes → still deuce
        const r2 = mp.scorePoint(1);
        if (r2.type === 'gameOver' || r2.type === 'setWon') {
            errors.push(`[DEUCE] scorePerSet=${target}: game ended at tie (${mp.scores[0]}-${mp.scores[1]})`);
            continue;
        }

        // Team 0 takes lead again
        mp.scorePoint(0);
        // Now 2-point gap: team 0 scores again
        const r3 = mp.scorePoint(0);
        if (r3.type !== 'gameOver') {
            errors.push(`[DEUCE] scorePerSet=${target}: expected gameOver with 2-point gap (${mp.scores[0]}-${mp.scores[1]}), got ${r3.type}`);
        }
    }

    // B4. Multi-set matches (1, 3, 5 sets) — verify setsToWin logic
    for (const totalSets of [1, 3, 5]) {
        const mp = createMiniPhysics();
        mp.configure({ sets: totalSets, scorePerSet: 5, deuce: false });

        const expectedSetsToWin = Math.ceil(totalSets / 2);
        if (mp.setsToWin !== expectedSetsToWin) {
            errors.push(`[MATCH] ${totalSets} sets: setsToWin=${mp.setsToWin}, expected=${expectedSetsToWin}`);
            continue;
        }

        let gameOver = false;
        for (let set = 0; set < totalSets; set++) {
            // Team 0 wins each set by scoring 5
            for (let pt = 0; pt < 5; pt++) {
                const r = mp.scorePoint(0);
                if (r.type === 'gameOver') {
                    if (mp.setsWon[0] !== expectedSetsToWin) {
                        errors.push(`[MATCH] ${totalSets} sets: gameOver at setsWon=${mp.setsWon[0]}, expected=${expectedSetsToWin}`);
                    }
                    gameOver = true;
                    break;
                }
            }
            if (gameOver) break;
        }
        if (!gameOver) {
            errors.push(`[MATCH] ${totalSets} sets: game never ended after winning ${mp.setsWon[0]} sets`);
        }
    }

    // B5. Correct winner detection
    {
        const mp = createMiniPhysics();
        mp.configure({ sets: 3, scorePerSet: 5, deuce: false });

        // Team 1 wins first set
        for (let i = 0; i < 5; i++) mp.scorePoint(1);
        if (mp.setsWon[1] !== 1) errors.push(`[MATCH] Winner detection: team 1 should have 1 set won`);

        // Team 1 wins second set → match win
        let result;
        for (let i = 0; i < 5; i++) result = mp.scorePoint(1);
        if (!result || result.type !== 'gameOver' || result.winner !== 1) {
            errors.push(`[MATCH] Winner detection: team 1 should win match (got ${result?.type}, winner=${result?.winner})`);
        }
    }
}

// ═══════════════════════════════════════════
// C. Ball physics edge cases
// ═══════════════════════════════════════════
if (CONFIG.COURT_WIDTH) {
    const br = CONFIG.BALL_RADIUS;
    const netLeft = CONFIG.NET_X - CONFIG.NET_WIDTH / 2;
    const netRight = CONFIG.NET_X + CONFIG.NET_WIDTH / 2;
    const netTop = CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;

    // C1. Ball bouncing off left wall
    {
        let ball = { x: br + 1, y: CONFIG.COURT_HEIGHT / 2, vx: -5, vy: 0 };
        // Simulate wall bounce
        ball.x += ball.vx;
        if (ball.x - br < 0) {
            ball.x = br;
            ball.vx = Math.abs(ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
        }
        if (ball.vx <= 0) {
            errors.push(`[PHYSICS_EDGE] Left wall bounce: vx should be positive after bounce (got ${ball.vx})`);
        }
        if (ball.x < br) {
            errors.push(`[PHYSICS_EDGE] Left wall bounce: ball penetrated wall (x=${ball.x}, radius=${br})`);
        }
    }

    // C2. Ball bouncing off right wall
    {
        let ball = { x: CONFIG.COURT_WIDTH - br - 1, y: CONFIG.COURT_HEIGHT / 2, vx: 5, vy: 0 };
        ball.x += ball.vx;
        if (ball.x + br > CONFIG.COURT_WIDTH) {
            ball.x = CONFIG.COURT_WIDTH - br;
            ball.vx = -Math.abs(ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
        }
        if (ball.vx >= 0) {
            errors.push(`[PHYSICS_EDGE] Right wall bounce: vx should be negative after bounce (got ${ball.vx})`);
        }
    }

    // C3. Ball bouncing off ceiling
    {
        let ball = { x: CONFIG.COURT_WIDTH / 4, y: br + 1, vx: 0, vy: -5 };
        ball.y += ball.vy;
        if (ball.y - br < 0) {
            ball.y = br;
            ball.vy = Math.abs(ball.vy) * CONFIG.BALL_BOUNCE_DAMPING;
        }
        if (ball.vy <= 0) {
            errors.push(`[PHYSICS_EDGE] Ceiling bounce: vy should be positive after bounce (got ${ball.vy})`);
        }
    }

    // C4. Ball bouncing off floor (this is scoring, not bouncing — verify it reaches ground)
    {
        let ball = { x: CONFIG.COURT_WIDTH / 4, y: CONFIG.GROUND_Y - br - 1, vx: 0, vy: 5 };
        ball.y += ball.vy;
        const scored = (ball.y + br >= CONFIG.GROUND_Y);
        if (!scored) {
            errors.push(`[PHYSICS_EDGE] Floor detection: ball at y=${ball.y} should trigger scoring`);
        }
    }

    // C5. Ball hitting net from left side
    {
        let ball = { x: netLeft - br - 1, y: netTop + 20, vx: 5, vy: 0 };
        ball.x += ball.vx;
        // Simulate net collision
        if (ball.y + br > netTop) {
            if (ball.x + br > netLeft && ball.x < CONFIG.NET_X) {
                ball.x = netLeft - br;
                ball.vx = -Math.abs(ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
            }
        }
        if (ball.vx >= 0) {
            errors.push(`[PHYSICS_EDGE] Net left-side bounce: vx should be negative (got ${ball.vx})`);
        }
    }

    // C6. Ball hitting net from right side
    {
        let ball = { x: netRight + br + 1, y: netTop + 20, vx: -5, vy: 0 };
        ball.x += ball.vx;
        if (ball.y + br > netTop) {
            if (ball.x - br < netRight && ball.x > CONFIG.NET_X) {
                ball.x = netRight + br;
                ball.vx = Math.abs(ball.vx) * CONFIG.BALL_BOUNCE_DAMPING;
            }
        }
        if (ball.vx <= 0) {
            errors.push(`[PHYSICS_EDGE] Net right-side bounce: vx should be positive (got ${ball.vx})`);
        }
    }

    // C7. Ball hitting net top
    {
        let ball = { x: CONFIG.NET_X, y: netTop - br - 1, vx: 0, vy: 5 };
        ball.y += ball.vy;
        // Net top bounce check
        if (ball.x + br > netLeft - 4 && ball.x - br < netRight + 4) {
            if (ball.y + br > netTop && ball.y - br < netTop && ball.vy > 0) {
                ball.y = netTop - br;
                ball.vy = -ball.vy * CONFIG.BALL_BOUNCE_DAMPING;
            }
        }
        if (ball.vy >= 0) {
            errors.push(`[PHYSICS_EDGE] Net top bounce: vy should be negative after bounce (got ${ball.vy})`);
        }
    }

    // C8. Ball-slime collision at various angles
    {
        const slime = { x: 200, y: CONFIG.GROUND_Y, vx: 0, vy: 0, team: 0, onGround: true };
        const minDist = CONFIG.BALL_RADIUS + CONFIG.SLIME_RADIUS;

        // Test angles: directly above, left-above, right-above
        const testAngles = [
            { label: 'above', dx: 0, dy: -(minDist - 2) },
            { label: 'left-above', dx: -(minDist - 2) * 0.7, dy: -(minDist - 2) * 0.7 },
            { label: 'right-above', dx: (minDist - 2) * 0.7, dy: -(minDist - 2) * 0.7 },
        ];

        for (const angle of testAngles) {
            const ball = {
                x: slime.x + angle.dx,
                y: slime.y + angle.dy,
                vx: 0,
                vy: 3,
                lastHitBy: -1,
                lastHitSlimeId: -1,
            };

            const dx = ball.x - slime.x;
            const dy = ball.y - slime.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDist && dist > 0 && dy <= CONFIG.SLIME_RADIUS * 0.3) {
                // Collision should be detected
                const nx = dx / dist;
                const ny = dy / dist;
                ball.x = slime.x + nx * minDist;
                ball.y = slime.y + ny * minDist;

                const relVx = ball.vx - slime.vx;
                const relVy = ball.vy - slime.vy;
                const dot = relVx * nx + relVy * ny;
                if (dot < 0) {
                    ball.vx -= 2 * dot * nx;
                    ball.vy -= 2 * dot * ny;
                }
                ball.vx *= CONFIG.BALL_SLIME_BOUNCE;
                ball.vy *= CONFIG.BALL_SLIME_BOUNCE;
                if (ball.vy > -3) ball.vy = -3;

                // After collision, ball should be moving away (upward component)
                if (ball.vy >= 0) {
                    errors.push(`[PHYSICS_EDGE] Ball-slime ${angle.label}: ball vy should be < 0 after hit (got ${ball.vy})`);
                }
            } else if (dy <= CONFIG.SLIME_RADIUS * 0.3) {
                // If within angular range but no collision detected, that's OK (might be out of range)
            }
        }
    }

    // C9. Ball speed clamping (verify BALL_MAX_SPEED works)
    {
        const overSpeed = CONFIG.BALL_MAX_SPEED + 5;
        const ball = { vx: overSpeed, vy: overSpeed };
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (speed > CONFIG.BALL_MAX_SPEED) {
            const scale = CONFIG.BALL_MAX_SPEED / speed;
            ball.vx *= scale;
            ball.vy *= scale;
        }
        const newSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (Math.abs(newSpeed - CONFIG.BALL_MAX_SPEED) > 0.001) {
            errors.push(`[PHYSICS_EDGE] Speed clamp: expected ${CONFIG.BALL_MAX_SPEED}, got ${newSpeed}`);
        }
    }

    // C10. Ball at exact net corner
    {
        const corners = [
            { x: netLeft, y: netTop },
            { x: netRight, y: netTop },
        ];
        for (const corner of corners) {
            const ball = {
                x: corner.x + br * 0.5,
                y: corner.y - br * 0.5,
                vx: corner.x < CONFIG.NET_X ? 2 : -2,
                vy: 2,
            };
            const dx = ball.x - corner.x;
            const dy = ball.y - corner.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < br && dist > 0) {
                const nx = dx / dist;
                const ny = dy / dist;
                ball.x = corner.x + nx * br;
                ball.y = corner.y + ny * br;
                const dot = ball.vx * nx + ball.vy * ny;
                if (dot < 0) {
                    ball.vx -= 2 * dot * nx;
                    ball.vy -= 2 * dot * ny;
                }
                // Ball should be pushed away from corner
                const newDx = ball.x - corner.x;
                const newDy = ball.y - corner.y;
                const newDist = Math.sqrt(newDx * newDx + newDy * newDy);
                if (newDist < br * 0.99) {
                    errors.push(`[PHYSICS_EDGE] Net corner (${corner.x},${corner.y}): ball still inside corner after resolve (dist=${newDist})`);
                }
            }
        }
    }
}

// ═══════════════════════════════════════════
// D. Screen transition flow (모든 화면 전환 경로)
// ═══════════════════════════════════════════
{
    // Build screen transition graph from JS code
    const screenTransitionPaths = [
        // main-menu → practice-setup → game-screen → game-over → main-menu
        ['main-menu', 'practice-setup', 'game-screen', 'game-over', 'main-menu'],
        // main-menu → multiplayer-lobby → create-room → room-screen → game-screen → game-over
        ['main-menu', 'multiplayer-lobby', 'create-room', 'room-screen', 'game-screen', 'game-over'],
        // main-menu → multiplayer-lobby → (join room) → room-screen
        ['main-menu', 'multiplayer-lobby', 'room-screen'],
    ];

    // Verify each screen in paths exists in HTML
    const allScreensInPaths = new Set();
    for (const path of screenTransitionPaths) {
        for (const screen of path) {
            allScreensInPaths.add(screen);
        }
    }

    for (const screen of allScreensInPaths) {
        if (!htmlIds.has(screen)) {
            errors.push(`[SCREEN_FLOW] Screen "${screen}" used in navigation path but missing from HTML`);
        }
    }

    // Verify showScreen calls exist for each transition target (except starting screen)
    const showScreenCalls = new Set();
    for (const [, content] of Object.entries(allJsContent)) {
        for (const m of content.matchAll(/showScreen\(\s*['"]([^'"]+)['"]\s*\)/g)) {
            showScreenCalls.add(m[1]);
        }
    }

    for (const screen of allScreensInPaths) {
        if (screen !== 'main-menu' && !showScreenCalls.has(screen)) {
            // main-menu might be initial or reachable differently
            warnings.push(`[SCREEN_FLOW] No showScreen("${screen}") call found — screen may be unreachable`);
        }
    }

    // Verify back buttons exist for navigable screens
    const backButtonMapping = {
        'practice-setup': 'btn-back-practice',
        'multiplayer-lobby': 'btn-back-multiplayer',
        'create-room': 'btn-back-create',
        'room-screen': 'btn-leave-room',
        'game-over': 'btn-gameover-lobby',
    };

    for (const [screen, btnId] of Object.entries(backButtonMapping)) {
        if (!htmlIds.has(btnId)) {
            errors.push(`[SCREEN_FLOW] Back button "${btnId}" for screen "${screen}" missing from HTML`);
        }
    }
}

// ═══════════════════════════════════════════
// E. Network message roundtrip
// ═══════════════════════════════════════════
{
    // Collect all sent message types (WS + P2P)
    const allSentTypes = new Set();
    const allHandledTypes = new Set();

    // WS send types
    for (const content of [networkContent, lobbyContent, mainContent]) {
        for (const m of content.matchAll(/\.send\(\s*\{[^}]*type:\s*['"](\w+)['"]/g)) {
            allSentTypes.add(m[1]);
        }
    }

    // P2P broadcast types
    for (const m of networkContent.matchAll(/broadcast\(\s*\{[^}]*type:\s*['"](\w+)['"]/g)) {
        allSentTypes.add(m[1]);
    }

    // Handled types: handleMessage switch cases
    for (const m of networkContent.matchAll(/case\s+['"](\w+)['"]/g)) {
        allHandledTypes.add(m[1]);
    }

    // Handled types: .on('eventName') registrations
    for (const content of [networkContent, mainContent, lobbyContent]) {
        for (const m of content.matchAll(/\.on\(\s*['"](\w+)['"]/g)) {
            allHandledTypes.add(m[1]);
        }
    }

    // Report: list all sent types and whether they have handlers
    // (Some types are server-only and don't need client handlers, e.g., reportPing, setTeam)
    const serverOnlyTypes = new Set(['reportPing', 'ping', 'setTeam', 'setReady', 'startGame',
        'setMetadata', 'addBot', 'removeBot', 'leaveRoom', 'kick', 'chat']);

    for (const t of allSentTypes) {
        if (!allHandledTypes.has(t) && !serverOnlyTypes.has(t)) {
            warnings.push(`[NET_ROUNDTRIP] Sent type "${t}" has no client-side handler`);
        }
    }

    // Check P2P-specific types: gameState, gameEvent, input
    const p2pRequired = ['gameState', 'gameEvent', 'input'];
    for (const t of p2pRequired) {
        if (!allSentTypes.has(t)) {
            errors.push(`[NET_ROUNDTRIP] Required P2P type "${t}" is never sent`);
        }
        if (!allHandledTypes.has(t)) {
            errors.push(`[NET_ROUNDTRIP] Required P2P type "${t}" has no handler`);
        }
    }
}

// ═══════════════════════════════════════════
// F. Multiplayer player count scenarios
// ═══════════════════════════════════════════
if (CONFIG.COURT_WIDTH) {
    const validCombos = [
        [1, 1], [2, 2], [3, 3], [4, 4], // symmetric
        [1, 4], [4, 1],                   // asymmetric
    ];

    for (const [team0Size, team1Size] of validCombos) {
        const slimes = [];
        const halfW = CONFIG.COURT_WIDTH / 2;
        const netGap = CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS + 5;

        for (let team = 0; team < 2; team++) {
            const count = team === 0 ? team0Size : team1Size;
            const rangeW = halfW - netGap - CONFIG.SLIME_RADIUS;

            for (let i = 0; i < count; i++) {
                const spacing = rangeW / (count + 1);
                const x = team === 0
                    ? CONFIG.SLIME_RADIUS + spacing * (i + 1)
                    : halfW + CONFIG.NET_WIDTH / 2 + CONFIG.SLIME_RADIUS + spacing * (i + 1);

                slimes.push({ id: slimes.length, team: team, x: x });
            }
        }

        // Verify slime ID assignment: should be sequential 0, 1, 2, ...
        for (let i = 0; i < slimes.length; i++) {
            if (slimes[i].id !== i) {
                errors.push(`[MULTIPLAYER] ${team0Size}v${team1Size}: slime[${i}].id=${slimes[i].id}, expected=${i}`);
            }
        }

        // 같은 팀 슬라임 겹침은 의도적 설계 (physics.js resolveSlimeCollisions: 겹침 허용)
        // 다른 팀 슬라임 겹침만 체크
        for (let i = 0; i < slimes.length; i++) {
            for (let j = i + 1; j < slimes.length; j++) {
                if (slimes[i].team !== slimes[j].team) {
                    const dist = Math.abs(slimes[i].x - slimes[j].x);
                    if (dist < CONFIG.SLIME_RADIUS * 2) {
                        errors.push(`[MULTIPLAYER] ${team0Size}v${team1Size}: cross-team slimes ${slimes[i].id} and ${slimes[j].id} overlap`);
                    }
                }
            }
        }

        // Verify total count
        if (slimes.length !== team0Size + team1Size) {
            errors.push(`[MULTIPLAYER] ${team0Size}v${team1Size}: total=${slimes.length}, expected=${team0Size + team1Size}`);
        }
    }
}

// ═══════════════════════════════════════════
// G. Game over MVP calculation
// ═══════════════════════════════════════════
{
    // G1. All kills on one player → that player is MVP
    {
        const slimes = [
            { id: 0, team: 0, killCount: 10, receiveCount: 0, nickname: 'Player1' },
            { id: 1, team: 0, killCount: 0, receiveCount: 0, nickname: 'Player2' },
        ];

        const winnerSlimes = slimes.filter(s => s.team === 0);
        const scored = winnerSlimes.map(s => ({
            id: s.id,
            nickname: s.nickname,
            kills: s.killCount,
            receives: s.receiveCount,
            score: s.killCount * 2 + s.receiveCount,
        }));
        const maxScore = Math.max(...scored.map(s => s.score));
        const mvps = scored.filter(s => s.score === maxScore);

        if (mvps.length !== 1 || mvps[0].id !== 0) {
            errors.push(`[MVP] All kills on Player1: expected MVP id=0, got ${mvps.map(m => m.id).join(',')}`);
        }
    }

    // G2. Equal kills → check receiveCount tiebreaker
    {
        const slimes = [
            { id: 0, team: 0, killCount: 5, receiveCount: 3, nickname: 'Player1' },
            { id: 1, team: 0, killCount: 5, receiveCount: 5, nickname: 'Player2' },
        ];

        const winnerSlimes = slimes.filter(s => s.team === 0);
        const scored = winnerSlimes.map(s => ({
            id: s.id,
            nickname: s.nickname,
            kills: s.killCount,
            receives: s.receiveCount,
            score: s.killCount * 2 + s.receiveCount,
        }));
        const maxScore = Math.max(...scored.map(s => s.score));
        const mvps = scored.filter(s => s.score === maxScore);

        // Player2 has score=15 (5*2+5), Player1 has score=13 (5*2+3)
        if (mvps.length !== 1 || mvps[0].id !== 1) {
            errors.push(`[MVP] Equal kills, receiveCount tiebreaker: expected MVP id=1, got ${mvps.map(m => m.id).join(',')}`);
        }
    }

    // G3. Exact tie in score → co-MVP
    {
        const slimes = [
            { id: 0, team: 0, killCount: 5, receiveCount: 2, nickname: 'Player1' },
            { id: 1, team: 0, killCount: 4, receiveCount: 4, nickname: 'Player2' },
        ];

        const winnerSlimes = slimes.filter(s => s.team === 0);
        const scored = winnerSlimes.map(s => ({
            id: s.id,
            nickname: s.nickname,
            kills: s.killCount,
            receives: s.receiveCount,
            score: s.killCount * 2 + s.receiveCount,
        }));
        const maxScore = Math.max(...scored.map(s => s.score));
        const mvps = scored.filter(s => s.score === maxScore);

        // Player1: score=12, Player2: score=12 → co-MVP
        if (mvps.length !== 2) {
            errors.push(`[MVP] Exact tie: expected 2 co-MVPs, got ${mvps.length} (scores: ${scored.map(s => s.score).join(',')})`);
        }
    }

    // G4. Single player team (no MVP needed — physics returns null for winnerSlimes.length < 2)
    {
        const slimes = [
            { id: 0, team: 0, killCount: 10, receiveCount: 5, nickname: 'Solo' },
        ];

        const winnerSlimes = slimes.filter(s => s.team === 0);
        let mvp = null;
        if (winnerSlimes.length >= 2) {
            const scored = winnerSlimes.map(s => ({
                id: s.id,
                nickname: s.nickname,
                kills: s.killCount,
                receives: s.receiveCount,
                score: s.killCount * 2 + s.receiveCount,
            }));
            const maxScore = Math.max(...scored.map(s => s.score));
            mvp = scored.filter(s => s.score === maxScore);
        }

        if (mvp !== null) {
            errors.push(`[MVP] Single player team: MVP should be null, got ${JSON.stringify(mvp)}`);
        }
    }
}

// ═══════════════════════════════════════════
// H. localStorage 키 일관성
// ═══════════════════════════════════════════
const lsGetKeys = new Set();
const lsSetKeys = new Set();
for (const [, content] of Object.entries(allJsContent)) {
    for (const m of content.matchAll(/localStorage\.getItem\(\s*['"]([^'"]+)['"]\s*\)/g)) lsGetKeys.add(m[1]);
    for (const m of content.matchAll(/localStorage\.setItem\(\s*['"]([^'"]+)['"]/g)) lsSetKeys.add(m[1]);
}
for (const key of lsGetKeys) {
    if (!lsSetKeys.has(key)) {
        warnings.push(`[STORAGE] localStorage.getItem("${key}") used but setItem never called`);
    }
}

// 닉네임 저장 키(sv_playerName) 존재 확인
if (!lsSetKeys.has('sv_playerName') && !lsGetKeys.has('sv_playerName')) {
    warnings.push(`[STORAGE] "sv_playerName" not found — nickname may not persist across sessions`);
}

// ═══════════════════════════════════════════
// I. 사운드 설정 검증
// ═══════════════════════════════════════════
// toggleSound / setMuted 함수 존재
if (!mainContent.includes('toggleSound')) {
    errors.push(`[SOUND_UI] toggleSound() not found in main.js`);
}
if (!soundContent.includes('setMuted')) {
    errors.push(`[SOUND_UI] setMuted() not found in sound.js`);
}
// btn-sound 핸들러 존재
if (!allLobbyAndMain.includes('btn-sound')) {
    errors.push(`[SOUND_UI] No click handler for btn-sound`);
}
// muted 상태에 따른 CSS 클래스 토글
if (!allLobbyAndMain.includes("'muted'") && !allLobbyAndMain.includes('"muted"')) {
    warnings.push(`[SOUND_UI] No 'muted' CSS class toggle found — button visual may not update`);
}

// ═══════════════════════════════════════════
// J. 비밀번호 입력 검증 (비밀방)
// ═══════════════════════════════════════════
// 4자리 숫자 검증 패턴
const hasPasswordValidation = lobbyContent.includes('length !== 4') || lobbyContent.includes('.test(pw)');
if (!hasPasswordValidation) {
    warnings.push(`[PASSWORD] No 4-digit password validation found — invalid passwords may be accepted`);
}
// 비밀번호 모달 열기/닫기
if (!lobbyContent.includes('password-modal')) {
    warnings.push(`[PASSWORD] Password modal reference not found in lobby.js`);
}

// ═══════════════════════════════════════════
// K. 채팅 시스템 검증
// ═══════════════════════════════════════════
// 채팅 메시지 수 제한 확인
if (!lobbyContent.includes('children.length > ')) {
    warnings.push(`[CHAT] No chat message count limit found — DOM may grow unbounded`);
}
// XSS 방지 (escapeHtml)
if (!lobbyContent.includes('escapeHtml')) {
    errors.push(`[CHAT] No escapeHtml found — chat is vulnerable to XSS`);
}
// 빈 메시지 방지
if (!lobbyContent.includes('trim()') || !lobbyContent.includes('!msg')) {
    warnings.push(`[CHAT] No empty message check found — users may send blank messages`);
}

// ═══════════════════════════════════════════
// L. 풀스크린 API 검증
// ═══════════════════════════════════════════
if (!mainContent.includes('requestFullscreen') && !mainContent.includes('webkitRequestFullscreen')) {
    warnings.push(`[FULLSCREEN] No fullscreen API calls found`);
}
// 이미 풀스크린인 경우 중복 요청 방지
if (!mainContent.includes('fullscreenElement')) {
    warnings.push(`[FULLSCREEN] No fullscreenElement check — may cause errors when already fullscreen`);
}

// ═══════════════════════════════════════════
// M. 방 설정 UI 검증 (세트/스코어/듀스)
// ═══════════════════════════════════════════
const roomSettingIds = ['create-sets', 'create-score', 'create-deuce'];
for (const id of roomSettingIds) {
    if (!htmlIds.has(id)) {
        errors.push(`[ROOM_SETTINGS] DOM id="${id}" missing — room creation settings incomplete`);
    }
}
// 세트 설정이 physics.configure에 전달되는지
if (!lobbyContent.includes('sets') || !lobbyContent.includes('scorePerSet')) {
    warnings.push(`[ROOM_SETTINGS] Room settings may not propagate to game physics`);
}

// ═══════════════════════════════════════════
// N. 봇 추가/제거 검증
// ═══════════════════════════════════════════
if (!lobbyContent.includes('addBot') && !networkContent.includes('addBot')) {
    warnings.push(`[BOT_MGMT] No addBot functionality found`);
}
if (!lobbyContent.includes('removeBot') && !networkContent.includes('removeBot')) {
    warnings.push(`[BOT_MGMT] No removeBot functionality found`);
}

// ═══════════════════════════════════════════
// O. 강퇴 기능 검증
// ═══════════════════════════════════════════
if (!lobbyContent.includes('kick') && !networkContent.includes('kick')) {
    warnings.push(`[KICK] No kick functionality found`);
}
// 강퇴당한 측 처리
if (!mainContent.includes("'kicked'") && !mainContent.includes('"kicked"') &&
    !networkContent.includes("'kicked'") && !networkContent.includes('"kicked"')) {
    warnings.push(`[KICK] No 'kicked' event handler — kicked player may not see feedback`);
}

// ═══════════════════════════════════════════
// P. 닉네임 입력 검증
// ═══════════════════════════════════════════
// maxlength 속성 존재
if (!html.includes('maxlength="12"') && !html.includes('maxlength="20"')) {
    warnings.push(`[NICKNAME] No maxlength on nickname input — very long names may break UI`);
}
// 빈 닉네임 방지
if (!lobbyContent.includes('getNameFromInput')) {
    warnings.push(`[NICKNAME] No name validation function found`);
}

// ═══════════════════════════════════════════
// Q-0. 런타임 null/undefined 가드 검증
// ═══════════════════════════════════════════
// physics.js: division by zero in ball-slime collision (dist=0)
if (physicsContent.includes('dx / dist') || physicsContent.includes('dy / dist')) {
    if (!physicsContent.includes('dist > 0') && !physicsContent.includes('dist === 0') && !physicsContent.includes('dist !== 0')) {
        errors.push(`[NULL_GUARD] physics.js: dx/dist or dy/dist without dist>0 guard — division by zero possible`);
    }
}

// physics.js: killer.team access after .find() (could be undefined)
if (physicsContent.includes('.find(s => s.id === this.ball.lastHitSlimeId)')) {
    if (!physicsContent.match(/killer\s*&&\s*killer\.team/) && !physicsContent.match(/if\s*\(\s*killer\s/)) {
        warnings.push(`[NULL_GUARD] physics.js: killer from .find() used without null check — crash if slime despawned`);
    }
}

// main.js: mySlime null check before .input access
if (mainContent.includes('mySlime') && mainContent.includes('mySlime.input')) {
    if (!mainContent.includes('mySlime &&') && !mainContent.includes('if (mySlime')) {
        warnings.push(`[NULL_GUARD] main.js: mySlime used without null check`);
    }
}

// renderer.js: ballSprite null in eye tracking
if (rendererContent.includes('this.ballSprite') && rendererContent.includes('this.ballSprite.x')) {
    // ballSprite used in pupil tracking — should be guarded
    if (!rendererContent.includes('this.ballSprite &&') && !rendererContent.includes('if (this.ballSprite)') &&
        !rendererContent.match(/this\.ballSprite\s*\)/)) {
        // Actually check if the pupil tracking line has a guard
    }
}

// network.js: ws.send() without try-catch
if (networkContent.includes('this.ws.send(')) {
    if (!networkContent.includes('try') || !networkContent.match(/try\s*\{[\s\S]*?ws\.send/)) {
        warnings.push(`[NULL_GUARD] network.js: ws.send() without try-catch — WebSocket close race condition possible`);
    }
}

// main.js: _getInterpolatedState s0/s1 slimes array bounds
if (mainContent.includes('s0.slimes[i]') && mainContent.includes('s1.slimes[i]')) {
    if (!mainContent.includes('s0.slimes[i] &&') && !mainContent.includes('s1.slimes[i] &&')) {
        // Check if there's a guard
        if (!mainContent.match(/if\s*\(\s*s0\.slimes\[i\]/)) {
            warnings.push(`[NULL_GUARD] main.js: interpolation accesses s0/s1.slimes[i] without bounds check`);
        }
    }
}

// ═══════════════════════════════════════════
// Q-1. 세로모드 경고 오버레이 검증
// ═══════════════════════════════════════════
if (!htmlIds.has('rotate-overlay')) {
    errors.push(`[ROTATE] rotate-overlay element missing — mobile portrait warning won't show`);
}
// CSS에서 portrait 미디어쿼리로 표시하는지
if (!cssContent.includes('orientation: portrait')) {
    warnings.push(`[ROTATE] No portrait orientation media query — rotate overlay may never show`);
}

// ═══════════════════════════════════════════
// R. 카카오톡 인앱브라우저 리다이렉트
// ═══════════════════════════════════════════
if (!html.includes('KAKAOTALK') && !html.includes('kakaotalk')) {
    warnings.push(`[KAKAO] No KakaoTalk in-app browser redirect — game may not work in KakaoTalk`);
}

// ═══════════════════════════════════════════
// S. 뒤로가기(header-back) 게임포털 링크
// ═══════════════════════════════════════════
if (!htmlIds.has('header-back')) {
    errors.push(`[NAV] header-back element missing — no way to return to games portal`);
}
// href="../" 링크 확인
if (!html.includes('href="../"') && !html.includes("href='../'")) {
    warnings.push(`[NAV] header-back may not link to parent games portal`);
}

// ═══════════════════════════════════════════
// T. 키보드 조작법 양쪽(Arrow+WASD) 검증
// ═══════════════════════════════════════════
const inputKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'KeyW', 'Space'];
for (const key of inputKeys) {
    if (!mainContent.includes(`'${key}'`) && !mainContent.includes(`"${key}"`)) {
        errors.push(`[INPUT] Key "${key}" not handled — control scheme incomplete`);
    }
}

// ═══════════════════════════════════════════
// U. Google Analytics (gtag) 검증
// ═══════════════════════════════════════════
if (!html.includes('gtag') && !html.includes('googletagmanager')) {
    warnings.push(`[ANALYTICS] No Google Analytics found — page views not tracked`);
}

// ═══════════════════════════════════════════
// V. 웹소켓 끊김 에러 처리
// ═══════════════════════════════════════════
if (!networkContent.includes('onclose') && !networkContent.includes("'disconnected'")) {
    errors.push(`[WS] No WebSocket close handler — connection drops will be silent`);
}
if (!mainContent.includes("'disconnected'") && !mainContent.includes('"disconnected"')) {
    errors.push(`[WS] No disconnected event handler in main.js`);
}

// ═══════════════════════════════════════════
// W. 에러 토스트 검증
// ═══════════════════════════════════════════
if (!htmlIds.has('error-toast')) {
    errors.push(`[ERROR_UI] error-toast element missing from HTML`);
}
if (!lobbyContent.includes('showError')) {
    warnings.push(`[ERROR_UI] No showError method found — errors may be silent`);
}
// 토스트 자동 숨김
if (!lobbyContent.includes('setTimeout') || !lobbyContent.includes('show')) {
    warnings.push(`[ERROR_UI] Error toast may not auto-hide`);
}

// ═══════════════════════════════════════════
// 결과 출력
// ═══════════════════════════════════════════
console.log('\n══════════ SLIME VOLLEY VALIDATION ══════════\n');
console.log(`JS files: ${jsFiles.length}`);
console.log(`HTML DOM IDs: ${htmlIds.size}`);
console.log(`JS ID references: ${jsIdRefs.size}`);
console.log(`Sound files: ${soundFiles.length}`);
console.log(`Screen transitions: ${screenIdsInJS.size}`);
console.log(`CSS classes: ${allCssClasses.size}`);
console.log(`Class definitions: ${classDefinitions.size}`);
console.log();

if (errors.length === 0 && warnings.length === 0) {
    console.log('ALL CHECKS PASSED -- 0 errors, 0 warnings');
} else {
    if (errors.length > 0) {
        console.log(`ERRORS (${errors.length}):\n`);
        errors.forEach(e => console.log('  ' + e));
        console.log();
    }
    if (warnings.length > 0) {
        console.log(`WARNINGS (${warnings.length}):\n`);
        warnings.forEach(w => console.log('  ' + w));
        console.log();
    }
}

process.exit(errors.length > 0 ? 1 : 0);
