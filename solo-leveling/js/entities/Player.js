import { PLAYER_BASE_STATS, RANKS, RANK_ORDER, XP_TABLE, COLORS, WORLD_SIZE } from '../utils/Constants.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'player_idle_0');
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setDepth(10);
        this.setCollideWorldBounds(true);
        this.setScale(2);
        this.body.setSize(24, 36);
        this.body.setOffset(12, 10);

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

        // Create animations
        this._createAnimations(scene);
    }

    _createAnimations(scene) {
        if (!scene.anims.exists('player_idle')) {
            scene.anims.create({
                key: 'player_idle',
                frames: [
                    { key: 'player_idle_0' },
                    { key: 'player_idle_1' },
                    { key: 'player_idle_2' },
                    { key: 'player_idle_3' },
                ],
                frameRate: 4,
                repeat: -1,
            });
        }
        if (!scene.anims.exists('player_walk')) {
            scene.anims.create({
                key: 'player_walk',
                frames: [
                    { key: 'player_walk_0' },
                    { key: 'player_walk_1' },
                    { key: 'player_walk_2' },
                    { key: 'player_walk_3' },
                ],
                frameRate: 8,
                repeat: -1,
            });
        }
    }

    update(time, delta) {
        this._handleMovement();
        this._updateAnimation();
        this._updateInvincibility(delta);
        this._updateAura();
        this._checkRankUp();
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
        if (this.isMoving) {
            if (this.anims.currentAnim?.key !== 'player_walk') {
                this.play('player_walk');
            }
        } else {
            if (this.anims.currentAnim?.key !== 'player_idle') {
                this.play('player_idle');
            }
        }
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

        // Stat boost on rank up
        this.stats.maxHp += 20;
        this.stats.hp = Math.min(this.stats.hp + 20, this.stats.maxHp);
        this.stats.attack += 2;
        this.stats.defense += 1;
    }

    addXP(amount) {
        const actualAmount = Math.floor(amount * this.stats.xpMultiplier);
        this.xp += actualAmount;

        if (this.xp >= this.xpToNext && this.level < 30) {
            this.xp -= this.xpToNext;
            this.level++;
            this.xpToNext = XP_TABLE[this.level] || this.xpToNext * 1.2;
            return true; // Level up occurred (one at a time, remaining XP carries over)
        }
        return false;
    }

    takeDamage(amount) {
        if (this.isInvincible) return false;

        const damage = Math.max(1, amount - this.stats.defense);
        this.stats.hp -= damage;
        this.isInvincible = true;
        this.invincibleTimer = 1000;

        // Damage effect
        this.scene.cameras.main.shake(100, 0.005);

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
            this.scene.onPlayerDeath();
            return true;
        }
        return false;
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

        const base = PLAYER_BASE_STATS[statKey];
        const lvl = this.passiveLevels[statKey];

        // Diminishing returns: each stack is worth slightly less than the previous
        // effectiveLevels = sum of (1/sqrt(i)) for i=1..lvl
        // e.g. 1 stack = 1.0, 2 stacks = 1.71, 3 stacks = 2.29, 4 stacks = 2.79
        let effectiveLevels = 0;
        for (let i = 1; i <= lvl; i++) {
            effectiveLevels += 1 / Math.sqrt(i);
        }

        if (statKey === 'critRate' || statKey === 'cooldownReduction') {
            this.stats[statKey] = base + bonusPerLevel * effectiveLevels;
        } else if (statKey === 'xpMultiplier') {
            this.stats[statKey] = base + bonusPerLevel * effectiveLevels;
        } else {
            this.stats[statKey] = Math.floor(base * (1 + bonusPerLevel * effectiveLevels));
        }

        if (statKey === 'maxHp') {
            this.stats.hp = Math.min(this.stats.hp + 15, this.stats.maxHp);
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
        if (this.aura) this.aura.destroy();
        super.destroy(fromScene);
    }
}
