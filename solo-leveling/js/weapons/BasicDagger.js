import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class BasicDagger extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.basicDagger);
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

        // Alternate slight offset for multi-stab variation
        this.swingDir *= -1;
        const sideOffset = this.swingDir * 0.15;
        const stabAngle = baseAngle + sideOffset;
        const px = this.player.x;
        const py = this.player.y;
        const stabLength = this.attackRange * 0.75;

        // Stab visual: straight thrust line
        const stabGfx = this.scene.add.graphics().setDepth(8);
        const glowGfx = this.scene.add.graphics().setDepth(7);

        const cos = Math.cos(stabAngle);
        const sin = Math.sin(stabAngle);

        let progress = { t: 0 };

        this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 120,
            ease: 'Power3',
            onUpdate: () => {
                stabGfx.clear();
                glowGfx.clear();

                // Thrust extends outward then retracts
                const thrust = progress.t < 0.5
                    ? progress.t * 2         // extend 0→1
                    : 2 - progress.t * 2;    // retract 1→0
                const fadeAlpha = 1 - progress.t;

                const startDist = 12;
                const endDist = startDist + stabLength * thrust;
                const sx = px + cos * startDist;
                const sy = py + sin * startDist;
                const ex = px + cos * endDist;
                const ey = py + sin * endDist;

                // Outer glow trail
                glowGfx.lineStyle(10, 0x7b2fff, 0.15 * fadeAlpha);
                glowGfx.lineBetween(sx, sy, ex, ey);

                // Main blade line (purple)
                stabGfx.lineStyle(4, 0xb366ff, 0.85 * fadeAlpha);
                stabGfx.lineBetween(sx, sy, ex, ey);

                // White core
                stabGfx.lineStyle(1.5, 0xffffff, 0.7 * fadeAlpha);
                stabGfx.lineBetween(sx, sy, ex, ey);

                // Tip glow
                if (thrust > 0.3) {
                    stabGfx.fillStyle(0xd4aaff, 0.9 * fadeAlpha);
                    stabGfx.fillCircle(ex, ey, 4);
                    stabGfx.fillStyle(0xffffff, 0.6 * fadeAlpha);
                    stabGfx.fillCircle(ex, ey, 2);
                }

                // Impact sparks at max extension
                if (progress.t > 0.3 && progress.t < 0.6) {
                    for (let s = 0; s < 2; s++) {
                        const sparkAngle = stabAngle + Phaser.Math.FloatBetween(-0.8, 0.8);
                        const sparkDist = Phaser.Math.FloatBetween(3, 12);
                        const spark = this.scene.add.circle(
                            ex + Math.cos(sparkAngle) * sparkDist,
                            ey + Math.sin(sparkAngle) * sparkDist,
                            Phaser.Math.FloatBetween(1, 2.5),
                            0xd4aaff, 0.8
                        ).setDepth(9);
                        this.scene.tweens.add({
                            targets: spark,
                            alpha: 0, scale: 0,
                            x: spark.x + Math.cos(sparkAngle) * 10,
                            y: spark.y + Math.sin(sparkAngle) * 10,
                            duration: 150,
                            onComplete: () => spark.destroy(),
                        });
                    }
                }
            },
            onComplete: () => {
                stabGfx.destroy();
                glowGfx.destroy();
            },
        });

        // Deal damage at thrust peak
        this.scene.time.delayedCall(50, () => {
            const enemies = this.player.getAllEnemies();
            for (const enemy of enemies) {
                if (!enemy.active) continue;
                const dist = Phaser.Math.Distance.Between(px, py, enemy.x, enemy.y);
                if (dist > this.attackRange) continue;

                // Narrow cone check for stab (±30 degrees)
                const enemyAngle = Phaser.Math.Angle.Between(px, py, enemy.x, enemy.y);
                const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - baseAngle));
                if (angleDiff < Math.PI / 6) {
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
