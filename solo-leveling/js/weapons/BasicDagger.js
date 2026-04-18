import { WeaponBase } from './WeaponBase.js';
import { WEAPONS } from '../utils/Constants.js';

export class BasicDagger extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.basicDagger);
        this.attackRange = 150;

        this._gfxPool = [];
        this._bladePool = [];
    }

    _getGfx() {
        let gfx = this._gfxPool.pop();
        if (!gfx || !gfx.scene) {
            gfx = this.scene.add.graphics().setDepth(8);
        } else {
            gfx.clear();
            gfx.setVisible(true);
            gfx.setAlpha(1);
        }
        return gfx;
    }

    _releaseGfx(gfx) {
        if (!gfx || !gfx.scene) return;
        gfx.clear();
        gfx.setVisible(false);
        if (this._gfxPool.length < 6) {
            this._gfxPool.push(gfx);
        } else {
            gfx.destroy();
        }
    }

    _getBlade() {
        let s = this._bladePool.pop();
        if (s && s.scene) {
            s.setVisible(true);
            s.setAlpha(1);
            s.setScale(1);
            return s;
        }
        return this.scene.add.sprite(0, 0, 'proj_dagger')
            .setOrigin(0.5, 0.94)
            .setDepth(8);
    }

    _releaseBlade(s) {
        if (!s || !s.scene) return;
        s.setVisible(false);
        if (this._bladePool.length < 16) {
            this._bladePool.push(s);
        } else {
            s.destroy();
        }
    }

    fire() {
        for (let i = 0; i < this.count; i++) {
            this.scene.time.delayedCall(i * 110, () => this._thrust());
        }
    }

    _thrust() {
        const target = this.player.getClosestEnemy(this.attackRange + 50);

        let baseAngle;
        if (target) {
            baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
        } else {
            baseAngle = this.player.facingRight ? 0 : Math.PI;
        }

        const px = this.player.x;
        const py = this.player.y;
        const thrustRange = this.attackRange * 0.85;

        const mainBlade = this._getBlade();
        const trail1 = this._getBlade();
        const trail2 = this._getBlade();
        trail1.setAlpha(0);
        trail2.setAlpha(0);

        const gfx = this._getGfx();
        const history = [];
        const progress = { t: 0 };

        this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 200,
            ease: 'Linear',
            onUpdate: () => {
                const t = progress.t;

                // Thrust curve: extend fast (0→0.35), hold (0.35→0.5), retract (0.5→1)
                let reach;
                if (t < 0.35) {
                    const k = t / 0.35;
                    reach = 1 - (1 - k) * (1 - k); // easeOutQuad
                } else if (t < 0.5) {
                    reach = 1;
                } else {
                    reach = 1 - (t - 0.5) / 0.5;
                }

                const hiltDist = 12;
                const bladeDist = hiltDist + thrustRange * reach;

                const cosA = Math.cos(baseAngle);
                const sinA = Math.sin(baseAngle);
                const hiltX = px + cosA * hiltDist;
                const hiltY = py + sinA * hiltDist;
                const tipX = px + cosA * bladeDist;
                const tipY = py + sinA * bladeDist;

                history.push({ hiltX, hiltY, tipX, tipY, reach });

                const scale = 1.2 + 0.7 * reach;

                mainBlade.setPosition(hiltX, hiltY);
                mainBlade.setRotation(baseAngle + Math.PI / 2);
                mainBlade.setScale(scale);
                mainBlade.setAlpha(0.95);

                // Afterimage trails (shadow clones of the blade)
                const trails = [trail1, trail2];
                for (let i = 0; i < trails.length; i++) {
                    const idx = history.length - 1 - (i + 1) * 2;
                    if (idx >= 0) {
                        const h = history[idx];
                        const ts = 1.2 + 0.7 * h.reach;
                        trails[i].setPosition(h.hiltX, h.hiltY);
                        trails[i].setRotation(baseAngle + Math.PI / 2);
                        trails[i].setScale(ts);
                        trails[i].setAlpha(h.reach * (0.35 - i * 0.12));
                    } else {
                        trails[i].setAlpha(0);
                    }
                }

                // Motion streaks (forward thrust feel)
                gfx.clear();
                if (reach > 0.15 && t < 0.55) {
                    const streakAlpha = reach * 0.55;
                    const perpX = -sinA;
                    const perpY = cosA;
                    for (let s = 0; s < 5; s++) {
                        const offset = (s - 2) * 3.5;
                        const sx1 = hiltX + perpX * offset;
                        const sy1 = hiltY + perpY * offset;
                        const sx2 = tipX + perpX * offset * 0.35;
                        const sy2 = tipY + perpY * offset * 0.35;
                        const a = streakAlpha * (0.28 + Math.abs(offset) * 0.04);
                        gfx.lineStyle(1.1, 0xccddee, a);
                        gfx.lineBetween(sx1, sy1, sx2, sy2);
                    }
                    // Bright central streak
                    gfx.lineStyle(2, 0xffffff, streakAlpha * 0.55);
                    gfx.lineBetween(hiltX, hiltY, tipX, tipY);
                }
            },
            onComplete: () => {
                this._releaseGfx(gfx);
                this._releaseBlade(mainBlade);
                this._releaseBlade(trail1);
                this._releaseBlade(trail2);
            },
        });

        // Damage at the moment of peak extension (narrow front cone, fits thrust shape)
        this.scene.time.delayedCall(90, () => {
            const enemies = this.player.getAllEnemies();
            const hitAngleTol = 0.45; // ~52° cone
            for (const enemy of enemies) {
                if (!enemy.active) continue;
                const dist = Phaser.Math.Distance.Between(px, py, enemy.x, enemy.y);
                if (dist > this.attackRange) continue;

                const enemyAngle = Phaser.Math.Angle.Between(px, py, enemy.x, enemy.y);
                const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - baseAngle));
                if (angleDiff >= hitAngleTol) continue;

                enemy.takeDamage(this.getDamage(), px, py);
                if (this.scene.soundManager) this.scene.soundManager.play('hit');

                this._spawnBloodBurst(enemy.x, enemy.y, baseAngle);
            }
        });

        if (this.scene.soundManager) this.scene.soundManager.play('dagger');
    }

    _spawnBloodBurst(x, y, impactAngle) {
        // Dark red splatter (bottom layer)
        const splat = this.scene.add.circle(x, y, 7, 0x550008, 0.7).setDepth(8);
        this.scene.tweens.add({
            targets: splat, scale: 2.0, alpha: 0,
            duration: 340, onComplete: () => splat.destroy(),
        });
        // Bright red core burst
        const core = this.scene.add.circle(x, y, 4.5, 0xcc0011, 0.95).setDepth(9);
        this.scene.tweens.add({
            targets: core, scale: 2.6, alpha: 0,
            duration: 240, onComplete: () => core.destroy(),
        });
        // Flying droplets (biased toward the thrust direction)
        const dropletCount = 9;
        for (let i = 0; i < dropletCount; i++) {
            const spread = impactAngle + (Math.random() - 0.5) * Math.PI * 1.3;
            const speed = 45 + Math.random() * 65;
            const r = 1.3 + Math.random() * 1.8;
            const color = Math.random() < 0.4 ? 0xaa0010 : 0xdd2020;
            const drop = this.scene.add.circle(x, y, r, color, 0.95).setDepth(9);
            const dx = Math.cos(spread) * speed;
            const dy = Math.sin(spread) * speed;
            this.scene.tweens.add({
                targets: drop,
                x: x + dx,
                y: y + dy,
                alpha: 0,
                scale: 0.35,
                duration: 320 + Math.random() * 180,
                ease: 'Quad.easeOut',
                onComplete: () => drop.destroy(),
            });
        }
    }

    destroy() {
        for (const gfx of this._gfxPool) {
            if (gfx && gfx.scene) gfx.destroy();
        }
        for (const s of this._bladePool) {
            if (s && s.scene) s.destroy();
        }
        this._gfxPool = [];
        this._bladePool = [];
    }
}
