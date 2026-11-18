import { WeaponBase } from './WeaponBase.js';
import { WEAPONS } from '../utils/Constants.js';

const TRAIL_INTERVAL_MS = 50;

export class ShadowDagger extends WeaponBase {
    constructor(scene, player, config = WEAPONS.shadowDagger) {
        super(scene, player, config);
        this._activeDaggers = [];
        this._trailPool = [];
        this._activeTrails = new Set();
    }

    _getTrailCircle(x, y) {
        let trail = this._trailPool.pop();
        if (trail && trail.scene) {
            trail.setPosition(x, y);
            trail.setVisible(true);
            trail.setAlpha(0.4);
            trail.setScale(1);
            trail.setFillStyle(this.getEffectColor(0xb366ff), 0.4);
            this._activeTrails.add(trail);
            return trail;
        }
        trail = this.scene.add.circle(x, y, 3, this.getEffectColor(0xb366ff), 0.4).setDepth(7);
        this._activeTrails.add(trail);
        return trail;
    }

    _releaseTrailCircle(trail) {
        if (!trail || !trail.scene) return;
        this._activeTrails.delete(trail);
        trail.setVisible(false);
        if (this._trailPool.length < 50) {
            this._trailPool.push(trail);
        } else {
            trail.destroy();
        }
    }

    fire() {
        for (let i = 0; i < this.count; i++) {
            this._delay(i * 100, () => this._firePattern());
        }
    }

    _firePattern() { var __oc0;
        const fanCount = Math.max(1, this.config.fanCount || 1);
        const fanSpread = (((__oc0 = this.config.fanSpread) !== null && __oc0 !== void 0 ? __oc0 : 0.24));
        for (let i = 0; i < fanCount; i++) {
            const offset = (i - (fanCount - 1) / 2) * fanSpread;
            this._throwDagger(offset, i === 0);
        }
    }

