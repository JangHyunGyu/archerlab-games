import { ENEMY_TYPES, WAVE_CONFIG, GAME_WIDTH, GAME_HEIGHT, WORLD_SIZE } from '../utils/Constants.js';
import { Enemy } from '../entities/Enemy.js';

const MAX_RESTORED_ENEMIES = 500;

export class EnemyManager {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.pool = scene.physics.add.group({
            classType: Enemy,
            runChildUpdate: false,
        });
        this._warmPoolTarget = options.warmPoolSize ?? 50;
        this._warmBatchSize = options.warmBatchSize ?? 8;
        this._warmBatchDelay = options.warmBatchDelay ?? 70;
        this._warmPoolTimer = null;

        this._createInactiveEnemies(Math.min(options.initialPoolSize ?? 50, this._warmPoolTarget));

        this.spawnTimer = WAVE_CONFIG.baseSpawnInterval * 0.75;
        this.eliteTimer = 0;
        this.gameTime = 0;
        this.difficultyMultiplier = 1;

        // Dungeon Break system
        this.dungeonBreakSchedule = [
            { time: 90,  duration: 15, multiplier: 2.5, name: 'D급 게이트' },
            { time: 240, duration: 20, multiplier: 3.0, name: 'C급 게이트' },
            { time: 420, duration: 25, multiplier: 4.0, name: 'B급 게이트' },
            { time: 600, duration: 30, multiplier: 5.0, name: 'A급 게이트' },
        ];
        this.activeDungeonBreak = null;
        this.triggeredBreaks = [];

        // Quest system
        this.quests = [];
        this.questCheckTimer = 0;
        this.lastQuestTime = 0;

        // Quest definitions
        this.questTemplates = [
            { type: 'kill', target: 20, description: '적 20마리 처치', reward: 50 },
            { type: 'kill', target: 50, description: '적 50마리 처치', reward: 150 },
            { type: 'survive', target: 30, description: '30초 동안 생존', reward: 80 },
            { type: 'killType', targetType: 'orc', target: 5, description: '오크 5마리 처치', reward: 100 },
            { type: 'killType', targetType: 'antSoldier', target: 10, description: '개미 병사 10마리 처치', reward: 80 },
        ];
        this.killCounters = {};

        // Cached arrays for getAllEnemies/getActiveEnemies (invalidated each frame)
        this._cachedActiveEnemies = null;
        this._activeEnemiesDirtyFrame = -1;

        if (this.pool.getLength() < this._warmPoolTarget) {
            this._warmPoolTimer = scene.time.delayedCall(options.warmupDelay ?? 650, () => this._warmPool());
        }

