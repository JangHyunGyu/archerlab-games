import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class RulersAuthority extends WeaponBase {
    constructor(scene, player, config = WEAPONS.rulersAuthority) {
        super(scene, player, config);
    }

    fire() {
        const strikeCount = Math.max(1, this.config.strikeCount || 1);
        const strikeDelay = this.config.strikeDelay ?? 300;
        let sequence = 0;
        for (let cast = 0; cast < this.count; cast++) {
            for (let strike = 0; strike < strikeCount; strike++) {
                this._delay(sequence * strikeDelay, () => this._blast(strike));
                sequence++;
            }
        }
    }

    _blast(strikeIndex = 0) {
        const range = (this.config.blastRange || 160) + this.extraRange;

        this.playConfiguredSound('authority');
        if (strikeIndex === 0 && this.config.healPercent && this.player?.heal) {
            this.player.heal(Math.floor(this.player.stats.maxHp * this.config.healPercent));
        }

        // Find a nearby enemy cluster, or default to player position if no threat is close.
        let targetX = this.player.x;
        let targetY = this.player.y;

        if (this.config.targetMode !== 'self') {
            const enemies = this.player.getAllEnemies();
            const acquireRange = this.config.acquireRange || Math.max(560, range * 3.25);
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
        }

        if (this.config.targetMode === 'randomCluster' && strikeIndex > 0) {
            const offsetRadius = this.config.randomOffsetRadius || range;
            const offsetAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const offsetDist = Phaser.Math.FloatBetween(range * 0.25, offsetRadius);
            targetX += Math.cos(offsetAngle) * offsetDist;
            targetY += Math.sin(offsetAngle) * offsetDist;
        }

        if (strikeIndex === 0 && this.player.playAttackMotion) {
            const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY);
            this.player.playAttackMotion(angle, this.config.motionDuration || 260, 1);
        }

        // Visual effect - expanding circle
        const effectTexture = this.getEffectTexture();
        const useCharacterEffect = !!effectTexture;
        const useEffectAsset = !useCharacterEffect && this.scene.textures.exists('effect_ruler_authority');
        const circle = this.scene.add.sprite(targetX, targetY, effectTexture || (useEffectAsset ? 'effect_ruler_authority' : 'proj_ruler'))
            .setDepth(7)
            .setAlpha(0)
            .setScale((useCharacterEffect || useEffectAsset) ? 0.08 : 0.2)
            .setBlendMode((useCharacterEffect || useEffectAsset) ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);

        this.scene.tweens.add({
            targets: circle,
            alpha: (useCharacterEffect || useEffectAsset) ? 0.92 : 0.8,
            scaleX: (useCharacterEffect || useEffectAsset) ? (range * 2) / circle.width : range / 50,
            scaleY: (useCharacterEffect || useEffectAsset) ? (range * 2) / circle.width : range / 50,
            duration: 300,
            yoyo: true,
            hold: 100,
            onComplete: () => circle.destroy(),
        });

        // Ground crack effect
        const crack = this.scene.add.circle(targetX, targetY, range * 0.3, this.getEffectColor(COLORS.SHADOW_PRIMARY), 0.3)
            .setDepth(3);
        this.scene.tweens.add({
            targets: crack,
            alpha: 0,
            scale: 2,
            duration: 500,
            onComplete: () => crack.destroy(),
        });

        // Deal damage to enemies in range
        this._delay(this.config.impactDelay ?? 200, () => {
            if (!this.scene?.scene?.isActive()) return;
            const damage = Math.floor(this.getDamage() * (this.config.damageMult ?? 1));
            const enemies = this.player.getAllEnemies();
            for (const enemy of enemies) {
                if (!enemy.active) continue;
                const dist = Phaser.Math.Distance.Between(targetX, targetY, enemy.x, enemy.y);
                if (dist <= range) {
                    enemy.takeDamage(damage, targetX, targetY);
                    if (this.config.slowMultiplier !== undefined && enemy.applySlow) {
                        enemy.applySlow(this.config.slowMultiplier, this.config.slowDuration || 1800);
                    }
                }
            }
        });
    }

    destroy() {
        super.destroy();
    }
}