    _throwDagger(angleOffset = 0, playSound = true) { var __oc1, __oc2, __oc3, __oc4;
        const target = this.player.getClosestEnemy(this.config.acquireRange || 6000);
        if (!target) return;

        if (playSound) this.playConfiguredSound('daggerThrow');

        const px = this.player.x;
        const py = this.player.y;
        const angle = Phaser.Math.Angle.Between(px, py, target.x, target.y) + angleOffset;
        if (playSound && this.player.playAttackMotion) {
            this.player.playAttackMotion(angle, this.config.motionDuration || 190, 1);
        }
        const range = (this.config.projectileRange || 1500) + this.extraRange;
        const endX = px + Math.cos(angle) * range;
        const endY = py + Math.sin(angle) * range;
        const duration = this.config.projectileDuration || Phaser.Math.Clamp(range * 1.25, 650, 2500);
        const dmg = Math.floor(this.getDamage() * (((__oc1 = this.config.damageMult) !== null && __oc1 !== void 0 ? __oc1 : 1)));
        const effectTexture = this.getEffectTexture();
        const useCharacterEffect = !!effectTexture;
        const useEffectAsset = !useCharacterEffect && this.scene.textures.exists('effect_shadow_dagger');
        const usesImageEffect = useCharacterEffect || useEffectAsset;
        const suppressTrailFx = this.config.imageOnlyVfx || usesImageEffect;
        const textureKey = effectTexture || (useEffectAsset ? 'effect_shadow_dagger' : 'proj_dagger');
        const hitRadiusScale = (((__oc2 = this.config.hitRadiusScale) !== null && __oc2 !== void 0 ? __oc2 : 0.35));
        const minHitRadius = (((__oc3 = this.config.minHitRadius) !== null && __oc3 !== void 0 ? __oc3 : 25));
        const explosionRadius = this.config.explosionRadius || 0;
        const explosionDamageMult = (((__oc4 = this.config.explosionDamageMult) !== null && __oc4 !== void 0 ? __oc4 : 0.65));
        const slowMultiplier = this.config.slowMultiplier;
        const slowDuration = this.config.slowDuration || 1400;

        const dagger = this.createEffectSprite(px, py, textureKey, {
            frameMs: 56,
            loop: useCharacterEffect,
            loopStart: 2,
            loopEnd: 4,
        })
            .setDepth(8)
            .setScale(useCharacterEffect ? (this.config.projectileScale || this.config.effectScale || 0.5) : (useEffectAsset ? 0.22 : 0.85))
            .setRotation(useCharacterEffect
                ? this.getEffectRotation(angle)
                : (useEffectAsset ? angle : angle + Math.PI / 2))
            .setBlendMode((useCharacterEffect || useEffectAsset) ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);

        let trailInterval = null;
        const piercedTargets = new Set();
        let prevX = px;
        let prevY = py;
        const entry = { dagger, trailInterval: null };
        this._activeDaggers.push(entry);

        const getTargetKey = (currentTarget) => {
            if (currentTarget && currentTarget.spawnInstanceId) {
                return `${currentTarget.isBoss ? 'boss' : 'enemy'}-${currentTarget.spawnInstanceId}`;
            }
            return currentTarget;
        };

        const applySecondaryEffect = (currentTarget, durationOverride = slowDuration) => {
            if (slowMultiplier !== undefined && currentTarget.applySlow) {
                currentTarget.applySlow(slowMultiplier, durationOverride);
            }
        };

        const explode = (x, y, sourceKey) => {
            if (!explosionRadius) return;

            if (usesImageEffect) {
                const burst = this.createEffectSprite(x, y, textureKey, { frameMs: 28 })
                    .setDepth(8)
                    .setAlpha(0.62)
                    .setScale((this.config.projectileScale || this.config.effectScale || 0.5) * 0.72)
                    .setRotation(useCharacterEffect ? this.getEffectRotation(angle) : angle)
                    .setBlendMode(Phaser.BlendModes.ADD);
                this.scene.tweens.add({
                    targets: burst,
                    alpha: 0,
                    scaleX: burst.scaleX * 1.65,
                    scaleY: burst.scaleY * 1.65,
                    duration: 220,
                    ease: 'Quad.easeOut',
                    onComplete: () => burst.destroy(),
                });
            } else {
                const burst = this.scene.add.circle(x, y, explosionRadius * 0.35, this.getEffectColor(0xb366ff), 0.35)
                    .setDepth(8)
                    .setBlendMode(Phaser.BlendModes.ADD);
                this.scene.tweens.add({
                    targets: burst,
                    alpha: 0,
                    scale: 2.4,
                    duration: 220,
                    ease: 'Quad.easeOut',
                    onComplete: () => burst.destroy(),
                });
            }

            for (const enemy of this.player.getAllEnemies()) {
                if (!enemy || !enemy.active) continue;
                const enemyKey = getTargetKey(enemy);
                if (enemyKey === sourceKey) continue;
                const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
                if (dist > explosionRadius) continue;
                this.applyDamage(enemy, Math.floor(dmg * explosionDamageMult), x, y);
                applySecondaryEffect(enemy, Math.floor(slowDuration * 0.7));
            }
        };

        const tryPierceTarget = (currentTarget) => { var __oc5;
            if (!currentTarget || !currentTarget.active) return false;
            if (currentTarget.isBoss && currentTarget.isInvincible) return false;

            const targetKey = getTargetKey(currentTarget);
            if (piercedTargets.has(targetKey)) return false;

            const hitRadius = Math.max(minHitRadius, ((((__oc5 = currentTarget.body) === null || __oc5 === void 0 ? void 0 : __oc5.width)) || currentTarget.displayWidth || 50) * hitRadiusScale);
            const dx = dagger.x - prevX;
            const dy = dagger.y - prevY;
            const segmentLengthSq = dx * dx + dy * dy;
            let closestX = dagger.x;
            let closestY = dagger.y;

            if (segmentLengthSq > 0) {
                const t = Phaser.Math.Clamp(
                    ((currentTarget.x - prevX) * dx + (currentTarget.y - prevY) * dy) / segmentLengthSq,
                    0,
                    1
                );
                closestX = prevX + dx * t;
                closestY = prevY + dy * t;
            }

            const dist = Phaser.Math.Distance.Between(closestX, closestY, currentTarget.x, currentTarget.y);
            if (dist >= hitRadius) return false;

            piercedTargets.add(targetKey);

            if (currentTarget.isBoss) {
                this.applyDamage(currentTarget, dmg, dagger.x, dagger.y);
            } else {
                this.applyDamage(currentTarget, dmg, dagger.x, dagger.y);
            }
            applySecondaryEffect(currentTarget);
            explode(dagger.x, dagger.y, targetKey);

            this.playHitSound();

            if (!usesImageEffect) {
                const spark = this.scene.add.circle(dagger.x, dagger.y, 6, this.getEffectColor(0xb366ff), 0.8).setDepth(9);
                this.scene.tweens.add({
                    targets: spark,
                    alpha: 0,
                    scale: 3,
                    duration: 200,
                    onComplete: () => spark.destroy(),
                });
            }

            return true;
        };

        const cleanup = () => {
            if (trailInterval) {
                trailInterval.remove(false);
                trailInterval = null;
            }
            entry.trailInterval = null;
            if (dagger.active) dagger.destroy();
            const idx = this._activeDaggers.indexOf(entry);
            if (idx !== -1) this._activeDaggers.splice(idx, 1);
        };

        this.scene.tweens.add({
            targets: dagger,
            x: endX,
            y: endY,
            duration,
            ease: 'Linear',
            onUpdate: () => {
                if (!dagger.active) return;

                const enemies = this.player.getAllEnemies();
                for (const enemy of enemies) {
                    tryPierceTarget(enemy);
                }

                prevX = dagger.x;
                prevY = dagger.y;
            },
            onComplete: () => cleanup(),
        });

        if (!suppressTrailFx) {
            // Phaser repeat counts must be integers. A fractional repeat count
            // (for example 1437.5 / 50 = 28.75) eventually becomes -0.25 and
            // never reaches the completion condition, retaining the timer.
            const trailRepeatCount = Math.max(0, Math.floor(duration / TRAIL_INTERVAL_MS) - 1);
            trailInterval = this.scene.time.addEvent({
                delay: TRAIL_INTERVAL_MS,
                repeat: trailRepeatCount,
                callback: () => { var __oc6, __oc7;
                    if (!dagger.active || !(((__oc7 = (__oc6 = this.scene) === null || __oc6 === void 0 ? void 0 : __oc6.scene) === null || __oc7 === void 0 ? void 0 : __oc7.isActive()))) return;
                    const trail = this._getTrailCircle(dagger.x, dagger.y);
                    this.scene.tweens.add({
                        targets: trail,
                        alpha: 0,
                        scale: 0,
                        duration: 180,
                        onComplete: () => this._releaseTrailCircle(trail),
                    });
                },
            });
            entry.trailInterval = trailInterval;
        }
    }

    destroy() { var __oc8, __oc9;
        const tweens = (((__oc8 = this.scene) === null || __oc8 === void 0 ? void 0 : __oc8.tweens));
        for (const entry of this._activeDaggers) {
            if (entry.trailInterval) entry.trailInterval.remove(false);
            if (tweens) tweens.killTweensOf(entry.dagger);
            if ((((__oc9 = entry.dagger) === null || __oc9 === void 0 ? void 0 : __oc9.scene))) entry.dagger.destroy();
        }
        this._activeDaggers = [];
        for (const trail of this._activeTrails) {
            if (trail && trail.scene) {
                if (tweens) tweens.killTweensOf(trail);
                trail.destroy();
            }
        }
        this._activeTrails.clear();
        for (const trail of this._trailPool) {
            if (trail && trail.scene) {
                if (tweens) tweens.killTweensOf(trail);
                trail.destroy();
            }
        }
        this._trailPool = [];
        super.destroy();
    }
}
