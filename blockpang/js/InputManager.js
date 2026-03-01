class InputManager {
    constructor(game) {
        this.game = game;
        this.dragging = false;
        this.dragPieceIndex = -1;
        this.dragContainer = null;
        this.dragPieceData = null;
        this.dragLayer = new PIXI.Container();
        this.dragGlow = null;
        this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        this.dragOffsetY = this.isMobile ? -70 : -35;
        this._trailTimer = 0;
        this._lastDragX = 0;
        this._lastDragY = 0;

        game.app.stage.addChild(this.dragLayer);

        // Global pointer events
        game.app.stage.eventMode = 'static';
        game.app.stage.hitArea = game.app.screen;
        game.app.stage.on('pointermove', this.onPointerMove.bind(this));
        game.app.stage.on('pointerup', this.onPointerUp.bind(this));
        game.app.stage.on('pointerupoutside', this.onPointerUp.bind(this));
    }

    startDrag(slotIndex, event) {
        if (this.dragging || this.game.isGameOver || this.game.isAnimating || this.game.state !== 'playing') return;

        const piece = this.game.tray.slots[slotIndex];
        if (!piece) return;

        this.dragging = true;
        this.dragPieceIndex = slotIndex;
        this.dragPieceData = piece;
        this._trailTimer = 0;

        // Hide the tray piece
        this.game.tray.hidePiece(slotIndex);

        // Create drag visual at full board cell size
        const cs = this.game.cellSize;
        this.dragContainer = createPieceContainer(piece, cs, 0.9);
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
        this.dragGlow.beginFill(glowColor, 0.04);
        this.dragGlow.drawRoundedRect(-pw / 2 - 16, -ph / 2 - 16, pw + 32, ph + 32, 12);
        this.dragGlow.endFill();
        // Inner glow
        this.dragGlow.beginFill(glowColor, 0.08);
        this.dragGlow.drawRoundedRect(-pw / 2 - 8, -ph / 2 - 8, pw + 16, ph + 16, 8);
        this.dragGlow.endFill();

        const pos = event.global;
        const dragX = pos.x;
        const dragY = pos.y + this.dragOffsetY;
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
        if (!this.dragging) return;

        const pos = event.global;
        const x = pos.x;
        const y = pos.y + this.dragOffsetY;

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
        const color = BLOCK_COLORS[this.dragPieceData.colorIndex].glow;
        const size = 1.5 + Math.random() * 2.5;

        const gfx = new PIXI.Graphics();
        gfx.beginFill(color, 0.5);
        gfx.drawCircle(0, 0, size);
        gfx.endFill();
        gfx.beginFill(0xFFFFFF, 0.3);
        gfx.drawCircle(0, 0, size * 0.4);
        gfx.endFill();

        gfx.position.set(
            x + (Math.random() - 0.5) * 20,
            y + (Math.random() - 0.5) * 20
        );
        this.game.effects.container.addChild(gfx);

        this.game.effects.particles.push({
            gfx,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -0.5 - Math.random() * 1.0,
            rotSpeed: 0,
            gravity: -0.03,
            baseScale: 0.6 + Math.random() * 0.6,
            shrink: 0.8,
            fadeIn: true,
            life: 300 + Math.random() * 300,
            maxLife: 600,
        });
    }

    onPointerUp(event) {
        if (!this.dragging) return;

        const pos = event.global;
        const x = pos.x;
        const y = pos.y + this.dragOffsetY;

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
        const gridPos = this._screenToGrid(screenX, screenY);
        const board = this.game.board;
        const piece = this.dragPieceData;

        if (!gridPos) {
            board.clearGhost();
            return;
        }

        const canPlace = board.canPlace(piece.shape, gridPos.col, gridPos.row);
        board.showGhost(piece.shape, gridPos.col, gridPos.row, canPlace);
    }

    _screenToGrid(screenX, screenY) {
        const boardPos = this.game.board.getGlobalPosition();
        const cs = this.game.cellSize;
        const piece = this.dragPieceData;

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

    _snapBack() {
        const slotIdx = this.dragPieceIndex;
        const target = this.game.tray.getSlotGlobalCenter(slotIdx);

        if (!this.dragContainer) {
            this._cleanupDrag();
            this.game.tray.showPiece(slotIdx);
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
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                const e = easeOutCubic(t);
                container.x = startX + (target.x - startX) * e;
                container.y = startY + (target.y - startY) * e;
                container.alpha = 1 - t * 0.6;
                container.scale.set(1 - t * 0.4);
                if (glow) {
                    glow.x = container.x;
                    glow.y = container.y;
                    glow.alpha = 1 - t;
                }

                if (t >= 1) {
                    container.destroy({ children: true });
                    if (glow) glow.destroy();
                    tray.showPiece(slotIdx);
                    self.dragging = false;
                    self.dragPieceIndex = -1;
                    self.dragPieceData = null;
                    self.dragContainer = null;
                    self.dragGlow = null;
                    return true;
                }
                return false;
            }
        });
    }

    _cleanupDrag() {
        if (this.dragContainer) {
            this.dragContainer.destroy({ children: true });
            this.dragContainer = null;
        }
        if (this.dragGlow) {
            this.dragGlow.destroy();
            this.dragGlow = null;
        }
        this.dragging = false;
        this.dragPieceIndex = -1;
        this.dragPieceData = null;
    }

    updateHitArea() {
        if (this.game.app.stage) {
            this.game.app.stage.hitArea = this.game.app.screen;
        }
    }
}
