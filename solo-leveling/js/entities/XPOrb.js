import { COLORS } from '../utils/Constants.js';

export class XPOrbPool {
    constructor(scene) {
        this.scene = scene;
        this.group = scene.physics.add.group({
            maxSize: 200,
        });

        // Pre-create orbs
        for (let i = 0; i < 80; i++) {
            const orb = scene.physics.add.sprite(-100, -100, 'xp_orb');
            orb.setActive(false);
            orb.setVisible(false);
            orb.body.enable = false;
            orb.xpValue = 0;
            this.group.add(orb);
        }
    }

    spawn(x, y, xpValue) {
        // Spread multiple orbs for bigger values
        const orbCount = xpValue >= 50 ? 5 : xpValue >= 20 ? 3 : 1;
        const xpPerOrb = Math.ceil(xpValue / orbCount);

        for (let i = 0; i < orbCount; i++) {
            const orb = this.group.getChildren().find(o => !o.active);
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
        this.group.getChildren().forEach(orb => {
            this.scene.tweens.killTweensOf(orb);
        });
        this.group.clear(true, true);
    }
}
