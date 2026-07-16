const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');

function projectedBounds(bounds, rotation = 0) {
    const center = 256;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const corners = [
        [bounds.left - center, bounds.top - center],
        [bounds.right - center, bounds.top - center],
        [bounds.right - center, bounds.bottom - center],
        [bounds.left - center, bounds.bottom - center],
    ].map(([x, y]) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
    return {
        minX: Math.min(...corners.map(point => point.x)),
        maxX: Math.max(...corners.map(point => point.x)),
        minY: Math.min(...corners.map(point => point.y)),
        maxY: Math.max(...corners.map(point => point.y)),
    };
}

function assertCoverage(rows, key, coverage, min = 0.85, max = 1.05, role = 'range') {
    assert.ok(Number.isFinite(coverage), `${key}: non-finite ${role} coverage`);
    assert.ok(coverage >= min && coverage <= max, `${key}: ${role} coverage ${coverage.toFixed(3)} outside ${min}-${max}`);
    rows.push({ key, role, coverage: Math.round(coverage * 1000) / 1000 });
}

(async () => {
    const constantsUrl = pathToFileURL(path.join(root, 'js', 'utils', 'Constants.js')).href;
    const metricsUrl = pathToFileURL(path.join(root, 'js', 'utils', 'CombatVfxMetrics.js')).href;
    const { WEAPONS } = await import(constantsUrl);
    const { getCombatVfxVisibleBounds } = await import(metricsUrl);
    const rows = [];

    const basicIdentity = key => `basic_attack_${WEAPONS[key].basicAttackEffectKey}`;
    const skillIdentity = key => `char_skill_${WEAPONS[key].effectKey}`;

    // Character-centered directional basics fit their visible outer edge to 90% of the hit range.
    for (const [key, centerForward, rotation] of [
        ['basicDagger', 86, 0],
        ['lightPierce', 70, 0],
        ['tigerPalm', 82, 0.08],
    ]) {
        const config = WEAPONS[key];
        const hitRange = config.attackRange + (config.hitRangeBonus || 0);
        const projection = projectedBounds(getCombatVfxVisibleBounds(basicIdentity(key)), rotation);
        const scale = (hitRange * config.visualRangeRatio - centerForward) / projection.maxX;
        const coverage = (centerForward + projection.maxX * scale) / hitRange;
        assertCoverage(rows, key, coverage);
    }

    // Projectile core and point impact are fitted to their actual radial hit size.
    for (const key of ['flameSpark', 'sanctuaryStrike']) {
        const config = WEAPONS[key];
        const bounds = getCombatVfxVisibleBounds(basicIdentity(key));
        const diameter = config.impactRadius * 2;
        const scaleX = diameter / bounds.width;
        assertCoverage(rows, key, bounds.width * scaleX / diameter, 0.99, 1.01, 'hit-diameter');
    }

    // Forward arcs fit the authored sprite's outward edge to 90% of the cone radius.
    for (const key of ['shadowSlash', 'lightCrescent', 'tigerFang', 'tigerRend', 'flameArc', 'sanctuaryArc']) {
        const config = WEAPONS[key];
        const range = config.slashRange;
        const centerForward = range * (config.slashDistanceRatio ?? 0.45);
        const projection = projectedBounds(
            getCombatVfxVisibleBounds(skillIdentity(key)),
            config.effectRotationOffset || 0
        );
        const scale = (range * config.visualRangeRatio - centerForward) / projection.maxX;
        const coverage = (centerForward + projection.maxX * scale) / range;
        assertCoverage(rows, key, coverage);
    }

    // The line-pierce sprite covers 96% of the actual 24px-to-range hit segment.
    {
        const key = 'lightLance';
        const config = WEAPONS[key];
        const projection = projectedBounds(
            getCombatVfxVisibleBounds(skillIdentity(key)),
            config.effectRotationOffset || 0
        );
        const lineLength = config.slashRange - 24;
        const scale = lineLength * config.visualRangeRatio / (projection.maxX - projection.minX);
        assertCoverage(rows, key, (projection.maxX - projection.minX) * scale / lineLength, 0.94, 1.01, 'line-length');
    }

    // Traveling projectiles move their visual center through the complete configured range.
    for (const key of ['shadowDagger', 'flameBolt']) {
        assert.ok(WEAPONS[key].projectileRange > 0, `${key}: missing projectile range`);
        assertCoverage(rows, key, 1, 0.99, 1.01, 'travel-distance');
    }

    // Target impacts and self auras use independent X/Y visible-bound fitting to the hit diameter.
    for (const key of [
        'rulersAuthority', 'lightJudgment', 'tigerQuake', 'flameMeteor', 'sanctuaryOrb', 'sanctuarySeal',
        'dragonFear', 'lightSanctum', 'tigerGuard', 'flameInferno', 'sanctuaryField',
    ]) {
        const config = WEAPONS[key];
        const radius = config.blastRange || config.auraRange;
        const bounds = getCombatVfxVisibleBounds(skillIdentity(key));
        assert.ok(radius > 0 && bounds.width > 0 && bounds.height > 0, `${key}: invalid radial fit inputs`);
        const scaleX = radius * 2 / bounds.width;
        const scaleY = radius * 2 / bounds.height;
        assertCoverage(rows, key, bounds.width * scaleX / (radius * 2), 0.99, 1.01, 'width');
        assertCoverage(rows, `${key}:height`, bounds.height * scaleY / (radius * 2), 0.99, 1.01, 'height');
    }

    const coveredKeys = new Set(rows.map(row => row.key.replace(/:height$/, '')));
    assert.deepStrictEqual(coveredKeys, new Set(Object.keys(WEAPONS)), 'coverage contract must include all 25 attacks and skills');
    assert.strictEqual(WEAPONS.lightPierce.name, '빛가름 검격');
    assert.strictEqual(WEAPONS.lightPierce.attackStyle, 'swordSlash');
    assert.strictEqual(WEAPONS.lightLance.imageOnlyVfx, true);
    assert.strictEqual(WEAPONS.lightLance.combineProceduralVfx, false);
    assert.strictEqual(WEAPONS.lightSanctum.visualStartScaleRatio, 1);

    console.log(`combat VFX hit-range coverage verified: ${coveredKeys.size}/25`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
