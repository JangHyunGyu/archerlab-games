import {
    GAME_WIDTH, GAME_HEIGHT,
    WEAPONS, PASSIVES,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, fitText, padText,
} from '../utils/Constants.js';
import { t } from '../utils/i18n.js';
import { UIAssets } from '../ui/UIAssets.js';
import { getCharacterWeaponKeys, getStarterWeaponKey } from '../utils/Characters.js';

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
        this._selectionLocked = false;
        this._choiceCards = [];
        this._selectionTimer = null;
        // Generate once per level-up. A viewport resize is a layout event, not
        // an opportunity to reroll the player's upgrade choices.
        this._choices = this._generateChoices();
        this._onGameResize = () => {
            if (!this._selectionLocked) this._redraw();
        };
        this.events.on('game-resize', this._onGameResize, this);
        this.events.once('shutdown', this._cleanupSceneRefs, this);

        this._redraw();
    }

    _cleanupSceneRefs() {
        if (this._selectionTimer) {
            try { this._selectionTimer.remove(false); } catch (e) { /* already completed */ }
            this._selectionTimer = null;
        }
        if (this._onGameResize) {
            this.events.off('game-resize', this._onGameResize, this);
            this._onGameResize = null;
        }

        if (this.gameScene) {
            this.gameScene.removeLevelUpBlur?.();
            this.gameScene._levelUpActive = false;
        }

        this.gameScene = null;
        this.player = null;
        this.weaponManager = null;
        this._levelUpData = null;
        this._choiceCards = [];
        this._choices = [];
    }

    _redraw() {
        this.children.removeAll(true);
        this._choiceCards = [];
        const layout = this._getLayout();

        // Dim overlay and restrained focal glow separate the decision layer from the battlefield.
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, SYSTEM.BG_DEEP, 0.84)
            .setDepth(0);
        const focalGlow = this.add.ellipse(
            GAME_WIDTH / 2,
            layout.titleY + uv(74),
            Math.min(GAME_WIDTH * 0.88, uv(760)),
            Math.min(GAME_HEIGHT * 0.42, uv(300)),
            0x19466f,
            0.1
        ).setDepth(0);

        const sg = this.add.graphics().setDepth(0);
        sg.lineStyle(1, SYSTEM.SCAN_LINE, 0.22);
        for (let y = 0; y < GAME_HEIGHT; y += 4) sg.lineBetween(0, y, GAME_WIDTH, y);

        let titleY = layout.titleY;
        const tagY = layout.safeTop;
        const tag = padText(this.add.text(GAME_WIDTH / 2, tagY, '[ SYSTEM · LEVEL UP ]', {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_GOLD,
        }).setOrigin(0.5, 0).setDepth(1), 2, 2);
        fitText(tag, GAME_WIDTH - layout.sidePad * 2, 0, 0.75);

        const tagLineW = Math.max(0, Math.min(uv(150),
            (GAME_WIDTH - tag.displayWidth - layout.sidePad * 2 - uv(30)) / 2));
        if (tagLineW > uv(18)) {
            const tagLines = this.add.graphics().setDepth(1);
            const tagLineY = tagY + tag.displayHeight / 2;
            tagLines.lineStyle(1, SYSTEM.BORDER_GOLD, 0.36);
            tagLines.lineBetween(
                GAME_WIDTH / 2 - tag.displayWidth / 2 - uv(12) - tagLineW,
                tagLineY,
                GAME_WIDTH / 2 - tag.displayWidth / 2 - uv(12),
                tagLineY
            );
            tagLines.lineBetween(
                GAME_WIDTH / 2 + tag.displayWidth / 2 + uv(12),
                tagLineY,
                GAME_WIDTH / 2 + tag.displayWidth / 2 + uv(12) + tagLineW,
                tagLineY
            );
        }

        const title = padText(this.add.text(GAME_WIDTH / 2, titleY, t('levelUp'), {
            fontSize: fs(layout.stack ? 36 : 38), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
            stroke: '#02040a',
            strokeThickness: 4,
            letterSpacing: 0,
        }).setOrigin(0.5).setDepth(1), 4, 4);
        fitText(title, GAME_WIDTH - layout.sidePad * 2, uv(70), 0.72);
        titleY = Math.max(titleY, tagY + tag.displayHeight + uv(8) + title.displayHeight / 2);
        title.setY(titleY);
        focalGlow.setY(titleY + uv(74));

        const uw = title.displayWidth;
        const ul = this.add.graphics().setDepth(1);
        ul.lineStyle(3, SYSTEM.BORDER_GOLD, 0.12);
        ul.lineBetween(GAME_WIDTH / 2 - uw / 2 - uv(10), titleY + title.displayHeight / 2 + uv(5),
                       GAME_WIDTH / 2 + uw / 2 + uv(10), titleY + title.displayHeight / 2 + uv(5));
        ul.lineStyle(1, SYSTEM.BORDER_GOLD, 0.9);
        ul.lineBetween(GAME_WIDTH / 2 - uw / 2, titleY + title.displayHeight / 2 + uv(4),
                       GAME_WIDTH / 2 + uw / 2, titleY + title.displayHeight / 2 + uv(4));

        const levelBadgeW = Math.min(uv(160), GAME_WIDTH - layout.sidePad * 2);
        const levelBadgeH = Math.max(34, uv(34));
        const levelBadgeY = titleY + title.displayHeight / 2 + uv(18);
        UIAssets.createPanel(this, GAME_WIDTH / 2 - levelBadgeW / 2, levelBadgeY, levelBadgeW, levelBadgeH, {
            cut: uv(8),
            fill: 0x0a1726, fillAlpha: 0.94,
            border: SYSTEM.BORDER_GOLD, borderAlpha: 0.64, borderWidth: 1,
            accent: SYSTEM.BORDER_GOLD,
            variant: 'button', ornament: false, surfaceLines: false,
            depth: 1,
        });
        const levelText = padText(this.add.text(GAME_WIDTH / 2, levelBadgeY + levelBadgeH / 2,
            `◆  LV. ${String(this.player.level).padStart(2, '0')}`, {
                fontSize: fs(layout.stack ? 15 : 14), fontFamily: UI_FONT_MONO,
                fontStyle: 'bold', color: SYSTEM.TEXT_GOLD, letterSpacing: 0,
            }).setOrigin(0.5).setDepth(2), 2, 2);
        fitText(levelText, levelBadgeW - uv(18), levelBadgeH - uv(6), 0.7);

        const promptY = levelBadgeY + levelBadgeH + uv(9);
        const prompt = padText(this.add.text(GAME_WIDTH / 2, promptY, t('newSkill'), {
            fontSize: fs(layout.stack ? 13 : 12), fontFamily: UI_FONT_KR,
            color: SYSTEM.TEXT_CYAN_DIM,
        }).setOrigin(0.5, 0).setDepth(1), 3, 3);
        fitText(prompt, GAME_WIDTH - layout.sidePad * 2, uv(32), 0.68);

        const choices = this._choices || [];
        const cardsTop = promptY + prompt.displayHeight + uv(layout.stack ? 12 : 18);
        this._createCards(choices, cardsTop, layout);
    }

    _detectTouch() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window)
            || (navigator.maxTouchPoints > 0);
    }

    _minTouchUnits() {
        const viewportW = Math.max(1, window.innerWidth || GAME_WIDTH);
        const viewportH = Math.max(1, window.innerHeight || GAME_HEIGHT);
        const cssPerUnit = Math.max(0.01, Math.min(viewportW / GAME_WIDTH, viewportH / GAME_HEIGHT));
        return Math.ceil(44 / cssPerUnit);
    }

    _iconTexture(key) {
        const authoredKey = 'asset_icon_' + key;
        return this.textures.exists(authoredKey) ? authoredKey : 'icon_' + key;
    }

    _getLayout() {
        const isPortrait = GAME_HEIGHT > GAME_WIDTH;
        const isShort = GAME_HEIGHT <= 820;
        const touch = this._detectTouch();
        const stack = isPortrait || (touch && GAME_WIDTH < 1180);
        const sidePad = Math.max(16, uv(stack ? 24 : 34));
        const safeTop = Math.max(16, uv(isShort ? 22 : 34));

        return {
            touch,
            stack,
            isPortrait,
            isShort,
            sidePad,
            safeTop,
            bottomPad: Math.max(16, uv(isShort ? 18 : 28)),
            titleY: safeTop + uv(isShort ? 36 : 44),
        };
    }

    _generateChoices() {
        const playerLevel = this.player.level;
        const priorityNew = [];
        const upgradeOptions = [];
        const passiveOptions = [];

        const characterWeaponKeys = getCharacterWeaponKeys(this.player.characterId);
        const starterWeaponKey = getStarterWeaponKey(this.player.characterId);
        const weaponEntries = characterWeaponKeys
            .map(key => [key, WEAPONS[key]])
            .filter(([, config]) => !!config)
            .sort(([, a], [, b]) => (a.unlockLevel || 1) - (b.unlockLevel || 1));

        for (const [key, config] of weaponEntries) {
            const unlockLv = config.unlockLevel || 1;
            if (playerLevel < unlockLv) continue;

            const currentLevel = this.weaponManager.getWeaponLevel(key);
            if (currentLevel >= 10) continue;
            if (key === starterWeaponKey && currentLevel === 0) continue;

            if (currentLevel === 0) {
                if (this.weaponManager.getOwnedWeapons().length >= 6) continue;
                priorityNew.push({
                    type: 'weapon', key,
                    name: config.name,
                    description: config.description,
                    isNew: true, level: 0, icon: this._iconTexture(key),
                });
            } else {
                upgradeOptions.push({
                    type: 'weapon', key,
                    name: config.name,
                    description: `Lv.${currentLevel}  →  Lv.${currentLevel + 1}`,
                    isNew: false, level: currentLevel, icon: this._iconTexture(key),
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
                isNew: currentLevel === 0, level: currentLevel, icon: this._iconTexture(key),
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
        const availableH = Math.max(44, bottomY - cardsTop);
        const minTarget = layout.touch ? this._minTouchUnits() : 44;

        if (layout.stack) {
            const spacing = Math.min(uv(14), Math.max(uv(6), Math.floor(availableH * 0.03)));
            const fitH = Math.floor((availableH - (choices.length - 1) * spacing) / Math.max(choices.length, 1));
            const cardH = Math.max(minTarget, Math.min(uv(142), fitH));
            const cardW = Math.min(GAME_WIDTH - layout.sidePad * 2, uv(layout.isPortrait ? 720 : 640));
            const totalH = choices.length * cardH + (choices.length - 1) * spacing;
            const startY = cardsTop + Math.max(0, (availableH - totalH) / 2);

            choices.forEach((choice, i) => {
                const y = startY + i * (cardH + spacing);
                this._createMobileCard(GAME_WIDTH / 2 - cardW / 2, y, cardW, cardH, choice);
            });
        } else {
            const spacing = uv(GAME_WIDTH < 1200 ? 18 : 30);
            const cardW = Math.max(minTarget, Math.min(uv(260),
                Math.floor((GAME_WIDTH - layout.sidePad * 2 - (choices.length - 1) * spacing) / Math.max(choices.length, 1))
            ));
            const cardH = Math.max(minTarget, Math.min(uv(layout.isShort ? 282 : 308), availableH));
            const totalW = choices.length * cardW + (choices.length - 1) * spacing;
            const startX = (GAME_WIDTH - totalW) / 2;
            const cardY = cardsTop + Math.max(0, (availableH - cardH) / 2);

            choices.forEach((choice, i) => {
                const x = startX + i * (cardW + spacing);
                this._createCard(x, cardY, cardW, cardH, choice);
            });
        }
    }

    _cardTheme(choice) {
        const weapon = choice.type === 'weapon';
        const typeAccent = weapon ? 0xff9654 : 0x9282ff;
        return {
            border: choice.isNew ? SYSTEM.BORDER_GOLD : typeAccent,
            accent: typeAccent,
            typeColor: weapon ? '#ffab72' : '#b4aaff',
            haloColor: weapon ? 0xff7a32 : 0x7664ff,
            fill: choice.isNew ? 0x17150d : (weapon ? 0x17100d : 0x0e1020),
            glow: choice.isNew ? 8 : 3,
        };
    }

    _createCard(x, y, w, h, choice) {
        const theme = this._cardTheme(choice);
        const panel = UIAssets.createPanel(this, x, y, w, h, {
            asset: choice.isNew ? 'ui_card_gold' : 'ui_card_cyan',
            hoverAsset: 'ui_card_hover',
            cut: uv(12),
            fill: theme.fill,
            fillAlpha: 0.94,
            border: theme.border,
            borderAlpha: 1,
            borderWidth: 1,
            accent: theme.accent,
            glow: theme.glow,
            variant: 'card',
            depth: 1,
            hover: {
                fill: SYSTEM.BG_PANEL_HI,
                fillAlpha: 1,
                border: theme.accent,
                borderWidth: 2,
                glow: 9,
            },
        });
        const visuals = [panel];

        const topRail = this.add.rectangle(x + w / 2, y + uv(5), w - uv(34), Math.max(2, uv(2)), theme.accent, 0.82)
            .setDepth(2);
        const sideRail = this.add.rectangle(x + uv(6), y + h / 2, Math.max(2, uv(3)), h - uv(34), theme.accent, 0.72)
            .setDepth(2);
        visuals.push(topRail, sideRail);

        const selectionGlow = this.add.rectangle(x + w / 2, y + h / 2, w - uv(7), h - uv(7), theme.haloColor, 0.07)
            .setStrokeStyle(2, theme.border, 1).setDepth(4).setAlpha(0).setVisible(false);
        const minTarget = this._detectTouch() ? this._minTouchUnits() : 44;
        const hitH = Math.max(minTarget, h);
        const hit = UIAssets.createHitArea(this, x, y - (hitH - h) / 2, Math.max(minTarget, w), hitH, 5);

        // NEW tag (top-left)
        if (choice.isNew) {
            const badge = padText(this.add.text(x + uv(14), y + uv(10), '  NEW  ', {
                fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: SYSTEM.TEXT_GOLD, backgroundColor: '#05070d',
                padding: { left: 6, right: 6, top: 1, bottom: 1 },
            }).setDepth(3), 2, 2, 6, 6);
            visuals.push(badge);
        }
        // Level badge (top-right)
        if (choice.level > 0) {
            const badge = padText(this.add.text(x + w - uv(14), y + uv(10), `  LV.${choice.level}  `, {
                fontSize: fs(10), fontFamily: UI_FONT_MONO,
                color: theme.typeColor, backgroundColor: '#05070d',
                padding: { left: 6, right: 6, top: 1, bottom: 1 },
            }).setOrigin(1, 0).setDepth(3), 2, 2, 6, 6);
            visuals.push(badge);
        }

        // Icon
        const iconScale = Math.min(2.05, Math.max(1.2, h / uv(150)));
        const haloSize = Math.min(w * 0.44, h * 0.28, uv(92));
        const halo = this.add.circle(x + w / 2, y + h * 0.24, haloSize / 2, theme.haloColor, 0.12)
            .setStrokeStyle(1, theme.accent, 0.36).setDepth(2);
        const icon = this.add.sprite(x + w / 2, y + h * 0.23, choice.icon)
            .setDepth(3).setScale(iconScale);
        visuals.push(halo, icon);

        // Type label
        const typeLabel = choice.type === 'weapon' ? t('skillLabel') : t('passiveLabel');
        const typeText = padText(this.add.text(x + w / 2, y + h * 0.43, `[ ${typeLabel} ]`, {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold', color: theme.typeColor,
            letterSpacing: 0,
        }).setOrigin(0.5).setDepth(3), 2, 2);
        fitText(typeText, w - uv(28), 0, 0.72);
        visuals.push(typeText);

        // Name
        const nameText = padText(this.add.text(x + w / 2, y + h * 0.54, choice.name, {
            fontSize: fs(18), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
            stroke: '#02040a', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(3), 3, 3);
        fitText(nameText, w - uv(28), uv(40), 0.62);
        visuals.push(nameText);

        // Description
        const descY = y + h * 0.68;
        const descText = padText(this.add.text(x + w / 2, descY, choice.description, {
            fontSize: fs(12), fontFamily: UI_FONT_KR, color: SYSTEM.TEXT_CYAN_DIM,
            wordWrap: { width: w - uv(30), useAdvancedWrap: true }, align: 'center', lineSpacing: 5,
        }).setOrigin(0.5, 0).setDepth(3), 3, 4);
        fitText(descText, w - uv(30), Math.max(1, y + h - uv(16) - descY), 0.66);
        const bottomMark = this.add.rectangle(x + w / 2, y + h - uv(8), uv(6), uv(6), theme.accent, 0.7)
            .setRotation(Math.PI / 4).setDepth(3);
        visuals.push(descText, bottomMark);

        this._registerCard({ choice, panel, icon, iconScale, hit, visuals, selectionGlow });
    }

    _createMobileCard(x, y, w, h, choice) {
        const theme = this._cardTheme(choice);
        const panel = UIAssets.createPanel(this, x, y, w, h, {
            asset: choice.isNew ? 'ui_choice_gold' : 'ui_choice_cyan',
            hoverAsset: 'ui_choice_hover',
            cut: uv(10),
            fill: theme.fill,
            fillAlpha: 0.94,
            border: theme.border,
            borderAlpha: 1,
            borderWidth: 1,
            accent: theme.accent,
            glow: theme.glow,
            variant: 'card',
            depth: 1,
            hover: {
                fill: SYSTEM.BG_PANEL_HI,
                fillAlpha: 1,
                border: theme.accent,
                borderWidth: 2,
                glow: 8,
            },
        });
        const visuals = [panel];

        const topRail = this.add.rectangle(x + w / 2, y + uv(4), w - uv(30), Math.max(2, uv(2)), theme.accent, 0.76)
            .setDepth(2);
        const sideRail = this.add.rectangle(x + uv(6), y + h / 2, Math.max(3, uv(4)), h - uv(24), theme.accent, 0.84)
            .setDepth(2);
        const selectionGlow = this.add.rectangle(x + w / 2, y + h / 2, w - uv(7), h - uv(7), theme.haloColor, 0.07)
            .setStrokeStyle(2, theme.border, 1).setDepth(4).setAlpha(0).setVisible(false);
        visuals.push(topRail, sideRail);

        const minTarget = this._detectTouch() ? this._minTouchUnits() : 44;
        const hitH = Math.max(minTarget, h);
        const hit = UIAssets.createHitArea(this, x, y - (hitH - h) / 2, Math.max(minTarget, w), hitH, 5);

        const iconX = x + Math.min(uv(58), w * 0.17);
        const iconScale = Math.min(2, Math.max(0.78, h / uv(76)));
        const haloSize = Math.max(28, Math.min(h * 0.62, uv(74)));
        const halo = this.add.circle(iconX, y + h / 2, haloSize / 2, theme.haloColor, 0.12)
            .setStrokeStyle(1, theme.accent, 0.36).setDepth(2);
        const icon = this.add.sprite(iconX, y + h / 2, choice.icon)
            .setDepth(3).setScale(iconScale);
        visuals.push(halo, icon);

        if (choice.isNew) {
            const badge = padText(this.add.text(x + w - uv(14), y + uv(8), '  NEW  ', {
                fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: SYSTEM.TEXT_GOLD, backgroundColor: '#05070d',
                padding: { left: 6, right: 6, top: 1, bottom: 1 },
            }).setOrigin(1, 0).setDepth(3), 2, 2, 6, 6);
            visuals.push(badge);
        }
        if (choice.level > 0) {
            const badge = padText(this.add.text(x + w - uv(14), y + uv(8), `  LV.${choice.level}  `, {
                fontSize: fs(10), fontFamily: UI_FONT_MONO, color: theme.typeColor,
                backgroundColor: '#05070d',
                padding: { left: 6, right: 6, top: 1, bottom: 1 },
            }).setOrigin(1, 0).setDepth(3), 2, 2, 6, 6);
            visuals.push(badge);
        }

        const dense = h < uv(104);
        const textX = x + Math.min(uv(112), w * 0.27);
        const textW = Math.max(1, x + w - uv(42) - textX);
        const typeLabel = choice.type === 'weapon' ? t('skillLabel') : t('passiveLabel');

        const typeText = padText(this.add.text(textX, y + h * (dense ? 0.08 : 0.14), `[ ${typeLabel} ]`, {
            fontSize: fs(dense ? 10 : 12), fontFamily: UI_FONT_MONO,
            fontStyle: 'bold', color: theme.typeColor, letterSpacing: 0,
        }).setOrigin(0, 0).setDepth(3), 2, 2);
        fitText(typeText, textW, 0, 0.68);

        const nameText = padText(this.add.text(textX, y + h * (dense ? 0.34 : 0.36), choice.name, {
            fontSize: fs(dense ? 15 : 18), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT, stroke: '#02040a', strokeThickness: 2,
        }).setOrigin(0, 0).setDepth(3), 3, 3);
        fitText(nameText, textW, Math.max(1, h * 0.27), 0.6);

        const descY = y + h * (dense ? 0.66 : 0.63);
        const descText = padText(this.add.text(textX, descY, choice.description, {
            fontSize: fs(dense ? 10 : 13), fontFamily: UI_FONT_KR, color: SYSTEM.TEXT_CYAN_DIM,
            wordWrap: { width: textW, useAdvancedWrap: true }, lineSpacing: 4,
        }).setOrigin(0, 0).setDepth(3), 2, 4);
        fitText(descText, textW, Math.max(1, y + h - uv(9) - descY), 0.58);
        descText.setVisible(h >= 72);

        const chevron = padText(this.add.text(x + w - uv(18), y + h / 2, '›', {
            fontSize: fs(dense ? 22 : 28), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: theme.typeColor,
        }).setOrigin(0.5).setDepth(3), 2, 2);
        visuals.push(typeText, nameText, descText, chevron);

        this._registerCard({ choice, panel, icon, iconScale, hit, visuals, selectionGlow });
    }

    _registerCard(card) {
        this._choiceCards.push(card);

        card.hit.on('pointerover', () => {
            if (this._selectionLocked) return;
            card.panel.setUIState('hover');
            this.tweens.killTweensOf(card.icon);
            this.tweens.add({
                targets: card.icon,
                scaleX: card.iconScale * 1.08,
                scaleY: card.iconScale * 1.08,
                duration: 110,
                ease: 'Cubic.Out',
            });
        });
        card.hit.on('pointerout', () => {
            if (this._selectionLocked) return;
            card.panel.setUIState('normal').setAlpha(1);
            this.tweens.killTweensOf(card.icon);
            this.tweens.add({
                targets: card.icon,
                scaleX: card.iconScale,
                scaleY: card.iconScale,
                duration: 100,
                ease: 'Cubic.Out',
            });
        });
        card.hit.on('pointerdown', () => {
            if (this._selectionLocked) return;
            card.panel.setUIState('hover');
            card.icon.setScale(card.iconScale * 0.94);
            this._selectChoice(card.choice, card);
        });
    }

    _selectChoice(choice, selectedCard = null) {
        if (this._selectionLocked) return;
        this._selectionLocked = true;

        const soundManager = this.game._soundManager;
        if (soundManager) soundManager.play('select');

        this._choiceCards.forEach(card => {
            card.hit.disableInteractive();
            this.tweens.killTweensOf(card.icon);

            if (card === selectedCard) {
                card.panel.setUIState('hover').setAlpha(1);
                card.selectionGlow.setVisible(true).setAlpha(0);
                this.tweens.add({
                    targets: card.selectionGlow,
                    alpha: 1,
                    duration: 100,
                    ease: 'Cubic.Out',
                });
                this.tweens.add({
                    targets: card.icon,
                    scaleX: card.iconScale * 1.16,
                    scaleY: card.iconScale * 1.16,
                    duration: 90,
                    yoyo: true,
                    ease: 'Cubic.Out',
                });
            } else {
                this.tweens.add({
                    targets: card.visuals,
                    alpha: 0.28,
                    duration: 130,
                    ease: 'Cubic.Out',
                });
            }
        });

        if (selectedCard) {
            this._selectionTimer = this.time.delayedCall(180, () => {
                this._selectionTimer = null;
                this._commitChoice(choice);
            });
        } else {
            this._commitChoice(choice);
        }
    }

    _commitChoice(choice) {
        if (!this.player || !this.weaponManager) return;

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
