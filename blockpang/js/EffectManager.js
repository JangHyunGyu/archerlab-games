class EffectManager {
    constructor(game) {
        this.game = game;
        this.container = new PIXI.Container();
        this.particles = [];
        this.tweens = [];
        this.shakeOffset = { x: 0, y: 0 };
        this.shakeTime = 0;
        this.shakeDuration = 0;
        this.shakeIntensity = 0;
        this._time = 0;

        // ── Particle Graphics pool ──
        this._particlePool = [];
        this._POOL_MAX = 400;

        // ── Text object pool for score/combo/bonus popups ──
        this._textPool = [];
        this._TEXT_POOL_MAX = 20;

        game.app.ticker.add(this.update, this);
    }

    // Get a Graphics object from pool or create new
    _getParticleGfx() {
        while (this._particlePool.length > 0) {
            const gfx = this._particlePool.pop();
            if (gfx.destroyed) continue;
            gfx.clear();
            gfx.visible = true;
            gfx.alpha = 1;
            gfx.scale.set(1);
            gfx.rotation = 0;
            gfx.position.set(0, 0);
            return gfx;
        }
        return new PIXI.Graphics();
    }

    // Return a Graphics object to pool
    _releaseParticleGfx(gfx) {
        if (gfx.destroyed) return;
        gfx.visible = false;
        if (gfx.parent) gfx.parent.removeChild(gfx);
        if (this._particlePool.length < this._POOL_MAX) {
            this._particlePool.push(gfx);
        } else {
            gfx.destroy();
        }
    }

    // Get a Text object from pool or create new
    _getTextObj(text, style) {
        if (this._textPool.length > 0) {
            const txt = this._textPool.pop();
            txt.text = text;
            Object.assign(txt.style, style);
            txt.visible = true;
            txt.alpha = 1;
            txt.scale.set(1);
            txt.rotation = 0;
            txt.tint = 0xFFFFFF;
            return txt;
        }
        return new PIXI.Text({ text, style });
    }

    // Return a Text object to pool
    _releaseTextObj(txt) {
        if (txt.destroyed) return;
        txt.visible = false;
        if (txt.parent) txt.parent.removeChild(txt);
        if (this._textPool.length < this._TEXT_POOL_MAX) {
            this._textPool.push(txt);
        } else {
            txt.destroy();
        }
    }

    update(ticker) {
        const delta = ticker.deltaTime;
        const dt = delta * (1000 / 60);
        this._time += dt;

        // ── Particles ──
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this._releaseParticleGfx(p.gfx);
                this.particles.splice(i, 1);
                continue;
            }
            const t = 1 - p.life / p.maxLife;
            p.gfx.x += p.vx * delta;
            p.gfx.y += p.vy * delta;
            p.vy += (p.gravity || 0.15) * delta;
            p.gfx.alpha = p.fadeIn
                ? (t < 0.1 ? t * 10 : 1 - easeInOutQuad((t - 0.1) / 0.9))
                : 1 - easeInOutQuad(t);
            p.gfx.scale.set(p.baseScale * (1 - t * (p.shrink || 0.6)));
            p.gfx.rotation += (p.rotSpeed || 0) * delta;
        }

        // ── Tweens ──
        for (let i = this.tweens.length - 1; i >= 0; i--) {
            try {
                if (this.tweens[i].update(dt)) {
                    this.tweens.splice(i, 1);
                }
            } catch (e) {
                const removedTween = this.tweens[i];
                this.tweens.splice(i, 1);
                // Flash effect tween이 에러로 죽으면 콜백 보장
                if (removedTween && removedTween._flashCallback) {
                    try { removedTween._flashCallback(); } catch (_) {}
                }
                if (window._sendGameError) {
                    window._sendGameError(
                        'TweenError',
                        e.message || String(e),
                        e.stack || '',
                        'EffectManager.js',
                        this.game.getErrorMetadata('effect-tween', {
                            tweenIndex: i,
                            hasFlashCallback: !!(removedTween && removedTween._flashCallback),
                            isHintPulse: !!(removedTween && removedTween._isHintPulse),
                        })
                    );
                }
            }
        }

        // ── Screen Shake ──
        if (this.shakeTime > 0) {
            this.shakeTime -= dt;
            const t = this.shakeTime / this.shakeDuration;
            const intensity = this.shakeIntensity * t;
            this.shakeOffset.x = (Math.random() - 0.5) * 2 * intensity;
            this.shakeOffset.y = (Math.random() - 0.5) * 2 * intensity;
            if (this.game.gameContainer) {
                this.game.gameContainer.x = this.shakeOffset.x;
                this.game.gameContainer.y = this.shakeOffset.y;
            }
        } else if (this.shakeOffset.x !== 0 || this.shakeOffset.y !== 0) {
            this.shakeOffset.x = 0;
            this.shakeOffset.y = 0;
            if (this.game.gameContainer) {
                this.game.gameContainer.x = 0;
                this.game.gameContainer.y = 0;
            }
        }
    }

    // ── Spawn particles from a world position (EXPLOSIVE version) ──
    spawnCellParticles(worldX, worldY, color, count = 8) {
        const cellSize = this.game.cellSize;
        const cx = worldX + cellSize / 2;
        const cy = worldY + cellSize / 2;

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 1.2;
            const speed = 3 + Math.random() * 6;
            const size = 2 + Math.random() * (cellSize * 0.22);

            const gfx = this._getParticleGfx();

            // Outer glow (bigger, more vibrant)
            gfx.circle(0, 0, size * 2.0).fill({ color, alpha: 0.25 });
            // Main particle (slightly larger)
            gfx.roundRect(-size / 2, -size / 2, size, size, size * 0.3).fill({ color });
            // Bright white-hot center
            gfx.circle(0, 0, size * 0.35).fill({ color: 0xFFFFFF, alpha: 0.85 });

            gfx.position.set(cx, cy);
            this.container.addChild(gfx);

            this.particles.push({
                gfx,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 3.5,
                rotSpeed: (Math.random() - 0.5) * 0.35,
                gravity: 0.14,
                baseScale: 0.9 + Math.random() * 0.5,
                shrink: 0.65,
                life: 600 + Math.random() * 500,
                maxLife: 1100,
            });
        }

        // Extra ember particles (tiny, fast, many)
        const emberCount = Math.ceil(count * 0.6);
        for (let i = 0; i < emberCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 5 + Math.random() * 8;
            const size = 1 + Math.random() * 1.5;

            const gfx = this._getParticleGfx();
            gfx.circle(0, 0, size).fill({ color: 0xFFFFFF, alpha: 0.9 });
            gfx.circle(0, 0, size * 2.5).fill({ color, alpha: 0.3 });

            gfx.position.set(cx + (Math.random() - 0.5) * cellSize * 0.3,
                             cy + (Math.random() - 0.5) * cellSize * 0.3);
            this.container.addChild(gfx);

            this.particles.push({
                gfx,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                rotSpeed: 0,
                gravity: 0.06,
                baseScale: 0.6 + Math.random() * 0.5,
                shrink: 0.8,
                life: 300 + Math.random() * 400,
                maxLife: 700,
            });
        }
    }

    // ── Sparkle particles (floating upward, no gravity) ──
    spawnSparkles(worldX, worldY, color, count = 5) {
        for (let i = 0; i < count; i++) {
            const size = 1.5 + Math.random() * 3.5;
            const gfx = this._getParticleGfx();

            // Bright sparkle with outer glow
            gfx.circle(0, 0, size * 0.6).fill({ color: 0xFFFFFF, alpha: 0.9 });
            gfx.circle(0, 0, size * 1.5).fill({ color, alpha: 0.5 });
            gfx.circle(0, 0, size * 2.5).fill({ color, alpha: 0.15 });

            gfx.position.set(
                worldX + (Math.random() - 0.5) * 40,
                worldY + (Math.random() - 0.5) * 40
            );
            this.container.addChild(gfx);

            this.particles.push({
                gfx,
                vx: (Math.random() - 0.5) * 1.0,
                vy: -1.5 - Math.random() * 2.5,
                rotSpeed: 0,
                gravity: -0.03, // Float upward faster
                baseScale: 0.5 + Math.random() * 0.9,
                shrink: 0.45,
                fadeIn: true,
                life: 700 + Math.random() * 700,
                maxLife: 1400,
            });
        }
    }

    // ── Star-shaped burst particles (for high combos) ──
    spawnStarParticles(worldX, worldY, color, count = 10) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.6;
            const speed = 4 + Math.random() * 7;
            const size = 2.5 + Math.random() * 5;
            const gfx = this._getParticleGfx();

            // 4-pointed star shape with glow
            gfx.star(0, 0, 4, size * 1.8, size * 0.5).fill({ color, alpha: 0.2 });
            gfx.star(0, 0, 4, size, size * 0.4).fill({ color, alpha: 0.9 });
            gfx.circle(0, 0, size * 0.35).fill({ color: 0xFFFFFF, alpha: 0.9 });

            gfx.position.set(worldX, worldY);
            this.container.addChild(gfx);

            this.particles.push({
                gfx,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                rotSpeed: (Math.random() - 0.5) * 0.4,
                gravity: 0.04,
                baseScale: 0.9 + Math.random() * 0.7,
                shrink: 0.55,
                life: 700 + Math.random() * 600,
                maxLife: 1300,
            });
        }
    }

    // ── Line clear effect with EXPLOSIVE wave ──
    playClearEffect(clearedCells, boardGlobalPos) {
        const cellSize = this.game.cellSize;
        const lineCount = clearedCells.length > 0
            ? Math.max(1, Math.round(clearedCells.length / GRID_SIZE))
            : 1;

        // Sort cells for wave effect
        const sorted = [...clearedCells].sort((a, b) => (a.row + a.col) - (b.row + b.col));

        // Center of all cleared cells (for directional debris)
        let cx = 0, cy = 0;
        sorted.forEach(c => { cx += c.col; cy += c.row; });
        cx = boardGlobalPos.x + (cx / sorted.length) * cellSize + cellSize / 2;
        cy = boardGlobalPos.y + (cy / sorted.length) * cellSize + cellSize / 2;

        // Intensity multiplier based on line count
        const intensity = Math.min(lineCount, 4);

        sorted.forEach((cell, idx) => {
            const wx = boardGlobalPos.x + cell.col * cellSize;
            const wy = boardGlobalPos.y + cell.row * cellSize;
            const blockColor = BLOCK_COLORS[cell.colorIndex] || BLOCK_COLORS[0];
            const color = blockColor.particle || 0xFFFFFF;

            setTimeout(() => {
                // ── 1. Sparkle/glow particles (more with higher line count) ──
                this.spawnCellParticles(wx, wy, color, 6 + intensity * 3);

                // ── 2. Cell flash: bright white flash at cell position ──
                const cellCx = wx + cellSize / 2;
                const cellCy = wy + cellSize / 2;
                const flash = this._getParticleGfx();
                const flashSize = cellSize * (0.6 + intensity * 0.15);
                flash.circle(0, 0, flashSize).fill({ color: 0xFFFFFF, alpha: 0.7 });
                flash.circle(0, 0, flashSize * 0.5).fill({ color, alpha: 0.5 });
                flash.position.set(cellCx, cellCy);
                this.container.addChild(flash);
                this.particles.push({
                    gfx: flash,
                    vx: 0, vy: 0, rotSpeed: 0, gravity: 0,
                    baseScale: 0.5,
                    shrink: -1.5, // GROW then fade
                    life: 150 + intensity * 30,
                    maxLife: 150 + intensity * 30,
                });

                // ── 3. EXPLOSION DEBRIS: block shatters into many fragments ──
                const debrisCount = 4 + intensity * 3; // Much more debris!
                const dirX = cellCx - cx;
                const dirY = cellCy - cy;

                for (let d = 0; d < debrisCount; d++) {
                    const fragW = cellSize * (0.1 + Math.random() * 0.3);
                    const fragH = cellSize * (0.1 + Math.random() * 0.3);
                    const frag = this._getParticleGfx();

                    // Fragment with same block color
                    frag.roundRect(-fragW / 2, -fragH / 2, fragW, fragH, 1)
                        .fill({ color: blockColor.main });
                    // Bright edge highlight (sharper, more visible)
                    frag.roundRect(-fragW * 0.35, -fragH * 0.35, fragW * 0.7, fragH * 0.7, 1)
                        .fill({ color: blockColor.light || 0xFFFFFF, alpha: 0.6 });
                    // Hot white center
                    if (Math.random() < 0.4) {
                        frag.circle(0, 0, Math.min(fragW, fragH) * 0.2)
                            .fill({ color: 0xFFFFFF, alpha: 0.5 });
                    }

                    // Start from position within the cell
                    frag.position.set(
                        cellCx + (Math.random() - 0.5) * cellSize * 0.6,
                        cellCy + (Math.random() - 0.5) * cellSize * 0.6
                    );
                    this.container.addChild(frag);

                    // Velocity: EXPLOSIVE outward from center
                    const speedMul = 2.0 + intensity * 1.2;
                    const angle = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 2.2;
                    const speed = (4 + Math.random() * 6) * speedMul;

                    this.particles.push({
                        gfx: frag,
                        vx: Math.cos(angle) * speed * (0.7 + Math.random() * 0.6),
                        vy: Math.sin(angle) * speed * (0.7 + Math.random() * 0.6) - 4 - Math.random() * 3,
                        rotSpeed: (Math.random() - 0.5) * 0.6,
                        gravity: 0.2 + Math.random() * 0.1,
                        baseScale: 0.5 + Math.random() * 0.6,
                        shrink: 0.55,
                        life: 500 + Math.random() * 600,
                        maxLife: 1100,
                    });
                }

                // ── 4. Micro-debris dust cloud (tiny particles, lots) ──
                const dustCount = 3 + intensity * 2;
                for (let d = 0; d < dustCount; d++) {
                    const dust = this._getParticleGfx();
                    const dustSize = 1 + Math.random() * 2;
                    dust.circle(0, 0, dustSize).fill({ color: blockColor.light || color, alpha: 0.6 });
                    dust.position.set(
                        cellCx + (Math.random() - 0.5) * cellSize,
                        cellCy + (Math.random() - 0.5) * cellSize
                    );
                    this.container.addChild(dust);

                    const dAngle = Math.random() * Math.PI * 2;
                    const dSpeed = 1 + Math.random() * 3;
                    this.particles.push({
                        gfx: dust,
                        vx: Math.cos(dAngle) * dSpeed,
                        vy: Math.sin(dAngle) * dSpeed - 1,
                        rotSpeed: 0,
                        gravity: 0.03,
                        baseScale: 0.8 + Math.random() * 0.4,
                        shrink: 0.7,
                        fadeIn: true,
                        life: 400 + Math.random() * 500,
                        maxLife: 900,
                    });
                }
            }, idx * 10); // Slightly faster wave
        });

        // ── 5. Per-clear-size bonus effects ──
        if (intensity >= 2) {
            // Shockwave at center for 2+ lines
            setTimeout(() => {
                this.playShockwave(cx, cy, intensity);
            }, sorted.length * 5);
        }

        if (intensity >= 3) {
            // Extra sparkle shower for 3+ lines
            setTimeout(() => {
                this.spawnSparkles(cx, cy, 0xFFFFFF, 10 + intensity * 5);
            }, sorted.length * 8);
        }
    }

    // ── Place effect (scale bounce + glow pulse) ──
    playPlaceEffect(cellSprites) {
        cellSprites.forEach((sprite, idx) => {
            if (!sprite) return;
            sprite.scale.set(0.3);
            sprite.alpha = 0.6;
            this.tweens.push({
                elapsed: 0,
                duration: 350,
                delay: idx * 20,
                update(dt) {
                    if (!sprite || sprite.destroyed) return true;
                    if (this.delay > 0) { this.delay -= dt; return false; }
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    const s = easeOutElastic(t);
                    sprite.scale.set(s);
                    sprite.alpha = 0.6 + t * 0.4;
                    return t >= 1;
                }
            });
        });
    }

    // ── Flash effect with wave sweep ──
    playFlashEffect(cellSprites, onComplete) {
        let completed = 0;
        const total = cellSprites.length;
        let callbackFired = false;
        const fireCallback = () => {
            if (callbackFired) return;
            callbackFired = true;
            if (onComplete) onComplete();
        };

        if (total === 0) { fireCallback(); return; }

        // Safety: rAF가 throttle/pause되는 인앱 브라우저 대비 fallback
        setTimeout(fireCallback, 600);

        cellSprites.forEach((sprite, idx) => {
            if (!sprite || sprite.destroyed) {
                completed++;
                if (completed >= total) fireCallback();
                return;
            }
            const origTint = sprite.tint;
            this.tweens.push({
                elapsed: 0,
                duration: 400,
                delay: 0,
                _flashCallback: fireCallback,
                update(dt) {
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);

                    if (!sprite || sprite.destroyed) {
                        completed++;
                        if (completed >= total) fireCallback();
                        return true;
                    }

                    // Phase 1: bright flash (0-0.3)
                    // Phase 2: pulse (0.3-0.7)
                    // Phase 3: shrink out (0.7-1.0)
                    if (t < 0.3) {
                        const p = t / 0.3;
                        sprite.tint = 0xFFFFFF;
                        sprite.alpha = 1;
                        sprite.scale.set(1 + p * 0.1);
                    } else if (t < 0.7) {
                        const p = (t - 0.3) / 0.4;
                        const flash = Math.sin(p * Math.PI * 4) * 0.5 + 0.5;
                        sprite.tint = flash > 0.5 ? 0xFFFFFF : origTint;
                        sprite.alpha = 1;
                        sprite.scale.set(1.1 - p * 0.1);
                    } else {
                        const p = (t - 0.7) / 0.3;
                        sprite.tint = 0xFFFFFF;
                        sprite.alpha = 1 - easeOutCubic(p);
                        sprite.scale.set(1 - p * 0.3);
                    }

                    if (t >= 1) {
                        sprite.alpha = 1;
                        sprite.tint = origTint;
                        sprite.scale.set(1);
                        completed++;
                        if (completed >= total) fireCallback();
                        return true;
                    }
                    return false;
                }
            });
        });
    }

    // ── Line clear wave: glowing line that sweeps across ──
    playLineSweep(rows, cols, boardGlobalPos) {
        const cs = this.game.cellSize;
        const total = cs * GRID_SIZE;

        // Row sweeps (horizontal)
        const self = this;
        rows.forEach((row, ri) => {
            const g = self._getParticleGfx();
            g.rect(0, 0, 20, cs).fill({ color: 0xFFFFFF, alpha: 0.6 });
            g.rect(-10, 0, 40, cs).fill({ color: 0x44FF88, alpha: 0.3 });

            g.position.set(boardGlobalPos.x - 20, boardGlobalPos.y + row * cs);
            this.container.addChild(g);

            this.tweens.push({
                elapsed: 0,
                duration: 300,
                delay: ri * 60,
                update(dt) {
                    if (g.destroyed) return true;
                    if (this.delay > 0) { this.delay -= dt; return false; }
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    g.x = boardGlobalPos.x - 20 + easeOutQuart(t) * (total + 40);
                    g.alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
                    if (t >= 1) { self._releaseParticleGfx(g); return true; }
                    return false;
                }
            });
        });

        // Column sweeps (vertical)
        cols.forEach((col, ci) => {
            const g = self._getParticleGfx();
            g.rect(0, 0, cs, 20).fill({ color: 0xFFFFFF, alpha: 0.6 });
            g.rect(0, -10, cs, 40).fill({ color: 0x44FF88, alpha: 0.3 });

            g.position.set(boardGlobalPos.x + col * cs, boardGlobalPos.y - 20);
            this.container.addChild(g);

            this.tweens.push({
                elapsed: 0,
                duration: 300,
                delay: ci * 60,
                update(dt) {
                    if (g.destroyed) return true;
                    if (this.delay > 0) { this.delay -= dt; return false; }
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    g.y = boardGlobalPos.y - 20 + easeOutQuart(t) * (total + 40);
                    g.alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
                    if (t >= 1) { self._releaseParticleGfx(g); return true; }
                    return false;
                }
            });
        });
    }

    // ── Screen shake ──
    screenShake(intensity = 6, duration = 300) {
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
        this.shakeDuration = duration;
        this.shakeTime = duration;
    }

    // ── Score popup (premium floating text) ──
    showScorePopup(x, y, text, color = 0xFFFFFF) {
        // 화면 안으로 클램핑 (70px 올라감)
        const sw = this.game.app.screen.width;
        const sh = this.game.app.screen.height;
        x = Math.max(50, Math.min(sw - 50, x));
        y = Math.max(100, Math.min(sh - 40, y));

        const size = Math.max(16, this.game.cellSize * 0.65);
        const txt = new PIXI.Text({
            text,
            style: {
                fontFamily: 'Orbitron, sans-serif',
                fontSize: size,
                fill: color,
                fontWeight: 'bold',
                dropShadow: { color: 0x000000, blur: 6, distance: 2 },
                stroke: { color: 0x000000, width: 3 },
            }
        });
        txt.anchor.set(0.5);
        txt.position.set(x, y);
        txt.alpha = 0;
        this.container.addChild(txt);

        const startY = y;
        this.tweens.push({
            elapsed: 0,
            duration: 1100,
            update(dt) {
                if (txt.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);

                // Fade in quickly, float up, fade out
                if (t < 0.15) {
                    txt.alpha = easeOutCubic(t / 0.15);
                    txt.scale.set(0.5 + easeOutBack(t / 0.15) * 0.5);
                } else if (t < 0.5) {
                    txt.alpha = 1;
                    txt.scale.set(1 + Math.sin((t - 0.15) / 0.35 * Math.PI) * 0.1);
                } else {
                    txt.alpha = 1 - easeInOutQuad((t - 0.5) / 0.5);
                    txt.scale.set(1);
                }

                txt.y = startY - easeOutCubic(t) * 70;

                if (t >= 1) {
                    txt.destroy();
                    return true;
                }
                return false;
            }
        });
    }

    // ══════════════════════════════════════════════════
    // ── COMBO EFFECT SYSTEM (3-Tier WOW Effects) ──
    // ══════════════════════════════════════════════════

    playComboEffect(combo, x, y, lineCount) {
        const tier = combo <= 3 ? 1 : combo <= 5 ? 2 : 3;

        // ── Tier 1 (combo 2-3): "Nice" ──
        if (tier >= 1) {
            this.screenShake(5 + combo, 200 + lineCount * 30);
            this.playShockwave(x, y, lineCount);
            this.spawnSparkles(x, y, 0x44FF88, 15 + combo * 5);
            this.showComboPopup(x, y, combo, tier);
        }

        // ── Tier 2 (combo 4-5): "Amazing" ──
        if (tier >= 2) {
            this.screenShake(8 + combo, 300 + lineCount * 40);
            this.playScreenFlash(0xFFFFFF, 0.15, 200);
            this.playMultiRingWave(x, y, 2, [0x44FF88, 0x00E5FF], 120 + lineCount * 30);
            this.playRadialRays(x, y, 6, 0x44FF88, 100);
            this.spawnSparkles(x, y, 0x00E5FF, 20 + combo * 5);
        }

        // ── Tier 3 (combo 6+): "LEGENDARY" ──
        if (tier >= 3) {
            this.screenShake(12 + Math.min(combo, 10), 400 + lineCount * 50);
            this.playRainbowFlash(300);
            this.playScreenZoomPulse(0.03, 350);
            this.playMultiRingWave(x, y, 4,
                [0xFF1744, 0xFFD600, 0x76FF03, 0x00E5FF, 0xD500F9],
                160 + lineCount * 40);
            this.playRadialRays(x, y, 12, 0xFFD600, 150);
            this.spawnStarParticles(x, y, 0xFFD600, 15 + combo * 3);
            this.playParticleShower(40 + combo * 8);
            this.spawnSparkles(x, y, 0xD500F9, 25);
        }
    }

    // ── Combo popup (tier-based) — 화려한 WOW 연출 ──
    showComboPopup(x, y, comboLevel, tier = 1) {
        // 화면 중앙 X, Y는 클램핑
        const sw = this.game.app.screen.width;
        const sh = this.game.app.screen.height;
        const floatUp = 100 + tier * 30;
        x = sw / 2;
        y = Math.max(floatUp + 30, Math.min(sh * 0.45, y));

        const colors = [0xFFFFFF, 0x76FF03, 0x00E5FF, 0xFFD600, 0xFF1744, 0xD500F9, 0xFF6D00, 0xFF4081];
        const color = colors[Math.min(comboLevel - 1, colors.length - 1)];

        const sizeMultiplier = tier === 3 ? 1.8 : tier === 2 ? 1.4 : 1.0;
        const size = Math.max(26, this.game.cellSize * 1.0) * sizeMultiplier;

        const style = {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: size,
            fill: color,
            fontWeight: '900',
            dropShadow: { color: 0x000000, blur: 10 + tier * 6, distance: 3 + tier },
            stroke: { color: 0x000000, width: 5 + tier * 2 },
            letterSpacing: 2 + tier * 3,
        };

        const comboText = tier === 3 ? `★ COMBO x${comboLevel}! ★` :
                          tier === 2 ? `COMBO x${comboLevel}!` :
                          `COMBO x${comboLevel}!`;

        const txt = new PIXI.Text({ text: comboText, style });
        txt.anchor.set(0.5);
        txt.position.set(x, y);
        txt.alpha = 0;
        this.container.addChild(txt);

        // ── Glow ring behind text ──
        const glowRadius = size * 2;
        const glow = new PIXI.Graphics();
        glow.circle(0, 0, glowRadius).fill({ color, alpha: 0.15 + tier * 0.05 });
        glow.position.set(x, y);
        glow.alpha = 0;
        this.container.addChildAt(glow, this.container.children.indexOf(txt));

        // ── Sparkles ──
        const sparkleCount = tier === 3 ? 40 : tier === 2 ? 25 : Math.min(comboLevel * 4, 18);
        this.spawnSparkles(x, y, color, sparkleCount);

        // Tier 2+: ring burst behind text
        if (tier >= 2) {
            this.playRingBurst(x, y, color, glowRadius * 0.8);
            this.spawnSparkles(x, y - 20, 0xFFD600, 12);
        }

        // Tier 3: star burst + secondary sparkle wave
        if (tier === 3) {
            this.spawnStarParticles(x, y, color, 16);
            this.spawnStarParticles(x, y, 0xFFD600, 8);
            // Delayed second sparkle burst
            setTimeout(() => {
                this.spawnSparkles(x, y - 40, 0xFF1744, 15);
            }, 150);
        }

        const startY = y;
        const duration = 1600 + tier * 400;
        const self = this;
        this.tweens.push({
            elapsed: 0,
            duration,
            update(dt) {
                if (txt.destroyed) { if (!glow.destroyed) glow.destroy(); return true; }
                if (glow.destroyed) { if (!txt.destroyed) txt.destroy(); return true; }
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);

                // Phase 1: Explosive pop-in with overshoot
                if (t < 0.15) {
                    const p = t / 0.15;
                    txt.alpha = easeOutCubic(p);
                    const scale = easeOutElastic(p) * (1 + tier * 0.15);
                    txt.scale.set(scale);
                    glow.alpha = easeOutCubic(p) * (0.6 + tier * 0.15);
                    glow.scale.set(easeOutElastic(p) * 1.2);
                }
                // Phase 2: Neon flicker + energetic pulsing
                else if (t < 0.55) {
                    const pp = (t - 0.15) / 0.4;
                    const pulseAmp = (0.08 + tier * 0.04) * (1 - pp);
                    const pulseFreq = (5 + tier * 3);
                    const pulse = 1 + Math.sin(pp * Math.PI * pulseFreq) * pulseAmp;
                    txt.scale.set(pulse * (1 + tier * 0.05));

                    // Neon flicker: tier가 높을수록 더 격렬
                    const neonSpeed = 20 + tier * 12;
                    const neonFlicker = 0.85 + Math.sin(pp * Math.PI * neonSpeed) * 0.15;
                    const glitch = Math.random() < (0.03 + tier * 0.03) ? 0.3 : 1;
                    txt.alpha = neonFlicker * glitch;

                    glow.alpha = ((0.4 + tier * 0.1) * (1 - pp * 0.5))
                        + Math.sin(pp * Math.PI * neonSpeed * 0.5) * 0.12;
                    glow.scale.set(1 + pp * 0.5 + Math.sin(pp * Math.PI * neonSpeed) * 0.06);
                }
                // Phase 3: Dramatic float-up with fading flicker
                else {
                    const pp = (t - 0.55) / 0.45;
                    const fadeFlicker = pp < 0.4 ? (0.9 + Math.sin(pp * Math.PI * 16) * 0.1) : 1;
                    txt.alpha = (1 - easeInOutQuad(pp)) * fadeFlicker;
                    txt.scale.set((1 + tier * 0.05) * (1 - pp * 0.2));
                    glow.alpha = (0.2 + tier * 0.05) * (1 - easeInOutQuad(pp));
                    glow.scale.set(1.5 + pp * 0.5);
                }

                const floatDist = 100 + tier * 30;
                txt.y = startY - easeOutCubic(t) * floatDist;
                glow.y = txt.y;
                glow.x = x;

                // Wobble rotation (more dramatic per tier)
                txt.rotation = Math.sin(t * Math.PI * (8 + tier * 3)) * (0.03 + tier * 0.02) * (1 - t);

                if (t >= 1) {
                    txt.destroy();
                    glow.destroy();
                    return true;
                }
                return false;
            }
        });
    }

    // ── Multi-line clear popup — "DOUBLE!" "TRIPLE!" "QUAD!" ──
    showMultiLinePopup(x, y, lineCount) {
        // 화면 중앙 X, Y는 클램핑
        const sw = this.game.app.screen.width;
        const sh = this.game.app.screen.height;
        const intensity = Math.min(lineCount, 4);
        const floatUp = 80 + intensity * 25;
        x = sw / 2;
        y = Math.max(floatUp + 30, Math.min(sh * 0.45, y));

        const configs = {
            2: { text: 'DOUBLE!', color: 0x00E5FF, size: 1.2, sparkles: 15 },
            3: { text: 'TRIPLE!', color: 0xFFD600, size: 1.5, sparkles: 25 },
            4: { text: 'QUAD!',   color: 0xFF1744, size: 1.8, sparkles: 40 },
        };
        const cfg = configs[Math.min(lineCount, 4)] || configs[4];

        const size = Math.max(28, this.game.cellSize * 1.0) * cfg.size;
        const style = {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: size,
            fill: cfg.color,
            fontWeight: '900',
            dropShadow: { color: 0x000000, blur: 12 + intensity * 4, distance: 3 },
            stroke: { color: 0x000000, width: 5 + intensity },
            letterSpacing: 3 + intensity * 2,
        };

        const txt = new PIXI.Text({ text: cfg.text, style });
        txt.anchor.set(0.5);
        txt.position.set(x, y);
        txt.alpha = 0;
        txt.scale.set(3);
        this.container.addChild(txt);

        // ── Dramatic glow burst ──
        const glow = new PIXI.Graphics();
        const glowR = size * 2.5;
        glow.circle(0, 0, glowR).fill({ color: cfg.color, alpha: 0.2 });
        glow.position.set(x, y);
        glow.alpha = 0;
        this.container.addChildAt(glow, this.container.children.indexOf(txt));

        // ── Sparkles + effects ──
        this.spawnSparkles(x, y, cfg.color, cfg.sparkles);
        this.playRingBurst(x, y, cfg.color, glowR * 0.6);

        if (lineCount >= 3) {
            this.spawnStarParticles(x, y, cfg.color, 8 + lineCount * 2);
            this.spawnSparkles(x, y, 0xFFFFFF, 12);
        }
        if (lineCount >= 4) {
            this.spawnStarParticles(x, y, 0xFFD600, 12);
            setTimeout(() => {
                this.spawnSparkles(x, y - 30, 0xD500F9, 15);
                this.playRingBurst(x, y, 0xFFD600, glowR * 0.4);
            }, 120);
        }

        const startY = y;
        const duration = 1800 + intensity * 200;
        this.tweens.push({
            elapsed: 0,
            duration,
            update(dt) {
                if (txt.destroyed) { if (!glow.destroyed) glow.destroy(); return true; }
                if (glow.destroyed) { if (!txt.destroyed) txt.destroy(); return true; }
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);

                // Phase 1: Slam-in (big → normal with bounce)
                if (t < 0.2) {
                    const p = t / 0.2;
                    txt.alpha = easeOutCubic(p);
                    txt.scale.set(3 - easeOutElastic(p) * 2);
                    glow.alpha = easeOutCubic(p) * 0.7;
                    glow.scale.set(0.3 + easeOutElastic(p) * 0.9);
                }
                // Phase 2: Neon flicker + energetic pulse
                else if (t < 0.6) {
                    const pp = (t - 0.2) / 0.4;
                    const pulseAmp = 0.12 * (1 - pp);
                    const pulse = 1 + Math.sin(pp * Math.PI * 8) * pulseAmp;
                    txt.scale.set(pulse);

                    // Neon flicker: rapid alpha oscillation
                    const flickerSpeed = 25 + intensity * 10;
                    const flicker = 0.85 + Math.sin(pp * Math.PI * flickerSpeed) * 0.15;
                    const glitch = Math.random() < 0.06 ? 0.4 : 1; // rare hard flicker
                    txt.alpha = flicker * glitch;

                    glow.alpha = (0.5 - pp * 0.3) + Math.sin(pp * Math.PI * flickerSpeed * 0.5) * 0.15;
                    glow.scale.set(1.2 + pp * 0.8 + Math.sin(pp * Math.PI * flickerSpeed) * 0.05);
                }
                // Phase 3: Float up + fade out with final flicker
                else {
                    const pp = (t - 0.6) / 0.4;
                    const fadeFlicker = pp < 0.5 ? (0.9 + Math.sin(pp * Math.PI * 20) * 0.1) : 1;
                    txt.alpha = (1 - easeInOutQuad(pp)) * fadeFlicker;
                    txt.scale.set(1 + pp * 0.15);
                    glow.alpha = 0.2 * (1 - easeInOutQuad(pp));
                    glow.scale.set(2 + pp);
                }

                txt.y = startY - easeOutCubic(t) * (80 + intensity * 25);
                glow.y = txt.y;

                // Shake on slam (first 20%)
                if (t < 0.2) {
                    const shake = (1 - t / 0.2) * 4 * intensity;
                    txt.x = x + (Math.random() - 0.5) * shake;
                } else {
                    txt.x = x;
                    txt.rotation = Math.sin(t * Math.PI * 10) * 0.02 * (1 - t);
                }

                if (t >= 1) {
                    txt.destroy();
                    glow.destroy();
                    return true;
                }
                return false;
            }
        });
    }

    // ── Screen Flash ──
    playScreenFlash(color, intensity, duration) {
        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;
        const flash = new PIXI.Graphics();
        flash.rect(0, 0, w, h).fill({ color, alpha: intensity });
        this.container.addChild(flash);

        this.tweens.push({
            elapsed: 0,
            duration,
            update(dt) {
                if (flash.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                flash.alpha = (1 - easeOutCubic(t));
                if (t >= 1) { flash.destroy(); return true; }
                return false;
            }
        });
    }

    // ── Rainbow Flash (for tier 3 combos) ──
    playRainbowFlash(duration) {
        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;
        const rainbowColors = BLOCK_COLORS.map(c => c.glow);

        const flash = new PIXI.Graphics();
        flash.rect(0, 0, w, h).fill({ color: rainbowColors[0], alpha: 0.2 });
        this.container.addChild(flash);

        let colorIndex = 0;
        this.tweens.push({
            elapsed: 0,
            duration,
            update(dt) {
                if (flash.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);

                // Cycle through rainbow colors
                const ci = Math.floor(t * rainbowColors.length * 2) % rainbowColors.length;
                if (ci !== colorIndex) {
                    colorIndex = ci;
                    flash.clear();
                    flash.rect(0, 0, w, h).fill({ color: rainbowColors[ci], alpha: 0.18 * (1 - t) });
                }
                flash.alpha = (1 - easeOutCubic(t));

                if (t >= 1) { flash.destroy(); return true; }
                return false;
            }
        });
    }

    // ── Screen Zoom Pulse (uses zoomContainer to avoid conflicting with shake) ──
    playScreenZoomPulse(intensity, duration) {
        const zc = this.game.zoomContainer;
        if (!zc) return;
        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;

        zc.pivot.set(w / 2, h / 2);
        zc.position.set(w / 2, h / 2);

        this.tweens.push({
            elapsed: 0,
            duration,
            update(dt) {
                if (zc.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                const scale = 1 + intensity * Math.sin(t * Math.PI) * (1 - t);
                zc.scale.set(scale);

                if (t >= 1) {
                    zc.scale.set(1);
                    zc.pivot.set(0, 0);
                    zc.position.set(0, 0);
                    return true;
                }
                return false;
            }
        });
    }

    // ── Radial Light Rays ──
    playRadialRays(x, y, count, color, maxLength) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.3;
            const ray = new PIXI.Graphics();
            ray.position.set(x, y);
            ray.rotation = angle;
            this.container.addChild(ray);

            const width = 2 + Math.random() * 3;
            this.tweens.push({
                elapsed: 0,
                duration: 500 + Math.random() * 200,
                delay: i * 20,
                update(dt) {
                    if (ray.destroyed) return true;
                    if (this.delay > 0) { this.delay -= dt; return false; }
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    const len = easeOutQuart(t) * maxLength;
                    const alpha = (1 - t) * 0.6;

                    ray.clear();
                    ray.rect(0, -width / 2, len, width).fill({ color, alpha });
                    // Bright core
                    ray.rect(0, -width / 4, len * 0.7, width / 2).fill({ color: 0xFFFFFF, alpha: alpha * 0.5 });

                    if (t >= 1) { ray.destroy(); return true; }
                    return false;
                }
            });
        }
    }

    // ── Multiple Ring Waves ──
    playMultiRingWave(x, y, count, colors, maxRadius) {
        for (let r = 0; r < count; r++) {
            const ringColor = colors[r % colors.length];
            const wave = new PIXI.Graphics();
            wave.position.set(x, y);
            this.container.addChild(wave);

            this.tweens.push({
                elapsed: 0,
                duration: 500 + r * 80,
                delay: r * 80,
                update(dt) {
                    if (wave.destroyed) return true;
                    if (this.delay > 0) { this.delay -= dt; return false; }
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    const radius = easeOutQuart(t) * (maxRadius + r * 20);
                    const alpha = (1 - t) * 0.6;
                    const thickness = (4 + count - r) * (1 - t * 0.6);

                    wave.clear();
                    wave.circle(0, 0, radius).stroke({ width: thickness, color: ringColor, alpha });
                    wave.circle(0, 0, radius * 0.85).stroke({ width: thickness * 0.4, color: 0xFFFFFF, alpha: alpha * 0.4 });

                    if (t >= 1) { wave.destroy(); return true; }
                    return false;
                }
            });
        }
    }

    // ── Particle Shower from top of screen ──
    playParticleShower(count) {
        const w = this.game.app.screen.width;
        const colors = BLOCK_COLORS.map(c => c.particle);

        for (let i = 0; i < count; i++) {
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = 1 + Math.random() * 3;
            const gfx = this._getParticleGfx();
            gfx.circle(0, 0, size).fill({ color, alpha: 0.8 });
            gfx.circle(0, 0, size * 1.8).fill({ color, alpha: 0.3 });

            gfx.position.set(Math.random() * w, -10 - Math.random() * 50);
            this.container.addChild(gfx);

            this.particles.push({
                gfx,
                vx: (Math.random() - 0.5) * 1.5,
                vy: 1 + Math.random() * 3,
                rotSpeed: (Math.random() - 0.5) * 0.1,
                gravity: 0.03,
                baseScale: 0.5 + Math.random() * 0.8,
                shrink: 0.4,
                fadeIn: true,
                life: 800 + Math.random() * 800,
                maxLife: 1600,
            });
        }
    }

    // ── Level Up celebration ──
    showLevelUp(level) {
        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;
        const x = w / 2;
        const y = h * 0.35;

        // Background flash
        const flash = new PIXI.Graphics();
        flash.rect(0, 0, w, h).fill({ color: 0xFFD600, alpha: 0.15 });
        this.container.addChild(flash);

        this.tweens.push({
            elapsed: 0,
            duration: 600,
            update(dt) {
                if (flash.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                flash.alpha = (1 - t) * 0.5;
                if (t >= 1) { flash.destroy(); return true; }
                return false;
            }
        });

        // Level up text
        const txt = new PIXI.Text({
            text: `LEVEL ${level}`,
            style: {
                fontFamily: 'Orbitron, sans-serif',
                fontSize: Math.max(30, this.game.cellSize * 1.2),
                fill: 0xFFD600,
                fontWeight: '900',
                dropShadow: { color: 0x000000, blur: 10, distance: 4 },
                stroke: { color: 0x000000, width: 5 },
                letterSpacing: 4,
            }
        });
        txt.anchor.set(0.5);
        txt.position.set(x, y);
        txt.alpha = 0;
        this.container.addChild(txt);

        // Sparkle burst
        for (let i = 0; i < 20; i++) {
            const angle = (Math.PI * 2 * i / 20);
            const dist = 50 + Math.random() * 80;
            this.spawnSparkles(
                x + Math.cos(angle) * dist,
                y + Math.sin(angle) * dist,
                0xFFD600, 2
            );
        }

        this.tweens.push({
            elapsed: 0,
            duration: 2000,
            update(dt) {
                if (txt.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);

                if (t < 0.15) {
                    const p = t / 0.15;
                    txt.alpha = easeOutCubic(p);
                    txt.scale.set(easeOutBack(p) * 1.3);
                } else if (t < 0.5) {
                    txt.alpha = 1;
                    txt.scale.set(1.3 - easeOutCubic((t - 0.15) / 0.35) * 0.3);
                } else if (t < 0.7) {
                    txt.alpha = 1;
                    txt.scale.set(1);
                } else {
                    txt.alpha = 1 - easeInOutQuad((t - 0.7) / 0.3);
                    txt.scale.set(1 + (t - 0.7) * 0.5);
                }

                txt.y = y - Math.sin(t * Math.PI) * 20;

                if (t >= 1) { txt.destroy(); return true; }
                return false;
            }
        });
    }

    // ── Perfect Clear celebration ──
    showPerfectClear() {
        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;
        const x = w / 2;
        const y = h * 0.4;

        // Rainbow flash background
        this.playRainbowFlash(500);
        this.playScreenFlash(0xFFFFFF, 0.25, 300);
        this.playScreenZoomPulse(0.04, 400);
        this.screenShake(10, 400);

        // Massive particle burst
        const colors = BLOCK_COLORS.map(c => c.particle);
        for (let i = 0; i < 60; i++) {
            const color = colors[Math.floor(Math.random() * colors.length)];
            const angle = (Math.PI * 2 * i / 60) + (Math.random() - 0.5) * 0.3;
            const dist = 20 + Math.random() * 50;
            this.spawnSparkles(
                x + Math.cos(angle) * dist,
                y + Math.sin(angle) * dist,
                color, 3
            );
        }

        // Star particles explosion
        this.spawnStarParticles(x, y, 0xFFD600, 20);
        this.spawnStarParticles(x, y, 0xFF4081, 15);

        // Multi-ring wave burst (more rings)
        this.playMultiRingWave(x, y, 5, [0xFF4081, 0xFFD600, 0x00E5FF, 0x76FF03, 0xD500F9], 180);
        this.playRadialRays(x, y, 12, 0xFFD600, 150);

        // Massive particle shower
        this.playParticleShower(60);

        // Board shimmer wave (sweep glow across the board)
        const boardPos = this.game.board.getGlobalPosition();
        const cs = this.game.cellSize;
        const boardTotal = cs * GRID_SIZE;
        const shimmer = new PIXI.Graphics();
        shimmer.rect(0, 0, 30, boardTotal).fill({ color: 0xFFFFFF, alpha: 0.2 });
        shimmer.rect(8, 0, 14, boardTotal).fill({ color: 0xFFD600, alpha: 0.15 });
        shimmer.position.set(boardPos.x - 30, boardPos.y);
        this.container.addChild(shimmer);

        this.tweens.push({
            elapsed: 0,
            duration: 600,
            update(dt) {
                if (shimmer.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                shimmer.x = boardPos.x - 30 + easeOutQuart(t) * (boardTotal + 60);
                shimmer.alpha = t < 0.2 ? t * 5 : (1 - (t - 0.2) / 0.8);
                if (t >= 1) { shimmer.destroy(); return true; }
                return false;
            }
        });

        // PERFECT text
        const txt = new PIXI.Text({
            text: 'PERFECT CLEAR!',
            style: {
                fontFamily: 'Orbitron, sans-serif',
                fontSize: Math.max(28, this.game.cellSize * 1.0),
                fill: 0xFF4081,
                fontWeight: '900',
                dropShadow: { color: 0x000000, blur: 12, distance: 4 },
                stroke: { color: 0x000000, width: 5 },
                letterSpacing: 6,
            }
        });
        txt.anchor.set(0.5);
        txt.position.set(x, y);
        txt.alpha = 0;
        this.container.addChild(txt);

        this.tweens.push({
            elapsed: 0,
            duration: 2500,
            update(dt) {
                if (txt.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);

                if (t < 0.1) {
                    txt.alpha = easeOutCubic(t / 0.1);
                    txt.scale.set(easeOutElastic(t / 0.1) * 1.5);
                } else if (t < 0.4) {
                    txt.alpha = 1;
                    const p = (t - 0.1) / 0.3;
                    txt.scale.set(1.5 - easeOutCubic(p) * 0.5);
                    txt.rotation = Math.sin(p * Math.PI * 6) * 0.03;
                } else if (t < 0.7) {
                    txt.alpha = 1;
                    txt.scale.set(1);
                    txt.rotation = 0;
                } else {
                    txt.alpha = 1 - easeInOutQuad((t - 0.7) / 0.3);
                    txt.scale.set(1 + (t - 0.7) * 0.8);
                    txt.rotation = 0;
                }

                if (t >= 1) { txt.destroy(); return true; }
                return false;
            }
        });
    }

    // ── Ring Burst: expanding ring on piece placement ──
    playRingBurst(x, y, color = 0x44FF88, baseRadius = 60) {
        const ringCount = 2;
        for (let r = 0; r < ringCount; r++) {
            const ring = new PIXI.Graphics();
            ring.position.set(x, y);
            this.container.addChild(ring);

            const delayMs = r * 80;
            const maxRadius = baseRadius + r * 30;
            this.tweens.push({
                elapsed: 0,
                duration: 450 + r * 100,
                delay: delayMs,
                update(dt) {
                    if (ring.destroyed) return true;
                    if (this.delay > 0) { this.delay -= dt; return false; }
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    const radius = 10 + easeOutCubic(t) * maxRadius;
                    const alpha = (1 - easeInOutQuad(t)) * 0.7;
                    const thickness = 3 * (1 - t * 0.7);
                    ring.clear();
                    ring.circle(0, 0, radius).stroke({ width: thickness, color, alpha });
                    // Inner bright ring
                    if (t < 0.5) {
                        ring.circle(0, 0, radius - 2).stroke({ width: 1, color: 0xFFFFFF, alpha: alpha * 0.5 });
                    }
                    if (t >= 1) { ring.destroy(); return true; }
                    return false;
                }
            });
        }

        // Central flash
        const flash = new PIXI.Graphics();
        flash.circle(0, 0, 15).fill({ color: 0xFFFFFF, alpha: 0.5 });
        flash.circle(0, 0, 25).fill({ color, alpha: 0.3 });
        flash.position.set(x, y);
        this.container.addChild(flash);

        this.tweens.push({
            elapsed: 0,
            duration: 200,
            update(dt) {
                if (flash.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                flash.scale.set(1 + easeOutCubic(t) * 1.5);
                flash.alpha = 1 - easeOutCubic(t);
                if (t >= 1) { flash.destroy(); return true; }
                return false;
            }
        });
    }

    // ══════════════════════════════════════════════════
    // ── SINGLE CLEAR EFFECT (WoW-Style, Non-Combo) ──
    // ══════════════════════════════════════════════════

    playSingleClearEffect(lineCount, x, y, clearedCells) {
        // ── Collect unique block colors ──
        const uniqueColors = [];
        if (clearedCells && clearedCells.length > 0) {
            const seen = new Set();
            clearedCells.forEach(c => {
                if (c.colorIndex >= 0 && !seen.has(c.colorIndex)) {
                    seen.add(c.colorIndex);
                    uniqueColors.push(BLOCK_COLORS[c.colorIndex].glow);
                }
            });
        }
        if (uniqueColors.length === 0) uniqueColors.push(0x44FF88);

        // ── 1줄: 기본 임팩트 (기존 수준 유지) ──
        if (lineCount <= 1) {
            this.screenShake(7, 250);
            this.playScreenFlash(0xFFFFFF, 0.08, 180);
            this.playShockwave(x, y, 1);
            this.playMultiRingWave(x, y, Math.min(uniqueColors.length, 2), uniqueColors, 80);
            this.spawnSparkles(x, y, uniqueColors[0], 15);
        }

        // ── 2줄: 중간 임팩트 ──
        else if (lineCount === 2) {
            this.screenShake(6, 250);
            this.playScreenFlash(0xFFFFFF, 0.08, 180);
            this.playShockwave(x, y, 2);
            this.playMultiRingWave(x, y, 2, uniqueColors, 100);
            this.spawnSparkles(x, y, uniqueColors[0], 18);
            this.playRadialRays(x, y, 5, uniqueColors[0], 80);
        }

        // ── 3줄: 강한 임팩트 ──
        else if (lineCount === 3) {
            this.screenShake(10, 350);
            this.playScreenFlash(0xFFFFFF, 0.14, 220);
            this.playShockwave(x, y, 3);
            this.playMultiRingWave(x, y, 3, uniqueColors, 130);
            this.spawnSparkles(x, y, uniqueColors[0], 30);
            this.playRadialRays(x, y, 8, uniqueColors[0], 110);
            this.spawnStarParticles(x, y, uniqueColors[Math.min(1, uniqueColors.length - 1)], 10);
            this.playParticleShower(20);
            this.playScreenZoomPulse(0.015, 250);
        }

        // ── 4줄+: 폭발적 임팩트 ──
        else {
            this.screenShake(14, 450);
            this.playScreenFlash(0xFFFFFF, 0.2, 280);
            this.playRainbowFlash(250);
            this.playShockwave(x, y, 4);
            this.playMultiRingWave(x, y, 4,
                [0xFF1744, 0xFFD600, 0x76FF03, 0x00E5FF, 0xD500F9],
                170);
            this.spawnSparkles(x, y, uniqueColors[0], 50);
            this.spawnSparkles(x, y, 0xFFD600, 20);
            this.playRadialRays(x, y, 12, 0xFFD600, 150);
            this.spawnStarParticles(x, y, 0xFFD600, 18);
            this.playParticleShower(40);
            this.playScreenZoomPulse(0.025, 350);
        }
    }

    // ── Shockwave: expanding distortion ring on line clear ──
    playShockwave(x, y, lineCount) {
        const intensity = Math.min(lineCount, 4);
        const maxRadius = 100 + intensity * 50;

        // Primary shockwave ring (bigger, brighter)
        const wave = new PIXI.Graphics();
        wave.position.set(x, y);
        this.container.addChild(wave);

        this.tweens.push({
            elapsed: 0,
            duration: 650,
            update(dt) {
                if (wave.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                const radius = easeOutQuart(t) * maxRadius;
                const alpha = (1 - t) * 0.7;
                const thickness = (5 + intensity * 1.5) * (1 - t * 0.5);
                wave.clear();
                // Outer ring (brighter)
                wave.circle(0, 0, radius).stroke({ width: thickness, color: 0xFFFFFF, alpha: alpha * 0.5 });
                // Inner bright ring
                wave.circle(0, 0, radius * 0.85).stroke({ width: thickness * 0.6, color: 0x44FF88, alpha: alpha * 0.7 });
                // Fill glow (more visible)
                wave.circle(0, 0, radius).fill({ color: 0xFFFFFF, alpha: alpha * 0.05 });
                if (t >= 1) { wave.destroy(); return true; }
                return false;
            }
        });

        // Secondary inner shockwave (delayed, faster)
        if (intensity >= 2) {
            const wave2 = new PIXI.Graphics();
            wave2.position.set(x, y);
            this.container.addChild(wave2);

            this.tweens.push({
                elapsed: 0,
                duration: 450,
                delay: 50,
                update(dt) {
                    if (wave2.destroyed) return true;
                    if (this.delay > 0) { this.delay -= dt; return false; }
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    const radius = easeOutQuart(t) * maxRadius * 0.7;
                    const alpha = (1 - t) * 0.5;
                    wave2.clear();
                    wave2.circle(0, 0, radius).stroke({ width: 3 * (1 - t), color: 0x00E5FF, alpha });
                    if (t >= 1) { wave2.destroy(); return true; }
                    return false;
                }
            });
        }

        // Radial particle burst (more particles, faster)
        const burstCount = 12 + intensity * 6;
        for (let i = 0; i < burstCount; i++) {
            const angle = (Math.PI * 2 * i / burstCount) + (Math.random() - 0.5) * 0.4;
            const speed = 4 + Math.random() * 4 + intensity * 1.5;
            const size = 1.5 + Math.random() * 2.5;
            const pColor = i % 3 === 0 ? 0xFFFFFF : i % 3 === 1 ? 0x44FF88 : 0x00E5FF;

            const gfx = this._getParticleGfx();
            gfx.circle(0, 0, size).fill({ color: pColor, alpha: 0.9 });
            gfx.circle(0, 0, size * 2.2).fill({ color: pColor, alpha: 0.3 });
            gfx.position.set(x, y);
            this.container.addChild(gfx);

            this.particles.push({
                gfx,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                rotSpeed: 0,
                gravity: 0.02,
                baseScale: 0.9 + Math.random() * 0.5,
                shrink: 0.75,
                life: 450 + Math.random() * 350,
                maxLife: 800,
            });
        }
    }

    // ── Bonus score popup (large, colored) ──
    showBonusPopup(x, y, text, color = 0xFFD600) {
        const size = Math.max(20, this.game.cellSize * 0.8);
        const txt = new PIXI.Text({
            text,
            style: {
                fontFamily: 'Orbitron, sans-serif',
                fontSize: size,
                fill: color,
                fontWeight: '900',
                dropShadow: { color: 0x000000, blur: 8, distance: 3 },
                stroke: { color: 0x000000, width: 4 },
            }
        });
        txt.anchor.set(0.5);
        txt.position.set(x, y);
        txt.alpha = 0;
        this.container.addChild(txt);

        const startY = y;
        this.tweens.push({
            elapsed: 0,
            duration: 1500,
            update(dt) {
                if (txt.destroyed) return true;
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);

                if (t < 0.15) {
                    txt.alpha = easeOutCubic(t / 0.15);
                    txt.scale.set(easeOutBack(t / 0.15));
                } else if (t < 0.6) {
                    txt.alpha = 1;
                    txt.scale.set(1 + Math.sin((t - 0.15) / 0.45 * Math.PI * 2) * 0.05);
                } else {
                    txt.alpha = 1 - easeInOutQuad((t - 0.6) / 0.4);
                }
                txt.y = startY - easeOutCubic(t) * 80;

                if (t >= 1) { txt.destroy(); return true; }
                return false;
            }
        });
    }

    trimPool(targetSize = 50) {
        while (this._particlePool.length > targetSize) {
            const gfx = this._particlePool.pop();
            if (!gfx.destroyed) gfx.destroy();
        }
    }

    destroy() {
        this.game.app.ticker.remove(this.update, this);
        this.particles.forEach(p => p.gfx.destroy());
        this.particles = [];
        this.tweens = [];
        this._particlePool.forEach(gfx => { if (!gfx.destroyed) gfx.destroy(); });
        this._particlePool = [];
        this._textPool.forEach(txt => { if (!txt.destroyed) txt.destroy(); });
        this._textPool = [];
        this.container.destroy({ children: true });
    }
}
