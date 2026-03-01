import { GAME_WIDTH, GAME_HEIGHT, COLORS, RANKS, fs, uv } from '../utils/Constants.js';

export class HUD {
    constructor(scene) {
        this.scene = scene;
        this.elements = [];
        this._margin = uv(12);

        // Build left panel (HP, XP) with sequential positioning
        this._createLeftPanel();
        // Build right panel (Kills, Level, Rank, Quest) with sequential positioning
        this._createRightPanel();
        // Center elements
        this._createTimer();
        this._createDungeonBreakDisplay();
        // Bottom elements
        this._createWeaponSlots();
        this._createShadowArmyDisplay();
    }

    _createLeftPanel() {
        const m = this._margin;
        let y = m;

        // HP label
        const hpLabel = this.scene.add.text(m, y, 'HP', {
            fontSize: fs(10), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#ff6666',
        }).setDepth(100).setScrollFactor(0);
        this.elements.push(hpLabel);
        y += hpLabel.height + 2;

        // HP bar
        const barW = Math.min(uv(180), GAME_WIDTH * 0.4);
        const hpH = uv(14);
        this._hpW = barW;
        this._hpH = hpH;

        this.hpBg = this.scene.add.rectangle(m, y, barW, hpH, COLORS.HP_BG)
            .setOrigin(0, 0).setDepth(100).setScrollFactor(0);
        this.hpFill = this.scene.add.rectangle(m + 1, y + 1, barW - 2, hpH - 2, COLORS.HP_RED)
            .setOrigin(0, 0).setDepth(101).setScrollFactor(0);
        this.hpText = this.scene.add.text(m + barW / 2, y + hpH / 2, '', {
            fontSize: fs(9), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#ffffff', stroke: '#000000', strokeThickness: 1,
        }).setOrigin(0.5).setDepth(102).setScrollFactor(0);
        this.elements.push(this.hpBg, this.hpFill, this.hpText);
        y += hpH + 4;

        // XP label
        const xpLabel = this.scene.add.text(m, y, 'XP', {
            fontSize: fs(9), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#9b59b6',
        }).setDepth(100).setScrollFactor(0);
        this.elements.push(xpLabel);
        y += xpLabel.height + 2;

        // XP bar
        const xpH = uv(8);
        this._xpW = barW;
        this._xpH = xpH;

        this.xpBg = this.scene.add.rectangle(m, y, barW, xpH, COLORS.XP_BG)
            .setOrigin(0, 0).setDepth(100).setScrollFactor(0);
        this.xpFill = this.scene.add.rectangle(m + 1, y + 1, 0, xpH - 2, COLORS.XP_PURPLE)
            .setOrigin(0, 0).setDepth(101).setScrollFactor(0);
        this.elements.push(this.xpBg, this.xpFill);
    }

