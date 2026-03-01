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

        game.app.ticker.add(this.update, this);
    }

    update(delta) {
        const dt = delta * (1000 / 60);
        this._time += dt;

        // ── Particles ──
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                p.gfx.destroy();
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
            if (this.tweens[i].update(dt)) {
                this.tweens.splice(i, 1);
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

    // ── Spawn particles from a world position ──
    spawnCellParticles(worldX, worldY, color, count = 8) {
        const cellSize = this.game.cellSize;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 1.0;
            const speed = 2 + Math.random() * 4;
            const size = 2 + Math.random() * (cellSize * 0.18);

            const gfx = new PIXI.Graphics();

            // Outer glow
            gfx.beginFill(color, 0.3);
            gfx.drawCircle(0, 0, size * 1.5);
            gfx.endFill();

            // Main particle
            gfx.beginFill(color);
            gfx.drawRoundedRect(-size / 2, -size / 2, size, size, size * 0.3);
            gfx.endFill();

            // Bright center
            gfx.beginFill(0xFFFFFF, 0.7);
            gfx.drawCircle(0, 0, size * 0.25);
            gfx.endFill();

            gfx.position.set(worldX + cellSize / 2, worldY + cellSize / 2);
            this.container.addChild(gfx);

            this.particles.push({
                gfx,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2.5,
                rotSpeed: (Math.random() - 0.5) * 0.2,
                gravity: 0.12,
                baseScale: 0.8 + Math.random() * 0.4,
                shrink: 0.7,
                life: 500 + Math.random() * 400,
                maxLife: 900,
            });
        }
    }

    // ── Sparkle particles (floating upward, no gravity) ──
    spawnSparkles(worldX, worldY, color, count = 5) {
        for (let i = 0; i < count; i++) {
            const size = 1 + Math.random() * 3;
            const gfx = new PIXI.Graphics();

            // Star shape sparkle
            gfx.beginFill(0xFFFFFF, 0.8);
            gfx.drawCircle(0, 0, size);
            gfx.endFill();
            gfx.beginFill(color, 0.4);
            gfx.drawCircle(0, 0, size * 2);
            gfx.endFill();

            gfx.position.set(
                worldX + (Math.random() - 0.5) * 30,
                worldY + (Math.random() - 0.5) * 30
            );
            this.container.addChild(gfx);

            this.particles.push({
                gfx,
                vx: (Math.random() - 0.5) * 0.5,
                vy: -1 - Math.random() * 2,
                rotSpeed: 0,
                gravity: -0.02, // Float upward
                baseScale: 0.5 + Math.random() * 0.8,
                shrink: 0.5,
                fadeIn: true,
                life: 600 + Math.random() * 600,
                maxLife: 1200,
            });
        }
    }

    // ── Line clear effect with wave ──
    playClearEffect(clearedCells, boardGlobalPos) {
        const cellSize = this.game.cellSize;

        // Sort cells for wave effect
        const sorted = [...clearedCells].sort((a, b) => (a.row + a.col) - (b.row + b.col));

        sorted.forEach((cell, idx) => {
            const wx = boardGlobalPos.x + cell.col * cellSize;
            const wy = boardGlobalPos.y + cell.row * cellSize;
            const color = BLOCK_COLORS[cell.colorIndex] ? BLOCK_COLORS[cell.colorIndex].particle : 0xFFFFFF;

            // Stagger particles for wave effect
            setTimeout(() => {
                this.spawnCellParticles(wx, wy, color, 6);
            }, idx * 15);
        });
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
        if (total === 0) { onComplete && onComplete(); return; }

        cellSprites.forEach((sprite, idx) => {
            if (!sprite) { completed++; return; }
            const origTint = sprite.tint;
            this.tweens.push({
                elapsed: 0,
                duration: 400,
                delay: 0,
                update(dt) {
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);

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
                        if (completed >= total && onComplete) onComplete();
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
        rows.forEach((row, ri) => {
            const g = new PIXI.Graphics();
            g.beginFill(0xFFFFFF, 0.6);
            g.drawRect(0, 0, 20, cs);
            g.endFill();
            g.beginFill(0x44FF88, 0.3);
            g.drawRect(-10, 0, 40, cs);
            g.endFill();

            g.position.set(boardGlobalPos.x - 20, boardGlobalPos.y + row * cs);
            this.container.addChild(g);

            this.tweens.push({
                elapsed: 0,
                duration: 300,
                delay: ri * 60,
                update(dt) {
                    if (this.delay > 0) { this.delay -= dt; return false; }
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    g.x = boardGlobalPos.x - 20 + easeOutQuart(t) * (total + 40);
                    g.alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
                    if (t >= 1) { g.destroy(); return true; }
                    return false;
                }
            });
        });

        // Column sweeps (vertical)
        cols.forEach((col, ci) => {
            const g = new PIXI.Graphics();
            g.beginFill(0xFFFFFF, 0.6);
            g.drawRect(0, 0, cs, 20);
            g.endFill();
            g.beginFill(0x44FF88, 0.3);
            g.drawRect(0, -10, cs, 40);
            g.endFill();

            g.position.set(boardGlobalPos.x + col * cs, boardGlobalPos.y - 20);
            this.container.addChild(g);

            this.tweens.push({
                elapsed: 0,
                duration: 300,
                delay: ci * 60,
                update(dt) {
                    if (this.delay > 0) { this.delay -= dt; return false; }
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    g.y = boardGlobalPos.y - 20 + easeOutQuart(t) * (total + 40);
                    g.alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
                    if (t >= 1) { g.destroy(); return true; }
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
        const size = Math.max(16, this.game.cellSize * 0.65);
        const style = new PIXI.TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: size,
            fill: color,
            fontWeight: 'bold',
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 6,
            dropShadowDistance: 2,
            stroke: 0x000000,
            strokeThickness: 3,
        });
        const txt = new PIXI.Text(text, style);
        txt.anchor.set(0.5);
        txt.position.set(x, y);
        txt.alpha = 0;
        this.container.addChild(txt);

        const startY = y;
        this.tweens.push({
            elapsed: 0,
            duration: 1100,
            update(dt) {
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

    // ── Combo popup (premium animated) ──
    showComboPopup(x, y, comboLevel) {
        const colors = [0xFFFFFF, 0x76FF03, 0x00E5FF, 0xFFD600, 0xFF1744, 0xD500F9, 0xFF6D00, 0xFF4081];
        const color = colors[Math.min(comboLevel - 1, colors.length - 1)];
        const size = Math.max(24, this.game.cellSize * 0.9);

        const style = new PIXI.TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: size,
            fill: [color, 0xFFFFFF],
            fillGradientType: 0,
            fontWeight: '900',
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 8,
            dropShadowDistance: 3,
            stroke: 0x000000,
            strokeThickness: 4,
            letterSpacing: 2,
        });
        const txt = new PIXI.Text(`COMBO x${comboLevel}!`, style);
        txt.anchor.set(0.5);
        txt.position.set(x, y);
        txt.alpha = 0;
        this.container.addChild(txt);

        // Spawn sparkles around combo text
        this.spawnSparkles(x, y, color, Math.min(comboLevel * 3, 15));

        const startY = y;
        this.tweens.push({
            elapsed: 0,
            duration: 1400,
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);

                // Pop in with elastic
                if (t < 0.2) {
                    const p = t / 0.2;
                    txt.alpha = easeOutCubic(p);
                    txt.scale.set(easeOutElastic(p) * 1.2);
                } else if (t < 0.5) {
                    txt.alpha = 1;
                    const pulse = 1 + Math.sin((t - 0.2) / 0.3 * Math.PI * 4) * 0.08 * (1 - (t - 0.2) / 0.3);
                    txt.scale.set(pulse);
                } else {
                    txt.alpha = 1 - easeInOutQuad((t - 0.5) / 0.5);
                    txt.scale.set(1 - (t - 0.5) * 0.3);
                }

                txt.y = startY - easeOutCubic(t) * 90;
                txt.rotation = Math.sin(t * Math.PI * 6) * 0.02 * (1 - t);

                if (t >= 1) {
                    txt.destroy();
                    return true;
                }
                return false;
            }
        });
    }

    // ── Level Up celebration ──
    showLevelUp(level) {
        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;
        const x = w / 2;
        const y = h * 0.35;

        // Background flash
        const flash = new PIXI.Graphics();
        flash.beginFill(0xFFD600, 0.15);
        flash.drawRect(0, 0, w, h);
        flash.endFill();
        this.container.addChild(flash);

        this.tweens.push({
            elapsed: 0,
            duration: 600,
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                flash.alpha = (1 - t) * 0.5;
                if (t >= 1) { flash.destroy(); return true; }
                return false;
            }
        });

        // Level up text
        const style = new PIXI.TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: Math.max(30, this.game.cellSize * 1.2),
            fill: [0xFFD600, 0xFF6D00],
            fillGradientType: 0,
            fontWeight: '900',
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 10,
            dropShadowDistance: 4,
            stroke: 0x000000,
            strokeThickness: 5,
            letterSpacing: 4,
        });
        const txt = new PIXI.Text(`LEVEL ${level}`, style);
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
        const flash = new PIXI.Graphics();
        flash.beginFill(0xFFFFFF, 0.3);
        flash.drawRect(0, 0, w, h);
        flash.endFill();
        this.container.addChild(flash);

        this.tweens.push({
            elapsed: 0,
            duration: 1000,
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                flash.alpha = (1 - easeOutCubic(t)) * 0.4;
                if (t >= 1) { flash.destroy(); return true; }
                return false;
            }
        });

        // Massive particle burst
        const colors = BLOCK_COLORS.map(c => c.particle);
        for (let i = 0; i < 50; i++) {
            const color = colors[Math.floor(Math.random() * colors.length)];
            const angle = (Math.PI * 2 * i / 50) + (Math.random() - 0.5) * 0.3;
            const dist = 20 + Math.random() * 40;
            this.spawnSparkles(
                x + Math.cos(angle) * dist,
                y + Math.sin(angle) * dist,
                color, 2
            );
        }

        // PERFECT text
        const style = new PIXI.TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: Math.max(28, this.game.cellSize * 1.0),
            fill: [0xFF4081, 0xFFD600, 0x00E5FF],
            fillGradientType: 0,
            fillGradientStops: [0, 0.5, 1],
            fontWeight: '900',
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 12,
            dropShadowDistance: 4,
            stroke: 0x000000,
            strokeThickness: 5,
            letterSpacing: 6,
        });
        const txt = new PIXI.Text('PERFECT CLEAR!', style);
        txt.anchor.set(0.5);
        txt.position.set(x, y);
        txt.alpha = 0;
        this.container.addChild(txt);

        this.tweens.push({
            elapsed: 0,
            duration: 2500,
            update(dt) {
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
    playRingBurst(x, y, color = 0x44FF88) {
        const ringCount = 2;
        for (let r = 0; r < ringCount; r++) {
            const ring = new PIXI.Graphics();
            ring.lineStyle(3, color, 0.6);
            ring.drawCircle(0, 0, 10);
            ring.position.set(x, y);
            this.container.addChild(ring);

            const delayMs = r * 80;
            const maxRadius = 60 + r * 30;
            this.tweens.push({
                elapsed: 0,
                duration: 450 + r * 100,
                delay: delayMs,
                update(dt) {
                    if (this.delay > 0) { this.delay -= dt; return false; }
                    this.elapsed += dt;
                    const t = Math.min(this.elapsed / this.duration, 1);
                    const radius = 10 + easeOutCubic(t) * maxRadius;
                    const alpha = (1 - easeInOutQuad(t)) * 0.7;
                    const thickness = 3 * (1 - t * 0.7);
                    ring.clear();
                    ring.lineStyle(thickness, color, alpha);
                    ring.drawCircle(0, 0, radius);
                    // Inner bright ring
                    if (t < 0.5) {
                        ring.lineStyle(1, 0xFFFFFF, alpha * 0.5);
                        ring.drawCircle(0, 0, radius - 2);
                    }
                    if (t >= 1) { ring.destroy(); return true; }
                    return false;
                }
            });
        }

        // Central flash
        const flash = new PIXI.Graphics();
        flash.beginFill(0xFFFFFF, 0.5);
        flash.drawCircle(0, 0, 15);
        flash.endFill();
        flash.beginFill(color, 0.3);
        flash.drawCircle(0, 0, 25);
        flash.endFill();
        flash.position.set(x, y);
        this.container.addChild(flash);

        this.tweens.push({
            elapsed: 0,
            duration: 200,
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                flash.scale.set(1 + easeOutCubic(t) * 1.5);
                flash.alpha = 1 - easeOutCubic(t);
                if (t >= 1) { flash.destroy(); return true; }
                return false;
            }
        });
    }

    // ── Shockwave: expanding distortion ring on line clear ──
    playShockwave(x, y, lineCount) {
        const intensity = Math.min(lineCount, 4);
        const maxRadius = 80 + intensity * 40;

        // Outer shockwave ring
        const wave = new PIXI.Graphics();
        wave.position.set(x, y);
        this.container.addChild(wave);

        this.tweens.push({
            elapsed: 0,
            duration: 600,
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                const radius = easeOutQuart(t) * maxRadius;
                const alpha = (1 - t) * 0.6;
                const thickness = (4 + intensity) * (1 - t * 0.6);
                wave.clear();
                // Outer ring
                wave.lineStyle(thickness, 0xFFFFFF, alpha * 0.4);
                wave.drawCircle(0, 0, radius);
                // Inner bright ring
                wave.lineStyle(thickness * 0.5, 0x44FF88, alpha * 0.6);
                wave.drawCircle(0, 0, radius * 0.85);
                // Fill glow
                wave.beginFill(0xFFFFFF, alpha * 0.03);
                wave.drawCircle(0, 0, radius);
                wave.endFill();
                if (t >= 1) { wave.destroy(); return true; }
                return false;
            }
        });

        // Radial particle burst
        const burstCount = 8 + intensity * 4;
        for (let i = 0; i < burstCount; i++) {
            const angle = (Math.PI * 2 * i / burstCount) + (Math.random() - 0.5) * 0.3;
            const speed = 3 + Math.random() * 3 + intensity;
            const size = 1.5 + Math.random() * 2;
            const pColor = i % 2 === 0 ? 0xFFFFFF : 0x44FF88;

            const gfx = new PIXI.Graphics();
            gfx.beginFill(pColor, 0.8);
            gfx.drawCircle(0, 0, size);
            gfx.endFill();
            gfx.beginFill(pColor, 0.3);
            gfx.drawCircle(0, 0, size * 2);
            gfx.endFill();
            gfx.position.set(x, y);
            this.container.addChild(gfx);

            this.particles.push({
                gfx,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                rotSpeed: 0,
                gravity: 0.02,
                baseScale: 0.8 + Math.random() * 0.4,
                shrink: 0.8,
                life: 400 + Math.random() * 300,
                maxLife: 700,
            });
        }
    }

    // ── Bonus score popup (large, colored) ──
    showBonusPopup(x, y, text, color = 0xFFD600) {
        const size = Math.max(20, this.game.cellSize * 0.8);
        const style = new PIXI.TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: size,
            fill: color,
            fontWeight: '900',
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 8,
            dropShadowDistance: 3,
            stroke: 0x000000,
            strokeThickness: 4,
        });
        const txt = new PIXI.Text(text, style);
        txt.anchor.set(0.5);
        txt.position.set(x, y);
        txt.alpha = 0;
        this.container.addChild(txt);

        const startY = y;
        this.tweens.push({
            elapsed: 0,
            duration: 1500,
            update(dt) {
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

    destroy() {
        this.game.app.ticker.remove(this.update, this);
        this.particles.forEach(p => p.gfx.destroy());
        this.particles = [];
        this.tweens = [];
        this.container.destroy({ children: true });
    }
}
