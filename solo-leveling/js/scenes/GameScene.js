import { GAME_WIDTH, GAME_HEIGHT, WORLD_SIZE, COLORS, PLAYER_BASE_STATS, RANKS, BOSS_SCHEDULE, BOSS_TYPES } from '../utils/Constants.js';
import { t } from '../utils/i18n.js';
import { Player } from '../entities/Player.js';
import { ShadowSoldier } from '../entities/ShadowSoldier.js';
import { EnemyManager } from '../managers/EnemyManager.js';
import { WeaponManager } from '../managers/WeaponManager.js';
import { ShadowArmyManager } from '../managers/ShadowArmyManager.js';
import { SoundManager } from '../managers/SoundManager.js';
import { XPOrbPool } from '../entities/XPOrb.js';
import { ItemDropManager } from '../entities/ItemDrop.js';
import { Boss } from '../entities/Boss.js';
import { Enemy } from '../entities/Enemy.js';
import { HUD } from '../ui/HUD.js';
import { SystemMessage } from '../ui/SystemMessage.js';
import { StatusWindow } from '../ui/StatusWindow.js';
import { MobileControls } from '../ui/MobileControls.js';
import { DEFAULT_CHARACTER_ID, getCharacter, getCharacterWeaponKeys, getStarterWeaponKey } from '../utils/Characters.js';

const SAVE_KEY = 'shadow_survival_save_v1';
const SAVE_VERSION = 1;
const AUTO_SAVE_INTERVAL_MS = 2000;

