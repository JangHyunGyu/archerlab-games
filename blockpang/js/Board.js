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
        this.emptyCellContainer = null;
        this.filledCellContainer = null;
        this.cornerMatte = null;
        this.cellSprites = [];   // [row][col] PIXI.Sprite
        this.ghostContainer = null;
        this.hintContainer = null;
        this.gridLineContainer = null;
        this._glowTime = 0;

        // Ghost preview pool (reuse Graphics instead of create/destroy)
        this._ghostPool = [];
        this._ghostActiveCount = 0;

        // Completion hint pool
        this._hintPool = [];
        this._hintActiveCount = 0;

        // Reusable arrays for collision/placement checks
        this._tempRowCounts = new Array(GRID_SIZE);
        this._tempColCounts = new Array(GRID_SIZE);

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
        // Clean up — destroy all children to free GPU memory
        const oldChildren = this.container.removeChildren();
        oldChildren.forEach(c => c.destroy({ children: true }));
        this.cellTextures.forEach(t => {
            if (t && t._blockpangGenerated) t.destroy(true);
        });
        this.cellTextures = [];
        if (this.emptyTexture) {
            if (this.emptyTexture._blockpangGenerated) this.emptyTexture.destroy(true);
            this.emptyTexture = null;
        }

        // Clear pools — old Graphics objects were destroyed with their containers
        this._ghostPool = [];
        this._ghostActiveCount = 0;
        this._hintPool = [];
        this._hintActiveCount = 0;

        const cs = this.cellSize;

        // Generate textures
        this.emptyTexture = this._createEmptyTexture(cs);
        BLOCK_COLORS.forEach((color, index) => {
            this.cellTextures.push(this._createCellTexture(color, cs, index));
        });

        // Background with glow border
        this.bgGraphics = this._drawBackground(cs);
        this.container.addChild(this.bgGraphics);

        // Empty cells and decorative grid sit below filled blocks so the frame
        // can shave their visual corners without affecting playable cells.
        this.emptyCellContainer = new PIXI.Container();
        this.container.addChild(this.emptyCellContainer);

        // Grid lines layer (subtle)
        this.gridLineContainer = new PIXI.Container();
        this._drawGridLines(cs);
        this.container.addChild(this.gridLineContainer);

        this.cornerMatte = this._drawCornerMatte(cs);
        this.container.addChild(this.cornerMatte);

        // Hint container for row/col near-completion
        this.hintContainer = new PIXI.Container();
        this.container.addChild(this.hintContainer);

        this.filledCellContainer = new PIXI.Container();
        this.container.addChild(this.filledCellContainer);

        // Cell sprites (empty cells + filled cells)
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                // Empty cell bg
                const emptySprite = new PIXI.Sprite(this.emptyTexture);
                emptySprite.position.set(c * cs + 1, r * cs + 1);
                emptySprite.width = cs - 2;
                emptySprite.height = cs - 2;
                this.emptyCellContainer.addChild(emptySprite);

                // Filled cell sprite (hidden by default)
                const colorIdx = this.grid[r][c];
                const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
                this.fitCellSprite(sprite, r, c);
                sprite.visible = false;
                this.filledCellContainer.addChild(sprite);
                this.cellSprites[r][c] = sprite;

                if (colorIdx >= 0) {
                    sprite.texture = this.cellTextures[colorIdx];
                    this.fitCellSprite(sprite, r, c);
                    sprite.visible = true;
                }
            }
        }

        // Ghost container on top
        this.ghostContainer = new PIXI.Container();
        this.container.addChild(this.ghostContainer);
    }

    _drawChamferedPath(g, x, y, w, h, cut) {
        const c = Math.max(0, Math.min(cut, w * 0.5, h * 0.5));
        return g.moveTo(x + c, y)
            .lineTo(x + w - c, y)
            .lineTo(x + w, y + c)
            .lineTo(x + w, y + h - c)
            .lineTo(x + w - c, y + h)
            .lineTo(x + c, y + h)
            .lineTo(x, y + h - c)
            .lineTo(x, y + c)
            .closePath();
    }

    _drawBackground(cs) {
        const container = new PIXI.Container();
        const total = cs * GRID_SIZE;

        const panelTexture = getBlockpangTexture('boardPanel');
        // Outer extension so the asset's corner brackets sit clear of the cells.
        // The board-panel.webp frame is ~11% of total side, so ext ≈ cs * 1.1
        // keeps the cells fully inside the inner edge of the frame.
        const ext = getBlockpangBoardPanelExt(
            cs,
            this.app && this.app.screen ? this.app.screen.width : 0,
            this.app && this.app.screen ? this.app.screen.height : 0
        );
        const g = new PIXI.Graphics();

        // Soft neon shadow underneath the asset panel.
        g.roundRect(-ext + 6, -ext + 10, total + (ext - 6) * 2, total + (ext - 10) * 2, 18)
         .fill({ color: THEME.shadow, alpha: panelTexture ? 0.34 : 0.38 });

        if (!panelTexture) {
            g.roundRect(-8, -8, total + 16, total + 16, 14)
             .fill({ color: THEME.surfaceAlt });
        }

        container.addChild(g);

        if (panelTexture) {
            const panelLayer = new PIXI.Container();
            const panel = new PIXI.Sprite(panelTexture);
            panel.position.set(-ext, -ext);
            panel.width = total + ext * 2;
            panel.height = total + ext * 2;
            panel.alpha = 0.96;
            panelLayer.addChild(panel);
            container.addChild(panelLayer);

            const panelMask = new PIXI.Graphics();
            this._drawChamferedPath(
                panelMask,
                -ext + 1,
                -ext + 1,
                total + ext * 2 - 2,
                total + ext * 2 - 2,
                Math.max(16, Math.round(ext * 0.62))
            ).fill({ color: 0xFFFFFF, alpha: 1 });
            container.addChild(panelMask);
            panelLayer.mask = panelMask;
        }

        const surface = new PIXI.Graphics();
        const surfacePad = Math.max(2, Math.round(cs * 0.08));
        const surfaceCut = Math.max(14, Math.round(cs * 0.48));
        this._drawChamferedPath(
            surface,
            -surfacePad,
            -surfacePad,
            total + surfacePad * 2,
            total + surfacePad * 2,
            surfaceCut
        ).fill({ color: 0x06142F, alpha: panelTexture ? 0.93 : 0.78 });
        container.addChild(surface);

        const sheen = getBlockpangTexture('crystalSheen');
        if (sheen) {
            const sheenSprite = new PIXI.Sprite(sheen);
            sheenSprite.position.set(-surfacePad, -surfacePad);
            sheenSprite.width = total + surfacePad * 2;
            sheenSprite.height = total + surfacePad * 2;
            sheenSprite.alpha = 0.13;
            container.addChild(sheenSprite);
        }

        // Thin hairline border (kept tight to the cell area, not the asset edge)
        const border = new PIXI.Graphics();
        this._drawChamferedPath(border, -8, -8, total + 16, total + 16, Math.max(18, Math.round(cs * 0.56)))
              .stroke({ width: 1.4, color: THEME.divider, alpha: 0.66 });
        this._drawChamferedPath(border, -3, -3, total + 6, total + 6, Math.max(14, Math.round(cs * 0.42)))
              .stroke({ width: 0.8, color: THEME.secondary, alpha: 0.22 });
        container.addChild(border);

        // No pulsing border — kept ticker-cleanup no-op for backward safety
        this._borderGfx = border;
        if (this._borderTickerFn) {
            this.app.ticker.remove(this._borderTickerFn);
            this._borderTickerFn = null;
        }

        return container;
    }

    _drawCornerMatte(cs) {
        const g = new PIXI.Graphics();
        const total = cs * GRID_SIZE;
        const cut = Math.max(14, Math.round(cs * 0.46));
        const fill = { color: 0x06142F, alpha: 0.94 };
        const rim = { width: 1, color: THEME.divider, alpha: 0.16 };

        g.poly([0, 0, cut, 0, 0, cut], true).fill(fill);
        g.poly([total, 0, total - cut, 0, total, cut], true).fill(fill);
        g.poly([total, total, total - cut, total, total, total - cut], true).fill(fill);
        g.poly([0, total, cut, total, 0, total - cut], true).fill(fill);

        g.moveTo(cut, 0).lineTo(0, cut).stroke(rim);
        g.moveTo(total - cut, 0).lineTo(total, cut).stroke(rim);
        g.moveTo(total, total - cut).lineTo(total - cut, total).stroke(rim);
        g.moveTo(cut, total).lineTo(0, total - cut).stroke(rim);
        return g;
    }

    _drawGridLines(cs) {
        const oldChildren = this.gridLineContainer.removeChildren();
        oldChildren.forEach(c => c.destroy({ children: true }));
        const total = cs * GRID_SIZE;

        // Hairline grid lines over the holographic board.
        const g = new PIXI.Graphics();
        for (let i = 1; i < GRID_SIZE; i++) {
            g.moveTo(i * cs, 0).lineTo(i * cs, total);
            g.moveTo(0, i * cs).lineTo(total, i * cs);
        }
        g.stroke({ width: 0.5, color: THEME.divider, alpha: 0.26 });
        this.gridLineContainer.addChild(g);
    }

    _createEmptyTexture(size) {
        const g = new PIXI.Graphics();
        const s = size - 2;
        const r = Math.max(3, s * 0.14);

        // Glassy empty recess, kept subtle so placed crystal blocks own the board.
        g.roundRect(0, 0, s, s, r).fill({ color: 0x07142F, alpha: 0.68 });

        g.roundRect(1, 1, s - 2, s - 2, r - 1)
         .stroke({ width: 1, color: THEME.divider, alpha: 0.16 });
        g.roundRect(2, 2, s - 4, s * 0.28, r - 1)
         .fill({ color: 0xFFFFFF, alpha: 0.035 });

        const tex = this.app.renderer.generateTexture({
            target: g,
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            scaleMode: 'linear',
        });
        tex._blockpangGenerated = true;
        g.destroy();
        return tex;
    }

    fitCellSprite(sprite, row, col) {
        if (!sprite) return;
        const cs = this.cellSize;
        sprite.position.set(col * cs, row * cs);
        sprite.width = cs;
        sprite.height = cs;
        sprite._blockpangBaseScaleX = sprite.scale.x;
        sprite._blockpangBaseScaleY = sprite.scale.y;
    }

    _createCellTexture(color, size, index = 0) {
        const tileTexture = getBlockpangTexture(`blockTile${index}`);
        if (tileTexture) return tileTexture;

        const g = new PIXI.Graphics();
        const s = size;
        const r = Math.max(2, s * 0.12);
        const p = 2;
        const inner = s - p * 2;

        // ── 1. Drop shadow (bottom-right, for 3D lift) ──
        g.roundRect(p + 1, p + 1, inner, inner, r)
         .fill({ color: 0x000000, alpha: 0.35 });

        // ── 2. Dark base (bottom bevel edge) ──
        g.roundRect(p, p, inner, inner, r)
         .fill({ color: color.dark, alpha: 0.95 });

        // ── 3. Main body (inset for bevel) ──
        g.roundRect(p + 1, p + 1, inner - 2, inner - 2, r - 1)
         .fill({ color: color.main });

        // ── 4. Bottom-half darken (3D curvature) ──
        g.roundRect(p + 2, p + inner * 0.5, inner - 4, inner * 0.47, r - 2)
         .fill({ color: color.dark, alpha: 0.25 });

        // ── 5. Left-edge highlight (bevel light) ──
        g.roundRect(p + 1, p + 2, 2, inner - 6, r - 1)
         .fill({ color: color.light, alpha: 0.3 });

        // ── 6. Top-edge highlight (bevel light) ──
        g.roundRect(p + 2, p + 1, inner - 6, 2, r - 1)
         .fill({ color: color.light, alpha: 0.35 });

        // ── 7. Glass reflection (large curved highlight, top 35%) ──
        g.roundRect(p + 3, p + 2, inner - 6, inner * 0.35, r - 1)
         .fill({ color: color.light, alpha: 0.5 });

        // ── 8. Glass gloss (bright band at top) ──
        g.roundRect(p + 4, p + 2, inner - 8, inner * 0.15, r - 2)
         .fill({ color: 0xFFFFFF, alpha: 0.35 });

        // ── 9. Specular dot (top-left, like light source) ──
        g.roundRect(p + 5, p + 3, inner * 0.15, inner * 0.06, 2)
         .fill({ color: 0xFFFFFF, alpha: 0.55 });

        // ── 10. Secondary reflection (lower-center, subtle) ──
        g.roundRect(p + inner * 0.3, p + inner * 0.6, inner * 0.4, inner * 0.08, 2)
         .fill({ color: color.light, alpha: 0.12 });

        // ── 11. Bottom-right inner shadow (depth) ──
        g.roundRect(p + inner * 0.6, p + inner * 0.75, inner * 0.35, inner * 0.2, r - 2)
         .fill({ color: 0x000000, alpha: 0.08 });

        // ── 12. Edge glow (colored soft border) ──
        g.roundRect(p + 1, p + 1, inner - 2, inner - 2, r - 1)
         .stroke({ width: 1, color: color.glow, alpha: 0.12 });

        // ── 13. Outer glass rim (bright top-left, dark bottom-right) ──
        g.roundRect(p + 1, p + 1, inner - 2, inner - 2, r - 1)
         .stroke({ width: 0.5, color: color.light, alpha: 0.2 });

        const tex = this.app.renderer.generateTexture({
            target: g,
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            scaleMode: 'linear',
        });
        tex._blockpangGenerated = true;
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
                this.fitCellSprite(sprite, gr, gc);
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

    // ── Row/Col completion hints (pooled Graphics, animated glow) ──
    _getHintGfx(index) {
        if (index < this._hintPool.length) {
            return this._hintPool[index];
        }
        const g = new PIXI.Graphics();
        this._hintPool.push(g);
        return g;
    }

    showCompletionHints() {
        if (!this.hintContainer) return;
        const cs = this.cellSize;
        const total = cs * GRID_SIZE;
        let nearCompleteFound = false;
        let hintIdx = 0;

        // Check rows
        for (let r = 0; r < GRID_SIZE; r++) {
            let empty = 0;
            for (let c = 0; c < GRID_SIZE; c++) {
                if (this.grid[r][c] === -1) empty++;
            }
            if (empty > 0 && empty <= 3) {
                const g = this._getHintGfx(hintIdx);
                g.clear();
                const intensity = (4 - empty) * 0.06;
                const color = empty === 1 ? THEME.accent : THEME.accentSoft;

                g.rect(0, r * cs, total, cs).fill({ color, alpha: intensity });
                g.moveTo(0, r * cs).lineTo(total, r * cs).stroke({ width: 1, color, alpha: intensity * 2 });
                g.moveTo(0, (r + 1) * cs).lineTo(total, (r + 1) * cs).stroke({ width: 1, color, alpha: intensity * 2 });

                g.visible = true;
                if (!g.parent) {
                    this.hintContainer.addChild(g);
                }
                hintIdx++;
                if (empty <= 2) nearCompleteFound = true;
            }
        }

        // Check cols
        for (let c = 0; c < GRID_SIZE; c++) {
            let empty = 0;
            for (let r = 0; r < GRID_SIZE; r++) {
                if (this.grid[r][c] === -1) empty++;
            }
            if (empty > 0 && empty <= 3) {
                const g = this._getHintGfx(hintIdx);
                g.clear();
                const intensity = (4 - empty) * 0.06;
                const color = empty === 1 ? THEME.accent : THEME.accentSoft;

                g.rect(c * cs, 0, cs, total).fill({ color, alpha: intensity });
                g.moveTo(c * cs, 0).lineTo(c * cs, total).stroke({ width: 1, color, alpha: intensity * 2 });
                g.moveTo((c + 1) * cs, 0).lineTo((c + 1) * cs, total).stroke({ width: 1, color, alpha: intensity * 2 });

                g.visible = true;
                if (!g.parent) {
                    this.hintContainer.addChild(g);
                }
                hintIdx++;
                if (empty <= 2) nearCompleteFound = true;
            }
        }

        // Hide unused pooled hint graphics
        for (let i = hintIdx; i < this._hintActiveCount; i++) {
            if (i < this._hintPool.length) {
                this._hintPool[i].visible = false;
            }
        }
        this._hintActiveCount = hintIdx;

        // Pulse animation for hint container (kill previous before starting new)
        if (nearCompleteFound && !this._hintPulseActive) {
            this._hintPulseActive = true;
            // Tag the tween so we can find and kill it later
            const hintRef = this.hintContainer;
            const tween = {
                elapsed: 0,
                duration: 99999,
                _isHintPulse: true,
                update(dt) {
                    if (!hintRef || hintRef.destroyed) {
                        return true;
                    }
                    // Check if any hints are visible
                    let anyVisible = false;
                    for (let i = 0; i < hintRef.children.length; i++) {
                        if (hintRef.children[i].visible) { anyVisible = true; break; }
                    }
                    if (!anyVisible) return true;
                    this.elapsed += dt;
                    const pulse = 0.6 + Math.sin(this.elapsed * 0.006) * 0.4;
                    hintRef.alpha = pulse;
                    return false;
                }
            };
            this.game.effects.tweens.push(tween);
        }
    }

    clearCompletionHints() {
        for (let i = 0; i < this._hintPool.length; i++) {
            if (this._hintPool[i]) this._hintPool[i].visible = false;
        }
        this._hintActiveCount = 0;
        if (this.hintContainer) {
            this.hintContainer.alpha = 1;
        }
        // Kill the hint pulse tween
        if (this._hintPulseActive) {
            this._hintPulseActive = false;
            const tweens = this.game.effects.tweens;
            for (let i = tweens.length - 1; i >= 0; i--) {
                if (tweens[i]._isHintPulse) {
                    tweens.splice(i, 1);
                }
            }
        }
    }

    // ── Ghost Preview (pooled Graphics, no create/destroy per move) ──
    _getGhostGfx(index) {
        if (index < this._ghostPool.length) {
            return this._ghostPool[index];
        }
        const g = new PIXI.Graphics();
        this._ghostPool.push(g);
        return g;
    }

    showGhost(shape, gridX, gridY, isValid) {
        if (!this.ghostContainer) return;
        const cs = this.cellSize;
        const color = isValid ? THEME.secondary : THEME.rose;
        const alpha = isValid ? 0.35 : 0.2;
        const r = Math.max(2, cs * 0.1);

        let idx = 0;
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (!shape[row][col]) continue;
                const x = (gridX + col) * cs;
                const y = (gridY + row) * cs;

                const g = this._getGhostGfx(idx);
                g.clear();

                // Soft outer glow
                g.roundRect(x - 1, y - 1, cs + 2, cs + 2, r + 1)
                 .fill({ color, alpha: alpha * 0.15 });

                // Filled ghost cell
                g.roundRect(x + 1, y + 1, cs - 2, cs - 2, r)
                 .fill({ color, alpha });

                // Glass highlight (top)
                if (isValid) {
                    g.roundRect(x + 3, y + 2, cs - 6, (cs - 4) * 0.3, r - 1)
                     .fill({ color: 0xFFFFFF, alpha: 0.15 });
                }

                // Border with glow effect
                g.roundRect(x + 1, y + 1, cs - 2, cs - 2, r)
                 .stroke({ width: 1.5, color, alpha: alpha + 0.35 });

                // Inner bright rim (glass edge)
                if (isValid) {
                    g.roundRect(x + 2, y + 2, cs - 4, cs - 4, r - 1)
                     .stroke({ width: 0.5, color: 0xFFFFFF, alpha: 0.1 });
                }

                g.visible = true;
                if (!g.parent) {
                    this.ghostContainer.addChild(g);
                }
                idx++;
            }
        }

        // Hide unused pooled ghost graphics
        for (let i = idx; i < this._ghostActiveCount; i++) {
            if (i < this._ghostPool.length) {
                this._ghostPool[i].visible = false;
            }
        }
        this._ghostActiveCount = idx;

        // Show completion hints when ghost is valid
        if (isValid) {
            this.showCompletionHints();
        } else {
            this.clearCompletionHints();
        }
    }

    clearGhost() {
        for (let i = 0; i < this._ghostPool.length; i++) {
            if (this._ghostPool[i]) this._ghostPool[i].visible = false;
        }
        this._ghostActiveCount = 0;
        this.clearCompletionHints();
    }

    clearTransientOverlays() {
        this.clearGhost();
        this.clearCompletionHints();
        if (this.ghostContainer) {
            this.ghostContainer.removeChildren();
        }
        if (this.hintContainer) {
            this.hintContainer.removeChildren();
            this.hintContainer.alpha = 1;
        }
        this._ghostActiveCount = 0;
        this._hintActiveCount = 0;
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

    destroy() {
        if (this._borderTickerFn) {
            this.app.ticker.remove(this._borderTickerFn);
            this._borderTickerFn = null;
        }
        this.cellTextures.forEach(t => {
            if (t && t._blockpangGenerated) t.destroy(true);
        });
        this.cellTextures = [];
        if (this.emptyTexture) {
            if (this.emptyTexture._blockpangGenerated) this.emptyTexture.destroy(true);
            this.emptyTexture = null;
        }
        this._ghostPool = [];
        this._hintPool = [];
        if (this.container && !this.container.destroyed) {
            this.container.destroy({ children: true });
        }
    }

    getGlobalPosition() {
        if (!this.container || this.container.destroyed) {
            return { x: 0, y: 0 };
        }
        return this.container.getGlobalPosition();
    }
}
