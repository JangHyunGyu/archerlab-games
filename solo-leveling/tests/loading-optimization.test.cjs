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

        // Motion isolation
        if (id === 'shadowMonarch') {
            assert.ok(coreKeys.has('motion_player_idle_0'), 'shadowMonarch core keeps motion_player_idle_0');
        } else {
            assert.ok(![...coreKeys].some(k => k.startsWith('motion_player_')), `${id} core excludes motion_player_*`);
            assert.ok(coreKeys.has(`${CHARACTER_DEFS[id].texturePrefix}_idle_0`), `${id} core keeps own idle_0`);
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
        for (const enemyKey of ['orc', 'iceBear', 'stoneGolem', 'darkMage', 'ironKnight', 'demonWarrior']) {
            assert.ok(deferredKeys.has(`ai_enemy_${enemyKey}`), `${id} deferred covers enemy ${enemyKey}`);
        }
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
        'js/entities/Boss.js',
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
