import { WeaponBase } from './WeaponBase.js';
import { WEAPONS } from '../utils/Constants.js';

export class BasicDagger extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.basicDagger);
        this.attackRange = 205;

        this._bladePool = [];
        this._activeThrusts = [];
        this._stabSide = 1;
    }

    _getBlade(textureKey = 'proj_dagger_stab') {
        const isEffectStab = textureKey.startsWith('effect_basic_stab');
        let blade = this._bladePool.pop();
        if (blade && blade.scene) {
            blade.setTexture(textureKey);
            blade.setVisible(true);
            blade.setAlpha(1);
            blade.setScale(1);
            blade.clearTint();
            blade.setOrigin(0.5, isEffectStab ? 0.5 : 0.94);
            blade.setBlendMode(Phaser.BlendModes.NORMAL);
            return blade;
        }

        return this.scene.add.sprite(0, 0, textureKey)
            .setOrigin(0.5, isEffectStab ? 0.5 : 0.94)
            .setDepth(13);
    }

    _releaseBlade(blade) {
        if (!blade || !blade.scene) return;
        blade.setVisible(false);
        blade.setAlpha(0);
        blade.clearTint();
        blade.setBlendMode(Phaser.BlendModes.NORMAL);
        if (this._bladePool.length < 16) {
            this._bladePool.push(blade);
        } else {
            blade.destroy();
        }
    }

    fire() {
        for (let i = 0; i < this.count; i++) {
            this._delay(i * 110, () => this._thrust());
        }
    }

    _thrust() {
        const target = this.player.getClosestEnemy(this.attackRange + 50);
        const fallbackAngle = this.player.moveIntensity > 0.12
            ? this.player.lastMoveAngle
            : (this.player.facingRight ? 0 : Math.PI);
        const baseAngle = target
            ? Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y)
            : fallbackAngle;

        const facing = Math.cos(baseAngle);
        if (Math.abs(facing) > 0.15) {
            this.player.facingRight = facing > 0;
        }

        this._stabSide *= -1;
        const side = this._stabSide;
        if (this.player.playAttackMotion) {
            this.player.playAttackMotion(baseAngle, 240, side);
        }
        const useEffectStab = this.scene.textures.exists('effect_basic_stab_0');
        const bladeScale = useEffectStab ? 0.56 : 0.72;
        const bladeTipFromOrigin = 82 * 0.94;
        const bladeVisualLength = bladeTipFromOrigin * bladeScale;
        const pommelRestDist = 12;
        const pommelMaxDist = Math.max(
            pommelRestDist + 58,
            Math.min(this.attackRange - bladeVisualLength * 0.45, pommelRestDist + 92)
        );
        const thrustTravel = pommelMaxDist - pommelRestDist;

        const mainBlade = this._getBlade(useEffectStab ? 'effect_basic_stab_0' : 'proj_dagger_stab')
            .setDepth(14)
            .setScale(bladeScale);
        const trails = useEffectStab
            ? []
            : [this._getBlade(), this._getBlade(), this._getBlade()];

        for (const trail of trails) {
            trail.setScale(bladeScale);
            trail.setAlpha(0);
            trail.setDepth(12);
            trail.setTint(0x7f55ff);
            trail.setBlendMode(Phaser.BlendModes.ADD);
        }

        const fx = this.scene.add.graphics().setDepth(11);
        const impactFx = this.scene.add.graphics().setDepth(15);
        const history = [];
        const progress = { t: 0 };
        const objects = [mainBlade, ...trails, fx, impactFx];
        const thrustEntry = { tween: null, objects };
        this._activeThrusts.push(thrustEntry);

        const easeOutCubic = (value) => {
            const k = Phaser.Math.Clamp(value, 0, 1);
            return 1 - Math.pow(1 - k, 3);
        };
        const easeInQuad = (value) => {
            const k = Phaser.Math.Clamp(value, 0, 1);
            return k * k;
        };
        const getPhase = (t) => {
            if (t < 0.16) {
                const k = easeOutCubic(t / 0.16);
                return {
                    reach: -0.08 * k,
                    angleOffset: side * (0.28 - 0.08 * k),
                    force: 0,
                    alpha: 0.82,
                };
            }
            if (t < 0.48) {
                const k = easeOutCubic((t - 0.16) / 0.32);
                return {
                    reach: -0.08 + 0.96 * k,
                    angleOffset: side * 0.2 * (1 - k),
                    force: k,
                    alpha: 1,
                };
            }
            if (t < 0.58) {
                const k = (t - 0.48) / 0.1;
                return {
                    reach: 0.88 - Math.sin(k * Math.PI) * 0.025,
                    angleOffset: side * Math.sin(k * Math.PI * 4) * 0.025,
                    force: 1,
                    alpha: 1,
                };
            }

            const k = (t - 0.58) / 0.42;
            return {
                reach: 0.88 - 0.88 * easeInQuad(k),
                angleOffset: -side * 0.1 * k,
                force: 1 - k,
                alpha: 1 - k * 0.8,
            };
        };
        const getPose = (reach, angleOffset = 0) => {
            const angle = baseAngle + angleOffset;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const baseCos = Math.cos(baseAngle);
            const baseSin = Math.sin(baseAngle);
            const perpX = -sinA;
            const perpY = cosA;
            const basePerpX = -baseSin;
            const basePerpY = baseCos;
            const originX = this.player.x;
            const originY = this.player.y - 16;
            const clampedReach = Math.max(0, Math.min(1, reach));
            const lateral = side * (8 - clampedReach * 4);
            const pommelDist = pommelRestDist + thrustTravel * reach;
            const shoulderX = originX + baseCos * 5 + basePerpX * side * 9;
            const shoulderY = originY + baseSin * 5 + basePerpY * side * 9;
            const pommelX = originX + cosA * pommelDist + perpX * lateral;
            const pommelY = originY + sinA * pommelDist + perpY * lateral;
            const tipX = pommelX + cosA * bladeVisualLength;
            const tipY = pommelY + sinA * bladeVisualLength;

            return {
                angle,
                cosA,
                sinA,
                perpX,
                perpY,
                shoulderX,
                shoulderY,
                pommelX,
                pommelY,
                tipX,
                tipY,
            };
        };
        const drawThrustFx = (pose, phase) => {
            fx.clear();

            const forwardAlpha = Math.max(0, phase.force);
            const armAlpha = Math.max(0.35, phase.alpha * 0.85);

            fx.lineStyle(9, 0x09040f, 0.72 * armAlpha);
            fx.lineBetween(pose.shoulderX, pose.shoulderY, pose.pommelX, pose.pommelY);
            fx.lineStyle(4, 0x332052, 0.75 * armAlpha);
            fx.lineBetween(pose.shoulderX, pose.shoulderY, pose.pommelX, pose.pommelY);
            fx.fillStyle(0x171028, 0.95 * armAlpha);
            fx.fillCircle(pose.pommelX, pose.pommelY, 5.5);
            fx.fillStyle(0xbda9ff, 0.55 * armAlpha);
            fx.fillCircle(pose.pommelX - pose.perpX * 1.4, pose.pommelY - pose.perpY * 1.4, 2.1);

            if (useEffectStab) return;
            if (forwardAlpha <= 0.03) return;

            const streakTail = 34 + 82 * forwardAlpha;
            const startX = pose.tipX - pose.cosA * streakTail;
            const startY = pose.tipY - pose.sinA * streakTail;
            const width = 5 + 12 * forwardAlpha;
            const tipWidth = 1.4 + 2.4 * forwardAlpha;

            fx.fillStyle(0x6c2dff, 0.16 + 0.2 * forwardAlpha);
            fx.beginPath();
            fx.moveTo(startX + pose.perpX * width, startY + pose.perpY * width);
            fx.lineTo(startX - pose.perpX * width, startY - pose.perpY * width);
            fx.lineTo(pose.tipX - pose.perpX * tipWidth, pose.tipY - pose.perpY * tipWidth);
            fx.lineTo(pose.tipX + pose.perpX * tipWidth, pose.tipY + pose.perpY * tipWidth);
            fx.closePath();
            fx.fillPath();

            fx.lineStyle(2, 0xf3f6ff, 0.32 * forwardAlpha);
            fx.lineBetween(startX, startY, pose.tipX, pose.tipY);

            for (let i = -1; i <= 1; i++) {
                const lane = i * (8 + 2 * forwardAlpha);
                const laneStartX = startX + pose.perpX * lane - pose.cosA * i * 4;
                const laneStartY = startY + pose.perpY * lane - pose.sinA * i * 4;
                fx.lineStyle(1, 0x9b79ff, 0.22 * forwardAlpha);
                fx.lineBetween(
                    laneStartX,
                    laneStartY,
                    pose.tipX + pose.perpX * lane * 0.18,
                    pose.tipY + pose.perpY * lane * 0.18
                );
            }
        };

        thrustEntry.tween = this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 280,
            ease: 'Linear',
            onUpdate: () => {
                const phase = getPhase(progress.t);
                const pose = getPose(phase.reach, phase.angleOffset);

                history.push({ ...pose, force: phase.force });
                if (history.length > 12) history.shift();

                drawThrustFx(pose, phase);

                if (useEffectStab) {
                    const frameIndex = Math.min(5, Math.floor(progress.t * 6));
                    mainBlade.setTexture(`effect_basic_stab_${frameIndex}`);
                    const centerDist = 28 + 58 * Phaser.Math.Clamp(phase.reach, 0, 1);
                    const centerX = this.player.x + pose.cosA * centerDist + pose.perpX * side * 5;
                    const centerY = this.player.y - 16 + pose.sinA * centerDist + pose.perpY * side * 5;
                    mainBlade.setPosition(centerX, centerY);
                    mainBlade.setRotation(pose.angle);
                    mainBlade.setAlpha(phase.alpha);
                    mainBlade.setScale(bladeScale * (1 + phase.force * 0.05));
                } else {
                    mainBlade.setPosition(pose.pommelX, pose.pommelY);
                    mainBlade.setRotation(pose.angle + Math.PI / 2);
                    mainBlade.setAlpha(phase.alpha);
                    mainBlade.setScale(
                        bladeScale * (1 + phase.force * 0.04),
                        bladeScale * (1 + phase.force * 0.06)
                    );
                }

                for (let i = 0; i < trails.length; i++) {
                    const idx = history.length - 1 - (i + 1) * 2;
                    if (idx >= 0) {
                        const h = history[idx];
                        trails[i].setPosition(h.pommelX, h.pommelY);
                        trails[i].setRotation(h.angle + Math.PI / 2);
                        trails[i].setAlpha(h.force * (0.44 - i * 0.1));
                    } else {
                        trails[i].setAlpha(0);
                    }
                }
            },
            onComplete: () => {
                fx.clear();
                impactFx.clear();
                this._releaseBlade(mainBlade);
                for (const trail of trails) this._releaseBlade(trail);
                fx.destroy();
                impactFx.destroy();
                const index = this._activeThrusts.indexOf(thrustEntry);
                if (index !== -1) this._activeThrusts.splice(index, 1);
            },
        });

        this._delay(132, () => {
            if (!this.scene?.scene?.isActive() || !this.player?.active) return;

            const hitOriginX = this.player.x;
            const hitOriginY = this.player.y - 16;
            const hitPose = getPose(1, 0);

            if (!this.scene.textures.exists('effect_monster_hit_0')) {
                impactFx.clear();
                impactFx.lineStyle(2, 0xffffff, 0.95);
                impactFx.lineBetween(
                    hitPose.tipX - hitPose.cosA * 18,
                    hitPose.tipY - hitPose.sinA * 18,
                    hitPose.tipX + hitPose.cosA * 9,
                    hitPose.tipY + hitPose.sinA * 9
                );
                impactFx.lineStyle(2, 0x9b79ff, 0.7);
                impactFx.strokeCircle(hitPose.tipX, hitPose.tipY, 9);
                this.scene.tweens.add({
                    targets: impactFx,
                    alpha: 0,
                    duration: 130,
                    onComplete: () => {
                        if (impactFx.scene) {
                            impactFx.clear();
                            impactFx.setAlpha(1);
                        }
                    },
                });
            }

            const enemies = this.player.getAllEnemies();
            const hitAngleTol = 0.62;
            for (const enemy of enemies) {
                if (!enemy.active) continue;

                const dist = Phaser.Math.Distance.Between(hitOriginX, hitOriginY, enemy.x, enemy.y);
                if (dist > this.attackRange) continue;

                const enemyAngle = Phaser.Math.Angle.Between(hitOriginX, hitOriginY, enemy.x, enemy.y);
                const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - baseAngle));
                if (angleDiff >= hitAngleTol) continue;

                enemy.takeDamage(this.getDamage(), hitPose.tipX, hitPose.tipY);
                if (this.scene.soundManager) this.scene.soundManager.play('hit');

                if (!this.scene.textures.exists('effect_monster_hit_0')) {
                    this._spawnBloodBurst(enemy.x, enemy.y, baseAngle);
                }
            }
        });

        if (this.scene.soundManager) this.scene.soundManager.play('dagger');
    }

    _spawnBloodBurst(x, y, impactAngle) {
        const splat = this.scene.add.circle(x, y, 7, 0x550008, 0.7).setDepth(8);
        this.scene.tweens.add({
            targets: splat,
            scale: 2.0,
            alpha: 0,
            duration: 340,
            onComplete: () => splat.destroy(),
        });

        const core = this.scene.add.circle(x, y, 4.5, 0xcc0011, 0.95).setDepth(9);
        this.scene.tweens.add({
            targets: core,
            scale: 2.6,
            alpha: 0,
            duration: 240,
            onComplete: () => core.destroy(),
        });

        const slit = this.scene.add.graphics().setDepth(10);
        const crossX = Math.cos(impactAngle + Math.PI / 2);
        const crossY = Math.sin(impactAngle + Math.PI / 2);
        slit.lineStyle(3, 0xffd9d9, 0.9);
        slit.lineBetween(x - crossX * 9, y - crossY * 9, x + crossX * 9, y + crossY * 9);
        slit.lineStyle(1, 0x2b0010, 0.8);
        slit.lineBetween(x - crossX * 5, y - crossY * 5, x + crossX * 5, y + crossY * 5);
        this.scene.tweens.add({
            targets: slit,
            alpha: 0,
            scaleX: 1.25,
            scaleY: 0.65,
            duration: 180,
            onComplete: () => slit.destroy(),
        });

        const dropletCount = 9;
        for (let i = 0; i < dropletCount; i++) {
            const spread = impactAngle + (Math.random() - 0.5) * Math.PI * 1.3;
            const speed = 45 + Math.random() * 65;
            const radius = 1.3 + Math.random() * 1.8;
            const color = Math.random() < 0.4 ? 0xaa0010 : 0xdd2020;
            const drop = this.scene.add.circle(x, y, radius, color, 0.95).setDepth(9);
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
        const tweens = this.scene?.tweens;
        for (const entry of this._activeThrusts) {
            if (entry.tween && tweens) tweens.remove(entry.tween);
            for (const object of entry.objects) {
                if (object && object.scene) object.destroy();
            }
        }
        this._activeThrusts = [];

        for (const blade of this._bladePool) {
            if (blade && blade.scene) blade.destroy();
        }
        this._bladePool = [];
        super.destroy();
    }
}
