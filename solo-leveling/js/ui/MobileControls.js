import { GAME_WIDTH, GAME_HEIGHT, fs, uv } from '../utils/Constants.js';

/**
 * 모바일 터치 컨트롤
 * - 플로팅 조이스틱: 화면 어디든 터치하면 그 위치에 조이스틱 생성
 * - 조이스틱 상태는 매 프레임 Player가 직접 읽음 (입력 소실 방지)
 * - 우측 상단 상태/사운드 버튼
 */
export class MobileControls {
    constructor(scene) {
        this.scene = scene;
        this.isMobile = this._detectMobile();
        this.joystick = { x: 0, y: 0, active: false };
        this.joystickBase = null;
        this.joystickGlow = null;
        this.joystickThumb = null;
        this.pointerId = null;
        this.padX = 0;
        this.padY = 0;

        // Joystick config
        this.baseRadius = uv(70);
        this.thumbRadius = uv(30);
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
        // Create joystick elements (hidden initially)
        this.joystickGlow = this.scene.add.circle(0, 0, this.baseRadius + 8, 0x4a1a8a, 0.25)
            .setDepth(600).setScrollFactor(0).setVisible(false);

        this.joystickBase = this.scene.add.circle(0, 0, this.baseRadius, 0x111133, 0.5)
            .setDepth(600).setScrollFactor(0)
            .setStrokeStyle(3, 0x6644aa, 0.7)
            .setVisible(false);

        this.joystickThumb = this.scene.add.circle(0, 0, this.thumbRadius, 0x7755cc, 0.7)
            .setDepth(601).setScrollFactor(0)
            .setStrokeStyle(2, 0xaa88ff, 0.8)
            .setVisible(false);

        // Touch handlers
        this.scene.input.on('pointerdown', (pointer) => {
            if (this.pointerId !== null) return;

            // Ignore touches on the button area (right side)
            if (pointer.x > GAME_WIDTH - uv(80)) return;

            this.pointerId = pointer.id;
            this.joystick.active = true;

            // Place joystick at touch position
            this.padX = pointer.x;
            this.padY = pointer.y;

            this.joystickGlow.setPosition(this.padX, this.padY).setVisible(true).setAlpha(0.3);
            this.joystickBase.setPosition(this.padX, this.padY).setVisible(true)
                .setStrokeStyle(3, 0xaa88ff, 0.9);
            this.joystickThumb.setPosition(this.padX, this.padY).setVisible(true);
        });

        this.scene.input.on('pointermove', (pointer) => {
            if (!this.joystick.active || pointer.id !== this.pointerId) return;
            this._updateThumb(pointer.x, pointer.y);
        });

        this.scene.input.on('pointerup', (pointer) => {
            if (pointer.id !== this.pointerId) return;
            this._resetJoystick();
        });
    }

    _updateThumb(px, py) {
        const dx = px - this.padX;
        const dy = py - this.padY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.maxDist) {
            this.joystick.x = dx / dist;
            this.joystick.y = dy / dist;
            // Drag base along if finger moves far enough (common in mobile games)
            const overflow = dist - this.maxDist * 1.3;
            if (overflow > 0) {
                const angle = Math.atan2(dy, dx);
                this.padX += Math.cos(angle) * overflow;
                this.padY += Math.sin(angle) * overflow;
                this.joystickBase.setPosition(this.padX, this.padY);
                this.joystickGlow.setPosition(this.padX, this.padY);
            }
            this.joystickThumb.setPosition(
                this.padX + (dx / dist) * this.maxDist,
                this.padY + (dy / dist) * this.maxDist
            );
        } else if (dist > 3) {
            this.joystick.x = dx / this.maxDist;
            this.joystick.y = dy / this.maxDist;
            this.joystickThumb.setPosition(px, py);
        } else {
            this.joystick.x = 0;
            this.joystick.y = 0;
            this.joystickThumb.setPosition(this.padX, this.padY);
        }
    }

    _resetJoystick() {
        this.joystick.active = false;
        this.joystick.x = 0;
        this.joystick.y = 0;
        this.pointerId = null;

        // Hide joystick
        this.joystickGlow.setVisible(false);
        this.joystickBase.setVisible(false);
        this.joystickThumb.setVisible(false);
    }

    _createButtons() {
        const btnR = uv(22);
        const btnX = GAME_WIDTH - uv(45);

        // Status button
        const statusBtn = this.scene.add.circle(btnX, uv(90), btnR, 0x333355, 0.5)
            .setDepth(600).setScrollFactor(0)
            .setStrokeStyle(2, 0x5555aa, 0.6)
            .setInteractive();

        this.scene.add.text(btnX, uv(90), '상태', {
            fontSize: fs(11), fontFamily: 'Arial', fontStyle: 'bold', color: '#bbbbee',
        }).setOrigin(0.5).setDepth(601).setScrollFactor(0);

        statusBtn.on('pointerdown', () => {
            if (this.scene.statusWindow) this.scene.statusWindow.toggle();
        });

        // Sound button
        const soundBtn = this.scene.add.circle(btnX, uv(145), btnR, 0x333355, 0.5)
            .setDepth(600).setScrollFactor(0)
            .setStrokeStyle(2, 0x5555aa, 0.6)
            .setInteractive();

        this.soundBtnText = this.scene.add.text(btnX, uv(145), 'SND', {
            fontSize: fs(11), fontFamily: 'Arial', fontStyle: 'bold', color: '#bbbbee',
        }).setOrigin(0.5).setDepth(601).setScrollFactor(0);

        soundBtn.on('pointerdown', () => {
            if (this.scene.soundManager) {
                const enabled = this.scene.soundManager.toggleSound();
                this.soundBtnText.setText(enabled ? 'SND' : 'MUTE');
            }
        });
    }

    getJoystickState() {
        if (!this.isMobile || !this.joystick.active) return null;

        const mag = Math.sqrt(this.joystick.x * this.joystick.x + this.joystick.y * this.joystick.y);
        if (mag < this.deadZone) return { x: 0, y: 0 };

        // Remap: dead zone~1.0 → 0~1.0 for smooth start
        const remapped = (mag - this.deadZone) / (1.0 - this.deadZone);
        const clamped = Math.min(remapped, 1.0);
        return {
            x: (this.joystick.x / mag) * clamped,
            y: (this.joystick.y / mag) * clamped,
        };
    }

    destroy() {}
}
