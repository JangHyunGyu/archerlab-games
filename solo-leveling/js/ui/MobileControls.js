import {
    GAME_WIDTH, GAME_HEIGHT,
    SYSTEM, UI_FONT_MONO,
    fs, uv, drawSystemPanel, fitText, padText,
} from '../utils/Constants.js';
import { t } from '../utils/i18n.js';

/**
 * Mobile touch controls — System aesthetic.
 * Floating joystick spawns at touch, right-side action buttons.
 */
export class MobileControls {
    constructor(scene) {
        this.scene = scene;
        this.isMobile = this._detectMobile();
        this.joystick = { x: 0, y: 0, active: false };
        this.joystickBase = null;
        this.joystickRing = null;
        this.joystickThumb = null;
        this.pointerId = null;
        this.padX = 0;
        this.padY = 0;
        this.elements = [];
        this._onPointerDown = null;
        this._onPointerMove = null;
        this._onPointerUp = null;

        this.baseRadius = uv(70);
        this.thumbRadius = uv(28);
        this.maxDist = uv(70);
        this.deadZone = 0.05;

        if (this.isMobile) {
            this._setupFloatingJoystick();
            this._createButtons();
        }
    }

    _detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window)
            || (navigator.maxTouchPoints > 0);
    }

    _setupFloatingJoystick() {
        // Dark translucent base
        this.joystickBase = this.scene.add.circle(0, 0, this.baseRadius, SYSTEM.BG_DEEP, 0.55)
            .setDepth(600).setScrollFactor(0)
            .setStrokeStyle(1, SYSTEM.BORDER, 0.55)
            .setVisible(false);

        // Thin cyan ring
        this.joystickRing = this.scene.add.circle(0, 0, this.baseRadius + 4, 0x000000, 0)
            .setDepth(600).setScrollFactor(0)
            .setStrokeStyle(1, SYSTEM.BORDER, 0.35)
            .setVisible(false);

        // Thumb — small angular look via circle + inner dot
        this.joystickThumb = this.scene.add.circle(0, 0, this.thumbRadius, SYSTEM.BG_PANEL_HI, 0.85)
            .setDepth(601).setScrollFactor(0)
            .setStrokeStyle(1, SYSTEM.BORDER, 0.9)
            .setVisible(false);
        this.joystickThumbDot = this.scene.add.circle(0, 0, 3, SYSTEM.BORDER, 1)
            .setDepth(602).setScrollFactor(0)
            .setVisible(false);
        this.elements.push(this.joystickBase, this.joystickRing, this.joystickThumb, this.joystickThumbDot);

        this._onPointerDown = (pointer) => {
            if (this.pointerId !== null) return;
            if (pointer.x > GAME_WIDTH - uv(80)) return;

            this.pointerId = pointer.id;
            this.joystick.active = true;
            this.padX = pointer.x;
            this.padY = pointer.y;

            this.joystickRing.setPosition(this.padX, this.padY).setVisible(true);
            this.joystickBase.setPosition(this.padX, this.padY).setVisible(true);
            this.joystickThumb.setPosition(this.padX, this.padY).setVisible(true);
            this.joystickThumbDot.setPosition(this.padX, this.padY).setVisible(true);
        };

        this._onPointerMove = (pointer) => {
            if (!this.joystick.active || pointer.id !== this.pointerId) return;
            this._updateThumb(pointer.x, pointer.y);
        };

        this._onPointerUp = (pointer) => {
            if (pointer.id !== this.pointerId) return;
            this._resetJoystick();
        };

        this.scene.input.on('pointerdown', this._onPointerDown);
        this.scene.input.on('pointermove', this._onPointerMove);
        this.scene.input.on('pointerup', this._onPointerUp);
    }

    _updateThumb(px, py) {
        const dx = px - this.padX;
        const dy = py - this.padY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.maxDist) {
            this.joystick.x = dx / dist;
            this.joystick.y = dy / dist;
            const overflow = dist - this.maxDist * 1.3;
            if (overflow > 0) {
                const angle = Math.atan2(dy, dx);
                this.padX += Math.cos(angle) * overflow;
                this.padY += Math.sin(angle) * overflow;
                this.joystickBase.setPosition(this.padX, this.padY);
                this.joystickRing.setPosition(this.padX, this.padY);
            }
            const tx = this.padX + (dx / dist) * this.maxDist;
            const ty = this.padY + (dy / dist) * this.maxDist;
            this.joystickThumb.setPosition(tx, ty);
            this.joystickThumbDot.setPosition(tx, ty);
        } else if (dist > 3) {
            this.joystick.x = dx / this.maxDist;
            this.joystick.y = dy / this.maxDist;
            this.joystickThumb.setPosition(px, py);
            this.joystickThumbDot.setPosition(px, py);
        } else {
            this.joystick.x = 0;
            this.joystick.y = 0;
            this.joystickThumb.setPosition(this.padX, this.padY);
            this.joystickThumbDot.setPosition(this.padX, this.padY);
        }
    }

    _resetJoystick() {
        this.joystick.active = false;
        this.joystick.x = 0;
        this.joystick.y = 0;
        this.pointerId = null;

        this.joystickRing.setVisible(false);
        this.joystickBase.setVisible(false);
        this.joystickThumb.setVisible(false);
        this.joystickThumbDot.setVisible(false);
    }

    _createButtons() {
        const isPortrait = GAME_HEIGHT > GAME_WIDTH;
        const btnW = uv(isPortrait ? 52 : 58);
        const btnH = uv(36);
        const btnX = GAME_WIDTH - uv(12) - btnW;
        const statusY = isPortrait ? uv(70) : uv(118);
        const soundY = statusY + btnH + uv(10);

        // Status button
        const statusG = this.scene.add.graphics().setDepth(600).setScrollFactor(0);
        const drawStatus = (hover) => {
            statusG.clear();
            drawSystemPanel(statusG, btnX, statusY, btnW, btnH, {
                cut: uv(6),
                fill: hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL, fillAlpha: 0.85,
                border: SYSTEM.BORDER, borderAlpha: 0.8, borderWidth: 1,
            });
        };
        drawStatus(false);

        const statusHit = this.scene.add.rectangle(btnX + btnW / 2, statusY + btnH / 2, btnW, btnH, 0x000000, 0)
            .setDepth(601).setScrollFactor(0).setInteractive();
        const statusText = padText(this.scene.add.text(btnX + btnW / 2, statusY + btnH / 2, t('hudStatus'), {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN,
        }).setOrigin(0.5).setDepth(602).setScrollFactor(0), 2, 2);
        fitText(statusText, btnW - uv(8), btnH - uv(4), 0.62);
        this.elements.push(statusG, statusHit, statusText);

        statusHit.on('pointerover', () => drawStatus(true));
        statusHit.on('pointerout', () => drawStatus(false));
        statusHit.on('pointerdown', () => {
            if (this.scene.statusWindow) this.scene.statusWindow.toggle();
        });

        // Sound button
        const soundG = this.scene.add.graphics().setDepth(600).setScrollFactor(0);
        const drawSound = (hover) => {
            soundG.clear();
            drawSystemPanel(soundG, btnX, soundY, btnW, btnH, {
                cut: uv(6),
                fill: hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL, fillAlpha: 0.85,
                border: SYSTEM.BORDER, borderAlpha: 0.8, borderWidth: 1,
            });
        };
        drawSound(false);

        const soundHit = this.scene.add.rectangle(btnX + btnW / 2, soundY + btnH / 2, btnW, btnH, 0x000000, 0)
            .setDepth(601).setScrollFactor(0).setInteractive();
        this.soundBtnText = padText(this.scene.add.text(btnX + btnW / 2, soundY + btnH / 2, 'SND', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN,
        }).setOrigin(0.5).setDepth(602).setScrollFactor(0), 2, 2);
        fitText(this.soundBtnText, btnW - uv(8), btnH - uv(4), 0.62);
        this.elements.push(soundG, soundHit, this.soundBtnText);

        soundHit.on('pointerover', () => drawSound(true));
        soundHit.on('pointerout', () => drawSound(false));
        soundHit.on('pointerdown', () => {
            if (this.scene.soundManager) {
                const enabled = this.scene.soundManager.toggleSound();
                this.soundBtnText.setText(enabled ? 'SND' : 'MUTE');
                this.soundBtnText.setColor(enabled ? SYSTEM.TEXT_CYAN : SYSTEM.TEXT_MUTED);
                fitText(this.soundBtnText, btnW - uv(8), btnH - uv(4), 0.62);
            }
        });
    }

    getJoystickState() {
        if (!this.isMobile || !this.joystick.active) return null;

        const mag = Math.sqrt(this.joystick.x * this.joystick.x + this.joystick.y * this.joystick.y);
        if (mag < this.deadZone) return { x: 0, y: 0 };

        const remapped = (mag - this.deadZone) / (1.0 - this.deadZone);
        const clamped = Math.min(remapped, 1.0);
        return {
            x: (this.joystick.x / mag) * clamped,
            y: (this.joystick.y / mag) * clamped,
        };
    }

    updateLayout() {
        // Joystick floats; buttons use GAME_WIDTH live binding.
    }

    destroy() {
        if (this.isMobile && this.scene && this.scene.input) {
            if (this._onPointerDown) this.scene.input.off('pointerdown', this._onPointerDown);
            if (this._onPointerMove) this.scene.input.off('pointermove', this._onPointerMove);
            if (this._onPointerUp) this.scene.input.off('pointerup', this._onPointerUp);
        }
        this.elements.forEach(el => { if (el && el.active) el.destroy(); });
        this.elements = [];
        this._onPointerDown = null;
        this._onPointerMove = null;
        this._onPointerUp = null;
        this.scene = null;
    }
}
