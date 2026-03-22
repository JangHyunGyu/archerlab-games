import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class DragonFear extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.dragonFear);
        this.auraSprite = null;
    }

    fire() {
        const range = 200 + this.extraRange;
        const slowAmount = 0.4 - this.extraSlow; // Lower = slower
        const slowDuration = 3500;

        // Visual aura effect (이전 트윈 확실히 정리)
        if (this.auraSprite) {
            this.scene.tweens.killTweensOf(this.auraSprite);
            this.auraSprite.destroy();
        }
        this.auraSprite = this.scene.add.sprite(this.player.x, this.player.y, 'proj_fear')
            .setDepth(3)
            .setAlpha(0)
            .setScale(range / 60);

        this.scene.tweens.add({
            targets: this.auraSprite,
            alpha: 0.6,
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

        // Apply slow & damage to enemies in range
        const enemies = this.player.getAllEnemies();
        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            if (dist < range) {
                enemy.takeDamage(this.getDamage(), this.player.x, this.player.y);
                if (enemy.applySlow) enemy.applySlow(slowAmount, slowDuration);
            }
        }
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.auraSprite && this.auraSprite.active) {
            this.auraSprite.setPosition(this.player.x, this.player.y);

            const range = 200 + this.extraRange;
            const slowAmount = 0.4 - this.extraSlow;
            const enemies = this.player.getAllEnemies();
            for (const enemy of enemies) {
                if (!enemy.active) continue;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                if (dist < range) {
                    if (enemy.applySlow) enemy.applySlow(slowAmount, 500);
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
    }
}
