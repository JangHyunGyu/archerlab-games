import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class ShadowSlash extends WeaponBase {
    constructor(scene, player, config = WEAPONS.shadowSlash) {
        super(scene, player, config);
        this.slashGroup = scene.physics.add.group();
        this._gfxPool = [];
        this._activeGfx = new Set();
        this._activeTweens = new Set();
    }

    _getGfx() {
        let gfx = this._gfxPool.pop();
        if (!gfx || !gfx.scene) {
            gfx = this.scene.add.graphics().setDepth(8);
        } else {
            gfx.clear();
            gfx.setVisible(true);
            gfx.setAlpha(1);
        }
        this._activeGfx.add(gfx);
        return gfx;
    }

    _releaseGfx(gfx) {
        this._activeGfx.delete(gfx);
        gfx.clear();
        gfx.setVisible(false);
        if (this._gfxPool.length < 10) {
            this._gfxPool.push(gfx);
        } else {
            gfx.destroy();
        }
    }

    fire() { var __oc0;
        if (this.config.slashMode === 'linePierce') {
            for (let i = 0; i < this.count; i++) {
                this._delay(i * (((__oc0 = this.config.patternDelay) !== null && __oc0 !== void 0 ? __oc0 : 140)), () => this._doLinePierce(i === 0));
            }
            return;
        }

        if (this.config.slashMode === 'radialPulse') {
            for (let i = 0; i < this.count; i++) {
                this._delay(i * 180, () => this._doRadialPulse(i === 0));
            }
            return;
        }

        const configuredOffsets = Array.isArray(this.config.arcOffsets) ? this.config.arcOffsets : null;
        const patternOffsets = configuredOffsets || Array.from(
            { length: this.count },
            (_, i) => this.count > 1 ? (i - (this.count - 1) / 2) * 0.8 : 0
        );
        const repeats = configuredOffsets ? this.count : 1;
        let sequence = 0;

        for (let r = 0; r < repeats; r++) {
            for (const angleOffset of patternOffsets) {
                const triggerMotion = sequence === 0;
                this._delay(sequence * 120, () => this._doSlash(angleOffset, triggerMotion));
                sequence++;
            }
        }
    }

    _getAimAngle(acquireRange) { var __oc1;
        const target = this.player.getClosestEnemy(acquireRange);
        const dirAngles = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
        const idleAngle = (((__oc1 = dirAngles[this.player.facingDirection]) !== null && __oc1 !== void 0 ? __oc1 : (this.player.facingRight ? 0 : Math.PI)));
        const fallbackAngle = this.player.moveIntensity > 0.12
            ? this.player.lastMoveAngle
            : idleAngle;
        return target
            ? Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y)
            : fallbackAngle;
    }

    _doSlash(angleOffset, triggerMotion = true) { var __oc2, __oc3, __oc4, __oc5, __oc6, __oc7, __oc8, __oc9, __oc10, __oc11, __oc12, __oc13, __oc14;
        const angle = this._getAimAngle((this.config.acquireRange || 360) + this.extraRange) + angleOffset;
        if (triggerMotion) {
            (((__oc3 = (__oc2 = this.player).playAttackMotion) === null || __oc3 === void 0 ? void 0 : __oc3.call(__oc2, angle, this.config.motionDuration || 260, 1)));
        }

        const range = (this.config.slashRange || 350) + this.extraRange;
        const slashDist = range * (((__oc4 = this.config.slashDistanceRatio) !== null && __oc4 !== void 0 ? __oc4 : 0.45));
        const slashX = this.player.x + Math.cos(angle) * slashDist;
        const slashY = this.player.y + Math.sin(angle) * slashDist;

        const px = this.player.x;
        const py = this.player.y;
        const arcRadius = range;
        const darkColor = this.getEffectDarkColor(0x4400aa);
        const color = this.getEffectColor(0x9944dd);
        const glowColor = this.getEffectGlowColor(0xddaaff);
        const arcHalf = (((__oc5 = this.config.slashArc) !== null && __oc5 !== void 0 ? __oc5 : 0.8));
        const imageOnlyVfx = !!this.config.imageOnlyVfx;
        const effectTexture = this.getEffectTexture();
        const useCharacterEffect = !!effectTexture;
        const useEffectAsset = !useCharacterEffect && !imageOnlyVfx && this.scene.textures.exists('effect_shadow_slash');
        const suppressAuxiliaryFx = imageOnlyVfx ||
            (useCharacterEffect && !this.config.combineProceduralVfx) || useEffectAsset;

        if (!suppressAuxiliaryFx) {
            const gfx = this._getGfx();
            let progress = { t: 0 };
            let arcTween = null;
            arcTween = this.scene.tweens.add({
                targets: progress,
                t: 1,
                duration: 280,
                ease: 'Power2',
                onUpdate: () => {
                    gfx.clear();

                    const curAngle = Phaser.Math.Linear(angle - arcHalf, angle + arcHalf, progress.t);
                    const prevAngle = Phaser.Math.Linear(angle - arcHalf, angle + arcHalf, Math.max(0, progress.t - 0.35));

                    // Outer glow aura (wide, faint)
                    gfx.lineStyle(22, darkColor, 0.12 * (1 - progress.t));
                    gfx.beginPath();
                    gfx.arc(px, py, arcRadius + 8, prevAngle, curAngle, false);
                    gfx.strokePath();

                    // Secondary trail (energy afterimage)
                    gfx.lineStyle(14, color, 0.25 * (1 - progress.t));
                    gfx.beginPath();
                    gfx.arc(px, py, arcRadius, prevAngle, curAngle, false);
                    gfx.strokePath();

                    // Inner energy trail (brighter)
                    gfx.lineStyle(6, color, 0.4 * (1 - progress.t * 0.5));
                    gfx.beginPath();
                    gfx.arc(px, py, arcRadius - 4, prevAngle, curAngle, false);
                    gfx.strokePath();

                    // Main slash arc (bright core)
                    const arcStart = Phaser.Math.Linear(angle - arcHalf, angle + arcHalf, Math.max(0, progress.t - 0.15));
                    gfx.lineStyle(4, glowColor, 0.95 * (1 - progress.t * 0.3));
                    gfx.beginPath();
                    gfx.arc(px, py, arcRadius, arcStart, curAngle, false);
                    gfx.strokePath();

                    // White-hot core line
                    gfx.lineStyle(2, 0xffffff, 0.8 * (1 - progress.t * 0.5));
                    gfx.beginPath();
                    gfx.arc(px, py, arcRadius, arcStart, curAngle, false);
                    gfx.strokePath();

                    // Glowing tip
                    const tipX = px + Math.cos(curAngle) * arcRadius;
                    const tipY = py + Math.sin(curAngle) * arcRadius;

                    gfx.fillStyle(color, 0.4 * (1 - progress.t * 0.3));
                    gfx.fillCircle(tipX, tipY, 12);
                    gfx.fillStyle(glowColor, 0.8);
                    gfx.fillCircle(tipX, tipY, 6);
                    gfx.fillStyle(0xffffff, 0.9);
                    gfx.fillCircle(tipX, tipY, 2.5);

                    // Shadow energy wisps along trailing edge
                    if (progress.t > 0.1 && progress.t < 0.9) {
                        gfx.fillStyle(color, 0.5);
                        for (let w = 0; w < 2; w++) {
                            const wAngle = Phaser.Math.FloatBetween(prevAngle, curAngle);
                            const wR = arcRadius + Phaser.Math.Between(-8, 8);
                            gfx.fillCircle(
                                px + Math.cos(wAngle) * wR,
                                py + Math.sin(wAngle) * wR,
                                Phaser.Math.FloatBetween(1.5, 3)
                            );
                        }
                    }

                    // Energy radial lines from tip
                    if (progress.t > 0.2 && progress.t < 0.7) {
                        for (let r = 0; r < 3; r++) {
                            const lineAngle = curAngle + Phaser.Math.FloatBetween(-0.3, 0.3);
                            const lineLen = Phaser.Math.FloatBetween(15, 35);
                            gfx.lineStyle(1.5, glowColor, 0.6 * (1 - progress.t));
                            gfx.lineBetween(tipX, tipY, tipX + Math.cos(lineAngle) * lineLen, tipY + Math.sin(lineAngle) * lineLen);
                        }
                    }
                },
                onComplete: () => {
                    this._activeTweens.delete(arcTween);
                    this._releaseGfx(gfx);
                },
            });
            this._activeTweens.add(arcTween);
        }

        // Visual-only slash sprite (energy wave projection)
        const slashRotation = useCharacterEffect
            ? this.getEffectRotation(angle)
            : (useEffectAsset ? angle + Math.PI : angle);
        const desiredOuterReach = range * (((__oc6 = this.config.visualRangeRatio) !== null && __oc6 !== void 0 ? __oc6 : 0.9));
        const effectFit = useCharacterEffect
            ? this.getEffectForwardFit(effectTexture, {
                innerReach: 24,
                outerReach: desiredOuterReach,
                rotationOffset: (((__oc7 = this.config.effectRotationOffset) !== null && __oc7 !== void 0 ? __oc7 : 0)),
            })
            : null;
        const fittedCharacterScale = (((__oc8 = effectFit === null || effectFit === void 0 ? void 0 : effectFit.scale) !== null && __oc8 !== void 0 ? __oc8 : (this.config.effectScale || 0.58) + this.extraRange / 520));
        const visualSlashDist = (((__oc9 = effectFit === null || effectFit === void 0 ? void 0 : effectFit.centerForward) !== null && __oc9 !== void 0 ? __oc9 : slashDist));
        const visualSlashX = this.player.x + Math.cos(angle) * visualSlashDist;
        const visualSlashY = this.player.y + Math.sin(angle) * visualSlashDist;
        const peakAlpha = useCharacterEffect
            ? (((__oc10 = this.config.effectPeakAlpha) !== null && __oc10 !== void 0 ? __oc10 : 0.82))
            : (useEffectAsset ? 0.82 : 0.5);
        const baseScale = useCharacterEffect ? fittedCharacterScale : (useEffectAsset ? 0.48 + this.extraRange / 460 : 1.5 + this.extraRange / 60);
        const slashTex = effectTexture || (useEffectAsset ? 'effect_shadow_slash' : 'proj_slash');
        const slash = this.createEffectSprite(
            visualSlashX,
            visualSlashY,
            slashTex,
            { frameMs: 44 },
        )
            .setDepth(8)
            .setRotation(slashRotation)
            .setAlpha(peakAlpha)
            .setScale(baseScale)
            .setBlendMode((useCharacterEffect || useEffectAsset) ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
        if (!useCharacterEffect && !useEffectAsset) slash.setTint(color);

        const fadeDuration = useCharacterEffect
            ? (((__oc11 = this.config.effectFadeDuration) !== null && __oc11 !== void 0 ? __oc11 : 320))
            : (useEffectAsset ? 320 : 400);
        if (useCharacterEffect || useEffectAsset) {
            const slashEcho = this.createEffectSprite(
                visualSlashX,
                visualSlashY,
                slashTex,
                { frameMs: 44 },
            )
                .setDepth(7)
                .setRotation(slashRotation)
                .setAlpha(peakAlpha * 0.44)
                .setScale(baseScale * 1.12)
                .setTint(glowColor)
                .setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: slashEcho,
                alpha: 0,
                scaleX: slashEcho.scaleX * 1.14,
                scaleY: slashEcho.scaleY * 1.14,
                duration: Math.max(160, Math.round(fadeDuration * 0.9)),
                onComplete: () => slashEcho.destroy(),
            });
        }

        this.scene.tweens.add({
            targets: slash,
            alpha: 0,
            scaleX: slash.scaleX * ((useCharacterEffect || useEffectAsset) ? 1.08 : 1.8),
            scaleY: slash.scaleY * ((useCharacterEffect || useEffectAsset) ? 1.08 : 1.8),
            hold: useCharacterEffect ? (((__oc12 = this.config.effectHold) !== null && __oc12 !== void 0 ? __oc12 : 0)) : 0,
            duration: fadeDuration,
            onComplete: () => slash.destroy(),
        });

        if (!suppressAuxiliaryFx) {
            // Afterglow flash at slash center
            const flash = this.scene.add.circle(slashX, slashY, 20, color, 0.4).setDepth(7);
            this.scene.tweens.add({
                targets: flash,
                alpha: 0,
                scaleX: 3,
                scaleY: 3,
                duration: 350,
                ease: 'Power2',
                onComplete: () => flash.destroy(),
            });
        }

        // Hit enemies in arc
        const enemies = this.player.getAllEnemies();
        const hitAngle = (((__oc13 = this.config.hitAngle) !== null && __oc13 !== void 0 ? __oc13 : arcHalf));
        const damage = Math.floor(this.getDamage() * (((__oc14 = this.config.damageMult) !== null && __oc14 !== void 0 ? __oc14 : 1)));
        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(px, py, enemy.x, enemy.y);
            if (dist > range) continue;

            const enemyAngle = Phaser.Math.Angle.Between(px, py, enemy.x, enemy.y);
            const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - angle));
            if (angleDiff < hitAngle) {
                this.applyDamage(enemy, damage, px, py);
                if (this.config.slowMultiplier !== undefined && enemy.applySlow) {
                    enemy.applySlow(this.config.slowMultiplier, this.config.slowDuration || 1200);
                }
            }
        }

        if (this.config.aftershockRadius) {
            this._delay(this.config.aftershockDelay || 180, () => { var __oc15, __oc16, __oc17;
                if (!(((__oc16 = (__oc15 = this.scene) === null || __oc15 === void 0 ? void 0 : __oc15.scene) === null || __oc16 === void 0 ? void 0 : __oc16.isActive()))) return;
                if (!suppressAuxiliaryFx) {
                    const pulse = this.scene.add.circle(slashX, slashY, this.config.aftershockRadius * 0.35, color, 0.28)
                        .setDepth(7)
                        .setBlendMode(Phaser.BlendModes.ADD);
                    this.scene.tweens.add({
                        targets: pulse,
                        alpha: 0,
                        scale: 2.8,
                        duration: 260,
                        onComplete: () => pulse.destroy(),
                    });
                }

                for (const enemy of this.player.getAllEnemies()) {
                    if (!enemy.active) continue;
                    const dist = Phaser.Math.Distance.Between(slashX, slashY, enemy.x, enemy.y);
                    if (dist > this.config.aftershockRadius) continue;
                    this.applyDamage(enemy, Math.floor(this.getDamage() * (((__oc17 = this.config.aftershockDamageMult) !== null && __oc17 !== void 0 ? __oc17 : 0.45))), slashX, slashY);
                }
            });
        }

        // Sound
        this.playConfiguredSound('slash');
    }

    _distanceToLineSegment(px, py, ax, ay, bx, by) {
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq <= 0) return Phaser.Math.Distance.Between(px, py, ax, ay);
        const t = Phaser.Math.Clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
        return Phaser.Math.Distance.Between(px, py, ax + dx * t, ay + dy * t);
    }

    _doLinePierce(triggerMotion = true) { var __oc18, __oc19, __oc20, __oc21, __oc22, __oc23, __oc24, __oc25, __oc26;
        const angle = this._getAimAngle((this.config.acquireRange || 540) + this.extraRange);

        const px = this.player.x;
        const py = this.player.y - 8;
        const range = (this.config.slashRange || 520) + this.extraRange;
        const startX = px + Math.cos(angle) * 24;
        const startY = py + Math.sin(angle) * 24;
        const endX = px + Math.cos(angle) * range;
        const endY = py + Math.sin(angle) * range;
        const lineWidth = this.config.lineWidth || 34;
        const imageOnlyVfx = !!this.config.imageOnlyVfx;
        const effectTexture = this.getEffectTexture();
        const suppressAuxiliaryFx = imageOnlyVfx ||
            (!!effectTexture && !this.config.combineProceduralVfx);

        if (!suppressAuxiliaryFx) {
            const color = this.getEffectColor(0xffd86a);
            const glowColor = this.getEffectGlowColor(0xffffff);
            const gfx = this._getGfx();
            const progress = { t: 0 };
            let lineTween = null;
            lineTween = this.scene.tweens.add({
                targets: progress,
                t: 1,
                duration: this.config.motionDuration || 210,
                ease: 'Quad.easeOut',
                onUpdate: () => {
                    const reach = Phaser.Math.Easing.Cubic.Out(progress.t);
                    const currentX = startX + (endX - startX) * reach;
                    const currentY = startY + (endY - startY) * reach;
                    gfx.clear();
                    if (this.config.proceduralCoreOnly) {
                        gfx.lineStyle(10, color, 0.12 * (1 - progress.t * 0.35));
                        gfx.lineBetween(startX, startY, currentX, currentY);
                        gfx.lineStyle(4, color, 0.58 * (1 - progress.t * 0.25));
                        gfx.lineBetween(startX, startY, currentX, currentY);
                        gfx.lineStyle(1.5, 0xffffff, 0.88 * (1 - progress.t * 0.2));
                        gfx.lineBetween(startX, startY, currentX, currentY);
                        return;
                    }
                    gfx.lineStyle(lineWidth, color, 0.18 * (1 - progress.t * 0.35));
                    gfx.lineBetween(startX, startY, currentX, currentY);
                    gfx.lineStyle(Math.max(7, lineWidth * 0.38), glowColor, 0.72 * (1 - progress.t * 0.25));
                    gfx.lineBetween(startX, startY, currentX, currentY);
                    gfx.lineStyle(3, 0xffffff, 0.95 * (1 - progress.t * 0.2));
                    gfx.lineBetween(startX, startY, currentX, currentY);
                    gfx.fillStyle(glowColor, 0.75 * (1 - progress.t * 0.25));
                    gfx.fillCircle(currentX, currentY, 8 + 8 * reach);
                },
                onComplete: () => {
                    this._activeTweens.delete(lineTween);
                    this._releaseGfx(gfx);
                },
            });
            this._activeTweens.add(lineTween);
        }

        if (effectTexture) {
            const visualOuterReach = 24 + (range - 24) * (((__oc18 = this.config.visualRangeRatio) !== null && __oc18 !== void 0 ? __oc18 : 0.96));
            const effectFit = this.getEffectForwardFit(effectTexture, {
                innerReach: 24,
                outerReach: visualOuterReach,
                rotationOffset: (((__oc19 = this.config.effectRotationOffset) !== null && __oc19 !== void 0 ? __oc19 : 0)),
            });
            const visualMidX = px + Math.cos(angle) * effectFit.centerForward;
            const visualMidY = py + Math.sin(angle) * effectFit.centerForward;
            const lance = this.createEffectSprite(visualMidX, visualMidY, effectTexture, {
                frameMs: (((__oc20 = this.config.effectFrameMs) !== null && __oc20 !== void 0 ? __oc20 : 44)),
                loop: (((__oc21 = this.config.effectLoop) !== null && __oc21 !== void 0 ? __oc21 : false)),
                loopStart: (((__oc22 = this.config.effectStartFrame) !== null && __oc22 !== void 0 ? __oc22 : 0)),
                loopEnd: this.config.effectLoopEnd,
            })
                .setDepth(18)
                .setRotation(this.getEffectRotation(angle))
                .setAlpha((((__oc23 = this.config.effectPeakAlpha) !== null && __oc23 !== void 0 ? __oc23 : 0.88)))
                .setScale(effectFit.scale)
                .setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: lance,
                alpha: 0,
                scaleX: lance.scaleX * 1.015,
                scaleY: lance.scaleY * 1.015,
                delay: this.config.effectFadeDelay != null ? this.config.effectFadeDelay : 0,
                duration: (((__oc25 = this.config.effectFadeDuration) !== null && __oc25 !== void 0 ? __oc25 : 260)),
                ease: 'Quad.easeOut',
                onComplete: () => lance.destroy(),
            });
        }

        const damage = Math.floor(this.getDamage() * (((__oc26 = this.config.damageMult) !== null && __oc26 !== void 0 ? __oc26 : 1)));
        for (const enemy of this.player.getAllEnemies()) {
            if (!enemy.active) continue;
            const dist = this._distanceToLineSegment(enemy.x, enemy.y, startX, startY, endX, endY);
            if (dist > lineWidth) continue;
            this.applyDamage(enemy, damage, px, py);
        }

        if (triggerMotion && this.player.playAttackMotion) {
            this.player.playAttackMotion(angle, this.config.motionDuration || 230, 1);
        }
        this.playConfiguredSound('slash');
    }

    _doRadialPulse(triggerMotion = true) { var __oc27, __oc28, __oc29, __oc30;
        if (triggerMotion && this.player.playAttackMotion) {
            const dirAngles = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
            const idleAngle = (((__oc27 = dirAngles[this.player.facingDirection]) !== null && __oc27 !== void 0 ? __oc27 : (this.player.facingRight ? 0 : Math.PI)));
            const motionAngle = this.player.moveIntensity > 0.12
                ? this.player.lastMoveAngle
                : idleAngle;
            const variantMotion = (((__oc29 = (__oc28 = this.player.character) === null || __oc28 === void 0 ? void 0 : __oc28.basicAttackVariants) === null || __oc29 === void 0 ? void 0 : __oc29[0]));
            this.player.playAttackMotion(motionAngle, this.config.motionDuration || 260, 1, variantMotion);
        }
        const range = (this.config.slashRange || 280) + this.extraRange;
        const color = this.getEffectColor(0x66f2b0);
        const glowColor = this.getEffectGlowColor(0xe8fff5);
        const px = this.player.x;
        const py = this.player.y;
        const damage = Math.floor(this.getDamage() * (((__oc30 = this.config.damageMult) !== null && __oc30 !== void 0 ? __oc30 : 0.85)));
        const effectTexture = this.getEffectTexture();

        if (effectTexture) {
            const fittedScale = this.getEffectScaleForVisibleSize(effectTexture, range * 2);
            const pulse = this.createEffectSprite(px, py, effectTexture, { frameMs: 70 })
                .setDepth(8)
                .setAlpha(0.84)
                .setScale(fittedScale.x, fittedScale.y)
                .setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: pulse,
                alpha: 0,
                scaleX: pulse.scaleX * 1.12,
                scaleY: pulse.scaleY * 1.12,
                duration: 420,
                ease: 'Quad.easeOut',
                onComplete: () => pulse.destroy(),
            });
        } else {
            const pulse = this.scene.add.circle(px, py, range * 0.18, color, 0.24)
                .setDepth(7)
                .setBlendMode(Phaser.BlendModes.ADD);
            const ring = this.scene.add.circle(px, py, range * 0.24, glowColor, 0)
                .setDepth(8);
            ring.setStrokeStyle(3, glowColor, 0.85);

            this.scene.tweens.add({
                targets: pulse,
                alpha: 0,
                scale: 5.2,
                duration: 380,
                ease: 'Quad.easeOut',
                onComplete: () => pulse.destroy(),
            });
            this.scene.tweens.add({
                targets: ring,
                alpha: 0,
                scale: 4.2,
                duration: 420,
                ease: 'Quad.easeOut',
                onComplete: () => ring.destroy(),
            });
        }

        for (const enemy of this.player.getAllEnemies()) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(px, py, enemy.x, enemy.y);
            if (dist > range) continue;
            this.applyDamage(enemy, damage, px, py);
            if (this.config.slowMultiplier !== undefined && enemy.applySlow) {
                enemy.applySlow(this.config.slowMultiplier, this.config.slowDuration || 1500);
            }
        }

        this.playConfiguredSound('slash');
    }

    getProjectileGroup() {
        return this.slashGroup;
    }

    destroy() { var __oc31;
        if ((((__oc31 = this.scene) === null || __oc31 === void 0 ? void 0 : __oc31.tweens))) {
            for (const tween of this._activeTweens) {
                this.scene.tweens.remove(tween);
            }
            for (const gfx of this._activeGfx) {
                this.scene.tweens.killTweensOf(gfx);
            }
        }
        this._activeTweens.clear();

        if (this.slashGroup) this.slashGroup.destroy(true);
        for (const gfx of this._activeGfx) {
            if (gfx && gfx.scene) gfx.destroy();
        }
        this._activeGfx.clear();
        for (const gfx of this._gfxPool) {
            if (gfx && gfx.scene) gfx.destroy();
        }
        this._gfxPool = [];
        this.slashGroup = null;
        super.destroy();
    }
}
