import {
    GAME_WIDTH, GAME_HEIGHT,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, drawSystemPanel,
} from '../utils/Constants.js';
import { SoundManager } from '../managers/SoundManager.js';
import { t, LANG, LANGUAGES, setLang, GAME_API_URL, GAME_ID_SHADOW } from '../utils/i18n.js';
import { GameScene } from './GameScene.js';
import { CHARACTER_DEFS, getCharacter, getStoredCharacterId, setStoredCharacterId, getCharacterRankingGameId } from '../utils/Characters.js';

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
        const isLandscapePhone = isMobile && !isPortrait;

        this._modalElements = [];
        this._dropdownElements = [];
        this._startingGame = false;
        this.selectedCharacterId = getStoredCharacterId();

        this._createMenuBackdrop({ isPortrait, isShortLandscape });

        const centerX = GAME_WIDTH / 2;
        const sidePad = uv(20);

        // Content anchor — centered vertical block so layout doesn't spread on tall portrait
        const contentH = Math.min(GAME_HEIGHT, uv(860));
        const contentTop = (GAME_HEIGHT - contentH) / 2;
        const cy = (pct) => contentTop + contentH * pct;
        this._createHeroFocus(centerX, cy, { isPortrait, isShortLandscape });

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
            if (this._startingGame) return;
            this._startingGame = true;
            const characterId = resume ? this.selectedCharacterId : setStoredCharacterId(this.selectedCharacterId);
            if (!this.game._soundManager) {
                this.game._soundManager = new SoundManager();
                this.game._soundManager.init();
            }
            const sm = this.game._soundManager;
            sm.stopIntroMusic();
            await sm.resume(true);
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
            primary: true,
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
        // Keep the mobile title screen clean; the fixed ArcherLab link remains available.
        if (!isShortLandscape && !isPortrait) {
            const footerY = GAME_HEIGHT - uv(18);
            const ctrl = `${t('controlsPC')}   ·   ${t('controlsPC2')}`;
            const ctrlText = this.add.text(sidePad, footerY, ctrl, {
                fontSize: fs(10),
                fontFamily: UI_FONT_MONO,
                color: SYSTEM.TEXT_MUTED,
                align: 'left',
            }).setOrigin(0, 1);
            this._fitText(ctrlText, GAME_WIDTH * 0.42, uv(18));

            const contactBtn = this.add.text(GAME_WIDTH - sidePad, footerY, `[ ${t('contact')} ]`, {
                fontSize: fs(11), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
            }).setOrigin(1, 1).setInteractive({ useHandCursor: true });
            contactBtn.on('pointerover', () => contactBtn.setColor(SYSTEM.TEXT_CYAN));
            contactBtn.on('pointerout', () => contactBtn.setColor(SYSTEM.TEXT_MUTED));
            contactBtn.on('pointerdown', () => this._showContactModal());

            this.add.text(GAME_WIDTH - sidePad, footerY - uv(17), '© 2026 ArcherLab', {
                fontSize: fs(9), fontFamily: UI_FONT_MONO, color: '#3a4755',
            }).setOrigin(1, 1);
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

    _createMenuBackdrop({ isPortrait = false, isShortLandscape = false } = {}) {
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, SYSTEM.BG_DEEP)
            .setDepth(-40);

        if (this.textures.exists('ai_dungeon_floor')) {
            this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'ai_dungeon_floor')
                .setDepth(-38)
                .setAlpha(0.24)
                .setTint(0x7788aa);
        }

        if (this.textures.exists('ai_dungeon_atmosphere')) {
            this._coverImage('ai_dungeon_atmosphere', GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT)
                .setDepth(-37)
                .setAlpha(isPortrait ? 0.42 : 0.5)
                .setTint(0xa8c4ff);
        }

        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x02050d, isPortrait ? 0.55 : 0.46)
            .setDepth(-36);
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.16, GAME_WIDTH, GAME_HEIGHT * 0.36, 0x02040a, 0.48)
            .setDepth(-35);
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.76, GAME_WIDTH, GAME_HEIGHT * 0.5, 0x02040a, isPortrait ? 0.46 : 0.38)
            .setDepth(-35);

        if (!isPortrait && this.textures.exists('env_shadow_portal')) {
            const portalY = isShortLandscape ? GAME_HEIGHT * 0.49 : GAME_HEIGHT * 0.53;
            [
                { x: GAME_WIDTH * 0.19, scale: 1.95, alpha: 0.16, rot: -0.12 },
                { x: GAME_WIDTH * 0.81, scale: 1.6, alpha: 0.13, rot: 0.16 },
            ].forEach((p) => {
                const portal = this.add.image(p.x, portalY, 'env_shadow_portal')
                    .setDepth(-30)
                    .setAlpha(p.alpha)
                    .setScale(p.scale)
                    .setRotation(p.rot)
                    .setBlendMode(Phaser.BlendModes.ADD);
                this.tweens.add({
                    targets: portal,
                    alpha: p.alpha + 0.07,
                    scale: p.scale * 1.06,
                    duration: 2200,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                });
            });
        }

        if (this.textures.exists('particle_glow')) {
            try {
                this.add.particles(GAME_WIDTH / 2, GAME_HEIGHT * 0.55, 'particle_glow', {
                    x: { min: -GAME_WIDTH * 0.46, max: GAME_WIDTH * 0.46 },
                    y: { min: -GAME_HEIGHT * 0.22, max: GAME_HEIGHT * 0.24 },
                    speed: { min: 4, max: 18 },
                    angle: { min: 245, max: 292 },
                    scale: { start: isPortrait ? 0.42 : 0.55, end: 0.05 },
                    alpha: { start: 0.18, end: 0 },
                    lifespan: { min: 2400, max: 5200 },
                    tint: [SYSTEM.BORDER, 0x8b4dff, 0xe8b64a],
                    blendMode: 'ADD',
                    frequency: isPortrait ? 170 : 120,
                    quantity: 1,
                }).setDepth(-18);
            } catch (e) { /* particles are decorative */ }
        }

        if (this.textures.exists('vignette')) {
            this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette')
                .setDepth(-10)
                .setDisplaySize(GAME_WIDTH * 1.24, GAME_HEIGHT * 1.24)
                .setAlpha(isPortrait ? 0.72 : 0.64);
        }

        this._drawBackdrop();
    }

    _coverImage(key, x, y, w, h) {
        const img = this.add.image(x, y, key).setOrigin(0.5);
        const source = this.textures.get(key)?.getSourceImage?.();
        const iw = Math.max(source?.width || w, 1);
        const ih = Math.max(source?.height || h, 1);
        img.setScale(Math.max(w / iw, h / ih));
        return img;
    }

    _createHeroFocus(centerX, cy, { isPortrait = false, isShortLandscape = false } = {}) {
        if (isPortrait || isShortLandscape) return;

        const heroX = centerX + Math.min(GAME_WIDTH * 0.34, uv(430));
        const heroY = cy(0.34);
        const ringSize = Math.min(uv(330), GAME_HEIGHT * 0.42);

        const aura = this.add.ellipse(heroX, heroY, ringSize * 1.02, ringSize * 1.02, SYSTEM.BORDER, 0.035)
            .setDepth(-16)
            .setStrokeStyle(1, SYSTEM.BORDER, 0.18);
        const ring = this.add.ellipse(heroX, heroY, ringSize * 0.86, ringSize * 0.86, 0x000000, 0)
            .setDepth(-15)
            .setStrokeStyle(2, SYSTEM.BORDER_DIM, 0.25);

        this._heroPreviewSprite = this.add.image(heroX, heroY, 'char_original_shadow_monarch_portrait')
            .setDepth(-14)
            .setAlpha(0.2)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDisplaySize(ringSize * 0.74, ringSize * 0.74);
        this._heroPreviewAura = aura;
        this._heroPreviewRing = ring;
        this._refreshHeroPreview();

        this.tweens.add({
            targets: [aura, ring],
            alpha: { from: 0.2, to: 0.42 },
            scale: { from: 1, to: 1.035 },
            duration: 2400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    _refreshHeroPreview(character = getCharacter(this.selectedCharacterId)) {
        const texture = `char_${character.assetKey}_portrait`;
        if (this._heroPreviewSprite?.active && this.textures.exists(texture)) {
            this._heroPreviewSprite.setTexture(texture);
            this._heroPreviewSprite.setAlpha(0.2);
        }
        if (this._heroPreviewAura?.active) {
            this._heroPreviewAura.setFillStyle(character.accent, 0.04);
            this._heroPreviewAura.setStrokeStyle(1, character.accent, 0.2);
        }
        if (this._heroPreviewRing?.active) {
            this._heroPreviewRing.setStrokeStyle(2, character.accent, 0.28);
        }
    }

    _drawBackdrop() {
        const g = this.add.graphics().setDepth(-4);
        // Horizontal scanlines
        g.lineStyle(1, SYSTEM.SCAN_LINE, 0.34);
        for (let y = 0; y < GAME_HEIGHT; y += 3) g.lineBetween(0, y, GAME_WIDTH, y);
        // Faint vertical grid
        g.lineStyle(1, SYSTEM.BORDER, 0.035);
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

    _makeButton(x, y, w, h, { label, labelColor, border, labelSize = 16, labelFont = UI_FONT_KR, primary = false, onClick }) {
        const g = this.add.graphics();
        const redraw = (hover) => {
            g.clear();
            drawSystemPanel(g, x, y, w, h, {
                cut: uv(8),
                fill: hover ? SYSTEM.BG_PANEL_HI : (primary ? 0x071723 : SYSTEM.BG_PANEL),
                fillAlpha: hover ? 0.98 : (primary ? 0.9 : 0.82),
                border, borderAlpha: hover ? 1 : (primary ? 0.98 : 0.86),
                borderWidth: hover ? 2 : 1,
            });
            if (primary) {
                g.fillStyle(border, hover ? 0.18 : 0.1);
                g.fillRect(x + uv(14), y + 1, w - uv(28), 2);
                g.lineStyle(1, border, hover ? 0.55 : 0.32);
                g.lineBetween(x + uv(18), y + h - uv(8), x + w - uv(18), y + h - uv(8));
                g.lineStyle(1, 0xffffff, hover ? 0.18 : 0.08);
                g.lineBetween(x + uv(18), y + uv(8), x + w - uv(18), y + uv(8));
            } else {
                g.lineStyle(1, border, hover ? 0.42 : 0.22);
                g.lineBetween(x + uv(12), y + h - uv(7), x + w - uv(12), y + h - uv(7));
            }
        };
        redraw(false);

        const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        const txt = this.add.text(x + w / 2, y + h / 2, label, {
            fontSize: fs(labelSize), fontFamily: labelFont, fontStyle: 'bold',
            color: labelColor,
            stroke: '#02040a',
            strokeThickness: primary ? 3 : 2,
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
                this._refreshHeroPreview(character);
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
        let closed = false;
        const markClosed = () => { closed = true; };
        const isClosed = () => closed || (this.scene?.isActive && !this.scene.isActive());
        this.events.once('shutdown', markClosed);

        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const isPortrait = GAME_HEIGHT > GAME_WIDTH;
        const depth = 200;

        const dim = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.84)
            .setDepth(depth).setInteractive();
        elements.push(dim);

        if (this.textures.exists('env_shadow_portal')) {
            const portal = this.add.image(cx, cy, 'env_shadow_portal')
                .setDepth(depth + 1)
                .setAlpha(0.16)
                .setScale(isPortrait ? 3.2 : 2.45)
                .setBlendMode(Phaser.BlendModes.ADD);
            elements.push(portal);
        }

        const boxW = isPortrait
            ? GAME_WIDTH - uv(88)
            : Math.min(uv(540), GAME_WIDTH - uv(72));
        const boxH = isPortrait
            ? Math.min(uv(1260), GAME_HEIGHT - uv(270))
            : Math.min(uv(560), GAME_HEIGHT - uv(96));
        const bx = cx - boxW / 2;
        const by = cy - boxH / 2;
        const boxG = this.add.graphics().setDepth(depth + 1);
        drawSystemPanel(boxG, bx, by, boxW, boxH, {
            cut: uv(14),
            fill: SYSTEM.BG_DEEP, fillAlpha: 0.985,
            border: SYSTEM.BORDER_GOLD, borderWidth: 1,
        });
        elements.push(boxG);

        const bodyShield = this.add.rectangle(cx, cy, boxW, boxH, 0x000000, 0)
            .setDepth(depth + 2)
            .setInteractive();
        elements.push(bodyShield);

        const headerTag = this.add.text(cx, by + uv(23), '[ SYSTEM · RANKING ]', {
            fontSize: fs(isPortrait ? 10 : 10),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN_DIM,
            letterSpacing: 2,
        }).setOrigin(0.5).setDepth(depth + 4);
        elements.push(headerTag);

        const title = this.add.text(cx, by + uv(isPortrait ? 58 : 52), t('hallOfFame'), {
            fontSize: fs(isPortrait ? 24 : 20),
            fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_GOLD,
            fontStyle: 'bold',
            stroke: '#02040a',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(depth + 4);
        this._fitText(title, boxW - uv(60), uv(52));
        elements.push(title);

        const characters = Object.values(CHARACTER_DEFS);
        const tabGap = uv(5);
        const tabY = by + uv(isPortrait ? 92 : 84);
        const tabH = uv(isPortrait ? 34 : 28);
        const tabAreaW = boxW - uv(48);
        const tabW = Math.floor((tabAreaW - tabGap * (characters.length - 1)) / characters.length);
        const tabStartX = cx - (tabW * characters.length + tabGap * (characters.length - 1)) / 2;
        const tabRefs = [];
        let activeCharacterId = CHARACTER_DEFS[this.selectedCharacterId] ? this.selectedCharacterId : characters[0].id;
        let requestSeq = 0;
        let contentElements = [];

        const trackContent = (el) => {
            contentElements.push(el);
            elements.push(el);
            return el;
        };
        const clearContent = () => {
            const removeSet = new Set(contentElements);
            contentElements.forEach(el => { if (el && el.destroy) el.destroy(); });
            for (let i = elements.length - 1; i >= 0; i--) {
                if (removeSet.has(elements[i])) elements.splice(i, 1);
            }
            contentElements = [];
        };
        const drawTab = (ref, hover = false) => {
            const selected = ref.character.id === activeCharacterId;
            ref.g.clear();
            drawSystemPanel(ref.g, ref.x, ref.y, ref.w, ref.h, {
                cut: uv(6),
                fill: selected || hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL,
                fillAlpha: selected ? 0.98 : (hover ? 0.92 : 0.78),
                border: selected ? ref.character.accent : (hover ? SYSTEM.BORDER : SYSTEM.BORDER_DIM),
                borderAlpha: selected ? 1 : (hover ? 0.9 : 0.55),
                borderWidth: selected ? 2 : 1,
            });
            ref.txt.setColor(selected ? ref.character.accentText : SYSTEM.TEXT_MUTED);
        };
        const redrawTabs = () => tabRefs.forEach(ref => drawTab(ref, false));

        characters.forEach((character, i) => {
            const x = tabStartX + i * (tabW + tabGap);
            const g = this.add.graphics().setDepth(depth + 3);
            const hit = this.add.rectangle(x + tabW / 2, tabY + tabH / 2, tabW, tabH, 0x000000, 0)
                .setDepth(depth + 5)
                .setInteractive({ useHandCursor: true });
            const txt = this.add.text(x + tabW / 2, tabY + tabH / 2, character.name, {
                fontSize: fs(isPortrait ? 9 : 8),
                fontFamily: UI_FONT_KR,
                fontStyle: 'bold',
                color: SYSTEM.TEXT_MUTED,
            }).setOrigin(0.5).setDepth(depth + 5);
            this._fitText(txt, tabW - uv(10), tabH - uv(8));

            const ref = { g, hit, txt, character, x, y: tabY, w: tabW, h: tabH };
            tabRefs.push(ref);
            hit.on('pointerover', () => drawTab(ref, true));
            hit.on('pointerout', () => drawTab(ref, false));
            hit.on('pointerdown', () => {
                if (activeCharacterId === character.id) return;
                activeCharacterId = character.id;
                redrawTabs();
                renderRanking(character.id);
            });
            elements.push(g, hit, txt);
        });
        redrawTabs();

        const divG = this.add.graphics().setDepth(depth + 2);
        const divY = tabY + tabH + uv(10);
        divG.lineStyle(1, SYSTEM.BORDER_GOLD, 0.35);
        divG.lineBetween(bx + uv(28), divY, bx + boxW - uv(28), divY);
        divG.lineStyle(1, SYSTEM.BORDER_DIM, 0.26);
        divG.lineBetween(bx + uv(46), divY + uv(7), bx + boxW - uv(46), divY + uv(7));
        elements.push(divG);

        const makeModalButton = (x, y, w, h, label, onClick) => {
            const g = this.add.graphics().setDepth(depth + 3);
            const redraw = (hover) => {
                g.clear();
                drawSystemPanel(g, x, y, w, h, {
                    cut: uv(6),
                    fill: hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL,
                    fillAlpha: hover ? 0.98 : 0.88,
                    border: SYSTEM.BORDER,
                    borderAlpha: hover ? 1 : 0.78,
                    borderWidth: hover ? 2 : 1,
                });
            };
            redraw(false);
            const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
                .setDepth(depth + 5)
                .setInteractive({ useHandCursor: true });
            const txt = this.add.text(x + w / 2, y + h / 2, label, {
                fontSize: fs(11), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_BRIGHT,
                stroke: '#02040a', strokeThickness: 2,
            }).setOrigin(0.5).setDepth(depth + 5);
            hit.on('pointerover', () => redraw(true));
            hit.on('pointerout', () => redraw(false));
            hit.on('pointerdown', onClick);
            elements.push(g, hit, txt);
        };

        const closeAll = () => {
            if (closed) return;
            closed = true;
            this.events.off('shutdown', markClosed);
            elements.forEach(el => el.destroy());
            this._modalElements = this._modalElements.filter(el => !elements.includes(el));
        };
        makeModalButton(cx - uv(48), by + boxH - uv(46), uv(96), uv(30), t('close'), closeAll);
        this._modalElements.push(...elements);
        dim.on('pointerdown', closeAll);

        const formatTime = (score) => {
            const safeScore = Math.max(0, Number(score) || 0);
            const mins = Math.floor(safeScore / 60).toString().padStart(2, '0');
            const secs = Math.floor(safeScore % 60).toString().padStart(2, '0');
            return `${mins}:${secs}`;
        };

        const renderRanking = (characterId) => {
            const seq = ++requestSeq;
            clearContent();
            const loadingText = trackContent(this.add.text(cx, cy + uv(18), '▷  ' + t('loading'), {
                fontSize: fs(13), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
            }).setOrigin(0.5).setDepth(depth + 4));

            const gameId = getCharacterRankingGameId(GAME_ID_SHADOW, characterId);
            fetch(`${GAME_API_URL}/rankings?game_id=${encodeURIComponent(gameId)}&limit=20`)
                .then(resp => resp.json())
                .then(data => {
                    if (isClosed() || seq !== requestSeq) return;
                    clearContent();
                    const rankings = data.rankings || [];
                    if (rankings.length === 0) {
                        trackContent(this.add.text(cx, cy, '▷  ' + t('noRecords'), {
                            fontSize: fs(13), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
                        }).setOrigin(0.5).setDepth(depth + 4));
                        return;
                    }

                    const topStartY = divY + uv(isPortrait ? 22 : 18);
                    const pad = uv(24);
                    const gap = uv(8);
                    const topCardH = uv(isPortrait ? 148 : 104);
                    const topCardW = (boxW - pad * 2 - gap * 2) / 3;
                    const topColors = [SYSTEM.TEXT_GOLD, '#cfd8e8', '#d18b4a'];
                    const topBorders = [SYSTEM.BORDER_GOLD, SYSTEM.BORDER, 0xd18b4a];

                    rankings.slice(0, 3).forEach((entry, i) => {
                        const cardX = bx + pad + i * (topCardW + gap);
                        const cardY = topStartY;
                        const color = topColors[i];
                        const border = topBorders[i];
                        const cardG = trackContent(this.add.graphics().setDepth(depth + 3));
                        drawSystemPanel(cardG, cardX, cardY, topCardW, topCardH, {
                            cut: uv(8),
                            fill: i === 0 ? 0x17110b : SYSTEM.BG_PANEL,
                            fillAlpha: i === 0 ? 0.96 : 0.9,
                            border,
                            borderAlpha: i === 0 ? 1 : 0.78,
                            borderWidth: i === 0 ? 2 : 1,
                        });
                        cardG.lineStyle(1, border, 0.26);
                        cardG.lineBetween(cardX + uv(10), cardY + topCardH - uv(9), cardX + topCardW - uv(10), cardY + topCardH - uv(9));

                        trackContent(this.add.text(cardX + topCardW / 2, cardY + uv(isPortrait ? 25 : 20), `#0${i + 1}`, {
                            fontSize: fs(isPortrait ? 15 : 14),
                            fontFamily: UI_FONT_MONO,
                            fontStyle: 'bold',
                            color,
                        }).setOrigin(0.5).setDepth(depth + 4));
                        const name = trackContent(this.add.text(cardX + topCardW / 2, cardY + uv(isPortrait ? 66 : 50), entry.player_name || 'UNKNOWN', {
                            fontSize: fs(isPortrait ? 11 : 11),
                            fontFamily: UI_FONT_KR,
                            fontStyle: i === 0 ? 'bold' : 'normal',
                            color: i === 0 ? SYSTEM.TEXT_BRIGHT : color,
                        }).setOrigin(0.5).setDepth(depth + 4));
                        this._fitText(name, topCardW - uv(18), uv(26));
                        trackContent(this.add.text(cardX + topCardW / 2, cardY + topCardH - uv(isPortrait ? 36 : 26), formatTime(entry.score), {
                            fontSize: fs(isPortrait ? 13 : 12),
                            fontFamily: UI_FONT_MONO,
                            fontStyle: 'bold',
                            color,
                        }).setOrigin(0.5).setDepth(depth + 4));
                    });

                    const startY = topStartY + topCardH + uv(isPortrait ? 28 : 22);
                    const maxH = by + boxH - uv(88) - startY;
                    const rowH = Math.min(uv(isPortrait ? 44 : 24), maxH / Math.max(1, rankings.length - 2));
                    const hStyle = { fontSize: fs(10), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN_DIM };
                    let y = startY;
                    trackContent(this.add.text(bx + uv(26), y, 'RANK', hStyle).setDepth(depth + 2));
                    trackContent(this.add.text(bx + uv(72), y, 'NAME', hStyle).setDepth(depth + 2));
                    trackContent(this.add.text(bx + boxW - uv(26), y, t('scoreLabel'), hStyle).setOrigin(1, 0).setDepth(depth + 2));

                    y += rowH;
                    const hdiv = trackContent(this.add.graphics().setDepth(depth + 2));
                    hdiv.lineStyle(1, SYSTEM.BORDER_DIM, 0.6);
                    hdiv.lineBetween(bx + uv(18), y, bx + boxW - uv(18), y);
                    y += 4;

                    rankings.forEach((entry, i) => {
                        if (y + rowH > startY + maxH) return;
                        const colors = [SYSTEM.TEXT_GOLD, '#c8d0dc', '#d18b4a'];
                        const color = i < 3 ? colors[i] : SYSTEM.TEXT_CYAN_DIM;
                        const rankLabel = `#${String(i + 1).padStart(2, '0')}`;
                        const fSize = fs(isPortrait ? 11 : Math.min(12, rowH * 0.55));
                        const bold = i < 3 ? 'bold' : 'normal';
                        if (i % 2 === 0) {
                            const rowG = trackContent(this.add.graphics().setDepth(depth + 2));
                            rowG.fillStyle(i < 3 ? 0x19120a : 0x07101a, i < 3 ? 0.26 : 0.18);
                            rowG.fillRect(bx + uv(18), y - uv(2), boxW - uv(36), rowH);
                        }

                        trackContent(this.add.text(bx + uv(26), y, rankLabel, {
                            fontSize: fSize, fontFamily: UI_FONT_MONO, fontStyle: bold, color,
                        }).setDepth(depth + 2));
                        const nT = trackContent(this.add.text(bx + uv(72), y, entry.player_name, {
                            fontSize: fSize, fontFamily: UI_FONT_KR, fontStyle: bold, color,
                        }).setDepth(depth + 2));
                        this._fitText(nT, boxW - uv(190), rowH);
                        trackContent(this.add.text(bx + boxW - uv(26), y, formatTime(entry.score), {
                            fontSize: fSize, fontFamily: UI_FONT_MONO, fontStyle: bold, color,
                        }).setOrigin(1, 0).setDepth(depth + 2));
                        y += rowH;
                    });
                })
                .catch(() => {
                    if (isClosed() || seq !== requestSeq) return;
                    if (loadingText && loadingText.active) {
                        loadingText.setText('▶  SYSTEM · ERROR');
                        loadingText.setColor(SYSTEM.TEXT_RED);
                    }
                });
        };

        renderRanking(activeCharacterId);
    }

    update() {}
}
