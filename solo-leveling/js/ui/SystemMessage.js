import { GAME_WIDTH, GAME_HEIGHT, fs, uv } from '../utils/Constants.js';

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
            return;
        }

        this.isShowing = true;
        const msg = this.queue.shift();
        this.currentMessage = msg;

        const colors = this._getColors(msg.type);
        const cx = GAME_WIDTH / 2;
        const lineCount = msg.lines.length;
        const lineH = uv(24);
        const boxH = uv(60) + lineCount * lineH;
        const boxW = Math.min(uv(360), GAME_WIDTH - uv(40));
        const startY = uv(118);

        // Container for scroll factor
        const elements = [];
        this.currentElements = elements;

        // Outer glow
        const outerGlow = this.scene.add.rectangle(cx, startY, boxW + 8, boxH + 8, colors.glow, 0.15)
            .setDepth(200).setScrollFactor(0).setAlpha(0);
        elements.push(outerGlow);

        // Main window background
        const bg = this.scene.add.rectangle(cx, startY, boxW, boxH, colors.bg, 0.85)
            .setDepth(201).setScrollFactor(0).setAlpha(0);
        elements.push(bg);

        // Border (top and bottom lines)
        const borderTop = this.scene.add.rectangle(cx, startY - boxH / 2, boxW, 2, colors.border, 0.9)
            .setDepth(202).setScrollFactor(0).setAlpha(0);
        const borderBot = this.scene.add.rectangle(cx, startY + boxH / 2, boxW, 2, colors.border, 0.9)
            .setDepth(202).setScrollFactor(0).setAlpha(0);
        elements.push(borderTop, borderBot);

        // Side decorations (small diamonds)
        const diamondL = this.scene.add.rectangle(cx - boxW / 2 + 8, startY - boxH / 2, 6, 6, colors.border, 0.8)
            .setDepth(202).setScrollFactor(0).setRotation(Math.PI / 4).setAlpha(0);
        const diamondR = this.scene.add.rectangle(cx + boxW / 2 - 8, startY - boxH / 2, 6, 6, colors.border, 0.8)
            .setDepth(202).setScrollFactor(0).setRotation(Math.PI / 4).setAlpha(0);
        elements.push(diamondL, diamondR);

        // Title text
        const titleText = this.scene.add.text(cx, startY - boxH / 2 + uv(18), msg.title, {
            fontSize: fs(13),
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: colors.titleColor,
        }).setOrigin(0.5).setDepth(203).setScrollFactor(0).setAlpha(0);
        elements.push(titleText);

        // Horizontal line under title
        const titleLine = this.scene.add.rectangle(cx, startY - boxH / 2 + uv(32), boxW - uv(40), 1, colors.border, 0.4)
            .setDepth(202).setScrollFactor(0).setAlpha(0);
        elements.push(titleLine);

        // Body lines
        const bodyTexts = [];
        msg.lines.forEach((line, i) => {
            const t = this.scene.add.text(cx, startY - boxH / 2 + uv(48) + i * lineH, line, {
                fontSize: fs(14),
                fontFamily: 'Arial',
                color: colors.textColor,
            }).setOrigin(0.5).setDepth(203).setScrollFactor(0).setAlpha(0);
            elements.push(t);
            bodyTexts.push(t);
        });

        // Animate in: slide down + fade in
        elements.forEach((el, idx) => {
            this.scene.tweens.add({
                targets: el,
                alpha: 1,
                y: el.y, // keep position
                duration: 300,
                delay: idx * 20,
                ease: 'Power2',
            });
            el.setAlpha(0);
        });

        // Glitch/flicker effect for cyberpunk feel
        this._delay(100, () => {
            bg.setAlpha(0.4);
            this._delay(50, () => {
                bg.setAlpha(0.85);
            });
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
                    duration: 200,
                    delay: idx * 10,
                    onComplete: () => el.destroy(),
                });
            });
            this._delay(400, () => {
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
                    bg: 0x2a0a0a, border: 0xff3333, glow: 0xff0000,
                    titleColor: '#ff4444', textColor: '#ffaaaa',
                };
            case 'quest':
                return {
                    bg: 0x0a1a2a, border: 0x44aaff, glow: 0x2288ff,
                    titleColor: '#66ccff', textColor: '#ccddff',
                };
            case 'levelup':
                return {
                    bg: 0x0a0a2a, border: 0x7b2fff, glow: 0x6622ff,
                    titleColor: '#b366ff', textColor: '#ddccff',
                };
            case 'arise':
                return {
                    bg: 0x0f0020, border: 0x9b44ff, glow: 0x7b2fff,
                    titleColor: '#cc88ff', textColor: '#eeddff',
                };
            default: // info
                return {
                    bg: 0x0a1a2a, border: 0x3388cc, glow: 0x2266aa,
                    titleColor: '#55aadd', textColor: '#aaccdd',
                };
        }
    }
}
