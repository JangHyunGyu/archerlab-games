import {
    GAME_WIDTH, GAME_HEIGHT,
    WEAPONS, PASSIVES,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, fitText, padText,
} from '../utils/Constants.js';
import { t } from '../utils/i18n.js';
import { UIAssets } from '../ui/UIAssets.js';

export class LevelUpScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LevelUpScene' });
    }

    init(data) {
        this.gameScene = data.gameScene;
        this.player = data.player;
        this.weaponManager = data.weaponManager;
        this._levelUpData = data;
    }

    create() {
        this._onGameResize = () => this._redraw();
        this.events.on('game-resize', this._onGameResize, this);
        this.events.once('shutdown', () => {
            if (this._onGameResize) {
                this.events.off('game-resize', this._onGameResize, this);
                this._onGameResize = null;
            }
        });

        this._redraw();
    }

    _redraw() {
        this.children.removeAll(true);
        const layout = this._getLayout();

        // Dim overlay
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, SYSTEM.BG_DEEP, 0.78)
            .setDepth(0);

        // Subtle scanlines
        const sg = this.add.graphics().setDepth(0);
        sg.lineStyle(1, SYSTEM.SCAN_LINE, 0.4);
        for (let y = 0; y < GAME_HEIGHT; y += 3) sg.lineBetween(0, y, GAME_WIDTH, y);

        const titleY = layout.titleY;

        // System tag
        const tag = padText(this.add.text(GAME_WIDTH / 2, Math.max(layout.safeTop, titleY - uv(30)), '[ SYSTEM · LEVEL UP ]', {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_GOLD,
        }).setOrigin(0.5).setDepth(1), 2, 2);
        fitText(tag, GAME_WIDTH - layout.sidePad * 2, 0, 0.75);

        // Title
        const title = padText(this.add.text(GAME_WIDTH / 2, titleY, t('levelUp'), {
            fontSize: fs(layout.stack ? 36 : 34), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT, letterSpacing: 3,
        }).setOrigin(0.5).setDepth(1), 4, 4);
        fitText(title, GAME_WIDTH - layout.sidePad * 2, uv(70), 0.72);

        const uw = title.displayWidth;
        const ul = this.add.graphics().setDepth(1);
        ul.lineStyle(1, SYSTEM.BORDER_GOLD, 0.7);
        ul.lineBetween(GAME_WIDTH / 2 - uw / 2, titleY + title.displayHeight / 2 + uv(4),
                       GAME_WIDTH / 2 + uw / 2, titleY + title.displayHeight / 2 + uv(4));

        // Level display
        const levelText = padText(this.add.text(GAME_WIDTH / 2, titleY + title.displayHeight / 2 + uv(24), `▷  LV. ${String(this.player.level).padStart(2, '0')}`, {
            fontSize: fs(layout.stack ? 16 : 15), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
            letterSpacing: 2,
        }).setOrigin(0.5).setDepth(1), 2, 2);
        fitText(levelText, GAME_WIDTH - layout.sidePad * 2, 0, 0.75);

        const choices = this._generateChoices();
        const cardsTop = levelText.y + levelText.displayHeight / 2 + uv(layout.stack ? 22 : 30);
        this._createCards(choices, cardsTop, layout);
    }

    _detectTouch() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window)
            || (navigator.maxTouchPoints > 0);
    }

    _getLayout() {
        const isPortrait = GAME_HEIGHT > GAME_WIDTH;
        const isShort = GAME_HEIGHT <= 820;
        const touch = this._detectTouch();
        const stack = isPortrait || (touch && GAME_WIDTH < 1180);
        const sidePad = uv(stack ? 28 : 34);
        const safeTop = uv(isShort ? 26 : 38);

        return {
            touch,
            stack,
            isPortrait,
            isShort,
            sidePad,
            safeTop,
            bottomPad: uv(isShort ? 22 : 30),
            titleY: safeTop + uv(isShort ? 38 : 46),
        };
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

    _createCards(choices, cardsTop, layout) {
        const bottomY = GAME_HEIGHT - layout.bottomPad;
        const availableH = Math.max(uv(220), bottomY - cardsTop);

        if (layout.stack) {
            const spacing = Math.min(uv(16), Math.max(uv(8), Math.floor(availableH * 0.035)));
            const fitH = Math.floor((availableH - (choices.length - 1) * spacing) / Math.max(choices.length, 1));
            const cardH = Math.max(uv(94), Math.min(uv(138), fitH));
            const cardW = Math.min(GAME_WIDTH - layout.sidePad * 2, uv(layout.isPortrait ? 720 : 640));
            const totalH = choices.length * cardH + (choices.length - 1) * spacing;
            const startY = cardsTop + Math.max(0, (availableH - totalH) / 2);

            choices.forEach((choice, i) => {
                const y = startY + i * (cardH + spacing);
                this._createMobileCard(GAME_WIDTH / 2 - cardW / 2, y, cardW, cardH, choice);
            });
        } else {
            const spacing = uv(GAME_WIDTH < 1200 ? 18 : 30);
            const cardW = Math.max(uv(190), Math.min(uv(250),
                Math.floor((GAME_WIDTH - layout.sidePad * 2 - (choices.length - 1) * spacing) / Math.max(choices.length, 1))
            ));
            const cardH = Math.max(uv(250), Math.min(uv(layout.isShort ? 278 : 300), availableH));
            const totalW = choices.length * cardW + (choices.length - 1) * spacing;
            const startX = (GAME_WIDTH - totalW) / 2;
            const cardY = cardsTop + Math.max(0, (availableH - cardH) / 2);

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
        const panel = UIAssets.createPanel(this, x, y, w, h, {
            cut: uv(12),
            fill: SYSTEM.BG_PANEL,
            fillAlpha: 0.9,
            border: borderColor,
            borderAlpha: 1,
            borderWidth: 1,
            accent: choice.type === 'weapon' ? 0xff9966 : SYSTEM.BORDER,
            glow: choice.isNew ? 6 : 0,
            depth: 1,
            hover: {
                fill: SYSTEM.BG_PANEL_HI,
                fillAlpha: 0.96,
                border: SYSTEM.BORDER,
                borderWidth: 2,
                glow: 7,
            },
        });

        const hit = UIAssets.createHitArea(this, x, y, w, h, 1);

        // NEW tag (top-left)
        if (choice.isNew) {
            padText(this.add.text(x + uv(14), y + uv(10), '  NEW  ', {
                fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: SYSTEM.TEXT_GOLD, backgroundColor: '#05070d',
                padding: { left: 6, right: 6, top: 1, bottom: 1 },
            }).setDepth(3), 2, 2, 6, 6);
        }
        // Level badge (top-right)
        if (choice.level > 0) {
            padText(this.add.text(x + w - uv(14), y + uv(10), `  LV.${choice.level}  `, {
                fontSize: fs(10), fontFamily: UI_FONT_MONO,
                color: SYSTEM.TEXT_CYAN_DIM, backgroundColor: '#05070d',
                padding: { left: 6, right: 6, top: 1, bottom: 1 },
            }).setOrigin(1, 0).setDepth(3), 2, 2, 6, 6);
        }

        // Icon
        const iconScale = Math.min(2, Math.max(1.35, h / uv(150)));
        const icon = this.add.sprite(x + w / 2, y + h * 0.23, choice.icon)
            .setDepth(2).setScale(iconScale);

        // Type label
        const typeColor = choice.type === 'weapon' ? '#ff9966' : SYSTEM.TEXT_CYAN;
        const typeLabel = choice.type === 'weapon' ? t('skillLabel') : t('passiveLabel');
        const typeText = padText(this.add.text(x + w / 2, y + h * 0.43, `[ ${typeLabel} ]`, {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, color: typeColor,
            letterSpacing: 1,
        }).setOrigin(0.5).setDepth(2), 2, 2);
        fitText(typeText, w - uv(28), 0, 0.72);

        // Name
        const nameText = padText(this.add.text(x + w / 2, y + h * 0.54, choice.name, {
            fontSize: fs(18), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
        }).setOrigin(0.5).setDepth(2), 3, 3);
        fitText(nameText, w - uv(28), uv(40), 0.62);

        // Description
        const descY = y + h * 0.68;
        const descText = padText(this.add.text(x + w / 2, descY, choice.description, {
            fontSize: fs(12), fontFamily: UI_FONT_KR, color: SYSTEM.TEXT_CYAN_DIM,
            wordWrap: { width: w - uv(30), useAdvancedWrap: true }, align: 'center', lineSpacing: 5,
        }).setOrigin(0.5, 0).setDepth(2), 3, 4);
        fitText(descText, w - uv(30), Math.max(1, y + h - uv(16) - descY), 0.66);

        hit.on('pointerover', () => { panel.setUIState('hover'); icon.setScale(iconScale * 1.08); });
        hit.on('pointerout', () => { panel.setUIState('normal'); icon.setScale(iconScale); });
        hit.on('pointerdown', () => this._selectChoice(choice));
    }

    _createMobileCard(x, y, w, h, choice) {
        const borderColor = this._cardBorder(choice);
        const panel = UIAssets.createPanel(this, x, y, w, h, {
            cut: uv(10),
            fill: SYSTEM.BG_PANEL,
            fillAlpha: 0.9,
            border: borderColor,
            borderAlpha: 1,
            borderWidth: 1,
            accent: choice.type === 'weapon' ? 0xff9966 : SYSTEM.BORDER,
            glow: choice.isNew ? 5 : 0,
            depth: 1,
            hover: {
                fill: SYSTEM.BG_PANEL_HI,
                fillAlpha: 0.96,
                border: SYSTEM.BORDER,
                borderWidth: 2,
                glow: 6,
            },
        });

        const hit = UIAssets.createHitArea(this, x, y, w, h, 1);

        const iconX = x + Math.min(uv(58), w * 0.17);
        const iconScale = Math.min(2, Math.max(1.25, h / uv(70)));
        const icon = this.add.sprite(iconX, y + h / 2, choice.icon)
            .setDepth(2).setScale(iconScale);

        if (choice.isNew) {
            padText(this.add.text(x + w - uv(14), y + uv(10), '  NEW  ', {
                fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: SYSTEM.TEXT_GOLD, backgroundColor: '#05070d',
                padding: { left: 6, right: 6, top: 1, bottom: 1 },
            }).setOrigin(1, 0).setDepth(3), 2, 2, 6, 6);
        }
        if (choice.level > 0) {
            padText(this.add.text(x + w - uv(14), y + uv(10), `  LV.${choice.level}  `, {
                fontSize: fs(10), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN_DIM,
                backgroundColor: '#05070d',
                padding: { left: 6, right: 6, top: 1, bottom: 1 },
            }).setOrigin(1, 0).setDepth(3), 2, 2, 6, 6);
        }

        const textX = x + Math.min(uv(118), w * 0.29);
        const textW = Math.max(uv(120), x + w - uv(18) - textX);
        const typeColor = choice.type === 'weapon' ? '#ff9966' : SYSTEM.TEXT_CYAN;
        const typeLabel = choice.type === 'weapon' ? t('skillLabel') : t('passiveLabel');

        const typeText = padText(this.add.text(textX, y + Math.max(uv(14), h * 0.18), `[ ${typeLabel} ]`, {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, color: typeColor, letterSpacing: 1,
        }).setOrigin(0, 0).setDepth(2), 2, 2);
        fitText(typeText, textW, 0, 0.68);

        const nameText = padText(this.add.text(textX, y + Math.max(uv(39), h * 0.36), choice.name, {
            fontSize: fs(18), fontFamily: UI_FONT_KR, fontStyle: 'bold', color: SYSTEM.TEXT_BRIGHT,
        }).setOrigin(0, 0).setDepth(2), 3, 3);
        fitText(nameText, textW, uv(36), 0.62);

        const descY = y + Math.max(uv(68), h * 0.63);
        const descText = padText(this.add.text(textX, descY, choice.description, {
            fontSize: fs(13), fontFamily: UI_FONT_KR, color: SYSTEM.TEXT_CYAN_DIM,
            wordWrap: { width: textW, useAdvancedWrap: true }, lineSpacing: 4,
        }).setOrigin(0, 0).setDepth(2), 2, 4);
        fitText(descText, textW, Math.max(1, y + h - uv(12) - descY), 0.62);

        hit.on('pointerover', () => { panel.setUIState('hover'); icon.setScale(iconScale * 1.06); });
        hit.on('pointerout', () => { panel.setUIState('normal'); icon.setScale(iconScale); });
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
