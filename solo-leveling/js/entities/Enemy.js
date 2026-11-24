import { COLORS } from '../utils/Constants.js';
import { SpriteFactory } from '../utils/SpriteFactory.js?v=20261120-fastload-v2';

const COMBAT_VFX_ATLAS_BY_PREFIX = {
    effect_monster_hit: 'atlas_vfx_combat_hit',
    effect_monster_crit: 'atlas_vfx_combat_hit',
    effect_monster_death: 'atlas_vfx_combat_death',
    effect_flame_burn: 'atlas_vfx_flame_burn',
    effect_sanctuary_hit: 'atlas_vfx_sanctuary_hit',
};

const ENEMY_MOTION_CONFIG = {
    goblin:         { walkFrameMs: 140, attackDurationMs: 340, leanAmp: 0.045, lungeLean: 0.14 },
    steelFangLycan: { walkFrameMs: 130, attackDurationMs: 320, leanAmp: 0.055, lungeLean: 0.16 },
    antSoldier:     { walkFrameMs: 135, attackDurationMs: 340, leanAmp: 0.045, lungeLean: 0.14 },
    orc:            { walkFrameMs: 175, attackDurationMs: 440, leanAmp: 0.040, lungeLean: 0.12 },
    iceBear:        { walkFrameMs: 185, attackDurationMs: 460, leanAmp: 0.038, lungeLean: 0.12 },
    iceElf:         { walkFrameMs: 145, attackDurationMs: 360, leanAmp: 0.045, lungeLean: 0.14 },
    stoneGolem:     { walkFrameMs: 220, attackDurationMs: 540, leanAmp: 0.030, lungeLean: 0.10 },
    darkMage:       { walkFrameMs: 175, attackDurationMs: 460, leanAmp: 0.035, lungeLean: 0.11 },
    ironKnight:     { walkFrameMs: 195, attackDurationMs: 480, leanAmp: 0.035, lungeLean: 0.12 },
    demonWarrior:   { walkFrameMs: 185, attackDurationMs: 460, leanAmp: 0.042, lungeLean: 0.14 },
};
const DEFAULT_ENEMY_MOTION = { walkFrameMs: 165, attackDurationMs: 420, leanAmp: 0.04, lungeLean: 0.12 };

export class Enemy extends Phaser.Physics.Arcade.Sprite {
    static _beginFrame(scene, activeCount = 0) {
        const gameLoop = scene && scene.game ? scene.game.loop : null;
        const frameNo = gameLoop ? (gameLoop.frame || 0) : 0;
        const fps = gameLoop && gameLoop.actualFps ? gameLoop.actualFps : 60;
        const cam = scene && scene.cameras ? scene.cameras.main : null;
        const view = cam && cam.worldView ? cam.worldView : null;
        let viewLeft = -Infinity;
        let viewRight = Infinity;
        let viewTop = -Infinity;
        let viewBottom = Infinity;
        if (view) {
            viewLeft = view.x;
            viewRight = view.right;
            viewTop = view.y;
            viewBottom = view.bottom;
        } else if (cam) {
            viewLeft = cam.scrollX;
            viewRight = cam.scrollX + cam.width;
            viewTop = cam.scrollY;
            viewBottom = cam.scrollY + cam.height;
        }
        Enemy._frameState = {
            frameNo,
            fps,
            activeCount,
            lowQuality: !!(scene && scene._lowQuality),
            viewLeft,
            viewRight,
            viewTop,
            viewBottom,
        };
    }
    
    
    
    
    
    
    
    
    
    
    
    

    static _getVfxBudget(scene) { var __oc0, __oc1, __oc2, __oc3;
        const fps = (((__oc1 = (__oc0 = scene === null || scene === void 0 ? void 0 : scene.game) === null || __oc0 === void 0 ? void 0 : __oc0.loop) === null || __oc1 === void 0 ? void 0 : __oc1.actualFps)) || 60;
        const children = (((__oc3 = (__oc2 = scene === null || scene === void 0 ? void 0 : scene.children) === null || __oc2 === void 0 ? void 0 : __oc2.list) === null || __oc3 === void 0 ? void 0 : __oc3.length)) || 0;
        if (((scene === null || scene === void 0 ? void 0 : scene._lowQuality)) || fps < 35 || children > 900) return 5;
        if (fps < 48 || children > 650) return 8;
        return Enemy.MAX_VFX_BUDGET_PER_FRAME;
    }

    static _isVfxConstrained(scene) { var __oc4, __oc5, __oc6, __oc7;
        const fps = (((__oc5 = (__oc4 = scene === null || scene === void 0 ? void 0 : scene.game) === null || __oc4 === void 0 ? void 0 : __oc4.loop) === null || __oc5 === void 0 ? void 0 : __oc5.actualFps)) || 60;
        const children = (((__oc7 = (__oc6 = scene === null || scene === void 0 ? void 0 : scene.children) === null || __oc6 === void 0 ? void 0 : __oc6.list) === null || __oc7 === void 0 ? void 0 : __oc7.length)) || 0;
        return !!((scene === null || scene === void 0 ? void 0 : scene._lowQuality)) || fps < 42 || children > 760;
    }

    static _isVfxSaturated(scene) { var __oc8, __oc9, __oc10, __oc11;
        const fps = (((__oc9 = (__oc8 = scene === null || scene === void 0 ? void 0 : scene.game) === null || __oc8 === void 0 ? void 0 : __oc8.loop) === null || __oc9 === void 0 ? void 0 : __oc9.actualFps)) || 60;
        const children = (((__oc11 = (__oc10 = scene === null || scene === void 0 ? void 0 : scene.children) === null || __oc10 === void 0 ? void 0 : __oc10.list) === null || __oc11 === void 0 ? void 0 : __oc11.length)) || 0;
        return !!((scene === null || scene === void 0 ? void 0 : scene._lowQuality)) || fps < 30 || children > 980;
    }

    static _consumeVfxBudget(scene, cost = 1) { var __oc12, __oc13, __oc14;
        const frame = (((__oc14 = (__oc13 = (__oc12 = scene === null || scene === void 0 ? void 0 : scene.game) === null || __oc12 === void 0 ? void 0 : __oc12.loop) === null || __oc13 === void 0 ? void 0 : __oc13.frame) !== null && __oc14 !== void 0 ? __oc14 : 0));
        if (Enemy._vfxBudgetFrame !== frame) {
            Enemy._vfxBudgetFrame = frame;
            Enemy._vfxBudgetUsed = 0;
        }
        if (Enemy._vfxBudgetUsed + cost > Enemy._getVfxBudget(scene)) return false;
        Enemy._vfxBudgetUsed += cost;
        return true;
    }

    static _getHitReactBudget(scene) { var __oc15, __oc16, __oc17, __oc18;
        const fps = (((__oc16 = (__oc15 = scene === null || scene === void 0 ? void 0 : scene.game) === null || __oc15 === void 0 ? void 0 : __oc15.loop) === null || __oc16 === void 0 ? void 0 : __oc16.actualFps)) || 60;
        const children = (((__oc18 = (__oc17 = scene === null || scene === void 0 ? void 0 : scene.children) === null || __oc17 === void 0 ? void 0 : __oc17.list) === null || __oc18 === void 0 ? void 0 : __oc18.length)) || 0;
        if (((scene === null || scene === void 0 ? void 0 : scene._lowQuality)) || fps < 35 || children > 900) return 10;
        if (fps < 48 || children > 650) return 18;
        return Enemy.MAX_HIT_REACTS_PER_FRAME;
    }

    static _consumeHitReactBudget(scene, isCrit = false) { var __oc19, __oc20, __oc21;
        const frame = (((__oc21 = (__oc20 = (__oc19 = scene === null || scene === void 0 ? void 0 : scene.game) === null || __oc19 === void 0 ? void 0 : __oc19.loop) === null || __oc20 === void 0 ? void 0 : __oc20.frame) !== null && __oc21 !== void 0 ? __oc21 : 0));
        if (Enemy._hitReactBudgetFrame !== frame) {
            Enemy._hitReactBudgetFrame = frame;
            Enemy._hitReactBudgetUsed = 0;
        }
        const budget = Enemy._getHitReactBudget(scene);
        const cost = isCrit ? 2 : 1;
        const cap = isCrit ? budget + 4 : budget;
        if (Enemy._hitReactBudgetUsed + cost > cap) return false;
        Enemy._hitReactBudgetUsed += cost;
        return true;
    }

    static _getDmgTextBudget(scene) { var __oc22, __oc23, __oc24, __oc25;
        const fps = (((__oc23 = (__oc22 = scene === null || scene === void 0 ? void 0 : scene.game) === null || __oc22 === void 0 ? void 0 : __oc22.loop) === null || __oc23 === void 0 ? void 0 : __oc23.actualFps)) || 60;
        const children = (((__oc25 = (__oc24 = scene === null || scene === void 0 ? void 0 : scene.children) === null || __oc24 === void 0 ? void 0 : __oc24.list) === null || __oc25 === void 0 ? void 0 : __oc25.length)) || 0;
        if (((scene === null || scene === void 0 ? void 0 : scene._lowQuality)) || fps < 35 || children > 900) return 4;
        if (fps < 48 || children > 650) return 7;
        return Enemy.MAX_DMG_TEXTS_PER_FRAME;
    }

