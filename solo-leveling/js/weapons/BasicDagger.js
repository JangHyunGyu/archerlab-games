import { WeaponBase } from './WeaponBase.js';
import { WEAPONS } from '../utils/Constants.js';

export class BasicDagger extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.basicDagger);
        this.attackRange = 225;

        this._bladePool = [];
        this._activeThrusts = []; // in-flight { tween, blades } pairs for cleanup on destroy
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

        // Normal-sized dagger that TRANSLATES forward and back — position covers the range, not size.
        // proj_dagger is 64px tall, origin (0.5, 0.94) → blade tip is ≈60.16px from pommel.
        const BLADE_SCALE = 2.0;
        const bladeVisualLength = 60.16 * BLADE_SCALE; // ~84px
        const pommelRestDist = 14; // pommel near player at rest
        const pommelMaxDist = Math.max(pommelRestDist + 60, this.attackRange - bladeVisualLength);
        const thrustTravel = pommelMaxDist - pommelRestDist;

        const mainBlade = this._getBlade();
        const trail1 = this._getBlade();
        const trail2 = this._getBlade();
        const trail3 = this._getBlade();
        mainBlade.setScale(BLADE_SCALE);
        trail1.setScale(BLADE_SCALE);
        trail2.setScale(BLADE_SCALE);
        trail3.setScale(BLADE_SCALE);
        trail1.setAlpha(0);
        trail2.setAlpha(0);
        trail3.setAlpha(0);

        const history = [];
        const progress = { t: 0 };
        const blades = [mainBlade, trail1, trail2, trail3];
        const thrustEntry = { tween: null, blades };
        this._activeThrusts.push(thrustEntry);

        thrustEntry.tween = this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 320,
            ease: 'Linear',
            onUpdate: () => {
                const t = progress.t;

                // Thrust curve with windup:
                //   0→0.15  : windup (pull back, reach 0 → -0.15)
                //   0.15→0.5: extend forward (reach -0.15 → 1, easeOutCubic for snap)
                //   0.5→0.6 : hold at peak
                //   0.6→1.0 : retract (reach 1 → 0)
                let reach;
                if (t < 0.15) {
                    const k = t / 0.15;
                    reach = -0.15 * k; // pull back
                } else if (t < 0.5) {
                    const k = (t - 0.15) / 0.35;
                    const eased = 1 - Math.pow(1 - k, 3); // easeOutCubic
                    reach = -0.15 + 1.15 * eased;
                } else if (t < 0.6) {
                    reach = 1;
                } else {
                    const k = (t - 0.6) / 0.4;
                    reach = 1 - k;
                }

                const pommelDist = pommelRestDist + thrustTravel * reach;

                const cosA = Math.cos(baseAngle);
                const sinA = Math.sin(baseAngle);
                const pommelX = px + cosA * pommelDist;
                const pommelY = py + sinA * pommelDist;
                const tipX = pommelX + cosA * bladeVisualLength;
                const tipY = pommelY + sinA * bladeVisualLength;

                history.push({ pommelX, pommelY, tipX, tipY, reach });

                mainBlade.setPosition(pommelX, pommelY);
                mainBlade.setRotation(baseAngle + Math.PI / 2);
                mainBlade.setAlpha(1);

                // Afterimage trails — SAME scale, older positions along the thrust line
                const trails = [trail1, trail2, trail3];
                for (let i = 0; i < trails.length; i++) {
                    const idx = history.length - 1 - (i + 1) * 2;
                    if (idx >= 0) {
                        const h = history[idx];
                        trails[i].setPosition(h.pommelX, h.pommelY);
                        trails[i].setRotation(baseAngle + Math.PI / 2);
                        trails[i].setAlpha(Math.max(0, h.reach) * (0.55 - i * 0.1));
                    } else {
                        trails[i].setAlpha(0);
                    }
                }

            },
            onComplete: () => {
                this._releaseBlade(mainBlade);
                this._releaseBlade(trail1);
                this._releaseBlade(trail2);
                this._releaseBlade(trail3);
                const i = this._activeThrusts.indexOf(thrustEntry);
                if (i !== -1) this._activeThrusts.splice(i, 1);
            },
        });

        // Damage fires at peak extension of the thrust curve (visual-gameplay sync)
        this.scene.time.delayedCall(165, () => {
            if (!this.scene?.scene?.isActive() || !this.player?.active) return;
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
        // Kill in-flight thrusts: stop their tweens and destroy all referenced blades
        const tweens = this.scene?.tweens;
        for (const entry of this._activeThrusts) {
            if (entry.tween && tweens) tweens.remove(entry.tween);
            for (const b of entry.blades) {
                if (b && b.scene) b.destroy();
            }
        }
        this._activeThrusts = [];
        // Clean up pooled (inactive) blades
        for (const s of this._bladePool) {
            if (s && s.scene) s.destroy();
        }
        this._bladePool = [];
    }
}
