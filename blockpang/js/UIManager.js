class UIManager {
    constructor(game) {
        this.game = game;
        this.container = new PIXI.Container();

        this.scoreText = null;
        this.bestText = null;
        this.titleText = null;
        this.soundBtn = null;
        this.gameOverOverlay = null;
        this.titleContainer = null;
        this.levelText = null;
        this.levelBarBg = null;
        this.levelBarFill = null;
        this.levelBarGlow = null;
        this._displayScore = 0;
        this._targetScore = 0;
        this._scoreAnimating = false;
        this._titleRefs = null;
        this._activeButtons = [];

        this._build();
    }

    _build() {
        // Title with gradient
        this.titleText = new PIXI.Text('BLOCKPANG', {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 28,
            fill: [0x00E5FF, 0xD500F9],
            fillGradientType: 0,
            fontWeight: '900',
            letterSpacing: 6,
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 8,
            dropShadowDistance: 2,
        });
        this.titleText.anchor.set(0.5, 0);
        this.container.addChild(this.titleText);

        // Score label
        this.scoreLabelText = new PIXI.Text('SCORE', {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 10,
            fill: 0x6677aa,
            fontWeight: '400',
            letterSpacing: 2,
        });
        this.scoreLabelText.anchor.set(0, 0.5);
        this.container.addChild(this.scoreLabelText);

        // Score (animated)
        this.scoreText = new PIXI.Text('0', {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 22,
            fill: [0x76FF03, 0x00E5FF],
            fillGradientType: 0,
            fontWeight: '700',
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 4,
            dropShadowDistance: 1,
        });
        this.scoreText.anchor.set(0, 0.5);
        this.container.addChild(this.scoreText);

        // Best
        this.bestText = new PIXI.Text('BEST 0', {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 12,
            fill: 0xFFD600,
            fontWeight: '400',
            letterSpacing: 1,
        });
        this.bestText.anchor.set(1, 0.5);
        this.container.addChild(this.bestText);

        // Level display
        this.levelText = new PIXI.Text('LV.1', {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 11,
            fill: 0x00E5FF,
            fontWeight: '700',
            letterSpacing: 1,
        });
        this.levelText.anchor.set(1, 0.5);
        this.container.addChild(this.levelText);

        // Level progress bar background
        this.levelBarBg = new PIXI.Graphics();
        this.container.addChild(this.levelBarBg);

        // Level progress bar glow
        this.levelBarGlow = new PIXI.Graphics();
        this.container.addChild(this.levelBarGlow);

        // Level progress bar fill
        this.levelBarFill = new PIXI.Graphics();
        this.container.addChild(this.levelBarFill);

        // Sound button
        this.soundBtn = new PIXI.Text('♪', {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 20,
            fill: 0x6677aa,
            fontWeight: '700',
        });
        this.soundBtn.anchor.set(1, 0);
        this.soundBtn.eventMode = 'static';
        this.soundBtn.cursor = 'pointer';
        this.soundBtn.on('pointerdown', () => {
            const enabled = this.game.sound.toggle();
            this.soundBtn.style.fill = enabled ? 0x6677aa : 0x333355;
        });
        this.soundBtn.on('pointerover', () => {
            this.soundBtn.alpha = 0.7;
        });
        this.soundBtn.on('pointerout', () => {
            this.soundBtn.alpha = 1;
        });
        this.container.addChild(this.soundBtn);

        // Home button (go to title)
        this.homeBtn = new PIXI.Text('🏠', {
            fontSize: 20,
        });
        this.homeBtn.anchor.set(0, 0);
        this.homeBtn.eventMode = 'static';
        this.homeBtn.cursor = 'pointer';
        this.homeBtn.on('pointerdown', () => {
            if (this.game.isAnimating) return;
            this.game.goToTitle();
        });
        this.homeBtn.on('pointerover', () => {
            this.homeBtn.alpha = 0.7;
        });
        this.homeBtn.on('pointerout', () => {
            this.homeBtn.alpha = 1;
        });
        this.container.addChild(this.homeBtn);

        // Start score counter animation
        this.game.app.ticker.add(this._updateScoreAnimation, this);
    }

    // ── HUD Visibility Toggle ──
    showGameHUD() {
        this.titleText.visible = true;
        this.scoreLabelText.visible = true;
        this.scoreText.visible = true;
        this.bestText.visible = true;
        this.levelText.visible = true;
        this.levelBarBg.visible = true;
        this.levelBarFill.visible = true;
        this.levelBarGlow.visible = true;
        this.soundBtn.visible = true;
        this.homeBtn.visible = true;
    }

    hideGameHUD() {
        this.titleText.visible = false;
        this.scoreLabelText.visible = false;
        this.scoreText.visible = false;
        this.bestText.visible = false;
        this.levelText.visible = false;
        this.levelBarBg.visible = false;
        this.levelBarFill.visible = false;
        this.levelBarGlow.visible = false;
        this.soundBtn.visible = false;
        this.homeBtn.visible = false;
    }

    resize(screenWidth, scoreAreaHeight, padding) {
        const centerX = screenWidth / 2;

        // Title
        this.titleText.position.set(centerX, padding * 0.5);
        this.titleText.style.fontSize = Math.max(16, Math.min(28, screenWidth * 0.06));

        const row2Y = this.titleText.y + this.titleText.height + 4;

        // Score label + score
        this.scoreLabelText.position.set(padding, row2Y);
        this.scoreLabelText.style.fontSize = Math.max(8, screenWidth * 0.022);
        this.scoreText.position.set(padding, row2Y + this.scoreLabelText.height + 4);
        this.scoreText.style.fontSize = Math.max(16, Math.min(26, screenWidth * 0.055));

        // Best
        this.bestText.position.set(screenWidth - padding, row2Y + 8);
        this.bestText.style.fontSize = Math.max(10, Math.min(14, screenWidth * 0.03));

        // Level
        this.levelText.position.set(screenWidth - padding, row2Y + 24);
        this.levelText.style.fontSize = Math.max(9, Math.min(12, screenWidth * 0.028));

        // Level bar
        const barW = Math.min(120, screenWidth * 0.25);
        const barH = 4;
        const barX = screenWidth - padding - barW;
        const barY = row2Y + 38;

        this.levelBarBg.clear();
        this.levelBarBg.beginFill(0x1a1a40, 0.8);
        this.levelBarBg.drawRoundedRect(barX, barY, barW, barH, 2);
        this.levelBarBg.endFill();

        this._levelBarX = barX;
        this._levelBarY = barY;
        this._levelBarW = barW;
        this._levelBarH = barH;

        // Sound button
        this.soundBtn.position.set(screenWidth - padding, padding * 0.3);
        this.soundBtn.style.fontSize = Math.max(16, Math.min(22, screenWidth * 0.045));

        // Home button (below score area)
        const homeBtnY = this.scoreText.y + this.scoreText.height + 6;
        this.homeBtn.position.set(padding, homeBtnY);
        this.homeBtn.style.fontSize = Math.max(14, Math.min(18, screenWidth * 0.035));
    }

    updateScore(score, bestScore) {
        this._targetScore = score;
        if (!this._scoreAnimating) {
            this._scoreAnimating = true;
        }
        this.bestText.text = `BEST ${bestScore.toLocaleString()}`;
    }

    updateLevel(level, progress) {
        this.levelText.text = `LV.${level}`;

        if (this.levelBarFill && this._levelBarW) {
            this.levelBarFill.clear();
            const fillW = this._levelBarW * Math.min(1, progress);
            if (fillW > 0) {
                this.levelBarFill.beginFill(0x00E5FF, 0.9);
                this.levelBarFill.drawRoundedRect(this._levelBarX, this._levelBarY, fillW, this._levelBarH, 2);
                this.levelBarFill.endFill();
            }

            this.levelBarGlow.clear();
            if (fillW > 2) {
                this.levelBarGlow.beginFill(0x00E5FF, 0.3);
                this.levelBarGlow.drawCircle(this._levelBarX + fillW, this._levelBarY + this._levelBarH / 2, 4);
                this.levelBarGlow.endFill();
            }
        }
    }

    _updateScoreAnimation() {
        if (!this._scoreAnimating) return;

        const diff = this._targetScore - this._displayScore;
        if (Math.abs(diff) < 1) {
            this._displayScore = this._targetScore;
            this._scoreAnimating = false;
        } else {
            const step = Math.max(1, Math.ceil(Math.abs(diff) * 0.12));
            this._displayScore += diff > 0 ? step : -step;
        }

        this.scoreText.text = Math.round(this._displayScore).toLocaleString();
    }

    // ══════════════════════════════════════
    // ══  TITLE SCREEN
    // ══════════════════════════════════════
    showTitleScreen() {
        if (this.titleContainer) {
            this.titleContainer.destroy({ children: true });
            this.titleContainer = null;
        }

        const container = new PIXI.Container();
        container.eventMode = 'static';
        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;
        container.hitArea = new PIXI.Rectangle(0, 0, w, h);

        // Semi-transparent overlay (starfield shows through)
        const bg = new PIXI.Graphics();
        bg.beginFill(0x000000, 0.3);
        bg.drawRect(0, 0, w, h);
        bg.endFill();
        container.addChild(bg);

        const centerX = w / 2;
        const isSmall = w < 380;
        const sc = isSmall ? 0.8 : 1;

        // ── Logo: "BLOCKPANG" ──
        const logoFontSize = Math.min(44, w * 0.11) * sc;
        const logo = new PIXI.Text('BLOCKPANG', {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: logoFontSize,
            fill: [0x00E5FF, 0xD500F9],
            fillGradientType: 0,
            fontWeight: '900',
            letterSpacing: 8 * sc,
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 16,
            dropShadowDistance: 4,
        });
        logo.anchor.set(0.5, 0.5);
        logo.position.set(centerX, h * 0.2);
        container.addChild(logo);

        // ── Subtitle ──
        const subtitle = new PIXI.Text(getText('blockPuzzle'), {
            fontFamily: "'Noto Sans KR', 'Noto Sans JP', 'Orbitron', sans-serif",
            fontSize: Math.min(13, w * 0.035) * sc,
            fill: 0x6677aa,
            letterSpacing: 5,
        });
        subtitle.anchor.set(0.5, 0);
        subtitle.position.set(centerX, logo.y + logoFontSize / 2 + 14);
        container.addChild(subtitle);

        // ── Best Score ──
        const bestScore = this.game.scoreManager.bestScore;
        let bestText = null;
        if (bestScore > 0) {
            bestText = new PIXI.Text(`BEST  ${bestScore.toLocaleString()}`, {
                fontFamily: 'Orbitron, sans-serif',
                fontSize: Math.min(14, w * 0.035) * sc,
                fill: 0xFFD600,
                letterSpacing: 2,
            });
            bestText.anchor.set(0.5, 0);
            bestText.position.set(centerX, subtitle.y + subtitle.height + 16);
            container.addChild(bestText);
        }

        // ── "Game Start" Button ──
        const btnW = Math.min(w * 0.65, 280);
        const btnH = Math.min(54, h * 0.075);
        const startBtnY = h * 0.46;
        const btnX = centerX - btnW / 2;

        const startBtn = new PIXI.Graphics();
        // Glow
        startBtn.beginFill(0x00E5FF, 0.1);
        startBtn.drawRoundedRect(btnX - 6, startBtnY - 6, btnW + 12, btnH + 12, 16);
        startBtn.endFill();
        // Body
        startBtn.beginFill(0x00E5FF);
        startBtn.drawRoundedRect(btnX, startBtnY, btnW, btnH, 12);
        startBtn.endFill();
        // Highlight
        startBtn.beginFill(0x66F0FF, 0.4);
        startBtn.drawRoundedRect(btnX + 2, startBtnY + 2, btnW - 4, btnH * 0.4, 10);
        startBtn.endFill();

        startBtn.eventMode = 'static';
        startBtn.cursor = 'pointer';
        startBtn.hitArea = new PIXI.Rectangle(btnX - 10, startBtnY - 10, btnW + 20, btnH + 20);
        startBtn.on('pointerover', () => { startBtn.tint = 0xCCFFFF; });
        startBtn.on('pointerout', () => { startBtn.tint = 0xFFFFFF; });
        let startTriggered = false;
        const doStart = () => {
            if (startTriggered) return;
            startTriggered = true;
            this.game.sound.ensureContext();
            this.game.startGame();
        };
        startBtn.on('pointerdown', doStart);
        startBtn.on('pointertap', doStart);
        container.addChild(startBtn);

        // Register DOM fallback hit area
        this._activeButtons = [{
            x: btnX - 10, y: startBtnY - 10,
            w: btnW + 20, h: btnH + 20,
            action: doStart
        }];

        const startBtnText = new PIXI.Text(getText('gameStart'), {
            fontFamily: "'Noto Sans KR', 'Noto Sans JP', 'Orbitron', sans-serif",
            fontSize: Math.min(20, w * 0.05) * sc,
            fill: 0x000000,
            fontWeight: '700',
            letterSpacing: 3,
        });
        startBtnText.anchor.set(0.5, 0.5);
        startBtnText.position.set(centerX, startBtnY + btnH / 2);
        startBtnText.eventMode = 'none';
        startBtn.addChild(startBtnText);

        // ── Bottom Button Row ──
        const smallBtnH = Math.min(38, h * 0.055);
        const gap = 8;
        const bottomY = h * 0.62;

        const createSmallBtn = (label, color, action) => {
            const bw = Math.min((w - gap * 4) / 3, 110);
            const btn = new PIXI.Graphics();
            btn.beginFill(color, 0.12);
            btn.drawRoundedRect(0, 0, bw, smallBtnH, 8);
            btn.endFill();
            btn.lineStyle(1, color, 0.35);
            btn.drawRoundedRect(0, 0, bw, smallBtnH, 8);
            btn.lineStyle(0);

            btn.eventMode = 'static';
            btn.cursor = 'pointer';
            btn.hitArea = new PIXI.Rectangle(-5, -5, bw + 10, smallBtnH + 10);
            btn.on('pointerover', () => { btn.tint = 0xCCDDFF; });
            btn.on('pointerout', () => { btn.tint = 0xFFFFFF; });
            btn.on('pointerdown', action);

            const txt = new PIXI.Text(label, {
                fontFamily: "'Noto Sans KR', 'Noto Sans JP', 'Orbitron', sans-serif",
                fontSize: Math.min(11, w * 0.028) * sc,
                fill: color,
                fontWeight: '700',
                letterSpacing: 1,
            });
            txt.anchor.set(0.5, 0.5);
            txt.position.set(bw / 2, smallBtnH / 2);
            btn.addChild(txt);

            return { btn, txt, width: bw };
        };

        // Language button
        const langBtn = createSmallBtn(
            `${getText('langLabel')} ${getText('language')}`,
            0xD500F9,
            () => {
                cycleLanguage();
                this._refreshTitleTexts();
            }
        );

        // Contact button
        const contactBtn = createSmallBtn(
            getText('contact'),
            0xFFD600,
            () => { window.open('mailto:contact@archerlab.dev', '_blank'); }
        );

        // archerlab.dev button
        const linkBtn = createSmallBtn(
            'archerlab.dev',
            0x2979FF,
            () => { window.open('https://archerlab.dev', '_blank'); }
        );

        // Position bottom buttons centered (3 buttons)
        const totalBtnW = langBtn.width + contactBtn.width + linkBtn.width + gap * 2;
        let bx = centerX - totalBtnW / 2;

        langBtn.btn.position.set(bx, bottomY);
        container.addChild(langBtn.btn);
        bx += langBtn.width + gap;

        contactBtn.btn.position.set(bx, bottomY);
        container.addChild(contactBtn.btn);
        bx += contactBtn.width + gap;

        linkBtn.btn.position.set(bx, bottomY);
        container.addChild(linkBtn.btn);

        // ── Sound toggle ──
        const titleSoundBtn = new PIXI.Text('♪', {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: Math.max(18, Math.min(24, w * 0.05)),
            fill: this.game.sound.enabled ? 0x6677aa : 0x333355,
            fontWeight: '700',
        });
        titleSoundBtn.anchor.set(1, 0);
        titleSoundBtn.position.set(w - 16, 16);
        titleSoundBtn.eventMode = 'static';
        titleSoundBtn.cursor = 'pointer';
        titleSoundBtn.on('pointerdown', () => {
            const enabled = this.game.sound.toggle();
            titleSoundBtn.style.fill = enabled ? 0x6677aa : 0x333355;
        });
        titleSoundBtn.on('pointerover', () => { titleSoundBtn.alpha = 0.7; });
        titleSoundBtn.on('pointerout', () => { titleSoundBtn.alpha = 1; });
        container.addChild(titleSoundBtn);

        // ── Version text ──
        const versionText = new PIXI.Text('v1.0  ArcherLab', {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: Math.min(9, w * 0.024),
            fill: 0x334466,
            letterSpacing: 1,
        });
        versionText.anchor.set(0.5, 1);
        versionText.position.set(centerX, h - 12);
        container.addChild(versionText);

        // Store refs for language refresh
        this._titleRefs = { logo, subtitle, startBtnText, langBtn, contactBtn, bestText };

        // ── Entrance Animation ──
        container.alpha = 0;
        logo.scale.set(0.3);
        logo.alpha = 0;
        subtitle.alpha = 0;
        startBtn.alpha = 0;
        langBtn.btn.alpha = 0;
        contactBtn.btn.alpha = 0;
        linkBtn.alpha = 0;

        this.game.effects.tweens.push({
            elapsed: 0,
            duration: 900,
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);

                // Overlay fade in
                container.alpha = easeOutCubic(Math.min(t / 0.3, 1));

                // Logo pop-in
                if (t > 0.05) {
                    const lt = Math.min((t - 0.05) / 0.45, 1);
                    logo.alpha = easeOutCubic(lt);
                    logo.scale.set(easeOutBack(lt));
                }

                // Subtitle
                if (t > 0.25) {
                    subtitle.alpha = easeOutCubic(Math.min((t - 0.25) / 0.3, 1));
                }

                // Start button
                if (t > 0.35) {
                    const bt = Math.min((t - 0.35) / 0.35, 1);
                    startBtn.alpha = easeOutCubic(bt);
                }

                // Bottom buttons staggered
                if (t > 0.45) {
                    langBtn.btn.alpha = easeOutCubic(Math.min((t - 0.45) / 0.25, 1));
                }
                if (t > 0.5) {
                    contactBtn.btn.alpha = easeOutCubic(Math.min((t - 0.5) / 0.25, 1));
                }
                if (t > 0.55) {
                    linkBtn.alpha = easeOutCubic(Math.min((t - 0.55) / 0.25, 1));
                }

                return t >= 1;
            }
        });

        // Idle logo pulse
        this.game.effects.tweens.push({
            elapsed: 0,
            duration: 99999,
            update(dt) {
                if (!logo || logo.destroyed) return true;
                this.elapsed += dt;
                const pulse = 1 + Math.sin(this.elapsed * 0.003) * 0.03;
                logo.scale.set(pulse);
                return false;
            }
        });

        // Idle start button glow pulse (delayed until after entrance animation)
        this.game.effects.tweens.push({
            elapsed: 0,
            duration: 99999,
            _ready: false,
            update(dt) {
                if (!startBtn || startBtn.destroyed) return true;
                this.elapsed += dt;
                if (!this._ready) {
                    if (this.elapsed < 950) return false;
                    this._ready = true;
                    this.elapsed = 0;
                }
                const glow = 0.85 + Math.sin(this.elapsed * 0.004) * 0.15;
                startBtn.alpha = glow;
                return false;
            }
        });

        this.titleContainer = container;
        this.game.app.stage.addChild(container);
    }

    hideTitleScreen(onComplete) {
        this._activeButtons = [];
        if (!this.titleContainer) {
            if (onComplete) onComplete();
            return;
        }

        const container = this.titleContainer;

        this.game.effects.tweens.push({
            elapsed: 0,
            duration: 400,
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                container.alpha = 1 - easeOutCubic(t);
                if (t >= 1) {
                    container.destroy({ children: true });
                    if (onComplete) onComplete();
                    return true;
                }
                return false;
            }
        });

        this.titleContainer = null;
        this._titleRefs = null;
    }

    _refreshTitleTexts() {
        if (!this._titleRefs) return;
        const { subtitle, startBtnText, langBtn, contactBtn } = this._titleRefs;
        if (subtitle && !subtitle.destroyed) subtitle.text = getText('blockPuzzle');
        if (startBtnText && !startBtnText.destroyed) startBtnText.text = getText('gameStart');
        if (langBtn && langBtn.txt && !langBtn.txt.destroyed) langBtn.txt.text = `${getText('langLabel')} ${getText('language')}`;
        if (contactBtn && contactBtn.txt && !contactBtn.txt.destroyed) contactBtn.txt.text = getText('contact');
    }

    // ══════════════════════════════════════
    // ══  GAME OVER OVERLAY
    // ══════════════════════════════════════
    showGameOver(score, bestScore, isNewBest) {
        if (this.gameOverOverlay) {
            this.gameOverOverlay.destroy({ children: true });
        }

        const overlay = new PIXI.Container();
        overlay.eventMode = 'static';
        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;
        overlay.hitArea = new PIXI.Rectangle(0, 0, w, h);

        // Dark background
        const bg = new PIXI.Graphics();
        bg.beginFill(0x000000, 0.7);
        bg.drawRect(0, 0, w, h);
        bg.endFill();
        for (let i = 0; i < 3; i++) {
            bg.beginFill(0x050520, 0.1);
            bg.drawRect(0, 0, w, h);
            bg.endFill();
        }
        overlay.addChild(bg);

        // Panel
        const panelW = Math.min(w * 0.85, 380);
        const panelH = Math.min(h * 0.65, 440);
        const panelX = (w - panelW) / 2;
        const panelY = (h - panelH) / 2;

        const panel = new PIXI.Graphics();
        for (let i = 2; i >= 0; i--) {
            panel.beginFill(0x2244aa, 0.03 + i * 0.02);
            panel.drawRoundedRect(panelX - i * 4, panelY - i * 4, panelW + i * 8, panelH + i * 8, 18 + i * 2);
            panel.endFill();
        }
        panel.beginFill(0x0a0a30, 0.97);
        panel.drawRoundedRect(panelX, panelY, panelW, panelH, 16);
        panel.endFill();
        panel.lineStyle(2, 0x3355cc, 0.5);
        panel.drawRoundedRect(panelX, panelY, panelW, panelH, 16);
        panel.lineStyle(0);
        panel.lineStyle(1, 0x4466dd, 0.15);
        panel.drawRoundedRect(panelX + 3, panelY + 3, panelW - 6, panelH - 6, 14);
        panel.lineStyle(0);
        overlay.addChild(panel);

        const centerX = w / 2;
        let yOff = panelY + 30;

        // Game Over title
        const title = new PIXI.Text(getText('gameOver'), {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: Math.min(30, panelW * 0.09),
            fill: [0xFF1744, 0xFF6D00],
            fillGradientType: 0,
            fontWeight: '900',
            letterSpacing: 4,
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 8,
            dropShadowDistance: 2,
        });
        title.anchor.set(0.5, 0);
        title.position.set(centerX, yOff);
        overlay.addChild(title);
        yOff += title.height + 20;

        // Divider
        const divider = new PIXI.Graphics();
        divider.lineStyle(1, 0x3355cc, 0.3);
        divider.moveTo(panelX + 30, yOff);
        divider.lineTo(panelX + panelW - 30, yOff);
        overlay.addChild(divider);
        yOff += 16;

        // Score label
        const scoreLabel = new PIXI.Text(getText('score'), {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: Math.min(12, panelW * 0.035),
            fill: 0x6677aa,
            letterSpacing: 3,
        });
        scoreLabel.anchor.set(0.5, 0);
        scoreLabel.position.set(centerX, yOff);
        overlay.addChild(scoreLabel);
        yOff += scoreLabel.height + 4;

        // Score value
        const scoreVal = new PIXI.Text(score.toLocaleString(), {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: Math.min(36, panelW * 0.1),
            fill: [0x76FF03, 0x00E5FF],
            fillGradientType: 0,
            fontWeight: '900',
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 6,
            dropShadowDistance: 2,
        });
        scoreVal.anchor.set(0.5, 0);
        scoreVal.position.set(centerX, yOff);
        overlay.addChild(scoreVal);
        yOff += scoreVal.height + 10;

        // New best indicator
        if (isNewBest) {
            const newBest = new PIXI.Text(getText('newRecord'), {
                fontFamily: 'Orbitron, sans-serif',
                fontSize: Math.min(16, panelW * 0.05),
                fill: [0xFFD600, 0xFF6D00],
                fillGradientType: 0,
                fontWeight: '900',
                letterSpacing: 3,
                dropShadow: true,
                dropShadowColor: 0x000000,
                dropShadowBlur: 6,
                dropShadowDistance: 2,
            });
            newBest.anchor.set(0.5, 0);
            newBest.position.set(centerX, yOff);
            overlay.addChild(newBest);

            this.game.effects.tweens.push({
                elapsed: 0,
                duration: 99999,
                update(dt) {
                    if (newBest.destroyed) return true;
                    this.elapsed += dt;
                    const pulse = 1 + Math.sin(this.elapsed * 0.005) * 0.08;
                    newBest.scale.set(pulse);
                    return false;
                }
            });

            yOff += newBest.height + 10;
        }

        // Best score
        const bestLabel = new PIXI.Text(`${getText('best')}  ${bestScore.toLocaleString()}`, {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: Math.min(13, panelW * 0.038),
            fill: 0xFFD600,
            letterSpacing: 1,
        });
        bestLabel.anchor.set(0.5, 0);
        bestLabel.position.set(centerX, yOff);
        overlay.addChild(bestLabel);
        yOff += bestLabel.height + 6;

        // Level & Lines
        const levelLabel = new PIXI.Text(`${getText('level')} ${this.game.scoreManager.level}  |  ${getText('lines')} ${this.game.scoreManager.linesCleared}`, {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: Math.min(10, panelW * 0.03),
            fill: 0x5566aa,
            letterSpacing: 1,
        });
        levelLabel.anchor.set(0.5, 0);
        levelLabel.position.set(centerX, yOff);
        overlay.addChild(levelLabel);
        yOff += levelLabel.height + 20;

        // ── Play Again button ──
        const btnW = panelW * 0.6;
        const btnH = 44;
        const btnX = centerX - btnW / 2;
        const btnY = Math.min(yOff, panelY + panelH - btnH * 2 - 40);

        const btn = new PIXI.Graphics();
        btn.beginFill(0x2979FF, 0.15);
        btn.drawRoundedRect(btnX - 4, btnY - 4, btnW + 8, btnH + 8, 14);
        btn.endFill();
        btn.beginFill(0x2979FF);
        btn.drawRoundedRect(btnX, btnY, btnW, btnH, 10);
        btn.endFill();
        btn.beginFill(0x5599FF, 0.4);
        btn.drawRoundedRect(btnX + 2, btnY + 2, btnW - 4, btnH * 0.4, 8);
        btn.endFill();

        btn.eventMode = 'static';
        btn.cursor = 'pointer';
        btn.hitArea = new PIXI.Rectangle(btnX - 10, btnY - 10, btnW + 20, btnH + 20);
        btn.on('pointerover', () => { btn.tint = 0xCCDDFF; });
        btn.on('pointerout', () => { btn.tint = 0xFFFFFF; });
        let restartTriggered = false;
        const doRestart = () => {
            if (restartTriggered) return;
            restartTriggered = true;
            this.hideGameOver();
            this.game.restart();
        };
        btn.on('pointerdown', doRestart);
        btn.on('pointertap', doRestart);
        overlay.addChild(btn);

        // Register DOM fallback hit area
        this._activeButtons = [{
            x: btnX - 10, y: btnY - 10,
            w: btnW + 20, h: btnH + 20,
            action: doRestart
        }];

        const btnText = new PIXI.Text(getText('playAgain'), {
            fontFamily: "'Noto Sans KR', 'Noto Sans JP', 'Orbitron', sans-serif",
            fontSize: Math.min(15, panelW * 0.045),
            fill: 0xFFFFFF,
            fontWeight: '700',
            letterSpacing: 3,
        });
        btnText.anchor.set(0.5, 0.5);
        btnText.position.set(centerX, btnY + btnH / 2);
        btnText.eventMode = 'none';
        btn.addChild(btnText);

        // ── Back to Title button ──
        const titleBtnY = btnY + btnH + 12;
        const titleBtn = new PIXI.Graphics();
        titleBtn.beginFill(0x3355cc, 0.12);
        titleBtn.drawRoundedRect(btnX, titleBtnY, btnW, btnH - 4, 10);
        titleBtn.endFill();
        titleBtn.lineStyle(1, 0x3355cc, 0.35);
        titleBtn.drawRoundedRect(btnX, titleBtnY, btnW, btnH - 4, 10);
        titleBtn.lineStyle(0);

        titleBtn.eventMode = 'static';
        titleBtn.cursor = 'pointer';
        titleBtn.hitArea = new PIXI.Rectangle(btnX - 10, titleBtnY - 10, btnW + 20, btnH - 4 + 20);
        titleBtn.on('pointerover', () => { titleBtn.tint = 0xCCDDFF; });
        titleBtn.on('pointerout', () => { titleBtn.tint = 0xFFFFFF; });
        let titleTriggered = false;
        const doTitle = () => {
            if (titleTriggered) return;
            titleTriggered = true;
            this.game.goToTitle();
        };
        titleBtn.on('pointerdown', doTitle);
        titleBtn.on('pointertap', doTitle);
        overlay.addChild(titleBtn);

        // Add title button to DOM fallback
        this._activeButtons.push({
            x: btnX - 10, y: titleBtnY - 10,
            w: btnW + 20, h: btnH - 4 + 20,
            action: doTitle
        });

        const titleBtnText = new PIXI.Text(getText('backToTitle'), {
            fontFamily: "'Noto Sans KR', 'Noto Sans JP', 'Orbitron', sans-serif",
            fontSize: Math.min(13, panelW * 0.04),
            fill: 0x6677aa,
            fontWeight: '700',
            letterSpacing: 2,
        });
        titleBtnText.anchor.set(0.5, 0.5);
        titleBtnText.position.set(centerX, titleBtnY + (btnH - 4) / 2);
        titleBtnText.eventMode = 'none';
        titleBtn.addChild(titleBtnText);

        // ── Animate overlay in ──
        overlay.alpha = 0;
        const panelOffset = 30;
        const slideElements = [panel, title, divider, scoreLabel, scoreVal, bestLabel, levelLabel, btn, titleBtn];

        // Find and add newBest element if exists
        overlay.children.forEach(c => {
            if (c instanceof PIXI.Text && c.text === getText('newRecord')) {
                slideElements.push(c);
            }
        });

        slideElements.forEach(el => { el.y += panelOffset; });

        this.game.effects.tweens.push({
            elapsed: 0,
            duration: 500,
            _lastSlide: 0,
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                overlay.alpha = easeOutCubic(t);
                const slide = easeOutCubic(t) * panelOffset;
                const delta = slide - this._lastSlide;
                slideElements.forEach(el => {
                    if (!el.destroyed) el.y -= delta;
                });
                this._lastSlide = slide;
                return t >= 1;
            }
        });

        this.gameOverOverlay = overlay;
        this.game.app.stage.addChild(overlay);
    }

    hideGameOver() {
        this._activeButtons = [];
        if (this.gameOverOverlay) {
            this.gameOverOverlay.destroy({ children: true });
            this.gameOverOverlay = null;
        }
    }
}