    static _consumeDmgTextBudget(scene, isCrit = false) { var __oc26, __oc27, __oc28;
        const frame = (((__oc28 = (__oc27 = (__oc26 = scene === null || scene === void 0 ? void 0 : scene.game) === null || __oc26 === void 0 ? void 0 : __oc26.loop) === null || __oc27 === void 0 ? void 0 : __oc27.frame) !== null && __oc28 !== void 0 ? __oc28 : 0));
        if (Enemy._dmgTextBudgetFrame !== frame) {
            Enemy._dmgTextBudgetFrame = frame;
            Enemy._dmgTextBudgetUsed = 0;
        }
        const budget = Enemy._getDmgTextBudget(scene);
        const cost = isCrit ? 2 : 1;
        const cap = isCrit ? budget + 3 : budget;
        if (Enemy._dmgTextBudgetUsed + cost > cap) return false;
        Enemy._dmgTextBudgetUsed += cost;
        return true;
    }

    static _isNearCamera(scene, x, y, padding = 64) {
        const fs = Enemy._frameState;
        const gameLoop = scene && scene.game ? scene.game.loop : null;
        const frameNo = gameLoop ? (gameLoop.frame || 0) : 0;
        if (fs && fs.frameNo === frameNo && fs.viewLeft > -Infinity) {
            return x >= fs.viewLeft - padding &&
                x <= fs.viewRight + padding &&
                y >= fs.viewTop - padding &&
                y <= fs.viewBottom + padding;
        }
        const cam = scene && scene.cameras ? scene.cameras.main : null;
        if (!cam) return true;
        const view = cam.worldView;
        if (view) {
            return x >= view.x - padding &&
                x <= view.right + padding &&
                y >= view.y - padding &&
                y <= view.bottom + padding;
        }
        const cx = x - cam.scrollX;
        const cy = y - cam.scrollY;
        return cx >= -padding && cx <= cam.width + padding && cy >= -padding && cy <= cam.height + padding;
    }

    static _getDeathEmitter(scene, x, y) {
        // Try to reuse an existing emitter
        for (let i = Enemy._deathEmitterPool.length - 1; i >= 0; i--) {
            const em = Enemy._deathEmitterPool[i];
            if (!Enemy._canPoolSceneObject(em)) {
                Enemy._deathEmitterPool.splice(i, 1);
                Enemy._disposeTransientObject(em, scene);
                continue;
            }
            if (!em.emitting) {
                Enemy._deathEmitterPool.splice(i, 1);
                em.setPosition(x, y);
                return em;
            }
        }
        // Create new one
        try {
            const emitter = scene.add.particles(x, y, 'particle_glow', {
                speed: { min: 80, max: 220 },
                scale: { start: 1.4, end: 0 },
                alpha: { start: 0.95, end: 0 },
                lifespan: { min: 400, max: 750 },
                tint: [0xcc0011, 0xaa0010, 0x660008, 0xdd2020],
                emitting: false,
            });
            emitter.setDepth(15);
            return emitter;
        } catch (e) {
            return null;
        }
    }

    static _getDeathSparks(scene, x, y) {
        for (let i = Enemy._deathSparkPool.length - 1; i >= 0; i--) {
            const em = Enemy._deathSparkPool[i];
            if (!Enemy._canPoolSceneObject(em)) {
                Enemy._deathSparkPool.splice(i, 1);
                Enemy._disposeTransientObject(em, scene);
                continue;
            }
            if (!em.emitting) {
                Enemy._deathSparkPool.splice(i, 1);
                em.setPosition(x, y);
                return em;
            }
        }
        try {
            const sparks = scene.add.particles(x, y, 'particle_spark', {
                speed: { min: 100, max: 260 },
                scale: { start: 1.0, end: 0 },
                alpha: { start: 1, end: 0 },
                lifespan: { min: 300, max: 550 },
                tint: [0xff3344, 0xdd1122, 0x990008],
                emitting: false,
            });
            sparks.setDepth(15);
            return sparks;
        } catch (e) {
            return null;
        }
    }

    static _returnDeathEmitter(emitter) {
        if (emitter && Enemy._canPoolSceneObject(emitter) && Enemy._deathEmitterPool.length < Enemy.MAX_POOLED_EMITTERS) {
            Enemy._deathEmitterPool.push(emitter);
        } else if (emitter && emitter.scene) {
            emitter.destroy();
        }
    }

    static _returnDeathSparks(sparks) {
        if (sparks && Enemy._canPoolSceneObject(sparks) && Enemy._deathSparkPool.length < Enemy.MAX_POOLED_EMITTERS) {
            Enemy._deathSparkPool.push(sparks);
        } else if (sparks && sparks.scene) {
            sparks.destroy();
        }
    }

    static _canPoolSceneObject(obj) { var __oc30, __oc31;
        if (!((obj === null || obj === void 0 ? void 0 : obj.scene))) return false;
        try {
            return (((__oc31 = (__oc30 = obj.scene.sys) === null || __oc30 === void 0 ? void 0 : __oc30.isActive) === null || __oc31 === void 0 ? void 0 : __oc31.call(__oc30))) !== false;
        } catch (e) {
            return false;
        }
    }

    static _disposeTransientObject(obj, scene = null) { var __oc32;
        if (!obj) return;
        try {
            const tweens = ((scene === null || scene === void 0 ? void 0 : scene.tweens)) || (((__oc32 = obj.scene) === null || __oc32 === void 0 ? void 0 : __oc32.tweens));
            if (tweens) tweens.killTweensOf(obj);
        } catch (e) { /* scene may already be shutting down */ }
        try {
            if (obj.scene && obj.destroy) obj.destroy();
        } catch (e) { /* already destroyed */ }
    }

    static clearTransientPools(scene = null) {
        for (const emitter of Enemy._deathEmitterPool) {
            Enemy._disposeTransientObject(emitter, scene);
        }
        for (const sparks of Enemy._deathSparkPool) {
            Enemy._disposeTransientObject(sparks, scene);
        }
        for (const text of Enemy._activeTexts) {
            Enemy._disposeTransientObject(text, scene);
        }
        for (const text of Enemy._dmgTextPool) {
            Enemy._disposeTransientObject(text, scene);
        }
        for (const item of Enemy._activeFrameVfx) {
            if (item && item.sprite) Enemy._disposeTransientObject(item.sprite, scene);
        }
        for (const spr of Enemy._vfxSpritePool) {
            Enemy._disposeTransientObject(spr, scene);
        }
        for (const proj of Enemy._activeProjectiles) {
            if (proj && proj.sprite) Enemy._disposeTransientObject(proj.sprite, scene);
        }
        for (const spr of Enemy._projSpritePool) {
            Enemy._disposeTransientObject(spr, scene);
        }
        for (const tr of Enemy._activeProjTrails) {
            if (tr && tr.sprite) Enemy._disposeTransientObject(tr.sprite, scene);
        }
        for (const trSpr of Enemy._projTrailPool) {
            Enemy._disposeTransientObject(trSpr, scene);
        }

        Enemy._deathEmitterPool = [];
        Enemy._deathSparkPool = [];
        Enemy._activeTexts = [];
        Enemy._dmgTextPool = [];
        Enemy._activeFrameVfx = [];
        Enemy._vfxSpritePool = [];
        Enemy._activeProjectiles = [];
        Enemy._projSpritePool = [];
        Enemy._activeProjTrails = [];
        Enemy._projTrailPool = [];
        Enemy._activeDecals = 0;
        Enemy._frameState = null;
        Enemy._vfxBudgetFrame = -1;
        Enemy._vfxBudgetUsed = 0;
        Enemy._hitReactBudgetFrame = -1;
        Enemy._hitReactBudgetUsed = 0;
        Enemy._dmgTextBudgetFrame = -1;
        Enemy._dmgTextBudgetUsed = 0;
    }

