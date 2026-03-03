// Base design dimensions (minimum visible area)
// These are dynamically updated by main.js to match the screen aspect ratio
// via setGameDimensions(). ES6 live bindings propagate to all importers.
export let GAME_WIDTH = 1024;
export let GAME_HEIGHT = 768;
export const WORLD_SIZE = 3000;

// Adaptive UI scale: auto-calculated so smallest text (11px) ≥ 13 CSS pixels
export let UI_SCALE = 1.0;

export function setGameDimensions(w, h) {
    GAME_WIDTH = w;
    GAME_HEIGHT = h;

    // Calculate how many CSS pixels = 1 game unit
    const cssPerUnit = Math.min(window.innerWidth / w, window.innerHeight / h);
    const rawScale = 13 / (11 * cssPerUnit);
    UI_SCALE = Math.max(1.0, Math.min(rawScale, 3.0));
}

// Helper: scaled font size string
export function fs(basePx) {
    return `${Math.round(basePx * UI_SCALE)}px`;
}

// Helper: scaled numeric value (gentler than font scaling to prevent overflow/overlap)
export function uv(base) {
    const dimScale = 1 + (UI_SCALE - 1) * 0.4;
    return Math.round(base * dimScale);
}

export const COLORS = {
    SHADOW_PRIMARY: 0x7b2fff,
    SHADOW_DARK: 0x4a1a8a,
    SHADOW_GLOW: 0xb366ff,
    SHADOW_LIGHT: 0xd4aaff,
    PLAYER_BODY: 0x1a1a2e,
    PLAYER_HAIR: 0x2a2a3e,
    PLAYER_COAT: 0x16213e,
    PLAYER_COAT_S: 0x0f0f3f,
    HP_RED: 0xff3333,
    HP_BG: 0x333333,
    XP_PURPLE: 0x9b59b6,
    XP_BG: 0x2c2c3e,
    UI_BG: 0x1a1a2e,
    UI_BORDER: 0x4a1a8a,
    TEXT_WHITE: '#ffffff',
    TEXT_GOLD: '#ffd700',
    TEXT_PURPLE: '#b366ff',
    TEXT_RED: '#ff3333',
    GOBLIN: 0x4a7a3a,
    ORC: 0x6b4423,
    ICE_BEAR: 0xaaccee,
    ANT: 0x8b0000,
    BOSS_IGRIS: 0xcc0000,
    BOSS_TUSK: 0x5a3a1a,
    BOSS_BERU: 0x660033,
    BG_FLOOR: 0x111122,
    BG_FLOOR_LIGHT: 0x161630,
    XP_ORB: 0x66ccff,
    DAGGER: 0xccccdd,
    SLASH: 0x7b2fff,
};

export const RANKS = {
    E: { name: 'E', level: 1,  color: 0x888888, glowAlpha: 0,    label: 'E-Rank Hunter' },
    D: { name: 'D', level: 5,  color: 0x44aa44, glowAlpha: 0.1,  label: 'D-Rank Hunter' },
    C: { name: 'C', level: 10, color: 0x4488ff, glowAlpha: 0.2,  label: 'C-Rank Hunter' },
    B: { name: 'B', level: 15, color: 0xaa44ff, glowAlpha: 0.3,  label: 'B-Rank Hunter' },
    A: { name: 'A', level: 20, color: 0xff8800, glowAlpha: 0.4,  label: 'A-Rank Hunter' },
    S: { name: 'S', level: 25, color: 0xff2222, glowAlpha: 0.6,  label: 'S-Rank Shadow Monarch' },
};

export const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S'];

export const PLAYER_BASE_STATS = {
    hp: 100,
    maxHp: 100,
    attack: 24,
    defense: 5,
    speed: 160,
    critRate: 0.05,
    critDamage: 1.5,
    xpMultiplier: 1.0,
    cooldownReduction: 0,
    pickupRange: 60,
};

export const XP_TABLE = [
    0, 10, 25, 45, 70, 100, 140, 185, 240, 300,
    370, 450, 540, 640, 750, 880, 1020, 1180, 1360, 1560,
    1780, 2020, 2300, 2600, 2950, 3350, 3800, 4300, 4900, 5600,
];

export const ENEMY_TYPES = {
    // --- 초반 적 (0~3분) ---
    goblin: {
        name: '고블린',
        hp: 90, attack: 8, defense: 0, speed: 85, xp: 5,
        color: 0x4a7a3a, size: 28,
    },
    antSoldier: {
        name: '개미 병사',
        hp: 75, attack: 9, defense: 0, speed: 98, xp: 4,
        color: 0x8b0000, size: 24,
    },
    // --- 중반 적 (1~5분) ---
    orc: {
        name: '오크',
        hp: 225, attack: 18, defense: 2, speed: 64, xp: 15,
        color: 0x6b4423, size: 44,
    },
    iceBear: {
        name: '아이스 베어',
        hp: 165, attack: 12, defense: 1, speed: 64, xp: 10,
        color: 0xaaccee, size: 40,
    },
    // --- 후반 적 (5분~) ---
    stoneGolem: {
        name: '스톤 골렘',
        hp: 600, attack: 27, defense: 15, speed: 55, xp: 35,
        color: 0x666677, size: 60,
    },
    darkMage: {
        name: '다크 메이지',
        hp: 240, attack: 38, defense: 5, speed: 68, xp: 25,
        color: 0x3a1a5e, size: 36,
    },
    // --- 최후반 적 (8분~) ---
    ironKnight: {
        name: '아이언 나이트',
        hp: 450, attack: 33, defense: 20, speed: 60, xp: 40,
        color: 0x8888aa, size: 52,
    },
    demonWarrior: {
        name: '마족 전사',
        hp: 900, attack: 45, defense: 30, speed: 68, xp: 60,
        color: 0x440022, size: 56,
    },
};

