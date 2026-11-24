import {
    GAME_WIDTH, GAME_HEIGHT,
    SYSTEM, UI_FONT_MONO,
    fs, uv, fitText, padText,
} from '../utils/Constants.js';
import { t } from '../utils/i18n.js';
import { UIAssets } from './UIAssets.js?v=20260913-crafted-ui-v1';

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
        this.buttonElements = [];
        this.buttonHitAreas = [];
        this.actionButtonBounds = null;
        this._modalOpen = false;
        this._onPointerDown = null;
        this._onPointerMove = null;
        this._onPointerUp = null;
        this._onPostUpdate = null;

        this.baseRadius = uv(70);
        this.thumbRadius = uv(28);
        this.maxDist = uv(70);
        this.deadZone = 0.05;

        if (this.isMobile) {
            this._setupFloatingJoystick();
            this._createButtons();
            this._onPostUpdate = () => this._syncModalState();
            this.scene.events.on('postupdate', this._onPostUpdate);
            this._syncModalState(true);
        }
    }

    _detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window)
            || (navigator.maxTouchPoints > 0);
    }

    _setupFloatingJoystick() {
        // Dark translucent base
        this.joystickBase = this.scene.add.circle(0, 0, this.baseRadius, SYSTEM.BG_DEEP, 0.74)
            .setDepth(600).setScrollFactor(0)
            .setStrokeStyle(2, SYSTEM.BORDER_DIM, 0.8)
            .setVisible(false);

        // Thin cyan ring
        this.joystickRing = this.scene.add.circle(0, 0, this.baseRadius + 4, 0x000000, 0)
            .setDepth(600).setScrollFactor(0)
            .setStrokeStyle(2, SYSTEM.BORDER, 0.5)
            .setVisible(false);

        // Thumb — small angular look via circle + inner dot
        this.joystickThumb = this.scene.add.circle(0, 0, this.thumbRadius, SYSTEM.BG_PANEL_HI, 0.94)
            .setDepth(601).setScrollFactor(0)
            .setStrokeStyle(2, SYSTEM.BORDER, 0.95)
            .setVisible(false);
        this.joystickThumbDot = this.scene.add.circle(0, 0, 3, SYSTEM.BORDER, 1)
            .setDepth(602).setScrollFactor(0)
            .setVisible(false);
        this.elements.push(this.joystickBase, this.joystickRing, this.joystickThumb, this.joystickThumbDot);

        this._onPointerDown = (pointer) => {
            this._syncModalState();
            if (this._isStatusModalOpen()) return;
            if (this.pointerId !== null) return;
            if (this._isInActionButtonColumn(pointer.x, pointer.y)) return;

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
            if (this._isStatusModalOpen()) {
                this._resetJoystick();
                return;
            }
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

    _resetJoystick() { var __oc2, __oc3, __oc4, __oc5;
        this.joystick.active = false;
        this.joystick.x = 0;
        this.joystick.y = 0;
        this.pointerId = null;

        (((__oc2 = this.joystickRing) === null || __oc2 === void 0 ? void 0 : __oc2.setVisible(false)));
        (((__oc3 = this.joystickBase) === null || __oc3 === void 0 ? void 0 : __oc3.setVisible(false)));
        (((__oc4 = this.joystickThumb) === null || __oc4 === void 0 ? void 0 : __oc4.setVisible(false)));
        (((__oc5 = this.joystickThumbDot) === null || __oc5 === void 0 ? void 0 : __oc5.setVisible(false)));
    }

    _isStatusModalOpen() { var __oc6, __oc7;
        return !!(((__oc7 = (__oc6 = this.scene) === null || __oc6 === void 0 ? void 0 : __oc6.statusWindow) === null || __oc7 === void 0 ? void 0 : __oc7.isOpen));
    }

    _isInActionButtonColumn(pointerX, pointerY) {
        const bounds = this.actionButtonBounds;
        if (!bounds) return false;
        const inX = pointerX >= bounds.x && pointerX <= bounds.x + bounds.width;
        if (typeof pointerY !== 'number' || typeof bounds.y !== 'number' || typeof bounds.height !== 'number') {
            return inX;
        }
        return inX && pointerY >= bounds.y && pointerY <= bounds.y + bounds.height;
    }

    _syncModalState(force = false) {
        if (!this.isMobile) return;
        const modalOpen = this._isStatusModalOpen();
        if (modalOpen) this._resetJoystick();
        if (!force && modalOpen === this._modalOpen) return;

        this._modalOpen = modalOpen;
        this.buttonElements.forEach(el => {
            if (((el === null || el === void 0 ? void 0 : el.active))) el.setVisible(!modalOpen);
        });
        this.buttonHitAreas.forEach(hit => {
            if (!((hit === null || hit === void 0 ? void 0 : hit.active))) return;
            if (modalOpen) hit.disableInteractive();
            else hit.setInteractive({ useHandCursor: true });
        });
    }

    _createButtons() {
        const cssPerUnit = cssPerGameUnit(this.scene);
        const minTouch = Math.ceil(44 / cssPerUnit);
        const btnGap = Math.max(uv(6), Math.ceil(6 / cssPerUnit));
        const btnW = Math.max(uv(40), minTouch);
        const btnH = Math.max(uv(34), minTouch);
        const btnX = GAME_WIDTH - uv(12) - btnW;
        const homeBottom = (this.scene && this.scene.hud && this.scene.hud._homeBottom)
            ? this.scene.hud._homeBottom : uv(56);
        const statusY = homeBottom + btnGap;
        const soundY = statusY + btnH + btnGap;
        const totalBtnH = btnH * 2 + btnGap;
        this.actionButtonBounds = { x: btnX - uv(6), y: statusY - uv(6), width: btnW + uv(12), height: totalBtnH + uv(12) };

        // Status button
        const statusPanel = UIAssets.createPanel(this.scene, btnX, statusY, btnW, btnH, {
            fillAlpha: 0.58,
            variant: 'button',
            depth: 600,
            scrollFactor: 0,
        });
        const statusHit = UIAssets.createHitArea(this.scene, btnX, statusY, btnW, btnH, 601).setScrollFactor(0);
        const statusText = padText(this.scene.add.text(btnX + btnW / 2, statusY + btnH / 2, t('hudStatus'), {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: '#d8d0ee',
        }).setOrigin(0.5).setDepth(602).setScrollFactor(0), 2, 2);
        fitText(statusText, btnW - uv(6), btnH - uv(4), 0.62);
        this.elements.push(statusPanel, statusHit, statusText);
        this.buttonElements.push(statusPanel, statusHit, statusText);
        this.buttonHitAreas.push(statusHit);

        statusHit.on('pointerover', () => statusPanel.setUIState('hover'));
        statusHit.on('pointerout', () => statusPanel.setUIState('normal'));
        statusHit.on('pointerdown', () => {
            if (this._isStatusModalOpen()) return;
            statusPanel.setUIState('hover');
            this.scene.time.delayedCall(110, () => {
                if (statusPanel && statusPanel.active) statusPanel.setUIState('normal');
            });
            if (this.scene.statusWindow) {
                this.scene.statusWindow.toggle();
                this._syncModalState(true);
            }
        });

        // Sound button
        const soundPanel = UIAssets.createPanel(this.scene, btnX, soundY, btnW, btnH, {
            fillAlpha: 0.58,
            variant: 'button',
            depth: 600,
            scrollFactor: 0,
        });
        const soundHit = UIAssets.createHitArea(this.scene, btnX, soundY, btnW, btnH, 601).setScrollFactor(0);
        const soundEnabled = !(this.scene.soundManager && this.scene.soundManager.enabled === false);
        this.soundBtnText = padText(this.scene.add.text(btnX + btnW / 2, soundY + btnH / 2, soundEnabled ? 'SND' : 'OFF', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: soundEnabled ? '#d8d0ee' : SYSTEM.TEXT_MUTED,
        }).setOrigin(0.5).setDepth(602).setScrollFactor(0), 2, 2);
        fitText(this.soundBtnText, btnW - uv(6), btnH - uv(4), 0.62);
        this.elements.push(soundPanel, soundHit, this.soundBtnText);
        this.buttonElements.push(soundPanel, soundHit, this.soundBtnText);
        this.buttonHitAreas.push(soundHit);

        soundHit.on('pointerover', () => soundPanel.setUIState('hover'));
        soundHit.on('pointerout', () => soundPanel.setUIState('normal'));
        soundHit.on('pointerdown', () => {
            if (this._isStatusModalOpen()) return;
            soundPanel.setUIState('hover');
            this.scene.time.delayedCall(110, () => {
                if (soundPanel && soundPanel.active) soundPanel.setUIState('normal');
            });
            if (this.scene.soundManager) {
                const enabled = this.scene.soundManager.toggleSound();
                this.soundBtnText.setText(enabled ? 'SND' : 'OFF');
                this.soundBtnText.setColor(enabled ? '#d8d0ee' : SYSTEM.TEXT_MUTED);
                fitText(this.soundBtnText, btnW - uv(6), btnH - uv(4), 0.62);
            }
        });
    }

    getJoystickState() {
        this._syncModalState();
        if (!this.isMobile || this._isStatusModalOpen() || !this.joystick.active) return null;

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
        // GameScene rebuilds controls after a resize. Refresh visibility and keep the
        // exclusion box tied to the live hit-area bounds in case this is called directly.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < this.buttonHitAreas.length; i++) {
            const hit = this.buttonHitAreas[i];
            if (!hit || !hit.active || typeof hit.getBounds !== 'function') continue;
            const b = hit.getBounds();
            if (b.x < minX) minX = b.x;
            if (b.y < minY) minY = b.y;
            if (b.x + b.width > maxX) maxX = b.x + b.width;
            if (b.y + b.height > maxY) maxY = b.y + b.height;
        }
        if (Number.isFinite(minX) && Number.isFinite(minY)) {
            const pad = uv(6);
            this.actionButtonBounds = {
                x: minX - pad,
                y: minY - pad,
                width: (maxX - minX) + pad * 2,
                height: (maxY - minY) + pad * 2,
            };
        }
        this._syncModalState(true);
    }

    destroy() { var __oc9;
        if (this.isMobile && this.scene && this.scene.input) {
            if (this._onPointerDown) this.scene.input.off('pointerdown', this._onPointerDown);
            if (this._onPointerMove) this.scene.input.off('pointermove', this._onPointerMove);
            if (this._onPointerUp) this.scene.input.off('pointerup', this._onPointerUp);
        }
        if (this._onPostUpdate && (((__oc9 = this.scene) === null || __oc9 === void 0 ? void 0 : __oc9.events))) {
            this.scene.events.off('postupdate', this._onPostUpdate);
        }
        this.elements.forEach(el => { if (el && el.active) el.destroy(); });
        this.elements = [];
        this.buttonElements = [];
        this.buttonHitAreas = [];
        this.actionButtonBounds = null;
        this._onPointerDown = null;
        this._onPointerMove = null;
        this._onPointerUp = null;
        this._onPostUpdate = null;
        this.scene = null;
    }
}