        const openingWaveDelay = options.openingWaveDelay ?? 320;
        if (Number.isFinite(openingWaveDelay) && openingWaveDelay >= 0) {
            this._openingWaveTimer = scene.time.delayedCall(openingWaveDelay, () => {
                this._openingWaveTimer = null;
                this._spawnOpeningWave();
            });
        } else {
            this._openingWaveTimer = null;
        }
    }

    _createInactiveEnemy() {
        const enemy = new Enemy(this.scene, -100, -100);
        enemy.setActive(false);
        enemy.setVisible(false);
        enemy.body.enable = false;
        this.pool.add(enemy);
        return enemy;
    }

    _createInactiveEnemies(count) {
        for (let i = 0; i < count; i++) {
            this._createInactiveEnemy();
        }
    }

    _warmPool() {
        if (!this.scene || !this.pool) return;
        const remaining = this._warmPoolTarget - this.pool.getLength();
        if (remaining <= 0) {
            this._warmPoolTimer = null;
            return;
        }

        this._createInactiveEnemies(Math.min(this._warmBatchSize, remaining));
        this._warmPoolTimer = this.scene.time.delayedCall(this._warmBatchDelay, () => this._warmPool());
    }

    update(time, delta) {
        this.gameTime += delta;
        const minutes = this.gameTime / 60000;
        const seconds = this.gameTime / 1000;

        // Update difficulty: linear base + late-game acceleration
        // Fewer enemies on screen → each one is individually tougher
        this.difficultyMultiplier = 1 + minutes * 0.30 + Math.pow(minutes / 25, 2) * 3;

        // Check dungeon break
        this._updateDungeonBreak(seconds);

        // Active break multiplier
        let spawnMult = 1;
        if (this.activeDungeonBreak) {
            spawnMult = this.activeDungeonBreak.multiplier;
        }

        // Spawn timer
        const interval = Math.max(
            WAVE_CONFIG.minSpawnInterval,
            WAVE_CONFIG.baseSpawnInterval - minutes * WAVE_CONFIG.spawnReductionPerMinute
        ) / spawnMult;

        this.spawnTimer += delta;
        if (this.spawnTimer >= interval) {
            this.spawnTimer = 0;
            this._spawnWave(minutes);
        }

        // Elite enemy spawn (every 45 seconds after 3 minutes)
        if (minutes >= 3) {
            this.eliteTimer += delta;
            const eliteInterval = Math.max(20000, 45000 - minutes * 2000);
            if (this.eliteTimer >= eliteInterval) {
                this.eliteTimer = 0;
                this._spawnElite(minutes);
            }
        }

        // Update active enemies
        const player = this.scene.player;
        if (!player) return;

        this.pool.getChildren().forEach(enemy => {
            if (enemy.active) {
                enemy.update(time, delta, player.x, player.y);

                // Despawn distance based on world size (mobs spawn from world edges)
                if (!this._despawnDist) {
                    this._despawnDist = WORLD_SIZE * 0.75;
                }
                const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
                if (dist > this._despawnDist) {
                    this._deactivateEnemy(enemy);
                }
            }
        });

        // Update quests
        this._updateQuests(seconds);
    }

    // --- Dungeon Break System ---
    _updateDungeonBreak(seconds) {
        // Check for new dungeon breaks
        for (const schedule of this.dungeonBreakSchedule) {
            if (seconds >= schedule.time && !this.triggeredBreaks.includes(schedule.time)) {
                this.triggeredBreaks.push(schedule.time);
                this._triggerDungeonBreak(schedule);
            }
        }

        // Check if active break has ended
        if (this.activeDungeonBreak) {
            if (seconds >= this.activeDungeonBreak.endTime) {
                this._endDungeonBreak();
            }
        }
    }

    _triggerDungeonBreak(schedule) {
        this.activeDungeonBreak = {
            ...schedule,
            endTime: this.gameTime / 1000 + schedule.duration,
        };

        const scene = this.scene;

        // Sound
        if (scene.soundManager) scene.soundManager.play('dungeonBreak');

        // System warning messages
        if (scene.systemMessage) {
            scene.systemMessage.show('[경고]', [
                '던전 브레이크가 발생했습니다!',
                `${schedule.name} 돌파 - 다량의 마수가 출현합니다.`,
                `${schedule.duration}초간 지속됩니다.`,
            ], { duration: 4000, type: 'warning' });
        }

        // Camera shake
        scene.cameras.main.shake(500, 0.012);

        // Red screen flash
        const cam = scene.cameras.main;
        const flash = scene.add.rectangle(
            cam.width / 2, cam.height / 2,
            cam.width, cam.height, 0xff0000, 0
        ).setDepth(45).setScrollFactor(0);

        scene.tweens.add({
            targets: flash,
            alpha: 0.15,
            duration: 300,
            yoyo: true,
            repeat: 2,
            onComplete: () => flash.destroy(),
        });

        // Warning border effect
        this._dungeonBreakBorder = scene.add.rectangle(
            cam.width / 2, cam.height / 2,
            cam.width - 4, cam.height - 4, 0x000000, 0
        ).setDepth(95).setScrollFactor(0).setStrokeStyle(3, 0xff2222, 0.6);

        // Pulsing border
        scene.tweens.add({
            targets: this._dungeonBreakBorder,
            alpha: 0.3,
            duration: 500,
            yoyo: true,
            repeat: -1,
        });
    }

    _endDungeonBreak() {
        this.activeDungeonBreak = null;

        if (this._dungeonBreakBorder) {
            this.scene.tweens.killTweensOf(this._dungeonBreakBorder);
            this._dungeonBreakBorder.destroy();
            this._dungeonBreakBorder = null;
        }

        if (this.scene.systemMessage) {
            this.scene.systemMessage.show('[시스템]', [
                '던전 브레이크가 종료되었습니다.',
                '보상: 경험치 보너스 지급.',
            ], { duration: 2500, type: 'info' });
        }

        // Bonus XP
        if (this.scene.player) {
            this.scene.player.addXP(100);
        }
    }

    isDungeonBreakActive() {
        return this.activeDungeonBreak !== null;
    }

    // --- Quest System ---
    _updateQuests(seconds) {
        this.questCheckTimer += this.scene.game.loop.delta;

        // Generate new quest every 60 seconds
        if (seconds - this.lastQuestTime > 60 && this.quests.length < 2) {
            this._generateQuest(seconds);
        }

        // Check quest completion
        for (let i = this.quests.length - 1; i >= 0; i--) {
            const quest = this.quests[i];
            let completed = false;

            if (quest.type === 'kill') {
                const player = this.scene.player;
                if (player && player.kills - quest.startKills >= quest.target) {
                    this._completeQuest(i);
                    completed = true;
                }
            } else if (quest.type === 'survive') {
                if (seconds - quest.startTime >= quest.target) {
                    this._completeQuest(i);
                    completed = true;
                }
            } else if (quest.type === 'killType') {
                const count = (this.killCounters[quest.targetType] || 0) - (quest.startCount || 0);
                if (count >= quest.target) {
                    this._completeQuest(i);
                    completed = true;
                }
            }

            // Quest timeout (120 seconds) - skip if already completed
            if (!completed && quest.type !== 'survive' && seconds - quest.startTime > 120) {
                this.quests.splice(i, 1);
                if (this.scene.systemMessage) {
                    this.scene.systemMessage.show('[시스템]', ['퀘스트 시간이 초과되었습니다.'], { duration: 2000 });
                }
            }
        }
    }

    _generateQuest(seconds) {
        const template = Phaser.Utils.Array.GetRandom(this.questTemplates);
        const quest = {
            ...template,
            startTime: seconds,
            startKills: this.scene.player?.kills || 0,
            startCount: this.killCounters[template.targetType] || 0,
        };

        this.quests.push(quest);
        this.lastQuestTime = seconds;

        if (this.scene.soundManager) this.scene.soundManager.play('quest');

        if (this.scene.systemMessage) {
            this.scene.systemMessage.show('[일일 퀘스트]', [
                quest.description,
                `보상: 경험치 +${quest.reward}`,
            ], { duration: 3500, type: 'quest' });
        }
    }

    _completeQuest(index) {
        const quest = this.quests[index];
        this.quests.splice(index, 1);

        // Give reward
        const leveled = this.scene.player?.addXP(quest.reward);

        if (this.scene.soundManager) this.scene.soundManager.play('quest');

        if (this.scene.systemMessage) {
            this.scene.systemMessage.show('[퀘스트 완료]', [
                `${quest.description} - 완료!`,
                `경험치 +${quest.reward} 획득`,
            ], { duration: 3000, type: 'quest' });
        }

        if (leveled && this.scene.onLevelUp) {
            this.scene.onLevelUp();
        }
    }

    onEnemyKilled(typeKey) {
        if (!this.killCounters[typeKey]) this.killCounters[typeKey] = 0;
        this.killCounters[typeKey]++;
    }

    getActiveQuests() {
        return this.quests;
    }

    // --- Spawning ---
    _spawnOpeningWave() {
        if (!this.scene?.player || this.scene.player.isDead) return;
        const openingTypes = ['goblin', 'goblin', 'goblin', 'antSoldier', 'antSoldier'];
        for (let i = 0; i < openingTypes.length; i++) {
            const pos = this._getSpawnPosition(72, 140);
            this._spawnEnemy(openingTypes[i], pos.x, pos.y);
        }
    }

    _spawnWave(minutes) {
        const count = Math.floor(WAVE_CONFIG.baseEnemiesPerSpawn + minutes * WAVE_CONFIG.extraEnemiesPerMinute);
        const activeCount = this.getActiveEnemies().length;

        // Max enemies scales with time: keep early screens lively, then open up.
        const maxEnemies = Math.floor(WAVE_CONFIG.maxEnemiesOnScreen + minutes * 6);
        if (activeCount >= maxEnemies) return;

        const toSpawn = Math.min(count, maxEnemies - activeCount);

        for (let i = 0; i < toSpawn; i++) {
            const typeKey = this._selectEnemyType(minutes);
            const pos = this._getSpawnPosition();
            this._spawnEnemy(typeKey, pos.x, pos.y);
        }
    }

    _selectEnemyType(minutes) {
        // Weighted spawn table - later enemies replace earlier ones gradually
        const table = {
            goblin:       10,
            antSoldier:   minutes >= 1.5 ? 8 : 0,
            orc:          minutes >= 1   ? 6 : 0,
            iceBear:      minutes >= 2   ? 7 : 0,
            stoneGolem:   minutes >= 5   ? 5 : 0,
            darkMage:     minutes >= 5   ? 6 : 0,
            ironKnight:   minutes >= 8   ? 5 : 0,
            demonWarrior: minutes >= 10  ? 4 : 0,
        };

        // Reduce early enemy weight in late game
        if (minutes >= 8) table.goblin = 4;
        if (minutes >= 12) { table.goblin = 2; table.antSoldier = 4; }

        const entries = Object.entries(table).filter(([, w]) => w > 0);
        const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
        let roll = Math.random() * totalWeight;

        for (const [type, weight] of entries) {
            roll -= weight;
            if (roll <= 0) return type;
        }
        return entries[0][0];
    }

    _getSpawnPosition(bufferMin = 110, bufferMax = 220) {
        const player = this.scene.player;
        const cam = this.scene.cameras?.main;
        if (player && cam) {
            const halfW = cam.width / cam.zoom / 2;
            const halfH = cam.height / cam.zoom / 2;
            const buffer = Phaser.Math.Between(bufferMin, bufferMax);
            const edge = Phaser.Math.Between(0, 3);
            let x, y;
            switch (edge) {
                case 0:
                    x = player.x + Phaser.Math.Between(-halfW, halfW);
                    y = player.y - halfH - buffer;
                    break;
                case 1:
                    x = player.x + Phaser.Math.Between(-halfW, halfW);
                    y = player.y + halfH + buffer;
                    break;
                case 2:
                    x = player.x - halfW - buffer;
                    y = player.y + Phaser.Math.Between(-halfH, halfH);
                    break;
                default:
                    x = player.x + halfW + buffer;
                    y = player.y + Phaser.Math.Between(-halfH, halfH);
                    break;
            }
            return {
                x: Phaser.Math.Clamp(x, 60, WORLD_SIZE - 60),
                y: Phaser.Math.Clamp(y, 60, WORLD_SIZE - 60),
            };
        }

        const margin = 60;

        // Fallback: spawn from world map edges.
        const edge = Phaser.Math.Between(0, 3);
        let x, y;
        switch (edge) {
            case 0: // top edge
                x = Phaser.Math.Between(margin, WORLD_SIZE - margin);
                y = Phaser.Math.Between(margin, margin + 40);
                break;
            case 1: // bottom edge
                x = Phaser.Math.Between(margin, WORLD_SIZE - margin);
                y = Phaser.Math.Between(WORLD_SIZE - margin - 40, WORLD_SIZE - margin);
                break;
            case 2: // left edge
                x = Phaser.Math.Between(margin, margin + 40);
                y = Phaser.Math.Between(margin, WORLD_SIZE - margin);
                break;
            case 3: // right edge
                x = Phaser.Math.Between(WORLD_SIZE - margin - 40, WORLD_SIZE - margin);
                y = Phaser.Math.Between(margin, WORLD_SIZE - margin);
                break;
        }

        return { x, y };
    }

    _spawnEnemy(typeKey, x, y) {
        if (!ENEMY_TYPES[typeKey]) return null;
        let enemy = this.pool.getChildren().find(e => !e.active);

        if (!enemy) {
            enemy = this._createInactiveEnemy();
        }

        enemy.spawn(typeKey, ENEMY_TYPES[typeKey], this.difficultyMultiplier, x, y);
        this._cachedActiveEnemies = null;
        return enemy;
    }

    _spawnElite(minutes) {
        // Pick a strong enemy type for elite
        const elitePool = [];
        if (minutes >= 3) elitePool.push('orc', 'iceBear');
        if (minutes >= 5) elitePool.push('stoneGolem');
        if (minutes >= 8) elitePool.push('ironKnight');
        if (minutes >= 10) elitePool.push('demonWarrior');

        const typeKey = Phaser.Utils.Array.GetRandom(elitePool);
        const pos = this._getSpawnPosition();

        let enemy = this.pool.getChildren().find(e => !e.active);
        if (!enemy) {
            enemy = this._createInactiveEnemy();
        }

        // Spawn with boosted stats (elite multiplier on top of difficulty)
        // HP uses full 3x difficulty, but attack caps at 1.5x to prevent elites outdamaging bosses
        const eliteMult = this.difficultyMultiplier * 3;
        enemy.spawn(typeKey, ENEMY_TYPES[typeKey], eliteMult, pos.x, pos.y);
        this._cachedActiveEnemies = null;
        enemy.attack = Math.floor(ENEMY_TYPES[typeKey].attack * (1 + (this.difficultyMultiplier * 1.5 - 1) * 0.3));
        enemy.isElite = true;

        // Elite visual: larger size + red tint + glow + name label
        enemy.setScale(enemy.scaleX * 1.5, enemy.scaleY * 1.5);
        enemy._restScaleX = enemy.scaleX;
        enemy._restScaleY = enemy.scaleY;
        enemy.setTint(0xff6644);
        try {
            enemy.enableFilters();
            enemy._eliteGlow = enemy.filters.internal.addGlow(0xff4400, 4, 0, 1, false, 6, 6);
        } catch (e) { /* filters not available */ }

        const name = ENEMY_TYPES[typeKey].name;
        const label = this.scene.add.text(enemy.x, enemy.y - 30, `★ ${name}`, {
            fontSize: '12px', fontFamily: 'Arial', fontStyle: 'bold',
            color: '#ff8844', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(50).setScrollFactor(1);

        // Track label to update position
        enemy._eliteLabel = label;
        enemy._originalUpdate = enemy.update;
        enemy._originalDie = enemy.die;
        const originalUpdate = enemy.update.bind(enemy);
        enemy.update = function(time, delta, px, py) {
            originalUpdate(time, delta, px, py);
            if (this._eliteLabel) {
                this._eliteLabel.setPosition(this.x, this.y - 30);
            }
        };

        // Clean up label on death — restore BOTH update and die so pool reuse
        // doesn't stack wrappers on repeated elite promotions.
        const originalDie = enemy.die.bind(enemy);
        enemy.die = function() {
            this._eliteDeathPending = true;
            if (this._eliteLabel) { this._eliteLabel.destroy(); this._eliteLabel = null; }
            try { if (this._eliteGlow && this.filters) { this.filters.internal.remove(this._eliteGlow); this._eliteGlow = null; } } catch (e) { /* silent */ }
            this.isElite = false;
            this.update = this._originalUpdate || this.update;
            this.die = this._originalDie || this.die;
            this._originalUpdate = null;
            this._originalDie = null;
            originalDie();
        };

        // System message
        if (this.scene.systemMessage) {
            this.scene.systemMessage.show('[경고]', [
                `엘리트 ${name}이(가) 출현했습니다!`,
            ], { duration: 2500, type: 'warning' });
        }

        if (this.scene.cameras) {
            this.scene.cameras.main.shake(200, 0.006);
        }
    }

    _applyEliteState(enemy) {
        if (!enemy?.active || !ENEMY_TYPES[enemy.enemyType]) return;
        this._clearEliteState(enemy);
        enemy.isElite = true;

        enemy.setScale(enemy.scaleX * 1.5, enemy.scaleY * 1.5);
        enemy._restScaleX = enemy.scaleX;
        enemy._restScaleY = enemy.scaleY;
        enemy.setTint(0xff6644);
        try {
            enemy.enableFilters();
            enemy._eliteGlow = enemy.filters.internal.addGlow(0xff4400, 4, 0, 1, false, 6, 6);
        } catch (e) { /* filters not available */ }

        const name = ENEMY_TYPES[enemy.enemyType].name;
        const label = this.scene.add.text(enemy.x, enemy.y - 30, `ELITE ${name}`, {
            fontSize: '12px', fontFamily: 'Arial', fontStyle: 'bold',
            color: '#ff8844', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(50).setScrollFactor(1);

        enemy._eliteLabel = label;
        enemy._originalUpdate = enemy.update;
        enemy._originalDie = enemy.die;
        const originalUpdate = enemy.update.bind(enemy);
        enemy.update = function(time, delta, px, py) {
            originalUpdate(time, delta, px, py);
            if (this._eliteLabel) {
                this._eliteLabel.setPosition(this.x, this.y - 30);
            }
        };

        const originalDie = enemy.die.bind(enemy);
        enemy.die = function() {
            this._eliteDeathPending = true;
            if (this._eliteLabel) { this._eliteLabel.destroy(); this._eliteLabel = null; }
            try { if (this._eliteGlow && this.filters) { this.filters.internal.remove(this._eliteGlow); this._eliteGlow = null; } } catch (e) { /* silent */ }
            this.isElite = false;
            this.update = this._originalUpdate || this.update;
            this.die = this._originalDie || this.die;
            this._originalUpdate = null;
            this._originalDie = null;
            originalDie();
        };
    }

    _clearEliteState(enemy) {
        if (!enemy) return;
        if (enemy._eliteLabel) {
            enemy._eliteLabel.destroy();
            enemy._eliteLabel = null;
        }
        try {
            if (enemy._eliteGlow && enemy.filters) {
                enemy.filters.internal.remove(enemy._eliteGlow);
            }
        } catch (e) { /* filters may already be gone */ }
        enemy._eliteGlow = null;
        enemy.isElite = false;
        enemy._eliteDeathPending = false;
        enemy.update = Enemy.prototype.update;
        enemy.die = Enemy.prototype.die;
        enemy._originalUpdate = null;
        enemy._originalDie = null;
    }

    _deactivateEnemy(enemy) {
        if (!enemy) return;
        this._clearEliteState(enemy);
        enemy.setActive(false);
        enemy.setVisible(false);
        if (enemy.body) {
            enemy.body.enable = false;
            enemy.body.setVelocity(0, 0);
        }
        if (enemy._aura) {
            enemy._aura.setVisible(false).setActive(false);
        }
        this._cachedActiveEnemies = null;
    }

    cancelOpeningWave() {
        if (this._openingWaveTimer) {
            this._openingWaveTimer.remove(false);
            this._openingWaveTimer = null;
        }
    }

    getActiveEnemySnapshots() {
        return this.getActiveEnemies()
            .filter(enemy => enemy?.active && ENEMY_TYPES[enemy.enemyType])
            .map(enemy => ({
                typeKey: enemy.enemyType,
                x: Math.round(enemy.x * 10) / 10,
                y: Math.round(enemy.y * 10) / 10,
                hp: Math.max(1, Math.round(enemy.hp || 1)),
                maxHp: Math.max(1, Math.round(enemy.maxHp || 1)),
                attack: Math.max(0, Math.round(enemy.attack || 0)),
                speed: Math.max(0, Math.round((enemy.speed || 0) * 10) / 10),
                xpValue: Math.max(0, Math.round(enemy.xpValue || 0)),
                isElite: !!enemy.isElite,
                slowMultiplier: Number.isFinite(enemy.slowMultiplier) ? enemy.slowMultiplier : 1,
                slowDuration: Math.max(0, Math.round(enemy.slowDuration || 0)),
                knockbackTimer: Math.max(0, Math.round(enemy.knockbackTimer || 0)),
                rangedCooldown: Math.max(0, Math.round(enemy.rangedCooldown || 0)),
                meleeCooldown: Math.max(0, Math.round(enemy.meleeCooldown || 0)),
                vx: Math.round((enemy.body?.velocity?.x || 0) * 10) / 10,
                vy: Math.round((enemy.body?.velocity?.y || 0) * 10) / 10,
                flipX: !!enemy.flipX,
            }));
    }

    restoreActiveEnemies(savedEnemies) {
        this.cancelOpeningWave();
        for (const enemy of this.pool.getChildren()) {
            if (enemy.active) this._deactivateEnemy(enemy);
        }

        if (!Array.isArray(savedEnemies)) return 0;

        let restored = 0;
        for (const saved of savedEnemies.slice(0, MAX_RESTORED_ENEMIES)) {
            if (!saved?.typeKey || !ENEMY_TYPES[saved.typeKey]) continue;
            const x = Phaser.Math.Clamp(Number(saved.x) || WORLD_SIZE / 2, 60, WORLD_SIZE - 60);
            const y = Phaser.Math.Clamp(Number(saved.y) || WORLD_SIZE / 2, 60, WORLD_SIZE - 60);
            const enemy = this._spawnEnemy(saved.typeKey, x, y);
            if (!enemy) continue;

            enemy.maxHp = Math.max(1, Number(saved.maxHp) || enemy.maxHp || 1);
            enemy.hp = Phaser.Math.Clamp(Number(saved.hp) || enemy.maxHp, 1, enemy.maxHp);
            if (Number.isFinite(saved.attack)) enemy.attack = saved.attack;
            if (Number.isFinite(saved.speed)) enemy.speed = saved.speed;
            if (Number.isFinite(saved.xpValue)) enemy.xpValue = saved.xpValue;
            enemy.slowMultiplier = Number.isFinite(saved.slowMultiplier) ? saved.slowMultiplier : 1;
            enemy.slowDuration = Math.max(0, Number(saved.slowDuration) || 0);
            enemy.knockbackTimer = Math.max(0, Number(saved.knockbackTimer) || 0);
            enemy.rangedCooldown = Math.max(0, Number(saved.rangedCooldown) || 0);
            enemy.meleeCooldown = Math.max(0, Number(saved.meleeCooldown) || 0);
            enemy.setFlipX(!!saved.flipX);
            if (enemy.body) {
                enemy.body.enable = true;
                enemy.body.setVelocity(Number(saved.vx) || 0, Number(saved.vy) || 0);
            }

            if (saved.isElite) {
                this._applyEliteState(enemy);
            } else if (enemy.slowDuration > 0) {
                enemy.setTint(0x8888ff);
            }

            restored++;
        }
        this._cachedActiveEnemies = null;
        return restored;
    }

    getActiveEnemies() {
        // Cache the filtered result per frame to avoid creating new arrays on every call
        const currentFrame = this.scene.game.loop.frame;
        if (this._activeEnemiesDirtyFrame !== currentFrame || !this._cachedActiveEnemies) {
            this._cachedActiveEnemies = this.pool.getChildren().filter(e => e.active);
            this._activeEnemiesDirtyFrame = currentFrame;
        }
        return this._cachedActiveEnemies;
    }

    getGroup() {
        return this.pool;
    }

    getGameTime() {
        return this.gameTime;
    }

    destroy() {
        if (this._openingWaveTimer) {
            this.cancelOpeningWave();
        }
        if (this._warmPoolTimer) {
            this._warmPoolTimer.remove(false);
            this._warmPoolTimer = null;
        }

        // 던전 브레이크 보더 정리
        if (this._dungeonBreakBorder) {
            if (this.scene?.tweens) this.scene.tweens.killTweensOf(this._dungeonBreakBorder);
            this._dungeonBreakBorder.destroy();
            this._dungeonBreakBorder = null;
        }
        // 엘리트 라벨 + 그림자 아우라 정리
        try {
            const children = this.pool?.getChildren?.();
            if (children) {
                children.forEach(enemy => {
                    if (enemy._eliteLabel) {
                        enemy._eliteLabel.destroy();
                        enemy._eliteLabel = null;
                    }
                    if (enemy._aura) {
                        enemy._aura.destroy();
                        enemy._aura = null;
                    }
                });
            }
            if (this.pool) this.pool.clear(true, true);
        } catch (e) { /* pool already destroyed by scene shutdown */ }

        Enemy.clearTransientPools(this.scene);
        this._cachedActiveEnemies = null;
        this.pool = null;
        this.scene = null;
    }
}
