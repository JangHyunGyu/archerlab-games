import { COLORS } from '../utils/Constants.js';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
    // Shared particle emitter pool for death effects (class-level)
    static _deathEmitterPool = [];
    static _deathSparkPool = [];
    static MAX_POOLED_EMITTERS = 8;

    static _getDeathEmitter(scene, x, y) {
        // Try to reuse an existing emitter
        for (let i = Enemy._deathEmitterPool.length - 1; i >= 0; i--) {
            const em = Enemy._deathEmitterPool[i];
            if (em && em.scene && !em.emitting) {
                Enemy._deathEmitterPool.splice(i, 1);
                em.setPosition(x, y);
                return em;
            }
        }
        // Create new one
        try {
            const emitter = scene.add.particles(x, y, 'particle_glow', {
                speed: { min: 40, max: 140 },
                scale: { start: 0.8, end: 0 },
                alpha: { start: 0.9, end: 0 },
                lifespan: { min: 300, max: 600 },
                tint: [COLORS.SHADOW_PRIMARY, 0x7b2fff, 0x4400aa],
                blendMode: 'ADD',
                emitting: false,
            });
            emitter.setDepth(15);
            return emitter;
        } catch (e) {
            return null;
        }
    }

    static _getDeathSparks(scene, x, y) {
        for (let i = Enemy._deathSparkPool.length - 1; i >= 0; i--) {
            const em = Enemy._deathSparkPool[i];
            if (em && em.scene && !em.emitting) {
                Enemy._deathSparkPool.splice(i, 1);
                em.setPosition(x, y);
                return em;
            }
        }
        try {
            const sparks = scene.add.particles(x, y, 'particle_spark', {
                speed: { min: 60, max: 180 },
                scale: { start: 0.6, end: 0 },
                alpha: { start: 1, end: 0 },
                lifespan: { min: 200, max: 400 },
                tint: 0xddaaff,
                blendMode: 'ADD',
                emitting: false,
            });
            sparks.setDepth(15);
            return sparks;
        } catch (e) {
            return null;
        }
    }

    static _returnDeathEmitter(emitter) {
        if (emitter && emitter.scene && Enemy._deathEmitterPool.length < Enemy.MAX_POOLED_EMITTERS) {
            Enemy._deathEmitterPool.push(emitter);
        } else if (emitter && emitter.scene) {
            emitter.destroy();
        }
    }

    static _returnDeathSparks(sparks) {
        if (sparks && sparks.scene && Enemy._deathSparkPool.length < Enemy.MAX_POOLED_EMITTERS) {
            Enemy._deathSparkPool.push(sparks);
        } else if (sparks && sparks.scene) {
            sparks.destroy();
        }
    }

    constructor(scene, x, y) {
        super(scene, x, y, 'enemy_goblin_0');
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setDepth(5);
        this.enemyType = null;
        this.hp = 0;
        this.maxHp = 0;
        this.attack = 0;
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

        // Apply difficulty scaling (fewer enemies → each one is tougher)
        this.maxHp = Math.floor(typeData.hp * difficultyMult);
        this.hp = this.maxHp;
        // Attack scales at 50% of difficulty rate (fewer enemies, each hits harder)
        this.attack = Math.floor(typeData.attack * (1 + (difficultyMult - 1) * 0.5));
        // Speed scales at 15% of difficulty rate — player should outrun individuals
        this.speed = typeData.speed * (1 + (difficultyMult - 1) * 0.15);
        // XP scales at 50% (compensate for fewer kills)
        this.xpValue = Math.floor(typeData.xp * (1 + (difficultyMult - 1) * 0.5));

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
        this.meleeCooldown = 0;
        this._meleeRange = s * 2 + 30; // 몹 크기 기반 근접 공격 사거리
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
            if (this.slowDuration <= 0) {
                this.slowMultiplier = 1;
                if (!this.isElite) this.setTint(0xffffff);
            }
        }

        const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
        const dist = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);

        // Dark Mage: ranged attacker - stops at distance and shoots
        if (this.enemyType === 'darkMage') {
            const attackRange = 250;
            if (dist > attackRange) {
                const speed = this.speed * this.slowMultiplier;
                this.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
            } else {
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

            // 근접 공격 (사거리 내일 때 쿨다운 기반)
            if (this.meleeCooldown > 0) this.meleeCooldown -= delta;
            if (dist < this._meleeRange && this.meleeCooldown <= 0) {
                this.meleeCooldown = 800;
                const player = this.scene.player;
                if (player && !player.isDead) {
                    player.takeDamage(this.attack);
                    if (this.scene.soundManager) this.scene.soundManager.play('playerHit');
                }
            }
        }

        // Face direction
        this.setFlipX(playerX < this.x);

        // Smooth 4-frame animation (skip for offscreen enemies to save texture swaps)
        if (dist < 800) {
            this.animTimer += delta;
            if (this.animTimer > 200) {
                this.animTimer = 0;
                this.animFrame = (this.animFrame + 1) % 4;
                this.setTexture('enemy_' + this.enemyType + '_' + this.animFrame);
            }
        }
    }

    _fireProjectile(targetX, targetY) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);

        // Brief cast animation (mage glows RED)
        this.setTint(0xff4422);
        this.scene.time.delayedCall(150, () => {
            if (this.active) this.setTint(0xffffff);
        });

        const proj = this.scene.add.sprite(this.x, this.y, 'proj_darkMage')
            .setDepth(8).setScale(1.4);

        // Red danger trail (clearly enemy attack)
        const trailEvent = this.scene.time.addEvent({
            delay: 60, repeat: -1,
            callback: () => {
                if (!proj.active) { trailEvent.destroy(); return; }
                const trail = this.scene.add.circle(proj.x, proj.y, 4, 0xff3300, 0.5).setDepth(7);
                this.scene.tweens.add({
                    targets: trail, alpha: 0, scale: 0.2,
                    duration: 250, onComplete: () => trail.destroy(),
                });
            },
        });
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
                this.scene.tweens.killTweensOf(proj);
                proj.destroy();
            });
        }

        // Auto-destroy after 3.5 seconds
        this.scene.time.delayedCall(3500, () => {
            if (proj && proj.active) {
                if (collider) this.scene.physics.world.removeCollider(collider);
                this.scene.tweens.killTweensOf(proj);
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
        this.hp -= amount;

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

        // Damage number (throttled: accumulate hits within 200ms window)
        this._dmgAccum = (this._dmgAccum || 0) + amount;
        if (!this._dmgTextTimer) {
            this._dmgTextTimer = this.scene.time.delayedCall(200, () => {
                if (this.active || this._dmgAccum > 0) {
                    this._showDamageNumber(this._dmgAccum);
                }
                this._dmgAccum = 0;
                this._dmgTextTimer = null;
            });
        }

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
        // 죽을 때 누적 데미지 즉시 표시
        if (this._dmgTextTimer) {
            this._dmgTextTimer.remove(false);
            this._dmgTextTimer = null;
        }
        if (this._dmgAccum > 0) {
            this._showDamageNumber(this._dmgAccum);
            this._dmgAccum = 0;
        }

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
            // Shadow burst particles (pooled)
            const emitter = Enemy._getDeathEmitter(this.scene, this.x, this.y);
            if (emitter) emitter.explode(this.isElite ? 15 : 8);

            // Spark particles (pooled)
            const sparks = Enemy._getDeathSparks(this.scene, this.x, this.y);
            if (sparks) sparks.explode(this.isElite ? 8 : 4);

            this.scene.time.delayedCall(700, () => {
                Enemy._returnDeathEmitter(emitter);
                Enemy._returnDeathSparks(sparks);
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
