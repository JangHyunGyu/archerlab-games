import {
    GAME_WIDTH, GAME_HEIGHT, RANKS,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    UI_SCALE, fs, uv, fitText, padText,
} from '../utils/Constants.js';
import { t } from '../utils/i18n.js';
import { UIAssets } from './UIAssets.js?v=20261127-gothic-ui-v1';

function cssPerGameUnit(scene) { var __oc0, __oc1;
    const scale = (((__oc1 = (__oc0 = scene === null || scene === void 0 ? void 0 : scene.game) === null || __oc0 === void 0 ? void 0 : __oc0.scale) === null || __oc1 === void 0 ? void 0 : __oc1.displayScale));
    const sx = Number(((scale === null || scale === void 0 ? void 0 : scale.x)));
    const sy = Number(((scale === null || scale === void 0 ? void 0 : scale.y)));
    if (sx > 0.01 && sy > 0.01) return 1 / Math.max(sx, sy);
    const viewport = window.visualViewport;
    const w = Math.max(1, ((viewport === null || viewport === void 0 ? void 0 : viewport.width)) || window.innerWidth || GAME_WIDTH);
    const h = Math.max(1, ((viewport === null || viewport === void 0 ? void 0 : viewport.height)) || window.innerHeight || GAME_HEIGHT);
    return Math.max(0.01, Math.min(w / GAME_WIDTH, h / GAME_HEIGHT));
}

