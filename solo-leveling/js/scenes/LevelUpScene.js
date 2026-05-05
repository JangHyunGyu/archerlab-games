import {
    GAME_WIDTH, GAME_HEIGHT,
    WEAPONS, PASSIVES,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, drawSystemPanel,
} from '../utils/Constants.js';
import { t } from '../utils/i18n.js';

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
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, SYSTEM.BG_DEEP, 0.78)
            .setDepth(0);

        // Subtle scanlines
        const sg = this.add.graphics().setDepth(0);
        sg.lineStyle(1, SYSTEM.SCAN_LINE, 0.4);
        for (let y = 0; y < GAME_HEIGHT; y += 3) sg.lineBetween(0, y, GAME_WIDTH, y);

        const titleY = isMobile ? 60 : 80;

        // System tag
        this.add.text(GAME_WIDTH / 2, titleY - uv(26), '[ SYSTEM · LEVEL UP ]', {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_GOLD,
        }).setOrigin(0.5).setDepth(1);

        // Title
        const title = this.add.text(GAME_WIDTH / 2, titleY, t('levelUp'), {
            fontSize: fs(isMobile ? 36 : 34), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT, letterSpacing: 3,
        }).setOrigin(0.5).setDepth(1);
        const titleMaxW = GAME_WIDTH - uv(40);
        if (title.width > titleMaxW) title.setScale(titleMaxW / title.width);

        const uw = title.displayWidth;
        const ul = this.add.graphics().setDepth(1);
        ul.lineStyle(1, SYSTEM.BORDER_GOLD, 0.7);
        ul.lineBetween(GAME_WIDTH / 2 - uw / 2, titleY + title.height / 2 + uv(4),
                       GAME_WIDTH / 2 + uw / 2, titleY + title.height / 2 + uv(4));

        // Level display
        this.add.text(GAME_WIDTH / 2, titleY + uv(34), `▷  LV. ${String(this.player.level).padStart(2, '0')}`, {
            fontSize: fs(isMobile ? 16 : 15), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
            letterSpacing: 2,
        }).setOrigin(0.5).setDepth(1);

        const choices = this._generateChoices();
        this._createCards(choices);
    }

    _generateChoices() {
        const playerLevel = this.player.level;
        const priorityNew = [];
        const upgradeOptions = [];
        const passiveOptions = [];

        const weaponEntries = Object.entries(WEAPONS)
            .sort(([, a], [, b]) => (a.unlockLevel || 1) - (b.unlockLevel || 1));

        for (const [key, config] of weaponEntries) {
            const unlockLv = config.unlockLevel || 1;
            if (playerLevel < unlockLv) continue;

            const currentLevel = this.weaponManager.getWeaponLevel(key);
            if (currentLevel >= 10) continue;
            if (key === 'basicDagger' && currentLevel === 0) continue;

            if (currentLevel === 0) {
                if (this.weaponManager.getOwnedWeapons().length >= 6) continue;
                priorityNew.push({
                    type: 'weapon', key,
                    name: config.name,
                    description: config.description,
                    isNew: true, level: 0, icon: 'icon_' + key,
                });
            } else {
                upgradeOptions.push({
                    type: 'weapon', key,
                    name: config.name,
                    description: `Lv.${currentLevel}  →  Lv.${currentLevel + 1}`,
                    isNew: false, level: currentLevel, icon: 'icon_' + key,
                });
            }
        }

        for (const [key, config] of Object.entries(PASSIVES)) {
            const currentLevel = this.player.passiveLevels[config.stat] || 0;
            if (currentLevel >= 10) continue;
            passiveOptions.push({
                type: 'passive', key,
                name: config.name,
                description: config.description + (currentLevel > 0 ? ` (Lv.${currentLevel + 1})` : ''),
                isNew: currentLevel === 0, level: currentLevel, icon: 'icon_' + key,
            });
        }

        const result = [];
        if (priorityNew.length > 0) result.push(priorityNew[0]);
        const filler = [...upgradeOptions, ...passiveOptions];
        Phaser.Utils.Array.Shuffle(filler);
        for (const opt of filler) {
            if (result.length >= 3) break;
            result.push(opt);
        }
        for (let i = 1; i < priorityNew.length && result.length < 3; i++) {
            result.push(priorityNew[i]);
        }
        return result;
    }

    _createCards(choices) {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        if (isMobile) {
            const cardW = GAME_WIDTH * 0.86;
            const cardH = uv(118);
            const spacing = uv(15);
            const totalH = choices.length * cardH + (choices.length - 1) * spacing;
            const startY = (GAME_HEIGHT - totalH) / 2 + 40;

            choices.forEach((choice, i) => {
                const y = startY + i * (cardH + spacing);
                this._createMobileCard(GAME_WIDTH / 2 - cardW / 2, y, cardW, cardH, choice);
            });
        } else {
            const cardW = uv(230);
            const cardH = uv(290);
            const spacing = uv(30);
            const totalW = choices.length * cardW + (choices.length - 1) * spacing;
            const startX = (GAME_WIDTH - totalW) / 2;
            const cardY = GAME_HEIGHT / 2 - cardH / 2 + 20;

            choices.forEach((choice, i) => {
                const x = startX + i * (cardW + spacing);
                this._createCard(x, cardY, cardW, cardH, choice);
            });
        }
    }

    _cardBorder(choice) {
        return choice.isNew ? SYSTEM.BORDER_GOLD : SYSTEM.BORDER;
    }

    _createCard(x, y, w, h, choice) {
        const borderColor = this._cardBorder(choice);
        const g = this.add.graphics().setDepth(1);
        const redraw = (hover) => {
            g.clear();
            drawSystemPanel(g, x, y, w, h, {
                cut: uv(12),
                fill: hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL,
                fillAlpha: hover ? 0.96 : 0.9,
                border: hover ? SYSTEM.BORDER : borderColor,
                borderAlpha: 1,
                borderWidth: hover ? 2 : 1,
            });
        };
        redraw(false);

        const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
            .setDepth(1).setInteractive({ useHandCursor: true });

        // NEW tag (top-left)
        if (choice.isNew) {
            this.add.text(x + uv(14), y - uv(9), '  NEW  ', {
                fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: SYSTEM.TEXT_GOLD, backgroundColor: '#05070d',
                padding: { left: 6, right: 6, top: 1, bottom: 1 },
            }).setDepth(3);
        }
        // Level badge (top-right)
        if (choice.level > 0) {
            this.add.text(x + w - uv(14), y - uv(9), `  LV.${choice.level}  `, {
                fontSize: fs(10), fontFamily: UI_FONT_MONO,
                color: SYSTEM.TEXT_CYAN_DIM, backgroundColor: '#05070d',
                padding: { left: 6, right: 6, top: 1, bottom: 1 },
            }).setOrigin(1, 0).setDepth(3);
        }

        // Icon
        const icon = this.add.sprite(x + w / 2, y + uv(60), choice.icon)
            .setDepth(2).setScale(2);

        // Type label
        const typeColor = choice.type === 'weapon' ? '#ff9966' : SYSTEM.TEXT_CYAN;
        const typeLabel = choice.type === 'weapon' ? t('skillLabel') : t('passiveLabel');
        this.add.text(x + w / 2, y + uv(120), `[ ${typeLabel} ]`, {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, color: typeColor,
            letterSpacing: 1,
        }).setOrigin(0.5).setDepth(2);

        // Name
        this.add.text(x + w / 2, y + uv(150), choice.name, {
            fontSize: fs(18), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
        }).setOrigin(0.5).setDepth(2);

        // Description
        this.add.text(x + w / 2, y + uv(200), choice.description, {
            fontSize: fs(12), fontFamily: UI_FONT_KR, color: SYSTEM.TEXT_CYAN_DIM,
            wordWrap: { width: w - uv(30) }, align: 'center', lineSpacing: 3,
        }).setOrigin(0.5, 0).setDepth(2);

        hit.on('pointerover', () => { redraw(true); icon.setScale(2.18); });
        hit.on('pointerout', () => { redraw(false); icon.setScale(2); });
        hit.on('pointerdown', () => this._selectChoice(choice));
    }

    _createMobileCard(x, y, w, h, choice) {
        const borderColor = this._cardBorder(choice);
        const g = this.add.graphics().setDepth(1);
        const redraw = (hover) => {
            g.clear();
            drawSystemPanel(g, x, y, w, h, {
                cut: uv(10),
                fill: hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL,
                fillAlpha: hover ? 0.96 : 0.9,
                border: hover ? SYSTEM.BORDER : borderColor,
                borderAlpha: 1, borderWidth: hover ? 2 : 1,
            });
        };
        redraw(false);

        const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
            .setDepth(1).setInteractive({ useHandCursor: true });

        const iconX = x + uv(55);
        const icon = this.add.sprite(iconX, y + h / 2, choice.icon)
            .setDepth(2).setScale(2);

        if (choice.isNew) {
            this.add.text(iconX, y + h / 2 - uv(38), '  NEW  ', {
                fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: SYSTEM.TEXT_GOLD, backgroundColor: '#05070d',
                padding: { left: 6, right: 6, top: 1, bottom: 1 },
            }).setOrigin(0.5).setDepth(3);
        }
        if (choice.level > 0) {
            this.add.text(iconX, y + h / 2 + uv(38), `LV.${choice.level}`, {
                fontSize: fs(10), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN_DIM,
            }).setOrigin(0.5).setDepth(3);
        }

        const textX = x + uv(115);
        const typeColor = choice.type === 'weapon' ? '#ff9966' : SYSTEM.TEXT_CYAN;
        const typeLabel = choice.type === 'weapon' ? t('skillLabel') : t('passiveLabel');

        this.add.text(textX, y + h / 2 - uv(22), `[ ${typeLabel} ]`, {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, color: typeColor, letterSpacing: 1,
        }).setOrigin(0, 0.5).setDepth(2);

        this.add.text(textX + uv(80), y + h / 2 - uv(22), choice.name, {
            fontSize: fs(18), fontFamily: UI_FONT_KR, fontStyle: 'bold', color: SYSTEM.TEXT_BRIGHT,
        }).setOrigin(0, 0.5).setDepth(2);

        this.add.text(textX, y + h / 2 + uv(18), choice.description, {
            fontSize: fs(13), fontFamily: UI_FONT_KR, color: SYSTEM.TEXT_CYAN_DIM,
            wordWrap: { width: w - uv(140) },
        }).setOrigin(0, 0.5).setDepth(2);

        hit.on('pointerover', () => redraw(true));
        hit.on('pointerout', () => redraw(false));
        hit.on('pointerdown', () => this._selectChoice(choice));
    }

    _selectChoice(choice) {
        const soundManager = this.game._soundManager;
        if (soundManager) soundManager.play('select');

        if (choice.type === 'weapon') {
            this.weaponManager.addWeapon(choice.key);
        } else if (choice.type === 'passive') {
            const config = PASSIVES[choice.key];
            this.player.applyPassive(config.stat, config.bonus);
        }

        if (this.gameScene && this.gameScene.removeLevelUpBlur) {
            this.gameScene.removeLevelUpBlur();
        }
        if (this.gameScene) this.gameScene._levelUpActive = false;
        if (this.gameScene?._autoSave) this.gameScene._autoSave(true);

        this.scene.resume('GameScene');
        this.scene.stop();
    }
}
