import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class RulersAuthority extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.rulersAuthority);
    }

    fire() {
        for (let i = 0; i < this.count; i++) {
            this.scene.time.delayedCall(i * 300, () => this._blast());
        }
    }

    _blast() {
        const range = 160 + this.extraRange;

        // Find a cluster of enemies, or default to player position
        let targetX = this.player.x;
        let targetY = this.player.y;

        const enemies = this.player.getAllEnemies();
        if (enemies.length > 0) {
            // Target the densest cluster
            let bestCount = 0;
            for (const enemy of enemies) {
                if (!enemy.active) continue;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                if (dist > 600) continue;

                let count = 0;
                for (const other of enemies) {
                    if (!other.active) continue;
                    if (Phaser.Math.Distance.Between(enemy.x, enemy.y, other.x, other.y) < range) count++;
                }
                if (count > bestCount) {
                    bestCount = count;
                    targetX = enemy.x;
                    targetY = enemy.y;
                }
            }
        }

        // Visual effect - expanding circle
        const circle = this.scene.add.sprite(targetX, targetY, 'proj_ruler')
            .setDepth(7)
            .setAlpha(0)
            .setScale(0.2);

        this.scene.tweens.add({
            targets: circle,
            alpha: 0.8,
            scaleX: range / 50,
            scaleY: range / 50,
            duration: 300,
            yoyo: true,
            hold: 100,
            onComplete: () => circle.destroy(),
        });

        // Ground crack effect
        const crack = this.scene.add.circle(targetX, targetY, range * 0.3, COLORS.SHADOW_PRIMARY, 0.3)
            .setDepth(3);
        this.scene.tweens.add({
            targets: crack,
            alpha: 0,
            scale: 2,
            duration: 500,
            onComplete: () => crack.destroy(),
        });

        // Deal damage to enemies in range
        this.scene.time.delayedCall(200, () => {
            for (const enemy of enemies) {
                if (!enemy.active) continue;
                const dist = Phaser.Math.Distance.Between(targetX, targetY, enemy.x, enemy.y);
                if (dist < range) {
                    enemy.takeDamage(this.getDamage(), targetX, targetY);
                }
            }
        });
    }

    destroy() {}
}
