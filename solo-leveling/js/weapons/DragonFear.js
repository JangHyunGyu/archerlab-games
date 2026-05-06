import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class DragonFear extends WeaponBase {
    constructor(scene, player, config = WEAPONS.dragonFear) {
        super(scene, player, config);
        this.auraSprite = null;
    }

    fire() {
        const range = 230 + this.extraRange;
        const slowAmount = 0.4 - this.extraSlow;

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
            duration: 1500,
            delay: 500,
            onComplete: () => {
                if (this.auraSprite) {
                    this.auraSprite.destroy();
                    this.auraSprite = null;
                }
            },
        });

        if (this.scene.soundManager) this.scene.soundManager.play('fear');

        // Aura lasts ~2 seconds
        this._auraEndTime = this.scene.time.now + 2000;
        this._auraRange = range;
        this._auraSlowAmount = slowAmount;

        // Apply damage & slow to enemies currently in range
        const enemies = this.player.getAllEnemies();
        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            if (dist < range) {
                enemy.takeDamage(this.getDamage(), this.player.x, this.player.y);
                if (enemy.applySlow) enemy.applySlow(slowAmount, 2000);
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
