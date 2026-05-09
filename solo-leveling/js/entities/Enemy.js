import { COLORS } from '../utils/Constants.js';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
    // Shared particle emitter pool for death effects (class-level)
    static _deathEmitterPool = [];
    static _deathSparkPool = [];
    static MAX_POOLED_EMITTERS = 8;
    static _vfxBudgetFrame = -1;
    static _vfxBudgetUsed = 0;
    static MAX_VFX_BUDGET_PER_FRAME = 18;

    static _consumeVfxBudget(scene, cost = 1) {
        const frame = scene?.game?.loop?.frame ?? 0;
        if (Enemy._vfxBudgetFrame !== frame) {
            Enemy._vfxBudgetFrame = frame;
            Enemy._vfxBudgetUsed = 0;
        }
        if (Enemy._vfxBudgetUsed + cost > Enemy.MAX_VFX_BUDGET_PER_FRAME) return false;
        Enemy._vfxBudgetUsed += cost;
        return true;
    }

    static _getDeathEmitter(scene, x, y) {
        // Try to reuse an existing emitter
        for (let i = Enemy._deathEmitterPool.length - 1; i >= 0; i--) {
            const em = Enemy._deathEmitterPool[i];
            if (!Enemy._canPoolSceneObject(em)) {
                Enemy._deathEmitterPool.splice(i, 1);
                Enemy._disposeTransientObject(em, scene);
                continue;
            }
            if (!em.emitting) {
                Enemy._deathEmitterPool.splice(i, 1);
                em.setPosition(x, y);
                return em;
            }
        }
        // Create new one
        try {
            const emitter = scene.add.particles(x, y, 'particle_glow', {
                speed: { min: 80, max: 220 },
                scale: { start: 1.4, end: 0 },
                alpha: { start: 0.95, end: 0 },
                lifespan: { min: 400, max: 750 },
                tint: [0xcc0011, 0xaa0010, 0x660008, 0xdd2020],
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
            if (!Enemy._canPoolSceneObject(em)) {
                Enemy._deathSparkPool.splice(i, 1);
                Enemy._disposeTransientObject(em, scene);
                continue;
            }
            if (!em.emitting) {
                Enemy._deathSparkPool.splice(i, 1);
                em.setPosition(x, y);
                return em;
            }
        }
        try {
            const sparks = scene.add.particles(x, y, 'particle_spark', {
                speed: { min: 100, max: 260 },
                scale: { start: 1.0, end: 0 },
                alpha: { start: 1, end: 0 },
                lifespan: { min: 300, max: 550 },
                tint: [0xff3344, 0xdd1122, 0x990008],
                emitting: false,
            });
            sparks.setDepth(15);
            return sparks;
        } catch (e) {
            return null;
        }
    }

    static _returnDeathEmitter(emitter) {
        if (emitter && Enemy._canPoolSceneObject(emitter) && Enemy._deathEmitterPool.length < Enemy.MAX_POOLED_EMITTERS) {
            Enemy._deathEmitterPool.push(emitter);
        } else if (emitter && emitter.scene) {
            emitter.destroy();
        }
    }

    static _returnDeathSparks(sparks) {
        if (sparks && Enemy._canPoolSceneObject(sparks) && Enemy._deathSparkPool.length < Enemy.MAX_POOLED_EMITTERS) {
            Enemy._deathSparkPool.push(sparks);
        } else if (sparks && sparks.scene) {
            sparks.destroy();
        }
    }

    static _canPoolSceneObject(obj) {
        if (!obj?.scene) return false;
        try {
            return obj.scene.sys?.isActive?.() !== false;
        } catch (e) {
            return false;
        }
    }

    static _disposeTransientObject(obj, scene = null) {
        if (!obj) return;
        try {
            const tweens = scene?.tweens || obj.scene?.tweens;
            if (tweens) tweens.killTweensOf(obj);
        } catch (e) { /* scene may already be shutting down */ }
        try {
            if (obj.scene && obj.destroy) obj.destroy();
        } catch (e) { /* already destroyed */ }
    }

    static clearTransientPools(scene = null) {
        for (const emitter of Enemy._deathEmitterPool) {
            Enemy._disposeTransientObject(emitter, scene);
        }
        for (const sparks of Enemy._deathSparkPool) {
            Enemy._disposeTransientObject(sparks, scene);
        }
        for (const text of Enemy._activeTexts) {
            Enemy._disposeTransientObject(text, scene);
        }
        for (const text of Enemy._dmgTextPool) {
            Enemy._disposeTransientObject(text, scene);
        }

        Enemy._deathEmitterPool = [];
        Enemy._deathSparkPool = [];
        Enemy._activeTexts = [];
        Enemy._dmgTextPool = [];
        Enemy._vfxBudgetFrame = -1;
        Enemy._vfxBudgetUsed = 0;
    }

    static _playFrameVfx(scene, prefix, x, y, opts = {}) {
        if (!scene?.textures?.exists(`${prefix}_0`)) return false;

        const {
            scale = 1,
            rotation = 0,
            depth = 16,
            frameMs = 45,
            alpha = 1,
            blendMode = Phaser.BlendModes.NORMAL,
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

    static _animateFrameSprite(scene, sprite, prefix, frameMs = 55) {
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
        this.spawnInstanceId = 0;
        this._lastHitEffect = null;
        this._hitFlashTimerA = null;
        this._hitFlashTimerB = null;

        // Shadow aura below sprite — purple halo that ties retro tiles to shadow theme
        // Reuses particle_glow texture for cheap additive blending
        try {
            this._aura = scene.add.image(x, y, 'particle_glow')
                .setDepth(4)
                .setTint(COLORS.SHADOW_PRIMARY)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setAlpha(0)
                .setVisible(false);
        } catch (_) { this._aura = null; }
    }

    spawn(typeKey, typeData, difficultyMult, x, y, statProfile = null) {
        // Reset any monkey-patched methods from elite spawns
        this.update = Enemy.prototype.update;
        this.die = Enemy.prototype.die;
        this.isElite = false;
        this._eliteDeathPending = false;
        if (this._eliteLabel) { this._eliteLabel.destroy(); this._eliteLabel = null; }
        try {
            if (this._eliteGlow && this.filters) this.filters.internal.remove(this._eliteGlow);
        } catch (e) { /* filters may already be gone */ }
        this._eliteGlow = null;
        this._originalUpdate = null;
        this._originalDie = null;
        if (this._hitFlashTimerA) {
            this._hitFlashTimerA.remove(false);
            this._hitFlashTimerA = null;
        }
        if (this._hitFlashTimerB) {
            this._hitFlashTimerB.remove(false);
            this._hitFlashTimerB = null;
        }

        this.enemyType = typeKey;
        Enemy._nextSpawnInstanceId = (Enemy._nextSpawnInstanceId || 0) + 1;
        this.spawnInstanceId = Enemy._nextSpawnInstanceId;
        this.setPosition(x, y);
        this.setActive(true);
        this.setVisible(true);
        this.body.enable = true;
        this.setScale(1, 1);

        // Apply difficulty scaling (fewer enemies → each one is tougher)
        const hpScale = statProfile?.hp ?? difficultyMult;
        const attackScale = statProfile?.attack ?? (1 + (difficultyMult - 1) * 0.5);
        const speedScale = statProfile?.speed ?? (1 + (difficultyMult - 1) * 0.15);
        const xpScale = statProfile?.xp ?? (1 + (difficultyMult - 1) * 0.5);

        // Apply time pressure scaling: durability rises hardest, speed rises gently.
        this.maxHp = Math.floor(typeData.hp * hpScale);
        this.hp = this.maxHp;
        this.attack = Math.floor(typeData.attack * attackScale);
        this.speed = typeData.speed * speedScale;
        this.xpValue = Math.floor(typeData.xp * xpScale);

        // Set texture and size
        this.setTexture('enemy_' + typeKey + '_0');
        const s = typeData.size;
        this.body.setSize(s * 1.2, s * 1.2);
        this.setDisplaySize(s * 2, s * 2);
        // Cache resting scale AFTER setDisplaySize so squash-and-stretch doesn't drift
        this._restScaleX = this.scaleX;
        this._restScaleY = this.scaleY;
        if (this._squashRestoreTimer) {
            this._squashRestoreTimer.remove(false);
            this._squashRestoreTimer = null;
        }

        this.animFrame = 0;
        this.animTimer = 0;
        this.knockbackTimer = 0;
        this.slowMultiplier = 1;
        this.slowDuration = 0;
        this._lastHitEffect = null;
        this.rangedCooldown = 0;
        this.meleeCooldown = 0;
        this._meleeRange = s * 2 + 30; // 몹 크기 기반 근접 공격 사거리
        this.setAlpha(1);
        this.setTint(0xffffff);

        // Activate shadow aura (sized to match enemy)
        if (this._aura) {
            // particle_glow is 16x16 → scale so aura diameter = enemy size * 2.6
            const auraScale = (s * 2.6) / 16;
            this._aura
                .setPosition(x, y + s * 0.35)
                .setScale(auraScale, auraScale * 0.55)
                .setAlpha(0.35)
                .setVisible(true)
                .setActive(true);
        }
    }

    update(time, delta, playerX, playerY) {
        if (!this.active) return;

        // Sync shadow aura with enemy position (slight y-offset so it sits near feet)
        if (this._aura && this._aura.active) {
            this._aura.x = this.x;
            this._aura.y = this.y + (this.displayHeight * 0.25);
        }

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
                }
            }
        }

        // Face movement/target direction. The refreshed goblin source faces right;
        // the other generated enemy sources face left, so their flip baseline differs.
        const movingLeft = playerX < this.x;
        const sourceFacesRight = this.enemyType === 'goblin';
        this.setFlipX(sourceFacesRight ? movingLeft : !movingLeft);

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

        // Brief cast animation (mage glows purple)
        this.setTint(0xb044ff);
        this.scene.time.delayedCall(150, () => {
            if (this.active) this.setTint(0xffffff);
        });

        const useEffectAsset = this.scene.textures.exists('effect_dark_mage_orb_0');
        const proj = this.scene.add.sprite(this.x, this.y, useEffectAsset ? 'effect_dark_mage_orb_0' : 'proj_darkMage')
            .setDepth(8)
            .setRotation(useEffectAsset ? angle : 0)
            .setScale(useEffectAsset ? 0.25 : 1.4)
            .setBlendMode(useEffectAsset ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
        this.scene.physics.add.existing(proj, false);
        proj.body.setAllowGravity(false);
        proj.body.setCircle(useEffectAsset ? 10 : 6);
        const frameTimer = useEffectAsset
            ? Enemy._animateFrameSprite(this.scene, proj, 'effect_dark_mage_orb', 58)
            : null;

        // Slow enough to dodge (150 speed)
        const speed = 150;
        proj.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

        // Purple danger trail, bounded to projectile lifetime.
        const trailEvent = this.scene.time.addEvent({
            delay: 60, repeat: 58, // 58 * 60ms ≈ 3480ms (slightly under auto-destroy)
            callback: () => {
                if (!proj.active || !this.scene) return;
                const trail = this.scene.add.circle(proj.x, proj.y, useEffectAsset ? 5 : 4, 0x9b35ff, useEffectAsset ? 0.32 : 0.5).setDepth(7);
                this.scene.tweens.add({
                    targets: trail, alpha: 0, scale: 0.2,
                    duration: 250, onComplete: () => trail.destroy(),
                });
            },
        });

        // Collision with player
        const player = this.scene.player;
        let collider = null;
        if (player) {
            collider = this.scene.physics.add.overlap(proj, player, () => {
                if (!proj.active) return;
                player.takeDamage(this.attack);
                proj.destroy();
            });
        }

        // Auto-destroy after 3.5 seconds (only destroys if still alive)
        const autoDestroyTimer = this.scene.time.delayedCall(3500, () => {
            if (proj.active) proj.destroy();
        });

        // Centralized cleanup: fires on destroy() from any path (hit, timeout, scene shutdown)
        proj.once('destroy', () => {
            if (frameTimer) frameTimer.destroy();
            if (trailEvent) trailEvent.destroy();
            if (autoDestroyTimer) autoDestroyTimer.destroy();
            if (collider && this.scene?.physics?.world) {
                this.scene.physics.world.removeCollider(collider);
            }
            if (this.scene?.tweens) this.scene.tweens.killTweensOf(proj);
        });

        if (!useEffectAsset) {
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
    }

    takeDamage(amount, knockbackX, knockbackY, hitEffect = null) {
        this.hp -= amount;
        this._lastHitEffect = hitEffect || null;

        const isCrit = amount > this.maxHp * 0.5;
        const isBurn = hitEffect === 'burn';
        if (isCrit && this.scene.soundManager) this.scene.soundManager.play('critHit');
        const restoreTint = this.isElite ? 0xff6644 : 0xffffff;

        // Impact feel: white pre-flash → red flash → restore
        // (staged tint = "light flashes off metal then blood" feel)
        if (this._hitFlashTimerA) {
            this._hitFlashTimerA.remove(false);
            this._hitFlashTimerA = null;
        }
        if (this._hitFlashTimerB) {
            this._hitFlashTimerB.remove(false);
            this._hitFlashTimerB = null;
        }
        this.setTint(0xffffff);
        this._hitFlashTimerA = this.scene.time.delayedCall(35, () => {
            this._hitFlashTimerA = null;
            if (this.active) this.setTint(isBurn ? 0xff7a22 : 0xff2233);
        });
        this._hitFlashTimerB = this.scene.time.delayedCall(110, () => {
            this._hitFlashTimerB = null;
            if (this.active) {
                // Slow tint takes priority over idle tint
                this.setTint(this.slowDuration > 0 ? 0x8888ff : restoreTint);
            }
        });

        // Squash-and-stretch for hit punch — always based on resting scale (prevents drift under rapid hits)
        const restX = this._restScaleX ?? this.scaleX;
        const restY = this._restScaleY ?? this.scaleY;
        if (this._squashRestoreTimer) {
            this._squashRestoreTimer.remove(false);
            this._squashRestoreTimer = null;
        }
        this.setScale(restX * 1.15, restY * 0.88);
        this._squashRestoreTimer = this.scene.time.delayedCall(70, () => {
            this._squashRestoreTimer = null;
            if (this.active) this.setScale(restX, restY);
        });

        // Crit: stronger kick — screen shake + white ring burst at hit location
        if (isCrit && this.scene.cameras?.main && Enemy._consumeVfxBudget(this.scene, 2)) {
            this.scene.cameras.main.shake(90, 0.004);
            try {
                const ring = this.scene.add.image(this.x, this.y, 'particle_ring')
                    .setDepth(16)
                    .setBlendMode(Phaser.BlendModes.ADD)
                    .setTint(0xffffff)
                    .setScale(0.6);
                this.scene.tweens.add({
                    targets: ring,
                    scale: 2.4,
                    alpha: 0,
                    duration: 220,
                    ease: 'Quad.Out',
                    onComplete: () => ring.destroy(),
                });
            } catch (_) { /* ring VFX optional */ }
        }

        this._spawnHitEffect(isCrit, hitEffect);

        // Knockback
        if (knockbackX !== undefined) {
            const angle = Phaser.Math.Angle.Between(knockbackX, knockbackY, this.x, this.y);
            this.body.setVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
            this.knockbackTimer = 150;
        }

        // Damage number (per hit)
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
        const wasElite = this.isElite || this._eliteDeathPending;
        this._eliteDeathPending = wasElite;

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
            this.scene.soundManager.play(wasElite ? 'eliteKill' : 'kill');
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

        // Hide aura with the enemy (pooling: kept alive for reuse on next spawn)
        if (this._aura) {
            this._aura.setVisible(false).setActive(false);
        }
        this._eliteDeathPending = false;
    }

    _spawnHitEffect(isCrit, hitEffect) {
        if (!Enemy._consumeVfxBudget(this.scene, isCrit ? 2 : 1)) return;
        if (hitEffect === 'burn') {
            this._spawnHitBurn(isCrit);
            return;
        }
        this._spawnHitBlood(isCrit);
    }

    _getHitVfxProfile() {
        const width = this.displayWidth || 64;
        const elite = this.isElite || this._eliteDeathPending;
        const tier = elite || width >= 112 ? 'large' : (width >= 84 ? 'medium' : 'small');
        const base = Phaser.Math.Clamp(width / 64, 0.72, elite ? 2.25 : 1.95);

        if (tier === 'large') {
            return {
                tier,
                sizeFactor: base * (elite ? 1.15 : 1.05),
                particleMult: elite ? 2.15 : 1.65,
                speedMult: elite ? 1.35 : 1.18,
                radiusMult: elite ? 1.25 : 1.12,
                hitYOffset: 0.11,
                ringRadius: width * (elite ? 0.48 : 0.42),
                ringScale: elite ? 2.65 : 2.25,
                ringAlpha: elite ? 0.48 : 0.34,
                ringWidth: elite ? 4 : 3,
                scorchScale: elite ? 1.8 : 1.45,
                frameMsAdd: 8,
            };
        }

        if (tier === 'medium') {
            return {
                tier,
                sizeFactor: base,
                particleMult: 1.18,
                speedMult: 1.05,
                radiusMult: 1,
                hitYOffset: 0.08,
                ringRadius: width * 0.32,
                ringScale: 1.75,
                ringAlpha: 0.22,
                ringWidth: 2,
                scorchScale: 1.16,
                frameMsAdd: 2,
            };
        }

        return {
            tier,
            sizeFactor: base * 0.88,
            particleMult: 0.78,
            speedMult: 0.9,
            radiusMult: 0.86,
            hitYOffset: 0.055,
            ringRadius: 0,
            ringScale: 1,
            ringAlpha: 0,
            ringWidth: 0,
            scorchScale: 0.82,
            frameMsAdd: -4,
        };
    }

    _spawnHitRing(profile, color, yOffset = 0) {
        if (!profile?.ringRadius || !this.scene) return;
        const ring = this.scene.add.circle(this.x, this.y + yOffset, profile.ringRadius, color, 0)
            .setDepth(17)
            .setAlpha(profile.ringAlpha)
            .setBlendMode(Phaser.BlendModes.ADD);
        ring.setStrokeStyle(profile.ringWidth, color, profile.ringAlpha);
        this.scene.tweens.add({
            targets: ring,
            scale: profile.ringScale,
            alpha: 0,
            duration: profile.tier === 'large' ? 360 : 260,
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });
    }

    _spawnHitBurn(isCrit) {
        if (!this.scene) return;
        if (this.scene.soundManager) this.scene.soundManager.play('burnHit');
        const profile = this._getHitVfxProfile();
        const sizeFactor = profile.sizeFactor;
        const usedAsset = Enemy._playFrameVfx(
            this.scene,
            'effect_flame_burn',
            this.x,
            this.y - this.displayHeight * profile.hitYOffset,
            {
                scale: (isCrit ? 0.56 : 0.46) * sizeFactor,
                rotation: Phaser.Math.FloatBetween(-0.22, 0.22),
                depth: 18,
                frameMs: (isCrit ? 48 : 42) + profile.frameMsAdd,
                alpha: 0.95,
                blendMode: Phaser.BlendModes.ADD,
            }
        );
        this._spawnHitRing(profile, isCrit ? 0xffc45a : 0xff7a22, -this.displayHeight * 0.04);

        const emberCount = Math.max(3, Math.round((usedAsset ? (isCrit ? 16 : 10) : (isCrit ? 12 : 7)) * profile.particleMult));
        const maxSpeed = (usedAsset ? (isCrit ? 185 : 120) : (isCrit ? 145 : 90)) * profile.speedMult;
        for (let i = 0; i < emberCount; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 35 + Math.random() * maxSpeed;
            const r = (1.2 + Math.random() * 2.4) * profile.radiusMult;
            const color = [0xfff0a0, 0xffb347, 0xff6a18, 0x4a2a12][Math.floor(Math.random() * 4)];
            const ember = this.scene.add.circle(this.x, this.y - 4, r, color, 0.92).setDepth(11);
            ember.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: ember,
                x: this.x + Math.cos(a) * s,
                y: this.y + Math.sin(a) * s - 8,
                alpha: 0,
                scale: 0.25,
                duration: 300 + Math.random() * 260,
                ease: 'Quad.easeOut',
                onComplete: () => ember.destroy(),
            });
        }

        const scorch = this.scene.add.ellipse(
            this.x,
            this.y + this.displayHeight * 0.18,
            20 * sizeFactor * profile.scorchScale,
            8 * sizeFactor * profile.scorchScale,
            0x1b1008,
            profile.tier === 'small' ? 0.38 : 0.55
        ).setDepth(4);
        this.scene.tweens.add({
            targets: scorch,
            scaleX: profile.tier === 'large' ? 2.15 : 1.7,
            scaleY: profile.tier === 'large' ? 1.55 : 1.25,
            alpha: 0,
            duration: profile.tier === 'large' ? 760 : 560,
            ease: 'Quad.easeOut',
            onComplete: () => scorch.destroy(),
        });
    }

    _spawnHitBlood(isCrit) {
        if (!this.scene) return;
        const profile = this._getHitVfxProfile();
        const sizeFactor = profile.sizeFactor;
        const hitAngle = Phaser.Math.FloatBetween(-0.45, 0.45);
        const usedAsset = Enemy._playFrameVfx(
            this.scene,
            isCrit ? 'effect_monster_crit' : 'effect_monster_hit',
            this.x,
            this.y - this.displayHeight * profile.hitYOffset,
            {
                scale: (isCrit ? 0.5 : 0.42) * sizeFactor,
                rotation: hitAngle,
                depth: 18,
                frameMs: (isCrit ? 42 : 38) + profile.frameMsAdd,
            }
        );
        this._spawnHitRing(profile, isCrit ? 0xff3344 : 0xcc1020, -this.displayHeight * 0.04);

        const count = Math.max(3, Math.round((usedAsset ? (isCrit ? 12 : 8) : (isCrit ? 8 : 4)) * profile.particleMult));
        const maxSpeed = (usedAsset ? (isCrit ? 210 : 145) : (isCrit ? 160 : 95)) * profile.speedMult;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 45 + Math.random() * maxSpeed;
            const r = (1.6 + Math.random() * 2.2) * profile.radiusMult;
            const color = Math.random() < 0.4 ? 0x660008 : (Math.random() < 0.7 ? 0xcc1020 : 0xdd3030);
            const drop = this.scene.add.circle(this.x, this.y, r, color, 0.95).setDepth(10);
            this.scene.tweens.add({
                targets: drop,
                x: this.x + Math.cos(a) * s,
                y: this.y + Math.sin(a) * s,
                alpha: 0,
                scale: 0.35,
                duration: 280 + Math.random() * 220,
                ease: 'Quad.easeOut',
                onComplete: () => drop.destroy(),
            });
        }

        if (profile.tier === 'large') {
            const bruise = this.scene.add.ellipse(
                this.x,
                this.y + this.displayHeight * 0.2,
                18 * sizeFactor,
                7 * sizeFactor,
                0x330008,
                0.42
            ).setDepth(4);
            this.scene.tweens.add({
                targets: bruise,
                scaleX: 1.8,
                scaleY: 1.25,
                alpha: 0,
                duration: 520,
                ease: 'Quad.easeOut',
                onComplete: () => bruise.destroy(),
            });
        }
    }

    _deathEffect() {
        try {
            const isElite = this.isElite || this._eliteDeathPending;
            if (this._lastHitEffect === 'burn') {
                if (!Enemy._consumeVfxBudget(this.scene, isElite ? 5 : 3)) {
                    this._minimalDeathEffect(0xff6a18);
                    return;
                }
                this._burnDeathEffect();
                return;
            }

            if (!Enemy._consumeVfxBudget(this.scene, isElite ? 5 : 3)) {
                this._minimalDeathEffect(0xcc1020);
                return;
            }

            const sizeFactor = Math.max(1, (this.displayWidth || 30) / 30);
            const usedDeathAsset = Enemy._playFrameVfx(
                this.scene,
                'effect_monster_death',
                this.x,
                this.y - this.displayHeight * 0.05,
                {
                    scale: Phaser.Math.Clamp(0.38 * sizeFactor, 0.42, isElite ? 1.25 : 0.95),
                    rotation: Phaser.Math.FloatBetween(-0.5, 0.5),
                    depth: 18,
                    frameMs: 48,
                }
            );

            // Pooled red blood burst (main spray)
            const emitter = Enemy._getDeathEmitter(this.scene, this.x, this.y);
            if (emitter) emitter.explode(usedDeathAsset ? (isElite ? 36 : 24) : (isElite ? 28 : 16));

            // Pooled sparks (gore flecks)
            const sparks = Enemy._getDeathSparks(this.scene, this.x, this.y);
            if (sparks) sparks.explode(usedDeathAsset ? (isElite ? 22 : 13) : (isElite ? 16 : 9));

            // Bright red core burst
            const core = this.scene.add.circle(this.x, this.y, 9 * sizeFactor, 0xcc0011, 0.95).setDepth(10);
            this.scene.tweens.add({
                targets: core, scale: 3, alpha: 0,
                duration: 360, onComplete: () => core.destroy(),
            });

            // Dark splash underlay
            const splash = this.scene.add.circle(this.x, this.y, 13 * sizeFactor, 0x4a0006, 0.8).setDepth(4);
            this.scene.tweens.add({
                targets: splash, scale: 2.6, alpha: 0,
                duration: 700, onComplete: () => splash.destroy(),
            });

            // Flying gore chunks (bigger, irregular)
            const chunkCount = usedDeathAsset ? (isElite ? 20 : 14) : (isElite ? 16 : 10);
            for (let i = 0; i < chunkCount; i++) {
                const a = Math.random() * Math.PI * 2;
                const s = 90 + Math.random() * 140;
                const r = 2.8 + Math.random() * 3.2;
                const color = [0x660008, 0xaa0010, 0xdd2020][Math.floor(Math.random() * 3)];
                const chunk = this.scene.add.circle(this.x, this.y, r, color, 0.95).setDepth(10);
                this.scene.tweens.add({
                    targets: chunk,
                    x: this.x + Math.cos(a) * s,
                    y: this.y + Math.sin(a) * s + 20, // slight downward arc
                    alpha: 0,
                    scale: 0.4,
                    duration: 550 + Math.random() * 450,
                    ease: 'Quad.easeOut',
                    onComplete: () => chunk.destroy(),
                });
            }

            // Persistent blood pool on ground (elite = bigger)
            const poolW = 28 * sizeFactor * (isElite ? 1.4 : 1);
            const poolH = 10 * sizeFactor * (isElite ? 1.4 : 1);
            const bloodPool = this.scene.add.ellipse(this.x, this.y + 6, poolW, poolH, 0x2a0006, 0.75).setDepth(3);
            this.scene.tweens.add({
                targets: bloodPool,
                scaleX: 1.8, scaleY: 1.8,
                alpha: 0,
                duration: 2200,
                onComplete: () => bloodPool.destroy(),
            });

            this.scene.time.delayedCall(800, () => {
                Enemy._returnDeathEmitter(emitter);
                Enemy._returnDeathSparks(sparks);
            });
        } catch (e) {
            // Fallback
            for (let i = 0; i < 6; i++) {
                const p = this.scene.add.circle(
                    this.x + Phaser.Math.Between(-10, 10), this.y + Phaser.Math.Between(-10, 10),
                    Phaser.Math.Between(2, 5), 0xcc0011, 0.85
                ).setDepth(15);
                this.scene.tweens.add({
                    targets: p, alpha: 0, scale: 0,
                    x: p.x + Phaser.Math.Between(-40, 40), y: p.y + Phaser.Math.Between(-40, 40),
                    duration: 500, onComplete: () => p.destroy(),
                });
            }
        }
    }

    _minimalDeathEffect(color = 0xcc1020) {
        if (!this.scene) return;
        const sizeFactor = Math.max(1, (this.displayWidth || 30) / 42);
        const burst = this.scene.add.circle(this.x, this.y, 7 * sizeFactor, color, 0.72).setDepth(12);
        burst.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: burst,
            alpha: 0,
            scale: 2.4,
            duration: 320,
            ease: 'Quad.easeOut',
            onComplete: () => burst.destroy(),
        });
    }

    _burnDeathEffect() {
        const sizeFactor = Math.max(1, (this.displayWidth || 30) / 30);
        const isElite = this.isElite || this._eliteDeathPending;
        const scale = Phaser.Math.Clamp(0.5 * sizeFactor, 0.55, isElite ? 1.35 : 1.05);

        Enemy._playFrameVfx(
            this.scene,
            'effect_flame_burn',
            this.x,
            this.y - this.displayHeight * 0.05,
            {
                scale,
                rotation: Phaser.Math.FloatBetween(-0.18, 0.18),
                depth: 18,
                frameMs: 50,
                alpha: 1,
                blendMode: Phaser.BlendModes.ADD,
            }
        );

        const emberCount = isElite ? 30 : 18;
        for (let i = 0; i < emberCount; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 70 + Math.random() * (isElite ? 210 : 145);
            const r = 1.5 + Math.random() * 3.2;
            const color = [0xfff0a0, 0xffbc42, 0xff741f, 0x2f2114][Math.floor(Math.random() * 4)];
            const ember = this.scene.add.circle(this.x, this.y, r, color, 0.94).setDepth(12);
            ember.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: ember,
                x: this.x + Math.cos(a) * s,
                y: this.y + Math.sin(a) * s + Phaser.Math.Between(-26, 10),
                alpha: 0,
                scale: 0.25,
                duration: 520 + Math.random() * 420,
                ease: 'Quad.easeOut',
                onComplete: () => ember.destroy(),
            });
        }

        const scorch = this.scene.add.ellipse(
            this.x,
            this.y + 7,
            30 * sizeFactor * (isElite ? 1.35 : 1),
            12 * sizeFactor * (isElite ? 1.35 : 1),
            0x1a0e07,
            0.72
        ).setDepth(3);
        this.scene.tweens.add({
            targets: scorch,
            scaleX: 2.2,
            scaleY: 1.7,
            alpha: 0,
            duration: 1500,
            ease: 'Quad.easeOut',
            onComplete: () => scorch.destroy(),
        });
    }

    destroy(fromScene) {
        if (this._hitFlashTimerA) {
            this._hitFlashTimerA.remove(false);
            this._hitFlashTimerA = null;
        }
        if (this._hitFlashTimerB) {
            this._hitFlashTimerB.remove(false);
            this._hitFlashTimerB = null;
        }
        if (this._squashRestoreTimer) {
            this._squashRestoreTimer.remove(false);
            this._squashRestoreTimer = null;
        }
        if (this.scene?.tweens) {
            this.scene.tweens.killTweensOf(this);
            if (this._aura) this.scene.tweens.killTweensOf(this._aura);
            if (this._eliteLabel) this.scene.tweens.killTweensOf(this._eliteLabel);
        }
        if (this._eliteLabel) {
            this._eliteLabel.destroy();
            this._eliteLabel = null;
        }
        try {
            if (this._eliteGlow && this.filters) this.filters.internal.remove(this._eliteGlow);
        } catch (e) { /* filters may already be gone */ }
        this._eliteGlow = null;
        if (this._aura) {
            this._aura.destroy();
            this._aura = null;
        }
        super.destroy(fromScene);
    }

    static _dmgTextPool = [];
    static _activeTexts = [];
    static MAX_DMG_TEXTS = 40;

    _showDamageNumber(value) {
        // 1. 화면 밖이면 스킵
        const cam = this.scene.cameras.main;
        const cx = this.x - cam.scrollX;
        const cy = this.y - cam.scrollY;
        if (cx < -50 || cx > cam.width + 50 || cy < -50 || cy > cam.height + 50) return;

        // 2. 같은 적에게 100ms 이내 재표시 방지
        const now = this.scene.time.now;
        if (this._lastDmgTextTime && now - this._lastDmgTextTime < 100) return;
        this._lastDmgTextTime = now;

        // 3. 동시 표시 상한
        if (Enemy._activeTexts.length >= Enemy.MAX_DMG_TEXTS) return;

        const isCrit = value > this.maxHp * 0.5;
        const x = this.x + Phaser.Math.Between(-10, 10);
        const y = this.y - 15;

        let text = Enemy._dmgTextPool.pop();
        if (text && text.scene) {
            text.setPosition(x, y);
            text.setText(isCrit ? value + '!' : String(value));
            text.setFontSize(isCrit ? '18px' : '14px');
            text.setColor(isCrit ? COLORS.TEXT_GOLD : COLORS.TEXT_WHITE);
            text.setAlpha(1).setVisible(true).setActive(true);
        } else {
            text = this.scene.add.text(x, y, isCrit ? value + '!' : String(value), {
                fontSize: isCrit ? '18px' : '14px',
                fontFamily: 'Arial',
                fontStyle: 'bold',
                color: isCrit ? COLORS.TEXT_GOLD : COLORS.TEXT_WHITE,
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5).setDepth(100);
        }

        text._startY = y;
        text._elapsed = 0;
        Enemy._activeTexts.push(text);
    }

    static updateDmgTexts(scene, delta) {
        const pool = Enemy._dmgTextPool;
        const active = Enemy._activeTexts;
        for (let i = active.length - 1; i >= 0; i--) {
            const t = active[i];
            if (!t || !t.scene) {
                active.splice(i, 1);
                continue;
            }
            t._elapsed += delta;
            const progress = t._elapsed / 500;
            if (progress >= 1) {
                t.setVisible(false).setActive(false);
                active.splice(i, 1);
                if (pool.length < 60) pool.push(t);
                else t.destroy();
            } else {
                t.y = t._startY - 30 * progress;
                t.alpha = 1 - progress;
            }
        }
    }
}
