// ─── Grid ───
const GRID_SIZE = 10;

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
const PIECE_SHAPES = [
    // ── Singles & Lines ──
    { shape: [[1]], weight: 4 },
    { shape: [[1, 1]], weight: 7 },
    { shape: [[1, 1, 1]], weight: 10 },
    { shape: [[1, 1, 1, 1]], weight: 5 },
    { shape: [[1, 1, 1, 1, 1]], weight: 2 },
    { shape: [[1], [1]], weight: 7 },
    { shape: [[1], [1], [1]], weight: 10 },
    { shape: [[1], [1], [1], [1]], weight: 5 },
    { shape: [[1], [1], [1], [1], [1]], weight: 2 },

    // ── Squares ──
    { shape: [[1, 1], [1, 1]], weight: 8 },
    { shape: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], weight: 1 },

    // ── Small L (2×2 corners) ──
    { shape: [[1, 0], [1, 1]], weight: 7 },
    { shape: [[0, 1], [1, 1]], weight: 7 },
    { shape: [[1, 1], [1, 0]], weight: 7 },
    { shape: [[1, 1], [0, 1]], weight: 7 },

    // ── Big L (3×3 corners) ──
    { shape: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], weight: 3 },
    { shape: [[0, 0, 1], [0, 0, 1], [1, 1, 1]], weight: 3 },
    { shape: [[1, 1, 1], [1, 0, 0], [1, 0, 0]], weight: 3 },
    { shape: [[1, 1, 1], [0, 0, 1], [0, 0, 1]], weight: 3 },

    // ── T shapes ──
    { shape: [[1, 1, 1], [0, 1, 0]], weight: 4 },
    { shape: [[0, 1, 0], [1, 1, 1]], weight: 4 },
    { shape: [[1, 0], [1, 1], [1, 0]], weight: 4 },
    { shape: [[0, 1], [1, 1], [0, 1]], weight: 4 },

    // ── S / Z shapes ──
    { shape: [[1, 1, 0], [0, 1, 1]], weight: 4 },
    { shape: [[0, 1, 1], [1, 1, 0]], weight: 4 },
    { shape: [[1, 0], [1, 1], [0, 1]], weight: 4 },
    { shape: [[0, 1], [1, 1], [1, 0]], weight: 4 },

    // ── Cross ──
    { shape: [[0, 1, 0], [1, 1, 1], [0, 1, 0]], weight: 2 },
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
let currentLang = localStorage.getItem('blockpang_lang') || 'ko';

const I18N = {
    ko: {
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
    },
    en: {
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
    },
    ja: {
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
    },
};

function getText(key) {
    return I18N[currentLang]?.[key] || I18N['en'][key] || key;
}

function cycleLanguage() {
    const idx = LANGUAGES.indexOf(currentLang);
    currentLang = LANGUAGES[(idx + 1) % LANGUAGES.length];
    localStorage.setItem('blockpang_lang', currentLang);
    return currentLang;
}
