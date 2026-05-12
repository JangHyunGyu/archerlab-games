import { PASSIVES, WEAPONS } from './Constants.js';
import {
    CHARACTER_BASIC_ATTACK_EFFECT_KEYS,
    CHARACTER_DEFS,
    CHARACTER_FRAME_NAMES,
    CHARACTER_SKILL_EFFECT_KEYS,
    getCharacter,
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
const COMBAT_EFFECT_KEYS = ['basic_stab', 'flame_burn', 'monster_hit', 'monster_crit', 'monster_death'];
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
        Array.from({ length: 8 }, (_, i) => `player_walk_${dir}_${i}`)
    ),
    ...Array.from({ length: 6 }, (_, i) => `player_attack_${i}`),
    ...['down', 'right', 'up', 'left'].flatMap(dir =>
        Array.from({ length: 6 }, (_, i) => `player_attack_${dir}_${i}`)
    ),
    ...Array.from({ length: 2 }, (_, i) => `player_hit_${i}`),
];

const uiAsset = (key) => ({
    key: key.includes('/') ? key.split('/').pop() : key,
    path: `assets/ui/${key}.png`,
});

const frameAssets = (prefix, dir, names) => names.map(name => ({
    key: `${prefix}_${name}`,
    path: `${dir}/${name}.png`,
}));

export function getCharacterPortraitAssets() {
    return Object.values(CHARACTER_DEFS).flatMap(character => ([
        {
            key: `char_${character.assetKey}_portrait`,
            path: `assets/player/characters/${character.assetKey}/portrait.png`,
        },
        {
            key: `char_${character.assetKey}_menu_portrait`,
            path: `assets/player/characters/${character.assetKey}/menu_portrait.png`,
        },
    ]));
}

export function getCharacterMotionAssets(characterId = getStoredCharacterId()) {
    const character = getCharacter(characterId);
    if (character.usesExistingPlayerMotion) return [];
    return frameAssets(
        character.texturePrefix,
        `assets/player/characters/${character.assetKey}/motion`,
        CHARACTER_FRAME_NAMES
    );
}

export function getMenuAssetList() {
    return [
        ...UI_ASSET_KEYS.map(uiAsset),
        { key: 'env_shadow_portal', path: 'assets/environment/shadow_portal.png' },
        { key: 'ai_dungeon_atmosphere', path: 'assets/background/bg_dungeon_atmosphere.png' },
        ...getCharacterPortraitAssets(),
    ];
}

export function getGameplayAssetList(characterId = getStoredCharacterId()) {
    return [
        ...getMenuAssetList(),
        ...Object.keys(WEAPONS).map(key => ({ key: `asset_icon_${key}`, path: `assets/ui/icons/${key}.png` })),
        ...Object.keys(PASSIVES).map(key => ({ key: `asset_icon_${key}`, path: `assets/ui/icons/${key}.png` })),
        ...ITEM_KEYS.map(key => ({ key: `item_${key}`, path: `assets/items/${key}.png` })),
        ...TELEGRAPH_KEYS.map(key => ({ key: `telegraph_${key}`, path: `assets/effects/telegraphs/${key}.png` })),
        ...BOSS_SUPPORT_KEYS.map(key => ({ key: `boss_vfx_${key}`, path: `assets/effects/boss_support/${key}.png` })),
        ...ENV_KEYS.map(key => ({ key: `env_${key}`, path: `assets/environment/${key}.png` })),
        ...SHADOW_KEYS.map(key => ({ key: `asset_shadow_${key}`, path: `assets/shadows/shadow_${key}.png` })),
        ...getCharacterMotionAssets(characterId),
        ...CHARACTER_SKILL_EFFECT_KEYS.map(key => ({ key: `char_skill_${key}`, path: `assets/effects/character_skills/${key}.png` })),
        ...CHARACTER_BASIC_ATTACK_EFFECT_KEYS.map(key => ({ key: `basic_attack_${key}`, path: `assets/effects/basic_attacks/${key}.png` })),
        ...ARISE_KEYS.map(key => ({ key: `asset_${key}`, path: `assets/effects/arise/${key}.png` })),
        ...SHADOW_SOLDIER_VFX_KEYS.map(key => ({ key: `shadow_vfx_${key}`, path: `assets/effects/shadow_soldiers/${key}.png` })),
        { key: 'ai_player_idle', path: 'assets/player/player_idle.png' },
        { key: 'ai_dungeon_floor', path: 'assets/background/bg_dungeon_floor.png' },
        { key: 'ai_dungeon_atmosphere', path: 'assets/background/bg_dungeon_atmosphere.png' },
        ...PLAYER_MOTION_NAMES.map(name => ({ key: `motion_${name}`, path: `assets/player/motion/${name}.png` })),
        ...ENEMY_KEYS.map(key => ({ key: `ai_enemy_${key}`, path: `assets/enemies/source/${key}.png` })),
        ...BOSS_KEYS.map(key => ({ key: `ai_boss_${key}`, path: `assets/bosses/source/${key}.png` })),
        ...BASE_EFFECT_KEYS.map(key => ({ key: `effect_${key}`, path: `assets/effects/${key}.png` })),
        ...COMBAT_EFFECT_KEYS.flatMap(key => (
            Array.from({ length: 6 }, (_, i) => ({ key: `effect_${key}_${i}`, path: `assets/effects/combat/${key}_${i}.png` }))
        )),
        ...ENEMY_BOSS_EFFECT_KEYS.flatMap(key => (
            Array.from({ length: 6 }, (_, i) => ({ key: `effect_${key}_${i}`, path: `assets/effects/enemy_boss/${key}_${i}.png` }))
        )),
    ];
}
