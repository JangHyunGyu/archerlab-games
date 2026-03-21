import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class BasicDagger extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.basicDagger);
        this.attackRange = 150;
        this.swingDir = 1;

        // Graphics object pool for dagger visuals
        this._gfxPool = [];
    }

    _getGfx() {
        let gfx = this._gfxPool.pop();
        if (!gfx || !gfx.scene) {
            gfx = this.scene.add.graphics().setDepth(8);
        } else {
            gfx.clear();
            gfx.setVisible(true);
            gfx.setAlpha(1);
        }
        return gfx;
    }

    _releaseGfx(gfx) {
        gfx.clear();
        gfx.setVisible(false);
        if (this._gfxPool.length < 10) {
            this._gfxPool.push(gfx);
        } else {
            gfx.destroy();
        }
    }

    fire() {
        for (let i = 0; i < this.count; i++) {
            this.scene.time.delayedCall(i * 120, () => this._slash());
        }
    }

    _slash() {
        const target = this.player.getClosestEnemy(this.attackRange + 50);

        let baseAngle;
        if (target) {
            baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
        } else {
            baseAngle = this.player.facingRight ? 0 : Math.PI;
        }

        this.swingDir *= -1;
        const px = this.player.x;
        const py = this.player.y;
        const slashRange = this.attackRange * 0.8;
        const arcSpan = Math.PI * 0.7; // 126 degree arc sweep
        const startAngle = baseAngle - (arcSpan / 2) * this.swingDir;
        const endAngle = baseAngle + (arcSpan / 2) * this.swingDir;

        // Main blade + 3 after-image trails
        const gfx = this._getGfx();
        const trails = [];
        for (let i = 0; i < 3; i++) trails.push(this._getGfx());

        const arcHistory = [];
        let progress = { t: 0 };

        this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 160,
            ease: 'Cubic.easeOut',
            onUpdate: () => {
                const t = progress.t;
                const bladeAngle = startAngle + (endAngle - startAngle) * t;
                const reach = t < 0.25 ? t / 0.25 : 1;
                const dist = 16 + slashRange * reach;
                const fadeAlpha = Math.min(1, (1 - t) * 2);

                const tipX = px + Math.cos(bladeAngle) * dist;
                const tipY = py + Math.sin(bladeAngle) * dist;
                const hiltX = px + Math.cos(bladeAngle) * 16;
                const hiltY = py + Math.sin(bladeAngle) * 16;

                arcHistory.push({ tipX, tipY, hiltX, hiltY, bladeAngle, fadeAlpha });

                // ── After-image trails ──
                for (let i = 0; i < trails.length; i++) {
                    trails[i].clear();
                    const idx = arcHistory.length - 1 - (i + 1) * 2;
                    if (idx >= 0) {
                        const h = arcHistory[idx];
                        const ta = h.fadeAlpha * (0.25 - i * 0.06);
                        this._drawNinjaBlade(trails[i], h.tipX, h.tipY, h.hiltX, h.hiltY, h.bladeAngle, ta, 0x8899aa);
                    }
                }

                // ── Arc slash trail (crescent effect) ──
                gfx.clear();
                if (arcHistory.length > 3) {
                    const start = Math.max(0, arcHistory.length - 10);
                    gfx.lineStyle(3, 0xccddee, 0.35 * fadeAlpha);
                    gfx.beginPath();
                    gfx.moveTo(arcHistory[start].tipX, arcHistory[start].tipY);
                    for (let i = start + 1; i < arcHistory.length; i++) {
                        gfx.lineTo(arcHistory[i].tipX, arcHistory[i].tipY);
                    }
                    gfx.strokePath();
                    // Inner bright arc
                    gfx.lineStyle(1.5, 0xffffff, 0.5 * fadeAlpha);
                    gfx.beginPath();
                    gfx.moveTo(arcHistory[start].tipX, arcHistory[start].tipY);
                    for (let i = start + 1; i < arcHistory.length; i++) {
                        gfx.lineTo(arcHistory[i].tipX, arcHistory[i].tipY);
                    }
                    gfx.strokePath();
                }

                // ── Main blade ──
                this._drawNinjaBlade(gfx, tipX, tipY, hiltX, hiltY, bladeAngle, fadeAlpha, 0xeef0ff);

                // ── Speed lines (ninja slash feel) ──
                if (t > 0.1 && t < 0.7) {
                    const lineAlpha = (1 - t) * 0.4;
                    for (let s = 0; s < 3; s++) {
                        const offset = (s - 1) * 8;
                        const lx = tipX + Math.cos(bladeAngle + Math.PI / 2) * offset;
                        const ly = tipY + Math.sin(bladeAngle + Math.PI / 2) * offset;
                        const len = 12 + s * 4;
                        gfx.lineStyle(1, 0xffffff, lineAlpha);
                        gfx.lineBetween(
                            lx, ly,
                            lx + Math.cos(bladeAngle) * len,
                            ly + Math.sin(bladeAngle) * len
                        );
                    }
                }
            },
            onComplete: () => {
                this._releaseGfx(gfx);
                for (const trail of trails) this._releaseGfx(trail);
            },
        });

        // Deal damage at arc midpoint (wider hit angle than stab)
        this.scene.time.delayedCall(40, () => {
            const enemies = this.player.getAllEnemies();
            for (const enemy of enemies) {
                if (!enemy.active) continue;
                const dist = Phaser.Math.Distance.Between(px, py, enemy.x, enemy.y);
                if (dist > this.attackRange) continue;

                const enemyAngle = Phaser.Math.Angle.Between(px, py, enemy.x, enemy.y);
                const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - baseAngle));
                if (angleDiff < arcSpan / 2 + 0.15) {
                    enemy.takeDamage(this.getDamage(), px, py);
                    if (this.scene.soundManager) this.scene.soundManager.play('hit');

                    // Silver slash impact
                    const spark = this.scene.add.circle(
                        enemy.x + Phaser.Math.Between(-5, 5),
                        enemy.y + Phaser.Math.Between(-5, 5),
                        4, 0xeef4ff, 0.9
                    ).setDepth(9);
                    this.scene.tweens.add({
                        targets: spark, alpha: 0, scale: 2.5,
                        duration: 180, onComplete: () => spark.destroy(),
                    });
                    // Cross slash mark
                    const cross = this.scene.add.text(
                        enemy.x, enemy.y, '✕',
                        { fontSize: '16px', color: '#ffffff' }
                    ).setOrigin(0.5).setDepth(9).setAlpha(0.8);
                    this.scene.tweens.add({
                        targets: cross, alpha: 0, scale: 2, rotation: 0.5,
                        duration: 250, onComplete: () => cross.destroy(),
                    });
                }
            }
        });

        if (this.scene.soundManager) this.scene.soundManager.play('dagger');
    }

    _drawNinjaBlade(gfx, tipX, tipY, hiltX, hiltY, angle, alpha, color) {
        const perpX = -Math.sin(angle);
        const perpY = Math.cos(angle);
        const bladeW = 5;
        const bladeLen = Math.sqrt((tipX - hiltX) ** 2 + (tipY - hiltY) ** 2);

        // Blade widest point (25% from hilt)
        const wp = 0.25;
        const wideX = hiltX + (tipX - hiltX) * wp;
        const wideY = hiltY + (tipY - hiltY) * wp;
        // Blade belly (55% from hilt, slightly narrower)
        const bp = 0.55;
        const bellyX = hiltX + (tipX - hiltX) * bp;
        const bellyY = hiltY + (tipY - hiltY) * bp;
        const bellyW = bladeW * 0.7;

        // Silver glow aura
        gfx.fillStyle(0xddeeff, 0.1 * alpha);
        gfx.fillTriangle(tipX, tipY, wideX + perpX * (bladeW + 6), wideY + perpY * (bladeW + 6), hiltX, hiltY);
        gfx.fillTriangle(tipX, tipY, wideX - perpX * (bladeW + 6), wideY - perpY * (bladeW + 6), hiltX, hiltY);

        // Dark side of blade (shadow face)
        gfx.fillStyle(0x8899aa, 0.85 * alpha);
        gfx.beginPath();
        gfx.moveTo(hiltX, hiltY);
        gfx.lineTo(wideX - perpX * bladeW, wideY - perpY * bladeW);
        gfx.lineTo(bellyX - perpX * bellyW, bellyY - perpY * bellyW);
        gfx.lineTo(tipX, tipY);
        gfx.closePath(); gfx.fillPath();

        // Bright side of blade (lit face - silver/white)
        gfx.fillStyle(0xdde4ee, 0.95 * alpha);
        gfx.beginPath();
        gfx.moveTo(hiltX, hiltY);
        gfx.lineTo(wideX + perpX * bladeW, wideY + perpY * bladeW);
        gfx.lineTo(bellyX + perpX * bellyW, bellyY + perpY * bellyW);
        gfx.lineTo(tipX, tipY);
        gfx.closePath(); gfx.fillPath();

        // Center ridge (bright white line down the blade)
        gfx.lineStyle(1.2, 0xffffff, 0.8 * alpha);
        gfx.lineBetween(hiltX, hiltY, tipX, tipY);

        // Cutting edge highlight (razor sharp glint)
        gfx.lineStyle(0.8, 0xffffff, 0.95 * alpha);
        gfx.lineBetween(
            hiltX + perpX * bladeW * 0.3, hiltY + perpY * bladeW * 0.3,
            tipX, tipY
        );

        // Tip glint
        if (alpha > 0.2) {
            gfx.fillStyle(0xffffff, 0.9 * alpha);
            gfx.fillCircle(tipX, tipY, 2.5);
            gfx.fillStyle(0xddeeff, 0.3 * alpha);
            gfx.fillCircle(tipX, tipY, 5);
        }

        // Handle (dark wrapped grip)
        const hEndX = hiltX - Math.cos(angle) * 7;
        const hEndY = hiltY - Math.sin(angle) * 7;
        gfx.lineStyle(3, 0x222233, 0.7 * alpha);
        gfx.lineBetween(hEndX, hEndY, hiltX, hiltY);
        // Handle wrap marks
        for (let w = 0; w < 3; w++) {
            const t = 0.2 + w * 0.3;
            const wx = hEndX + (hiltX - hEndX) * t;
            const wy = hEndY + (hiltY - hEndY) * t;
            gfx.lineStyle(1, 0x444455, 0.5 * alpha);
            gfx.lineBetween(wx + perpX * 2, wy + perpY * 2, wx - perpX * 2, wy - perpY * 2);
        }

        // Guard (cross-guard, metallic)
        gfx.lineStyle(2.5, 0x99aabb, 0.6 * alpha);
        gfx.lineBetween(hiltX + perpX * 5, hiltY + perpY * 5, hiltX - perpX * 5, hiltY - perpY * 5);
        // Guard highlight
        gfx.lineStyle(1, 0xddeeff, 0.4 * alpha);
        gfx.lineBetween(hiltX + perpX * 4, hiltY + perpY * 4, hiltX - perpX * 4, hiltY - perpY * 4);
    }

    destroy() {
        for (const gfx of this._gfxPool) {
            if (gfx && gfx.scene) gfx.destroy();
        }
        this._gfxPool = [];
    }
}
