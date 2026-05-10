import { COLORS, BOSS_TYPES } from '../utils/Constants.js';

export class Boss extends Phaser.Physics.Arcade.Sprite {
    static _sceneIsActive(scene) {
        try {
            return !!scene && scene.scene?.isActive?.() !== false && scene.sys?.isActive?.() !== false;
        } catch (e) {
            return false;
        }
    }

    static _destroyIfAlive(obj) {
        try {
            if (obj?.scene && obj.destroy) obj.destroy();
        } catch (e) {
            // Object may already be gone during scene shutdown.
        }
    }

    static _addImageVfx(scene, textureKey, x, y, opts = {}) {
        if (!scene?.textures?.exists(textureKey)) return null;

        const {
            depth = 8,
            alpha = 1,
            scale = 1,
            scaleX = scale,
            scaleY = scale,
            rotation = 0,
            blendMode = Phaser.BlendModes.ADD,
            origin = 0.5,
        } = opts;

        try {
            return scene.add.image(x, y, textureKey)
                .setOrigin(origin)
                .setDepth(depth)
                .setAlpha(alpha)
                .setScale(scaleX, scaleY)
                .setRotation(rotation)
                .setBlendMode(blendMode);
        } catch (e) {
            return null;
        }
    }

    static _addBossVfx(scene, key, x, y, opts = {}) {
        return Boss._addImageVfx(scene, `boss_vfx_${key}`, x, y, opts);
    }

    static _tweenDestroy(scene, target, config) {
        if (!target?.scene) return;
        scene.tweens.add({
            targets: target,
            ...config,
            onComplete: () => Boss._destroyIfAlive(target),
        });
    }

    static _playFrameVfx(scene, prefix, x, y, opts = {}) {
        if (!scene?.textures?.exists(`${prefix}_0`)) return false;

        const {
            scale = 1,
            rotation = 0,
            depth = 8,
            frameMs = 55,
            alpha = 1,
            blendMode = Phaser.BlendModes.ADD,
        } = opts;

        try {
            const sprite = scene.add.sprite(x, y, `${prefix}_0`)
                .setOrigin(0.5)
                .setDepth(depth)
                .setAlpha(alpha)
                .setScale(scale)
                .setRotation(rotation)
                .setBlendMode(blendMode);

            let frame = 0;
            const timer = scene.time.addEvent({
                delay: frameMs,
                repeat: 5,
                callback: () => {
                    frame += 1;
                    if (!sprite.scene || frame > 5) {
                        if (sprite.scene) sprite.destroy();
                        return;
                    }
                    sprite.setTexture(`${prefix}_${frame}`);
                    if (frame >= 5) {
                        scene.tweens.add({
                            targets: sprite,
                            alpha: 0,
                            duration: frameMs,
                            onComplete: () => sprite.destroy(),
                        });
                    }
                },
            });
            sprite.once('destroy', () => timer.destroy());
            return true;
        } catch (e) {
            return false;
        }
    }

    static _animateFrameSprite(scene, sprite, prefix, frameMs = 60) {
        if (!scene?.textures?.exists(`${prefix}_0`) || !sprite?.scene) return null;

        let frame = 0;
        return scene.time.addEvent({
            delay: frameMs,
            loop: true,
            callback: () => {
                if (!sprite.scene) return;
                frame = (frame + 1) % 6;
                sprite.setTexture(`${prefix}_${frame}`);
            },
        });
    }