    static _playFrameVfx(scene, prefix, x, y, opts = {}) {
        const textures = scene && scene.textures ? scene.textures : null;
        if (!textures || !scene.add) return false;
        const atlasKey = COMBAT_VFX_ATLAS_BY_PREFIX[prefix];
        const atlasTex = atlasKey && textures.exists(atlasKey) ? textures.get(atlasKey) : null;
        const useAtlas = !!(atlasTex && atlasTex.has(`${prefix}_0`));
        if (!useAtlas && !textures.exists(`${prefix}_0`)) return false;

        if (Enemy._activeFrameVfx.length >= 48) return true;

        const {
            scale = 1,
            rotation = 0,
            depth = 16,
            frameMs = 45,
            alpha = 1,
            blendMode = Phaser.BlendModes.NORMAL,
            frameCount = 6,
        } = opts;
        const lastFrame = Math.max(0, frameCount - 1);

        try {
            let sprite = Enemy._vfxSpritePool.pop();
            if (sprite && sprite.scene === scene) {
                if (useAtlas) sprite.setTexture(atlasKey, `${prefix}_0`);
                else sprite.setTexture(`${prefix}_0`);
                sprite.setPosition(x, y);
            } else {
                if (sprite) Enemy._disposeTransientObject(sprite, scene);
                sprite = useAtlas
                    ? scene.add.sprite(x, y, atlasKey, `${prefix}_0`)
                    : scene.add.sprite(x, y, `${prefix}_0`);
            }
            sprite.setOrigin(0.5)
                .setDepth(depth)
                .setAlpha(alpha)
                .setScale(scale)
                .setRotation(rotation)
                .setBlendMode(blendMode)
                .setTint(0xffffff)
                .setVisible(true)
                .setActive(true);

            Enemy._activeFrameVfx.push({
                sprite,
                atlasKey: useAtlas ? atlasKey : null,
                prefix,
                frame: 0,
                lastFrame,
                frameMs: Math.max(12, frameMs),
                elapsed: 0,
                fadeElapsed: -1,
                baseAlpha: alpha,
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    static updateFrameVfx(scene, delta) {
        const active = Enemy._activeFrameVfx;
        const pool = Enemy._vfxSpritePool;
        for (let i = active.length - 1; i >= 0; i--) {
            const vfx = active[i];
            const spr = vfx ? vfx.sprite : null;
            if (!spr || !spr.scene || spr.scene !== scene) {
                active.splice(i, 1);
                continue;
            }
            if (vfx.fadeElapsed >= 0) {
                vfx.fadeElapsed += delta;
                if (vfx.fadeElapsed >= vfx.frameMs) {
                    spr.setVisible(false).setActive(false);
                    active.splice(i, 1);
                    if (pool.length < 48) pool.push(spr);
                    else spr.destroy();
                } else {
                    spr.alpha = vfx.baseAlpha * (1 - vfx.fadeElapsed / vfx.frameMs);
                }
                continue;
            }
            vfx.elapsed += delta;
            while (vfx.elapsed >= vfx.frameMs && vfx.fadeElapsed < 0) {
                vfx.elapsed -= vfx.frameMs;
                vfx.frame += 1;
                const frameIdx = Math.min(vfx.frame, vfx.lastFrame);
                const nextKey = `${vfx.prefix}_${frameIdx}`;
                if (vfx.atlasKey) spr.setFrame(nextKey);
                else if (scene.textures && scene.textures.exists(nextKey)) spr.setTexture(nextKey);
                if (vfx.frame >= vfx.lastFrame) {
                    vfx.fadeElapsed = 0;
                }
            }
        }
    }

    static updateProjectiles(scene, delta) {
        const player = scene ? scene.player : null;
        const dtSec = delta * 0.001;
        const hasHurtbox = !!(player && player.getHurtboxCenter);
        const target = hasHurtbox ? player.getHurtboxCenter() : player;
        const pWidth = player && player.body ? player.body.width : 38;
        const pHeight = player && player.body ? player.body.height : 56;
        const playerRadius = Math.max(pWidth || 38, pHeight || 56) * 0.5;

        const trails = Enemy._activeProjTrails;
        const trailPool = Enemy._projTrailPool;
        for (let i = trails.length - 1; i >= 0; i--) {
            const tr = trails[i];
            const tSpr = tr ? tr.sprite : null;
            if (!tSpr || !tSpr.scene || tSpr.scene !== scene) {
                trails.splice(i, 1);
                continue;
            }
            tr.elapsed += delta;
            if (tr.elapsed >= 240) {
                tSpr.setVisible(false).setActive(false);
                trails.splice(i, 1);
                if (trailPool.length < 48) trailPool.push(tSpr);
                else tSpr.destroy();
            } else {
                const k = 1 - tr.elapsed / 240;
                tSpr.alpha = tr.baseAlpha * k;
                tSpr.setScale(0.2 + 0.8 * k);
            }
        }

        const projs = Enemy._activeProjectiles;
        const projPool = Enemy._projSpritePool;
        for (let i = projs.length - 1; i >= 0; i--) {
            const p = projs[i];
            const spr = p ? p.sprite : null;
            if (!spr || !spr.scene || spr.scene !== scene) {
                projs.splice(i, 1);
                continue;
            }
            p.lifeMs += delta;
            if (p.lifeMs >= p.maxLifeMs) {
                spr.setVisible(false).setActive(false);
                projs.splice(i, 1);
                if (projPool.length < 24) projPool.push(spr);
                else spr.destroy();
                continue;
            }

            spr.x += p.vx * dtSec;
            spr.y += p.vy * dtSec;
            if (p.useEffectAsset) {
                p.frameElapsed += delta;
                if (p.frameElapsed >= 58) {
                    p.frameElapsed -= 58;
                    p.frame = (p.frame + 1) % 6;
                    const texKey = `effect_dark_mage_orb_${p.frame}`;
                    if (scene.textures && scene.textures.exists(texKey)) {
                        spr.setTexture(texKey);
                    }
                }
            } else {
                spr.rotation += delta * 0.008;
            }

            p.trailClock += delta;
            if (p.trailClock >= 85 && trails.length < 36 && Enemy._isNearCamera(scene, spr.x, spr.y, 48)) {
                p.trailClock = 0;
                let tSpr = trailPool.pop();
                if (tSpr && tSpr.scene === scene) {
                    tSpr.setPosition(spr.x, spr.y).setVisible(true).setActive(true).setScale(1).setAlpha(p.trailAlpha);
                } else {
                    if (tSpr) Enemy._disposeTransientObject(tSpr, scene);
                    tSpr = scene.add.circle(spr.x, spr.y, p.useEffectAsset ? 5 : 4, 0x9b35ff, p.trailAlpha).setDepth(7);
                }
                trails.push({ sprite: tSpr, elapsed: 0, baseAlpha: p.trailAlpha });
            }

            if (player && player.active && !player.isDead && target) {
                const dx = target.x - spr.x;
                const dy = target.y - spr.y;
                const hitDist = playerRadius + p.hitRadius;
                if (dx * dx + dy * dy <= hitDist * hitDist) {
                    player.takeDamage(p.damage);
                    spr.setVisible(false).setActive(false);
                    projs.splice(i, 1);
                    if (projPool.length < 24) projPool.push(spr);
                    else spr.destroy();
                }
            }
        }
    }

    constructor(scene, x, y) {
        const initAtlas = SpriteFactory.getEnemyAtlasKey(scene, 'goblin');
        if (initAtlas) {
            super(scene, x, y, initAtlas, 'goblin_walk_0');
        } else {
            super(scene, x, y, 'enemy_goblin_0');
        }
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setDepth(5);
        this.enemyType = null;
        this._typeSize = 32;
        this._atlasKey = initAtlas;
        this.hp = 0;
        this.maxHp = 0;
        this.attack = 0;
        this.speed = 0;
        this.xpValue = 0;
        this.animFrame = 0;
        this.animTimer = 0;
        this._animState = 'walk';
        this._renderedAnimState = 'walk';
        this._animClock = 0;
        this._attackElapsed = 0;
        this._attackDamageDealt = false;
        this._motionConfig = DEFAULT_ENEMY_MOTION;
        this._hitFlashTimer = 0;
        this._hitFlashStage = 0;
        this._hitFlashColor = 0xff2233;
        this._hitSquashTimer = 0;
        this.knockbackTimer = 0;
        this.slowMultiplier = 1;
        this.slowDuration = 0;
        this.isBoss = false;
        this.hpBar = null;
        this.spawnInstanceId = 0;
        this._lastHitEffect = null;
        this._lastDmgTextTime = 0;
        this._lastHitReactTime = 0;

        // Shadow aura below sprite — purple halo that ties retro tiles to shadow theme
        // Reuses particle_glow texture for cheap additive blending
        try {
            this._aura = scene.add.image(x, y, 'particle_glow')
                .setDepth(4)
                .setTint(COLORS.SHADOW_PRIMARY)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setAlpha(0)
                .setVisible(false);
        } catch (_) { this._aura = null; }
    }

    applyAtlasTexture() {
        if (!this.scene || !this.enemyType) return false;
        const atlasKey = SpriteFactory.getEnemyAtlasKey(this.scene, this.enemyType);
        const s = this._typeSize || 32;
        const state = this._animState || 'walk';
        const frame = this.animFrame || 0;
        const multX = this.isElite ? 1.5 : 1;
        if (atlasKey) {
            this._atlasKey = atlasKey;
            this.setTexture(atlasKey, this.enemyType + '_' + state + '_' + frame);
            this.setDisplaySize(s * 2, s * 2);
            this._restScaleX = this.scaleX * multX;
            this._restScaleY = this.scaleY * multX;
            this.setScale(this._restScaleX, this._restScaleY);
            if (this.body) {
                this.body.setSize(this.width * 0.6, this.height * 0.6, true);
                if (this.body.updateFromGameObject) this.body.updateFromGameObject();
            }
            this._renderedAnimState = state;
            return true;
        }
        this._atlasKey = null;
        return false;
    }

    triggerMeleeAttack() {
        if (!this.active || this.enemyType === 'darkMage' || this._animState === 'attack') return false;
        const motionCfg = this._motionConfig || DEFAULT_ENEMY_MOTION;
        this.meleeCooldown = Math.max(560, motionCfg.attackDurationMs + 160);
        this._animState = 'attack';
        this._attackElapsed = 0;
        this._attackDamageDealt = false;
        return true;
    }

    spawn(typeKey, typeData, difficultyMult, x, y, statProfile = null) {
        // Reset any monkey-patched methods from elite spawns
        this.update = Enemy.prototype.update;
        this.die = Enemy.prototype.die;
        this.isElite = false;
        this._eliteDeathPending = false;
        if (this._eliteLabel) { this._eliteLabel.destroy(); this._eliteLabel = null; }
        try {
            if (this._eliteGlow && this.filters) this.filters.internal.remove(this._eliteGlow);
        } catch (e) { /* filters may already be gone */ }
        this._eliteGlow = null;
        this._originalUpdate = null;
        this._originalDie = null;

        this.enemyType = typeKey;
        this._typeSize = typeData.size;
        this._motionConfig = ENEMY_MOTION_CONFIG[typeKey] || DEFAULT_ENEMY_MOTION;
        Enemy._nextSpawnInstanceId = (Enemy._nextSpawnInstanceId || 0) + 1;
        this.spawnInstanceId = Enemy._nextSpawnInstanceId;
        this.setPosition(x, y);
        this.setActive(true);
        this.setVisible(true);
        this.body.enable = true;
        this.setScale(1, 1);
        this.setRotation(0);

        // Apply difficulty scaling (fewer enemies → each one is tougher)
        const hpScale = (statProfile && statProfile.hp !== undefined && statProfile.hp !== null)
            ? statProfile.hp : difficultyMult;
        const attackScale = (statProfile && statProfile.attack !== undefined && statProfile.attack !== null)
            ? statProfile.attack : (1 + (difficultyMult - 1) * 0.5);
        const speedScale = (statProfile && statProfile.speed !== undefined && statProfile.speed !== null)
            ? statProfile.speed : (1 + (difficultyMult - 1) * 0.15);
        const xpScale = (statProfile && statProfile.xp !== undefined && statProfile.xp !== null)
            ? statProfile.xp : (1 + (difficultyMult - 1) * 0.5);

        // Apply time pressure scaling: durability rises hardest, speed rises gently.
        this.maxHp = Math.floor(typeData.hp * hpScale);
        this.hp = this.maxHp;
        this.attack = Math.floor(typeData.attack * attackScale);
        this.speed = typeData.speed * speedScale;
        this.xpValue = Math.floor(typeData.xp * xpScale);

        const s = typeData.size;
        this.animFrame = 0;
        this.animTimer = 0;
        this._animState = 'walk';
        this._renderedAnimState = 'walk';
        this._animClock = (this.spawnInstanceId * 97) % 1000;
        this._attackElapsed = 0;
        this._attackDamageDealt = false;
        this._hitFlashTimer = 0;
        this._hitFlashStage = 0;
        this._hitSquashTimer = 0;

        // Set atlas texture if loaded, otherwise static/procedural fallback
        if (!this.applyAtlasTexture()) {
            this.setTexture('enemy_' + typeKey + '_0');
            this.setDisplaySize(s * 2, s * 2);
            this._restScaleX = this.scaleX;
            this._restScaleY = this.scaleY;
            if (this.body) {
                this.body.setSize(this.width * 0.6, this.height * 0.6, true);
                if (this.body.updateFromGameObject) this.body.updateFromGameObject();
            }
        }

        this.knockbackTimer = 0;
        this.slowMultiplier = 1;
        this.slowDuration = 0;
        this._lastHitEffect = null;
        this._lastDmgTextTime = 0;
        this._lastHitReactTime = 0;
        this.rangedCooldown = 0;
        this.meleeCooldown = 0;
        this._meleeRange = s * 2 + 30;
        this.setAlpha(1);
        this.setTint(0xffffff);

        // Activate shadow aura (culled automatically under high density or offscreen)
        if (this._aura) {
            const fs = Enemy._frameState;
            const showAura = (!fs || (!fs.lowQuality && fs.activeCount <= 110));
            const auraScale = (s * 2.6) / 16;
            this._aura
                .setPosition(x, y + s * 0.35)
                .setScale(auraScale, auraScale * 0.55)
                .setAlpha(0.35)
                .setVisible(showAura)
                .setActive(true);
        }
    }

    update(time, delta, playerX, playerY) {
        if (!this.active) return;

        const fs = Enemy._frameState;
        const activeCount = fs ? fs.activeCount : 0;
        const lowQuality = fs ? fs.lowQuality : !!(this.scene && this.scene._lowQuality);
        const frameNo = fs ? fs.frameNo : 0;
        const nearCam = Enemy._isNearCamera(this.scene, this.x, this.y, 96);

        // Sync shadow aura or hide under heavy load / offscreen to save additive fill-rate
        if (this._aura && this._aura.active) {
            const showAura = nearCam && (!lowQuality) && (activeCount <= 110 || this.isElite);
            if (showAura) {
                this._aura.x = this.x;
                this._aura.y = this.y + (this.displayHeight * 0.25);
                if (!this._aura.visible) this._aura.setVisible(true);
            } else if (this._aura.visible) {
                this._aura.setVisible(false);
            }
        }

        // Scalar hit flash progression (0 timers)
        if (this._hitFlashTimer > 0) {
            this._hitFlashTimer -= delta;
            if (this._hitFlashTimer <= 0) {
                this._hitFlashTimer = 0;
                this._hitFlashStage = 0;
                const baseTint = this.slowDuration > 0 ? 0x8888ff : (this.isElite ? 0xff6644 : 0xffffff);
                this.setTint(baseTint);
            } else if (this._hitFlashStage === 1 && this._hitFlashTimer <= 75) {
                this._hitFlashStage = 2;
                this.setTint(this._hitFlashColor);
            }
        }
        if (this._hitSquashTimer > 0) {
            this._hitSquashTimer -= delta;
            if (this._hitSquashTimer < 0) this._hitSquashTimer = 0;
        }

        // Knockback
        if (this.knockbackTimer > 0) {
            this.knockbackTimer -= delta;
            return;
        }

        // Slow effect
        if (this.slowDuration > 0) {
            this.slowDuration -= delta;
            if (this.slowDuration <= 0) {
                this.slowMultiplier = 1;
                if (this._hitFlashTimer <= 0) {
                    this.setTint(this.isElite ? 0xff6644 : 0xffffff);
                }
            }
        }

        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const distSq = dx * dx + dy * dy;

        // Far-offscreen velocity throttle: skip half of velocity recalculations & all anims
        if (distSq > 810000 && ((frameNo + this.spawnInstanceId) & 1) !== 0) {
            if (this.rangedCooldown > 0) this.rangedCooldown -= delta;
            if (this.meleeCooldown > 0) this.meleeCooldown -= delta;
            return;
        }

        const invDist = distSq > 0.0001 ? 1 / Math.sqrt(distSq) : 0;
        const ux = dx * invDist;
        const uy = dy * invDist;
        const motionCfg = this._motionConfig || DEFAULT_ENEMY_MOTION;
        const atkDur = motionCfg.attackDurationMs;

        // Dark Mage: ranged attacker - stops at distance, plays cast animation, and fires at peak frame
        if (this.enemyType === 'darkMage') {
            const attackRangeSq = 62500; // 250^2
            if (this._animState === 'attack') {
                this.body.setVelocity(0, 0);
                this._attackElapsed += delta;
                const progress = this._attackElapsed / atkDur;
                if (!this._attackDamageDealt && progress >= 0.5) {
                    this._attackDamageDealt = true;
                    this._fireProjectile(playerX, playerY);
                }
                if (this._attackElapsed >= atkDur) {
                    this._animState = 'walk';
                    this._attackElapsed = 0;
                }
            } else if (distSq > attackRangeSq) {
                const speed = this.speed * this.slowMultiplier;
                this.body.setVelocity(ux * speed, uy * speed);
            } else {
                this.body.setVelocity(0, 0);
                this.rangedCooldown -= delta;
                if (this.rangedCooldown <= 0) {
                    this.rangedCooldown = 2000;
                    this._animState = 'attack';
                    this._attackElapsed = 0;
                    this._attackDamageDealt = false;
                }
            }
        } else {
            // Normal melee: chase player, trigger attack motion near melee reach
            const speed = this.speed * this.slowMultiplier;
            if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

            const meleeRange = this._meleeRange;
            const meleeRangeSq = meleeRange * meleeRange;

            if (this._animState === 'attack') {
                const lungeSpeed = speed * 0.92;
                this.body.setVelocity(ux * lungeSpeed, uy * lungeSpeed);
                this._attackElapsed += delta;
                if (this._attackElapsed >= atkDur) {
                    this._animState = 'walk';
                    this._attackElapsed = 0;
                }
            } else {
                this.body.setVelocity(ux * speed, uy * speed);
                if (distSq < meleeRangeSq && this.meleeCooldown <= 0) {
                    this.meleeCooldown = Math.max(560, atkDur + 160);
                    this._animState = 'attack';
                    this._attackElapsed = 0;
                    this._attackDamageDealt = false;
                }
            }
        }

        // All 10 regenerated enemies and 3 bosses face right in source sheets
        const movingLeft = dx < 0;
        this.setFlipX(movingLeft);

        // Skip frame swaps & procedural interpolation when offscreen
        if (!nearCam && distSq > 640000) return;

        // 1) Resolve discrete keyframe (walk 0..3 or attack 0..3)
        let nextFrame = 0;
        if (this._animState === 'attack') {
            nextFrame = Math.min(3, Math.floor((this._attackElapsed / atkDur) * 4));
        } else {
            this._animClock += delta;
            nextFrame = Math.floor(this._animClock / motionCfg.walkFrameMs) & 3;
        }

        if (this.animFrame !== nextFrame || this._renderedAnimState !== this._animState) {
            this.animFrame = nextFrame;
            this._renderedAnimState = this._animState;
            if (this._atlasKey) {
                this.setFrame(this.enemyType + '_' + this._animState + '_' + nextFrame);
            } else {
                const fallbackKey = 'enemy_' + this.enemyType + '_' + nextFrame;
                if (this.scene.textures && this.scene.textures.exists(fallbackKey)) {
                    this.setTexture(fallbackKey);
                }
            }
        }

        // 2) Option 1 procedural interpolation (squash/stretch + stride lean / attack lunge)
        const restX = this._restScaleX !== undefined ? this._restScaleX : this.scaleX;
        const restY = this._restScaleY !== undefined ? this._restScaleY : this.scaleY;
        const hitSquashActive = this._hitSquashTimer > 0;
        if (lowQuality || !nearCam) {
            if (hitSquashActive) {
                this.setScale(restX * 1.15, restY * 0.88);
            } else if (this.scaleX !== restX || this.scaleY !== restY || this.rotation !== 0) {
                this.setScale(restX, restY);
                if (this.rotation !== 0) this.setRotation(0);
            }
            return;
        }

        const dirSign = movingLeft ? -1 : 1;
        let sx = 1;
        let sy = 1;
        let rot = 0;

        if (this._animState === 'attack') {
            const p = Math.min(1, this._attackElapsed / atkDur);
            if (p < 0.25) {
                const t = p * 4;
                sx = 1 + 0.06 * t;
                sy = 1 - 0.07 * t;
                rot = -dirSign * motionCfg.lungeLean * 0.6 * t;
            } else if (p < 0.55) {
                const t = (p - 0.25) / 0.30;
                sx = 1.06 + 0.05 * t;
                sy = 0.93 - 0.03 * t;
                rot = dirSign * motionCfg.lungeLean * (-0.6 + 1.6 * t);
            } else if (p < 0.78) {
                const t = (p - 0.55) / 0.23;
                sx = 1.11 - 0.04 * t;
                sy = 0.90 + 0.04 * t;
                rot = dirSign * motionCfg.lungeLean * (1.0 - 0.55 * t);
            } else {
                const t = (p - 0.78) / 0.22;
                sx = 1.07 - 0.07 * t;
                sy = 0.94 + 0.06 * t;
                rot = dirSign * motionCfg.lungeLean * 0.45 * (1 - t);
            }
        } else {
            const phase = (this._animClock / (motionCfg.walkFrameMs * 2)) * Math.PI;
            const pulse = Math.sin(phase);
            sx = 1 + pulse * 0.032;
            sy = 1 - pulse * 0.032;
            rot = dirSign * Math.sin(phase * 0.5) * motionCfg.leanAmp;
        }

        if (hitSquashActive) {
            sx *= 1.15;
            sy *= 0.88;
        }
        this.setScale(restX * sx, restY * sy);
        this.setRotation(rot);
    }

    _fireProjectile(targetX, targetY) {
        if (!this.scene || !this.scene.add) return;
        const player = this.scene.player;
        const playerTarget = player && player.getHurtboxCenter ? player.getHurtboxCenter() : null;
        const aimX = playerTarget && playerTarget.x !== undefined ? playerTarget.x : targetX;
        const aimY = playerTarget && playerTarget.y !== undefined ? playerTarget.y : targetY;
        const dx = aimX - this.x;
        const dy = aimY - this.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const angle = Math.atan2(uy, ux);

        // Brief purple cast tint via scalar flash timer (no delayedCall)
        this._hitFlashTimer = 150;
        this._hitFlashStage = 2;
        this._hitFlashColor = 0xb044ff;
        this.setTint(0xb044ff);

        if (Enemy._activeProjectiles.length >= 24) return;

        const useEffectAsset = !!(this.scene.textures && this.scene.textures.exists('effect_dark_mage_orb_0'));
        const texKey = useEffectAsset ? 'effect_dark_mage_orb_0' : 'proj_darkMage';
        let proj = Enemy._projSpritePool.pop();
        if (proj && proj.scene === this.scene) {
            proj.setTexture(texKey).setPosition(this.x, this.y);
        } else {
            if (proj) Enemy._disposeTransientObject(proj, this.scene);
            proj = this.scene.add.sprite(this.x, this.y, texKey);
        }
        proj.setDepth(8)
            .setRotation(useEffectAsset ? angle : 0)
            .setScale(useEffectAsset ? 0.25 : 1.4)
            .setBlendMode(useEffectAsset ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
            .setAlpha(1)
            .setVisible(true)
            .setActive(true);

        const speed = 150;
        Enemy._activeProjectiles.push({
            sprite: proj,
            vx: ux * speed,
            vy: uy * speed,
            lifeMs: 0,
            maxLifeMs: 3500,
            damage: this.attack,
            useEffectAsset,
            frame: 0,
            frameElapsed: 0,
            trailClock: 0,
            trailAlpha: useEffectAsset ? 0.32 : 0.5,
            hitRadius: useEffectAsset ? 18 : 12,
        });
    }

    takeDamage(amount, knockbackX, knockbackY, hitEffect = null) {
        this.hp -= amount;
        this._lastHitEffect = hitEffect || null;

        const isCrit = amount > this.maxHp * 0.5;
        const isBurn = hitEffect === 'burn';
        const isSanctuary = hitEffect === 'sanctuary';
        if (isCrit && this.scene.soundManager) this.scene.soundManager.play('critHit');
        const isOnCamera = Enemy._isNearCamera(this.scene, this.x, this.y, 96);
        const now = this.scene && this.scene.time ? this.scene.time.now : 0;
        const canPlayHitReact = isOnCamera &&
            (isCrit || !this._lastHitReactTime || now - this._lastHitReactTime >= 55) &&
            Enemy._consumeHitReactBudget(this.scene, isCrit);

        if (canPlayHitReact) {
            this._lastHitReactTime = now;
            this.setTint(0xffffff);
            this._hitFlashTimer = 110;
            this._hitFlashStage = 1;
            this._hitFlashColor = isBurn ? 0xff7a22 : (isSanctuary ? 0x66f2b0 : 0xff2233);
            this._hitSquashTimer = 70;
            const restX = this._restScaleX !== undefined ? this._restScaleX : this.scaleX;
            const restY = this._restScaleY !== undefined ? this._restScaleY : this.scaleY;
            this.setScale(restX * 1.15, restY * 0.88);
        }

        // Crit: stronger kick — screen shake + white ring burst at hit location
        if (isOnCamera && isCrit && this.scene.cameras && this.scene.cameras.main && Enemy._consumeVfxBudget(this.scene, 2)) {
            this.scene.cameras.main.shake(90, 0.004);
            try {
                const ring = this.scene.add.image(this.x, this.y, 'particle_ring')
                    .setDepth(16)
                    .setBlendMode(Phaser.BlendModes.ADD)
                    .setTint(0xffffff)
                    .setScale(0.6);
                this.scene.tweens.add({
                    targets: ring,
                    scale: 2.4,
                    alpha: 0,
                    duration: 220,
                    ease: 'Quad.Out',
                    onComplete: () => ring.destroy(),
                });
            } catch (_) { /* ring VFX optional */ }
        }

        this._spawnHitEffect(isCrit, hitEffect);

        // Knockback (unit vector without trig)
        if (knockbackX !== undefined) {
            const kx = this.x - knockbackX;
            const ky = this.y - knockbackY;
            const kDist = Math.sqrt(kx * kx + ky * ky);
            if (kDist > 0.001) {
                const invK = 200 / kDist;
                this.body.setVelocity(kx * invK, ky * invK);
            } else {
                this.body.setVelocity(200, 0);
            }
            this.knockbackTimer = 150;
        }

        // Damage number (per hit)
        this._showDamageNumber(amount);

        if (this.hp <= 0) {
            this.die();
            return true;
        }
        return false;
    }

    applySlow(multiplier, duration) {
        this.slowMultiplier = Math.min(this.slowMultiplier, multiplier);
        this.slowDuration = Math.max(this.slowDuration, duration);
        this.setTint(0x8888ff);
    }

    die() { var __oc55, __oc56;
        const wasElite = this.isElite || this._eliteDeathPending;
        this._eliteDeathPending = wasElite;

        // Drop XP
        if (this.scene.xpOrbPool) {
            this.scene.xpOrbPool.spawn(this.x, this.y, this.xpValue);
        }

        // Item drop chance
        if (this.scene.itemDropManager) {
            this.scene.itemDropManager.tryDrop(this.x, this.y);
        }

        // Quest kill counter
        if (this.scene.enemyManager) {
            this.scene.enemyManager.onEnemyKilled(this.enemyType);
        }

        // Sound
        if (this.scene.soundManager) {
            this.scene.soundManager.play(wasElite ? 'eliteKill' : 'kill');
        }

        // Death effect
        this._deathEffect();

        // Update kill counter
        if (this.scene.player) {
            this.scene.player.kills++;
        }

        this.setActive(false);
        this.setVisible(false);
        this.body.enable = false;

        // Hide aura with the enemy (pooling: kept alive for reuse on next spawn)
        if (this._aura) {
            this._aura.setVisible(false).setActive(false);
        }
        (((__oc56 = (__oc55 = this.scene.enemyManager) === null || __oc55 === void 0 ? void 0 : __oc55.releaseInactiveEnemy) === null || __oc56 === void 0 ? void 0 : __oc56.call(__oc55, this)));
        this._eliteDeathPending = false;
    }

    _spawnHitEffect(isCrit, hitEffect) {
        if (!Enemy._isNearCamera(this.scene, this.x, this.y, 128)) return;
        if (!Enemy._consumeVfxBudget(this.scene, isCrit ? 2 : 1)) return;
        if (hitEffect === 'burn') {
            this._spawnHitBurn(isCrit);
            return;
        }
        if (hitEffect === 'sanctuary') {
            this._spawnHitSanctuary(isCrit);
            return;
        }
        this._spawnHitBlood(isCrit);
    }

    _getHitVfxProfile() {
        const width = this.displayWidth || 64;
        const elite = this.isElite || this._eliteDeathPending;
        const tier = elite || width >= 112 ? 'large' : (width >= 84 ? 'medium' : 'small');
        const base = Phaser.Math.Clamp(width / 64, 0.72, elite ? 2.25 : 1.95);

        if (tier === 'large') {
            return {
                tier,
                sizeFactor: base * (elite ? 1.15 : 1.05),
                particleMult: elite ? 2.15 : 1.65,
                speedMult: elite ? 1.35 : 1.18,
                radiusMult: elite ? 1.25 : 1.12,
                hitYOffset: 0.11,
                ringRadius: width * (elite ? 0.48 : 0.42),
                ringScale: elite ? 2.65 : 2.25,
                ringAlpha: elite ? 0.48 : 0.34,
                ringWidth: elite ? 4 : 3,
                scorchScale: elite ? 1.8 : 1.45,
                frameMsAdd: 8,
            };
        }

        if (tier === 'medium') {
            return {
                tier,
                sizeFactor: base,
                particleMult: 1.18,
                speedMult: 1.05,
                radiusMult: 1,
                hitYOffset: 0.08,
                ringRadius: width * 0.32,
                ringScale: 1.75,
                ringAlpha: 0.22,
                ringWidth: 2,
                scorchScale: 1.16,
                frameMsAdd: 2,
            };
        }

        return {
            tier,
            sizeFactor: base * 0.88,
            particleMult: 0.78,
            speedMult: 0.9,
            radiusMult: 0.86,
            hitYOffset: 0.055,
            ringRadius: 0,
            ringScale: 1,
            ringAlpha: 0,
            ringWidth: 0,
            scorchScale: 0.82,
            frameMsAdd: -4,
        };
    }

    _getDeathVfxProfile() { var __oc57, __oc58;
        const width = Math.max(this.displayWidth || 0, (((__oc57 = this.body) === null || __oc57 === void 0 ? void 0 : __oc57.width)) || 0, 60);
        const height = Math.max(this.displayHeight || 0, (((__oc58 = this.body) === null || __oc58 === void 0 ? void 0 : __oc58.height)) || 0, width);
        const size = Math.max(width, height);
        const elite = this.isElite || this._eliteDeathPending;
        const ratio = Phaser.Math.Clamp(size / 64, 0.72, elite ? 3.35 : 2.35);
        const burstDiameter = size * (elite ? 1.34 : 1.18);
        const burnDiameter = size * (elite ? 1.42 : 1.24);
        const particleMult = Phaser.Math.Clamp(Math.pow(ratio, 0.86), 0.68, elite ? 2.95 : 2.08) * (elite ? 1.18 : 1);

        return {
            size,
            ratio,
            frameScale: Phaser.Math.Clamp(burstDiameter / 314, 0.24, elite ? 0.96 : 0.62),
            burnScale: Phaser.Math.Clamp(burnDiameter / 256, 0.34, elite ? 1.12 : 0.78),
            particleMult,
            sparkMult: Phaser.Math.Clamp(Math.pow(ratio, 0.72), 0.72, elite ? 2.45 : 1.85) * (elite ? 1.12 : 1),
            speedMult: Phaser.Math.Clamp(Math.pow(ratio, 0.66), 0.82, elite ? 2.0 : 1.65),
            radiusMult: Phaser.Math.Clamp(Math.pow(ratio, 0.5), 0.82, elite ? 1.82 : 1.45),
            groundW: size * (elite ? 0.56 : 0.46),
            groundH: size * (elite ? 0.22 : 0.17),
        };
    }

    _spawnHitRing(profile, color, yOffset = 0) {
        if (!((profile === null || profile === void 0 ? void 0 : profile.ringRadius)) || !this.scene) return;
        if (Enemy._isVfxConstrained(this.scene) && profile.tier !== 'large') return;
        const ring = this.scene.add.circle(this.x, this.y + yOffset, profile.ringRadius, color, 0)
            .setDepth(17)
            .setAlpha(profile.ringAlpha)
            .setBlendMode(Phaser.BlendModes.ADD);
        ring.setStrokeStyle(profile.ringWidth, color, profile.ringAlpha);
        this.scene.tweens.add({
            targets: ring,
            scale: profile.ringScale,
            alpha: 0,
            duration: profile.tier === 'large' ? 360 : 260,
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });
    }

    _spawnHitBurn(isCrit) {
        if (!this.scene) return;
        if (this.scene.soundManager) this.scene.soundManager.play('burnHit');
        const profile = this._getHitVfxProfile();
        const sizeFactor = profile.sizeFactor;
        const constrained = Enemy._isVfxConstrained(this.scene);
        const usedAsset = Enemy._playFrameVfx(
            this.scene,
            'effect_flame_burn',
            this.x,
            this.y - this.displayHeight * profile.hitYOffset,
            {
                scale: (isCrit ? 0.56 : 0.46) * sizeFactor,
                rotation: Phaser.Math.FloatBetween(-0.22, 0.22),
                depth: 18,
                frameMs: Math.max(18, (isCrit ? 22 : 24) + profile.frameMsAdd),
                frameCount: 12,
                alpha: 0.95,
                blendMode: Phaser.BlendModes.ADD,
            }
        );
        // Authored combat-hit sequences are complete VFX. Do not composite
        // runtime rings, embers, or ground ellipses over the generated image.
        if (usedAsset) return;
        this._spawnHitRing(profile, isCrit ? 0xffc45a : 0xff7a22, -this.displayHeight * 0.04);

        const particleScale = constrained ? (isCrit ? 0.55 : 0.32) : 1;
        const emberCount = Math.max(constrained ? 1 : 3, Math.round((usedAsset ? (isCrit ? 16 : 10) : (isCrit ? 12 : 7)) * profile.particleMult * particleScale));
        const maxSpeed = (usedAsset ? (isCrit ? 185 : 120) : (isCrit ? 145 : 90)) * profile.speedMult;
        for (let i = 0; i < emberCount; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 35 + Math.random() * maxSpeed;
            const r = (1.2 + Math.random() * 2.4) * profile.radiusMult;
            const color = [0xfff0a0, 0xffb347, 0xff6a18, 0x4a2a12][Math.floor(Math.random() * 4)];
            const ember = this.scene.add.circle(this.x, this.y - 4, r, color, 0.92).setDepth(11);
            ember.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: ember,
                x: this.x + Math.cos(a) * s,
                y: this.y + Math.sin(a) * s - 8,
                alpha: 0,
                scale: 0.25,
                duration: 300 + Math.random() * 260,
                ease: 'Quad.easeOut',
                onComplete: () => ember.destroy(),
            });
        }

        if (!constrained || isCrit || profile.tier === 'large') {
            const scorch = this.scene.add.ellipse(
                this.x,
                this.y + this.displayHeight * 0.18,
                20 * sizeFactor * profile.scorchScale,
                8 * sizeFactor * profile.scorchScale,
                0x1b1008,
                profile.tier === 'small' ? 0.38 : 0.55
            ).setDepth(4);
            this.scene.tweens.add({
                targets: scorch,
                scaleX: profile.tier === 'large' ? 2.15 : 1.7,
                scaleY: profile.tier === 'large' ? 1.55 : 1.25,
                alpha: 0,
                duration: profile.tier === 'large' ? 760 : 560,
                ease: 'Quad.easeOut',
                onComplete: () => scorch.destroy(),
            });
        }
    }

    _spawnHitSanctuary(isCrit) {
        if (!this.scene) return;
        const profile = this._getHitVfxProfile();
        const sizeFactor = profile.sizeFactor;
        const constrained = Enemy._isVfxConstrained(this.scene);
        const hitY = this.y - this.displayHeight * profile.hitYOffset;
        const mainColor = isCrit ? 0xe8fff5 : 0x66f2b0;
        const glowColor = isCrit ? 0xffffff : 0xb9ffe1;
        const usedAsset = Enemy._playFrameVfx(
            this.scene,
            'effect_sanctuary_hit',
            this.x,
            hitY,
            {
                scale: (isCrit ? 0.56 : 0.46) * sizeFactor,
                rotation: Phaser.Math.FloatBetween(-0.08, 0.08),
                depth: 18,
                frameMs: Math.max(15, (isCrit ? 16 : 18) + profile.frameMsAdd),
                frameCount: 16,
                alpha: 0.96,
                blendMode: Phaser.BlendModes.ADD,
            }
        );
        // Keep the authored sanctuary impact visually isolated as well.
        if (usedAsset) return;

        this._spawnHitRing(profile, mainColor, -this.displayHeight * 0.04);

        if (!usedAsset) {
            const halo = this.scene.add.circle(this.x, hitY, 10 * sizeFactor, mainColor, 0.22)
                .setDepth(18)
                .setBlendMode(Phaser.BlendModes.ADD);
            halo.setStrokeStyle(Math.max(1, Math.round(2 * sizeFactor)), glowColor, 0.58);
            this.scene.tweens.add({
                targets: halo,
                scale: isCrit ? 2.35 : 1.82,
                alpha: 0,
                duration: isCrit ? 320 : 240,
                ease: 'Cubic.easeOut',
                onComplete: () => halo.destroy(),
            });
        }

        if (!usedAsset && (!constrained || isCrit || profile.tier !== 'small')) {
            const cross = this.scene.add.graphics()
                .setPosition(this.x, hitY)
                .setDepth(19)
                .setBlendMode(Phaser.BlendModes.ADD);
            const arm = (isCrit ? 22 : 16) * sizeFactor;
            cross.lineStyle(Math.max(2, Math.round(3 * sizeFactor)), glowColor, isCrit ? 0.95 : 0.78);
            cross.lineBetween(-arm, 0, arm, 0);
            cross.lineBetween(0, -arm, 0, arm);
            cross.lineStyle(Math.max(1, Math.round(1.5 * sizeFactor)), mainColor, 0.72);
            cross.strokeCircle(0, 0, arm * 0.54);
            this.scene.tweens.add({
                targets: cross,
                scale: isCrit ? 1.35 : 1.18,
                alpha: 0,
                duration: isCrit ? 210 : 170,
                ease: 'Quad.easeOut',
                onComplete: () => cross.destroy(),
            });
        }

        const particleScale = constrained ? (isCrit ? 0.5 : 0.28) : 1;
        const count = Math.max(constrained ? 1 : 3, Math.round((usedAsset ? (isCrit ? 7 : 4) : (isCrit ? 12 : 7)) * profile.particleMult * particleScale));
        const maxSpeed = (usedAsset ? (isCrit ? 105 : 70) : (isCrit ? 155 : 95)) * profile.speedMult;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 28 + Math.random() * maxSpeed;
            const r = (1.2 + Math.random() * 1.8) * profile.radiusMult;
            const color = Math.random() < 0.45 ? 0xffffff : (Math.random() < 0.7 ? 0xb9ffe1 : 0x66f2b0);
            const mote = this.scene.add.circle(this.x, hitY, r, color, 0.9)
                .setDepth(12)
                .setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: mote,
                x: this.x + Math.cos(a) * s,
                y: hitY + Math.sin(a) * s - 14,
                alpha: 0,
                scale: 0.18,
                duration: 250 + Math.random() * 220,
                ease: 'Quad.easeOut',
                onComplete: () => mote.destroy(),
            });
        }
    }

