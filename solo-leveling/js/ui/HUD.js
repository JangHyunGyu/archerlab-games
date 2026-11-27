import {
    GAME_WIDTH, GAME_HEIGHT, WORLD_SIZE,
    COLORS, RANKS,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, fitText, padText,
} from '../utils/Constants.js';
import { UIAssets } from './UIAssets.js?v=20261127-gothic-ui-v1';
import { questLine } from '../utils/i18n.js?v=20261009-audit-v1';

function cssPerGameUnit(scene) {
    const scale = scene && scene.game && scene.game.scale ? scene.game.scale.displayScale : null;
    const sx = Number(scale ? scale.x : 0);
    const sy = Number(scale ? scale.y : 0);
    if (sx > 0.01 && sy > 0.01) return 1 / Math.max(sx, sy);
    const viewport = window.visualViewport;
    const w = Math.max(1, (viewport && viewport.width) || window.innerWidth || GAME_WIDTH);
    const h = Math.max(1, (viewport && viewport.height) || window.innerHeight || GAME_HEIGHT);
    return Math.max(0.01, Math.min(w / GAME_WIDTH, h / GAME_HEIGHT));
}

export class HUD {
    constructor(scene) {
        this.scene = scene;
        this.elements = [];
        this.weaponSlots = [];
        this._initResponsiveMetrics();

        this._createLeftPanel();
        this._createRightPanel();
        this._createTimer();
        this._createHomeButton();
        this._createDungeonBreakDisplay();
        this._createWeaponSlots();
        this._createShadowArmyDisplay();
        this._createMinimap();
    }

    _initResponsiveMetrics() {
        this._margin = uv(12);
        this._isPortrait = GAME_WIDTH < GAME_HEIGHT;
        this._isTouch = this._detectTouch();
        this._isCompact = this._isPortrait || GAME_WIDTH < 1200 || GAME_HEIGHT < 820;
        const viewport = window.visualViewport;
        const cssW = (viewport && viewport.width) || window.innerWidth || GAME_WIDTH;
        const cssH = (viewport && viewport.height) || window.innerHeight || GAME_HEIGHT;
        this._isPhone = this._isTouch && Math.min(cssW, cssH) < 540;
    }

