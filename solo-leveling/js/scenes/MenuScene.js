import {
    GAME_WIDTH, GAME_HEIGHT,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, drawSystemPanel,
} from '../utils/Constants.js';
import { SoundManager } from '../managers/SoundManager.js';
import { t, LANG, LANGUAGES, setLang, GAME_API_URL, GAME_ID_SHADOW } from '../utils/i18n.js';
import { GameScene } from './GameScene.js';
import { CHARACTER_DEFS, getStoredCharacterId, setStoredCharacterId } from '../utils/Characters.js';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        const alLink = document.getElementById('archerlab-link');
        if (alLink) alLink.style.display = '';

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isPortrait = GAME_HEIGHT > GAME_WIDTH;
        const isNarrow = GAME_WIDTH <= 1100;  // narrow phone, portrait
        const isShortLandscape = !isPortrait && GAME_HEIGHT <= 820 && GAME_WIDTH > 1180;
        const isCompactMenu = isNarrow || isShortLandscape;

        this._modalElements = [];
        this._dropdownElements = [];
        this._startingGame = false;
        this.selectedCharacterId = getStoredCharacterId();

        // Deep background + scanlines
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, SYSTEM.BG_DEEP);
        this._drawBackdrop();

        const centerX = GAME_WIDTH / 2;
        const sidePad = uv(20);

        // Content anchor — centered vertical block so layout doesn't spread on tall portrait
        const contentH = Math.min(GAME_HEIGHT, uv(860));
        const contentTop = (GAME_HEIGHT - contentH) / 2;
        const cy = (pct) => contentTop + contentH * pct;

        // ── Top status line ─────────────────────
        // Skip on narrow/portrait to avoid colliding with HTML ArcherLab link
        if (!isCompactMenu && !isPortrait) {
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
        }

        // ── Title block ─────────────────────────
        const titleSize = isShortLandscape ? 40 : (isPortrait ? 48 : (isMobile ? 42 : 60));
        const titleY = cy(isShortLandscape ? 0.13 : 0.15);
        const titleText = this.add.text(centerX, titleY, t('title'), {
            fontSize: fs(titleSize),
            fontFamily: UI_FONT_KR,
            fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
        }).setOrigin(0.5);

        // Auto-shrink title if wider than available space
        const titleMaxW = GAME_WIDTH - sidePad * 2;
        if (titleText.width > titleMaxW) {
            titleText.setScale(titleMaxW / titleText.width);
        }

        const uw = titleText.displayWidth;
        const ulG = this.add.graphics();
        ulG.lineStyle(2, SYSTEM.BORDER, 1);
        const ulY = titleY + titleText.displayHeight / 2 + uv(6);
        ulG.lineBetween(centerX - uw / 2, ulY, centerX + uw / 2, ulY);
        ulG.lineStyle(1, SYSTEM.BORDER_DIM, 0.55);
        const ulExt = Math.min(uv(24), (GAME_WIDTH - uw) / 2 - sidePad);
        if (ulExt > 0) {
            ulG.lineBetween(centerX - uw / 2 - ulExt, ulY + uv(4), centerX + uw / 2 + ulExt, ulY + uv(4));
        }

        // Subtitle — skip on short landscape (phone) to save vertical space
        const isLandscapePhone = isMobile && !isPortrait;
        if (!isLandscapePhone && !isShortLandscape) {
            const subText = this.add.text(centerX, ulY + uv(18), 'S H A D O W   ·   S U R V I V A L', {
                fontSize: fs(isNarrow ? 11 : 13),
                fontFamily: UI_FONT_MONO,
                color: SYSTEM.TEXT_CYAN_DIM,
                letterSpacing: 2,
            }).setOrigin(0.5);
            if (subText.width > titleMaxW) subText.setScale(titleMaxW / subText.width);
        }

        // ── System notification panel ──────────
        const panelW = Math.min(uv(520), GAME_WIDTH - sidePad * 2);
        const panelH = uv(isCompactMenu ? 96 : 106);  // extra height for wrap
        const panelX = centerX - panelW / 2;
        const panelY = cy(isShortLandscape ? 0.31 : 0.34);
        const panelG = this.add.graphics();
        drawSystemPanel(panelG, panelX, panelY, panelW, panelH, {
            cut: uv(10),
            fill: SYSTEM.BG_PANEL, fillAlpha: 0.9,
            border: SYSTEM.BORDER, borderAlpha: 0.9, borderWidth: 1,
        });

        // Panel header tag
        this.add.text(panelX + uv(18), panelY - uv(9), ' SYSTEM · NOTICE ', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
            backgroundColor: '#05070d', padding: { left: 6, right: 6, top: 1, bottom: 1 },
        });

        // Messages (typewriter) — localized, auto-shrink if needed
        const msgs = [t('menuMsg1'), t('menuMsg2'), t('menuMsg3')];
        const msgStyle = {
            fontSize: fs(isCompactMenu ? 10 : 14),
            fontFamily: UI_FONT_KR,
            color: SYSTEM.TEXT_BRIGHT,
        };
        const msgMaxW = panelW - uv(44);
        // Safety factor — CJK font measurement is unreliable until webfont loads
        const SAFETY = 0.82;
        const msgEls = msgs.map((fullMsg, i) => {
            const el = this.add.text(panelX + uv(22), panelY + uv(16) + i * uv(isCompactMenu ? 20 : 24), fullMsg, msgStyle);
            const scale = Math.min(1, (msgMaxW * SAFETY) / Math.max(el.width, 1));
            if (scale < 1) el.setScale(scale);
            el.setText('');
            return el;
        });
        msgs.forEach((m, i) => {
            this.time.delayedCall(250 + i * 420, () => this._typewrite(msgEls[i], m));
        });

        const startGame = async (resume = false) => {
            this._startingGame = true;
            const characterId = resume ? this.selectedCharacterId : setStoredCharacterId(this.selectedCharacterId);
            if (!this.game._soundManager) {
                this.game._soundManager = new SoundManager();
                this.game._soundManager.init();
            }
            const sm = this.game._soundManager;
            sm.stopIntroMusic();
            sm.resume(true);
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.time.delayedCall(500, () => this.scene.start('GameScene', { resume, characterId }));
        };

        const selectorTop = panelY + panelH + uv(isShortLandscape ? 10 : 16);
        const selectorBottom = this._createCharacterSelector(centerX, selectorTop, {
            sidePad,
            isCompactMenu,
            isShortLandscape,
        });

        // ── Main action buttons ─────────────────
        const hasSave = GameScene.hasSavedGame();
        const btnW = Math.min(uv(isNarrow ? 330 : 300), GAME_WIDTH - sidePad * 2);
        const startH = uv(isShortLandscape ? 44 : 52);
        const resumeH = uv(isShortLandscape ? 54 : 64);
        const actionGap = uv(isShortLandscape ? 8 : 12);
        const actionTop = Math.max(
            selectorBottom + uv(isShortLandscape ? 8 : 14),
            cy(hasSave ? 0.56 : 0.60)
        );
        let nextActionY = actionTop;

        if (hasSave) {
            const summary = GameScene.getSavedSummary();
            const min = Math.floor((summary?.timeSec || 0) / 60).toString().padStart(2, '0');
            const sec = ((summary?.timeSec || 0) % 60).toString().padStart(2, '0');
            this._makeResumeButton(centerX - btnW / 2, nextActionY, btnW, resumeH, {
                title: t('continueGame'),
                meta: `${summary?.characterName || ''}  LV.${String(summary?.level || 1).padStart(2, '0')}  ·  ${min}:${sec}`.trim(),
                isNarrow,
                onClick: () => startGame(true),
            });
            nextActionY += resumeH + actionGap;
        }

        this._makeButton(centerX - btnW / 2, nextActionY, btnW, startH, {
            label: `▶   ${t('startGame')}`,
            labelColor: SYSTEM.TEXT_BRIGHT,
            border: SYSTEM.BORDER,
            labelSize: isNarrow ? 16 : 19,
            labelFont: UI_FONT_KR,
            onClick: () => startGame(false),
        });
        nextActionY += startH;

        // ── Hall of Fame (secondary) ────────────
        const hofW = Math.min(uv(210), GAME_WIDTH - sidePad * 2);
        const hofH = uv(isShortLandscape ? 32 : 36);
        const hofY = nextActionY + uv(isShortLandscape ? 10 : (hasSave ? 16 : 18));
        this._makeButton(centerX - hofW / 2, hofY, hofW, hofH, {
            label: t('hallOfFame'),
            labelColor: SYSTEM.TEXT_GOLD,
            border: SYSTEM.BORDER_GOLD,
            labelSize: 12,
            labelFont: UI_FONT_MONO,
            onClick: () => this._showHallOfFame(isMobile),
        });

        // ── Footer ─────────────────────────────
        // Anchor footer from bottom of screen so it's consistent across aspect ratios
        if (!isShortLandscape) {
        const bottomPad = uv(isNarrow ? 54 : 18);
        const copyrightY = GAME_HEIGHT - bottomPad;
        this.add.text(centerX, copyrightY, 'ArcherLab   ·   © 2026', {
            fontSize: fs(10), fontFamily: UI_FONT_MONO, color: '#3a4755',
        }).setOrigin(0.5, 1);

        const contactBtn = this.add.text(centerX, copyrightY - uv(16), `[ ${t('contact')} ]`, {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
        }).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
        contactBtn.on('pointerover', () => contactBtn.setColor(SYSTEM.TEXT_CYAN));
        contactBtn.on('pointerout', () => contactBtn.setColor(SYSTEM.TEXT_MUTED));
        contactBtn.on('pointerdown', () => this._showContactModal());

        // ── Controls hint (above footer) ───────
        const ctrlY = copyrightY - uv(46);
        const ctrl = isMobile
            ? `${t('controlsMobile')}   ·   ${t('controlsMobileAuto')}`
            : `${t('controlsPC')}   ·   ${t('controlsPC2')}`;
        const ctrlText = this.add.text(centerX, ctrlY, ctrl, {
            fontSize: fs(isNarrow ? 10 : 11),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_MUTED,
            align: 'center',
        }).setOrigin(0.5, 1);
        const ctrlMaxW = GAME_WIDTH - sidePad * 2;
        if (ctrlText.width > ctrlMaxW) ctrlText.setScale(ctrlMaxW / ctrlText.width);
        }

        // ── Language selector (top-right) ──────
        this._createLanguageDropdown(isMobile);

        this.cameras.main.fadeIn(500, 0, 0, 0);

        this.events.once('shutdown', () => {
            this._dropdownElements.forEach(el => { if (el && el.active) el.destroy(); });
            this._dropdownElements = [];
            this._modalElements.forEach(el => { if (el && el.active) el.destroy(); });
            this._modalElements = [];
        });

        this.input.once('pointerdown', async () => {
            if (this._startingGame) return;
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

    _fitText(textObj, maxW, maxH = null) {
        const sx = maxW ? Math.min(1, maxW / Math.max(textObj.width, 1)) : 1;
        const sy = maxH ? Math.min(1, maxH / Math.max(textObj.height, 1)) : 1;
        const scale = Math.min(sx, sy);
        textObj.setScale(scale);
        return scale;
    }

    _makeResumeButton(x, y, w, h, { title, meta, isNarrow = false, onClick }) {
        const g = this.add.graphics();
        const redraw = (hover) => {
            g.clear();
            drawSystemPanel(g, x, y, w, h, {
                cut: uv(9),
                fill: hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL,
                fillAlpha: hover ? 0.98 : 0.88,
                border: SYSTEM.BORDER_GOLD,
                borderAlpha: hover ? 1 : 0.92,
                borderWidth: hover ? 2 : 1,
            });
            g.lineStyle(1, SYSTEM.BORDER_GOLD, hover ? 0.45 : 0.25);
            g.lineBetween(x + uv(48), y + uv(10), x + uv(48), y + h - uv(10));
        };
        redraw(false);

        const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        const icon = this.add.text(x + uv(24), y + h / 2, '↻', {
            fontSize: fs(isNarrow ? 15 : 16),
            fontFamily: UI_FONT_MONO,
            fontStyle: 'bold',
            color: SYSTEM.TEXT_GOLD,
        }).setOrigin(0.5);
        const titleText = this.add.text(x + uv(64), y + h * 0.36, title, {
            fontSize: fs(isNarrow ? 14 : 15),
            fontFamily: UI_FONT_KR,
            fontStyle: 'bold',
            color: SYSTEM.TEXT_GOLD,
        }).setOrigin(0, 0.5);
        const metaText = this.add.text(x + uv(64), y + h * 0.68, meta, {
            fontSize: fs(isNarrow ? 10 : 11),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN_DIM,
        }).setOrigin(0, 0.5);

        const textMaxW = w - uv(82);
        const titleScale = this._fitText(titleText, textMaxW, h * 0.38);
        const metaScale = this._fitText(metaText, textMaxW, h * 0.28);
        const iconScale = this._fitText(icon, uv(28), h * 0.54);

        hit.on('pointerover', () => {
            redraw(true);
            icon.setScale(iconScale * 1.05);
            titleText.setScale(titleScale * 1.03);
            metaText.setScale(metaScale * 1.02);
        });
        hit.on('pointerout', () => {
            redraw(false);
            icon.setScale(iconScale);
            titleText.setScale(titleScale);
            metaText.setScale(metaScale);
        });
        hit.on('pointerdown', () => onClick && onClick());
        return { g, hit, icon, titleText, metaText };
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
            color: labelColor,
        }).setOrigin(0.5);
        const baseScale = this._fitText(txt, w - uv(24), h - uv(12));

        hit.on('pointerover', () => { redraw(true); txt.setScale(baseScale * 1.02); });
        hit.on('pointerout', () => { redraw(false); txt.setScale(baseScale); });
        hit.on('pointerdown', () => onClick && onClick());
        return { g, hit, txt };
    }

    _createCharacterSelector(centerX, topY, { sidePad, isCompactMenu = false, isShortLandscape = false } = {}) {
        const characters = Object.values(CHARACTER_DEFS);
        const gap = uv(isShortLandscape ? 6 : 8);
        const availableW = GAME_WIDTH - sidePad * 2;
        const cardW = Math.floor(Math.min(
            uv(isShortLandscape ? 138 : 154),
            (availableW - gap * (characters.length - 1)) / characters.length
        ));
        const cardH = uv(isShortLandscape ? 78 : (isCompactMenu ? 92 : 112));
        const totalW = cardW * characters.length + gap * (characters.length - 1);
        const startX = centerX - totalW / 2;
        const depth = 8;
        const cardRefs = [];

        this.add.text(centerX, topY, '[ HUNTER SELECT ]', {
            fontSize: fs(isShortLandscape ? 9 : 10),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN_DIM,
        }).setOrigin(0.5).setDepth(depth);
        const cardTop = topY + uv(isShortLandscape ? 14 : 18);

        const redraw = () => {
            cardRefs.forEach(({ g, character }) => {
                const selected = this.selectedCharacterId === character.id;
                g.clear();
                drawSystemPanel(g, g._x, g._y, cardW, cardH, {
                    cut: uv(7),
                    fill: selected ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL,
                    fillAlpha: selected ? 0.98 : 0.82,
                    border: selected ? character.accent : SYSTEM.BORDER_DIM,
                    borderAlpha: selected ? 1 : 0.62,
                    borderWidth: selected ? 2 : 1,
                });
                if (selected) {
                    g.lineStyle(1, character.accent, 0.45);
                    g.lineBetween(g._x + uv(10), g._y + cardH - uv(8), g._x + cardW - uv(10), g._y + cardH - uv(8));
                }
            });
        };

        characters.forEach((character, i) => {
            const x = startX + i * (cardW + gap);
            const y = cardTop;
            const g = this.add.graphics().setDepth(depth);
            g._x = x;
            g._y = y;
            cardRefs.push({ g, character });

            const hit = this.add.rectangle(x + cardW / 2, y + cardH / 2, cardW, cardH, 0x000000, 0)
                .setDepth(depth + 2)
                .setInteractive({ useHandCursor: true });

            const portraitSize = uv(isShortLandscape ? 32 : (isCompactMenu ? 40 : 48));
            const portrait = this.add.image(x + cardW / 2, y + uv(isShortLandscape ? 22 : 28), `char_${character.assetKey}_portrait`)
                .setDepth(depth + 1)
                .setDisplaySize(portraitSize, portraitSize)
                .setOrigin(0.5);

            const name = this.add.text(x + cardW / 2, y + uv(isShortLandscape ? 43 : 55), character.name, {
                fontSize: fs(isShortLandscape ? 10 : 12),
                fontFamily: UI_FONT_KR,
                fontStyle: 'bold',
                color: SYSTEM.TEXT_BRIGHT,
            }).setOrigin(0.5).setDepth(depth + 1);
            this._fitText(name, cardW - uv(12), uv(18));

            const role = this.add.text(x + cardW / 2, y + uv(isShortLandscape ? 58 : 72), character.archetype, {
                fontSize: fs(isShortLandscape ? 8 : 9),
                fontFamily: UI_FONT_KR,
                color: character.accentText,
            }).setOrigin(0.5).setDepth(depth + 1);
            this._fitText(role, cardW - uv(12), uv(14));

            if (!isShortLandscape) {
                const skill = this.add.text(x + cardW / 2, y + cardH - uv(20), character.skillName, {
                    fontSize: fs(isCompactMenu ? 8 : 9),
                    fontFamily: UI_FONT_KR,
                    color: SYSTEM.TEXT_CYAN_DIM,
                }).setOrigin(0.5).setDepth(depth + 1);
                this._fitText(skill, cardW - uv(12), uv(14));
            }

            hit.on('pointerover', () => {
                portrait.setScale(portrait.scaleX * 1.04, portrait.scaleY * 1.04);
                if (this.selectedCharacterId !== character.id) {
                    g.clear();
                    drawSystemPanel(g, x, y, cardW, cardH, {
                        cut: uv(7),
                        fill: SYSTEM.BG_PANEL_HI,
                        fillAlpha: 0.9,
                        border: character.accent,
                        borderAlpha: 0.8,
                        borderWidth: 1,
                    });
                }
            });
            hit.on('pointerout', () => {
                portrait.setDisplaySize(portraitSize, portraitSize);
                redraw();
            });
            hit.on('pointerdown', () => {
                this.selectedCharacterId = setStoredCharacterId(character.id);
                if (this.game._soundManager) this.game._soundManager.play('select');
                redraw();
            });
        });

        redraw();
        return cardTop + cardH;
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