    _spawnHitBlood(isCrit) {
        if (!this.scene) return;
        const profile = this._getHitVfxProfile();
        const sizeFactor = profile.sizeFactor;
        const hitAngle = Phaser.Math.FloatBetween(-0.45, 0.45);
        const constrained = Enemy._isVfxConstrained(this.scene);
        const usedAsset = Enemy._playFrameVfx(
            this.scene,
            isCrit ? 'effect_monster_crit' : 'effect_monster_hit',
            this.x,
            this.y - this.displayHeight * profile.hitYOffset,
            {
                scale: (isCrit ? 0.5 : 0.42) * sizeFactor,
                rotation: hitAngle,
                depth: 18,
                frameMs: Math.max(18, (isCrit ? 20 : 24) + profile.frameMsAdd),
                frameCount: isCrit ? 16 : 12,
            }
        );
        // Blood and critical impact sheets already contain their full burst.
        if (usedAsset) return;
        this._spawnHitRing(profile, isCrit ? 0xff3344 : 0xcc1020, -this.displayHeight * 0.04);

        const particleScale = constrained ? (isCrit ? 0.52 : 0.28) : 1;
        const count = Math.max(constrained ? 1 : 3, Math.round((usedAsset ? (isCrit ? 12 : 8) : (isCrit ? 8 : 4)) * profile.particleMult * particleScale));
        const maxSpeed = (usedAsset ? (isCrit ? 210 : 145) : (isCrit ? 160 : 95)) * profile.speedMult;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 45 + Math.random() * maxSpeed;
            const r = (1.6 + Math.random() * 2.2) * profile.radiusMult;
            const color = Math.random() < 0.4 ? 0x660008 : (Math.random() < 0.7 ? 0xcc1020 : 0xdd3030);
            const drop = this.scene.add.circle(this.x, this.y, r, color, 0.95).setDepth(10);
            this.scene.tweens.add({
                targets: drop,
                x: this.x + Math.cos(a) * s,
                y: this.y + Math.sin(a) * s,
                alpha: 0,
                scale: 0.35,
                duration: 280 + Math.random() * 220,
                ease: 'Quad.easeOut',
                onComplete: () => drop.destroy(),
            });
        }

