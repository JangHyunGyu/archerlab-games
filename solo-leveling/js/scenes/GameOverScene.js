import {
    GAME_WIDTH, GAME_HEIGHT,
    RANKS,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, drawSystemPanel,
} from '../utils/Constants.js';
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
        this.gameScore = time;

        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, SYSTEM.BG_DEEP, 0.96);
        this._drawScanlines();

        this._showNameInput(time, level, rank, kills, shadowCount);

        this.cameras.main.fadeIn(500, 0, 0, 0);

        this.events.once('shutdown', this._cleanupNameInput, this);
    }

    _drawScanlines() {
        const g = this.add.graphics();
        g.lineStyle(1, SYSTEM.SCAN_LINE, 0.45);
        for (let y = 0; y < GAME_HEIGHT; y += 3) g.lineBetween(0, y, GAME_WIDTH, y);
    }

    _showNameInput(time, level, rank, kills, shadowCount) {
        this._cleanupNameInput();
        const cx = GAME_WIDTH / 2;
        const depth = 100;
        const nameElements = [];
        const isVictory = this.finalData.victory;

        // System tag
        const tag = this.add.text(cx, GAME_HEIGHT * 0.12, isVictory ? '[ SYSTEM · CLEAR ]' : '[ SYSTEM · FAILED ]', {
            fontSize: fs(12), fontFamily: UI_FONT_MONO,
            color: isVictory ? SYSTEM.TEXT_GOLD : SYSTEM.TEXT_RED,
        }).setOrigin(0.5).setDepth(depth);
        nameElements.push(tag);

        const title = this.add.text(cx, GAME_HEIGHT * 0.18, t('nameInputTitle'), {
            fontSize: fs(22), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
        }).setOrigin(0.5).setDepth(depth);
        nameElements.push(title);

        const min = Math.floor(time / 60).toString().padStart(2, '0');
        const sec = (time % 60).toString().padStart(2, '0');
        const scoreDisp = this.add.text(cx, GAME_HEIGHT * 0.24,
            `▷ ${t('timeLabel')} ${min}:${sec}   ·   LV ${String(level).padStart(2, '0')}   ·   KILL ${kills}`, {
            fontSize: fs(13), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
        }).setOrigin(0.5).setDepth(depth);
        nameElements.push(scoreDisp);

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
            font-size: 15px;
            font-family: "Courier New", Consolas, "Noto Sans KR", "Malgun Gothic", sans-serif;
            background: rgba(8, 12, 22, 0.95);
            border: 1px solid #4dd2ff;
            border-radius: 0;
            color: #d9f4ff;
            text-align: center;
            outline: none;
            z-index: 10000;
            letter-spacing: 1px;
        `;
        const lastName = localStorage.getItem('shadow_player_name') || '';
        input.value = lastName;
        document.body.appendChild(input);
        this._nameInput = input;
        this._nameInputFocusTimer = setTimeout(() => {
            this._nameInputFocusTimer = null;
            if (input.parentNode) input.focus();
        }, 100);

        const submitBtnY = GAME_HEIGHT * 0.52;
        const btnW = uv(130);
        const btnH = uv(42);
        const submit = this._makeButton(cx - uv(75) - btnW / 2, submitBtnY - btnH / 2, btnW, btnH, {
            label: t('submitScore'),
            labelColor: SYSTEM.TEXT_BRIGHT,
            border: SYSTEM.BORDER,
            labelSize: 13,
            labelFont: UI_FONT_MONO,
            depth,
            onClick: () => doSubmit(),
        });
        const skip = this._makeButton(cx + uv(75) - btnW / 2, submitBtnY - btnH / 2, btnW, btnH, {
            label: t('skipScore'),
            labelColor: SYSTEM.TEXT_MUTED,
            border: SYSTEM.BORDER_DIM,
            labelSize: 13,
            labelFont: UI_FONT_MONO,
            depth,
            onClick: () => doSkip(),
        });
        nameElements.push(submit.g, submit.hit, submit.txt, skip.g, skip.hit, skip.txt);

        const cleanup = () => {
            this._cleanupNameInput();
            nameElements.forEach(el => { if (el && el.active) el.destroy(); });
        };

        const showStats = () => this._showStats(time, level, rank, kills, shadowCount);

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

        const doSkip = () => { cleanup(); showStats(); };

        this.input.keyboard.enabled = false;
        this._nameInputKeydownHandler = (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') doSubmit();
            if (e.key === 'Escape') doSkip();
        };
        input.addEventListener('keydown', this._nameInputKeydownHandler);
    }

    _cleanupNameInput() {
        if (this._nameInputFocusTimer) {
            clearTimeout(this._nameInputFocusTimer);
            this._nameInputFocusTimer = null;
        }
        if (this._nameInput) {
            if (this._nameInputKeydownHandler) {
                this._nameInput.removeEventListener('keydown', this._nameInputKeydownHandler);
            }
            if (this._nameInput.parentNode) {
                this._nameInput.parentNode.removeChild(this._nameInput);
            }
        }
        if (this.input?.keyboard) this.input.keyboard.enabled = true;
        this._nameInput = null;
        this._nameInputKeydownHandler = null;
    }

    _showStats(time, level, rank, kills, shadowCount) {
        const cx = GAME_WIDTH / 2;
        const isVictory = this.finalData.victory;

        // System tag
        this.add.text(cx, GAME_HEIGHT * 0.09,
            isVictory ? '[ SYSTEM · DUNGEON CLEAR ]' : '[ SYSTEM · HUNTER K.I.A. ]', {
            fontSize: fs(12), fontFamily: UI_FONT_MONO,
            color: isVictory ? SYSTEM.TEXT_GOLD : SYSTEM.TEXT_RED,
        }).setOrigin(0.5);

        const titleText = isVictory ? t('victoryTitle') : 'GAME  OVER';
        const titleObj = this.add.text(cx, GAME_HEIGHT * 0.16, titleText, {
            fontSize: fs(44), fontFamily: UI_FONT_KR, fontStyle: 'bold',
            color: isVictory ? SYSTEM.TEXT_GOLD : SYSTEM.TEXT_RED,
            stroke: '#000000', strokeThickness: 3, letterSpacing: 4,
        }).setOrigin(0.5);
        const titleMaxW = GAME_WIDTH - uv(40);
        if (titleObj.width > titleMaxW) titleObj.setScale(titleMaxW / titleObj.width);

        const ulG = this.add.graphics();
        ulG.lineStyle(1, isVictory ? SYSTEM.BORDER_GOLD : SYSTEM.BORDER_WARN, 0.6);
        ulG.lineBetween(cx - uv(160), GAME_HEIGHT * 0.22, cx + uv(160), GAME_HEIGHT * 0.22);

        this.add.text(cx, GAME_HEIGHT * 0.25, isVictory ? t('victorySub') : t('huntOver'), {
            fontSize: fs(13), fontFamily: UI_FONT_MONO,
            color: isVictory ? SYSTEM.TEXT_CYAN : SYSTEM.TEXT_MUTED,
            letterSpacing: 2,
        }).setOrigin(0.5);

        // Stats card — angular panel
        const cardW = uv(420);
        const cardH = uv(280);
        const cardX = cx - cardW / 2;
        const cardY = GAME_HEIGHT * 0.52 - cardH / 2;
        const cardG = this.add.graphics();
        drawSystemPanel(cardG, cardX, cardY, cardW, cardH, {
            cut: uv(14),
            fill: SYSTEM.BG_PANEL, fillAlpha: 0.92,
            border: isVictory ? SYSTEM.BORDER_GOLD : SYSTEM.BORDER,
            borderAlpha: 0.9, borderWidth: 1,
        });

        // Card header tag
        this.add.text(cardX + uv(18), cardY - uv(9), '  RESULT  ', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
            backgroundColor: '#05070d', padding: { left: 6, right: 6, top: 1, bottom: 1 },
        });

        const min = Math.floor(time / 60).toString().padStart(2, '0');
        const sec = (time % 60).toString().padStart(2, '0');
        const rankData = RANKS[rank];
        const rankColor = '#' + rankData.color.toString(16).padStart(6, '0');

        const stats = [
            { label: t('scoreLabel'), value: String(time).padStart(4, '0'), color: SYSTEM.TEXT_GOLD },
            { label: t('timeLabel'), value: `${min}:${sec}`, color: SYSTEM.TEXT_BRIGHT },
            { label: t('levelLabel'), value: 'LV. ' + String(level).padStart(2, '0'), color: SYSTEM.TEXT_BRIGHT },
            { label: t('rankLabel'), value: rankData.name + ' - RANK', color: rankColor },
            { label: t('killLabel'), value: String(kills).padStart(4, '0'), color: '#ff9966' },
            { label: t('shadowLabel'), value: String(shadowCount).padStart(2, '0') + (t('statUnit') || ''), color: SYSTEM.TEXT_CYAN },
        ];

        const rowH = uv(38);
        const innerPad = uv(28);
        const firstY = cardY + uv(40);
        stats.forEach((stat, i) => {
            const y = firstY + i * rowH;
            this.add.text(cardX + innerPad, y, '▸ ' + stat.label, {
                fontSize: fs(13), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN_DIM,
            }).setOrigin(0, 0);
            this.add.text(cardX + cardW - innerPad, y, stat.value, {
                fontSize: fs(16), fontFamily: UI_FONT_MONO, fontStyle: 'bold', color: stat.color,
            }).setOrigin(1, 0);
        });

        // Retry button
        const retryW = uv(220);
        const retryH = uv(50);
        const retryY = GAME_HEIGHT * 0.72 - retryH / 2;
        const retryBtn = this._makeButton(cx - retryW / 2, retryY, retryW, retryH, {
            label: `▶   ${t('retry')}`,
            labelColor: SYSTEM.TEXT_BRIGHT,
            border: SYSTEM.BORDER,
            labelSize: 17,
            labelFont: UI_FONT_KR,
            onClick: () => {
                if (this._transitioning) return;
                this._transitioning = true;
                retryBtn.hit.disableInteractive();
                this._showTransition(t('loading'));
                this.cameras.main.fadeOut(500, 0, 0, 0);
                this.time.delayedCall(500, () => this.scene.start('GameScene'));
            },
        });

        // Menu button
        const menuW = uv(200);
        const menuH = uv(40);
        const menuY = GAME_HEIGHT * 0.81 - menuH / 2;
        const menuBtn = this._makeButton(cx - menuW / 2, menuY, menuW, menuH, {
            label: t('toMenu'),
            labelColor: SYSTEM.TEXT_MUTED,
            border: SYSTEM.BORDER_DIM,
            labelSize: 13,
            labelFont: UI_FONT_MONO,
            onClick: () => {
                if (this._transitioning) return;
                this._transitioning = true;
                menuBtn.hit.disableInteractive();
                this._showTransition(t('loading'));
                this.cameras.main.fadeOut(500, 0, 0, 0);
                this.time.delayedCall(500, () => this.scene.start('MenuScene'));
            },
        });
    }

    _makeButton(x, y, w, h, { label, labelColor, border, labelSize = 16, labelFont = UI_FONT_KR, depth = 0, onClick }) {
        const g = this.add.graphics().setDepth(depth);
        const redraw = (hover) => {
            g.clear();
            drawSystemPanel(g, x, y, w, h, {
                cut: uv(8),
                fill: hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL,
                fillAlpha: hover ? 0.95 : 0.85,
                border, borderAlpha: 1,
                borderWidth: hover ? 2 : 1,
            });
        };
        redraw(false);
        const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
            .setDepth(depth).setInteractive({ useHandCursor: true });
        const txt = this.add.text(x + w / 2, y + h / 2, label, {
            fontSize: fs(labelSize), fontFamily: labelFont, fontStyle: 'bold',
            color: labelColor, letterSpacing: 1,
        }).setOrigin(0.5).setDepth(depth + 1);
        hit.on('pointerover', () => { redraw(true); txt.setScale(1.02); });
        hit.on('pointerout', () => { redraw(false); txt.setScale(1); });
        hit.on('pointerdown', () => onClick && onClick());
        return { g, hit, txt };
    }

    _showTransition(message) {
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;

        this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, SYSTEM.BG_DEEP, 0.75)
            .setDepth(200).setScrollFactor(0);

        const base = '▷  ' + (message || 'LOADING');
        const txt = this.add.text(cx, cy, base, {
            fontSize: fs(17), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN,
        }).setOrigin(0.5).setDepth(201).setScrollFactor(0);

        let n = 0;
        this.time.addEvent({
            delay: 380, loop: true,
            callback: () => { n = (n + 1) % 4; txt.setText(base + '.'.repeat(n)); },
        });
        this.tweens.add({
            targets: txt, alpha: { from: 1, to: 0.45 },
            duration: 600, yoyo: true, repeat: -1,
        });
    }
}
