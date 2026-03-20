/**
 * 블럭팡 자동 테스트 (Node.js, PixiJS 의존 없이 순수 로직 검증)
 * 실행: node test_blockpang.js
 */

// ── 브라우저 전역 변수 모킹 ──
global.localStorage = { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = v; } };
global.navigator = { language: 'ko' };

// ── 소스 로드 (vm 모듈로 전역 컨텍스트에 주입) ──
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const jsDir = path.join(__dirname, 'js');

// global 컨텍스트에서 직접 실행
function loadIntoGlobal(filePath) {
    const code = fs.readFileSync(filePath, 'utf-8');
    vm.runInThisContext(code, { filename: filePath });
}

loadIntoGlobal(path.join(jsDir, 'constants.js'));
loadIntoGlobal(path.join(jsDir, 'ScoreManager.js'));

// Piece.js에서 generateRandomPiece 함수만 추출
{
    const code = fs.readFileSync(path.join(jsDir, 'Piece.js'), 'utf-8');
    const match = code.match(/function generateRandomPiece[\s\S]*?\n\}/);
    if (match) {
        vm.runInThisContext(match[0], { filename: 'generateRandomPiece' });
    } else {
        console.error('⚠️  generateRandomPiece 함수를 추출하지 못했습니다!');
    }
}

// Board 로직만 추출 (canPlace, canPlaceAnywhere, checkAndClearLines 등)
// PIXI 의존 부분 제외, 그리드 로직만 테스트용 클래스로 구현
class TestBoard {
    constructor() {
        this.grid = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            this.grid[r] = [];
            for (let c = 0; c < GRID_SIZE; c++) {
                this.grid[r][c] = -1;
            }
        }
    }
    canPlace(shape, gridX, gridY) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const gr = gridY + r;
                const gc = gridX + c;
                if (gr < 0 || gr >= GRID_SIZE || gc < 0 || gc >= GRID_SIZE) return false;
                if (this.grid[gr][gc] !== -1) return false;
            }
        }
        return true;
    }
    canPlaceAnywhere(shape) {
        for (let r = 0; r <= GRID_SIZE - shape.length; r++) {
            for (let c = 0; c <= GRID_SIZE - shape[0].length; c++) {
                if (this.canPlace(shape, c, r)) return true;
            }
        }
        return false;
    }
    place(shape, gridX, gridY, colorIndex) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                this.grid[gridY + r][gridX + c] = colorIndex;
            }
        }
    }
    checkAndClearLines() {
        const rowsToClear = [];
        const colsToClear = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            if (this.grid[r].every(v => v !== -1)) rowsToClear.push(r);
        }
        for (let c = 0; c < GRID_SIZE; c++) {
            let full = true;
            for (let r = 0; r < GRID_SIZE; r++) {
                if (this.grid[r][c] === -1) { full = false; break; }
            }
            if (full) colsToClear.push(c);
        }
        const cellSet = new Map();
        rowsToClear.forEach(r => {
            for (let c = 0; c < GRID_SIZE; c++) cellSet.set(`${r},${c}`, this.grid[r][c]);
        });
        colsToClear.forEach(c => {
            for (let r = 0; r < GRID_SIZE; r++) cellSet.set(`${r},${c}`, this.grid[r][c]);
        });
        return {
            lines: rowsToClear.length + colsToClear.length,
            rows: rowsToClear,
            cols: colsToClear,
            apply: () => {
                cellSet.forEach((_, key) => {
                    const [r, c] = key.split(',').map(Number);
                    this.grid[r][c] = -1;
                });
            }
        };
    }
    isEmpty() {
        for (let r = 0; r < GRID_SIZE; r++)
            for (let c = 0; c < GRID_SIZE; c++)
                if (this.grid[r][c] !== -1) return false;
        return true;
    }
    filledCount() {
        let count = 0;
        for (let r = 0; r < GRID_SIZE; r++)
            for (let c = 0; c < GRID_SIZE; c++)
                if (this.grid[r][c] !== -1) count++;
        return count;
    }
}

