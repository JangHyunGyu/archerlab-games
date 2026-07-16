export const COMBAT_VFX_ORIENTATIONS = Object.freeze({
    BODY_ARC: 'bodyArc',
    BODY_THRUST: 'bodyThrust',
    FORWARD_ARC: 'forwardArc',
    PROJECTILE: 'projectile',
    TARGET_IMPACT: 'targetImpact',
    SELF_RADIAL: 'selfRadial',
});

const AIMED_ORIENTATIONS = new Set([
    COMBAT_VFX_ORIENTATIONS.BODY_ARC,
    COMBAT_VFX_ORIENTATIONS.BODY_THRUST,
    COMBAT_VFX_ORIENTATIONS.FORWARD_ARC,
    COMBAT_VFX_ORIENTATIONS.PROJECTILE,
]);

export function isAimedCombatVfx(orientation) {
    return AIMED_ORIENTATIONS.has(orientation);
}

export function resolveCombatVfxRotation(aimAngle = 0, orientation, rotationOffset = 0) {
    const safeAimAngle = Number.isFinite(aimAngle) ? aimAngle : 0;
    const safeRotationOffset = Number.isFinite(rotationOffset) ? rotationOffset : 0;
    return isAimedCombatVfx(orientation)
        ? safeAimAngle + safeRotationOffset
        : safeRotationOffset;
}

// Phaser applies a sprite's local flip before its rotation. For authored VFX
// that need a rotation offset, using the same rotation after flipY would turn
// the authored forward axis away from the target. Negating the local offset
// keeps both mirrored variants aligned with the same world-space aim axis.
export function resolveMirroredCombatVfxRotation(
    aimAngle = 0,
    orientation,
    rotationOffset = 0,
    flipY = false,
) {
    const mirroredOffset = flipY ? -rotationOffset : rotationOffset;
    return resolveCombatVfxRotation(aimAngle, orientation, mirroredOffset);
}