export class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    init(data = {}) {
        this._resumeRequested = !!data.resume;
        const savedData = this._resumeRequested ? GameScene.getSavedGameData() : null;
        this._selectedCharacterId = savedData?.player?.characterId || data.characterId || DEFAULT_CHARACTER_ID;
        this._restoredFromSave = false;
        this._lastAutoSaveAt = 0;
    }

    create() {
        const alLink = document.getElementById('archerlab-link');
        if (alLink) alLink.style.display = 'none';

        this.isGameOver = false;
        this._isBooting = true;
        this._startupTimers = [];

        this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

        if (!this.game._soundManager) {
            this.game._soundManager = new SoundManager();
            this.game._soundManager.init();
        }
        this.soundManager = this.game._soundManager;
        this.soundManager.stopIntroMusic();
        this.soundManager.resume();

        this.systemMessage = new SystemMessage(this);
        this._createStartupOverlay();
        this._createFloor();
        this._createEnvironmentProps();

        this.player = new Player(this, WORLD_SIZE / 2, WORLD_SIZE / 2, this._selectedCharacterId);
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
        this.cameras.main.setZoom(1);
        this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

        this.activeBosses = [];
        this.bossesSpawned = [];

        this.events.once('shutdown', this.shutdown, this);
        this._registerResizeHandler();

        this._runStartupSequence([
            {
                label: 'ORB CACHE',
                run: () => {
                    this.xpOrbPool = new XPOrbPool(this, {
                        initialSize: 24,
                        warmSize: 80,
                        batchSize: 12,
                        batchDelay: 70,
                        warmupDelay: 500,
                    });
                },
            },
            {
                label: 'ITEMS',
                run: () => {
                    this.itemDropManager = new ItemDropManager(this);
                },
            },
            {
                label: 'ENEMIES',
                run: () => {
                    this.enemyManager = new EnemyManager(this, {
                        initialPoolSize: 12,
                        warmPoolSize: 50,
                        warmBatchSize: 8,
                        warmBatchDelay: 70,
                        warmupDelay: 650,
                        openingWaveDelay: this._resumeRequested ? null : 1400,
                    });
                },
            },
            {
                label: 'WEAPONS',
                run: () => {
                    this.weaponManager = new WeaponManager(this, this.player);
                    this.weaponManager.addWeapon(getStarterWeaponKey(this.player.characterId));
                    this.shadowArmyManager = new ShadowArmyManager(this);
                },
            },
            {
                label: 'INTERFACE',
                run: () => {
                    this.mobileControls = new MobileControls(this);
                    this.statusWindow = new StatusWindow(this);
                    this.hud = new HUD(this);
                    this.physics.add.collider(this.player, this.enemyManager.getGroup());
                },
            },
            {
                label: 'SAVE DATA',
                run: () => {
                    if (this._resumeRequested) {
                        this._restoredFromSave = this._restoreSavedGame();
                        if (!this._restoredFromSave) GameScene.clearSavedGame();
                    } else {
                        GameScene.clearSavedGame();
                    }
                    this._registerSaveHandlers();
                },
            },
            {
                label: 'EFFECTS',
                run: () => {
                    this._createAmbientParticles();
                    this._setupCameraFilters();
                    this._setupColorTint();
                    this._setupVignette();
                },
            },
        ]);
    }

    _runStartupSequence(steps) {
        let index = 0;
        const total = steps.length;

        const runNext = () => {
            if (!this._isBooting) return;
            if (index >= total) {
                this._finishStartup();
                return;
            }

            const step = steps[index];
            this._setStartupProgress(index, total, step.label);
            try {
                step.run();
            } catch (e) {
                console.error('GameScene startup step failed:', step.label, e);
                throw e;
            }

            index += 1;
            this._setStartupProgress(index, total, step.label);
            const timer = this.time.delayedCall(step.delay ?? 32, runNext);
            this._startupTimers.push(timer);
        };

        const timer = this.time.delayedCall(0, runNext);
        this._startupTimers.push(timer);
    }

    _finishStartup() {
        if (!this._isBooting) return;
        this._isBooting = false;
        this._setStartupProgress(1, 1, 'READY');
        this._destroyStartupOverlay();

        this.cameras.main.fadeIn(500, 0, 0, 0);
        this.time.delayedCall(700, () => {
            if (this.soundManager && !this.isGameOver) this.soundManager.startGameBGM();
        });

        this._scheduleIntroMessages();
        this._setupSoundToggle();
    }

    _createStartupOverlay() {
        const cam = this.cameras.main;
        const w = Math.min(320, cam.width - 48);
        const h = 82;
        const cx = cam.width / 2;
        const cy = cam.height / 2;

        const bg = this.add.rectangle(cx, cy, cam.width, cam.height, 0x020308, 0.88)
            .setScrollFactor(0).setDepth(300);
        const panel = this.add.rectangle(cx, cy, w, h, 0x07101a, 0.94)
            .setScrollFactor(0).setDepth(301)
            .setStrokeStyle(1, 0x55dfff, 0.65);
        const title = this.add.text(cx, cy - 18, 'LOADING', {
            fontSize: '16px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#e8fbff',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(302);
        const label = this.add.text(cx, cy + 4, 'STARTUP', {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#7cdfff',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(302);
        const barW = w - 46;
        const barBg = this.add.rectangle(cx - barW / 2, cy + 24, barW, 4, 0x0b2433, 0.95)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
        const barFill = this.add.rectangle(cx - barW / 2, cy + 24, 1, 4, 0x55dfff, 1)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(303);

        this._startupOverlay = [bg, panel, title, label, barBg, barFill];
        this._startupLabel = label;
        this._startupProgressFill = barFill;
        this._startupProgressWidth = barW;
    }

    _setStartupProgress(done, total, label) {
        if (!this._startupProgressFill) return;
        const progress = Phaser.Math.Clamp(total > 0 ? done / total : 1, 0.02, 1);
        this._startupProgressFill.width = Math.max(1, this._startupProgressWidth * progress);
        if (this._startupLabel && label) this._startupLabel.setText(label);
    }

    _destroyStartupOverlay() {
        const elements = this._startupOverlay || [];
        if (elements.length === 0) return;

        this.tweens.add({
            targets: elements,
            alpha: 0,
            duration: 180,
            onComplete: () => {
                elements.forEach(el => {
                    if (el?.active) el.destroy();
                });
            },
        });

        this._startupOverlay = null;
        this._startupLabel = null;
        this._startupProgressFill = null;
    }

    _registerResizeHandler() {
        this._onGameResize = () => {
            this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
            if (this.hud) this.hud.rebuild();
            if (this.statusWindow && this.statusWindow.isOpen) {
                this.statusWindow.close();
                this.statusWindow.open();
            }
            if (this.mobileControls) {
                this.mobileControls.destroy();
                this.mobileControls = new MobileControls(this);
            }
            if (this._vignetteOverlay) {
                const cam = this.cameras.main;
                this._vignetteOverlay.setPosition(cam.width / 2, cam.height / 2);
                this._vignetteOverlay.setDisplaySize(cam.width * 1.15, cam.height * 1.15);
            }
            if (this._colorTint) {
                const cam = this.cameras.main;
                this._colorTint.setPosition(cam.width / 2, cam.height / 2);
                this._colorTint.setSize(cam.width, cam.height);
            }
            if (this._mobileDarken) {
                const cam = this.cameras.main;
                this._mobileDarken.setPosition(cam.width / 2, cam.height / 2);
                this._mobileDarken.setSize(cam.width, cam.height);
            }
        };
        this.events.on('game-resize', this._onGameResize, this);
    }

    _scheduleIntroMessages() {
        if (this._restoredFromSave) {
            this.time.delayedCall(500, () => {
                this.systemMessage.show(t('sysSystem'), [
                    t('resumeLoaded'),
                    `${t('levelLabel')} ${this.player.level} \u00b7 ${t('killLabel')} ${this.player.kills}`,
                ], { duration: 2400, type: 'quest' });
            });
        } else {
            this.time.delayedCall(500, () => {
                this.systemMessage.show(t('sysSystem'), [
                    t('sysEnterDungeon'),
                    t('sysKillToLevel'),
                ], { duration: 2400 });
            });

            this.time.delayedCall(3600, () => {
                this.systemMessage.show(t('sysSystem'), [
                    t('sysQuestComing'),
                    t('sysTabHint'),
                ], { duration: 2200, type: 'quest' });
            });
        }
    }

    _setupSoundToggle() {
        this._soundToggleKey = this.input.keyboard.addKey('M');
        this._soundToggleHandler = () => {
            const enabled = this.soundManager.toggleSound();
            this.systemMessage.show(t('sysSystem'), [enabled ? t('sysSoundOn') : t('sysSoundOff')], { duration: 1000 });
        };
        this._soundToggleKey.on('down', this._soundToggleHandler);
    }

    update(time, delta) {
        if (this.isGameOver || this._isBooting) return;
        if (!this.player || !this.enemyManager || !this.weaponManager || !this.xpOrbPool || !this.itemDropManager || !this.shadowArmyManager || !this.hud) return;

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
                // Drop overlay intensity so pixel-fill cost falls but shadow mood stays
                if (this._colorTint) this._colorTint.setAlpha(0.4);
                if (this._vignetteOverlay) this._vignetteOverlay.setAlpha(0.5);
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

        // Update damage texts (pooled, no tween)
        Enemy.updateDmgTexts(this, delta);

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

        this._autoSave(false);
    }

    _createFloor() {
        this.add.tileSprite(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 'floor_tile')
            .setDepth(0);

        const border = this.add.graphics();
        border.lineStyle(4, COLORS.SHADOW_PRIMARY, 0.5);
        border.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
        border.setDepth(1);
    }

    _createEnvironmentProps() {
        const propTypes = [
            { key: 'env_cracked_pillar', count: 12, minScale: 0.75, maxScale: 1.25, alpha: 0.62 },
            { key: 'env_rune_stone', count: 10, minScale: 0.7, maxScale: 1.15, alpha: 0.68 },
            { key: 'env_shadow_portal', count: 6, minScale: 0.65, maxScale: 1.0, alpha: 0.48 },
            { key: 'env_hanging_chain', count: 10, minScale: 0.6, maxScale: 1.1, alpha: 0.42 },
        ].filter(p => this.textures.exists(p.key));

        this.environmentProps = [];
        if (propTypes.length === 0) return;

        const center = WORLD_SIZE / 2;
        for (const prop of propTypes) {
            for (let i = 0; i < prop.count; i++) {
                let x = Phaser.Math.Between(140, WORLD_SIZE - 140);
                let y = Phaser.Math.Between(140, WORLD_SIZE - 140);

                if (Phaser.Math.Distance.Between(x, y, center, center) < 330) {
                    x += x < center ? -360 : 360;
                    y += y < center ? -220 : 220;
                    x = Phaser.Math.Clamp(x, 140, WORLD_SIZE - 140);
                    y = Phaser.Math.Clamp(y, 140, WORLD_SIZE - 140);
                }

                const shadow = this.add.ellipse(x, y + 24, 58, 14, 0x000000, 0.18)
                    .setDepth(1.8);
                const sprite = this.add.image(x, y, prop.key)
                    .setDepth(2)
                    .setAlpha(prop.alpha)
                    .setScale(Phaser.Math.FloatBetween(prop.minScale, prop.maxScale))
                    .setRotation(prop.key === 'env_shadow_portal' ? Phaser.Math.FloatBetween(-0.3, 0.3) : 0);

                if (prop.key === 'env_shadow_portal') {
                    sprite.setBlendMode(Phaser.BlendModes.ADD);
                    this.tweens.add({
                        targets: sprite,
                        alpha: prop.alpha + 0.16,
                        scale: sprite.scaleX * 1.06,
                        duration: Phaser.Math.Between(1400, 2200),
                        yoyo: true,
                        repeat: -1,
                    });
                }

                this.environmentProps.push(sprite, shadow);
            }
        }
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
            this._ambientFallbackTimer = this.time.addEvent({ delay: 50, loop: true, callback: () => {
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
    }

    _checkBossSpawns() {
        const gameTimeSec = this.enemyManager.getGameTime() / 1000;

        for (let i = 0; i < BOSS_SCHEDULE.length; i++) {
            const schedule = BOSS_SCHEDULE[i];
            if (gameTimeSec >= schedule.time && !this.bossesSpawned.includes(i)) {
                this.bossesSpawned.push(i);
                this._spawnBoss(schedule.type, schedule.hp, schedule.atkMult || 1);
            }
        }
    }

    _spawnBoss(bossKey, hp = null, atkMult = 1) {
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
        const boss = new Boss(this, x, y, bossKey, diffMult, hp, atkMult);
        this.activeBosses.push(boss);

        if (this.soundManager) this.soundManager.play('bossAppear');

        // System message for boss
        const bossConfig = BOSS_TYPES[bossKey];
        this.systemMessage.show(t('sysWarning'), [
            t('bossDetected'),
            `${bossConfig.name}${t('bossAppeared')}`,
        ], { duration: 3000, type: 'warning' });

        this._setupBossPlayerCollision(boss);

        // Weapon-boss collision for current weapons
        this._setupWeaponBossCollisions(boss);
    }

    _setupBossPlayerCollision(boss) {
        if (!boss || !this.player) return;

        boss._playerCollider = this.physics.add.collider(
            this.player,
            boss,
            () => {
                if (!boss.active || !this.player.active) return;
                this.player.takeDamage(boss.attack);
            },
            () => boss.active && this.player.active,
            this
        );
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
                const target = this.player.getHurtboxCenter?.() || this.player;
                boss.update(time, delta, target.x, target.y);
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
                if (boss.hpBarGfx) { boss.hpBarGfx.destroy(); boss.hpBarGfx = null; }
                if (boss.hpText) { boss.hpText.destroy(); boss.hpText = null; }
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


    onPlayerDeath() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        GameScene.clearSavedGame();

        if (this.soundManager) this.soundManager.play('gameOver');

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
                characterId: this.player.characterId,
                characterName: this.player.character?.name,
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
            this._bloomFilter.top.addThreshold(0.55, 1);
            this._bloomFilter.top.addBlur(0, 2.5, 2.5, 1.2);
            this._bloomFilter.blend.blendMode = Phaser.BlendModes.ADD;
            this._bloomFilter.blend.amount = 0.35;

            // ColorMatrix for a cool, desaturated shadow atmosphere.
            this._colorMatrix = cam.filters.internal.addColorMatrix();
            this._colorMatrix.colorMatrix.brightness(0.88);
            this._colorMatrix.colorMatrix.saturate(1.25);
            // Slight hue shift toward blue/purple (if supported); silently ignored if unavailable
            try { this._colorMatrix.colorMatrix.hue(-12); } catch (_) { /* hue optional */ }
        } catch (e) {
            console.warn('Camera filters not available:', e);
        }
    }

    // Screen-space purple tint overlay; mobile-safe and no WebGL filters required.
    // Keeps high-res AI sprites and retro DCSS tiles in the same "night dungeon" palette
    _setupColorTint() {
        try {
            const cam = this.cameras.main;
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
            this._colorTint = this.add.rectangle(
                cam.width / 2, cam.height / 2, cam.width, cam.height,
                isMobile ? 0x6f4a9d : 0xd5b8ee
            )
                .setScrollFactor(0)
                .setDepth(2.5)
                .setBlendMode(Phaser.BlendModes.MULTIPLY)
                .setAlpha(isMobile ? 0.52 : 0.38);

            if (isMobile) {
                this._mobileDarken = this.add.rectangle(
                    cam.width / 2, cam.height / 2, cam.width, cam.height,
                    0x01030a, 0.22
                )
                    .setScrollFactor(0)
                    .setDepth(2.6);
            }
        } catch (e) { /* tint overlay optional */ }
    }

    _setupVignette() {
        try {
            if (!this.textures.exists('vignette')) return;
            // Fixed-position vignette overlay; acts as player-centered torch light.
            // (camera follows player, so vignette center IS the player's screen position)
            // Slight over-scaling so dark edges reach past the canvas corners on wide aspects
            const cam = this.cameras.main;
            const scale = 1.15;
            this._vignetteOverlay = this.add.image(cam.width / 2, cam.height / 2, 'vignette')
                .setScrollFactor(0)
                .setDepth(90)
                .setDisplaySize(cam.width * scale, cam.height * scale)
                .setAlpha(0.52);
        } catch (e) { /* vignette not available */ }
    }

    _updateVignette() {
        if (!this._vignetteOverlay || !this.player) return;
        const hpRatio = this.player.stats.hp / this.player.stats.maxHp;
        if (hpRatio < 0.4) {
            // Low HP: vignette closes in and the tint warms.
            const intensity = 0.64 + (1 - hpRatio / 0.4) * 0.18;
            this._vignetteOverlay.setAlpha(intensity);
            if (this._colorTint) this._colorTint.fillColor = 0xeeb8a8;
            if (this._colorMatrix && hpRatio < 0.25) {
                try {
                    this._colorMatrix.colorMatrix.reset();
                    this._colorMatrix.colorMatrix.brightness(0.8);
                    this._colorMatrix.colorMatrix.saturate(0.75);
                } catch (e) { /* silent */ }
            }
        } else {
            this._vignetteOverlay.setAlpha(0.52);
            if (this._colorTint) this._colorTint.fillColor = 0xd5b8ee;
            if (this._colorMatrix) {
                try {
                    this._colorMatrix.colorMatrix.reset();
                    this._colorMatrix.colorMatrix.brightness(0.88);
                    this._colorMatrix.colorMatrix.saturate(1.25);
                    try { this._colorMatrix.colorMatrix.hue(-12); } catch (_) {}
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

    _registerSaveHandlers() {
        this._saveOnPageHide = () => this._autoSave(true);
        this._saveOnVisibilityChange = () => {
            if (document.hidden) this._autoSave(true);
        };
        window.addEventListener('pagehide', this._saveOnPageHide);
        document.addEventListener('visibilitychange', this._saveOnVisibilityChange);
    }

    _autoSave(force = false) {
        if (this.isGameOver || this._isBooting || !this.player || this.player.isDead) return;
        const now = Date.now();
        if (!force && now - this._lastAutoSaveAt < AUTO_SAVE_INTERVAL_MS) return;

        try {
            const snap = this._createSaveSnapshot(now);
            localStorage.setItem(SAVE_KEY, JSON.stringify(snap));
            this._lastAutoSaveAt = now;
        } catch (e) {
            // Storage can fail in private mode or quota pressure.
        }
    }

    _createSaveSnapshot(ts = Date.now()) {
        const player = this.player;
        const gameTime = this.enemyManager?.getGameTime?.() || 0;
        const weaponEntries = this.weaponManager
            ? Array.from(this.weaponManager.weapons.entries()).map(([key, weapon]) => ({
                key,
                level: weapon.level,
                damage: weapon.damage,
                cooldown: weapon.cooldown,
                count: weapon.count,
                cooldownTimer: weapon.cooldownTimer,
                extraRange: weapon.extraRange || 0,
                extraSlow: weapon.extraSlow || 0,
            }))
            : [];

        return {
            version: SAVE_VERSION,
            ts,
            player: {
                characterId: player.characterId,
                x: player.x,
                y: player.y,
                level: player.level,
                xp: player.xp,
                xpToNext: player.xpToNext,
                currentRank: player.currentRank,
                rankUpCount: player.rankUpCount || 0,
                hp: player.stats.hp,
                kills: player.kills,
                passiveLevels: { ...(player.passiveLevels || {}) },
            },
            weapons: weaponEntries,
            enemyManager: {
                gameTime,
                difficultyMultiplier: this.enemyManager?.difficultyMultiplier || 1,
                spawnTimer: this.enemyManager?.spawnTimer || 0,
                eliteTimer: this.enemyManager?.eliteTimer || 0,
                activeDungeonBreak: this.enemyManager?.activeDungeonBreak || null,
                triggeredBreaks: [...(this.enemyManager?.triggeredBreaks || [])],
                quests: JSON.parse(JSON.stringify(this.enemyManager?.quests || [])),
                lastQuestTime: this.enemyManager?.lastQuestTime || 0,
                killCounters: { ...(this.enemyManager?.killCounters || {}) },
                activeEnemies: this.enemyManager?.getActiveEnemySnapshots?.() || [],
            },
            bossesSpawned: [...(this.bossesSpawned || [])],
            activeBosses: (this.activeBosses || []).filter(b => b?.active).map(boss => ({
                bossKey: boss.bossKey,
                x: boss.x,
                y: boss.y,
                hp: boss.hp,
                maxHp: boss.maxHp,
                attack: boss.attack,
                speed: boss.speed,
                phase: boss.phase,
            })),
            shadows: this.shadowArmyManager?.getSoldiers?.()
                .filter(s => s?.active && !s._temporary)
                .map(soldier => ({
                    bossKey: soldier.bossKey,
                    x: soldier.x,
                    y: soldier.y,
                })) || [],
        };
    }

    _restoreSavedGame() {
        const data = GameScene.getSavedGameData();
        if (!GameScene._hasMeaningfulProgress(data)) return false;

        try {
            this._restorePlayer(data.player || {});
            this._restoreEnemyProgress(data.enemyManager || {});
            this._restoreEnemies(data.enemyManager?.activeEnemies || []);
            this.bossesSpawned = Array.isArray(data.bossesSpawned)
                ? data.bossesSpawned.filter(i => Number.isInteger(i))
                : [];
            this._restoreWeapons(data.weapons || []);
            this._restoreShadows(data.shadows || []);
            this._restoreBosses(data.activeBosses || []);
            return true;
        } catch (e) {
            if (window._sendGameError) {
                window._sendGameError(
                    'ResumeError',
                    e.message || String(e),
                    e.stack || '',
                    'GameScene:_restoreSavedGame',
                    { hasSavedData: !!data, savedAt: data?.ts || null }
                );
            }
            return false;
        }
    }

    _restorePlayer(saved) {
        const player = this.player;
        player.setPosition(
            Phaser.Math.Clamp(Number(saved.x) || WORLD_SIZE / 2, 80, WORLD_SIZE - 80),
            Phaser.Math.Clamp(Number(saved.y) || WORLD_SIZE / 2, 80, WORLD_SIZE - 80)
        );
        if (player.body) {
            player.body.enable = true;
            player.body.setVelocity(0, 0);
        }
        player.isDead = false;
        player.isInvincible = false;
        player.invincibleTimer = 0;
        player.setAlpha(1);
        player.clearTint();

        player.level = Phaser.Math.Clamp(Number(saved.level) || 1, 1, 30);
        player.xp = Math.max(0, Number(saved.xp) || 0);
        player.xpToNext = Math.max(1, Number(saved.xpToNext) || player.xpToNext);
        player.currentRank = RANKS[saved.currentRank] ? saved.currentRank : 'E';
        player.rankUpCount = Math.max(0, Number(saved.rankUpCount) || 0);
        player.kills = Math.max(0, Number(saved.kills) || 0);
        player.passiveLevels = { ...(saved.passiveLevels || {}) };

        player.stats = { ...(player.baseStats || PLAYER_BASE_STATS) };
        for (const statKey of Object.keys(player.baseStats || PLAYER_BASE_STATS)) {
            if (statKey !== 'hp' && typeof player._recalcStat === 'function') {
                player._recalcStat(statKey);
            }
        }
        player.stats.hp = Phaser.Math.Clamp(
            Number(saved.hp) || player.stats.maxHp,
            1,
            player.stats.maxHp
        );
        player._tempAtkBuff = 0;
    }

    _restoreEnemyProgress(saved) {
        const manager = this.enemyManager;
        if (!manager) return;
        manager.cancelOpeningWave?.();
        manager.gameTime = Math.max(0, Number(saved.gameTime) || 0);
        manager.difficultyMultiplier = Math.max(1, Number(saved.difficultyMultiplier) || 1);
        manager.spawnTimer = Math.max(0, Number(saved.spawnTimer) || 0);
        manager.eliteTimer = Math.max(0, Number(saved.eliteTimer) || 0);
        manager.triggeredBreaks = Array.isArray(saved.triggeredBreaks) ? [...saved.triggeredBreaks] : [];
        manager.quests = Array.isArray(saved.quests) ? JSON.parse(JSON.stringify(saved.quests)) : [];
        manager.lastQuestTime = Math.max(0, Number(saved.lastQuestTime) || 0);
        manager.killCounters = { ...(saved.killCounters || {}) };

        const activeBreak = saved.activeDungeonBreak;
        const seconds = manager.gameTime / 1000;
        manager.activeDungeonBreak = activeBreak && Number(activeBreak.endTime) > seconds
            ? { ...activeBreak }
            : null;
    }

    _restoreEnemies(savedEnemies) {
        if (!this.enemyManager?.restoreActiveEnemies) return;
        this.enemyManager.restoreActiveEnemies(savedEnemies);
    }

    _restoreWeapons(savedWeapons) {
        if (this.weaponManager) this.weaponManager.destroy();
        this.weaponManager = new WeaponManager(this, this.player);

        const allowedKeys = new Set(getCharacterWeaponKeys(this.player.characterId));
        const starterKey = getStarterWeaponKey(this.player.characterId);
        const list = Array.isArray(savedWeapons)
            ? savedWeapons.filter(w => allowedKeys.has(w?.key))
            : [];
        if (!list.some(w => w?.key === starterKey)) list.unshift({ key: starterKey });

        for (const saved of list) {
            if (!saved?.key || !this.weaponManager.addWeapon(saved.key)) continue;
            const weapon = this.weaponManager.weapons.get(saved.key);
            if (!weapon) continue;
            weapon.level = Phaser.Math.Clamp(Number(saved.level) || 1, 1, 10);
            if (Number.isFinite(saved.damage)) weapon.damage = saved.damage;
            if (Number.isFinite(saved.cooldown)) weapon.cooldown = saved.cooldown;
            if (Number.isFinite(saved.count)) weapon.count = saved.count;
            if (Number.isFinite(saved.cooldownTimer)) weapon.cooldownTimer = saved.cooldownTimer;
            if (Number.isFinite(saved.extraRange)) weapon.extraRange = saved.extraRange;
            if (Number.isFinite(saved.extraSlow)) weapon.extraSlow = saved.extraSlow;
        }
    }

    _restoreShadows(savedShadows) {
        if (!this.shadowArmyManager?.enabled || !Array.isArray(savedShadows)) return;
        this.shadowArmyManager.soldiers.forEach(s => { if (s?.scene) s.destroy(); });
        this.shadowArmyManager.soldiers = [];

        for (const saved of savedShadows.slice(0, this.shadowArmyManager.maxSoldiers)) {
            if (!saved?.bossKey || !BOSS_TYPES[saved.bossKey]) continue;
            const soldier = new ShadowSoldier(
                this,
                Phaser.Math.Clamp(Number(saved.x) || this.player.x, 80, WORLD_SIZE - 80),
                Phaser.Math.Clamp(Number(saved.y) || this.player.y, 80, WORLD_SIZE - 80),
                saved.bossKey
            );
            this.shadowArmyManager.soldiers.push(soldier);
        }
    }

    _restoreBosses(savedBosses) {
        if (!Array.isArray(savedBosses)) return;
        for (const saved of savedBosses) {
            if (!saved?.bossKey || !BOSS_TYPES[saved.bossKey]) continue;
            const boss = new Boss(
                this,
                Phaser.Math.Clamp(Number(saved.x) || this.player.x, 80, WORLD_SIZE - 80),
                Phaser.Math.Clamp(Number(saved.y) || this.player.y, 80, WORLD_SIZE - 80),
                saved.bossKey,
                1,
                Math.max(1, Number(saved.maxHp) || Number(saved.hp) || BOSS_TYPES[saved.bossKey].hp)
            );
            boss.maxHp = Math.max(1, Number(saved.maxHp) || boss.maxHp);
            boss.hp = Phaser.Math.Clamp(Number(saved.hp) || boss.maxHp, 1, boss.maxHp);
            if (Number.isFinite(saved.attack)) boss.attack = saved.attack;
            if (Number.isFinite(saved.speed)) boss.speed = saved.speed;
            boss.phase = saved.phase === 2 ? 2 : 1;

            this._setupBossPlayerCollision(boss);
            this.activeBosses.push(boss);
            this._setupWeaponBossCollisions(boss);
        }
    }

    static clearSavedGame() {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    }

    static getSavedGameData() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return data?.version === SAVE_VERSION ? data : null;
        } catch (e) {
            return null;
        }
    }

    static _hasMeaningfulProgress(data) {
        if (!data?.player) return false;
        const timeSec = Math.floor((data.enemyManager?.gameTime || 0) / 1000);
        return timeSec >= 5
            || (data.player.kills || 0) > 0
            || (data.player.level || 1) > 1
            || (Array.isArray(data.weapons) && data.weapons.length > 1)
            || (Array.isArray(data.shadows) && data.shadows.length > 0)
            || (Array.isArray(data.activeBosses) && data.activeBosses.length > 0);
    }

    static hasSavedGame() {
        return GameScene._hasMeaningfulProgress(GameScene.getSavedGameData());
    }

    static getSavedSummary() {
        const data = GameScene.getSavedGameData();
        if (!GameScene._hasMeaningfulProgress(data)) return null;
        return {
            level: data.player.level || 1,
            kills: data.player.kills || 0,
            timeSec: Math.floor((data.enemyManager?.gameTime || 0) / 1000),
            characterId: data.player.characterId || DEFAULT_CHARACTER_ID,
            characterName: getCharacter(data.player.characterId).name,
        };
    }

    shutdown() {
        try {
            if (!this.isGameOver) this._autoSave(true);

            if (this._startupTimers) {
                for (const timer of this._startupTimers) {
                    try { timer.remove(false); } catch (e) { /* already removed */ }
                }
                this._startupTimers = [];
            }
            if (this._startupOverlay) {
                this._startupOverlay.forEach(el => { if (el?.active) el.destroy(); });
                this._startupOverlay = null;
                this._startupLabel = null;
                this._startupProgressFill = null;
            }

            if (this._saveOnPageHide) {
                window.removeEventListener('pagehide', this._saveOnPageHide);
                this._saveOnPageHide = null;
            }
            if (this._saveOnVisibilityChange) {
                document.removeEventListener('visibilitychange', this._saveOnVisibilityChange);
                this._saveOnVisibilityChange = null;
            }

            if (this._onGameResize) {
                this.events.off('game-resize', this._onGameResize, this);
                this._onGameResize = null;
            }
            if (this._soundToggleKey && this._soundToggleHandler) {
                this._soundToggleKey.off('down', this._soundToggleHandler);
                this._soundToggleHandler = null;
                this._soundToggleKey = null;
            }

            // Stop game BGM
            if (this.soundManager) this.soundManager.stopGameBGM();
            if (this.weaponManager) this.weaponManager.destroy();
            if (this.shadowArmyManager) this.shadowArmyManager.destroy();
            if (this.itemDropManager) this.itemDropManager.destroy();
            if (this.xpOrbPool) this.xpOrbPool.destroy();
            if (this.enemyManager) this.enemyManager.destroy();
            if (this.statusWindow) this.statusWindow.destroy();
            if (this.mobileControls) this.mobileControls.destroy();
            if (this.systemMessage) this.systemMessage.destroy();
            if (this.hud) this.hud.destroy();
            if (this.player) this.player.destroy();

            // Clean up filters
            try {
                if (this._bloomFilter) this.cameras.main.filters.internal.remove(this._bloomFilter);
                if (this._colorMatrix) this.cameras.main.filters.internal.remove(this._colorMatrix);
                if (this._levelUpBlur) this.cameras.main.filters.internal.remove(this._levelUpBlur);
            } catch (e) { /* filters cleanup */ }

            if (this._ambientFallbackTimer) { this._ambientFallbackTimer.destroy(); this._ambientFallbackTimer = null; }
            if (this._ambientFallback) {
                this._ambientFallback.forEach(p => { if (p.obj && p.obj.active) p.obj.destroy(); });
                this._ambientFallback = null;
            }
            if (this.ambientEmitter) { this.ambientEmitter.destroy(); this.ambientEmitter = null; }
            if (this.environmentProps) {
                this.environmentProps.forEach(prop => {
                    if (this.tweens) this.tweens.killTweensOf(prop);
                    if (prop?.active) prop.destroy();
                });
                this.environmentProps = null;
            }

            if (this._vignetteOverlay) { this._vignetteOverlay.destroy(); this._vignetteOverlay = null; }
            if (this._colorTint) { this._colorTint.destroy(); this._colorTint = null; }

            if (this.activeBosses && this.physics?.world) {
                for (const boss of this.activeBosses) {
                    try {
                        if (boss._playerCollider) this.physics.world.removeCollider(boss._playerCollider);
                        if (boss._weaponColliders) {
                            for (const c of boss._weaponColliders) this.physics.world.removeCollider(c);
                        }
                    } catch (e) { /* already removed */ }
                    if (boss.hpBarGfx) { boss.hpBarGfx.destroy(); boss.hpBarGfx = null; }
                    if (boss.hpText) { boss.hpText.destroy(); boss.hpText = null; }
                    if (boss.nameText) { boss.nameText.destroy(); boss.nameText = null; }
                    if (this.tweens) this.tweens.killTweensOf(boss);
                    if (boss.scene) boss.destroy();
                }
                this.activeBosses = [];
            }

            this.weaponManager = null;
            this.shadowArmyManager = null;
            this.itemDropManager = null;
            this.xpOrbPool = null;
            this.enemyManager = null;
            this.statusWindow = null;
            this.mobileControls = null;
            this.systemMessage = null;
            this.hud = null;
            this.player = null;
            this.bossesSpawned = [];
        } catch (e) {
            console.warn('GameScene shutdown error:', e);
        }
    }
}
