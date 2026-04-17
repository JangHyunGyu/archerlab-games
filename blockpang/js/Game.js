class Game {
    constructor(app) {
        this.app = app;
        this.cellSize = 0;
        this.isGameOver = false;
        this.isAnimating = false;
        this.state = 'title'; // 'title' | 'playing' | 'gameover'
        this._pendingTimeouts = [];
        this._placementAnimationToken = 0;
        this._placementSafetyTimeoutId = null;

        // ── Containers (render order) ──
        this.zoomContainer = new PIXI.Container();
        app.stage.addChild(this.zoomContainer);

        this.gameContainer = new PIXI.Container();
        this.zoomContainer.addChild(this.gameContainer);

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
        this._shootingStarPool = [];
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

    destroy() {
        this._clearPendingTimeouts();
        this.app.ticker.remove(this._updateBackground, this);
        this.effects.destroy();
        this.ui.destroy();
        this.tray.destroy();
        this.board.destroy();
        this.sound.destroy();
    }

    // ── Start game from title screen ──
    startGame(resume = false) {
        this._clearPendingTimeouts();
        this.state = 'playing';
        const alLink = document.getElementById('archerlab-link');
        if (alLink) alLink.style.display = 'none';
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

            if (resume) {
                this.resumeGame();
            } else {
                this._clearSave();
                this.newGame();
            }
        });
    }

    // ── Return to title screen ──
    goToTitle() {
        this._clearPendingTimeouts();
        this.effects.trimPool();
        this.ui.hideGameOver();
        this.state = 'title';
        const alLink = document.getElementById('archerlab-link');
        if (alLink) alLink.style.display = '';
        this.board.container.visible = false;
        this.tray.container.visible = false;
        this.ui.hideGameHUD();
        this.ui.showTitleScreen();
    }

    _scheduleTimeout(fn, delay) {
        let id = null;
        id = setTimeout(() => {
            this._pendingTimeouts = this._pendingTimeouts.filter(timeoutId => timeoutId !== id);
            fn();
        }, delay);
        this._pendingTimeouts.push(id);
        return id;
    }

    _cancelTimeout(id) {
        if (id == null) return;
        clearTimeout(id);
        this._pendingTimeouts = this._pendingTimeouts.filter(timeoutId => timeoutId !== id);
    }

    _clearPendingTimeouts() {
        this._pendingTimeouts.forEach(id => clearTimeout(id));
        this._pendingTimeouts = [];
        this._placementSafetyTimeoutId = null;
    }

    _getBoardFilledCellCount() {
        if (!this.board || !Array.isArray(this.board.grid)) return null;
        let count = 0;
        for (let r = 0; r < this.board.grid.length; r++) {
            const row = this.board.grid[r];
            if (!Array.isArray(row)) continue;
            for (let c = 0; c < row.length; c++) {
                if (row[c] !== -1) count++;
            }
        }
        return count;
    }

    getErrorMetadata(scope, extra = {}) {
        const trayFilledSlots = this.tray && Array.isArray(this.tray.slots)
            ? this.tray.slots.filter(Boolean).length
            : null;

        return {
            scope,
            state: this.state,
            isAnimating: this.isAnimating,
            isGameOver: this.isGameOver,
            placementToken: this._placementAnimationToken,
            pendingTimeouts: this._pendingTimeouts.length,
            filledCells: this._getBoardFilledCellCount(),
            trayFilledSlots,
            score: this.scoreManager ? this.scoreManager.score : null,
            level: this.scoreManager ? this.scoreManager.level : null,
            combo: this.scoreManager ? this.scoreManager.combo : null,
            screen: this.app && this.app.screen
                ? { width: this.app.screen.width, height: this.app.screen.height }
                : null,
            extra,
        };
    }

    _isCurrentPlacementAnimation(token) {
        return this.isAnimating && token === this._placementAnimationToken;
    }

    _finishPlacementAnimation(token) {
        if (token !== this._placementAnimationToken) return false;
        this._cancelTimeout(this._placementSafetyTimeoutId);
        this._placementSafetyTimeoutId = null;
        this.isAnimating = false;
        return true;
    }

    _armPlacementSafetyTimeout(token, delay = 3000) {
        this._cancelTimeout(this._placementSafetyTimeoutId);
        this._placementSafetyTimeoutId = this._scheduleTimeout(() => {
            if (!this._isCurrentPlacementAnimation(token) || this.state !== 'playing') return;

            if (document.hidden) {
                this._armPlacementSafetyTimeout(token, 1000);
                return;
            }

            if (window._sendGameError) {
                window._sendGameError(
                    'GameStuck',
                    'isAnimating stuck — auto-recovering',
                    '',
                    'Game.js:placePiece',
                    this.getErrorMetadata('placement-safety-timeout', {
                        token,
                        delayMs: delay,
                        documentHidden: !!document.hidden,
                        trayAllPlaced: this.tray.allPlaced(),
                    })
                );
            }

            if (this.tray.allPlaced()) {
                this.generatePieces();
            } else {
                this._checkGameOver();
            }

            this._finishPlacementAnimation(token);
        }, delay);
    }

    _beginPlacementAnimation() {
        const token = ++this._placementAnimationToken;
        this.isAnimating = true;
        this._armPlacementSafetyTimeout(token);
        return token;
    }

    _createBackground() {
        // Destroy old background objects to free GPU memory
        const oldChildren = this.bgContainer.removeChildren();
        oldChildren.forEach(c => c.destroy({ children: true }));
        this._stars = [];
        this._nebulae = [];
        this._shootingStars = [];
        if (this._shootingStarPool) {
            this._shootingStarPool.forEach(g => { if (!g.destroyed) g.destroy(); });
            this._shootingStarPool = [];
        }

        const w = this.app.screen.width;
        const h = this.app.screen.height;

        // Warm cream base (drawn first, behind everything)
        const baseBg = new PIXI.Graphics();
        baseBg.rect(0, 0, w, h).fill({ color: THEME.bg });
        // Soft vignette — slightly deeper toward bottom
        baseBg.rect(0, h * 0.55, w, h * 0.45).fill({ color: THEME.bgDeep, alpha: 0.55 });
        baseBg.rect(0, h * 0.75, w, h * 0.25).fill({ color: THEME.bgDim, alpha: 0.35 });
        this.bgContainer.addChild(baseBg);
        this.bgBase = baseBg;

        // Two drifting soft "paper" blobs for organic warmth (drawn on top of base)
        const blobColors = [0xE8D5A8, 0xF2CBB0];
        for (let i = 0; i < 2; i++) {
            const g = new PIXI.Graphics();
            const r = Math.min(w, h) * (0.5 + i * 0.2);
            for (let j = 6; j >= 0; j--) {
                g.circle(0, 0, r + j * 18)
                 .fill({ color: blobColors[i], alpha: 0.022 });
            }
            const bx = i === 0 ? w * 0.18 : w * 0.82;
            const by = i === 0 ? h * 0.22 : h * 0.78;
            g.position.set(bx, by);
            this.bgContainer.addChild(g);
            this._nebulae.push({
                gfx: g, baseX: bx, baseY: by,
                speed: 0.00012 + Math.random() * 0.00008,
                range: 14 + Math.random() * 10,
                phase: Math.random() * Math.PI * 2,
                rotSpeed: 0,
                pulseSpeed: 0.0004,
                pulsePhase: Math.random() * Math.PI * 2,
            });
        }

        // (Starfield and shooting stars removed — casual puzzle aesthetic)
        this._starContainer = new PIXI.Container();
        this._shootingStarContainer = new PIXI.Container();
    }


    _updateBackground(ticker) {
        const delta = ticker.deltaTime;
        const dt = delta * (1000 / 60);
        this._bgTime += dt;

        // Gentle blob drift for subtle life (no starfield / shooting stars)
        this._nebulae.forEach(neb => {
            const t = this._bgTime * neb.speed + neb.phase;
            neb.gfx.x = neb.baseX + Math.sin(t) * neb.range;
            neb.gfx.y = neb.baseY + Math.cos(t * 0.7) * neb.range * 0.5;
            const pulse = 1 + Math.sin(this._bgTime * neb.pulseSpeed + neb.pulsePhase) * 0.04;
            neb.gfx.scale.set(pulse);
        });
    }

    resize() {
        if (this.input && this.input.dragging) return;
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

        // Only recreate background if dimensions changed significantly (>5px)
        if (!this._lastBgW || !this._lastBgH ||
            Math.abs(w - this._lastBgW) > 5 || Math.abs(h - this._lastBgH) > 5) {
            this._lastBgW = w;
            this._lastBgH = h;
            this._createBackground();
        }

        // Resize title screen if visible
        if (this.state === 'title' && this.ui.titleContainer) {
            this.ui.showTitleScreen();
        }
    }

    newGame() {
        this._clearPendingTimeouts();
        this.effects.trimPool();
        this.state = 'playing';
        this.isGameOver = false;
        this.isAnimating = false;
        this.scoreManager.reset();
        this.board.clearAll();
        this.ui.updateScore(0, this.scoreManager.bestScore);
        this.ui.updateLevel(1, 0);
        this.sound.startAmbient();
        this.generatePieces();
    }

    restart() {
        this.ui.hideGameOver();
        this.newGame();
    }

    generatePieces() {
        const lv = this.scoreManager.level;
        const pieces = [
            generateRandomPiece(lv),
            generateRandomPiece(lv),
            generateRandomPiece(lv),
        ];
        this.tray.setPieces(pieces);
        this._checkGameOver();
    }

    placePiece(slotIndex, gridX, gridY) {
        const piece = this.tray.slots[slotIndex];
        if (!piece) return;

        const animationToken = this._beginPlacementAnimation();

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

        this._scheduleTimeout(() => {
            if (!this._isCurrentPlacementAnimation(animationToken)) return;

            this._handleLineClear(() => {
                if (!this._isCurrentPlacementAnimation(animationToken)) return;

                this.ui.updateScore(this.scoreManager.score, this.scoreManager.bestScore);
                this.ui.updateLevel(this.scoreManager.level, this.scoreManager.levelProgress);

                if (this.tray.allPlaced()) {
                    this.generatePieces();
                } else {
                    this._checkGameOver();
                }

                this._finishPlacementAnimation(animationToken);
                this._autoSave();
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

        if (combo > 1 && clearResult.lines >= 2) {
            // 콤보 + 멀티라인 동시: 유리 깨지는 소리 먼저 → 콤보 사운드
            this.sound.playClear(clearResult.lines);
            this._scheduleTimeout(() => this.sound.playCombo(combo), 150);
        } else if (combo > 1) {
            this.sound.playCombo(combo);
        } else {
            this.sound.playClear(clearResult.lines);
        }

        // 모바일/태블릿 진동 피드백 (콤보 + 라인수 조합)
        if (navigator.vibrate) {
            const lines = clearResult.lines;
            if (combo >= 6) {
                // 콤보 Tier 3: 강렬한 롱 진동 + 스타카토 연타
                navigator.vibrate([200, 30, 60, 20, 60, 20, 60, 20, 150, 40, 40, 15, 40, 15, 40]);
            } else if (combo >= 4) {
                // 콤보 Tier 2: 강한 진동 + 빠른 연타
                navigator.vibrate([150, 30, 50, 20, 50, 20, 50, 30, 120]);
            } else if (combo >= 2) {
                // 콤보 Tier 1: 중간 연타
                navigator.vibrate([80, 25, 40, 20, 40, 25, 80]);
            } else if (lines >= 4) {
                // 4줄+: 강렬한 더블 임팩트
                navigator.vibrate([150, 25, 60, 20, 60, 20, 120, 30, 50, 15, 50]);
            } else if (lines === 3) {
                // 3줄: 강한 임팩트 + 연타
                navigator.vibrate([120, 25, 50, 20, 50, 25, 80]);
            } else if (lines === 2) {
                // 2줄: 중간 임팩트
                navigator.vibrate([80, 25, 40, 20, 60]);
            } else {
                // 1줄: 가벼운 탭
                navigator.vibrate([40, 20, 25]);
            }
        }

        if (clearResult.rows || clearResult.cols) {
            const boardPos = this.board.getGlobalPosition();
            this.effects.playLineSweep(clearResult.rows || [], clearResult.cols || [], boardPos);
        }

        this.effects.playFlashEffect(clearResult.sprites, () => {
            try {
                clearResult.apply();

                const boardPos = this.board.getGlobalPosition();
                this.effects.playClearEffect(clearResult.cells, boardPos);

                // Calculate center of cleared cells
                let avgX = 0, avgY = 0;
                if (clearResult.cells.length > 0) {
                    clearResult.cells.forEach(c => { avgX += c.col; avgY += c.row; });
                    avgX = boardPos.x + (avgX / clearResult.cells.length) * this.cellSize + this.cellSize / 2;
                    avgY = boardPos.y + (avgY / clearResult.cells.length) * this.cellSize + this.cellSize / 2;
                }

                // ── Clamp popup positions inside screen ──
                const screenW = this.app.screen.width;
                const screenH = this.app.screen.height;
                const clampX = (v) => Math.max(60, Math.min(screenW - 60, v));
                const clampY = (v) => Math.max(40, Math.min(screenH - 40, v));

                // ── Effect + Popup System ──
                const fxX = clampX(avgX);
                const fxY = clampY(avgY);
                const midCell = clearResult.cells[Math.floor(clearResult.cells.length / 2)];
                const popupX = clampX(boardPos.x + midCell.col * this.cellSize + this.cellSize / 2);
                const popupY = clampY(boardPos.y + midCell.row * this.cellSize);

                if (combo > 1 && clearResult.lines >= 2) {
                    // ── 콤보 + 멀티라인 동시: 시차(stagger) 연출 ──
                    this.effects.playSingleClearEffect(clearResult.lines, fxX, fxY, clearResult.cells);
                    const mlY = clampY(popupY - this.cellSize * 2.5);
                    this.effects.showMultiLinePopup(popupX, mlY, clearResult.lines);

                    this._scheduleTimeout(() => {
                        this.effects.playComboEffect(combo, fxX, fxY, clearResult.lines);
                    }, 180);

                    this._scheduleTimeout(() => {
                        this.effects.showScorePopup(popupX, popupY, `+${pts}`);
                    }, 100);

                } else if (combo > 1) {
                    this.effects.playComboEffect(combo, fxX, fxY, clearResult.lines);
                    this.effects.showScorePopup(popupX, popupY, `+${pts}`);

                } else {
                    if (clearResult.cells.length > 0) {
                        this.effects.playSingleClearEffect(clearResult.lines, fxX, fxY, clearResult.cells);
                    }
                    this.effects.showScorePopup(popupX, popupY, `+${pts}`);

                    if (clearResult.lines >= 2) {
                        const mlY = clampY(popupY - this.cellSize * 2);
                        this.effects.showMultiLinePopup(popupX, mlY, clearResult.lines);
                    }
                }

                if (result.leveledUp) {
                    this.sound.playLevelUp();
                    this.effects.showLevelUp(result.level);
                }

                if (this.board.isEmpty()) {
                    const pcBonus = this.scoreManager.addPerfectClearBonus();
                    this.sound.playPerfectClear();
                    this.effects.showPerfectClear();
                    this._scheduleTimeout(() => {
                        this.effects.showBonusPopup(
                            this.app.screen.width / 2,
                            boardPos.y + (GRID_SIZE * this.cellSize) / 2 + 40,
                            `PERFECT +${pcBonus}`,
                            0xFF4081
                        );
                    }, 500);
                }
            } catch (e) {
                if (window._sendGameError) {
                    window._sendGameError(
                        'LineClearError',
                        e.message || String(e),
                        e.stack || '',
                        'Game.js:_handleLineClear',
                        this.getErrorMetadata('line-clear', {
                            lines: clearResult.lines,
                            clearedCells: clearResult.cells.length,
                            rows: clearResult.rows || [],
                            cols: clearResult.cols || [],
                        })
                    );
                }
            }

            onComplete();
        });
    }

    // ── Auto-Save / Resume ──

    _autoSave() {
        try {
            const data = {
                grid: this.board.grid.map(row => [...row]),
                slots: this.tray.slots.map(s => s ? {
                    shape: s.shape,
                    colorIndex: s.colorIndex,
                    rows: s.rows,
                    cols: s.cols,
                    cellCount: s.cellCount,
                } : null),
                score: this.scoreManager.score,
                combo: this.scoreManager.combo,
                level: this.scoreManager.level,
                linesCleared: this.scoreManager.linesCleared,
                totalLinesForLevel: this.scoreManager.totalLinesForLevel,
                ts: Date.now(),
            };
            localStorage.setItem('blockpang_save', JSON.stringify(data));
        } catch (_) {}
    }

    _clearSave() {
        localStorage.removeItem('blockpang_save');
    }

    static hasSavedGame() {
        try {
            const raw = localStorage.getItem('blockpang_save');
            if (!raw) return false;
            JSON.parse(raw);
            return true;
        } catch (_) { return false; }
    }

    static getSavedScore() {
        try {
            const data = JSON.parse(localStorage.getItem('blockpang_save'));
            return data?.score || 0;
        } catch (_) { return 0; }
    }

    resumeGame() {
        let raw = null;
        try {
            raw = localStorage.getItem('blockpang_save');
            if (!raw) { this.newGame(); return; }
            const data = JSON.parse(raw);

            this._clearPendingTimeouts();
            this.effects.trimPool();
            this.state = 'playing';
            this.isGameOver = false;
            this.isAnimating = false;

            // Restore board
            this.board.clearAll();
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    const colorIdx = data.grid[r][c];
                    this.board.grid[r][c] = colorIdx;
                    if (colorIdx >= 0) {
                        const sprite = this.board.cellSprites[r][c];
                        sprite.texture = this.board.cellTextures[colorIdx];
                        sprite.visible = true;
                        sprite.alpha = 1;
                    }
                }
            }

            // Restore score
            this.scoreManager.score = data.score;
            this.scoreManager.combo = data.combo;
            this.scoreManager.level = data.level;
            this.scoreManager.linesCleared = data.linesCleared;
            this.scoreManager.totalLinesForLevel = data.totalLinesForLevel;

            this.ui.updateScore(data.score, this.scoreManager.bestScore);
            this.ui.updateLevel(data.level, this.scoreManager.levelProgress);

            // Restore tray pieces
            this.tray.setPieces(data.slots.map(s => s || null));

            this.sound.startAmbient();
            this._checkGameOver();
        } catch (e) {
            if (window._sendGameError) {
                window._sendGameError(
                    'ResumeError',
                    e.message || String(e),
                    e.stack || '',
                    'Game.js:resumeGame',
                    this.getErrorMetadata('resume-game', {
                        hasSavedData: !!raw,
                        savedDataLength: raw ? raw.length : 0,
                    })
                );
            }
            this._clearSave();
            this.newGame();
        }
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
        this._clearSave();
        this.sound.stopAmbient();
        this.sound.playGameOver();

        const isNewBest = this.scoreManager.score >= this.scoreManager.bestScore;
        const finalScore = this.scoreManager.score;
        const bestScore = this.scoreManager.bestScore;

        this._scheduleTimeout(() => {
            // Show name input first, then game over screen
            this.ui.showNameInput(finalScore, () => {
                this.ui.showGameOver(finalScore, bestScore, isNewBest);
            });
        }, 600);
    }
}