    static _spawnDeathFragments(scene, x, y, scale = 1, palette = [0x13091f, 0x66112c, 0xffbf55]) {
        if (!scene?.add) return;
        const count = Math.round(24 * scale);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 85 + Math.random() * 260 * scale;
            const fragment = scene.add.rectangle(
                x + Math.cos(angle) * 8,
                y + Math.sin(angle) * 8,
                3 + Math.random() * 8 * scale,
                2 + Math.random() * 6 * scale,
                palette[Math.floor(Math.random() * palette.length)],
                0.92
            )
                .setDepth(21)
                .setRotation(Math.random() * Math.PI)
                .setBlendMode(Phaser.BlendModes.ADD);

            scene.tweens.add({
                targets: fragment,
                x: x + Math.cos(angle) * speed,
                y: y + Math.sin(angle) * speed + Phaser.Math.FloatBetween(-24, 22),
                rotation: fragment.rotation + Phaser.Math.FloatBetween(-3.2, 3.2),
                alpha: 0,
                scale: 0.18,
                duration: 520 + Math.random() * 430,
                ease: 'Cubic.easeOut',
                onComplete: () => Boss._destroyIfAlive(fragment),
            });
        }
    }

    static _getDeathTheme(bossKey) {
        const themes = {
            igris: {
                prefix: 'effect_boss_death_igris',
                flashColor: 0xfff0d8,
                sparkTints: [0xffffff, 0xffcc66, 0xff3344, 0x8d35ff],
                fragmentPalette: [0x12081c, 0x3a0a22, 0x9b1028, 0xffc45a],
                ringTint: 0xff3344,
                burstScale: 1.03,
                frameMs: 68,
                ariseDelay: 980,
                cameraShake: 0.03,
            },
            tusk: {
                prefix: 'effect_boss_death_tusk',
                flashColor: 0xffe1a8,
                sparkTints: [0xffffff, 0xffd56a, 0xba7a28, 0x7a4d22],
                fragmentPalette: [0x2f2418, 0x6b4b2a, 0xb98237, 0xffd47a],
                ringTint: 0xd89438,
                burstScale: 1.1,
                frameMs: 78,
                ariseDelay: 1080,
                cameraShake: 0.034,
            },
            beru: {
                prefix: 'effect_boss_death_beru',
                flashColor: 0xdfff8e,
                sparkTints: [0xeeff99, 0x72ff44, 0x31c66b, 0x9a48ff],
                fragmentPalette: [0x12071c, 0x23320d, 0x49b83e, 0x8b37ff],
                ringTint: 0x65ff5a,
                burstScale: 0.98,
                frameMs: 62,
                ariseDelay: 920,
                cameraShake: 0.026,
            },
        };
        return themes[bossKey] || {
            prefix: 'effect_boss_death_burst',
            flashColor: 0xffffff,
            sparkTints: [0xffffff, 0xffd15c, 0xff3355, 0x8d35ff],
            fragmentPalette: [0x13091f, 0x66112c, 0xffbf55],
            ringTint: 0xff3355,
            burstScale: 1,
            frameMs: 72,
            ariseDelay: 960,
            cameraShake: 0.028,
        };
    }

    constructor(scene, x, y, bossKey, difficultyMult = 1, hp = null, atkMult = 1) {
        const config = BOSS_TYPES[bossKey];
        super(scene, x, y, 'boss_' + bossKey + '_0');

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setDepth(6);
        this.bossKey = bossKey;
        this.config = config;
        this.isBoss = true;
        Boss._nextSpawnInstanceId = (Boss._nextSpawnInstanceId || 0) + 1;
        this.spawnInstanceId = Boss._nextSpawnInstanceId;

        // Stats scaled by difficulty
        this._difficultyMult = difficultyMult;
        const baseHp = hp || config.hp;
        this.maxHp = Math.floor(baseHp * difficultyMult);
        this.hp = this.maxHp;
        this.attack = Math.floor(config.attack * difficultyMult * atkMult);
        this.speed = config.speed * (1 + (difficultyMult - 1) * 0.3);
        this.xpValue = Math.floor(config.xp * (1 + (difficultyMult - 1) * 0.3));

        // Set body size
        this.body.setSize(config.size * 1.4, config.size * 1.4);
        this.setDisplaySize(config.size * 2, config.size * 2);

        // State
        this.attackCooldown = 0;
        this.specialTimer = 0;
        this.phase = 1; // Boss phases

        // Idle animation (4 frames)
        this.animFrame = 0;
        this.animTimer = 0;

        this.isInvincible = false;


        // HP bar (Graphics-based for reliable rendering)
        this._hpBarWidth = Math.max(80, config.size * 1.5);
        this._hpBarHeight = 8;
        this._lastDrawnHp = -1; // Cache to avoid redrawing every frame
        this._lastDrawnX = -1;
        this._lastDrawnY = -1;
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

        // console.log(`[BOSS] ${config.name} spawned: HP=${this.maxHp}, baseHp=${baseHp}, diffMult=${difficultyMult}`);

        // Glow filter for boss (rollback pipeline on failure to prevent GPU stall)
        try {
            this.enableFilters();
            this._glowFilter = this.filters.internal.addGlow(config.color, 5, 0, 1, false, 8, 10);
        } catch (e) {
            try { this.disableFilters(); } catch (_) {}
        }

        // Entrance effect
        this._entranceEffect();
    }

    _entranceEffect() {
        const scene = this.scene;
        if (!Boss._sceneIsActive(scene)) return;

        scene.cameras.main.shake(500, 0.015);

        // Warning text
        const cam = scene.cameras.main;
        const warning = scene.add.text(
            cam.width / 2, cam.height * 0.26,
            `⚔ BOSS: ${this.config.name} ⚔`,
            { fontSize: '32px', fontFamily: 'Arial', fontStyle: 'bold', color: '#ff3333', stroke: '#000000', strokeThickness: 4 }
        ).setOrigin(0.5).setDepth(100).setScrollFactor(0);

        scene.tweens.add({
            targets: warning, alpha: 0, scaleX: 1.5, scaleY: 1.5,
            duration: 2000, onComplete: () => Boss._destroyIfAlive(warning),
        });

        const auraScale = Math.max(0.72, this.config.size / 120);
        const chargeAura = Boss._addBossVfx(scene, 'charge_aura', this.x, this.y + 10, {
            depth: 3,
            alpha: 0.78,
            scale: auraScale,
        });
        if (chargeAura) {
            Boss._tweenDestroy(scene, chargeAura, {
                alpha: 0,
                scaleX: chargeAura.scaleX * 1.35,
                scaleY: chargeAura.scaleY * 1.35,
                duration: 1300,
                ease: 'Cubic.Out',
            });
        }

        const burst = Boss._addBossVfx(scene, 'entrance_burst', this.x, this.y, {
            depth: 4,
            alpha: 0.92,
            scale: auraScale * 0.82,
        });
        if (burst) {
            Boss._tweenDestroy(scene, burst, {
                alpha: 0,
                scaleX: burst.scaleX * 1.5,
                scaleY: burst.scaleY * 1.5,
                duration: 1050,
                ease: 'Quad.Out',
            });
        }

        const smoke = Boss._addBossVfx(scene, 'smoke_wisp', this.x, this.y + 18, {
            depth: 3,
            alpha: 0.58,
            scale: auraScale * 0.74,
            blendMode: Phaser.BlendModes.NORMAL,
        });
        if (smoke) {
            Boss._tweenDestroy(scene, smoke, {
                alpha: 0,
                scaleX: smoke.scaleX * 1.25,
                scaleY: smoke.scaleY * 1.25,
                y: smoke.y + 12,
                duration: 1500,
                ease: 'Sine.Out',
            });
        }
    }

    update(time, delta, playerX, playerY) {
        if (!this.active) return;

        // Idle animation (4 frames)
        this.animTimer += delta;
        if (this.animTimer > 250) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
            this.setTexture('boss_' + this.bossKey + '_' + this.animFrame);
        }

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
            this.speed *= 1.2;
            this.attack = Math.floor(this.attack * 1.1);
            this.setTint(0xff6666);
            const rageAura = Boss._addBossVfx(this.scene, 'phase_rage_aura', this.x, this.y, {
                depth: 7,
                alpha: 0.9,
                scale: Math.max(0.72, this.config.size / 125),
            });
            if (rageAura) {
                Boss._tweenDestroy(this.scene, rageAura, {
                    alpha: 0,
                    scaleX: rageAura.scaleX * 1.42,
                    scaleY: rageAura.scaleY * 1.42,
                    duration: 850,
                    ease: 'Cubic.Out',
                });
            }
            if (this.scene.soundManager) this.scene.soundManager.play('bossRage');
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

        // Only redraw when HP or position actually changes
        const roundedX = Math.round(this.x);
        const roundedY = Math.round(this.y);
        if (this._lastDrawnHp === this.hp && this._lastDrawnX === roundedX && this._lastDrawnY === roundedY) return;
        this._lastDrawnHp = this.hp;
        this._lastDrawnX = roundedX;
        this._lastDrawnY = roundedY;

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
            const percent = Math.max(0, Math.floor(ratio * 100));
            this.hpText.setText(`${this.hp} / ${this.maxHp}  (${percent}%)`);
            this.hpText.setPosition(this.x, barY + h / 2);
        }
    }

    _doSpecialAttack(playerX, playerY, dist) {
        switch (this.bossKey) {
            case 'igris': this._igrisSlash(playerX, playerY); break;
            case 'tusk':
                if (dist > 600) { this.specialTimer = this.phase === 2 ? 2000 : 3500; return; }
                this._tuskGroundSlam(playerX, playerY);
                break;
            case 'beru':  this._beruAcidSpit(playerX, playerY); break;
        }
    }

    // Igris: telegraphed sword slash - RED DANGER ZONE
    _igrisSlash(playerX, playerY) {
        const scene = this.scene;
        if (!Boss._sceneIsActive(scene)) return;

        const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
        const range = this.phase === 2 ? 370 : 330;
        const coneAngle = this.phase === 2 ? 1.05 : 1.0;
        const slashX = this.x + Math.cos(angle) * (range * 0.42);
        const slashY = this.y + Math.sin(angle) * (range * 0.42);
        const visualScale = range / 250;

        if (scene.soundManager) scene.soundManager.play('bossCharge');

        const warnIcon = Boss._addImageVfx(scene, 'telegraph_warning_reticle', slashX, slashY, {
            depth: 4,
            alpha: 0,
            scale: 1.05 * visualScale,
        });
        const slashWarning = Boss._addImageVfx(scene, 'telegraph_igris_slash_warning', slashX, slashY, {
            depth: 3,
            alpha: 0,
            rotation: angle,
            scale: 0.94 * visualScale,
        });
        const chargeCue = Boss._addBossVfx(scene, 'charge_aura', slashX, slashY, {
            depth: 3,
            alpha: 0,
            scale: 0.58 * visualScale,
        });

        if (warnIcon) {
            scene.tweens.add({
                targets: warnIcon,
                alpha: { from: 0.2, to: 0.92 },
                scale: 1.22 * visualScale,
                duration: 220,
                yoyo: true,
            });
        }
        if (slashWarning) {
            scene.tweens.add({
                targets: slashWarning,
                alpha: { from: 0.18, to: 0.74 },
                scale: 1.08 * visualScale,
                duration: 550,
                ease: 'Quad.Out',
            });
        }
        if (chargeCue) {
            scene.tweens.add({
                targets: chargeCue,
                alpha: { from: 0.18, to: 0.66 },
                scale: 0.78 * visualScale,
                duration: 600,
                ease: 'Cubic.In',
            });
        }

        scene.time.delayedCall(600, () => {
            Boss._destroyIfAlive(warnIcon);
            Boss._destroyIfAlive(slashWarning);
            Boss._destroyIfAlive(chargeCue);
            if (!this.active || !Boss._sceneIsActive(scene)) return;

            if (scene.soundManager) scene.soundManager.play('bossSlash');

            const slash = Boss._addBossVfx(scene, 'igris_slash_impact', slashX, slashY, {
                depth: 8,
                alpha: 0.96,
                rotation: angle,
                scale: 0.82 * visualScale,
            });
            if (slash) {
                Boss._tweenDestroy(scene, slash, {
                    alpha: 0,
                    scaleX: slash.scaleX * 1.26,
                    scaleY: slash.scaleY * 1.26,
                    duration: 360,
                    ease: 'Quad.Out',
                });
            }

            // Damage player if in cone
            const player = scene.player;
            if (!player) return;
            const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
            if (d < range) {
                const pAngle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
                const diff = Math.abs(Phaser.Math.Angle.Wrap(pAngle - angle));
                if (diff < coneAngle) {
                    player.takeDamage(this.attack);
                }
            }

            scene.cameras.main.shake(100, 0.005);
        });
    }

    // Tusk: ground slam - RED DANGER AoE
    _tuskGroundSlam(playerX, playerY) {
        const scene = this.scene;
        if (!Boss._sceneIsActive(scene)) return;

        const slamX = playerX;
        const slamY = playerY;
        const radius = 200;

        if (scene.soundManager) scene.soundManager.play('bossCharge');

        const warnIcon = Boss._addImageVfx(scene, 'telegraph_warning_reticle', slamX, slamY, {
            depth: 4,
            alpha: 0,
            scale: 1.18,
        });
        const crackWarning = Boss._addImageVfx(scene, 'telegraph_ground_crack', slamX, slamY, {
            depth: 3,
            alpha: 0.22,
            scale: 0.55,
            rotation: Phaser.Math.FloatBetween(-0.25, 0.25),
        });
        const chargeCue = Boss._addBossVfx(scene, 'charge_aura', slamX, slamY, {
            depth: 3,
            alpha: 0.16,
            scale: 0.62,
        });

        if (warnIcon) {
            scene.tweens.add({
                targets: warnIcon,
                alpha: { from: 0.48, to: 0.96 },
                scale: { from: 1.1, to: 1.72 },
                duration: 330,
                yoyo: true,
                repeat: 1,
            });
        }
        if (crackWarning) {
            scene.tweens.add({
                targets: crackWarning,
                alpha: { from: 0.18, to: 0.82 },
                scale: radius / 135,
                duration: 1200,
                ease: 'Power2',
            });
        }
        if (chargeCue) {
            scene.tweens.add({
                targets: chargeCue,
                alpha: { from: 0.18, to: 0.62 },
                scale: radius / 150,
                duration: 1200,
                ease: 'Cubic.In',
            });
        }

        scene.time.delayedCall(1400, () => {
            Boss._destroyIfAlive(warnIcon);
            Boss._destroyIfAlive(crackWarning);
            Boss._destroyIfAlive(chargeCue);
            if (!this.active || !Boss._sceneIsActive(scene)) return;

            if (scene.soundManager) scene.soundManager.play('groundSlam');

            const crackDecal = Boss._addImageVfx(scene, 'telegraph_ground_crack', slamX, slamY, {
                depth: 6,
                alpha: 0.86,
                scale: radius / 150,
                rotation: Phaser.Math.FloatBetween(-0.3, 0.3),
            });
            if (crackDecal) {
                Boss._tweenDestroy(scene, crackDecal, {
                    alpha: 0,
                    scaleX: crackDecal.scaleX * 1.08,
                    scaleY: crackDecal.scaleY * 1.08,
                    duration: 900,
                    ease: 'Quad.Out',
                });
            }

            const shockwave = Boss._addBossVfx(scene, 'tusk_shockwave', slamX, slamY, {
                depth: 9,
                alpha: 0.95,
                scale: radius / 150,
            });
            if (shockwave) {
                Boss._tweenDestroy(scene, shockwave, {
                    alpha: 0,
                    scaleX: shockwave.scaleX * 1.38,
                    scaleY: shockwave.scaleY * 1.38,
                    duration: 520,
                    ease: 'Cubic.Out',
                });
            }

            const dust = Boss._addBossVfx(scene, 'tusk_dust_cloud', slamX, slamY, {
                depth: 7,
                alpha: 0.72,
                scale: radius / 158,
                blendMode: Phaser.BlendModes.NORMAL,
            });
            if (dust) {
                Boss._tweenDestroy(scene, dust, {
                    alpha: 0,
                    scaleX: dust.scaleX * 1.28,
                    scaleY: dust.scaleY * 1.28,
                    duration: 950,
                    ease: 'Sine.Out',
                });
            }

            const debris = Boss._addBossVfx(scene, 'tusk_debris_burst', slamX, slamY, {
                depth: 8,
                alpha: 0.9,
                scale: radius / 165,
                blendMode: Phaser.BlendModes.NORMAL,
            });
            if (debris) {
                Boss._tweenDestroy(scene, debris, {
                    alpha: 0,
                    scaleX: debris.scaleX * 1.16,
                    scaleY: debris.scaleY * 1.16,
                    y: debris.y + 14,
                    duration: 760,
                    ease: 'Quad.Out',
                });
            }

            // Damage if player is still in area
            const player = scene.player;
            if (player) {
                const d = Phaser.Math.Distance.Between(slamX, slamY, player.x, player.y);
                if (d < radius) {
                    player.takeDamage(Math.floor(this.attack * 1.3));
                }
            }

            // Heavier camera shake (tank slam, not blood burst)
            scene.cameras.main.shake(500, 0.022);
        });
    }

    // Beru: acid spit - 3 projectiles in spread, visible and dodgeable
    _beruAcidSpit(playerX, playerY) {
        const scene = this.scene;
        if (!scene?.physics?.world) return;

        const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
        const spreadCount = this.phase === 2 ? 5 : 3;
        const spreadAngle = 0.3;
        const attackDamage = Math.floor(this.attack * 0.7);

        if (scene.soundManager) scene.soundManager.play('acidShot');

        for (let i = 0; i < spreadCount; i++) {
            const offset = (i - (spreadCount - 1) / 2) * spreadAngle;
            const angle = baseAngle + offset;

            if (!scene.textures.exists('boss_vfx_beru_acid_projectile')) continue;
            const proj = scene.add.sprite(this.x, this.y, 'boss_vfx_beru_acid_projectile')
                .setDepth(8)
                .setRotation(angle)
                .setScale(0.2)
                .setBlendMode(Phaser.BlendModes.ADD);
            scene.physics.add.existing(proj, false);
            proj.body.setAllowGravity(false);
            proj.body.setCircle(9);
            const frameTimer = null;

            const speed = 280;
            proj.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

            // Collision with player (store collider to clean up)
            const player = scene.player;
            let collider = null;
            let autoDestroyTimer = null;
            let cleanedUp = false;
            const cleanupProjectile = () => {
                if (cleanedUp) return;
                cleanedUp = true;
                if (collider && scene.physics?.world) {
                    scene.physics.world.removeCollider(collider);
                    collider = null;
                }
                if (frameTimer) frameTimer.destroy();
                if (autoDestroyTimer) {
                    autoDestroyTimer.destroy();
                    autoDestroyTimer = null;
                }
                if (scene.tweens) scene.tweens.killTweensOf(proj);
            };

            if (player) {
                collider = scene.physics.add.overlap(proj, player, () => {
                    if (!proj.active) return;
                    if (scene.soundManager) scene.soundManager.play('acidHit');
                    const splash = Boss._addBossVfx(scene, 'beru_acid_hit', proj.x, proj.y, {
                        depth: 9,
                        alpha: 0.92,
                        scale: 0.42,
                    });
                    if (splash) {
                        Boss._tweenDestroy(scene, splash, {
                            alpha: 0,
                            scaleX: splash.scaleX * 1.34,
                            scaleY: splash.scaleY * 1.34,
                            duration: 420,
                            ease: 'Quad.Out',
                        });
                    }
                    this._spawnAcidPuddle(proj.x, proj.y);
                    player.takeDamage(attackDamage);
                    cleanupProjectile();
                    proj.destroy();
                });
            }

            // Auto-destroy after 4s
            autoDestroyTimer = scene.time.delayedCall(4000, () => {
                if (proj && proj.active) {
                    cleanupProjectile();
                    proj.destroy();
                }
            });
            proj.once('destroy', () => {
                cleanupProjectile();
            });
        }
    }

    _spawnAcidPuddle(x, y) {
        const scene = this.scene;
        if (!Boss._sceneIsActive(scene) || !scene.textures.exists('telegraph_acid_puddle')) return;

        const puddle = scene.add.image(x, y, 'telegraph_acid_puddle')
            .setDepth(6)
            .setAlpha(0.82)
            .setScale(0.55)
            .setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
            targets: puddle,
            alpha: 0,
            scale: 0.9,
            duration: 1200,
            ease: 'Quad.Out',
            onComplete: () => Boss._destroyIfAlive(puddle),
        });
    }

    takeDamage(amount) {
        if (!this.active) return false;

        // Spawn invincibility
        if (this.isInvincible) return false;

        this.hp -= amount;

        // console.log(`[BOSS HIT] ${this.config.name}: -${amount} HP (${this.hp}/${this.maxHp})`);

        // Flash red on hit, then restore
        this.setTint(0xff0000);
        this.scene.time.delayedCall(80, () => {
            if (this.active) {
                this.setTint(this.phase === 2 ? 0xff6666 : 0xffffff);
            }
        });

        // Damage number
        const isCrit = amount >= Math.max(500, this.maxHp * 0.015);
        if (isCrit && this.scene.soundManager) this.scene.soundManager.play('critHit');
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

            // Temporary attack buff (20% for 15 seconds)
            player._tempAtkBuff = (player._tempAtkBuff || 0) + 0.2;
            this.scene.time.delayedCall(15000, () => {
                if (player && !player.isDead) {
                    player._tempAtkBuff = Math.max(0, (player._tempAtkBuff || 0) - 0.2);
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

        // Sound (epic boss kill)
        if (this.scene.soundManager) {
            this.scene.soundManager.play('bossKill');
        }

        const scene = this.scene;
        const deathTheme = Boss._getDeathTheme(this.bossKey);
        const shadowManager = scene.shadowArmyManager;
        const shadowBossData = {
            x: this.x,
            y: this.y,
            bossKey: this.bossKey,
        };
        const deathScale = Phaser.Math.Clamp(this.config.size / 82, 1.0, 1.42);
        const usedBossBurst = Boss._playFrameVfx(scene, deathTheme.prefix, this.x, this.y - this.displayHeight * 0.02, {
            depth: 22,
            alpha: 1,
            scale: deathScale * deathTheme.burstScale,
            frameMs: deathTheme.frameMs,
            blendMode: Phaser.BlendModes.ADD,
        });

        const coreFlash = scene.add.circle(this.x, this.y, 24 * deathScale, deathTheme.flashColor, 0.9)
            .setDepth(23)
            .setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
            targets: coreFlash,
            scale: 5.6,
            alpha: 0,
            duration: 520,
            ease: 'Cubic.easeOut',
            onComplete: () => Boss._destroyIfAlive(coreFlash),
        });

        Boss._spawnDeathFragments(scene, this.x, this.y, deathScale, deathTheme.fragmentPalette);

        const explosion = Boss._addBossVfx(scene, 'death_explosion', this.x, this.y, {
            depth: usedBossBurst ? 18 : 20,
            alpha: usedBossBurst ? 0.78 : 1,
            scale: deathScale * 1.08,
        });
        if (explosion) {
            explosion.setTint(deathTheme.ringTint);
            Boss._tweenDestroy(scene, explosion, {
                alpha: 0,
                scaleX: explosion.scaleX * 1.78,
                scaleY: explosion.scaleY * 1.78,
                duration: 920,
                ease: 'Quad.Out',
            });
        }

        const ring = Boss._addBossVfx(scene, 'death_shock_ring', this.x, this.y, {
            depth: 17,
            alpha: 1,
            scale: deathScale * 0.94,
        });
        if (ring) {
            ring.setTint(deathTheme.ringTint);
            Boss._tweenDestroy(scene, ring, {
                alpha: 0,
                scaleX: ring.scaleX * 2.55,
                scaleY: ring.scaleY * 2.55,
                duration: 980,
                ease: 'Cubic.Out',
            });
        }

        const afterRing = Boss._addBossVfx(scene, 'death_shock_ring', this.x, this.y, {
            depth: 16,
            alpha: 0.72,
            scale: deathScale * 0.56,
        });
        if (afterRing) {
            afterRing.setTint(deathTheme.ringTint);
            scene.time.delayedCall(140, () => {
                Boss._tweenDestroy(scene, afterRing, {
                    alpha: 0,
                    scaleX: afterRing.scaleX * 3.25,
                    scaleY: afterRing.scaleY * 3.25,
                    duration: 860,
                    ease: 'Cubic.Out',
                });
            });
        }

        const smoke = Boss._addBossVfx(scene, 'smoke_wisp', this.x, this.y + 16, {
            depth: 14,
            alpha: 0.82,
            scale: deathScale * 1.15,
            blendMode: Phaser.BlendModes.NORMAL,
        });
        if (smoke) {
            Boss._tweenDestroy(scene, smoke, {
                alpha: 0,
                scaleX: smoke.scaleX * 1.48,
                scaleY: smoke.scaleY * 1.48,
                y: smoke.y + 28,
                duration: 1350,
                ease: 'Sine.Out',
            });
        }

        const sparks = scene.add.particles(this.x, this.y, 'particle_spark', {
            speed: { min: 150, max: 430 * deathScale },
            scale: { start: 1.25, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: { min: 360, max: 820 },
            tint: deathTheme.sparkTints,
            blendMode: 'ADD',
            emitting: false,
        });
        sparks.setDepth(22);
        sparks.explode(Math.round(34 * deathScale));
        scene.time.delayedCall(1000, () => Boss._destroyIfAlive(sparks));

        if (shadowManager?.enabled) {
            scene.time.delayedCall(deathTheme.ariseDelay, () => {
                if (scene.scene?.isActive?.() !== false) {
                    shadowManager.onBossKilled(shadowBossData);
                }
            });
        }

        const deathCamera = scene.cameras.main;
        deathCamera.shake(620, deathTheme.cameraShake);
        deathCamera.flash(280, 255, 180, 70);
        scene.time.delayedCall(160, () => {
            if (deathCamera?.scene?.sys?.isActive?.() !== false) deathCamera.shake(260, 0.012);
        });

        this.destroy();
    }
}
