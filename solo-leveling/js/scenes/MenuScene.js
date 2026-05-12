import {
    GAME_WIDTH, GAME_HEIGHT,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR,
    fs, uv, drawSystemPanel, padText,
} from '../utils/Constants.js';
import { SpriteFactory } from '../utils/SpriteFactory.js';
import { SoundManager } from '../managers/SoundManager.js';
import { t, LANG, LANGUAGES, setLang, GAME_API_URL, GAME_ID_SHADOW } from '../utils/i18n.js';
import { GameScene } from './GameScene.js';
import { CHARACTER_DEFS, getCharacter, getStoredCharacterId, setStoredCharacterId, getCharacterRankingGameId } from '../utils/Characters.js';
import { getGameplayAssetList } from '../utils/AssetManifest.js';
import { getCharacterMenuLabels, getCharacterText } from '../utils/CharacterLocalization.js';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        this._registerResponsiveRebuild();
        this._createCleanMenu();
    }

    _registerResponsiveRebuild() {
        this._onMenuResize = () => {
            if (this._startingGame) return;
            if (this._resizeRefreshTimer) this._resizeRefreshTimer.remove(false);
            this._resizeRefreshTimer = this.time.delayedCall(80, () => {
                this._resizeRefreshTimer = null;
                this.scene.restart();
            });
        };
        this.events.on('game-resize', this._onMenuResize, this);
        this.events.once('shutdown', () => {
            if (this._resizeRefreshTimer) {
                this._resizeRefreshTimer.remove(false);
                this._resizeRefreshTimer = null;
            }
            if (this._onMenuResize) {
                this.events.off('game-resize', this._onMenuResize, this);
                this._onMenuResize = null;
            }
        });
    }

    _createLegacyMenu() {
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
                letterSpacing: 0,
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

        const startGame = async (resume = false, characterIdOverride = null) => {
            if (this._startingGame) return;
            this._startingGame = true;
            const characterId = resume
                ? (characterIdOverride || this.selectedCharacterId)
                : setStoredCharacterId(characterIdOverride || this.selectedCharacterId);
            this.selectedCharacterId = characterId;
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

        // ── Main action buttons ─────────────────
        const hasSave = GameScene.hasSavedGame();
        const btnW = Math.min(uv(isNarrow ? 330 : 300), GAME_WIDTH - sidePad * 2);
        const startH = uv(isShortLandscape ? 44 : 52);
        const resumeH = uv(isShortLandscape ? 54 : 64);
        const actionGap = uv(isShortLandscape ? 8 : 12);
        const actionTop = Math.max(
            panelY + panelH + uv(isShortLandscape ? 24 : 38),
            cy(hasSave ? 0.56 : 0.60)
        );
        let nextActionY = actionTop;

        if (hasSave) {
            const summary = GameScene.getSavedSummary();
            const savedText = getCharacterText(getCharacter(summary?.characterId));
            const min = Math.floor((summary?.timeSec || 0) / 60).toString().padStart(2, '0');
            const sec = ((summary?.timeSec || 0) % 60).toString().padStart(2, '0');
            this._makeResumeButton(centerX - btnW / 2, nextActionY, btnW, resumeH, {
                title: t('continueGame'),
                meta: `${savedText.name}  LV.${String(summary?.level || 1).padStart(2, '0')}  ·  ${min}:${sec}`.trim(),
                isNarrow,
                onClick: () => startGame(true),
            });
            nextActionY += resumeH + actionGap;
        }

        this._makeButton(centerX - btnW / 2, nextActionY, btnW, startH, {
            label: t('startGame'),
            labelColor: SYSTEM.TEXT_BRIGHT,
            border: SYSTEM.BORDER,
            labelSize: isNarrow ? 16 : 19,
            labelFont: UI_FONT_KR,
            primary: true,
            onClick: () => this._showCharacterSelectModal((characterId) => startGame(false, characterId)),
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

    _createCleanMenu() {
        const alLink = document.getElementById('archerlab-link');
        if (alLink) alLink.style.display = 'none';

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const viewportW = window.innerWidth || GAME_WIDTH;
        const viewportH = window.innerHeight || GAME_HEIGHT;
        const isPortrait = viewportH > viewportW || GAME_HEIGHT > GAME_WIDTH;
        const isShortLandscape = !isPortrait && ((viewportH <= 620 && viewportW > viewportH) || GAME_HEIGHT <= 620);
        const isCompact = isPortrait || GAME_WIDTH < 980 || isShortLandscape;

        this._modalElements = [];
        this._dropdownElements = [];
        this._startingGame = false;
        this._characterSelectOpen = false;
        this.selectedCharacterId = getStoredCharacterId();

        this._createMenuBackdrop({ isPortrait, isShortLandscape });

        const safe = uv(isCompact ? 24 : 48);
        const contentX = isCompact ? safe : Math.max(safe, GAME_WIDTH * 0.08);
        const contentW = isCompact
            ? GAME_WIDTH - safe * 2
            : Math.min(uv(470), GAME_WIDTH * 0.38);
        const topY = isPortrait ? uv(72) : (isShortLandscape ? uv(44) : GAME_HEIGHT * 0.16);
        const headerX = isPortrait ? GAME_WIDTH / 2 : contentX;
        const headerOriginX = isPortrait ? 0.5 : 0;

        const startGame = async (resume = false, characterIdOverride = null) => {
            if (this._startingGame) return;
            this._startingGame = true;
            const characterId = resume
                ? (GameScene.getSavedSummary()?.characterId || characterIdOverride || this.selectedCharacterId)
                : setStoredCharacterId(characterIdOverride || this.selectedCharacterId);
            this.selectedCharacterId = characterId;
            if (!this.game._soundManager) {
                this.game._soundManager = new SoundManager();
                this.game._soundManager.init();
            }
            const sm = this.game._soundManager;
            sm.stopIntroMusic();
            await sm.resume(true);
            await this._ensureGameplayAssetsLoaded(characterId);
            this.cameras.main.fadeOut(380, 0, 0, 0);
            this.time.delayedCall(380, () => this.scene.start('GameScene', { resume, characterId }));
        };

        if (!isPortrait) {
            const tag = this.add.text(headerX, topY, '[ SYSTEM ONLINE ]', {
                fontSize: fs(isCompact ? 10 : 11),
                fontFamily: UI_FONT_MONO,
                color: SYSTEM.TEXT_CYAN_DIM,
                letterSpacing: 0,
                align: 'left',
            }).setOrigin(headerOriginX, 0).setDepth(4);
            this._fitText(tag, contentW, uv(24));
        }

        const title = this.add.text(headerX, topY + uv(isCompact ? 42 : 52), t('title'), {
            fontSize: fs(isShortLandscape ? 30 : (isPortrait ? 44 : 58)),
            fontFamily: UI_FONT_KR,
            fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
            stroke: '#02040a',
            strokeThickness: 5,
            align: isPortrait ? 'center' : 'left',
        }).setOrigin(headerOriginX, 0.5).setDepth(4);
        this._fitText(title, contentW, uv(isCompact ? 58 : 72));

        const subtitle = this.add.text(headerX + (isPortrait ? 0 : uv(2)), topY + uv(isCompact ? 86 : 104), t('subtitle').replace(/\s+/g, ''), {
            fontSize: fs(isShortLandscape ? 11 : 13),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN,
            stroke: '#02040a',
            strokeThickness: 2,
            letterSpacing: 0,
            align: isPortrait ? 'center' : 'left',
        }).setOrigin(headerOriginX, 0).setDepth(4);
        this._fitText(subtitle, contentW, uv(24));

        if (!isShortLandscape) {
            const notice = this.add.text(headerX, topY + uv(isPortrait ? 126 : 144), t('menuMsg3'), {
                fontSize: fs(isPortrait ? 12 : 13),
                fontFamily: UI_FONT_KR,
                color: SYSTEM.TEXT_CYAN_DIM,
                stroke: '#02040a',
                strokeThickness: 2,
                lineSpacing: 4,
                align: isPortrait ? 'center' : 'left',
            }).setOrigin(headerOriginX, 0).setDepth(4);
            this._fitText(notice, contentW, uv(30));
        }

        const hasSave = GameScene.hasSavedGame();
        const btnW = Math.min(contentW, uv(isPortrait ? 430 : (isCompact ? 420 : 340)));
        const btnX = isPortrait ? (GAME_WIDTH - btnW) / 2 : contentX;
        const secondaryW = Math.min(btnW * (isPortrait ? 0.88 : 0.84), uv(isPortrait ? 390 : 300));
        const secondaryX = isPortrait ? (GAME_WIDTH - secondaryW) / 2 : contentX + (btnW - secondaryW) / 2;
        const primaryH = Math.round(Math.min(
            uv(isShortLandscape ? 74 : (isPortrait ? 116 : 94)),
            Math.max(uv(isShortLandscape ? 52 : 76), btnW / 3.79)
        ));
        const secondaryH = Math.round(Math.min(
            uv(isShortLandscape ? 52 : (isPortrait ? 86 : 72)),
            Math.max(uv(isShortLandscape ? 38 : 54), secondaryW / 3.32)
        ));
        const resumeH = Math.round(Math.min(
            uv(isShortLandscape ? 78 : (isPortrait ? 108 : 96)),
            Math.max(uv(isShortLandscape ? 56 : 72), btnW / 3.79)
        ));
        const gap = uv(isShortLandscape ? 10 : 16);
        let actionY;
        if (isPortrait) {
            const actionStackH = (hasSave ? resumeH + gap : 0) + primaryH + gap + secondaryH;
            const targetY = GAME_HEIGHT * (hasSave ? 0.39 : 0.47);
            const minY = topY + uv(isShortLandscape ? 156 : 296);
            actionY = Math.min(GAME_HEIGHT - uv(260) - actionStackH, Math.max(targetY, minY));
        } else if (isShortLandscape) {
            const actionStackH = primaryH + gap + secondaryH;
            actionY = Math.min(GAME_HEIGHT - uv(24) - actionStackH, topY + uv(128));
        } else {
            actionY = GAME_HEIGHT - uv(232);
        }
        if (hasSave) actionY -= resumeH + gap;

        if (hasSave) {
            const summary = GameScene.getSavedSummary();
            const savedCharacter = getCharacter(summary?.characterId);
            const savedText = getCharacterText(savedCharacter);
            const min = Math.floor((summary?.timeSec || 0) / 60).toString().padStart(2, '0');
            const sec = ((summary?.timeSec || 0) % 60).toString().padStart(2, '0');
            this._makeMenuResumeButton(btnX, actionY, btnW, resumeH, {
                title: t('continueGame'),
                meta: `${savedText.name}  LV.${String(summary?.level || 1).padStart(2, '0')}  |  ${min}:${sec}`.trim(),
                isNarrow: isCompact,
                onClick: () => startGame(true),
            });
            actionY += resumeH + gap;
        }

        this._makeMenuButton(btnX, actionY, btnW, primaryH, {
            label: t('startGame'),
            labelColor: SYSTEM.TEXT_BRIGHT,
            labelSize: isShortLandscape ? 16 : (isPortrait ? 21 : 19),
            labelFont: UI_FONT_KR,
            primary: true,
            onClick: () => this._showCharacterSelectModal((characterId) => startGame(false, characterId)),
        });

        this._makeMenuButton(secondaryX, actionY + primaryH + gap, secondaryW, secondaryH, {
            label: t('hallOfFame'),
            labelColor: SYSTEM.TEXT_GOLD,
            labelSize: isShortLandscape ? 11 : (isPortrait ? 14 : 13),
            labelFont: UI_FONT_KR,
            onClick: () => this._showHallOfFame(isMobile),
        });

        this._createLanguageDropdown(isMobile);
        this.cameras.main.fadeIn(380, 0, 0, 0);

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

    _createCommercialMenu() {
        const alLink = document.getElementById('archerlab-link');
        if (alLink) alLink.style.display = '';

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isPortrait = GAME_HEIGHT > GAME_WIDTH;
        const isShortLandscape = !isPortrait && GAME_HEIGHT <= 620;
        const isCompactMenu = isPortrait || GAME_WIDTH < 920 || isShortLandscape;

        this._modalElements = [];
        this._dropdownElements = [];
        this._startingGame = false;
        this._characterSelectOpen = false;
        this.selectedCharacterId = getStoredCharacterId();

        this._createMenuBackdrop({ isPortrait, isShortLandscape });

        const centerX = GAME_WIDTH / 2;
        const safePad = uv(isCompactMenu ? 18 : 34);
        const panelW = isCompactMenu
            ? Math.min(GAME_WIDTH - safePad * 2, uv(540))
            : Math.min(uv(500), GAME_WIDTH * 0.4);
        const panelH = isShortLandscape
            ? GAME_HEIGHT - uv(48)
            : (isPortrait ? Math.min(GAME_HEIGHT - uv(138), uv(640)) : Math.min(GAME_HEIGHT - uv(118), uv(650)));
        const panelX = isCompactMenu
            ? centerX - panelW / 2
            : Math.max(safePad, GAME_WIDTH * 0.065);
        const panelY = isShortLandscape
            ? uv(22)
            : (isPortrait ? uv(48) : (GAME_HEIGHT - panelH) / 2);

        this._addBitmapPanel(panelX, panelY, panelW, panelH, {
            key: 'ui_panel_cyan',
            alpha: isPortrait ? 0.88 : 0.82,
            depth: 2,
            tint: 0xb7ddff,
        });
        this.add.rectangle(panelX + panelW / 2, panelY + panelH / 2, panelW - uv(12), panelH - uv(12), 0x020713, 0.54)
            .setDepth(2.2);

        const topTag = this.add.text(panelX + uv(24), panelY + uv(18), '[ SYSTEM ONLINE ]', {
            fontSize: fs(isCompactMenu ? 9 : 10),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN_DIM,
            letterSpacing: 0,
        }).setDepth(4);
        this._fitText(topTag, panelW - uv(48), uv(20));

        const titleY = panelY + uv(isShortLandscape ? 48 : 72);
        const titleText = this.add.text(panelX + uv(24), titleY, t('title'), {
            fontSize: fs(isShortLandscape ? 30 : (isPortrait ? 42 : 50)),
            fontFamily: UI_FONT_KR,
            fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
            stroke: '#02040a',
            strokeThickness: 5,
        }).setOrigin(0, 0.5).setDepth(4);
        this._fitText(titleText, panelW - uv(48), uv(isShortLandscape ? 48 : 66));

        const subText = this.add.text(panelX + uv(26), titleY + uv(isShortLandscape ? 31 : 44), t('subtitle'), {
            fontSize: fs(isShortLandscape ? 10 : 12),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN,
            letterSpacing: 0,
        }).setDepth(4);
        this._fitText(subText, panelW - uv(52), uv(18));

        if (!isShortLandscape) {
            const notice = this.add.text(panelX + uv(26), titleY + uv(isPortrait ? 78 : 84), t('menuMsg3'), {
                fontSize: fs(isPortrait ? 12 : 13),
                fontFamily: UI_FONT_KR,
                color: SYSTEM.TEXT_CYAN_DIM,
            }).setDepth(4);
            this._fitText(notice, panelW - uv(52), uv(24));
        }

        const hasSave = GameScene.hasSavedGame();
        const primaryH = uv(isShortLandscape ? 42 : 54);
        const resumeH = uv(isShortLandscape ? 52 : 64);
        const secondaryH = uv(isShortLandscape ? 32 : 38);
        const gap = uv(isShortLandscape ? 8 : 11);
        const btnW = panelW - uv(isCompactMenu ? 46 : 56);
        const btnX = panelX + (panelW - btnW) / 2;
        const bottomGuard = isPortrait ? uv(44) : uv(26);
        const actionBottom = Math.min(panelY + panelH - uv(isShortLandscape ? 18 : 28), GAME_HEIGHT - bottomGuard);
        let actionY = actionBottom - primaryH - gap - secondaryH;
        if (hasSave) actionY -= resumeH + gap;

        const summaryH = uv(isShortLandscape ? 72 : (isPortrait ? 104 : 116));
        const summaryY = Math.min(
            panelY + uv(isShortLandscape ? 96 : (isPortrait ? 176 : 188)),
            actionY - summaryH - uv(isShortLandscape ? 10 : 16)
        );
        if (summaryY > panelY + uv(88)) {
            this._createSelectedHunterSummary(panelX + uv(22), summaryY, panelW - uv(44), summaryH, {
                isCompactMenu,
                isShortLandscape,
            });
        }

        const startGame = async (resume = false, characterIdOverride = null) => {
            if (this._startingGame) return;
            this._startingGame = true;
            const characterId = resume
                ? (characterIdOverride || this.selectedCharacterId)
                : setStoredCharacterId(characterIdOverride || this.selectedCharacterId);
            this.selectedCharacterId = characterId;
            if (!this.game._soundManager) {
                this.game._soundManager = new SoundManager();
                this.game._soundManager.init();
            }
            const sm = this.game._soundManager;
            sm.stopIntroMusic();
            await sm.resume(true);
            this.cameras.main.fadeOut(420, 0, 0, 0);
            this.time.delayedCall(420, () => this.scene.start('GameScene', { resume, characterId }));
        };

        if (hasSave) {
            const summary = GameScene.getSavedSummary();
            const savedText = getCharacterText(getCharacter(summary?.characterId));
            const min = Math.floor((summary?.timeSec || 0) / 60).toString().padStart(2, '0');
            const sec = ((summary?.timeSec || 0) % 60).toString().padStart(2, '0');
            this._makeMenuResumeButton(btnX, actionY, btnW, resumeH, {
                title: t('continueGame'),
                meta: `${savedText.name}  LV.${String(summary?.level || 1).padStart(2, '0')}  |  ${min}:${sec}`.trim(),
                isNarrow: isCompactMenu,
                onClick: () => startGame(true),
            });
            actionY += resumeH + gap;
        }

        this._makeMenuButton(btnX, actionY, btnW, primaryH, {
            label: t('startGame'),
            labelColor: SYSTEM.TEXT_BRIGHT,
            border: SYSTEM.BORDER,
            labelSize: isShortLandscape ? 15 : 18,
            labelFont: UI_FONT_KR,
            primary: true,
            onClick: () => this._showCharacterSelectModal((characterId) => startGame(false, characterId)),
        });
        actionY += primaryH + gap;

        this._makeMenuButton(btnX, actionY, btnW, secondaryH, {
            label: t('hallOfFame'),
            labelColor: SYSTEM.TEXT_GOLD,
            border: SYSTEM.BORDER_GOLD,
            labelSize: isShortLandscape ? 10 : 12,
            labelFont: UI_FONT_MONO,
            onClick: () => this._showHallOfFame(isMobile),
        });

        if (!isCompactMenu) {
            const controls = `${t('controlsPC')}  |  ${t('controlsPC2')}`;
            const controlsText = this.add.text(panelX + uv(24), panelY + panelH - uv(14), controls, {
                fontSize: fs(9),
                fontFamily: UI_FONT_MONO,
                color: SYSTEM.TEXT_MUTED,
            }).setOrigin(0, 1).setDepth(4);
            this._fitText(controlsText, panelW - uv(48), uv(16));
        }

        if (!isCompactMenu) {
            this._createHeroFocus(centerX, (pct) => GAME_HEIGHT * pct, { isPortrait, isShortLandscape });
        } else if (isPortrait) {
            this._createMobileHeroPortrait(panelX + panelW / 2, summaryY + uv(150), { isShortLandscape });
        } else if (isShortLandscape) {
            this._createMobileHeroPortrait(panelX + panelW / 2, Math.max(panelY + uv(112), summaryY - uv(58)), { isShortLandscape });
        }

        if (!isPortrait && !isShortLandscape) {
            const contactBtn = this.add.text(GAME_WIDTH - safePad, GAME_HEIGHT - uv(22), `[ ${t('contact')} ]`, {
                fontSize: fs(10),
                fontFamily: UI_FONT_MONO,
                color: SYSTEM.TEXT_MUTED,
            }).setOrigin(1, 1).setDepth(8).setInteractive({ useHandCursor: true });
            contactBtn.on('pointerover', () => contactBtn.setColor(SYSTEM.TEXT_CYAN));
            contactBtn.on('pointerout', () => contactBtn.setColor(SYSTEM.TEXT_MUTED));
            contactBtn.on('pointerdown', () => this._showContactModal());
        }

        this._createLanguageDropdown(isMobile);
        this.cameras.main.fadeIn(420, 0, 0, 0);

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

    _addBitmapPanel(x, y, w, h, { key = 'ui_panel_cyan', alpha = 1, depth = 0, tint = null } = {}) {
        if (this.textures.exists(key)) {
            const panel = this.add.image(x, y, key)
                .setOrigin(0, 0)
                .setDisplaySize(w, h)
                .setAlpha(alpha)
                .setDepth(depth);
            if (tint !== null) panel.setTint(tint);
            return panel;
        }
        return this.add.rectangle(x + w / 2, y + h / 2, w, h, SYSTEM.BG_PANEL, alpha)
            .setDepth(depth);
    }

    _addMenuIcon(key, x, y, size, depth, alpha = 1) {
        if (!this.textures.exists(key)) return null;
        return this.add.image(x, y, key)
            .setOrigin(0.5)
            .setDisplaySize(size, size)
            .setAlpha(alpha)
            .setDepth(depth);
    }

    _getCharacterPortraitTexture(character) {
        const menuKey = `char_${character.assetKey}_menu_portrait`;
        const portraitKey = `char_${character.assetKey}_portrait`;
        if (this.textures.exists(menuKey)) return menuKey;
        if (this.textures.exists(portraitKey)) return portraitKey;
        return 'player_idle_0';
    }

    _supportsWebP() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            return canvas.toDataURL('image/webp').startsWith('data:image/webp');
        } catch (e) {
            return false;
        }
    }

    _queueRuntimeImage(key, pngPath, fallbackMap = null) {
        if (this.textures.exists(key)) return false;
        const useWebP = this._supportsWebP() && pngPath.endsWith('.png');
        const path = useWebP ? pngPath.replace(/\.png$/i, '.webp') : pngPath;
        if (useWebP && fallbackMap) fallbackMap.set(key, pngPath);
        this.load.image(key, path);
        return true;
    }

    _ensureGameplayAssetsLoaded(characterId) {
        const fallbackMap = new Map();
        const pendingKeys = new Set();
        const queued = getGameplayAssetList(characterId)
            .filter((asset) => {
                if (this.textures.exists(asset.key) || pendingKeys.has(asset.key)) return false;
                pendingKeys.add(asset.key);
                return this._queueRuntimeImage(asset.key, asset.path, fallbackMap);
            });

        if (queued.length === 0) {
            SpriteFactory.createAll(this);
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x02040a, 0.58)
                .setDepth(218)
                .setInteractive();
            const loadingIcon = this._addMenuIcon('icon_loading_core', GAME_WIDTH / 2, GAME_HEIGHT / 2 - uv(58), uv(46), 220, 0.95);
            if (loadingIcon) {
                loadingIcon.setBlendMode(Phaser.BlendModes.ADD);
                this.tweens.add({
                    targets: loadingIcon,
                    angle: 360,
                    duration: 2800,
                    repeat: -1,
                    ease: 'Linear',
                });
            }
            const loading = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - uv(12), 'LOADING DUNGEON...', {
                fontSize: fs(13),
                fontFamily: UI_FONT_MONO,
                color: SYSTEM.TEXT_CYAN,
                stroke: '#02040a',
                strokeThickness: 3,
            }).setOrigin(0.5).setDepth(220);
            const progress = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + uv(18), '000 %', {
                fontSize: fs(10),
                fontFamily: UI_FONT_MONO,
                color: SYSTEM.TEXT_CYAN_DIM,
            }).setOrigin(0.5).setDepth(220);

            const onProgress = (value) => {
                progress.setText(String(Math.floor(value * 100)).padStart(3, '0') + ' %');
            };
            const onError = (file) => {
                const fallback = fallbackMap.get(file.key);
                if (fallback) {
                    fallbackMap.delete(file.key);
                    console.warn('WebP asset not loaded; falling back to PNG:', file.key);
                    this.load.image(file.key, fallback);
                    return;
                }
                console.warn('Gameplay asset not loaded:', file.key);
            };

            this.load.once('complete', () => {
                this.load.off('progress', onProgress);
                this.load.off('loaderror', onError);
                SpriteFactory.createAll(this);
                if (dim.active) dim.destroy();
                if (loadingIcon?.active) loadingIcon.destroy();
                if (loading.active) loading.destroy();
                if (progress.active) progress.destroy();
                resolve();
            });

            this.load.on('progress', onProgress);
            this.load.on('loaderror', onError);
            this.load.start();
        });
    }

    _createSelectedHunterSummary(x, y, w, h, { isCompactMenu = false, isShortLandscape = false } = {}) {
        const character = getCharacter(this.selectedCharacterId);
        const characterText = getCharacterText(character);
        const labels = getCharacterMenuLabels();
        this._addBitmapPanel(x, y, w, h, {
            key: this.textures.exists('hunter_card_selected') ? 'hunter_card_selected' : 'ui_card_cyan',
            alpha: 0.9,
            depth: 4,
            tint: null,
        });

        const portraitSize = Math.min(uv(isShortLandscape ? 42 : 58), h * 0.58);
        const portraitX = x + uv(isCompactMenu ? 44 : 54);
        const portraitY = y + h / 2;
        const portraitKey = this._getCharacterPortraitTexture(character);
        if (this.textures.exists(portraitKey)) {
            const portrait = this.add.image(portraitX, portraitY, portraitKey)
                .setDepth(6)
                .setOrigin(0.5);
            this._fitImageDisplay(portrait, portraitKey, portraitSize, portraitSize);
        }

        const textX = x + uv(isCompactMenu ? 86 : 108);
        const textW = x + w - uv(34) - textX;
        if (!isCompactMenu) {
            const tag = this.add.text(textX, y + uv(isShortLandscape ? 11 : 16), labels.selectedHunter, {
                fontSize: fs(8),
                fontFamily: UI_FONT_MONO,
                color: SYSTEM.TEXT_CYAN_DIM,
                letterSpacing: 0,
            }).setDepth(6);
            this._fitText(tag, textW, uv(16));
        }

        const name = this.add.text(textX, y + h * (isCompactMenu ? 0.4 : 0.5), characterText.name, {
            fontSize: fs(isShortLandscape ? 12 : 16),
            fontFamily: UI_FONT_KR,
            fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
        }).setOrigin(0, 0.5).setDepth(6);
        this._fitText(name, textW, h * 0.36);

        const meta = this.add.text(textX, y + h * (isCompactMenu ? 0.68 : 0.76), `${characterText.archetype}  |  ${labels.hp} ${character.stats.hp}  ${labels.attack} ${character.stats.attack}`, {
            fontSize: fs(isShortLandscape ? 8 : 10),
            fontFamily: UI_FONT_KR,
            color: character.accentText,
        }).setOrigin(0, 0.5).setDepth(6);
        this._fitText(meta, textW, h * 0.3);
    }

    _makeMenuResumeButton(x, y, w, h, { title, meta, isNarrow = false, onClick }) {
        const normalKey = this.textures.exists('start_button_primary')
            ? 'start_button_primary'
            : (this.textures.exists('start_button_primary_wide') ? 'start_button_primary_wide' : 'ui_panel_gold');
        const hoverKey = this.textures.exists('start_button_primary_hover')
            ? 'start_button_primary_hover'
            : (this.textures.exists('start_button_primary_wide_hover') ? 'start_button_primary_wide_hover' : normalKey);
        const bg = this._addBitmapPanel(x, y, w, h, {
            key: normalKey,
            alpha: 0.98,
            depth: 5,
            tint: null,
        });
        const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
            .setDepth(8)
            .setInteractive({ useHandCursor: true });
        const titleText = this.add.text(x + w / 2, y + h * 0.43, title, {
            fontSize: fs(isNarrow ? 17 : 19),
            fontFamily: UI_FONT_KR,
            fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
            stroke: '#02040a',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(7);
        const metaText = this.add.text(x + w / 2, y + h * 0.68, meta, {
            fontSize: fs(isNarrow ? 10 : 11),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN,
            stroke: '#02040a',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(7);
        const titleScale = this._fitText(titleText, w - uv(86), h * 0.36);
        const metaScale = this._fitText(metaText, w - uv(104), h * 0.22);

        hit.on('pointerover', () => {
            if (this.textures.exists(hoverKey)) bg.setTexture(hoverKey).setDisplaySize(w, h);
            bg.setAlpha(1);
            titleText.setScale(titleScale * 1.02);
            metaText.setScale(metaScale * 1.02);
        });
        hit.on('pointerout', () => {
            bg.setTexture(normalKey).setDisplaySize(w, h);
            bg.setAlpha(0.98);
            titleText.setScale(titleScale);
            metaText.setScale(metaScale);
        });
        hit.on('pointerdown', () => onClick && onClick());
    }

    _makeMenuButton(x, y, w, h, { label, labelColor, labelSize = 16, labelFont = UI_FONT_KR, primary = false, onClick }) {
        const preferredNormal = primary ? 'start_button_primary' : 'start_button_secondary';
        const preferredHover = primary ? 'start_button_primary_hover' : 'start_button_secondary_hover';
        const normalKey = this.textures.exists(preferredNormal)
            ? preferredNormal
            : (this.textures.exists(primary ? 'start_button_primary_wide' : 'start_button_secondary_wide')
                ? (primary ? 'start_button_primary_wide' : 'start_button_secondary_wide')
                : (primary ? 'ui_button_cyan' : 'ui_panel_gold'));
        const hoverKey = this.textures.exists(preferredHover)
            ? preferredHover
            : (this.textures.exists(primary ? 'start_button_primary_wide_hover' : 'start_button_secondary_wide_hover')
                ? (primary ? 'start_button_primary_wide_hover' : 'start_button_secondary_wide_hover')
                : (this.textures.exists('ui_button_hover') ? 'ui_button_hover' : normalKey));
        const bg = this._addBitmapPanel(x, y, w, h, {
            key: normalKey,
            alpha: primary ? 0.99 : 0.94,
            depth: 5,
            tint: null,
        });
        const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
            .setDepth(8)
            .setInteractive({ useHandCursor: true });
        const txt = this.add.text(x + w / 2, y + h / 2, label, {
            fontSize: fs(labelSize),
            fontFamily: labelFont,
            fontStyle: 'bold',
            color: labelColor,
            stroke: '#02040a',
            strokeThickness: primary ? 4 : 3,
        }).setOrigin(0.5).setDepth(7);
        const baseScale = this._fitText(txt, w - uv(primary ? 128 : 98), h * (primary ? 0.38 : 0.34));

        hit.on('pointerover', () => {
            if (this.textures.exists(hoverKey)) bg.setTexture(hoverKey).setDisplaySize(w, h);
            bg.setAlpha(1);
            txt.setScale(baseScale * 1.02);
        });
        hit.on('pointerout', () => {
            bg.setTexture(normalKey).setDisplaySize(w, h);
            bg.setAlpha(primary ? 0.99 : 0.94);
            txt.setScale(baseScale);
        });
        hit.on('pointerdown', () => onClick && onClick());
    }

    _createMobileHeroPortrait(x, y, { isShortLandscape = false } = {}) {
        const character = getCharacter(this.selectedCharacterId);
        const heroKey = this._getCharacterHeroTexture(character);
        if (!this.textures.exists(heroKey)) return;

        const size = uv(isShortLandscape ? 86 : 150);
        if (this.textures.exists('env_shadow_portal')) {
            const glow = this.add.image(x, y, 'env_shadow_portal')
                .setDepth(1)
                .setAlpha(0.14)
                .setScale(isShortLandscape ? 0.68 : 1.0)
                .setBlendMode(Phaser.BlendModes.ADD);
            this._heroPreviewAura = glow;
        }

        this._heroPreviewSprite = this.add.image(x, y, heroKey)
            .setDepth(3)
            .setAlpha(isShortLandscape ? 0.78 : 0.42);
        this._fitImageDisplay(this._heroPreviewSprite, heroKey, size, size * 1.12);
    }

    _createMenuBackdrop({ isPortrait = false, isShortLandscape = false } = {}) {
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, SYSTEM.BG_DEEP)
            .setDepth(-40);

        const bgKey = this.textures.exists('shadow_gate_backdrop') ? 'shadow_gate_backdrop' : 'ai_dungeon_atmosphere';
        if (this.textures.exists(bgKey)) {
            this._coverImage(bgKey, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT)
                .setDepth(-39)
                .setAlpha(1);
        }

        const leftShadeW = isPortrait ? GAME_WIDTH : GAME_WIDTH * 0.58;
        this.add.rectangle(leftShadeW / 2, GAME_HEIGHT / 2, leftShadeW, GAME_HEIGHT, 0x020611, isPortrait ? 0.3 : 0.38)
            .setDepth(-34);
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.08, GAME_WIDTH, GAME_HEIGHT * 0.2, 0x010309, isShortLandscape ? 0.28 : 0.14)
            .setDepth(-33);

        if (this.textures.exists('particle_glow')) {
            try {
                this.add.particles(GAME_WIDTH * (isPortrait ? 0.52 : 0.63), GAME_HEIGHT * 0.55, 'particle_glow', {
                    x: { min: -GAME_WIDTH * 0.42, max: GAME_WIDTH * 0.38 },
                    y: { min: -GAME_HEIGHT * 0.18, max: GAME_HEIGHT * 0.2 },
                    speed: { min: 3, max: 14 },
                    angle: { min: 245, max: 292 },
                    scale: { start: isPortrait ? 0.34 : 0.42, end: 0.04 },
                    alpha: { start: 0.14, end: 0 },
                    lifespan: { min: 2200, max: 5000 },
                    tint: [SYSTEM.BORDER, 0x7b5cff, 0xe8b64a],
                    blendMode: 'ADD',
                    frequency: isPortrait ? 220 : 165,
                    quantity: 1,
                }).setDepth(-18);
            } catch (e) { /* particles are decorative */ }
        }

        if (this.textures.exists('vignette')) {
            this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette')
                .setDepth(-10)
                .setDisplaySize(GAME_WIDTH * 1.24, GAME_HEIGHT * 1.24)
                .setAlpha(isPortrait ? 0.78 : 0.62);
        }
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

        const heroX = centerX + Math.min(GAME_WIDTH * 0.28, uv(390));
        const heroY = cy(0.52);
        const ringSize = Math.min(uv(440), GAME_HEIGHT * 0.56);

        if (this.textures.exists('env_shadow_portal')) {
            this._heroPreviewAura = this.add.image(heroX, heroY, 'env_shadow_portal')
                .setDepth(-16)
                .setAlpha(0.24)
                .setScale(ringSize / uv(260))
                .setBlendMode(Phaser.BlendModes.ADD);
        }

        this._heroPreviewRing = this.add.image(heroX, heroY + ringSize * 0.24, 'ui_minimap')
            .setDepth(-15)
            .setAlpha(0.28)
            .setDisplaySize(ringSize * 0.9, ringSize * 0.38)
            .setTint(0x73dfff)
            .setBlendMode(Phaser.BlendModes.ADD);

        this._heroPreviewSprite = this.add.image(heroX, heroY, 'char_original_shadow_monarch_portrait')
            .setDepth(-14)
            .setAlpha(0.9)
            .setDisplaySize(ringSize * 0.72, ringSize * 0.72);
        this._heroPreviewMaxW = ringSize * 0.72;
        this._heroPreviewMaxH = ringSize * 0.86;
        this._refreshHeroPreview();

        this.tweens.add({
            targets: [this._heroPreviewAura, this._heroPreviewRing].filter(Boolean),
            alpha: { from: 0.18, to: 0.32 },
            scale: '+=0.035',
            duration: 2400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    _refreshHeroPreview(character = getCharacter(this.selectedCharacterId)) {
        const texture = this._getCharacterHeroTexture(character);
        if (this._heroPreviewSprite?.active && this.textures.exists(texture)) {
            this._heroPreviewSprite.setTexture(texture);
            this._heroPreviewSprite.setAlpha(0.9);
            this._fitImageDisplay(
                this._heroPreviewSprite,
                texture,
                this._heroPreviewMaxW || uv(280),
                this._heroPreviewMaxH || uv(320)
            );
        }
        if (this._heroPreviewAura?.active && this._heroPreviewAura.setFillStyle) {
            this._heroPreviewAura.setFillStyle(character.accent, 0.04);
            this._heroPreviewAura.setStrokeStyle(1, character.accent, 0.2);
        } else if (this._heroPreviewAura?.active && this._heroPreviewAura.setTint) {
            this._heroPreviewAura.setTint(character.accent);
        }
        if (this._heroPreviewRing?.active && this._heroPreviewRing.setStrokeStyle) {
            this._heroPreviewRing.setStrokeStyle(2, character.accent, 0.28);
        } else if (this._heroPreviewRing?.active && this._heroPreviewRing.setTint) {
            this._heroPreviewRing.setTint(character.accent);
        }
    }

    _getCharacterHeroTexture(character) {
        return this._getCharacterPortraitTexture(character);
    }

    _fitImageDisplay(image, textureKey, maxW, maxH) {
        const source = this.textures.get(textureKey)?.getSourceImage?.();
        const iw = Math.max(source?.width || maxW, 1);
        const ih = Math.max(source?.height || maxH, 1);
        const scale = Math.min(maxW / iw, maxH / ih);
        image.setDisplaySize(iw * scale, ih * scale);
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
        if (!textObj) return 1;
        padText(textObj, 4, 5, 2, 2);
        if (typeof textObj.setLineSpacing === 'function') textObj.setLineSpacing(3);
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
            const characterText = getCharacterText(character);
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
            const portraitKey = this._getCharacterPortraitTexture(character);
            const portrait = this.add.image(x + cardW / 2, y + uv(isShortLandscape ? 22 : 28), portraitKey)
                .setDepth(depth + 1)
                .setOrigin(0.5);
            this._fitImageDisplay(portrait, portraitKey, portraitSize, portraitSize);

            const name = this.add.text(x + cardW / 2, y + uv(isShortLandscape ? 43 : 55), characterText.name, {
                fontSize: fs(isShortLandscape ? 10 : 12),
                fontFamily: UI_FONT_KR,
                fontStyle: 'bold',
                color: SYSTEM.TEXT_BRIGHT,
            }).setOrigin(0.5).setDepth(depth + 1);
            this._fitText(name, cardW - uv(12), uv(18));

            const role = this.add.text(x + cardW / 2, y + uv(isShortLandscape ? 58 : 72), characterText.archetype, {
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

    _showCharacterSelectModal(onSelect) {
        if (this._startingGame || this._characterSelectOpen) return;
        this._characterSelectOpen = true;

        const elements = [];
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const isPortrait = GAME_HEIGHT > GAME_WIDTH;
        const isShortLandscape = !isPortrait && GAME_HEIGHT <= 820 && GAME_WIDTH > 1180;
        const depth = 140;

        const dim = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.82)
            .setDepth(depth)
            .setInteractive();
        elements.push(dim);

        if (this.textures.exists('env_shadow_portal')) {
            const portal = this.add.image(cx, cy, 'env_shadow_portal')
                .setDepth(depth + 1)
                .setAlpha(isPortrait ? 0.18 : 0.14)
                .setScale(isPortrait ? 3.1 : 2.25)
                .setBlendMode(Phaser.BlendModes.ADD);
            elements.push(portal);
        }

        const boxW = isPortrait
            ? Math.min(GAME_WIDTH - uv(36), uv(560))
            : Math.min(GAME_WIDTH - uv(70), uv(isShortLandscape ? 1060 : 1080));
        const boxH = isPortrait
            ? Math.min(GAME_HEIGHT - uv(84), uv(800))
            : Math.min(GAME_HEIGHT - uv(70), uv(isShortLandscape ? 560 : 590));
        const bx = cx - boxW / 2;
        const by = cy - boxH / 2;

        let boxFrame;
        if (this.textures.exists('modal_frame_cyan')) {
            boxFrame = this._addBitmapPanel(bx, by, boxW, boxH, {
                key: 'modal_frame_cyan',
                alpha: 0.98,
                depth: depth + 2,
            });
        } else {
            boxFrame = this.add.graphics().setDepth(depth + 2);
            drawSystemPanel(boxFrame, bx, by, boxW, boxH, {
                cut: uv(14),
                fill: SYSTEM.BG_DEEP,
                fillAlpha: 0.985,
                border: SYSTEM.BORDER,
                borderAlpha: 0.95,
                borderWidth: 1,
            });
        }
        elements.push(boxFrame);

        const bodyShield = this.add.rectangle(cx, cy, boxW, boxH, 0x000000, 0)
            .setDepth(depth + 3)
            .setInteractive();
        elements.push(bodyShield);

        const title = this.add.text(cx, by + uv(isShortLandscape ? 38 : 42), '[ HUNTER SELECT ]', {
            fontSize: fs(isShortLandscape ? 18 : (isPortrait ? 18 : 22)),
            fontFamily: UI_FONT_MONO,
            fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN,
            stroke: '#02040a',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(depth + 5);
        elements.push(title);

        const hint = this.add.text(cx, by + uv(isShortLandscape ? 68 : 76), 'SELECT HUNTER TO ENTER', {
            fontSize: fs(isShortLandscape ? 10 : 11),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_BRIGHT,
            stroke: '#02040a',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(depth + 5);
        elements.push(hint);

        const characters = Object.values(CHARACTER_DEFS);
        const columns = isPortrait ? 2 : 3;
        const rows = Math.ceil(characters.length / columns);
        const gap = uv(isShortLandscape ? 14 : 16);
        const areaPadX = uv(isPortrait ? 34 : 68);
        const cardAreaTop = by + uv(isShortLandscape ? 104 : (isPortrait ? 114 : 122));
        const cardAreaW = boxW - areaPadX * 2;
        const cardAreaH = by + boxH - cardAreaTop - uv(isShortLandscape ? 76 : 84);
        const cardW = Math.floor(Math.min(
            uv(isPortrait ? 220 : (isShortLandscape ? 276 : 292)),
            (cardAreaW - gap * (columns - 1)) / columns
        ));
        const cardH = Math.floor(Math.min(
            uv(isPortrait ? 150 : (isShortLandscape ? 142 : 156)),
            (cardAreaH - gap * (rows - 1)) / rows
        ));

        const cardRefs = [];
        const redrawCard = (ref, hover = false) => {
            const selected = this.selectedCharacterId === ref.character.id;
            if (ref.bg) {
                const key = selected || hover ? 'hunter_card_selected' : 'hunter_card_normal';
                ref.bg.setTexture(key).setDisplaySize(ref.w, ref.h);
                ref.bg.setAlpha(selected ? 1 : (hover ? 0.96 : 0.82));
            } else if (ref.g) {
                ref.g.clear();
                drawSystemPanel(ref.g, ref.x, ref.y, ref.w, ref.h, {
                    cut: uv(8),
                    fill: selected || hover ? SYSTEM.BG_PANEL_HI : SYSTEM.BG_PANEL,
                    fillAlpha: selected ? 0.98 : (hover ? 0.94 : 0.84),
                    border: selected || hover ? ref.character.accent : SYSTEM.BORDER_DIM,
                    borderAlpha: selected ? 1 : (hover ? 0.9 : 0.58),
                    borderWidth: selected ? 2 : 1,
                });
            }
            if (ref.accentG) ref.accentG.clear();
            if (selected || hover) {
                const g = ref.accentG || ref.g;
                g.lineStyle(selected ? 3 : 2, ref.character.accent, selected ? 0.82 : 0.5);
                g.lineBetween(ref.x + uv(14), ref.y + ref.h - uv(10), ref.x + ref.w - uv(14), ref.y + ref.h - uv(10));
            }
        };
        const redrawCards = () => cardRefs.forEach(ref => redrawCard(ref, false));

        const closeAll = () => {
            if (!this._characterSelectOpen) return;
            this._characterSelectOpen = false;
            elements.forEach(el => { if (el && el.destroy) el.destroy(); });
            this._modalElements = this._modalElements.filter(el => !elements.includes(el));
        };

        characters.forEach((character, i) => {
            const characterText = getCharacterText(character);
            const col = i % columns;
            const row = Math.floor(i / columns);
            const rowCount = Math.min(columns, characters.length - row * columns);
            const rowStartX = cx - (cardW * rowCount + gap * (rowCount - 1)) / 2;
            const x = rowStartX + col * (cardW + gap);
            const y = cardAreaTop + row * (cardH + gap);
            const hasCardSkin = this.textures.exists('hunter_card_normal') && this.textures.exists('hunter_card_selected');
            const bg = hasCardSkin
                ? this._addBitmapPanel(x, y, cardW, cardH, { key: 'hunter_card_normal', alpha: 0.82, depth: depth + 4 })
                : null;
            const g = hasCardSkin ? null : this.add.graphics().setDepth(depth + 4);
            const accentG = this.add.graphics().setDepth(depth + 5);
            const hit = this.add.rectangle(x + cardW / 2, y + cardH / 2, cardW, cardH, 0x000000, 0)
                .setDepth(depth + 8)
                .setInteractive({ useHandCursor: true });
            const portraitSize = Math.min(uv(isShortLandscape ? 54 : 62), cardH * 0.42);
            const portraitKey = this._getCharacterPortraitTexture(character);
            const portrait = this.add.image(x + cardW / 2, y + cardH * 0.28, portraitKey)
                .setDepth(depth + 6)
                .setOrigin(0.5);
            this._fitImageDisplay(portrait, portraitKey, portraitSize, portraitSize);
            const name = this.add.text(x + cardW / 2, y + cardH * 0.53, characterText.name, {
                fontSize: fs(isShortLandscape ? 14 : 15),
                fontFamily: UI_FONT_KR,
                fontStyle: 'bold',
                color: SYSTEM.TEXT_BRIGHT,
                stroke: '#02040a',
                strokeThickness: 4,
            }).setOrigin(0.5).setDepth(depth + 6);
            this._fitText(name, cardW - uv(14), cardH * 0.18);
            const role = this.add.text(x + cardW / 2, y + cardH * 0.66, characterText.archetype, {
                fontSize: fs(isShortLandscape ? 10 : 11),
                fontFamily: UI_FONT_KR,
                color: character.accentText,
                stroke: '#02040a',
                strokeThickness: 3,
            }).setOrigin(0.5).setDepth(depth + 6);
            this._fitText(role, cardW - uv(14), cardH * 0.14);
            const stat = this.add.text(x + cardW / 2, y + cardH * 0.78, `HP ${character.stats.hp}  ATK ${character.stats.attack}`, {
                fontSize: fs(isShortLandscape ? 10 : 11),
                fontFamily: UI_FONT_MONO,
                color: SYSTEM.TEXT_CYAN,
                stroke: '#02040a',
                strokeThickness: 3,
            }).setOrigin(0.5).setDepth(depth + 6);
            this._fitText(stat, cardW - uv(20), cardH * 0.14);

            const ref = { g, bg, accentG, hit, portrait, character, x, y, w: cardW, h: cardH };
            cardRefs.push(ref);
            elements.push(...[bg, g, accentG, hit, portrait, name, role, stat].filter(Boolean));

            hit.on('pointerover', () => {
                redrawCard(ref, true);
                portrait.setDisplaySize(portraitSize * 1.05, portraitSize * 1.05);
            });
            hit.on('pointerout', () => {
                portrait.setDisplaySize(portraitSize, portraitSize);
                redrawCard(ref, false);
            });
            hit.on('pointerdown', () => {
                if (this._startingGame) return;
                this.selectedCharacterId = setStoredCharacterId(character.id);
                if (this.game._soundManager) this.game._soundManager.play('select');
                this._refreshHeroPreview(character);
                closeAll();
                onSelect && onSelect(character.id);
            });
        });
        redrawCards();

        const closeBtn = this.add.text(cx, by + boxH - uv(isShortLandscape ? 42 : 46), `[ ${t('close')} ]`, {
            fontSize: fs(isShortLandscape ? 13 : 14),
            fontFamily: UI_FONT_MONO,
            fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT,
            stroke: '#02040a',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(depth + 8).setInteractive({ useHandCursor: true });
        elements.push(closeBtn);
        closeBtn.on('pointerover', () => closeBtn.setColor(SYSTEM.TEXT_CYAN));
        closeBtn.on('pointerout', () => closeBtn.setColor(SYSTEM.TEXT_MUTED));
        closeBtn.on('pointerdown', closeAll);
        dim.on('pointerdown', closeAll);

        this._modalElements.push(...elements);
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
        let boxFrame;
        if (this.textures.exists('modal_frame_cyan')) {
            boxFrame = this._addBitmapPanel(bx, by, boxW, boxH, {
                key: 'modal_frame_cyan',
                alpha: 0.98,
                depth: 101,
            });
        } else {
            boxFrame = this.add.graphics().setDepth(101);
            drawSystemPanel(boxFrame, bx, by, boxW, boxH, {
                cut: uv(12),
                fill: SYSTEM.BG_PANEL, fillAlpha: 0.97,
                border: SYSTEM.BORDER, borderWidth: 1,
            });
        }
        elements.push(boxFrame);

        const title = this.add.text(cx, by + uv(24), `[ ${t('contactTitle')} ]`, {
            fontSize: fs(14), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
        }).setOrigin(0.5).setDepth(102);
        elements.push(title);

        const desc = this.add.text(cx, by + uv(50), t('contactDesc'), {
            fontSize: fs(11), fontFamily: UI_FONT_KR, color: SYSTEM.TEXT_MUTED,
        }).setOrigin(0.5).setDepth(102);
        elements.push(desc);

        const mk = (y, iconKey, label, onClick) => {
            const bw = boxW - uv(40);
            const bh = uv(36);
            const bxi = cx - bw / 2;
            const normalKey = this.textures.exists('start_button_secondary_wide') ? 'start_button_secondary_wide' : 'ui_button_cyan';
            const hoverKey = this.textures.exists('start_button_secondary_wide_hover') ? 'start_button_secondary_wide_hover' : normalKey;
            const bg = this.textures.exists(normalKey)
                ? this._addBitmapPanel(bxi, y, bw, bh, { key: normalKey, alpha: 0.82, depth: 101 })
                : this.add.graphics().setDepth(101);
            const redraw = (h) => {
                if (bg.setTexture) {
                    bg.setTexture(h ? hoverKey : normalKey).setDisplaySize(bw, bh).setAlpha(h ? 1 : 0.82);
                    return;
                }
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
            const icon = this._addMenuIcon(iconKey, bxi + uv(26), y + bh / 2, Math.min(uv(24), bh * 0.68), 102, 0.96);
            const txt = this.add.text(bxi + uv(52), y + bh / 2, label, {
                fontSize: fs(13), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_BRIGHT,
            }).setOrigin(0, 0.5).setDepth(102);
            this._fitText(txt, bw - uv(66), bh - uv(8));
            hit.on('pointerover', () => redraw(true));
            hit.on('pointerout', () => redraw(false));
            hit.on('pointerdown', onClick);
            elements.push(...[bg, hit, icon, txt].filter(Boolean));
        };

        mk(by + uv(78), 'icon_kakao', t('contactKakao'), () => window.open('https://open.kakao.com/o/pF6xil6h', '_blank'));
        mk(by + uv(122), 'icon_mail', t('contactEmail'), () => window.open('mailto:hyungyu@archerlab.dev'));

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

        const isShortLandscape = !isPortrait && GAME_HEIGHT <= 820 && GAME_WIDTH > 1180;
        const boxW = isPortrait
            ? Math.min(GAME_WIDTH - uv(72), uv(560))
            : Math.min(uv(isShortLandscape ? 960 : 1040), GAME_WIDTH - uv(120));
        const boxH = isPortrait
            ? Math.min(uv(860), GAME_HEIGHT - uv(150))
            : Math.min(uv(isShortLandscape ? 660 : 720), GAME_HEIGHT - uv(82));
        const bx = cx - boxW / 2;
        const by = cy - boxH / 2;
        const safePadX = uv(isPortrait ? 72 : 116);
        const safeLeft = bx + safePadX;
        const safeRight = bx + boxW - safePadX;
        const safeW = safeRight - safeLeft;
        const safeTop = by + uv(isPortrait ? 100 : 78);
        const closeBtnH = uv(isPortrait ? 38 : 40);
        const closeBtnY = by + boxH - uv(isPortrait ? 86 : 78);
        const contentBottom = closeBtnY - uv(isPortrait ? 30 : 26);
        let boxFrame;
        if (this.textures.exists('modal_frame_gold')) {
            boxFrame = this._addBitmapPanel(bx, by, boxW, boxH, {
                key: 'modal_frame_gold',
                alpha: 0.98,
                depth: depth + 1,
            });
        } else {
            boxFrame = this.add.graphics().setDepth(depth + 1);
            drawSystemPanel(boxFrame, bx, by, boxW, boxH, {
                cut: uv(14),
                fill: SYSTEM.BG_DEEP, fillAlpha: 0.985,
                border: SYSTEM.BORDER_GOLD, borderWidth: 1,
            });
        }
        elements.push(boxFrame);

        const bodyShield = this.add.rectangle(cx, cy, boxW, boxH, 0x000000, 0)
            .setDepth(depth + 2)
            .setInteractive();
        elements.push(bodyShield);

        const innerShadeH = Math.max(uv(160), contentBottom - safeTop);
        const innerShade = this.add.rectangle(cx, safeTop + innerShadeH / 2, safeW, innerShadeH, 0x02040a, 0.54)
            .setDepth(depth + 1.4);
        elements.push(innerShade);

        const headerTag = this.add.text(cx, by + uv(isPortrait ? 104 : 82), '[ SYSTEM - RANKING ]', {
            fontSize: fs(isPortrait ? 11 : 12),
            fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN,
            stroke: '#02040a',
            strokeThickness: 3,
            letterSpacing: 0,
        }).setOrigin(0.5).setDepth(depth + 4);
        this._fitText(headerTag, safeW * 0.82, uv(24));
        elements.push(headerTag);

        const title = this.add.text(cx, by + uv(isPortrait ? 144 : 128), t('hallOfFame'), {
            fontSize: fs(isPortrait ? 28 : 34),
            fontFamily: UI_FONT_KR, color: SYSTEM.TEXT_GOLD,
            fontStyle: 'bold',
            stroke: '#02040a',
            strokeThickness: 5,
        }).setOrigin(0.5).setDepth(depth + 4);
        this._fitText(title, safeW * 0.9, uv(isPortrait ? 48 : 56));
        elements.push(title);

        const characters = Object.values(CHARACTER_DEFS);
        const tabGap = uv(isPortrait ? 10 : 10);
        const tabTop = by + uv(isPortrait ? 198 : 178);
        const tabH = uv(isPortrait ? 40 : 38);
        const tabColumns = isPortrait ? 2 : characters.length;
        const tabRows = Math.ceil(characters.length / tabColumns);
        const tabAreaW = safeW;
        const tabW = Math.floor((tabAreaW - tabGap * (tabColumns - 1)) / tabColumns);
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
                fillAlpha: selected ? 0.98 : (hover ? 0.94 : 0.86),
                border: selected ? ref.character.accent : (hover ? SYSTEM.BORDER : SYSTEM.BORDER_DIM),
                borderAlpha: selected ? 1 : (hover ? 0.9 : 0.72),
                borderWidth: selected ? 2 : 1,
            });
            ref.txt.setColor(selected ? ref.character.accentText : SYSTEM.TEXT_BRIGHT);
            ref.txt.setAlpha(selected ? 1 : (hover ? 0.96 : 0.74));
        };
        const redrawTabs = () => tabRefs.forEach(ref => drawTab(ref, false));

        characters.forEach((character, i) => {
            const characterText = getCharacterText(character);
            const col = i % tabColumns;
            const row = Math.floor(i / tabColumns);
            const rowCount = Math.min(tabColumns, characters.length - row * tabColumns);
            const rowStartX = cx - (tabW * rowCount + tabGap * (rowCount - 1)) / 2;
            const x = rowStartX + col * (tabW + tabGap);
            const y = tabTop + row * (tabH + tabGap);
            const g = this.add.graphics().setDepth(depth + 3);
            const hit = this.add.rectangle(x + tabW / 2, y + tabH / 2, tabW, tabH, 0x000000, 0)
                .setDepth(depth + 5)
                .setInteractive({ useHandCursor: true });
            const txt = this.add.text(x + tabW / 2, y + tabH / 2, characterText.name, {
                fontSize: fs(isPortrait ? 12 : 10),
                fontFamily: UI_FONT_KR,
                fontStyle: 'bold',
                color: SYSTEM.TEXT_BRIGHT,
                stroke: '#02040a',
                strokeThickness: 3,
            }).setOrigin(0.5).setDepth(depth + 5);
            this._fitText(txt, tabW - uv(10), tabH - uv(8));

            const ref = { g, hit, txt, character, x, y, w: tabW, h: tabH };
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
        const divY = tabTop + tabRows * tabH + (tabRows - 1) * tabGap + uv(isPortrait ? 16 : 12);
        divG.lineStyle(1, SYSTEM.BORDER_GOLD, 0.35);
        divG.lineBetween(safeLeft, divY, safeRight, divY);
        divG.lineStyle(1, SYSTEM.BORDER_DIM, 0.26);
        divG.lineBetween(safeLeft + uv(18), divY + uv(7), safeRight - uv(18), divY + uv(7));
        elements.push(divG);

        const makeModalButton = (x, y, w, h, label, onClick) => {
            const normalKey = this.textures.exists('start_button_secondary_wide')
                ? 'start_button_secondary_wide'
                : (this.textures.exists('start_button_secondary') ? 'start_button_secondary' : null);
            const hoverKey = this.textures.exists('start_button_secondary_wide_hover')
                ? 'start_button_secondary_wide_hover'
                : (this.textures.exists('start_button_secondary_hover') ? 'start_button_secondary_hover' : normalKey);
            const g = normalKey
                ? this._addBitmapPanel(x, y, w, h, { key: normalKey, alpha: 0.9, depth: depth + 3 })
                : this.add.graphics().setDepth(depth + 3);
            const redraw = (hover) => {
                if (g.setTexture) {
                    g.setTexture(hover && hoverKey ? hoverKey : normalKey).setDisplaySize(w, h).setAlpha(hover ? 1 : 0.9);
                    return;
                }
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
                fontSize: fs(12), fontFamily: UI_FONT_KR, fontStyle: 'bold', color: SYSTEM.TEXT_BRIGHT,
                stroke: '#02040a', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(depth + 5);
            this._fitText(txt, w - uv(18), h - uv(8));
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
        makeModalButton(cx - uv(74), closeBtnY, uv(148), closeBtnH, t('close'), closeAll);
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
            const loadingIcon = this._addMenuIcon('icon_loading_core', cx, cy - uv(30), uv(46), depth + 4, 0.9);
            let loadingTween = null;
            if (loadingIcon) {
                loadingIcon.setBlendMode(Phaser.BlendModes.ADD);
                trackContent(loadingIcon);
                loadingTween = this.tweens.add({
                    targets: loadingIcon,
                    angle: 360,
                    duration: 2600,
                    repeat: -1,
                    ease: 'Linear',
                });
            }
            const loadingText = trackContent(this.add.text(cx, cy + uv(28), t('loading'), {
                fontSize: fs(13), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_MUTED,
                stroke: '#02040a', strokeThickness: 2,
            }).setOrigin(0.5).setDepth(depth + 4));
            this._fitText(loadingText, boxW - uv(60), uv(30));

            const gameId = getCharacterRankingGameId(GAME_ID_SHADOW, characterId);
            fetch(`${GAME_API_URL}/rankings?game_id=${encodeURIComponent(gameId)}&limit=20`)
                .then(resp => resp.json())
                .then(data => {
                    if (isClosed() || seq !== requestSeq) return;
                    clearContent();
                    const rankings = data.rankings || [];
                    if (rankings.length === 0) {
                        const emptyIcon = this._addMenuIcon('icon_empty_record', cx, cy - uv(34), uv(54), depth + 4, 0.86);
                        if (emptyIcon) trackContent(emptyIcon);
                        const emptyText = trackContent(this.add.text(cx, cy + uv(28), t('noRecords'), {
                            fontSize: fs(15), fontFamily: UI_FONT_KR, color: SYSTEM.TEXT_BRIGHT,
                            stroke: '#02040a', strokeThickness: 4,
                        }).setOrigin(0.5).setDepth(depth + 4));
                        this._fitText(emptyText, boxW - uv(60), uv(30));
                        return;
                    }

                    const topStartY = divY + uv(isPortrait ? 28 : 24);
                    const gap = uv(isPortrait ? 14 : 22);
                    const topCount = isPortrait ? Math.min(1, rankings.length) : Math.min(3, rankings.length);
                    const topCardW = Math.min(
                        uv(isPortrait ? 252 : 208),
                        (safeW - gap * Math.max(0, topCount - 1)) / Math.max(1, topCount)
                    );
                    const topCardH = Math.min(uv(isPortrait ? 134 : 124), topCardW * 0.58);
                    const topTotalW = topCardW * topCount + gap * Math.max(0, topCount - 1);
                    const topStartX = cx - topTotalW / 2;
                    const topColors = [SYSTEM.TEXT_GOLD, '#cfd8e8', '#d18b4a'];
                    const topBorders = [SYSTEM.BORDER_GOLD, SYSTEM.BORDER, 0xd18b4a];

                    rankings.slice(0, topCount).forEach((entry, i) => {
                        const cardX = topStartX + i * (topCardW + gap);
                        const cardY = topStartY;
                        const color = topColors[i];
                        const border = topBorders[i];
                        const rankCardKey = `rank_card_${i + 1}`;
                        if (this.textures.exists(rankCardKey)) {
                            trackContent(this._addBitmapPanel(cardX, cardY, topCardW, topCardH, {
                                key: rankCardKey,
                                alpha: 0.98,
                                depth: depth + 3,
                            }));
                        } else {
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
                        }

                        const cardTextPadX = uv(isPortrait ? 30 : 24);
                        const placeText = trackContent(this.add.text(cardX + cardTextPadX, cardY + uv(isPortrait ? 24 : 22), `#0${i + 1}`, {
                            fontSize: fs(isPortrait ? 14 : 15),
                            fontFamily: UI_FONT_MONO,
                            fontStyle: 'bold',
                            color,
                            stroke: '#02040a',
                            strokeThickness: 4,
                        }).setOrigin(0, 0).setDepth(depth + 4));
                        this._fitText(placeText, topCardW * 0.34, uv(22));
                        const cardLabelW = topCardW - cardTextPadX * 2;
                        const nameY = cardY + topCardH * 0.44;
                        const scoreY = cardY + topCardH * 0.65;
                        trackContent(this.add.rectangle(cardX + topCardW / 2, nameY, cardLabelW, uv(isPortrait ? 24 : 22), 0x02040a, 0.5)
                            .setDepth(depth + 3.6));
                        trackContent(this.add.rectangle(cardX + topCardW / 2, scoreY, cardLabelW * 0.74, uv(isPortrait ? 23 : 21), 0x02040a, 0.52)
                            .setDepth(depth + 3.6));
                        const name = trackContent(this.add.text(cardX + topCardW / 2, nameY, entry.player_name || 'UNKNOWN', {
                            fontSize: fs(12),
                            fontFamily: UI_FONT_KR,
                            fontStyle: 'bold',
                            color: i === 0 ? SYSTEM.TEXT_BRIGHT : color,
                            stroke: '#02040a',
                            strokeThickness: 4,
                        }).setOrigin(0.5).setDepth(depth + 4));
                        this._fitText(name, cardLabelW, uv(22));
                        const scoreText = trackContent(this.add.text(cardX + topCardW / 2, scoreY, formatTime(entry.score), {
                            fontSize: fs(12),
                            fontFamily: UI_FONT_MONO,
                            fontStyle: 'bold',
                            color,
                            stroke: '#02040a',
                            strokeThickness: 4,
                        }).setOrigin(0.5).setDepth(depth + 4));
                        this._fitText(scoreText, cardLabelW * 0.74, uv(20));
                    });

                    const startY = topStartY + topCardH + uv(isPortrait ? 30 : 28);
                    const maxH = Math.max(uv(120), contentBottom - startY);
                    const visibleRowBudget = Math.min(rankings.length, isPortrait ? 7 : 9);
                    const rowH = Math.max(
                        uv(isPortrait ? 34 : 30),
                        Math.min(uv(isPortrait ? 42 : 36), maxH / Math.max(1, visibleRowBudget + 1))
                    );
                    const hStyle = { fontSize: fs(11), fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN, stroke: '#02040a', strokeThickness: 2 };
                    let y = startY;
                    const tableLeft = safeLeft + uv(isPortrait ? 12 : 18);
                    const tableRight = safeRight - uv(isPortrait ? 12 : 18);
                    const tableW = tableRight - tableLeft;
                    const rankX = tableLeft;
                    const nameX = tableLeft + uv(isPortrait ? 64 : 72);
                    const scoreX = tableRight;
                    const rankColW = uv(isPortrait ? 56 : 60);
                    const scoreColW = uv(isPortrait ? 90 : 94);
                    const nameColW = Math.max(uv(90), scoreX - scoreColW - nameX - uv(10));
                    const tableBgH = Math.max(rowH * 2, contentBottom - startY);
                    trackContent(this.add.rectangle(tableLeft + tableW / 2, startY + tableBgH / 2, tableW, tableBgH, 0x02040a, isPortrait ? 0.44 : 0.36)
                        .setDepth(depth + 1.8));
                    const rankHead = trackContent(this.add.text(rankX, y, 'RANK', hStyle).setDepth(depth + 2));
                    const nameHead = trackContent(this.add.text(nameX, y, 'NAME', hStyle).setDepth(depth + 2));
                    const scoreHead = trackContent(this.add.text(scoreX, y, t('scoreLabel'), hStyle).setOrigin(1, 0).setDepth(depth + 2));
                    this._fitText(rankHead, rankColW, rowH - uv(4));
                    this._fitText(nameHead, nameColW, rowH - uv(4));
                    this._fitText(scoreHead, scoreColW, rowH - uv(4));

                    y += rowH;
                    const hdiv = trackContent(this.add.graphics().setDepth(depth + 2));
                    hdiv.lineStyle(1, SYSTEM.BORDER_DIM, 0.6);
                    hdiv.lineBetween(tableLeft, y, tableRight, y);
                    y += 4;

                    rankings.forEach((entry, i) => {
                        if (y + rowH > startY + maxH) return;
                        const colors = [SYSTEM.TEXT_GOLD, '#c8d0dc', '#d18b4a'];
                        const color = i < 3 ? colors[i] : SYSTEM.TEXT_BRIGHT;
                        const rankLabel = `#${String(i + 1).padStart(2, '0')}`;
                        const fSize = fs(isPortrait ? 12 : Math.min(14, rowH * 0.6));
                        const bold = i < 3 ? 'bold' : 'normal';
                        if (i % 2 === 0) {
                            const rowG = trackContent(this.add.graphics().setDepth(depth + 2));
                            rowG.fillStyle(i < 3 ? 0x201506 : 0x07101a, i < 3 ? 0.42 : 0.34);
                            rowG.fillRect(tableLeft, y - uv(2), tableW, rowH);
                        }

                        const rowRankText = trackContent(this.add.text(rankX, y, rankLabel, {
                            fontSize: fSize, fontFamily: UI_FONT_MONO, fontStyle: bold, color,
                            stroke: '#02040a', strokeThickness: 3,
                        }).setDepth(depth + 2));
                        this._fitText(rowRankText, rankColW, rowH - uv(4));
                        const nT = trackContent(this.add.text(nameX, y, entry.player_name, {
                            fontSize: fSize, fontFamily: UI_FONT_KR, fontStyle: bold, color,
                            stroke: '#02040a', strokeThickness: 3,
                        }).setDepth(depth + 2));
                        this._fitText(nT, nameColW, rowH - uv(4));
                        const rowScoreText = trackContent(this.add.text(scoreX, y, formatTime(entry.score), {
                            fontSize: fSize, fontFamily: UI_FONT_MONO, fontStyle: bold, color,
                            stroke: '#02040a', strokeThickness: 3,
                        }).setOrigin(1, 0).setDepth(depth + 2));
                        this._fitText(rowScoreText, scoreColW, rowH - uv(4));
                        y += rowH;
                    });
                })
                .catch(() => {
                    if (isClosed() || seq !== requestSeq) return;
                    if (loadingTween) loadingTween.stop();
                    if (loadingIcon?.active && this.textures.exists('icon_error')) {
                        loadingIcon.setTexture('icon_error').setDisplaySize(uv(46), uv(46));
                        loadingIcon.setAngle(0);
                    }
                    if (loadingText && loadingText.active) {
                        loadingText.setText('SYSTEM - ERROR');
                        loadingText.setColor(SYSTEM.TEXT_RED);
                    }
                });
        };

        renderRanking(activeCharacterId);
    }

    update() {}
}
