// ─── Piece Utilities ───

function generateRandomPiece() {
    // Weighted random
    const totalWeight = PIECE_SHAPES.reduce((s, p) => s + p.weight, 0);
    let roll = Math.random() * totalWeight;
    let chosen = PIECE_SHAPES[0];
    for (const def of PIECE_SHAPES) {
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
    const p = 2; // Padding inside cell bounds

    for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
            if (!piece.shape[row][col]) continue;
            const g = new PIXI.Graphics();

            // Shadow (bottom-right)
            g.beginFill(color.dark, alpha * 0.9);
            g.drawRoundedRect(p, p, cellSize - p * 2, cellSize - p * 2, r);
            g.endFill();

            // Main body
            g.beginFill(color.main, alpha);
            g.drawRoundedRect(p + 1, p, cellSize - p * 2 - 2, cellSize - p * 2 - 2, r - 1);
            g.endFill();

            // Bottom gradient for depth
            g.beginFill(color.dark, 0.18 * alpha);
            g.drawRoundedRect(p + 2, p + (cellSize - p * 2) * 0.5, cellSize - p * 2 - 4, (cellSize - p * 2) * 0.48, r - 2);
            g.endFill();

            // Top highlight (glass-like)
            g.beginFill(color.light, 0.55 * alpha);
            g.drawRoundedRect(p + 2, p + 1, cellSize - p * 2 - 4, (cellSize - p * 2) * 0.3, r - 1);
            g.endFill();

            // Specular highlight
            g.beginFill(0xFFFFFF, 0.35 * alpha);
            g.drawRoundedRect(p + 4, p + 2, (cellSize - p * 2) * 0.2, (cellSize - p * 2) * 0.07, 1);
            g.endFill();

            // Inner border
            g.lineStyle(0.5, color.light, 0.15 * alpha);
            g.drawRoundedRect(p + 1, p + 1, cellSize - p * 2 - 2, cellSize - p * 2 - 2, r - 1);
            g.lineStyle(0);

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

    _updateIdle(delta) {
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

        // Subtle dark panel
        g.beginFill(0x080825, 0.5);
        g.drawRoundedRect(10, 0, w - 20, h - 5, 12);
        g.endFill();

        // Top border glow
        g.lineStyle(1, 0x3355cc, 0.2);
        g.moveTo(30, 0);
        g.lineTo(w - 30, 0);
        g.lineStyle(0);

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

            // Interactive
            cont.eventMode = 'static';
            cont.cursor = 'pointer';
            cont.hitArea = new PIXI.Rectangle(-10, -10, pw + 20, ph + 20);

            const slotIdx = i;
            cont.on('pointerdown', (e) => {
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
