import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class DragonFear extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.dragonFear);
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
        const useEffectAsset = this.scene.textures.exists('effect_dragon_fear');
        this.auraSprite = this.scene.add.sprite(this.player.x, this.player.y, useEffectAsset ? 'effect_dragon_fear' : 'proj_fear')
            .setDepth(3)
            .setAlpha(0)
            .setScale(useEffectAsset ? (range * 2) / 614 : range / 60)
            .setBlendMode(useEffectAsset ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);

        this.scene.tweens.add({
            targets: this.auraSprite,
            alpha: useEffectAsset ? 0.82 : 0.6,
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

    destroy() {
        if (this.auraSprite) {
            if (this.scene?.tweens) this.scene.tweens.killTweensOf(this.auraSprite);
            this.auraSprite.destroy();
            this.auraSprite = null;
        }
        super.destroy();
    }
}
