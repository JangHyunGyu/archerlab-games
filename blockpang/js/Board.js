class Board {
    constructor(game) {
        this.game = game;
        this.app = game.app;
        this.container = new PIXI.Container();

        // Data grid: -1 = empty, 0-7 = color index
        this.grid = [];
        this.cellSize = 0;
        this.cellTextures = [];
        this.emptyTexture = null;
        this.bgGraphics = null;
        this.cellSprites = [];   // [row][col] PIXI.Sprite
        this.ghostContainer = null;
        this.hintContainer = null;
        this.gridLineContainer = null;
        this._glowTime = 0;

        this._initGrid();
    }

    _initGrid() {
        for (let r = 0; r < GRID_SIZE; r++) {
            this.grid[r] = [];
            this.cellSprites[r] = [];
            for (let c = 0; c < GRID_SIZE; c++) {
                this.grid[r][c] = -1;
                this.cellSprites[r][c] = null;
            }
        }
    }

    // ── Resize & Rebuild Visuals ──
    resize(cellSize, x, y) {
        const needsRebuild = this.cellSize !== cellSize;
        this.cellSize = cellSize;
        this.container.position.set(x, y);

        if (needsRebuild && cellSize > 0) {
            this._buildVisuals();
        }
    }

    _buildVisuals() {
        // Clean up
        this.container.removeChildren();
        this.cellTextures.forEach(t => t.destroy(true));
        this.cellTextures = [];
        if (this.emptyTexture) { this.emptyTexture.destroy(true); this.emptyTexture = null; }

        const cs = this.cellSize;

        // Generate textures
        this.emptyTexture = this._createEmptyTexture(cs);
        BLOCK_COLORS.forEach(color => {
            this.cellTextures.push(this._createCellTexture(color, cs));
        });

        // Background with glow border
        this.bgGraphics = this._drawBackground(cs);
        this.container.addChild(this.bgGraphics);

        // Grid lines layer (subtle)
        this.gridLineContainer = new PIXI.Container();
        this._drawGridLines(cs);
        this.container.addChild(this.gridLineContainer);

        // Hint container for row/col near-completion
        this.hintContainer = new PIXI.Container();
        this.container.addChild(this.hintContainer);

        // Cell sprites (empty cells + filled cells)
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                // Empty cell bg
                const emptySprite = new PIXI.Sprite(this.emptyTexture);
                emptySprite.position.set(c * cs + 1, r * cs + 1);
                emptySprite.width = cs - 2;
                emptySprite.height = cs - 2;
                this.container.addChild(emptySprite);

                // Filled cell sprite (hidden by default)
                const colorIdx = this.grid[r][c];
                const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
                sprite.position.set(c * cs, r * cs);
                sprite.width = cs;
                sprite.height = cs;
                sprite.visible = false;
                this.container.addChild(sprite);
                this.cellSprites[r][c] = sprite;

                if (colorIdx >= 0) {
                    sprite.texture = this.cellTextures[colorIdx];
                    sprite.visible = true;
                }
            }
        }

        // Ghost container on top
        this.ghostContainer = new PIXI.Container();
        this.container.addChild(this.ghostContainer);
    }

    _drawBackground(cs) {
        const container = new PIXI.Container();
        const total = cs * GRID_SIZE;

        const g = new PIXI.Graphics();

        // Outer glow (enhanced multi-layer)
        for (let i = 5; i >= 0; i--) {
            const expand = 8 + i * 4;
            const alpha = 0.02 + i * 0.015;
            g.beginFill(0x3355cc, alpha);
            g.drawRoundedRect(-expand, -expand, total + expand * 2, total + expand * 2, 14 + i * 2);
            g.endFill();
        }

        // Board background
        g.beginFill(0x080825, 0.97);
        g.drawRoundedRect(-6, -6, total + 12, total + 12, 10);
        g.endFill();

        // Subtle gradient overlay (top lighter)
        g.beginFill(0x1a1a4a, 0.15);
        g.drawRoundedRect(-6, -6, total + 12, (total + 12) * 0.3, 10);
        g.endFill();

        // Bottom gradient (darker)
        g.beginFill(0x030315, 0.1);
        g.drawRoundedRect(-6, total * 0.6, total + 12, total * 0.4 + 6, 10);
        g.endFill();

        container.addChild(g);

        // Animated pulsing border (separate graphic for ticker updates)
        this._borderGfx = new PIXI.Graphics();
        this._borderGfx.lineStyle(2, 0x3355cc, 0.5);
        this._borderGfx.drawRoundedRect(-6, -6, total + 12, total + 12, 10);
        this._borderGfx.lineStyle(1, 0x4466dd, 0.15);
        this._borderGfx.drawRoundedRect(-3, -3, total + 6, total + 6, 8);
        container.addChild(this._borderGfx);

        // Corner accents (premium detail)
        const cornerG = new PIXI.Graphics();
        const cornerLen = Math.min(20, cs * 0.8);
        const corners = [
            { x: -6, y: -6, dx: 1, dy: 1 },
            { x: total + 6, y: -6, dx: -1, dy: 1 },
            { x: -6, y: total + 6, dx: 1, dy: -1 },
            { x: total + 6, y: total + 6, dx: -1, dy: -1 },
        ];
        cornerG.lineStyle(2, 0x5577ee, 0.4);
        corners.forEach(c => {
            cornerG.moveTo(c.x, c.y + c.dy * cornerLen);
            cornerG.lineTo(c.x, c.y);
            cornerG.lineTo(c.x + c.dx * cornerLen, c.y);
        });
        container.addChild(cornerG);

        // Start border pulse ticker if not already running
        if (!this._borderTickerAdded) {
            this._borderTickerAdded = true;
            this.app.ticker.add(() => {
                this._glowTime += 0.015;
                if (this._borderGfx && !this._borderGfx.destroyed) {
                    const pulse = 0.4 + Math.sin(this._glowTime) * 0.15;
                    this._borderGfx.alpha = pulse;
                }
            });
        }

        return container;
    }

    _drawGridLines(cs) {
        this.gridLineContainer.removeChildren();
        const g = new PIXI.Graphics();
        const total = cs * GRID_SIZE;

        // Subtle grid lines
        g.lineStyle(0.5, 0x2233aa, 0.08);
        for (let i = 1; i < GRID_SIZE; i++) {
            g.moveTo(i * cs, 0);
            g.lineTo(i * cs, total);
            g.moveTo(0, i * cs);
            g.lineTo(total, i * cs);
        }

        // 5x5 section dividers (slightly brighter)
        g.lineStyle(0.8, 0x3344bb, 0.12);
        g.moveTo(cs * 5, 0);
        g.lineTo(cs * 5, total);
        g.moveTo(0, cs * 5);
        g.lineTo(total, cs * 5);

        this.gridLineContainer.addChild(g);
    }

    _createEmptyTexture(size) {
        const g = new PIXI.Graphics();
        const s = size - 2;
        const r = Math.max(2, s * 0.1);

        // Base
        g.beginFill(0x0e0e2a, 0.92);
        g.drawRoundedRect(0, 0, s, s, r);
        g.endFill();

        // Subtle inner border
        g.lineStyle(0.5, 0x1a1a50, 0.7);
        g.drawRoundedRect(0.5, 0.5, s - 1, s - 1, r);
        g.lineStyle(0);

        // Very subtle top highlight
        g.beginFill(0x1a1a55, 0.2);
        g.drawRoundedRect(1, 1, s - 2, s * 0.3, r);
        g.endFill();

        const tex = this.app.renderer.generateTexture(g, {
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            scaleMode: PIXI.SCALE_MODES.LINEAR,
        });
        g.destroy();
        return tex;
    }

    _createCellTexture(color, size) {
        const g = new PIXI.Graphics();
        const s = size;
        const r = Math.max(2, s * 0.12);
        const p = 2; // Padding to keep everything inside cell bounds

        // Shadow (bottom-right bias for 3D feel)
        g.beginFill(color.dark, 0.9);
        g.drawRoundedRect(p, p, s - p * 2, s - p * 2, r);
        g.endFill();

        // Main body
        g.beginFill(color.main);
        g.drawRoundedRect(p + 1, p, s - p * 2 - 2, s - p * 2 - 2, r - 1);
        g.endFill();

        // Inner gradient (darker bottom half for 3D depth)
        g.beginFill(color.dark, 0.18);
        g.drawRoundedRect(p + 2, p + (s - p * 2) * 0.5, s - p * 2 - 4, (s - p * 2) * 0.48, r - 2);
        g.endFill();

        // Top highlight (glass-like reflection)
        g.beginFill(color.light, 0.55);
        g.drawRoundedRect(p + 2, p + 1, s - p * 2 - 4, (s - p * 2) * 0.3, r - 1);
        g.endFill();

        // Specular highlight (small bright spot, top-left)
        g.beginFill(0xFFFFFF, 0.35);
        g.drawRoundedRect(p + 4, p + 2, (s - p * 2) * 0.2, (s - p * 2) * 0.07, 2);
        g.endFill();

        // Wider specular bar
        g.beginFill(0xFFFFFF, 0.1);
        g.drawRoundedRect(p + s * 0.1, p + 2, (s - p * 2) * 0.5, (s - p * 2) * 0.035, 1);
        g.endFill();

        // Subtle inner border (premium feel)
        g.lineStyle(0.5, color.light, 0.15);
        g.drawRoundedRect(p + 1, p + 1, s - p * 2 - 2, s - p * 2 - 2, r - 1);
        g.lineStyle(0);

        const tex = this.app.renderer.generateTexture(g, {
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            scaleMode: PIXI.SCALE_MODES.LINEAR,
        });
        g.destroy();
        return tex;
    }

    // ── Game Logic ──
    canPlace(shape, gridX, gridY) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const gr = gridY + r;
                const gc = gridX + c;
                if (gr < 0 || gr >= GRID_SIZE || gc < 0 || gc >= GRID_SIZE) return false;
                if (this.grid[gr][gc] !== -1) return false;
            }
        }
        return true;
    }

    canPlaceAnywhere(shape) {
        for (let r = 0; r <= GRID_SIZE - shape.length; r++) {
            for (let c = 0; c <= GRID_SIZE - shape[0].length; c++) {
                if (this.canPlace(shape, c, r)) return true;
            }
        }
        return false;
    }

    place(shape, gridX, gridY, colorIndex) {
        const placedCells = [];
        const placedSprites = [];
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const gr = gridY + r;
                const gc = gridX + c;
                this.grid[gr][gc] = colorIndex;
                const sprite = this.cellSprites[gr][gc];
                sprite.texture = this.cellTextures[colorIndex];
                sprite.visible = true;
                sprite.alpha = 1;
                placedCells.push({ row: gr, col: gc, colorIndex });
                placedSprites.push(sprite);
            }
        }
        return { cells: placedCells, sprites: placedSprites };
    }

    checkAndClearLines() {
        const rowsToClear = [];
        const colsToClear = [];

        for (let r = 0; r < GRID_SIZE; r++) {
            if (this.grid[r].every(v => v !== -1)) rowsToClear.push(r);
        }
        for (let c = 0; c < GRID_SIZE; c++) {
            let full = true;
            for (let r = 0; r < GRID_SIZE; r++) {
                if (this.grid[r][c] === -1) { full = false; break; }
            }
            if (full) colsToClear.push(c);
        }

        if (rowsToClear.length === 0 && colsToClear.length === 0) {
            return { lines: 0, cells: [], sprites: [] };
        }

        const cellSet = new Map();
        rowsToClear.forEach(r => {
            for (let c = 0; c < GRID_SIZE; c++) {
                cellSet.set(`${r},${c}`, this.grid[r][c]);
            }
        });
        colsToClear.forEach(c => {
            for (let r = 0; r < GRID_SIZE; r++) {
                cellSet.set(`${r},${c}`, this.grid[r][c]);
            }
        });

        const clearedCells = [];
        const clearedSprites = [];
        cellSet.forEach((colorIndex, key) => {
            const [r, c] = key.split(',').map(Number);
            clearedCells.push({ row: r, col: c, colorIndex });
            clearedSprites.push(this.cellSprites[r][c]);
        });

        return {
            lines: rowsToClear.length + colsToClear.length,
            cells: clearedCells,
            sprites: clearedSprites,
            rows: rowsToClear,
            cols: colsToClear,
            apply: () => {
                cellSet.forEach((_, key) => {
                    const [r, c] = key.split(',').map(Number);
                    this.grid[r][c] = -1;
                    this.cellSprites[r][c].visible = false;
                });
            }
        };
    }

    // ── Check if board is empty (perfect clear) ──
    isEmpty() {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (this.grid[r][c] !== -1) return false;
            }
        }
        return true;
    }

    // ── Row/Col completion hints ──
    showCompletionHints() {
        if (!this.hintContainer) return;
        this.hintContainer.removeChildren();
        const cs = this.cellSize;
        const total = cs * GRID_SIZE;

        // Check rows
        for (let r = 0; r < GRID_SIZE; r++) {
            let empty = 0;
            for (let c = 0; c < GRID_SIZE; c++) {
                if (this.grid[r][c] === -1) empty++;
            }
            if (empty > 0 && empty <= 3) {
                const g = new PIXI.Graphics();
                const intensity = (4 - empty) * 0.06;
                g.beginFill(0x44FF88, intensity);
                g.drawRect(0, r * cs, total, cs);
                g.endFill();
                this.hintContainer.addChild(g);
            }
        }

        // Check cols
        for (let c = 0; c < GRID_SIZE; c++) {
            let empty = 0;
            for (let r = 0; r < GRID_SIZE; r++) {
                if (this.grid[r][c] === -1) empty++;
            }
            if (empty > 0 && empty <= 3) {
                const g = new PIXI.Graphics();
                const intensity = (4 - empty) * 0.06;
                g.beginFill(0x44FF88, intensity);
                g.drawRect(c * cs, 0, cs, total);
                g.endFill();
                this.hintContainer.addChild(g);
            }
        }
    }

    clearCompletionHints() {
        if (this.hintContainer) {
            this.hintContainer.removeChildren();
        }
    }

    // ── Ghost Preview (animated pulsing) ──
    showGhost(shape, gridX, gridY, isValid) {
        this.clearGhost();
        if (!this.ghostContainer) return;
        const cs = this.cellSize;
        const color = isValid ? 0x44FF88 : 0xFF4444;
        const alpha = isValid ? 0.35 : 0.2;
        const r = Math.max(2, cs * 0.1);

        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (!shape[row][col]) continue;
                const x = (gridX + col) * cs;
                const y = (gridY + row) * cs;

                const g = new PIXI.Graphics();

                // Filled ghost cell
                g.beginFill(color, alpha);
                g.drawRoundedRect(x + 1, y + 1, cs - 2, cs - 2, r);
                g.endFill();

                // Border
                g.lineStyle(1.5, color, alpha + 0.3);
                g.drawRoundedRect(x + 1, y + 1, cs - 2, cs - 2, r);
                g.lineStyle(0);

                // Inner glow for valid
                if (isValid) {
                    g.beginFill(0xFFFFFF, 0.1);
                    g.drawRoundedRect(x + 3, y + 3, cs - 6, (cs - 6) * 0.3, r - 1);
                    g.endFill();
                }

                this.ghostContainer.addChild(g);
            }
        }

        // Show completion hints when ghost is valid
        if (isValid) {
            this.showCompletionHints();
        }
    }

    clearGhost() {
        if (this.ghostContainer) {
            this.ghostContainer.removeChildren();
        }
        this.clearCompletionHints();
    }

    // ── Clear board ──
    clearAll() {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                this.grid[r][c] = -1;
                if (this.cellSprites[r][c]) {
                    this.cellSprites[r][c].visible = false;
                }
            }
        }
    }

    getGlobalPosition() {
        return this.container.getGlobalPosition();
    }
}
