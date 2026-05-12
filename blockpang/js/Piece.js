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

function createPieceContainer(piece, cellSize, alpha = 1, options = {}) {
    const container = new PIXI.Container();
    const color = BLOCK_COLORS[piece.colorIndex];
    const tileTexture = getBlockpangTexture(`blockTile${piece.colorIndex}`);
    const tileScale = options.tileScale ?? 0.92;
    const r = Math.max(1, cellSize * 0.12);
    const p = 2;
    const inner = cellSize - p * 2;

    for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
            if (!piece.shape[row][col]) continue;
            if (tileTexture) {
                const sprite = new PIXI.Sprite(tileTexture);
                const visualSize = cellSize * tileScale;
                const textureSize = Math.max(tileTexture.width || 1, tileTexture.height || 1);
                const scale = visualSize / textureSize;
                sprite.scale.set(scale);
                sprite.position.set(
                    col * cellSize + (cellSize - visualSize) / 2,
                    row * cellSize + (cellSize - visualSize) / 2
                );
                sprite.alpha = alpha;
                sprite.eventMode = 'none';
                container.addChild(sprite);
                continue;
            }

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

    destroy() {
        this.game.app.ticker.remove(this._updateIdle, this);
        this._clearTrayTweens();
        this.slotContainers.forEach(c => { if (c && !c.destroyed) c.destroy({ children: true }); });
        this.slotContainers = [null, null, null];
        if (this.trayBg && !this.trayBg.destroyed) {
            this.trayBg.destroy();
            this.trayBg = null;
        }
        if (this.container && !this.container.destroyed) {
            this.container.destroy({ children: true });
        }
    }

    _updateIdle(ticker) {
        const delta = ticker.deltaTime;
        this._idleTime += delta * (1000 / 60) * 0.002;
        for (let i = 0; i < 3; i++) {
            const cont = this.slotContainers[i];
            const scale = cont && cont.scale;
            if (!cont || !cont.visible || cont.destroyed || !scale || typeof scale.set !== 'function') continue;
            // Gentle floating bob
            const phase = this._idleTime + i * 2.1;
            const bobY = Math.sin(phase) * 3;
            const bobScale = 1 + Math.sin(phase * 1.3) * 0.015;
            cont.y = this._slotBaseY[i] + bobY;
            scale.set(bobScale);
        }
    }

    _clearTrayTweens(slotIndex = null) {
        const effects = this.game && this.game.effects;
        if (!effects || !Array.isArray(effects.tweens) || effects.tweens.length === 0) return;

        effects.tweens = effects.tweens.filter((tween) => {
            if (!tween || !tween._isTraySlotTween) return true;
            if (slotIndex !== null && tween._traySlotIndex !== slotIndex) return true;
            return false;
        });
    }

    resize(cellSize, areaWidth, areaHeight, x, y) {
        this.container.position.set(x, y);

        // Calculate tray cell size so pieces fit nicely
        const slotWidth = areaWidth / 3;
        const maxDim = 5;
        const compact = areaWidth < 520;
        this.trayCellSize = Math.min(
            (slotWidth * (compact ? 0.84 : 0.72)) / maxDim,
            (areaHeight * 0.78) / maxDim,
            cellSize * (compact ? 0.86 : 0.82)
        );

        // Slot center positions
        this.slotPositions = [];
        for (let i = 0; i < 3; i++) {
            this.slotPositions.push({
                x: slotWidth * (i + 0.5),
                y: areaHeight * (compact ? 0.43 : 0.45),
            });
        }

        // Tray background
        this._drawTrayBg(areaWidth, areaHeight);

        this._rebuildSlotVisuals();
    }

    _drawTrayBg(w, h) {
        if (this.trayBg) {
            this.trayBg.destroy({ children: true });
        }
        const root = new PIXI.Container();
        const panelTexture = getBlockpangTexture('glassPanelFill') || getBlockpangTexture('glassPanel');
        const panelW = Math.max(1, w - 20);
        const panelH = Math.max(1, h - 8);

        const shadow = new PIXI.Graphics();
        shadow.roundRect(10, 6, panelW, panelH, 18)
         .fill({ color: THEME.shadow, alpha: 0.34 });
        root.addChild(shadow);

        if (panelTexture) {
            const panel = new PIXI.Sprite(panelTexture);
            panel.position.set(10, 2);
            panel.width = panelW;
            panel.height = panelH;
            panel.alpha = 0.68;
            root.addChild(panel);
        } else {
            const fallback = new PIXI.Graphics();
            fallback.roundRect(10, 2, panelW, panelH, 14)
             .fill({ color: THEME.surface });
            root.addChild(fallback);
        }

        const matte = new PIXI.Graphics();
        matte.roundRect(18, 16, Math.max(1, panelW - 16), Math.max(1, panelH - 28), 12)
             .fill({ color: 0x06142F, alpha: 0.34 });
        root.addChild(matte);

        const slotW = w / 3;
        for (let i = 0; i < 3; i++) {
            const slotX = slotW * i + slotW * 0.15;
            const slotY = Math.max(22, panelH * 0.33);
            const slotGlowW = slotW * 0.7;
            const slotGlowH = Math.max(28, panelH * 0.14);
            matte.roundRect(slotX, slotY, slotGlowW, slotGlowH, slotGlowH / 2)
                 .fill({ color: THEME.secondary, alpha: 0.032 });
        }

        const border = new PIXI.Graphics();
        border.roundRect(10, 2, panelW, panelH, 14)
         .stroke({ width: 1.2, color: THEME.divider, alpha: 0.42 });
        border.roundRect(16, 7, Math.max(1, panelW - 12), 3, 2)
         .fill({ color: THEME.secondary, alpha: 0.14 });
        root.addChild(border);

        this.trayBg = root;
        this.container.addChildAt(root, 0);
    }

    setPieces(pieces) {
        this.slots = pieces;
        this._rebuildSlotVisuals(true);
    }

    removePiece(index) {
        this.slots[index] = null;
        this._clearTrayTweens(index);
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
        this._clearTrayTweens();
        this.slotContainers.forEach(c => { if (c) c.destroy({ children: true }); });
        this.slotContainers = [null, null, null];

        for (let i = 0; i < 3; i++) {
            if (!this.slots[i] || this.slotPositions.length === 0) continue;
            const piece = this.slots[i];
            const cs = this.trayCellSize;
            const cont = createPieceContainer(piece, cs);
            const trayRef = this;
            const canPlacePiece = this.game.board && this.game.board.canPlaceAnywhere(piece.shape);
            const slotTexture = getBlockpangTexture(canPlacePiece ? 'slotPadIdle' : 'slotPadDisabled');

            // Center in slot
            const pw = piece.cols * cs;
            const ph = piece.rows * cs;
            const targetX = this.slotPositions[i].x - pw / 2;
            const targetY = this.slotPositions[i].y - ph / 2;
            cont.position.set(targetX, targetY);
            this._slotBaseY[i] = targetY;

            if (slotTexture) {
                const slotPad = new PIXI.Sprite(slotTexture);
                slotPad.anchor.set(0.5);
                slotPad.eventMode = 'none';
                slotPad.alpha = canPlacePiece ? 0.92 : 0.72;
                slotPad.width = Math.max(pw * 1.9, cs * 3.3);
                slotPad.height = Math.max(ph * 1.15, cs * 1.55);
                slotPad.position.set(pw / 2, ph / 2 + cs * 0.14);
                slotPad._slotCanPlace = canPlacePiece;
                cont.addChildAt(slotPad, 0);
                cont._slotPadSprite = slotPad;
            }

            // Interactive — 터치 영역을 넉넉하게 확보 (모바일 대응)
            const padX = Math.max(24, pw * 0.4);
            const padY = Math.max(24, ph * 0.4);
            cont.eventMode = 'static';
            cont.cursor = 'pointer';
            cont.hitArea = new PIXI.Rectangle(-padX, -padY, pw + padX * 2, ph + padY * 2);

            const slotIdx = i;
            cont.on('pointerover', () => {
                const pad = cont._slotPadSprite;
                if (!pad || !pad._slotCanPlace) return;
                const tex = getBlockpangTexture('slotPadActive');
                if (tex) pad.texture = tex;
                pad.alpha = 1;
            });
            cont.on('pointerout', () => {
                const pad = cont._slotPadSprite;
                if (!pad) return;
                const tex = getBlockpangTexture(pad._slotCanPlace ? 'slotPadIdle' : 'slotPadDisabled');
                if (tex) pad.texture = tex;
                pad.alpha = pad._slotCanPlace ? 0.92 : 0.72;
            });
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
                        _isTraySlotTween: true,
                        _traySlotIndex: i,
                        update(dt) {
                            const scale = cont && cont.scale;
                            if (!cont || cont.destroyed || !scale || typeof scale.set !== 'function') return true;
                            if (trayRef.slotContainers[slotIdx] !== cont) return true;
                            if (this.delay > 0) { this.delay -= dt; return false; }
                            this.elapsed += dt;
                            const t = Math.min(this.elapsed / this.duration, 1);
                            cont.alpha = easeOutCubic(t);
                            scale.set(easeOutBack(t));
                            cont.y = targetY + 30 * (1 - easeOutCubic(t));
                            return t >= 1;
                        }
                    });
                }
            }
        }
    }

    getSlotGlobalCenter(index) {
        if (index < 0 || index >= this.slotPositions.length) return { x: 0, y: 0 };
        const local = this.slotPositions[index];
        return this.container.toGlobal(new PIXI.Point(local.x, local.y));
    }
}
