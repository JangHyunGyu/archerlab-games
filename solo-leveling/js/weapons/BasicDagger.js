import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class BasicDagger extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.basicDagger);
        this.attackRange = 150;
        this.swingDir = 1;
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

        this.swingDir *= -1;
        const sideOffset = this.swingDir * 0.15;
        const stabAngle = baseAngle + sideOffset;
        const px = this.player.x;
        const py = this.player.y;
        const stabLength = this.attackRange * 0.75;
        const cos = Math.cos(stabAngle);
        const sin = Math.sin(stabAngle);

        // Single graphics object for stab visual
        const gfx = this.scene.add.graphics().setDepth(8);

        let progress = { t: 0 };
        this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 120,
            ease: 'Power3',
            onUpdate: () => {
                gfx.clear();

                const thrust = progress.t < 0.5 ? progress.t * 2 : 2 - progress.t * 2;
                const fadeAlpha = 1 - progress.t;

                const startDist = 12;
                const endDist = startDist + stabLength * thrust;
                const sx = px + cos * startDist;
                const sy = py + sin * startDist;
                const ex = px + cos * endDist;
                const ey = py + sin * endDist;

                // Glow trail
                gfx.lineStyle(10, 0x7b2fff, 0.15 * fadeAlpha);
                gfx.lineBetween(sx, sy, ex, ey);

                // Main blade
                gfx.lineStyle(4, 0xb366ff, 0.85 * fadeAlpha);
                gfx.lineBetween(sx, sy, ex, ey);

                // White core
                gfx.lineStyle(1.5, 0xffffff, 0.7 * fadeAlpha);
                gfx.lineBetween(sx, sy, ex, ey);

                // Tip glow
                if (thrust > 0.3) {
                    gfx.fillStyle(0xd4aaff, 0.9 * fadeAlpha);
                    gfx.fillCircle(ex, ey, 4);
                }
            },
            onComplete: () => {
                gfx.destroy();
            },
        });

        // Deal damage at thrust peak
        this.scene.time.delayedCall(50, () => {
            const enemies = this.player.getAllEnemies();
            for (const enemy of enemies) {
                if (!enemy.active) continue;
                const dist = Phaser.Math.Distance.Between(px, py, enemy.x, enemy.y);
                if (dist > this.attackRange) continue;

                const enemyAngle = Phaser.Math.Angle.Between(px, py, enemy.x, enemy.y);
                const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - baseAngle));
                if (angleDiff < Math.PI / 6) {
                    enemy.takeDamage(this.getDamage(), px, py);
                    if (this.scene.soundManager) this.scene.soundManager.play('hit');
                }
            }
        });

        if (this.scene.soundManager) this.scene.soundManager.play('dagger');
    }

    destroy() {}
}
