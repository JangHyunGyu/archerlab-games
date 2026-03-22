import { COLORS } from '../utils/Constants.js';

/**
 * 아이템 드롭 시스템
 * 적 처치 시 일정 확률로 HP 포션, 버프 아이템 드롭
 */

const ITEM_TYPES = {
    hpPotion: {
        name: 'HP 포션',
        color: 0xff4444,
        dropRate: 0.08,
        effect: (player, scene) => {
            const healAmount = Math.floor(player.stats.maxHp * 0.08);
            player.heal(healAmount);
            scene.systemMessage?.show('[시스템]', [`HP가 ${healAmount} 회복되었습니다.`], { duration: 1500 });
        },
    },
    manaCrystal: {
        name: '마나 크리스탈',
        color: 0x4488ff,
        dropRate: 0.05,
        effect: (player, scene) => {
            // Temporary cooldown reduction for 10 seconds
            const originalCDR = player.stats.cooldownReduction;
            player.stats.cooldownReduction = Math.min(0.5, originalCDR + 0.2);
            scene.systemMessage?.show('[시스템]', ['마나 크리스탈 사용: 쿨타임 감소 10초'], { duration: 1500 });
            scene.time.delayedCall(10000, () => {
                player.stats.cooldownReduction = originalCDR;
            });
        },
    },
    shadowEssence: {
        name: '그림자 정수',
        color: 0x9b44ff,
        dropRate: 0.03,
        effect: (player, scene) => {
            // Temporary attack boost for 15 seconds
            player._tempAtkBuff = (player._tempAtkBuff || 0) + 0.5;
            scene.systemMessage?.show('[시스템]', ['그림자 정수 흡수: 공격력 50% 증가 15초'], { duration: 1500, type: 'arise' });
            scene.time.delayedCall(15000, () => {
                player._tempAtkBuff = Math.max(0, (player._tempAtkBuff || 0) - 0.5);
            });
        },
    },
};

export class ItemDropManager {
    constructor(scene) {
        this.scene = scene;
        this.items = [];
    }

    tryDrop(x, y) {
        for (const [key, config] of Object.entries(ITEM_TYPES)) {
            if (Math.random() < config.dropRate) {
                this._spawnItem(x, y, key, config);
                return; // Only one item per kill
            }
        }
    }

    _spawnItem(x, y, key, config) {
        // Item visual
        const item = this.scene.add.circle(x, y, 8, config.color, 0.9)
            .setDepth(5);

        // Inner glow
        const glow = this.scene.add.circle(x, y, 12, config.color, 0.2)
            .setDepth(4);

        // Plus sign for HP potion
        if (key === 'hpPotion') {
            const plus = this.scene.add.text(x, y, '+', {
                fontSize: '12px', fontFamily: 'Arial', fontStyle: 'bold',
                color: '#ffffff',
            }).setOrigin(0.5).setDepth(6);
            item._plusText = plus;
        }

        // Float animation
        this.scene.tweens.add({
            targets: [item, glow],
            y: y - 5,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Glow pulse
        this.scene.tweens.add({
            targets: glow,
            alpha: 0.4,
            scaleX: 1.5,
            scaleY: 1.5,
            duration: 600,
            yoyo: true,
            repeat: -1,
        });

        item._glow = glow;
        item._key = key;
        item._config = config;
        item._lifetime = 15000; // 15 seconds
        item._spawnTime = this.scene.time.now;

        this.items.push(item);
    }

    update(player, delta) {
        if (!player) return;

        const now = this.scene.time.now;

        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];

            // Check lifetime
            if (now - item._spawnTime > item._lifetime) {
                this._destroyItem(item, i);
                continue;
            }

            // Flash when about to expire
            if (now - item._spawnTime > item._lifetime - 3000) {
                item.setAlpha(Math.sin(now * 0.01) > 0 ? 0.9 : 0.3);
            }

            // Pickup check
            const dist = Phaser.Math.Distance.Between(player.x, player.y, item.x, item.y);
            const pickupRange = player.stats.pickupRange || 100;
            const magnetRange = pickupRange * 3;

            // Magnet attraction effect
            if (dist < magnetRange && dist > pickupRange) {
                // Kill float/glow tweens on first attract so they don't fight the pull
                if (!item._attracted) {
                    item._attracted = true;
                    this.scene.tweens.killTweensOf(item);
                    if (item._glow) this.scene.tweens.killTweensOf(item._glow);
                }

                const angle = Phaser.Math.Angle.Between(item.x, item.y, player.x, player.y);
                const speed = (200 + (1 - dist / magnetRange) * 400) * (delta / 1000);
                const dx = Math.cos(angle) * speed;
                const dy = Math.sin(angle) * speed;
                item.x += dx;
                item.y += dy;
                if (item._glow) { item._glow.x += dx; item._glow.y += dy; }
                if (item._plusText) { item._plusText.x += dx; item._plusText.y += dy; }
            }

            if (dist < pickupRange) {
                // Collect
                item._config.effect(player, this.scene);

                if (this.scene.soundManager) {
                    this.scene.soundManager.play('potion');
                }

                // Collect effect
                const burst = this.scene.add.circle(item.x, item.y, 5, item._config.color, 0.8)
                    .setDepth(15);
                this.scene.tweens.add({
                    targets: burst,
                    alpha: 0,
                    scale: 4,
                    duration: 300,
                    onComplete: () => burst.destroy(),
                });

                this._destroyItem(item, i);
            }
        }
    }

    _destroyItem(item, index) {
        this.scene.tweens.killTweensOf(item);
        if (item._glow) {
            this.scene.tweens.killTweensOf(item._glow);
            item._glow.destroy();
        }
        if (item._plusText) item._plusText.destroy();
        item.destroy();
        this.items.splice(index, 1);
    }

    destroy() {
        const tweens = this.scene?.tweens;
        this.items.forEach(item => {
            if (tweens) tweens.killTweensOf(item);
            if (item._glow) { if (tweens) tweens.killTweensOf(item._glow); item._glow.destroy(); }
            if (item._plusText) item._plusText.destroy();
            item.destroy();
        });
        this.items = [];
    }
}
