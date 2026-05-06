import {
    GAME_WIDTH, GAME_HEIGHT, RANKS,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, drawSystemPanel, fitText, padText,
} from '../utils/Constants.js';
import { t } from '../utils/i18n.js';

/**
 * TAB-key status window, System aesthetic.
 */
export class StatusWindow {
    constructor(scene) {
        this.scene = scene;
        this.isOpen = false;
        this.elements = [];

        this.tabKey = scene.input.keyboard.addKey('TAB');
        this._onTabDown = () => this.toggle();
        this.tabKey.on('down', this._onTabDown);
    }

    _text(x, y, value, style) {
        return padText(this.scene.add.text(x, y, value, style), 2, 2);
    }

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;

        const player = this.scene.player;
        if (!player) return;

        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const w = uv(340);
        const h = uv(500);
        const px = cx - w / 2;
        const py = cy - h / 2;

        const dim = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
            .setDepth(300).setScrollFactor(0).setInteractive();
        this.elements.push(dim);

        // Main angular panel
        const panelG = this.scene.add.graphics().setDepth(301).setScrollFactor(0);
        drawSystemPanel(panelG, px, py, w, h, {
            cut: uv(14),
            fill: SYSTEM.BG_PANEL, fillAlpha: 0.95,
            border: SYSTEM.BORDER, borderAlpha: 0.9, borderWidth: 1,
        });
        this.elements.push(panelG);

