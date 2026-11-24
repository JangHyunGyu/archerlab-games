import { GAME_WIDTH, GAME_HEIGHT, UI_FONT_MONO, UI_FONT_KR, fs, uv, fitText, padText } from '../utils/Constants.js';
import { UIAssets } from './UIAssets.js?v=20260913-crafted-ui-v1';
import { t } from '../utils/i18n.js';

/**
 * 그림자 서바이벌의 시스템 창 UI입니다.
 * 파란색 반투명 홀로그램 윈도우에 메시지가 표시됩니다.
 */
export class SystemMessage {
    constructor(scene, { placement = 'top' } = {}) {
        this.scene = scene;
        this.placement = placement;
        this.visible = true;
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
            title: title || t('sysSystem'),
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
        this._mountMessage(msg, true);

        this._delay(msg.duration, () => this._dismiss(msg));
    }

    setVisible(visible) {
        this.visible = visible;
        this.currentElements.forEach(element => element.setVisible(visible));
    }

    relayout() {
        if (this._destroyed || !this.scene || !this.isShowing || !this.currentMessage) return;
        const msg = this.currentMessage;
        this._clearElements(this.currentElements);
        this.currentElements = [];
        this._mountMessage(msg, false);
    }

    _clearElements(elements) { var __oc0;
        for (const el of elements || []) {
            try {
                if ((((__oc0 = this.scene) === null || __oc0 === void 0 ? void 0 : __oc0.tweens))) this.scene.tweens.killTweensOf(el);
                if (((el === null || el === void 0 ? void 0 : el.active))) el.destroy();
            } catch (e) { /* already gone */ }
        }
    }

    _dismiss(msg) {
        if (this._destroyed || !this.scene || this.currentMessage !== msg) return;
        const live = this.currentElements || [];
        live.forEach((el, idx) => {
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
            if (this.currentMessage !== msg) return;
            this.currentElements = [];
            this.currentMessage = null;
            this._showNext();
        });
    }

    _mountMessage(msg, animate) {
        const colors = this._getColors(msg.type);
        const cx = GAME_WIDTH / 2;
        const lineCount = Math.max(1, msg.lines.length);
        const portrait = GAME_HEIGHT > GAME_WIDTH;
        const safeX = Math.max(14, Math.min(uv(20), GAME_WIDTH * 0.045));
        const safeTop = Math.max(14, Math.min(uv(24), GAME_HEIGHT * 0.04));
        const safeBottom = Math.max(14, Math.min(uv(20), GAME_HEIGHT * 0.04));
        const boxW = Math.max(1, Math.min(uv(320), GAME_WIDTH - safeX * 2));
        const maxBoxH = Math.max(1, GAME_HEIGHT - safeTop - safeBottom);
        let lineH = uv(19);
        const headerH = uv(22);
        const padBottom = uv(10);
        if (headerH + lineCount * lineH + padBottom > maxBoxH) {
            lineH = Math.max(14, Math.floor((maxBoxH - headerH - padBottom) / lineCount));
        }
        const boxH = Math.min(maxBoxH, headerH + lineCount * lineH + padBottom);
        const preferredTop = this.placement === 'bottom'
            ? GAME_HEIGHT - safeBottom - boxH
            : (portrait ? uv(64) : uv(50));
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
                cut: uv(6),
                fill: colors.bg,
                fillAlpha: 0.84,
                border: colors.border,
                borderAlpha: 0.52,
                borderWidth: 1,
                variant: 'hud',
                depth: 201,
                scrollFactor: 0,
            }
        ).setAlpha(0);
        elements.push(bg);

        // Clean slim left severity accent bar
        const rail = this.scene.add.rectangle(boxLeft + uv(4), startY, Math.max(2, uv(3)), boxH - uv(12), colors.border, 0.9)
            .setDepth(202).setScrollFactor(0).setAlpha(0);
        elements.push(rail);

        // Compact header tag
        const textX = boxLeft + uv(14);
        const titleText = padText(this.scene.add.text(textX, boxTop + uv(6), msg.title, {
            fontSize: fs(10),
            fontFamily: UI_FONT_MONO,
            fontStyle: 'bold',
            color: colors.titleColor,
            stroke: '#02040a',
            strokeThickness: 2,
        }).setOrigin(0, 0).setDepth(203).setScrollFactor(0).setAlpha(0), 2, 2);
        fitText(titleText, boxW - uv(28), uv(16), 0.72);
        elements.push(titleText);

        // Concise message lines
        msg.lines.forEach((line, i) => {
            const bodyY = boxTop + headerH + i * lineH;
            const body = padText(this.scene.add.text(textX, bodyY, line, {
                fontSize: fs(i === 0 ? 12 : 11),
                fontFamily: UI_FONT_KR,
                fontStyle: i === 0 ? 'bold' : 'normal',
                color: i === 0 ? colors.primaryTextColor : colors.textColor,
                stroke: '#02040a',
                strokeThickness: 2,
                lineSpacing: 2,
            }).setOrigin(0, 0).setDepth(203).setScrollFactor(0).setAlpha(0), 2, 2);
            fitText(body, boxW - uv(28), lineH, 0.66);
            elements.push(body);
        });

        // Subtle lifetime progress bar at bottom
        const progress = this.scene.add.rectangle(
            boxLeft + uv(8), boxTop + boxH - uv(3), boxW - uv(16), Math.max(1, uv(2)), colors.border, 0.65
        ).setOrigin(0, 0.5).setDepth(203).setScrollFactor(0).setAlpha(0);
        elements.push(progress);
        elements.forEach(element => element.setVisible(this.visible));

        if (!animate) {
            elements.forEach(el => el.setAlpha(1));
            return;
        }

        const enterOffset = uv(6);
        elements.forEach((el, idx) => {
            const finalY = el.y;
            el.setAlpha(0).setY(finalY - enterOffset);
            this.scene.tweens.add({
                targets: el,
                alpha: 1,
                y: finalY,
                duration: 200,
                delay: Math.min(idx * 10, 50),
                ease: 'Cubic.Out',
            });
        });
        progress.setScale(1, 1);
        this.scene.tweens.add({
            targets: progress,
            scaleX: 0,
            duration: Math.max(300, msg.duration - 200),
            delay: 200,
            ease: 'Linear',
        });

        if (this.scene.soundManager) {
            if (msg.type === 'levelup') this.scene.soundManager.play('levelup');
            else if (msg.type === 'arise') this.scene.soundManager.play('arise');
            else if (msg.type === 'warning') this.scene.soundManager.play('warning');
            else this.scene.soundManager.play('system');
        }
    }

    _delay(ms, callback) { var __oc1;
        if (!(((__oc1 = this.scene) === null || __oc1 === void 0 ? void 0 : __oc1.time))) return null;
        const timer = this.scene.time.delayedCall(ms, () => {
            this._timers.delete(timer);
            if (!this._destroyed && this.scene) callback();
        });
        this._timers.add(timer);
        return timer;
    }

    destroy() { var __oc2;
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
                if ((((__oc2 = this.scene) === null || __oc2 === void 0 ? void 0 : __oc2.tweens))) this.scene.tweens.killTweensOf(el);
                if (((el === null || el === void 0 ? void 0 : el.scene)) && el.destroy) el.destroy();
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
