import {
    GAME_WIDTH, GAME_HEIGHT, WORLD_SIZE,
    COLORS, RANKS,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, fitText, padText,
} from '../utils/Constants.js';
import { UIAssets } from './UIAssets.js?v=20260913-crafted-ui-v1';
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
        this._margin = uv(12);
        this._isPortrait = GAME_WIDTH < GAME_HEIGHT;
        this._isTouch = this._detectTouch();
        this._isCompact = this._isPortrait || GAME_WIDTH < 1200 || GAME_HEIGHT < 820;

        this._createLeftPanel();
        this._createRightPanel();
        this._createTimer();
        this._createHomeButton();
        this._createDungeonBreakDisplay();
        this._createWeaponSlots();
        this._createShadowArmyDisplay();
        this._createMinimap();
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
        const xpH = uv(this._isPortrait ? 5 : 4);
        this._xpW = GAME_WIDTH;
        this._xpH = xpH;

        // Top-edge full-width ultra-thin EXP bar
        this.xpBg = this.scene.add.rectangle(0, 0, GAME_WIDTH, xpH, 0x090d1a, 0.85)
            .setOrigin(0, 0).setDepth(100).setScrollFactor(0);
        this.xpFill = this.scene.add.rectangle(0, 0, GAME_WIDTH, xpH, SYSTEM.BORDER)
            .setOrigin(0, 0).setDepth(101).setScrollFactor(0);
        this.elements.push(this.xpBg, this.xpFill);

        // Frameless compact top-left HP bar + single-line LV / RANK / KILL row
        const x = m;
        const topY = xpH + uv(8);
        const barW = Math.min(uv(this._isPortrait ? 132 : 168), GAME_WIDTH * 0.36);
        const hpH = uv(this._isPortrait ? 14 : 15);
        this._hpW = barW;
        this._hpH = hpH;

        this.hpBg = this.scene.add.rectangle(x, topY, barW, hpH, 0x14080e, 0.85)
            .setOrigin(0, 0).setDepth(100).setScrollFactor(0);
        this.hpFill = this.scene.add.rectangle(x + 1, topY + 1, barW - 2, hpH - 2, COLORS.HP_RED)
            .setOrigin(0, 0).setDepth(101).setScrollFactor(0);

        const hpFrame = this.scene.add.graphics().setDepth(102).setScrollFactor(0);
        hpFrame.lineStyle(1, 0xff6b7a, 0.45);
        hpFrame.strokeRect(x, topY, barW, hpH);

        this.hpText = this._text(x + barW / 2, topY + hpH / 2, '', {
            fontSize: fs(9), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#ffffff', stroke: '#05040d', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(103).setScrollFactor(0);
        this.elements.push(this.hpBg, this.hpFill, hpFrame, this.hpText);

        const statY = topY + hpH + uv(5);
        this._statX = x;
        this._statY = statY;

        this.levelText = this._text(x, statY, 'LV.1', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#f5f2ff', stroke: '#05040d', strokeThickness: 3,
        }).setOrigin(0, 0).setDepth(100).setScrollFactor(0);

        this.rankText = this._text(x, statY, 'E', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#888888', stroke: '#05040d', strokeThickness: 3,
        }).setOrigin(0, 0).setDepth(100).setScrollFactor(0);

        this.killText = this._text(x, statY, 'KILL 0', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#ffb088', stroke: '#05040d', strokeThickness: 3,
        }).setOrigin(0, 0).setDepth(100).setScrollFactor(0);

        this.elements.push(this.levelText, this.rankText, this.killText);
        this._layoutStatRow();

        this._leftPanelBottom = statY + Math.max(uv(15), this.levelText.displayHeight);
        this._leftPanelRight = x + barW;
    }

    _layoutStatRow() {
        if (!this.levelText || !this.rankText || !this.killText) return;
        const gap = uv(8);
        this.levelText.setX(this._statX);
        this.rankText.setX(this.levelText.x + this.levelText.displayWidth + gap);
        this.killText.setX(this.rankText.x + this.rankText.displayWidth + gap + uv(2));
    }

    _createRightPanel() {
        // Giant right box removed: only lightweight frameless quest line appears if active
        const x = this._margin;
        const y = (this._leftPanelBottom || uv(44)) + uv(4);
        const maxW = Math.min(uv(220), GAME_WIDTH * 0.42);
        this.questText = this._text(x, y, '', {
            fontSize: fs(10), fontFamily: UI_FONT_KR,
            color: SYSTEM.TEXT_CYAN,
            stroke: '#05040d', strokeThickness: 2,
            align: 'left',
            wordWrap: { width: maxW, useAdvancedWrap: true },
            lineSpacing: 3,
        }).setOrigin(0, 0).setDepth(100).setScrollFactor(0);
        this.elements.push(this.questText);
    }

    _createTimer() {
        const y = (this._xpH || uv(4)) + uv(8);
        this.timerText = this._text(GAME_WIDTH / 2, y, '00:00', {
            fontSize: fs(this._isPortrait ? 17 : 20), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#f5f2ff', stroke: '#05040d', strokeThickness: 4,
        }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0);
        fitText(this.timerText, Math.min(uv(140), GAME_WIDTH * 0.25), 0, 0.72);
        this.elements.push(this.timerText);
        this._timerBottom = y + Math.max(uv(22), this.timerText.displayHeight);
    }

    _createDungeonBreakDisplay() {
        const y = (this._timerBottom || (this._xpH || uv(4)) + uv(30)) + uv(4);
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

        const slotSize = uv(this._isTouch ? (this._isPortrait ? 40 : 38) : 34);
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
                fillAlpha: 0.54,
                depth: 100,
                scrollFactor: 0,
            }).setVisible(false);
            this.weaponSlots.push(slotPanel);
            this.elements.push(slotPanel);

            const icon = this.scene.add.sprite(x + slotSize / 2, y + slotSize / 2, 'particle')
                .setDepth(101).setScrollFactor(0).setVisible(false);
            icon._hudDisplaySize = Math.max(8, slotSize - uv(7));

            const lvText = this._text(x + slotSize - 2, y + slotSize - 2, '', {
                fontSize: fs(9), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: SYSTEM.TEXT_GOLD, stroke: '#05040d', strokeThickness: 2,
            }).setOrigin(1, 1).setDepth(102).setScrollFactor(0);

            this.weaponIcons.push(icon);
            this.weaponTexts.push(lvText);
            this.elements.push(icon, lvText);
        }
    }

    _createShadowArmyDisplay() {
        const shadowY = Math.max(
            this._leftPanelBottom + uv(10),
            (this._weaponSlotsTop || GAME_HEIGHT - uv(50)) - uv(20)
        );
        this.shadowText = this._text(this._margin, shadowY, '', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN, stroke: '#05040d', strokeThickness: 2,
        }).setDepth(100).setScrollFactor(0);
        this.elements.push(this.shadowText);
    }

    _createMinimap() {
        const size = this._isPortrait ? uv(64) : (this._isCompact ? uv(70) : uv(78));
        const m = this._margin;
        this._mmSize = size;
        this._mmX = GAME_WIDTH - m - size;
        this._mmY = GAME_HEIGHT - m - size;
        this._mmScale = size / WORLD_SIZE;

        this._mmBg = UIAssets.createPanel(this.scene, this._mmX, this._mmY, size, size, {
            fill: 0x080814,
            fillAlpha: 0.52,
            border: 0x9b8ac4,
            borderAlpha: 0.3,
            borderWidth: 1,
            variant: 'minimap',
            depth: 100,
            scrollFactor: 0,
        });
        this.elements.push(this._mmBg);

        this._mmGfx = this.scene.add.graphics().setDepth(101).setScrollFactor(0);
        this.elements.push(this._mmGfx);
    }

    _updateMinimap(player, enemyManager, shadowArmyManager, activeEnemies = null) { var __oc2;
        if (!this._mmGfx || !player) return;

        const gfx = this._mmGfx;
        const ox = this._mmX;
        const oy = this._mmY;
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
        const topY = (this._xpH || uv(4)) + uv(8);
        const minTouch = this._minTouchUnits(44);
        const w = this._isPortrait ? Math.max(uv(40), minTouch) : Math.max(uv(62), minTouch);
        const h = Math.max(uv(30), minTouch);
        const x = GAME_WIDTH - m - w;
        const label = this._isPortrait ? '✕' : 'EXIT';
        const panel = UIAssets.createPanel(this.scene, x, topY, w, h, {
            variant: 'button',
            fillAlpha: 0.58,
            depth: 98,
            scrollFactor: 0,
        });
        const hit = UIAssets.createHitArea(this.scene, x, topY, w, h, 101).setScrollFactor(0);
        this.homeBtn = this._text(x + w / 2, topY + h / 2, label, {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#d8d0ee',
        }).setOrigin(0.5).setDepth(100).setScrollFactor(0);
        fitText(this.homeBtn, w - uv(6), h - uv(4), 0.7);
        this._homeLeft = x;
        this._homeWidth = w;
        this._homeBottom = topY + h;

        hit.on('pointerover', () => { panel.setUIState('hover'); this.homeBtn.setColor('#ffffff'); });
        hit.on('pointerout', () => { panel.setUIState('normal'); this.homeBtn.setColor('#d8d0ee'); });
        hit.on('pointerdown', () => {
            this.scene.cameras.main.fadeOut(300, 0, 0, 0);
            this.scene.time.delayedCall(300, () => {
                this.scene.scene.start('MenuScene');
            });
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
        const hpWidth = (this._hpW - 2) * hpRatio;
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

        const rank = RANKS[player.currentRank] || RANKS[0];
        if (this._setTextIfChanged(this.rankText, rank.name)) statsChanged = true;
        const rankColor = '#' + rank.color.toString(16).padStart(6, '0');
        if (this._hudRankColor !== rankColor) {
            this._hudRankColor = rankColor;
            this.rankText.setColor(rankColor);
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
            if (this._setTextIfChanged(this.shadowText, shadowText)) {
                fitText(this.shadowText, Math.min(uv(220), GAME_WIDTH * 0.36), 0, 0.7);
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
        const hpWidth = (this._hpW - 2) * hpRatio;
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
        const rank = RANKS[player.currentRank] || RANKS[0];
        this.rankText.setText(rank.name);
        this.rankText.setColor('#' + rank.color.toString(16).padStart(6, '0'));
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
            this.shadowText.setText(
                count > 0
                    ? `SHADOW ${String(count).padStart(2, '0')}/${String(shadowArmyManager.maxSoldiers).padStart(2, '0')}`
                    : ''
            );
            fitText(this.shadowText, Math.min(uv(220), GAME_WIDTH * 0.36), 0, 0.7);
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

        this._margin = uv(12);
        this._isPortrait = GAME_WIDTH < GAME_HEIGHT;
        this._isTouch = this._detectTouch();
        this._isCompact = this._isPortrait || GAME_WIDTH < 1200 || GAME_HEIGHT < 820;
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
