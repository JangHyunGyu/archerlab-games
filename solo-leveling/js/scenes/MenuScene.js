import { GAME_WIDTH, GAME_HEIGHT, COLORS, fs, uv } from '../utils/Constants.js';
import { SoundManager } from '../managers/SoundManager.js';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        // Background particles
        this.bgParticles = [];
        for (let i = 0; i < 50; i++) {
            const p = this.add.circle(
                Phaser.Math.Between(0, GAME_WIDTH),
                Phaser.Math.Between(0, GAME_HEIGHT),
                Phaser.Math.Between(1, 3),
                COLORS.SHADOW_PRIMARY,
                Phaser.Math.FloatBetween(0.1, 0.4)
            );
            this.bgParticles.push({
                obj: p,
                speed: Phaser.Math.FloatBetween(0.2, 0.8),
            });
        }

        // Title glow
        const titleGlow = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.23, '나혼자레벨업', {
            fontSize: fs(64),
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            color: '#7b2fff',
        }).setOrigin(0.5).setAlpha(0.3).setScale(1.05);

        // Title
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.23, '나혼자레벨업', {
            fontSize: fs(64),
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.33, 'S U R V I V O R S', {
            fontSize: fs(28),
            fontFamily: 'Arial, sans-serif',
            letterSpacing: 8,
            color: '#b366ff',
        }).setOrigin(0.5);

        // Shadow Monarch emblem
        const g = this.add.graphics();
        g.lineStyle(2, COLORS.SHADOW_PRIMARY, 0.6);
        g.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT * 0.5, uv(60));
        g.lineStyle(1, COLORS.SHADOW_GLOW, 0.3);
        g.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT * 0.5, uv(70));

        // "ARISE" text inside emblem
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.5, 'ARISE', {
            fontSize: fs(20),
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            color: '#b366ff',
        }).setOrigin(0.5);

        // Start button
        const startBtn = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.65, uv(250), uv(55), 0x4a1a8a, 0.8)
            .setStrokeStyle(2, COLORS.SHADOW_GLOW)
            .setInteractive({ useHandCursor: true });

        const startText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.65, '게임 시작', {
            fontSize: fs(24),
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        startBtn.on('pointerover', () => {
            startBtn.setFillStyle(0x6b2fbf, 0.9);
            startText.setScale(1.05);
        });
        startBtn.on('pointerout', () => {
            startBtn.setFillStyle(0x4a1a8a, 0.8);
            startText.setScale(1);
        });
        startBtn.on('pointerdown', () => {
            // Initialize audio on first user interaction (browsers require user gesture)
            if (!this.game._soundManager) {
                this.game._soundManager = new SoundManager();
                this.game._soundManager.init();
            }
            this.game._soundManager.resume();

            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.time.delayedCall(500, () => this.scene.start('GameScene'));
        });

        // Controls info - detect mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        if (isMobile) {
            this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.77, '화면 왼쪽을 터치 & 드래그하여 이동', {
                fontSize: fs(16),
                fontFamily: 'Arial, sans-serif',
                fontStyle: 'bold',
                color: '#8888bb',
            }).setOrigin(0.5);

            this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.81, '공격은 자동 | 적을 처치하고 레벨업하세요', {
                fontSize: fs(14),
                fontFamily: 'Arial, sans-serif',
                color: '#666688',
            }).setOrigin(0.5);
        } else {
            this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.78, 'WASD / 방향키로 이동  |  자동 공격  |  TAB: 상태창  |  M: 사운드', {
                fontSize: fs(14),
                fontFamily: 'Arial, sans-serif',
                color: '#666688',
            }).setOrigin(0.5);

            this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.82, '적을 처치하고 경험치를 모아 스킬을 강화하세요', {
                fontSize: fs(14),
                fontFamily: 'Arial, sans-serif',
                color: '#666688',
            }).setOrigin(0.5);
        }

        // Pulsing title glow
        this.tweens.add({
            targets: titleGlow,
            alpha: { from: 0.15, to: 0.4 },
            scaleX: { from: 1.03, to: 1.07 },
            scaleY: { from: 1.03, to: 1.07 },
            duration: 2000,
            yoyo: true,
            repeat: -1,
        });

        this.cameras.main.fadeIn(500, 0, 0, 0);
    }

    update() {
        for (const p of this.bgParticles) {
            p.obj.y -= p.speed;
            if (p.obj.y < -10) {
                p.obj.y = GAME_HEIGHT + 10;
                p.obj.x = Phaser.Math.Between(0, GAME_WIDTH);
            }
        }
    }
}
