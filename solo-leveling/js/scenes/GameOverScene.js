import { GAME_WIDTH, GAME_HEIGHT, COLORS, RANKS, fs, uv } from '../utils/Constants.js';
import { t, GAME_API_URL, GAME_ID_SHADOW } from '../utils/i18n.js';

export class GameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameOverScene' });
    }

    init(data) {
        this.finalData = data;
    }

    create() {
        const { level, rank, kills, time, shadowCount } = this.finalData;

        // Calculate score: survival time in seconds (primary score for ranking)
        this.gameScore = time;

        // Dark background
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0a1a, 0.95);

        // Show name input first, then stats
        this._showNameInput(time, level, rank, kills, shadowCount);

        this.cameras.main.fadeIn(500, 0, 0, 0);
    }

    _showNameInput(time, level, rank, kills, shadowCount) {
        const cx = GAME_WIDTH / 2;
        const depth = 100;
        const nameElements = [];

        // Title
        const nTitle = this.add.text(cx, GAME_HEIGHT * 0.15, `🏆 ${t('nameInputTitle')}`, {
            fontSize: fs(24), fontFamily: 'Arial', fontStyle: 'bold', color: '#ffd700',
        }).setOrigin(0.5).setDepth(depth);
        nameElements.push(nTitle);

        // Score display
        const min = Math.floor(time / 60).toString().padStart(2, '0');
        const sec = (time % 60).toString().padStart(2, '0');
        const scoreDisp = this.add.text(cx, GAME_HEIGHT * 0.23, `${t('timeLabel')}: ${min}:${sec}  |  Lv.${level}  |  ${kills} ${t('killLabel')}`, {
            fontSize: fs(14), fontFamily: 'Arial', color: '#b366ff',
        }).setOrigin(0.5).setDepth(depth);
        nameElements.push(scoreDisp);

        // HTML input
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 20;
        input.placeholder = t('enterName');
        input.style.cssText = `
            position: fixed;
            left: 50%;
            top: 38%;
            transform: translate(-50%, -50%);
            width: 240px;
            padding: 10px 14px;
            font-size: 16px;
            font-family: 'Noto Sans KR', 'Noto Sans JP', Arial, sans-serif;
            background: #1a1a40;
            border: 2px solid #FFD600;
            border-radius: 8px;
            color: #ffffff;
            text-align: center;
            outline: none;
            z-index: 10000;
        `;
        const lastName = localStorage.getItem('shadow_player_name') || '';
        input.value = lastName;
        document.body.appendChild(input);
        setTimeout(() => input.focus(), 100);

        // Submit button
        const submitBtnY = GAME_HEIGHT * 0.52;
        const submitBtn = this.add.rectangle(cx - uv(70), submitBtnY, uv(120), uv(40), 0xFFD600, 1)
            .setDepth(depth).setInteractive({ useHandCursor: true });
        const submitText = this.add.text(cx - uv(70), submitBtnY, t('submitScore'), {
            fontSize: fs(14), fontFamily: 'Arial', fontStyle: 'bold', color: '#000000',
        }).setOrigin(0.5).setDepth(depth + 1);
        nameElements.push(submitBtn, submitText);

        // Skip button
        const skipBtn = this.add.rectangle(cx + uv(70), submitBtnY, uv(120), uv(40), 0x2a2a4e, 0.8)
            .setStrokeStyle(1, 0x4a4a6e).setDepth(depth).setInteractive({ useHandCursor: true });
        const skipText = this.add.text(cx + uv(70), submitBtnY, t('skipScore'), {
            fontSize: fs(14), fontFamily: 'Arial', color: '#8888aa',
        }).setOrigin(0.5).setDepth(depth + 1);
        nameElements.push(skipBtn, skipText);

        const cleanup = () => {
            if (input.parentNode) input.parentNode.removeChild(input);
            nameElements.forEach(el => { if (el && el.active) el.destroy(); });
        };

        const showStats = () => {
            this._showStats(time, level, rank, kills, shadowCount);
        };

        const doSubmit = async () => {
            const name = input.value.trim().slice(0, 20);
            if (!name) { input.focus(); return; }
            localStorage.setItem('shadow_player_name', name);
            cleanup();
            try {
                await fetch(`${GAME_API_URL}/rankings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        game_id: GAME_ID_SHADOW,
                        player_name: name,
                        score: time,
                        extra_data: { level, rank, kills, shadowCount },
                    }),
                });
            } catch (e) { /* silent */ }
            showStats();
        };

        const doSkip = () => {
            cleanup();
            showStats();
        };

        submitBtn.on('pointerover', () => submitBtn.setFillStyle(0xffe44d, 1));
        submitBtn.on('pointerout', () => submitBtn.setFillStyle(0xFFD600, 1));
        submitBtn.on('pointerdown', doSubmit);

        skipBtn.on('pointerover', () => skipBtn.setFillStyle(0x3a3a5e, 0.9));
        skipBtn.on('pointerout', () => skipBtn.setFillStyle(0x2a2a4e, 0.8));
        skipBtn.on('pointerdown', doSkip);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSubmit();
            if (e.key === 'Escape') doSkip();
        });
    }

    _showStats(time, level, rank, kills, shadowCount) {
        const cx = GAME_WIDTH / 2;

        // Title
        this.add.text(cx, GAME_HEIGHT * 0.13, 'GAME OVER', {
            fontSize: fs(48), fontFamily: 'Arial', fontStyle: 'bold',
            color: '#ff3333', stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5);

        // You died text
        this.add.text(cx, GAME_HEIGHT * 0.2, t('huntOver'), {
            fontSize: fs(18), fontFamily: 'Arial',
            color: '#888888',
        }).setOrigin(0.5);

        // Stats card
        const cardY = GAME_HEIGHT * 0.42;
        this.add.rectangle(cx, cardY, uv(400), uv(280), 0x1a1a3e, 0.9)
            .setStrokeStyle(2, COLORS.SHADOW_DARK);

        // Format time
        const min = Math.floor(time / 60).toString().padStart(2, '0');
        const sec = (time % 60).toString().padStart(2, '0');

        const rankData = RANKS[rank];
        const rankColor = '#' + rankData.color.toString(16).padStart(6, '0');

        const stats = [
            { label: t('timeLabel'), value: `${min}:${sec}`, color: '#ffffff' },
            { label: t('levelLabel'), value: `Lv.${level}`, color: '#ffffff' },
            { label: t('rankLabel'), value: rankData.label, color: rankColor },
            { label: t('killLabel'), value: `${kills}`, color: '#ff6644' },
            { label: t('shadowLabel'), value: `${shadowCount}${t('statUnit') ? t('statUnit') : ''}`, color: COLORS.TEXT_PURPLE },
        ];

        stats.forEach((stat, i) => {
            const y = cardY - uv(100) + i * uv(45);
            this.add.text(cx - uv(120), y, stat.label, {
                fontSize: fs(16), fontFamily: 'Arial',
                color: '#888888',
            }).setDepth(1);

            this.add.text(cx + uv(120), y, stat.value, {
                fontSize: fs(20), fontFamily: 'Arial', fontStyle: 'bold',
                color: stat.color,
            }).setOrigin(1, 0).setDepth(1);
        });

        // Retry button
        const retryBtnY = GAME_HEIGHT * 0.68;
        const retryBtn = this.add.rectangle(cx, retryBtnY, uv(200), uv(50), 0x4a1a8a, 0.9)
            .setStrokeStyle(2, COLORS.SHADOW_GLOW)
            .setInteractive({ useHandCursor: true });

        this.add.text(cx, retryBtnY, t('retry'), {
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
        const menuBtn = this.add.rectangle(cx, menuBtnY, uv(200), uv(40), 0x2a2a4e, 0.7)
            .setStrokeStyle(1, 0x4a4a6e)
            .setInteractive({ useHandCursor: true });

        this.add.text(cx, menuBtnY, t('toMenu'), {
            fontSize: fs(16), fontFamily: 'Arial',
            color: '#aaaacc',
        }).setOrigin(0.5);

        menuBtn.on('pointerover', () => menuBtn.setFillStyle(0x3a3a5e, 0.8));
        menuBtn.on('pointerout', () => menuBtn.setFillStyle(0x2a2a4e, 0.7));
        menuBtn.on('pointerdown', () => {
            this.cameras.main.fadeOut(300, 0, 0, 0);
            this.time.delayedCall(300, () => this.scene.start('MenuScene'));
        });
    }
}
