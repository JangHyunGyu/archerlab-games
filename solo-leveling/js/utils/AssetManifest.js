import { BOSS_TYPES, ENEMY_TYPES, PASSIVES, WEAPONS } from './Constants.js';
import {
    CHARACTER_BASIC_ATTACK_EFFECT_KEYS,
    CHARACTER_DEFS,
    CHARACTER_FRAME_NAMES,
    CHARACTER_SKILL_EFFECT_KEYS,
    getCharacter,
    getCharacterWeaponKeys,
    getStarterWeaponKey,
    getStoredCharacterId,
} from './Characters.js';

const UI_ASSET_KEYS = [
    'ui_panel_cyan',
    'ui_panel_gold',
    'ui_panel_red',
    'ui_panel_purple',
    'ui_card_cyan',
    'ui_card_gold',
    'ui_card_hover',
    'ui_choice_cyan',
    'ui_choice_gold',
    'ui_choice_hover',
    'ui_button_cyan',
    'ui_button_hover',
    'ui_slot',
    'ui_minimap',
    'menu/shadow_gate_backdrop',
    'menu/start_button_primary',
    'menu/start_button_primary_hover',
    'menu/start_button_secondary',
    'menu/start_button_secondary_hover',
    'menu/start_button_primary_wide',
    'menu/start_button_primary_wide_hover',
    'menu/start_button_secondary_wide',
    'menu/start_button_secondary_wide_hover',
    'menu/hunter_card_normal',
    'menu/hunter_card_selected',
    'menu/modal_frame_cyan',
    'menu/modal_frame_gold',
    'menu/rank_card_1',
    'menu/rank_card_2',
    'menu/rank_card_3',
    'menu/icon_play',
    'menu/icon_resume',
    'menu/icon_ranking',
    'menu/icon_mail',
    'menu/icon_kakao',
    'menu/icon_loading_core',
    'menu/icon_empty_record',
    'menu/icon_error',
    'menu/preload_core',
    'menu/preload_bar_frame',
    'menu/preload_bar_fill',
];

// Keep authored high-resolution chrome for the large menu surfaces. The
// compact base frames are useful fallbacks, but visibly soften when scaled to
// character-select and ranking modal sizes.
const UI_ASSET_OVERRIDES = {
    'menu/hunter_card_normal': 'assets/ui/menu/hunter_card_normal_imagegen.png',
    'menu/hunter_card_selected': 'assets/ui/menu/hunter_card_selected_imagegen.png',
    'menu/modal_frame_cyan': 'assets/ui/menu/modal_frame_cyan_imagegen.png',
    'menu/modal_frame_gold': 'assets/ui/menu/modal_frame_gold_imagegen.png',
    'menu/rank_card_1': 'assets/ui/menu/rank_card_1_imagegen.png',
    'menu/rank_card_2': 'assets/ui/menu/rank_card_2_imagegen.png',
    'menu/rank_card_3': 'assets/ui/menu/rank_card_3_imagegen.png',
};

