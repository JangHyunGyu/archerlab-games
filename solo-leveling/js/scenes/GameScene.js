import { GAME_WIDTH, GAME_HEIGHT, WORLD_SIZE, COLORS, BOSS_SCHEDULE, BOSS_TYPES } from '../utils/Constants.js';
import { t } from '../utils/i18n.js';
import { Player } from '../entities/Player.js';
import { EnemyManager } from '../managers/EnemyManager.js';
import { WeaponManager } from '../managers/WeaponManager.js';
import { ShadowArmyManager } from '../managers/ShadowArmyManager.js';
import { SoundManager } from '../managers/SoundManager.js';
import { XPOrbPool } from '../entities/XPOrb.js';
import { ItemDropManager } from '../entities/ItemDrop.js';
import { Boss } from '../entities/Boss.js';
import { HUD } from '../ui/HUD.js';
import { SystemMessage } from '../ui/SystemMessage.js';
import { StatusWindow } from '../ui/StatusWindow.js';
import { MobileControls } from '../ui/MobileControls.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    create() {
        // World bounds
        this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

        // Sound Manager (global singleton)
        if (!this.game._soundManager) {
            this.game._soundManager = new SoundManager();
            this.game._soundManager.init();
        }
        this.soundManager = this.game._soundManager;
        this.soundManager.resume();
        // Stop intro music, start game BGM
        this.soundManager.stopIntroMusic();
        this.soundManager.startGameBGM();

        // System Message UI
        this.systemMessage = new SystemMessage(this);

        // Create floor
        this._createFloor();

        // XP Orb Pool
        this.xpOrbPool = new XPOrbPool(this);

        // Item Drop Manager
        this.itemDropManager = new ItemDropManager(this);

        // Player
        this.player = new Player(this, WORLD_SIZE / 2, WORLD_SIZE / 2);

        // Camera follows player
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
        this.cameras.main.setZoom(1);
        this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

        // Boss tracking (must be before WeaponManager: addWeapon calls onWeaponAdded which iterates activeBosses)
        this.activeBosses = [];
        this.bossesSpawned = [];

        // Enemy Manager
        this.enemyManager = new EnemyManager(this);

        // Weapon Manager - start with shadow slash (원작: 성진우는 단검을 근접으로 사용)
        this.weaponManager = new WeaponManager(this, this.player);
        this.weaponManager.addWeapon('basicDagger');

        // Shadow Army Manager
        this.shadowArmyManager = new ShadowArmyManager(this);

        // Mobile Controls
        this.mobileControls = new MobileControls(this);

        // Status Window (Tab key)
        this.statusWindow = new StatusWindow(this);

        // HUD (must be last UI element)
        this.hud = new HUD(this);

        // Player-Enemy collision
        this.physics.add.overlap(this.player, this.enemyManager.getGroup(), this._onPlayerHitEnemy, null, this);

        // Ambient particles
        this._createAmbientParticles();

        // === Phaser 4 Filters (WebGL only) ===
        this._setupCameraFilters();
        this._setupVignette();

        // Camera fade in
        this.cameras.main.fadeIn(500, 0, 0, 0);

        // Game state
        this.isGameOver = false;

        // Register shutdown cleanup
        this.events.on('shutdown', this.shutdown, this);

        // Intro system messages (원작: 시스템 메시지)
        this.time.delayedCall(500, () => {
            this.systemMessage.show(t('sysSystem'), [
                t('sysEnterDungeon'),
                t('sysKillToLevel'),
            ], { duration: 3000 });
        });

        this.time.delayedCall(4000, () => {
            this.systemMessage.show(t('sysSystem'), [
                t('sysQuestComing'),
                t('sysTabHint'),
            ], { duration: 3000, type: 'quest' });
        });

        // Sound toggle key (M)
        this.input.keyboard.addKey('M').on('down', () => {
            const enabled = this.soundManager.toggleSound();
            this.systemMessage.show(t('sysSystem'), [enabled ? t('sysSoundOn') : t('sysSoundOff')], { duration: 1000 });
        });
    }

    update(time, delta) {
        if (this.isGameOver) return;

        // 30-minute victory condition
        if (this.enemyManager.getGameTime() >= 1800000 && !this._victoryTriggered) {
            this._victoryTriggered = true;
            this._onVictory();
            return;
        }

        // Auto quality adjustment based on FPS
        this._fpsCheckTimer = (this._fpsCheckTimer || 0) + delta;
        if (this._fpsCheckTimer > 3000) {
            this._fpsCheckTimer = 0;
            const fps = this.game.loop.actualFps;
            if (fps < 25 && !this._lowQuality) {
                this._lowQuality = true;
                // Disable heavy filters
                try {
                    if (this._bloomFilter) { this.cameras.main.filters.internal.remove(this._bloomFilter); this._bloomFilter = null; }
                    if (this._colorMatrix) { this.cameras.main.filters.internal.remove(this._colorMatrix); this._colorMatrix = null; }
                } catch (e) {}
                // Disable ambient particles
                if (this.ambientEmitter) { this.ambientEmitter.destroy(); this.ambientEmitter = null; }
            }
        }

        // Update player
        this.player.update(time, delta);

        // Update enemies
        this.enemyManager.update(time, delta);

        // Update weapons
        this.weaponManager.update(time, delta);

        // Update XP orbs
        this.xpOrbPool.update(this.player);

        // Update items
        this.itemDropManager.update(this.player, delta);

        // Update shadow army
        this.shadowArmyManager.update(time, delta);

        // Update bosses
        this._updateBosses(time, delta);

        // Check boss spawn schedule
        this._checkBossSpawns();

        // Update ambient emitter to follow player
        if (this.ambientEmitter) {
            this.ambientEmitter.setPosition(this.player.x, this.player.y);
        }

        // Update vignette (dynamic HP-based intensity)
        this._updateVignette();

        // Update HUD
        this.hud.update(this.player, this.weaponManager, this.enemyManager, this.shadowArmyManager);
    }

    _createFloor() {
        this.add.tileSprite(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 'floor_tile')
            .setDepth(0);

        const border = this.add.graphics();
        border.lineStyle(4, COLORS.SHADOW_PRIMARY, 0.5);
        border.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
        border.setDepth(1);
    }

    _createAmbientParticles() {
        try {
            // Floating shadow embers around world center (repositioned in update)
            this.ambientEmitter = this.add.particles(WORLD_SIZE / 2, WORLD_SIZE / 2, 'particle_glow', {
                x: { min: -600, max: 600 },
                y: { min: -600, max: 600 },
                speed: { min: 5, max: 25 },
                angle: { min: 250, max: 290 },
                scale: { start: 0.4, end: 0.1 },
                alpha: { start: 0.2, end: 0 },
                lifespan: { min: 3000, max: 6000 },
                tint: [COLORS.SHADOW_PRIMARY, 0x4400aa, 0x220044],
                blendMode: 'ADD',
                frequency: 150,
                quantity: 1,
            });
            this.ambientEmitter.setDepth(1);
        } catch (e) {
            // Fallback to manual particles
            this._ambientFallback = [];
            for (let i = 0; i < 30; i++) {
                const p = this.add.circle(
                    Phaser.Math.Between(0, WORLD_SIZE), Phaser.Math.Between(0, WORLD_SIZE),
                    Phaser.Math.Between(1, 2), COLORS.SHADOW_PRIMARY, Phaser.Math.FloatBetween(0.05, 0.15)
                ).setDepth(1);
                this._ambientFallback.push({ obj: p, sx: Phaser.Math.FloatBetween(-0.3, 0.3), sy: Phaser.Math.FloatBetween(-0.5, -0.1) });
            }
            this.time.addEvent({ delay: 50, loop: true, callback: () => {
                for (const p of this._ambientFallback) {
                    p.obj.x += p.sx; p.obj.y += p.sy;
                    if (p.obj.y < 0) { p.obj.y = WORLD_SIZE; p.obj.x = Phaser.Math.Between(0, WORLD_SIZE); }
                }
            }});
        }
    }

    _onPlayerHitEnemy(player, enemy) {
        if (!enemy.active || !player.active) return;
        if (enemy.isBoss) return;
        player.takeDamage(enemy.attack);
        if (this.soundManager) this.soundManager.play('playerHit');
    }

    _checkBossSpawns() {
        const gameTimeSec = this.enemyManager.getGameTime() / 1000;

        for (let i = 0; i < BOSS_SCHEDULE.length; i++) {
            const schedule = BOSS_SCHEDULE[i];
            if (gameTimeSec >= schedule.time && !this.bossesSpawned.includes(i)) {
                this.bossesSpawned.push(i);
                this._spawnBoss(schedule.type, schedule.hpMult || 1, schedule.atkMult || 1);
            }
        }
    }

    _spawnBoss(bossKey, hpMult = 1, atkMult = 1) {
        // Spawn boss just outside visible screen
        const cam = this.cameras.main;
        const halfW = (cam.width / cam.zoom) / 2 + 120;
        const halfH = (cam.height / cam.zoom) / 2 + 120;
        const edge = Phaser.Math.Between(0, 3);
        let x, y;
        switch (edge) {
            case 0: x = this.player.x + Phaser.Math.Between(-halfW, halfW); y = this.player.y - halfH; break;
            case 1: x = this.player.x + Phaser.Math.Between(-halfW, halfW); y = this.player.y + halfH; break;
            case 2: x = this.player.x - halfW; y = this.player.y + Phaser.Math.Between(-halfH, halfH); break;
            case 3: x = this.player.x + halfW; y = this.player.y + Phaser.Math.Between(-halfH, halfH); break;
        }
        x = Phaser.Math.Clamp(x, 100, WORLD_SIZE - 100);
        y = Phaser.Math.Clamp(y, 100, WORLD_SIZE - 100);

        // Boss uses sqrt of difficulty (bosses already have high base stats)
        const diffMult = Math.sqrt(this.enemyManager.difficultyMultiplier);
        const boss = new Boss(this, x, y, bossKey, diffMult, hpMult, atkMult);
        this.activeBosses.push(boss);

        if (this.soundManager) this.soundManager.play('bossAppear');

        // System message for boss
        const bossConfig = BOSS_TYPES[bossKey];
        this.systemMessage.show(t('sysWarning'), [
            t('bossDetected'),
            `${bossConfig.name}${t('bossAppeared')}`,
        ], { duration: 3000, type: 'warning' });

        // Boss-player collision (with active check, store collider for cleanup)
        const bossCollider = this.physics.add.overlap(this.player, boss, () => {
            if (!boss.active || !this.player.active) return;
            this.player.takeDamage(boss.attack);
        });
        boss._playerCollider = bossCollider;

        // Weapon-boss collision for current weapons
        this._setupWeaponBossCollisions(boss);
    }

    _setupWeaponBossCollisions(boss) {
        if (!boss._weaponColliders) boss._weaponColliders = [];
        for (const [key, weapon] of this.weaponManager.weapons) {
            if (weapon.getProjectileGroup) {
                const collider = this.physics.add.overlap(
                    weapon.getProjectileGroup(), boss,
                    (objA, objB) => {
                        // Phaser may swap argument order; identify which is proj vs boss
                        const proj = (objA === boss) ? objB : objA;
                        if (!proj.active || !boss.active) return;
                        if (boss.isInvincible) return;
                        const dmg = proj.damageAmount || weapon.getDamage();
                        boss.takeDamage(dmg);
                        if (this.soundManager) this.soundManager.play('hit');

                        // Deactivate projectile after hitting boss
                        proj.setActive(false);
                        proj.setVisible(false);
                        if (proj.body) proj.body.enable = false;
                    },
                    // processCallback: only process if both are active and proj body enabled
                    (objA, objB) => {
                        const proj = (objA === boss) ? objB : objA;
                        return proj.active && proj.body && proj.body.enable && boss.active && !boss.isInvincible;
                    },
                    this
                );
                boss._weaponColliders.push(collider);
            }
        }
    }

    // Called when player acquires a new weapon to set up collision with existing bosses
    onWeaponAdded(key, weapon) {
        for (const boss of this.activeBosses) {
            if (!boss.active) continue;
            if (weapon.getProjectileGroup) {
                const collider = this.physics.add.overlap(
                    weapon.getProjectileGroup(), boss,
                    (objA, objB) => {
                        const proj = (objA === boss) ? objB : objA;
                        if (!proj.active || !boss.active) return;
                        if (boss.isInvincible) return;
                        const dmg = proj.damageAmount || weapon.getDamage();
                        boss.takeDamage(dmg);
                        if (this.soundManager) this.soundManager.play('hit');

                        // Deactivate projectile after hitting boss
                        proj.setActive(false);
                        proj.setVisible(false);
                        if (proj.body) proj.body.enable = false;
                    },
                    (objA, objB) => {
                        const proj = (objA === boss) ? objB : objA;
                        return proj.active && proj.body && proj.body.enable && boss.active && !boss.isInvincible;
                    },
                    this
                );
                if (!boss._weaponColliders) boss._weaponColliders = [];
                boss._weaponColliders.push(collider);
            }
        }
    }

    _updateBosses(time, delta) {
        for (let i = this.activeBosses.length - 1; i >= 0; i--) {
            const boss = this.activeBosses[i];
            if (boss.active) {
                boss.update(time, delta, this.player.x, this.player.y);
            } else {
                // Clean up colliders when boss is removed
                if (boss._playerCollider) {
                    this.physics.world.removeCollider(boss._playerCollider);
                }
                if (boss._weaponColliders) {
                    for (const c of boss._weaponColliders) {
                        this.physics.world.removeCollider(c);
                    }
                }
                // Safety: clean up HP bar if not already destroyed
                if (boss.hpBarBg) { boss.hpBarBg.destroy(); boss.hpBarBg = null; }
                if (boss.hpBarFill) { boss.hpBarFill.destroy(); boss.hpBarFill = null; }
                if (boss.nameText) { boss.nameText.destroy(); boss.nameText = null; }
                this.activeBosses.splice(i, 1);
            }
        }
    }

    onLevelUp() {
        // Prevent double-launch if LevelUpScene is already running
        if (this._levelUpActive) return;
        this._levelUpActive = true;

        if (this.soundManager) this.soundManager.play('levelup');

        // System message
        this.systemMessage.show(t('sysSystem'), [
            `${t('levelUpMsg')} Lv.${this.player.level}`,
            t('newSkill'),
        ], { duration: 2000, type: 'levelup' });

        // Add blur to camera while paused
        this._addLevelUpBlur();

        // Pause game and show level up screen
        this.scene.pause();
        this.scene.launch('LevelUpScene', {
            gameScene: this,
            player: this.player,
            weaponManager: this.weaponManager,
        });
    }

    _onVictory() {
        this.isGameOver = true;

        this.systemMessage.show(t('sysSystem'), [
            t('victory'),
        ], { duration: 3000, type: 'levelup' });

        // Flash white then fade
        this.cameras.main.flash(1000, 123, 47, 255);
        this.cameras.main.fadeOut(2500, 10, 0, 26);

        this.time.delayedCall(2500, () => {
            this.scene.start('GameOverScene', {
                victory: true,
                level: this.player.level,
                rank: this.player.currentRank,
                kills: this.player.kills,
                time: Math.floor(this.enemyManager.getGameTime() / 1000),
                shadowCount: this.shadowArmyManager.getSoldierCount(),
            });
        });
    }

    onPlayerDeath() {
        if (this.isGameOver) return;
        this.isGameOver = true;

        this.systemMessage.show(t('sysSystem'), [
            t('playerDied'),
            t('exitDungeon'),
        ], { duration: 2000, type: 'warning' });

        this.cameras.main.shake(500, 0.02);
        this.cameras.main.fadeOut(1500, 20, 0, 0);

        this.time.delayedCall(1500, () => {
            this.scene.start('GameOverScene', {
                level: this.player.level,
                rank: this.player.currentRank,
                kills: this.player.kills,
                time: Math.floor(this.enemyManager.getGameTime() / 1000),
                shadowCount: this.shadowArmyManager.getSoldierCount(),
            });
        });
    }

    // === FILTER SETUP ===

    _setupCameraFilters() {
        // Skip heavy filters on low-end devices (mobile or low pixel ratio)
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window);
        if (isMobile) return;

        try {
            const cam = this.cameras.main;

            // Bloom effect via ParallelFilters (bright areas glow)
            this._bloomFilter = cam.filters.internal.addParallelFilters();
            this._bloomFilter.top.addThreshold(0.6, 1);
            this._bloomFilter.top.addBlur(0, 2, 2, 1);
            this._bloomFilter.blend.blendMode = Phaser.BlendModes.ADD;
            this._bloomFilter.blend.amount = 0.25;

            // ColorMatrix for dungeon atmosphere
            this._colorMatrix = cam.filters.internal.addColorMatrix();
            this._colorMatrix.colorMatrix.brightness(0.92);
            this._colorMatrix.colorMatrix.saturate(1.1);
        } catch (e) {
            console.warn('Camera filters not available:', e);
        }
    }

    _setupVignette() {
        try {
            if (!this.textures.exists('vignette')) return;
            // Fixed-position vignette overlay
            this._vignetteOverlay = this.add.image(
                this.cameras.main.width / 2,
                this.cameras.main.height / 2,
                'vignette'
            )
                .setScrollFactor(0)
                .setDepth(90)
                .setDisplaySize(this.cameras.main.width, this.cameras.main.height)
                .setAlpha(0.4);
        } catch (e) { /* vignette not available */ }
    }

    _updateVignette() {
        if (!this._vignetteOverlay || !this.player) return;
        // Intensify vignette when HP is low
        const hpRatio = this.player.stats.hp / this.player.stats.maxHp;
        if (hpRatio < 0.4) {
            // Low HP: stronger vignette (0.4 → 0.85 as HP drops to 0)
            const intensity = 0.4 + (1 - hpRatio / 0.4) * 0.45;
            this._vignetteOverlay.setAlpha(intensity);
            // Desaturate + redden camera when very low HP
            if (this._colorMatrix && hpRatio < 0.25) {
                try {
                    this._colorMatrix.colorMatrix.reset();
                    this._colorMatrix.colorMatrix.brightness(0.85);
                    this._colorMatrix.colorMatrix.saturate(0.7);
                } catch (e) { /* silent */ }
            }
        } else {
            this._vignetteOverlay.setAlpha(0.4);
            // Reset color matrix to normal
            if (this._colorMatrix) {
                try {
                    this._colorMatrix.colorMatrix.reset();
                    this._colorMatrix.colorMatrix.brightness(0.92);
                    this._colorMatrix.colorMatrix.saturate(1.1);
                } catch (e) { /* silent */ }
            }
        }
    }

    _addLevelUpBlur() {
        try {
            if (!this._levelUpBlur) {
                this._levelUpBlur = this.cameras.main.filters.internal.addBlur(0, 2, 2, 1);
            }
            this._levelUpBlur.setActive(true);
        } catch (e) { /* blur not available */ }
    }

    removeLevelUpBlur() {
        try {
            if (this._levelUpBlur) {
                this._levelUpBlur.setActive(false);
            }
        } catch (e) { /* silent */ }
    }

    shutdown() {
        try {
            // Stop game BGM
            if (this.soundManager) this.soundManager.stopGameBGM();
            if (this.weaponManager) this.weaponManager.destroy();
            if (this.shadowArmyManager) this.shadowArmyManager.destroy();
            if (this.itemDropManager) this.itemDropManager.destroy();
            if (this.statusWindow) this.statusWindow.destroy();

            // Clean up filters
            try {
                if (this._bloomFilter) this.cameras.main.filters.internal.remove(this._bloomFilter);
                if (this._colorMatrix) this.cameras.main.filters.internal.remove(this._colorMatrix);
                if (this._levelUpBlur) this.cameras.main.filters.internal.remove(this._levelUpBlur);
            } catch (e) { /* filters cleanup */ }

            if (this._vignetteOverlay) { this._vignetteOverlay.destroy(); this._vignetteOverlay = null; }

            if (this.activeBosses && this.physics?.world) {
                for (const boss of this.activeBosses) {
                    try {
                        if (boss._playerCollider) this.physics.world.removeCollider(boss._playerCollider);
                        if (boss._weaponColliders) {
                            for (const c of boss._weaponColliders) this.physics.world.removeCollider(c);
                        }
                    } catch (e) { /* already removed */ }
                    if (boss.hpBarBg) boss.hpBarBg.destroy();
                    if (boss.hpBarFill) boss.hpBarFill.destroy();
                    if (boss.nameText) boss.nameText.destroy();
                }
                this.activeBosses = [];
            }
        } catch (e) {
            console.warn('GameScene shutdown error:', e);
        }
    }
}
