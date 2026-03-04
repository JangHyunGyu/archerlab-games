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
                const ex = px + cos * endDist;
                const ey = py + sin * endDist;
                const hx = px + cos * startDist;
                const hy = py + sin * startDist;

                // 칼날 폭 (perpendicular offset)
                const perpX = -sin;
                const perpY = cos;
                const bladeW = 5 * thrust;

                // 칼날 꼭짓점: 끝(뾰족) → 좌측 → 손잡이 → 우측
                const tipX = ex, tipY = ey;
                const midDist = startDist + (endDist - startDist) * 0.35;
                const mx = px + cos * midDist;
                const my = py + sin * midDist;
                const lx = mx + perpX * bladeW;
                const ly = my + perpY * bladeW;
                const rx = mx - perpX * bladeW;
                const ry = my - perpY * bladeW;

                // 글로우 (넓은 칼날 실루엣)
                gfx.fillStyle(0x7b2fff, 0.15 * fadeAlpha);
                gfx.beginPath();
                gfx.moveTo(tipX + perpX * 2, tipY + perpY * 2);
                gfx.lineTo(lx + perpX * 3, ly + perpY * 3);
                gfx.lineTo(hx + perpX * 2, hy + perpY * 2);
                gfx.lineTo(hx - perpX * 2, hy - perpY * 2);
                gfx.lineTo(rx - perpX * 3, ry - perpY * 3);
                gfx.lineTo(tipX - perpX * 2, tipY - perpY * 2);
                gfx.closePath();
                gfx.fillPath();

                // 메인 칼날 (다이아몬드 형태)
                gfx.fillStyle(0xb366ff, 0.85 * fadeAlpha);
                gfx.beginPath();
                gfx.moveTo(tipX, tipY);
                gfx.lineTo(lx, ly);
                gfx.lineTo(hx, hy);
                gfx.lineTo(rx, ry);
                gfx.closePath();
                gfx.fillPath();

                // 칼날 엣지 라인
                gfx.lineStyle(1, 0xddccff, 0.7 * fadeAlpha);
                gfx.beginPath();
                gfx.moveTo(tipX, tipY);
                gfx.lineTo(lx, ly);
                gfx.moveTo(tipX, tipY);
                gfx.lineTo(rx, ry);
                gfx.strokePath();

                // 중앙 하이라이트 (칼등)
                gfx.lineStyle(1.5, 0xffffff, 0.6 * fadeAlpha);
                gfx.lineBetween(hx, hy, tipX, tipY);

                // 끝부분 빛
                if (thrust > 0.3) {
                    gfx.fillStyle(0xeeddff, 0.9 * fadeAlpha);
                    gfx.fillCircle(tipX, tipY, 3);
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

                    // Impact spark circles
                    const spark1 = this.scene.add.circle(
                        enemy.x + Phaser.Math.Between(-5, 5),
                        enemy.y + Phaser.Math.Between(-5, 5),
                        3, 0xddaaff, 0.9
                    ).setDepth(9);
                    this.scene.tweens.add({
                        targets: spark1, alpha: 0, scale: 0,
                        duration: 200, onComplete: () => spark1.destroy(),
                    });
                    const spark2 = this.scene.add.circle(
                        enemy.x + Phaser.Math.Between(-5, 5),
                        enemy.y + Phaser.Math.Between(-5, 5),
                        2, 0xffffff, 0.8
                    ).setDepth(9);
                    this.scene.tweens.add({
                        targets: spark2, alpha: 0, scale: 0,
                        duration: 150, onComplete: () => spark2.destroy(),
                    });
                }
            }
        });

        if (this.scene.soundManager) this.scene.soundManager.play('dagger');
    }

    destroy() {}
}