const ITEM_KEYS = ['hp_potion', 'mana_crystal', 'shadow_essence'];
const TELEGRAPH_KEYS = ['warning_reticle', 'igris_slash_warning', 'ground_crack', 'acid_puddle'];
const BOSS_SUPPORT_KEYS = [
    'charge_aura',
    'igris_slash_impact',
    'tusk_shockwave',
    'tusk_dust_cloud',
    'tusk_debris_burst',
    'beru_acid_projectile',
    'beru_acid_hit',
    'entrance_burst',
    'death_explosion',
    'death_shock_ring',
    'phase_rage_aura',
    'smoke_wisp',
];
const ENV_KEYS = ['cracked_pillar', 'rune_stone', 'shadow_portal', 'hanging_chain'];
const SHADOW_KEYS = ['melee', 'tank', 'ranged'];
const ARISE_KEYS = ['arise_rune', 'arise_smoke', 'arise_hand'];
const SHADOW_SOLDIER_VFX_KEYS = ['soldier_slash', 'soldier_slam', 'soldier_spit', 'soldier_trail'];
const ENEMY_KEYS = ['goblin', 'antSoldier', 'orc', 'iceBear', 'stoneGolem', 'darkMage', 'ironKnight', 'demonWarrior'];
const BOSS_KEYS = ['igris', 'tusk', 'beru'];
const BASE_EFFECT_KEYS = ['shadow_dagger', 'shadow_slash', 'ruler_authority', 'dragon_fear'];
const COMBAT_EFFECT_KEYS = ['basic_stab', 'flame_burn', 'monster_hit', 'monster_crit', 'monster_death', 'sanctuary_hit'];
const COMBAT_EFFECT_FILE_PREFIXES = {
    flame_burn: 'flame_burn_v2',
    monster_hit: 'monster_hit_v2',
    monster_crit: 'monster_crit_v2',
    monster_death: 'monster_death_bloodburst',
    sanctuary_hit: 'sanctuary_hit_v2',
};
const COMBAT_EFFECT_FRAME_COUNTS = {
    flame_burn: 12,
    monster_hit: 12,
    monster_crit: 16,
    monster_death: 16,
    sanctuary_hit: 16,
};
const ENEMY_BOSS_EFFECT_KEYS = [
    'dark_mage_orb',
    'boss_death_burst',
    'boss_death_igris',
    'boss_death_tusk',
    'boss_death_beru',
    'boss_igris_slash',
    'boss_tusk_slam',
    'boss_beru_acid',
];

const PLAYER_MOTION_NAMES = [
    ...Array.from({ length: 4 }, (_, i) => `player_idle_${i}`),
    ...['down', 'right', 'up', 'left'].flatMap(dir =>
        Array.from({ length: 4 }, (_, i) => `player_idle_${dir}_${i}`)
    ),
    ...['down', 'right', 'up', 'left'].flatMap(dir =>
        Array.from({ length: 8 }, (_, i) => `player_walk_${dir}_${i}`)
    ),
    ...Array.from({ length: 6 }, (_, i) => `player_attack_${i}`),
    ...['down', 'right', 'up', 'left'].flatMap(dir =>
        Array.from({ length: 6 }, (_, i) => `player_attack_${dir}_${i}`)
    ),
    ...Array.from({ length: 2 }, (_, i) => `player_hit_${i}`),
];

// Character image URLs are otherwise stable across releases and can remain in
// a browser/CDN cache after portraits or motion frames are rebuilt in place.
export const CHARACTER_VISUAL_ASSET_VERSION = '20260714-integrated-character-motion-v2';
export const CHARACTER_MOTION_ASSET_VERSION = '20261119-native-rgba-motion-v7';
export const CHARACTER_COMBAT_VFX_ASSET_VERSION = '20261119-combat-vfx-polish-v18';
export const CHARACTER_COMBAT_VFX_FRAME_COUNT = 6;

const uiAsset = (key) => ({
    key: key.includes('/') ? key.split('/').pop() : key,
    path: UI_ASSET_OVERRIDES[key] || `assets/ui/${key}.png`,
});

const frameAssets = (prefix, dir, names) => names.map(name => ({
    key: `${prefix}_${name}`,
    path: `${dir}/${name}.png`,
    cacheVersion: CHARACTER_MOTION_ASSET_VERSION,
}));

export function getCharacterPortraitAssets() {
    return Object.values(CHARACTER_DEFS).flatMap(character => ([
        {
            key: `char_${character.assetKey}_portrait`,
            path: `assets/player/characters/${character.assetKey}/portrait.png`,
            cacheVersion: CHARACTER_VISUAL_ASSET_VERSION,
        },
        {
            key: `char_${character.assetKey}_menu_portrait`,
            path: `assets/player/characters/${character.assetKey}/menu_portrait.png`,
            cacheVersion: CHARACTER_VISUAL_ASSET_VERSION,
        },
    ]));
}

