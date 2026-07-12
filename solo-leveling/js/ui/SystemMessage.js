import { GAME_WIDTH, GAME_HEIGHT, UI_FONT_MONO, UI_FONT_KR, fs, uv, fitText, padText } from '../utils/Constants.js';
import { UIAssets } from './UIAssets.js';

/**
 * 그림자 서바이벌의 시스템 창 UI입니다.
 * 파란색 반투명 홀로그램 윈도우에 메시지가 표시됩니다.
 */
export class SystemMessage {
    constructor(scene) {
        this.scene = scene;
        this.queue = [];
        this.isShowing = false;
        this.currentMessage = null;
        this.currentElements = [];
        this._timers = new Set();
        this._destroyed = false;
    }

    /**
     * 시스템 메시지를 큐에 추가
     * @param {string} title - 상단 제목 (예: '[시스템]', '[알림]', '[퀘스트]')
     * @param {string|string[]} lines - 본문 텍스트 (여러 줄 가능)
     * @param {object} options - { duration, sound, type }
     */
    show(title, lines, options = {}) {
        if (this._destroyed || !this.scene) return;
        const msg = {
            title: title || '[시스템]',
            lines: Array.isArray(lines) ? lines : [lines],
            duration: options.duration || 3000,
            type: options.type || 'info', // info, warning, quest, levelup, arise
        };
        this.queue.push(msg);
        if (!this.isShowing) this._showNext();
    }

    _showNext() {
        if (this._destroyed || !this.scene) return;
        if (this.queue.length === 0) {
            this.isShowing = false;
            this.currentMessage = null;
            return;
        }

        this.isShowing = true;
        const msg = this.queue.shift();
        this.currentMessage = msg;

        const colors = this._getColors(msg.type);
        const cx = GAME_WIDTH / 2;
        const lineCount = Math.max(1, msg.lines.length);
        const portrait = GAME_HEIGHT > GAME_WIDTH;
        const safeX = Math.max(14, Math.min(uv(20), GAME_WIDTH * 0.045));
        const safeTop = Math.max(14, Math.min(uv(24), GAME_HEIGHT * 0.04));
        const safeBottom = Math.max(14, Math.min(uv(20), GAME_HEIGHT * 0.04));
        const boxW = Math.max(1, Math.min(uv(430), GAME_WIDTH - safeX * 2));
        const maxBoxH = Math.max(1, GAME_HEIGHT - safeTop - safeBottom);
        let lineH = uv(28);
        const fixedH = uv(58);
        if (fixedH + lineCount * lineH > maxBoxH) {
            lineH = Math.max(18, Math.floor((maxBoxH - fixedH) / lineCount));
        }
        const boxH = Math.min(maxBoxH, fixedH + lineCount * lineH);
        const preferredTop = portrait
            ? Math.min(uv(156), GAME_HEIGHT * 0.2)
            : Math.min(uv(72), GAME_HEIGHT * 0.13);
        const boxTop = Math.max(safeTop, Math.min(preferredTop, GAME_HEIGHT - safeBottom - boxH));
        const boxLeft = cx - boxW / 2;
        const startY = boxTop + boxH / 2;

        const elements = [];
        this.currentElements = elements;

        const bg = UIAssets.createPanel(
            this.scene,
            boxLeft,
            boxTop,
            boxW,
            boxH,
            {
                asset: colors.asset,
                cut: uv(8),
                fill: colors.bg,
                fillAlpha: 0.86,
                border: colors.border,
                borderAlpha: 0.9,
                borderWidth: 1,
                accent: colors.border,
                glow: 6,
                variant: 'panel',
                depth: 201,
                scrollFactor: 0,
            }
        ).setAlpha(0);
        elements.push(bg);

        // Severity rail and corner markers make the message type readable at a glance.
        const rail = this.scene.add.rectangle(boxLeft + uv(5), startY, Math.max(2, uv(3)), boxH - uv(18), colors.border, 0.88)
            .setDepth(202).setScrollFactor(0).setAlpha(0);
        const diamondL = this.scene.add.rectangle(boxLeft + uv(12), boxTop + uv(4), 6, 6, colors.border, 0.9)
            .setDepth(202).setScrollFactor(0).setRotation(Math.PI / 4).setAlpha(0);
        const diamondR = this.scene.add.rectangle(boxLeft + boxW - uv(12), boxTop + uv(4), 6, 6, colors.border, 0.9)
            .setDepth(202).setScrollFactor(0).setRotation(Math.PI / 4).setAlpha(0);
        elements.push(rail, diamondL, diamondR);

        const markerSize = Math.max(24, uv(26));
        const markerPlate = this.scene.add.rectangle(
            boxLeft + uv(22), boxTop + uv(22), markerSize, markerSize, colors.border, 0.13
        ).setStrokeStyle(1, colors.border, 0.72).setDepth(202).setScrollFactor(0).setAlpha(0);
        const marker = padText(this.scene.add.text(boxLeft + uv(22), boxTop + uv(22), colors.marker, {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, fontStyle: 'bold', color: colors.titleColor,
            stroke: '#02040a', strokeThickness: 1,
        }).setOrigin(0.5).setDepth(203).setScrollFactor(0).setAlpha(0), 2, 2);
        elements.push(markerPlate, marker);

        // Title text
        const titleText = padText(this.scene.add.text(boxLeft + uv(43), boxTop + uv(12), msg.title, {
            fontSize: fs(13),
            fontFamily: UI_FONT_MONO,
            fontStyle: 'bold',
            color: colors.titleColor,
            stroke: '#02040a',
            strokeThickness: 2,
        }).setOrigin(0, 0).setDepth(203).setScrollFactor(0).setAlpha(0), 4, 5, 2, 2);
        fitText(titleText, boxW - uv(62), uv(28), 0.68);
        elements.push(titleText);

        // Horizontal line under title
        const titleLine = this.scene.add.rectangle(cx, boxTop + uv(43), boxW - uv(30), 1, colors.border, 0.5)
            .setDepth(202).setScrollFactor(0).setAlpha(0);
        elements.push(titleLine);

        // The first line carries the message; subsequent lines read as supporting detail.
        const bodyX = boxLeft + uv(20);
        msg.lines.forEach((line, i) => {
            const bodyY = boxTop + uv(50) + i * lineH;
            const body = padText(this.scene.add.text(bodyX, bodyY, line, {
                fontSize: fs(i === 0 ? 15 : 13),
                fontFamily: UI_FONT_KR,
                fontStyle: i === 0 ? 'bold' : 'normal',
                color: i === 0 ? colors.primaryTextColor : colors.textColor,
                stroke: '#02040a',
                strokeThickness: 2,
                lineSpacing: 4,
            }).setOrigin(0, 0).setDepth(203).setScrollFactor(0).setAlpha(0), 4, 5, 2, 2);
            fitText(body, boxW - uv(40), lineH, 0.64);
            elements.push(body);
        });

        // A quiet lifetime bar communicates timing without adding copy.
        const progress = this.scene.add.rectangle(
            boxLeft + uv(10), boxTop + boxH - uv(5), boxW - uv(20), Math.max(1, uv(2)), colors.border, 0.72
        ).setOrigin(0, 0.5).setDepth(203).setScrollFactor(0).setAlpha(0);
        elements.push(progress);

        // Cohesive slide-in replaces the old flicker, keeping the alert legible in motion.
        const enterOffset = uv(10);
        elements.forEach((el, idx) => {
            const finalY = el.y;
            el.setAlpha(0).setY(finalY - enterOffset);
            this.scene.tweens.add({
                targets: el,
                alpha: 1,
                y: finalY,
                duration: 250,
                delay: Math.min(idx * 12, 84),
                ease: 'Cubic.Out',
            });
        });
        titleLine.setScale(0.18, 1);
        this.scene.tweens.add({
            targets: titleLine,
            scaleX: 1,
            duration: 340,
            delay: 70,
            ease: 'Cubic.Out',
        });
        progress.setScale(1, 1);
        this.scene.tweens.add({
            targets: progress,
            scaleX: 0,
            duration: Math.max(300, msg.duration - 240),
            delay: 240,
            ease: 'Linear',
        });

        // Play sound
        if (this.scene.soundManager) {
            if (msg.type === 'levelup') this.scene.soundManager.play('levelup');
            else if (msg.type === 'arise') this.scene.soundManager.play('arise');
            else if (msg.type === 'warning') this.scene.soundManager.play('warning');
            else this.scene.soundManager.play('system');
        }

        // Auto-dismiss
        this._delay(msg.duration, () => {
            elements.forEach((el, idx) => {
                this.scene.tweens.add({
                    targets: el,
                    alpha: 0,
                    y: el.y - uv(7),
                    duration: 180,
                    delay: Math.min(idx * 5, 40),
                    ease: 'Cubic.In',
                    onComplete: () => el.destroy(),
                });
            });
            this._delay(260, () => {
                if (this.currentElements === elements) this.currentElements = [];
                this._showNext();
            });
        });
    }

