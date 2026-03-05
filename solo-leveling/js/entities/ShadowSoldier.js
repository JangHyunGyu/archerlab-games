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

        // Shadow appearance - dark purple tint
        this.setTint(0x6622aa);
        this.setAlpha(0.85);

        // Stats based on boss type, scaled with player attack
        const playerAttack = scene.player ? scene.player.stats.attack : 24;
        const typeStats = {
            melee:  { damageMult: 5.0, speedRatio: 0.9, range: 130, attackCD: 600 },
            tank:   { damageMult: 3.5, speedRatio: 0.7, range: 150, attackCD: 900 },
            ranged: { damageMult: 8.0, speedRatio: 0.75, range: 250, attackCD: 800 },
        };

        const stats = typeStats[this.soldierType] || typeStats.melee;
        const playerLevel = scene.player ? scene.player.level : 1;
        const levelMult = 1 + (playerLevel - 1) * 0.08;
        this.damage = Math.floor(playerAttack * stats.damageMult * levelMult);
        this.speedRatio = stats.speedRatio;
        this.speed = (scene.player ? scene.player.stats.speed : 160) * this.speedRatio;
        this.attackRange = stats.range;
        this.attackCooldown = stats.attackCD;
        this.attackTimer = 0;

        // Follow offset
        this.followAngle = Math.random() * Math.PI * 2;
        this.followDist = 120 + Math.random() * 60;

        // Shadow trail effect
        this.trailTimer = 0;

        // Shadow glow filter (rollback pipeline on failure to prevent GPU stall)
        try {
            this.enableFilters();
            this._glowFilter = this.filters.internal.addGlow(COLORS.SHADOW_PRIMARY, 4, 0, 1, false, 8, 8);
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
        const playerAttack = player.stats.attack;
        const levelMult = 1 + (player.level - 1) * 0.08;
        const multMap = { melee: 5.0, tank: 3.5, ranged: 8.0 };
        this.damage = Math.floor(playerAttack * (multMap[this.soldierType] || 3.0) * levelMult);
        this.speed = player.stats.speed * this.speedRatio;

        // Guard mode: find enemy closest to PLAYER within guard radius
        const guardRadius = 400;
        const leashDist = 450;
        let target = null;
        let targetDistToPlayer = guardRadius;

        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const distToPlayer = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
            if (distToPlayer < targetDistToPlayer) {
                targetDistToPlayer = distToPlayer;
                target = enemy;
            }
        }

        const distFromPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

        if (distFromPlayer > leashDist) {
            // Too far from player - return to orbit
            const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
            this.body.setVelocity(
                Math.cos(angle) * this.speed * 1.5,
                Math.sin(angle) * this.speed * 1.5
            );
        } else if (target) {
            // Intercept enemy approaching player
            const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);

            // Always tick attack cooldown when we have a target
            this.attackTimer -= delta;

            // Move toward target (keep chasing even in attack range)
            if (distToTarget > this.attackRange * 0.5) {
                const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
                const chaseSpeed = distToTarget > this.attackRange ? 1.2 : 0.6;
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
                enemy.takeDamage(Math.floor(this.damage * 0.7), target.x, target.y);
            }
        }
    }

    // Beru: ranged acid spit (shadow version)
    _beruAttack(target) {
        const proj = this.scene.add.sprite(this.x, this.y, 'proj_beru')
            .setDepth(8).setTint(COLORS.SHADOW_PRIMARY).setScale(1.3);
        const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);

        this.scene.tweens.add({
            targets: proj,
            x: target.x,
            y: target.y,
            rotation: angle + Math.PI * 4,
            duration: 350,
            onComplete: () => {
                if (target.active) {
                    target.takeDamage(this.damage, this.x, this.y);
                }
                proj.destroy();
            },
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
        const trail = this.scene.add.circle(this.x, this.y + 5, 6, COLORS.SHADOW_PRIMARY, 0.25)
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
