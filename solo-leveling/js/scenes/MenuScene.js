import {
    GAME_WIDTH, GAME_HEIGHT,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, drawSystemPanel,
} from '../utils/Constants.js';
import { SoundManager } from '../managers/SoundManager.js';
import { t, LANG, LANGUAGES, setLang, GAME_API_URL, GAME_ID_SHADOW } from '../utils/i18n.js';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        const alLink = document.getElementById('archerlab-link');
        if (alLink) alLink.style.display = '';

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        this._modalElements = [];
        this._dropdownElements = [];

        // Deep background + scanlines
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, SYSTEM.BG_DEEP);
        this._drawBackdrop();

        const centerX = GAME_WIDTH / 2;

        // ── Top status line ─────────────────────
        const topY = uv(22);
        const sysTxt = this.add.text(uv(22), topY, '[ SYSTEM · ONLINE ]', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
        });
        const cursor = this.add.text(uv(22) + sysTxt.width + 2, topY, '▋', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
        });
        this.tweens.add({ targets: cursor, alpha: { from: 1, to: 0.25 }, duration: 600, yoyo: true, repeat: -1 });

        const topLine = this.add.graphics();
        topLine.lineStyle(1, SYSTEM.BORDER, 0.35);
        topLine.lineBetween(uv(18), topY + uv(18), GAME_WIDTH - uv(140), topY + uv(18));

        // ── Title block ─────────────────────────
        const titleSize = isMobile ? 42 : 60;
        const titleY = isMobile ? GAME_HEIGHT * 0.17 : GAME_HEIGHT * 0.20;
        const titleText = this.add.text(centerX, titleY, t('title'), {
            fontSize: fs(titleSize),
            fontFamily: UI_FONT_KR,
            fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
        }).setOrigin(0.5);

        const uw = titleText.width;
        const ulG = this.add.graphics();
        ulG.lineStyle(2, SYSTEM.BORDER, 1);
        const ulY = titleY + titleText.height / 2 + uv(6);
        ulG.lineBetween(centerX - uw / 2, ulY, centerX + uw / 2, ulY);
        ulG.lineStyle(1, SYSTEM.BORDER_DIM, 0.55);
        ulG.lineBetween(centerX - uw / 2 - uv(24), ulY + uv(4), centerX + uw / 2 + uv(24), ulY + uv(4));

        this.add.text(centerX, ulY + uv(18), 'S H A D O W   ·   S U R V I V A L', {
            fontSize: fs(isMobile ? 12 : 13),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN_DIM,
            letterSpacing: 2,
        }).setOrigin(0.5);

        // ── System notification panel ──────────
        const panelW = isMobile ? Math.min(uv(340), GAME_WIDTH - uv(40)) : uv(480);
        const panelH = uv(106);
        const panelX = centerX - panelW / 2;
        const panelY = isMobile ? GAME_HEIGHT * 0.36 : GAME_HEIGHT * 0.40;
        const panelG = this.add.graphics();
        drawSystemPanel(panelG, panelX, panelY, panelW, panelH, {
            cut: uv(10),
            fill: SYSTEM.BG_PANEL, fillAlpha: 0.9,
            border: SYSTEM.BORDER, borderAlpha: 0.9, borderWidth: 1,
        });

        // Panel header tag
        const headerLabel = ' SYSTEM · NOTICE ';
        const headerTxt = this.add.text(panelX + uv(18), panelY - uv(9), headerLabel, {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
            backgroundColor: '#05070d', padding: { left: 6, right: 6, top: 1, bottom: 1 },
        });

        // Messages (typewriter)
        const msgs = [
            '▷ 플레이어 감지됨 ── 재야의 헌터',
            '▷ 등급 평가: E - RANK',
            '▷ 던전 균열 확인 ── 입장하시겠습니까?',
        ];
        const msgEls = msgs.map((m, i) =>
            this.add.text(panelX + uv(22), panelY + uv(16) + i * uv(24), '', {
                fontSize: fs(isMobile ? 13 : 14),
                fontFamily: UI_FONT_KR,
                color: SYSTEM.TEXT_BRIGHT,
            })
        );
        msgs.forEach((m, i) => {
            this.time.delayedCall(250 + i * 420, () => this._typewrite(msgEls[i], m));
        });

        // ── Main action button ──────────────────
        const btnW = uv(isMobile ? 230 : 260);
        const btnH = uv(52);
        const startY = isMobile ? GAME_HEIGHT * 0.62 : GAME_HEIGHT * 0.65;
        this._makeButton(centerX - btnW / 2, startY - btnH / 2, btnW, btnH, {
            label: `▶   ${t('startGame')}`,
            labelColor: SYSTEM.TEXT_BRIGHT,
            border: SYSTEM.BORDER,
            labelSize: isMobile ? 17 : 19,
            labelFont: UI_FONT_KR,
            onClick: async () => {
                if (!this.game._soundManager) {
                    this.game._soundManager = new SoundManager();
                    this.game._soundManager.init();
                }
                const sm = this.game._soundManager;
                sm.stopIntroMusic();
                await sm.resume(true);
                this.cameras.main.fadeOut(500, 0, 0, 0);
                this.time.delayedCall(500, () => this.scene.start('GameScene'));
            },
        });

        // ── Hall of Fame (secondary) ────────────
        const hofW = uv(isMobile ? 180 : 200);
        const hofH = uv(36);
        const hofY = startY + btnH / 2 + uv(18);
        this._makeButton(centerX - hofW / 2, hofY, hofW, hofH, {
            label: t('hallOfFame'),
            labelColor: SYSTEM.TEXT_GOLD,
            border: SYSTEM.BORDER_GOLD,
            labelSize: 12,
            labelFont: UI_FONT_MONO,
            onClick: () => this._showHallOfFame(isMobile),
        });

        // ── Controls hint ──────────────────────
        const ctrlY = isMobile ? GAME_HEIGHT * 0.83 : GAME_HEIGHT * 0.82;
        const ctrl = isMobile
            ? `${t('controlsMobile')}   ·   ${t('controlsMobileAuto')}`
            : `${t('controlsPC')}   ·   ${t('controlsPC2')}`;
        this.add.text(centerX, ctrlY, ctrl, {
            fontSize: fs(isMobile ? 11 : 11),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_MUTED,
            align: 'center',
        }).setOrigin(0.5);

        // ── Footer ──────────────────────────────
        const footerY = isMobile ? GAME_HEIGHT * 0.93 : GAME_HEIGHT * 0.92;
        const contactBtn = this.add.text(centerX, footerY, `[ ${t('contact')} ]`, {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        contactBtn.on('pointerover', () => contactBtn.setColor(SYSTEM.TEXT_CYAN));
        contactBtn.on('pointerout', () => contactBtn.setColor(SYSTEM.TEXT_MUTED));
        contactBtn.on('pointerdown', () => this._showContactModal());

        this.add.text(centerX, footerY + uv(20), 'ArcherLab   ·   © 2026', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, color: '#3a4755',
        }).setOrigin(0.5);

        // ── Language selector (top-right) ──────
        this._createLanguageDropdown(isMobile);

        this.cameras.main.fadeIn(500, 0, 0, 0);

        this.events.on('shutdown', () => {
            this._dropdownElements.forEach(el => { if (el && el.active) el.destroy(); });
            this._dropdownElements = [];
            this._modalElements.forEach(el => { if (el && el.active) el.destroy(); });
            this._modalElements = [];
        });

        this.input.once('pointerdown', async () => {
            if (!this.game._soundManager) {
                this.game._soundManager = new SoundManager();
                this.game._soundManager.init();
            }
            const sm = this.game._soundManager;
            await sm.resume(true);
            sm.warmup();
            sm.playIntroMusic();
        });
    }

    _drawBackdrop() {
        const g = this.add.graphics();
        // Horizontal scanlines
        g.lineStyle(1, SYSTEM.SCAN_LINE, 0.55);
        for (let y = 0; y < GAME_HEIGHT; y += 3) g.lineBetween(0, y, GAME_WIDTH, y);
        // Faint vertical grid
        g.lineStyle(1, SYSTEM.BORDER, 0.04);
        for (let x = 0; x < GAME_WIDTH; x += 80) g.lineBetween(x, 0, x, GAME_HEIGHT);
        // Border bracket corners on the screen frame
        const pad = uv(10);
        const bracketLen = uv(16);
        g.lineStyle(2, SYSTEM.BORDER_DIM, 0.6);
        const corners = [
            [pad, pad, 1, 1],
            [GAME_WIDTH - pad, pad, -1, 1],
            [pad, GAME_HEIGHT - pad, 1, -1],
            [GAME_WIDTH - pad, GAME_HEIGHT - pad, -1, -1],
        ];
        corners.forEach(([x, y, sx, sy]) => {
            g.beginPath();
            g.moveTo(x, y + sy * bracketLen);
            g.lineTo(x, y);
            g.lineTo(x + sx * bracketLen, y);
            g.strokePath();
        });
    }

    _typewrite(textObj, str, charDelay = 22) {
        let i = 0;
        const step = () => {
            if (!textObj.active) return;
            textObj.setText(str.slice(0, i + 1));
            i++;
            if (i < str.length) this.time.delayedCall(charDelay, step);
        };
        step();
    }

    _makeButton(x, y, w, h, { label, labelColor, border, labelSize = 16, labelFont = UI_FONT_KR, onClick }) {
        const g = this.add.graphics();
        const redraw = (hover) => {
            g.clear();
            drawSystemPanel(g, x, y, w, h, {
                cut: uv(8),
                fill: hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL,
                fillAlpha: hover ? 0.95 : 0.8,
                border, borderAlpha: 1,
                borderWidth: hover ? 2 : 1,
            });
        };
        redraw(false);

        const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        const txt = this.add.text(x + w / 2, y + h / 2, label, {
            fontSize: fs(labelSize), fontFamily: labelFont, fontStyle: 'bold',
            color: labelColor, letterSpacing: 1,
        }).setOrigin(0.5);

        hit.on('pointerover', () => { redraw(true); txt.setScale(1.02); });
        hit.on('pointerout', () => { redraw(false); txt.setScale(1); });
        hit.on('pointerdown', () => onClick && onClick());
        return { g, hit, txt };
    }

    _createLanguageDropdown(isMobile) {
        const current = (LANGUAGES.find(l => l.code === LANG)?.code || 'ko').toUpperCase();
        const btnW = uv(isMobile ? 92 : 82);
        const btnH = uv(30);
        const btnX = GAME_WIDTH - btnW - uv(18);
        const btnY = uv(44);
        const depth = 50;

        const triggerG = this.add.graphics().setDepth(depth);
        const drawTrigger = (hover) => {
            triggerG.clear();
            drawSystemPanel(triggerG, btnX, btnY, btnW, btnH, {
                cut: uv(6),
                fill: hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL, fillAlpha: 0.9,
                border: SYSTEM.BORDER, borderAlpha: 0.85, borderWidth: 1,
            });
        };
        drawTrigger(false);

        const triggerHit = this.add.rectangle(btnX + btnW / 2, btnY + btnH / 2, btnW, btnH, 0x000000, 0)
            .setDepth(depth).setInteractive({ useHandCursor: true });
        const triggerText = this.add.text(btnX + btnW / 2, btnY + btnH / 2, `${current}  ▾`, {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
        }).setOrigin(0.5).setDepth(depth);

        const items = [];
        let open = false;

        const dismiss = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
            .setDepth(depth + 1).setInteractive().setVisible(false);

        LANGUAGES.forEach((lang, i) => {
            const itemY = btnY + btnH + uv(4) + i * (btnH + uv(2));
            const active = lang.code === LANG;
            const code = lang.code.toUpperCase();

            const itemG = this.add.graphics().setDepth(depth + 2).setVisible(false);
            const drawItem = (hover) => {
                itemG.clear();
                drawSystemPanel(itemG, btnX, itemY, btnW, btnH, {
                    cut: uv(6),
                    fill: hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL, fillAlpha: 0.96,
                    border: active ? SYSTEM.BORDER : SYSTEM.BORDER_DIM,
                    borderAlpha: active ? 1 : 0.75,
                    borderWidth: 1,
                });
            };
            drawItem(false);

            const itemHit = this.add.rectangle(btnX + btnW / 2, itemY + btnH / 2, btnW, btnH, 0x000000, 0)
                .setDepth(depth + 2).setInteractive({ useHandCursor: true }).setVisible(false);
            const itemText = this.add.text(btnX + btnW / 2, itemY + btnH / 2, `${code}`, {
                fontSize: fs(12), fontFamily: UI_FONT_MONO,
                color: active ? SYSTEM.TEXT_BRIGHT : SYSTEM.TEXT_CYAN_DIM,
            }).setOrigin(0.5).setDepth(depth + 2).setVisible(false);

            itemHit.on('pointerover', () => { drawItem(true); itemText.setColor(SYSTEM.TEXT_BRIGHT); });
            itemHit.on('pointerout', () => { drawItem(false); itemText.setColor(active ? SYSTEM.TEXT_BRIGHT : SYSTEM.TEXT_CYAN_DIM); });
            itemHit.on('pointerdown', () => {
                if (lang.code !== LANG) { setLang(lang.code); this.scene.restart(); }
                else closeDropdown();
            });
            items.push(itemG, itemHit, itemText);
        });

        const openDropdown = () => {
            open = true;
            dismiss.setVisible(true);
            drawTrigger(true);
            items.forEach(el => el.setVisible(true));
        };
        const closeDropdown = () => {
            open = false;
            dismiss.setVisible(false);
            drawTrigger(false);
            items.forEach(el => el.setVisible(false));
        };

        triggerHit.on('pointerover', () => drawTrigger(true));
        triggerHit.on('pointerout', () => { if (!open) drawTrigger(false); });
        triggerHit.on('pointerdown', () => { open ? closeDropdown() : openDropdown(); });
        dismiss.on('pointerdown', closeDropdown);

        this._dropdownElements.push(triggerG, triggerHit, triggerText, dismiss, ...items);
    }

    _showContactModal() {
        const elements = [];
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;

        const dim = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8)
            .setDepth(100).setInteractive();
        elements.push(dim);

        const boxW = uv(320);
        const boxH = uv(220);
        const bx = cx - boxW / 2;
        const by = cy - boxH / 2;
        const boxG = this.add.graphics().setDepth(101);
        drawSystemPanel(boxG, bx, by, boxW, boxH, {
            cut: uv(12),
            fill: SYSTEM.BG_PANEL, fillAlpha: 0.97,
            border: SYSTEM.BORDER, borderWidth: 1,
        });
        elements.push(boxG);

        const title = this.add.text(cx, by + uv(24), `[ ${t('contactTitle')} ]`, {
            fontSize: fs(14), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
        }).setOrigin(0.5).setDepth(102);
        elements.push(title);

        const desc = this.add.text(cx, by + uv(50), t('contactDesc'), {
            fontSize: fs(11), fontFamily: UI_FONT_KR, color: SYSTEM.TEXT_MUTED,
        }).setOrigin(0.5).setDepth(102);
        elements.push(desc);

        const mk = (y, label, onClick) => {
            const bw = boxW - uv(40);
            const bh = uv(36);
            const bxi = cx - bw / 2;
            const bg = this.add.graphics().setDepth(101);
            const redraw = (h) => {
                bg.clear();
                drawSystemPanel(bg, bxi, y, bw, bh, {
                    cut: uv(6),
                    fill: h ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL, fillAlpha: 0.9,
                    border: SYSTEM.BORDER, borderWidth: 1,
                });
            };
            redraw(false);
            const hit = this.add.rectangle(cx, y + bh / 2, bw, bh, 0x000000, 0)
                .setDepth(102).setInteractive({ useHandCursor: true });
            const txt = this.add.text(cx, y + bh / 2, label, {
                fontSize: fs(13), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_BRIGHT,
            }).setOrigin(0.5).setDepth(102);
            hit.on('pointerover', () => redraw(true));
            hit.on('pointerout', () => redraw(false));
            hit.on('pointerdown', onClick);
            elements.push(bg, hit, txt);
        };

        mk(by + uv(78), `▶   ${t('contactKakao')}`, () => window.open('https://open.kakao.com/o/pF6xil6h', '_blank'));
        mk(by + uv(122), `▶   ${t('contactEmail')}`, () => window.open('mailto:hyungyu@archerlab.dev'));

        const closeBtn = this.add.text(cx, by + boxH - uv(20), `[ ${t('close')} ]`, {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
        }).setOrigin(0.5).setDepth(102).setInteractive({ useHandCursor: true });
        elements.push(closeBtn);
        closeBtn.on('pointerover', () => closeBtn.setColor(SYSTEM.TEXT_CYAN));
        closeBtn.on('pointerout', () => closeBtn.setColor(SYSTEM.TEXT_MUTED));

        this._modalElements.push(...elements);
        const closeAll = () => {
            elements.forEach(el => el.destroy());
            this._modalElements = this._modalElements.filter(el => !elements.includes(el));
        };
        closeBtn.on('pointerdown', closeAll);
        dim.on('pointerdown', closeAll);
    }

    _showHallOfFame(isMobile) {
        const elements = [];
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const depth = 200;

        const dim = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.88)
            .setDepth(depth).setInteractive();
        elements.push(dim);

        const boxW = uv(400);
        const boxH = uv(520);
        const bx = cx - boxW / 2;
        const by = cy - boxH / 2;
        const boxG = this.add.graphics().setDepth(depth + 1);
        drawSystemPanel(boxG, bx, by, boxW, boxH, {
            cut: uv(14),
            fill: SYSTEM.BG_DEEP, fillAlpha: 0.98,
            border: SYSTEM.BORDER_GOLD, borderWidth: 1,
        });
        elements.push(boxG);

        const title = this.add.text(cx, by + uv(26), `[ ${t('hallOfFame')} ]`, {
            fontSize: fs(isMobile ? 15 : 14),
            fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_GOLD,
        }).setOrigin(0.5).setDepth(depth + 2);
        elements.push(title);

        const divG = this.add.graphics().setDepth(depth + 2);
        divG.lineStyle(1, SYSTEM.BORDER_GOLD, 0.35);
        divG.lineBetween(bx + uv(24), by + uv(52), bx + boxW - uv(24), by + uv(52));
        elements.push(divG);

        const loadingText = this.add.text(cx, cy, '▷  ' + t('loading'), {
            fontSize: fs(13), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
        }).setOrigin(0.5).setDepth(depth + 2);
        elements.push(loadingText);

        const closeBtn = this.add.text(cx, by + boxH - uv(24), `[ ${t('close')} ]`, {
            fontSize: fs(12), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
        }).setOrigin(0.5).setDepth(depth + 2).setInteractive({ useHandCursor: true });
        elements.push(closeBtn);
        closeBtn.on('pointerover', () => closeBtn.setColor(SYSTEM.TEXT_CYAN));
        closeBtn.on('pointerout', () => closeBtn.setColor(SYSTEM.TEXT_MUTED));

        this._modalElements.push(...elements);
        const closeAll = () => {
            elements.forEach(el => el.destroy());
            this._modalElements = this._modalElements.filter(el => !elements.includes(el));
        };
        closeBtn.on('pointerdown', closeAll);
        dim.on('pointerdown', closeAll);

        fetch(`${GAME_API_URL}/rankings?game_id=${GAME_ID_SHADOW}&limit=20`)
            .then(resp => resp.json())
            .then(data => {
                if (loadingText && loadingText.active) loadingText.setVisible(false);
                const rankings = data.rankings || [];
                if (rankings.length === 0) {
                    const noData = this.add.text(cx, cy, '▷  ' + t('noRecords'), {
                        fontSize: fs(13), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
                    }).setOrigin(0.5).setDepth(depth + 2);
                    elements.push(noData);
                    return;
                }

                const startY = by + uv(68);
                const maxH = boxH - uv(110);
                const rowH = Math.min(uv(22), maxH / Math.min(rankings.length + 1, 21));

                const hStyle = { fontSize: fs(10), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN_DIM };
                let y = startY;
                const hR = this.add.text(bx + uv(26), y, 'RANK', hStyle).setDepth(depth + 2);
                const hN = this.add.text(bx + uv(72), y, 'NAME', hStyle).setDepth(depth + 2);
                const hS = this.add.text(bx + boxW - uv(26), y, t('scoreLabel'), hStyle).setOrigin(1, 0).setDepth(depth + 2);
                elements.push(hR, hN, hS);

                y += rowH;
                const hdiv = this.add.graphics().setDepth(depth + 2);
                hdiv.lineStyle(1, SYSTEM.BORDER_DIM, 0.6);
                hdiv.lineBetween(bx + uv(18), y, bx + boxW - uv(18), y);
                elements.push(hdiv);
                y += 4;

                rankings.forEach((entry, i) => {
                    if (y + rowH > startY + maxH) return;
                    const colors = [SYSTEM.TEXT_GOLD, '#c8d0dc', '#d18b4a'];
                    const color = i < 3 ? colors[i] : SYSTEM.TEXT_CYAN_DIM;
                    const rankLabel = `#${String(i + 1).padStart(2, '0')}`;
                    const fSize = fs(Math.min(12, rowH * 0.55));
                    const bold = i < 3 ? 'bold' : 'normal';

                    const rT = this.add.text(bx + uv(26), y, rankLabel, {
                        fontSize: fSize, fontFamily: UI_FONT_MONO, fontStyle: bold, color,
                    }).setDepth(depth + 2);
                    const nT = this.add.text(bx + uv(72), y, entry.player_name, {
                        fontSize: fSize, fontFamily: UI_FONT_KR, fontStyle: bold, color,
                    }).setDepth(depth + 2);
                    const sMins = Math.floor(entry.score / 60).toString().padStart(2, '0');
                    const sSecs = (entry.score % 60).toString().padStart(2, '0');
                    const sT = this.add.text(bx + boxW - uv(26), y, `${sMins}:${sSecs}`, {
                        fontSize: fSize, fontFamily: UI_FONT_MONO, fontStyle: bold, color,
                    }).setOrigin(1, 0).setDepth(depth + 2);
                    elements.push(rT, nT, sT);
                    y += rowH;
                });
            })
            .catch(() => {
                if (loadingText && loadingText.active) {
                    loadingText.setText('▶  SYSTEM · ERROR');
                    loadingText.setColor(SYSTEM.TEXT_RED);
                }
            });
    }

    update() {}
}