export function getCharacterMotionAssets(characterId = getStoredCharacterId()) {
    const character = getCharacter(characterId);
    const variants = (character.basicAttackVariants || []).flatMap(variant =>
        ['down', 'right', 'up', 'left'].flatMap(direction =>
            Array.from({length: 6}, (_, i) => `attack_${variant}_${direction}_${i}`)));
    if (character.usesExistingPlayerMotion) {
        return variants.map(name => ({key: `player_${name}`,
            path: `assets/player/motion/player_${name}.png`, cacheVersion: CHARACTER_MOTION_ASSET_VERSION}));
    }
    return frameAssets(
        character.texturePrefix,
        `assets/player/characters/${character.assetKey}/motion`,
        [...CHARACTER_FRAME_NAMES, ...variants]
    );
}

export function getCharacterCombatVfxFrameAssets(characterId = getStoredCharacterId()) {
    const seen = new Set();
    const effects = [];

    for (const weaponKey of getCharacterWeaponKeys(characterId)) {
        const weapon = WEAPONS[weaponKey];
        if (!weapon) continue;

        const isBasicAttack = !!weapon.basicAttackEffectKey;
        const effectKey = isBasicAttack ? weapon.basicAttackEffectKey : weapon.effectKey;
        if (!effectKey) continue;

        const texturePrefix = isBasicAttack ? 'basic_attack' : 'char_skill';
        const directory = isBasicAttack ? 'basic_attacks' : 'character_skills';
        const identity = `${texturePrefix}_${effectKey}`;
        if (seen.has(identity)) continue;
        seen.add(identity);

        for (let frame = 0; frame < CHARACTER_COMBAT_VFX_FRAME_COUNT; frame++) {
            effects.push({
                key: `${identity}_${frame}`,
                path: `assets/effects/${directory}/frames/${effectKey}_${frame}.png`,
                cacheVersion: CHARACTER_COMBAT_VFX_ASSET_VERSION,
            });
        }
    }

    if (getCharacter(characterId).id === 'shadowMonarch') {
        for (let frame = 0; frame < CHARACTER_COMBAT_VFX_FRAME_COUNT; frame++) {
            effects.push({key: `basic_attack_shadow_dagger_cut_${frame}`,
                path: `assets/effects/basic_attacks/frames/shadow_dagger_cut_${frame}.png`,
                cacheVersion: CHARACTER_COMBAT_VFX_ASSET_VERSION});
        }
    }
    return effects;
}

const MENU_CORE_UI_ASSETS = [
    { key: 'preload_core', path: 'assets/ui/menu/preload_core.png' },
    { key: 'preload_bar_frame', path: 'assets/ui/menu/preload_bar_frame.png' },
    { key: 'preload_bar_fill', path: 'assets/ui/menu/preload_bar_fill.png' },
    { key: 'shadow_gate_backdrop', path: 'assets/ui/menu/shadow_gate_backdrop.png' },
    { key: 'env_shadow_portal', path: 'assets/environment/shadow_portal.png' },
    { key: 'ui_skin_button', path: 'assets/ui/skin-button-v1.png' },
    { key: 'ui_skin_panel', path: 'assets/ui/skin-panel-v1.png' },
    { key: 'ui_crafted_button', path: 'assets/ui/crafted-button-v1.webp' },
    { key: 'ui_crafted_frame', path: 'assets/ui/crafted-frame-v1.webp' },
    { key: 'icon_loading_core', path: 'assets/ui/menu/icon_loading_core.png' },
    { key: 'icon_error', path: 'assets/ui/menu/icon_error.png' },
];

function dedupeAssets(list) {
    const seen = new Set();
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const asset = list[i];
        if (!asset || !asset.key || seen.has(asset.key)) continue;
        seen.add(asset.key);
        out.push(asset);
    }
    return out;
}

function buildCombatEffectAssets(keys) {
    const out = [];
    for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        const filePrefix = COMBAT_EFFECT_FILE_PREFIXES[key] || key;
        const frameCount = COMBAT_EFFECT_FRAME_COUNTS[key] || 6;
        for (let i = 0; i < frameCount; i++) {
            out.push({
                key: `effect_${key}_${i}`,
                path: `assets/effects/combat/${filePrefix}_${i}.png`,
                preferPng: key === 'monster_death',
            });
        }
    }
    return out;
}

