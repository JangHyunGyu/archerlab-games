import { PLAYER_BASE_STATS, RANKS, RANK_ORDER, XP_TABLE, COLORS, WORLD_SIZE, PASSIVES } from '../utils/Constants.js';
import { getCharacter } from '../utils/Characters.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, characterId) {
        const character = getCharacter(characterId);
        const characterTexture = `${character.texturePrefix}_idle_0`;
        const initialTexture = scene.textures.exists(characterTexture) ? characterTexture : 'player_idle_0';
        super(scene, x, y, initialTexture);
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.character = character;
        this.characterId = character.id;
        this.texturePrefix = scene.textures.exists(characterTexture) ? character.texturePrefix : 'player';
        this.baseStats = { ...PLAYER_BASE_STATS, ...(character.stats || {}) };
        this.visualBaseScale = character.visualScale || 0.92;
        this.setDepth(10);
        this.setCollideWorldBounds(true);
        this.setScale(this.visualBaseScale);
        this.body.setSize(38, 56);
        this.body.setOffset(37, 78);

        // Stats
        this.stats = { ...this.baseStats };
        this.level = 1;
        this.xp = 0;
        this.xpToNext = XP_TABLE[1] || 10;
        this.currentRank = 'E';
        this.kills = 0;

        // State
        this.isInvincible = false;
        this.invincibleTimer = 0;
        this.facingRight = true;
        this.isMoving = false;
        this.animFrame = 0;
        this.animTimer = 0;
        this.moveInputX = 0;
        this.moveInputY = 0;
        this.moveIntensity = 0;
        this.lastMoveAngle = 0;
        this.moveDirection = 'down';
        this._moveBlend = 0;
        this._stepPhase = 0;
        this._attackPose = {
            active: false,
            elapsed: 0,
            duration: 0,
            angle: 0,
            side: 1,
            direction: 'right',
        };
        this._hitReactTimer = 0;
        this._hitReactDuration = 0;
        this._lastAfterimageAt = 0;

        // Passive bonuses tracking
        this.passiveLevels = {};
        // Rank-up count (percentage-based bonuses)
        this.rankUpCount = 0;

        // Input
        this.cursors = scene.input.keyboard.createCursorKeys();
        this.wasd = {
            up: scene.input.keyboard.addKey('W'),
            down: scene.input.keyboard.addKey('S'),
            left: scene.input.keyboard.addKey('A'),
            right: scene.input.keyboard.addKey('D'),
        };

        // Smoothed velocity for mobile (lerp)
        this.smoothVx = 0;
        this.smoothVy = 0;

        // Aura effect
        this.aura = scene.add.sprite(x, y, 'player_aura')
            .setDepth(9)
            .setAlpha(0)
            .setVisible(false)
            .setScale(1.5, 0.82)
            .setBlendMode(Phaser.BlendModes.ADD);

        // Glow filter (rank-based)
        try {
            this.enableFilters();
            this._glowFilter = this.filters.internal.addGlow(0x7b2fff, 2, 0, 1, false, 8, 8);
            this._glowFilter.setActive(true);
        } catch (e) { /* filters not available */ }

        // Create animations
        this._createAnimations(scene);
    }

    _createAnimations(scene) {
        const textureKey = (name) => {
            const preferred = `${this.texturePrefix}_${name}`;
            if (scene.textures.exists(preferred)) return preferred;
            const fallback = `player_${name}`;
            return scene.textures.exists(fallback) ? fallback : preferred;
        };
        const frames = (prefix, max) => Array.from({ length: max }, (_, i) => textureKey(`${prefix}${i}`))
            .filter(key => scene.textures.exists(key));
        const create = (name, frameKeys, frameRate, repeat = -1) => {
            const key = this._animKey(name);
            if (scene.anims.exists(key) || frameKeys.length === 0) return;
            scene.anims.create({
                key,
                frames: frameKeys.map(frameKey => ({ key: frameKey })),
                frameRate,
                repeat,
            });
        };

        create('idle', frames('idle_', 8), 5);
        create('walk', frames('walk_', 8), 10);
        create('walk_down', frames('walk_down_', 8), 12);
        create('walk_right', frames('walk_right_', 8), 12);
        create('walk_up', frames('walk_up_', 8), 12);
        create('walk_left', frames('walk_left_', 8), 12);
        create('attack', frames('attack_', 6), 18, 0);
        create('attack_down', frames('attack_down_', 6), 20, 0);
        create('attack_right', frames('attack_right_', 6), 20, 0);
        create('attack_up', frames('attack_up_', 6), 20, 0);
        create('attack_left', frames('attack_left_', 6), 20, 0);
        create('hit', frames('hit_', 2), 12, 0);
    }

    _animKey(name) {
        return `${this.texturePrefix}_${name}`;
    }

    _animName(animKey) {
        const prefix = `${this.texturePrefix}_`;
        return animKey?.startsWith(prefix) ? animKey.slice(prefix.length) : animKey;
    }

    update(time, delta) {
        if (this.isDead) return;
        this._handleMovement();
        this._updateAnimation(time, delta);
        this._updateInvincibility(delta);
        this._updateAura();
        this._checkRankUp();
        this._updateRegen(delta);
    }

    _handleMovement() {
        const speed = this.stats.speed;
        let vx = 0;
        let vy = 0;
        let usingJoystick = false;

        // Read joystick state directly each frame (no intermediary)
        const mc = this.scene.mobileControls;
        const joy = mc ? mc.getJoystickState() : null;

        if (joy) {
            vx = joy.x;
            vy = joy.y;
            usingJoystick = true;
        } else {
            if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -1;
            if (this.cursors.right.isDown || this.wasd.right.isDown) vx = 1;
            if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -1;
            if (this.cursors.down.isDown || this.wasd.down.isDown) vy = 1;
        }

        // Normalize diagonal keyboard input
        if (!usingJoystick && vx !== 0 && vy !== 0) {
            vx *= 0.707;
            vy *= 0.707;
        }

        // Fast acceleration with a little inertia. This removes the "cardboard cutout"
        // feel without making keyboard control sluggish.
        const lerpFactor = usingJoystick ? 0.35 : 0.48;
        this.smoothVx += (vx - this.smoothVx) * lerpFactor;
        this.smoothVy += (vy - this.smoothVy) * lerpFactor;

        if (Math.abs(this.smoothVx) < 0.015) this.smoothVx = 0;
        if (Math.abs(this.smoothVy) < 0.015) this.smoothVy = 0;

        this.body.setVelocity(this.smoothVx * speed, this.smoothVy * speed);
        this.isMoving = Math.hypot(this.smoothVx, this.smoothVy) > 0.025;

        if (Math.abs(this.smoothVx) > 0.08) this.facingRight = this.smoothVx > 0;

        this.moveInputX = this.smoothVx;
        this.moveInputY = this.smoothVy;
        this.moveIntensity = Phaser.Math.Clamp(Math.hypot(this.moveInputX, this.moveInputY), 0, 1);
        if (this.moveIntensity > 0.02) {
            this.lastMoveAngle = Math.atan2(this.moveInputY, this.moveInputX);
            const ax = Math.abs(this.moveInputX);
            const ay = Math.abs(this.moveInputY);
            if (ay > ax * 1.15) {
                this.moveDirection = this.moveInputY < 0 ? 'up' : 'down';
            } else if (ax > 0.02) {
                this.moveDirection = this.moveInputX < 0 ? 'left' : 'right';
            }
        }

        this._applyFacingFlip();
    }

    playAttackMotion(angle, duration = 280, side = 1) {
        if (!this.active || this.isDead) return;

        const facing = Math.cos(angle);
        if (Math.abs(facing) > 0.12) {
            this.facingRight = facing > 0;
        }

        this._attackPose.active = true;
        this._attackPose.elapsed = 0;
        this._attackPose.duration = duration;
        this._attackPose.angle = angle;
        this._attackPose.side = side || 1;
        this._attackPose.direction = this._directionFromAngle(angle);
        const preferredAnimKey = this._animKey(`attack_${this._attackPose.direction}`);
        const fallbackAnimKey = this._animKey('attack');
        const activeAnimKey = this.scene.anims.exists(preferredAnimKey)
            ? preferredAnimKey
            : (this.scene.anims.exists(fallbackAnimKey) ? fallbackAnimKey : null);
        if (activeAnimKey) {
            this.play(activeAnimKey, false);
            this._applyFlipForAnimation(activeAnimKey);
        }
    }

    _animExists(key) {
        return this.scene.anims.exists(key);
    }

    _directionFromAngle(angle) {
        const x = Math.cos(angle);
        const y = Math.sin(angle);
        if (Math.abs(y) > Math.abs(x) * 1.25) {
            return y < 0 ? 'up' : 'down';
        }
        return x < 0 ? 'left' : 'right';
    }

    _applyFacingFlip() {
        this.setFlipX(this.facingRight);
    }

    _getActiveAnimationKey() {
        if (this._hitReactTimer > 0 && this._animExists(this._animKey('hit'))) {
            return this._animKey('hit');
        }
        if (this._attackPose.active) {
            const directionalAttack = this._animKey(`attack_${this._attackPose.direction || this._directionFromAngle(this._attackPose.angle)}`);
            if (this._animExists(directionalAttack)) return directionalAttack;
            if (this._animExists(this._animKey('attack'))) return this._animKey('attack');
        }
        if (this._moveBlend > 0.08) {
            const directionalWalk = this._animKey(`walk_${this.moveDirection}`);
            if (this._animExists(directionalWalk)) return directionalWalk;
            if (this._animExists(this._animKey('walk'))) return this._animKey('walk');
        }
        return this._animKey('idle');
    }

    _applyFlipForAnimation(animKey) {
        const name = this._animName(animKey);
        if (name === 'walk_left' || name === 'walk_right' ||
            name === 'walk_up' || name === 'walk_down' ||
            name === 'attack_left' || name === 'attack_right' ||
            name === 'attack_up' || name === 'attack_down') {
            this.setFlipX(false);
            return;
        }
        this._applyFacingFlip();
    }

    _updateAnimation(time, delta) {
        const dt = Math.min(delta || 16.67, 50);
        const targetMove = this.isMoving ? this.moveIntensity : 0;
        this._moveBlend += (targetMove - this._moveBlend) * Math.min(1, dt / 90);

        const bodySpeed = Math.hypot(this.body.velocity.x, this.body.velocity.y);
        const speedRatio = Phaser.Math.Clamp(bodySpeed / Math.max(1, this.stats.speed), 0, 1);
        this._stepPhase += dt * (0.0085 + speedRatio * 0.0065);

        const activeAnim = this._getActiveAnimationKey();
        if (this.anims?.currentAnim?.key !== activeAnim) {
            this.play(activeAnim, true);
        }

        const step = Math.sin(this._stepPhase);
        const footfall = Math.abs(step);
        const idleBreath = Math.sin(time * 0.003);
        const walkWeight = this._moveBlend;
        const idleWeight = 1 - walkWeight;
        const facingSign = this.facingRight ? 1 : -1;
        const horizontalLean = this.moveInputX * 2.2;
        const verticalLean = this.moveInputY * 0.75;
        const walkSway = step * 0.55 * walkWeight * facingSign;
        const walkSquash = footfall * 0.007 * walkWeight;
        const idleScaleY = idleBreath * 0.008 * idleWeight;
        const idleScaleX = -idleBreath * 0.004 * idleWeight;

        const attack = this._sampleAttackPose(dt);
        const hitPulse = this._sampleHitReact(dt);

        const scaleX = Phaser.Math.Clamp(
            1 + idleScaleX + walkSquash * 0.45 + attack.scaleX - hitPulse * 0.11,
            0.9,
            1.12
        );
        const scaleY = Phaser.Math.Clamp(
            1 + idleScaleY - walkSquash * 0.55 + attack.scaleY + hitPulse * 0.13,
            0.9,
            1.14
        );
        const angle = Phaser.Math.DegToRad(horizontalLean + verticalLean + walkSway + attack.lean + attack.twist);

        this.setScale(scaleX * this.visualBaseScale, scaleY * this.visualBaseScale);
        this.setRotation(angle);
        this._applyFlipForAnimation(activeAnim);
        this._emitMovementAfterimage(time, speedRatio, walkWeight);
    }

    _emitMovementAfterimage(time, speedRatio, walkWeight) {
        if (walkWeight < 0.55 || speedRatio < 0.45 || this._attackPose.active || this._hitReactTimer > 0) return;
        if (time - this._lastAfterimageAt < 105) return;
        this._lastAfterimageAt = time;

        try {
            const ghost = this.scene.add.sprite(
                this.x - this.body.velocity.x * 0.035,
                this.y - this.body.velocity.y * 0.035,
                this.texture.key
            )
                .setDepth(this.depth - 1)
                .setAlpha(0.18)
                .setTint(0x7b2fff)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setScale(this.scaleX * 0.99, this.scaleY * 0.99)
                .setRotation(this.rotation)
                .setFlipX(this.flipX);

            this.scene.tweens.add({
                targets: ghost,
                alpha: 0,
                scaleX: ghost.scaleX * 0.94,
                scaleY: ghost.scaleY * 0.94,
                duration: 220,
                ease: 'Quad.Out',
                onComplete: () => ghost.destroy(),
            });
        } catch (e) { /* afterimage optional */ }
    }

    _sampleAttackPose(delta) {
        const pose = this._attackPose;
        if (!pose.active) {
            return { lean: 0, twist: 0, scaleX: 0, scaleY: 0 };
        }

        pose.elapsed += delta;
        const p = Phaser.Math.Clamp(pose.elapsed / Math.max(1, pose.duration), 0, 1);
        const side = pose.side || 1;
        const direction = pose.direction || this._directionFromAngle(pose.angle);
        const isVertical = direction === 'up' || direction === 'down';
        const forwardSign = direction === 'left' || direction === 'up' ? -1 : 1;
        const leanSign = isVertical ? side * (direction === 'up' ? -1 : 1) : forwardSign;
        const prepLean = isVertical ? 3.2 : 5.5;
        const strikeLean = isVertical ? 6.2 : 13.5;
        const settleLean = isVertical ? 4.4 : 8;
        const prepTwist = isVertical ? 2.8 : 1.8;
        const strikeTwist = isVertical ? 3.6 : 2.5;
        const easeOut = (v) => 1 - Math.pow(1 - Phaser.Math.Clamp(v, 0, 1), 3);
        const easeIn = (v) => {
            const k = Phaser.Math.Clamp(v, 0, 1);
            return k * k;
        };

        let lean = 0;
        let twist = 0;
        let scaleX = 0;
        let scaleY = 0;

        if (p < 0.2) {
            const k = easeOut(p / 0.2);
            lean = -leanSign * prepLean * k;
            twist = -side * prepTwist * k;
            scaleX = -0.018 * k;
            scaleY = 0.038 * k;
        } else if (p < 0.48) {
            const k = easeOut((p - 0.2) / 0.28);
            lean = leanSign * (-prepLean + strikeLean * k);
            twist = side * strikeTwist * (1 - k);
            scaleX = (isVertical ? 0.045 : 0.07) * k;
            scaleY = (isVertical ? -0.038 : -0.055) * k;
        } else {
            const k = easeIn((p - 0.48) / 0.52);
            lean = leanSign * settleLean * (1 - k);
            twist = side * (isVertical ? 1.6 : 1.2) * (1 - k);
            scaleX = (isVertical ? 0.045 : 0.07) * (1 - k);
            scaleY = (isVertical ? -0.038 : -0.055) * (1 - k);
        }

        if (p >= 1) {
            pose.active = false;
        }

        return { lean, twist, scaleX, scaleY };
    }

    _sampleHitReact(delta) {
        if (this._hitReactTimer <= 0) return 0;

        this._hitReactTimer = Math.max(0, this._hitReactTimer - delta);
        const elapsed = 1 - this._hitReactTimer / Math.max(1, this._hitReactDuration);
        return Math.sin(Phaser.Math.Clamp(elapsed, 0, 1) * Math.PI);
    }

    _updateInvincibility(delta) {
        if (this.isInvincible) {
            this.invincibleTimer -= delta;
            this.setAlpha(Math.sin(this.invincibleTimer * 0.01) > 0 ? 1 : 0.3);
            if (this.invincibleTimer <= 0) {
                this.isInvincible = false;
                this.setAlpha(1);
            }
        }
    }

    _updateAura() {
        if (this.aura) this.aura.setVisible(false).setAlpha(0);
        return;

        this.aura.setPosition(this.x, this.y + this.displayHeight * 0.33);
        const rank = RANKS[this.currentRank];
        const pulse = Math.sin(this.scene.time.now * 0.002) * 0.08;
        const baseAlpha = 0.16;
        const auraScale = Phaser.Math.Clamp(this.visualBaseScale / 1.12, 0.72, 1);
        this.aura.setAlpha(Math.max(baseAlpha, rank.glowAlpha));
        this.aura.setTint(rank.glowAlpha > 0 ? rank.color : COLORS.SHADOW_PRIMARY);
        this.aura.setScale((1.45 + pulse) * auraScale, (0.78 + pulse * 0.35) * auraScale);
    }

    _checkRankUp() {
        const rankIdx = RANK_ORDER.indexOf(this.currentRank);
        if (rankIdx < RANK_ORDER.length - 1) {
            const nextRank = RANK_ORDER[rankIdx + 1];
            if (this.level >= RANKS[nextRank].level) {
                this.currentRank = nextRank;
                this._onRankUp();
            }
        }
    }

    _onRankUp() {
        const rank = RANKS[this.currentRank];

        // Sound
        if (this.scene.soundManager) this.scene.soundManager.play('rankup');

        // System message
        if (this.scene.systemMessage) {
            const msgs = [
                `헌터 등급이 상승했습니다: ${rank.label}`,
                '모든 능력치가 강화됩니다.',
            ];
            if (this.currentRank === 'S') {
                msgs.push('"그림자의 군주"가 각성합니다.');
            }
            this.scene.systemMessage.show('[시스템]', msgs, { duration: 3500, type: 'levelup' });
        }

        // Update glow filter based on rank
        try {
            if (this._glowFilter) {
                this._glowFilter.setActive(true);
                this._glowFilter.color = rank.color;
                this._glowFilter.outerStrength = rank.glowAlpha > 0.3 ? 6 : 3;
            }
        } catch (e) { /* silent */ }

        // Flash effect
        this.scene.cameras.main.flash(300, 100, 50, 200);

        // Rank up text
        const rankText = this.scene.add.text(this.x, this.y - 50, rank.label, {
            fontSize: '20px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: COLORS.TEXT_GOLD,
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(100);

        this.scene.tweens.add({
            targets: rankText,
            y: rankText.y - 60,
            alpha: 0,
            duration: 2000,
            onComplete: () => rankText.destroy(),
        });

        // Percentage-based stat boost on rank up (단리)
        // HP +40%, Attack +15%, Speed +5%, CDR +5% per rank-up
        this.rankUpCount++;
        const prevMaxHp = this.stats.maxHp;
        this._recalcStat('maxHp');
        this._recalcStat('attack');
        this._recalcStat('speed');
        this._recalcStat('cooldownReduction');
        // Heal by the amount maxHp increased
        const hpGain = this.stats.maxHp - prevMaxHp;
        this.stats.hp = Math.min(this.stats.hp + hpGain, this.stats.maxHp);
    }

    addXP(amount) {
        const actualAmount = Math.floor(amount * this.stats.xpMultiplier);
        this.xp += actualAmount;

        if (this.xp >= this.xpToNext && this.level < 30) {
            this.xp -= this.xpToNext;
            this.level++;
            this.xpToNext = XP_TABLE[this.level] || this.xpToNext * 1.2;
            // Level-up heal (30% of max HP)
            this.heal(Math.floor(this.stats.maxHp * 0.3));
            return true; // Level up occurred (one at a time, remaining XP carries over)
        }
        return false;
    }

    _updateRegen(delta) {
        // Passive HP regen.
        if (this.stats.hp >= this.stats.maxHp) return;
        const hpRegenRate = 1.5;
        this._regenAccum = (this._regenAccum || 0) + hpRegenRate * (delta / 1000);
        if (this._regenAccum >= 1) {
            const heal = Math.floor(this._regenAccum);
            this._regenAccum -= heal;
            this.stats.hp = Math.min(this.stats.hp + heal, this.stats.maxHp);
        }
    }

    takeDamage(amount) {
        if (this.isDead || this.isInvincible) return false;

        const damage = Math.max(1, Math.floor(amount));
        this.stats.hp -= damage;
        this.isInvincible = true;
        this.invincibleTimer = 650;

        // Damage effect - camera shake (stronger based on damage ratio)
        const hpRatio = damage / this.stats.maxHp;
        const shakeIntensity = Math.min(0.02, 0.006 + hpRatio * 0.05);
        this.scene.cameras.main.shake(150, shakeIntensity);

        // Red screen flash (stronger when low HP)
        const cam = this.scene.cameras.main;
        const currentHpRatio = this.stats.hp / this.stats.maxHp;
        const flashAlpha = currentHpRatio < 0.3 ? 0.4 : 0.2;
        const redOverlay = this.scene.add.rectangle(
            cam.width / 2, cam.height / 2,
            cam.width, cam.height, 0xff0000, 0
        ).setDepth(90).setScrollFactor(0);
        this.scene.tweens.add({
            targets: redOverlay,
            alpha: flashAlpha,
            duration: 80,
            yoyo: true,
            onComplete: () => redOverlay.destroy(),
        });

        // Hit recoil motion (knockback + red flash + flinch)
        this._playHitRecoil(damage);

        // Haptic feedback (mobile vibration)
        if (navigator.vibrate) {
            navigator.vibrate(damage > this.stats.maxHp * 0.3 ? [80, 30, 80] : 50);
        }

        // Sound
        if (this.scene.soundManager) this.scene.soundManager.play('playerHit');

        // Damage number
        this._showDamageNumber(damage, COLORS.TEXT_RED);

        if (this.stats.hp <= 0) {
            this.stats.hp = 0;
            this.die();
            return true;
        }
        return false;
    }

    die() {
        if (this.isDead) return;
        const scene = this.scene;
        if (!scene) return;

        this.isDead = true;

        // Stop movement
        this.body.setVelocity(0, 0);
        this.body.enable = false;
        this.stop(); // Stop animations

        // Red flash
        this.setTint(0xff0000);

        // Shadow particles burst from body
        try {
            // Main shadow burst
            const burst = scene.add.particles(this.x, this.y, 'particle_glow', {
                speed: { min: 40, max: 180 },
                scale: { start: 1.2, end: 0 },
                alpha: { start: 0.9, end: 0 },
                lifespan: { min: 600, max: 1200 },
                angle: { min: 0, max: 360 },
                tint: [COLORS.SHADOW_PRIMARY, 0x4400aa, 0x220044],
                blendMode: 'ADD',
                emitting: false,
            });
            burst.setDepth(11);
            burst.explode(25);

            // Rising wisps (soul leaving body)
            const wisps = scene.add.particles(this.x, this.y - 10, 'particle_spark', {
                speed: { min: 15, max: 60 },
                angle: { min: 240, max: 300 },
                scale: { start: 0.8, end: 0 },
                alpha: { start: 0.8, end: 0 },
                lifespan: { min: 800, max: 1500 },
                tint: [0x7b2fff, 0xaa66ff, 0xddaaff],
                blendMode: 'ADD',
                frequency: 60,
                quantity: 2,
            });
            wisps.setDepth(11);
            scene.time.delayedCall(1200, () => {
                if (!scene.scene?.isActive?.() || !wisps.scene) return;
                wisps.stop();
                scene.time.delayedCall(1600, () => {
                    if (burst.scene) burst.destroy();
                    if (wisps.scene) wisps.destroy();
                });
            });
        } catch (e) {
            // Fallback
            for (let i = 0; i < 20; i++) {
                const p = scene.add.circle(
                    this.x + Phaser.Math.Between(-10, 10), this.y + Phaser.Math.Between(-15, 10),
                    Phaser.Math.Between(3, 7), COLORS.SHADOW_PRIMARY, 0.8
                ).setDepth(11);
                scene.tweens.add({
                    targets: p, x: p.x + Phaser.Math.Between(-80, 80), y: p.y + Phaser.Math.Between(-100, 30),
                    alpha: 0, scale: 0, duration: Phaser.Math.Between(600, 1200),
                    delay: Phaser.Math.Between(0, 300), onComplete: () => { if (p.scene) p.destroy(); },
                });
            }
        }

        // Player collapse animation: shrink + rotate + fade
        scene.tweens.add({
            targets: this,
            scaleY: 0.3,
            scaleX: 2.5,
            alpha: 0.5,
            angle: this.facingRight ? 90 : -90,
            duration: 600,
            ease: 'Power2',
            onComplete: () => {
                if (!this.scene || !scene.scene?.isActive?.()) return;
                // Dissolve into shadow
                scene.tweens.add({
                    targets: this,
                    alpha: 0,
                    duration: 500,
                    onComplete: () => {
                        if (!this.scene || !scene.scene?.isActive?.()) return;
                        // Hide aura
                        if (this.aura) this.aura.setAlpha(0);
                        scene.onPlayerDeath();
                    },
                });
            },
        });

        // Aura flicker and fade
        if (this.aura) {
            scene.tweens.add({
                targets: this.aura,
                alpha: 0,
                duration: 800,
            });
        }
    }

    _playHitRecoil(damage) {
        // Red flash tint
        this.setTint(0xff3333);
        this.scene.time.delayedCall(120, () => {
            if (this.active && !this.isDead) this.clearTint();
        });

        this._hitReactDuration = 150;
        this._hitReactTimer = this._hitReactDuration;

        // Knockback recoil (slight push away from damage source)
        const enemies = this.getAllEnemies();
        let closestAngle = this.facingRight ? Math.PI : 0;
        let closestDist = 9999;
        for (const e of enemies) {
            if (!e.active) continue;
            const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
            if (d < closestDist) {
                closestDist = d;
                closestAngle = Phaser.Math.Angle.Between(e.x, e.y, this.x, this.y);
            }
        }
        const knockDist = Math.min(20, 8 + damage * 0.15);
        this.scene.tweens.add({
            targets: this,
            x: this.x + Math.cos(closestAngle) * knockDist,
            y: this.y + Math.sin(closestAngle) * knockDist,
            duration: 80,
            ease: 'Power2',
        });

        // Hit spark particles
        try {
            const spark = this.scene.add.circle(
                this.x + Phaser.Math.Between(-8, 8),
                this.y + Phaser.Math.Between(-12, 4),
                6, 0xff4444, 0.8
            ).setDepth(12);
            this.scene.tweens.add({
                targets: spark, alpha: 0, scale: 3,
                duration: 200, onComplete: () => spark.destroy(),
            });
        } catch (e) { /* silent */ }
    }

    heal(amount) {
        this.stats.hp = Math.min(this.stats.hp + amount, this.stats.maxHp);
    }

    _showDamageNumber(value, color) {
        const text = this.scene.add.text(this.x, this.y - 20, '-' + value, {
            fontSize: '16px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: color,
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(100);

        this.scene.tweens.add({
            targets: text,
            y: text.y - 40,
            alpha: 0,
            duration: 800,
            onComplete: () => text.destroy(),
        });
    }

    applyPassive(statKey, bonusPerLevel) {
        if (!this.passiveLevels[statKey]) this.passiveLevels[statKey] = 0;
        this.passiveLevels[statKey]++;
        this._recalcStat(statKey, bonusPerLevel);

        if (statKey === 'maxHp') {
            this.stats.hp = Math.min(this.stats.hp + 15, this.stats.maxHp);
        }
    }

    _recalcStat(statKey, bonusPerLevel) {
        const base = this.baseStats?.[statKey] ?? PLAYER_BASE_STATS[statKey];
        const lvl = this.passiveLevels[statKey] || 0;

        // Diminishing returns: each stack is worth slightly less than the previous
        // effectiveLevels = sum of (1/sqrt(i)) for i=1..lvl
        // e.g. 1 stack = 1.0, 2 stacks = 1.71, 3 stacks = 2.29, 4 stacks = 2.79
        let effectiveLevels = 0;
        for (let i = 1; i <= lvl; i++) {
            effectiveLevels += 1 / Math.sqrt(i);
        }

        // Look up bonusPerLevel from passive config if not provided
        if (bonusPerLevel === undefined) {
            const passive = Object.values(PASSIVES).find(p => p.stat === statKey);
            bonusPerLevel = passive ? passive.bonus : 0;
        }

        // Rank-up percentage multipliers (단리: 1 + count × rate)
        const RANK_RATES = { maxHp: 0.40, attack: 0.15, speed: 0.05, cooldownReduction: 0.05 };
        const rankRate = RANK_RATES[statKey] || 0;
        const rankMult = 1 + (this.rankUpCount || 0) * rankRate;

        if (statKey === 'cooldownReduction') {
            // CDR: base + passive + rank (all additive)
            this.stats[statKey] = base + bonusPerLevel * effectiveLevels + (this.rankUpCount || 0) * rankRate;
        } else if (statKey === 'critRate' || statKey === 'xpMultiplier') {
            this.stats[statKey] = base + bonusPerLevel * effectiveLevels;
        } else {
            // base × passiveMultiplier × rankMultiplier
            this.stats[statKey] = Math.floor(base * (1 + bonusPerLevel * effectiveLevels) * rankMult);
        }

    }

    getAllEnemies() {
        const enemies = this.scene.enemyManager?.getActiveEnemies() || [];
        const bosses = this.scene.activeBosses || [];
        return [...enemies, ...bosses.filter(b => b.active)];
    }

    getClosestEnemy(range) {
        const enemies = this.getAllEnemies();
        let closest = null;
        let closestDist = range || 999999;

        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
            if (dist < closestDist) {
                closestDist = dist;
                closest = enemy;
            }
        }
        return closest;
    }

    destroy(fromScene) {
        if (this.scene?.tweens) {
            this.scene.tweens.killTweensOf(this);
            if (this.aura) this.scene.tweens.killTweensOf(this.aura);
        }
        if (this.aura) { this.aura.destroy(); this.aura = null; }
        super.destroy(fromScene);
    }
}
