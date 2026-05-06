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
            this._delay(i * 100, () => this._throwDagger());
        }
    }

    _throwDagger() {
        const target = this.player.getClosestEnemy(6000);
        if (!target) return;

        if (this.scene.soundManager) this.scene.soundManager.play('daggerThrow');

        const px = this.player.x;
        const py = this.player.y;
        const angle = Phaser.Math.Angle.Between(px, py, target.x, target.y);
        const range = 1500;
        const endX = px + Math.cos(angle) * range;
        const endY = py + Math.sin(angle) * range;
        const duration = 2500;
        const dmg = this.getDamage();
        const effectTexture = this.getEffectTexture();
        const useCharacterEffect = !!effectTexture;
        const useEffectAsset = !useCharacterEffect && this.scene.textures.exists('effect_shadow_dagger');
        const textureKey = effectTexture || (useEffectAsset ? 'effect_shadow_dagger' : 'proj_dagger');

        const dagger = this.scene.add.sprite(px, py, textureKey)
            .setDepth(8)
            .setScale(useCharacterEffect ? (this.config.effectScale || 0.5) : (useEffectAsset ? 0.22 : 0.85))
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

        const tryPierceTarget = (currentTarget) => {
            if (!currentTarget || !currentTarget.active) return false;
            if (currentTarget.isBoss && currentTarget.isInvincible) return false;

            const targetKey = getTargetKey(currentTarget);
            if (piercedTargets.has(targetKey)) return false;

            const hitRadius = Math.max(25, (currentTarget.body?.width || currentTarget.displayWidth || 50) * 0.35);
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

                const bosses = this.scene.activeBosses || [];
                for (const boss of bosses) {
                    tryPierceTarget(boss);
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
