import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class DragonFear extends WeaponBase {
    constructor(scene, player, config = WEAPONS.dragonFear) {
        super(scene, player, config);
        this.auraSprite = null;
    }

    fire() {
        const range = (this.config.auraRange || 230) + this.extraRange;
        const slowAmount = Math.max(0.1, (this.config.slowMultiplier ?? 0.4) - this.extraSlow);
        const auraDuration = this.config.auraDuration || 2000;
        if (this.player.playAttackMotion) {
            const angle = this.player.moveIntensity > 0.12
                ? this.player.lastMoveAngle
                : (this.player.facingRight ? 0 : Math.PI);
            this.player.playAttackMotion(angle, this.config.motionDuration || 280, 1);
        }

        // Visual aura effect (이전 트윈 확실히 정리)
        if (this.auraSprite) {
            this.scene.tweens.killTweensOf(this.auraSprite);
            this.auraSprite.destroy();
        }
        const effectTexture = this.getEffectTexture();
        const useCharacterEffect = !!effectTexture;
        const useEffectAsset = !useCharacterEffect && this.scene.textures.exists('effect_dragon_fear');
        const visualTexture = effectTexture || (useEffectAsset ? 'effect_dragon_fear' : null);
        const fittedScale = (useCharacterEffect || useEffectAsset)
            ? this.getEffectScaleForVisibleSize(visualTexture, range * 2)
            : { x: range / 60, y: range / 60 };
        const targetScaleX = fittedScale.x;
        const targetScaleY = fittedScale.y;
        this.auraSprite = this.createEffectSprite(
            this.player.x,
            this.player.y,
            effectTexture || (useEffectAsset ? 'effect_dragon_fear' : 'proj_fear'),
            { frameMs: Math.max(48, Math.round(auraDuration / 6)) },
        )
            .setDepth(3)
            .setAlpha(0)
            .setBlendMode((useCharacterEffect || useEffectAsset) ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
        const startRatio = this.config.smoothVisual ? (this.config.visualStartScaleRatio ?? 0.55) : 1;
        this.auraSprite.setScale(targetScaleX * startRatio, targetScaleY * startRatio);
        const auraSprite = this.auraSprite;

        if (this.config.smoothVisual) {
            const fadeInDuration = this.config.visualFadeInDuration ?? 320;
            const fadeOutDuration = this.config.visualFadeOutDuration ?? 430;
            const holdDuration = Math.max(0, auraDuration - fadeInDuration - fadeOutDuration);
            this.scene.tweens.add({
                targets: auraSprite,
                alpha: this.config.visualPeakAlpha ?? ((useCharacterEffect || useEffectAsset) ? 0.76 : 0.58),
                scaleX: targetScaleX * (this.config.visualPeakScaleRatio ?? 1),
                scaleY: targetScaleY * (this.config.visualPeakScaleRatio ?? 1),
                duration: fadeInDuration,
                ease: 'Sine.easeOut',
                onComplete: () => {
                    this.scene.tweens.add({
                        targets: auraSprite,
                        alpha: 0,
                        scaleX: targetScaleX * (this.config.visualEndScaleRatio ?? 1.22),
                        scaleY: targetScaleY * (this.config.visualEndScaleRatio ?? 1.22),
                        duration: fadeOutDuration,
                        delay: this.config.visualHoldDuration ?? holdDuration,
                        ease: 'Sine.easeInOut',
                        onComplete: () => {
                            if (auraSprite?.active) auraSprite.destroy();
                            if (this.auraSprite === auraSprite) {
                                this.auraSprite = null;
                            }
                        },
                    });
                },
            });
        } else {
            this.scene.tweens.add({
                targets: auraSprite,
                alpha: (useCharacterEffect || useEffectAsset) ? 0.82 : 0.6,
                duration: 200,
            });

            this.scene.tweens.add({
                targets: auraSprite,
                alpha: 0,
                scaleX: targetScaleX * 1.3,
                scaleY: targetScaleY * 1.3,
                duration: Math.max(500, auraDuration - 500),
                delay: 500,
                onComplete: () => {
                    if (auraSprite?.active) auraSprite.destroy();
                    if (this.auraSprite === auraSprite) {
                        this.auraSprite = null;
                    }
                },
            });
        }

        this.playConfiguredSound('fear');

        this.healPlayerFromConfig();

        this._auraEndTime = this.scene.time.now + auraDuration;
        this._auraRange = range;
        this._auraSlowAmount = slowAmount;

        // Apply damage & slow to enemies currently in range
        this._damageEnemiesInAura(range, slowAmount, auraDuration, this.config.damageMult ?? 1);

        const tickCount = Math.max(0, this.config.tickCount || 0);
        const tickInterval = this.config.tickInterval || 600;
        for (let i = 0; i < tickCount; i++) {
            this._delay((i + 1) * tickInterval, () => {
                if (!this.scene?.scene?.isActive() || !this.player?.active) return;
                const remaining = Math.max(300, this._auraEndTime - this.scene.time.now);
                this._damageEnemiesInAura(range, slowAmount, remaining, this.config.tickDamageMult ?? 0.35);
            });
        }
    }

    _damageEnemiesInAura(range, slowAmount, slowDuration, damageMult) {
        const enemies = this.player.getAllEnemies();
        const damage = Math.floor(this.getDamage() * damageMult);
        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            if (dist < range) {
                if (damage > 0) this.applyDamage(enemy, damage, this.player.x, this.player.y);
                if (enemy.applySlow) enemy.applySlow(slowAmount, slowDuration);
            }
        }
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.auraSprite && this.auraSprite.active) {
            this.auraSprite.setPosition(this.player.x, this.player.y);

            if (this._auraEndTime && this.scene.time.now < this._auraEndTime) {
                const remaining = this._auraEndTime - this.scene.time.now;
                const enemies = this.player.getAllEnemies();
                for (const enemy of enemies) {
                    if (!enemy.active) continue;
                    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                    if (dist < this._auraRange) {
                        if (enemy.applySlow) enemy.applySlow(this._auraSlowAmount, remaining);
                    }
                }
            }
        }
    }

    destroy() {
        if (this.auraSprite) {
            if (this.scene?.tweens) this.scene.tweens.killTweensOf(this.auraSprite);
            this.auraSprite.destroy();
            this.auraSprite = null;
        }
        super.destroy();
    }
}
