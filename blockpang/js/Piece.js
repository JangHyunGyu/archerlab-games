// ─── Piece Utilities ───

function generateRandomPiece(level = 99) {
    // 현재 레벨에 맞는 최대 tier 결정
    const maxTier = LEVEL_MAX_TIER[Math.min(level, LEVEL_MAX_TIER.length - 1)];
    const available = PIECE_SHAPES.filter(p => (p.tier || 1) <= maxTier);

    // Weighted random (레벨에 맞는 피스만)
    const totalWeight = available.reduce((s, p) => s + p.weight, 0);
    let roll = Math.random() * totalWeight;
    let chosen = available[0];
    for (const def of available) {
        roll -= def.weight;
        if (roll <= 0) { chosen = def; break; }
    }
    const colorIndex = Math.floor(Math.random() * BLOCK_COLORS.length);
    const shape = chosen.shape;
    let cellCount = 0;
    shape.forEach(row => row.forEach(v => { if (v) cellCount++; }));

    return {
        shape,
        colorIndex,
        rows: shape.length,
        cols: shape[0].length,
        cellCount,
    };
}

function createPieceContainer(piece, cellSize, alpha = 1) {
    const container = new PIXI.Container();
    const color = BLOCK_COLORS[piece.colorIndex];
    const r = Math.max(1, cellSize * 0.12);
    const p = 2;
    const inner = cellSize - p * 2;

    for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
            if (!piece.shape[row][col]) continue;
            const g = new PIXI.Graphics();

            // 1. Drop shadow
            g.roundRect(p + 1, p + 1, inner, inner, r)
             .fill({ color: 0x000000, alpha: 0.35 * alpha });

            // 2. Dark base (bevel edge)
            g.roundRect(p, p, inner, inner, r)
             .fill({ color: color.dark, alpha: 0.95 * alpha });

            // 3. Main body
            g.roundRect(p + 1, p + 1, inner - 2, inner - 2, r - 1)
             .fill({ color: color.main, alpha });

            // 4. Bottom-half darken (3D curvature)
            g.roundRect(p + 2, p + inner * 0.5, inner - 4, inner * 0.47, r - 2)
             .fill({ color: color.dark, alpha: 0.25 * alpha });

            // 5. Left-edge bevel highlight
            g.roundRect(p + 1, p + 2, 2, inner - 6, r - 1)
             .fill({ color: color.light, alpha: 0.3 * alpha });

            // 6. Top-edge bevel highlight
            g.roundRect(p + 2, p + 1, inner - 6, 2, r - 1)
             .fill({ color: color.light, alpha: 0.35 * alpha });

            // 7. Glass reflection (top 35%)
            g.roundRect(p + 3, p + 2, inner - 6, inner * 0.35, r - 1)
             .fill({ color: color.light, alpha: 0.5 * alpha });

            // 8. Glass gloss (bright band)
            g.roundRect(p + 4, p + 2, inner - 8, inner * 0.15, r - 2)
             .fill({ color: 0xFFFFFF, alpha: 0.35 * alpha });

            // 9. Specular dot
            g.roundRect(p + 5, p + 3, inner * 0.15, inner * 0.06, 2)
             .fill({ color: 0xFFFFFF, alpha: 0.55 * alpha });

            // 10. Secondary reflection
            g.roundRect(p + inner * 0.3, p + inner * 0.6, inner * 0.4, inner * 0.08, 2)
             .fill({ color: color.light, alpha: 0.12 * alpha });

            // 11. Bottom-right inner shadow
            g.roundRect(p + inner * 0.6, p + inner * 0.75, inner * 0.35, inner * 0.2, r - 2)
             .fill({ color: 0x000000, alpha: 0.08 * alpha });

            // 12. Edge glow
            g.roundRect(p + 1, p + 1, inner - 2, inner - 2, r - 1)
             .stroke({ width: 1, color: color.glow, alpha: 0.12 * alpha });

            // 13. Outer glass rim
            g.roundRect(p + 1, p + 1, inner - 2, inner - 2, r - 1)
             .stroke({ width: 0.5, color: color.light, alpha: 0.2 * alpha });

            g.position.set(col * cellSize, row * cellSize);
            container.addChild(g);
        }
    }
    return container;
}

// ─── Piece Tray ───
class PieceTray {
    constructor(game) {
        this.game = game;
        this.container = new PIXI.Container();
        this.slots = [null, null, null]; // piece data
        this.slotContainers = [null, null, null]; // PIXI containers
        this.slotPositions = []; // {x, y} for each slot center
        this.trayCellSize = 0;
        this._idleTime = 0;
        this._slotBaseY = [0, 0, 0]; // saved base Y for idle float

        // Tray background
        this.trayBg = null;

        // Idle floating animation ticker
        game.app.ticker.add(this._updateIdle, this);
    }

    _updateIdle(ticker) {
        const delta = ticker.deltaTime;
        this._idleTime += delta * (1000 / 60) * 0.002;
        for (let i = 0; i < 3; i++) {
            const cont = this.slotContainers[i];
            if (!cont || !cont.visible || cont.destroyed) continue;
            // Gentle floating bob
            const phase = this._idleTime + i * 2.1;
            const bobY = Math.sin(phase) * 3;
            const bobScale = 1 + Math.sin(phase * 1.3) * 0.015;
            cont.y = this._slotBaseY[i] + bobY;
            cont.scale.set(bobScale);
        }
    }