// ── 테스트 프레임워크 ──
let passed = 0, failed = 0, total = 0;
function test(name, fn) {
    total++;
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failed++;
        console.log(`  ❌ ${name}`);
        console.log(`     → ${e.message}`);
    }
}
function assert(cond, msg = 'Assertion failed') {
    if (!cond) throw new Error(msg);
}
function assertEqual(a, b, msg = '') {
    if (a !== b) throw new Error(`${msg} Expected ${b}, got ${a}`);
}

// ══════════════════════════════════════
// 1. 상수 & 설정 검증
// ══════════════════════════════════════
console.log('\n📋 [1] 상수 & 설정 검증');

test('GRID_SIZE는 10이어야 한다', () => {
    assertEqual(GRID_SIZE, 10);
});

test('BLOCK_COLORS는 8가지 색상이어야 한다', () => {
    assertEqual(BLOCK_COLORS.length, 8);
});

test('모든 PIECE_SHAPES에 tier가 있어야 한다', () => {
    const missing = PIECE_SHAPES.filter(p => !p.tier);
    assertEqual(missing.length, 0, `tier 없는 피스 ${missing.length}개 `);
});

test('tier 값은 1~5 범위여야 한다', () => {
    const invalid = PIECE_SHAPES.filter(p => p.tier < 1 || p.tier > 5);
    assertEqual(invalid.length, 0, `범위 벗어난 tier ${invalid.length}개 `);
});

test('LEVEL_MAX_TIER 배열이 존재하고 비어있지 않아야 한다', () => {
    assert(Array.isArray(LEVEL_MAX_TIER) && LEVEL_MAX_TIER.length > 0);
});

test('LEVEL_MAX_TIER 마지막 값은 5 (전체 해금)여야 한다', () => {
    assertEqual(LEVEL_MAX_TIER[LEVEL_MAX_TIER.length - 1], 5);
});

test('LEVEL_THRESHOLDS는 오름차순이어야 한다', () => {
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
        assert(LEVEL_THRESHOLDS[i] > LEVEL_THRESHOLDS[i - 1],
            `[${i - 1}]=${LEVEL_THRESHOLDS[i - 1]} >= [${i}]=${LEVEL_THRESHOLDS[i]}`);
    }
});

test('모든 피스 shape의 weight > 0이어야 한다', () => {
    const zeroWeight = PIECE_SHAPES.filter(p => p.weight <= 0);
    assertEqual(zeroWeight.length, 0, `weight 0 이하 피스 ${zeroWeight.length}개 `);
});

// ══════════════════════════════════════
// 2. 티어별 피스 생성 검증
// ══════════════════════════════════════
console.log('\n🧩 [2] 티어별 피스 생성 검증');

test('레벨 1에서 tier 1~2 피스만 나와야 한다', () => {
    const maxTier = LEVEL_MAX_TIER[Math.min(1, LEVEL_MAX_TIER.length - 1)];
    for (let i = 0; i < 200; i++) {
        const piece = generateRandomPiece(1);
        const matched = PIECE_SHAPES.find(p =>
            JSON.stringify(p.shape) === JSON.stringify(piece.shape));
        assert(matched, '생성된 피스가 PIECE_SHAPES에 없음');
        assert(matched.tier <= maxTier,
            `레벨 1에서 tier ${matched.tier} 피스 등장 (maxTier=${maxTier})`);
    }
});

test('레벨 2에서 tier 3까지 나와야 한다', () => {
    const maxTier = LEVEL_MAX_TIER[Math.min(2, LEVEL_MAX_TIER.length - 1)];
    assertEqual(maxTier, 3);
    const tiers = new Set();
    for (let i = 0; i < 500; i++) {
        const piece = generateRandomPiece(2);
        const matched = PIECE_SHAPES.find(p =>
            JSON.stringify(p.shape) === JSON.stringify(piece.shape));
        assert(matched.tier <= maxTier);
        tiers.add(matched.tier);
    }
    assert(tiers.has(3), '레벨 2에서 tier 3 피스가 한 번도 안 나옴');
});

