import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class ShadowDagger extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.shadowDagger);
        this.projectiles = scene.physics.add.group({
            defaultKey: 'proj_dagger',
            maxSize: 30,
        });
    }

    fire() {
        for (let i = 0; i < this.count; i++) {
            this.scene.time.delayedCall(i * 100, () => this._throwDagger());
        }
    }

    _throwDagger() {
        const target = this.player.getClosestEnemy(6000);
        if (!target) return;

        const dagger = this.projectiles.get(this.player.x, this.player.y, 'proj_dagger');
        if (!dagger) return;

        dagger.setActive(true);
        dagger.setVisible(true);
        dagger.setDepth(8);
        dagger.body.enable = true;
        dagger.setScale(1.2);

        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
        const speed = 600;

        dagger.setRotation(angle + Math.PI / 2);
        dagger.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

        dagger.damageAmount = this.getDamage();

        // 비행 트레일 이펙트
        const trailInterval = this.scene.time.addEvent({
            delay: 40,
            repeat: -1,
            callback: () => {
                if (!dagger.active) { trailInterval.destroy(); return; }
                const trail = this.scene.add.circle(dagger.x, dagger.y, 3, 0xb366ff, 0.5).setDepth(7);
                this.scene.tweens.add({
                    targets: trail, alpha: 0, scale: 0,
                    duration: 200, onComplete: () => trail.destroy(),
                });
            },
        });

        // Auto-destroy after distance (~2.5s at speed 600 = 1500px range)
        this.scene.time.delayedCall(2500, () => {
            if (dagger.active) {
                dagger.setActive(false);
                dagger.setVisible(false);
                dagger.body.enable = false;
            }
            trailInterval.destroy();
        });
    }

    getProjectileGroup() {
        return this.projectiles;
    }

    destroy() {
        this.projectiles.destroy(true);
    }
}
