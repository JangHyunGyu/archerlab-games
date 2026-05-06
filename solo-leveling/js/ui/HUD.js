import {
    GAME_WIDTH, GAME_HEIGHT, WORLD_SIZE,
    COLORS, RANKS,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, drawSystemPanel, drawCornerBrackets, fitText, padText,
} from '../utils/Constants.js';

export class HUD {
    constructor(scene) {
        this.scene = scene;
        this.elements = [];
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

    _text(x, y, value, style) {
        return padText(this.scene.add.text(x, y, value, style), 2, 2);
    }

    _createLeftPanel() {
        const m = this._margin;
        let y = m;

        const hpLabel = this._text(m, y, '[ HP ]', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#ff6666',
        }).setDepth(100).setScrollFactor(0);
        this.elements.push(hpLabel);
        y += hpLabel.height + 2;

        const barW = Math.min(uv(180), GAME_WIDTH * 0.4);
        const hpH = uv(14);
        this._hpW = barW;
        this._hpH = hpH;

        this.hpBg = this.scene.add.rectangle(m, y, barW, hpH, 0x1a0608)
            .setOrigin(0, 0).setDepth(100).setScrollFactor(0);
        this.hpFill = this.scene.add.rectangle(m + 1, y + 1, barW - 2, hpH - 2, COLORS.HP_RED)
            .setOrigin(0, 0).setDepth(101).setScrollFactor(0);

        const hpFrame = this.scene.add.graphics().setDepth(102).setScrollFactor(0);
        hpFrame.lineStyle(1, 0xff6666, 0.85);
        hpFrame.strokeRect(m, y, barW, hpH);
        drawCornerBrackets(hpFrame, m - 2, y - 2, barW + 4, hpH + 4, {
            len: uv(5), color: 0xff6666, alpha: 1, lineWidth: 1,
        });

        this.hpText = this._text(m + barW / 2, y + hpH / 2, '', {
            fontSize: fs(9), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#ffffff', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(103).setScrollFactor(0);
        this.elements.push(this.hpBg, this.hpFill, hpFrame, this.hpText);
        y += hpH + 8;

        const xpLabel = this._text(m, y, '[ EXP ]', {
            fontSize: fs(9), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN,
        }).setDepth(100).setScrollFactor(0);
        this.elements.push(xpLabel);
        y += xpLabel.height + 2;

        const xpH = uv(6);
        this._xpW = barW;
        this._xpH = xpH;

        this.xpBg = this.scene.add.rectangle(m, y, barW, xpH, 0x0a1520)
            .setOrigin(0, 0).setDepth(100).setScrollFactor(0);
        this.xpFill = this.scene.add.rectangle(m + 1, y + 1, barW - 2, xpH - 2, SYSTEM.BORDER)
            .setOrigin(0, 0).setDepth(101).setScrollFactor(0);

        const xpFrame = this.scene.add.graphics().setDepth(102).setScrollFactor(0);
        xpFrame.lineStyle(1, SYSTEM.BORDER, 0.8);
        xpFrame.strokeRect(m, y, barW, xpH);

        this.elements.push(this.xpBg, this.xpFill, xpFrame);
        this._leftPanelBottom = y + xpH;
    }

    _createRightPanel() {
        const m = this._margin;
        const panelX = this._isPortrait ? m : GAME_WIDTH - m;
        const originX = this._isPortrait ? 0 : 1;
        const panelW = Math.min(uv(210), this._isPortrait ? GAME_WIDTH - m * 2 : GAME_WIDTH * 0.28);
        let y = this._isPortrait ? this._leftPanelBottom + uv(10) : m;

        this.killText = this._text(panelX, y, '▸ KILL  0000', {
            fontSize: fs(13), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#ff9966', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(originX, 0).setDepth(100).setScrollFactor(0);
        fitText(this.killText, panelW, 0, 0.72);
        this.elements.push(this.killText);
        y += this.killText.displayHeight + 3;

        this.levelText = this._text(panelX, y, '▸ LV    01', {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT, stroke: '#000000', strokeThickness: 1,
        }).setOrigin(originX, 0).setDepth(100).setScrollFactor(0);
        fitText(this.levelText, panelW, 0, 0.72);
        this.elements.push(this.levelText);
        y += this.levelText.displayHeight + 2;

        this.rankText = this._text(panelX, y, '▸ RANK  E', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#888888',
        }).setOrigin(originX, 0).setDepth(100).setScrollFactor(0);
        fitText(this.rankText, panelW, 0, 0.72);
        this.elements.push(this.rankText);
        y += this.rankText.displayHeight + 10;

        this.questText = this._text(panelX, y, '', {
            fontSize: fs(10), fontFamily: UI_FONT_KR,
            color: SYSTEM.TEXT_CYAN,
            align: this._isPortrait ? 'left' : 'right',
            wordWrap: { width: panelW, useAdvancedWrap: true },
        }).setOrigin(originX, 0).setDepth(100).setScrollFactor(0);
        this.elements.push(this.questText);
    }

    _createTimer() {
        this.timerText = this._text(GAME_WIDTH / 2, this._margin, '[ 00:00 ]', {
            fontSize: fs(18), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT, stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0);
        fitText(this.timerText, Math.min(uv(190), GAME_WIDTH * 0.28), 0, 0.72);
        this.elements.push(this.timerText);
    }

    _createDungeonBreakDisplay() {
        const homeBottom = this.homeBtn
            ? this.homeBtn.y + this.homeBtn.displayHeight
            : this._margin + (this.timerText ? this.timerText.displayHeight : uv(20));
        const y = homeBottom + uv(5);
        this.breakText = this._text(GAME_WIDTH / 2, y, '', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_RED, stroke: '#000000', strokeThickness: 1,
        }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0);
        fitText(this.breakText, GAME_WIDTH - this._margin * 2, 0, 0.72);
        this.elements.push(this.breakText);
    }

    _createWeaponSlots() {
        this.weaponIcons = [];
        this.weaponTexts = [];
        this.weaponSlotsGfx = this.scene.add.graphics().setDepth(100).setScrollFactor(0);
        this.elements.push(this.weaponSlotsGfx);

        const slotSize = uv(32);
        const gap = uv(4);
        const cols = this._isPortrait ? 3 : 6;
        const rows = Math.ceil(6 / cols);
        const totalW = cols * slotSize + (cols - 1) * gap;
        const totalH = rows * slotSize + (rows - 1) * gap;
        const startX = this._margin;
        const startY = GAME_HEIGHT - this._margin - totalH;
        this._weaponSlotsTop = startY;
        this._weaponSlotsBottom = startY + totalH;
        this._weaponSlotsRight = startX + totalW;

        for (let i = 0; i < 6; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (slotSize + gap);
            const y = startY + row * (slotSize + gap);

            drawSystemPanel(this.weaponSlotsGfx, x, y, slotSize, slotSize, {
                cut: uv(4),
                fill: SYSTEM.BG_PANEL, fillAlpha: 0.75,
                border: SYSTEM.BORDER_DIM, borderAlpha: 0.85, borderWidth: 1,
            });

            const icon = this.scene.add.sprite(x + slotSize / 2, y + slotSize / 2, 'particle')
                .setDepth(101).setScrollFactor(0).setVisible(false);

            const lvText = this._text(x + slotSize - 3, y + slotSize - 3, '', {
                fontSize: fs(9), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
                color: SYSTEM.TEXT_GOLD, stroke: '#000000', strokeThickness: 2,
            }).setOrigin(1, 1).setDepth(102).setScrollFactor(0);

            this.weaponIcons.push(icon);
            this.weaponTexts.push(lvText);
            this.elements.push(icon, lvText);
        }
    }

    _createShadowArmyDisplay() {
        const shadowY = Math.max(
            this._leftPanelBottom + uv(12),
            (this._weaponSlotsTop || GAME_HEIGHT - uv(60)) - uv(28)
        );
        this.shadowText = this._text(this._margin, shadowY, '', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN,
        }).setDepth(100).setScrollFactor(0);
        this.elements.push(this.shadowText);
    }

    _createMinimap() {
        const size = this._isPortrait ? uv(66) : (this._isCompact ? uv(78) : uv(90));
        const m = this._margin;
        this._mmSize = size;
        this._mmX = GAME_WIDTH - m - size;
        this._mmY = GAME_HEIGHT - m - size;
        this._mmScale = size / WORLD_SIZE;

        this._mmBg = this.scene.add.rectangle(
            this._mmX, this._mmY, size, size, SYSTEM.BG_DEEP, 0.7
        ).setOrigin(0, 0).setDepth(100).setScrollFactor(0);
        this.elements.push(this._mmBg);

        const frame = this.scene.add.graphics().setDepth(100).setScrollFactor(0);
        // Subtle internal grid
        frame.lineStyle(1, SYSTEM.BORDER_DIM, 0.22);
        for (let i = 1; i < 4; i++) {
            frame.lineBetween(this._mmX + (size / 4) * i, this._mmY, this._mmX + (size / 4) * i, this._mmY + size);
            frame.lineBetween(this._mmX, this._mmY + (size / 4) * i, this._mmX + size, this._mmY + (size / 4) * i);
        }
        // Corner brackets
        drawCornerBrackets(frame, this._mmX, this._mmY, size, size, {
            len: uv(8), color: SYSTEM.BORDER, lineWidth: 2, alpha: 0.9,
        });
        this.elements.push(frame);

        this._mmGfx = this.scene.add.graphics().setDepth(101).setScrollFactor(0);
        this.elements.push(this._mmGfx);
    }

    _updateMinimap(player, enemyManager, shadowArmyManager) {
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
            const enemies = enemyManager.getActiveEnemies();
            gfx.fillStyle(0xff4444, 0.8);
            for (const e of enemies) {
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
        const timerBottom = m + (this.timerText ? this.timerText.displayHeight : uv(20));
        this.homeBtn = this._text(GAME_WIDTH / 2, timerBottom + uv(6), '[ ◁  EXIT ]', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN_DIM,
        }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0)
          .setInteractive({ useHandCursor: true });
        fitText(this.homeBtn, Math.min(uv(150), GAME_WIDTH * 0.24), 0, 0.72);

        this.homeBtn.on('pointerover', () => this.homeBtn.setColor(SYSTEM.TEXT_BRIGHT));
        this.homeBtn.on('pointerout', () => this.homeBtn.setColor(SYSTEM.TEXT_CYAN_DIM));
        this.homeBtn.on('pointerdown', () => {
            this.scene.cameras.main.fadeOut(300, 0, 0, 0);
            this.scene.time.delayedCall(300, () => {
                this.scene.scene.start('MenuScene');
            });
        });
        this.elements.push(this.homeBtn);
    }

    update(player, weaponManager, enemyManager, shadowArmyManager) {
        if (!player) return;

        const hpRatio = player.stats.hp / player.stats.maxHp;
        this.hpFill.width = (this._hpW - 2) * hpRatio;
        this.hpText.setText(`${Math.floor(player.stats.hp)} / ${player.stats.maxHp}`);

        if (hpRatio < 0.3) {
            this.hpFill.setFillStyle(0xff0000);
        } else if (hpRatio < 0.6) {
            this.hpFill.setFillStyle(0xff6633);
        } else {
            this.hpFill.setFillStyle(COLORS.HP_RED);
        }

        const xpRatio = player.xpToNext > 0 ? player.xp / player.xpToNext : 0;
        this.xpFill.width = (this._xpW - 2) * xpRatio;

        if (enemyManager) {
            const totalSeconds = Math.floor(enemyManager.getGameTime() / 1000);
            const min = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const sec = (totalSeconds % 60).toString().padStart(2, '0');
            this.timerText.setText(`[ ${min}:${sec} ]`);
        }

        this.killText.setText('▸ KILL  ' + String(player.kills).padStart(4, '0'));
        this.levelText.setText('▸ LV    ' + String(player.level).padStart(2, '0'));

        const rank = RANKS[player.currentRank];
        this.rankText.setText('▸ RANK  ' + rank.name);
        this.rankText.setColor('#' + rank.color.toString(16).padStart(6, '0'));

        if (weaponManager) {
            const weapons = weaponManager.getOwnedWeapons();
            for (let i = 0; i < 6; i++) {
                if (i < weapons.length) {
                    const w = weapons[i];
                    this.weaponIcons[i].setTexture('icon_' + w.key).setVisible(true);
                    this.weaponTexts[i].setText(String(w.level));
                } else {
                    this.weaponIcons[i].setVisible(false);
                    this.weaponTexts[i].setText('');
                }
            }
        }

        if (shadowArmyManager) {
            const count = shadowArmyManager.getSoldierCount();
            this.shadowText.setText(
                count > 0
                    ? `▸ SHADOW  ${String(count).padStart(2, '0')} / ${String(shadowArmyManager.maxSoldiers).padStart(2, '0')}`
                    : ''
            );
            fitText(this.shadowText, Math.min(uv(230), GAME_WIDTH * 0.38), 0, 0.7);
        }

        if (enemyManager && this.questText) {
            const quests = enemyManager.getActiveQuests();
            this.questText.setText(quests.length > 0 ? quests.slice(0, 3).map(q => `▷ ${q.description}`).join('\n') : '');
        }

        this._mmFrameCounter = ((this._mmFrameCounter || 0) + 1) % 3;
        if (this._mmFrameCounter === 0) {
            this._updateMinimap(player, enemyManager, shadowArmyManager);
        }

        if (enemyManager && this.breakText) {
            if (enemyManager.isDungeonBreakActive()) {
                this.breakText.setText('⟨  DUNGEON BREAK · 진행 중  ⟩');
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

    destroy() {
        const tweens = this.scene?.tweens;
        for (const el of this.elements) {
            if (tweens) tweens.killTweensOf(el);
            if (el && el.active) el.destroy();
        }
        this.elements = [];
    }
}
