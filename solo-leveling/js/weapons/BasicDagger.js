import { WeaponBase } from './WeaponBase.js';
import { COLORS } from '../utils/Constants.js';

const BASIC_DAGGER_CONFIG = {
    name: '카심의 독',
    description: '단검으로 가까운 적을 빠르게 벱니다',
    type: 'melee',
    baseDamage: 10,
    baseCooldown: 650,
    baseCount: 1,
    levelBonuses: {
        2: { damage: 3 },
        3: { count: 1 },
        4: { damage: 4 },
        5: { cooldown: -50 },
        6: { count: 1 },
        7: { damage: 6 },
        8: { count: 1, damage: 4 },
    },
};

export class BasicDagger extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, BASIC_DAGGER_CONFIG);
        this.attackRange = 150;
        this.swingDir = 1; // Alternate swing direction
    }

    fire() {
        for (let i = 0; i < this.count; i++) {
            this.scene.time.delayedCall(i * 120, () => this._slash());
        }
    }

    _slash() {
        const target = this.player.getClosestEnemy(this.attackRange + 50);

        let baseAngle;
        if (target) {
            baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
        } else {
            baseAngle = this.player.facingRight ? 0 : Math.PI;
        }

        // Alternate swing direction each attack
        this.swingDir *= -1;
        const swingStart = baseAngle + this.swingDir * 0.8;  // ~45 degrees offset
        const swingEnd = baseAngle - this.swingDir * 0.8;
        const px = this.player.x;
        const py = this.player.y;
        const slashRadius = this.attackRange * 0.75;

        // Draw the slash arc with multiple frames via tween
        const slashGfx = this.scene.add.graphics().setDepth(8);
        const trailGfx = this.scene.add.graphics().setDepth(7);

        let progress = { t: 0 };

        this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 150,
            ease: 'Power2',
            onUpdate: () => {
                slashGfx.clear();
                trailGfx.clear();

                const currentAngle = Phaser.Math.Linear(swingStart, swingEnd, progress.t);
                const prevAngle = Phaser.Math.Linear(swingStart, swingEnd, Math.max(0, progress.t - 0.3));
                const farPrevAngle = Phaser.Math.Linear(swingStart, swingEnd, Math.max(0, progress.t - 0.5));

                // Afterimage trail (wide, faded)
                trailGfx.lineStyle(14, 0x7b2fff, 0.08 * (1 - progress.t));
                trailGfx.beginPath();
                trailGfx.arc(px, py, slashRadius, farPrevAngle, prevAngle, this.swingDir > 0);
                trailGfx.strokePath();

                // Main trail (purple)
                trailGfx.lineStyle(10, 0x7b2fff, 0.25 * (1 - progress.t));
                trailGfx.beginPath();
                trailGfx.arc(px, py, slashRadius, prevAngle, currentAngle, this.swingDir > 0);
                trailGfx.strokePath();

                // Bright slash line (purple glow)
                const arcStart = Phaser.Math.Linear(swingStart, swingEnd, Math.max(0, progress.t - 0.15));
                slashGfx.lineStyle(5, 0xb366ff, 0.9 * (1 - progress.t * 0.5));
                slashGfx.beginPath();
                slashGfx.arc(px, py, slashRadius, arcStart, currentAngle, this.swingDir > 0);
                slashGfx.strokePath();

                // Inner blade edge (white core)
                slashGfx.lineStyle(2, 0xffffff, 0.7 * (1 - progress.t * 0.6));
                slashGfx.beginPath();
                slashGfx.arc(px, py, slashRadius, arcStart, currentAngle, this.swingDir > 0);
                slashGfx.strokePath();

                // Dagger tip glow
                const tipX = px + Math.cos(currentAngle) * slashRadius;
                const tipY = py + Math.sin(currentAngle) * slashRadius;
                slashGfx.fillStyle(0xd4aaff, 0.9);
                slashGfx.fillCircle(tipX, tipY, 4);
                slashGfx.fillStyle(0xffffff, 0.6);
                slashGfx.fillCircle(tipX, tipY, 2);

                // Spark particles along arc
                if (progress.t > 0.1 && progress.t < 0.9) {
                    for (let s = 0; s < 2; s++) {
                        const spark = this.scene.add.circle(
                            tipX + Phaser.Math.Between(-6, 6),
                            tipY + Phaser.Math.Between(-6, 6),
                            Phaser.Math.Between(1, 3),
                            0xd4aaff, 0.8
                        ).setDepth(9);
                        this.scene.tweens.add({
                            targets: spark,
                            alpha: 0, scale: 0,
                            x: spark.x + Phaser.Math.Between(-15, 15),
                            y: spark.y + Phaser.Math.Between(-15, 15),
                            duration: 200,
                            onComplete: () => spark.destroy(),
                        });
                    }
                }
            },
            onComplete: () => {
                slashGfx.destroy();
                trailGfx.destroy();
            },
        });

        // Deal damage on the swing midpoint
        this.scene.time.delayedCall(60, () => {
            const enemies = this.player.getAllEnemies();
            for (const enemy of enemies) {
                if (!enemy.active) continue;
                const dist = Phaser.Math.Distance.Between(px, py, enemy.x, enemy.y);
                if (dist > this.attackRange) continue;

                // Check if enemy is in the swing arc
                const enemyAngle = Phaser.Math.Angle.Between(px, py, enemy.x, enemy.y);
                const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - baseAngle));
                if (angleDiff < Math.PI / 3) {
                    enemy.takeDamage(this.getDamage(), px, py);
                    if (this.scene.soundManager) this.scene.soundManager.play('hit');
                }
            }
        });

        // Sound
        if (this.scene.soundManager) this.scene.soundManager.play('dagger');
    }

    destroy() {}
}