        if (profile.tier === 'large' && !Enemy._isVfxSaturated(this.scene)) {
            const bruise = this.scene.add.ellipse(
                this.x,
                this.y + this.displayHeight * 0.2,
                18 * sizeFactor,
                7 * sizeFactor,
                0x330008,
                0.42
            ).setDepth(4);
            this.scene.tweens.add({
                targets: bruise,
                scaleX: 1.8,
                scaleY: 1.25,
                alpha: 0,
                duration: 520,
                ease: 'Quad.easeOut',
                onComplete: () => bruise.destroy(),
            });
        }
    }

    _deathEffect() {
        try {
            const isElite = this.isElite || this._eliteDeathPending;
            const constrained = Enemy._isVfxConstrained(this.scene);
            const saturated = Enemy._isVfxSaturated(this.scene);
            if (this._lastHitEffect === 'burn') {
                if (!Enemy._consumeVfxBudget(this.scene, isElite ? 5 : 3)) {
                    this._minimalDeathEffect(0xff6a18);
                    return;
                }
                this._burnDeathEffect();
                return;
            }

            if (saturated && !isElite) {
                this._minimalDeathEffect(0xcc1020);
                return;
            }

            if (!Enemy._consumeVfxBudget(this.scene, isElite ? 5 : (constrained ? 4 : 3))) {
                this._minimalDeathEffect(0xcc1020);
                return;
            }

            const profile = this._getDeathVfxProfile();
            const usedDeathAsset = Enemy._playFrameVfx(
                this.scene,
                'effect_monster_death',
                this.x,
                this.y - this.displayHeight * 0.05,
                {
                    scale: profile.frameScale,
                    rotation: Phaser.Math.FloatBetween(-0.5, 0.5),
                    depth: 18,
                    frameMs: 34,
                    frameCount: 16,
                }
            );

            // Pooled red blood burst (main spray)
            const emitter = Enemy._getDeathEmitter(this.scene, this.x, this.y);
            if (emitter) {
                const count = Math.round((usedDeathAsset ? (isElite ? 28 : 18) : (isElite ? 22 : 12)) * profile.particleMult);
                emitter.explode(Phaser.Math.Clamp(count, isElite ? 18 : 6, isElite ? 82 : 48));
            }

            // Pooled sparks (gore flecks)
            const sparks = Enemy._getDeathSparks(this.scene, this.x, this.y);
            if (sparks) {
                const count = Math.round((usedDeathAsset ? (isElite ? 16 : 9) : (isElite ? 12 : 6)) * profile.sparkMult);
                sparks.explode(Phaser.Math.Clamp(count, isElite ? 10 : 4, isElite ? 48 : 28));
            }

            // Flying gore chunks (skip/cap when frame VFX + pooled emitters already play under density)
            const activeCount = Enemy._frameState ? Enemy._frameState.activeCount : 0;
            const rawChunks = Math.max(constrained ? 1 : 2, Math.round((isElite ? 6 : 3) * (constrained ? 0.5 : 1) * profile.particleMult));
            const chunkCount = (usedDeathAsset && (constrained || activeCount > 70) && !isElite)
                ? 0 : Math.min(isElite ? 6 : 3, rawChunks);
            for (let i = 0; i < chunkCount; i++) {
                const a = Math.random() * Math.PI * 2;
                const s = (42 + Math.random() * 88) * profile.speedMult;
                const r = (1.9 + Math.random() * 2.8) * profile.radiusMult;
                const color = [0x660008, 0xaa0010, 0xdd2020][Math.floor(Math.random() * 3)];
                const chunk = this.scene.add.circle(this.x, this.y, r, color, 0.95).setDepth(10);
                this.scene.tweens.add({
                    targets: chunk,
                    x: this.x + Math.cos(a) * s,
                    y: this.y + Math.sin(a) * s + 10 * profile.radiusMult,
                    alpha: 0,
                    scale: 0.4,
                    duration: 550 + Math.random() * 450,
                    ease: 'Quad.easeOut',
                    onComplete: () => chunk.destroy(),
                });
            }

            // Persistent blood pool on ground (bounded by Enemy._activeDecals <= 16)
            if ((!constrained || isElite) && Enemy._activeDecals < Enemy.MAX_ACTIVE_DECALS) {
                Enemy._activeDecals++;
                const bloodPool = this.scene.add.ellipse(this.x, this.y + 6, profile.groundW, profile.groundH, 0x2a0006, 0.75).setDepth(3);
                this.scene.tweens.add({
                    targets: bloodPool,
                    scaleX: 1.8, scaleY: 1.8,
                    alpha: 0,
                    duration: constrained ? 1200 : 2200,
                    onComplete: () => {
                        Enemy._activeDecals = Math.max(0, Enemy._activeDecals - 1);
                        bloodPool.destroy();
                    },
                });
            }

            this.scene.time.delayedCall(800, () => {
                Enemy._returnDeathEmitter(emitter);
                Enemy._returnDeathSparks(sparks);
            });
        } catch (e) {
            // Fallback
            for (let i = 0; i < 6; i++) {
                const p = this.scene.add.circle(
                    this.x + Phaser.Math.Between(-10, 10), this.y + Phaser.Math.Between(-10, 10),
                    Phaser.Math.Between(2, 5), 0xcc0011, 0.85
                ).setDepth(15);
                this.scene.tweens.add({
                    targets: p, alpha: 0, scale: 0,
                    x: p.x + Phaser.Math.Between(-40, 40), y: p.y + Phaser.Math.Between(-40, 40),
                    duration: 500, onComplete: () => p.destroy(),
                });
            }
        }
    }

    _minimalDeathEffect(color = 0xcc1020) {
        if (!this.scene) return;
        if (Enemy._isVfxSaturated(this.scene) && !this.isElite && !this._eliteDeathPending) return;
        const profile = this._getDeathVfxProfile();
        const isElite = this.isElite || this._eliteDeathPending;
        const count = Math.round((isElite ? 7 : 4) * profile.particleMult);
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const distance = (18 + Math.random() * (isElite ? 54 : 34)) * profile.speedMult;
            const w = (2.4 + Math.random() * 4.2) * profile.radiusMult;
            const h = (1.2 + Math.random() * 2.2) * profile.radiusMult;
            const drop = this.scene.add.ellipse(this.x, this.y, w, h, color, 0.78)
                .setDepth(12)
                .setRotation(a);
            this.scene.tweens.add({
                targets: drop,
                x: this.x + Math.cos(a) * distance,
                y: this.y + Math.sin(a) * distance + 8 * profile.radiusMult,
                alpha: 0,
                scaleX: 0.45,
                scaleY: 0.45,
                duration: 300 + Math.random() * 220,
                ease: 'Quad.easeOut',
                onComplete: () => drop.destroy(),
            });
        }
    }

    _burnDeathEffect() {
        const profile = this._getDeathVfxProfile();
        const isElite = this.isElite || this._eliteDeathPending;
        const constrained = Enemy._isVfxConstrained(this.scene);

        Enemy._playFrameVfx(
            this.scene,
            'effect_flame_burn',
            this.x,
            this.y - this.displayHeight * 0.05,
            {
                scale: profile.burnScale,
                rotation: Phaser.Math.FloatBetween(-0.18, 0.18),
                depth: 18,
                frameMs: 38,
                frameCount: 12,
                alpha: 1,
                blendMode: Phaser.BlendModes.ADD,
            }
        );

        const activeCount = Enemy._frameState ? Enemy._frameState.activeCount : 0;
        const emberCount = (!constrained && activeCount <= 70)
            ? Math.min(isElite ? 6 : 3, Math.max(1, Math.round((isElite ? 6 : 3) * profile.particleMult)))
            : (isElite ? 3 : 0);
        for (let i = 0; i < emberCount; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = (36 + Math.random() * (isElite ? 122 : 82)) * profile.speedMult;
            const r = (1.1 + Math.random() * 2.5) * profile.radiusMult;
            const color = [0xfff0a0, 0xffbc42, 0xff741f, 0x2f2114][Math.floor(Math.random() * 4)];
            const ember = this.scene.add.circle(this.x, this.y, r, color, 0.94).setDepth(12);
            ember.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: ember,
                x: this.x + Math.cos(a) * s,
                y: this.y + Math.sin(a) * s + Phaser.Math.Between(-26, 10),
                alpha: 0,
                scale: 0.25,
                duration: 520 + Math.random() * 420,
                ease: 'Quad.easeOut',
                onComplete: () => ember.destroy(),
            });
        }

        if ((!constrained || isElite) && Enemy._activeDecals < Enemy.MAX_ACTIVE_DECALS) {
            Enemy._activeDecals++;
            const scorch = this.scene.add.ellipse(
                this.x,
                this.y + 7,
                profile.groundW * (isElite ? 1.18 : 1),
                profile.groundH * (isElite ? 1.18 : 1),
                0x1a0e07,
                0.72
            ).setDepth(3);
            this.scene.tweens.add({
                targets: scorch,
                scaleX: 2.2,
                scaleY: 1.7,
                alpha: 0,
                duration: constrained ? 900 : 1500,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    Enemy._activeDecals = Math.max(0, Enemy._activeDecals - 1);
                    scorch.destroy();
                },
            });
        }
    }

    destroy(fromScene) {
        if (this.scene && this.scene.tweens) {
            this.scene.tweens.killTweensOf(this);
            if (this._aura) this.scene.tweens.killTweensOf(this._aura);
            if (this._eliteLabel) this.scene.tweens.killTweensOf(this._eliteLabel);
        }
        if (this._eliteLabel) {
            this._eliteLabel.destroy();
            this._eliteLabel = null;
        }
        try {
            if (this._eliteGlow && this.filters) this.filters.internal.remove(this._eliteGlow);
        } catch (e) { /* filters may already be gone */ }
        this._eliteGlow = null;
        if (this._aura) {
            this._aura.destroy();
            this._aura = null;
        }
        super.destroy(fromScene);
    }

    
    
    

    _showDamageNumber(value) {
        const isCrit = value > this.maxHp * 0.5;
        if (!Enemy._isNearCamera(this.scene, this.x, this.y, 50)) return;

        // 2. 같은 적에게 100ms 이내 재표시 방지
        const now = this.scene.time.now;
        if (this._lastDmgTextTime && now - this._lastDmgTextTime < 100) return;

        // 3. 동시 표시 상한
        if (Enemy._activeTexts.length >= Enemy.MAX_DMG_TEXTS) return;
        if (!Enemy._consumeDmgTextBudget(this.scene, isCrit)) return;
        this._lastDmgTextTime = now;

        const x = this.x + Phaser.Math.Between(-10, 10);
        const y = this.y - 15;

        let text = Enemy._dmgTextPool.pop();
        if (text && text.scene) {
            text.setPosition(x, y);
            text.setText(isCrit ? value + '!' : String(value));
            text.setFontSize(isCrit ? '18px' : '14px');
            text.setColor(isCrit ? COLORS.TEXT_GOLD : COLORS.TEXT_WHITE);
            text.setAlpha(1).setVisible(true).setActive(true);
        } else {
            text = this.scene.add.text(x, y, isCrit ? value + '!' : String(value), {
                fontSize: isCrit ? '18px' : '14px',
                fontFamily: 'Arial',
                fontStyle: 'bold',
                color: isCrit ? COLORS.TEXT_GOLD : COLORS.TEXT_WHITE,
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5).setDepth(100);
        }

        text._startY = y;
        text._elapsed = 0;
        Enemy._activeTexts.push(text);
    }

    static updateDmgTexts(scene, delta) {
        const pool = Enemy._dmgTextPool;
        const active = Enemy._activeTexts;
        for (let i = active.length - 1; i >= 0; i--) {
            const t = active[i];
            if (!t || !t.scene) {
                active.splice(i, 1);
                continue;
            }
            t._elapsed += delta;
            const progress = t._elapsed / 500;
            if (progress >= 1) {
                t.setVisible(false).setActive(false);
                active.splice(i, 1);
                if (pool.length < 60) pool.push(t);
                else t.destroy();
            } else {
                t.y = t._startY - 30 * progress;
                t.alpha = 1 - progress;
            }
        }
    }
}
Enemy._deathEmitterPool = [];
Enemy._deathSparkPool = [];
Enemy.MAX_POOLED_EMITTERS = 8;
Enemy._vfxSpritePool = [];
Enemy._activeFrameVfx = [];
Enemy._projSpritePool = [];
Enemy._activeProjectiles = [];
Enemy._projTrailPool = [];
Enemy._activeProjTrails = [];
Enemy._activeDecals = 0;
Enemy.MAX_ACTIVE_DECALS = 16;
Enemy._frameState = null;
Enemy._vfxBudgetFrame = -1;
Enemy._vfxBudgetUsed = 0;
Enemy.MAX_VFX_BUDGET_PER_FRAME = 12;
Enemy._hitReactBudgetFrame = -1;
Enemy._hitReactBudgetUsed = 0;
Enemy.MAX_HIT_REACTS_PER_FRAME = 28;
Enemy._dmgTextBudgetFrame = -1;
Enemy._dmgTextBudgetUsed = 0;
Enemy.MAX_DMG_TEXTS_PER_FRAME = 12;
Enemy._dmgTextPool = [];
Enemy._activeTexts = [];
Enemy.MAX_DMG_TEXTS = 40;
