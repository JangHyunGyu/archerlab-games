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

        if (this.scene.soundManager) this.scene.soundManager.play('authority');

        // Find a nearby enemy cluster, or default to player position if no threat is close.
        let targetX = this.player.x;
        let targetY = this.player.y;

        const enemies = this.player.getAllEnemies();
        const acquireRange = Math.max(560, range * 3.25);
        const candidates = enemies.filter((enemy) => {
            if (!enemy.active) return false;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            return dist <= acquireRange;
        });

        if (candidates.length > 0) {
            let bestTarget = null;
            let bestScore = -Infinity;
            let bestDist = Infinity;
            for (const enemy of candidates) {
                const distToPlayer = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                let score = 0;
                for (const other of candidates) {
                    const clusterDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, other.x, other.y);
                    if (clusterDist <= range) {
                        score += 1 + (1 - clusterDist / range) * 0.6;
                    }
                }

                score -= distToPlayer / acquireRange * 0.12;
                if (score > bestScore || (score === bestScore && distToPlayer < bestDist)) {
                    bestScore = score;
                    bestDist = distToPlayer;
                    bestTarget = enemy;
                }
            }

            if (bestTarget) {
                targetX = bestTarget.x;
                targetY = bestTarget.y;
            }
        }

        // Visual effect - expanding circle
        const useEffectAsset = this.scene.textures.exists('effect_ruler_authority');
        const circle = this.scene.add.sprite(targetX, targetY, useEffectAsset ? 'effect_ruler_authority' : 'proj_ruler')
            .setDepth(7)
            .setAlpha(0)
            .setScale(useEffectAsset ? 0.08 : 0.2)
            .setBlendMode(useEffectAsset ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);

        this.scene.tweens.add({
            targets: circle,
            alpha: useEffectAsset ? 0.92 : 0.8,
            scaleX: useEffectAsset ? (range * 2) / circle.width : range / 50,
            scaleY: useEffectAsset ? (range * 2) / circle.width : range / 50,
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
            if (!this.scene?.scene?.isActive()) return;
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
