export class XPOrbPool {
    constructor(scene, options = {}) {
        this.scene = scene;
        this._maxSize = options.maxSize !== undefined ? options.maxSize : 200;
        this.group = scene.physics.add.group({
            maxSize: this._maxSize,
        });
        this._targetWarmSize = options.warmSize !== undefined ? options.warmSize : 80;
        this._batchSize = options.batchSize !== undefined ? options.batchSize : 12;
        this._batchDelay = options.batchDelay !== undefined ? options.batchDelay : 70;
        this._warmTimer = null;
        this._inactiveOrbs = [];
        this._activeOrbs = [];
        this._pulseClock = 0;

        const initialSize = Math.min(options.initialSize !== undefined ? options.initialSize : 80, this._targetWarmSize);
        this._createInactiveOrbs(initialSize);

        if (this._targetWarmSize > initialSize) {
            this._warmTimer = scene.time.delayedCall(options.warmupDelay !== undefined ? options.warmupDelay : 500, () => this._warmPool());
        }
    }

    _createInactiveOrb() {
        const orb = this.scene.physics.add.sprite(-100, -100, 'xp_orb');
        orb.setActive(false);
        orb.setVisible(false);
        orb.body.enable = false;
        orb.xpValue = 0;
        orb._activeIndex = -1;
        orb._baseScale = 0.8;
        orb._pulsePhase = Math.random() * Math.PI * 2;
        this.group.add(orb);
        this._inactiveOrbs.push(orb);
        return orb;
    }

    _createInactiveOrbs(count) {
        for (let i = 0; i < count; i++) {
            this._createInactiveOrb();
        }
    }

    _warmPool() {
        if (!this.scene || !this.group) return;
        const currentSize = this.group.getLength();
        const remaining = this._targetWarmSize - currentSize;
        if (remaining <= 0) {
            this._warmTimer = null;
            return;
        }

        this._createInactiveOrbs(Math.min(this._batchSize, remaining));
        this._warmTimer = this.scene.time.delayedCall(this._batchDelay, () => this._warmPool());
    }

    _getInactiveOrb() {
        while (this._inactiveOrbs.length > 0) {
            const candidate = this._inactiveOrbs.pop();
            if (candidate && !candidate.active && candidate.scene === this.scene) {
                return candidate;
            }
        }
        if (this.group.getLength() >= this._maxSize) return null;
        const orb = this._createInactiveOrb();
        if (this._inactiveOrbs.length > 0 && this._inactiveOrbs[this._inactiveOrbs.length - 1] === orb) {
            this._inactiveOrbs.pop();
        }
        return orb;
    }

    _removeFromActive(orb) {
        const idx = orb._activeIndex;
        if (idx !== undefined && idx >= 0 && this._activeOrbs[idx] === orb) {
            const last = this._activeOrbs.pop();
            if (idx < this._activeOrbs.length && last) {
                this._activeOrbs[idx] = last;
                last._activeIndex = idx;
            }
        } else {
            const fallbackIdx = this._activeOrbs.indexOf(orb);
            if (fallbackIdx >= 0) {
                const last = this._activeOrbs.pop();
                if (fallbackIdx < this._activeOrbs.length && last) {
                    this._activeOrbs[fallbackIdx] = last;
                    last._activeIndex = fallbackIdx;
                }
            }
        }
        orb._activeIndex = -1;
    }

