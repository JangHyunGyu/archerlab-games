class InputManager {
    constructor(game) {
        this.game = game;
        this.dragging = false;
        this.dragPieceIndex = -1;
        this.dragContainer = null;
        this.dragPieceData = null;
        this.dragReturning = false;
        this.dragLayer = new PIXI.Container();
        this.dragGlow = null;
        this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        this.dragOffsetY = this.isMobile ? -70 : -35;
        this._trailTimer = 0;
        this._lastDragX = 0;
        this._lastDragY = 0;
        this._lastGridCol = -1;
        this._lastGridRow = -1;
        this._dragLastSeenAt = 0;
        this._onPointerMove = this.onPointerMove.bind(this);
        this._onPointerUp = this.onPointerUp.bind(this);
        this._onPointerCancel = this.onPointerCancel.bind(this);
        this._onWindowPointerUp = this._handleWindowPointerUp.bind(this);
        this._onWindowPointerCancel = this._handleWindowPointerCancel.bind(this);
        this._onWindowMouseUp = this._handleWindowPointerUp.bind(this);
        this._onWindowTouchEnd = this._handleWindowTouchEnd.bind(this);
        this._onWindowBlur = this._handleWindowBlur.bind(this);
        this._onVisibilityChange = this._handleVisibilityChange.bind(this);

        game.app.stage.addChild(this.dragLayer);
        game.app.ticker.add(this._updateDragWatchdog, this);

        // Global pointer events
        game.app.stage.eventMode = 'static';
        game.app.stage.hitArea = game.app.screen;
        game.app.stage.on('pointermove', this._onPointerMove);
        game.app.stage.on('pointerup', this._onPointerUp);
        game.app.stage.on('pointerupoutside', this._onPointerUp);
        game.app.stage.on('pointercancel', this._onPointerCancel);

        window.addEventListener('pointerup', this._onWindowPointerUp, { passive: true });
        window.addEventListener('pointercancel', this._onWindowPointerCancel, { passive: true });
        window.addEventListener('mouseup', this._onWindowMouseUp, { passive: true });
        window.addEventListener('touchend', this._onWindowTouchEnd, { passive: true });
        window.addEventListener('touchcancel', this._onWindowTouchEnd, { passive: true });
        window.addEventListener('blur', this._onWindowBlur);
        document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    startDrag(slotIndex, event) {
        if (this.dragging || this.dragReturning || this.game.isGameOver || this.game.isAnimating || this.game.state !== 'playing') return;

        const piece = this.game.tray.slots[slotIndex];
        if (!piece) return;

        // 유저 제스처 시점에 AudioContext 복구 (모바일 소리 끊김 방지)
        this.game.sound.ensureContext();

        this.dragging = true;
        this.dragPieceIndex = slotIndex;
        this.dragPieceData = piece;
        this._trailTimer = 0;
        this._dragLastSeenAt = performance.now();
        this._clearDragTweens();

        // Hide the tray piece
        this.game.tray.hidePiece(slotIndex);

        // Create drag visual at full board cell size
        const cs = this.game.cellSize;
        this.dragContainer = createPieceContainer(piece, cs, 0.9, { tileScale: 0.88 });
        this.dragContainer.pivot.set(
            (piece.cols * cs) / 2,
            (piece.rows * cs) / 2
        );

        // Glow effect under dragged piece (enhanced multi-layer)
        const glowColor = BLOCK_COLORS[piece.colorIndex].glow;
        this.dragGlow = new PIXI.Graphics();
        const pw = piece.cols * cs;
        const ph = piece.rows * cs;
        // Outer soft glow
        this.dragGlow.roundRect(-pw / 2 - 16, -ph / 2 - 16, pw + 32, ph + 32, 12)
            .fill({ color: glowColor, alpha: 0.04 });
        // Inner glow
        this.dragGlow.roundRect(-pw / 2 - 8, -ph / 2 - 8, pw + 16, ph + 16, 8)
            .fill({ color: glowColor, alpha: 0.08 });

        const pos = event.global;
        const clampedPos = this._clampDragPosition(pos.x, pos.y + this.dragOffsetY, piece);
        const dragX = clampedPos.x;
        const dragY = clampedPos.y;
        this._lastDragX = dragX;
        this._lastDragY = dragY;

        this.dragGlow.position.set(dragX, dragY);
        this.dragLayer.addChild(this.dragGlow);

        this.dragContainer.position.set(dragX, dragY);
        this.dragLayer.addChild(this.dragContainer);

        // Scale-up entrance animation
        this.dragContainer.scale.set(0.6);
        this.dragContainer.alpha = 0.5;
        const dragRef = this.dragContainer;
        this.game.effects.tweens.push({
            elapsed: 0,
            duration: 200,
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                if (dragRef && !dragRef.destroyed) {
                    dragRef.scale.set(0.6 + easeOutBack(t) * 0.4);
                    dragRef.alpha = 0.5 + t * 0.4;
                }
                return t >= 1;
            }
        });

        // Play pickup sound
        this.game.sound.playPickup();

        // Initial ghost update
        this._updateGhost(dragX, dragY);
    }

    onPointerMove(event) {
        if (!this.dragging || !this.dragContainer || !this.dragPieceData) return;

        const pos = event.global;
        const clampedPos = this._clampDragPosition(pos.x, pos.y + this.dragOffsetY);
        const x = clampedPos.x;
        const y = clampedPos.y;
        this._dragLastSeenAt = performance.now();

        this.dragContainer.position.set(x, y);
        if (this.dragGlow) {
            this.dragGlow.position.set(x, y);
        }

        // Spawn trail particles during drag
        const dx = x - this._lastDragX;
        const dy = y - this._lastDragY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 8) {
            this._spawnTrailParticle(x, y);
            this._lastDragX = x;
            this._lastDragY = y;
        }

        this._updateGhost(x, y);
    }

    _spawnTrailParticle(x, y) {
        if (!this.dragPieceData) return;
        const blockColor = BLOCK_COLORS[this.dragPieceData.colorIndex];
        const color = blockColor.glow;
        const effects = this.game.effects;

        // Main glowing particle (pooled)
        const size = 2 + Math.random() * 3;
        const gfx = effects._getParticleGfx();
        gfx.circle(0, 0, size * 2).fill({ color, alpha: 0.15 });
        gfx.circle(0, 0, size).fill({ color, alpha: 0.6 });
        gfx.circle(0, 0, size * 0.35).fill({ color: 0xFFFFFF, alpha: 0.5 });

        gfx.position.set(
            x + (Math.random() - 0.5) * 25,
            y + (Math.random() - 0.5) * 25
        );
        effects.container.addChild(gfx);

        effects.particles.push({
            gfx,
            vx: (Math.random() - 0.5) * 0.8,
            vy: -0.8 - Math.random() * 1.5,
            rotSpeed: 0,
            gravity: -0.04,
            baseScale: 0.5 + Math.random() * 0.7,
            shrink: 0.7,
            fadeIn: true,
            life: 350 + Math.random() * 350,
            maxLife: 700,
        });

        // Occasional sparkle (30% chance, pooled)
        if (Math.random() < 0.3) {
            const sparkSize = 1 + Math.random() * 2;
            const sparkGfx = effects._getParticleGfx();
            sparkGfx.star(0, 0, 4, sparkSize, sparkSize * 0.4)
                     .fill({ color: blockColor.light, alpha: 0.7 });
            sparkGfx.position.set(
                x + (Math.random() - 0.5) * 30,
                y + (Math.random() - 0.5) * 30
            );
            effects.container.addChild(sparkGfx);
            effects.particles.push({
                gfx: sparkGfx,
                vx: (Math.random() - 0.5) * 1.2,
                vy: -1 - Math.random() * 2,
                rotSpeed: (Math.random() - 0.5) * 0.3,
                gravity: -0.02,
                baseScale: 0.4 + Math.random() * 0.6,
                shrink: 0.6,
                fadeIn: true,
                life: 250 + Math.random() * 250,
                maxLife: 500,
            });
        }
    }

    onPointerCancel(event) {
        if (!this.dragging) return;
        if (window._sendGameError) {
            window._sendGameError(
                'PointerCancel',
                'drag cancelled by browser',
                '',
                'InputManager.js',
                this.game.getErrorMetadata('pointer-cancel', {
                    pointerType: event && event.pointerType ? event.pointerType : '',
                    dragPieceIndex: this.dragPieceIndex,
                })
            );
        }
        // 모바일에서 터치 취소 (알림, 제스처 등) — 원래 슬롯으로 복귀
        this.game.board.clearGhost();
        this._snapBack();
    }

    onPointerUp(event) {
        if (!this.dragging) return;

        const pos = event.global;
        const clampedPos = this._clampDragPosition(pos.x, pos.y + this.dragOffsetY);
        const x = clampedPos.x;
        const y = clampedPos.y;
        this._dragLastSeenAt = performance.now();

        const gridPos = this._screenToGrid(x, y);
        const piece = this.dragPieceData;
        const board = this.game.board;
        const slotIndex = this.dragPieceIndex; // Save before cleanup resets it

        if (gridPos && board.canPlace(piece.shape, gridPos.col, gridPos.row)) {
            // Valid placement
            board.clearGhost();
            this._cleanupDrag();
            this.game.placePiece(slotIndex, gridPos.col, gridPos.row);
        } else {
            // Invalid — snap back
            board.clearGhost();
            this.game.sound.playInvalid();
            this._snapBack();
        }
    }

    _updateGhost(screenX, screenY) {
        const piece = this.dragPieceData;
        if (!piece) return;
        const gridPos = this._screenToGrid(screenX, screenY);
        const board = this.game.board;

        if (!gridPos) {
            board.clearGhost();
            this._lastGridCol = -1;
            this._lastGridRow = -1;
            return;
        }

        // Play snap sound when grid position changes
        if (gridPos.col !== this._lastGridCol || gridPos.row !== this._lastGridRow) {
            this._lastGridCol = gridPos.col;
            this._lastGridRow = gridPos.row;
            this.game.sound.playDragSnap();

            // Check for near-completion hint sound
            if (board.canPlace(piece.shape, gridPos.col, gridPos.row)) {
                this._checkNearComplete(piece.shape, gridPos.col, gridPos.row);
            }
        }

        const canPlace = board.canPlace(piece.shape, gridPos.col, gridPos.row);
        board.showGhost(piece.shape, gridPos.col, gridPos.row, canPlace);
    }

    _screenToGrid(screenX, screenY) {
        const piece = this.dragPieceData;
        if (!piece) return null;
        const boardPos = this.game.board.getGlobalPosition();
        const cs = this.game.cellSize;

        // Center of piece → grid position for top-left
        const centerOffsetX = (piece.cols * cs) / 2;
        const centerOffsetY = (piece.rows * cs) / 2;

        const localX = screenX - boardPos.x - centerOffsetX;
        const localY = screenY - boardPos.y - centerOffsetY;

        // Snap to nearest cell
        const col = Math.round(localX / cs);
        const row = Math.round(localY / cs);

        // Check if within reasonable range
        if (row < -piece.rows || row > GRID_SIZE + piece.rows ||
            col < -piece.cols || col > GRID_SIZE + piece.cols) {
            return null;
        }

        return { row, col };
    }

    _eventToGlobal(event) {
        const canvas = this.game && this.game.app && this.game.app.canvas;
        const screen = this.game && this.game.app && this.game.app.screen;
        if (!canvas || !screen || typeof event.clientX !== 'number') return null;

        const rect = canvas.getBoundingClientRect();
        const scaleX = screen.width / Math.max(1, rect.width);
        const scaleY = screen.height / Math.max(1, rect.height);
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY,
        };
    }

    _isClientPointInCanvas(event) {
        const canvas = this.game && this.game.app && this.game.app.canvas;
        if (!canvas || typeof event.clientX !== 'number') return true;
        const rect = canvas.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top && event.clientY <= rect.bottom;
    }

    _clampDragPosition(x, y, piece = this.dragPieceData) {
        if (!piece || !this.game || !this.game.app || !this.game.app.screen) return { x, y };

        const cs = Math.max(1, this.game.cellSize || 1);
        const halfW = (piece.cols * cs) / 2;
        const halfH = (piece.rows * cs) / 2;
        const margin = 6;
        const screenW = this.game.app.screen.width;
        const screenH = this.game.app.screen.height;

        const minX = halfW + margin;
        const maxX = Math.max(minX, screenW - halfW - margin);
        const minY = halfH + margin;
        const maxY = Math.max(minY, screenH - halfH - margin);

        return {
            x: Math.max(minX, Math.min(maxX, x)),
            y: Math.max(minY, Math.min(maxY, y)),
        };
    }

    _handleWindowPointerUp(event) {
        if (!this.dragging) return;
        if (!this._isClientPointInCanvas(event)) {
            this.game.board.clearGhost();
            this.game.sound.playInvalid();
            this._snapBack();
            return;
        }

        const global = this._eventToGlobal(event);
        if (global) this.onPointerUp({ global });
    }

    _handleWindowPointerCancel() {
        if (!this.dragging && !this.dragReturning) return;
        this.cancelDrag({ animate: true, restorePiece: true });
    }

    _handleWindowTouchEnd() {
        if (!this.dragging && !this.dragReturning) return;
        this.cancelDrag({ animate: true, restorePiece: true });
    }

    _handleWindowBlur() {
        if (!this.dragging && !this.dragReturning) return;
        this.cancelDrag({ animate: true, restorePiece: true });
    }

    _handleVisibilityChange() {
        if (!document.hidden || (!this.dragging && !this.dragReturning)) return;
        this.cancelDrag({ animate: true, restorePiece: true });
    }

    _clearDragTweens() {
        const effects = this.game && this.game.effects;
        if (!effects || !Array.isArray(effects.tweens) || effects.tweens.length === 0) return;
        effects.tweens = effects.tweens.filter(tween => !tween || !tween._isDragReturnTween);
    }

    _updateDragWatchdog() {
        if (!this.game) return;

        if (this.game.state !== 'playing' && (this.dragging || this.dragReturning || this._hasDragLayerChildren())) {
            this.cancelDrag({ animate: false, restorePiece: true });
            return;
        }

        if (!this.dragging && !this.dragReturning && this._hasDragLayerChildren()) {
            this._cleanupDrag();
            return;
        }

        if (this.dragging && performance.now() - this._dragLastSeenAt > 4500) {
            this.cancelDrag({ animate: true, restorePiece: true });
        }
    }

    _hasDragLayerChildren() {
        return !!(this.dragLayer && !this.dragLayer.destroyed && this.dragLayer.children.length > 0);
    }

    _snapBack() {
        this._clearDragTweens();
        const slotIdx = this.dragPieceIndex;
        const target = this.game.tray.getSlotGlobalCenter(slotIdx);

        // Stop ghost updates immediately to prevent re-showing during animation
        this.dragging = false;
        this.dragReturning = true;

        if (!this.dragContainer) {
            this.game.tray.showPiece(slotIdx);
            this._cleanupDrag();
            return;
        }

        const startX = this.dragContainer.x;
        const startY = this.dragContainer.y;
        const container = this.dragContainer;
        const glow = this.dragGlow;
        const tray = this.game.tray;
        const self = this;

        this.game.effects.tweens.push({
            elapsed: 0,
            duration: 300,
            _isDragReturnTween: true,
            update(dt) {
                if (container.destroyed) {
                    if (glow && !glow.destroyed) glow.destroy();
                    tray.showPiece(slotIdx);
                    if (self.dragContainer === container || self.dragGlow === glow) {
                        self.dragPieceIndex = -1;
                        self.dragPieceData = null;
                        self.dragContainer = null;
                        self.dragGlow = null;
                        self.dragReturning = false;
                    }
                    return true;
                }
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                const e = easeOutCubic(t);
                container.x = startX + (target.x - startX) * e;
                container.y = startY + (target.y - startY) * e;
                container.alpha = 1 - t * 0.6;
                container.scale.set(1 - t * 0.4);
                if (glow && !glow.destroyed) {
                    glow.x = container.x;
                    glow.y = container.y;
                    glow.alpha = 1 - t;
                }

                if (t >= 1) {
                    container.destroy({ children: true });
                    if (glow && !glow.destroyed) glow.destroy();
                    tray.showPiece(slotIdx);
                    if (self.dragContainer === container || self.dragGlow === glow) {
                        self.dragPieceIndex = -1;
                        self.dragPieceData = null;
                        self.dragContainer = null;
                        self.dragGlow = null;
                        self.dragReturning = false;
                    }
                    return true;
                }
                return false;
            }
        });
    }

    cancelDrag({ animate = false, restorePiece = true } = {}) {
        if (!this.dragging && !this.dragReturning && !this.dragContainer && !this.dragGlow && !this._hasDragLayerChildren()) return;
        if (this.game && this.game.board) {
            if (typeof this.game.board.clearTransientOverlays === 'function') {
                this.game.board.clearTransientOverlays();
            } else {
                this.game.board.clearGhost();
            }
        }

        if (animate && this.dragContainer && this.dragPieceIndex >= 0) {
            this._snapBack();
            return;
        }

        const slotIdx = this.dragPieceIndex;
        this._cleanupDrag();
        if (restorePiece && slotIdx >= 0) {
            this.game.tray.showPiece(slotIdx);
        }
    }

    _cleanupDrag() {
        this._clearDragTweens();
        if (this.dragContainer) {
            this.dragContainer.destroy({ children: true });
            this.dragContainer = null;
        }
        if (this.dragGlow) {
            this.dragGlow.destroy();
            this.dragGlow = null;
        }
        if (this.dragLayer && !this.dragLayer.destroyed && this.dragLayer.children.length > 0) {
            const leftovers = this.dragLayer.removeChildren();
            leftovers.forEach((child) => {
                if (child && !child.destroyed) child.destroy({ children: true });
            });
        }
        this.dragging = false;
        this.dragReturning = false;
        this.dragPieceIndex = -1;
        this.dragPieceData = null;
        this._dragLastSeenAt = 0;
    }

    _checkNearComplete(shape, gridX, gridY) {
        const board = this.game.board;
        // Simulate placement and check if any row/col would be 0 empty (i.e., line clear)
        // by counting how many cells would complete rows/cols
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const gr = gridY + r;
                const gc = gridX + c;
                if (gr < 0 || gr >= GRID_SIZE || gc < 0 || gc >= GRID_SIZE) continue;

                // Check row completion
                let rowEmpty = 0;
                for (let cc = 0; cc < GRID_SIZE; cc++) {
                    if (board.grid[gr][cc] === -1) {
                        // Check if this empty cell is filled by our piece
                        const inPiece = shape[gr - gridY] && shape[gr - gridY][cc - gridX];
                        if (!inPiece) rowEmpty++;
                    }
                }
                if (rowEmpty === 0) {
                    this.game.sound.playNearComplete(0);
                    return;
                }
            }
        }
    }

    updateHitArea() {
        if (this.game.app.stage) {
            this.game.app.stage.hitArea = this.game.app.screen;
        }
    }

    destroy() {
        const stage = this.game?.app?.stage;
        if (stage) {
            stage.off('pointermove', this._onPointerMove);
            stage.off('pointerup', this._onPointerUp);
            stage.off('pointerupoutside', this._onPointerUp);
            stage.off('pointercancel', this._onPointerCancel);
        }

        if (this.game && this.game.app && this.game.app.ticker) {
            this.game.app.ticker.remove(this._updateDragWatchdog, this);
        }
        window.removeEventListener('pointerup', this._onWindowPointerUp);
        window.removeEventListener('pointercancel', this._onWindowPointerCancel);
        window.removeEventListener('mouseup', this._onWindowMouseUp);
        window.removeEventListener('touchend', this._onWindowTouchEnd);
        window.removeEventListener('touchcancel', this._onWindowTouchEnd);
        window.removeEventListener('blur', this._onWindowBlur);
        document.removeEventListener('visibilitychange', this._onVisibilityChange);

        this._cleanupDrag();
        if (this.dragLayer && !this.dragLayer.destroyed) {
            this.dragLayer.destroy({ children: true });
        }
        this.dragLayer = null;
        this.game = null;
    }
}
