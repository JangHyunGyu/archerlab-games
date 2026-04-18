import { COLORS, BOSS_TYPES } from '../utils/Constants.js';

export class ShadowSoldier extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, bossKey) {
        const config = BOSS_TYPES[bossKey];
        // Use boss texture frame 0 with shadow tint
        super(scene, x, y, 'boss_' + bossKey + '_0');

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setDepth(9);
        this.bossKey = bossKey;
        this.bossName = config.name;
        this.soldierType = config.shadowType;

        // Match boss original size
        this.body.setSize(config.size * 1.4, config.size * 1.4);
        this.setDisplaySize(config.size * 2, config.size * 2);

        // Shadow appearance - undead tint per type (zombie/grotesque feel)
        const undeadTints = {
            melee:  0x334455,  // 이그리스: 창백한 청회색 (유령 기사)
            tank:   0x3a4a2a,  // 터스크: 부패한 녹갈색 (썩은 좀비)
            ranged: 0x4a2244,  // 베루: 독기 자주색 (독충 언데드)
        };
        this.setTint(undeadTints[this.soldierType] || 0x334455);
        this.setAlpha(0.82);

        // Stats based on boss type, scaled with player attack
        const playerAttack = scene.player ? scene.player.stats.attack : 24;
        const typeStats = {
            melee:  { damageMult: 1.4, speedRatio: 1.0, range: 130, attackCD: 250 },
            tank:   { damageMult: 1.0, speedRatio: 0.8, range: 150, attackCD: 450 },
            ranged: { damageMult: 1.75, speedRatio: 0.85, range: 250, attackCD: 300 },
        };

        const stats = typeStats[this.soldierType] || typeStats.melee;
        this.damage = Math.floor(playerAttack * stats.damageMult);
        this.speedRatio = stats.speedRatio;
        this.speed = (scene.player ? scene.player.stats.speed : 160) * this.speedRatio;
        this.attackRange = stats.range;
        this.attackCooldown = stats.attackCD;
        this.attackTimer = 0;

        // Follow offset — wider patrol perimeter
        this.followAngle = Math.random() * Math.PI * 2;
        this.followDist = 120 + Math.random() * 60;

        // Shadow trail effect
        this.trailTimer = 0;

        // Shadow glow filter - undead aura per type
        const undeadGlows = {
            melee:  0x4466aa,  // 유령 기사: 냉기 파란 광채
            tank:   0x55aa33,  // 썩은 좀비: 부패 녹색 광채
            ranged: 0x9933aa,  // 독충 언데드: 독기 보라 광채
        };
        this._glowColor = undeadGlows[this.soldierType] || 0x4466aa;
        try {
            this.enableFilters();
            this._glowFilter = this.filters.internal.addGlow(this._glowColor, 4, 0, 1, false, 8, 8);
        } catch (e) {
            try { this.disableFilters(); } catch (_) {}
        }