    spawn(x, y, xpValue) {
        // Consolidate multi-orb splits once 80+ active orbs exist on field
        const activeCount = this._activeOrbs.length;
        const orbCount = activeCount >= 80 ? 1 : (xpValue >= 50 ? 5 : xpValue >= 20 ? 3 : 1);
        const xpPerOrb = Math.ceil(xpValue / orbCount);

        for (let i = 0; i < orbCount; i++) {
            const orb = this._getInactiveOrb();
            if (!orb) {
                if (this._activeOrbs.length > 0) {
                    const fallback = this._activeOrbs[i % this._activeOrbs.length];
                    if (fallback && fallback.active) {
                        fallback.xpValue += xpPerOrb * (orbCount - i);
                        if (fallback.xpValue >= 30 && fallback._baseScale < 1.2) {
                            fallback.setTexture('xp_orb_large');
                            fallback._baseScale = 1.2;
                            fallback.setScale(1.2);
                        }
                    }
                }
                return;
            }

            const isLarge = xpPerOrb >= 30;
            const baseScale = isLarge ? 1.2 : 0.8;
            orb._baseScale = baseScale;
            orb._pulsePhase = Math.random() * Math.PI * 2;
            orb.setTexture(isLarge ? 'xp_orb_large' : 'xp_orb');
            orb.setPosition(
                x + Phaser.Math.Between(-15, 15),
                y + Phaser.Math.Between(-15, 15)
            );
            orb.setActive(true);
            orb.setVisible(true);
            orb.body.enable = true;
            orb.xpValue = xpPerOrb;
            orb.setDepth(4);
            orb.setAlpha(0.95);
            orb.setScale(baseScale);

            // Small burst outward
            const angle = Math.random() * Math.PI * 2;
            orb.body.setVelocity(
                Math.cos(angle) * Phaser.Math.Between(30, 80),
                Math.sin(angle) * Phaser.Math.Between(30, 80)
            );

            // Slow down
            orb.body.setDrag(100);

            orb._activeIndex = this._activeOrbs.length;
            this._activeOrbs.push(orb);
        }
    }

    update(playerOrDelta, maybePlayer) {
        let player = playerOrDelta;
        let delta = typeof maybePlayer === 'number' ? maybePlayer : 16.67;
        if (typeof playerOrDelta === 'number') {
            delta = playerOrDelta;
            player = maybePlayer;
        } else if (this.scene && this.scene.game && this.scene.game.loop) {
            delta = this.scene.game.loop.delta || 16.67;
        }
        if (!player || !player.active) return;

        const active = this._activeOrbs;
        const lowQuality = !!(this.scene && this.scene._lowQuality);
        const cam = !lowQuality && this.scene && this.scene.cameras ? this.scene.cameras.main : null;
        const view = cam && cam.worldView ? cam.worldView : null;
        this._pulseClock = (this._pulseClock || 0) + delta * 0.008;
        const pulseClock = this._pulseClock;

        const pickupRange = player.stats.pickupRange || 60;
        const magnetRange = pickupRange * 3;
        const magnetRangeSq = magnetRange * magnetRange;

        for (let i = active.length - 1; i >= 0; i--) {
            const orb = active[i];
            if (!orb || !orb.active) {
                if (orb) this._removeFromActive(orb);
                else active.splice(i, 1);
                continue;
            }

            const dx = player.x - orb.x;
            const dy = player.y - orb.y;
            const distSq = dx * dx + dy * dy;

            if (!lowQuality && (!view || (
                orb.x >= view.x - 32 && orb.x <= view.right + 32 &&
                orb.y >= view.y - 32 && orb.y <= view.bottom + 32
            ))) {
                const s = (orb._baseScale || 0.8) * (1 + Math.sin(pulseClock + (orb._pulsePhase || 0)) * 0.12);
                orb.setScale(s);
            }

            if (distSq >= magnetRangeSq) continue;

            const dist = Math.sqrt(distSq);

            // Magnet effect - attract to player
            if (dist < magnetRange) {
                const invDist = dist > 0.0001 ? 1 / dist : 0;
                const speed = 200 + (1 - dist / magnetRange) * 300;
                orb.body.setVelocity(dx * invDist * speed, dy * invDist * speed);
            }

            // Collect. A level-up pauses the scene, but this loop is already running,
            // so later orbs in the same pickup would spend the next level with no skill.
            if (dist < pickupRange) {
                if (this.scene._levelUpActive) return;
                this._collect(orb, player);
            }
        }
    }

    _collect(orb, player) {
        const leveled = player.addXP(orb.xpValue);

        if (this.scene.soundManager) this.scene.soundManager.play('xp');

        orb.setActive(false);
        orb.setVisible(false);
        orb.body.enable = false;
        this._removeFromActive(orb);
        if (this._inactiveOrbs.length < this._maxSize) {
            this._inactiveOrbs.push(orb);
        }

        if (leveled) {
            this.scene.onLevelUp();
        }
    }

    getGroup() {
        return this.group;
    }

    destroy() {
        try {
            if (this._warmTimer) {
                this._warmTimer.remove(false);
                this._warmTimer = null;
            }
            if (this.group) this.group.clear(true, true);
        } catch (e) { /* group already destroyed by scene shutdown */ }
        this._inactiveOrbs = [];
        this._activeOrbs = [];
        this.group = null;
        this.scene = null;
    }
}
