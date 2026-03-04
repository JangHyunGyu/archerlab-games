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
            duration: 180,
            ease: 'Power2',
            onUpdate: () => {
                gfx.clear();

                const thrust = progress.t < 0.4 ? progress.t / 0.4 : (1 - progress.t) / 0.6;
                const fadeAlpha = Math.min(1, (1 - progress.t) * 1.5);

                const startDist = 14;
                const endDist = startDist + stabLength * Math.max(thrust, 0.15);
                const tipX = px + cos * endDist;
                const tipY = py + sin * endDist;
                const hiltX = px + cos * startDist;
                const hiltY = py + sin * startDist;

                // 수직 방향 (칼날 폭 방향)
                const perpX = -sin;
                const perpY = cos;
                const bladeW = 8 * Math.max(thrust, 0.2);

                // 칼날 가장 넓은 부분 (30% 지점)
                const widePt = 0.3;
                const wideX = hiltX + (tipX - hiltX) * widePt;
                const wideY = hiltY + (tipY - hiltY) * widePt;

                // 글로우 외곽
                gfx.fillStyle(0x7b2fff, 0.2 * fadeAlpha);
                gfx.fillTriangle(
                    tipX, tipY,
                    wideX + perpX * (bladeW + 4), wideY + perpY * (bladeW + 4),
                    hiltX, hiltY
                );
                gfx.fillTriangle(
                    tipX, tipY,
                    wideX - perpX * (bladeW + 4), wideY - perpY * (bladeW + 4),
                    hiltX, hiltY
                );

                // 메인 칼날 (왼쪽 반)
                gfx.fillStyle(0xb366ff, 0.9 * fadeAlpha);
                gfx.fillTriangle(
                    tipX, tipY,
                    wideX + perpX * bladeW, wideY + perpY * bladeW,
                    hiltX, hiltY
                );
                // 메인 칼날 (오른쪽 반)
                gfx.fillStyle(0x9944ee, 0.85 * fadeAlpha);
                gfx.fillTriangle(
                    tipX, tipY,
                    wideX - perpX * bladeW, wideY - perpY * bladeW,
                    hiltX, hiltY
                );

                // 칼날 엣지
                gfx.lineStyle(1.5, 0xddccff, 0.8 * fadeAlpha);
                gfx.lineBetween(hiltX, hiltY, tipX, tipY);

                // 칼등 하이라이트
                gfx.lineStyle(1, 0xffffff, 0.5 * fadeAlpha);
                gfx.lineBetween(
                    hiltX + perpX * 1, hiltY + perpY * 1,
                    tipX, tipY
                );

                // 끝부분 빛
                if (thrust > 0.2) {
                    gfx.fillStyle(0xeeddff, 0.9 * fadeAlpha);
                    gfx.fillCircle(tipX, tipY, 3.5);
                }

                // 손잡이 (작은 사각형)
                gfx.fillStyle(0x666688, 0.7 * fadeAlpha);
                const hLen = 6;
                const hEndX = px + cos * (startDist - hLen);
                const hEndY = py + sin * (startDist - hLen);
                gfx.lineStyle(3, 0x888899, 0.6 * fadeAlpha);
                gfx.lineBetween(hEndX, hEndY, hiltX, hiltY);
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
