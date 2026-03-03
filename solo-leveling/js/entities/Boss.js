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
        this._difficultyMult = difficultyMult;
        this.maxHp = Math.floor(config.hp * difficultyMult);
        this.hp = this.maxHp;
        this.attack = Math.floor(config.attack * difficultyMult);
        this.defense = Math.floor((config.defense || 0) * (1 + (difficultyMult - 1) * 0.4));
        this.speed = config.speed * (1 + (difficultyMult - 1) * 0.3);
        this.xpValue = Math.floor(config.xp * (1 + (difficultyMult - 1) * 0.3));

        // Set body size
        this.body.setSize(config.size * 1.4, config.size * 1.4);
        this.setDisplaySize(config.size * 2, config.size * 2);

        // State
        this.attackCooldown = 0;
        this.specialTimer = 0;
        this.phase = 1; // Boss phases

        // Spawn invincibility (3s entrance animation protection)
        this.isInvincible = true;
        scene.time.delayedCall(3000, () => { this.isInvincible = false; });

        // Frame-based hit cooldown (prevents ALL multi-hit in same frame)
        this._lastHitFrame = -999;
        this._damageThisSecond = 0;
        this._lastSecondReset = 0;

        // HP bar (Graphics-based for reliable rendering)
        this._hpBarWidth = Math.max(80, config.size * 1.5);
        this._hpBarHeight = 8;
        this.hpBarGfx = scene.add.graphics().setDepth(21);

        // HP text
        this.hpText = scene.add.text(x, y - config.size - 10, '', {
            fontSize: '11px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(22);

        // Name plate
        this.nameText = scene.add.text(x, y - config.size - 26, config.name, {
            fontSize: '14px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: COLORS.TEXT_RED,
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(20);

        console.log(`[BOSS] ${config.name} spawned: HP=${this.maxHp}, diffMult=${difficultyMult}`);

        // Glow filter for boss
        try {
            this.enableFilters();
            this._glowFilter = this.filters.internal.addGlow(config.color, 5, 0, 1, false, 8, 10);
        } catch (e) { /* filters not available */ }

        // Entrance effect
        this._entranceEffect();
    }

    _entranceEffect() {
        this.scene.cameras.main.shake(500, 0.015);

        // Warning text
        const cam = this.scene.cameras.main;
        const warning = this.scene.add.text(
            cam.width / 2, cam.height * 0.26,
            `⚔ BOSS: ${this.config.name} ⚔`,
            { fontSize: '32px', fontFamily: 'Arial', fontStyle: 'bold', color: '#ff3333', stroke: '#000000', strokeThickness: 4 }
        ).setOrigin(0.5).setDepth(100).setScrollFactor(0);

        this.scene.tweens.add({
            targets: warning, alpha: 0, scaleX: 1.5, scaleY: 1.5,
            duration: 2000, onComplete: () => warning.destroy(),
        });

        // Glow ring (original)
        const ring = this.scene.add.circle(this.x, this.y, 10, this.config.color, 0.5).setDepth(3);
        this.scene.tweens.add({
            targets: ring, scaleX: 8, scaleY: 8, alpha: 0,
            duration: 1000, onComplete: () => ring.destroy(),
        });

        // Particle burst — dramatic entrance
        try {
            const burstEmitter = this.scene.add.particles(this.x, this.y, 'particle_glow', {
                speed: { min: 30, max: 120 },
                scale: { start: 1.2, end: 0 },
                alpha: { start: 0.8, end: 0 },
                lifespan: { min: 600, max: 1200 },
                angle: { min: 0, max: 360 },
                tint: [this.config.color, 0xff3333, 0xff6600],
                blendMode: 'ADD',
                emitting: false,
            });
            burstEmitter.setDepth(4);
            burstEmitter.explode(25);

            // Rising energy particles
            const riseEmitter = this.scene.add.particles(this.x, this.y, 'particle_spark', {
                speed: { min: 20, max: 80 },
                angle: { min: 250, max: 290 },
                scale: { start: 0.8, end: 0 },
                alpha: { start: 1, end: 0 },
                lifespan: { min: 800, max: 1500 },
                tint: [this.config.color, 0xffaa00],
                blendMode: 'ADD',
                frequency: 40,
                quantity: 2,
            });
            riseEmitter.setDepth(4);
            this.scene.time.delayedCall(1500, () => {
                riseEmitter.stop();
                this.scene.time.delayedCall(1600, () => riseEmitter.destroy());
            });

            // Ground smoke
            const smoke = this.scene.add.particles(this.x, this.y + 20, 'particle_smoke', {
                speed: { min: 15, max: 50 },
                angle: { min: 160, max: 380 },
                scale: { start: 1.5, end: 0.3 },
                alpha: { start: 0.4, end: 0 },
                lifespan: { min: 600, max: 1000 },
                tint: 0x220000,
                emitting: false,
            });
            smoke.setDepth(3);
            smoke.explode(12);

            this.scene.time.delayedCall(1300, () => { burstEmitter.destroy(); smoke.destroy(); });
        } catch (e) { /* particle fallback not needed — ring already shown */ }
    }

    update(time, delta, playerX, playerY) {
        if (!this.active) return;

        // Move toward player
        const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
        const dist = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);

        if (dist > 40) {
            this.body.setVelocity(
                Math.cos(angle) * this.speed,
                Math.sin(angle) * this.speed
            );
        } else {
            this.body.setVelocity(0, 0);
        }

        this.setFlipX(playerX < this.x);

        // Update HP bar
        this._drawHpBar();
        this.nameText.setPosition(this.x, this.y - this.config.size - 26);

        // Phase change at 50% HP
        if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
            this.phase = 2;
            this.speed *= 1.3;
            this.attack *= 1.2;
            this.setTint(0xff6666);
            this.scene.cameras.main.flash(200, 255, 50, 50);
            // Intensify glow in phase 2
            try {
                if (this._glowFilter) {
                    this._glowFilter.color = 0xff3333;
                    this._glowFilter.outerStrength = 8;
                }
            } catch (e) { /* silent */ }
        }

        // Special attack
        this.specialTimer += delta;
        const cooldown = this.phase === 2 ? 2500 : 4000;
        if (this.specialTimer >= cooldown) {
            this.specialTimer = 0;
            this._doSpecialAttack(playerX, playerY, dist);
        }
    }

    _drawHpBar() {
        if (!this.hpBarGfx) return;
        this.hpBarGfx.clear();

        const w = this._hpBarWidth;
        const h = this._hpBarHeight;
        const barX = this.x - w / 2;
        const barY = this.y - this.config.size - 14;
        const ratio = Math.max(0, this.hp / this.maxHp);

        // Background
        this.hpBarGfx.fillStyle(0x000000, 0.6);
        this.hpBarGfx.fillRect(barX - 1, barY - 1, w + 2, h + 2);

        // Fill color based on HP ratio
        let fillColor = 0xff0000;
        if (ratio > 0.6) fillColor = 0xff3333;
        else if (ratio > 0.3) fillColor = 0xff6600;
        else fillColor = 0xff0000;

        this.hpBarGfx.fillStyle(fillColor, 1);
        this.hpBarGfx.fillRect(barX, barY, w * ratio, h);

        // Border
        this.hpBarGfx.lineStyle(1, 0xffffff, 0.4);
        this.hpBarGfx.strokeRect(barX - 1, barY - 1, w + 2, h + 2);

        // HP text
        if (this.hpText) {
            const percent = Math.max(0, Math.ceil(ratio * 100));
            this.hpText.setText(`${this.hp} / ${this.maxHp}  (${percent}%)`);
            this.hpText.setPosition(this.x, barY + h / 2);
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
        const range = 250;
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
        const radius = 200;

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

            const speed = 280;
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

    takeDamage(amount) {
        if (!this.active) return false;

        // Spawn invincibility
        if (this.isInvincible) return false;

        // Frame-based cooldown: only 1 hit per 3 frames (~50ms at 60fps)
        const currentFrame = this.scene.game.loop.frame;
        if (currentFrame - this._lastHitFrame < 3) return false;
        this._lastHitFrame = currentFrame;

        // Dynamic per-second damage cap: tighter as difficulty increases
        // Ensures TTK increases progressively over time
        const now = this.scene.time.now;
        if (now - this._lastSecondReset > 1000) {
            this._damageThisSecond = 0;
            this._lastSecondReset = now;
        }
        const capPercent = Math.max(0.04, 0.20 / Math.sqrt(this._difficultyMult));
        const maxDmgPerSecond = Math.floor(this.maxHp * capPercent);
        if (this._damageThisSecond >= maxDmgPerSecond) return false;

        // Scaled defense reduces damage (minimum 1)
        amount = Math.max(1, amount - this.defense);

        this._damageThisSecond += amount;
        this.hp -= amount;

        console.log(`[BOSS HIT] ${this.config.name}: -${amount} HP (${this.hp}/${this.maxHp})`);

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
        if (this.hpBarGfx) { this.hpBarGfx.destroy(); this.hpBarGfx = null; }
        if (this.hpText) { this.hpText.destroy(); this.hpText = null; }
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

        // === Boss Kill Rewards ===
        const player = this.scene.player;
        if (player) {
            // HP restore (30% of max HP)
            const healAmount = Math.floor(player.stats.maxHp * 0.3);
            player.heal(healAmount);

            // Temporary attack buff (20% for 15 seconds, additive)
            const buffAmount = Math.floor(player.stats.attack * 0.2);
            player.stats.attack += buffAmount;
            player._attackBuffs = (player._attackBuffs || 0) + buffAmount;
            this.scene.time.delayedCall(15000, () => {
                if (player && !player.isDead) {
                    player.stats.attack = Math.max(1, player.stats.attack - buffAmount);
                    player._attackBuffs = Math.max(0, (player._attackBuffs || 0) - buffAmount);
                }
            });

            // Reward system message
            if (this.scene.systemMessage) {
                this.scene.systemMessage.show('[보스 처치 보상]', [
                    `HP +${healAmount} 회복`,
                    '공격력 20% 증가 (15초)',
                    `경험치 +${this.xpValue} 획득`,
                ], { duration: 3000, type: 'levelup' });
            }
        }

        // Sound
        if (this.scene.soundManager) {
            this.scene.soundManager.play('kill');
        }

        // Trigger shadow extraction
        if (this.scene.shadowArmyManager) {
            this.scene.shadowArmyManager.onBossKilled(this);
        }

        // Death explosion — enhanced with particle emitters
        try {
            // Main explosion burst
            const explosion = this.scene.add.particles(this.x, this.y, 'particle_glow', {
                speed: { min: 60, max: 250 },
                scale: { start: 1.5, end: 0 },
                alpha: { start: 1, end: 0 },
                lifespan: { min: 400, max: 900 },
                tint: [this.config.color, 0xff4444, 0xff8800, 0xffdd00],
                blendMode: 'ADD',
                emitting: false,
            });
            explosion.setDepth(15);
            explosion.explode(30);

            // Sparks shower
            const sparks = this.scene.add.particles(this.x, this.y, 'particle_spark', {
                speed: { min: 80, max: 300 },
                scale: { start: 1, end: 0 },
                alpha: { start: 1, end: 0 },
                lifespan: { min: 300, max: 700 },
                tint: [0xffffff, 0xffdd00, this.config.color],
                blendMode: 'ADD',
                emitting: false,
            });
            sparks.setDepth(16);
            sparks.explode(20);

            // Smoke cloud
            const smoke = this.scene.add.particles(this.x, this.y, 'particle_smoke', {
                speed: { min: 20, max: 60 },
                scale: { start: 2, end: 0.5 },
                alpha: { start: 0.5, end: 0 },
                lifespan: { min: 600, max: 1200 },
                tint: [0x333333, 0x1a0033],
                emitting: false,
            });
            smoke.setDepth(14);
            smoke.explode(15);

            // Shockwave ring
            const ring = this.scene.add.particles(this.x, this.y, 'particle_ring', {
                speed: { min: 150, max: 250 },
                scale: { start: 0.5, end: 2.5 },
                alpha: { start: 0.8, end: 0 },
                lifespan: 500,
                tint: this.config.color,
                blendMode: 'ADD',
                emitting: false,
            });
            ring.setDepth(15);
            ring.explode(6);

            this.scene.time.delayedCall(1300, () => {
                explosion.destroy(); sparks.destroy(); smoke.destroy(); ring.destroy();
            });
        } catch (e) {
            // Fallback
            for (let i = 0; i < 15; i++) {
                const p = this.scene.add.circle(
                    this.x + Phaser.Math.Between(-20, 20), this.y + Phaser.Math.Between(-20, 20),
                    Phaser.Math.Between(3, 8), this.config.color, 0.8
                ).setDepth(15);
                this.scene.tweens.add({
                    targets: p, alpha: 0, scale: 0,
                    x: p.x + Phaser.Math.Between(-60, 60), y: p.y + Phaser.Math.Between(-60, 60),
                    duration: 600, onComplete: () => p.destroy(),
                });
            }
        }

        this.scene.cameras.main.shake(400, 0.02);
        this.scene.cameras.main.flash(200, 255, 100, 50);

        this.destroy();
    }
}
