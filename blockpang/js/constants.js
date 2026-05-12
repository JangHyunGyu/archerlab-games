// ─── Grid ───
const GRID_SIZE = 10;

// ─── UI Theme (neon crystal arcade palette) ───
const THEME = {
    bg:          0x07091E,
    bgDeep:      0x120C35,
    bgDim:       0x1B164A,
    surface:     0x101A3A,
    surfaceAlt:  0x172957,
    divider:     0x2DE8FF,
    inkStrong:   0xF7FCFF,
    ink:         0xCBEFFF,
    inkMuted:    0x8BC7E6,
    inkFaint:    0x526C91,

    accent:      0xFF3EA5,
    accentDeep:  0xC81D76,
    accentSoft:  0x53235C,

    secondary:   0x21E7FF,
    secondaryDp: 0x0A91BB,

    gold:        0xFFD66D,
    goldSoft:    0xFFE9A6,

    rose:        0xFF527A,
    leaf:        0x69F071,

    white:       0xFFFFFF,
    shadow:      0x00030A,
};

// Font stacks — Gowun Dodum = friendly rounded display (KR), Pretendard = clean body
const FONT_DISPLAY = "'Gowun Dodum', 'Zen Maru Gothic', 'Pretendard Variable', 'Pretendard', 'Noto Sans KR', sans-serif";
const FONT_BODY    = "'Pretendard Variable', 'Pretendard', 'Noto Sans KR', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif";

const BLOCKPANG_ASSET_MANIFEST = {
    arcadeBg: 'assets/ui/arcade-bg.webp',
    titleSplash: 'assets/ui/title-splash.webp',
    titleBackdropClean: 'assets/ui/title-backdrop-clean.webp',
    boardPanel: 'assets/ui/board-panel.webp',
    glassPanel: 'assets/ui/glass-panel.webp',
    glassPanelFill: 'assets/ui/glass-panel-fill.webp',
    crystalSheen: 'assets/ui/crystal-sheen.webp',
    effectSoftCircle: 'assets/ui/effect-soft-circle.webp',
    effectShard: 'assets/ui/effect-shard.webp',
    effectSparkle: 'assets/ui/effect-sparkle.webp',
    effectStar: 'assets/ui/effect-star.webp',
    effectRing: 'assets/ui/effect-ring.webp',
    effectRingAlt: 'assets/ui/effect-ring-alt.webp',
    effectSparkleAlt: 'assets/ui/effect-sparkle-alt.webp',
    effectShardAlt: 'assets/ui/effect-shard-alt.webp',
    effectDiamond: 'assets/ui/effect-diamond.webp',
    effectSoftBurst: 'assets/ui/effect-soft-burst.webp',
    vfxComboBurstSheet: 'assets/ui/vfx-combo-burst-sheet.webp',
    vfxLineClearSheet: 'assets/ui/vfx-line-clear-sheet.webp',
    vfxRewardNovaSheet: 'assets/ui/vfx-reward-nova-sheet.webp',
    iconSoundOn: 'assets/ui/icon-sound-on.webp',
    iconSoundOff: 'assets/ui/icon-sound-off.webp',
    iconHome: 'assets/ui/icon-home.webp',
    iconLanguage: 'assets/ui/icon-language.webp',
    iconPlay: 'assets/ui/icon-play.webp',
    iconContinue: 'assets/ui/icon-continue.webp',
    iconRank: 'assets/ui/icon-rank.webp',
    iconMail: 'assets/ui/icon-mail.webp',
    iconClose: 'assets/ui/icon-close.webp',
    iconCheck: 'assets/ui/icon-check.webp',
    iconSkip: 'assets/ui/icon-skip.webp',
    ghostValidCell: 'assets/ui/ghost-valid-cell.webp',
    ghostInvalidCell: 'assets/ui/ghost-invalid-cell.webp',
    blockTile0: 'assets/ui/block-tile-0-cyan.webp',
    blockTile1: 'assets/ui/block-tile-1-red.webp',
    blockTile2: 'assets/ui/block-tile-2-green.webp',
    blockTile3: 'assets/ui/block-tile-3-gold.webp',
    blockTile4: 'assets/ui/block-tile-4-violet.webp',
    blockTile5: 'assets/ui/block-tile-5-orange.webp',
    blockTile6: 'assets/ui/block-tile-6-blue.webp',
    blockTile7: 'assets/ui/block-tile-7-pink.webp',
};