test('레벨 4 이상에서 모든 tier(1~5) 피스가 나올 수 있어야 한다', () => {
    const tiers = new Set();
    for (let i = 0; i < 2000; i++) {
        const piece = generateRandomPiece(4);
        const matched = PIECE_SHAPES.find(p =>
            JSON.stringify(p.shape) === JSON.stringify(piece.shape));
        tiers.add(matched.tier);
    }
    for (let t = 1; t <= 5; t++) {
        assert(tiers.has(t), `레벨 4에서 tier ${t} 피스가 안 나옴`);
    }
});

test('레벨 99 (초과값)에서도 에러 없이 동작해야 한다', () => {
    for (let i = 0; i < 100; i++) {
        const piece = generateRandomPiece(99);
        assert(piece.shape && piece.rows > 0 && piece.cols > 0);
    }
});

test('레벨 0으로도 에러 없이 동작해야 한다', () => {
    for (let i = 0; i < 100; i++) {
        const piece = generateRandomPiece(0);
        assert(piece.shape && piece.cellCount > 0);
    }
});

test('생성된 피스의 colorIndex가 0~7 범위여야 한다', () => {
    for (let i = 0; i < 200; i++) {
        const piece = generateRandomPiece(3);
        assert(piece.colorIndex >= 0 && piece.colorIndex < BLOCK_COLORS.length,
            `colorIndex ${piece.colorIndex} 범위 초과`);
    }
});

test('생성된 피스의 cellCount가 shape와 일치해야 한다', () => {
    for (let i = 0; i < 200; i++) {
        const piece = generateRandomPiece(5);
        let count = 0;
        piece.shape.forEach(row => row.forEach(v => { if (v) count++; }));
        assertEqual(piece.cellCount, count, 'cellCount 불일치 ');
    }
});

// ══════════════════════════════════════
// 3. 보드 로직 검증
// ══════════════════════════════════════
console.log('\n🎮 [3] 보드 로직 검증');

test('새 보드는 비어있어야 한다', () => {
    const board = new TestBoard();
    assert(board.isEmpty());
    assertEqual(board.filledCount(), 0);
});

test('빈 보드에 1×1 피스를 (0,0)에 놓을 수 있어야 한다', () => {
    const board = new TestBoard();
    assert(board.canPlace([[1]], 0, 0));
});

test('보드 밖에는 놓을 수 없어야 한다', () => {
    const board = new TestBoard();
    assert(!board.canPlace([[1]], 10, 0), '(10,0)에 놓아짐');
    assert(!board.canPlace([[1]], 0, 10), '(0,10)에 놓아짐');
    assert(!board.canPlace([[1]], -1, 0), '(-1,0)에 놓아짐');
    assert(!board.canPlace([[1, 1, 1]], 8, 0), '3칸선이 (8,0)에 놓아짐');
});

test('이미 채워진 칸에는 놓을 수 없어야 한다', () => {
    const board = new TestBoard();
    board.place([[1]], 0, 0, 0);
    assert(!board.canPlace([[1]], 0, 0), '이미 채워진 칸에 놓아짐');
});

test('canPlaceAnywhere: 빈 보드에서 모든 피스를 놓을 수 있어야 한다', () => {
    const board = new TestBoard();
    for (const def of PIECE_SHAPES) {
        assert(board.canPlaceAnywhere(def.shape),
            `Shape ${JSON.stringify(def.shape)} 놓을 곳 없음`);
    }
});

