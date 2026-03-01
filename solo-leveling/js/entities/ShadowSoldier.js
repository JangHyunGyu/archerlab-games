import { COLORS } from '../utils/Constants.js';

export class ShadowSoldier extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, soldierType, bossName) {
        super(scene, x, y, 'shadow_' + soldierType);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setDepth(9);
        this.soldierType = soldierType;
        this.bossName = bossName;

        // Stats based on type
        const typeStats = {
            melee:  { damage: 15, speed: 130, range: 40, attackCD: 800 },
            tank:   { damage: 10, speed: 90,  range: 50, attackCD: 1200 },
            ranged: { damage: 20, speed: 100, range: 200, attackCD: 1000 },
        };

        const stats = typeStats[soldierType] || typeStats.melee;
        this.damage = stats.damage;
        this.speed = stats.speed;
        this.attackRange = stats.range;
        this.attackCooldown = stats.attackCD;
        this.attackTimer = 0;

        // Follow offset
        this.followAngle = Math.random() * Math.PI * 2;
        this.followDist = 60 + Math.random() * 30;

        // Shadow trail effect
        this.trailTimer = 0;

        // Name tag
        this.nameTag = scene.add.text(x, y - 20, bossName, {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: COLORS.TEXT_PURPLE,
            stroke: '#000000',
            strokeThickness: 1,
        }).setOrigin(0.5).setDepth(9);
    }

    update(time, delta, player, enemies) {
        if (!this.active || !player) return;

        // Find nearest enemy
        let target = null;
        let targetDist = 999999;

        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
            if (dist < targetDist) {
                targetDist = dist;
                target = enemy;
            }
        }

        if (target && targetDist < 300) {
            // Attack mode
            if (targetDist > this.attackRange) {
                // Move toward enemy
                const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
                this.body.setVelocity(
                    Math.cos(angle) * this.speed * 1.2,
                    Math.sin(angle) * this.speed * 1.2
                );
            } else {
                this.body.setVelocity(0, 0);
                // Attack
                this.attackTimer -= delta;
                if (this.attackTimer <= 0) {
                    this.attackTimer = this.attackCooldown;
                    this._attack(target);
                }
            }
        } else {
            // Follow player
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
        this.nameTag.setPosition(this.x, this.y - 20);

        // Shadow trail
        this.trailTimer += delta;
        if (this.trailTimer > 200) {
            this.trailTimer = 0;
            this._spawnTrail();
        }
    }

    _attack(target) {
        if (this.soldierType === 'ranged') {
            // Shoot shadow projectile
            const proj = this.scene.add.sprite(this.x, this.y, 'proj_shadow').setDepth(8);
            const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);

            this.scene.tweens.add({
                targets: proj,
                x: target.x,
                y: target.y,
                duration: 300,
                onComplete: () => {
                    if (target.active) {
                        target.takeDamage(this.damage, this.x, this.y);
                    }
                    proj.destroy();
                },
            });
        } else {
            // Melee attack - slash effect
            target.takeDamage(this.damage, this.x, this.y);

            // Visual slash
            const slash = this.scene.add.circle(target.x, target.y, 15, COLORS.SHADOW_PRIMARY, 0.5)
                .setDepth(8);
            this.scene.tweens.add({
                targets: slash,
                alpha: 0,
                scale: 2,
                duration: 200,
                onComplete: () => slash.destroy(),
            });
        }
    }

    _spawnTrail() {
        const trail = this.scene.add.circle(this.x, this.y + 5, 4, COLORS.SHADOW_PRIMARY, 0.3)
            .setDepth(2);
        this.scene.tweens.add({
            targets: trail,
            alpha: 0,
            scale: 0.5,
            duration: 400,
            onComplete: () => trail.destroy(),
        });
    }

    destroy(fromScene) {
        if (this.nameTag) this.nameTag.destroy();
        super.destroy(fromScene);
    }
}