    _delay(ms, callback) {
        if (!this.scene?.time) return null;
        const timer = this.scene.time.delayedCall(ms, () => {
            this._timers.delete(timer);
            if (!this._destroyed && this.scene) callback();
        });
        this._timers.add(timer);
        return timer;
    }

    destroy() {
        this._destroyed = true;
        this.queue = [];
        this.isShowing = false;
        this.currentMessage = null;

        for (const timer of this._timers) {
            try { timer.remove(false); } catch (e) { /* already removed */ }
        }
        this._timers.clear();

        const elements = this.currentElements || [];
        for (const el of elements) {
            try {
                if (this.scene?.tweens) this.scene.tweens.killTweensOf(el);
                if (el?.scene && el.destroy) el.destroy();
            } catch (e) { /* already destroyed */ }
        }
        this.currentElements = [];
        this.scene = null;
    }

    _getColors(type) {
        switch (type) {
            case 'warning':
                return {
                    asset: 'ui_panel_red',
                    bg: 0x2a0a0a, border: 0xff3333, glow: 0xff0000,
                    titleColor: '#ff6666', primaryTextColor: '#fff0f0', textColor: '#ffb8b8', marker: '!',
                };
            case 'quest':
                return {
                    asset: 'ui_panel_cyan',
                    bg: 0x0a1a2a, border: 0x44aaff, glow: 0x2288ff,
                    titleColor: '#78d6ff', primaryTextColor: '#f1f8ff', textColor: '#c8ddf5', marker: 'Q',
                };
            case 'levelup':
                return {
                    asset: 'ui_panel_purple',
                    bg: 0x0a0a2a, border: 0x7b2fff, glow: 0x6622ff,
                    titleColor: '#c590ff', primaryTextColor: '#ffffff', textColor: '#e0d0ff', marker: '↑',
                };
            case 'arise':
                return {
                    asset: 'ui_panel_purple',
                    bg: 0x0f0020, border: 0x9b44ff, glow: 0x7b2fff,
                    titleColor: '#d6a4ff', primaryTextColor: '#ffffff', textColor: '#eadbff', marker: '◆',
                };
            default: // info
                return {
                    asset: 'ui_panel_cyan',
                    bg: 0x0a1a2a, border: 0x3388cc, glow: 0x2266aa,
                    titleColor: '#69c8f5', primaryTextColor: '#edfaff', textColor: '#b8d3e2', marker: 'i',
                };
        }
    }
}