function buildEnemyBossEffectAssets(keys) {
    const out = [];
    for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        for (let i = 0; i < 6; i++) {
            out.push({
                key: `effect_${key}_${i}`,
                path: `assets/effects/enemy_boss/${key}_${i}.png`,
            });
        }
    }
    return out;
}

export function getCharacterMenuPortraitAsset(characterId = getStoredCharacterId()) {
    const character = getCharacter(characterId);
    return {
        key: `char_${character.assetKey}_menu_portrait`,
        path: `assets/player/characters/${character.assetKey}/menu_portrait.png`,
        cacheVersion: CHARACTER_VISUAL_ASSET_VERSION,
    };
}

// 초기 타이틀 화면에 직접 그려지는 UI와 선택된 캐릭터 초상화만 선별
export function getMenuCoreAssetList(characterId = getStoredCharacterId()) {
    return dedupeAssets([
        ...MENU_CORE_UI_ASSETS,
        getCharacterMenuPortraitAsset(characterId),
    ]);
}

// 캐릭터 선택 모달용 나머지 4명 초상화
export function getMenuDeferredAssetList(characterId = getStoredCharacterId()) {
    const selectedId = getCharacter(characterId).id;
    const deferred = [];
    for (const character of Object.values(CHARACTER_DEFS)) {
        if (character.id === selectedId) continue;
        deferred.push({
            key: `char_${character.assetKey}_menu_portrait`,
            path: `assets/player/characters/${character.assetKey}/menu_portrait.png`,
            cacheVersion: CHARACTER_VISUAL_ASSET_VERSION,
        });
    }
    return deferred;
}

export function getCharacterSkillAssetsForWeapon(weaponKey) {
    const weapon = WEAPONS[weaponKey];
    if (!weapon) return [];
    const isBasicAttack = !!weapon.basicAttackEffectKey;
    const effectKey = isBasicAttack ? weapon.basicAttackEffectKey : weapon.effectKey;
    if (!effectKey) return [];
    const texturePrefix = isBasicAttack ? 'basic_attack' : 'char_skill';
    const directory = isBasicAttack ? 'basic_attacks' : 'character_skills';
    const identity = `${texturePrefix}_${effectKey}`;
    const list = [
        {
            key: identity,
            path: `assets/effects/${directory}/${effectKey}.png`,
            cacheVersion: CHARACTER_COMBAT_VFX_ASSET_VERSION,
        },
    ];
    for (let frame = 0; frame < CHARACTER_COMBAT_VFX_FRAME_COUNT; frame++) {
        list.push({
            key: `${identity}_${frame}`,
            path: `assets/effects/${directory}/frames/${effectKey}_${frame}.png`,
            cacheVersion: CHARACTER_COMBAT_VFX_ASSET_VERSION,
        });
    }
    return list;
}

// 모든 캐릭터가 공통으로 쓰는 초기 인게임 필수 리소스
export function getSharedGameplayCoreAssetList(options = {}) {
    const includeFloor = options.includeFloor !== false;
    const list = [
        ...Object.keys(PASSIVES).map(key => ({ key: `asset_icon_${key}`, path: `assets/ui/icons/${key}.png` })),
        ...ITEM_KEYS.map(key => ({ key: `item_${key}`, path: `assets/items/${key}.png` })),
        ...ENV_KEYS.map(key => ({ key: `env_${key}`, path: `assets/environment/${key}.png` })),
        ...['goblin', 'antSoldier'].map(key => ({ key: `ai_enemy_${key}`, path: `assets/enemies/source/${key}.png` })),
        ...buildCombatEffectAssets(['monster_hit', 'monster_crit', 'monster_death']),
    ];
    if (includeFloor) {
        list.push({ key: 'ai_dungeon_floor', path: 'assets/background/bg_dungeon_floor.png' });
    }
    return dedupeAssets(list);
}