const BLOCKPANG_PNG_FALLBACKS = {
    arcadeBg: 'assets/ui/arcade-bg.png',
    titleSplash: 'assets/ui/title-splash.png',
    titleBackdropClean: 'assets/ui/title-backdrop-clean.png',
    boardPanel: 'assets/ui/board-panel.png',
    glassPanel: 'assets/ui/glass-panel.png',
    glassPanelFill: 'assets/ui/glass-panel-fill.png',
    crystalSheen: 'assets/ui/crystal-sheen.png',
    effectSoftCircle: 'assets/ui/effect-soft-circle.png',
    effectShard: 'assets/ui/effect-shard.png',
    effectSparkle: 'assets/ui/effect-sparkle.png',
    effectStar: 'assets/ui/effect-star.png',
    effectRing: 'assets/ui/effect-ring.png',
    effectRingAlt: 'assets/ui/effect-ring-alt.png',
    effectSparkleAlt: 'assets/ui/effect-sparkle-alt.png',
    effectShardAlt: 'assets/ui/effect-shard-alt.png',
    effectDiamond: 'assets/ui/effect-diamond.png',
    effectSoftBurst: 'assets/ui/effect-soft-burst.png',
    vfxComboBurstSheet: 'assets/ui/vfx-combo-burst-sheet.png',
    vfxLineClearSheet: 'assets/ui/vfx-line-clear-sheet.png',
    vfxRewardNovaSheet: 'assets/ui/vfx-reward-nova-sheet.png',
    iconSoundOn: 'assets/ui/icon-sound-on.png',
    iconSoundOff: 'assets/ui/icon-sound-off.png',
    iconHome: 'assets/ui/icon-home.png',
    iconLanguage: 'assets/ui/icon-language.png',
    iconPlay: 'assets/ui/icon-play.png',
    iconContinue: 'assets/ui/icon-continue.png',
    iconRank: 'assets/ui/icon-rank.png',
    iconMail: 'assets/ui/icon-mail.png',
    iconClose: 'assets/ui/icon-close.png',
    iconCheck: 'assets/ui/icon-check.png',
    iconSkip: 'assets/ui/icon-skip.png',
    ghostValidCell: 'assets/ui/ghost-valid-cell.png',
    ghostInvalidCell: 'assets/ui/ghost-invalid-cell.png',
    blockTile0: 'assets/ui/block-tile-0-cyan.png',
    blockTile1: 'assets/ui/block-tile-1-red.png',
    blockTile2: 'assets/ui/block-tile-2-green.png',
    blockTile3: 'assets/ui/block-tile-3-gold.png',
    blockTile4: 'assets/ui/block-tile-4-violet.png',
    blockTile5: 'assets/ui/block-tile-5-orange.png',
    blockTile6: 'assets/ui/block-tile-6-blue.png',
    blockTile7: 'assets/ui/block-tile-7-pink.png',
};

const BLOCKPANG_PNG_TILE_FALLBACKS = BLOCKPANG_PNG_FALLBACKS;

function getBlockpangAssetManifest(usePngFallback = false) {
    return usePngFallback
        ? { ...BLOCKPANG_ASSET_MANIFEST, ...BLOCKPANG_PNG_FALLBACKS }
        : BLOCKPANG_ASSET_MANIFEST;
}

function getBlockpangTexture(key) {
    if (typeof window === 'undefined') return null;
    return window.BLOCKPANG_ASSETS && window.BLOCKPANG_ASSETS[key]
        ? window.BLOCKPANG_ASSETS[key]
        : null;
}

