import { WeaponBase } from './WeaponBase.js';
import { WEAPONS } from '../utils/Constants.js';

const BASIC_ATTACK_MOTION_DURATION = 300;

export class BasicDagger extends WeaponBase {
    constructor(scene, player, config = WEAPONS.basicDagger) {
        super(scene, player, config);
        this.attackRange = config.attackRange || 205;

        this._bladePool = [];
        this._activeThrusts = [];
        this._stabSide = 1;
    }

    _getBlade(textureKey = 'proj_dagger_stab') {
        const isImageEffect = textureKey.startsWith('effect_basic_stab') ||
            textureKey.startsWith('char_skill_') ||
            textureKey.startsWith('basic_attack_');
        let blade = this._bladePool.pop();
        if (blade && blade.scene) {
            blade.setTexture(textureKey);
            blade.setVisible(true);
            blade.setAlpha(1);
            blade.setScale(1);
            blade.clearTint();
            blade.setOrigin(0.5, isImageEffect ? 0.5 : 0.94);
            blade.setBlendMode(isImageEffect ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
        } else {
            blade = this.scene.add.sprite(0, 0, textureKey)
                .setOrigin(0.5, isImageEffect ? 0.5 : 0.94)
                .setBlendMode(isImageEffect ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
                .setDepth(13);
        }

        if (textureKey.startsWith('char_skill_') || textureKey.startsWith('basic_attack_')) {
            this.animateEffectSprite(blade, textureKey, { frameMs: 42 });
        }
        return blade;
    }

    _releaseBlade(blade) {
        if (!blade || !blade.scene) return;
        this.stopEffectAnimation(blade);
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
        const style = this.config.attackStyle || 'daggerThrust';
        for (let i = 0; i < this.count; i++) {
            this._delay(i * (style === 'fireball' ? 145 : 110), () => this._attackByStyle(style));
        }
    }

    _attackByStyle(style) {
        switch (style) {
            case 'dualDaggerSlash':
                this._dualDaggerSlash();
                break;
            case 'swordSlash':
                this._swordSlash();
                break;
            case 'clawSwipe':
                this._clawSwipe();
                break;
            case 'sanctuaryBurst':
            case 'maceSlam':
                this._sanctuaryBurst();
                break;
            case 'fireball':
                this._fireball();
                break;
            default:
                this._thrust();
                break;
        }
    }

    _getConfiguredEffectTexture(prop = 'basicAttackEffectKey') {
        const key = this.config[prop] || (prop === 'basicAttackEffectKey' ? null : this.config.effectKey);
        const prefix = prop === 'basicAttackEffectKey' ? 'basic_attack_' : 'char_skill_';
        const textureKey = key ? `${prefix}${key}` : null;
        return textureKey && this.scene?.textures?.exists(textureKey) ? textureKey : null;
    }

    _getTargetAcquireRange(rangeBonus) {
        const baseRange = this.attackRange + this.extraRange + rangeBonus;
        return baseRange * (this.config.targetAcquireMultiplier ?? 1);
    }

    _getAttackSetup({ rangeBonus = 50, duration = 240 } = {}) {
        const target = this.player.getClosestEnemy(this._getTargetAcquireRange(rangeBonus));
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
            this.player.playAttackMotion(baseAngle, duration, side);
        }
        return { target, baseAngle, side };
    }

    _getMovementPriorityAttackSetup({ rangeBonus = 50, duration = 240 } = {}) {
        const isMoving = this.player.moveIntensity > 0.12;
        const target = isMoving
            ? null
            : this.player.getClosestEnemy(this._getTargetAcquireRange(rangeBonus));
        const fallbackAngle = isMoving
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
            this.player.playAttackMotion(baseAngle, duration, side);
        }
        return { target, baseAngle, side };
    }

    _trackAttackObjects(objects, tween = null) {
        const entry = { tween, objects };
        this._activeThrusts.push(entry);
        return entry;
    }

    _untrackAttackObjects(entry) {
        const index = this._activeThrusts.indexOf(entry);
        if (index !== -1) this._activeThrusts.splice(index, 1);
    }

