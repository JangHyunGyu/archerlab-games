const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function loadDirectionModule() {
    const sourcePath = path.join(__dirname, '..', 'js', 'utils', 'CombatVfxDirection.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    return import(dataUrl);
}

(async () => {
    const {
        COMBAT_VFX_ORIENTATIONS,
        isAimedCombatVfx,
        resolveCombatVfxRotation,
        resolveMirroredCombatVfxRotation,
    } = await loadDirectionModule();

    const aimed = [
        COMBAT_VFX_ORIENTATIONS.BODY_ARC,
        COMBAT_VFX_ORIENTATIONS.BODY_THRUST,
        COMBAT_VFX_ORIENTATIONS.FORWARD_ARC,
        COMBAT_VFX_ORIENTATIONS.PROJECTILE,
    ];
    const aimAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    for (const orientation of aimed) {
        assert.strictEqual(isAimedCombatVfx(orientation), true);
        for (const aimAngle of aimAngles) {
            assert.strictEqual(
                resolveCombatVfxRotation(aimAngle, orientation, Math.PI / 4),
                aimAngle + Math.PI / 4
            );
        }
    }

    for (const orientation of [
        COMBAT_VFX_ORIENTATIONS.TARGET_IMPACT,
        COMBAT_VFX_ORIENTATIONS.SELF_RADIAL,
    ]) {
        assert.strictEqual(isAimedCombatVfx(orientation), false);
        for (const aimAngle of aimAngles) {
            assert.strictEqual(resolveCombatVfxRotation(aimAngle, orientation, 0), 0);
        }
    }

    assert.strictEqual(
        resolveCombatVfxRotation(0, COMBAT_VFX_ORIENTATIONS.PROJECTILE, Math.PI / 4),
        Math.PI / 4,
        'light lance source points up-right and needs a clockwise quarter-diagonal correction'
    );
    assert.strictEqual(
        resolveCombatVfxRotation(0, COMBAT_VFX_ORIENTATIONS.PROJECTILE, -Math.PI / 4),
        -Math.PI / 4,
        'flame bolt source points down-right and needs a counter-clockwise quarter-diagonal correction'
    );
    assert.strictEqual(
        resolveCombatVfxRotation(0, COMBAT_VFX_ORIENTATIONS.PROJECTILE, -Math.PI / 7),
        -Math.PI / 7,
        'flame basic source points about 26 degrees down-right and needs its measured correction'
    );
    assert.strictEqual(
        resolveCombatVfxRotation(0, COMBAT_VFX_ORIENTATIONS.FORWARD_ARC, -Math.PI / 2),
        -Math.PI / 2,
        'light crescent must open back toward the player and bow outward toward the target'
    );
    assert.strictEqual(
        resolveCombatVfxRotation(0, COMBAT_VFX_ORIENTATIONS.FORWARD_ARC, Math.PI),
        Math.PI,
        'sanctuary arc must open back toward the player and bow outward toward the target'
    );
    assert.strictEqual(
        resolveMirroredCombatVfxRotation(0, COMBAT_VFX_ORIENTATIONS.BODY_ARC, Math.PI / 4, false),
        Math.PI / 4,
        'the authored light slash aligns its up-right forward axis with +X'
    );
    assert.strictEqual(
        resolveMirroredCombatVfxRotation(0, COMBAT_VFX_ORIENTATIONS.BODY_ARC, Math.PI / 4, true),
        -Math.PI / 4,
        'a vertically mirrored light slash must negate its authored offset to keep pointing +X'
    );

    // The light sword source art points up-right (-45 degrees). Phaser mirrors
    // its local Y axis before applying rotation, so verify both swing parities
    // against spawn directions around the full circle, not only the +X case.
    const lightSwordSourceAngle = -Math.PI / 4;
    for (const aimAngle of Array.from({ length: 16 }, (_, index) => -Math.PI + index * Math.PI / 8)) {
        for (const flipY of [false, true]) {
            const localForwardAngle = flipY ? -lightSwordSourceAngle : lightSwordSourceAngle;
            const rotation = resolveMirroredCombatVfxRotation(
                aimAngle,
                COMBAT_VFX_ORIENTATIONS.BODY_ARC,
                Math.PI / 4,
                flipY,
            );
            const worldForwardAngle = localForwardAngle + rotation;
            const alignment = Math.cos(worldForwardAngle - aimAngle);
            assert.ok(
                alignment > 0.999999,
                `light sword must point outward at aim=${aimAngle}, flipY=${flipY}`
            );
        }
    }

    const basicRuntime = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'weapons', 'BasicDagger.js'),
        'utf8'
    );
    assert.match(basicRuntime, /getMirroredEffectRotation\(baseAngle, flipY\)/);
    assert.match(basicRuntime, /slash\.setFlipY\(flipY\)/);
    assert.doesNotMatch(basicRuntime, /slash\.setRotation\(baseAngle \+ side \* 0\.55\)/);
    assert.match(basicRuntime, /case 'dualDaggerCrossThrust'/);
    assert.match(basicRuntime, /laneSign \* -0\.18/);
    assert.doesNotMatch(basicRuntime, /\.setFlipX\(true\)/);
    assert.match(
        basicRuntime,
        /projectile\.setRotation\(this\.getEffectRotation\(baseAngle\)\);/,
        'flame basic projectile must stay locked to its travel direction on every update'
    );
    assert.doesNotMatch(
        basicRuntime,
        /wobbleAngle|projectile\.setRotation\(baseAngle/,
        'runtime updates must neither wobble nor overwrite an authored projectile rotation offset'
    );

    const constantsSource = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'utils', 'Constants.js'),
        'utf8'
    );
    assert.match(constantsSource, /flameSpark:[\s\S]*?effectRotationOffset: -Math\.PI \/ 7,/);

    console.log('combat VFX direction tests passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