// 선택 캐릭터 1명의 모션, 무기 아이콘, 1레벨 기본공격 이펙트
export function getCharacterStarterAssetList(characterId = getStoredCharacterId()) {
    const character = getCharacter(characterId);
    const starterKey = getStarterWeaponKey(character.id);
    const weaponKeys = getCharacterWeaponKeys(character.id);
    const list = [
        ...weaponKeys.map(key => ({
            key: `asset_icon_${key}`,
            path: `assets/ui/icons/${key}.png`,
            cacheVersion: CHARACTER_COMBAT_VFX_ASSET_VERSION,
        })),
        ...getCharacterMotionAssets(character.id),
        ...getCharacterSkillAssetsForWeapon(starterKey),
    ];

    if (character.usesExistingPlayerMotion) {
        for (let i = 0; i < PLAYER_MOTION_NAMES.length; i++) {
            const name = PLAYER_MOTION_NAMES[i];
            list.push({
                key: `motion_${name}`,
                path: `assets/player/motion/${name}.png`,
                cacheVersion: CHARACTER_MOTION_ASSET_VERSION,
            });
        }
    }

    if (character.id === 'shadowMonarch') {
        list.push({
            key: 'basic_attack_shadow_dagger_cut',
            path: 'assets/effects/basic_attacks/shadow_dagger_cut.png',
            cacheVersion: CHARACTER_COMBAT_VFX_ASSET_VERSION,
        });
        for (let frame = 0; frame < CHARACTER_COMBAT_VFX_FRAME_COUNT; frame++) {
            list.push({
                key: `basic_attack_shadow_dagger_cut_${frame}`,
                path: `assets/effects/basic_attacks/frames/shadow_dagger_cut_${frame}.png`,
                cacheVersion: CHARACTER_COMBAT_VFX_ASSET_VERSION,
            });
        }
    } else if (character.id === 'flameMage') {
        list.push(...buildCombatEffectAssets(['flame_burn']));
    } else if (character.id === 'sanctuaryHealer') {
        list.push(...buildCombatEffectAssets(['sanctuary_hit']));
    }

    return dedupeAssets(list);
}

