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
        const target = this.player.getClosestEnemy(360 + this.extraRange);
        let angle;
        if (target) {
            angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
        } else {
            angle = this.player.facingRight ? 0 : Math.PI;
        }
        angle += angleOffset;

        const range = 260 + this.extraRange;
        const slashDist = range * 0.45;
        const slashX = this.player.x + Math.cos(angle) * slashDist;
        const slashY = this.player.y + Math.sin(angle) * slashDist;

        // Enhanced wide arc visual using graphics
        const slashGfx = this.scene.add.graphics().setDepth(8);
        const trailGfx = this.scene.add.graphics().setDepth(7);
        const glowGfx = this.scene.add.graphics().setDepth(6);
        const px = this.player.x;
        const py = this.player.y;
        const arcRadius = range;
        const swingStart = angle - 0.8;
        const swingEnd = angle + 0.8;

        // Energy particles container
        const energyParticles = [];

        let progress = { t: 0 };
        this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 280,
            ease: 'Power2',
            onUpdate: () => {
                slashGfx.clear();
                trailGfx.clear();
                glowGfx.clear();

                const curAngle = Phaser.Math.Linear(swingStart, swingEnd, progress.t);
                const prevAngle = Phaser.Math.Linear(swingStart, swingEnd, Math.max(0, progress.t - 0.35));

                // Outer glow aura (wide, faint)
                glowGfx.lineStyle(22, 0x4400aa, 0.12 * (1 - progress.t));
                glowGfx.beginPath();
                glowGfx.arc(px, py, arcRadius + 8, prevAngle, curAngle, false);
                glowGfx.strokePath();

                // Secondary trail (energy afterimage)
                trailGfx.lineStyle(14, 0x6622aa, 0.25 * (1 - progress.t));
                trailGfx.beginPath();
                trailGfx.arc(px, py, arcRadius, prevAngle, curAngle, false);
                trailGfx.strokePath();

                // Inner energy trail (brighter)
                trailGfx.lineStyle(6, 0x9944dd, 0.4 * (1 - progress.t * 0.5));
                trailGfx.beginPath();
                trailGfx.arc(px, py, arcRadius - 4, prevAngle, curAngle, false);
                trailGfx.strokePath();

                // Main slash arc (bright core)
                const arcStart = Phaser.Math.Linear(swingStart, swingEnd, Math.max(0, progress.t - 0.15));
                slashGfx.lineStyle(4, 0xddaaff, 0.95 * (1 - progress.t * 0.3));
                slashGfx.beginPath();
                slashGfx.arc(px, py, arcRadius, arcStart, curAngle, false);
                slashGfx.strokePath();

                // White-hot core line
                slashGfx.lineStyle(2, 0xffffff, 0.8 * (1 - progress.t * 0.5));
                slashGfx.beginPath();
                slashGfx.arc(px, py, arcRadius, arcStart, curAngle, false);
                slashGfx.strokePath();

                // Glowing tip with energy burst
                const tipX = px + Math.cos(curAngle) * arcRadius;
                const tipY = py + Math.sin(curAngle) * arcRadius;

                // Tip outer glow
                slashGfx.fillStyle(0x7733cc, 0.4 * (1 - progress.t * 0.3));
                slashGfx.fillCircle(tipX, tipY, 12);
                // Tip middle
                slashGfx.fillStyle(0xcc88ff, 0.8);
                slashGfx.fillCircle(tipX, tipY, 6);
                // Tip bright core
                slashGfx.fillStyle(0xffffff, 0.9);
                slashGfx.fillCircle(tipX, tipY, 2.5);

                // Energy particles radiating outward from arc
                if (progress.t > 0.1 && progress.t < 0.9) {
                    // Spawn outward-projecting particles from the arc
                    const spawnAngle = curAngle + Phaser.Math.FloatBetween(-0.15, 0.15);
                    const outDist = Phaser.Math.FloatBetween(0, 25);
                    const pX = px + Math.cos(spawnAngle) * (arcRadius + outDist);
                    const pY = py + Math.sin(spawnAngle) * (arcRadius + outDist);
                    energyParticles.push({
                        x: pX, y: pY,
                        vx: Math.cos(spawnAngle) * Phaser.Math.FloatBetween(1, 3),
                        vy: Math.sin(spawnAngle) * Phaser.Math.FloatBetween(1, 3),
                        alpha: 0.7,
                        size: Phaser.Math.FloatBetween(1.5, 3.5),
                        color: Phaser.Utils.Array.GetRandom([0xaa66ff, 0xcc88ff, 0xddaaff, 0x8844cc]),
                    });

                    // Shadow energy wisps along the trailing edge
                    slashGfx.fillStyle(0x8844cc, 0.5);
                    for (let w = 0; w < 2; w++) {
                        const wAngle = Phaser.Math.FloatBetween(prevAngle, curAngle);
                        const wR = arcRadius + Phaser.Math.Between(-8, 8);
                        slashGfx.fillCircle(
                            px + Math.cos(wAngle) * wR,
                            py + Math.sin(wAngle) * wR,
                            Phaser.Math.FloatBetween(1.5, 3)
                        );
                    }
                }

                // Draw existing energy particles
                for (let p = energyParticles.length - 1; p >= 0; p--) {
                    const ep = energyParticles[p];
                    ep.x += ep.vx;
                    ep.y += ep.vy;
                    ep.alpha -= 0.04;
                    ep.size *= 0.96;
                    if (ep.alpha <= 0) {
                        energyParticles.splice(p, 1);
                        continue;
                    }
                    slashGfx.fillStyle(ep.color, ep.alpha);
                    slashGfx.fillCircle(ep.x, ep.y, ep.size);
                }

                // Energy radial lines from tip (sword energy projection effect)
                if (progress.t > 0.2 && progress.t < 0.7) {
                    for (let r = 0; r < 3; r++) {
                        const lineAngle = curAngle + Phaser.Math.FloatBetween(-0.3, 0.3);
                        const lineLen = Phaser.Math.FloatBetween(15, 35);
                        const lx1 = tipX;
                        const ly1 = tipY;
                        const lx2 = tipX + Math.cos(lineAngle) * lineLen;
                        const ly2 = tipY + Math.sin(lineAngle) * lineLen;
                        slashGfx.lineStyle(1.5, 0xddaaff, 0.6 * (1 - progress.t));
                        slashGfx.lineBetween(lx1, ly1, lx2, ly2);
                    }
                }
            },
            onComplete: () => {
                slashGfx.destroy();
                trailGfx.destroy();
                glowGfx.destroy();
            },
        });

        // Visual-only slash sprite (energy wave projection)
        const slash = this.scene.add.sprite(slashX, slashY, 'proj_slash')
            .setDepth(8)
            .setRotation(angle)
            .setAlpha(0.5)
            .setScale(1.5 + this.extraRange / 60)
            .setTint(0xbb77ff);

        this.scene.tweens.add({
            targets: slash,
            alpha: 0,
            scaleX: slash.scaleX * 1.8,
            scaleY: slash.scaleY * 1.8,
            duration: 400,
            onComplete: () => slash.destroy(),
        });

        // Afterglow flash at slash center
        const flash = this.scene.add.circle(slashX, slashY, 20, 0xaa66ff, 0.4).setDepth(7);
        this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            scaleX: 3,
            scaleY: 3,
            duration: 350,
            ease: 'Power2',
            onComplete: () => flash.destroy(),
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
