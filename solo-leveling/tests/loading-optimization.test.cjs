'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

function walkJs(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkJs(full, out);
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

(async () => {
    const manifest = await import(pathToFileURL(path.join(root, 'js', 'utils', 'AssetManifest.js')));
    const chars = await import(pathToFileURL(path.join(root, 'js', 'utils', 'Characters.js')));
    const consts = await import(pathToFileURL(path.join(root, 'js', 'utils', 'Constants.js')));

    const {
        getMenuCoreAssetList,
        getMenuDeferredAssetList,
        getGameplayCoreAssetList,
        getGameplayDeferredBatches,
        getMenuAssetList,
        getGameplayAssetList,
    } = manifest;
    const { CHARACTER_DEFS, getCharacterWeaponKeys } = chars;
    const { WEAPONS, PASSIVES } = consts;

    // 1. Existing full exports remain intact
    assert.ok(getMenuAssetList().length >= 50, 'legacy getMenuAssetList stays intact');
    assert.ok(getGameplayAssetList('shadowMonarch').length >= 400, 'legacy getGameplayAssetList stays intact');

    // 2. Menu Core contains only active portrait + essential chrome
    const menuCore = getMenuCoreAssetList('shadowMonarch');
    const menuCoreKeys = new Set(menuCore.map(a => a.key));
    assert.ok(menuCore.length <= 15, `menu core must stay lean (got ${menuCore.length})`);
    assert.ok(menuCoreKeys.has('shadow_gate_backdrop'));
    assert.ok(menuCoreKeys.has('ui_skin_button'));
    assert.ok(menuCoreKeys.has('ui_skin_panel'));
    assert.ok(menuCoreKeys.has('ui_crafted_button'));
    assert.ok(menuCoreKeys.has('ui_crafted_frame'));
    assert.ok(menuCoreKeys.has('char_original_shadow_monarch_menu_portrait'));
    for (const other of ['lightSwordswoman', 'whiteTigerBrawler', 'flameMage', 'sanctuaryHealer']) {
        const assetKey = CHARACTER_DEFS[other].assetKey;
        assert.ok(!menuCoreKeys.has(`char_${assetKey}_menu_portrait`), `menu core must defer ${other} portrait`);
        assert.ok(!menuCoreKeys.has(`char_${assetKey}_portrait`), `menu core must not preload full ${other} portrait`);
    }
    for (const unused of ['hunter_card_normal', 'rank_card_1', 'ui_modal_master', 'ui_panel_cyan', 'ui_card_cyan']) {
        assert.ok(!menuCoreKeys.has(unused), `menu core must not preload unused/deferred chrome ${unused}`);
    }

    const menuDeferred = getMenuDeferredAssetList('shadowMonarch');
    assert.equal(menuDeferred.length, 4, 'menu deferred contains remaining 4 character portraits');

    // 3. Per-character Gameplay Core + Deferred Batches isolation
    for (const id of Object.keys(CHARACTER_DEFS)) {
        const core = getGameplayCoreAssetList(id);
        const coreKeys = new Set(core.map(a => a.key));
        const ownWeaponKeys = new Set(getCharacterWeaponKeys(id));
        const charDef = CHARACTER_DEFS[id];

        // Own icons & passive icons present
        for (const wk of ownWeaponKeys) {
            assert.ok(coreKeys.has(`asset_icon_${wk}`), `${id} core includes own weapon icon ${wk}`);
        }
        for (const pk of Object.keys(PASSIVES)) {
            assert.ok(coreKeys.has(`asset_icon_${pk}`), `${id} core includes passive icon ${pk}`);
        }

        // Starter basic attack present
        const starter = WEAPONS[getCharacterWeaponKeys(id)[0]];
        assert.ok(coreKeys.has(`basic_attack_${starter.basicAttackEffectKey}`), `${id} core includes starter basic VFX`);
        for (let f = 0; f < 6; f++) {
            assert.ok(coreKeys.has(`basic_attack_${starter.basicAttackEffectKey}_${f}`), `${id} core includes starter frame ${f}`);
        }

        // Motion & combat VFX atlases active by default
        assert.ok(coreKeys.has(`atlas_motion_${charDef.assetKey}`), `${id} core uses motion atlas`);
        assert.ok(coreKeys.has('atlas_vfx_combat_hit'), `${id} core includes shared combat hit/crit atlas`);
        assert.ok(coreKeys.has('atlas_vfx_combat_death'), `${id} core includes shared combat death atlas`);
        assert.ok(coreKeys.has('atlas_enemies_early'), `${id} core includes early enemy motion atlas`);
        if (id === 'flameMage') {
            assert.ok(coreKeys.has('atlas_vfx_flame_burn'), 'flameMage core uses burn atlas');
        }
        if (id === 'sanctuaryHealer') {
            assert.ok(coreKeys.has('atlas_vfx_sanctuary_hit'), 'sanctuaryHealer core uses sanctuary hit atlas');
        }
        assert.ok(![...coreKeys].some(k => k.startsWith('motion_player_')), `${id} atlas core excludes individual motion_player_*`);
        assert.ok(!coreKeys.has(`${charDef.texturePrefix}_idle_0`), `${id} atlas core excludes individual idle_0`);
        assert.ok(!coreKeys.has('effect_monster_hit_0'), `${id} atlas core excludes individual effect_monster_hit_0`);
        assert.ok(!coreKeys.has('effect_monster_death_0'), `${id} atlas core excludes individual effect_monster_death_0`);

        // Fallback mode (useAtlases: false) keeps individual frames isolated per character
        const fallbackKeys = new Set(getGameplayCoreAssetList(id, { useAtlases: false }).map(a => a.key));
        if (id === 'shadowMonarch') {
            assert.ok(fallbackKeys.has('motion_player_idle_0'), 'shadowMonarch fallback core keeps motion_player_idle_0');
        } else {
            assert.ok(![...fallbackKeys].some(k => k.startsWith('motion_player_')), `${id} fallback core excludes motion_player_*`);
            assert.ok(fallbackKeys.has(`${charDef.texturePrefix}_idle_0`), `${id} fallback core keeps own idle_0`);
        }
        assert.ok(fallbackKeys.has('effect_monster_hit_0'), `${id} fallback core keeps effect_monster_hit_0`);

        // Verify no other character's atlas leaks into core
        for (const otherId of Object.keys(CHARACTER_DEFS)) {
            if (otherId === id) continue;
            assert.ok(!coreKeys.has(`atlas_motion_${CHARACTER_DEFS[otherId].assetKey}`), `${id} core excludes ${otherId} motion atlas`);
        }

        // No other character weapon VFX in core OR deferred batches
        const batches = getGameplayDeferredBatches(id);
        const deferredKeys = new Set(batches.flatMap(b => b.assets.map(a => a.key)));
        for (const [wk, cfg] of Object.entries(WEAPONS)) {
            if (ownWeaponKeys.has(wk)) continue;
            if (cfg.basicAttackEffectKey) {
                assert.ok(!coreKeys.has(`basic_attack_${cfg.basicAttackEffectKey}`), `${id} core excludes ${wk}`);
                assert.ok(!deferredKeys.has(`basic_attack_${cfg.basicAttackEffectKey}`), `${id} deferred excludes ${wk}`);
            }
            if (cfg.effectKey) {
                assert.ok(!coreKeys.has(`char_skill_${cfg.effectKey}`), `${id} core excludes ${wk}`);
                assert.ok(!deferredKeys.has(`char_skill_${cfg.effectKey}`), `${id} deferred excludes ${wk}`);
            }
        }

        // Fresh core excludes late enemies and all bosses
        assert.ok(!coreKeys.has('ai_enemy_ironKnight'), `${id} fresh core excludes ironKnight`);
        assert.ok(!coreKeys.has('ai_enemy_demonWarrior'), `${id} fresh core excludes demonWarrior`);
        assert.ok(!coreKeys.has('ai_boss_igris'), `${id} fresh core excludes bosses`);
        assert.ok(!coreKeys.has('effect_boss_igris_slash_0'), `${id} fresh core excludes boss VFX`);

        // Deferred batches cover active Lv.5-20 skills, mid/late enemies, and all 3 bosses
        for (const wk of ownWeaponKeys) {
            const cfg = WEAPONS[wk];
            if (cfg.unlockLevel > 1) {
                assert.ok(deferredKeys.has(`char_skill_${cfg.effectKey}`), `${id} deferred covers Lv.${cfg.unlockLevel} skill ${wk}`);
                assert.ok(deferredKeys.has(`char_skill_${cfg.effectKey}_0`), `${id} deferred covers skill ${wk} frames`);
            }
        }
        for (const enemyKey of ['steelFangLycan', 'orc', 'iceBear', 'iceElf', 'stoneGolem', 'darkMage', 'ironKnight', 'demonWarrior']) {
            assert.ok(deferredKeys.has(`ai_enemy_${enemyKey}`), `${id} deferred covers enemy ${enemyKey}`);
        }
        assert.ok(deferredKeys.has('atlas_enemies_late'), `${id} deferred covers late enemy motion atlas`);
        assert.ok(deferredKeys.has('atlas_boss_igris'), `${id} deferred covers igris motion atlas`);
        assert.ok(deferredKeys.has('atlas_boss_tusk'), `${id} deferred covers tusk motion atlas`);
        assert.ok(deferredKeys.has('atlas_boss_beru'), `${id} deferred covers beru motion atlas`);
        for (const bossKey of ['igris', 'tusk', 'beru']) {
            assert.ok(deferredKeys.has(`ai_boss_${bossKey}`), `${id} deferred covers boss ${bossKey}`);
        }
        for (const legacyKey of ['effect_shadow_dagger', 'effect_shadow_slash', 'effect_ruler_authority', 'effect_dragon_fear', 'effect_basic_stab_0']) {
            assert.ok(!deferredKeys.has(legacyKey), `${id} deferred excludes legacy ${legacyKey}`);
        }

        // Resume savedData hydration includes active weapons, enemies, bosses, shadows
        const secondSkillKey = getCharacterWeaponKeys(id)[2];
        const resumeCoreKeys = new Set(getGameplayCoreAssetList(id, {
            savedData: {
                player: { level: 16 },
                weapons: [{ key: secondSkillKey }],
                enemyManager: { gameTime: 480000, activeEnemies: [{ typeKey: 'ironKnight' }] },
                activeBosses: [{ bossKey: 'tusk' }],
                shadows: [{ bossKey: 'igris' }],
            },
        }).map(a => a.key));
        assert.ok(resumeCoreKeys.has(`char_skill_${WEAPONS[secondSkillKey].effectKey}`), `${id} resume core includes saved weapon VFX`);
        assert.ok(resumeCoreKeys.has('ai_enemy_ironKnight'), `${id} resume core includes saved ironKnight`);
        assert.ok(resumeCoreKeys.has('ai_boss_tusk'), `${id} resume core includes saved boss tusk`);
        assert.ok(resumeCoreKeys.has('effect_boss_tusk_slam_0'), `${id} resume core includes saved boss VFX`);
        assert.ok(resumeCoreKeys.has('asset_shadow_melee'), `${id} resume core includes saved shadow sprite`);
    }

    // 3b. Validate all 9 generated atlas files (<= 2048x2048, required frames present)
    const requiredAtlases = [
        ...Object.values(CHARACTER_DEFS).map(c => ({
            name: `motion_${c.assetKey}`,
            mustHave: [
                'idle_0', 'idle_down_0', 'idle_right_0', 'idle_up_0', 'idle_left_0',
                'walk_0', 'walk_7', 'walk_down_0', 'walk_right_0', 'walk_up_0', 'walk_left_0',
                'attack_0', 'attack_down_0', 'hit_0', 'hit_1',
                ...(c.basicAttackVariants || []).flatMap(v => ['down', 'right', 'up', 'left'].map(d => `attack_${v}_${d}_0`)),
            ],
        })),
        {
            name: 'vfx_combat_hit',
            mustHave: [
                ...Array.from({ length: 12 }, (_, i) => `effect_monster_hit_${i}`),
                ...Array.from({ length: 16 }, (_, i) => `effect_monster_crit_${i}`),
            ],
        },
        {
            name: 'vfx_combat_death',
            mustHave: Array.from({ length: 16 }, (_, i) => `effect_monster_death_${i}`),
        },
        {
            name: 'vfx_flame_burn',
            mustHave: Array.from({ length: 12 }, (_, i) => `effect_flame_burn_${i}`),
        },
        {
            name: 'vfx_sanctuary_hit',
            mustHave: Array.from({ length: 16 }, (_, i) => `effect_sanctuary_hit_${i}`),
        },
        {
            name: 'enemies_early',
            mustHave: ['goblin', 'steelFangLycan', 'antSoldier', 'orc', 'iceBear'].flatMap(k =>
                [0, 1, 2, 3].flatMap(f => [`${k}_walk_${f}`, `${k}_attack_${f}`])
            ),
        },
        {
            name: 'enemies_late',
            mustHave: ['iceElf', 'stoneGolem', 'darkMage', 'ironKnight', 'demonWarrior'].flatMap(k =>
                [0, 1, 2, 3].flatMap(f => [`${k}_walk_${f}`, `${k}_attack_${f}`])
            ),
        },
        ...['igris', 'tusk', 'beru'].map(k => ({
            name: `boss_${k}`,
            mustHave: [0, 1, 2, 3].flatMap(f => [`${k}_walk_${f}`, `${k}_attack_${f}`]),
        })),
    ];
    for (const spec of requiredAtlases) {
        const webpPath = path.join(root, 'assets', 'atlases', `${spec.name}.webp`);
        const jsonPath = path.join(root, 'assets', 'atlases', `${spec.name}.json`);
        assert.ok(fs.existsSync(webpPath), `missing atlas image ${spec.name}.webp`);
        assert.ok(fs.existsSync(jsonPath), `missing atlas json ${spec.name}.json`);
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        assert.ok(parsed.meta && parsed.meta.size, `${spec.name} meta.size present`);
        assert.ok(parsed.meta.size.w <= 2048 && parsed.meta.size.h <= 2048, `${spec.name} within 2048x2048 GPU budget`);
        for (const frameName of spec.mustHave) {
            const entry = parsed.frames && parsed.frames[frameName];
            assert.ok(entry && entry.frame, `${spec.name} contains frame ${frameName}`);
            const f = entry.frame;
            assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= parsed.meta.size.w && f.y + f.h <= parsed.meta.size.h,
                `${spec.name} frame ${frameName} within sheet bounds`);
        }
    }

    // 3c. Validate all 60 SoundManager SFX have smaller MP3 copies under sounds/sfx_mp3/
    const smSrc = fs.readFileSync(path.join(root, 'js', 'managers', 'SoundManager.js'), 'utf8');
    const wavRefs = [...new Set([...smSrc.matchAll(/['"]([^'"]+\.wav)['"]/g)].map(m => m[1]))];
    assert.equal(wavRefs.length, 60, 'expected 60 WAV refs in SoundManager.js');
    for (const rel of wavRefs) {
        const wavFile = path.join(root, 'sounds', rel);
        const mp3File = path.join(root, 'sounds', 'sfx_mp3', rel.replace(/\.wav$/i, '.mp3'));
        assert.ok(fs.existsSync(mp3File), `missing compressed MP3 ${mp3File}`);
        assert.ok(fs.statSync(mp3File).size > 0 && fs.statSync(mp3File).size < fs.statSync(wavFile).size,
            `sfx_mp3/${rel} must be strictly smaller than ${rel}`);
    }

    // 4. Unified module query-strings across touched modules
    const byTarget = new Map();
    for (const file of walkJs(path.join(root, 'js'))) {
        const txt = fs.readFileSync(file, 'utf8');
        for (const m of txt.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
            const spec = m[1];
            if (!spec.startsWith('.')) continue;
            const [clean, qs] = spec.split('?');
            const target = path.relative(path.join(root, 'js'), path.resolve(path.dirname(file), clean));
            if (!byTarget.has(target)) byTarget.set(target, new Set());
            byTarget.get(target).add(qs || '(none)');
        }
    }
    for (const checked of [
        path.join('scenes', 'GameScene.js'),
        path.join('utils', 'AssetManifest.js'),
        path.join('utils', 'SpriteFactory.js'),
        path.join('managers', 'SoundManager.js'),
        path.join('entities', 'Player.js'),
        path.join('entities', 'Enemy.js'),
        path.join('weapons', 'BasicDagger.js'),
        path.join('managers', 'WeaponManager.js'),
    ]) {
        const versions = byTarget.get(checked);
        assert.ok(versions && versions.size === 1, `${checked} must not have duplicate module query-strings: ${JSON.stringify([...(versions || [])])}`);
    }

    // 5. No ES2020 optional chaining (?.) or nullish coalescing (??) in modified JS files
    for (const rel of [
        'js/main.js',
        'js/utils/AssetManifest.js',
        'js/utils/SpriteFactory.js',
        'js/scenes/PreloadScene.js',
        'js/scenes/MenuScene.js',
        'js/scenes/GameScene.js',
        'js/managers/EnemyManager.js',
        'js/managers/ShadowArmyManager.js',
        'js/managers/SoundManager.js',
        'js/managers/WeaponManager.js',
        'js/entities/Boss.js',
        'js/entities/Player.js',
        'js/entities/Enemy.js',
        'js/weapons/BasicDagger.js',
    ]) {
        const src = fs.readFileSync(path.join(root, rel), 'utf8')
            .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
            .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '');
        assert.ok(!src.includes('?.'), `${rel} must remain ES2019 compatible (found ?.)`);
        assert.ok(!src.includes('??'), `${rel} must remain ES2019 compatible (found ??)`);
    }

    console.log('solo-leveling loading optimization verified: menu core, tiered gameplay streaming, resume safety, module dedup, ES2019 clean');
})().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