        // Name tag
        this.nameTag = scene.add.text(x, y - config.size - 10, config.name, {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: COLORS.TEXT_PURPLE,
            stroke: '#000000',
            strokeThickness: 1,
        }).setOrigin(0.5).setDepth(9);
    }

    update(time, delta, player, enemies) {
        if (!this.active || !player) return;

        // Update damage and speed with current player stats
        const playerAttack = player.stats.attack * (1 + (player._tempAtkBuff || 0));
        const multMap = { melee: 1.4, tank: 1.0, ranged: 1.75 };
        this.damage = Math.floor(playerAttack * (multMap[this.soldierType] || 1.4));
        this.speed = player.stats.speed * this.speedRatio;

        // Guard mode: find enemy closest to SOLDIER within guard radius of player
        // Each soldier targets its own closest enemy → natural aggro distribution
        const guardRadius = 400;
        const leashDist = 350;
        let target = null;
        let bestDistToSelf = Infinity;

        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const distToPlayer = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
            if (distToPlayer > guardRadius) continue;
            const distToSelf = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
            if (distToSelf < bestDistToSelf) {
                bestDistToSelf = distToSelf;
                target = enemy;
            }
        }

        const distFromPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

        if (distFromPlayer > leashDist) {
            // Too far from player - return to orbit
            const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
            this.body.setVelocity(
                Math.cos(angle) * this.speed * 1.4,
                Math.sin(angle) * this.speed * 1.4
            );
        } else if (target) {
            // Intercept enemy approaching player
            const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);

            // Always tick attack cooldown when we have a target
            this.attackTimer -= delta;

            // Move toward target (keep chasing even in attack range)
            if (distToTarget > this.attackRange * 0.4) {
                const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
                const chaseSpeed = distToTarget > this.attackRange ? 1.2 : 0.7;
                this.body.setVelocity(
                    Math.cos(angle) * this.speed * chaseSpeed,
                    Math.sin(angle) * this.speed * chaseSpeed
                );
            } else {
                this.body.setVelocity(0, 0);
            }

            // Attack when in range and cooldown ready
            if (distToTarget <= this.attackRange && this.attackTimer <= 0) {
                this.attackTimer = this.attackCooldown;
                this._attack(target);
            }
        } else {
            // No threat - orbit around player
            this.followAngle += delta * 0.001;
            const targetX = player.x + Math.cos(this.followAngle) * this.followDist;
            const targetY = player.y + Math.sin(this.followAngle) * this.followDist;

            const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
            const dist = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);

            if (dist > 10) {
                this.body.setVelocity(
                    Math.cos(angle) * this.speed,
                    Math.sin(angle) * this.speed
                );
            } else {
                this.body.setVelocity(0, 0);
            }
        }

        // Face direction
        if (this.body.velocity.x !== 0) {
            this.setFlipX(this.body.velocity.x < 0);
        }

        // Update name tag
        const config = BOSS_TYPES[this.bossKey];
        this.nameTag.setPosition(this.x, this.y - (config ? config.size : 40) - 10);

        // Shadow trail
        this.trailTimer += delta;
        if (this.trailTimer > 500) {
            this.trailTimer = 0;
            this._spawnTrail();
        }
    }

    _attack(target) {
        switch (this.bossKey) {
            case 'igris': this._igrisAttack(target); break;
            case 'tusk':  this._tuskAttack(target); break;
            case 'beru':  this._beruAttack(target); break;
            default:      this._meleeAttack(target); break;
        }
    }

    // Igris: fast melee slash (shadow version)
    _igrisAttack(target) {
        target.takeDamage(this.damage, this.x, this.y);

        const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        const slash = this.scene.add.sprite(target.x, target.y, 'proj_igris')
            .setDepth(8).setRotation(angle).setScale(1.5).setTint(COLORS.SHADOW_PRIMARY);
        this.scene.tweens.add({
            targets: slash,
            alpha: 0, scaleX: 2.5, scaleY: 2.5,
            duration: 250,
            onComplete: () => slash.destroy(),
        });
    }

    // Tusk: ground slam AoE (shadow version)
    _tuskAttack(target) {
        // Slam at target position, hits all nearby enemies
        const radius = 120;
        const slam = this.scene.add.circle(target.x, target.y, radius, COLORS.SHADOW_PRIMARY, 0.3)
            .setDepth(8);
        this.scene.tweens.add({
            targets: slam,
            alpha: 0, scale: 1.5,
            duration: 400,
            onComplete: () => slam.destroy(),
        });

        // Damage all enemies in range
        const enemies = [
            ...(this.scene.enemyManager?.getActiveEnemies() || []),
            ...(this.scene.activeBosses?.filter(b => b.active) || []),
        ];
        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(target.x, target.y, enemy.x, enemy.y);
            if (dist < radius) {
                enemy.takeDamage(Math.floor(this.damage * 0.85), target.x, target.y);
            }
        }
    }

    // Beru: ranged acid spit (shadow version) — piercing projectile
    _beruAttack(target) {
        const proj = this.scene.add.sprite(this.x, this.y, 'proj_beru')
            .setDepth(8).setTint(COLORS.SHADOW_PRIMARY).setScale(1.3);
        const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);

        const travelDist = this.attackRange * 1.6;
        const endX = this.x + Math.cos(angle) * travelDist;
        const endY = this.y + Math.sin(angle) * travelDist;
        const duration = 450;
        const dmg = this.damage;

        const pierced = new Set();
        let prevX = this.x;
        let prevY = this.y;

        this.scene.tweens.add({
            targets: proj,
            x: endX,
            y: endY,
            rotation: angle + Math.PI * 4,
            duration,
            ease: 'Linear',
            onUpdate: () => {
                if (!proj.active) return;
                const enemies = [
                    ...(this.scene.enemyManager?.getActiveEnemies() || []),
                    ...(this.scene.activeBosses?.filter(b => b.active) || []),
                ];
                for (const enemy of enemies) {
                    if (!enemy || !enemy.active) continue;
                    if (enemy.isBoss && enemy.isInvincible) continue;
                    const key = enemy.spawnInstanceId
                        ? `${enemy.isBoss ? 'boss' : 'enemy'}-${enemy.spawnInstanceId}`
                        : enemy;
                    if (pierced.has(key)) continue;

                    const hitRadius = Math.max(25, (enemy.body?.width || enemy.displayWidth || 50) * 0.35);
                    const dx = proj.x - prevX;
                    const dy = proj.y - prevY;
                    const segLenSq = dx * dx + dy * dy;
                    let closestX = proj.x, closestY = proj.y;
                    if (segLenSq > 0) {
                        const t = Phaser.Math.Clamp(
                            ((enemy.x - prevX) * dx + (enemy.y - prevY) * dy) / segLenSq,
                            0, 1
                        );
                        closestX = prevX + dx * t;
                        closestY = prevY + dy * t;
                    }
                    const dist = Phaser.Math.Distance.Between(closestX, closestY, enemy.x, enemy.y);
                    if (dist < hitRadius) {
                        pierced.add(key);
                        if (enemy.isBoss) {
                            enemy.takeDamage(dmg);
                        } else {
                            enemy.takeDamage(dmg, proj.x, proj.y);
                        }
                    }
                }
                prevX = proj.x;
                prevY = proj.y;
            },
            onComplete: () => proj.destroy(),
        });
    }

    // Fallback melee
    _meleeAttack(target) {
        target.takeDamage(this.damage, this.x, this.y);
        const slash = this.scene.add.circle(target.x, target.y, 15, COLORS.SHADOW_PRIMARY, 0.5)
            .setDepth(8);
        this.scene.tweens.add({
            targets: slash,
            alpha: 0, scale: 2,
            duration: 200,
            onComplete: () => slash.destroy(),
        });
    }

    _spawnTrail() {
        const trail = this.scene.add.circle(this.x, this.y + 5, 6, this._glowColor || COLORS.SHADOW_PRIMARY, 0.25)
            .setDepth(2);
        this.scene.tweens.add({
            targets: trail,
            alpha: 0,
            scale: 0.3,
            duration: 500,
            onComplete: () => trail.destroy(),
        });
    }

    destroy(fromScene) {
        if (this.nameTag) this.nameTag.destroy();
        super.destroy(fromScene);
    }
}
