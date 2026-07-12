import {
    GAME_WIDTH, GAME_HEIGHT, RANKS,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    UI_SCALE, fs, uv, fitText, padText,
} from '../utils/Constants.js';
import { t } from '../utils/i18n.js';
import { UIAssets } from './UIAssets.js';

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
        const text = padText(this.scene.add.text(x, y, value, style), 4, 5, 2, 2);
        if (typeof text.setLineSpacing === 'function') text.setLineSpacing(3);
        return text;
    }

    _detectTouch() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window)
            || (navigator.maxTouchPoints > 0);
    }

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }

    open() {
        if (this.isOpen) return;
        const player = this.scene.player;
        if (!player) return;
        this.isOpen = true;

        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const touch = this._detectTouch();
        const safeX = Math.max(12, Math.min(uv(20), GAME_WIDTH * 0.04));
        const safeY = Math.max(10, Math.min(uv(18), GAME_HEIGHT * 0.035));
        const w = Math.max(1, Math.min(uv(380), GAME_WIDTH - safeX * 2));
        const h = Math.max(1, Math.min(uv(540), GAME_HEIGHT - safeY * 2));
        const px = cx - w / 2;
        const py = cy - h / 2;

        const dim = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.68)
            .setDepth(300).setScrollFactor(0).setInteractive();
        dim.on('pointerup', pointer => {
            const outsidePanel = pointer.x < px || pointer.x > px + w
                || pointer.y < py || pointer.y > py + h;
            if (outsidePanel) this.close();
        });
        this.elements.push(dim);

        // Main angular panel
        const panelG = UIAssets.createPanel(this.scene, px, py, w, h, {
            asset: 'ui_panel_cyan',
            cut: uv(14),
            fill: SYSTEM.BG_PANEL, fillAlpha: 0.95,
            border: SYSTEM.BORDER, borderAlpha: 0.9, borderWidth: 1,
            accent: SYSTEM.BORDER,
            glow: 6,
            variant: 'panel',
            depth: 301,
            scrollFactor: 0,
        });
        this.elements.push(panelG);

        // Header tag and explicit close action. The close hit area remains at least 44px.
        const tag = this._text(px + uv(18), py + uv(10), '  STATUS  ', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
            backgroundColor: '#05070d', padding: { left: 6, right: 6, top: 1, bottom: 1 },
        }).setDepth(303).setScrollFactor(0);
        this.elements.push(tag);

        const viewportW = Math.max(1, window.innerWidth || GAME_WIDTH);
        const viewportH = Math.max(1, window.innerHeight || GAME_HEIGHT);
        const cssPerUnit = Math.max(0.01, Math.min(viewportW / GAME_WIDTH, viewportH / GAME_HEIGHT));
        const minTouchUnits = Math.ceil(44 / cssPerUnit);
        const closeH = Math.max(minTouchUnits, Math.round(44 * (1 + (UI_SCALE - 1) * 0.7)));
        const closeW = Math.max(minTouchUnits, Math.min(uv(78), w * 0.3));
        const closeX = px + w - closeW - uv(8);
        const closeY = py + uv(8);
        const closePanel = UIAssets.createPanel(this.scene, closeX, closeY, closeW, closeH, {
            cut: uv(7),
            fill: 0x101a27, fillAlpha: 0.94,
            border: SYSTEM.BORDER, borderAlpha: 0.74, borderWidth: 1,
            accent: SYSTEM.BORDER,
            variant: 'button',
            ornament: false,
            depth: 303,
            scrollFactor: 0,
            hover: {
                fill: SYSTEM.BG_PANEL_HI,
                fillAlpha: 1,
                border: 0xffffff,
                borderAlpha: 0.95,
                borderWidth: 2,
                glow: 5,
            },
        });
        const closeText = this._text(closeX + closeW / 2, closeY + closeH / 2, `×  ${t('close')}`, {
            fontSize: fs(11), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
        }).setOrigin(0.5).setDepth(305).setScrollFactor(0);
        fitText(closeText, closeW - uv(10), closeH - uv(8), 0.66);
        const closeHit = UIAssets.createHitArea(this.scene, closeX, closeY, closeW, closeH, 306)
            .setScrollFactor(0);
        closeHit.on('pointerover', () => closePanel.setUIState('hover').setAlpha(1));
        closeHit.on('pointerout', () => closePanel.setUIState('normal').setAlpha(1));
        closeHit.on('pointerdown', () => closePanel.setAlpha(0.76));
        closeHit.on('pointerup', () => this.close());
        this.elements.push(closePanel, closeText, closeHit);

        // Title
        const title = this._text(cx, py + uv(43), t('statusTitle'), {
            fontSize: fs(20), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
            stroke: '#02040a',
            strokeThickness: 2,
            letterSpacing: 0,
        }).setOrigin(0.5).setDepth(303).setScrollFactor(0);
        fitText(title, Math.max(uv(96), w - closeW * 2 - uv(24)), uv(38), 0.64);
        this.elements.push(title);

        // Title underline
        const headerLineY = Math.max(
            py + Math.min(uv(68), h * 0.2),
            closeY + closeH + uv(5)
        );
        const ul = this.scene.add.graphics().setDepth(302).setScrollFactor(0);
        ul.lineStyle(1, SYSTEM.BORDER, 0.55);
        ul.lineBetween(px + uv(22), headerLineY, px + w - uv(22), headerLineY);
        this.elements.push(ul);

        const rank = RANKS[player.currentRank];
        const rankColor = '#' + rank.color.toString(16).padStart(6, '0');
        const stats = [
            { label: t('statHP'), value: `${Math.floor(player.stats.hp)} / ${player.stats.maxHp}`, color: '#ff6666' },
            { label: t('statAttack'), value: String(player.stats.attack), color: '#ff9966' },
            { label: t('statSpeed'), value: String(player.stats.speed), color: '#66ff99' },
            { label: t('statCrit'), value: (player.stats.critRate * 100).toFixed(1) + '%', color: '#ffe066' },
            { label: t('statCritDmg'), value: (player.stats.critDamage * 100).toFixed(0) + '%', color: '#ffb066' },
            { label: t('statXP'), value: 'x' + player.stats.xpMultiplier.toFixed(2), color: '#b080ff' },
            { label: t('statCDR'), value: (player.stats.cooldownReduction * 100).toFixed(1) + '%', color: SYSTEM.TEXT_CYAN },
        ];
        const soldiers = this.scene.shadowArmyManager?.getSoldiers() || [];
        const contentBottom = py + h - uv(touch ? 48 : 44);
        let yOff = headerLineY + uv(10);
        const contentH = Math.max(1, contentBottom - yOff);
        const tight = contentH < uv(270);
        const compact = tight || GAME_HEIGHT <= 820 || contentH < uv(350) || w < uv(330);
        const labelSize = tight ? 10 : (compact ? 11 : 12);
        const textStep = Math.ceil(labelSize * UI_SCALE + 8);
        const soldierTextStep = Math.ceil((tight ? 9 : 11) * UI_SCALE + 8);
        const profileStep = Math.max(textStep, uv(tight ? 18 : (compact ? 21 : 24)));
        const statStep = Math.max(textStep, uv(tight ? 17 : (compact ? 19 : 21)));
        const sectionStep = Math.max(textStep, uv(tight ? 17 : (compact ? 19 : 22)));
        const soldierStep = Math.max(soldierTextStep, uv(tight ? 15 : (compact ? 17 : 18)));
        const leftX = px + uv(compact ? 22 : 26);
        const rowLeftX = px + uv(compact ? 25 : 30);
        const rightX = px + w - uv(compact ? 22 : 26);

        // Profile block
        this._addRow(leftX, rightX, yOff, t('statName'), t('playerName'), SYSTEM.TEXT_BRIGHT, labelSize);
        yOff += profileStep;
        this._addRow(leftX, rightX, yOff, t('statRank'), rank.name + ' - RANK', rankColor, labelSize);
        yOff += profileStep;
        this._addRow(leftX, rightX, yOff, t('statLevel'), String(player.level).padStart(2, '0'), SYSTEM.TEXT_BRIGHT, labelSize);
        yOff += profileStep;

        const div1 = this.scene.add.graphics().setDepth(302).setScrollFactor(0);
        div1.lineStyle(1, SYSTEM.BORDER_DIM, 0.45);
        div1.lineBetween(rowLeftX, yOff, px + w - uv(compact ? 25 : 30), yOff);
        this.elements.push(div1);
        yOff += uv(tight ? 6 : (compact ? 8 : 10));

        // Stats section header
        const statsHeader = this._text(leftX, yOff, '▸  ' + t('statSection'), {
            fontSize: fs(labelSize), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN, letterSpacing: 0,
        }).setDepth(303).setScrollFactor(0);
        this.elements.push(statsHeader);
        yOff += sectionStep;

        stats.forEach(stat => {
            this._addRow(rowLeftX, rightX, yOff, stat.label, stat.value, stat.color, labelSize);
            yOff += statStep;
        });

        const div2 = this.scene.add.graphics().setDepth(302).setScrollFactor(0);
        div2.lineStyle(1, SYSTEM.BORDER_DIM, 0.45);
        div2.lineBetween(rowLeftX, yOff, px + w - uv(compact ? 25 : 30), yOff);
        this.elements.push(div2);
        yOff += uv(tight ? 8 : (compact ? 10 : 12));

        // Shadow army section
        const shadowHeader = this._text(leftX, yOff, '▸  ' + t('statShadow'), {
            fontSize: fs(labelSize), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN, letterSpacing: 0,
        }).setDepth(303).setScrollFactor(0);
        this.elements.push(shadowHeader);

        const shadowCount = this.scene.shadowArmyManager?.getSoldierCount() || 0;
        const shadowCountText = this._text(rightX, yOff,
            String(shadowCount).padStart(2, '0') + (t('statUnit') || ''), {
            fontSize: fs(labelSize + 1), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN,
        }).setOrigin(1, 0).setDepth(303).setScrollFactor(0);
        this.elements.push(shadowCountText);
        yOff += sectionStep;

        const rowSlots = Math.max(0, Math.floor((contentBottom - yOff) / Math.max(1, soldierStep)));
        const visibleCount = soldiers.length > rowSlots ? Math.max(0, rowSlots - 1) : soldiers.length;
        soldiers.slice(0, visibleCount).forEach(s => {
            this._addRow(px + uv(compact ? 30 : 40), rightX, yOff,
                '└ ' + s.bossName, s.soldierType, SYSTEM.TEXT_CYAN_DIM, tight ? 9 : 11);
            yOff += soldierStep;
        });
        if (soldiers.length > visibleCount && rowSlots > 0) {
            this._addRow(px + uv(compact ? 30 : 40), rightX, yOff,
                '└ …', `+${soldiers.length - visibleCount}`, SYSTEM.TEXT_CYAN, tight ? 9 : 11);
        }

        // Close hint
        const hintText = touch ? `☝  ${t('close')}` : t('tabClose');
        const hint = this._text(cx, py + h - uv(touch ? 25 : 23), hintText, {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
        }).setOrigin(0.5).setDepth(303).setScrollFactor(0);
        fitText(hint, w - uv(40), 0, 0.72);
        this.elements.push(hint);

        // Fade in
        this.elements.forEach(el => {
            el.setAlpha(0);
            this.scene.tweens.add({
                targets: el, alpha: el === dim ? 0.68 : 1, duration: 180,
                ease: 'Cubic.Out',
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
        const rowW = Math.max(1, valueX - labelX);
        fitText(labelText, Math.max(1, rowW * 0.56), 0, 0.66);
        fitText(valueText, Math.max(uv(72), rowW * 0.46), 0, 0.66);

        this.elements.push(labelText, valueText);
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;

        const closingElements = this.elements;
        this.elements = [];
        closingElements.forEach(el => {
            this.scene.tweens.killTweensOf(el);
            this.scene.tweens.add({
                targets: el, alpha: 0, duration: 130,
                ease: 'Cubic.In',
                onComplete: () => el.destroy(),
            });
        });

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