    _detectTouch() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window)
            || (navigator.maxTouchPoints > 0);
    }

    _minTouchUnits(cssPixels = 44) {
        return Math.ceil(cssPixels / cssPerGameUnit(this.scene));
    }

    _text(x, y, value, style) {
        const text = padText(this.scene.add.text(x, y, value, style), 4, 5, 2, 2);
        if (typeof text.setLineSpacing === 'function') text.setLineSpacing(3);
        text._hudTextValue = value;
        return text;
    }

    _setTextIfChanged(text, value) {
        if (!text || text._hudTextValue === value) return false;
        text._hudTextValue = value;
        text.setText(value);
        return true;
    }

    _setVisibleIfChanged(obj, visible) {
        if (obj && obj.visible !== visible) obj.setVisible(visible);
    }

    _weaponIconTexture(key) {
        const authoredKey = 'asset_icon_' + key;
        return this.scene.textures.exists(authoredKey) ? authoredKey : 'icon_' + key;
    }

    _createLeftPanel() {
        const m = this._margin;
        const xpH = uv(this._isPortrait ? 6 : 5);
        this._xpW = GAME_WIDTH;
        this._xpH = xpH;

        // Top-edge full-width EXP bar
        this.xpBg = this.scene.add.rectangle(0, 0, GAME_WIDTH, xpH, 0x070512, 0.9)
            .setOrigin(0, 0).setDepth(100).setScrollFactor(0);
        this.xpFill = this.scene.add.rectangle(0, 0, GAME_WIDTH, xpH, 0x9b5eff)
            .setOrigin(0, 0).setDepth(101).setScrollFactor(0);
        this.xpTip = this.scene.add.rectangle(0, 0, Math.max(2, uv(3)), xpH, 0xe8c266, 0.95)
            .setOrigin(1, 0).setDepth(102).setScrollFactor(0).setVisible(false);
        this.elements.push(this.xpBg, this.xpFill, this.xpTip);

        // Top-left HP bar framed by native-transparent metallic bezel
        const x = m;
        const topY = xpH + uv(9);
        const barW = Math.min(uv(this._isPortrait ? 156 : 194), GAME_WIDTH * 0.4);
        const hpH = uv(this._isPortrait ? 18 : 20);
        this._hpW = barW;
        this._hpH = hpH;

        const bezelPadX = Math.max(uv(12), Math.round(hpH * 0.66));
        const bezelPadY = Math.max(uv(4), Math.round(hpH * 0.24));
        this.hpBg = this.scene.add.rectangle(x + bezelPadX, topY + bezelPadY, barW - bezelPadX * 2, hpH - bezelPadY * 2, 0x12060c, 0.92)
            .setOrigin(0, 0).setDepth(100).setScrollFactor(0);
        this.hpFill = this.scene.add.rectangle(x + bezelPadX + 1, topY + bezelPadY + 1, barW - bezelPadX * 2 - 2, hpH - bezelPadY * 2 - 2, COLORS.HP_RED)
            .setOrigin(0, 0).setDepth(101).setScrollFactor(0);
        this._hpTrackW = barW - bezelPadX * 2;
        const hpBezel = UIAssets.createPanel(this.scene, x, topY, barW, hpH, {
            variant: 'bar',
            depth: 102,
            scrollFactor: 0,
        });

        this.hpText = this._text(x + barW / 2, topY + hpH / 2, '', {
            fontSize: fs(9), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#ffffff', stroke: '#05040d', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(103).setScrollFactor(0);
        this.elements.push(this.hpBg, this.hpFill, hpBezel, this.hpText);

        // Clean frameless single-line stat readout directly under HP bar
        const statY = topY + hpH + uv(4);
        this.statPlate = null;
        this.rankText = null;
        this._statX = x + uv(4);
        this._statY = statY;

        this.levelText = this._text(this._statX, this._statY, 'LV.1', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#f5f0ff', stroke: '#05040d', strokeThickness: 3,
        }).setOrigin(0, 0).setDepth(100).setScrollFactor(0);

        this.killText = this._text(this._statX, this._statY, 'KILL 0', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#ffd48a', stroke: '#05040d', strokeThickness: 3,
        }).setOrigin(0, 0).setDepth(100).setScrollFactor(0);

        this.elements.push(this.levelText, this.killText);
        this._layoutStatRow();

        this._leftPanelBottom = statY + Math.max(uv(18), this.levelText.displayHeight || uv(18));
        this._leftPanelRight = x + barW;
    }

    _layoutStatRow() {
        if (!this.levelText || !this.killText) return;
        this.levelText.setScale(1);
        this.killText.setScale(1);
        const gap = uv(10);
        const maxW = Math.max(uv(120), (this._hpW || uv(160)) - uv(8));
        const totalW = this.levelText.width + gap + this.killText.width;
        const scale = totalW > maxW ? Math.max(0.7, maxW / totalW) : 1;
        this.levelText.setScale(scale);
        this.killText.setScale(scale);
        this.levelText.setX(this._statX);
        this.killText.setX(this.levelText.x + this.levelText.displayWidth + gap * scale);
    }

    _createRightPanel() {
        // Removed persistent multi-line quest clutter; active objectives use SystemMessage banners.
        this.questText = null;
    }

    _createTimer() {
        const y = (this._xpH || uv(5)) + uv(this._isPortrait ? 18 : 20);
        const maxW = Math.min(uv(this._isPortrait ? 104 : 124), GAME_WIDTH * 0.24);
        this.timerPlate = null;
        this.timerText = this._text(GAME_WIDTH / 2, y, '00:00', {
            fontSize: fs(this._isPortrait ? 16 : 19), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#f7efd8', stroke: '#05040d', strokeThickness: 4,
            shadow: { offsetX: 0, offsetY: 2, color: '#05030d', blur: 6, fill: true },
        }).setOrigin(0.5).setDepth(100).setScrollFactor(0);
        fitText(this.timerText, maxW, uv(28), 0.72);
        this.elements.push(this.timerText);
        this._timerBottom = y + Math.max(uv(14), (this.timerText.displayHeight || uv(20)) * 0.5 + uv(4));
    }

    _createDungeonBreakDisplay() {
        const y = (this._timerBottom || (this._xpH || uv(5)) + uv(36)) + uv(4);
        this.breakText = this._text(GAME_WIDTH / 2, y, '', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_RED, stroke: '#05040d', strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0);
        fitText(this.breakText, GAME_WIDTH - this._margin * 2, 0, 0.72);
        this.elements.push(this.breakText);
    }

    _createWeaponSlots() {
        this.weaponSlots = [];
        this.weaponIcons = [];
        this.weaponTexts = [];

        const slotSize = uv(this._isPhone ? 36 : (this._isTouch ? 40 : 38));
        const gap = uv(5);
        const cols = 6;
        const totalW = cols * slotSize + (cols - 1) * gap;
        const startX = this._margin;
        const startY = GAME_HEIGHT - this._margin - slotSize;
        this._weaponSlotsTop = startY;
        this._weaponSlotsBottom = startY + slotSize;
        this._weaponSlotsRight = startX + totalW;

        for (let i = 0; i < 6; i++) {
            const x = startX + i * (slotSize + gap);
            const y = startY;

            const slotPanel = UIAssets.createPanel(this.scene, x, y, slotSize, slotSize, {
                variant: 'slot',
                depth: 100,
                scrollFactor: 0,
            }).setVisible(false);
            this.weaponSlots.push(slotPanel);
            this.elements.push(slotPanel);

            const icon = this.scene.add.sprite(x + slotSize / 2, y + slotSize / 2, 'particle')
                .setDepth(101).setScrollFactor(0).setVisible(false);
            icon._hudDisplaySize = Math.max(8, slotSize - uv(12));

            const lvText = this._text(x + slotSize - uv(3), y + slotSize - uv(2), '', {
                fontSize: fs(9), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: '#ffe08a', stroke: '#05040d', strokeThickness: 3,
            }).setOrigin(1, 1).setDepth(102).setScrollFactor(0);

            this.weaponIcons.push(icon);
            this.weaponTexts.push(lvText);
            this.elements.push(icon, lvText);
        }
    }

    _createShadowArmyDisplay() {
        const shadowY = Math.max(
            this._leftPanelBottom + uv(8),
            (this._weaponSlotsTop || GAME_HEIGHT - uv(54)) - uv(14)
        );
        this.shadowPlate = null;
        this.shadowText = this._text(this._margin + uv(2), shadowY, '', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#d8beff', stroke: '#05040d', strokeThickness: 3,
        }).setOrigin(0, 0.5).setDepth(100).setScrollFactor(0);
        this.elements.push(this.shadowText);
    }

    _createMinimap() {
        if (this._isPhone) {
            this._mmGfx = null;
            this._mmBg = null;
            this._mmBackdrop = null;
            return;
        }
        const size = this._isPortrait ? uv(72) : (this._isCompact ? uv(76) : uv(86));
        const m = this._margin;
        const inset = uv(5);
        this._mmSize = size;
        this._mmX = GAME_WIDTH - m - size;
        this._mmY = GAME_HEIGHT - m - size;
        this._mmInnerX = this._mmX + inset;
        this._mmInnerY = this._mmY + inset;
        this._mmScale = (size - inset * 2) / WORLD_SIZE;

        this._mmBackdrop = this.scene.add.rectangle(
            this._mmInnerX,
            this._mmInnerY,
            size - inset * 2,
            size - inset * 2,
            0x060410,
            0.76
        ).setOrigin(0, 0).setDepth(100).setScrollFactor(0);
        this.elements.push(this._mmBackdrop);

        this._mmGfx = this.scene.add.graphics().setDepth(101).setScrollFactor(0);
        this.elements.push(this._mmGfx);

        this._mmBg = UIAssets.createPanel(this.scene, this._mmX, this._mmY, size, size, {
            variant: 'minimap',
            depth: 102,
            alpha: 0.88,
            scrollFactor: 0,
        });
        this.elements.push(this._mmBg);
    }

    _updateMinimap(player, enemyManager, shadowArmyManager, activeEnemies = null) { var __oc2;
        if (!this._mmGfx || !player) return;

        const gfx = this._mmGfx;
        const ox = this._mmInnerX !== undefined ? this._mmInnerX : this._mmX;
        const oy = this._mmInnerY !== undefined ? this._mmInnerY : this._mmY;
        const s = this._mmScale;

        gfx.clear();

        const cam = this.scene.cameras.main;
        const vx = ox + (cam.scrollX * s);
        const vy = oy + (cam.scrollY * s);
        const vw = (cam.width / cam.zoom) * s;
        const vh = (cam.height / cam.zoom) * s;
        gfx.lineStyle(1, SYSTEM.BORDER, 0.5);
        gfx.strokeRect(vx, vy, vw, vh);

        if (enemyManager) {
            const enemies = activeEnemies || enemyManager.getActiveEnemies();
            const maxDots = (((__oc2 = this.scene) === null || __oc2 === void 0 ? void 0 : __oc2._lowQuality)) ? 80 : (enemies.length > 300 ? 150 : 220);
            const stride = Math.max(1, Math.ceil(enemies.length / maxDots));
            gfx.fillStyle(0xff4444, 0.8);
            for (let i = 0; i < enemies.length; i += stride) {
                const e = enemies[i];
                if (!e.active) continue;
                const ex = ox + e.x * s;
                const ey = oy + e.y * s;
                if (e.isElite) {
                    gfx.fillStyle(0xff8844, 0.95);
                    gfx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
                    gfx.fillStyle(0xff4444, 0.8);
                } else {
                    gfx.fillRect(ex - 0.5, ey - 0.5, 1.5, 1.5);
                }
            }
            if (stride > 1) {
                for (const e of enemies) {
                    if (!((e === null || e === void 0 ? void 0 : e.active)) || !e.isElite) continue;
                    const ex = ox + e.x * s;
                    const ey = oy + e.y * s;
                    gfx.fillStyle(0xff8844, 0.95);
                    gfx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
                }
            }
        }

        const bosses = this.scene.activeBosses || [];
        for (const b of bosses) {
            if (!b.active) continue;
            const bx = ox + b.x * s;
            const by = oy + b.y * s;
            gfx.fillStyle(0xff2222, 1);
            gfx.fillCircle(bx, by, 3);
            gfx.lineStyle(1, 0xff8888, 0.9);
            gfx.strokeCircle(bx, by, 5);
        }

        if (shadowArmyManager) {
            const soldiers = shadowArmyManager.getSoldiers();
            gfx.fillStyle(SYSTEM.BORDER, 0.9);
            for (const sol of soldiers) {
                if (!sol.active) continue;
                gfx.fillRect(ox + sol.x * s - 1, oy + sol.y * s - 1, 2.5, 2.5);
            }
        }

        const px = ox + player.x * s;
        const py = oy + player.y * s;
        gfx.fillStyle(SYSTEM.BORDER, 1);
        gfx.fillCircle(px, py, 3);
        gfx.fillStyle(0xffffff, 1);
        gfx.fillCircle(px, py, 1.2);
    }

    _createHomeButton() {
        const m = this._margin;
        const topY = (this._xpH || uv(5)) + uv(8);
        const minTouch = this._minTouchUnits(44);
        const size = Math.max(uv(38), minTouch);
        const x = GAME_WIDTH - m - size;
        const panel = UIAssets.createPanel(this.scene, x, topY, size, size, {
            variant: 'button',
            tone: 'secondary',
            depth: 98,
            scrollFactor: 0,
        });
        const hit = UIAssets.createHitArea(this.scene, x, topY, size, size, 103).setScrollFactor(0);
        this.homeBtn = this._text(x + size / 2, topY + size / 2, '❚❚', {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#ebe4f8', stroke: '#05040d', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(100).setScrollFactor(0);
        fitText(this.homeBtn, size - uv(14), size - uv(12), 0.68);
        this._homeLeft = x;
        this._homeWidth = size;
        this._homeBottom = topY + size;
        this._menuButtonBounds = { x, y: topY, width: size, height: size };

        hit.on('pointerover', () => { panel.setUIState('hover'); this.homeBtn.setColor('#ffffff'); });
        hit.on('pointerout', () => { panel.setUIState('normal'); this.homeBtn.setColor('#ebe4f8'); });
        hit.on('pointerdown', () => {
            panel.setUIState('pressed');
            this.scene.time.delayedCall(90, () => {
                if (panel && panel.active) panel.setUIState('normal');
            });
            if (this.scene && this.scene.statusWindow) {
                this.scene.statusWindow.toggle();
            } else {
                this.scene.cameras.main.fadeOut(260, 0, 0, 0);
                this.scene.time.delayedCall(260, () => {
                    this.scene.scene.start('MenuScene');
                });
            }
        });
        this.elements.push(panel, hit, this.homeBtn);
    }

    update(player, weaponManager, enemyManager, shadowArmyManager) {
        if (!player) return;
        return this._updateOptimized(player, weaponManager, enemyManager, shadowArmyManager);
    }

    _updateOptimized(player, weaponManager, enemyManager, shadowArmyManager) {
        const now = (this.scene && this.scene.time && this.scene.time.now !== undefined) ? this.scene.time.now : 0;

        const hpRatio = player.stats.maxHp > 0
            ? Phaser.Math.Clamp(player.stats.hp / player.stats.maxHp, 0, 1)
            : 0;
        const trackW = this._hpTrackW !== undefined ? this._hpTrackW : (this._hpW - 2);
        const hpWidth = Math.max(0, (trackW - 2) * hpRatio);
        if (this.hpFill._hudWidth !== hpWidth) {
            this.hpFill._hudWidth = hpWidth;
            this.hpFill.width = hpWidth;
        }
        this._setTextIfChanged(this.hpText, `${Math.floor(player.stats.hp)} / ${player.stats.maxHp}`);

        let hpColor = COLORS.HP_RED;
        if (hpRatio < 0.3) hpColor = 0xff0000;
        else if (hpRatio < 0.6) hpColor = 0xff6633;
        if (this.hpFill._hudFillColor !== hpColor) {
            this.hpFill._hudFillColor = hpColor;
            this.hpFill.setFillStyle(hpColor);
        }

        const xpRatio = player.xpToNext > 0
            ? Phaser.Math.Clamp(player.xp / player.xpToNext, 0, 1)
            : 0;
        const xpWidth = this._xpW * xpRatio;
        if (this.xpFill._hudWidth !== xpWidth) {
            this.xpFill._hudWidth = xpWidth;
            this.xpFill.width = xpWidth;
            if (this.xpTip) {
                this.xpTip.setVisible(xpWidth > 2).setX(xpWidth);
            }
        }

        let activeEnemies = null;
        if (enemyManager) {
            const totalSeconds = Math.floor(enemyManager.getGameTime() / 1000);
            if (this._hudSeconds !== totalSeconds) {
                this._hudSeconds = totalSeconds;
                const min = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
                const sec = (totalSeconds % 60).toString().padStart(2, '0');
                this._setTextIfChanged(this.timerText, `${min}:${sec}`);
            }
            activeEnemies = enemyManager.getActiveEnemies();
        }

        let statsChanged = false;
        if (this._setTextIfChanged(this.levelText, `LV.${player.level}`)) statsChanged = true;

        if (this.rankText) {
            const rank = RANKS[player.currentRank] || RANKS[0];
            if (this._setTextIfChanged(this.rankText, rank.name)) statsChanged = true;
            const rankColor = '#' + rank.color.toString(16).padStart(6, '0');
            if (this._hudRankColor !== rankColor) {
                this._hudRankColor = rankColor;
                this.rankText.setColor(rankColor);
            }
        }
        if (this._setTextIfChanged(this.killText, `KILL ${player.kills}`)) statsChanged = true;
        if (statsChanged) this._layoutStatRow();

        if (weaponManager) {
            const weapons = weaponManager.getOwnedWeapons();
            const signature = weapons.map(w => `${w.key}:${w.level}`).join('|');
            if (this._hudWeaponSignature !== signature) {
                this._hudWeaponSignature = signature;
                for (let i = 0; i < 6; i++) {
                    const slotPanel = this.weaponSlots ? this.weaponSlots[i] : null;
                    if (i < weapons.length) {
                        const w = weapons[i];
                        const icon = this.weaponIcons[i];
                        const texture = this._weaponIconTexture(w.key);
                        if ((icon.texture && icon.texture.key) !== texture) icon.setTexture(texture);
                        icon.setDisplaySize(icon._hudDisplaySize, icon._hudDisplaySize);
                        if (slotPanel) this._setVisibleIfChanged(slotPanel, true);
                        this._setVisibleIfChanged(icon, true);
                        this._setTextIfChanged(this.weaponTexts[i], String(w.level));
                    } else {
                        if (slotPanel) this._setVisibleIfChanged(slotPanel, false);
                        this._setVisibleIfChanged(this.weaponIcons[i], false);
                        this._setTextIfChanged(this.weaponTexts[i], '');
                    }
                }
            }
        }

        if (shadowArmyManager) {
            const count = shadowArmyManager.getSoldierCount();
            const shadowText = count > 0
                ? `SHADOW ${String(count).padStart(2, '0')}/${String(shadowArmyManager.maxSoldiers).padStart(2, '0')}`
                : '';
            if (this.shadowPlate) this._setVisibleIfChanged(this.shadowPlate, count > 0);
            if (this._setTextIfChanged(this.shadowText, shadowText)) {
                fitText(this.shadowText, Math.min(uv(108), GAME_WIDTH * 0.34), 0, 0.7);
            }
        }

        if (enemyManager && this.questText && (!this._questNextUpdateAt || now >= this._questNextUpdateAt)) {
            this._questNextUpdateAt = now + 250;
            const quests = enemyManager.getActiveQuests();
            this._setTextIfChanged(this.questText, quests.length > 0 ? quests.slice(0, 2).map(q => `- ${questLine(q)}`).join('\n') : '');
        }

        const enemyCount = (activeEnemies && activeEnemies.length) || 0;
        const minimapModulo = enemyCount > 300 ? 10 : (enemyCount > 180 ? 6 : 3);
        this._mmFrameCounter = ((this._mmFrameCounter || 0) + 1) % minimapModulo;
        if (this._mmFrameCounter === 0) {
            this._updateMinimap(player, enemyManager, shadowArmyManager, activeEnemies);
        }

        if (enemyManager && this.breakText) {
            if (enemyManager.isDungeonBreakActive()) {
                if (this._setTextIfChanged(this.breakText, 'DUNGEON BREAK')) {
                    fitText(this.breakText, GAME_WIDTH - this._margin * 2, 0, 0.72);
                }
                this.breakText.setAlpha(0.55 + Math.sin(now * 0.005) * 0.4);
            } else {
                this._setTextIfChanged(this.breakText, '');
            }
        }
    }

    _updateLegacy(player, weaponManager, enemyManager, shadowArmyManager) {
        if (!player) return;

        const hpRatio = player.stats.maxHp > 0
            ? Phaser.Math.Clamp(player.stats.hp / player.stats.maxHp, 0, 1)
            : 0;
        const trackW = this._hpTrackW !== undefined ? this._hpTrackW : (this._hpW - 2);
        const hpWidth = Math.max(0, (trackW - 2) * hpRatio);
        if (this.hpFill._hudWidth !== hpWidth) {
            this.hpFill._hudWidth = hpWidth;
            this.hpFill.width = hpWidth;
        }
        this._setTextIfChanged(this.hpText, `${Math.floor(player.stats.hp)} / ${player.stats.maxHp}`);

        let hpColor = COLORS.HP_RED;
        if (hpRatio < 0.3) hpColor = 0xff0000;
        else if (hpRatio < 0.6) hpColor = 0xff6633;
        if (this.hpFill._hudFillColor !== hpColor) {
            this.hpFill._hudFillColor = hpColor;
            this.hpFill.setFillStyle(hpColor);
        }

        const xpRatio = player.xpToNext > 0
            ? Phaser.Math.Clamp(player.xp / player.xpToNext, 0, 1)
            : 0;
        const xpWidth = this._xpW * xpRatio;
        if (this.xpFill._hudWidth !== xpWidth) {
            this.xpFill._hudWidth = xpWidth;
            this.xpFill.width = xpWidth;
            if (this.xpTip) {
                this.xpTip.setVisible(xpWidth > 2).setX(xpWidth);
            }
        }

        if (enemyManager) {
            const totalSeconds = Math.floor(enemyManager.getGameTime() / 1000);
            if (this._hudSeconds !== totalSeconds) {
                this._hudSeconds = totalSeconds;
                const min = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
                const sec = (totalSeconds % 60).toString().padStart(2, '0');
                this._setTextIfChanged(this.timerText, `${min}:${sec}`);
            }
        }

        this.levelText.setText(`LV.${player.level}`);
        if (this.rankText) {
            const rank = RANKS[player.currentRank] || RANKS[0];
            this.rankText.setText(rank.name);
            this.rankText.setColor('#' + rank.color.toString(16).padStart(6, '0'));
        }
        this.killText.setText(`KILL ${player.kills}`);
        this._layoutStatRow();

        if (weaponManager) {
            const weapons = weaponManager.getOwnedWeapons();
            for (let i = 0; i < 6; i++) {
                const slotPanel = this.weaponSlots ? this.weaponSlots[i] : null;
                if (i < weapons.length) {
                    const w = weapons[i];
                    if (slotPanel) slotPanel.setVisible(true);
                    this.weaponIcons[i].setTexture(this._weaponIconTexture(w.key)).setVisible(true);
                    this.weaponTexts[i].setText(String(w.level));
                } else {
                    if (slotPanel) slotPanel.setVisible(false);
                    this.weaponIcons[i].setVisible(false);
                    this.weaponTexts[i].setText('');
                }
            }
        }

        if (shadowArmyManager) {
            const count = shadowArmyManager.getSoldierCount();
            if (this.shadowPlate) this._setVisibleIfChanged(this.shadowPlate, count > 0);
            this.shadowText.setText(
                count > 0
                    ? `SHADOW ${String(count).padStart(2, '0')}/${String(shadowArmyManager.maxSoldiers).padStart(2, '0')}`
                    : ''
            );
            fitText(this.shadowText, Math.min(uv(108), GAME_WIDTH * 0.34), 0, 0.7);
        }

        if (enemyManager && this.questText) {
            const quests = enemyManager.getActiveQuests();
            this.questText.setText(quests.length > 0 ? quests.slice(0, 2).map(q => `- ${questLine(q)}`).join('\n') : '');
        }

        this._mmFrameCounter = ((this._mmFrameCounter || 0) + 1) % 3;
        if (this._mmFrameCounter === 0) {
            this._updateMinimap(player, enemyManager, shadowArmyManager);
        }

        if (enemyManager && this.breakText) {
            if (enemyManager.isDungeonBreakActive()) {
                this.breakText.setText('DUNGEON BREAK');
                fitText(this.breakText, GAME_WIDTH - this._margin * 2, 0, 0.72);
                this.breakText.setAlpha(0.55 + Math.sin(Date.now() * 0.005) * 0.4);
            } else {
                this.breakText.setText('');
            }
        }
    }

    rebuild() {
        this.destroy();
        this.elements = [];
        this.weaponSlots = [];

        // Every display object below is new. Invalidate the value caches too,
        // otherwise the first update after an orientation change can mistake
        // the fresh HUD for the already-painted one and leave weapon icons,
        // rank color, or elapsed time in their placeholder state.
        this._hudSeconds = null;
        this._hudWeaponSignature = null;
        this._hudRankColor = null;
        this._questNextUpdateAt = 0;
        this._mmFrameCounter = 0;

        this._initResponsiveMetrics();
        this._createLeftPanel();
        this._createRightPanel();
        this._createTimer();
        this._createHomeButton();
        this._createDungeonBreakDisplay();
        this._createWeaponSlots();
        this._createShadowArmyDisplay();
        this._createMinimap();
    }

    destroy() { var __oc10;
        const tweens = (((__oc10 = this.scene) === null || __oc10 === void 0 ? void 0 : __oc10.tweens));
        for (const el of this.elements) {
            if (tweens) tweens.killTweensOf(el);
            if (el && el.active) el.destroy();
        }
        this.elements = [];
    }
}
