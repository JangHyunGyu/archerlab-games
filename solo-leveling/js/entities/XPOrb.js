import { COLORS } from '../utils/Constants.js';

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
            }

            // Collect
            if (dist < pickupRange) {
                this._collect(orb, player);
            }
        });
    }

    _collect(orb, player) {
        const leveled = player.addXP(orb.xpValue);

        if (this.scene.soundManager) this.scene.soundManager.play('xp');

        // Collect effect
        const flash = this.scene.add.circle(orb.x, orb.y, 8, COLORS.XP_ORB, 0.6).setDepth(15);
        this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            scale: 2,
            duration: 200,
            onComplete: () => flash.destroy(),
        });

        orb.setActive(false);
        orb.setVisible(false);
        orb.body.enable = false;
        this.scene.tweens.killTweensOf(orb);

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
            const tweens = this.scene?.tweens;
            const children = this.group?.getChildren?.();
            if (children) {
                children.forEach(orb => {
                    if (tweens) tweens.killTweensOf(orb);
                });
            }
            if (this.group) this.group.clear(true, true);
        } catch (e) { /* group already destroyed by scene shutdown */ }
        this.group = null;
        this.scene = null;
    }
}
