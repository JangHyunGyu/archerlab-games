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
        resolveCombatVfxRotation(0, COMBAT_VFX_ORIENTATIONS.FORWARD_ARC, -Math.PI / 2),
        -Math.PI / 2,
        'light crescent must open back toward the player and bow outward toward the target'
    );
    assert.strictEqual(
        resolveCombatVfxRotation(0, COMBAT_VFX_ORIENTATIONS.FORWARD_ARC, Math.PI),
        Math.PI,
        'sanctuary arc must open back toward the player and bow outward toward the target'
    );

    const basicRuntime = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'weapons', 'BasicDagger.js'),
        'utf8'
    );
    assert.match(basicRuntime, /slash\.setFlipY\(side < 0\)/);
    assert.doesNotMatch(basicRuntime, /slash\.setRotation\(baseAngle \+ side \* 0\.55\)/);
    assert.match(basicRuntime, /case 'dualDaggerCrossThrust'/);
    assert.match(basicRuntime, /laneSign \* -0\.18/);
    assert.doesNotMatch(basicRuntime, /\.setFlipX\(true\)/);

    console.log('combat VFX direction tests passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
