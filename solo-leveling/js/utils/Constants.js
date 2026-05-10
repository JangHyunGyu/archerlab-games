// Base design dimensions (minimum visible area)
// These are dynamically updated by main.js to match the screen aspect ratio
// via setGameDimensions(). ES6 live bindings propagate to all importers.
export let GAME_WIDTH = 1024;
export let GAME_HEIGHT = 768;
export const WORLD_SIZE = 3000;

// Adaptive UI scale: auto-calculated so smallest text (11px) ≥ 13 CSS pixels
export let UI_SCALE = 1.0;

export function setGameDimensions(w, h, viewportW = window.innerWidth, viewportH = window.innerHeight) {
    GAME_WIDTH = w;
    GAME_HEIGHT = h;

    // Calculate how many CSS pixels = 1 game unit
    const cssPerUnit = Math.min(viewportW / w, viewportH / h);
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

export function padText(textObj, top = 2, bottom = 2, left = 0, right = 0) {
    if (textObj && typeof textObj.setPadding === 'function') {
        textObj.setPadding(left, top, right, bottom);
    }
    return textObj;
}

export function fitText(textObj, maxW, maxH = 0, minScale = 0.62) {
    if (!textObj) return 1;

    const width = Math.max(textObj.width || 1, 1);
    const height = Math.max(textObj.height || 1, 1);
    let scale = 1;

    if (maxW > 0) scale = Math.min(scale, maxW / width);
    if (maxH > 0) scale = Math.min(scale, maxH / height);

    scale = Math.max(minScale, Math.min(1, scale));
    textObj.setScale(scale);
    return scale;
}

// ── System UI palette (Solo Leveling "The System" aesthetic) ──
export const SYSTEM = {
    BG_DEEP: 0x05070d,
    BG_PANEL: 0x080c16,
    BG_PANEL_HI: 0x0f1626,
    BORDER: 0x4dd2ff,
    BORDER_DIM: 0x1f5c8f,
    BORDER_WARN: 0xff3344,
    BORDER_GOLD: 0xe8b64a,
    TEXT_BRIGHT: '#d9f4ff',
    TEXT_CYAN: '#4dd2ff',
    TEXT_CYAN_DIM: '#3a8bb8',
    TEXT_MUTED: '#5a6c7a',
    TEXT_RED: '#ff5a5a',
    TEXT_GOLD: '#e8b64a',
    SCAN_LINE: 0x0e2033,
};

export const UI_FONT_MONO = '"Courier New", Consolas, Menlo, monospace';
export const UI_FONT_KR = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

// Draw an angular-cut panel (System aesthetic). Corners are chamfered instead of rounded.
export function drawSystemPanel(g, x, y, w, h, opts = {}) {
    const {
        cut = 8,
        fill = 0x080c16,
        fillAlpha = 0.85,
        border = 0x4dd2ff,
        borderAlpha = 1,
        borderWidth = 1,
        cutCorners = [true, true, true, true], // [TL, TR, BR, BL]
    } = opts;
    const [ctl, ctr, cbr, cbl] = cutCorners.map(c => c ? cut : 0);
    g.fillStyle(fill, fillAlpha);
    g.lineStyle(borderWidth, border, borderAlpha);
    g.beginPath();
    g.moveTo(x + ctl, y);
    g.lineTo(x + w - ctr, y);
    if (ctr) g.lineTo(x + w, y + ctr); else g.lineTo(x + w, y);
    g.lineTo(x + w, y + h - cbr);
    if (cbr) g.lineTo(x + w - cbr, y + h); else g.lineTo(x + w, y + h);
    g.lineTo(x + cbl, y + h);
    if (cbl) g.lineTo(x, y + h - cbl); else g.lineTo(x, y + h);
    g.lineTo(x, y + ctl);
    if (ctl) g.lineTo(x + ctl, y);
    g.closePath();
    g.fillPath();
    g.strokePath();
}

// Corner brackets (tactical/HUD frame) — 4 L-shaped corners only.
export function drawCornerBrackets(g, x, y, w, h, opts = {}) {
    const {
        len = 10,
        color = 0x4dd2ff,
        alpha = 1,
        lineWidth = 2,
    } = opts;
    g.lineStyle(lineWidth, color, alpha);
    g.beginPath(); g.moveTo(x, y + len); g.lineTo(x, y); g.lineTo(x + len, y); g.strokePath();
    g.beginPath(); g.moveTo(x + w - len, y); g.lineTo(x + w, y); g.lineTo(x + w, y + len); g.strokePath();
    g.beginPath(); g.moveTo(x + w, y + h - len); g.lineTo(x + w, y + h); g.lineTo(x + w - len, y + h); g.strokePath();
    g.beginPath(); g.moveTo(x + len, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - len); g.strokePath();
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
    D: { name: 'D', level: 6,  color: 0x44aa44, glowAlpha: 0.1,  label: 'D-Rank Hunter' },
    C: { name: 'C', level: 12, color: 0x4488ff, glowAlpha: 0.2,  label: 'C-Rank Hunter' },
    B: { name: 'B', level: 18, color: 0xaa44ff, glowAlpha: 0.3,  label: 'B-Rank Hunter' },
    A: { name: 'A', level: 24, color: 0xff8800, glowAlpha: 0.4,  label: 'A-Rank Hunter' },
    S: { name: 'S', level: 30, color: 0xff2222, glowAlpha: 0.6,  label: 'S-Rank Shadow Monarch' },
};

export const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S'];

export const PLAYER_BASE_STATS = {
    hp: 150,
    maxHp: 150,
    attack: 24,
    speed: 160,
    critRate: 0.05,
    critDamage: 2.0,
    xpMultiplier: 1.0,
    cooldownReduction: 0,
    pickupRange: 100,
};

export const MAX_COOLDOWN_REDUCTION = 0.55;

export const XP_TABLE = [
    0, 25, 55, 90, 130, 175, 230, 290, 360, 440,
    530, 630, 680, 820, 980, 1160, 1360, 1580, 1820, 2100,
    2420, 2780, 3200, 3680, 4200, 4800, 5500, 6300, 7200, 8200,
];

export const ENEMY_TYPES = {
    // --- 초반 적 (0~3분) ---
    goblin: {
        name: '고블린',
        hp: 90, attack: 8, speed: 85, xp: 5,
        color: 0x4a7a3a, size: 32,
    },
    antSoldier: {
        name: '개미 병사',
        hp: 75, attack: 9, speed: 98, xp: 6,
        color: 0x8b0000, size: 30,
    },
    // --- 중반 적 (1~5분) ---
    orc: {
        name: '오크',
        hp: 350, attack: 18, speed: 64, xp: 15,
        color: 0x6b4423, size: 50,
    },
    iceBear: {
        name: '아이스 베어',
        hp: 400, attack: 15, speed: 55, xp: 12,
        color: 0xaaccee, size: 48,
    },
    // --- 후반 적 (5분~) ---
    stoneGolem: {
        name: '스톤 골렘',
        hp: 900, attack: 22, speed: 55, xp: 45,
        color: 0x666677, size: 66,
    },
    darkMage: {
        name: '다크 메이지',
        hp: 450, attack: 28, speed: 68, xp: 30,
        color: 0x3a1a5e, size: 44,
    },
    // --- 최후반 적 (8분~) ---
    ironKnight: {
        name: '아이언 나이트',
        hp: 1800, attack: 30, speed: 60, xp: 55,
        color: 0x8888aa, size: 56,
    },
    demonWarrior: {
        name: '마족 전사',
        hp: 3000, attack: 34, speed: 68, xp: 80,
        color: 0x440022, size: 62,
    },
};

export const BOSS_TYPES = {
    igris: {
        name: '이그리스',
        hp: 24000, attack: 38, speed: 94, xp: 500,
        color: 0xcc0000, size: 80,
        shadowType: 'melee',
        shadowColor: 0x220000,
    },
    tusk: {
        name: '터스크',
        hp: 96000, attack: 52, speed: 68, xp: 800,
        color: 0x5a3a1a, size: 100,
        shadowType: 'tank',
        shadowColor: 0x1a1000,
    },
    beru: {
        name: '베루',
        hp: 135000, attack: 60, speed: 102, xp: 1200,
        color: 0x660033, size: 90,
        shadowType: 'ranged',
        shadowColor: 0x110022,
    },
};

export const BOSS_SCHEDULE = [
    { time: 120, type: 'igris', hp: 16800 },      // 2분
    { time: 420, type: 'tusk', hp: 96000 },       // 7분
    { time: 780, type: 'beru', hp: 225000 },      // 13분
    // 후반 보스 재등장 (강화 버전)
    { time: 1080, type: 'igris', hp: 440000, atkMult: 1.5 },  // 18분
    { time: 1440, type: 'tusk', hp: 470000, atkMult: 1.2 },   // 24분
    { time: 1800, type: 'beru', hp: 560000, atkMult: 1.2 },   // 30분
];

export const WAVE_CONFIG = {
    baseSpawnInterval: 1250,
    minSpawnInterval: 280,
    spawnReductionPerMinute: 80,
    baseEnemiesPerSpawn: 3,
    extraEnemiesPerMinute: 1.0,
    maxEnemiesOnScreen: 110,
    difficultyMultiplierPerMinute: 0.15,
};

export const WEAPONS = {
    basicDagger: {
        name: '단검 공격',
        description: '단검으로 가까운 적을 빠르게 찌릅니다',
        type: 'melee',
        soundKey: 'shadowMonarchBasicDagger',
        unlockLevel: 1,
        baseDamage: 55,
        baseCooldown: 650,
        baseCount: 1,
        attackRange: 205,
        hitAngle: 0.6,
        maxHits: 2,
        levelBonuses: {
            2: { damage: 8 },
            3: { damage: 10 },
            4: { damage: 12 },
            5: { damage: 12 },
            6: { cooldown: -50, count: 1 },
            7: { damage: 14 },
            8: { damage: 14 },
            9: { cooldown: -50, damage: 12 },
            10: { count: 1, damage: 16 },
        },
    },
    shadowDagger: {
        name: '단검 투척',
        description: '가장 가까운 적에게 그림자 단검을 빠르게 투척합니다',
        type: 'projectile',
        soundKey: 'shadowMonarchShadowDagger',
        unlockLevel: 5,
        baseDamage: 135,
        baseCooldown: 1200,
        baseCount: 1,
        projectileRange: 1500,
        maxPierces: 4,
        minHitRadius: 24,
        levelBonuses: {
            2: { damage: 10 },
            3: { damage: 12 },
            4: { count: 1, damage: 12 },
            5: { cooldown: -25 },
            6: { damage: 14 },
            7: { cooldown: -25, damage: 14 },
            8: { damage: 16 },
            9: { count: 1, damage: 16 },
            10: { damage: 18, cooldown: -35 },
        },
    },
    shadowSlash: {
        name: '그림자 베기',
        description: '전방에 그림자 검기를 휘둘러 적을 벱니다',
        type: 'melee',
        soundKey: 'shadowMonarchShadowSlash',
        unlockLevel: 10,
        baseDamage: 120,
        baseCooldown: 1500,
        baseCount: 1,
        slashRange: 350,
        slashArc: 0.8,
        levelBonuses: {
            2: { damage: 12 },
            3: { range: 15 },
            4: { count: 1, damage: 15 },
            5: { cooldown: -100 },
            6: { damage: 18 },
            7: { range: 20 },
            8: { count: 1, damage: 20 },
            9: { cooldown: -100, damage: 22 },
            10: { damage: 30, range: 30 },
        },
    },
    rulersAuthority: {
        name: '지배자의 권능',
        description: '텔레키네시스로 주변 적에게 범위 피해를 줍니다',
        type: 'area',
        soundKey: 'shadowMonarchRulersAuthority',
        unlockLevel: 15,
        baseDamage: 150,
        baseCooldown: 2500,
        baseCount: 1,
        blastRange: 160,
        levelBonuses: {
            2: { damage: 12 },
            3: { range: 25 },
            4: { damage: 15 },
            5: { cooldown: -200 },
            6: { range: 35, damage: 15 },
            7: { damage: 18 },
            8: { range: 45 },
            9: { cooldown: -200, damage: 20 },
            10: { damage: 30, range: 60 },
        },
    },
    dragonFear: {
        name: '용의 공포',
        description: '공포의 오라로 주변 적의 이동속도를 감소시킵니다',
        type: 'aura',
        soundKey: 'shadowMonarchDragonFear',
        unlockLevel: 20,
        baseDamage: 70,
        baseCooldown: 2500,
        baseCount: 1,
        auraRange: 230,
        slowMultiplier: 0.4,
        auraDuration: 2000,
        levelBonuses: {
            2: { damage: 6 },
            3: { range: 20 },
            4: { slow: 0.03 },
            5: { cooldown: -200 },
            6: { damage: 10, range: 20 },
            7: { slow: 0.05 },
            8: { damage: 12, range: 25 },
            9: { cooldown: -200, slow: 0.05 },
            10: { damage: 18, range: 50, slow: 0.07 },
        },
    },
};

function cloneWeapon(baseKey, key, opts) {
    const base = WEAPONS[baseKey];
    return {
        ...base,
        ...opts,
        key,
        baseWeaponKey: opts.baseWeaponKey || baseKey,
        classKey: opts.classKey || baseKey,
        levelBonuses: { ...base.levelBonuses, ...(opts.levelBonuses || {}) },
    };
}

Object.assign(WEAPONS, {
    lightPierce: cloneWeapon('basicDagger', 'lightPierce', {
        name: '빛가름 찌르기',
        description: '가까운 적을 광휘의 검끝으로 빠르게 찌릅니다.',
        attackStyle: 'swordSlash',
        basicAttackEffectKey: 'light_sword_slash',
        imageOnlyVfx: true,
        soundKey: 'lightSwordSlash',
        attackRange: 180,
        targetRangeBonus: 25,
        hitRangeBonus: 18,
        hitAngle: 0.78,
        maxHits: 3,
        effectKey: 'light_pierce',
        effectColor: 0xffd86a,
        effectGlowColor: 0xffffff,
        effectDarkColor: 0x7a5d16,
        effectScale: 0.42,
    }),
    lightLance: cloneWeapon('shadowDagger', 'lightLance', {
        name: '섬광 찌르기',
        description: '빛의 창끝처럼 전방을 빠르게 관통해 찌릅니다.',
        type: 'melee',
        classKey: 'shadowSlash',
        slashMode: 'linePierce',
        imageOnlyVfx: true,
        soundKey: 'lightLance',
        acquireRange: 255,
        slashRange: 245,
        lineWidth: 34,
        maxHits: 4,
        damageMult: 1.06,
        patternDelay: 130,
        motionDuration: 190,
        effectKey: 'light_lance_pierce',
        effectColor: 0xffd86a,
        effectGlowColor: 0xffffff,
        effectDarkColor: 0x7a5d16,
        effectScale: 0.44,
    }),
    lightCrescent: cloneWeapon('shadowSlash', 'lightCrescent', {
        name: '광휘 참격',
        description: '전방에 넓은 빛의 검기를 휘둘러 적을 벱니다.',
        imageOnlyVfx: true,
        soundKey: 'lightCrescent',
        acquireRange: 295,
        slashRange: 265,
        slashArc: 0.72,
        hitAngle: 0.72,
        maxHits: 4,
        damageMult: 1.12,
        effectKey: 'light_crescent',
        effectColor: 0xffd86a,
        effectGlowColor: 0xffffff,
        effectDarkColor: 0x7a5d16,
        effectScale: 0.56,
    }),
    lightJudgment: cloneWeapon('rulersAuthority', 'lightJudgment', {
        name: '심판의 낙광',
        description: '적 무리 위에 압축된 빛을 떨어뜨려 범위 피해를 줍니다.',
        soundKey: 'lightJudgment',
        targetMode: 'self',
        strikeCount: 3,
        strikeDelay: 170,
        imageOnlyVfx: true,
        blastRange: 175,
        acquireRange: 0,
        impactDelay: 110,
        damageMult: 0.9,
        effectKey: 'light_judgment',
        effectColor: 0xffd86a,
        effectGlowColor: 0xffffff,
        effectDarkColor: 0x7a5d16,
    }),
    lightSanctum: cloneWeapon('dragonFear', 'lightSanctum', {
        name: '성광 압박',
        description: '찬란한 위압으로 주변 적에게 피해를 주고 움직임을 늦춥니다.',
        soundKey: 'lightSanctum',
        auraRange: 225,
        slowMultiplier: 0.32,
        imageOnlyVfx: true,
        auraDuration: 2300,
        damageMult: 0.9,
        effectKey: 'light_sanctum',
        effectColor: 0xffd86a,
        effectGlowColor: 0xffffff,
        effectDarkColor: 0x7a5d16,
    }),
    tigerPalm: cloneWeapon('basicDagger', 'tigerPalm', {
        name: '백호 장타',
        description: '근접 적에게 묵직한 손날 타격을 꽂아 넣습니다.',
        attackStyle: 'clawSwipe',
        basicAttackEffectKey: 'tiger_claw_swipe',
        soundKey: 'tigerClaw',
        attackRange: 175,
        targetRangeBonus: 45,
        hitRangeBonus: 10,
        hitAngle: 1.08,
        maxHits: 5,
        effectKey: 'tiger_palm',
        effectColor: 0xbfeaff,
        effectGlowColor: 0xffffff,
        effectDarkColor: 0x17425a,
        effectScale: 0.48,
    }),
    tigerFang: cloneWeapon('shadowDagger', 'tigerFang', {
        name: '백호 송곳니',
        description: '짧은 거리에서 백호의 송곳니 연타로 전방을 찢습니다.',
        type: 'melee',
        classKey: 'shadowSlash',
        soundKey: 'tigerFang',
        acquireRange: 285,
        arcOffsets: [-0.5, 0, 0.5],
        slashRange: 245,
        slashArc: 0.86,
        hitAngle: 0.9,
        maxHits: 5,
        damageMult: 0.54,
        levelBonuses: {
            2: { damage: 10 },
            3: { damage: 10 },
            4: { damage: 12, cooldown: -40 },
            5: { damage: 12 },
            6: { cooldown: -40 },
            7: { damage: 14 },
            8: { damage: 14, cooldown: -40 },
            9: { damage: 14 },
            10: { count: 1, damage: 16, cooldown: -50 },
        },
        effectKey: 'tiger_fang_combo',
        effectColor: 0xbfeaff,
        effectGlowColor: 0xffffff,
        effectDarkColor: 0x17425a,
        effectScale: 0.5,
    }),
    tigerRend: cloneWeapon('shadowSlash', 'tigerRend', {
        name: '맹호 찢기',
        description: '날카로운 호랑이 발톱의 궤적으로 앞의 적을 찢습니다.',
        soundKey: 'tigerRend',
        acquireRange: 285,
        slashRange: 265,
        slashArc: 1.2,
        hitAngle: 1.2,
        maxHits: 7,
        damageMult: 0.9,
        effectKey: 'tiger_rend',
        effectColor: 0xbfeaff,
        effectGlowColor: 0xffffff,
        effectDarkColor: 0x17425a,
        effectScale: 0.58,
    }),
    tigerQuake: cloneWeapon('rulersAuthority', 'tigerQuake', {
        name: '백호 진각',
        description: '땅을 짓밟아 충격파를 터뜨리고 적 무리를 무너뜨립니다.',
        soundKey: 'tigerQuake',
        targetMode: 'self',
        blastRange: 235,
        impactDelay: 90,
        damageMult: 0.86,
        slowMultiplier: 0.72,
        slowDuration: 900,
        effectKey: 'tiger_quake',
        effectColor: 0xbfeaff,
        effectGlowColor: 0xffffff,
        effectDarkColor: 0x17425a,
    }),
    tigerGuard: cloneWeapon('dragonFear', 'tigerGuard', {
        name: '투왕 위압',
        description: '야수의 위압으로 주변 적에게 피해와 둔화를 겁니다.',
        soundKey: 'tigerGuard',
        auraRange: 190,
        slowMultiplier: 0.22,
        auraDuration: 1600,
        damageMult: 0.65,
        effectKey: 'tiger_guard',
        effectColor: 0xbfeaff,
        effectGlowColor: 0xffffff,
        effectDarkColor: 0x17425a,
    }),
    flameSpark: cloneWeapon('basicDagger', 'flameSpark', {
        name: '화염 점화',
        description: '가까운 적을 짧은 화염 폭발로 태웁니다.',
        hitEffect: 'burn',
        attackStyle: 'fireball',
        basicAttackEffectKey: 'flame_fireball',
        soundKey: 'flameSpark',
        attackRange: 390,
        targetRangeBonus: 150,
        projectileRangeBonus: 95,
        impactRadius: 54,
        maxHits: 4,
        effectKey: 'flame_spark',
        effectColor: 0xff7a34,
        effectGlowColor: 0xffd86a,
        effectDarkColor: 0x7a2108,
        effectScale: 0.3,
    }),
    flameBolt: cloneWeapon('shadowDagger', 'flameBolt', {
        name: '화염구',
        description: '가장 가까운 적을 향해 불타는 화염구를 발사합니다.',
        hitEffect: 'burn',
        soundKey: 'flameBolt',
        projectileRange: 1180,
        projectileDuration: 920,
        maxPierces: 1,
        minHitRadius: 30,
        explosionRadius: 96,
        explosionDamageMult: 0.72,
        damageMult: 0.96,
        projectileScale: 0.54,
        effectKey: 'flame_bolt',
        effectColor: 0xff7a34,
        effectGlowColor: 0xffd86a,
        effectDarkColor: 0x7a2108,
        effectScale: 0.5,
    }),
    flameArc: cloneWeapon('shadowSlash', 'flameArc', {
        name: '화염 호월',
        description: '부채꼴 화염 검기로 전방의 적을 쓸어냅니다.',
        hitEffect: 'burn',
        soundKey: 'flameArc',
        acquireRange: 380,
        arcOffsets: [-0.42, 0, 0.42],
        slashRange: 330,
        slashArc: 0.62,
        hitAngle: 0.62,
        maxHits: 4,
        damageMult: 0.42,
        aftershockRadius: 92,
        aftershockDamageMult: 0.14,
        effectKey: 'flame_arc',
        effectColor: 0xff7a34,
        effectGlowColor: 0xffd86a,
        effectDarkColor: 0x7a2108,
        effectScale: 0.58,
    }),
    flameMeteor: cloneWeapon('rulersAuthority', 'flameMeteor', {
        name: '유성 낙인',
        description: '적 무리에 유성 문장을 폭발시켜 광역 피해를 줍니다.',
        hitEffect: 'burn',
        soundKey: 'flameMeteor',
        targetMode: 'randomCluster',
        strikeCount: 4,
        strikeDelay: 160,
        blastRange: 145,
        acquireRange: 800,
        randomOffsetRadius: 180,
        impactDelay: 260,
        damageMult: 0.82,
        effectKey: 'flame_meteor',
        effectColor: 0xff7a34,
        effectGlowColor: 0xffd86a,
        effectDarkColor: 0x7a2108,
    }),
    flameInferno: cloneWeapon('dragonFear', 'flameInferno', {
        name: '화염 장막',
        description: '주변을 불길로 덮어 적에게 피해와 둔화를 남깁니다.',
        hitEffect: 'burn',
        soundKey: 'flameInferno',
        auraRange: 265,
        slowMultiplier: 0.55,
        auraDuration: 2700,
        damageMult: 0.65,
        tickCount: 3,
        tickInterval: 620,
        tickDamageMult: 0.42,
        effectKey: 'flame_inferno',
        effectColor: 0xff7a34,
        effectGlowColor: 0xffd86a,
        effectDarkColor: 0x7a2108,
    }),
    sanctuaryStrike: cloneWeapon('basicDagger', 'sanctuaryStrike', {
        name: '성역 타격',
        description: '정화의 힘을 담은 짧은 타격으로 가까운 적을 밀어냅니다.',
        attackStyle: 'maceSlam',
        basicAttackEffectKey: 'sanctuary_mace_slam',
        soundKey: 'sanctuaryMace',
        attackRange: 225,
        targetRangeBonus: 45,
        impactRangeBonus: -8,
        impactRadius: 74,
        maxHits: 4,
        effectKey: 'sanctuary_strike',
        effectColor: 0x66f2b0,
        effectGlowColor: 0xe8fff5,
        effectDarkColor: 0x0d6543,
        effectScale: 0.46,
    }),
    sanctuaryOrb: cloneWeapon('shadowDagger', 'sanctuaryOrb', {
        name: '성역 파동',
        description: '주변에 정화 파동을 펼쳐 적을 늦추고 자신을 회복합니다.',
        type: 'area',
        classKey: 'rulersAuthority',
        soundKey: 'sanctuaryOrb',
        targetMode: 'self',
        blastRange: 235,
        impactDelay: 120,
        slowMultiplier: 0.68,
        slowDuration: 1150,
        damageMult: 0.72,
        healPercent: 0.02,
        healCooldownMs: 3000,
        levelBonuses: {
            2: { damage: 10, cooldown: -45 },
            3: { damage: 10 },
            4: { damage: 12, cooldown: -45 },
            5: { damage: 12 },
            6: { cooldown: -45 },
            7: { damage: 14 },
            8: { damage: 14 },
            9: { damage: 14, cooldown: -45 },
            10: { damage: 16 },
        },
        effectKey: 'sanctuary_pulse',
        effectColor: 0x66f2b0,
        effectGlowColor: 0xe8fff5,
        effectDarkColor: 0x0d6543,
        effectScale: 0.54,
    }),
    sanctuaryArc: cloneWeapon('shadowSlash', 'sanctuaryArc', {
        name: '정화의 호',
        description: '전방에 정화의 호선을 그어 적을 베어냅니다.',
        soundKey: 'sanctuaryArc',
        slashMode: 'radialPulse',
        slashRange: 285,
        maxHits: 8,
        damageMult: 0.82,
        slowMultiplier: 0.65,
        slowDuration: 1600,
        effectKey: 'sanctuary_arc',
        effectColor: 0x66f2b0,
        effectGlowColor: 0xe8fff5,
        effectDarkColor: 0x0d6543,
        effectScale: 0.56,
    }),
    sanctuarySeal: cloneWeapon('rulersAuthority', 'sanctuarySeal', {
        name: '성역 문장',
        description: '지면에 성역 문장을 펼쳐 적 무리에 범위 피해를 줍니다.',
        soundKey: 'sanctuarySeal',
        blastRange: 210,
        acquireRange: 680,
        damageMult: 0.75,
        slowMultiplier: 0.45,
        slowDuration: 2400,
        effectKey: 'sanctuary_seal',
        effectColor: 0x66f2b0,
        effectGlowColor: 0xe8fff5,
        effectDarkColor: 0x0d6543,
    }),
    sanctuaryField: cloneWeapon('dragonFear', 'sanctuaryField', {
        name: '수호 결계',
        description: '수호 결계를 펼쳐 주변 적을 약화시키고 피해를 줍니다.',
        soundKey: 'sanctuaryField',
        auraRange: 285,
        slowMultiplier: 0.62,
        auraDuration: 2300,
        damageMult: 0.6,
        tickCount: 1,
        tickInterval: 900,
        tickDamageMult: 0.35,
        healPercent: 0.04,
        healCooldownMs: 6000,
        effectKey: 'sanctuary_field',
        effectColor: 0x66f2b0,
        effectGlowColor: 0xe8fff5,
        effectDarkColor: 0x0d6543,
    }),
});

Object.entries(WEAPONS).forEach(([key, config]) => {
    config.key = key;
    config.baseWeaponKey = config.baseWeaponKey || key;
    config.classKey = config.classKey || key;
});

export const PASSIVES = {
    swiftness:  { name: '신속', description: '이동속도 +8%', stat: 'speed', bonus: 0.08, icon: 0x44ff44 },
    vitality:   { name: '체력 강화', description: '최대 HP +12%', stat: 'maxHp', bonus: 0.12, icon: 0xff4444 },
    strength:   { name: '힘 강화', description: '공격력 +8%', stat: 'attack', bonus: 0.08, icon: 0xff8844 },
    critMaster: { name: '치명타 달인', description: '치명타율 +8%', stat: 'critRate', bonus: 0.08, icon: 0xffff44 },
    scholar:    { name: '학습 능력', description: '경험치 +12%', stat: 'xpMultiplier', bonus: 0.12, icon: 0x44aaff },
    hastening:  { name: '쿨타임 감소', description: '스킬 쿨타임 -6%', stat: 'cooldownReduction', bonus: 0.06, icon: 0xaa44ff },
    magnet:     { name: '자석', description: '아이템 픽업 범위 +25%', stat: 'pickupRange', bonus: 0.25, icon: 0x66ccff },
};
