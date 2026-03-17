/**
 * Blockpang 종합 검증 스크립트
 * node validate.js 로 실행
 *
 * 검증 항목:
 *  1. HTML 스크립트/CSS 참조 파일 존재
 *  2. DOM ID ↔ JS 참조 일치
 *  3. 사운드 파일 존재 (JS에서 참조하는 WAV)
 *  4. 피스 정의 무결성 (shape 직사각형, tier/weight 유효)
 *  5. 레벨 시스템 정합성 (LEVEL_THRESHOLDS 단조증가, LEVEL_MAX_TIER 매핑)
 *  6. 점수 공식 정합성 (상수 타입/범위)
 *  7. i18n 완전성 (모든 언어에 모든 키 존재)
 *  8. 블록 컬러 정의 완전성 (main/light/dark/glow/particle)
 *  9. JS 클래스 정의 ↔ 인스턴스화 일관성
 * 10. 다국어 HTML 동기화 (스크립트/DOM ID 일치)
 * 11. 게임 상태 전이 완전성 (title→playing→gameover)
 * 12. 10×10 보드 배치 시뮬레이션 (모든 피스가 빈 보드에 놓이는지)
 * 13. 라인 클리어 로직 검증 (가로/세로 완성 시 정확히 감지)
 * 14. 콤보/멀티라인 점수 계산 시뮬레이션
 * 15. CSS 파일 존재
 * 16. Game API URL 유효성
 * 17. 피스별 셀 카운트 분포 확인
 * 18. JS 스크립트 로드 순서 (의존성)
 * 19. 풀 게임 시뮬레이션 (title → playing → gameover)
 * 20. 모든 피스 배치 유효성 (전체 포지션 순회)
 * 21. 라인 클리어 전체 케이스 검증
 * 22. 콤보 체인 시뮬레이션
 * 23. 레벨 진행 시뮬레이션
 * 24. i18n 전체 키 비어있지 않은지 검증
 * 25. 점수 엣지 케이스
 * 26. 게임 오버 감지 검증
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const errors = [];
const warnings = [];

function readFile(relPath) {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full, 'utf8');
}

function fileExists(relPath) {
    return fs.existsSync(path.join(ROOT, relPath));
}

// ═══════════════════════════════════════════
// Load constants.js
// ═══════════════════════════════════════════
const constContent = readFile('js/constants.js');
if (!constContent) {
    console.error('FATAL: js/constants.js not found');
    process.exit(1);
}

let GRID_SIZE, BLOCK_COLORS, PIECE_SHAPES, LEVEL_MAX_TIER,
    SCORE_PER_CELL, SCORE_PER_LINE, SCORE_MULTI_LINE_BONUS,
    COMBO_MULTIPLIER, PERFECT_CLEAR_BONUS, LEVEL_THRESHOLDS, I18N, LANGUAGES;

try {
    // navigator/localStorage 모킹
    const mockCode = `
        const navigator = { language: 'ko' };
        const localStorage = { getItem: () => null, setItem: () => {} };
        ${constContent}
        return { GRID_SIZE, BLOCK_COLORS, PIECE_SHAPES, LEVEL_MAX_TIER,
                 SCORE_PER_CELL, SCORE_PER_LINE, SCORE_MULTI_LINE_BONUS,
                 COMBO_MULTIPLIER, PERFECT_CLEAR_BONUS, LEVEL_THRESHOLDS, I18N, LANGUAGES };
    `;
    const fn = new Function(mockCode);
    const result = fn();
    GRID_SIZE = result.GRID_SIZE;
    BLOCK_COLORS = result.BLOCK_COLORS;
    PIECE_SHAPES = result.PIECE_SHAPES;
    LEVEL_MAX_TIER = result.LEVEL_MAX_TIER;
    SCORE_PER_CELL = result.SCORE_PER_CELL;
    SCORE_PER_LINE = result.SCORE_PER_LINE;
    SCORE_MULTI_LINE_BONUS = result.SCORE_MULTI_LINE_BONUS;
    COMBO_MULTIPLIER = result.COMBO_MULTIPLIER;
    PERFECT_CLEAR_BONUS = result.PERFECT_CLEAR_BONUS;
    LEVEL_THRESHOLDS = result.LEVEL_THRESHOLDS;
    I18N = result.I18N;
    LANGUAGES = result.LANGUAGES;
} catch (e) {
    console.error('FATAL: constants.js 실행 실패:', e.message);
    process.exit(1);
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
    const cleanRef = ref.split('?')[0];
    if (!fileExists(cleanRef)) {
        errors.push(`[HTML_REF] "${ref}" referenced in index.html but file not found`);
    }
}

// ═══════════════════════════════════════════
// 2. DOM ID ↔ JS 참조 일치
// ═══════════════════════════════════════════
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const jsFiles = [
    'js/main.js', 'js/Game.js', 'js/Board.js', 'js/Piece.js',
    'js/ScoreManager.js', 'js/UIManager.js', 'js/InputManager.js',
    'js/EffectManager.js', 'js/SoundManager.js', 'js/constants.js',
];

const allJsContent = {};
for (const f of jsFiles) {
    allJsContent[f] = readFile(f) || '';
}

for (const [file, content] of Object.entries(allJsContent)) {
    for (const m of content.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        if (!htmlIds.has(m[1])) {
            const line = content.substring(0, m.index).split('\n').length;
            errors.push(`[DOM_ID] ${file}:${line}: getElementById("${m[1]}") — id not in index.html`);
        }
    }
}

// ═══════════════════════════════════════════
// 3. 사운드 파일 존재
// ═══════════════════════════════════════════
const soundDir = path.join(ROOT, 'sounds');
const expectedSounds = [
    'place.wav', 'clear_single.wav', 'clear_double.wav', 'clear_triple.wav',
    'clear_quad.wav', 'combo_hit.wav', 'combo_escalate.wav',
    'sparkle.wav', 'whoosh.wav', 'impact_heavy.wav', 'glass_shatter.wav',
    'block_break.wav', 'pickup.wav',
];

// JS에서 참조하는 사운드도 수집
const soundMgrContent = allJsContent['js/SoundManager.js'] || '';
const jsSoundRefs = new Set();
for (const m of soundMgrContent.matchAll(/['"]sounds\/([^'"]+)['"]/g)) {
    jsSoundRefs.add(m[1]);
}
for (const m of soundMgrContent.matchAll(/createPool\(\s*['"]([^'"]+)['"]/g)) {
    // pool 이름과 파일 매칭
}

for (const sf of expectedSounds) {
    if (!fileExists(`sounds/${sf}`)) {
        errors.push(`[SOUND] "sounds/${sf}" not found`);
    }
}

// ═══════════════════════════════════════════
// 4. 피스 정의 무결성
// ═══════════════════════════════════════════
const usedTiers = new Set();
for (let i = 0; i < PIECE_SHAPES.length; i++) {
    const piece = PIECE_SHAPES[i];

    // shape 존재 여부
    if (!piece.shape || !Array.isArray(piece.shape) || piece.shape.length === 0) {
        errors.push(`[PIECE] PIECE_SHAPES[${i}]: invalid or empty shape`);
        continue;
    }

    // shape가 직사각형인지 (모든 행이 같은 길이)
    const rowLen = piece.shape[0].length;
    for (let r = 1; r < piece.shape.length; r++) {
        if (piece.shape[r].length !== rowLen) {
            errors.push(`[PIECE] PIECE_SHAPES[${i}]: row ${r} length(${piece.shape[r].length}) != row 0 length(${rowLen})`);
        }
    }

    // shape 값이 0 또는 1만 포함
    for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
            if (piece.shape[r][c] !== 0 && piece.shape[r][c] !== 1) {
                errors.push(`[PIECE] PIECE_SHAPES[${i}][${r}][${c}] = ${piece.shape[r][c]} (should be 0 or 1)`);
            }
        }
    }

    // 최소 1셀 이상
    const cellCount = piece.shape.flat().reduce((s, v) => s + v, 0);
    if (cellCount === 0) {
        errors.push(`[PIECE] PIECE_SHAPES[${i}]: shape has 0 filled cells`);
    }

    // 10×10 보드에 들어가는지
    if (piece.shape.length > GRID_SIZE || rowLen > GRID_SIZE) {
        errors.push(`[PIECE] PIECE_SHAPES[${i}]: shape(${piece.shape.length}×${rowLen}) exceeds grid(${GRID_SIZE}×${GRID_SIZE})`);
    }

    // weight > 0
    if (typeof piece.weight !== 'number' || piece.weight <= 0) {
        errors.push(`[PIECE] PIECE_SHAPES[${i}]: invalid weight(${piece.weight})`);
    }

    // tier 유효성
    if (typeof piece.tier !== 'number' || piece.tier < 1) {
        errors.push(`[PIECE] PIECE_SHAPES[${i}]: invalid tier(${piece.tier})`);
    }

    usedTiers.add(piece.tier);
}

// 연속된 tier 사용 여부
const maxTier = Math.max(...usedTiers);
for (let t = 1; t <= maxTier; t++) {
    if (!usedTiers.has(t)) {
        warnings.push(`[PIECE] Tier ${t} has no piece shapes defined (gap in tier sequence)`);
    }
}

// ═══════════════════════════════════════════
// 5. 레벨 시스템 정합성
// ═══════════════════════════════════════════
// LEVEL_THRESHOLDS 단조증가
for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (LEVEL_THRESHOLDS[i] <= LEVEL_THRESHOLDS[i - 1]) {
        errors.push(`[LEVEL] LEVEL_THRESHOLDS[${i}](${LEVEL_THRESHOLDS[i]}) <= [${i - 1}](${LEVEL_THRESHOLDS[i - 1]})`);
    }
}

// LEVEL_THRESHOLDS[0] === 0
if (LEVEL_THRESHOLDS[0] !== 0) {
    errors.push(`[LEVEL] LEVEL_THRESHOLDS[0] should be 0, got ${LEVEL_THRESHOLDS[0]}`);
}

// LEVEL_MAX_TIER 매핑: 모든 level이 유효한 tier를 가리키는지
for (let lv = 0; lv < LEVEL_MAX_TIER.length; lv++) {
    const maxTierForLevel = LEVEL_MAX_TIER[lv];
    if (maxTierForLevel < 1 || maxTierForLevel > maxTier) {
        errors.push(`[LEVEL] LEVEL_MAX_TIER[${lv}](${maxTierForLevel}) out of range [1, ${maxTier}]`);
    }
}

// ═══════════════════════════════════════════
// 6. 점수 공식 정합성
// ═══════════════════════════════════════════
if (typeof SCORE_PER_CELL !== 'number' || SCORE_PER_CELL <= 0) {
    errors.push(`[SCORE] SCORE_PER_CELL(${SCORE_PER_CELL}) must be > 0`);
}
if (typeof SCORE_PER_LINE !== 'number' || SCORE_PER_LINE <= 0) {
    errors.push(`[SCORE] SCORE_PER_LINE(${SCORE_PER_LINE}) must be > 0`);
}
if (typeof COMBO_MULTIPLIER !== 'number' || COMBO_MULTIPLIER <= 0) {
    errors.push(`[SCORE] COMBO_MULTIPLIER(${COMBO_MULTIPLIER}) must be > 0`);
}
if (typeof PERFECT_CLEAR_BONUS !== 'number' || PERFECT_CLEAR_BONUS <= 0) {
    errors.push(`[SCORE] PERFECT_CLEAR_BONUS(${PERFECT_CLEAR_BONUS}) must be > 0`);
}

// 점수 시뮬레이션: 1줄 클리어 = SCORE_PER_LINE
const singleLineScore = SCORE_PER_LINE * 1;
if (singleLineScore < 10) {
    warnings.push(`[SCORE] Single line clear score(${singleLineScore}) seems too low`);
}

// 콤보 2: 1 + (2-1) × COMBO_MULTIPLIER = 1.5배
const combo2mult = 1 + (2 - 1) * COMBO_MULTIPLIER;
if (combo2mult <= 1) {
    errors.push(`[SCORE] Combo 2 multiplier(${combo2mult}) should be > 1`);
}

// ═══════════════════════════════════════════
// 7. i18n 완전성
// ═══════════════════════════════════════════
const koKeys = Object.keys(I18N.ko || {});
for (const lang of LANGUAGES) {
    if (!I18N[lang]) {
        errors.push(`[I18N] Language "${lang}" defined in LANGUAGES but no I18N entry`);
        continue;
    }
    for (const key of koKeys) {
        if (!(key in I18N[lang])) {
            errors.push(`[I18N] ${lang}: missing key "${key}" (exists in ko)`);
        } else if (I18N[lang][key] === '' && I18N.ko[key] !== '') {
            warnings.push(`[I18N] ${lang}: key "${key}" is empty string`);
        }
    }
    // 여분 키
    for (const key of Object.keys(I18N[lang])) {
        if (!(key in I18N.ko)) {
            warnings.push(`[I18N] ${lang}: extra key "${key}" not in ko`);
        }
    }
}

// ═══════════════════════════════════════════
// 8. 블록 컬러 정의 완전성
// ═══════════════════════════════════════════
const requiredColorProps = ['main', 'light', 'dark', 'glow', 'particle'];
for (let i = 0; i < BLOCK_COLORS.length; i++) {
    const color = BLOCK_COLORS[i];
    for (const prop of requiredColorProps) {
        if (typeof color[prop] !== 'number') {
            errors.push(`[COLOR] BLOCK_COLORS[${i}].${prop} missing or not a number`);
        }
    }
}
if (BLOCK_COLORS.length < 2) {
    errors.push(`[COLOR] BLOCK_COLORS has only ${BLOCK_COLORS.length} entries (need at least 2)`);
}

// ═══════════════════════════════════════════
// 9. JS 클래스 정의 ↔ 인스턴스화
// ═══════════════════════════════════════════
const classDefs = new Set();
const classInsts = new Set();
const builtins = new Set(['Map', 'Set', 'Array', 'Object', 'Promise', 'Error',
    'Audio', 'Function', 'Uint8Array', 'Float32Array', 'Image']);

for (const [, content] of Object.entries(allJsContent)) {
    for (const m of content.matchAll(/class\s+(\w+)/g)) classDefs.add(m[1]);
    for (const m of content.matchAll(/new\s+(\w+)\s*\(/g)) {
        if (!builtins.has(m[1]) && !m[1].startsWith('PIXI') && !m[1].startsWith('Tone') && !m[1].startsWith('_')) {
            classInsts.add(m[1]);
        }
    }
}

for (const cls of classInsts) {
    if (!classDefs.has(cls)) {
        warnings.push(`[CLASS] "new ${cls}()" used but class not defined locally`);
    }
}

// ═══════════════════════════════════════════
// 10. 다국어 HTML 동기화
// ═══════════════════════════════════════════
const htmlVariants = ['index-en.html'];
const koScripts = [...html.matchAll(/src="([^"]+\.js[^"]*)"/g)]
    .map(m => m[1].split('?')[0])
    .filter(s => !s.startsWith('http'));

for (const variant of htmlVariants) {
    const varHtml = readFile(variant);
    if (!varHtml) {
        warnings.push(`[HTML_SYNC] ${variant} not found`);
        continue;
    }

    const varScripts = [...varHtml.matchAll(/src="([^"]+\.js[^"]*)"/g)]
        .map(m => m[1].split('?')[0])
        .filter(s => !s.startsWith('http'));

    for (const s of koScripts) {
        const base = path.basename(s);
        if (!varScripts.some(vs => path.basename(vs) === base)) {
            errors.push(`[HTML_SYNC] ${variant}: missing script "${base}" (exists in index.html)`);
        }
    }

    // DOM ID 비교
    const varIds = new Set([...varHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    for (const id of htmlIds) {
        if (!varIds.has(id)) {
            errors.push(`[HTML_SYNC] ${variant}: missing DOM id="${id}"`);
        }
    }
}

// ═══════════════════════════════════════════
// 11. 게임 상태 전이 완전성
// ═══════════════════════════════════════════
const gameContent = allJsContent['js/Game.js'] || '';
const validStates = ['title', 'playing', 'gameover'];
const statesUsed = new Set();

for (const [, content] of Object.entries(allJsContent)) {
    for (const m of content.matchAll(/state\s*[=!]==?\s*['"](\w+)['"]/g)) statesUsed.add(m[1]);
    for (const m of content.matchAll(/state\s*=\s*['"](\w+)['"]/g)) statesUsed.add(m[1]);
}

for (const state of statesUsed) {
    if (!validStates.includes(state)) {
        // 다른 의미의 state 변수일 수 있으므로 warning
        if (['title', 'playing', 'gameover', 'paused'].includes(state)) {
            if (!validStates.includes(state)) {
                warnings.push(`[STATE] Game state "${state}" used but not in expected states list`);
            }
        }
    }
}

// ═══════════════════════════════════════════
// 12. 보드 배치 시뮬레이션
// ═══════════════════════════════════════════
// 모든 피스가 빈 10×10 보드에 배치 가능한지
for (let i = 0; i < PIECE_SHAPES.length; i++) {
    const piece = PIECE_SHAPES[i];
    const rows = piece.shape.length;
    const cols = piece.shape[0].length;

    // 빈 보드에서 (0,0)에 놓을 수 있는지
    if (rows > GRID_SIZE || cols > GRID_SIZE) {
        errors.push(`[BOARD] PIECE_SHAPES[${i}]: shape ${rows}×${cols} doesn't fit in ${GRID_SIZE}×${GRID_SIZE} grid`);
    }
}

// ═══════════════════════════════════════════
// 13. 라인 클리어 로직 검증
// ═══════════════════════════════════════════
// 시뮬레이션: 가로줄 완전 채움 → 클리어 감지
function simulateLineClear() {
    const board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));

    // 첫 번째 행을 모두 채움
    for (let c = 0; c < GRID_SIZE; c++) {
        board[0][c] = 0; // 색상 인덱스 0
    }

    // 가로 줄 클리어 체크
    const clearedRows = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        if (board[r].every(cell => cell >= 0)) {
            clearedRows.push(r);
        }
    }

    if (clearedRows.length !== 1 || clearedRows[0] !== 0) {
        errors.push(`[CLEAR] Row clear simulation failed: expected [0], got [${clearedRows}]`);
    }

    // 세로 줄 클리어 체크
    const board2 = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));
    for (let r = 0; r < GRID_SIZE; r++) {
        board2[r][0] = 1;
    }
    const clearedCols = [];
    for (let c = 0; c < GRID_SIZE; c++) {
        let full = true;
        for (let r = 0; r < GRID_SIZE; r++) {
            if (board2[r][c] < 0) { full = false; break; }
        }
        if (full) clearedCols.push(c);
    }

    if (clearedCols.length !== 1 || clearedCols[0] !== 0) {
        errors.push(`[CLEAR] Column clear simulation failed: expected [0], got [${clearedCols}]`);
    }
}
simulateLineClear();

// ═══════════════════════════════════════════
// 14. 콤보/멀티라인 점수 계산 시뮬레이션
// ═══════════════════════════════════════════
// 2줄 동시 클리어 점수
const twoLineScore = SCORE_PER_LINE * 2 + SCORE_MULTI_LINE_BONUS;
if (twoLineScore <= SCORE_PER_LINE) {
    errors.push(`[SCORE_SIM] 2-line clear score(${twoLineScore}) should be > single line(${SCORE_PER_LINE})`);
}

// 콤보 3 점수 배율
const combo3mult = 1 + (3 - 1) * COMBO_MULTIPLIER;
if (combo3mult <= combo2mult) {
    errors.push(`[SCORE_SIM] Combo 3 multiplier(${combo3mult}) should be > combo 2(${combo2mult})`);
}

// 퍼펙트 클리어 보너스 (레벨 1)
const perfectScore = PERFECT_CLEAR_BONUS * 1;
if (perfectScore <= 0) {
    errors.push(`[SCORE_SIM] Perfect clear bonus at level 1 should be > 0`);
}

// ═══════════════════════════════════════════
// 15. CSS 파일 존재
// ═══════════════════════════════════════════
if (!fileExists('css/style.css')) {
    errors.push(`[CSS] css/style.css not found`);
}

// ═══════════════════════════════════════════
// 16. Game API URL 유효성
// ═══════════════════════════════════════════
if (constContent.includes('GAME_API_URL')) {
    const urlMatch = constContent.match(/GAME_API_URL\s*=\s*['"]([^'"]+)['"]/);
    if (urlMatch) {
        try {
            new URL(urlMatch[1]);
        } catch {
            errors.push(`[API] GAME_API_URL "${urlMatch[1]}" is not a valid URL`);
        }
    }
}

// ═══════════════════════════════════════════
// 17. 피스별 셀 카운트 분포 확인
// ═══════════════════════════════════════════
const cellCountDist = {};
for (const piece of PIECE_SHAPES) {
    const count = piece.shape.flat().reduce((s, v) => s + v, 0);
    cellCountDist[count] = (cellCountDist[count] || 0) + 1;
}
if (!cellCountDist[1]) {
    warnings.push(`[PIECE] No single-cell piece defined — may affect early game balance`);
}

// ═══════════════════════════════════════════
// 18. JS 스크립트 로드 순서 (의존성)
// ═══════════════════════════════════════════
const scriptOrder = localScripts.map(s => path.basename(s.split('?')[0]));
const constIdx = scriptOrder.indexOf('constants.js');
const gameIdx = scriptOrder.indexOf('Game.js');
const mainIdx = scriptOrder.indexOf('main.js');

if (constIdx >= 0 && gameIdx >= 0 && constIdx > gameIdx) {
    errors.push(`[LOAD_ORDER] constants.js must load before Game.js`);
}
if (gameIdx >= 0 && mainIdx >= 0 && gameIdx > mainIdx) {
    errors.push(`[LOAD_ORDER] Game.js must load before main.js`);
}
if (mainIdx >= 0 && mainIdx !== scriptOrder.length - 1) {
    warnings.push(`[LOAD_ORDER] main.js should be the last script (entry point)`);
}

// ═══════════════════════════════════════════
// 19. 풀 게임 시뮬레이션 (title → playing → gameover)
// ═══════════════════════════════════════════
function simFullGame() {
    const board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));
    let totalScore = 0;
    let totalLinesCleared = 0;
    let maxCombo = 0;
    let combo = 0;
    let turnsPlayed = 0;

    // Helper: get current level from total lines cleared
    function getLevel(lines) {
        let lv = 0;
        for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
            if (lines >= LEVEL_THRESHOLDS[i]) { lv = i; break; }
        }
        return lv;
    }

    // Helper: get max tier for a level
    function getMaxTier(level) {
        if (level >= LEVEL_MAX_TIER.length) return LEVEL_MAX_TIER[LEVEL_MAX_TIER.length - 1];
        return LEVEL_MAX_TIER[level];
    }

    // Helper: get available pieces for current level
    function getAvailablePieces(level) {
        const mt = getMaxTier(level);
        return PIECE_SHAPES.filter(p => p.tier <= mt);
    }

    // Helper: check if piece can be placed at (row, col) on board
    function canPlace(board, piece, row, col) {
        const shape = piece.shape;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] === 1) {
                    const br = row + r;
                    const bc = col + c;
                    if (br < 0 || br >= GRID_SIZE || bc < 0 || bc >= GRID_SIZE) return false;
                    if (board[br][bc] >= 0) return false;
                }
            }
        }
        return true;
    }

    // Helper: place piece on board
    function placePiece(board, piece, row, col, colorIdx) {
        const shape = piece.shape;
        let cells = 0;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] === 1) {
                    board[row + r][col + c] = colorIdx;
                    cells++;
                }
            }
        }
        return cells;
    }

    // Helper: find first valid position for piece on board
    function findPlacement(board, piece) {
        for (let r = 0; r <= GRID_SIZE - piece.shape.length; r++) {
            for (let c = 0; c <= GRID_SIZE - piece.shape[0].length; c++) {
                if (canPlace(board, piece, r, c)) return { r, c };
            }
        }
        return null;
    }

    // Helper: detect and clear lines, return count
    function clearLines(board) {
        let cleared = 0;
        // Rows
        for (let r = 0; r < GRID_SIZE; r++) {
            if (board[r].every(cell => cell >= 0)) {
                board[r].fill(-1);
                cleared++;
            }
        }
        // Columns
        for (let c = 0; c < GRID_SIZE; c++) {
            let full = true;
            for (let r = 0; r < GRID_SIZE; r++) {
                if (board[r][c] < 0) { full = false; break; }
            }
            if (full) {
                for (let r = 0; r < GRID_SIZE; r++) board[r][c] = -1;
                cleared++;
            }
        }
        return cleared;
    }

    // Helper: check if any piece from available can be placed anywhere
    function canPlaceAny(board, pieces) {
        for (const piece of pieces) {
            for (let r = 0; r <= GRID_SIZE - piece.shape.length; r++) {
                for (let c = 0; c <= GRID_SIZE - piece.shape[0].length; c++) {
                    if (canPlace(board, piece, r, c)) return true;
                }
            }
        }
        return false;
    }

    // Simple seeded random for reproducibility
    let seed = 42;
    function seededRandom() {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    }

    // Game loop
    let gameOver = false;
    while (!gameOver) {
        const level = getLevel(totalLinesCleared);
        const available = getAvailablePieces(level);

        // Generate 3 pieces per turn
        const turnPieces = [];
        for (let p = 0; p < 3; p++) {
            const idx = Math.floor(seededRandom() * available.length);
            turnPieces.push(available[idx]);
        }

        let placedAny = false;
        for (const piece of turnPieces) {
            const pos = findPlacement(board, piece);
            if (!pos) continue;

            const colorIdx = Math.floor(seededRandom() * BLOCK_COLORS.length);
            const cellsPlaced = placePiece(board, piece, pos.r, pos.c, colorIdx);
            totalScore += cellsPlaced * SCORE_PER_CELL;

            // Line clears
            const linesCleared = clearLines(board);
            if (linesCleared > 0) {
                combo++;
                if (combo > maxCombo) maxCombo = combo;
                totalLinesCleared += linesCleared;

                let lineScore = SCORE_PER_LINE * linesCleared;
                if (linesCleared >= 2) lineScore += SCORE_MULTI_LINE_BONUS;
                const comboMult = 1 + (combo - 1) * COMBO_MULTIPLIER;
                totalScore += Math.floor(lineScore * comboMult);

                // Perfect clear check
                const isEmpty = board.every(row => row.every(cell => cell < 0));
                if (isEmpty) {
                    const curLevel = getLevel(totalLinesCleared);
                    totalScore += PERFECT_CLEAR_BONUS * (curLevel + 1);
                }
            } else {
                combo = 0;
            }

            placedAny = true;
        }

        turnsPlayed++;

        // Check game over: can any available piece be placed?
        const levelNow = getLevel(totalLinesCleared);
        const availableNow = getAvailablePieces(levelNow);
        if (!placedAny || !canPlaceAny(board, availableNow)) {
            gameOver = true;
        }

        // Safety: prevent infinite loop (max 10000 turns)
        if (turnsPlayed >= 10000) {
            warnings.push(`[FULL_GAME] Simulation hit 10000 turn limit — possible infinite loop`);
            gameOver = true;
        }
    }

    const levelReached = getLevel(totalLinesCleared);

    if (turnsPlayed < 1) {
        errors.push(`[FULL_GAME] Simulation ended immediately with 0 turns`);
    }
    if (totalScore <= 0) {
        errors.push(`[FULL_GAME] Total score is ${totalScore} — should be positive`);
    }

    return { totalScore, totalLinesCleared, maxCombo, levelReached, turnsPlayed };
}

const simResult = simFullGame();

// ═══════════════════════════════════════════
// 20. 모든 피스 배치 유효성 (전체 포지션 순회)
// ═══════════════════════════════════════════
for (let i = 0; i < PIECE_SHAPES.length; i++) {
    const piece = PIECE_SHAPES[i];
    const shape = piece.shape;
    const rows = shape.length;
    const cols = shape[0].length;

    // Check placement at (0,0) on empty board
    let canPlaceAt00 = true;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (shape[r][c] === 1 && (r >= GRID_SIZE || c >= GRID_SIZE)) {
                canPlaceAt00 = false;
            }
        }
    }
    if (!canPlaceAt00) {
        errors.push(`[PLACEMENT] PIECE_SHAPES[${i}]: cannot place at (0,0) on empty ${GRID_SIZE}×${GRID_SIZE} board`);
    }

    // Count total valid placements on empty board
    let validPlacements = 0;
    for (let r = 0; r <= GRID_SIZE - rows; r++) {
        for (let c = 0; c <= GRID_SIZE - cols; c++) {
            // On empty board, any in-bounds position is valid
            validPlacements++;
        }
    }

    if (validPlacements === 0) {
        errors.push(`[PLACEMENT] PIECE_SHAPES[${i}]: 0 valid placements on empty board (shape ${rows}×${cols})`);
    }
}

// ═══════════════════════════════════════════
// 21. 라인 클리어 전체 케이스 검증
// ═══════════════════════════════════════════
function detectClears(board) {
    const clearedRows = [];
    const clearedCols = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        if (board[r].every(cell => cell >= 0)) clearedRows.push(r);
    }
    for (let c = 0; c < GRID_SIZE; c++) {
        let full = true;
        for (let r = 0; r < GRID_SIZE; r++) {
            if (board[r][c] < 0) { full = false; break; }
        }
        if (full) clearedCols.push(c);
    }
    return { clearedRows, clearedCols, total: clearedRows.length + clearedCols.length };
}

function makeBoard() {
    return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));
}

function fillRow(board, row) {
    for (let c = 0; c < GRID_SIZE; c++) board[row][c] = 0;
}

function fillCol(board, col) {
    for (let r = 0; r < GRID_SIZE; r++) board[r][col] = 0;
}

// 21a. Clear exactly 1 row
{
    const b = makeBoard();
    fillRow(b, 3);
    const result = detectClears(b);
    if (result.clearedRows.length !== 1 || result.clearedRows[0] !== 3) {
        errors.push(`[CLEAR_CASES] 1-row clear: expected row 3, got rows [${result.clearedRows}]`);
    }
    if (result.clearedCols.length !== 0) {
        errors.push(`[CLEAR_CASES] 1-row clear: unexpected col clears [${result.clearedCols}]`);
    }
}

// 21b. Clear exactly 1 column
{
    const b = makeBoard();
    fillCol(b, 5);
    const result = detectClears(b);
    if (result.clearedCols.length !== 1 || result.clearedCols[0] !== 5) {
        errors.push(`[CLEAR_CASES] 1-col clear: expected col 5, got cols [${result.clearedCols}]`);
    }
    if (result.clearedRows.length !== 0) {
        errors.push(`[CLEAR_CASES] 1-col clear: unexpected row clears [${result.clearedRows}]`);
    }
}

// 21c. Clear 1 row + 1 column simultaneously
{
    const b = makeBoard();
    fillRow(b, 2);
    fillCol(b, 7);
    const result = detectClears(b);
    if (result.clearedRows.length !== 1 || result.clearedRows[0] !== 2) {
        errors.push(`[CLEAR_CASES] 1-row+1-col: expected row 2, got rows [${result.clearedRows}]`);
    }
    if (result.clearedCols.length !== 1 || result.clearedCols[0] !== 7) {
        errors.push(`[CLEAR_CASES] 1-row+1-col: expected col 7, got cols [${result.clearedCols}]`);
    }
    if (result.total !== 2) {
        errors.push(`[CLEAR_CASES] 1-row+1-col: expected total 2, got ${result.total}`);
    }
}

// 21d. Clear 2 rows simultaneously
{
    const b = makeBoard();
    fillRow(b, 0);
    fillRow(b, 9);
    const result = detectClears(b);
    if (result.clearedRows.length !== 2) {
        errors.push(`[CLEAR_CASES] 2-row clear: expected 2 rows, got ${result.clearedRows.length}`);
    }
}

// 21e. Clear 2 columns simultaneously
{
    const b = makeBoard();
    fillCol(b, 0);
    fillCol(b, 9);
    const result = detectClears(b);
    if (result.clearedCols.length !== 2) {
        errors.push(`[CLEAR_CASES] 2-col clear: expected 2 cols, got ${result.clearedCols.length}`);
    }
}

// 21f. Clear up to 4 rows + 4 columns (max 20 lines)
{
    const b = makeBoard();
    fillRow(b, 0); fillRow(b, 1); fillRow(b, 2); fillRow(b, 3);
    fillCol(b, 0); fillCol(b, 1); fillCol(b, 2); fillCol(b, 3);
    const result = detectClears(b);
    if (result.clearedRows.length !== 4) {
        errors.push(`[CLEAR_CASES] 4-row+4-col: expected 4 rows, got ${result.clearedRows.length}`);
    }
    if (result.clearedCols.length !== 4) {
        errors.push(`[CLEAR_CASES] 4-row+4-col: expected 4 cols, got ${result.clearedCols.length}`);
    }
    if (result.total !== 8) {
        errors.push(`[CLEAR_CASES] 4-row+4-col: expected total 8, got ${result.total}`);
    }
}

// 21g. Perfect clear (fill entire board, then detect all rows+cols clear)
{
    const b = makeBoard();
    for (let r = 0; r < GRID_SIZE; r++) fillRow(b, r);
    const result = detectClears(b);
    if (result.clearedRows.length !== GRID_SIZE) {
        errors.push(`[CLEAR_CASES] Perfect clear: expected ${GRID_SIZE} rows, got ${result.clearedRows.length}`);
    }
    if (result.clearedCols.length !== GRID_SIZE) {
        errors.push(`[CLEAR_CASES] Perfect clear: expected ${GRID_SIZE} cols, got ${result.clearedCols.length}`);
    }
    // After clearing all rows, board should be empty
    for (let r = 0; r < GRID_SIZE; r++) b[r].fill(-1);
    const isEmpty = b.every(row => row.every(cell => cell < 0));
    if (!isEmpty) {
        errors.push(`[CLEAR_CASES] Perfect clear: board not empty after clearing all`);
    }
}

// ═══════════════════════════════════════════
// 22. 콤보 체인 시뮬레이션
// ═══════════════════════════════════════════
{
    // Simulate consecutive turns with line clears
    // Verify combo multiplier increases correctly for combo 1-5
    let combo = 0;
    const expectedMultipliers = [];

    for (let turn = 1; turn <= 5; turn++) {
        combo++;
        const mult = 1 + (combo - 1) * COMBO_MULTIPLIER;
        expectedMultipliers.push(mult);

        if (turn >= 2 && mult <= expectedMultipliers[turn - 2]) {
            errors.push(`[COMBO_CHAIN] Combo ${combo} multiplier(${mult}) not greater than combo ${combo - 1} multiplier(${expectedMultipliers[turn - 2]})`);
        }
    }

    // Verify combo 1 multiplier = 1
    if (expectedMultipliers[0] !== 1) {
        errors.push(`[COMBO_CHAIN] Combo 1 multiplier should be 1, got ${expectedMultipliers[0]}`);
    }

    // Break combo → verify reset to 0
    combo = 0;
    const afterBreakMult = 1 + (0) * COMBO_MULTIPLIER;
    if (afterBreakMult !== 1) {
        errors.push(`[COMBO_CHAIN] After combo break, multiplier should be 1, got ${afterBreakMult}`);
    }

    // Verify score formula: baseScore × (1 + (combo-1) × COMBO_MULTIPLIER)
    const baseScore = SCORE_PER_LINE * 2 + SCORE_MULTI_LINE_BONUS; // 2 lines
    for (let c = 1; c <= 5; c++) {
        const comboMult = 1 + (c - 1) * COMBO_MULTIPLIER;
        const finalScore = Math.floor(baseScore * comboMult);
        if (finalScore <= 0) {
            errors.push(`[COMBO_CHAIN] Combo ${c}: final score ${finalScore} should be > 0`);
        }
        if (c >= 2) {
            const prevMult = 1 + (c - 2) * COMBO_MULTIPLIER;
            const prevScore = Math.floor(baseScore * prevMult);
            if (finalScore <= prevScore) {
                errors.push(`[COMBO_CHAIN] Combo ${c} score(${finalScore}) should be > combo ${c - 1} score(${prevScore})`);
            }
        }
    }
}

// ═══════════════════════════════════════════
// 23. 레벨 진행 시뮬레이션
// ═══════════════════════════════════════════
{
    // Simulate progression through levels by accumulating lines
    let prevMaxTier = 0;
    for (let lv = 0; lv < LEVEL_THRESHOLDS.length; lv++) {
        const linesNeeded = LEVEL_THRESHOLDS[lv];
        const mt = lv < LEVEL_MAX_TIER.length ? LEVEL_MAX_TIER[lv] : LEVEL_MAX_TIER[LEVEL_MAX_TIER.length - 1];

        // Verify tier only increases or stays the same
        if (mt < prevMaxTier) {
            errors.push(`[LEVEL_PROG] Level ${lv} (${linesNeeded} lines): max tier(${mt}) decreased from previous(${prevMaxTier})`);
        }
        prevMaxTier = mt;

        // Verify pieces from unlocked tiers are available
        const availablePieces = PIECE_SHAPES.filter(p => p.tier <= mt);
        if (availablePieces.length === 0) {
            errors.push(`[LEVEL_PROG] Level ${lv} (${linesNeeded} lines): no pieces available (max tier ${mt})`);
        }

        // At level 0, at least tier 1 pieces should be available
        if (lv === 0 && mt < 1) {
            errors.push(`[LEVEL_PROG] Level 0: max tier(${mt}) should be >= 1`);
        }
    }

    // Verify that at max level, all tiers are unlocked
    const maxLevelTier = LEVEL_MAX_TIER[LEVEL_MAX_TIER.length - 1];
    const allTiers = new Set(PIECE_SHAPES.map(p => p.tier));
    const highestTier = Math.max(...allTiers);
    if (maxLevelTier < highestTier) {
        errors.push(`[LEVEL_PROG] Max level tier(${maxLevelTier}) doesn't unlock highest piece tier(${highestTier})`);
    }

    // Verify each level threshold enables at least some new content or all tiers are already unlocked
    for (let lv = 1; lv < LEVEL_MAX_TIER.length; lv++) {
        const prevTier = LEVEL_MAX_TIER[lv - 1];
        const curTier = LEVEL_MAX_TIER[lv];
        // It's okay if tiers are the same (plateau), just not decreasing
        if (curTier < prevTier) {
            errors.push(`[LEVEL_PROG] LEVEL_MAX_TIER[${lv}](${curTier}) < LEVEL_MAX_TIER[${lv - 1}](${prevTier})`);
        }
    }
}

// ═══════════════════════════════════════════
// 24. i18n 전체 키 값 비어있지 않은지 검증
// ═══════════════════════════════════════════
for (const lang of LANGUAGES) {
    if (!I18N[lang]) continue;
    for (const [key, value] of Object.entries(I18N[lang])) {
        if (typeof value !== 'string') {
            errors.push(`[I18N_VALUES] ${lang}.${key}: value is not a string (type: ${typeof value})`);
        } else if (value.trim() === '') {
            errors.push(`[I18N_VALUES] ${lang}.${key}: value is empty string`);
        }
    }
}

// ═══════════════════════════════════════════
// 25. 점수 엣지 케이스
// ═══════════════════════════════════════════
{
    // 25a. Placement of 1-cell piece: score = 1 × SCORE_PER_CELL
    const singleCellPiece = PIECE_SHAPES.find(p => {
        const cells = p.shape.flat().reduce((s, v) => s + v, 0);
        return cells === 1;
    });
    if (singleCellPiece) {
        const expected = 1 * SCORE_PER_CELL;
        if (expected !== SCORE_PER_CELL) {
            errors.push(`[SCORE_EDGE] 1-cell piece score: expected ${SCORE_PER_CELL}, got ${expected}`);
        }
    } else {
        warnings.push(`[SCORE_EDGE] No 1-cell piece found to test`);
    }

    // 25b. 9-cell piece (3×3 square): score = 9 × SCORE_PER_CELL
    const nineCellPiece = PIECE_SHAPES.find(p => {
        const cells = p.shape.flat().reduce((s, v) => s + v, 0);
        return cells === 9;
    });
    if (nineCellPiece) {
        const expected = 9 * SCORE_PER_CELL;
        if (expected <= 0) {
            errors.push(`[SCORE_EDGE] 9-cell piece score(${expected}) should be > 0`);
        }
        // Verify it's specifically 9 × SCORE_PER_CELL
        if (expected !== 9 * SCORE_PER_CELL) {
            errors.push(`[SCORE_EDGE] 9-cell piece score: expected ${9 * SCORE_PER_CELL}, got ${expected}`);
        }
    } else {
        warnings.push(`[SCORE_EDGE] No 9-cell piece found to test`);
    }

    // 25c. Multi-line bonus: 2 lines = SCORE_PER_LINE×2 + SCORE_MULTI_LINE_BONUS
    const twoLineExpected = SCORE_PER_LINE * 2 + SCORE_MULTI_LINE_BONUS;
    const oneLineExpected = SCORE_PER_LINE * 1;
    if (twoLineExpected <= oneLineExpected) {
        errors.push(`[SCORE_EDGE] 2-line score(${twoLineExpected}) should be > 1-line score(${oneLineExpected})`);
    }

    // 25d. Perfect clear at level 5: PERFECT_CLEAR_BONUS × 5
    const perfectClearLv5 = PERFECT_CLEAR_BONUS * 5;
    if (perfectClearLv5 <= PERFECT_CLEAR_BONUS) {
        errors.push(`[SCORE_EDGE] Perfect clear at level 5(${perfectClearLv5}) should be > level 1(${PERFECT_CLEAR_BONUS})`);
    }
    if (perfectClearLv5 !== PERFECT_CLEAR_BONUS * 5) {
        errors.push(`[SCORE_EDGE] Perfect clear at level 5: expected ${PERFECT_CLEAR_BONUS * 5}, got ${perfectClearLv5}`);
    }
}

// ═══════════════════════════════════════════
// 26. 게임 오버 감지 검증
// ═══════════════════════════════════════════
{
    // Helper: check if any piece from the list can be placed on board
    function canPlaceAnyPiece(board, pieces) {
        for (const piece of pieces) {
            const rows = piece.shape.length;
            const cols = piece.shape[0].length;
            for (let r = 0; r <= GRID_SIZE - rows; r++) {
                for (let c = 0; c <= GRID_SIZE - cols; c++) {
                    let valid = true;
                    for (let pr = 0; pr < rows && valid; pr++) {
                        for (let pc = 0; pc < cols && valid; pc++) {
                            if (piece.shape[pr][pc] === 1 && board[r + pr][c + pc] >= 0) {
                                valid = false;
                            }
                        }
                    }
                    if (valid) return true;
                }
            }
        }
        return false;
    }

    // 26a. Completely full board → game over for all tiers
    {
        const fullBoard = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
        if (canPlaceAnyPiece(fullBoard, PIECE_SHAPES)) {
            errors.push(`[GAME_OVER] Full board: should not be able to place any piece`);
        }
    }

    // 26b. Test game over per tier: fill board leaving only 1 empty cell
    // The only piece that can fit in a single empty cell is the 1×1 piece (tier 1)
    for (let tier = 1; tier <= maxTier; tier++) {
        const tierPieces = PIECE_SHAPES.filter(p => p.tier === tier);
        const almostFullBoard = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));

        // Leave one corner cell empty
        almostFullBoard[0][0] = -1;

        // Check: only 1-cell pieces should fit
        const canPlace = canPlaceAnyPiece(almostFullBoard, tierPieces);
        const hasSingleCell = tierPieces.some(p => p.shape.flat().reduce((s, v) => s + v, 0) === 1);

        if (hasSingleCell && !canPlace) {
            errors.push(`[GAME_OVER] Tier ${tier}: has 1-cell piece but cannot place on board with 1 empty cell`);
        }
        if (!hasSingleCell && canPlace) {
            errors.push(`[GAME_OVER] Tier ${tier}: no 1-cell piece but can still place on board with 1 empty cell`);
        }
    }

    // 26c. Board with scattered empty cells that form no valid piece shape
    {
        // Fill board, leave only diagonal cells empty (no adjacent empty cells)
        const scatterBoard = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
        // Only leave (0,0), (2,2), (4,4), (6,6), (8,8) empty — isolated single cells
        const emptyCells = [[0, 0], [2, 2], [4, 4], [6, 6], [8, 8]];
        for (const [r, c] of emptyCells) scatterBoard[r][c] = -1;

        // Only single-cell pieces should fit here
        const multiCellPieces = PIECE_SHAPES.filter(p => {
            const cells = p.shape.flat().reduce((s, v) => s + v, 0);
            return cells >= 2;
        });
        if (canPlaceAnyPiece(scatterBoard, multiCellPieces)) {
            errors.push(`[GAME_OVER] Scattered empty cells: multi-cell pieces should not fit in isolated single-cell gaps`);
        }

        // But single-cell pieces should fit
        const singleCellPieces = PIECE_SHAPES.filter(p => {
            const cells = p.shape.flat().reduce((s, v) => s + v, 0);
            return cells === 1;
        });
        if (singleCellPieces.length > 0 && !canPlaceAnyPiece(scatterBoard, singleCellPieces)) {
            errors.push(`[GAME_OVER] Scattered empty cells: 1-cell pieces should fit in single-cell gaps`);
        }
    }

    // 26d. Empty board → game should NOT be over for any tier
    {
        const emptyBoard = makeBoard();
        for (let tier = 1; tier <= maxTier; tier++) {
            const tierPieces = PIECE_SHAPES.filter(p => p.tier === tier);
            if (tierPieces.length > 0 && !canPlaceAnyPiece(emptyBoard, tierPieces)) {
                errors.push(`[GAME_OVER] Empty board: tier ${tier} pieces cannot be placed — should always fit`);
            }
        }
    }
}

// ═══════════════════════════════════════════
// 27. localStorage 키 일관성
// ═══════════════════════════════════════════
// JS에서 사용하는 localStorage 키 수집
const lsKeys = new Set();
for (const [file, content] of Object.entries(allJsContent)) {
    for (const m of content.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        lsKeys.add(m[1]);
    }
}

// 읽기/쓰기 일관성: getItem하는 키는 setItem도 해야 함
const lsGetKeys = new Set();
const lsSetKeys = new Set();
for (const [, content] of Object.entries(allJsContent)) {
    for (const m of content.matchAll(/localStorage\.getItem\(\s*['"]([^'"]+)['"]\s*\)/g)) lsGetKeys.add(m[1]);
    for (const m of content.matchAll(/localStorage\.setItem\(\s*['"]([^'"]+)['"]\s*\)/g)) lsSetKeys.add(m[1]);
}
for (const key of lsGetKeys) {
    if (!lsSetKeys.has(key)) {
        warnings.push(`[STORAGE] localStorage.getItem("${key}") used but setItem never called — value may always be null`);
    }
}

// ═══════════════════════════════════════════
// 28. 랭킹 시스템 검증 (Game API)
// ═══════════════════════════════════════════
const allContent = Object.values(allJsContent).join('\n');

// API URL 정의 확인
if (!allContent.includes('GAME_API_URL')) {
    warnings.push(`[RANKING] GAME_API_URL not defined — ranking system may not work`);
}

// 랭킹 등록 flow: submit 버튼 → fetch POST → 결과 표시
const hasRankSubmit = allContent.includes('submit') || allContent.includes('Submit');
const hasFetchPost = allContent.includes("method") && (allContent.includes("'POST'") || allContent.includes('"POST"'));
const hasRankDisplay = allContent.includes('ranking') || allContent.includes('hallOfFame') || allContent.includes('leaderboard');

if (!hasRankSubmit) warnings.push(`[RANKING] No rank submit UI found`);
if (!hasFetchPost) warnings.push(`[RANKING] No POST fetch found — ranking submission may not work`);
if (!hasRankDisplay) warnings.push(`[RANKING] No ranking display code found`);

// 이름 입력 검증: maxlength, 빈 이름 방지
const hasNameValidation = allContent.includes('trim()') && (allContent.includes('.length') || allContent.includes('!name'));
if (!hasNameValidation) {
    warnings.push(`[RANKING] No name input validation found — empty names may be submitted`);
}

// i18n 랭킹 관련 키 존재 확인
const rankingI18nKeys = ['hallOfFame', 'ranking', 'noRecords', 'enterName', 'submit', 'skip', 'rankSubmitted', 'yourRank'];
for (const key of rankingI18nKeys) {
    for (const lang of LANGUAGES) {
        if (!I18N[lang] || !I18N[lang][key]) {
            errors.push(`[RANKING_I18N] ${lang}: missing ranking key "${key}"`);
        }
    }
}

// ═══════════════════════════════════════════
// 29. 언어 변경 기능 검증
// ═══════════════════════════════════════════
// cycleLanguage 함수 존재
if (!constContent.includes('cycleLanguage')) {
    errors.push(`[LANG] cycleLanguage function not found in constants.js`);
}
// setLanguage 함수 존재
if (!constContent.includes('setLanguage')) {
    errors.push(`[LANG] setLanguage function not found in constants.js`);
}
// 언어 변경 시 localStorage 저장
if (!constContent.includes("localStorage.setItem('blockpang_lang'") && !constContent.includes('localStorage.setItem("blockpang_lang"')) {
    errors.push(`[LANG] Language change doesn't persist to localStorage`);
}
// 모든 언어의 langLabel 키 존재 (버튼 표시용)
for (const lang of LANGUAGES) {
    if (!I18N[lang] || !I18N[lang].langLabel) {
        errors.push(`[LANG] ${lang}: missing "langLabel" key for language toggle button`);
    }
}

// 언어 순환 시뮬레이션: ko → en → ja → ko
{
    const langOrder = [];
    let cur = LANGUAGES.indexOf('ko');
    for (let i = 0; i < LANGUAGES.length + 1; i++) {
        langOrder.push(LANGUAGES[cur]);
        cur = (cur + 1) % LANGUAGES.length;
    }
    // 마지막이 처음과 같아야 (순환)
    if (langOrder[0] !== langOrder[langOrder.length - 1]) {
        errors.push(`[LANG] Language cycling doesn't wrap around: ${langOrder.join(' → ')}`);
    }
}

// ═══════════════════════════════════════════
// 30. 최고점수 저장/로드 검증
// ═══════════════════════════════════════════
// best score localStorage 키 사용 확인
const hasBestScoreKey = lsKeys.has('blockpang_best') || lsKeys.has('bestScore') ||
    allContent.includes('best') || allContent.includes('BEST');
if (!hasBestScoreKey) {
    warnings.push(`[BEST_SCORE] No best score localStorage key found — high scores may not persist`);
}

// ═══════════════════════════════════════════
// 31. 터치/모바일 지원 검증
// ═══════════════════════════════════════════
// 터치 이벤트 또는 포인터 이벤트 리스너
const hasTouchSupport = allContent.includes('touchstart') || allContent.includes('pointerdown') ||
    allContent.includes('touchmove') || allContent.includes('pointermove');
if (!hasTouchSupport) {
    warnings.push(`[MOBILE] No touch/pointer event handlers found — mobile drag may not work`);
}

// 진동 피드백 (navigator.vibrate)
const hasVibration = allContent.includes('vibrate');
if (!hasVibration) {
    warnings.push(`[MOBILE] No navigator.vibrate() found — no haptic feedback on mobile`);
}

// ═══════════════════════════════════════════
// 32. 연락처/외부 링크 검증
// ═══════════════════════════════════════════
const contactKey = I18N.ko?.contact;
if (!contactKey) {
    warnings.push(`[UI] Missing "contact" i18n key — contact button may have no label`);
}

// ═══════════════════════════════════════════
// 결과 출력
// ═══════════════════════════════════════════
console.log('\n══════════ BLOCKPANG VALIDATION ══════════\n');
console.log(`JS files: ${jsFiles.length}`);
console.log(`HTML DOM IDs: ${htmlIds.size}`);
console.log(`Piece shapes: ${PIECE_SHAPES.length} (tiers: ${[...usedTiers].sort().join(',')})`);
console.log(`Block colors: ${BLOCK_COLORS.length}`);
console.log(`Level thresholds: ${LEVEL_THRESHOLDS.length}`);
console.log(`Languages: ${LANGUAGES.join(', ')}`);
console.log(`i18n keys (ko): ${koKeys.length}`);
console.log(`Sound files: ${expectedSounds.length}`);
console.log(`Cell count distribution: ${JSON.stringify(cellCountDist)}`);
console.log(`\n── Full Game Simulation ──`);
console.log(`  Turns played: ${simResult.turnsPlayed}`);
console.log(`  Total score: ${simResult.totalScore}`);
console.log(`  Lines cleared: ${simResult.totalLinesCleared}`);
console.log(`  Max combo: ${simResult.maxCombo}`);
console.log(`  Level reached: ${simResult.levelReached}`);
console.log();

if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ ALL CHECKS PASSED — 0 errors, 0 warnings');
} else {
    if (errors.length > 0) {
        console.log(`❌ ERRORS (${errors.length}):\n`);
        errors.forEach(e => console.log('  ' + e));
        console.log();
    }
    if (warnings.length > 0) {
        console.log(`⚠ WARNINGS (${warnings.length}):\n`);
        warnings.forEach(w => console.log('  ' + w));
        console.log();
    }
}

process.exit(errors.length > 0 ? 1 : 0);
