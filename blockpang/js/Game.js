class Game {
    constructor(app) {
        this.app = app;
        this.cellSize = 0;
        this.isGameOver = false;
        this.isAnimating = false;
        this.state = 'title'; // 'title' | 'playing' | 'gameover'

        // ── Containers (render order) ──
        this.gameContainer = new PIXI.Container();
        app.stage.addChild(this.gameContainer);

        this.bgContainer = new PIXI.Container();
        this.gameContainer.addChild(this.bgContainer);

        // ── Managers ──
        this.sound = new SoundManager();
        this.scoreManager = new ScoreManager();

        this.board = new Board(this);
        this.gameContainer.addChild(this.board.container);

        this.tray = new PieceTray(this);
        this.gameContainer.addChild(this.tray.container);

        this.effects = new EffectManager(this);
        this.gameContainer.addChild(this.effects.container);

        this.ui = new UIManager(this);
        this.gameContainer.addChild(this.ui.container);

        this.input = new InputManager(this);

        // Hide game elements until start
        this.board.container.visible = false;
        this.tray.container.visible = false;

        // ── Background ──
        this._stars = [];
        this._nebulae = [];
        this._shootingStars = [];
        this._bgTime = 0;
        this._shootingStarTimer = 0;
        this._createBackground();

        // ── Background animation ticker ──
        app.ticker.add(this._updateBackground, this);

        // ── Initial layout ──
        this.resize();

        // ── Show title screen instead of starting immediately ──
        this.ui.hideGameHUD();
        this.ui.showTitleScreen();
    }

    // ── Start game from title screen ──
    startGame() {
        this.state = 'playing';
        this.ui.hideTitleScreen(() => {
            this.ui.showGameHUD();
            this.board.container.visible = true;
            this.board.container.alpha = 0;
            this.board.container.scale.set(0.85);
            this.tray.container.visible = true;
            this.tray.container.alpha = 0;

            // Board entrance animation
            const boardRef = this.board.container;
            const trayRef = this.tray.container;
            this.effects.tweens.push({
                elapsed: 0,
                duration: 450,
                update(dt) {
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    boardRef.alpha = easeOutCubic(t);
                    boardRef.scale.set(0.85 + easeOutBack(t) * 0.15);
                    trayRef.alpha = easeOutCubic(t);
                    if (t >= 1) {
                        boardRef.scale.set(1);
                        return true;
                    }
                    return false;
                }
            });

            this.newGame();
        });
    }

    // ── Return to title screen ──
    goToTitle() {
        this.ui.hideGameOver();
        this.state = 'title';
        this.board.container.visible = false;
        this.tray.container.visible = false;
        this.ui.hideGameHUD();
        this.ui.showTitleScreen();
    }

    _createBackground() {
        // Destroy old background objects to free GPU memory
        const oldChildren = this.bgContainer.removeChildren();
        oldChildren.forEach(c => c.destroy({ children: true }));
        this._stars = [];
        this._nebulae = [];
        this._shootingStars = [];

        const w = this.app.screen.width;
        const h = this.app.screen.height;

        // Base dark gradient
        const baseBg = new PIXI.Graphics();
        baseBg.beginFill(0x020215);
        baseBg.drawRect(0, 0, w, h);
        baseBg.endFill();

        // Multi-layer gradient for depth
        const gradients = [
            { color: 0x0a0a3a, alpha: 0.35, y: 0, h: h * 0.35 },
            { color: 0x120a35, alpha: 0.2, y: h * 0.15, h: h * 0.35 },
            { color: 0x1a0830, alpha: 0.15, y: h * 0.45, h: h * 0.35 },
            { color: 0x0a1535, alpha: 0.12, y: h * 0.65, h: h * 0.35 },
        ];
        gradients.forEach(({ color, alpha, y: gy, h: gh }) => {
            baseBg.beginFill(color, alpha);
            baseBg.drawRect(0, gy, w, gh);
            baseBg.endFill();
        });

        this.bgContainer.addChild(baseBg);
        this.bgBase = baseBg;

        // Nebula blobs
        const nebulaColors = [
            { base: 0x2a0a5a, shift: 0x1a1a6a },
            { base: 0x0a1a4a, shift: 0x0a2a5a },
            { base: 0x3a0a3a, shift: 0x4a0a2a },
            { base: 0x0a3a3a, shift: 0x0a2a4a },
            { base: 0x1a0a5a, shift: 0x2a1a4a },
        ];
        for (let i = 0; i < 5; i++) {
            const g = new PIXI.Graphics();
            const nx = Math.random() * w;
            const ny = Math.random() * h;
            const nr = 100 + Math.random() * 180;
            const nc = nebulaColors[i % nebulaColors.length];

            for (let j = 5; j >= 0; j--) {
                g.beginFill(nc.base, 0.015 + j * 0.008);
                g.drawEllipse(0, 0, nr + j * 25, (nr + j * 25) * (0.6 + Math.random() * 0.4));
                g.endFill();
            }

            g.position.set(nx, ny);
            g.rotation = Math.random() * Math.PI;
            this.bgContainer.addChild(g);
            this._nebulae.push({
                gfx: g,
                baseX: nx,
                baseY: ny,
                speed: 0.00015 + Math.random() * 0.00025,
                range: 25 + Math.random() * 40,
                phase: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.00003,
                pulseSpeed: 0.0005 + Math.random() * 0.0005,
                pulsePhase: Math.random() * Math.PI * 2,
            });
        }

        // Stars
        const starContainer = new PIXI.Container();
        const starColors = [0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xCCDDFF, 0xFFDDCC, 0xDDCCFF];
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const size = 0.3 + Math.random() * 2.2;
            const alpha = 0.1 + Math.random() * 0.6;
            const starColor = starColors[Math.floor(Math.random() * starColors.length)];

            const g = new PIXI.Graphics();

            if (size > 1.2) {
                g.beginFill(starColor, alpha * 0.08);
                g.drawCircle(0, 0, size * 5);
                g.endFill();
                g.beginFill(starColor, alpha * 0.15);
                g.drawCircle(0, 0, size * 3);
                g.endFill();
            }

            if (size > 1.5) {
                g.beginFill(starColor, alpha * 0.3);
                g.drawRect(-size * 2, -0.5, size * 4, 1);
                g.drawRect(-0.5, -size * 2, 1, size * 4);
                g.endFill();
            }

            g.beginFill(starColor, alpha);
            g.drawCircle(0, 0, size);
            g.endFill();

            if (size > 0.8) {
                g.beginFill(0xFFFFFF, Math.min(1, alpha * 1.5));
                g.drawCircle(0, 0, size * 0.4);
                g.endFill();
            }

            g.position.set(x, y);
            starContainer.addChild(g);

            this._stars.push({
                gfx: g,
                baseAlpha: alpha,
                twinkleSpeed: 0.0008 + Math.random() * 0.004,
                twinklePhase: Math.random() * Math.PI * 2,
                size,
            });
        }
        this.bgContainer.addChild(starContainer);
        this._starContainer = starContainer;

        this._shootingStarContainer = new PIXI.Container();
        this.bgContainer.addChild(this._shootingStarContainer);
    }

    _spawnShootingStar() {
        const w = this.app.screen.width;
        const h = this.app.screen.height;

        const startX = Math.random() * w * 0.8;
        const startY = Math.random() * h * 0.5;
        const angle = 0.3 + Math.random() * 0.5;
        const length = 60 + Math.random() * 100;
        const speed = 4 + Math.random() * 6;

        const g = new PIXI.Graphics();

        const trailLen = length;
        for (let i = 0; i < 8; i++) {
            const t = i / 8;
            g.beginFill(0xFFFFFF, 0.5 * (1 - t));
            g.drawCircle(-Math.cos(angle) * trailLen * t, -Math.sin(angle) * trailLen * t, 1.5 * (1 - t * 0.8));
            g.endFill();
        }

        g.beginFill(0xFFFFFF, 0.9);
        g.drawCircle(0, 0, 2);
        g.endFill();
        g.beginFill(0xCCDDFF, 0.4);
        g.drawCircle(0, 0, 4);
        g.endFill();

        g.position.set(startX, startY);
        this._shootingStarContainer.addChild(g);

        this._shootingStars.push({
            gfx: g,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 800 + Math.random() * 400,
            maxLife: 1200,
        });
    }

    _updateBackground(delta) {
        const dt = delta * (1000 / 60);
        this._bgTime += dt;

        this._stars.forEach(star => {
            const t = this._bgTime * star.twinkleSpeed + star.twinklePhase;
            const flicker = 0.55 + Math.sin(t) * 0.25 + Math.sin(t * 2.7) * 0.12 + Math.sin(t * 5.1) * 0.05;
            star.gfx.alpha = star.baseAlpha * Math.max(0.1, flicker);
        });

        this._nebulae.forEach(neb => {
            const t = this._bgTime * neb.speed + neb.phase;
            neb.gfx.x = neb.baseX + Math.sin(t) * neb.range;
            neb.gfx.y = neb.baseY + Math.cos(t * 0.7) * neb.range * 0.6;
            neb.gfx.rotation += neb.rotSpeed * delta;

            const pulse = 1 + Math.sin(this._bgTime * neb.pulseSpeed + neb.pulsePhase) * 0.08;
            neb.gfx.scale.set(pulse);
        });

        this._shootingStarTimer += dt;
        if (this._shootingStarTimer > 3000 + Math.random() * 5000) {
            this._shootingStarTimer = 0;
            this._spawnShootingStar();
        }

        for (let i = this._shootingStars.length - 1; i >= 0; i--) {
            const ss = this._shootingStars[i];
            ss.life -= dt;
            if (ss.life <= 0) {
                ss.gfx.destroy();
                this._shootingStars.splice(i, 1);
                continue;
            }
            const t = 1 - ss.life / ss.maxLife;
            ss.gfx.x += ss.vx * delta;
            ss.gfx.y += ss.vy * delta;
            ss.gfx.alpha = t < 0.1 ? t * 10 : (t > 0.7 ? (1 - t) / 0.3 : 1);
        }
    }

    resize() {
        const w = this.app.screen.width;
        const h = this.app.screen.height;
        const padding = Math.max(8, Math.min(w, h) * 0.025);

        const scoreAreaH = Math.max(65, h * 0.11);
        const availW = w - padding * 2;
        const availH = h - scoreAreaH - padding * 2;
        const gridMaxH = availH * 0.62;
        const gridSize = Math.min(availW, gridMaxH);
        this.cellSize = Math.floor(gridSize / GRID_SIZE);
        const actualGrid = this.cellSize * GRID_SIZE;

        const boardX = Math.floor((w - actualGrid) / 2);
        const boardY = Math.floor(scoreAreaH + padding);
        const trayY = boardY + actualGrid + padding;
        const trayH = h - trayY - padding;

        this.board.resize(this.cellSize, boardX, boardY);
        this.tray.resize(this.cellSize, w, trayH, 0, trayY);
        this.ui.resize(w, scoreAreaH, padding);
        this.input.updateHitArea();
        this._createBackground();

        // Resize title screen if visible
        if (this.state === 'title' && this.ui.titleContainer) {
            this.ui.showTitleScreen();
        }
    }

    newGame() {
        this.state = 'playing';
        this.isGameOver = false;
        this.isAnimating = false;
        this.scoreManager.reset();
        this.board.clearAll();
        this.ui.updateScore(0, this.scoreManager.bestScore);
        this.ui.updateLevel(1, 0);
        this.generatePieces();
    }

    restart() {
        this.ui.hideGameOver();
        this.newGame();
    }

    generatePieces() {
        const pieces = [
            generateRandomPiece(),
            generateRandomPiece(),
            generateRandomPiece(),
        ];
        this.tray.setPieces(pieces);
        this._checkGameOver();
    }

    placePiece(slotIndex, gridX, gridY) {
        const piece = this.tray.slots[slotIndex];
        if (!piece) return;

        this.isAnimating = true;

        const result = this.board.place(piece.shape, gridX, gridY, piece.colorIndex);
        this.tray.removePiece(slotIndex);

        this.scoreManager.addPlacementScore(piece.cellCount);
        this.sound.playPlace();
        this.effects.playPlaceEffect(result.sprites);

        // Ring burst at placement center
        const boardPos = this.board.getGlobalPosition();
        const cx = boardPos.x + (gridX + piece.cols / 2) * this.cellSize;
        const cy = boardPos.y + (gridY + piece.rows / 2) * this.cellSize;
        this.effects.playRingBurst(cx, cy, BLOCK_COLORS[piece.colorIndex].glow);

        setTimeout(() => {
            this._handleLineClear(() => {
                this.ui.updateScore(this.scoreManager.score, this.scoreManager.bestScore);
                this.ui.updateLevel(this.scoreManager.level, this.scoreManager.levelProgress);

                if (this.tray.allPlaced()) {
                    this.generatePieces();
                } else {
                    this._checkGameOver();
                }
                this.isAnimating = false;
            });
        }, 120);
    }

    _handleLineClear(onComplete) {
        const clearResult = this.board.checkAndClearLines();

        if (clearResult.lines === 0) {
            this.scoreManager.addClearScore(0);
            onComplete();
            return;
        }

        const result = this.scoreManager.addClearScore(clearResult.lines);
        const pts = result.points;
        const combo = this.scoreManager.combo;

        if (combo > 1) {
            this.sound.playCombo(combo);
        } else {
            this.sound.playClear(clearResult.lines);
        }

        const shakeIntensity = Math.min(3 + clearResult.lines * 2 + combo * 2, 15);
        this.effects.screenShake(shakeIntensity, 200 + clearResult.lines * 50);

        // 모바일/태블릿 진동 피드백
        if (navigator.vibrate) {
            if (combo > 1) {
                // 콤보: 짧은 진동 반복 패턴
                const pattern = [];
                for (let i = 0; i < Math.min(combo, 5); i++) {
                    pattern.push(40 + clearResult.lines * 10, 30);
                }
                pattern.pop(); // 마지막 pause 제거
                navigator.vibrate(pattern);
            } else {
                navigator.vibrate(30 + clearResult.lines * 20);
            }
        }

        if (clearResult.rows || clearResult.cols) {
            const boardPos = this.board.getGlobalPosition();
            this.effects.playLineSweep(clearResult.rows || [], clearResult.cols || [], boardPos);
        }

        this.effects.playFlashEffect(clearResult.sprites, () => {
            clearResult.apply();

            const boardPos = this.board.getGlobalPosition();
            this.effects.playClearEffect(clearResult.cells, boardPos);

            // Shockwave at center of cleared cells
            if (clearResult.cells.length > 0) {
                let avgX = 0, avgY = 0;
                clearResult.cells.forEach(c => { avgX += c.col; avgY += c.row; });
                avgX = boardPos.x + (avgX / clearResult.cells.length) * this.cellSize + this.cellSize / 2;
                avgY = boardPos.y + (avgY / clearResult.cells.length) * this.cellSize + this.cellSize / 2;
                this.effects.playShockwave(avgX, avgY, clearResult.lines);
            }

            const midCell = clearResult.cells[Math.floor(clearResult.cells.length / 2)];
            const popupX = boardPos.x + midCell.col * this.cellSize + this.cellSize / 2;
            const popupY = boardPos.y + midCell.row * this.cellSize;
            this.effects.showScorePopup(popupX, popupY, `+${pts}`);

            if (combo > 1) {
                this.effects.showComboPopup(
                    this.app.screen.width / 2,
                    boardPos.y + (GRID_SIZE * this.cellSize) / 2,
                    combo
                );
            }

            if (result.leveledUp) {
                this.sound.playLevelUp();
                this.effects.showLevelUp(result.level);
            }

            if (this.board.isEmpty()) {
                const pcBonus = this.scoreManager.addPerfectClearBonus();
                this.sound.playPerfectClear();
                this.effects.showPerfectClear();
                setTimeout(() => {
                    this.effects.showBonusPopup(
                        this.app.screen.width / 2,
                        boardPos.y + (GRID_SIZE * this.cellSize) / 2 + 40,
                        `PERFECT +${pcBonus}`,
                        0xFF4081
                    );
                }, 500);
            }

            onComplete();
        });
    }

    _checkGameOver() {
        const pieces = this.tray.slots;
        for (let i = 0; i < 3; i++) {
            if (!pieces[i]) continue;
            if (this.board.canPlaceAnywhere(pieces[i].shape)) return;
        }

        this.state = 'gameover';
        this.isGameOver = true;
        this.scoreManager.finalize();
        this.sound.playGameOver();

        const isNewBest = this.scoreManager.score >= this.scoreManager.bestScore;

        setTimeout(() => {
            this.ui.showGameOver(
                this.scoreManager.score,
                this.scoreManager.bestScore,
                isNewBest
            );
        }, 600);
    }
}