    _destroyAttackObjects(entry) {
        for (const object of entry.objects) {
            if (!object || !object.scene) continue;
            object.destroy();
        }
        this._untrackAttackObjects(entry);
    }

    _damageEnemiesInCone(baseAngle, range, angleTol, hitX, hitY) {
        const hitOriginX = this.player.x;
        const hitOriginY = this.player.y - 16;

        for (const enemy of this.player.getAllEnemies()) {
            if (!enemy.active) continue;

            const dist = Phaser.Math.Distance.Between(hitOriginX, hitOriginY, enemy.x, enemy.y);
            if (dist > range) continue;

            const enemyAngle = Phaser.Math.Angle.Between(hitOriginX, hitOriginY, enemy.x, enemy.y);
            const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - baseAngle));
            if (angleDiff >= angleTol) continue;

            this.applyDamage(enemy, this.getDamage(), hitX, hitY);
            this.playHitSound();
            if (!this.scene.textures.exists('effect_monster_hit_0')) {
                this._spawnBloodBurst(enemy.x, enemy.y, baseAngle);
            }
        }
    }

    _damageEnemiesInRadius(x, y, radius, impactAngle) {
        for (const enemy of this.player.getAllEnemies()) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
            if (dist > radius) continue;

            this.applyDamage(enemy, this.getDamage(), x, y);
            this.playHitSound();
            if (!this.scene.textures.exists('effect_monster_hit_0')) {
                this._spawnBloodBurst(enemy.x, enemy.y, impactAngle);
            }
        }
    }

    _thrust() {
        const target = this.player.getClosestEnemy(this._getTargetAcquireRange(this.config.targetRangeBonus ?? 50));
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
            this.player.playAttackMotion(baseAngle, BASIC_ATTACK_MOTION_DURATION, side);
        }
        const effectTexture = this._getConfiguredEffectTexture() || this.getEffectTexture();
        const useCharacterEffect = !!effectTexture;
        // The rebuilt Shadow Monarch motion already carries its generated
        // dagger in the character's hand. Use the procedural energy trail for
        // that loadout so the old stab sheet cannot draw a second weapon.
        const useEmbeddedDagger = this.key === 'basicDagger';
        const useEffectStab = !useCharacterEffect && !useEmbeddedDagger &&
            this.scene.textures.exists('effect_basic_stab_0');
        const bladeScale = useCharacterEffect ? (this.config.effectScale || 0.46) : (useEffectStab ? 0.56 : 0.72);
        const bladeTipFromOrigin = 82 * 0.94;
        const bladeVisualLength = bladeTipFromOrigin * bladeScale;
        const pommelRestDist = 12;
        const pommelMaxDist = Math.max(
            pommelRestDist + 58,
            Math.min(this.attackRange - bladeVisualLength * 0.45, pommelRestDist + 92)
        );
        const thrustTravel = pommelMaxDist - pommelRestDist;

        const mainBlade = this._getBlade(effectTexture || (useEffectStab ? 'effect_basic_stab_0' : 'proj_dagger_stab'))
            .setDepth(14)
            .setScale(bladeScale)
            .setAlpha(useEmbeddedDagger ? 0 : 1);
        const trails = useEffectStab || useCharacterEffect || useEmbeddedDagger
            ? []
            : [this._getBlade(), this._getBlade(), this._getBlade()];

        for (const trail of trails) {
            trail.setScale(bladeScale);
            trail.setAlpha(0);
            trail.setDepth(12);
            trail.setTint(this.getEffectColor(0x7f55ff));
            trail.setBlendMode(Phaser.BlendModes.ADD);
        }

        const usesImageEffect = useEffectStab || useCharacterEffect;
        const fx = usesImageEffect ? null : this.scene.add.graphics().setDepth(11);
        const impactFx = usesImageEffect || this.scene.textures.exists('effect_monster_hit_0')
            ? null
            : this.scene.add.graphics().setDepth(15);
        const history = [];
        const progress = { t: 0 };
        const objects = [mainBlade, ...trails, fx, impactFx].filter(Boolean);
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
            if (!fx) return;
            fx.clear();

            const forwardAlpha = Math.max(0, phase.force);
            const armAlpha = Math.max(0.35, phase.alpha * 0.85);

            if (!useEmbeddedDagger) {
                fx.lineStyle(9, 0x09040f, 0.72 * armAlpha);
                fx.lineBetween(pose.shoulderX, pose.shoulderY, pose.pommelX, pose.pommelY);
                fx.lineStyle(4, 0x332052, 0.75 * armAlpha);
                fx.lineBetween(pose.shoulderX, pose.shoulderY, pose.pommelX, pose.pommelY);
                fx.fillStyle(0x171028, 0.95 * armAlpha);
                fx.fillCircle(pose.pommelX, pose.pommelY, 5.5);
                fx.fillStyle(0xbda9ff, 0.55 * armAlpha);
                fx.fillCircle(pose.pommelX - pose.perpX * 1.4, pose.pommelY - pose.perpY * 1.4, 2.1);
            }

            if (useEffectStab || useCharacterEffect) return;
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

                if (useEffectStab || useCharacterEffect) {
                    const frameIndex = Math.min(5, Math.floor(progress.t * 6));
                    if (useEffectStab) mainBlade.setTexture(`effect_basic_stab_${frameIndex}`);
                    const centerDist = 28 + 58 * Phaser.Math.Clamp(phase.reach, 0, 1);
                    const centerX = this.player.x + pose.cosA * centerDist + pose.perpX * side * 5;
                    const centerY = this.player.y - 16 + pose.sinA * centerDist + pose.perpY * side * 5;
                    mainBlade.setPosition(centerX, centerY);
                    mainBlade.setRotation(pose.angle);
                    mainBlade.setAlpha(phase.alpha);
                    mainBlade.setScale(bladeScale * (1 + phase.force * (useCharacterEffect ? 0.16 : 0.05)));
                } else if (useEmbeddedDagger) {
                    mainBlade.setAlpha(0);
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
                if (fx) fx.clear();
                if (impactFx) impactFx.clear();
                this._releaseBlade(mainBlade);
                for (const trail of trails) this._releaseBlade(trail);
                if (fx) fx.destroy();
                if (impactFx) impactFx.destroy();
                const index = this._activeThrusts.indexOf(thrustEntry);
                if (index !== -1) this._activeThrusts.splice(index, 1);
            },
        });

        this._delay(132, () => {
            if (!this.scene?.scene?.isActive() || !this.player?.active) return;

            const hitOriginX = this.player.x;
            const hitOriginY = this.player.y - 16;
            const hitPose = getPose(1, 0);

            if (impactFx && !this.scene.textures.exists('effect_monster_hit_0')) {
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
            const hitRange = this.attackRange + this.extraRange + (this.config.hitRangeBonus ?? 0);
            const hitAngleTol = this.config.hitAngle ?? 0.62;
            for (const enemy of enemies) {
                if (!enemy.active) continue;

                const dist = Phaser.Math.Distance.Between(hitOriginX, hitOriginY, enemy.x, enemy.y);
                if (dist > hitRange) continue;

                const enemyAngle = Phaser.Math.Angle.Between(hitOriginX, hitOriginY, enemy.x, enemy.y);
                const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - baseAngle));
                if (angleDiff >= hitAngleTol) continue;

                this.applyDamage(enemy, this.getDamage(), hitPose.tipX, hitPose.tipY);
                this.playHitSound();

                if (!this.scene.textures.exists('effect_monster_hit_0')) {
                    this._spawnBloodBurst(enemy.x, enemy.y, baseAngle);
                }
            }
        });

        this.playConfiguredSound('dagger');
    }

    _dualDaggerSlash() {
        const effectTexture = this._getConfiguredEffectTexture();
        if (!effectTexture) {
            this._thrust();
            return;
        }

        const { baseAngle, side } = this._getAttackSetup({
            rangeBonus: this.config.targetRangeBonus ?? 50,
            duration: BASIC_ATTACK_MOTION_DURATION,
        });
        const cosA = Math.cos(baseAngle);
        const sinA = Math.sin(baseAngle);
        const perpX = -sinA;
        const perpY = cosA;
        const getOrigin = () => ({
            x: this.player.x,
            y: this.player.y - 16,
        });
        const initialOrigin = getOrigin();
        const baseScale = this.config.effectScale || 0.36;

        const createArc = (depth, flipY = false) => this.scene.add.sprite(
            initialOrigin.x,
            initialOrigin.y,
            effectTexture
        )
            .setDepth(depth)
            .setAlpha(0)
            .setScale(baseScale * 0.72)
            .setFlipX(true)
            .setFlipY(flipY)
            .setBlendMode(Phaser.BlendModes.ADD);

        const primaryArc = createArc(15);
        const echoArc = createArc(14, true);
        const coreFx = this.scene.add.graphics()
            .setDepth(16)
            .setBlendMode(Phaser.BlendModes.ADD);
        const progress = { t: 0 };
        const entry = this._trackAttackObjects([primaryArc, echoArc, coreFx]);

        const pulse = (t, start, end) => {
            const phase = Phaser.Math.Clamp((t - start) / (end - start), 0, 1);
            return {
                phase,
                eased: Phaser.Math.Easing.Cubic.Out(phase),
                alpha: Math.sin(Math.PI * phase),
            };
        };

        const drawArc = (arc, phase, lateral, angleOffset, maxAlpha, origin) => {
            const forward = 46 + phase.eased * 22;
            arc
                .setPosition(
                    origin.x + cosA * forward + perpX * lateral,
                    origin.y + sinA * forward + perpY * lateral
                )
                .setRotation(baseAngle + angleOffset * (1 - phase.eased * 0.12))
                .setAlpha(phase.alpha * maxAlpha)
                .setScale(baseScale * (0.72 + phase.eased * 0.38));
        };

        const draw = (t) => {
            const origin = getOrigin();
            const primary = pulse(t, 0.02, 0.68);
            const echo = pulse(t, 0.16, 0.84);
            drawArc(primaryArc, primary, side * 6, side * 0.58, 0.92, origin);
            drawArc(echoArc, echo, side * -7, side * -0.52, 0.76, origin);

            const flash = Math.max(primary.alpha, echo.alpha * 0.9);
            const flashX = origin.x + cosA * 64;
            const flashY = origin.y + sinA * 64;
            coreFx.clear();
            if (flash > 0.03) {
                coreFx.fillStyle(0xf7f3ff, 0.22 * flash);
                coreFx.fillCircle(flashX, flashY, 5 + flash * 6);
                coreFx.lineStyle(2, 0xb996ff, 0.52 * flash);
                coreFx.strokeCircle(flashX, flashY, 9 + flash * 8);
            }
        };

        entry.tween = this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 265,
            ease: 'Linear',
            onUpdate: () => draw(progress.t),
            onComplete: () => this._destroyAttackObjects(entry),
        });

        this._delay(132, () => {
            if (!this.scene?.scene?.isActive() || !this.player?.active) return;

            const origin = getOrigin();
            // Preserve the old embedded-dagger thrust tip as the knockback
            // source so this visual upgrade does not change combat feel.
            const knockbackSourceDistance = 159.5;
            const hitX = origin.x + cosA * knockbackSourceDistance;
            const hitY = origin.y + sinA * knockbackSourceDistance;
            this._damageEnemiesInCone(
                baseAngle,
                this.attackRange + this.extraRange + (this.config.hitRangeBonus ?? 0),
                this.config.hitAngle ?? 0.42,
                hitX,
                hitY
            );
        });

        this.playConfiguredSound('dagger');
    }

    _swordSlash() {
        const { baseAngle, side } = this._getAttackSetup({
            rangeBonus: this.config.targetRangeBonus ?? 65,
            duration: BASIC_ATTACK_MOTION_DURATION,
        });
        const cosA = Math.cos(baseAngle);
        const sinA = Math.sin(baseAngle);
        const originX = this.player.x;
        const originY = this.player.y - 18;
        const centerX = originX + cosA * 62;
        const centerY = originY + sinA * 62;
        const effectTexture = this._getConfiguredEffectTexture();

        const slash = effectTexture
            ? this.createEffectSprite(centerX, centerY, effectTexture, { frameMs: 42 })
                .setDepth(14)
                .setAlpha(0)
                .setScale(this.config.effectScale || 0.44)
                .setBlendMode(Phaser.BlendModes.ADD)
            : null;
        const progress = { t: 0 };
        const objects = [];
        if (slash) objects.push(slash);
        const entry = this._trackAttackObjects(objects);

        const draw = (t) => {
            const eased = Phaser.Math.Easing.Cubic.Out(Phaser.Math.Clamp(t, 0, 1));
            if (slash) {
                slash.setPosition(centerX + cosA * 8 * eased, centerY + sinA * 8 * eased);
                slash.setRotation(baseAngle + side * 0.55);
                slash.setAlpha(Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.82);
                slash.setScale((this.config.effectScale || 0.44) * (0.74 + eased * 0.38));
            }
        };

        entry.tween = this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 250,
            ease: 'Linear',
            onUpdate: () => draw(progress.t),
            onComplete: () => this._destroyAttackObjects(entry),
        });

        this._delay(118, () => {
            const hitX = originX + cosA * 96;
            const hitY = originY + sinA * 96;
            this._damageEnemiesInCone(
                baseAngle,
                this.attackRange + this.extraRange + (this.config.hitRangeBonus ?? 35),
                this.config.hitAngle ?? 0.92,
                hitX,
                hitY
            );
        });

        this.playConfiguredSound('slash');
    }

    _clawSwipe() {
        const { baseAngle, side } = this._getAttackSetup({
            rangeBonus: this.config.targetRangeBonus ?? 35,
            duration: BASIC_ATTACK_MOTION_DURATION,
        });
        const cosA = Math.cos(baseAngle);
        const sinA = Math.sin(baseAngle);
        const perpX = -sinA;
        const perpY = cosA;
        const originX = this.player.x;
        const originY = this.player.y - 14;
        const effectColor = this.getEffectColor(0xbfeaff);
        const glowColor = this.getEffectGlowColor(0xffffff);
        const effectTexture = this._getConfiguredEffectTexture();
        const fx = effectTexture ? null : this.scene.add.graphics().setDepth(15);
        const swipeSprite = effectTexture
            ? this.createEffectSprite(originX + cosA * 74, originY + sinA * 74, effectTexture, { frameMs: 40 })
                .setDepth(16)
                .setAlpha(0)
                .setScale(this.config.effectScale || 0.42)
                .setRotation(baseAngle)
                .setBlendMode(Phaser.BlendModes.ADD)
            : null;
        const progress = { t: 0 };
        const entry = this._trackAttackObjects([fx, swipeSprite].filter(Boolean));

        const world = (forward, lateral) => ({
            x: originX + cosA * forward + perpX * lateral,
            y: originY + sinA * forward + perpY * lateral,
        });

        const draw = (t) => {
            const eased = Phaser.Math.Easing.Cubic.Out(Phaser.Math.Clamp(t, 0, 1));
            const alpha = Math.sin(Math.PI * Math.min(1, t * 1.08));

            if (fx) {
                fx.clear();
                fx.fillStyle(0x0c1d29, 0.23 * alpha);
                const shadowA = world(28, side * -38);
                const shadowB = world(126, side * 30);
                const shadowC = world(96, side * 54);
                fx.fillTriangle(shadowA.x, shadowA.y, shadowB.x, shadowB.y, shadowC.x, shadowC.y);

                for (let i = 0; i < 4; i++) {
                    const lane = side * (-24 + i * 16);
                    const start = world(20 + eased * 6, lane - side * 22);
                    const mid = world(68 + eased * 22, lane + side * 2);
                    const end = world(118 + eased * 8, lane + side * 20);
                    const lineAlpha = (0.9 - i * 0.08) * alpha;
                    fx.lineStyle(13, effectColor, 0.18 * lineAlpha);
                    fx.lineBetween(start.x, start.y, mid.x, mid.y);
                    fx.lineBetween(mid.x, mid.y, end.x, end.y);
                    fx.lineStyle(6, glowColor, 0.62 * lineAlpha);
                    fx.lineBetween(start.x, start.y, mid.x, mid.y);
                    fx.lineBetween(mid.x, mid.y, end.x, end.y);
                    fx.lineStyle(2, 0xffffff, 0.86 * lineAlpha);
                    fx.lineBetween(mid.x, mid.y, end.x, end.y);
                }

                const impact = world(118, side * 20);
                fx.lineStyle(2, glowColor, 0.54 * alpha);
                fx.strokeCircle(impact.x, impact.y, 18 + eased * 12);
            }

            if (swipeSprite) {
                swipeSprite.setPosition(originX + cosA * (70 + eased * 12), originY + sinA * (70 + eased * 12));
                swipeSprite.setRotation(baseAngle + side * 0.08);
                swipeSprite.setAlpha(alpha * 0.86);
                swipeSprite.setScale((this.config.effectScale || 0.42) * (0.92 + eased * 0.18));
            }
        };

        entry.tween = this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 235,
            ease: 'Linear',
            onUpdate: () => draw(progress.t),
            onComplete: () => this._destroyAttackObjects(entry),
        });

        this._delay(112, () => {
            const hitX = originX + cosA * 110;
            const hitY = originY + sinA * 110;
            this._damageEnemiesInCone(
                baseAngle,
                this.attackRange + this.extraRange + (this.config.hitRangeBonus ?? 0),
                this.config.hitAngle ?? 0.78,
                hitX,
                hitY
            );
        });

        this.playConfiguredSound('slash');
    }

    _sanctuaryBurst() {
        const { target, baseAngle, side } = this._getAttackSetup({
            rangeBonus: this.config.targetRangeBonus ?? 25,
            duration: BASIC_ATTACK_MOTION_DURATION,
        });
        const cosA = Math.cos(baseAngle);
        const sinA = Math.sin(baseAngle);
        const perpX = -sinA;
        const perpY = cosA;
        const originX = this.player.x;
        const originY = this.player.y - 22;
        const maxDist = this.attackRange + this.extraRange + (this.config.impactRangeBonus ?? -18);
        const targetDist = target
            ? Math.min(maxDist, Phaser.Math.Distance.Between(originX, originY, target.x, target.y))
            : Math.min(maxDist, this.config.fallbackImpactDistance ?? 118);
        const impactX = originX + cosA * targetDist;
        const impactY = originY + sinA * targetDist;
        const effectColor = this.getEffectColor(0x66f2b0);
        const glowColor = this.getEffectGlowColor(0xe8fff5);
        const effectTexture = this._getConfiguredEffectTexture();
        const burstFx = this.scene.add.graphics()
            .setDepth(17)
            .setBlendMode(Phaser.BlendModes.ADD);
        const slamSprite = effectTexture
            ? this.createEffectSprite(impactX, impactY, effectTexture, { frameMs: 52 })
                .setOrigin(0.5, 0.68)
                .setDepth(16)
                .setAlpha(0)
                .setScale(0.16)
                .setRotation(side * 0.025)
                .setBlendMode(Phaser.BlendModes.ADD)
            : null;
        const progress = { t: 0 };
        const entryObjects = [burstFx];
        if (slamSprite) entryObjects.push(slamSprite);
        const entry = this._trackAttackObjects(entryObjects);
        const baseScale = this.config.effectScale || 0.46;

        const draw = (t) => {
            const k = Phaser.Math.Clamp(t, 0, 1);
            const charge = Phaser.Math.Easing.Cubic.Out(Phaser.Math.Clamp(k / 0.28, 0, 1));
            const burstRaw = Phaser.Math.Clamp((k - 0.2) / 0.46, 0, 1);
            const burst = Phaser.Math.Easing.Cubic.Out(burstRaw);
            const fadeRaw = Phaser.Math.Clamp((k - 0.7) / 0.3, 0, 1);
            const fade = Phaser.Math.Easing.Quadratic.In(fadeRaw);
            const remaining = 1 - fade;

            if (slamSprite) {
                const lateral = side * 6 * (1 - burst);
                const alpha = charge * (0.3 + burst * 0.68) * remaining;
                const scaleX = baseScale * (0.42 + burst * 0.66 + fade * 0.12);
                const scaleY = baseScale * (0.34 + burst * 0.8 + fade * 0.1);

                slamSprite
                    .setPosition(impactX - perpX * lateral, impactY - perpY * lateral)
                    .setAlpha(alpha)
                    .setScale(scaleX, scaleY)
                    .setRotation(side * (0.025 - burst * 0.02));
            }

            burstFx.clear();
            const burstAlpha = charge * remaining;
            if (burstAlpha > 0.02) {
                const coreRadius = 4 + burst * 11;
                burstFx.fillStyle(glowColor, (0.22 + burst * 0.24) * burstAlpha);
                burstFx.fillCircle(impactX, impactY, coreRadius);
                burstFx.lineStyle(4, effectColor, 0.5 * burstAlpha);
                burstFx.strokeCircle(impactX, impactY, 11 + burst * 30);
                burstFx.lineStyle(2, glowColor, 0.76 * burstAlpha);
                burstFx.strokeCircle(impactX, impactY, 5 + burst * 19);
                for (let i = 0; i < 6; i++) {
                    const rayAngle = (Math.PI * 2 * i) / 6 + side * 0.12;
                    const inner = 8 + burst * 8;
                    const outer = 14 + burst * 25;
                    burstFx.lineStyle(2, glowColor, 0.52 * burstAlpha);
                    burstFx.lineBetween(
                        impactX + Math.cos(rayAngle) * inner,
                        impactY + Math.sin(rayAngle) * inner,
                        impactX + Math.cos(rayAngle) * outer,
                        impactY + Math.sin(rayAngle) * outer
                    );
                }
            }
        };

        entry.tween = this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 300,
            ease: 'Linear',
            onUpdate: () => draw(progress.t),
            onComplete: () => this._destroyAttackObjects(entry),
        });

        this._delay(220, () => {
            this._damageEnemiesInRadius(
                impactX,
                impactY,
                this.config.impactRadius ?? 56,
                baseAngle
            );
            if (this.scene.cameras?.main) this.scene.cameras.main.shake(55, 0.0008);
        });

        this.playConfiguredSound('groundSlam');
    }

    _fireball() {
        const { target, baseAngle, side } = this._getAttackSetup({
            rangeBonus: this.config.targetRangeBonus ?? 130,
            duration: BASIC_ATTACK_MOTION_DURATION,
        });
        const cosA = Math.cos(baseAngle);
        const sinA = Math.sin(baseAngle);
        const perpX = -sinA;
        const perpY = cosA;
        const originX = this.player.x;
        const originY = this.player.y - 18;
        const maxDist = this.attackRange + this.extraRange + (this.config.projectileRangeBonus ?? 80);
        const targetDist = target
            ? Math.min(maxDist, Phaser.Math.Distance.Between(originX, originY, target.x, target.y) + 18)
            : maxDist;
        const startX = originX + cosA * 32 + perpX * side * 8;
        const startY = originY + sinA * 32 + perpY * side * 8;
        const endX = originX + cosA * targetDist;
        const endY = originY + sinA * targetDist;
        const effectTexture = this._getConfiguredEffectTexture();
        const usesImageEffect = !!effectTexture;
        const effectColor = this.getEffectColor(0xff7a34);
        const glowColor = this.getEffectGlowColor(0xffd86a);
        const projectile = effectTexture
            ? this.createEffectSprite(startX, startY, effectTexture, {
                frameMs: 54,
                loop: true,
                loopStart: 2,
                loopEnd: 4,
            })
                .setDepth(14)
                .setScale(this.config.effectScale || 0.32)
                .setRotation(baseAngle)
                .setBlendMode(Phaser.BlendModes.ADD)
            : this.scene.add.circle(startX, startY, 13, effectColor, 0.95).setDepth(14);
        const trailFx = usesImageEffect ? null : this.scene.add.graphics().setDepth(13);
        const hitEnemies = new Set();
        const impactRadius = this.config.impactRadius ?? 38;
        const progress = { t: 0 };
        const entry = this._trackAttackObjects([projectile, trailFx].filter(Boolean));

        const spawnTrail = () => {
            if (usesImageEffect) return;
            const x = projectile.x - cosA * 12 + Phaser.Math.Between(-3, 3);
            const y = projectile.y - sinA * 12 + Phaser.Math.Between(-3, 3);
            const ember = this.scene.add.circle(x, y, Phaser.Math.Between(3, 7), effectColor, 0.45)
                .setDepth(12)
                .setBlendMode(Phaser.BlendModes.ADD);
            entry.objects.push(ember);
            this.scene.tweens.add({
                targets: ember,
                alpha: 0,
                scale: 0.25,
                duration: 170,
                onComplete: () => {
                    if (ember.scene) ember.destroy();
                },
            });
        };

        const spawnImpactBurst = (x, y) => {
            if (effectTexture) {
                const burst = this.createEffectSprite(x, y, effectTexture, { frameMs: 24 })
                    .setDepth(15)
                    .setAlpha(0.84)
                    .setScale((this.config.effectScale || 0.32) * 0.72)
                    .setRotation(baseAngle)
                    .setBlendMode(Phaser.BlendModes.ADD);
                entry.objects.push(burst);
                this.scene.tweens.add({
                    targets: burst,
                    alpha: 0,
                    scaleX: burst.scaleX * 1.32,
                    scaleY: burst.scaleY * 1.32,
                    duration: 140,
                    ease: 'Quad.easeOut',
                    onComplete: () => {
                        if (burst.scene) burst.destroy();
                    },
                });
            }

            if (usesImageEffect) return;

            const sparkFx = this.scene.add.graphics().setDepth(16);
            entry.objects.push(sparkFx);
            sparkFx.lineStyle(3, glowColor, 0.82);
            for (let i = 0; i < 7; i++) {
                const spread = baseAngle + Phaser.Math.FloatBetween(-0.9, 0.9);
                const inner = Phaser.Math.Between(8, 16);
                const outer = Phaser.Math.Between(28, 48);
                sparkFx.lineBetween(
                    x + Math.cos(spread) * inner,
                    y + Math.sin(spread) * inner,
                    x + Math.cos(spread) * outer,
                    y + Math.sin(spread) * outer
                );
            }
            this.scene.tweens.add({
                targets: sparkFx,
                alpha: 0,
                duration: 120,
                onComplete: () => {
                    if (sparkFx.scene) sparkFx.destroy();
                },
            });
        };

        const checkHits = () => {
            for (const enemy of this.player.getAllEnemies()) {
                if (!enemy.active || hitEnemies.has(enemy)) continue;
                const dist = Phaser.Math.Distance.Between(projectile.x, projectile.y, enemy.x, enemy.y);
                if (dist > impactRadius) continue;
                hitEnemies.add(enemy);
                this.applyDamage(enemy, this.getDamage(), projectile.x, projectile.y);
                this.playHitSound();
                spawnImpactBurst(projectile.x, projectile.y);
            }
        };

        entry.tween = this.scene.tweens.add({
            targets: projectile,
            x: endX,
            y: endY,
            duration: Phaser.Math.Clamp(targetDist * 1.55, 230, 430),
            ease: 'Quad.easeOut',
            onUpdate: () => {
                progress.t += 1;
                if (progress.t % 2 === 0) spawnTrail();
                if (projectile.setRotation) projectile.setRotation(baseAngle + Math.sin(progress.t * 0.28) * 0.08);
                checkHits();
            },
            onComplete: () => {
                checkHits();
                this._destroyAttackObjects(entry);
            },
        });

        this.playConfiguredSound('daggerThrow');
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
