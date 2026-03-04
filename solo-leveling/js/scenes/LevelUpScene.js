import { GAME_WIDTH, GAME_HEIGHT, WEAPONS, PASSIVES, COLORS, fs, uv } from '../utils/Constants.js';
import { t, tNested } from '../utils/i18n.js';

export class LevelUpScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LevelUpScene' });
    }

    init(data) {
        this.gameScene = data.gameScene;
        this.player = data.player;
        this.weaponManager = data.weaponManager;
    }

    create() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        // Dim overlay
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
            .setDepth(0);

        const titleY = isMobile ? 60 : 80;

        // Title
        this.add.text(GAME_WIDTH / 2, titleY, t('levelUp'), {
            fontSize: fs(isMobile ? 40 : 36),
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: COLORS.TEXT_GOLD,
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(1);

        // Level display
        this.add.text(GAME_WIDTH / 2, titleY + uv(40), `Lv. ${this.player.level}`, {
            fontSize: fs(isMobile ? 22 : 20),
            fontFamily: 'Arial',
            color: COLORS.TEXT_PURPLE,
        }).setOrigin(0.5).setDepth(1);

        // Generate 3 random choices
        const choices = this._generateChoices();
        this._createCards(choices);
    }

    _generateChoices() {
        const playerLevel = this.player.level;
        const priorityNew = [];   // 이번 레벨에 새로 해금되는 스킬 (최우선)
        const upgradeOptions = []; // 이미 보유한 스킬 레벨업
        const passiveOptions = [];

        // Weapon options - 해금 레벨 순서대로 처리
        const weaponEntries = Object.entries(WEAPONS)
            .sort(([, a], [, b]) => (a.unlockLevel || 1) - (b.unlockLevel || 1));

        for (const [key, config] of weaponEntries) {
            const unlockLv = config.unlockLevel || 1;
            if (playerLevel < unlockLv) continue; // 아직 해금 안 됨

            const currentLevel = this.weaponManager.getWeaponLevel(key);
            if (currentLevel >= 8) continue; // Max level
            if (key === 'basicDagger' && currentLevel === 0) continue; // 기본무기는 이미 보유

            if (currentLevel === 0) {
                // 새 스킬 해금 - 슬롯 여유 확인
                if (this.weaponManager.getOwnedWeapons().length >= 6) continue;
                priorityNew.push({
                    type: 'weapon',
                    key,
                    name: config.name,
                    description: config.description,
                    isNew: true,
                    level: 0,
                    icon: 'icon_' + key,
                });
            } else {
                upgradeOptions.push({
                    type: 'weapon',
                    key,
                    name: config.name,
                    description: `Lv.${currentLevel} → Lv.${currentLevel + 1}`,
                    isNew: false,
                    level: currentLevel,
                    icon: 'icon_' + key,
                });
            }
        }

        // Passive options
        for (const [key, config] of Object.entries(PASSIVES)) {
            const currentLevel = this.player.passiveLevels[config.stat] || 0;
            if (currentLevel >= 5) continue;

            passiveOptions.push({
                type: 'passive',
                key,
                name: config.name,
                description: config.description + (currentLevel > 0 ? ` (Lv.${currentLevel + 1})` : ''),
                isNew: currentLevel === 0,
                level: currentLevel,
                icon: 'icon_' + key,
            });
        }

        // 선택지 구성: 새 스킬 우선 → 기존 스킬 업그레이드 → 패시브
        const result = [];

        // 1) 새로 해금된 스킬은 반드시 첫 번째 선택지로
        if (priorityNew.length > 0) {
            result.push(priorityNew[0]);
        }

        // 2) 나머지 슬롯을 업그레이드 + 패시브에서 채움
        const filler = [...upgradeOptions, ...passiveOptions];
        Phaser.Utils.Array.Shuffle(filler);

        for (const opt of filler) {
            if (result.length >= 3) break;
            result.push(opt);
        }

        // 3) 아직 3개 안 됐으면 나머지 새 스킬로
        for (let i = 1; i < priorityNew.length && result.length < 3; i++) {
            result.push(priorityNew[i]);
        }

        return result;
    }

    _createCards(choices) {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        if (isMobile) {
            // Mobile: vertical stack layout - wider cards, less height
            const cardWidth = GAME_WIDTH * 0.85;
            const cardHeight = uv(120);
            const spacing = uv(15);
            const totalHeight = choices.length * cardHeight + (choices.length - 1) * spacing;
            const startY = (GAME_HEIGHT - totalHeight) / 2 + cardHeight / 2 + 40;

            choices.forEach((choice, i) => {
                const y = startY + i * (cardHeight + spacing);
                this._createMobileCard(GAME_WIDTH / 2, y, cardWidth, cardHeight, choice);
            });
        } else {
            // Desktop: horizontal layout
            const cardWidth = uv(220);
            const cardHeight = uv(280);
            const spacing = uv(30);
            const totalWidth = choices.length * cardWidth + (choices.length - 1) * spacing;
            const startX = (GAME_WIDTH - totalWidth) / 2 + cardWidth / 2;
            const cardY = GAME_HEIGHT / 2 + 20;

            choices.forEach((choice, i) => {
                const x = startX + i * (cardWidth + spacing);
                this._createCard(x, cardY, cardWidth, cardHeight, choice);
            });
        }
    }

    _createCard(x, y, w, h, choice) {
        // Card background
        const card = this.add.rectangle(x, y, w, h, 0x1a1a3e, 0.95)
            .setStrokeStyle(2, choice.isNew ? 0xffd700 : COLORS.SHADOW_DARK)
            .setDepth(1)
            .setInteractive({ useHandCursor: true });

        // New badge
        if (choice.isNew) {
            this.add.text(x, y - h / 2 + uv(20), 'NEW', {
                fontSize: fs(12),
                fontFamily: 'Arial',
                fontStyle: 'bold',
                color: '#ffd700',
                backgroundColor: '#4a1a8a',
                padding: { x: 6, y: 2 },
            }).setOrigin(0.5).setDepth(2);
        }

        // Level indicator
        if (choice.level > 0) {
            this.add.text(x + w / 2 - uv(15), y - h / 2 + uv(10), `Lv.${choice.level}`, {
                fontSize: fs(12),
                fontFamily: 'Arial',
                color: '#aaaacc',
            }).setOrigin(0.5).setDepth(2);
        }

        // Icon
        const icon = this.add.sprite(x, y - uv(50), choice.icon)
            .setDepth(2)
            .setScale(2);

        // Type badge
        const typeColor = choice.type === 'weapon' ? '#ff6644' : '#44aaff';
        const typeLabel = choice.type === 'weapon' ? t('skillLabel') : t('passiveLabel');
        this.add.text(x, y - uv(10), typeLabel, {
            fontSize: fs(11),
            fontFamily: 'Arial',
            color: typeColor,
        }).setOrigin(0.5).setDepth(2);

        // Name
        this.add.text(x, y + uv(15), choice.name, {
            fontSize: fs(18),
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5).setDepth(2);

        // Description
        this.add.text(x, y + uv(50), choice.description, {
            fontSize: fs(12),
            fontFamily: 'Arial',
            color: '#aaaacc',
            wordWrap: { width: w - uv(30) },
            align: 'center',
        }).setOrigin(0.5).setDepth(2);

        // Hover effects
        card.on('pointerover', () => {
            card.setFillStyle(0x2a2a5e, 0.95);
            card.setStrokeStyle(2, COLORS.SHADOW_GLOW);
            icon.setScale(2.2);
        });

        card.on('pointerout', () => {
            card.setFillStyle(0x1a1a3e, 0.95);
            card.setStrokeStyle(2, choice.isNew ? 0xffd700 : COLORS.SHADOW_DARK);
            icon.setScale(2);
        });

        card.on('pointerdown', () => {
            this._selectChoice(choice);
        });
    }

    _createMobileCard(x, y, w, h, choice) {
        // Card background - wide horizontal card for mobile
        const card = this.add.rectangle(x, y, w, h, 0x1a1a3e, 0.95)
            .setStrokeStyle(2, choice.isNew ? 0xffd700 : COLORS.SHADOW_DARK)
            .setDepth(1)
            .setInteractive({ useHandCursor: true });

        // Icon on the left
        const iconX = x - w / 2 + uv(55);
        const icon = this.add.sprite(iconX, y, choice.icon)
            .setDepth(2)
            .setScale(2);

        // NEW badge
        if (choice.isNew) {
            this.add.text(iconX, y - uv(35), 'NEW', {
                fontSize: fs(13),
                fontFamily: 'Arial',
                fontStyle: 'bold',
                color: '#ffd700',
                backgroundColor: '#4a1a8a',
                padding: { x: 6, y: 2 },
            }).setOrigin(0.5).setDepth(2);
        }

        // Level indicator
        if (choice.level > 0) {
            this.add.text(iconX, y + uv(35), `Lv.${choice.level}`, {
                fontSize: fs(13),
                fontFamily: 'Arial',
                color: '#aaaacc',
            }).setOrigin(0.5).setDepth(2);
        }

        // Text area on the right
        const textX = x + uv(20);

        // Type badge + Name on same line
        const typeColor = choice.type === 'weapon' ? '#ff6644' : '#44aaff';
        const typeLabel = choice.type === 'weapon' ? t('skillLabel') : t('passiveLabel');
        this.add.text(textX, y - uv(20), typeLabel, {
            fontSize: fs(13),
            fontFamily: 'Arial',
            color: typeColor,
        }).setOrigin(0.5, 0.5).setDepth(2);

        this.add.text(textX + uv(40), y - uv(20), choice.name, {
            fontSize: fs(20),
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0, 0.5).setDepth(2);

        // Description
        this.add.text(textX, y + uv(15), choice.description, {
            fontSize: fs(14),
            fontFamily: 'Arial',
            color: '#aaaacc',
            wordWrap: { width: w - uv(140) },
        }).setOrigin(0.5, 0.5).setDepth(2);

        // Hover/press effects
        card.on('pointerover', () => {
            card.setFillStyle(0x2a2a5e, 0.95);
            card.setStrokeStyle(2, COLORS.SHADOW_GLOW);
        });

        card.on('pointerout', () => {
            card.setFillStyle(0x1a1a3e, 0.95);
            card.setStrokeStyle(2, choice.isNew ? 0xffd700 : COLORS.SHADOW_DARK);
        });

        card.on('pointerdown', () => {
            this._selectChoice(choice);
        });
    }

    _selectChoice(choice) {
        // Sound
        const soundManager = this.game._soundManager;
        if (soundManager) soundManager.play('select');

        if (choice.type === 'weapon') {
            this.weaponManager.addWeapon(choice.key);
        } else if (choice.type === 'passive') {
            const config = PASSIVES[choice.key];
            this.player.applyPassive(config.stat, config.bonus);
        }

        // Remove blur from game camera
        if (this.gameScene && this.gameScene.removeLevelUpBlur) {
            this.gameScene.removeLevelUpBlur();
        }

        // Reset level-up guard flag
        if (this.gameScene) this.gameScene._levelUpActive = false;

        // Resume game
        this.scene.resume('GameScene');
        this.scene.stop();
    }
}