function getResumeExtraAssetList(characterId, savedData) {
    if (!savedData) return [];
    const list = [];
    const savedPlayer = savedData.player || {};
    const savedLevel = Math.max(1, Number(savedPlayer.level) || 1);
    const savedEnemyMgr = savedData.enemyManager || {};
    const savedTimeSec = Math.max(0, Number(savedEnemyMgr.gameTime) || 0) / 1000;
    const savedTimeMin = savedTimeSec / 60;

    // 보유 중이거나 곧 해금될 선택 캐릭터 무기 이펙트 포함
    const savedWeapons = Array.isArray(savedData.weapons) ? savedData.weapons : [];
    for (let i = 0; i < savedWeapons.length; i++) {
        const w = savedWeapons[i];
        if (w && w.key) list.push(...getCharacterSkillAssetsForWeapon(w.key));
    }
    const charWeaponKeys = getCharacterWeaponKeys(characterId);
    for (let i = 0; i < charWeaponKeys.length; i++) {
        const wk = charWeaponKeys[i];
        const cfg = WEAPONS[wk];
        if (cfg && cfg.unlockLevel <= savedLevel + 1) {
            list.push(...getCharacterSkillAssetsForWeapon(wk));
        }
    }

    // 현재 진행 시간에 등장 가능한 적 포함
    const enemySet = new Set();
    const activeEnemies = Array.isArray(savedEnemyMgr.activeEnemies) ? savedEnemyMgr.activeEnemies : [];
    for (let i = 0; i < activeEnemies.length; i++) {
        const e = activeEnemies[i];
        if (e && e.typeKey && ENEMY_TYPES[e.typeKey]) enemySet.add(e.typeKey);
    }
    if (savedTimeMin >= 1) enemySet.add('orc');
    if (savedTimeMin >= 2) enemySet.add('iceBear');
    if (savedTimeMin >= 5) { enemySet.add('stoneGolem'); enemySet.add('darkMage'); }
    if (savedTimeMin >= 8) enemySet.add('ironKnight');
    if (savedTimeMin >= 10) enemySet.add('demonWarrior');
    for (const enemyKey of enemySet) {
        list.push({ key: `ai_enemy_${enemyKey}`, path: `assets/enemies/source/${enemyKey}.png` });
    }
    if (enemySet.has('darkMage')) {
        list.push(...buildEnemyBossEffectAssets(['dark_mage_orb']));
    }

    // 활성/예정 보스 및 그림자 군단 에셋 포함
    const activeBosses = Array.isArray(savedData.activeBosses) ? savedData.activeBosses : [];
    const bossSet = new Set();
    for (let i = 0; i < activeBosses.length; i++) {
        const b = activeBosses[i];
        if (b && b.bossKey && BOSS_TYPES[b.bossKey]) bossSet.add(b.bossKey);
    }
    if (savedTimeSec >= 110) bossSet.add('igris');
    if (savedTimeSec >= 400) bossSet.add('tusk');
    if (savedTimeSec >= 760) bossSet.add('beru');

    if (bossSet.size > 0) {
        list.push(
            ...TELEGRAPH_KEYS.map(key => ({ key: `telegraph_${key}`, path: `assets/effects/telegraphs/${key}.png` })),
            ...BOSS_SUPPORT_KEYS.map(key => ({ key: `boss_vfx_${key}`, path: `assets/effects/boss_support/${key}.png` })),
            ...buildEnemyBossEffectAssets(['boss_death_burst'])
        );
        const bossAttackMap = {
            igris: ['boss_igris_slash', 'boss_death_igris'],
            tusk: ['boss_tusk_slam', 'boss_death_tusk'],
            beru: ['boss_beru_acid', 'boss_death_beru'],
        };
        for (const bossKey of bossSet) {
            list.push({ key: `ai_boss_${bossKey}`, path: `assets/bosses/source/${bossKey}.png` });
            if (bossAttackMap[bossKey]) {
                list.push(...buildEnemyBossEffectAssets(bossAttackMap[bossKey]));
            }
        }
    }

    const shadows = Array.isArray(savedData.shadows) ? savedData.shadows : [];
    if (shadows.length > 0) {
        list.push(
            ...SHADOW_KEYS.map(key => ({ key: `asset_shadow_${key}`, path: `assets/shadows/shadow_${key}.png` })),
            ...ARISE_KEYS.map(key => ({ key: `asset_${key}`, path: `assets/effects/arise/${key}.png` })),
            ...SHADOW_SOLDIER_VFX_KEYS.map(key => ({ key: `shadow_vfx_${key}`, path: `assets/effects/shadow_soldiers/${key}.png` }))
        );
    }

    return list;
}

// 게임 진입 직전 즉시 필요한 코어 에셋만 묶어 반환
export function getGameplayCoreAssetList(characterId = getStoredCharacterId(), options = {}) {
    const character = getCharacter(characterId);
    const list = [
        ...getMenuCoreAssetList(character.id),
        ...getSharedGameplayCoreAssetList(options),
        ...getCharacterStarterAssetList(character.id),
        ...getResumeExtraAssetList(character.id, options.savedData),
    ];
    return dedupeAssets(list);
}

