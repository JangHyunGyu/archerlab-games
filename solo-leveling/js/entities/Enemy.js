import { COLORS } from '../utils/Constants.js';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'enemy_goblin_0');
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setDepth(5);
        this.enemyType = null;
        this.hp = 0;
        this.maxHp = 0;
        this.attack = 0;
        this.defense = 0;
        this.speed = 0;
        this.xpValue = 0;
        this.animFrame = 0;
        this.animTimer = 0;
        this.knockbackTimer = 0;
        this.slowMultiplier = 1;
        this.slowDuration = 0;
        this.isBoss = false;
        this.hpBar = null;
    }

    spawn(typeKey, typeData, difficultyMult, x, y) {
        // Reset any monkey-patched methods from elite spawns
        this.update = Enemy.prototype.update;
        this.die = Enemy.prototype.die;
        this.isElite = false;
        if (this._eliteLabel) { this._eliteLabel.destroy(); this._eliteLabel = null; }

        this.enemyType = typeKey;
        this.setPosition(x, y);
        this.setActive(true);
        this.setVisible(true);
        this.body.enable = true;
        this.setScale(1, 1);

        // Apply difficulty scaling
        this.maxHp = Math.floor(typeData.hp * difficultyMult);
        this.hp = this.maxHp;
        this.attack = Math.floor(typeData.attack * difficultyMult);
        // Defense scales at 40% of difficulty rate (reduced to prevent late-game damage immunity)
        this.defense = Math.floor((typeData.defense || 0) * (1 + (difficultyMult - 1) * 0.4));
        // Speed scales at 40% of difficulty rate so enemies can still reach the player late-game
        this.speed = typeData.speed * (1 + (difficultyMult - 1) * 0.4);
        this.xpValue = Math.floor(typeData.xp * (1 + (difficultyMult - 1) * 0.3));

        // Set texture and size
        this.setTexture('enemy_' + typeKey + '_0');
        const s = typeData.size;
        this.body.setSize(s * 1.2, s * 1.2);
        this.setDisplaySize(s * 2, s * 2);

        this.animFrame = 0;
        this.animTimer = 0;
        this.knockbackTimer = 0;
        this.slowMultiplier = 1;
        this.slowDuration = 0;
        this.rangedCooldown = 0;
        this.setAlpha(1);
        this.setTint(0xffffff);
    }

    update(time, delta, playerX, playerY) {
        if (!this.active) return;

        // Knockback
        if (this.knockbackTimer > 0) {
            this.knockbackTimer -= delta;
            return;
        }

        // Slow effect
        if (this.slowDuration > 0) {
            this.slowDuration -= delta;
            if (this.slowDuration <= 0) this.slowMultiplier = 1;
        }

        const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
        const dist = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);

        // Dark Mage: ranged attacker - stops at distance and shoots
        if (this.enemyType === 'darkMage') {
            const attackRange = 250;
            if (dist > attackRange) {
                // Move closer
                const speed = this.speed * this.slowMultiplier;
                this.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
            } else {
                // Stop and shoot
                this.body.setVelocity(0, 0);
                this.rangedCooldown -= delta;
                if (this.rangedCooldown <= 0) {
                    this.rangedCooldown = 2000;
                    this._fireProjectile(playerX, playerY);
                }
            }
        } else {
            // Normal melee: move toward player
            const speed = this.speed * this.slowMultiplier;
            this.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        }

        // Face direction
        this.setFlipX(playerX < this.x);

        // Simple wobble animation
        this.animTimer += delta;
        if (this.animTimer > 300) {
            this.animTimer = 0;
            this.animFrame = 1 - this.animFrame;
            this.setTexture('enemy_' + this.enemyType + '_' + this.animFrame);
        }
    }

    _fireProjectile(targetX, targetY) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);

        // Brief cast animation (mage glows)
        this.setTint(0xcc44ff);
        this.scene.time.delayedCall(150, () => {
            if (this.active) this.setTint(0xffffff);
        });

        const proj = this.scene.add.sprite(this.x, this.y, 'proj_darkMage')
            .setDepth(8).setScale(1.4);
        this.scene.physics.add.existing(proj, false);
        proj.body.setAllowGravity(false);
        proj.body.setCircle(6);

        // Slow enough to dodge (150 speed)
        const speed = 150;
        proj.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

        // Collision with player (store collider to remove on destroy)
        const player = this.scene.player;
        let collider = null;
        if (player) {
            collider = this.scene.physics.add.overlap(proj, player, () => {
                if (!proj.active) return;
                player.takeDamage(this.attack);
                if (collider) this.scene.physics.world.removeCollider(collider);
                proj.destroy();
            });
        }

        // Auto-destroy after 3.5 seconds
        this.scene.time.delayedCall(3500, () => {
            if (proj && proj.active) {
                if (collider) this.scene.physics.world.removeCollider(collider);
                proj.destroy();
            }
        });

        // Spin + pulsing glow for visibility
        this.scene.tweens.add({
            targets: proj,
            rotation: proj.rotation + Math.PI * 6,
            scaleX: { from: 1.4, to: 1.0 },
            scaleY: { from: 1.4, to: 1.0 },
            duration: 3500,
            yoyo: true,
        });
    }

    takeDamage(amount, knockbackX, knockbackY) {
        // Defense reduces damage (minimum 1)
        const reduced = Math.max(1, amount - this.defense);
        this.hp -= reduced;
        amount = reduced;

        // Flash red on hit, then restore
        this.setTint(0xff0000);
        this.scene.time.delayedCall(80, () => {
            if (this.active) this.setTint(this.isElite ? 0xff6644 : 0xffffff);
        });

        // Knockback
        if (knockbackX !== undefined) {
            const angle = Phaser.Math.Angle.Between(knockbackX, knockbackY, this.x, this.y);
            this.body.setVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
            this.knockbackTimer = 150;
        }

        // Damage number
        this._showDamageNumber(amount);

        if (this.hp <= 0) {
            this.die();
            return true;
        }
        return false;
    }

    applySlow(multiplier, duration) {
        this.slowMultiplier = Math.min(this.slowMultiplier, multiplier);
        this.slowDuration = Math.max(this.slowDuration, duration);
        this.setTint(0x8888ff);
    }

    die() {
        // Drop XP
        if (this.scene.xpOrbPool) {
            this.scene.xpOrbPool.spawn(this.x, this.y, this.xpValue);
        }

        // Item drop chance
        if (this.scene.itemDropManager) {
            this.scene.itemDropManager.tryDrop(this.x, this.y);
        }

        // Quest kill counter
        if (this.scene.enemyManager) {
            this.scene.enemyManager.onEnemyKilled(this.enemyType);
        }

        // Sound
        if (this.scene.soundManager) {
            this.scene.soundManager.play('kill');
        }

        // Death effect
        this._deathEffect();

        // Update kill counter
        if (this.scene.player) {
            this.scene.player.kills++;
        }

        this.setActive(false);
        this.setVisible(false);
        this.body.enable = false;
    }

    _deathEffect() {
        try {
            // Shadow burst particles
            const emitter = this.scene.add.particles(this.x, this.y, 'particle_glow', {
                speed: { min: 40, max: 140 },
                scale: { start: 0.8, end: 0 },
                alpha: { start: 0.9, end: 0 },
                lifespan: { min: 300, max: 600 },
                tint: [COLORS.SHADOW_PRIMARY, 0x7b2fff, 0x4400aa],
                blendMode: 'ADD',
                emitting: false,
            });
            emitter.setDepth(15);
            emitter.explode(this.isElite ? 15 : 8);

            // Spark particles
            const sparks = this.scene.add.particles(this.x, this.y, 'particle_spark', {
                speed: { min: 60, max: 180 },
                scale: { start: 0.6, end: 0 },
                alpha: { start: 1, end: 0 },
                lifespan: { min: 200, max: 400 },
                tint: 0xddaaff,
                blendMode: 'ADD',
                emitting: false,
            });
            sparks.setDepth(15);
            sparks.explode(this.isElite ? 8 : 4);

            this.scene.time.delayedCall(700, () => {
                if (emitter) emitter.destroy();
                if (sparks) sparks.destroy();
            });
        } catch (e) {
            // Fallback
            for (let i = 0; i < 5; i++) {
                const p = this.scene.add.circle(
                    this.x + Phaser.Math.Between(-10, 10), this.y + Phaser.Math.Between(-10, 10),
                    Phaser.Math.Between(2, 5), COLORS.SHADOW_PRIMARY, 0.7
                ).setDepth(15);
                this.scene.tweens.add({
                    targets: p, alpha: 0, scale: 0,
                    x: p.x + Phaser.Math.Between(-30, 30), y: p.y + Phaser.Math.Between(-30, 30),
                    duration: 400, onComplete: () => p.destroy(),
                });
            }
        }
    }

    _showDamageNumber(value) {
        // Show large numbers as "big hit" (over 50% of max HP)
        const isCrit = value > this.maxHp * 0.5;
        const text = this.scene.add.text(
            this.x + Phaser.Math.Between(-10, 10),
            this.y - 15,
            isCrit ? value + '!' : String(value),
            {
                fontSize: isCrit ? '18px' : '14px',
                fontFamily: 'Arial',
                fontStyle: 'bold',
                color: isCrit ? COLORS.TEXT_GOLD : COLORS.TEXT_WHITE,
                stroke: '#000000',
                strokeThickness: 2,
            }
        ).setOrigin(0.5).setDepth(100);

        this.scene.tweens.add({
            targets: text,
            y: text.y - 30,
            alpha: 0,
            duration: 600,
            onComplete: () => text.destroy(),
        });
    }
}