    resize(cellSize, areaWidth, areaHeight, x, y) {
        this.container.position.set(x, y);

        // Calculate tray cell size so pieces fit nicely
        const slotWidth = areaWidth / 3;
        const maxDim = 5;
        this.trayCellSize = Math.min(
            (slotWidth * 0.7) / maxDim,
            (areaHeight * 0.7) / maxDim,
            cellSize * 0.65
        );

        // Slot center positions
        this.slotPositions = [];
        for (let i = 0; i < 3; i++) {
            this.slotPositions.push({
                x: slotWidth * (i + 0.5),
                y: areaHeight * 0.45,
            });
        }

        // Tray background
        this._drawTrayBg(areaWidth, areaHeight);

        this._rebuildSlotVisuals();
    }

    _drawTrayBg(w, h) {
        if (this.trayBg) {
            this.trayBg.destroy();
        }
        const g = new PIXI.Graphics();

        // Outer glow
        g.roundRect(6, -4, w - 12, h + 2, 16)
         .fill({ color: 0x2244aa, alpha: 0.04 });

        // Main glass panel
        g.roundRect(10, 0, w - 20, h - 5, 12)
         .fill({ color: 0x080828, alpha: 0.6 });

        // Glass top highlight
        g.roundRect(12, 1, w - 24, (h - 5) * 0.2, 11)
         .fill({ color: 0x1a1a55, alpha: 0.2 });

        // Neon top border glow (layered)
        g.moveTo(40, 0).lineTo(w - 40, 0)
         .stroke({ width: 2, color: 0x3355cc, alpha: 0.25 });
        g.moveTo(60, -1).lineTo(w - 60, -1)
         .stroke({ width: 1, color: 0x00E5FF, alpha: 0.1 });

        // Side borders (subtle)
        g.moveTo(10, 8).lineTo(10, h - 12)
         .stroke({ width: 0.5, color: 0x3355cc, alpha: 0.1 });
        g.moveTo(w - 10, 8).lineTo(w - 10, h - 12)
         .stroke({ width: 0.5, color: 0x3355cc, alpha: 0.1 });

        // Glass rim border
        g.roundRect(10, 0, w - 20, h - 5, 12)
         .stroke({ width: 1, color: 0x3355cc, alpha: 0.15 });

        this.trayBg = g;
        this.container.addChildAt(g, 0);
    }

    setPieces(pieces) {
        this.slots = pieces;
        this._rebuildSlotVisuals(true);
    }

    removePiece(index) {
        this.slots[index] = null;
        if (this.slotContainers[index]) {
            this.slotContainers[index].destroy({ children: true });
            this.slotContainers[index] = null;
        }
    }

    hidePiece(index) {
        if (this.slotContainers[index]) {
            this.slotContainers[index].visible = false;
        }
    }

    showPiece(index) {
        if (this.slotContainers[index]) {
            this.slotContainers[index].visible = true;
        }
    }

    allPlaced() {
        return this.slots.every(s => s === null);
    }

    _rebuildSlotVisuals(animate = false) {
        // Remove old
        this.slotContainers.forEach(c => { if (c) c.destroy({ children: true }); });
        this.slotContainers = [null, null, null];

        for (let i = 0; i < 3; i++) {
            if (!this.slots[i] || this.slotPositions.length === 0) continue;
            const piece = this.slots[i];
            const cs = this.trayCellSize;
            const cont = createPieceContainer(piece, cs);

            // Center in slot
            const pw = piece.cols * cs;
            const ph = piece.rows * cs;
            const targetX = this.slotPositions[i].x - pw / 2;
            const targetY = this.slotPositions[i].y - ph / 2;
            cont.position.set(targetX, targetY);
            this._slotBaseY[i] = targetY;

            // Interactive — 터치 영역을 넉넉하게 확보 (모바일 대응)
            const padX = Math.max(24, pw * 0.4);
            const padY = Math.max(24, ph * 0.4);
            cont.eventMode = 'static';
            cont.cursor = 'pointer';
            cont.hitArea = new PIXI.Rectangle(-padX, -padY, pw + padX * 2, ph + padY * 2);

            // 터치 영역 시각적 표시 (연한 테두리)
            const touchBorder = new PIXI.Graphics();
            touchBorder.roundRect(-padX, -padY, pw + padX * 2, ph + padY * 2, 8)
                       .stroke({ width: 1, color: 0x4466aa, alpha: 0.25 });
            cont.addChildAt(touchBorder, 0);
            cont._touchBorder = touchBorder;

            const slotIdx = i;
            cont.on('pointerdown', (e) => {
                // 터치 시 테두리 제거
                if (cont._touchBorder && !cont._touchBorder.destroyed) {
                    cont._touchBorder.destroy();
                    cont._touchBorder = null;
                }
                if (this.game.input) {
                    this.game.input.startDrag(slotIdx, e);
                }
            });

            this.container.addChild(cont);
            this.slotContainers[i] = cont;

            // Entrance animation
            if (animate) {
                cont.alpha = 0;
                cont.scale.set(0.3);
                cont.y = targetY + 30;
                const effects = this.game.effects;
                if (effects) {
                    effects.tweens.push({
                        elapsed: 0,
                        duration: 400,
                        delay: i * 80,
                        update(dt) {
                            if (this.delay > 0) { this.delay -= dt; return false; }
                            this.elapsed += dt;
                            const t = Math.min(this.elapsed / this.duration, 1);
                            cont.alpha = easeOutCubic(t);
                            cont.scale.set(easeOutBack(t));
                            cont.y = targetY + 30 * (1 - easeOutCubic(t));
                            return t >= 1;
                        }
                    });
                }
            }
        }
    }

    getSlotGlobalCenter(index) {
        if (this.slotPositions.length === 0) return { x: 0, y: 0 };
        const local = this.slotPositions[index];
        return this.container.toGlobal(new PIXI.Point(local.x, local.y));
    }
}