function getBlockpangBoardPanelExt(cellSize, screenW, screenH) {
    const isPortrait = Number(screenH) > Number(screenW) * 1.12;
    return isPortrait
        ? Math.max(18, Math.round(cellSize * 0.62))
        : Math.max(28, Math.round(cellSize * 1.1));
}

if (typeof window !== 'undefined') {
    window.BLOCKPANG_ASSET_MANIFEST = BLOCKPANG_ASSET_MANIFEST;
    window.BLOCKPANG_PNG_FALLBACKS = BLOCKPANG_PNG_FALLBACKS;
    window.BLOCKPANG_PNG_TILE_FALLBACKS = BLOCKPANG_PNG_TILE_FALLBACKS;
    window.getBlockpangAssetManifest = getBlockpangAssetManifest;
    window.getBlockpangTexture = getBlockpangTexture;
    window.getBlockpangBoardPanelExt = getBlockpangBoardPanelExt;
}

// ─── Block Colors (premium neon palette with richer gradients) ───
const BLOCK_COLORS = [
    { main: 0x00E5FF, light: 0x99F5FF, dark: 0x006B7A, glow: 0x00E5FF, particle: 0x66F0FF },   // Cyan
    { main: 0xFF1744, light: 0xFF8A9E, dark: 0x8B0A25, glow: 0xFF1744, particle: 0xFF6680 },   // Red
    { main: 0x76FF03, light: 0xBBFF77, dark: 0x3D8A02, glow: 0x76FF03, particle: 0xA5FF55 },   // Green
    { main: 0xFFD600, light: 0xFFEB77, dark: 0x8A7400, glow: 0xFFD600, particle: 0xFFE34D },   // Yellow
    { main: 0xD500F9, light: 0xE680FC, dark: 0x6E0082, glow: 0xD500F9, particle: 0xE14DFC },   // Purple
    { main: 0xFF6D00, light: 0xFFB877, dark: 0x8A3B00, glow: 0xFF6D00, particle: 0xFF9640 },   // Orange
    { main: 0x2979FF, light: 0x88B4FF, dark: 0x15408A, glow: 0x2979FF, particle: 0x5C99FF },   // Blue
    { main: 0xFF4081, light: 0xFF8AB3, dark: 0x8A2246, glow: 0xFF4081, particle: 0xFF6699 },   // Pink
];