export const BOSS_TYPES = {
    igris: {
        name: '이그리스',
        hp: 2500, attack: 38, defense: 10, speed: 94, xp: 500,
        color: 0xcc0000, size: 80,
        shadowType: 'melee',
        shadowColor: 0x220000,
    },
    tusk: {
        name: '터스크',
        hp: 4000, attack: 52, defense: 20, speed: 68, xp: 800,
        color: 0x5a3a1a, size: 100,
        shadowType: 'tank',
        shadowColor: 0x1a1000,
    },
    beru: {
        name: '베루',
        hp: 6000, attack: 60, defense: 15, speed: 102, xp: 1200,
        color: 0x660033, size: 90,
        shadowType: 'ranged',
        shadowColor: 0x110022,
    },
};

export const BOSS_SCHEDULE = [
    { time: 120, type: 'igris' },   // 2분
    { time: 420, type: 'tusk' },    // 7분
    { time: 780, type: 'beru' },    // 13분
    // 후반 보스 재등장 (강화 버전)
    { time: 1080, type: 'igris' },  // 18분
    { time: 1440, type: 'tusk' },   // 24분
    { time: 1800, type: 'beru' },   // 30분
];

export const WAVE_CONFIG = {
    baseSpawnInterval: 1500,
    minSpawnInterval: 200,
    spawnReductionPerMinute: 180,
    baseEnemiesPerSpawn: 2,
    extraEnemiesPerMinute: 1.5,
    maxEnemiesOnScreen: 150,
    difficultyMultiplierPerMinute: 0.15,
};

export const WEAPONS = {
    basicDagger: {
        name: '단검 공격',
        description: '단검으로 가까운 적을 빠르게 찌릅니다',
        type: 'melee',
        unlockLevel: 1,
        baseDamage: 55,
        baseCooldown: 650,
        baseCount: 1,
        levelBonuses: {
            2: { damage: 6 },
            3: { count: 1 },
            4: { damage: 8 },
            5: { cooldown: -50 },
            6: { count: 1 },
            7: { damage: 12 },
            8: { count: 1, damage: 10 },
        },
    },
    shadowDagger: {
        name: '단검 투척',
        description: '가장 가까운 적에게 그림자 단검을 투척합니다',
        type: 'projectile',
        unlockLevel: 3,
        baseDamage: 120,
        baseCooldown: 800,
        baseCount: 1,
        levelBonuses: {
            2: { damage: 6 },
            3: { count: 1 },
            4: { damage: 10 },
            5: { cooldown: -100 },
            6: { count: 1 },
            7: { damage: 16 },
            8: { count: 1, damage: 10 },
        },
    },
    shadowSlash: {
        name: '그림자 베기',
        description: '전방에 그림자 검기를 휘둘러 적을 벱니다',
        type: 'melee',
        unlockLevel: 5,
        baseDamage: 120,
        baseCooldown: 1500,
        baseCount: 1,
        levelBonuses: {
            2: { damage: 10 },
            3: { range: 20 },
            4: { damage: 16 },
            5: { cooldown: -150 },
            6: { count: 1 },
            7: { damage: 24 },
            8: { range: 30, damage: 20 },
        },
    },
    rulersAuthority: {
        name: '지배자의 권능',
        description: '텔레키네시스로 주변 적에게 범위 피해를 줍니다',
        type: 'area',
        unlockLevel: 8,
        baseDamage: 81,
        baseCooldown: 2500,
        baseCount: 1,
        levelBonuses: {
            2: { damage: 6 },
            3: { range: 40 },
            4: { damage: 9 },
            5: { cooldown: -300 },
            6: { range: 50 },
            7: { damage: 15 },
            8: { damage: 18, range: 60 },
        },
    },
    dragonFear: {
        name: '용의 공포',
        description: '공포의 오라로 주변 적의 이동속도를 감소시킵니다',
        type: 'aura',
        unlockLevel: 12,
        baseDamage: 36,
        baseCooldown: 3000,
        baseCount: 1,
        levelBonuses: {
            2: { damage: 3 },
            3: { range: 30 },
            4: { slow: 0.05 },
            5: { cooldown: -400 },
            6: { damage: 6, range: 30 },
            7: { slow: 0.1 },
            8: { damage: 9, range: 40 },
        },
    },
};

export const PASSIVES = {
    swiftness:  { name: '신속', description: '이동속도 +10%', stat: 'speed', bonus: 0.10, icon: 0x44ff44 },
    vitality:   { name: '체력 강화', description: '최대 HP +15%', stat: 'maxHp', bonus: 0.15, icon: 0xff4444 },
    strength:   { name: '힘 강화', description: '공격력 +12%', stat: 'attack', bonus: 0.12, icon: 0xff8844 },
    critMaster: { name: '치명타 달인', description: '치명타율 +5%', stat: 'critRate', bonus: 0.05, icon: 0xffff44 },
    scholar:    { name: '학습 능력', description: '경험치 +15%', stat: 'xpMultiplier', bonus: 0.15, icon: 0x44aaff },
    hastening:  { name: '쿨타임 감소', description: '스킬 쿨타임 -8%', stat: 'cooldownReduction', bonus: 0.08, icon: 0xaa44ff },
};