// 전투 시작 후 백그라운드로 순차 스트리밍할 지연 에셋 배치 목록
export function getGameplayDeferredBatches(characterId = getStoredCharacterId(), options = {}) {
    const character = getCharacter(characterId);
    const coreKeys = new Set(getGameplayCoreAssetList(character.id, options).map(a => a.key));
    const weaponKeys = getCharacterWeaponKeys(character.id);
    const earlySkills = [];
    const lateSkills = [];
    for (let i = 0; i < weaponKeys.length; i++) {
        const wk = weaponKeys[i];
        const cfg = WEAPONS[wk];
        if (!cfg || cfg.unlockLevel <= 1) continue;
        const skillAssets = getCharacterSkillAssetsForWeapon(wk);
        if (cfg.unlockLevel <= 10) earlySkills.push(...skillAssets);
        else lateSkills.push(...skillAssets);
    }

    const ariseAndShadows = character.id === 'shadowMonarch'
        ? [
            ...ARISE_KEYS.map(key => ({ key: `asset_${key}`, path: `assets/effects/arise/${key}.png` })),
            ...SHADOW_KEYS.map(key => ({ key: `asset_shadow_${key}`, path: `assets/shadows/shadow_${key}.png` })),
            ...SHADOW_SOLDIER_VFX_KEYS.map(key => ({ key: `shadow_vfx_${key}`, path: `assets/effects/shadow_soldiers/${key}.png` })),
        ]
        : [];

    const rawBatches = [
        {
            id: 'skills_early',
            assets: earlySkills,
        },
        {
            id: 'enemies_mid_and_skills_late',
            assets: [
                { key: 'ai_enemy_orc', path: 'assets/enemies/source/orc.png' },
                { key: 'ai_enemy_iceBear', path: 'assets/enemies/source/iceBear.png' },
                ...lateSkills,
            ],
        },
        {
            id: 'boss_igris_and_system',
            assets: [
                { key: 'ai_boss_igris', path: 'assets/bosses/source/igris.png' },
                ...TELEGRAPH_KEYS.map(key => ({ key: `telegraph_${key}`, path: `assets/effects/telegraphs/${key}.png` })),
                ...BOSS_SUPPORT_KEYS.map(key => ({ key: `boss_vfx_${key}`, path: `assets/effects/boss_support/${key}.png` })),
                ...buildEnemyBossEffectAssets(['boss_igris_slash', 'boss_death_igris', 'boss_death_burst']),
                ...ariseAndShadows,
                { key: 'ui_modal_master', path: 'assets/ui/ui_modal_master.png' },
            ],
        },
        {
            id: 'enemies_late_and_boss_tusk',
            assets: [
                { key: 'ai_enemy_stoneGolem', path: 'assets/enemies/source/stoneGolem.png' },
                { key: 'ai_enemy_darkMage', path: 'assets/enemies/source/darkMage.png' },
                ...buildEnemyBossEffectAssets(['dark_mage_orb']),
                { key: 'ai_boss_tusk', path: 'assets/bosses/source/tusk.png' },
                ...buildEnemyBossEffectAssets(['boss_tusk_slam', 'boss_death_tusk']),
            ],
        },
        {
            id: 'enemies_endgame_and_boss_beru',
            assets: [
                { key: 'ai_enemy_ironKnight', path: 'assets/enemies/source/ironKnight.png' },
                { key: 'ai_enemy_demonWarrior', path: 'assets/enemies/source/demonWarrior.png' },
                { key: 'ai_boss_beru', path: 'assets/bosses/source/beru.png' },
                ...buildEnemyBossEffectAssets(['boss_beru_acid', 'boss_death_beru']),
            ],
        },
    ];

    const seen = new Set(coreKeys);
    const out = [];
    for (let i = 0; i < rawBatches.length; i++) {
        const batch = rawBatches[i];
        const filtered = [];
        for (let j = 0; j < batch.assets.length; j++) {
            const asset = batch.assets[j];
            if (!asset || !asset.key || seen.has(asset.key)) continue;
            seen.add(asset.key);
            filtered.push(asset);
        }
        if (filtered.length > 0) {
            out.push({ id: batch.id, assets: filtered });
        }
    }
    return out;
}

export function getMenuAssetList() {
    return [
        { key: 'ui_skin_button', path: 'assets/ui/skin-button-v1.png' },
        { key: 'ui_skin_panel', path: 'assets/ui/skin-panel-v1.png' },
        { key: 'ui_crafted_button', path: 'assets/ui/crafted-button-v1.webp' },
        { key: 'ui_crafted_frame', path: 'assets/ui/crafted-frame-v1.webp' },
        ...UI_ASSET_KEYS.map(uiAsset),
        { key: 'ui_modal_master', path: 'assets/ui/ui_modal_master.png' },
        { key: 'env_shadow_portal', path: 'assets/environment/shadow_portal.png' },
        { key: 'ai_dungeon_atmosphere', path: 'assets/background/bg_dungeon_atmosphere.png' },
        ...getCharacterPortraitAssets(),
    ];
}

