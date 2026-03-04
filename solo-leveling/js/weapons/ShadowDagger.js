import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class ShadowDagger extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.shadowDagger);
        this._activeDaggers = [];
    }

    fire() {
        for (let i = 0; i < this.count; i++) {
            this.scene.time.delayedCall(i * 100, () => this._throwDagger());
        }
    }

    _throwDagger() {
        const target = this.player.getClosestEnemy(6000);
        if (!target) return;

        const px = this.player.x;
        const py = this.player.y;
        const angle = Phaser.Math.Angle.Between(px, py, target.x, target.y);
        const range = 1500;
        const endX = px + Math.cos(angle) * range;
        const endY = py + Math.sin(angle) * range;
        const duration = 2500; // 600px/s * 2.5s = 1500px
        const dmg = this.getDamage();

        // 단검 스프라이트 생성 (physics body 없이)
        const dagger = this.scene.add.sprite(px, py, 'proj_dagger')
            .setDepth(8)
            .setScale(1.2)
            .setRotation(angle + Math.PI / 2);

        let hasHit = false;
        let trailInterval = null;

        const cleanup = () => {
            if (trailInterval) { trailInterval.destroy(); trailInterval = null; }
            if (dagger.active) dagger.destroy();
        };

        // 트윈으로 직선 이동
        this.scene.tweens.add({
            targets: dagger,
            x: endX,
            y: endY,
            duration: duration,
            ease: 'Linear',
            onUpdate: () => {
                if (hasHit || !dagger.active) return;
                const enemies = this.player.getAllEnemies();
                for (const enemy of enemies) {
                    if (!enemy.active) continue;
                    const dist = Phaser.Math.Distance.Between(dagger.x, dagger.y, enemy.x, enemy.y);
                    if (dist < 25) {
                        enemy.takeDamage(dmg, dagger.x, dagger.y);
                        if (this.scene.soundManager) this.scene.soundManager.play('hit');
                        hasHit = true;
                        const sx = dagger.x, sy = dagger.y;
                        cleanup();
                        const spark = this.scene.add.circle(sx, sy, 6, 0xb366ff, 0.8).setDepth(9);
                        this.scene.tweens.add({
                            targets: spark, alpha: 0, scale: 3,
                            duration: 200, onComplete: () => spark.destroy(),
                        });
                        return;
                    }
                }
            },
            onComplete: () => cleanup(),
        });

        // 트레일 이펙트
        trailInterval = this.scene.time.addEvent({
            delay: 50,
            repeat: duration / 50,
            callback: () => {
                if (!dagger.active) return;
                const trail = this.scene.add.circle(dagger.x, dagger.y, 3, 0xb366ff, 0.4).setDepth(7);
                this.scene.tweens.add({
                    targets: trail, alpha: 0, scale: 0,
                    duration: 180, onComplete: () => trail.destroy(),
                });
            },
        });
    }

    destroy() {}
}
