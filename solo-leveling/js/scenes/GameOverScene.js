import { GAME_WIDTH, GAME_HEIGHT, COLORS, RANKS, fs, uv } from '../utils/Constants.js';

export class GameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameOverScene' });
    }

    init(data) {
        this.finalData = data;
    }

    create() {
        const { level, rank, kills, time, shadowCount } = this.finalData;

        // Dark background
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0a1a, 0.95);

        // Title
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.13, 'GAME OVER', {
            fontSize: fs(48), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#ff3333', stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5);

        // You died text
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.2, '사냥은 끝났다...', {
            fontSize: fs(18), fontFamily: 'Arial',
            color: '#888888',
        }).setOrigin(0.5);

        // Stats card
        const cardY = GAME_HEIGHT * 0.42;
        this.add.rectangle(GAME_WIDTH / 2, cardY, uv(400), uv(280), 0x1a1a3e, 0.9)
            .setStrokeStyle(2, COLORS.SHADOW_DARK);

        // Format time
        const min = Math.floor(time / 60).toString().padStart(2, '0');
        const sec = (time % 60).toString().padStart(2, '0');

        const rankData = RANKS[rank];
        const rankColor = '#' + rankData.color.toString(16).padStart(6, '0');

        const stats = [
            { label: '생존 시간', value: `${min}:${sec}`, color: '#ffffff' },
            { label: '레벨', value: `Lv.${level}`, color: '#ffffff' },
            { label: '랭크', value: rankData.label, color: rankColor },
            { label: '처치 수', value: `${kills}`, color: '#ff6644' },
            { label: '그림자 군단', value: `${shadowCount}마리`, color: COLORS.TEXT_PURPLE },
        ];

        stats.forEach((stat, i) => {
            const y = cardY - uv(100) + i * uv(45);
            this.add.text(GAME_WIDTH / 2 - uv(120), y, stat.label, {
                fontSize: fs(16), fontFamily: 'Arial',
                color: '#888888',
            }).setDepth(1);

            this.add.text(GAME_WIDTH / 2 + uv(120), y, stat.value, {
                fontSize: fs(20), fontFamily: 'Arial', fontStyle: 'bold',
                color: stat.color,
            }).setOrigin(1, 0).setDepth(1);
        });

        // Retry button
        const retryBtnY = GAME_HEIGHT * 0.68;
        const retryBtn = this.add.rectangle(GAME_WIDTH / 2, retryBtnY, uv(200), uv(50), 0x4a1a8a, 0.9)
            .setStrokeStyle(2, COLORS.SHADOW_GLOW)
            .setInteractive({ useHandCursor: true });

        this.add.text(GAME_WIDTH / 2, retryBtnY, '다시 도전', {
            fontSize: fs(20), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        retryBtn.on('pointerover', () => retryBtn.setFillStyle(0x6b2fbf, 0.9));
        retryBtn.on('pointerout', () => retryBtn.setFillStyle(0x4a1a8a, 0.9));
        retryBtn.on('pointerdown', () => {
            this.cameras.main.fadeOut(300, 0, 0, 0);
            this.time.delayedCall(300, () => this.scene.start('GameScene'));
        });

        // Menu button
        const menuBtnY = GAME_HEIGHT * 0.76;
        const menuBtn = this.add.rectangle(GAME_WIDTH / 2, menuBtnY, uv(200), uv(40), 0x2a2a4e, 0.7)
            .setStrokeStyle(1, 0x4a4a6e)
            .setInteractive({ useHandCursor: true });

        this.add.text(GAME_WIDTH / 2, menuBtnY, '메뉴로', {
            fontSize: fs(16), fontFamily: 'Arial',
            color: '#aaaacc',
        }).setOrigin(0.5);

        menuBtn.on('pointerover', () => menuBtn.setFillStyle(0x3a3a5e, 0.8));
        menuBtn.on('pointerout', () => menuBtn.setFillStyle(0x2a2a4e, 0.7));
        menuBtn.on('pointerdown', () => {
            this.cameras.main.fadeOut(300, 0, 0, 0);
            this.time.delayedCall(300, () => this.scene.start('MenuScene'));
        });

        this.cameras.main.fadeIn(500, 0, 0, 0);
    }
}