    _createRightPanel() {
        const m = this._margin;
        let y = m;

        // Kill counter
        this.killText = this.scene.add.text(GAME_WIDTH - m, y, 'KILLS: 0', {
            fontSize: fs(14), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#ff6644', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0).setDepth(100).setScrollFactor(0);
        this.elements.push(this.killText);
        y += this.killText.height + 3;

        // Level
        this.levelText = this.scene.add.text(GAME_WIDTH - m, y, 'Lv.1', {
            fontSize: fs(12), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(1, 0).setDepth(100).setScrollFactor(0);
        this.elements.push(this.levelText);
        y += this.levelText.height + 2;

        // Rank
        this.rankText = this.scene.add.text(GAME_WIDTH - m, y, 'E-Rank', {
            fontSize: fs(11), fontFamily: 'Arial',
            color: '#888888',
        }).setOrigin(1, 0).setDepth(100).setScrollFactor(0);
        this.elements.push(this.rankText);
        y += this.rankText.height + 8;

        // Quest display
        this.questText = this.scene.add.text(GAME_WIDTH - m, y, '', {
            fontSize: fs(10), fontFamily: 'Arial',
            color: '#66ccff',
            align: 'right',
        }).setOrigin(1, 0).setDepth(100).setScrollFactor(0);
        this.elements.push(this.questText);
    }

    _createTimer() {
        this.timerText = this.scene.add.text(GAME_WIDTH / 2, this._margin, '00:00', {
            fontSize: fs(20), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#ffffff', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0);
        this.elements.push(this.timerText);
    }

    _createDungeonBreakDisplay() {
        const y = this._margin + (this.timerText ? this.timerText.height + 5 : uv(25));
        this.breakText = this.scene.add.text(GAME_WIDTH / 2, y, '', {
            fontSize: fs(11), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#ff4444', stroke: '#000000', strokeThickness: 1,
        }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0);
        this.elements.push(this.breakText);
    }

    _createWeaponSlots() {
        this.weaponIcons = [];
        this.weaponTexts = [];
        const slotSize = uv(32);
        const gap = uv(4);

        for (let i = 0; i < 6; i++) {
            const x = this._margin + i * (slotSize + gap);
            const y = GAME_HEIGHT - this._margin - slotSize;

            const bg = this.scene.add.rectangle(x, y, slotSize, slotSize, 0x1a1a2e, 0.7)
                .setOrigin(0, 0).setDepth(100).setScrollFactor(0)
                .setStrokeStyle(1, 0x4a1a8a);

            const icon = this.scene.add.sprite(x + slotSize / 2, y + slotSize / 2, 'particle')
                .setDepth(101).setScrollFactor(0)
                .setVisible(false);

            const lvText = this.scene.add.text(x + slotSize - 2, y + slotSize - 2, '', {
                fontSize: fs(9), fontFamily: 'Arial', fontStyle: 'bold',
                color: '#ffd700', stroke: '#000000', strokeThickness: 1,
            }).setOrigin(1, 1).setDepth(102).setScrollFactor(0);

            this.weaponIcons.push(icon);
            this.weaponTexts.push(lvText);
            this.elements.push(bg, icon, lvText);
        }
    }

    _createShadowArmyDisplay() {
        const slotSize = uv(32);
        this.shadowText = this.scene.add.text(this._margin, GAME_HEIGHT - this._margin - slotSize - uv(25), '', {
            fontSize: fs(11), fontFamily: 'Arial',
            color: COLORS.TEXT_PURPLE,
        }).setDepth(100).setScrollFactor(0);
        this.elements.push(this.shadowText);
    }

    update(player, weaponManager, enemyManager, shadowArmyManager) {
        if (!player) return;

        // HP
        const hpRatio = player.stats.hp / player.stats.maxHp;
        this.hpFill.setDisplaySize((this._hpW - 2) * hpRatio, this._hpH - 2);
        this.hpText.setText(`${Math.floor(player.stats.hp)} / ${player.stats.maxHp}`);

        if (hpRatio < 0.3) {
            this.hpFill.setFillStyle(0xff0000);
        } else if (hpRatio < 0.6) {
            this.hpFill.setFillStyle(0xff6633);
        } else {
            this.hpFill.setFillStyle(COLORS.HP_RED);
        }

        // XP
        const xpRatio = player.xpToNext > 0 ? player.xp / player.xpToNext : 0;
        this.xpFill.setDisplaySize((this._xpW - 2) * xpRatio, this._xpH - 2);

        // Timer
        if (enemyManager) {
            const totalSeconds = Math.floor(enemyManager.getGameTime() / 1000);
            const min = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const sec = (totalSeconds % 60).toString().padStart(2, '0');
            this.timerText.setText(`${min}:${sec}`);
        }

        // Kills
        this.killText.setText('KILLS: ' + player.kills);

        // Level & Rank
        this.levelText.setText('Lv.' + player.level);
        const rank = RANKS[player.currentRank];
        this.rankText.setText(rank.label);
        this.rankText.setColor('#' + rank.color.toString(16).padStart(6, '0'));

        // Weapon slots
        if (weaponManager) {
            const weapons = weaponManager.getOwnedWeapons();
            for (let i = 0; i < 6; i++) {
                if (i < weapons.length) {
                    const w = weapons[i];
                    this.weaponIcons[i].setTexture('icon_' + w.key).setVisible(true);
                    this.weaponTexts[i].setText('Lv.' + w.level);
                } else {
                    this.weaponIcons[i].setVisible(false);
                    this.weaponTexts[i].setText('');
                }
            }
        }

        // Shadow army
        if (shadowArmyManager) {
            const count = shadowArmyManager.getSoldierCount();
            this.shadowText.setText(count > 0 ? `그림자 군단: ${count}/${shadowArmyManager.maxSoldiers}` : '');
        }

        // Active quests
        if (enemyManager && this.questText) {
            const quests = enemyManager.getActiveQuests();
            this.questText.setText(quests.length > 0 ? quests.map(q => `[퀘스트] ${q.description}`).join('\n') : '');
        }

        // Dungeon break indicator
        if (enemyManager && this.breakText) {
            if (enemyManager.isDungeonBreakActive()) {
                this.breakText.setText('⚠ 던전 브레이크 진행 중 ⚠');
                this.breakText.setAlpha(0.6 + Math.sin(Date.now() * 0.005) * 0.4);
            } else {
                this.breakText.setText('');
            }
        }
    }

    destroy() {
        for (const el of this.elements) {
            el.destroy();
        }
    }
}