// ─── Piece Shape Definitions ───
// tier: 난이도 단계. 낮을수록 초반부터 등장 (1=가장 쉬움)
//   tier 1: 레벨 1+ (1칸, 2칸 선, 2×2 정사각형)
//   tier 2: 레벨 2+ (3칸 선, Small L)
//   tier 3: 레벨 3+ (4칸 선, T, S/Z)
//   tier 4: 레벨 5+ (Big L, 5칸 선)
//   tier 5: 레벨 7+ (3×3 정사각형, 십자)
const PIECE_SHAPES = [
    // ── Singles & Short Lines ── (tier 1)
    { shape: [[1]], weight: 4, tier: 1 },
    { shape: [[1, 1]], weight: 7, tier: 1 },
    { shape: [[1], [1]], weight: 7, tier: 1 },

    // ── 3-cell Lines & Square ── (tier 2)
    { shape: [[1, 1, 1]], weight: 10, tier: 2 },
    { shape: [[1], [1], [1]], weight: 10, tier: 2 },
    { shape: [[1, 1], [1, 1]], weight: 8, tier: 2 },

    // ── Small L (2×2 corners) ── (tier 2)
    { shape: [[1, 0], [1, 1]], weight: 7, tier: 2 },
    { shape: [[0, 1], [1, 1]], weight: 7, tier: 2 },
    { shape: [[1, 1], [1, 0]], weight: 7, tier: 2 },
    { shape: [[1, 1], [0, 1]], weight: 7, tier: 2 },

    // ── 4-cell Lines ── (tier 3)
    { shape: [[1, 1, 1, 1]], weight: 5, tier: 3 },
    { shape: [[1], [1], [1], [1]], weight: 5, tier: 3 },

    // ── Medium L (J/L tetromino) ── (tier 3)
    { shape: [[1, 1, 1], [1, 0, 0]], weight: 4, tier: 3 },   // ㄱ
    { shape: [[1, 1, 1], [0, 0, 1]], weight: 4, tier: 3 },   // ㄱ 좌우반전
    { shape: [[1, 0, 0], [1, 1, 1]], weight: 4, tier: 3 },   // ㄱ 상하반전
    { shape: [[0, 0, 1], [1, 1, 1]], weight: 4, tier: 3 },   // ㄱ 상하+좌우반전
    { shape: [[1, 1], [1, 0], [1, 0]], weight: 4, tier: 3 },  // 세로 ㄱ
    { shape: [[1, 1], [0, 1], [0, 1]], weight: 4, tier: 3 },  // 세로 좌우반전
    { shape: [[1, 0], [1, 0], [1, 1]], weight: 4, tier: 3 },  // 세로 상하반전
    { shape: [[0, 1], [0, 1], [1, 1]], weight: 4, tier: 3 },  // 세로 상하+좌우반전

    // ── T shapes ── (tier 3)
    { shape: [[1, 1, 1], [0, 1, 0]], weight: 4, tier: 3 },
    { shape: [[0, 1, 0], [1, 1, 1]], weight: 4, tier: 3 },
    { shape: [[1, 0], [1, 1], [1, 0]], weight: 4, tier: 3 },
    { shape: [[0, 1], [1, 1], [0, 1]], weight: 4, tier: 3 },

    // ── S / Z shapes ── (tier 3)
    { shape: [[1, 1, 0], [0, 1, 1]], weight: 4, tier: 3 },
    { shape: [[0, 1, 1], [1, 1, 0]], weight: 4, tier: 3 },
    { shape: [[1, 0], [1, 1], [0, 1]], weight: 4, tier: 3 },
    { shape: [[0, 1], [1, 1], [1, 0]], weight: 4, tier: 3 },

    // ── Big L (3×3 corners) ── (tier 4)
    { shape: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], weight: 3, tier: 4 },
    { shape: [[0, 0, 1], [0, 0, 1], [1, 1, 1]], weight: 3, tier: 4 },
    { shape: [[1, 1, 1], [1, 0, 0], [1, 0, 0]], weight: 3, tier: 4 },
    { shape: [[1, 1, 1], [0, 0, 1], [0, 0, 1]], weight: 3, tier: 4 },

    // ── 5-cell Lines ── (tier 4)
    { shape: [[1, 1, 1, 1, 1]], weight: 2, tier: 4 },
    { shape: [[1], [1], [1], [1], [1]], weight: 2, tier: 4 },

    // ── 2×3 / 3×2 Rectangles ── (tier 4)
    { shape: [[1, 1, 1], [1, 1, 1]], weight: 3, tier: 4 },
    { shape: [[1, 1], [1, 1], [1, 1]], weight: 3, tier: 4 },

    // ── 3×3 Square & Cross ── (tier 5)
    { shape: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], weight: 1, tier: 5 },
    { shape: [[0, 1, 0], [1, 1, 1], [0, 1, 0]], weight: 2, tier: 5 },
];

// 레벨 → 허용 최대 tier 매핑
const LEVEL_MAX_TIER = [
    /* Lv 0 */ 2,
    /* Lv 1 */ 2,
    /* Lv 2 */ 3,
    /* Lv 3 */ 4,
    /* Lv 4 */ 5,  // 레벨 4 이후 전체 해금
];

// ─── Scoring ───
const SCORE_PER_CELL = 1;
const SCORE_PER_LINE = 100;
const SCORE_MULTI_LINE_BONUS = 50;
const COMBO_MULTIPLIER = 0.5;
const PERFECT_CLEAR_BONUS = 500;

// ─── Level System ───
const LEVEL_THRESHOLDS = [0, 5, 12, 22, 35, 52, 73, 100, 133, 172, 220, 275, 340, 415, 500, 600, 720, 860, 1020, 1200];

