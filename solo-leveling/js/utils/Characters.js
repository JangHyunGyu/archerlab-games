export const DEFAULT_CHARACTER_ID = 'shadowMonarch';
export const CHARACTER_STORAGE_KEY = 'shadow_survival_selected_character_v1';

export const CHARACTER_FRAME_NAMES = [
    ...Array.from({ length: 4 }, (_, i) => `idle_${i}`),
    ...['down', 'right', 'up', 'left'].flatMap(dir =>
        Array.from({ length: 4 }, (_, i) => `walk_${dir}_${i}`)
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
    'light_crescent',
    'light_judgment',
    'light_sanctum',
    'tiger_palm',
    'tiger_fang',
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
    'sanctuary_arc',
    'sanctuary_seal',
    'sanctuary_field',
];

export const CHARACTER_SKILL_EFFECT_KEYS = [
    'light_flurry_slash',
    'light_flurry_hit',
    'tiger_roar_wave',
    'tiger_claw',
    'flame_brand_burst',
    'flame_brand_mark',
    'sanctuary_oath_aura',
    'sanctuary_shield',
    'shadow_recruit_rune',
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
        skillName: '그림자 징집',
        skillSummary: '처치 누적으로 임시 그림자 병사를 불러냅니다.',
        skillDescription: '적을 12명 처치할 때마다 임시 그림자 병사를 소환합니다.',
        accent: 0x9a5cff,
        accentText: '#b996ff',
        stats: {
            hp: 150,
            maxHp: 150,
            attack: 24,
            speed: 160,
            critRate: 0.05,
            critDamage: 2.0,
            xpMultiplier: 1.0,
            cooldownReduction: 0,
            pickupRange: 100,
        },
    },
    lightSwordswoman: {
        id: 'lightSwordswoman',
        assetKey: 'light_swordswoman',
        texturePrefix: 'char_light_swordswoman',
        name: '빛의 검사',
        archetype: '치명 / 고속 근접',
        skillName: '섬광 연격',
        skillSummary: '가까운 적들을 베어 치명 피해를 노립니다.',
        skillDescription: '4.8초마다 주변 적에게 빠른 빛 검격을 가합니다.',
        accent: 0xffd86a,
        accentText: '#ffe29a',
        stats: {
            hp: 132,
            maxHp: 132,
            attack: 22,
            speed: 178,
            critRate: 0.14,
            critDamage: 2.15,
            xpMultiplier: 1.0,
            cooldownReduction: 0.02,
            pickupRange: 96,
        },
    },
    whiteTigerBrawler: {
        id: 'whiteTigerBrawler',
        assetKey: 'white_tiger_brawler',
        texturePrefix: 'char_white_tiger_brawler',
        name: '백호 투사',
        archetype: '탱커 / 충격파',
        skillName: '백호 포효',
        skillSummary: '충격파로 적을 밀어내고 버팁니다.',
        skillDescription: '6.4초마다 주변 적에게 넉백 충격파를 방출합니다.',
        accent: 0xbfeaff,
        accentText: '#d6f4ff',
        damageTakenMultiplier: 0.86,
        visualScale: 0.98,
        stats: {
            hp: 190,
            maxHp: 190,
            attack: 20,
            speed: 150,
            critRate: 0.04,
            critDamage: 1.9,
            xpMultiplier: 1.0,
            cooldownReduction: 0,
            pickupRange: 102,
        },
    },
    flameMage: {
        id: 'flameMage',
        assetKey: 'flame_mage',
        texturePrefix: 'char_flame_mage',
        name: '화염 마도사',
        archetype: '광역 / 폭발 화력',
        skillName: '화염 낙인',
        skillSummary: '원거리 폭발로 밀집된 적을 태웁니다.',
        skillDescription: '5.6초마다 가장 가까운 적 위치에 화염 폭발을 일으킵니다.',
        accent: 0xff7a34,
        accentText: '#ffb077',
        stats: {
            hp: 126,
            maxHp: 126,
            attack: 31,
            speed: 150,
            critRate: 0.06,
            critDamage: 2.0,
            xpMultiplier: 1.0,
            cooldownReduction: 0.06,
            pickupRange: 96,
        },
    },
    sanctuaryHealer: {
        id: 'sanctuaryHealer',
        assetKey: 'sanctuary_healer',
        texturePrefix: 'char_sanctuary_healer',
        name: '성역 치유사',
        archetype: '회복 / 보호막',
        skillName: '성역의 맹세',
        skillSummary: '주기적으로 회복하고 보호막을 얻습니다.',
        skillDescription: '7.2초마다 체력을 회복하고 짧은 보호막을 생성합니다.',
        accent: 0x66f2b0,
        accentText: '#9dffd0',
        regenPerSec: 0.6,
        stats: {
            hp: 164,
            maxHp: 164,
            attack: 17,
            speed: 158,
            critRate: 0.04,
            critDamage: 1.85,
            xpMultiplier: 1.03,
            cooldownReduction: 0.03,
            pickupRange: 112,
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
