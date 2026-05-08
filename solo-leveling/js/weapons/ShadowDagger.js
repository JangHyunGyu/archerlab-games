import { WeaponBase } from './WeaponBase.js';
import { WEAPONS } from '../utils/Constants.js';

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

    _firePattern() {
        const fanCount = Math.max(1, this.config.fanCount || 1);
        const fanSpread = this.config.fanSpread ?? 0.24;
        for (let i = 0; i < fanCount; i++) {
            const offset = (i - (fanCount - 1) / 2) * fanSpread;
            this._throwDagger(offset, i === 0);
        }
    }

    _throwDagger(angleOffset = 0, playSound = true) {
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
        const dmg = Math.floor(this.getDamage() * (this.config.damageMult ?? 1));
        const effectTexture = this.getEffectTexture();
        const useCharacterEffect = !!effectTexture;
        const useEffectAsset = !useCharacterEffect && this.scene.textures.exists('effect_shadow_dagger');
        const textureKey = effectTexture || (useEffectAsset ? 'effect_shadow_dagger' : 'proj_dagger');
        const maxPierces = this.config.maxPierces ?? Infinity;
        const hitRadiusScale = this.config.hitRadiusScale ?? 0.35;
        const minHitRadius = this.config.minHitRadius ?? 25;
        const explosionRadius = this.config.explosionRadius || 0;
        const explosionDamageMult = this.config.explosionDamageMult ?? 0.65;
        const slowMultiplier = this.config.slowMultiplier;
        const slowDuration = this.config.slowDuration || 1400;

        const dagger = this.scene.add.sprite(px, py, textureKey)
            .setDepth(8)
            .setScale(useCharacterEffect ? (this.config.projectileScale || this.config.effectScale || 0.5) : (useEffectAsset ? 0.22 : 0.85))
            .setRotation((useCharacterEffect || useEffectAsset) ? angle : angle + Math.PI / 2)
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

            for (const enemy of this.player.getAllEnemies()) {
                if (!enemy || !enemy.active) continue;
                const enemyKey = getTargetKey(enemy);
                if (enemyKey === sourceKey) continue;
                const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
                if (dist > explosionRadius) continue;
                enemy.takeDamage(Math.floor(dmg * explosionDamageMult), x, y);
                applySecondaryEffect(enemy, Math.floor(slowDuration * 0.7));
            }
        };

        const tryPierceTarget = (currentTarget) => {
            if (!currentTarget || !currentTarget.active) return false;
            if (currentTarget.isBoss && currentTarget.isInvincible) return false;
            if (piercedTargets.size >= maxPierces) return false;

            const targetKey = getTargetKey(currentTarget);
            if (piercedTargets.has(targetKey)) return false;

            const hitRadius = Math.max(minHitRadius, (currentTarget.body?.width || currentTarget.displayWidth || 50) * hitRadiusScale);
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
                currentTarget.takeDamage(dmg);
            } else {
                currentTarget.takeDamage(dmg, dagger.x, dagger.y);
            }
            applySecondaryEffect(currentTarget);
            explode(dagger.x, dagger.y, targetKey);

            if (this.scene.soundManager) this.scene.soundManager.play('hit');

            const spark = this.scene.add.circle(dagger.x, dagger.y, 6, this.getEffectColor(0xb366ff), 0.8).setDepth(9);
            this.scene.tweens.add({
                targets: spark,
                alpha: 0,
                scale: 3,
                duration: 200,
                onComplete: () => spark.destroy(),
            });

            return true;
        };

        const cleanup = () => {
            if (trailInterval) {
                trailInterval.destroy();
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

        trailInterval = this.scene.time.addEvent({
            delay: 50,
            repeat: duration / 50,
            callback: () => {
                if (!dagger.active || !this.scene?.scene?.isActive()) return;
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

    destroy() {
        const tweens = this.scene?.tweens;
        for (const entry of this._activeDaggers) {
            if (entry.trailInterval) entry.trailInterval.destroy();
            if (tweens) tweens.killTweensOf(entry.dagger);
            if (entry.dagger?.scene) entry.dagger.destroy();
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
