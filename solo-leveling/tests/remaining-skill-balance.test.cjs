const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');

function expectedComponentDamage(config, character, playerLevel, multiplier) {
    const levelMultiplier = 1 + (playerLevel - 1) * 0.04;
    const raw = (config.baseDamage + character.stats.attack) * levelMultiplier;
    const normal = Math.floor(Math.floor(raw) * multiplier);
    const crit = Math.floor(Math.floor(raw * character.stats.critDamage) * multiplier);
    return normal * (1 - character.stats.critRate) + crit * character.stats.critRate;
}

function expectedDps(config, character, playerLevel, components) {
    const castDamage = components.reduce((total, component) => {
        return total + expectedComponentDamage(config, character, playerLevel, component.multiplier) * component.hits;
    }, 0);
    const cooldownSeconds = config.baseCooldown * (1 - character.stats.cooldownReduction) / 1000;
    return castDamage / cooldownSeconds;
}

function assertBand(value, min, max, label) {
    assert.ok(value >= min && value <= max, `${label} expected DPS ${value.toFixed(2)} outside ${min}-${max}`);
}

(async () => {
    const constantsUrl = pathToFileURL(path.join(root, 'js', 'utils', 'Constants.js')).href;
    const charactersUrl = pathToFileURL(path.join(root, 'js', 'utils', 'Characters.js')).href;
    const { WEAPONS } = await import(constantsUrl);
    const { CHARACTER_DEFS, CHARACTER_WEAPON_LOADOUTS } = await import(charactersUrl);

    const profiles = [
        { key: 'shadowSlash', character: 'shadowMonarch', level: 10, components: [{ multiplier: 1, hits: 1 }], band: [130, 150] },
        { key: 'lightCrescent', character: 'lightSwordswoman', level: 10, components: [{ multiplier: 1.12, hits: 1 }], band: [130, 155] },
        { key: 'tigerRend', character: 'whiteTigerBrawler', level: 10, components: [{ multiplier: 0.9, hits: 1 }], band: [80, 105] },
        { key: 'flameArc', character: 'flameMage', level: 10, components: [{ multiplier: 0.3, hits: 3 }, { multiplier: 0.06, hits: 3 }], band: [90, 115] },
        { key: 'sanctuaryArc', character: 'sanctuaryHealer', level: 10, components: [{ multiplier: 0.8, hits: 1 }], band: [45, 65] },

        { key: 'rulersAuthority', character: 'shadowMonarch', level: 15, components: [{ multiplier: 0.72, hits: 1 }], band: [55, 70] },
        { key: 'lightJudgment', character: 'lightSwordswoman', level: 15, components: [{ multiplier: 0.56, hits: 2 }], band: [95, 115] },
        { key: 'tigerQuake', character: 'whiteTigerBrawler', level: 15, components: [{ multiplier: 0.75, hits: 1 }], band: [55, 70] },
        { key: 'flameMeteor', character: 'flameMage', level: 15, components: [{ multiplier: 0.5, hits: 2 }], band: [65, 80] },
        { key: 'sanctuarySeal', character: 'sanctuaryHealer', level: 15, components: [{ multiplier: 0.72, hits: 1 }], band: [45, 60] },

        { key: 'dragonFear', character: 'shadowMonarch', level: 20, components: [{ multiplier: 1, hits: 1 }], band: [50, 70] },
        { key: 'lightSanctum', character: 'lightSwordswoman', level: 20, components: [{ multiplier: 0.8, hits: 1 }], band: [50, 70] },
        { key: 'tigerGuard', character: 'whiteTigerBrawler', level: 20, components: [{ multiplier: 0.75, hits: 1 }], band: [35, 50] },
        { key: 'flameInferno', character: 'flameMage', level: 20, components: [{ multiplier: 0.45, hits: 1 }, { multiplier: 0.25, hits: 3 }], band: [55, 75] },
        { key: 'sanctuaryField', character: 'sanctuaryHealer', level: 20, components: [{ multiplier: 0.35, hits: 1 }, { multiplier: 0.18, hits: 2 }], band: [20, 35] },
    ];

    const expectedRemainingSkills = Object.values(CHARACTER_WEAPON_LOADOUTS).flatMap(loadout => loadout.slice(2));
    assert.strictEqual(new Set(expectedRemainingSkills).size, 15, 'all 15 Lv.10/15/20 skills must be unique');
    assert.deepStrictEqual(new Set(profiles.map(profile => profile.key)), new Set(expectedRemainingSkills));

    const rows = [];
    for (const profile of profiles) {
        const config = WEAPONS[profile.key];
        const character = CHARACTER_DEFS[profile.character];
        const dps = expectedDps(config, character, profile.level, profile.components);
        assertBand(dps, ...profile.band, profile.key);
        rows.push(`${profile.key}=${dps.toFixed(1)}`);
    }

    assert.ok(WEAPONS.tigerQuake.slowMultiplier <= 0.72 && WEAPONS.tigerQuake.slowDuration >= 1200);
    assert.ok(WEAPONS.tigerGuard.slowMultiplier <= 0.6 && WEAPONS.tigerGuard.auraDuration >= 1500);
    assert.ok(WEAPONS.sanctuaryArc.slowMultiplier <= 0.8 && WEAPONS.sanctuaryArc.slowDuration >= 1000);
    assert.ok(WEAPONS.sanctuarySeal.slowMultiplier <= 0.78 && WEAPONS.sanctuarySeal.slowDuration >= 1400);
    assert.strictEqual(WEAPONS.flameInferno.tickCount, 3);
    assert.strictEqual(WEAPONS.sanctuaryField.tickCount, 2);
    assert.strictEqual(WEAPONS.sanctuaryField.healPercent, 0.07);
    assert.strictEqual(WEAPONS.sanctuaryField.healCooldownMs, 7600);

    const dragonFearSource = fs.readFileSync(path.join(root, 'js', 'weapons', 'DragonFear.js'), 'utf8');
    assert.ok(
        dragonFearSource.includes('(this.config.slowMultiplier ?? 0.4) - this.extraSlow'),
        'aura slow upgrades must reduce the configured movement multiplier',
    );

    console.log(`remaining skill balance verified: ${rows.join(', ')}`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
