import {
    GAME_WIDTH, GAME_HEIGHT,
    SYSTEM, UI_FONT_MONO,
    fs, uv, fitText, padText,
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
        // Dark obsidian translucent base
        this.joystickBase = this.scene.add.circle(0, 0, this.baseRadius, 0x090614, 0.78)
            .setDepth(600).setScrollFactor(0)
            .setStrokeStyle(2, 0x8a5cff, 0.65)
            .setVisible(false);

        // Antique gold outer ring
        this.joystickRing = this.scene.add.circle(0, 0, this.baseRadius + 4, 0x000000, 0)
            .setDepth(600).setScrollFactor(0)
            .setStrokeStyle(1.5, 0xe8c266, 0.45)
            .setVisible(false);

        // Thumb — amethyst-gold jewel core
        this.joystickThumb = this.scene.add.circle(0, 0, this.thumbRadius, 0x1d1336, 0.94)
            .setDepth(601).setScrollFactor(0)
            .setStrokeStyle(2, 0xe8c266, 0.92)
            .setVisible(false);
        this.joystickThumbDot = this.scene.add.circle(0, 0, 3.5, 0xc8a4ff, 1)
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

    _syncMenuButtonExclusion() {
        const bounds = this.scene && this.scene.hud && this.scene.hud._menuButtonBounds;
        if (bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
            const pad = uv(8);
            this.actionButtonBounds = {
                x: bounds.x - pad,
                y: bounds.y - pad,
                width: bounds.width + pad * 2,
                height: bounds.height + pad * 2,
            };
        } else {
            const cssPerUnit = cssPerGameUnit(this.scene);
            const minTouch = Math.ceil(44 / cssPerUnit);
            const size = Math.max(uv(44), minTouch);
            this.actionButtonBounds = {
                x: GAME_WIDTH - uv(20) - size,
                y: uv(4),
                width: size + uv(16),
                height: size + uv(20),
            };
        }
    }

    _createButtons() {
        // Sound toggle and Exit live inside the unified Status/Pause overlay opened by the single HUD button.
        this._syncMenuButtonExclusion();
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
        // GameScene rebuilds controls after a resize. Keep the top-right pause button excluded
        // from joystick touches even though right-column action buttons are unified into StatusWindow.
        this._syncMenuButtonExclusion();
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
