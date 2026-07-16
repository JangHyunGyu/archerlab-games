const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');

function readRgbaPngAlphaBounds(filePath, threshold = 12) {
    const png = fs.readFileSync(filePath);
    assert.strictEqual(png.readUInt32BE(0), 0x89504e47, `${filePath}: invalid PNG signature`);
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.strictEqual(png[24], 8, `${filePath}: expected 8-bit PNG`);
    assert.strictEqual(png[25], 6, `${filePath}: expected RGBA PNG`);
    const chunks = [];
    for (let offset = 8; offset < png.length;) {
        const length = png.readUInt32BE(offset);
        const type = png.toString('ascii', offset + 4, offset + 8);
        if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
        offset += length + 12;
        if (type === 'IEND') break;
    }
    const raw = zlib.inflateSync(Buffer.concat(chunks));
    const stride = width * 4;
    const rows = Buffer.alloc(stride * height);
    const paeth = (a, b, c) => {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
    };
    let input = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[input++];
        const rowOffset = y * stride;
        const prevOffset = (y - 1) * stride;
        for (let x = 0; x < stride; x++) {
            const source = raw[input++];
            const left = x >= 4 ? rows[rowOffset + x - 4] : 0;
            const up = y > 0 ? rows[prevOffset + x] : 0;
            const upperLeft = y > 0 && x >= 4 ? rows[prevOffset + x - 4] : 0;
            let value = source;
            if (filter === 1) value += left;
            else if (filter === 2) value += up;
            else if (filter === 3) value += Math.floor((left + up) / 2);
            else if (filter === 4) value += paeth(left, up, upperLeft);
            rows[rowOffset + x] = value & 0xff;
        }
    }
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rows[y * stride + x * 4 + 3] < threshold) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
        }
    }
    assert.ok(right >= left && bottom >= top, `${filePath}: no visible alpha`);
    return { left, top, right: right + 1, bottom: bottom + 1, width: right - left + 1, height: bottom - top + 1 };
}

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
        ['lightPierce', 70, Math.PI / 4],
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
    for (const [key, config] of Object.entries(WEAPONS)) {
        assert.strictEqual(config.imageOnlyVfx, true, `${key}: authored VFX must be image-only`);
        assert.strictEqual(config.combineProceduralVfx, false, `${key}: procedural VFX layers must stay disabled`);
    }
    const enemyRuntime = fs.readFileSync(path.join(root, 'js', 'entities', 'Enemy.js'), 'utf8');
    assert.strictEqual(
        (enemyRuntime.match(/if \(usedAsset\) return;/g) || []).length,
        3,
        'normal, flame, and sanctuary hit images must suppress procedural follow-up layers'
    );
    assert.strictEqual(WEAPONS.lightPierce.name, '빛가름 검격');
    assert.strictEqual(WEAPONS.lightPierce.attackStyle, 'swordSlash');
    assert.strictEqual(WEAPONS.lightPierce.effectRotationOffset, Math.PI / 4);
    assert.strictEqual(WEAPONS.lightPierce.effectStartFrame, 1);
    assert.ok(WEAPONS.lightPierce.effectPeakAlpha >= 0.9);
    assert.strictEqual(WEAPONS.lightLance.imageOnlyVfx, true);
    assert.strictEqual(WEAPONS.lightLance.combineProceduralVfx, false);
    assert.strictEqual(WEAPONS.lightLance.effectRotationOffset, Math.PI / 4);
    assert.strictEqual(WEAPONS.lightLance.effectStartFrame ?? 0, 0);
    assert.strictEqual(WEAPONS.lightLance.effectLoop ?? false, false);
    assert.ok(
        WEAPONS.lightLance.effectFadeDelay >= WEAPONS.lightLance.effectFrameMs * 5,
        'lightLance must show all six authored frames before fading'
    );
    assert.strictEqual(WEAPONS.flameSpark.effectRotationOffset, -Math.PI / 4);
    assert.strictEqual(WEAPONS.lightSanctum.visualStartScaleRatio, 1);

    const installerSource = fs.readFileSync(
        path.join(root, 'scripts', 'install_higgsfield_character_vfx_20260716.py'),
        'utf8'
    );
    assert.match(
        installerSource,
        /EffectTarget\("sanctuary_pulse", "sanctuary", "aura"/,
        'sanctuary pulse must use a radial reveal profile'
    );
    for (const frameIndex of [0, 1]) {
        const bounds = readRgbaPngAlphaBounds(path.join(
            root,
            'assets', 'effects', 'character_skills', 'frames', `sanctuary_pulse_${frameIndex}.png`
        ));
        const aspect = bounds.width / bounds.height;
        assert.ok(aspect >= 0.82 && aspect <= 1.18, `sanctuary_pulse_${frameIndex}: partial-circle aspect ${aspect.toFixed(3)}`);
    }
    const authorityRuntime = fs.readFileSync(path.join(root, 'js', 'weapons', 'RulersAuthority.js'), 'utf8');
    assert.match(authorityRuntime, /Math\.round\(visualPeakDuration \/ 3\)/);
    for (const key of ['rulersAuthority', 'lightJudgment', 'tigerQuake', 'flameMeteor', 'sanctuaryOrb', 'sanctuarySeal']) {
        const config = WEAPONS[key];
        const peakDuration = config.smoothVisual
            ? (config.visualFadeInDuration ?? 260)
            : Math.max(80, config.impactDelay ?? 200);
        const frameMs = config.effectFrameMs ?? Math.max(24, Math.round(peakDuration / 3));
        assert.ok(
            Math.abs(frameMs * 3 - peakDuration) <= 2,
            `${key}: peak frame is not synchronized to impact (${frameMs * 3}ms vs ${peakDuration}ms)`
        );
    }

    console.log(`combat VFX hit-range and full image-only layering verified: ${coveredKeys.size}/25`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
