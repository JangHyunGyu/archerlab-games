class UIManager {
    constructor(game) {
        this.game = game;
        this.container = new PIXI.Container();

        this.scoreText = null;
        this.bestText = null;
        this.titleText = null;
        this.soundBtn = null;
        this.soundIconSprite = null;
        this.hudBg = null;
        this.homeIconSprite = null;
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
        this._hudHomeBounds = null;
        this._hudSoundBounds = null;
        this._hudHomePress = null;
        this._hudSoundPress = null;
        this._titleSerial = 0;
        this._nameInputElement = null;
        this._nameInputFocusTimer = null;
        this._nameInputFocusHandler = null;
        this._nameInputBlurHandler = null;
        this._nameInputKeydownHandler = null;

        this._build();
    }

    _build() {
        this.hudBg = new PIXI.Container();
        this.container.addChild(this.hudBg);

        // Small wordmark (top center)
        this.titleText = new PIXI.Text({
            text: getText('gameTitle'),
            style: {
                fontFamily: FONT_DISPLAY,
                fontSize: 22,
                fill: THEME.inkStrong,
                fontWeight: '400',
                dropShadow: { color: THEME.secondary, blur: 6, distance: 0, alpha: 0.45 },
            },
        });
        this.titleText.anchor.set(0.5, 0);
        this.container.addChild(this.titleText);

        // Score label
        this.scoreLabelText = new PIXI.Text({
            text: 'SCORE',
            style: {
                fontFamily: FONT_BODY,
                fontSize: 10,
                fill: THEME.inkMuted,
                fontWeight: '500',
                letterSpacing: 1.5,
            },
        });
        this.scoreLabelText.anchor.set(0, 0.5);
        this.container.addChild(this.scoreLabelText);

        // Score (animated)
        this.scoreText = new PIXI.Text({
            text: '0',
            style: {
                fontFamily: FONT_BODY,
                fontSize: 22,
                fill: THEME.inkStrong,
                fontWeight: '700',
                dropShadow: { color: THEME.secondary, blur: 5, distance: 0, alpha: 0.35 },
            },
        });
        this.scoreText.anchor.set(0, 0.5);
        this.container.addChild(this.scoreText);

        // Best
        this.bestText = new PIXI.Text({
            text: 'BEST 0',
            style: {
                fontFamily: FONT_BODY,
                fontSize: 12,
                fill: THEME.gold,
                fontWeight: '600',
                letterSpacing: 0.5,
            },
        });
        this.bestText.anchor.set(1, 0.5);
        this.container.addChild(this.bestText);

        // Level display
        this.levelText = new PIXI.Text({
            text: 'LV.1',
            style: {
                fontFamily: FONT_BODY,
                fontSize: 11,
                fill: THEME.inkMuted,
                fontWeight: '600',
                letterSpacing: 0.5,
            },
        });
        this.levelText.anchor.set(1, 0.5);
        this.container.addChild(this.levelText);

        this.levelBarBg = new PIXI.Graphics();
        this.container.addChild(this.levelBarBg);
        this.levelBarGlow = new PIXI.Graphics();
        this.container.addChild(this.levelBarGlow);
        this.levelBarFill = new PIXI.Graphics();
        this.container.addChild(this.levelBarFill);

        // Sound button (\u266A \u2014 bright with cyan glow for visibility against the panel)
        this.soundBtn = new PIXI.Text({
            text: '\u266A',
            style: {
                fontFamily: FONT_BODY,
                fontSize: 22,
                fill: THEME.inkStrong,
                fontWeight: '700',
                stroke: { color: THEME.secondaryDp, width: 3, alpha: 0.85 },
                dropShadow: {
                    color: THEME.secondary,
                    alpha: 0.7,
                    blur: 6,
                    distance: 0,
                },
            },
        });
        this.soundBtn.anchor.set(1, 0);
        this.soundBtn.eventMode = 'static';
        this.soundBtn.cursor = 'pointer';
        this.soundBtn.hitArea = new PIXI.Rectangle(-44, -12, 56, 56);
        this.soundBtn.on('pointerdown', () => this._getHudSoundPress()());
        this.soundBtn.on('pointerover', () => { this.soundBtn.alpha = 0.75; });
        this.soundBtn.on('pointerout',  () => this._syncHudSoundButton());
        this.container.addChild(this.soundBtn);

        // Home button (‹ chevron — bright with cyan glow, matches the neon UI palette)
        this.homeBtn = new PIXI.Text({
            text: '‹',
            style: {
                fontFamily: FONT_BODY,
                fontSize: 28,
                fill: THEME.inkStrong,
                fontWeight: '700',
                stroke: { color: THEME.secondaryDp, width: 2.5, alpha: 0.85 },
                dropShadow: {
                    color: THEME.secondary,
                    alpha: 0.7,
                    blur: 6,
                    distance: 0,
                },
            },
        });
        this.homeBtn.anchor.set(0, 0);
        this.homeBtn.eventMode = 'static';
        this.homeBtn.cursor = 'pointer';
        this.homeBtn.hitArea = new PIXI.Rectangle(-12, -12, 56, 56);
        this.homeBtn.on('pointerdown', () => this._getHudHomePress()());
        this.homeBtn.on('pointerover', () => { this.homeBtn.alpha = 0.75; });
        this.homeBtn.on('pointerout',  () => { this.homeBtn.alpha = 1; });
        this.container.addChild(this.homeBtn);

        this._buildImageHudButtons();

        this.game.app.ticker.add(this._updateScoreAnimation, this);
    }

    _buildImageHudButtons() {
        const soundTexture = getBlockpangTexture('iconSoundOn');
        if (soundTexture) {
            this.soundIconSprite = new PIXI.Sprite(soundTexture);
            this.soundIconSprite.anchor.set(1, 0);
            this.soundIconSprite.eventMode = 'static';
            this.soundIconSprite.cursor = 'pointer';
            this.soundIconSprite.hitArea = new PIXI.Rectangle(-44, -12, 56, 56);
            this.soundIconSprite.on('pointerdown', () => this._getHudSoundPress()());
            this.soundIconSprite.on('pointerover', () => { this.soundIconSprite.alpha = 0.75; });
            this.soundIconSprite.on('pointerout', () => this._syncHudSoundButton());
            this.container.addChild(this.soundIconSprite);
            this.soundBtn.visible = false;
            this.soundBtn.eventMode = 'none';
        }

        const homeTexture = getBlockpangTexture('iconHome');
        if (homeTexture) {
            this.homeIconSprite = new PIXI.Sprite(homeTexture);
            this.homeIconSprite.anchor.set(0, 0);
            this.homeIconSprite.eventMode = 'static';
            this.homeIconSprite.cursor = 'pointer';
            this.homeIconSprite.hitArea = new PIXI.Rectangle(-12, -12, 56, 56);
            this.homeIconSprite.on('pointerdown', () => this._getHudHomePress()());
            this.homeIconSprite.on('pointerover', () => { this.homeIconSprite.alpha = 0.75; });
            this.homeIconSprite.on('pointerout', () => { this.homeIconSprite.alpha = 1; });
            this.container.addChild(this.homeIconSprite);
            this.homeBtn.visible = false;
            this.homeBtn.eventMode = 'none';
        }
    }

    _debounceHudPress(action) {
        let lastFire = 0;
        return () => {
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            if (now - lastFire < 260) return;
            lastFire = now;
            action();
        };
    }

    _getHudHomePress() {
        if (!this._hudHomePress) {
            this._hudHomePress = this._debounceHudPress(() => this._goHomeFromHud());
        }
        return this._hudHomePress;
    }

    _getHudSoundPress() {
        if (!this._hudSoundPress) {
            this._hudSoundPress = this._debounceHudPress(() => this._toggleHudSound());
        }
        return this._hudSoundPress;
    }

    _goHomeFromHud() {
        if (this.game.isAnimating) return;
        this.game.goToTitle();
    }

    _toggleHudSound() {
        const enabled = this.game.sound.toggle();
        this._syncHudSoundButton(enabled);
    }

    _syncHudSoundButton(enabled = this.game.sound.enabled) {
        if (this.soundBtn && !this.soundBtn.destroyed) {
            this.soundBtn.style.fill = enabled ? THEME.inkStrong : THEME.inkFaint;
            this.soundBtn.alpha = enabled ? 1 : 0.55;
        }

        if (this.soundIconSprite && !this.soundIconSprite.destroyed) {
            const tex = getBlockpangTexture(enabled ? 'iconSoundOn' : 'iconSoundOff');
            if (tex) this.soundIconSprite.texture = tex;
            this.soundIconSprite.alpha = enabled ? 1 : 0.55;
        }
    }

    _registerGameHudFallbackButtons() {
        if (!this.game || this.game.state !== 'playing') return;

        const buttons = [];
        if (this._hudHomeBounds) {
            buttons.push({
                ...this._hudHomeBounds,
                action: this._getHudHomePress(),
            });
        }
        if (this._hudSoundBounds) {
            buttons.push({
                ...this._hudSoundBounds,
                action: this._getHudSoundPress(),
            });
        }
        this._activeButtons = buttons;
    }

    destroy() {
        this.game.app.ticker.remove(this._updateScoreAnimation, this);
        this._destroyNameInputDom();
        this._closeHallOfFame();
        this._clearTitleTweens();
        this._destroyTitleRoots();
        if (this._nameInputOverlay) {
            this._nameInputOverlay.destroy({ children: true });
            this._nameInputOverlay = null;
        }
        if (this.gameOverOverlay) {
            this.gameOverOverlay.destroy({ children: true });
            this.gameOverOverlay = null;
        }
        if (this.container && !this.container.destroyed) {
            this.container.destroy({ children: true });
        }
    }

    _destroyNameInputDom() {
        if (this._nameInputFocusTimer) {
            clearTimeout(this._nameInputFocusTimer);
            this._nameInputFocusTimer = null;
        }
        const input = this._nameInputElement;
        if (!input) return;
        if (this._nameInputFocusHandler) input.removeEventListener('focus', this._nameInputFocusHandler);
        if (this._nameInputBlurHandler) input.removeEventListener('blur', this._nameInputBlurHandler);
        if (this._nameInputKeydownHandler) input.removeEventListener('keydown', this._nameInputKeydownHandler);
        if (input.parentNode) input.parentNode.removeChild(input);
        this._nameInputElement = null;
        this._nameInputFocusHandler = null;
        this._nameInputBlurHandler = null;
        this._nameInputKeydownHandler = null;
    }

    // ── HUD Visibility Toggle ──
    showGameHUD() {
        this.titleText.text = getText('gameTitle');
        this.hudBg.visible = true;
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
        if (this.soundIconSprite) {
            this.soundBtn.visible = false;
            this.soundIconSprite.visible = true;
        }
        if (this.homeIconSprite) {
            this.homeBtn.visible = false;
            this.homeIconSprite.visible = true;
        }
        this._syncHudSoundButton();
        this._registerGameHudFallbackButtons();
    }

    hideGameHUD() {
        this.hudBg.visible = false;
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
        if (this.soundIconSprite) this.soundIconSprite.visible = false;
        if (this.homeIconSprite) this.homeIconSprite.visible = false;
        this._activeButtons = [];
    }

    resize(screenWidth, scoreAreaHeight, padding) {
        const centerX = screenWidth / 2;

        // ── Panel geometry ──
        const hudX = padding;
        const hudY = Math.max(4, padding * 0.4);
        const hudW = Math.max(1, screenWidth - padding * 2);
        const compact = screenWidth < 520;
        const hudH = Math.max(compact ? 78 : 72, scoreAreaHeight - hudY - 4);

        // Inner padding so contents stay clear of the asset border / corner brackets
        const innerPadX = compact ? Math.max(24, hudW * 0.07) : Math.max(28, hudW * 0.075);
        const innerPadTop = Math.max(16, hudH * 0.2);
        const innerPadBottom = compact ? Math.max(5, hudH * 0.07) : Math.max(10, hudH * 0.16);
        const innerLeft = hudX + innerPadX;
        const innerRight = hudX + hudW - innerPadX;
        const innerTop = hudY + innerPadTop;
        const innerBottom = hudY + hudH - innerPadBottom;

        if (this.hudBg) {
            const oldHud = this.hudBg.removeChildren();
            oldHud.forEach(c => c.destroy({ children: true }));
            const panelTexture = getBlockpangTexture('glassPanelFill') || getBlockpangTexture('glassPanel');

            const shadow = new PIXI.Graphics();
            shadow.roundRect(hudX, hudY + 4, hudW, hudH, 18)
                  .fill({ color: THEME.shadow, alpha: 0.32 });
            this.hudBg.addChild(shadow);

            if (panelTexture) {
                const panel = new PIXI.Sprite(panelTexture);
                panel.position.set(hudX, hudY);
                panel.width = hudW;
                panel.height = hudH;
                panel.alpha = compact ? 0.68 : 0.76;
                this.hudBg.addChild(panel);
            } else {
                const panel = new PIXI.Graphics();
                panel.roundRect(hudX, hudY, hudW, hudH, 18)
                     .fill({ color: THEME.surface, alpha: 0.9 });
                this.hudBg.addChild(panel);
            }

            const line = new PIXI.Graphics();
            line.roundRect(hudX, hudY, hudW, hudH, 18)
                .stroke({ width: 1.2, color: THEME.divider, alpha: compact ? 0.44 : 0.52 });
            line.roundRect(hudX + 10, hudY + 6, Math.max(1, hudW - 20), 3, 2)
                .fill({ color: THEME.secondary, alpha: compact ? 0.16 : 0.22 });
            this.hudBg.addChild(line);
        }

        // ── Title (top-center, inside panel) ──
        this.titleText.style.fontSize = Math.max(14, Math.min(compact ? 17 : 18, screenWidth * 0.043));
        this.titleText.position.set(centerX, innerTop);

        const titleBottom = innerTop + this.titleText.height;
        const row2Y = titleBottom + Math.max(4, hudH * 0.06);

        // ── Score block (left) ──
        const scoreX = innerLeft;
        this.scoreLabelText.style.fontSize = Math.max(8, Math.min(11, screenWidth * 0.024));
        this.scoreLabelText.position.set(scoreX, row2Y);
        this.scoreText.style.fontSize = Math.max(18, Math.min(compact ? 25 : 22, screenWidth * 0.062));
        const scoreNumberY = row2Y + this.scoreLabelText.height + 5;
        this.scoreText.position.set(scoreX, scoreNumberY);

        // ── Best / Level (right) ──
        this.bestText.style.fontSize = Math.max(10, Math.min(12, screenWidth * 0.03));
        this.bestText.position.set(innerRight, row2Y + this.bestText.height * 0.5);

        this.levelText.style.fontSize = Math.max(9, Math.min(11, screenWidth * 0.026));

        // ── Level bar (right, hugging the inner-bottom of panel) ──
        const barH = compact ? 4 : 3;
        const barW = Math.min(compact ? 132 : 110, hudW * 0.36);
        const barX = innerRight - barW;
        const barY = innerBottom - barH - 4;
        const levelY = compact
            ? barY - this.levelText.height * 0.5 - 5
            : barY + barH + this.levelText.height * 0.5 + 3;
        this.levelText.position.set(innerRight, levelY);

        this.levelBarBg.clear();
        this.levelBarBg.roundRect(barX, barY, barW, barH, barH / 2).fill({ color: THEME.secondaryDp, alpha: 0.56 });

        this._levelBarX = barX;
        this._levelBarY = barY;
        this._levelBarW = barW;
        this._levelBarH = barH;

        // ── Sound button (top-right, inside panel) ──
        const soundButtonY = hudY + Math.max(8, innerPadTop * 0.5);
        this.soundBtn.style.fontSize = Math.max(18, Math.min(23, screenWidth * 0.052));
        this.soundBtn.position.set(innerRight, soundButtonY);

        // ── Back chevron (top-left, inside panel) ──
        const homeButtonY = hudY + Math.max(4, innerPadTop * 0.3);
        this.homeBtn.style.fontSize = Math.max(21, Math.min(27, screenWidth * 0.062));
        this.homeBtn.position.set(innerLeft, homeButtonY);

        const hudIconSize = Math.max(24, Math.min(32, screenWidth * 0.07));
        if (this.soundIconSprite) {
            this.soundIconSprite.width = hudIconSize;
            this.soundIconSprite.height = hudIconSize;
            this.soundIconSprite.position.set(innerRight, soundButtonY);
        }
        if (this.homeIconSprite) {
            this.homeIconSprite.width = hudIconSize;
            this.homeIconSprite.height = hudIconSize;
            this.homeIconSprite.position.set(innerLeft, homeButtonY);
        }

        const hudHitSize = Math.max(48, hudIconSize + 24);
        this._hudHomeBounds = {
            x: innerLeft - 12,
            y: homeButtonY - 12,
            w: hudHitSize,
            h: hudHitSize,
        };
        this._hudSoundBounds = {
            x: innerRight - hudHitSize + 12,
            y: soundButtonY - 12,
            w: hudHitSize,
            h: hudHitSize,
        };
        this._registerGameHudFallbackButtons();
    }

    updateScore(score, bestScore) {
        const hadIncrease = score > this._targetScore;
        this._targetScore = score;
        if (!this._scoreAnimating) {
            this._scoreAnimating = true;
        }
        this.bestText.text = `BEST ${bestScore.toLocaleString()}`;

        // Score pulse effect on increase
        if (hadIncrease && this.scoreText && !this.scoreText.destroyed) {
            const txt = this.scoreText;
            this.game.effects.tweens.push({
                elapsed: 0,
                duration: 300,
                update(dt) {
                    if (txt.destroyed) return true;
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    const scale = 1 + Math.sin(t * Math.PI) * 0.15 * (1 - t);
                    txt.scale.set(scale);
                    return t >= 1;
                }
            });
        }
    }

    updateLevel(level, progress) {
        this.levelText.text = `LV.${level}`;

        if (this.levelBarFill && this._levelBarW) {
            this.levelBarFill.clear();
            this.levelBarGlow.clear();
            const fillW = this._levelBarW * Math.min(1, progress);
            if (fillW > 0) {
                this.levelBarGlow.roundRect(this._levelBarX - 2, this._levelBarY - 2, fillW + 4, this._levelBarH + 4, this._levelBarH + 2)
                    .fill({ color: THEME.accent, alpha: 0.16 });
                this.levelBarFill.roundRect(this._levelBarX, this._levelBarY, fillW, this._levelBarH, this._levelBarH / 2)
                    .fill({ color: THEME.accent, alpha: 1 });
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

    _clearTitleTweens() {
        if (!this.game || !this.game.effects || !Array.isArray(this.game.effects.tweens)) return;

        const currentTitleRoot = this.titleContainer;
        this.game.effects.tweens = this.game.effects.tweens.filter((tween) => {
            if (!tween || !tween._isTitleTween) return true;

            const root = tween._titleRoot;
            if (root && root !== currentTitleRoot && !root.destroyed) {
                root.destroy({ children: true });
            }
            return false;
        });
    }

    _destroyTitleRoots(except = null) {
        const candidates = new Set();
        if (this.titleContainer) candidates.add(this.titleContainer);

        const stage = this.game && this.game.app && this.game.app.stage;
        if (stage && Array.isArray(stage.children)) {
            stage.children.forEach((child) => {
                if (child && child._blockpangTitleRoot) candidates.add(child);
            });
        }

        candidates.forEach((root) => {
            if (!root || root === except || root.destroyed) return;
            root.destroy({ children: true });
        });

        if (except && !except.destroyed) {
            this.titleContainer = except;
        } else if (!except || (this.titleContainer && this.titleContainer.destroyed)) {
            this.titleContainer = null;
        }
    }

    clearOrphanTitleScreens({ keepCurrent = true } = {}) {
        this._destroyTitleRoots(keepCurrent ? this.titleContainer : null);
    }

    _fitTextToWidth(text, maxWidth, minSize = 10) {
        if (!text || text.destroyed) return;
        let size = Number(text.style.fontSize) || 14;
        while (text.width > maxWidth && size > minSize) {
            size -= 1;
            text.style.fontSize = size;
        }
    }

    _drawNeonButtonFrame(g, width, height, variant = 'ghost', hovered = false) {
        g.clear();

        const radius = Math.min(14, Math.max(8, height * 0.24));
        const isPrimary = variant === 'primary';
        const isSecondary = variant === 'secondary';
        const isGold = variant === 'gold';
        const border = isGold ? THEME.gold : THEME.secondary;
        const borderAlpha = hovered ? (isPrimary ? 0.95 : 0.84) : (isPrimary ? 0.76 : 0.58);
        const base = isPrimary ? THEME.accentDeep : THEME.surface;
        const mid = isPrimary ? THEME.accent : (isSecondary ? THEME.surfaceAlt : THEME.bgDim);
        const top = isPrimary ? THEME.rose : (isGold ? THEME.gold : THEME.secondaryDp);

        g.roundRect(0, 7, width, height, radius + 3)
            .fill({ color: THEME.shadow, alpha: hovered ? 0.42 : 0.32 });
        g.roundRect(-2, -2, width + 4, height + 4, radius + 2)
            .stroke({ width: 2, color: border, alpha: hovered ? 0.25 : 0.14 });
        g.roundRect(0, 0, width, height, radius)
            .fill({ color: base, alpha: isPrimary ? 1 : (hovered ? 0.96 : 0.9) });
        g.roundRect(3, 3, width - 6, height - 7, Math.max(6, radius - 2))
            .fill({ color: mid, alpha: isPrimary ? (hovered ? 1 : 0.92) : (hovered ? 0.54 : 0.36) });
        g.roundRect(7, 5, width - 14, Math.max(7, height * 0.22), Math.max(5, radius - 5))
            .fill({ color: THEME.white, alpha: isPrimary ? (hovered ? 0.22 : 0.15) : (hovered ? 0.12 : 0.08) });
        g.roundRect(5, height - 9, width - 10, 4, 3)
            .fill({ color: isPrimary ? THEME.accentDeep : top, alpha: isPrimary ? 0.46 : 0.22 });
        g.roundRect(0, 0, width, height, radius)
            .stroke({ width: isPrimary ? 2.2 : 1.5, color: border, alpha: borderAlpha });

        const railAlpha = hovered ? 0.72 : 0.46;
        g.roundRect(6, height * 0.24, 3, height * 0.52, 2)
            .fill({ color: border, alpha: railAlpha });
        g.roundRect(width - 9, height * 0.24, 3, height * 0.52, 2)
            .fill({ color: border, alpha: railAlpha });

        const bracket = Math.min(23, width * 0.16);
        const inset = 7;
        const accentAlpha = isPrimary ? (hovered ? 0.9 : 0.7) : (hovered ? 0.68 : 0.48);
        g.moveTo(inset, inset + 11)
            .lineTo(inset, inset)
            .lineTo(inset + bracket, inset)
            .moveTo(width - inset - bracket, inset)
            .lineTo(width - inset, inset)
            .lineTo(width - inset, inset + 11)
            .moveTo(inset, height - inset - 11)
            .lineTo(inset, height - inset)
            .lineTo(inset + bracket, height - inset)
            .moveTo(width - inset - bracket, height - inset)
            .lineTo(width - inset, height - inset)
            .lineTo(width - inset, height - inset - 11)
            .stroke({ width: 2, color: isPrimary ? THEME.gold : border, alpha: accentAlpha });
    }

    _drawButtonIcon(g, icon, x, y, size, color, alpha = 1) {
        g.clear();
        if (!icon) return;

        if (icon === 'play') {
            g.moveTo(x + size * 0.32, y + size * 0.18)
                .lineTo(x + size * 0.78, y + size * 0.5)
                .lineTo(x + size * 0.32, y + size * 0.82)
                .closePath()
                .fill({ color, alpha });
            return;
        }

        if (icon === 'continue') {
            g.roundRect(x + size * 0.24, y + size * 0.18, size * 0.16, size * 0.64, 2)
                .fill({ color, alpha });
            g.moveTo(x + size * 0.5, y + size * 0.18)
                .lineTo(x + size * 0.82, y + size * 0.5)
                .lineTo(x + size * 0.5, y + size * 0.82)
                .closePath()
                .fill({ color, alpha });
            return;
        }

        if (icon === 'rank') {
            const barW = size * 0.17;
            const baseY = y + size * 0.82;
            const gap = size * 0.08;
            [0.38, 0.62, 0.48].forEach((barH, i) => {
                const bx = x + size * 0.2 + i * (barW + gap);
                g.roundRect(bx, baseY - size * barH, barW, size * barH, 2)
                    .fill({ color, alpha: alpha * (i === 1 ? 1 : 0.72) });
            });
            g.circle(x + size * 0.5, y + size * 0.16, size * 0.11)
                .fill({ color: THEME.gold, alpha });
            return;
        }

        if (icon === 'mail') {
            const ix = x + size * 0.12;
            const iy = y + size * 0.25;
            const iw = size * 0.76;
            const ih = size * 0.5;
            g.roundRect(ix, iy, iw, ih, 2)
                .stroke({ width: 1.7, color, alpha });
            g.moveTo(ix + 2, iy + 3)
                .lineTo(ix + iw * 0.5, iy + ih * 0.58)
                .lineTo(ix + iw - 2, iy + 3)
                .moveTo(ix + 2, iy + ih - 3)
                .lineTo(ix + iw * 0.36, iy + ih * 0.45)
                .moveTo(ix + iw - 2, iy + ih - 3)
                .lineTo(ix + iw * 0.64, iy + ih * 0.45)
                .stroke({ width: 1.4, color, alpha: alpha * 0.9 });
            return;
        }

        if (icon === 'close') {
            g.moveTo(x + size * 0.28, y + size * 0.28)
                .lineTo(x + size * 0.72, y + size * 0.72)
                .moveTo(x + size * 0.72, y + size * 0.28)
                .lineTo(x + size * 0.28, y + size * 0.72)
                .stroke({ width: 2.2, color, alpha });
            return;
        }

        if (icon === 'check') {
            g.moveTo(x + size * 0.22, y + size * 0.52)
                .lineTo(x + size * 0.42, y + size * 0.72)
                .lineTo(x + size * 0.8, y + size * 0.3)
                .stroke({ width: 2.4, color, alpha });
            return;
        }

        if (icon === 'skip') {
            g.moveTo(x + size * 0.34, y + size * 0.25)
                .lineTo(x + size * 0.62, y + size * 0.5)
                .lineTo(x + size * 0.34, y + size * 0.75)
                .moveTo(x + size * 0.62, y + size * 0.25)
                .lineTo(x + size * 0.9, y + size * 0.5)
                .lineTo(x + size * 0.62, y + size * 0.75)
                .stroke({ width: 2, color, alpha });
        }
    }

    _getButtonIconTextureKey(icon) {
        return {
            play: 'iconPlay',
            continue: 'iconContinue',
            rank: 'iconRank',
            mail: 'iconMail',
            close: 'iconClose',
            check: 'iconCheck',
            skip: 'iconSkip',
        }[icon] || null;
    }

    _makeNeonButton(parent, {
        x,
        y,
        width,
        height,
        label,
        variant = 'ghost',
        icon = null,
        fontSize = 14,
        minFontSize = 10,
        onPress,
        registerActive = false,
        hitPad = 8,
    }) {
        const btn = new PIXI.Container();
        btn.position.set(x, y);
        btn.eventMode = 'static';
        btn.cursor = 'pointer';
        btn.hitArea = new PIXI.Rectangle(-hitPad, -hitPad, width + hitPad * 2, height + hitPad * 2);

        const bg = new PIXI.Graphics();
        btn.addChild(bg);

        const iconTextureKey = this._getButtonIconTextureKey(icon);
        const iconTexture = iconTextureKey ? getBlockpangTexture(iconTextureKey) : null;
        const iconG = icon
            ? (iconTexture ? new PIXI.Sprite(iconTexture) : new PIXI.Graphics())
            : null;
        const iconIsSprite = !!(iconG && iconTexture);
        if (iconG) {
            iconG.eventMode = 'none';
            if (iconIsSprite) iconG.anchor.set(0.5);
            btn.addChild(iconG);
        }

        const textColor = variant === 'primary' ? THEME.white : THEME.inkStrong;
        const txt = new PIXI.Text({
            text: label,
            style: {
                fontFamily: FONT_BODY,
                fontSize,
                fill: textColor,
                fontWeight: variant === 'ghost' ? '700' : '800',
                letterSpacing: variant === 'ghost' ? 0.2 : 0.8,
                dropShadow: {
                    color: variant === 'primary' ? THEME.shadow : THEME.secondary,
                    blur: variant === 'primary' ? 4 : 3,
                    distance: variant === 'primary' ? 1 : 0,
                    alpha: variant === 'primary' ? 0.38 : 0.18,
                },
            },
        });
        txt.anchor.set(0.5, 0.5);
        txt.eventMode = 'none';
        btn.addChild(txt);

        const iconSize = icon ? Math.min(height * 0.43, width < 150 ? 15 : 20) : 0;
        const iconX = icon ? Math.max(15, Math.min(28, width * 0.095)) : 0;
        const leftPad = icon ? iconX + iconSize + Math.max(8, width * 0.03) : 18;
        const rightPad = 18;
        const textMax = Math.max(40, width - leftPad - rightPad);
        txt.position.set(icon ? leftPad + textMax / 2 : width / 2, height / 2 - 1);
        this._fitTextToWidth(txt, textMax, minFontSize);

        const draw = (hovered = false) => {
            this._drawNeonButtonFrame(bg, width, height, variant, hovered);
            if (iconG) {
                const iconColor = variant === 'primary' ? THEME.white : (variant === 'gold' ? THEME.gold : THEME.secondary);
                const iconAlpha = hovered ? 1 : 0.88;
                if (iconIsSprite) {
                    iconG.width = iconSize * 1.28;
                    iconG.height = iconSize * 1.28;
                    iconG.position.set(iconX + iconSize * 0.5, height / 2);
                    iconG.alpha = iconAlpha;
                    iconG.tint = 0xFFFFFF;
                } else {
                    this._drawButtonIcon(
                        iconG,
                        icon,
                        iconX,
                        (height - iconSize) / 2,
                        iconSize,
                        iconColor,
                        iconAlpha
                    );
                }
            }
        };
        draw(false);

        btn.on('pointerover', () => draw(true));
        btn.on('pointerout',  () => draw(false));

        let lastFire = 0;
        const fire = () => {
            const now = performance.now();
            if (now - lastFire < 280) return;
            lastFire = now;
            if (onPress) onPress();
        };
        btn.on('pointerdown', fire);
        btn.on('pointertap',  fire);
        parent.addChild(btn);

        if (registerActive) {
            this._activeButtons.push({
                x: x - hitPad,
                y: y - hitPad,
                w: width + hitPad * 2,
                h: height + hitPad * 2,
                action: fire,
            });
        }

        return { btn, txt, bg, icon: iconG, width, height };
    }

    // ══════════════════════════════════════
    // ══  TITLE SCREEN
    // ══════════════════════════════════════
    showTitleScreen() {
        this._clearTitleTweens();
        this._destroyTitleRoots();
        this._titleRefs = null;

        const container = new PIXI.Container();
        container._blockpangTitleRoot = true;
        container._blockpangTitleSerial = ++this._titleSerial;
        container.eventMode = 'static';
        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;
        container.hitArea = new PIXI.Rectangle(0, 0, w, h);

        const centerX = w / 2;
        const isSmall = w < 380;
        const isLandscape = w > h * 1.08;
        const isShort = h < 640;
        const sc = isSmall ? 0.9 : 1;

        const splashTexture = getBlockpangTexture('titleSplash');
        if (splashTexture) {
            const splash = new PIXI.Sprite(splashTexture);
            const tw = splashTexture.width || splashTexture.orig?.width || 1;
            const th = splashTexture.height || splashTexture.orig?.height || 1;
            const scale = Math.max(w / tw, h / th);
            splash.anchor.set(0.5);
            splash.scale.set(scale);
            splash.position.set(centerX, h * (isLandscape ? 0.52 : 0.5));
            splash.alpha = 0.94;
            container.addChild(splash);
        }

        const artGrade = new PIXI.Graphics();
        artGrade.rect(0, 0, w, h).fill({ color: THEME.bgDeep, alpha: splashTexture ? 0.08 : 0.2 });
        artGrade.rect(0, 0, w, h * 0.26).fill({ color: THEME.shadow, alpha: 0.34 });
        artGrade.rect(0, h * 0.58, w, h * 0.42).fill({ color: THEME.bg, alpha: 0.18 });
        artGrade.rect(0, h * 0.82, w, h * 0.18).fill({ color: THEME.shadow, alpha: 0.36 });
        container.addChild(artGrade);

        // ── Small decorative block pictogram (a few stacked pieces above logo) ──
        const deco = new PIXI.Graphics();
        const dcs = Math.max(10, Math.min(14, w * 0.03));   // deco-cell size
        const dcGap = 2;
        // Layout: three small pieces side by side, each a 2x2, 1x2, 2x1
        const decoColors = [THEME.secondary, THEME.gold, THEME.accent];
        const pieces = [
            [[1,1],[1,0]],
            [[1],[1],[1]],
            [[1,1],[0,1]],
        ];
        let dx = 0;
        const pieceGap = dcs * 0.8;
        pieces.forEach((shape, pi) => {
            const pw = shape[0].length * (dcs + dcGap);
            shape.forEach((row, ri) => {
                row.forEach((v, ci) => {
                    if (!v) return;
                    deco.roundRect(dx + ci * (dcs + dcGap), ri * (dcs + dcGap), dcs, dcs, 3)
                        .fill({ color: decoColors[pi], alpha: 0.9 });
                });
            });
            dx += pw + pieceGap;
        });
        // total deco width for centering
        const decoW = dx - pieceGap;
        const decoY = h * (isLandscape ? 0.13 : 0.145) - dcs;
        deco.position.set(centerX - decoW / 2, decoY);
        container.addChild(deco);

        // ── Logo: "블럭팡" / 한글/영문 반응 ──
        const logoFontSize = Math.min(isLandscape ? 58 : 70, w * (isLandscape ? 0.13 : 0.17)) * sc;
        const logo = new PIXI.Text({
            text: getText('gameTitle'),
            style: {
                fontFamily: FONT_BODY,
                fontSize: logoFontSize,
                fill: THEME.inkStrong,
                fontWeight: '900',
                letterSpacing: 1.5,
                stroke: { color: THEME.secondaryDp, width: Math.max(3, logoFontSize * 0.08), alpha: 0.82 },
                dropShadow: { color: THEME.accent, blur: 14, distance: 0, alpha: 0.55 },
            },
        });
        logo.anchor.set(0.5, 0.5);
        logo.position.set(centerX, h * (isLandscape ? 0.22 : 0.225));

        const logoPlateW = Math.min(w * 0.86, Math.max(250, logo.width + 76));
        const logoPlateH = Math.max(70, logo.height + 26);
        const logoPlate = new PIXI.Graphics();
        logoPlate.roundRect(centerX - logoPlateW / 2, logo.y - logoPlateH / 2 + 5, logoPlateW, logoPlateH, 22)
            .fill({ color: THEME.shadow, alpha: 0.34 });
        logoPlate.roundRect(centerX - logoPlateW / 2, logo.y - logoPlateH / 2, logoPlateW, logoPlateH, 22)
            .fill({ color: THEME.surface, alpha: 0.52 });
        logoPlate.roundRect(centerX - logoPlateW / 2 + 6, logo.y - logoPlateH / 2 + 5, logoPlateW - 12, Math.max(12, logoPlateH * 0.24), 16)
            .fill({ color: THEME.white, alpha: 0.08 });
        logoPlate.roundRect(centerX - logoPlateW / 2, logo.y - logoPlateH / 2, logoPlateW, logoPlateH, 22)
            .stroke({ width: 1.8, color: THEME.secondary, alpha: 0.74 });
        container.addChild(logoPlate);
        container.addChild(logo);

        // ── Subtitle ──
        const subtitle = new PIXI.Text({
            text: getText('blockPuzzle'),
            style: {
                fontFamily: FONT_BODY,
                fontSize: Math.min(14, w * 0.034) * sc,
                fill: THEME.goldSoft,
                fontWeight: '800',
                letterSpacing: 2.2,
                dropShadow: { color: THEME.shadow, blur: 4, distance: 1, alpha: 0.45 },
            },
        });
        subtitle.anchor.set(0.5, 0);
        subtitle.position.set(centerX, logo.y + logoPlateH * 0.5 + 10);
        container.addChild(subtitle);

        // ── Best Score pill ──
        const bestScore = this.game.scoreManager.bestScore;
        let bestText = null;
        if (bestScore > 0) {
            const bestLabel = `${getText('best')}  ${bestScore.toLocaleString()}`;
            bestText = new PIXI.Text({
                text: bestLabel,
                style: {
                    fontFamily: FONT_BODY,
                    fontSize: Math.min(13, w * 0.033) * sc,
                    fill: THEME.gold,
                    fontWeight: '600',
                    letterSpacing: 1,
                },
            });
            bestText.anchor.set(0.5, 0);

            // Pill background (draw first, measure after)
            const padX = 14, padY = 6;
            const pillW = bestText.width + padX * 2;
            const pillH = bestText.height + padY * 2;
            const pillY = subtitle.y + subtitle.height + 18;
            const pill = new PIXI.Graphics();
            pill.roundRect(centerX - pillW / 2, pillY, pillW, pillH, pillH / 2)
                .fill({ color: THEME.surface });
            pill.roundRect(centerX - pillW / 2, pillY, pillW, pillH, pillH / 2)
                .stroke({ width: 1, color: THEME.goldSoft, alpha: 1 });
            container.addChild(pill);

            bestText.position.set(centerX, pillY + padY);
            container.addChild(bestText);
        }

        // ── Buttons ──
        const hasSave = Game.hasSavedGame();
        const btnW = Math.min(w * (isLandscape ? 0.42 : 0.7), 304);
        const btnH = Math.min(58, Math.max(50, h * 0.066));
        const actionGap = Math.max(10, Math.min(14, h * 0.015));
        const startBaseY = isLandscape
            ? (hasSave ? h * 0.57 : h * 0.545)
            : (isShort ? (hasSave ? h * 0.61 : h * 0.59) : (hasSave ? h * 0.665 : h * 0.645));
        const startBtnY = Math.min(startBaseY, h - (hasSave ? 178 : 132));
        const btnX = centerX - btnW / 2;

        this._activeButtons = [];

        const makeTitleButton = (x, y, width, height, label, variant, action, icon = null) => {
            return this._makeNeonButton(container, {
                x,
                y,
                width,
                height,
                label,
                variant,
                icon,
                fontSize: variant === 'ghost'
                    ? Math.min(12, w * 0.031) * sc
                    : Math.min(18, width * 0.062),
                minFontSize: variant === 'ghost' ? 10 : 13,
                onPress: action,
                registerActive: true,
            });
        };

        // Continue (if saved)
        let resumeBtn = null, resumeBtnText = null;
        if (hasSave) {
            const savedScore = Game.getSavedScore();
            const resumeBtnY = startBtnY - btnH - actionGap;
            const resumeLabel = savedScore > 0
                ? `${getText('continueGame')}  -  ${savedScore.toLocaleString()}`
                : getText('continueGame');
            const r = makeTitleButton(
                btnX, resumeBtnY, btnW, btnH, resumeLabel, 'secondary',
                () => { this.game.sound.ensureContext(); this.game.startGame(true); },
                'continue'
            );
            resumeBtn = r.btn; resumeBtnText = r.txt;
        }

        // Start (primary)
        const s = makeTitleButton(
            btnX, startBtnY, btnW, btnH, getText('gameStart'), 'primary',
            () => { this.game.sound.ensureContext(); this.game.startGame(false); },
            'play'
        );
        const startBtn = s.btn, startBtnText = s.txt;

        // ── Bottom Row: Hall of Fame + Contact (ghost buttons) ──
        const smallBtnH = Math.min(42, Math.max(38, h * 0.052));
        const gap = 12;
        const bottomY = startBtnY + btnH + (hasSave ? 36 : 40);
        const smallBtnW = Math.min((btnW - gap) / 2, 140);

        const hofBtn = makeTitleButton(btnX, bottomY, smallBtnW, smallBtnH, getText('hallOfFame'), 'ghost',
            () => this.showHallOfFame(), 'rank');
        const contactBtn = makeTitleButton(btnX + smallBtnW + gap, bottomY, smallBtnW, smallBtnH, getText('contact'), 'ghost',
            () => window.open('mailto:contact@archerlab.dev', '_blank'), 'mail');

        // ── Language chip (top-left pill) ──
        // ArcherLab HTML 링크(상단 중앙)와 세로 중앙선을 정확히 맞추기 위해
        // 링크의 실제 getBoundingClientRect()를 읽어 그대로 반영한다.
        // 하드코딩 픽셀값은 폰트/DPI/뷰포트에 따라 1-2px씩 어긋나 시각적 misalignment 발생.
        const langLabel = LANG_LABELS[currentLang] || '한국어';
        const archLinkEl = document.getElementById('archerlab-link');
        const archRect = archLinkEl ? archLinkEl.getBoundingClientRect() : null;
        const langBtnH = archRect ? archRect.height : Math.round(Math.min(28, Math.max(24, h * 0.04)));
        const langFontSize = Math.max(11, Math.min(12, w * 0.03)) * sc;
        const langBtnW = Math.min(110, w * 0.28);
        const langX = 14;
        const langY = archRect ? archRect.top : 14;

        const langTrigger = new PIXI.Graphics();
        langTrigger.roundRect(0, 3, langBtnW, langBtnH, langBtnH / 2)
                   .fill({ color: THEME.shadow, alpha: 0.22 });
        langTrigger.roundRect(0, 0, langBtnW, langBtnH, langBtnH / 2)
                   .fill({ color: THEME.surface, alpha: 0.82 });
        langTrigger.roundRect(2, 2, langBtnW - 4, langBtnH - 5, Math.max(8, langBtnH / 2 - 2))
                   .fill({ color: THEME.surfaceAlt, alpha: 0.28 });
        langTrigger.roundRect(0, 0, langBtnW, langBtnH, langBtnH / 2)
                   .stroke({ width: 1.5, color: THEME.secondary, alpha: 0.76 });
        langTrigger.position.set(langX, langY);
        langTrigger.eventMode = 'static';
        langTrigger.cursor = 'pointer';
        langTrigger.hitArea = new PIXI.Rectangle(-4, -4, langBtnW + 8, langBtnH + 8);
        container.addChild(langTrigger);

        const langTriggerText = new PIXI.Text({
            text: `${langLabel}  ▾`,
            style: {
                fontFamily: FONT_BODY,
                fontSize: langFontSize,
                fill: THEME.inkStrong,
                fontWeight: '700',
            },
        });
        langTriggerText.anchor.set(0.5, 0.5);
        langTriggerText.position.set(langBtnW / 2, langBtnH / 2);
        langTrigger.addChild(langTriggerText);
        const langIconTexture = getBlockpangTexture('iconLanguage');
        if (langIconTexture) {
            const langIcon = new PIXI.Sprite(langIconTexture);
            langIcon.anchor.set(0.5);
            langIcon.eventMode = 'none';
            langIcon.width = langBtnH * 0.62;
            langIcon.height = langBtnH * 0.62;
            langIcon.position.set(langBtnH * 0.58, langBtnH / 2);
            langTrigger.addChild(langIcon);
            langTriggerText.position.set(langBtnW / 2 + langBtnH * 0.12, langBtnH / 2);
        }

        // Dropdown items
        const dropdownContainer = new PIXI.Container();
        dropdownContainer.visible = false;
        container.addChild(dropdownContainer);

        const dismissBg = new PIXI.Graphics();
        dismissBg.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.01 });
        dismissBg.eventMode = 'static';
        dropdownContainer.addChild(dismissBg);

        let dropdownOpen = false;
        const langItems = [
            { code: 'ko', label: '한국어' },
            { code: 'en', label: 'English' },
            { code: 'ja', label: '日本語' },
        ];

        langItems.forEach((lang, i) => {
            const iy = langY + langBtnH + 4 + i * (langBtnH + 3);
            const isActive = lang.code === currentLang;

            const itemBg = new PIXI.Graphics();
            itemBg.roundRect(0, 2, langBtnW, langBtnH, langBtnH / 2)
                  .fill({ color: THEME.shadow, alpha: 0.2 });
            itemBg.roundRect(0, 0, langBtnW, langBtnH, langBtnH / 2)
                  .fill({ color: isActive ? THEME.accent : THEME.surface, alpha: isActive ? 0.96 : 0.88 });
            itemBg.roundRect(0, 0, langBtnW, langBtnH, langBtnH / 2)
                  .stroke({ width: 1.5, color: isActive ? THEME.secondary : THEME.secondary, alpha: isActive ? 0.78 : 0.62 });
            itemBg.position.set(langX, iy);
            itemBg.eventMode = 'static';
            itemBg.cursor = 'pointer';
            dropdownContainer.addChild(itemBg);

            const itemText = new PIXI.Text({
                text: lang.label,
                style: {
                    fontFamily: FONT_BODY,
                    fontSize: langFontSize,
                    fill: isActive ? THEME.white : THEME.inkStrong,
                    fontWeight: '700',
                },
            });
            itemText.anchor.set(0.5, 0.5);
            itemText.position.set(langBtnW / 2, langBtnH / 2);
            itemBg.addChild(itemText);

            itemBg.on('pointerover', () => { if (!isActive) itemBg.alpha = 0.85; });
            itemBg.on('pointerout',  () => { itemBg.alpha = 1; });
            itemBg.on('pointerdown', () => {
                if (lang.code !== currentLang) {
                    setLanguage(lang.code);
                    this.showTitleScreen();
                } else {
                    closeDropdown();
                }
            });
        });

        const openDropdown  = () => { dropdownOpen = true;  dropdownContainer.visible = true; };
        const closeDropdown = () => { dropdownOpen = false; dropdownContainer.visible = false; };

        langTrigger.on('pointerover', () => { langTrigger.alpha = 0.85; });
        langTrigger.on('pointerout',  () => { langTrigger.alpha = 1; });
        langTrigger.on('pointerdown', () => { dropdownOpen ? closeDropdown() : openDropdown(); });
        dismissBg.on('pointerdown', closeDropdown);

        const langBtn = { btn: langTrigger, txt: langTriggerText };

        // ── Top-right sound toggle ──
        const soundSize = langBtnH;
        const titleSoundBtn = new PIXI.Container();
        titleSoundBtn.position.set(w - 14 - soundSize, langY);
        titleSoundBtn.eventMode = 'static';
        titleSoundBtn.cursor = 'pointer';
        titleSoundBtn.hitArea = new PIXI.Rectangle(-4, -4, soundSize + 8, soundSize + 8);

        const soundBg = new PIXI.Graphics();
        titleSoundBtn.addChild(soundBg);
        const drawSoundBtn = (hovered = false) => {
            soundBg.clear();
            soundBg.roundRect(0, 3, soundSize, soundSize, soundSize / 2)
                   .fill({ color: THEME.shadow, alpha: hovered ? 0.3 : 0.22 });
            soundBg.roundRect(0, 0, soundSize, soundSize, soundSize / 2)
                   .fill({ color: THEME.surface, alpha: hovered ? 0.92 : 0.82 });
            soundBg.roundRect(2, 2, soundSize - 4, soundSize - 5, Math.max(8, soundSize / 2 - 2))
                   .fill({ color: THEME.surfaceAlt, alpha: hovered ? 0.42 : 0.28 });
            soundBg.roundRect(0, 0, soundSize, soundSize, soundSize / 2)
                   .stroke({ width: 1.5, color: THEME.secondary, alpha: hovered ? 0.9 : 0.76 });
        };
        drawSoundBtn(false);

        const titleSoundTexture = getBlockpangTexture(this.game.sound.enabled ? 'iconSoundOn' : 'iconSoundOff');
        const titleSoundIcon = titleSoundTexture
            ? new PIXI.Sprite(titleSoundTexture)
            : new PIXI.Text({
                text: '\u266A',
                style: {
                    fontFamily: FONT_BODY,
                    fontSize: Math.max(15, Math.min(18, w * 0.043)),
                    fill: this.game.sound.enabled ? THEME.inkStrong : THEME.inkFaint,
                    fontWeight: '700',
                },
            });
        titleSoundIcon.anchor.set(0.5, 0.5);
        titleSoundIcon.position.set(soundSize / 2, soundSize / 2 - 1);
        titleSoundIcon.eventMode = 'none';
        if (titleSoundTexture) {
            titleSoundIcon.width = soundSize * 0.76;
            titleSoundIcon.height = soundSize * 0.76;
            titleSoundIcon.alpha = this.game.sound.enabled ? 1 : 0.55;
        }
        titleSoundBtn.addChild(titleSoundIcon);

        titleSoundBtn.on('pointerdown', () => {
            const enabled = this.game.sound.toggle();
            const nextTexture = getBlockpangTexture(enabled ? 'iconSoundOn' : 'iconSoundOff');
            if (nextTexture && titleSoundIcon instanceof PIXI.Sprite) {
                titleSoundIcon.texture = nextTexture;
                titleSoundIcon.alpha = enabled ? 1 : 0.55;
            } else if (titleSoundIcon.style) {
                titleSoundIcon.style.fill = enabled ? THEME.inkStrong : THEME.inkFaint;
            }
        });
        titleSoundBtn.on('pointerover', () => drawSoundBtn(true));
        titleSoundBtn.on('pointerout',  () => drawSoundBtn(false));
        container.addChild(titleSoundBtn);

        // ── Version text (footer) ──
        const versionText = new PIXI.Text({
            text: 'v1.0  -  ArcherLab',
            style: {
                fontFamily: FONT_BODY,
                fontSize: Math.min(10, w * 0.025),
                fill: THEME.inkFaint,
                fontWeight: '500',
                letterSpacing: 0.5,
            },
        });
        versionText.anchor.set(0.5, 1);
        versionText.position.set(centerX, h - 14);
        container.addChild(versionText);

        this._titleRefs = { logo, subtitle, startBtnText, langBtn, contactBtn, hofBtn, bestText, resumeBtnText };

        // ── Entrance Animation ── (fade + gentle lift, no pop-scaling)
        container.alpha = 0;
        const liftTargets = [deco, logoPlate, logo, subtitle, startBtn, hofBtn.btn, contactBtn.btn, langTrigger, titleSoundBtn];
        if (resumeBtn) liftTargets.push(resumeBtn);
        liftTargets.forEach(el => { el.y += 16; el.alpha = 0; });

        this.game.effects.tweens.push({
            elapsed: 0,
            duration: 700,
            _isTitleTween: true,
            _titleRoot: container,
            _lastLift: 0,
            update(dt) {
                if (!container || container.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                container.alpha = easeOutCubic(Math.min(t / 0.4, 1));

                const lift = easeOutCubic(t) * 16;
                const delta = lift - this._lastLift;
                this._lastLift = lift;
                liftTargets.forEach((el, i) => {
                    if (!el || el.destroyed) return;
                    // Stagger
                    const stagger = i * 0.04;
                    if (t < stagger) { el.alpha = 0; return; }
                    const lt = Math.min((t - stagger) / (1 - stagger), 1);
                    el.alpha = easeOutCubic(lt);
                    el.y -= delta;
                });
                return t >= 1;
            }
        });

        this.titleContainer = container;
        this.game.app.stage.addChild(container);
    }

    hideTitleScreen(onComplete) {
        this._activeButtons = [];
        this._clearTitleTweens();
        if (!this.titleContainer || this.titleContainer.destroyed) {
            this.titleContainer = null;
            this._destroyTitleRoots();
            if (onComplete) onComplete();
            return;
        }

        const container = this.titleContainer;
        container._blockpangTitleHiding = true;
        this._titleRefs = null;
        const ui = this;
        let completed = false;
        const finish = () => {
            if (completed) return;
            completed = true;
            if (ui.titleContainer === container) {
                ui.titleContainer = null;
                ui._titleRefs = null;
            }
            if (onComplete) onComplete();
        };

        this.game.effects.tweens.push({
            elapsed: 0,
            duration: 400,
            _isTitleTween: true,
            _titleRoot: container,
            update(dt) {
                if (!container || container.destroyed) {
                    finish();
                    return true;
                }
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                container.alpha = 1 - easeOutCubic(t);
                if (t >= 1) {
                    container.destroy({ children: true });
                    finish();
                    return true;
                }
                return false;
            }
        });
    }

    _refreshTitleTexts() {
        if (!this._titleRefs) return;
        const { subtitle, startBtnText, langBtn, contactBtn, hofBtn } = this._titleRefs;
        if (subtitle && !subtitle.destroyed) subtitle.text = getText('blockPuzzle');
        if (startBtnText && !startBtnText.destroyed) startBtnText.text = getText('gameStart');
        if (langBtn && langBtn.txt && !langBtn.txt.destroyed) langBtn.txt.text = `${LANG_LABELS[currentLang] || '한국어'}  ▾`;
        if (contactBtn && contactBtn.txt && !contactBtn.txt.destroyed) contactBtn.txt.text = getText('contact');
        if (hofBtn && hofBtn.txt && !hofBtn.txt.destroyed) hofBtn.txt.text = getText('hallOfFame');
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

        // Warm scrim (paper, not dark)
        const bg = new PIXI.Graphics();
        bg.rect(0, 0, w, h).fill({ color: THEME.bgDeep, alpha: 0.75 });
        overlay.addChild(bg);

        // Panel
        const panelW = Math.min(w * 0.86, 380);
        const panelH = Math.min(h * 0.62, 420);
        const panelX = (w - panelW) / 2;
        const panelY = (h - panelH) / 2;

        const panel = new PIXI.Graphics();
        // Soft shadow
        panel.roundRect(panelX + 2, panelY + 6, panelW, panelH, 20)
             .fill({ color: THEME.shadow, alpha: 0.12 });
        // Card surface
        panel.roundRect(panelX, panelY, panelW, panelH, 20)
             .fill({ color: THEME.surface });
        panel.roundRect(panelX, panelY, panelW, panelH, 20)
             .stroke({ width: 1, color: THEME.divider, alpha: 1 });
        overlay.addChild(panel);

        const centerX = w / 2;
        let yOff = panelY + 36;

        // Game Over title
        const title = new PIXI.Text({
            text: getText('gameOver'),
            style: {
                fontFamily: FONT_DISPLAY,
                fontSize: Math.min(30, panelW * 0.085),
                fill: THEME.rose,
                fontWeight: '400',
                letterSpacing: 1,
            },
        });
        title.anchor.set(0.5, 0);
        title.position.set(centerX, yOff);
        overlay.addChild(title);
        yOff += title.height + 22;

        // Divider
        const divider = new PIXI.Graphics();
        divider.moveTo(panelX + 36, yOff).lineTo(panelX + panelW - 36, yOff)
               .stroke({ width: 1, color: THEME.divider, alpha: 1 });
        overlay.addChild(divider);
        yOff += 20;

        // Score label
        const scoreLabel = new PIXI.Text({
            text: getText('score'),
            style: {
                fontFamily: FONT_BODY,
                fontSize: Math.min(11, panelW * 0.032),
                fill: THEME.inkMuted,
                fontWeight: '500',
                letterSpacing: 2,
            },
        });
        scoreLabel.anchor.set(0.5, 0);
        scoreLabel.position.set(centerX, yOff);
        overlay.addChild(scoreLabel);
        yOff += scoreLabel.height + 6;

        // Score value
        const scoreVal = new PIXI.Text({
            text: '0',
            style: {
                fontFamily: FONT_BODY,
                fontSize: Math.min(40, panelW * 0.11),
                fill: THEME.inkStrong,
                fontWeight: '700',
            },
        });
        scoreVal.anchor.set(0.5, 0);
        scoreVal.position.set(centerX, yOff);
        overlay.addChild(scoreVal);

        // Score count-up animation
        const finalScore = score;
        this.game.effects.tweens.push({
            elapsed: 0,
            duration: 1200,
            _delay: 400,
            update(dt) {
                if (scoreVal.destroyed) return true;
                if (this._delay > 0) { this._delay -= dt; return false; }
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                const eased = easeOutCubic(t);
                const displayScore = Math.round(finalScore * eased);
                scoreVal.text = displayScore.toLocaleString();

                // Pulse scale during counting
                if (t < 1) {
                    const pulse = 1 + Math.sin(t * Math.PI * 8) * 0.03 * (1 - t);
                    scoreVal.scale.set(pulse);
                } else {
                    scoreVal.scale.set(1);
                }
                return t >= 1;
            }
        });

        yOff += scoreVal.height + 10;

        // New best indicator — a small honey-gold pill instead of glow+sparkles
        if (isNewBest) {
            const newBest = new PIXI.Text({
                text: getText('newRecord'),
                style: {
                    fontFamily: FONT_BODY,
                    fontSize: Math.min(13, panelW * 0.038),
                    fill: THEME.white,
                    fontWeight: '700',
                    letterSpacing: 1.5,
                },
            });
            newBest.anchor.set(0.5, 0);

            const padX = 14, padY = 6;
            const pillW = newBest.width + padX * 2;
            const pillH = newBest.height + padY * 2;
            const pill = new PIXI.Graphics();
            pill.roundRect(centerX - pillW / 2, yOff, pillW, pillH, pillH / 2)
                .fill({ color: THEME.gold });
            overlay.addChild(pill);

            newBest.position.set(centerX, yOff + padY);
            overlay.addChild(newBest);

            yOff += pillH + 10;
        }

        // Best score
        const bestLabel = new PIXI.Text({
            text: `${getText('best')}  ${bestScore.toLocaleString()}`,
            style: {
                fontFamily: FONT_BODY,
                fontSize: Math.min(13, panelW * 0.036),
                fill: THEME.gold,
                fontWeight: '600',
                letterSpacing: 0.5,
            },
        });
        bestLabel.anchor.set(0.5, 0);
        bestLabel.position.set(centerX, yOff);
        overlay.addChild(bestLabel);
        yOff += bestLabel.height + 6;

        // Level & Lines
        const levelLabel = new PIXI.Text({
            text: `${getText('level')} ${this.game.scoreManager.level}  ·  ${getText('lines')} ${this.game.scoreManager.linesCleared}`,
            style: {
                fontFamily: FONT_BODY,
                fontSize: Math.min(11, panelW * 0.03),
                fill: THEME.inkMuted,
                fontWeight: '500',
                letterSpacing: 0.5,
            },
        });
        levelLabel.anchor.set(0.5, 0);
        levelLabel.position.set(centerX, yOff);
        overlay.addChild(levelLabel);
        yOff += levelLabel.height + 24;

        // ── Play Again button ──
        const btnW = panelW * 0.7;
        const btnH = 48;
        const btnX = centerX - btnW / 2;
        const btnY = Math.min(yOff, panelY + panelH - btnH * 2 - 40);

        const btn = new PIXI.Graphics();
        btn.roundRect(btnX, btnY + 3, btnW, btnH, btnH / 2)
           .fill({ color: THEME.shadow, alpha: 0.12 });
        btn.roundRect(btnX, btnY, btnW, btnH, btnH / 2)
           .fill({ color: THEME.accent });

        btn.eventMode = 'static';
        btn.cursor = 'pointer';
        btn.hitArea = new PIXI.Rectangle(btnX - 10, btnY - 10, btnW + 20, btnH + 20);
        btn.on('pointerover', () => { btn.alpha = 0.92; });
        btn.on('pointerout',  () => { btn.alpha = 1; });
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

        this._activeButtons = [{
            x: btnX - 10, y: btnY - 10,
            w: btnW + 20, h: btnH + 20,
            action: doRestart
        }];

        const btnText = new PIXI.Text({
            text: getText('playAgain'),
            style: {
                fontFamily: FONT_BODY,
                fontSize: Math.min(16, panelW * 0.046),
                fill: THEME.white,
                fontWeight: '700',
                letterSpacing: 1.5,
            },
        });
        btnText.anchor.set(0.5, 0.5);
        btnText.position.set(centerX, btnY + btnH / 2);
        btnText.eventMode = 'none';
        btn.addChild(btnText);

        // ── Back to Title button (ghost) ──
        const titleBtnH = 40;
        const titleBtnY = btnY + btnH + 14;
        const titleBtn = new PIXI.Graphics();
        titleBtn.roundRect(btnX, titleBtnY, btnW, titleBtnH, titleBtnH / 2)
                .fill({ color: THEME.surface });
        titleBtn.roundRect(btnX, titleBtnY, btnW, titleBtnH, titleBtnH / 2)
                .stroke({ width: 1, color: THEME.divider, alpha: 1 });

        titleBtn.eventMode = 'static';
        titleBtn.cursor = 'pointer';
        titleBtn.hitArea = new PIXI.Rectangle(btnX - 10, titleBtnY - 10, btnW + 20, titleBtnH + 20);
        titleBtn.on('pointerover', () => { titleBtn.alpha = 0.85; });
        titleBtn.on('pointerout',  () => { titleBtn.alpha = 1; });
        let titleTriggered = false;
        const doTitle = () => {
            if (titleTriggered) return;
            titleTriggered = true;
            this.game.goToTitle();
        };
        titleBtn.on('pointerdown', doTitle);
        titleBtn.on('pointertap', doTitle);
        overlay.addChild(titleBtn);

        this._activeButtons.push({
            x: btnX - 10, y: titleBtnY - 10,
            w: btnW + 20, h: titleBtnH + 20,
            action: doTitle
        });

        const titleBtnText = new PIXI.Text({
            text: getText('backToTitle'),
            style: {
                fontFamily: FONT_BODY,
                fontSize: Math.min(13, panelW * 0.038),
                fill: THEME.ink,
                fontWeight: '600',
                letterSpacing: 0.5,
            },
        });
        titleBtnText.anchor.set(0.5, 0.5);
        titleBtnText.position.set(centerX, titleBtnY + titleBtnH / 2);
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

    // ══════════════════════════════════════
    // ══  HALL OF FAME (명예의 전당)
    // ══════════════════════════════════════

    showHallOfFame() {
        if (this._hofOverlay) {
            this._hofOverlay.destroy({ children: true });
            this._hofOverlay = null;
        }

        const overlay = new PIXI.Container();
        overlay.eventMode = 'static';
        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;
        overlay.hitArea = new PIXI.Rectangle(0, 0, w, h);

        // Dark glass scrim
        const bg = new PIXI.Graphics();
        bg.rect(0, 0, w, h).fill({ color: THEME.bgDeep, alpha: 0.76 });
        bg.rect(0, 0, w, h).fill({ color: THEME.shadow, alpha: 0.22 });
        bg.eventMode = 'static';
        bg.on('pointerdown', () => this._closeHallOfFame());
        overlay.addChild(bg);

        // Panel
        const panelW = Math.min(w * 0.9, 400);
        const panelH = Math.min(h * 0.85, 600);
        const panelX = (w - panelW) / 2;
        const panelY = (h - panelH) / 2;

        const panel = new PIXI.Graphics();
        panel.roundRect(panelX + 4, panelY + 10, panelW, panelH, 18)
             .fill({ color: THEME.shadow, alpha: 0.42 });
        panel.roundRect(panelX - 2, panelY - 2, panelW + 4, panelH + 4, 20)
             .stroke({ width: 2, color: THEME.secondary, alpha: 0.22 });
        panel.roundRect(panelX, panelY, panelW, panelH, 18)
             .fill({ color: THEME.surface, alpha: 0.94 });
        panel.roundRect(panelX + 4, panelY + 4, panelW - 8, Math.max(48, panelH * 0.13), 14)
             .fill({ color: THEME.surfaceAlt, alpha: 0.46 });
        panel.roundRect(panelX + 10, panelY + 8, panelW - 20, 4, 3)
             .fill({ color: THEME.secondary, alpha: 0.28 });
        panel.roundRect(panelX, panelY, panelW, panelH, 18)
             .stroke({ width: 1.6, color: THEME.secondary, alpha: 0.72 });
        const bracket = Math.min(36, panelW * 0.12);
        const inset = 10;
        panel.moveTo(panelX + inset, panelY + inset + 16)
             .lineTo(panelX + inset, panelY + inset)
             .lineTo(panelX + inset + bracket, panelY + inset)
             .moveTo(panelX + panelW - inset - bracket, panelY + inset)
             .lineTo(panelX + panelW - inset, panelY + inset)
             .lineTo(panelX + panelW - inset, panelY + inset + 16)
             .moveTo(panelX + inset, panelY + panelH - inset - 16)
             .lineTo(panelX + inset, panelY + panelH - inset)
             .lineTo(panelX + inset + bracket, panelY + panelH - inset)
             .moveTo(panelX + panelW - inset - bracket, panelY + panelH - inset)
             .lineTo(panelX + panelW - inset, panelY + panelH - inset)
             .lineTo(panelX + panelW - inset, panelY + panelH - inset - 16)
             .stroke({ width: 2.2, color: THEME.gold, alpha: 0.7 });
        panel.eventMode = 'static';
        overlay.addChild(panel);

        const centerX = w / 2;
        let yOff = panelY + 26;

        // Title
        const title = new PIXI.Text({
            text: getText('hallOfFame'),
            style: {
                fontFamily: FONT_BODY,
                fontSize: Math.min(24, panelW * 0.064),
                fill: THEME.goldSoft,
                fontWeight: '900',
                letterSpacing: 1.4,
                stroke: { color: THEME.secondaryDp, width: 2, alpha: 0.62 },
                dropShadow: { color: THEME.secondary, blur: 7, distance: 0, alpha: 0.38 },
            },
        });
        title.anchor.set(0.5, 0);
        title.position.set(centerX, yOff);
        overlay.addChild(title);
        yOff += title.height + 14;

        // Divider
        const divider = new PIXI.Graphics();
        divider.roundRect(panelX + 28, yOff, panelW - 56, 3, 2)
               .fill({ color: THEME.secondary, alpha: 0.3 });
        divider.roundRect(panelX + panelW * 0.37, yOff - 1, panelW * 0.26, 5, 3)
               .fill({ color: THEME.gold, alpha: 0.52 });
        overlay.addChild(divider);
        yOff += 15;

        // Loading text
        const loadingText = new PIXI.Text({
            text: getText('loading'),
            style: {
                fontFamily: FONT_BODY,
                fontSize: 13,
                fill: THEME.inkMuted,
                fontWeight: '500',
            },
        });
        loadingText.anchor.set(0.5, 0);
        loadingText.position.set(centerX, yOff + 40);
        overlay.addChild(loadingText);

        // Close button
        const closeBtnY = panelY + panelH - 56;
        const closeBtnW = Math.min(panelW * 0.48, 176);
        const closeBtnH = 42;
        const closeBtnX = centerX - closeBtnW / 2;

        this._makeNeonButton(overlay, {
            x: closeBtnX,
            y: closeBtnY,
            width: closeBtnW,
            height: closeBtnH,
            label: getText('close'),
            variant: 'secondary',
            icon: 'close',
            fontSize: 14,
            minFontSize: 11,
            onPress: () => this._closeHallOfFame(),
        });

        this._hofOverlay = overlay;
        this.game.app.stage.addChild(overlay);

        // Fetch rankings
        this._fetchRankings(overlay, centerX, yOff, panelX, panelW, closeBtnY - yOff - 10, loadingText);
    }

    async _fetchRankings(overlay, centerX, startY, panelX, panelW, maxHeight, loadingText) {
        const requestUrl = `${GAME_API_URL}/rankings?game_id=${GAME_ID_BLOCKPANG}&limit=20`;
        try {
            const resp = await fetch(requestUrl);
            if (!resp.ok) {
                throw new Error(`Ranking request failed: ${resp.status}`);
            }
            const data = await resp.json();

            if (loadingText && !loadingText.destroyed) loadingText.visible = false;

            const rankings = data.rankings || [];
            if (rankings.length === 0) {
                const emptyPanel = new PIXI.Graphics();
                emptyPanel.roundRect(panelX + 26, startY + 26, panelW - 52, 76, 12)
                    .fill({ color: THEME.bgDim, alpha: 0.72 });
                emptyPanel.roundRect(panelX + 26, startY + 26, panelW - 52, 76, 12)
                    .stroke({ width: 1.2, color: THEME.secondary, alpha: 0.36 });
                overlay.addChild(emptyPanel);

                const noData = new PIXI.Text({
                    text: getText('noRecords'),
                    style: {
                        fontFamily: FONT_BODY,
                        fontSize: 14,
                        fill: THEME.inkMuted,
                        fontWeight: '500',
                    },
                });
                noData.anchor.set(0.5, 0);
                noData.position.set(centerX, startY + 52);
                overlay.addChild(noData);
                return;
            }

            const rowH = Math.min(28, maxHeight / Math.min(rankings.length + 1, 20));
            let y = startY;

            // Header
            const headerStyle = {
                fontFamily: FONT_BODY,
                fontSize: Math.max(9, Math.min(10, rowH * 0.46)),
                fill: THEME.inkMuted,
                fontWeight: '700',
                letterSpacing: 1.5,
            };
            const hRank = new PIXI.Text({ text: '#', style: headerStyle });
            hRank.anchor.set(0.5, 0);
            hRank.position.set(panelX + 38, y);
            overlay.addChild(hRank);
            const hName = new PIXI.Text({ text: 'NAME', style: headerStyle });
            hName.position.set(panelX + 66, y);
            overlay.addChild(hName);
            const hScore = new PIXI.Text({ text: 'SCORE', style: headerStyle });
            hScore.anchor.set(1, 0);
            hScore.position.set(panelX + panelW - 28, y);
            overlay.addChild(hScore);
            y += rowH;

            // Divider
            const hDiv = new PIXI.Graphics();
            hDiv.roundRect(panelX + 22, y - 2, panelW - 44, 2, 1)
                .fill({ color: THEME.secondary, alpha: 0.24 });
            overlay.addChild(hDiv);
            y += 5;

            rankings.forEach((entry, i) => {
                if (y + rowH > startY + maxHeight) return;

                const isTop = i < 3;
                const color = isTop ? THEME.gold : THEME.ink;
                const rankLabel = `${i + 1}`;

                const rowX = panelX + 18;
                const rowW = panelW - 36;
                const rowBg = new PIXI.Graphics();
                rowBg.roundRect(rowX, y - 1, rowW, rowH - 4, 8)
                    .fill({ color: isTop ? THEME.accentSoft : THEME.bgDim, alpha: isTop ? 0.68 : 0.44 });
                rowBg.roundRect(rowX, y - 1, rowW, rowH - 4, 8)
                    .stroke({ width: 1.1, color: isTop ? THEME.gold : THEME.secondary, alpha: isTop ? 0.46 : 0.2 });
                if (isTop) {
                    rowBg.roundRect(rowX + 4, y + 3, 3, rowH - 12, 2)
                        .fill({ color: THEME.gold, alpha: 0.68 });
                }
                overlay.addChild(rowBg);

                const badgeW = Math.min(28, rowH + 3);
                const badgeH = Math.max(16, rowH - 9);
                const badge = new PIXI.Graphics();
                badge.roundRect(panelX + 25, y + (rowH - badgeH) / 2 - 2, badgeW, badgeH, badgeH / 2)
                    .fill({ color: isTop ? THEME.gold : THEME.surfaceAlt, alpha: isTop ? 0.94 : 0.78 });
                badge.roundRect(panelX + 25, y + (rowH - badgeH) / 2 - 2, badgeW, badgeH, badgeH / 2)
                    .stroke({ width: 1, color: isTop ? THEME.white : THEME.secondary, alpha: isTop ? 0.32 : 0.34 });
                overlay.addChild(badge);

                const rowStyle = {
                    fontFamily: FONT_BODY,
                    fontSize: Math.max(10, Math.min(13, rowH * 0.58)),
                    fill: color,
                    fontWeight: isTop ? '700' : '500',
                };

                const rankText = new PIXI.Text({ text: rankLabel, style: rowStyle });
                rankText.anchor.set(0.5, 0.5);
                rankText.style.fill = isTop ? THEME.bgDeep : THEME.inkStrong;
                rankText.position.set(panelX + 25 + badgeW / 2, y + rowH / 2 - 2);
                overlay.addChild(rankText);

                const nameText = new PIXI.Text({ text: entry.player_name, style: rowStyle });
                const scoreText = new PIXI.Text({
                    text: entry.score.toLocaleString(),
                    style: { ...rowStyle },
                });
                scoreText.anchor.set(1, 0.5);
                scoreText.position.set(panelX + panelW - 28, y + rowH / 2 - 2);
                overlay.addChild(scoreText);

                nameText.anchor.set(0, 0.5);
                nameText.position.set(panelX + 66, y + rowH / 2 - 2);
                this._fitTextToWidth(nameText, panelW - 168, 9);
                overlay.addChild(nameText);

                y += rowH;
            });

        } catch (e) {
            if (window._sendGameError) {
                window._sendGameError(
                    'RankingError',
                    e.message || String(e),
                    e.stack || '',
                    'UIManager.js:showHallOfFame',
                    this.game.getErrorMetadata('rankings-fetch', { requestUrl })
                );
            }
            if (loadingText && !loadingText.destroyed) {
                loadingText.text = 'Error loading rankings';
                loadingText.style.fill = THEME.rose;
            }
        }
    }

    _closeHallOfFame() {
        if (this._hofOverlay) {
            this._hofOverlay.destroy({ children: true });
            this._hofOverlay = null;
        }
    }

    // ══════════════════════════════════════
    // ══  NAME INPUT POPUP (Game Over)
    // ══════════════════════════════════════

    showNameInput(score, onComplete) {
        this._destroyNameInputDom();
        if (this._nameInputOverlay) {
            this._nameInputOverlay.destroy({ children: true });
        }

        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;
        const overlay = new PIXI.Container();
        overlay.eventMode = 'static';
        overlay.hitArea = new PIXI.Rectangle(0, 0, w, h);

        // Dark glass scrim
        const bg = new PIXI.Graphics();
        bg.rect(0, 0, w, h).fill({ color: THEME.bgDeep, alpha: 0.78 });
        bg.rect(0, 0, w, h).fill({ color: THEME.shadow, alpha: 0.22 });
        overlay.addChild(bg);

        // Panel
        const panelW = Math.min(w * 0.86, 360);
        const panelH = Math.min(240, h * 0.42);
        const panelX = (w - panelW) / 2;
        const panelY = (h - panelH) / 2;

        const panel = new PIXI.Graphics();
        panel.roundRect(panelX + 4, panelY + 10, panelW, panelH, 18)
             .fill({ color: THEME.shadow, alpha: 0.42 });
        panel.roundRect(panelX - 2, panelY - 2, panelW + 4, panelH + 4, 20)
             .stroke({ width: 2, color: THEME.secondary, alpha: 0.2 });
        panel.roundRect(panelX, panelY, panelW, panelH, 18)
             .fill({ color: THEME.surface, alpha: 0.95 });
        panel.roundRect(panelX + 5, panelY + 5, panelW - 10, 46, 14)
             .fill({ color: THEME.surfaceAlt, alpha: 0.44 });
        panel.roundRect(panelX + 10, panelY + 8, panelW - 20, 4, 3)
             .fill({ color: THEME.secondary, alpha: 0.26 });
        panel.roundRect(panelX, panelY, panelW, panelH, 18)
             .stroke({ width: 1.5, color: THEME.secondary, alpha: 0.68 });
        overlay.addChild(panel);

        const centerX = w / 2;
        let yOff = panelY + 24;

        // Title
        const titleText = new PIXI.Text({
            text: getText('nameInputTitle'),
            style: {
                fontFamily: FONT_BODY,
                fontSize: Math.min(20, panelW * 0.058),
                fill: THEME.goldSoft,
                fontWeight: '900',
                letterSpacing: 0.8,
                dropShadow: { color: THEME.secondary, blur: 5, distance: 0, alpha: 0.32 },
            },
        });
        titleText.anchor.set(0.5, 0);
        titleText.position.set(centerX, yOff);
        overlay.addChild(titleText);
        yOff += titleText.height + 8;

        // Score display
        const scoreDisp = new PIXI.Text({
            text: `${getText('score')}  ${score.toLocaleString()}`,
            style: {
                fontFamily: FONT_BODY,
                fontSize: Math.min(15, panelW * 0.048),
                fill: THEME.gold,
                fontWeight: '700',
            },
        });
        scoreDisp.anchor.set(0.5, 0);
        scoreDisp.position.set(centerX, yOff);
        overlay.addChild(scoreDisp);
        yOff += scoreDisp.height + 14;

        // HTML input for name entry
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 20;
        input.placeholder = getText('enterName');
        input.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: ${Math.min(270, panelW * 0.74)}px;
            padding: 11px 16px;
            font-size: 16px;
            font-family: 'Pretendard Variable','Pretendard','Noto Sans KR','Noto Sans JP',sans-serif;
            background: rgba(8, 14, 34, 0.96);
            border: 1.5px solid #21E7FF;
            border-radius: 9px;
            color: #F7FCFF;
            text-align: center;
            outline: none;
            z-index: 10000;
            box-shadow:
                0 8px 22px rgba(0, 3, 10, 0.32),
                inset 0 1px 0 rgba(255, 255, 255, 0.08),
                0 0 14px rgba(33, 231, 255, 0.16);
            transition: border-color 0.15s, box-shadow 0.15s;
        `;
        const onFocus = () => {
            input.style.borderColor = '#FFD66D';
            input.style.boxShadow = '0 8px 22px rgba(0, 3, 10, 0.32), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 18px rgba(255, 214, 109, 0.24)';
        };
        const onBlur = () => {
            input.style.borderColor = '#21E7FF';
            input.style.boxShadow = '0 8px 22px rgba(0, 3, 10, 0.32), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 14px rgba(33, 231, 255, 0.16)';
        };
        input.addEventListener('focus', onFocus);
        input.addEventListener('blur', onBlur);

        const lastName = localStorage.getItem('blockpang_player_name') || '';
        input.value = lastName;

        document.body.appendChild(input);
        this._nameInputElement = input;
        this._nameInputFocusHandler = onFocus;
        this._nameInputBlurHandler = onBlur;
        this._nameInputFocusTimer = setTimeout(() => {
            this._nameInputFocusTimer = null;
            if (input.parentNode) input.focus();
        }, 100);

        // Buttons
        const btnW = panelW * 0.38;
        const btnH = 42;
        const gap = 12;
        const btnY = panelY + panelH - btnH - 22;

        this._makeNeonButton(overlay, {
            x: centerX - btnW - gap / 2,
            y: btnY,
            width: btnW,
            height: btnH,
            label: getText('submit'),
            variant: 'primary',
            icon: 'check',
            fontSize: 14,
            minFontSize: 10,
            onPress: () => doSubmit(),
        });

        this._makeNeonButton(overlay, {
            x: centerX + gap / 2,
            y: btnY,
            width: btnW,
            height: btnH,
            label: getText('skip'),
            variant: 'secondary',
            icon: 'skip',
            fontSize: 14,
            minFontSize: 10,
            onPress: () => doSkip(),
        });

        const cleanup = () => {
            this._destroyNameInputDom();
            if (this._nameInputOverlay) {
                this._nameInputOverlay.destroy({ children: true });
                this._nameInputOverlay = null;
            }
        };

        const doSubmit = async () => {
            const name = input.value.trim().slice(0, 20);
            if (!name) { input.focus(); return; }
            localStorage.setItem('blockpang_player_name', name);
            cleanup();
            try {
                await fetch(`${GAME_API_URL}/rankings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        game_id: GAME_ID_BLOCKPANG,
                        player_name: name,
                        score: score,
                        extra_data: {
                            level: this.game.scoreManager.level,
                            lines: this.game.scoreManager.linesCleared,
                        },
                    }),
                });
            } catch (e) { /* silent */ }
            if (onComplete) onComplete();
        };

        const doSkip = () => {
            cleanup();
            if (onComplete) onComplete();
        };

        const onKeydown = (e) => {
            if (e.key === 'Enter') doSubmit();
            if (e.key === 'Escape') doSkip();
        };
        this._nameInputKeydownHandler = onKeydown;
        input.addEventListener('keydown', onKeydown);

        this._nameInputOverlay = overlay;
        this.game.app.stage.addChild(overlay);
    }
}
