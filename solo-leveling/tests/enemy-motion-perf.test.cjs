const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');

const ALL_ENEMIES = [
    'goblin', 'steelFangLycan', 'antSoldier', 'orc', 'iceBear',
    'iceElf', 'stoneGolem', 'darkMage', 'ironKnight', 'demonWarrior',
];
const EARLY_ENEMIES = ['goblin', 'steelFangLycan', 'antSoldier', 'orc', 'iceBear'];
const LATE_ENEMIES = ['iceElf', 'stoneGolem', 'darkMage', 'ironKnight', 'demonWarrior'];
const ALL_BOSSES = ['igris', 'tusk', 'beru'];
const REGEN_VFX = ['dark_mage_orb', 'boss_igris_slash', 'boss_tusk_slam', 'boss_beru_acid'];

function stripStringsAndComments(src) {
    return src
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '""')
        .replace(/'(?:\\[\s\S]|[^\\'])*'/g, '""')
        .replace(/"(?:\\[\s\S]|[^\\"])*"/g, '""');
}

(async () => {
    globalThis.window = {
        location: { search: '', pathname: '/' },
        dispatchEvent: () => {},
    };
    const constantsMod = await import(pathToFileURL(path.join(root, 'js', 'utils', 'Constants.js')).href);
    const i18nMod = await import(pathToFileURL(path.join(root, 'js', 'utils', 'i18n.js')).href);
    const { ENEMY_TYPES, BOSS_TYPES } = constantsMod;
    const { setLang, tNested } = i18nMod;

    // 1. Constants + i18n coverage for all 10 enemies & 3 bosses
    for (const lang of ['ko', 'en', 'ja']) {
        setLang(lang);
        for (const k of ALL_ENEMIES) {
            assert.ok(ENEMY_TYPES[k], `ENEMY_TYPES missing ${k}`);
            const label = tNested('enemies', k);
            assert.ok(label && label !== k, `i18n.${lang}.enemies missing ${k}`);
        }
    }
    for (const k of ALL_ENEMIES) {
        for (const ext of ['png', 'webp']) {
            const p = path.join(root, 'assets', 'enemies', 'source', `${k}.${ext}`);
            assert.ok(fs.existsSync(p) && fs.statSync(p).size > 0, `missing enemy source ${k}.${ext}`);
        }
    }

    for (const b of ALL_BOSSES) {
        assert.ok(BOSS_TYPES[b], `BOSS_TYPES missing ${b}`);
        for (const ext of ['png', 'webp']) {
            const p = path.join(root, 'assets', 'bosses', 'source', `${b}.${ext}`);
            assert.ok(fs.existsSync(p) && fs.statSync(p).size > 0, `missing boss source ${b}.${ext}`);
        }
    }

    // 2. Enemy & Boss motion atlases (4 walk + 4 attack per key, <= 2048x2048)
    const atlasChecks = [
        { name: 'enemies_early', keys: EARLY_ENEMIES },
        { name: 'enemies_late', keys: LATE_ENEMIES },
        ...ALL_BOSSES.map(b => ({ name: `boss_${b}`, keys: [b] })),
    ];
    for (const check of atlasChecks) {
        const jsonPath = path.join(root, 'assets', 'atlases', `${check.name}.json`);
        const webpPath = path.join(root, 'assets', 'atlases', `${check.name}.webp`);
        assert.ok(fs.existsSync(jsonPath) && fs.existsSync(webpPath), `missing atlas ${check.name}`);
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        assert.ok(parsed.meta && parsed.meta.size.w <= 2048 && parsed.meta.size.h <= 2048, `${check.name} exceeds 2048x2048`);
        for (const key of check.keys) {
            for (const anim of ['walk', 'attack']) {
                for (let f = 0; f < 4; f++) {
                    const frameName = `${key}_${anim}_${f}`;
                    assert.ok(parsed.frames[frameName], `${check.name} missing frame ${frameName}`);
                }
            }
        }
    }

    // 3. Regenerated VFX frames (0..5 PNG + WebP)
    for (const vfx of REGEN_VFX) {
        for (let f = 0; f < 6; f++) {
            for (const ext of ['png', 'webp']) {
                const p = path.join(root, 'assets', 'effects', 'enemy_boss', `${vfx}_${f}.${ext}`);
                assert.ok(fs.existsSync(p) && fs.statSync(p).size > 0, `missing VFX ${vfx}_${f}.${ext}`);
            }
        }
    }

    // 4. XPOrb pooling & zero infinite repeat tweens
    const xpSrc = fs.readFileSync(path.join(root, 'js', 'entities', 'XPOrb.js'), 'utf8');
    assert.doesNotMatch(xpSrc, /repeat\s*:\s*-1/, 'XPOrb.js must not spawn repeat:-1 tweens');
    assert.match(xpSrc, /_inactiveOrbs/, 'XPOrb.js must use O(1) _inactiveOrbs stack');
    assert.match(xpSrc, /_activeOrbs/, 'XPOrb.js must maintain dense _activeOrbs list');
    assert.match(xpSrc, /if \(dist < pickupRange\) \{\s*if \(this\.scene\._levelUpActive\) return;\s*this\._collect\(orb, player\);/);

    // 5. Enemy motion, hitbox invariance, VFX guards, and zero per-hit flash timers
    const enemySrc = fs.readFileSync(path.join(root, 'js', 'entities', 'Enemy.js'), 'utf8');
    assert.doesNotMatch(enemySrc, /_hitFlashTimer[AB]/, 'Enemy.js must not use per-hit delayedCall flash timers');
    assert.match(enemySrc, /static _beginFrame\(/);
    assert.match(enemySrc, /static updateFrameVfx\(/);
    assert.match(enemySrc, /static updateProjectiles\(/);
    assert.match(enemySrc, /applyAtlasTexture\(/);
    assert.match(enemySrc, /triggerMeleeAttack\(/);
    assert.match(enemySrc, /body\.setSize\(this\.width \* 0\.6,\s*this\.height \* 0\.6,\s*true\)/);
    assert.strictEqual((enemySrc.match(/if \(usedAsset\) return;/g) || []).length, 3, 'Enemy.js must preserve 3 usedAsset early returns');

    // 6. Boss motion & regenerated VFX wiring
    const bossSrc = fs.readFileSync(path.join(root, 'js', 'entities', 'Boss.js'), 'utf8');
    assert.match(bossSrc, /BOSS_MOTION_CONFIG/);
    assert.match(bossSrc, /applyAtlasTexture\(/);
    assert.match(bossSrc, /_startAttackMotion\(/);
    assert.match(bossSrc, /body\.setSize\(this\.width \* 0\.7,\s*this\.height \* 0\.7,\s*true\)/);
    for (const vfx of ['effect_boss_igris_slash', 'effect_boss_tusk_slam', 'effect_boss_beru_acid']) {
        assert.ok(bossSrc.includes(vfx), `Boss.js must wire regenerated ${vfx}`);
    }

    // 7. EnemyManager horde cap & new enemies
    const emSrc = fs.readFileSync(path.join(root, 'js', 'managers', 'EnemyManager.js'), 'utf8');
    assert.match(emSrc, /Enemy\._beginFrame\(/);
    assert.match(emSrc, /_getActiveEnemyCap\(/);
    assert.match(emSrc, /_getRawMaxEnemies\(/);
    assert.ok(emSrc.includes('steelFangLycan') && emSrc.includes('iceElf'), 'EnemyManager.js must spawn new enemies');

    // 8. Strict ES2019 check across modified JS files
    const modifiedFiles = [
        'js/utils/Constants.js',
        'js/utils/i18n.js',
        'js/utils/AssetManifest.js',
        'js/utils/SpriteFactory.js',
        'js/entities/Enemy.js',
        'js/entities/Boss.js',
        'js/managers/EnemyManager.js',
        'js/entities/XPOrb.js',
        'js/scenes/GameScene.js',
        'js/weapons/ShadowDagger.js',
        'js/entities/ShadowSoldier.js',
        'js/entities/Player.js',
    ];
    for (const rel of modifiedFiles) {
        const cleaned = stripStringsAndComments(fs.readFileSync(path.join(root, rel), 'utf8'));
        assert.doesNotMatch(cleaned, /\?\./, `${rel} must not contain ES2020 optional chaining (?.)`);
        assert.doesNotMatch(cleaned, /\?\?/, `${rel} must not contain ES2020 nullish coalescing (??)`);
    }

    console.log('enemy-motion-perf verified: 10 enemies + 3 bosses + 4 VFX + strict ES2019 + horde pooling invariants passed');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