// Physics pause does not stop update() attacks or scene.time callbacks.
// The panel stays on this scene, so the scene itself must keep running.
function freezeCombat(scene, frozen) { var __oc2;
    if (!(((__oc2 = scene === null || scene === void 0 ? void 0 : scene.scene) === null || __oc2 === void 0 ? void 0 : __oc2.isActive('GameScene')))) return;
    if (frozen) {
        scene.physics.pause();
        scene.time.paused = true;
    } else {
        scene.physics.resume();
        scene.time.paused = false;
    }
}

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

        this.escKey = scene.input.keyboard.addKey('ESC');
        this._onEscDown = () => {
            if (this.isOpen) this.close();
        };
        this.escKey.on('down', this._onEscDown);
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

    open() { var __oc3, __oc4;
        if (this.isOpen) return;
        const player = this.scene.player;
        if (!player) return;
        this.isOpen = true;

        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const touch = this._detectTouch();
        const safeX = Math.max(12, Math.min(uv(20), GAME_WIDTH * 0.04));
        const safeY = Math.max(10, Math.min(uv(16), GAME_HEIGHT * 0.03));
        const w = Math.max(1, Math.min(uv(424), GAME_WIDTH - safeX * 2));
        const h = Math.max(1, Math.min(uv(596), GAME_HEIGHT - safeY * 2));
        const px = cx - w / 2;
        const py = cy - h / 2;

        const dim = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72)
            .setDepth(300).setScrollFactor(0).setInteractive();
        dim.on('pointerup', pointer => {
            const outsidePanel = pointer.x < px || pointer.x > px + w
                || pointer.y < py || pointer.y > py + h;
            if (outsidePanel) this.close();
        });
        this.elements.push(dim);

        // Main gothic modal panel
        const panelG = UIAssets.createPanel(this.scene, px, py, w, h, {
            variant: 'modal',
            depth: 301,
            scrollFactor: 0,
        });
        this.elements.push(panelG);

        // Header tag and explicit close action. The close hit area remains at least 44px.
        const tag = this._text(px + uv(28), py + uv(20), 'STATUS', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold', color: '#e8c266',
        }).setDepth(303).setScrollFactor(0);
        this.elements.push(tag);

        const minTouchUnits = Math.ceil(44 / cssPerGameUnit(this.scene));
        const closeH = Math.max(minTouchUnits, Math.round(44 * (1 + (UI_SCALE - 1) * 0.7)));
        const closeW = Math.max(minTouchUnits, Math.min(uv(92), w * 0.3));
        const closeX = px + w - closeW - uv(20);
        const closeY = py + uv(16);
        const closePanel = UIAssets.createPanel(this.scene, closeX, closeY, closeW, closeH, {
            variant: 'button',
            tone: 'secondary',
            depth: 303,
            scrollFactor: 0,
        });
        const closeText = this._text(closeX + closeW / 2, closeY + closeH / 2, `×  ${t('close')}`, {
            fontSize: fs(11), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: '#ebe4f8', stroke: '#05040d', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(305).setScrollFactor(0);
        fitText(closeText, closeW - uv(18), closeH - uv(8), 0.66);
        const closeHit = UIAssets.createHitArea(this.scene, closeX, closeY, closeW, closeH, 306)
            .setScrollFactor(0);
        closeHit.on('pointerover', () => { closePanel.setUIState('hover').setAlpha(1); closeText.setColor('#ffffff'); });
        closeHit.on('pointerout', () => { closePanel.setUIState('normal').setAlpha(1); closeText.setColor('#ebe4f8'); });
        closeHit.on('pointerdown', () => closePanel.setUIState('pressed'));
        closeHit.on('pointerup', () => this.close());
        this.elements.push(closePanel, closeText, closeHit);

        // Title
        const title = this._text(cx, py + uv(48), t('statusTitle'), {
            fontSize: fs(20), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: '#f5efff',
            stroke: '#05030d',
            strokeThickness: 3,
            letterSpacing: 0,
        }).setOrigin(0.5).setDepth(303).setScrollFactor(0);
        fitText(title, Math.max(uv(96), w - closeW * 2 - uv(34)), uv(38), 0.64);
        this.elements.push(title);

        // Title underline
        const headerLineY = Math.max(
            py + Math.min(uv(74), h * 0.2),
            closeY + closeH + uv(6)
        );
        const ul = this.scene.add.graphics().setDepth(302).setScrollFactor(0);
        ul.lineStyle(1, 0xe8c266, 0.52);
        ul.lineBetween(px + uv(30), headerLineY, px + w - uv(30), headerLineY);
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
        const soldiers = (((__oc3 = this.scene.shadowArmyManager) === null || __oc3 === void 0 ? void 0 : __oc3.getSoldiers())) || [];
        const hintY = py + h - uv(20);
        const footerH = Math.max(minTouchUnits, uv(38));
        const footerY = touch ? (py + h - uv(34) - footerH) : (hintY - uv(12) - footerH);
        const contentBottom = footerY - uv(10);
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
        const leftX = px + uv(compact ? 30 : 34);
        const rowLeftX = px + uv(compact ? 32 : 36);
        const rightX = px + w - uv(compact ? 30 : 34);

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

        const shadowCount = (((__oc4 = this.scene.shadowArmyManager) === null || __oc4 === void 0 ? void 0 : __oc4.getSoldierCount())) || 0;
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

        // Footer controls: Sound toggle & Exit to menu (keeps main HUD clean)
        const footerPadX = uv(28);
        const footerGap = uv(12);
        const footerBtnW = Math.max(minTouchUnits, Math.floor((w - footerPadX * 2 - footerGap) / 2));
        const soundBtnX = px + footerPadX;
        const exitBtnX = soundBtnX + footerBtnW + footerGap;

        const isSoundEnabled = !(this.scene.soundManager && this.scene.soundManager.enabled === false);
        const soundPanel = UIAssets.createPanel(this.scene, soundBtnX, footerY, footerBtnW, footerH, {
            variant: 'button',
            tone: 'secondary',
            depth: 303,
            scrollFactor: 0,
        });
        const soundLabel = () => (
            this.scene && this.scene.soundManager && this.scene.soundManager.enabled === false
                ? t('sysSoundOff')
                : t('sysSoundOn')
        );
        const soundText = this._text(soundBtnX + footerBtnW / 2, footerY + footerH / 2, soundLabel(), {
            fontSize: fs(11), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: isSoundEnabled ? '#ebe4f8' : SYSTEM.TEXT_MUTED,
            stroke: '#05040d', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(305).setScrollFactor(0);
        fitText(soundText, footerBtnW - uv(22), footerH - uv(8), 0.62);
        const soundHit = UIAssets.createHitArea(this.scene, soundBtnX, footerY, footerBtnW, footerH, 306)
            .setScrollFactor(0);
        soundHit.on('pointerover', () => { soundPanel.setUIState('hover').setAlpha(1); soundText.setColor('#ffffff'); });
        soundHit.on('pointerout', () => {
            soundPanel.setUIState('normal').setAlpha(1);
            const enabled = !(this.scene && this.scene.soundManager && this.scene.soundManager.enabled === false);
            soundText.setColor(enabled ? '#ebe4f8' : SYSTEM.TEXT_MUTED);
        });
        soundHit.on('pointerdown', () => soundPanel.setUIState('pressed'));
        soundHit.on('pointerup', () => {
            if (!this.scene || !this.scene.soundManager) return;
            const enabled = this.scene.soundManager.toggleSound();
            soundText.setText(soundLabel());
            soundText.setColor(enabled ? '#ffffff' : SYSTEM.TEXT_MUTED);
            fitText(soundText, footerBtnW - uv(22), footerH - uv(8), 0.62);
            soundPanel.setUIState('normal');
        });
        this.elements.push(soundPanel, soundText, soundHit);

        const exitPanel = UIAssets.createPanel(this.scene, exitBtnX, footerY, footerBtnW, footerH, {
            variant: 'button',
            tone: 'gold',
            depth: 303,
            scrollFactor: 0,
        });
        const exitText = this._text(exitBtnX + footerBtnW / 2, footerY + footerH / 2, t('toMenu'), {
            fontSize: fs(11), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: '#ffe8ad', stroke: '#05040d', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(305).setScrollFactor(0);
        fitText(exitText, footerBtnW - uv(22), footerH - uv(8), 0.62);
        const exitHit = UIAssets.createHitArea(this.scene, exitBtnX, footerY, footerBtnW, footerH, 306)
            .setScrollFactor(0);
        exitHit.on('pointerover', () => { exitPanel.setUIState('hover').setAlpha(1); exitText.setColor('#ffffff'); });
        exitHit.on('pointerout', () => { exitPanel.setUIState('normal').setAlpha(1); exitText.setColor('#ffe8ad'); });
        exitHit.on('pointerdown', () => exitPanel.setUIState('pressed'));
        exitHit.on('pointerup', () => {
            const targetScene = this.scene;
            if (!targetScene) return;
            this.close();
            targetScene.cameras.main.fadeOut(220, 0, 0, 0);
            targetScene.time.delayedCall(220, () => {
                if (targetScene.scene) targetScene.scene.start('MenuScene');
            });
        });
        this.elements.push(exitPanel, exitText, exitHit);

        // Close hint (desktop keyboard hint only; touch uses Close button or outside tap)
        if (!touch) {
            const hint = this._text(cx, hintY, t('tabClose'), {
                fontSize: fs(10), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
            }).setOrigin(0.5).setDepth(303).setScrollFactor(0);
            fitText(hint, w - uv(48), 0, 0.7);
            this.elements.push(hint);
        }

        // Fade in
        this.elements.forEach(el => {
            el.setAlpha(0);
            this.scene.tweens.add({
                targets: el, alpha: el === dim ? 0.68 : 1, duration: 180,
                ease: 'Cubic.Out',
            });
        });

        freezeCombat(this.scene, true);
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

        freezeCombat(this.scene, false);
    }

    destroy() { var __oc5;
        if ((((__oc5 = this.scene) === null || __oc5 === void 0 ? void 0 : __oc5.tweens))) {
            this.elements.forEach(el => this.scene.tweens.killTweensOf(el));
        }
        this.elements.forEach(el => {
            try { if (((el === null || el === void 0 ? void 0 : el.scene)) && el.destroy) el.destroy(); } catch (e) { /* already destroyed */ }
        });
        this.elements = [];
        this.isOpen = false;
        freezeCombat(this.scene, false);

        if (this.tabKey && this._onTabDown) {
            this.tabKey.off('down', this._onTabDown);
            this.tabKey = null;
            this._onTabDown = null;
        }
        if (this.escKey && this._onEscDown) {
            this.escKey.off('down', this._onEscDown);
            this.escKey = null;
            this._onEscDown = null;
        }
        this.scene = null;
    }
}