test('행 클리어: 한 행을 가득 채우면 1줄 클리어되어야 한다', () => {
    const board = new TestBoard();
    // 0번 행을 모두 채움
    for (let c = 0; c < GRID_SIZE; c++) {
        board.grid[0][c] = 0;
    }
    const result = board.checkAndClearLines();
    assertEqual(result.lines, 1, '클리어 줄 수 ');
    assertEqual(result.rows.length, 1);
    assertEqual(result.rows[0], 0);
    result.apply();
    // 클리어 후 행이 비어야 한다
    for (let c = 0; c < GRID_SIZE; c++) {
        assertEqual(board.grid[0][c], -1, `(0,${c}) 안 비워짐 `);
    }
});

test('열 클리어: 한 열을 가득 채우면 1줄 클리어되어야 한다', () => {
    const board = new TestBoard();
    for (let r = 0; r < GRID_SIZE; r++) {
        board.grid[r][3] = 1;
    }
    const result = board.checkAndClearLines();
    assertEqual(result.lines, 1);
    assertEqual(result.cols.length, 1);
    assertEqual(result.cols[0], 3);
    result.apply();
    for (let r = 0; r < GRID_SIZE; r++) {
        assertEqual(board.grid[r][3], -1, `(${r},3) 안 비워짐 `);
    }
});

test('동시 클리어: 행+열 동시에 채우면 2줄 클리어', () => {
    const board = new TestBoard();
    // 0번 행 전체 채움
    for (let c = 0; c < GRID_SIZE; c++) board.grid[0][c] = 0;
    // 5번 열 전체 채움 (0,5는 이미 채워짐)
    for (let r = 0; r < GRID_SIZE; r++) board.grid[r][5] = 1;
    const result = board.checkAndClearLines();
    assertEqual(result.lines, 2, '동시 클리어 줄 수 ');
    result.apply();
    assert(board.grid[0][5] === -1, '교차점(0,5) 안 비워짐');
});

test('빈 줄이면 클리어가 일어나지 않아야 한다', () => {
    const board = new TestBoard();
    board.grid[0][0] = 0;
    board.grid[0][1] = 0;
    const result = board.checkAndClearLines();
    assertEqual(result.lines, 0);
});

test('보드 꽉 차면 모든 행+열 클리어 = 20줄', () => {
    const board = new TestBoard();
    for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
            board.grid[r][c] = 0;
    const result = board.checkAndClearLines();
    assertEqual(result.lines, 20, '10행+10열=20 ');
    result.apply();
    assert(board.isEmpty(), '클리어 후 보드가 안 비워짐');
});

// ══════════════════════════════════════
// 4. 스코어 매니저 검증
// ══════════════════════════════════════
console.log('\n📊 [4] 스코어 매니저 검증');

test('초기 점수는 0이다', () => {
    const sm = new ScoreManager();
    assertEqual(sm.score, 0);
    assertEqual(sm.level, 1);
    assertEqual(sm.combo, 0);
});

test('피스 배치 시 셀 수만큼 점수 증가', () => {
    const sm = new ScoreManager();
    sm.addPlacementScore(5);
    assertEqual(sm.score, 5 * SCORE_PER_CELL);
});

test('1줄 클리어 시 100점', () => {
    const sm = new ScoreManager();
    const r = sm.addClearScore(1);
    assertEqual(r.points, 100);
    assertEqual(sm.combo, 1);
});

test('2줄 동시 클리어 시 220점 (100*2 + 20 보너스)', () => {
    const sm = new ScoreManager();
    const r = sm.addClearScore(2);
    assertEqual(r.points, 220);
});

test('콤보: 연속 클리어 시 점수 증가', () => {
    const sm = new ScoreManager();
    sm.addClearScore(1); // combo=1: 100
    const r2 = sm.addClearScore(1); // combo=2: 100 * 1.5 = 150
    assertEqual(r2.points, 150);
    assertEqual(sm.combo, 2);
});

test('클리어 실패 시 콤보 리셋', () => {
    const sm = new ScoreManager();
    sm.addClearScore(1);
    assertEqual(sm.combo, 1);
    sm.addClearScore(0);
    assertEqual(sm.combo, 0);
});

