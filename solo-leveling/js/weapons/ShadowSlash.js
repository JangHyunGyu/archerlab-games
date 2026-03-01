import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class ShadowSlash extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.shadowSlash);
        this.slashGroup = scene.physics.add.group();
    }

    fire() {
        for (let i = 0; i < this.count; i++) {
            const angleOffset = this.count > 1 ? (i - (this.count - 1) / 2) * 0.8 : 0;
            this.scene.time.delayedCall(i * 150, () => this._doSlash(angleOffset));
        }
    }

    _doSlash(angleOffset) {
        const target = this.player.getClosestEnemy(180 + this.extraRange);
        let angle;
        if (target) {
            angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
        } else {
            angle = this.player.facingRight ? 0 : Math.PI;
        }
        angle += angleOffset;

        const range = 130 + this.extraRange;
        const slashDist = range * 0.45;
        const slashX = this.player.x + Math.cos(angle) * slashDist;
        const slashY = this.player.y + Math.sin(angle) * slashDist;

        // Wide arc visual using graphics
        const slashGfx = this.scene.add.graphics().setDepth(8);
        const trailGfx = this.scene.add.graphics().setDepth(7);
        const px = this.player.x;
        const py = this.player.y;
        const arcRadius = range;
        const swingStart = angle - 0.8;
        const swingEnd = angle + 0.8;

        let progress = { t: 0 };
        this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 250,
            ease: 'Power2',
            onUpdate: () => {
                slashGfx.clear();
                trailGfx.clear();

                const curAngle = Phaser.Math.Linear(swingStart, swingEnd, progress.t);
                const prevAngle = Phaser.Math.Linear(swingStart, swingEnd, Math.max(0, progress.t - 0.25));

                // Shadow trail
                trailGfx.lineStyle(10, 0x6622aa, 0.3 * (1 - progress.t));
                trailGfx.beginPath();
                trailGfx.arc(px, py, arcRadius, prevAngle, curAngle, false);
                trailGfx.strokePath();

                // Main slash arc
                slashGfx.lineStyle(5, 0xaa66ff, 0.9 * (1 - progress.t * 0.4));
                slashGfx.beginPath();
                const arcStart = Phaser.Math.Linear(swingStart, swingEnd, Math.max(0, progress.t - 0.12));
                slashGfx.arc(px, py, arcRadius, arcStart, curAngle, false);
                slashGfx.strokePath();

                // Glowing tip
                const tipX = px + Math.cos(curAngle) * arcRadius;
                const tipY = py + Math.sin(curAngle) * arcRadius;
                slashGfx.fillStyle(0xcc88ff, 0.9);
                slashGfx.fillCircle(tipX, tipY, 5);

                // Shadow particles along arc
                if (progress.t > 0.15 && progress.t < 0.85) {
                    slashGfx.fillStyle(0x8844cc, 0.5);
                    slashGfx.fillCircle(
                        tipX + Phaser.Math.Between(-6, 6),
                        tipY + Phaser.Math.Between(-6, 6),
                        2.5
                    );
                }
            },
            onComplete: () => {
                slashGfx.destroy();
                trailGfx.destroy();
            },
        });

        // Visual-only slash sprite (no physics body to avoid double damage)
        const slash = this.scene.add.sprite(slashX, slashY, 'proj_slash')
            .setDepth(8)
            .setRotation(angle)
            .setAlpha(0.4)
            .setScale(1.5 + this.extraRange / 60);

        this.scene.tweens.add({
            targets: slash,
            alpha: 0,
            scaleX: slash.scaleX * 1.6,
            scaleY: slash.scaleY * 1.6,
            duration: 350,
            onComplete: () => slash.destroy(),
        });

        // Hit enemies in arc (92 degree cone, range 200+)
        const enemies = this.player.getAllEnemies();
        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(px, py, enemy.x, enemy.y);
            if (dist > range) continue;

            const enemyAngle = Phaser.Math.Angle.Between(px, py, enemy.x, enemy.y);
            const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - angle));
            if (angleDiff < 0.8) {
                enemy.takeDamage(this.getDamage(), px, py);
            }
        }

        // Sound
        if (this.scene.soundManager) this.scene.soundManager.play('slash');
    }

    getProjectileGroup() {
        return this.slashGroup;
    }

    destroy() {
        this.slashGroup.destroy(true);
    }
}
