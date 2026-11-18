import { t, tf } from '../utils/i18n.js?v=20260928-locale-exports-v1';
import { COLORS } from '../utils/Constants.js';

/**
 * 아이템 드롭 시스템
 * 적 처치 시 일정 확률로 HP 포션, 버프 아이템 드롭
 */

const ITEM_TYPES = {
    hpPotion: {
        name: 'HP 포션',
        color: 0xff4444,
        asset: 'item_hp_potion',
        sound: 'potion',
        dropRate: 0.08,
        effect: (player, scene) => { var __oc0;
            const healAmount = Math.floor(player.stats.maxHp * 0.08);
            player.heal(healAmount);
            (((__oc0 = scene.systemMessage) === null || __oc0 === void 0 ? void 0 : __oc0.show(t('sysSystem'), [tf('itemHpRestored', { n: healAmount })], { duration: 1500 })));
        },
    },
    manaCrystal: {
        name: '마나 크리스탈',
        color: 0x4488ff,
        asset: 'item_mana_crystal',
        sound: 'mana',
        dropRate: 0.05,
        effect: (player, scene) => { var __oc1, __oc2, __oc3;
            // Temporary cooldown reduction for 10 seconds
            const bonus = 0.2;
            player._tempCooldownReduction = Math.max(0, (player._tempCooldownReduction || 0) + bonus);
            (((__oc1 = player._recalcStat) === null || __oc1 === void 0 ? void 0 : __oc1.call(player, 'cooldownReduction')));
            (((__oc2 = scene.systemMessage) === null || __oc2 === void 0 ? void 0 : __oc2.show(t('sysSystem'), [t('itemManaCrystal')], { duration: 1500 })));
            (((__oc3 = scene.itemDropManager) === null || __oc3 === void 0 ? void 0 : __oc3._delay(10000, () => {
        var __oc203;
        if (!((player === null || player === void 0 ? void 0 : player.scene)))
            return;
        player._tempCooldownReduction = Math.max(0, (player._tempCooldownReduction || 0) - bonus);
        (((__oc203 = player._recalcStat) === null || __oc203 === void 0 ? void 0 : __oc203.call(player, 'cooldownReduction')));
    })));
        },
    },
    shadowEssence: {
        name: '그림자 정수',
        color: 0x9b44ff,
        asset: 'item_shadow_essence',
        sound: 'essence',
        dropRate: 0.03,
        effect: (player, scene) => { var __oc4, __oc5;
            // Temporary attack boost for 15 seconds
            player._tempAtkBuff = (player._tempAtkBuff || 0) + 0.5;
            (((__oc4 = scene.systemMessage) === null || __oc4 === void 0 ? void 0 : __oc4.show(t('sysSystem'), [t('itemShadowEssence')], { duration: 1500, type: 'arise' })));
            (((__oc5 = scene.itemDropManager) === null || __oc5 === void 0 ? void 0 : __oc5._delay(15000, () => {
        if (((player === null || player === void 0 ? void 0 : player.scene)))
            player._tempAtkBuff = Math.max(0, (player._tempAtkBuff || 0) - 0.5);
    })));
        },
    },
};

export class ItemDropManager {
    constructor(scene) {
        this.scene = scene;
        this.items = [];
        this._timers = new Set();
    }

    _delay(ms, callback) { var __oc6;
        if (!(((__oc6 = this.scene) === null || __oc6 === void 0 ? void 0 : __oc6.time))) return null;
        const timer = this.scene.time.delayedCall(ms, () => { var __oc7, __oc8, __oc9;
            this._timers.delete(timer);
            if ((((__oc9 = (__oc8 = (__oc7 = this.scene) === null || __oc7 === void 0 ? void 0 : __oc7.scene) === null || __oc8 === void 0 ? void 0 : __oc8.isActive) === null || __oc9 === void 0 ? void 0 : __oc9.call(__oc8))) !== false) callback();
        });
        this._timers.add(timer);
        return timer;
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
        const textureKey = config.asset;
        const useAsset = textureKey && this.scene.textures.exists(textureKey);
        const item = useAsset
            ? this.scene.add.sprite(x, y, textureKey).setDepth(5).setDisplaySize(28, 28)
            : this.scene.add.circle(x, y, 8, config.color, 0.9).setDepth(5);

        // Inner glow
        const glow = this.scene.add.circle(x, y, 12, config.color, 0.2)
            .setDepth(4);

        // Plus sign for HP potion
        if (!useAsset && key === 'hpPotion') {
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
                    this.scene.soundManager.play(item._config.sound || 'potion');
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

    destroy() { var __oc10;
        for (const timer of this._timers) {
            try { timer.remove(false); } catch (e) { /* already removed */ }
        }
        this._timers.clear();
        const tweens = (((__oc10 = this.scene) === null || __oc10 === void 0 ? void 0 : __oc10.tweens));
        this.items.forEach(item => {
            if (tweens) tweens.killTweensOf(item);
            if (item._glow) { if (tweens) tweens.killTweensOf(item._glow); item._glow.destroy(); }
            if (item._plusText) item._plusText.destroy();
            item.destroy();
        });
        this.items = [];
        this.scene = null;
    }
}
