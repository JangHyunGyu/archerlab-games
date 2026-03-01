import { GAME_WIDTH, GAME_HEIGHT, WORLD_SIZE, COLORS, BOSS_SCHEDULE, BOSS_TYPES } from '../utils/Constants.js';
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

        // Camera fade in
        this.cameras.main.fadeIn(500, 0, 0, 0);

        // Game state
        this.isGameOver = false;

        // Register shutdown cleanup
        this.events.on('shutdown', this.shutdown, this);

        // Intro system messages (원작: 시스템 메시지)
        this.time.delayedCall(500, () => {
            this.systemMessage.show('[시스템]', [
                '플레이어가 던전에 입장했습니다.',
                '마수를 처치하고 레벨을 올리세요.',
            ], { duration: 3000 });
        });

        this.time.delayedCall(4000, () => {
            this.systemMessage.show('[시스템]', [
                '일일 퀘스트가 주어질 예정입니다.',
                'TAB 키로 상태창을 확인할 수 있습니다.',
            ], { duration: 3000, type: 'quest' });
        });

        // Sound toggle key (M)
        this.input.keyboard.addKey('M').on('down', () => {
            const enabled = this.soundManager.toggleSound();
            this.systemMessage.show('[시스템]', [enabled ? '사운드: ON' : '사운드: OFF'], { duration: 1000 });
        });
    }

    update(time, delta) {
        if (this.isGameOver) return;

        // Update player
        this.player.update(time, delta);

        // Update enemies
        this.enemyManager.update(time, delta);

        // Update weapons
        this.weaponManager.update(time, delta);

        // Update XP orbs
        this.xpOrbPool.update(this.player);

        // Update items
        this.itemDropManager.update(this.player);

        // Update shadow army
        this.shadowArmyManager.update(time, delta);

        // Update bosses
        this._updateBosses(time, delta);

        // Check boss spawn schedule
        this._checkBossSpawns();

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
        this.ambientParticles = [];
        for (let i = 0; i < 30; i++) {
            const p = this.add.circle(
                Phaser.Math.Between(0, WORLD_SIZE),
                Phaser.Math.Between(0, WORLD_SIZE),
                Phaser.Math.Between(1, 2),
                COLORS.SHADOW_PRIMARY,
                Phaser.Math.FloatBetween(0.05, 0.15)
            ).setDepth(1);

            this.ambientParticles.push({
                obj: p,
                speedX: Phaser.Math.FloatBetween(-0.3, 0.3),
                speedY: Phaser.Math.FloatBetween(-0.5, -0.1),
            });
        }

        this.time.addEvent({
            delay: 50,
            loop: true,
            callback: () => {
                for (const p of this.ambientParticles) {
                    p.obj.x += p.speedX;
                    p.obj.y += p.speedY;
                    if (p.obj.y < 0) {
                        p.obj.y = WORLD_SIZE;
                        p.obj.x = Phaser.Math.Between(0, WORLD_SIZE);
                    }
                }
            },
        });
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
                this._spawnBoss(schedule.type);
            }
        }
    }

    _spawnBoss(bossKey) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 400;
        const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * dist, 100, WORLD_SIZE - 100);
        const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * dist, 100, WORLD_SIZE - 100);

        // Scale boss stats with game time difficulty
        const diffMult = this.enemyManager.difficultyMultiplier;
        const boss = new Boss(this, x, y, bossKey, diffMult);
        this.activeBosses.push(boss);

        if (this.soundManager) this.soundManager.play('bossAppear');

        // System message for boss
        const bossConfig = BOSS_TYPES[bossKey];
        this.systemMessage.show('[경고]', [
            '강력한 마수의 기운이 감지되었습니다!',
            `${bossConfig.name}이(가) 출현했습니다.`,
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
                const collider = this.physics.add.overlap(weapon.getProjectileGroup(), boss, (proj) => {
                    if (!proj.active || !boss.active) return;
                    const dmg = proj.damageAmount || weapon.getDamage();
                    boss.takeDamage(dmg, proj.x, proj.y);
                    if (this.soundManager) this.soundManager.play('hit');

                    if (key === 'shadowDagger') {
                        proj.setActive(false);
                        proj.setVisible(false);
                        proj.body.enable = false;
                    }
                });
                boss._weaponColliders.push(collider);
            }
        }
    }

    // Called when player acquires a new weapon to set up collision with existing bosses
    onWeaponAdded(key, weapon) {
        for (const boss of this.activeBosses) {
            if (!boss.active) continue;
            if (weapon.getProjectileGroup) {
                const collider = this.physics.add.overlap(weapon.getProjectileGroup(), boss, (proj) => {
                    if (!proj.active || !boss.active) return;
                    const dmg = proj.damageAmount || weapon.getDamage();
                    boss.takeDamage(dmg, proj.x, proj.y);
                    if (this.soundManager) this.soundManager.play('hit');

                    if (key === 'shadowDagger') {
                        proj.setActive(false);
                        proj.setVisible(false);
                        proj.body.enable = false;
                    }
                });
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
        if (this.soundManager) this.soundManager.play('levelup');

        // System message
        this.systemMessage.show('[시스템]', [
            `레벨이 올랐습니다! Lv.${this.player.level}`,
            '새로운 스킬을 선택하세요.',
        ], { duration: 2000, type: 'levelup' });

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

        this.systemMessage.show('[시스템]', [
            '플레이어가 사망했습니다.',
            '던전에서 퇴장합니다...',
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

    shutdown() {
        if (this.weaponManager) this.weaponManager.destroy();
        if (this.shadowArmyManager) this.shadowArmyManager.destroy();
        if (this.itemDropManager) this.itemDropManager.destroy();
        if (this.statusWindow) this.statusWindow.destroy();

        // Clean up active bosses
        if (this.activeBosses) {
            for (const boss of this.activeBosses) {
                if (boss._playerCollider) this.physics.world.removeCollider(boss._playerCollider);
                if (boss._weaponColliders) {
                    for (const c of boss._weaponColliders) this.physics.world.removeCollider(c);
                }
                if (boss.hpBarBg) boss.hpBarBg.destroy();
                if (boss.hpBarFill) boss.hpBarFill.destroy();
                if (boss.nameText) boss.nameText.destroy();
            }
            this.activeBosses = [];
        }
    }
}
