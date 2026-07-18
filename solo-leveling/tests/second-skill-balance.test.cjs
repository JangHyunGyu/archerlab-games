const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');

function expectedDps(config, character, damageMultiplier = 1, hitCount = 1) {
    const playerLevelMultiplier = 1.16; // Lv.5 acquisition point
    const raw = (config.baseDamage + character.stats.attack) * playerLevelMultiplier;
    const normal = Math.floor(Math.floor(raw) * damageMultiplier) * hitCount;
    const crit = Math.floor(Math.floor(raw * character.stats.critDamage) * damageMultiplier) * hitCount;
    const expectedCast = normal * (1 - character.stats.critRate) + crit * character.stats.critRate;
    const cooldownSeconds = config.baseCooldown * (1 - character.stats.cooldownReduction) / 1000;
    return expectedCast / cooldownSeconds;
}

(async () => {
    const constantsUrl = pathToFileURL(path.join(root, 'js', 'utils', 'Constants.js')).href;
    const charactersUrl = pathToFileURL(path.join(root, 'js', 'utils', 'Characters.js')).href;
    const { WEAPONS } = await import(constantsUrl);
    const { CHARACTER_DEFS } = await import(charactersUrl);

    const flame = CHARACTER_DEFS.flameMage;
    const flameBasicDps = expectedDps(WEAPONS.flameSpark, flame);
    const flameBoltDps = expectedDps(WEAPONS.flameBolt, flame, WEAPONS.flameBolt.damageMult);
    const flameRatio = flameBoltDps / flameBasicDps;
    assert.ok(flameRatio >= 0.72 && flameRatio <= 0.85, `flameBolt single-target ratio ${flameRatio.toFixed(3)}`);
    assert.strictEqual(WEAPONS.flameBolt.baseCooldown, 1700);
    assert.strictEqual(WEAPONS.flameBolt.damageMult, 0.95);

    const healer = CHARACTER_DEFS.sanctuaryHealer;
    const healerBasicDps = expectedDps(WEAPONS.sanctuaryStrike, healer);
    const sanctuaryDps = expectedDps(WEAPONS.sanctuaryOrb, healer, WEAPONS.sanctuaryOrb.damageMult);
    const sanctuaryRatio = sanctuaryDps / healerBasicDps;
    assert.ok(sanctuaryRatio >= 0.38 && sanctuaryRatio <= 0.5, `sanctuaryOrb single-target ratio ${sanctuaryRatio.toFixed(3)}`);
    assert.strictEqual(WEAPONS.sanctuaryOrb.baseCooldown, 2000);
    assert.strictEqual(WEAPONS.sanctuaryOrb.healPercent, 0.035);
    assert.strictEqual(WEAPONS.sanctuaryOrb.healCooldownMs, 4000);
    assert.strictEqual(WEAPONS.sanctuaryOrb.slowMultiplier, 0.8);
    assert.strictEqual(WEAPONS.sanctuaryOrb.slowDuration, 1200);

    console.log(`second-skill balance verified: flame ${(flameRatio * 100).toFixed(0)}%, sanctuary ${(sanctuaryRatio * 100).toFixed(0)}% of basic single-target DPS plus utility`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
