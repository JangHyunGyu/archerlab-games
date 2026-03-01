import { COLORS, BOSS_TYPES } from '../utils/Constants.js';

export class Boss extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, bossKey, difficultyMult = 1) {
        const config = BOSS_TYPES[bossKey];
        super(scene, x, y, 'boss_' + bossKey);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setDepth(6);
        this.bossKey = bossKey;
        this.config = config;
        this.isBoss = true;

        // Stats scaled by difficulty
        this.maxHp = Math.floor(config.hp * difficultyMult);
        this.hp = this.maxHp;
        this.attack = Math.floor(config.attack * difficultyMult);
        this.speed = config.speed * (1 + (difficultyMult - 1) * 0.3);
        this.xpValue = Math.floor(config.xp * (1 + (difficultyMult - 1) * 0.3));

        // Set body size
        this.body.setSize(config.size * 1.4, config.size * 1.4);
        this.setDisplaySize(config.size * 2, config.size * 2);

        // State
        this.attackCooldown = 0;
        this.specialTimer = 0;
        this.phase = 1; // Boss phases

        // HP bar
        this.hpBarBg = scene.add.rectangle(x, y - config.size - 10, 60, 6, 0x333333)
            .setDepth(20);
        this.hpBarFill = scene.add.rectangle(x, y - config.size - 10, 60, 6, 0xff0000)
            .setDepth(21)
            .setOrigin(0, 0.5);

        // Name plate
        this.nameText = scene.add.text(x, y - config.size - 22, config.name, {
            fontSize: '14px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: COLORS.TEXT_RED,
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(20);

        // Entrance effect
        this._entranceEffect();
    }

    _entranceEffect() {
        this.scene.cameras.main.shake(500, 0.01);

        // Warning text
        const warning = this.scene.add.text(
            this.scene.cameras.main.scrollX + 512,
            this.scene.cameras.main.scrollY + 200,
            `⚔ BOSS: ${this.config.name} ⚔`,
            {
                fontSize: '32px',
                fontFamily: 'Arial',
                fontStyle: 'bold',
                color: '#ff3333',
                stroke: '#000000',
                strokeThickness: 4,
            }
        ).setOrigin(0.5).setDepth(100).setScrollFactor(0);

        this.scene.tweens.add({
            targets: warning,
            alpha: 0,
            scaleX: 1.5,
            scaleY: 1.5,
            duration: 2000,
            onComplete: () => warning.destroy(),
        });

        // Glow ring
        const ring = this.scene.add.circle(this.x, this.y, 10, this.config.color, 0.5)
            .setDepth(3);
        this.scene.tweens.add({
            targets: ring,
            scaleX: 8,
            scaleY: 8,
            alpha: 0,
            duration: 1000,
            onComplete: () => ring.destroy(),
        });
    }

    update(time, delta, playerX, playerY) {
        if (!this.active) return;

        // Move toward player
        const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
        const dist = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);

        if (dist > 50) {
            this.body.setVelocity(
                Math.cos(angle) * this.speed,
                Math.sin(angle) * this.speed
            );
        } else {
            this.body.setVelocity(0, 0);
        }

        this.setFlipX(playerX < this.x);

        // Update HP bar position
        this.hpBarBg.setPosition(this.x, this.y - this.config.size - 10);
        this.hpBarFill.setPosition(this.x - 30, this.y - this.config.size - 10);
        this.hpBarFill.setDisplaySize(60 * (this.hp / this.maxHp), 6);
        this.nameText.setPosition(this.x, this.y - this.config.size - 22);

        // Phase change at 50% HP
        if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
            this.phase = 2;
            this.speed *= 1.3;
            this.attack *= 1.2;
            this.setTint(0xff6666);
            this.scene.cameras.main.flash(200, 255, 50, 50);
        }

