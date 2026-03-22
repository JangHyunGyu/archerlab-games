import { PLAYER_BASE_STATS, RANKS, RANK_ORDER, XP_TABLE, COLORS, WORLD_SIZE, PASSIVES } from '../utils/Constants.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'player_idle_0');
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setDepth(10);
        this.setCollideWorldBounds(true);
        this.setScale(1);
        this.body.setSize(48, 72);
        this.body.setOffset(24, 20);

        // Stats
        this.stats = { ...PLAYER_BASE_STATS };
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
            .setScale(2)
            .setBlendMode(Phaser.BlendModes.ADD);

        // Glow filter (rank-based)
        try {
            this.enableFilters();
            this._glowFilter = this.filters.internal.addGlow(0x7b2fff, 2, 0, 1, false, 8, 8);
            this._glowFilter.setActive(false); // Starts inactive, enabled on rank up
        } catch (e) { /* filters not available */ }

        // Create animations
        this._createAnimations(scene);
    }

    _createAnimations(scene) {
        if (!scene.anims.exists('player_idle')) {
            scene.anims.create({
                key: 'player_idle',
                frames: Array.from({ length: 8 }, (_, i) => ({ key: 'player_idle_' + i })),
                frameRate: 6,
                repeat: -1,
            });
        }
        if (!scene.anims.exists('player_walk')) {
            scene.anims.create({
                key: 'player_walk',
                frames: Array.from({ length: 8 }, (_, i) => ({ key: 'player_walk_' + i })),
                frameRate: 12,
                repeat: -1,
            });
        }
    }

    update(time, delta) {
        if (this.isDead) return;
        this._handleMovement();
        this._updateAnimation();
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

        if (usingJoystick) {
            // Lerp smoothing for mobile — fast response, no jitter
            const lerpFactor = 0.35;
            this.smoothVx += (vx - this.smoothVx) * lerpFactor;
            this.smoothVy += (vy - this.smoothVy) * lerpFactor;

            // Snap to zero if very small to prevent drifting
            if (Math.abs(this.smoothVx) < 0.01) this.smoothVx = 0;
            if (Math.abs(this.smoothVy) < 0.01) this.smoothVy = 0;

            this.body.setVelocity(this.smoothVx * speed, this.smoothVy * speed);
            this.isMoving = Math.abs(this.smoothVx) > 0.01 || Math.abs(this.smoothVy) > 0.01;

            if (Math.abs(this.smoothVx) > 0.1) this.facingRight = this.smoothVx > 0;
        } else {
            // Keyboard: instant response, reset smoothing
            this.smoothVx = vx;
            this.smoothVy = vy;
            this.body.setVelocity(vx * speed, vy * speed);
            this.isMoving = vx !== 0 || vy !== 0;

            if (vx !== 0) this.facingRight = vx > 0;
        }

        this.setFlipX(!this.facingRight);
    }

    _updateAnimation() {
        // Static image - just flip based on facing direction
        this.setFlipX(!this.facingRight);
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
        this.aura.setPosition(this.x, this.y);
        const rank = RANKS[this.currentRank];
        if (rank.glowAlpha > 0) {
            this.aura.setAlpha(rank.glowAlpha);
            this.aura.setTint(rank.color);
            this.aura.setScale(1 + Math.sin(this.scene.time.now * 0.002) * 0.1);
        }
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
        // Passive HP regen: 1.5 HP/sec
        if (this.stats.hp >= this.stats.maxHp) return;
        this._regenAccum = (this._regenAccum || 0) + 1.5 * (delta / 1000);
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
        this.invincibleTimer = 1000;

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
            const burst = this.scene.add.particles(this.x, this.y, 'particle_glow', {
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
            const wisps = this.scene.add.particles(this.x, this.y - 10, 'particle_spark', {
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
            this.scene.time.delayedCall(1200, () => {
                wisps.stop();
                this.scene.time.delayedCall(1600, () => { burst.destroy(); wisps.destroy(); });
            });
        } catch (e) {
            // Fallback
            for (let i = 0; i < 20; i++) {
                const p = this.scene.add.circle(
                    this.x + Phaser.Math.Between(-10, 10), this.y + Phaser.Math.Between(-15, 10),
                    Phaser.Math.Between(3, 7), COLORS.SHADOW_PRIMARY, 0.8
                ).setDepth(11);
                this.scene.tweens.add({
                    targets: p, x: p.x + Phaser.Math.Between(-80, 80), y: p.y + Phaser.Math.Between(-100, 30),
                    alpha: 0, scale: 0, duration: Phaser.Math.Between(600, 1200),
                    delay: Phaser.Math.Between(0, 300), onComplete: () => p.destroy(),
                });
            }
        }

        // Player collapse animation: shrink + rotate + fade
        this.scene.tweens.add({
            targets: this,
            scaleY: 0.3,
            scaleX: 2.5,
            alpha: 0.5,
            angle: this.facingRight ? 90 : -90,
            duration: 600,
            ease: 'Power2',
            onComplete: () => {
                // Dissolve into shadow
                this.scene.tweens.add({
                    targets: this,
                    alpha: 0,
                    duration: 500,
                    onComplete: () => {
                        // Hide aura
                        if (this.aura) this.aura.setAlpha(0);
                        this.scene.onPlayerDeath();
                    },
                });
            },
        });

        // Aura flicker and fade
        if (this.aura) {
            this.scene.tweens.add({
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

        // Flinch: quick scale squash + recover
        this.scene.tweens.add({
            targets: this,
            scaleX: 0.85,
            scaleY: 1.15,
            duration: 60,
            yoyo: true,
            ease: 'Power2',
        });

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
        const base = PLAYER_BASE_STATS[statKey];
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
