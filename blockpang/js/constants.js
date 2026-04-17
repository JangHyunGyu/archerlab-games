// ─── Grid ───
const GRID_SIZE = 10;

// ─── UI Theme (warm, handcrafted casual-puzzle palette) ───
const THEME = {
    bg:          0xF5ECDA,   // page background: warm cream
    bgDeep:      0xEDE0C5,   // slightly deeper cream (gradient base)
    bgDim:       0xE3D3B4,   // board cell recess tone
    surface:     0xFBF5E8,   // card / panel surface
    surfaceAlt:  0xF0E5CE,   // nested panel / tray
    divider:     0xE0CFB0,   // divider lines
    inkStrong:   0x3A2F23,   // strong text (warm near-black)
    ink:         0x4E4132,   // primary text
    inkMuted:    0x8A7C68,   // secondary text
    inkFaint:    0xB9AA8E,   // hint / disabled

    accent:      0xE57A54,   // warm coral (primary CTA)
    accentDeep:  0xC85E3A,   // pressed state
    accentSoft:  0xF7C9B5,   // soft tint background

    secondary:   0x6FA89A,   // muted sage (secondary CTA)
    secondaryDp: 0x507F74,

    gold:        0xC9922C,   // warm honey gold (best / new record)
    goldSoft:    0xE8C98C,

    rose:        0xBF5A66,   // game over rose (not alarming red)
    leaf:        0x7A9A5A,   // level progress

    white:       0xFFFFFF,
    shadow:      0x2D2015,   // subtle warm shadow (used with low alpha)
};

// Font stacks — Gowun Dodum = friendly rounded display (KR), Pretendard = clean body
const FONT_DISPLAY = "'Gowun Dodum', 'Zen Maru Gothic', 'Pretendard Variable', 'Pretendard', 'Noto Sans KR', sans-serif";
const FONT_BODY    = "'Pretendard Variable', 'Pretendard', 'Noto Sans KR', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif";

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