export function getGameplayAssetList(characterId = getStoredCharacterId()) {
    return [
        ...getMenuAssetList(),
        ...Object.keys(WEAPONS).map(key => ({
            key: `asset_icon_${key}`, path: `assets/ui/icons/${key}.png`,
            cacheVersion: CHARACTER_COMBAT_VFX_ASSET_VERSION,
        })),
        ...Object.keys(PASSIVES).map(key => ({ key: `asset_icon_${key}`, path: `assets/ui/icons/${key}.png` })),
        ...ITEM_KEYS.map(key => ({ key: `item_${key}`, path: `assets/items/${key}.png` })),
        ...TELEGRAPH_KEYS.map(key => ({ key: `telegraph_${key}`, path: `assets/effects/telegraphs/${key}.png` })),
        ...BOSS_SUPPORT_KEYS.map(key => ({ key: `boss_vfx_${key}`, path: `assets/effects/boss_support/${key}.png` })),
        ...ENV_KEYS.map(key => ({ key: `env_${key}`, path: `assets/environment/${key}.png` })),
        ...SHADOW_KEYS.map(key => ({ key: `asset_shadow_${key}`, path: `assets/shadows/shadow_${key}.png` })),
        ...getCharacterMotionAssets(characterId),
        ...getCharacterCombatVfxFrameAssets(characterId),
        ...CHARACTER_SKILL_EFFECT_KEYS.map(key => ({
            key: `char_skill_${key}`,
            path: `assets/effects/character_skills/${key}.png`,
            cacheVersion: CHARACTER_COMBAT_VFX_ASSET_VERSION,
        })),
        ...CHARACTER_BASIC_ATTACK_EFFECT_KEYS.map(key => ({
            key: `basic_attack_${key}`,
            path: `assets/effects/basic_attacks/${key}.png`,
            cacheVersion: CHARACTER_COMBAT_VFX_ASSET_VERSION,
        })),
        ...ARISE_KEYS.map(key => ({ key: `asset_${key}`, path: `assets/effects/arise/${key}.png` })),
        ...SHADOW_SOLDIER_VFX_KEYS.map(key => ({ key: `shadow_vfx_${key}`, path: `assets/effects/shadow_soldiers/${key}.png` })),
        { key: 'ai_player_idle', path: 'assets/player/player_idle.png' },
        { key: 'ai_dungeon_floor', path: 'assets/background/bg_dungeon_floor.png' },
        { key: 'ai_dungeon_atmosphere', path: 'assets/background/bg_dungeon_atmosphere.png' },
        ...PLAYER_MOTION_NAMES.map(name => ({
            key: `motion_${name}`,
            path: `assets/player/motion/${name}.png`,
            cacheVersion: CHARACTER_MOTION_ASSET_VERSION,
        })),
        ...ENEMY_KEYS.map(key => ({ key: `ai_enemy_${key}`, path: `assets/enemies/source/${key}.png` })),
        ...BOSS_KEYS.map(key => ({ key: `ai_boss_${key}`, path: `assets/bosses/source/${key}.png` })),
        ...BASE_EFFECT_KEYS.map(key => ({ key: `effect_${key}`, path: `assets/effects/${key}.png` })),
        ...COMBAT_EFFECT_KEYS.flatMap(key => {
            const filePrefix = COMBAT_EFFECT_FILE_PREFIXES[key] || key;
            const frameCount = COMBAT_EFFECT_FRAME_COUNTS[key] || 6;
            return Array.from({ length: frameCount }, (_, i) => ({
                key: `effect_${key}_${i}`,
                path: `assets/effects/combat/${filePrefix}_${i}.png`,
                preferPng: key === 'monster_death',
            }));
        }),
        ...ENEMY_BOSS_EFFECT_KEYS.flatMap(key => (
            Array.from({ length: 6 }, (_, i) => ({ key: `effect_${key}_${i}`, path: `assets/effects/enemy_boss/${key}_${i}.png` }))
        )),
    ];
}