        // Header tag
        const tag = this._text(px + uv(20), py + uv(8), '  STATUS  ', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
            backgroundColor: '#05070d', padding: { left: 6, right: 6, top: 1, bottom: 1 },
        }).setDepth(303).setScrollFactor(0);
        this.elements.push(tag);

        // Title
        const title = this._text(cx, py + uv(30), t('statusTitle'), {
            fontSize: fs(20), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT, letterSpacing: 2,
        }).setOrigin(0.5).setDepth(303).setScrollFactor(0);
        fitText(title, w - uv(60), uv(44), 0.68);
        this.elements.push(title);

        // Title underline
        const ul = this.scene.add.graphics().setDepth(302).setScrollFactor(0);
        ul.lineStyle(1, SYSTEM.BORDER, 0.55);
        ul.lineBetween(px + uv(30), py + uv(50), px + w - uv(30), py + uv(50));
        this.elements.push(ul);

        const rank = RANKS[player.currentRank];
        const rankColor = '#' + rank.color.toString(16).padStart(6, '0');
        let yOff = py + uv(65);

        // Profile block
        this._addRow(px + uv(26), px + w - uv(26), yOff, t('statName'), t('playerName'), SYSTEM.TEXT_BRIGHT);
        yOff += uv(26);
        this._addRow(px + uv(26), px + w - uv(26), yOff, t('statRank'), rank.name + ' - RANK', rankColor);
        yOff += uv(26);
        this._addRow(px + uv(26), px + w - uv(26), yOff, t('statLevel'), String(player.level).padStart(2, '0'), SYSTEM.TEXT_BRIGHT);
        yOff += uv(22);

        const div1 = this.scene.add.graphics().setDepth(302).setScrollFactor(0);
        div1.lineStyle(1, SYSTEM.BORDER_DIM, 0.45);
        div1.lineBetween(px + uv(30), yOff, px + w - uv(30), yOff);
        this.elements.push(div1);
        yOff += uv(14);

        // Stats section header
        const statsHeader = this._text(px + uv(26), yOff, '▸  ' + t('statSection'), {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN, letterSpacing: 1,
        }).setDepth(303).setScrollFactor(0);
        this.elements.push(statsHeader);
        yOff += uv(24);

        const stats = [
            { label: t('statHP'), value: `${Math.floor(player.stats.hp)} / ${player.stats.maxHp}`, color: '#ff6666' },
            { label: t('statAttack'), value: String(player.stats.attack), color: '#ff9966' },
            { label: t('statSpeed'), value: String(player.stats.speed), color: '#66ff99' },
            { label: t('statCrit'), value: (player.stats.critRate * 100).toFixed(1) + '%', color: '#ffe066' },
            { label: t('statCritDmg'), value: (player.stats.critDamage * 100).toFixed(0) + '%', color: '#ffb066' },
            { label: t('statXP'), value: 'x' + player.stats.xpMultiplier.toFixed(2), color: '#b080ff' },
            { label: t('statCDR'), value: (player.stats.cooldownReduction * 100).toFixed(1) + '%', color: SYSTEM.TEXT_CYAN },
        ];

        stats.forEach(stat => {
            this._addRow(px + uv(30), px + w - uv(30), yOff, stat.label, stat.value, stat.color);
            yOff += uv(22);
        });

        yOff += uv(4);
        const div2 = this.scene.add.graphics().setDepth(302).setScrollFactor(0);
        div2.lineStyle(1, SYSTEM.BORDER_DIM, 0.45);
        div2.lineBetween(px + uv(30), yOff, px + w - uv(30), yOff);
        this.elements.push(div2);
        yOff += uv(14);

        // Shadow army section
        const shadowHeader = this._text(px + uv(26), yOff, '▸  ' + t('statShadow'), {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN, letterSpacing: 1,
        }).setDepth(303).setScrollFactor(0);
        this.elements.push(shadowHeader);

        const shadowCount = this.scene.shadowArmyManager?.getSoldierCount() || 0;
        const shadowCountText = this._text(px + w - uv(30), yOff,
            String(shadowCount).padStart(2, '0') + (t('statUnit') || ''), {
            fontSize: fs(13), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN,
        }).setOrigin(1, 0).setDepth(303).setScrollFactor(0);
        this.elements.push(shadowCountText);
        yOff += uv(22);

        const soldiers = this.scene.shadowArmyManager?.getSoldiers() || [];
        soldiers.forEach(s => {
            this._addRow(px + uv(40), px + w - uv(30), yOff, '└ ' + s.bossName, s.soldierType, SYSTEM.TEXT_CYAN_DIM, 11);
            yOff += uv(18);
        });

        // Close hint
        const hint = this._text(cx, py + h - uv(24), '[ TAB ]  ' + t('tabClose'), {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
        }).setOrigin(0.5).setDepth(303).setScrollFactor(0);
        fitText(hint, w - uv(40), 0, 0.72);
        this.elements.push(hint);

        // Fade in
        this.elements.forEach(el => {
            el.setAlpha(0);
            this.scene.tweens.add({
                targets: el, alpha: el === dim ? 0.6 : 1, duration: 180,
            });
        });

        if (this.scene.scene.isActive('GameScene')) {
            this.scene.physics.pause();
        }
    }

    _addRow(labelX, valueX, y, label, value, valueColor, labelSize = 12) {
        const labelText = this._text(labelX, y, label, {
            fontSize: fs(labelSize), fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN_DIM,
        }).setOrigin(0, 0).setDepth(303).setScrollFactor(0);

        const valueText = this._text(valueX, y, value, {
            fontSize: fs(labelSize + 1), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: valueColor,
        }).setOrigin(1, 0).setDepth(303).setScrollFactor(0);
        fitText(labelText, Math.max(1, valueX - labelX - uv(64)), 0, 0.7);
        fitText(valueText, uv(128), 0, 0.7);

        this.elements.push(labelText, valueText);
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;

        this.elements.forEach(el => {
            this.scene.tweens.add({
                targets: el, alpha: 0, duration: 130,
                onComplete: () => el.destroy(),
            });
        });
        this.elements = [];

        if (this.scene.scene.isActive('GameScene')) {
            this.scene.physics.resume();
        }
    }

    destroy() {
        if (this.scene?.tweens) {
            this.elements.forEach(el => this.scene.tweens.killTweensOf(el));
        }
        this.elements.forEach(el => {
            try { if (el?.scene && el.destroy) el.destroy(); } catch (e) { /* already destroyed */ }
        });
        this.elements = [];
        this.isOpen = false;
        if (this.scene?.scene?.isActive('GameScene')) {
            this.scene.physics.resume();
        }

        if (this.tabKey && this._onTabDown) {
            this.tabKey.off('down', this._onTabDown);
            this.tabKey = null;
            this._onTabDown = null;
        }
        this.scene = null;
    }
}
