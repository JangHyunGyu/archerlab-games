export const COMBAT_VFX_ORIENTATIONS = Object.freeze({
    BODY_ARC: 'bodyArc',
    FORWARD_ARC: 'forwardArc',
    PROJECTILE: 'projectile',
    TARGET_IMPACT: 'targetImpact',
    SELF_RADIAL: 'selfRadial',
});

const AIMED_ORIENTATIONS = new Set([
    COMBAT_VFX_ORIENTATIONS.BODY_ARC,
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
