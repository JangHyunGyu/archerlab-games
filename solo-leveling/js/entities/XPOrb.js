export class XPOrbPool {
    constructor(scene, options = {}) {
        this.scene = scene;
        this._maxSize = options.maxSize ?? 200;
        this.group = scene.physics.add.group({
            maxSize: this._maxSize,
        });
        this._targetWarmSize = options.warmSize ?? 80;
        this._batchSize = options.batchSize ?? 12;
        this._batchDelay = options.batchDelay ?? 70;
        this._warmTimer = null;
        this._pickupFx = new Set();
        this._nextTrailAt = 0;

        const initialSize = Math.min(options.initialSize ?? 80, this._targetWarmSize);
        this._createInactiveOrbs(initialSize);

        if (this._targetWarmSize > initialSize) {
            this._warmTimer = scene.time.delayedCall(options.warmupDelay ?? 500, () => this._warmPool());
        }
    }

    _createInactiveOrb() {
        const orb = this.scene.physics.add.sprite(-100, -100, 'xp_orb');
        orb.setActive(false);
        orb.setVisible(false);
        orb.body.enable = false;
        orb.xpValue = 0;
        this.group.add(orb);
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
        const inactive = this.group.getChildren().find(o => !o.active);
        if (inactive) return inactive;
        if (this.group.getLength() >= this._maxSize) return null;
        return this._createInactiveOrb();
    }

    spawn(x, y, xpValue) {
        // Spread multiple orbs for bigger values
        const orbCount = xpValue >= 50 ? 5 : xpValue >= 20 ? 3 : 1;
        const xpPerOrb = Math.ceil(xpValue / orbCount);

        for (let i = 0; i < orbCount; i++) {
            const orb = this._getInactiveOrb();
            if (!orb) return;

            const isLarge = xpPerOrb >= 30;
            orb.setTexture(isLarge ? 'xp_orb_large' : 'xp_orb');
            orb.setPosition(
                x + Phaser.Math.Between(-15, 15),
                y + Phaser.Math.Between(-15, 15)
            );
            orb.setActive(true);
            orb.setVisible(true);
            orb.body.enable = true;
            orb.xpValue = xpPerOrb;
            orb._lastTrailAt = 0;
            orb.setDepth(4);
            orb.setAlpha(0.9);
            orb.setScale(isLarge ? 1.2 : 0.8);

            // Small burst outward
            const angle = Math.random() * Math.PI * 2;
            orb.body.setVelocity(
                Math.cos(angle) * Phaser.Math.Between(30, 80),
                Math.sin(angle) * Phaser.Math.Between(30, 80)
            );

            // Slow down
            orb.body.setDrag(100);

            // Kill any leftover tweens from previous use before creating new ones
            this.scene.tweens.killTweensOf(orb);

            // Pulsing glow
            this.scene.tweens.add({
                targets: orb,
                scaleX: orb.scaleX * 1.2,
                scaleY: orb.scaleY * 1.2,
                alpha: 1,
                duration: 400,
                yoyo: true,
                repeat: -1,
            });
        }
    }

    update(player) {
        if (!player || !player.active) return;

        const pickupRange = player.stats.pickupRange || 60;
        const magnetRange = pickupRange * 3;

        this.group.getChildren().forEach(orb => {
            if (!orb.active) return;

            const dist = Phaser.Math.Distance.Between(player.x, player.y, orb.x, orb.y);

            // Magnet effect - attract to player
            if (dist < magnetRange) {
                const angle = Phaser.Math.Angle.Between(orb.x, orb.y, player.x, player.y);
                const speed = 200 + (1 - dist / magnetRange) * 300;
                orb.body.setVelocity(
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed
                );
                this._maybeSpawnTrail(orb, angle, dist, pickupRange);
            }

            // Collect
            if (dist < pickupRange) {
                this._collect(orb, player);
            }
        });
    }

    _collect(orb, player) {
        const collectX = orb.x;
        const collectY = orb.y;
        const collectScale = orb.xpValue >= 30 ? 0.46 : 0.34;
        const leveled = player.addXP(orb.xpValue);

        if (this.scene.soundManager) this.scene.soundManager.play('xp');

        this._spawnCollectEffect(collectX, collectY, collectScale);

        orb.setActive(false);
        orb.setVisible(false);
        orb.body.enable = false;
        this.scene.tweens.killTweensOf(orb);

        if (leveled) {
            this.scene.onLevelUp();
        }
    }

    _maybeSpawnTrail(orb, angle, dist, pickupRange) {
        if (dist < pickupRange * 1.15) return;
        if (!this.scene?.textures?.exists('effect_pickup_xp_trail')) return;

        const now = this.scene.time?.now ?? 0;
        if (now < this._nextTrailAt) return;
        if (orb._lastTrailAt && now - orb._lastTrailAt < 180) return;

        this._nextTrailAt = now + 45;
        orb._lastTrailAt = now;
        this._spawnTrailEffect(orb.x, orb.y, angle);
    }

    _spawnTrailEffect(x, y, angle) {
        const trail = this._createPickupFx(x, y, 'effect_pickup_xp_trail', {
            depth: 3.8,
            alpha: 0.36,
            scale: 0.18,
            rotation: angle,
        });
        if (!trail) return;

        this.scene.tweens.add({
            targets: trail,
            alpha: 0,
            scaleX: 0.08,
            scaleY: 0.08,
            duration: 210,
            ease: 'Quad.easeOut',
            onComplete: () => this._destroyPickupFx(trail),
        });
    }

    _spawnCollectEffect(x, y, scale) {
        const burst = this._createPickupFx(x, y, 'effect_pickup_xp_collect', {
            depth: 15,
            alpha: 0.9,
            scale,
            rotation: Phaser.Math.FloatBetween(-0.25, 0.25),
        });
        if (!burst) return;

        this.scene.tweens.add({
            targets: burst,
            alpha: 0,
            scaleX: scale * 1.45,
            scaleY: scale * 1.45,
            angle: burst.angle + Phaser.Math.Between(-18, 18),
            duration: 260,
            ease: 'Quad.easeOut',
            onComplete: () => this._destroyPickupFx(burst),
        });
    }

    _createPickupFx(x, y, textureKey, { depth, alpha, scale, rotation }) {
        if (!this.scene?.textures?.exists(textureKey)) return null;
        const sprite = this.scene.add.sprite(x, y, textureKey)
            .setDepth(depth)
            .setAlpha(alpha)
            .setScale(scale)
            .setRotation(rotation)
            .setBlendMode(Phaser.BlendModes.ADD);
        this._pickupFx.add(sprite);
        return sprite;
    }

    _destroyPickupFx(sprite) {
        if (!sprite) return;
        this._pickupFx?.delete(sprite);
        if (sprite.scene) sprite.destroy();
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
            const tweens = this.scene?.tweens;
            const children = this.group?.getChildren?.();
            if (children) {
                children.forEach(orb => {
                    if (tweens) tweens.killTweensOf(orb);
                });
            }
            if (this._pickupFx) {
                this._pickupFx.forEach(sprite => {
                    if (tweens) tweens.killTweensOf(sprite);
                    if (sprite?.scene) sprite.destroy();
                });
                this._pickupFx.clear();
            }
            if (this.group) this.group.clear(true, true);
        } catch (e) { /* group already destroyed by scene shutdown */ }
        this._pickupFx = null;
        this.group = null;
        this.scene = null;
    }
}