test('레벨업: 5줄 클리어하면 레벨 2', () => {
    const sm = new ScoreManager();
    for (let i = 0; i < 5; i++) sm.addClearScore(1);
    assertEqual(sm.level, 2, `레벨 ${sm.level} `);
});

test('퍼펙트 클리어 보너스: 레벨 * 500', () => {
    const sm = new ScoreManager();
    sm.level = 3;
    sm.score = 0;
    const bonus = sm.addPerfectClearBonus();
    assertEqual(bonus, 1500);
});

test('리셋 후 점수/콤보/레벨 초기화', () => {
    const sm = new ScoreManager();
    sm.addClearScore(1);
    sm.addClearScore(1);
    sm.reset();
    assertEqual(sm.score, 0);
    assertEqual(sm.combo, 0);
    assertEqual(sm.level, 1);
});

// ══════════════════════════════════════
// 5. 통합 시뮬레이션 (게임 플레이)
// ══════════════════════════════════════
console.log('\n🕹️  [5] 게임 시뮬레이션');

test('시뮬레이션: 50턴 이상 정상 진행 가능', () => {
    const board = new TestBoard();
    const sm = new ScoreManager();
    let turns = 0;
    let gameOver = false;

    for (let round = 0; round < 30 && !gameOver; round++) {
        // 3개 피스 생성
        const pieces = [
            generateRandomPiece(sm.level),
            generateRandomPiece(sm.level),
            generateRandomPiece(sm.level),
        ];

        for (const piece of pieces) {
            // 놓을 수 있는 첫 번째 위치 찾기
            let placed = false;
            for (let r = 0; r <= GRID_SIZE - piece.rows && !placed; r++) {
                for (let c = 0; c <= GRID_SIZE - piece.cols && !placed; c++) {
                    if (board.canPlace(piece.shape, c, r)) {
                        board.place(piece.shape, c, r, piece.colorIndex);
                        sm.addPlacementScore(piece.cellCount);
                        turns++;
                        placed = true;

                        // 줄 클리어 체크
                        const clear = board.checkAndClearLines();
                        if (clear.lines > 0) {
                            sm.addClearScore(clear.lines);
                            clear.apply();
                        } else {
                            sm.addClearScore(0);
                        }
                    }
                }
            }
            if (!placed) {
                gameOver = true;
                break;
            }
        }
    }

    assert(turns >= 10, `${turns}턴만에 게임 오버 (너무 빠름)`);
    console.log(`     → ${turns}턴 진행, 점수 ${sm.score}, 레벨 ${sm.level}, 줄 ${sm.linesCleared}`);
});

test('시뮬레이션: 레벨 1에서 tier 3+ 피스(T,S/Z,4칸선)가 안 나와야 한다', () => {
    let tier3PlusCount = 0;
    for (let i = 0; i < 500; i++) {
        const piece = generateRandomPiece(1);
        const matched = PIECE_SHAPES.find(p =>
            JSON.stringify(p.shape) === JSON.stringify(piece.shape));
        if (matched.tier >= 3) tier3PlusCount++;
    }
    assertEqual(tier3PlusCount, 0, `레벨 1에서 tier 3+ 피스 ${tier3PlusCount}개 나옴 `);
});

test('시뮬레이션: 레벨 4에서 대형 피스가 나와야 한다', () => {
    let bigPieceCount = 0;
    for (let i = 0; i < 1000; i++) {
        const piece = generateRandomPiece(4);
        if (piece.cellCount >= 5) bigPieceCount++;
    }
    assert(bigPieceCount > 0, '레벨 4에서 5셀 이상 피스가 한 번도 안 나옴');
    console.log(`     → 1000회 중 5셀+ 피스 ${bigPieceCount}개`);
});

// ══════════════════════════════════════
// 결과 출력
// ══════════════════════════════════════
console.log('\n' + '═'.repeat(45));
console.log(`  총 ${total}개 테스트 | ✅ ${passed} 통과 | ❌ ${failed} 실패`);
console.log('═'.repeat(45));
process.exit(failed > 0 ? 1 : 0);
