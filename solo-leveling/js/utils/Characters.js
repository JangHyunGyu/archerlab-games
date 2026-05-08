export const DEFAULT_CHARACTER_ID = 'shadowMonarch';
export const CHARACTER_STORAGE_KEY = 'shadow_survival_selected_character_v1';

export const CHARACTER_FRAME_NAMES = [
    ...Array.from({ length: 4 }, (_, i) => `idle_${i}`),
    ...['down', 'right', 'up', 'left'].flatMap(dir =>
        Array.from({ length: 8 }, (_, i) => `walk_${dir}_${i}`)
    ),
    ...Array.from({ length: 6 }, (_, i) => `attack_${i}`),
    ...['down', 'right', 'up', 'left'].flatMap(dir =>
        Array.from({ length: 6 }, (_, i) => `attack_${dir}_${i}`)
    ),
    ...Array.from({ length: 2 }, (_, i) => `hit_${i}`),
];

export const CHARACTER_WEAPON_LOADOUTS = {
    shadowMonarch: ['basicDagger', 'shadowDagger', 'shadowSlash', 'rulersAuthority', 'dragonFear'],
    lightSwordswoman: ['lightPierce', 'lightLance', 'lightCrescent', 'lightJudgment', 'lightSanctum'],
    whiteTigerBrawler: ['tigerPalm', 'tigerFang', 'tigerRend', 'tigerQuake', 'tigerGuard'],
    flameMage: ['flameSpark', 'flameBolt', 'flameArc', 'flameMeteor', 'flameInferno'],
    sanctuaryHealer: ['sanctuaryStrike', 'sanctuaryOrb', 'sanctuaryArc', 'sanctuarySeal', 'sanctuaryField'],
};

export const CHARACTER_WEAPON_EFFECT_KEYS = [
    'light_pierce',
    'light_lance',
    'light_lance_pierce',
    'light_crescent',
    'light_judgment',
    'light_sanctum',
    'tiger_palm',
    'tiger_fang',
    'tiger_fang_combo',
    'tiger_rend',
    'tiger_quake',
    'tiger_guard',
    'flame_spark',
    'flame_bolt',
    'flame_arc',
    'flame_meteor',
    'flame_inferno',
    'sanctuary_strike',
    'sanctuary_orb',
    'sanctuary_pulse',
    'sanctuary_arc',
    'sanctuary_seal',
    'sanctuary_field',
];

export const CHARACTER_BASIC_ATTACK_EFFECT_KEYS = [
    'light_sword_slash',
    'tiger_claw_swipe',
    'flame_fireball',
    'sanctuary_mace_slam',
];

export const CHARACTER_SKILL_EFFECT_KEYS = [
    ...CHARACTER_WEAPON_EFFECT_KEYS,
];

export const CHARACTER_DEFS = {
    shadowMonarch: {
        id: 'shadowMonarch',
        assetKey: 'original_shadow_monarch',
        texturePrefix: 'player',
        usesExistingPlayerMotion: true,
        name: '그림자 군주',
        archetype: '소환 / 올라운더',
        accent: 0x9a5cff,
        accentText: '#b996ff',
        stats: {
            hp: 154,
            maxHp: 154,
            attack: 24,
            speed: 160,
            critRate: 0.06,
            critDamage: 2.0,
            xpMultiplier: 1.0,
            cooldownReduction: 0.01,
            pickupRange: 104,
        },
    },
    lightSwordswoman: {
        id: 'lightSwordswoman',
        assetKey: 'light_swordswoman',
        texturePrefix: 'char_light_swordswoman',
        name: '빛의 검사',
        archetype: '치명 / 고속 근접',
        accent: 0xffd86a,
        accentText: '#ffe29a',
        stats: {
            hp: 122,
            maxHp: 122,
            attack: 24,
            speed: 186,
            critRate: 0.18,
            critDamage: 2.25,
            xpMultiplier: 1.0,
            cooldownReduction: 0.03,
            pickupRange: 92,
        },
    },
    whiteTigerBrawler: {
        id: 'whiteTigerBrawler',
        assetKey: 'white_tiger_brawler',
        texturePrefix: 'char_white_tiger_brawler',
        name: '백호 투사',
        archetype: '탱커 / 충격파',
        accent: 0xbfeaff,
        accentText: '#d6f4ff',
        visualScale: 0.98,
        stats: {
            hp: 210,
            maxHp: 210,
            attack: 19,
            speed: 144,
            critRate: 0.035,
            critDamage: 1.85,
            xpMultiplier: 1.0,
            cooldownReduction: 0,
            pickupRange: 104,
        },
    },
    flameMage: {
        id: 'flameMage',
        assetKey: 'flame_mage',
        texturePrefix: 'char_flame_mage',
        name: '화염 마도사',
        archetype: '광역 / 폭발 화력',
        accent: 0xff7a34,
        accentText: '#ffb077',
        stats: {
            hp: 112,
            maxHp: 112,
            attack: 34,
            speed: 142,
            critRate: 0.05,
            critDamage: 2.0,
            xpMultiplier: 1.0,
            cooldownReduction: 0.07,
            pickupRange: 92,
        },
    },
    sanctuaryHealer: {
        id: 'sanctuaryHealer',
        assetKey: 'sanctuary_healer',
        texturePrefix: 'char_sanctuary_healer',
        name: '성역 치유사',
        archetype: '회복 / 보호막',
        accent: 0x66f2b0,
        accentText: '#9dffd0',
        stats: {
            hp: 174,
            maxHp: 174,
            attack: 16,
            speed: 154,
            critRate: 0.035,
            critDamage: 1.8,
            xpMultiplier: 1.04,
            cooldownReduction: 0.05,
            pickupRange: 118,
        },
    },
};

export function getCharacter(id) {
    return CHARACTER_DEFS[id] || CHARACTER_DEFS[DEFAULT_CHARACTER_ID];
}

export function getCharacterWeaponKeys(id) {
    return CHARACTER_WEAPON_LOADOUTS[id] || CHARACTER_WEAPON_LOADOUTS[DEFAULT_CHARACTER_ID];
}

export function getStarterWeaponKey(id) {
    return getCharacterWeaponKeys(id)[0];
}

export function isCharacterWeaponKey(id, weaponKey) {
    return getCharacterWeaponKeys(id).includes(weaponKey);
}

export function getStoredCharacterId() {
    try {
        const stored = localStorage.getItem(CHARACTER_STORAGE_KEY);
        return CHARACTER_DEFS[stored] ? stored : DEFAULT_CHARACTER_ID;
    } catch (e) {
        return DEFAULT_CHARACTER_ID;
    }
}

export function setStoredCharacterId(id) {
    const safeId = CHARACTER_DEFS[id] ? id : DEFAULT_CHARACTER_ID;
    try {
        localStorage.setItem(CHARACTER_STORAGE_KEY, safeId);
    } catch (e) {}
    return safeId;
}
