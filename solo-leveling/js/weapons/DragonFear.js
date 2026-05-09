import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class DragonFear extends WeaponBase {
    constructor(scene, player, config = WEAPONS.dragonFear) {
        super(scene, player, config);
        this.auraSprite = null;
    }

    fire() {
        const range = (this.config.auraRange || 230) + this.extraRange;
        const slowAmount = this.config.slowMultiplier ?? Math.max(0.1, 0.4 - this.extraSlow);
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
        this.auraSprite = this.scene.add.sprite(this.player.x, this.player.y, effectTexture || (useEffectAsset ? 'effect_dragon_fear' : 'proj_fear'))
            .setDepth(3)
            .setAlpha(0)
            .setScale((useCharacterEffect || useEffectAsset) ? (range * 2) / this.auraSpriteWidth(effectTexture, useEffectAsset) : range / 60)
            .setBlendMode((useCharacterEffect || useEffectAsset) ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);

        this.scene.tweens.add({
            targets: this.auraSprite,
            alpha: (useCharacterEffect || useEffectAsset) ? 0.82 : 0.6,
            duration: 200,
        });

        this.scene.tweens.add({
            targets: this.auraSprite,
            alpha: 0,
            scale: this.auraSprite.scaleX * 1.3,
            duration: Math.max(500, auraDuration - 500),
            delay: 500,
            onComplete: () => {
                if (this.auraSprite) {
                    this.auraSprite.destroy();
                    this.auraSprite = null;
                }
            },
        });

        this.playConfiguredSound('fear');

        if (this.config.healPercent && this.player?.heal) {
            this.player.heal(Math.floor(this.player.stats.maxHp * this.config.healPercent));
        }

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

    auraSpriteWidth(effectTexture, useEffectAsset) {
        if (effectTexture && this.scene.textures.exists(effectTexture)) {
            return this.scene.textures.get(effectTexture).getSourceImage().width || 320;
        }
        return useEffectAsset ? 614 : 320;
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
