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

    update(ticker) {
        const delta = ticker.deltaTime;
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
            try {
                if (this.tweens[i].update(dt)) {
                    this.tweens.splice(i, 1);
                }
            } catch (e) {
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
            gfx.circle(0, 0, size * 1.5).fill({ color, alpha: 0.3 });
            // Main particle
            gfx.roundRect(-size / 2, -size / 2, size, size, size * 0.3).fill({ color });
            // Bright center
            gfx.circle(0, 0, size * 0.25).fill({ color: 0xFFFFFF, alpha: 0.7 });

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
            gfx.circle(0, 0, size).fill({ color: 0xFFFFFF, alpha: 0.8 });
            gfx.circle(0, 0, size * 2).fill({ color, alpha: 0.4 });

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

    // ── Star-shaped burst particles (for high combos) ──
    spawnStarParticles(worldX, worldY, color, count = 10) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.5;
            const speed = 3 + Math.random() * 5;
            const size = 2 + Math.random() * 4;
            const gfx = new PIXI.Graphics();

            // 4-pointed star shape
            gfx.star(0, 0, 4, size, size * 0.4).fill({ color, alpha: 0.9 });
            gfx.circle(0, 0, size * 0.3).fill({ color: 0xFFFFFF, alpha: 0.8 });

            gfx.position.set(worldX, worldY);
            this.container.addChild(gfx);

            this.particles.push({
                gfx,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                rotSpeed: (Math.random() - 0.5) * 0.3,
                gravity: 0.05,
                baseScale: 0.8 + Math.random() * 0.6,
                shrink: 0.6,
                life: 600 + Math.random() * 500,
                maxLife: 1100,
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
            g.rect(0, 0, 20, cs).fill({ color: 0xFFFFFF, alpha: 0.6 });
            g.rect(-10, 0, 40, cs).fill({ color: 0x44FF88, alpha: 0.3 });

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
            g.rect(0, 0, cs, 20).fill({ color: 0xFFFFFF, alpha: 0.6 });
            g.rect(0, -10, cs, 40).fill({ color: 0x44FF88, alpha: 0.3 });

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

    // ── Combo popup (tier-based) ──
    showComboPopup(x, y, comboLevel, tier = 1) {
        const colors = [0xFFFFFF, 0x76FF03, 0x00E5FF, 0xFFD600, 0xFF1744, 0xD500F9, 0xFF6D00, 0xFF4081];
        const color = colors[Math.min(comboLevel - 1, colors.length - 1)];

        // Scale text based on tier
        const sizeMultiplier = tier === 3 ? 1.6 : tier === 2 ? 1.3 : 1.0;
        const size = Math.max(24, this.game.cellSize * 0.9) * sizeMultiplier;

        const style = {
            fontFamily: 'Orbitron, sans-serif',
            fontSize: size,
            fill: color,
            fontWeight: '900',
            dropShadow: { color: 0x000000, blur: 8 + tier * 4, distance: 3 },
            stroke: { color: 0x000000, width: 4 + tier },
            letterSpacing: 2 + tier * 2,
        };

        const comboText = tier === 3 ? `★ COMBO x${comboLevel}! ★` :
                          tier === 2 ? `COMBO x${comboLevel}!` :
                          `COMBO x${comboLevel}!`;

        const txt = new PIXI.Text({ text: comboText, style });
        txt.anchor.set(0.5);
        txt.position.set(x, y);
        txt.alpha = 0;
        this.container.addChild(txt);

        // Spawn sparkles around combo text
        const sparkleCount = tier === 3 ? 30 : tier === 2 ? 20 : Math.min(comboLevel * 3, 15);
        this.spawnSparkles(x, y, color, sparkleCount);

        // Tier 3: star burst around text
        if (tier === 3) {
            this.spawnStarParticles(x, y, color, 12);
        }

        const startY = y;
        const duration = 1400 + tier * 300;
        this.tweens.push({
            elapsed: 0,
            duration,
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);

                // Pop in with elastic
                if (t < 0.2) {
                    const p = t / 0.2;
                    txt.alpha = easeOutCubic(p);
                    txt.scale.set(easeOutElastic(p) * (1 + tier * 0.1));
                } else if (t < 0.5) {
                    txt.alpha = 1;
                    const pulse = 1 + Math.sin((t - 0.2) / 0.3 * Math.PI * (4 + tier * 2)) * (0.06 + tier * 0.03) * (1 - (t - 0.2) / 0.3);
                    txt.scale.set(pulse);
                } else {
                    txt.alpha = 1 - easeInOutQuad((t - 0.5) / 0.5);
                    txt.scale.set(1 - (t - 0.5) * 0.3);
                }

                txt.y = startY - easeOutCubic(t) * (90 + tier * 20);
                txt.rotation = Math.sin(t * Math.PI * (6 + tier * 2)) * (0.02 + tier * 0.015) * (1 - t);

                if (t >= 1) {
                    txt.destroy();
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

    // ── Screen Zoom Pulse ──
    playScreenZoomPulse(intensity, duration) {
        const gc = this.game.gameContainer;
        if (!gc) return;
        const w = this.game.app.screen.width;
        const h = this.game.app.screen.height;

        this.tweens.push({
            elapsed: 0,
            duration,
            update(dt) {
                this.elapsed += dt;
                const t = Math.min(this.elapsed / this.duration, 1);
                const scale = 1 + intensity * Math.sin(t * Math.PI) * (1 - t);
                gc.scale.set(scale);
                gc.pivot.set(w / 2, h / 2);
                gc.position.set(w / 2, h / 2);

                if (t >= 1) {
                    gc.scale.set(1);
                    gc.pivot.set(0, 0);
                    gc.position.set(0, 0);
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
            const gfx = new PIXI.Graphics();
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
        flash.rect(0, 0, w, h).fill({ color: 0xFFFFFF, alpha: 0.3 });
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

        // Multi-ring wave burst
        this.playMultiRingWave(x, y, 3, [0xFF4081, 0xFFD600, 0x00E5FF], 150);
        this.playRadialRays(x, y, 8, 0xFFD600, 120);

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
                wave.circle(0, 0, radius).stroke({ width: thickness, color: 0xFFFFFF, alpha: alpha * 0.4 });
                // Inner bright ring
                wave.circle(0, 0, radius * 0.85).stroke({ width: thickness * 0.5, color: 0x44FF88, alpha: alpha * 0.6 });
                // Fill glow
                wave.circle(0, 0, radius).fill({ color: 0xFFFFFF, alpha: alpha * 0.03 });
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
            gfx.circle(0, 0, size).fill({ color: pColor, alpha: 0.8 });
            gfx.circle(0, 0, size * 2).fill({ color: pColor, alpha: 0.3 });
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
