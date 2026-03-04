import { ENEMY_TYPES, WAVE_CONFIG, GAME_WIDTH, GAME_HEIGHT, WORLD_SIZE } from '../utils/Constants.js';
import { Enemy } from '../entities/Enemy.js';

export class EnemyManager {
    constructor(scene) {
        this.scene = scene;
        this.pool = scene.physics.add.group({
            classType: Enemy,
            runChildUpdate: false,
        });

        // Pre-populate pool
        for (let i = 0; i < 50; i++) {
            const enemy = new Enemy(scene, -100, -100);
            enemy.setActive(false);
            enemy.setVisible(false);
            enemy.body.enable = false;
            this.pool.add(enemy);
        }

        this.spawnTimer = 0;
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
    }

    update(time, delta) {
        this.gameTime += delta;
        const minutes = this.gameTime / 60000;
        const seconds = this.gameTime / 1000;

        // Update difficulty: linear base + late-game acceleration
        // Fewer enemies on screen → each one is individually tougher
        this.difficultyMultiplier = 1 + minutes * 0.35 + Math.pow(minutes / 25, 2) * 3;

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

                // Despawn distance scales with screen size
                if (!this._despawnDist) {
                    const cw = this.scene.cameras.main.width / 2;
                    const ch = this.scene.cameras.main.height / 2;
                    this._despawnDist = Math.sqrt(cw * cw + ch * ch) + 500;
                }
                const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
                if (dist > this._despawnDist) {
                    // Clean up elite label before despawning
                    if (enemy._eliteLabel) {
                        enemy._eliteLabel.destroy();
                        enemy._eliteLabel = null;
                    }
                    enemy.setActive(false);
                    enemy.setVisible(false);
                    enemy.body.enable = false;
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
    _spawnWave(minutes) {
        const count = Math.floor(WAVE_CONFIG.baseEnemiesPerSpawn + minutes * WAVE_CONFIG.extraEnemiesPerMinute);
        const activeCount = this.getActiveEnemies().length;

        // Max enemies scales with time: 100 base, up to 175 at 15 min
        const maxEnemies = Math.floor(WAVE_CONFIG.maxEnemiesOnScreen + minutes * 5);
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

    _getSpawnPosition() {
        const player = this.scene.player;
        const margin = 50;
        const cam = this.scene.cameras.main;

        // Spawn just outside the visible screen
        const halfW = (cam.width / cam.zoom) / 2 + 60;
        const halfH = (cam.height / cam.zoom) / 2 + 60;
        // Limit spread along edges to prevent extreme diagonal distances
        const spreadW = Math.min(halfW, 500);
        const spreadH = Math.min(halfH, 500);

        // Pick a random edge (top, bottom, left, right)
        const edge = Phaser.Math.Between(0, 3);
        let x, y;
        switch (edge) {
            case 0: // top
                x = player.x + Phaser.Math.Between(-spreadW, spreadW);
                y = player.y - halfH - Phaser.Math.Between(0, 30);
                break;
            case 1: // bottom
                x = player.x + Phaser.Math.Between(-spreadW, spreadW);
                y = player.y + halfH + Phaser.Math.Between(0, 30);
                break;
            case 2: // left
                x = player.x - halfW - Phaser.Math.Between(0, 30);
                y = player.y + Phaser.Math.Between(-spreadH, spreadH);
                break;
            case 3: // right
                x = player.x + halfW + Phaser.Math.Between(0, 30);
                y = player.y + Phaser.Math.Between(-spreadH, spreadH);
                break;
        }

        return {
            x: Phaser.Math.Clamp(x, margin, WORLD_SIZE - margin),
            y: Phaser.Math.Clamp(y, margin, WORLD_SIZE - margin),
        };
    }

    _spawnEnemy(typeKey, x, y) {
        let enemy = this.pool.getChildren().find(e => !e.active);

        if (!enemy) {
            enemy = new Enemy(this.scene, x, y);
            this.pool.add(enemy);
        }

        enemy.spawn(typeKey, ENEMY_TYPES[typeKey], this.difficultyMultiplier, x, y);
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
            enemy = new Enemy(this.scene, pos.x, pos.y);
            this.pool.add(enemy);
        }

        // Spawn with boosted stats (elite multiplier on top of difficulty)
        // HP uses full 3x difficulty, but attack caps at 1.5x to prevent elites outdamaging bosses
        const eliteMult = this.difficultyMultiplier * 3;
        enemy.spawn(typeKey, ENEMY_TYPES[typeKey], eliteMult, pos.x, pos.y);
        enemy.attack = Math.floor(ENEMY_TYPES[typeKey].attack * (1 + (this.difficultyMultiplier * 1.5 - 1) * 0.3));
        enemy.isElite = true;

        // Elite visual: larger size + red tint + glow + name label
        enemy.setScale(enemy.scaleX * 1.5, enemy.scaleY * 1.5);
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
        const originalUpdate = enemy.update.bind(enemy);
        enemy.update = function(time, delta, px, py) {
            originalUpdate(time, delta, px, py);
            if (this._eliteLabel) {
                this._eliteLabel.setPosition(this.x, this.y - 30);
            }
        };

        // Clean up label on death
        const originalDie = enemy.die.bind(enemy);
        enemy.die = function() {
            if (this._eliteLabel) { this._eliteLabel.destroy(); this._eliteLabel = null; }
            try { if (this._eliteGlow && this.filters) { this.filters.internal.remove(this._eliteGlow); this._eliteGlow = null; } } catch (e) { /* silent */ }
            this.isElite = false;
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

    getActiveEnemies() {
        return this.pool.getChildren().filter(e => e.active);
    }

    getGroup() {
        return this.pool;
    }

    getGameTime() {
        return this.gameTime;
    }

    destroy() {
        // 던전 브레이크 보더 정리
        if (this._dungeonBreakBorder) {
            if (this.scene?.tweens) this.scene.tweens.killTweensOf(this._dungeonBreakBorder);
            this._dungeonBreakBorder.destroy();
            this._dungeonBreakBorder = null;
        }
        // 엘리트 라벨 정리
        try {
            const children = this.pool?.getChildren?.();
            if (children) {
                children.forEach(enemy => {
                    if (enemy._eliteLabel) {
                        enemy._eliteLabel.destroy();
                        enemy._eliteLabel = null;
                    }
                });
            }
        } catch (e) { /* pool already destroyed by scene shutdown */ }
    }
}