        // Special attack
        this.specialTimer += delta;
        const cooldown = this.phase === 2 ? 2500 : 4000;
        if (this.specialTimer >= cooldown) {
            this.specialTimer = 0;
            this._doSpecialAttack(playerX, playerY, dist);
        }
    }

    _doSpecialAttack(playerX, playerY, dist) {
        switch (this.bossKey) {
            case 'igris': this._igrisSlash(playerX, playerY); break;
            case 'tusk':  this._tuskGroundSlam(playerX, playerY); break;
            case 'beru':  this._beruAcidSpit(playerX, playerY); break;
        }
    }

    // Igris: telegraphed sword slash - red warning zone then damage
    _igrisSlash(playerX, playerY) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
        const range = 150;
        const slashX = this.x + Math.cos(angle) * (range * 0.4);
        const slashY = this.y + Math.sin(angle) * (range * 0.4);

        // Warning indicator (red zone, 0.6s telegraph)
        const warning = this.scene.add.circle(slashX, slashY, range * 0.6, 0xff0000, 0.15)
            .setDepth(3);
        this.scene.tweens.add({
            targets: warning,
            alpha: 0.35,
            duration: 600,
            onComplete: () => {
                warning.destroy();
                if (!this.active) return;

                // Slash visual
                const slash = this.scene.add.sprite(slashX, slashY, 'proj_igris')
                    .setDepth(8).setRotation(angle).setScale(2.5);
                this.scene.tweens.add({
                    targets: slash,
                    alpha: 0, scaleX: 3.5, scaleY: 3.5,
                    duration: 300,
                    onComplete: () => slash.destroy(),
                });

                // Damage player if in cone
                const player = this.scene.player;
                if (!player) return;
                const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
                if (d < range) {
                    const pAngle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
                    const diff = Math.abs(Phaser.Math.Angle.Wrap(pAngle - angle));
                    if (diff < 1.0) {
                        player.takeDamage(this.attack);
                    }
                }

                this.scene.cameras.main.shake(100, 0.005);
            },
        });
    }

    // Tusk: ground slam - large AoE with warning circle
    _tuskGroundSlam(playerX, playerY) {
        const slamX = playerX;
        const slamY = playerY;
        const radius = 120;

        // Warning circle on player position (1s telegraph)
        const warning = this.scene.add.circle(slamX, slamY, radius, 0x8b5a2b, 0.12)
            .setDepth(3);
        const warningRing = this.scene.add.circle(slamX, slamY, radius, 0x000000, 0)
            .setDepth(3).setStrokeStyle(3, 0xff6633, 0.6);

        this.scene.tweens.add({
            targets: [warning, warningRing],
            alpha: { from: 0.1, to: 0.5 },
            duration: 1000,
            onComplete: () => {
                warning.destroy();
                warningRing.destroy();
                if (!this.active) return;

                // Slam visual
                const slam = this.scene.add.sprite(slamX, slamY, 'proj_tusk')
                    .setDepth(8).setScale(3);
                this.scene.tweens.add({
                    targets: slam,
                    alpha: 0, scaleX: 5, scaleY: 5,
                    duration: 400,
                    onComplete: () => slam.destroy(),
                });

                // Damage if player is still in area
                const player = this.scene.player;
                if (!player) return;
                const d = Phaser.Math.Distance.Between(slamX, slamY, player.x, player.y);
                if (d < radius) {
                    player.takeDamage(this.attack * 1.5);
                }

                this.scene.cameras.main.shake(300, 0.012);
            },
        });
    }

    // Beru: acid spit - 3 projectiles in spread, visible and dodgeable
    _beruAcidSpit(playerX, playerY) {
        const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
        const spreadCount = this.phase === 2 ? 5 : 3;
        const spreadAngle = 0.3;

        for (let i = 0; i < spreadCount; i++) {
            const offset = (i - (spreadCount - 1) / 2) * spreadAngle;
            const angle = baseAngle + offset;

            const proj = this.scene.add.sprite(this.x, this.y, 'proj_beru')
                .setDepth(8).setScale(1.5);
            this.scene.physics.add.existing(proj, false);
            proj.body.setAllowGravity(false);
            proj.body.setCircle(6);

            const speed = 160;
            proj.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

            // Collision with player (store collider to clean up)
            const player = this.scene.player;
            let collider = null;
            if (player) {
                collider = this.scene.physics.add.overlap(proj, player, () => {
                    if (!proj.active) return;
                    player.takeDamage(this.attack * 0.7);
                    if (collider) this.scene.physics.world.removeCollider(collider);
                    proj.destroy();
                });
            }

            // Trail particles
            this.scene.tweens.add({
                targets: proj,
                rotation: proj.rotation + Math.PI * 6,
                duration: 4000,
            });

            // Auto-destroy after 4s
            this.scene.time.delayedCall(4000, () => {
                if (proj && proj.active) {
                    if (collider) this.scene.physics.world.removeCollider(collider);
                    proj.destroy();
                }
            });
        }
    }

    takeDamage(amount, knockbackX, knockbackY) {
        if (!this.active) return false;

        this.hp -= amount;

        // Flash red on hit, then restore
        this.setTint(0xff0000);
        this.scene.time.delayedCall(80, () => {
            if (this.active) {
                this.setTint(this.phase === 2 ? 0xff6666 : 0xffffff);
            }
        });

        // Damage number
        const isCrit = amount > 30;
        const text = this.scene.add.text(
            this.x + Phaser.Math.Between(-15, 15),
            this.y - 20,
            isCrit ? amount + '!' : String(amount),
            {
                fontSize: isCrit ? '20px' : '16px',
                fontFamily: 'Arial',
                fontStyle: 'bold',
                color: isCrit ? COLORS.TEXT_GOLD : COLORS.TEXT_WHITE,
                stroke: '#000000',
                strokeThickness: 2,
            }
        ).setOrigin(0.5).setDepth(100);

        this.scene.tweens.add({
            targets: text,
            y: text.y - 40,
            alpha: 0,
            duration: 700,
            onComplete: () => text.destroy(),
        });

        if (this.hp <= 0) {
            this.die();
            return true;
        }
        return false;
    }

    die() {
        if (!this.active) return; // Prevent double die

        // Cleanup HP bar FIRST (before any effects that could throw)
        if (this.hpBarBg) { this.hpBarBg.destroy(); this.hpBarBg = null; }
        if (this.hpBarFill) { this.hpBarFill.destroy(); this.hpBarFill = null; }
        if (this.nameText) { this.nameText.destroy(); this.nameText = null; }

        // Drop lots of XP
        if (this.scene.xpOrbPool) {
            this.scene.xpOrbPool.spawn(this.x, this.y, this.xpValue);
        }

        // Item drop
        if (this.scene.itemDropManager) {
            this.scene.itemDropManager.tryDrop(this.x, this.y);
        }

        // Kill count
        if (this.scene.player) {
            this.scene.player.kills++;
        }

        // Sound
        if (this.scene.soundManager) {
            this.scene.soundManager.play('kill');
        }

        // Trigger shadow extraction
        if (this.scene.shadowArmyManager) {
            this.scene.shadowArmyManager.onBossKilled(this);
        }

        // Death explosion
        for (let i = 0; i < 15; i++) {
            const p = this.scene.add.circle(
                this.x + Phaser.Math.Between(-20, 20),
                this.y + Phaser.Math.Between(-20, 20),
                Phaser.Math.Between(3, 8),
                this.config.color,
                0.8
            ).setDepth(15);

            this.scene.tweens.add({
                targets: p,
                alpha: 0,
                scale: 0,
                x: p.x + Phaser.Math.Between(-60, 60),
                y: p.y + Phaser.Math.Between(-60, 60),
                duration: 600,
                onComplete: () => p.destroy(),
            });
        }

        this.scene.cameras.main.shake(300, 0.015);

        this.destroy();
    }
}