// ─── Easing Functions ───
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
function easeOutBounce(t) {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
}
function easeOutElastic(t) {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
}
function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ─── Internationalization ───
const LANGUAGES = ['ko', 'en', 'ja'];
const _browserLang = (navigator.language || '').slice(0, 2);
let currentLang = localStorage.getItem('blockpang_lang')
    || (LANGUAGES.includes(_browserLang) ? _browserLang : 'ko');

// ─── Game API Config ───
const GAME_API_URL = 'https://game-api.yama5993.workers.dev';
const GAME_ID_BLOCKPANG = 'blockpang';

const I18N = {
    ko: {
        gameTitle: '블럭팡',
        gameStart: '게임 시작',
        language: '다국어',
        contact: '연락하기',
        gameOver: 'GAME OVER',
        playAgain: '다시 하기',
        backToTitle: '타이틀로',
        score: 'SCORE',
        best: 'BEST',
        newRecord: 'NEW RECORD!',
        level: 'LEVEL',
        lines: 'LINES',
        langLabel: 'KO',
        blockPuzzle: 'BLOCK PUZZLE',
        hallOfFame: '명예의 전당',
        ranking: '랭킹',
        noRecords: '기록이 없습니다',
        close: '닫기',
        enterName: '이름을 입력하세요',
        submit: '등록',
        skip: '건너뛰기',
        nameInputTitle: '명예의 전당 등록',
        rankSubmitted: '등록 완료!',
        yourRank: '순위',
        loading: '로딩 중...',
        continueGame: '이어하기',
    },
    en: {
        gameTitle: 'Blockpang',
        gameStart: 'GAME START',
        language: 'Language',
        contact: 'Contact',
        gameOver: 'GAME OVER',
        playAgain: 'PLAY AGAIN',
        backToTitle: 'TITLE',
        score: 'SCORE',
        best: 'BEST',
        newRecord: 'NEW RECORD!',
        level: 'LEVEL',
        lines: 'LINES',
        langLabel: 'EN',
        blockPuzzle: 'BLOCK PUZZLE',
        hallOfFame: 'HALL OF FAME',
        ranking: 'RANKING',
        noRecords: 'No records yet',
        close: 'CLOSE',
        enterName: 'Enter your name',
        submit: 'SUBMIT',
        skip: 'SKIP',
        nameInputTitle: 'HALL OF FAME',
        rankSubmitted: 'Submitted!',
        yourRank: 'Rank',
        loading: 'Loading...',
        continueGame: 'CONTINUE',
    },
    ja: {
        gameTitle: 'ブロックパン',
        gameStart: 'ゲームスタート',
        language: '多言語',
        contact: 'お問い合わせ',
        gameOver: 'GAME OVER',
        playAgain: 'もう一度',
        backToTitle: 'タイトルへ',
        score: 'SCORE',
        best: 'BEST',
        newRecord: 'NEW RECORD!',
        level: 'LEVEL',
        lines: 'LINES',
        langLabel: 'JA',
        blockPuzzle: 'ブロックパズル',
        hallOfFame: '殿堂入り',
        ranking: 'ランキング',
        noRecords: '記録がありません',
        close: '閉じる',
        enterName: '名前を入力',
        submit: '登録',
        skip: 'スキップ',
        nameInputTitle: '殿堂入り',
        rankSubmitted: '登録完了！',
        yourRank: '順位',
        loading: '読み込み中...',
        continueGame: '続きから',
    },
};

function getText(key) {
    return I18N[currentLang]?.[key] || I18N['en'][key] || key;
}

const LANG_LABELS = { ko: '한국어', en: 'English', ja: '日本語' };

function setLanguage(code) {
    currentLang = code;
    localStorage.setItem('blockpang_lang', code);
}

function cycleLanguage() {
    const idx = LANGUAGES.indexOf(currentLang);
    currentLang = LANGUAGES[(idx + 1) % LANGUAGES.length];
    localStorage.setItem('blockpang_lang', currentLang);
    return currentLang;
}
