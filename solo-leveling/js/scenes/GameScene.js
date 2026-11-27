import {
    GAME_WIDTH, GAME_HEIGHT, WORLD_SIZE,
    COLORS, PLAYER_BASE_STATS, RANKS, BOSS_SCHEDULE, BOSS_TYPES, getXpToNext,
    SYSTEM, UI_FONT_MONO, UI_FONT_KR, fs, uv, drawSystemPanel,
} from '../utils/Constants.js';
import { t, GAME_API_URL, GAME_ID_SHADOW } from '../utils/i18n.js';
import { Player } from '../entities/Player.js?v=20261120-fastload-v2';
import { ShadowSoldier } from '../entities/ShadowSoldier.js';
import { EnemyManager } from '../managers/EnemyManager.js?v=20261009-orient-v1&fastload=20261120-v2';
import { WeaponManager } from '../managers/WeaponManager.js?v=20261120-fastload-v2';
import { ShadowArmyManager } from '../managers/ShadowArmyManager.js?v=20261010-arise-v1&fastload=20261120-v2';
import { SoundManager } from '../managers/SoundManager.js?v=20261127-sfx-sync-v1';
import { XPOrbPool } from '../entities/XPOrb.js?v=20261009-levelup-v1';
import { ItemDropManager } from '../entities/ItemDrop.js?v=20260928-locale-exports-v1';
import { Boss } from '../entities/Boss.js?v=20261120-fastload-v2';
import { Enemy } from '../entities/Enemy.js?v=20261120-fastload-v2';
import { HUD } from '../ui/HUD.js?v=20261009-orient-v1&audit=20261009-v1&ui=20261127-gothic-ui-v2';
import { SystemMessage } from '../ui/SystemMessage.js?v=20261009-orient-v1&ui=20261127-gothic-ui-v2';
import { StatusWindow } from '../ui/StatusWindow.js?v=20261009-orient-v1&audit=20261009-v1&ui=20261127-gothic-ui-v2';
import { MobileControls } from '../ui/MobileControls.js?v=20261009-orient-v1&ui=20261127-gothic-ui-v2';
import { UIAssets } from '../ui/UIAssets.js?v=20261127-gothic-ui-v1';
import { DEFAULT_CHARACTER_ID, getCharacter, getCharacterRankingGameId, getCharacterWeaponKeys, getStarterWeaponKey } from '../utils/Characters.js';
import { getGameplayDeferredBatches } from '../utils/AssetManifest.js?v=20261120-fastload-v2';
import { SpriteFactory } from '../utils/SpriteFactory.js?v=20261120-fastload-v2';

const SAVE_KEY = 'shadow_survival_save_v1';
const SAVE_VERSION = 1;
const AUTO_SAVE_INTERVAL_MS = 10000;
const AUTO_SAVE_ENEMY_LIMIT = 140;
const FORCE_SAVE_ENEMY_LIMIT = 260;
const RANK_PROGRESS_SYNC_INTERVAL_MS = 5000;
const RANK_SYNC_MAX_ATTEMPTS = 3;
const RANK_SYNC_RETRY_DELAY_MS = 400;

export class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    init(data = {}) { var __oc0;
        this._rankRunToken = {};
        this._resumeRequested = !!data.resume;
        const savedData = this._resumeRequested ? GameScene.getSavedGameData() : null;
        this._selectedCharacterId = (((__oc0 = savedData === null || savedData === void 0 ? void 0 : savedData.player) === null || __oc0 === void 0 ? void 0 : __oc0.characterId)) || data.characterId || DEFAULT_CHARACTER_ID;
        this._restoredFromSave = false;
        this._lastAutoSaveAt = 0;
        this._rankSessionId = null;
        this._rankSessionPromise = null;
        this._rankSyncFailed = false;
        this._rankSyncDisabled = false;
        this._rankSyncedScore = 0;
        this._rankLastSyncGameTime = 0;
        this._rankSyncInFlight = null;
        this._deferredQueue = [];
        this._deferredActive = false;
        this._deferredStopped = false;
        this._deferredUpgradeQueue = [];
        this._deferredUpgradeTimer = null;
        this._deferredTimer = null;
        this._deferredFallbackMap = new Map();
        this._deferredListeners = null;
        this._webpSupported = null;
    }

    create() {
        const alLink = document.getElementById('archerlab-link');
        if (alLink) alLink.style.display = 'none';

        this.isGameOver = false;
        this._isBooting = true;
        this._startupTimers = [];

        this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

        if (!this.game._soundManager) {
            this.game._soundManager = new SoundManager();
            this.game._soundManager.init();
        }
        this.soundManager = this.game._soundManager;
        if (this.soundManager.setActiveCharacter) {
            this.soundManager.setActiveCharacter(this._selectedCharacterId);
        }
        this.soundManager.stopIntroMusic();
        this.soundManager.resume();

        this.systemMessage = new SystemMessage(this);
        this._createStartupOverlay();
        this._createFloor();
        this._createEnvironmentProps();

        this.player = new Player(this, WORLD_SIZE / 2, WORLD_SIZE / 2, this._selectedCharacterId);
        this._initRankSession();
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
        this.cameras.main.setZoom(1);
        this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

        this.activeBosses = [];
        this.bossesSpawned = [];

        this.events.once('shutdown', this.shutdown, this);
        this._registerResizeHandler();

        this._runStartupSequence([
            {
                label: 'ORB CACHE',
                run: () => {
                    this.xpOrbPool = new XPOrbPool(this, {
                        initialSize: 24,
                        warmSize: 80,
                        batchSize: 12,
                        batchDelay: 70,
                        warmupDelay: 500,
                    });
                },
            },
            {
                label: 'ITEMS',
                run: () => {
                    this.itemDropManager = new ItemDropManager(this);
                },
            },
            {
                label: 'ENEMIES',
                run: () => {
                    this.enemyManager = new EnemyManager(this, {
                        initialPoolSize: 12,
                        warmPoolSize: 50,
                        warmBatchSize: 8,
                        warmBatchDelay: 70,
                        warmupDelay: 650,
                        openingWaveDelay: this._resumeRequested ? null : 1400,
                    });
                },
            },
            {
                label: 'WEAPONS',
                run: () => {
                    this.weaponManager = new WeaponManager(this, this.player);
                    this.weaponManager.addWeapon(getStarterWeaponKey(this.player.characterId));
                    this.shadowArmyManager = new ShadowArmyManager(this);
                },
            },
            {
                label: 'INTERFACE',
                run: () => {
                    this.hud = new HUD(this);
                    this.statusWindow = new StatusWindow(this);
                    this.mobileControls = new MobileControls(this);
                    this.physics.add.collider(this.player, this.enemyManager.getGroup());
                },
            },
            {
                label: 'SAVE DATA',
                run: () => {
                    if (this._resumeRequested) {
                        this._restoredFromSave = this._restoreSavedGame();
                        if (!this._restoredFromSave) GameScene.clearSavedGame();
                    } else {
                        GameScene.clearSavedGame();
                    }
                    this._registerSaveHandlers();
                },
            },
            {
                label: 'EFFECTS',
                run: () => {
                    this._createAmbientParticles();
                    this._setupCameraFilters();
                    this._setupColorTint();
                    this._setupVignette();
                },
            },
        ]);
    }

    _runStartupSequence(steps) {
        let index = 0;
        const total = steps.length;

        const runNext = () => { var __oc1;
            if (!this._isBooting) return;
            if (index >= total) {
                this._finishStartup();
                return;
            }

            const step = steps[index];
            this._setStartupProgress(index, total, step.label);
            try {
                step.run();
            } catch (e) {
                console.error('GameScene startup step failed:', step.label, e);
                throw e;
            }

            index += 1;
            this._setStartupProgress(index, total, step.label);
            const timer = this.time.delayedCall((((__oc1 = step.delay) !== null && __oc1 !== void 0 ? __oc1 : 8)), runNext);
            this._startupTimers.push(timer);
        };

        const timer = this.time.delayedCall(0, runNext);
        this._startupTimers.push(timer);
    }

    _finishStartup() {
        if (!this._isBooting) return;
        this._isBooting = false;
        this._setStartupProgress(1, 1, 'READY');
        this._destroyStartupOverlay();

        this.cameras.main.fadeIn(260, 0, 0, 0);
        this.time.delayedCall(700, () => {
            if (this.soundManager && !this.isGameOver) this.soundManager.startGameBGM();
        });

        this._scheduleIntroMessages();
        this._setupSoundToggle();
        this._scheduleDeferredAssetStreaming(300);
    }

    _supportsWebP() {
        if (this._webpSupported !== null) return this._webpSupported;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            this._webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
        } catch (e) {
            this._webpSupported = false;
        }
        return this._webpSupported;
    }

    _queueDeferredImage(key, pngPath, options = {}) {
        if (!this.textures || this.textures.exists(key) || !this.load) return false;
        if (options && options.type === 'atlas' && options.atlasURL) {
            const sepImg = pngPath.includes('?') ? '&' : '?';
            const sepJson = options.atlasURL.includes('?') ? '&' : '?';
            const imgPath = options.cacheVersion ? `${pngPath}${sepImg}v=${encodeURIComponent(options.cacheVersion)}` : pngPath;
            const jsonPath = options.cacheVersion ? `${options.atlasURL}${sepJson}v=${encodeURIComponent(options.cacheVersion)}` : options.atlasURL;
            this.load.atlas(key, imgPath, jsonPath);
            return true;
        }
        const useWebP = !options.preferPng && this._supportsWebP() && pngPath.endsWith('.png');
        const rawPath = useWebP ? pngPath.replace(/\.png$/i, '.webp') : pngPath;
        const versionSuffix = options.cacheVersion
            ? `${rawPath.includes('?') ? '&' : '?'}v=${encodeURIComponent(options.cacheVersion)}`
            : '';
        const path = `${rawPath}${versionSuffix}`;
        if (useWebP && this._deferredFallbackMap) {
            const fallbackSuffix = options.cacheVersion
                ? `${pngPath.includes('?') ? '&' : '?'}v=${encodeURIComponent(options.cacheVersion)}`
                : '';
            this._deferredFallbackMap.set(key, `${pngPath}${fallbackSuffix}`);
        }
        this.load.image(key, path);
        return true;
    }

    _scheduleDeferredAssetStreaming(delayMs = 300) {
        if (this._deferredStopped) return;
        if (this._deferredTimer) {
            this._deferredTimer.remove(false);
            this._deferredTimer = null;
        }
        this._deferredTimer = this.time.delayedCall(delayMs, () => {
            this._deferredTimer = null;
            this._startDeferredAssetStreaming();
        });
    }

    _startDeferredAssetStreaming() {
        if (this._deferredStopped || this.isGameOver || !this.sys || !this.sys.isActive()) return;
        const batches = getGameplayDeferredBatches(this._selectedCharacterId, { useAtlases: this._supportsWebP() });
        const queue = [];
        for (let i = 0; i < batches.length; i++) {
            const assets = batches[i].assets || [];
            for (let j = 0; j < assets.length; j++) {
                const asset = assets[j];
                if (asset && asset.key && !this.textures.exists(asset.key)) {
                    queue.push(asset);
                }
            }
        }
        this._deferredQueue = queue;
        this._pumpDeferredBatch();
    }

    _pumpDeferredBatch() {
        if (this._deferredStopped || this._deferredActive || this.isGameOver) return;
        if (!this.sys || !this.sys.isActive() || !this.load) return;
        if (this.load.isLoading()) {
            this._deferredTimer = this.time.delayedCall(80, () => {
                this._deferredTimer = null;
                this._pumpDeferredBatch();
            });
            return;
        }

        const batch = [];
        while (batch.length < 6 && this._deferredQueue.length > 0) {
            const asset = this._deferredQueue.shift();
            if (!asset || this.textures.exists(asset.key)) continue;
            if (this._queueDeferredImage(asset.key, asset.path, asset)) {
                batch.push(asset);
            }
        }
        if (batch.length === 0) {
            if (this._deferredQueue.length > 0) this._pumpDeferredBatch();
            return;
        }

        this._deferredActive = true;
        const onFileComplete = (key) => {
            if (this._deferredStopped) return;
            if (key.startsWith('ai_enemy_') || key.startsWith('ai_boss_')
                || key.startsWith('atlas_enemies_') || key.startsWith('atlas_boss_')
                || key.startsWith('asset_shadow_') || key === 'asset_arise_rune') {
                this._deferredUpgradeQueue.push(key);
                this._scheduleDeferredUpgrade();
            }
        };
        const onError = (file) => {
            const fallback = this._deferredFallbackMap ? this._deferredFallbackMap.get(file.key) : null;
            if (fallback) {
                this._deferredFallbackMap.delete(file.key);
                this.load.image(file.key, fallback);
            }
        };
        const cleanup = () => {
            this._deferredActive = false;
            if (this.load) {
                this.load.off('filecomplete', onFileComplete);
                this.load.off('loaderror', onError);
                this.load.off('complete', onComplete);
            }
            this._deferredListeners = null;
        };
        const onComplete = () => {
            cleanup();
            if (this._deferredStopped || this.isGameOver || !this.sys || !this.sys.isActive()) return;
            if (this._deferredQueue.length > 0) {
                this._deferredTimer = this.time.delayedCall(80, () => {
                    this._deferredTimer = null;
                    this._pumpDeferredBatch();
                });
            }
        };
        this._deferredListeners = { cleanup };
        this.load.on('filecomplete', onFileComplete);
        this.load.on('loaderror', onError);
        this.load.once('complete', onComplete);
        this.load.start();
    }

    _scheduleDeferredUpgrade() {
        if (this._deferredStopped || this._deferredUpgradeTimer || this._deferredUpgradeQueue.length === 0) return;
        this._deferredUpgradeTimer = this.time.delayedCall(40, () => {
            this._deferredUpgradeTimer = null;
            if (this._deferredStopped || this.isGameOver || !this.sys || !this.sys.isActive()) return;
            const key = this._deferredUpgradeQueue.shift();
            if (key) {
                try {
                    SpriteFactory.upgradeLoadedTexture(this, key);
                } catch (e) {
                    console.warn('[GameScene] Deferred texture upgrade failed:', key, e);
                }
            }
            if (this._deferredUpgradeQueue.length > 0) {
                this._scheduleDeferredUpgrade();
            }
        });
    }

    _initRankSession() {
        const token = this._rankRunToken;
        if (this._resumeRequested) {
            this._rankSyncDisabled = true;
            this._rankSyncFailed = true;
            return;
        }
        if (this._rankSessionId) {
            this._rankSessionPromise = Promise.resolve(this._rankSessionId);
            return;
        }
        const gameId = getCharacterRankingGameId(GAME_ID_SHADOW, this._selectedCharacterId);
        this._rankSessionPromise = fetch(`${GAME_API_URL}/score-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ game_id: gameId }),
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(`rank session ${res.status}`);
                const data = await res.json();
                if (token !== this._rankRunToken) return null;
                if (!data || !data.session_id) throw new Error('rank session response invalid');
                this._rankSessionId = data.session_id;
                this._rankSyncFailed = false;
                this._autoSave(true);
                return this._rankSessionId;
            })
            .catch((e) => { var __oc2, __oc3;
                if (token !== this._rankRunToken) return null;
                this._rankSyncFailed = true;
                this._rankSessionPromise = null;
                (((__oc3 = (__oc2 = window.ArcherLabClientErrorReporter) === null || __oc2 === void 0 ? void 0 : __oc2.reportCodeException) === null || __oc3 === void 0 ? void 0 : __oc3.call(__oc2, e, { phase: 'rank-session' }, 'ranking_client_exception')));
                console.warn('[ShadowSurvival] rank session failed:', e.message);
                return null;
            });
    }

    async _ensureRankSession() {
        if (this._rankSyncDisabled) return null;
        if (this._rankSessionId) return this._rankSessionId;
        if (!this._rankSessionPromise) this._initRankSession();
        return this._rankSessionPromise;
    }

    _getRankGameId() { var __oc4;
        const characterId = (((__oc4 = this.player) === null || __oc4 === void 0 ? void 0 : __oc4.characterId)) || this._selectedCharacterId || DEFAULT_CHARACTER_ID;
        return getCharacterRankingGameId(GAME_ID_SHADOW, characterId);
    }

    _getRankProgressEvent(score) { var __oc5, __oc6, __oc7, __oc8, __oc9;
        return {
            type: 'progress',
            survived_seconds: Math.max(0, Math.floor(score || 0)),
            level: Math.max(1, Math.floor((((__oc5 = this.player) === null || __oc5 === void 0 ? void 0 : __oc5.level)) || 1)),
            rank: (((__oc6 = this.player) === null || __oc6 === void 0 ? void 0 : __oc6.currentRank)) || 'E',
            kills: Math.max(0, Math.floor((((__oc7 = this.player) === null || __oc7 === void 0 ? void 0 : __oc7.kills)) || 0)),
            shadow_count: Math.max(0, Math.floor((((__oc9 = (__oc8 = this.shadowArmyManager) === null || __oc8 === void 0 ? void 0 : __oc8.getSoldierCount) === null || __oc9 === void 0 ? void 0 : __oc9.call(__oc8))) || 0)),
        };
    }

    _updateRankProgressSync() { var __oc10, __oc11;
        if (this._rankSyncDisabled || !this.enemyManager || this.isGameOver || this._isBooting) return;
        const gameTime = (((__oc11 = (__oc10 = this.enemyManager).getGameTime) === null || __oc11 === void 0 ? void 0 : __oc11.call(__oc10))) || 0;
        if (gameTime - this._rankLastSyncGameTime < RANK_PROGRESS_SYNC_INTERVAL_MS) return;
        this._rankLastSyncGameTime = gameTime;
        this._syncRankProgress(false);
    }

    async _syncRankProgress(force = false) { var __oc12, __oc13, __oc14, __oc15, __oc16, __oc17, __oc18;
        const token = this._rankRunToken;
        const gameId = this._getRankGameId();
        const deliveryScore = Math.max(0, Math.floor(((((__oc13 = (__oc12 = this.enemyManager) === null || __oc12 === void 0 ? void 0 : __oc12.getGameTime) === null || __oc13 === void 0 ? void 0 : __oc13.call(__oc12))) || 0) / 1000));
        const deliveryEvent = this._getRankProgressEvent(deliveryScore);
        if (!this._rankSyncDisabled && deliveryScore > 0) {
            (((__oc14 = window.ArcherRanking) === null || __oc14 === void 0 ? void 0 : __oc14.track(this._getRankGameId(), deliveryEvent, this._rankSessionId)));
        }
        if (this._rankSyncInFlight) {
            if (!force) return this._rankSyncInFlight;
            await this._rankSyncInFlight;
            if (token !== this._rankRunToken) return null;
        }
        if (this._rankSyncDisabled) return null;

        const score = Math.max(0, Math.floor(((((__oc16 = (__oc15 = this.enemyManager) === null || __oc15 === void 0 ? void 0 : __oc15.getGameTime) === null || __oc16 === void 0 ? void 0 : __oc16.call(__oc15))) || 0) / 1000));
        if (score <= 0 || (!force && score <= this._rankSyncedScore)) {
            return this._rankSyncedScore;
        }

        const syncPromise = (async () => {
            const sessionId = await this._ensureRankSession();
            if (token !== this._rankRunToken) return null;
            if (!sessionId) throw new Error('rank session unavailable');

            const response = await fetch(`${GAME_API_URL}/score-events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    game_id: gameId,
                    session_id: sessionId,
                    event: deliveryEvent,
                }),
            });
            const data = await response.json().catch(() => null);
            if (token !== this._rankRunToken) return null;
            if (!response.ok || !data || data.success !== true) {
                throw new Error(((data === null || data === void 0 ? void 0 : data.error)) || `rank progress ${response.status}`);
            }

            const verifiedScore = Number(data.score);
            this._rankSyncedScore = Number.isFinite(verifiedScore) ? verifiedScore : score;
            this._rankSyncFailed = false;
            return this._rankSyncedScore;
        })();

        this._rankSyncInFlight = syncPromise;
        try {
            return await syncPromise;
        } catch (e) {
            if (token !== this._rankRunToken) return null;
            this._rankSyncFailed = true;
            (((__oc18 = (__oc17 = window.ArcherLabClientErrorReporter) === null || __oc17 === void 0 ? void 0 : __oc17.reportCodeException) === null || __oc18 === void 0 ? void 0 : __oc18.call(__oc17, e, { phase: 'rank-progress-sync' }, 'ranking_client_exception')));
            console.warn('[ShadowSurvival] rank progress sync failed:', e.message);
            return null;
        } finally {
            if (this._rankSyncInFlight === syncPromise) this._rankSyncInFlight = null;
        }
    }

    async _flushRankProgress() { var __oc19, __oc20;
        if (window.ArcherRanking && !this._rankSyncDisabled) {
            const score = Math.max(0, Math.floor(((((__oc20 = (__oc19 = this.enemyManager) === null || __oc19 === void 0 ? void 0 : __oc19.getGameTime) === null || __oc20 === void 0 ? void 0 : __oc20.call(__oc19))) || 0) / 1000));
            if (score > 0) window.ArcherRanking.track(this._getRankGameId(), this._getRankProgressEvent(score), this._rankSessionId);
            return null; // Verification happens in the durable server delivery, not in the UI.
        }
        if (this._rankSyncDisabled) return null;
        if (this._rankSyncInFlight) await this._rankSyncInFlight;
        for (let attempt = 0; attempt < RANK_SYNC_MAX_ATTEMPTS; attempt += 1) {
            const verifiedScore = await this._syncRankProgress(true);
            if (Number.isFinite(verifiedScore)) return verifiedScore;
            if (attempt < RANK_SYNC_MAX_ATTEMPTS - 1) {
                await new Promise(resolve => setTimeout(resolve, RANK_SYNC_RETRY_DELAY_MS * (attempt + 1)));
            }
        }
        return null;
    }

    _createStartupOverlay() {
        const cam = this.cameras.main;
        const cx = cam.width / 2;
        const cy = cam.height / 2;
        const w = Math.min(uv(500), cam.width - uv(44));
        const h = Math.min(uv(220), cam.height - uv(54));
        const x = cx - w / 2;
        const y = cy - h / 2;

        const bg = this.add.rectangle(cx, cy, cam.width, cam.height, 0x05030d, 0.88)
            .setScrollFactor(0).setDepth(300);
        const panel = UIAssets.createPanel(this, x, y, w, h, {
            variant: 'modal',
            depth: 301,
            scrollFactor: 0,
        });
        const innerShade = this.add.rectangle(cx, cy + uv(4), w - uv(96), h - uv(72), 0x05030d, 0.42)
            .setScrollFactor(0).setDepth(301.2);
        const core = this.textures.exists('icon_loading_core')
            ? this.add.image(cx, cy - uv(58), 'icon_loading_core')
                .setDisplaySize(uv(46), uv(46))
                .setTint(0xc8a4ff)
                .setAlpha(0.98)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setScrollFactor(0)
                .setDepth(302)
            : null;
        if (core) {
            this._startupCoreTween = this.tweens.add({
                targets: core,
                angle: 360,
                duration: 2800,
                repeat: -1,
                ease: 'Linear',
            });
        }
        const title = this.add.text(cx, cy - uv(20), t('loading'), {
            fontSize: fs(17),
            fontFamily: UI_FONT_KR,
            fontStyle: 'bold',
            color: '#f5efff',
            stroke: '#02040a',
            strokeThickness: 4,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(302);
        const label = this.add.text(cx, cy + uv(8), '[ GATE LINK · WORLD SYNC ]', {
            fontSize: fs(9),
            fontFamily: UI_FONT_MONO,
            color: '#d4c398',
            stroke: '#02040a',
            strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(302);
        const barW = Math.max(uv(160), w - uv(176));
        const barH = Math.max(uv(12), 12);
        const barY = cy + uv(39);
        const barBg = this.add.rectangle(cx - barW / 2, barY, barW, barH, 0x080514, 0.98)
            .setOrigin(0, 0.5)
            .setStrokeStyle(1, 0x4d3a7a, 0.72)
            .setScrollFactor(0).setDepth(302);
        const barFill = this.add.rectangle(cx - barW / 2, barY, 2, Math.max(4, barH - 4), 0x9b6eff, 1)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(303);
        const barFrame = this.textures.exists('ui_hud_bar_frame')
            ? UIAssets.createPanel(this, cx - barW / 2 - uv(12), barY - (barH + uv(12)) / 2, barW + uv(24), barH + uv(12), {
                variant: 'bar',
                depth: 303.5,
                scrollFactor: 0,
            })
            : null;
        const percent = this.add.text(cx, cy + uv(64), '000 %  ·  00 / 00', {
            fontSize: fs(10),
            fontFamily: UI_FONT_MONO,
            color: '#e8c266',
            stroke: '#02040a',
            strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(302);

        this._startupOverlay = [bg, panel, innerShade, core, title, label, barBg, barFill, barFrame, percent].filter(Boolean);
        this._startupLabel = label;
        this._startupPercent = percent;
        this._startupProgressFill = barFill;
        this._startupProgressWidth = barW;
        this._startupProgressHeight = Math.max(4, barH - 4);
    }

    _setStartupProgress(done, total, label) {
        if (!this._startupProgressFill) return;
        const progress = Phaser.Math.Clamp(total > 0 ? done / total : 1, 0.02, 1);
        this._startupProgressFill.setDisplaySize(
            Math.max(2, this._startupProgressWidth * progress),
            this._startupProgressHeight || uv(5)
        );
        const completed = Math.min(total, Math.max(0, done));
        if (this._startupLabel && label) {
            this._startupLabel.setText(`[ ${String(completed).padStart(2, '0')} / ${String(total).padStart(2, '0')} · ${label} ]`);
        }
        if (this._startupPercent) {
            this._startupPercent.setText(
                `${String(Math.floor(progress * 100)).padStart(3, '0')} %  ·  ${String(completed).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
            );
        }
    }

    _destroyStartupOverlay() { var __oc21, __oc22;
        const elements = this._startupOverlay || [];
        if (elements.length === 0) return;

        if (this._startupCoreTween) {
            this._startupCoreTween.stop();
            this._startupCoreTween = null;
        }

        this.tweens.add({
            targets: elements,
            alpha: 0,
            duration: (((__oc22 = (__oc21 = window.matchMedia) === null || __oc21 === void 0 ? void 0 : __oc21.call(window, '(prefers-reduced-motion: reduce)')) === null || __oc22 === void 0 ? void 0 : __oc22.matches)) ? 0 : 180,
            onComplete: () => {
                elements.forEach(el => {
                    if (((el === null || el === void 0 ? void 0 : el.active))) el.destroy();
                });
            },
        });

        this._startupOverlay = null;
        this._startupLabel = null;
        this._startupPercent = null;
        this._startupProgressFill = null;
    }

    _relayoutStartupOverlay() { var __oc23, __oc24, __oc25;
        if (!(((__oc23 = this._startupOverlay) === null || __oc23 === void 0 ? void 0 : __oc23.length))) return;
        const label = (((__oc24 = this._startupLabel) === null || __oc24 === void 0 ? void 0 : __oc24.text)) || '';
        const percent = (((__oc25 = this._startupPercent) === null || __oc25 === void 0 ? void 0 : __oc25.text)) || '';
        const ratio = this._startupProgressWidth > 0 && this._startupProgressFill
            ? this._startupProgressFill.displayWidth / this._startupProgressWidth
            : 1;
        const elements = this._startupOverlay;
        if (this._startupCoreTween) {
            this._startupCoreTween.stop();
            this._startupCoreTween = null;
        }
        elements.forEach(el => {
            if (((el === null || el === void 0 ? void 0 : el.active))) el.destroy();
        });
        this._startupOverlay = null;
        this._startupLabel = null;
        this._startupPercent = null;
        this._startupProgressFill = null;
        this._createStartupOverlay();
        if (label && this._startupLabel) this._startupLabel.setText(label);
        if (percent && this._startupPercent) this._startupPercent.setText(percent);
        if (this._startupProgressFill) {
            this._startupProgressFill.setDisplaySize(
                Math.max(2, (this._startupProgressWidth || 1) * Phaser.Math.Clamp(ratio, 0.02, 1)),
                this._startupProgressHeight || uv(5)
            );
        }
    }

    _registerResizeHandler() {
        this._onGameResize = () => { var __oc26, __oc27, __oc28, __oc29;
            const cam = this.cameras.main;
            if (cam.width !== GAME_WIDTH || cam.height !== GAME_HEIGHT) {
                cam.setSize(GAME_WIDTH, GAME_HEIGHT);
            }
            cam.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
            if (this.player) cam.centerOn(this.player.x, this.player.y);
            this._relayoutStartupOverlay();
            if (this.hud) this.hud.rebuild();
            if (this.statusWindow && this.statusWindow.isOpen) {
                this.statusWindow.close();
                this.statusWindow.open();
            }
            if (this.mobileControls) {
                this.mobileControls.destroy();
                this.mobileControls = new MobileControls(this);
            }
            if (this.systemMessage) this.systemMessage.relayout();
            (((__oc27 = (__oc26 = this.enemyManager) === null || __oc26 === void 0 ? void 0 : __oc26.syncScreenLayout) === null || __oc27 === void 0 ? void 0 : __oc27.call(__oc26)));
            (((__oc29 = (__oc28 = this.shadowArmyManager) === null || __oc28 === void 0 ? void 0 : __oc28.syncScreenLayout) === null || __oc29 === void 0 ? void 0 : __oc29.call(__oc28)));
            if (this._vignetteOverlay) {
                this._vignetteOverlay.setPosition(cam.width / 2, cam.height / 2);
                this._vignetteOverlay.setDisplaySize(cam.width * 1.15, cam.height * 1.15);
            }
            if (this._colorTint) {
                this._colorTint.setPosition(cam.width / 2, cam.height / 2);
                this._colorTint.setSize(cam.width, cam.height);
            }
            if (this._mobileDarken) {
                this._mobileDarken.setPosition(cam.width / 2, cam.height / 2);
                this._mobileDarken.setSize(cam.width, cam.height);
            }
        };
        this.events.on('game-resize', this._onGameResize, this);
    }

    _scheduleIntroMessages() {
        if (this._restoredFromSave) {
            this.time.delayedCall(500, () => {
                this.systemMessage.show(t('sysSystem'), [
                    t('resumeLoaded'),
                    `${t('levelLabel')} ${this.player.level} \u00b7 ${t('killLabel')} ${this.player.kills}`,
                ], { duration: 2400, type: 'quest' });
            });
        }
    }

    _setupSoundToggle() {
        this._soundToggleKey = this.input.keyboard.addKey('M');
        this._soundToggleHandler = () => {
            const enabled = this.soundManager.toggleSound();
            this.systemMessage.show(t('sysSystem'), [enabled ? t('sysSoundOn') : t('sysSoundOff')], { duration: 1000 });
        };
        this._soundToggleKey.on('down', this._soundToggleHandler);
    }

    update(time, delta) { var __oc30, __oc31;
        if (this.isGameOver || this._isBooting) return;
        if (!this.player || !this.enemyManager || !this.weaponManager || !this.xpOrbPool || !this.itemDropManager || !this.shadowArmyManager || !this.hud) return;
        // The status panel only pauses physics. Enemy attacks and weapon timers
        // are plain update calls, so the run must stop while the player is reading it.
        if ((((__oc30 = this.statusWindow) === null || __oc30 === void 0 ? void 0 : __oc30.isOpen))) return;
        if ((((__oc31 = this.shadowArmyManager) === null || __oc31 === void 0 ? void 0 : __oc31.isPerformingArise))) return;

        // Auto quality adjustment based on FPS and active horde density
        this._fpsCheckTimer = (this._fpsCheckTimer || 0) + delta;
        if (this._fpsCheckTimer > 2000) {
            this._fpsCheckTimer = 0;
            const fps = this.game.loop.actualFps;
            const activeEnemies = this.enemyManager && this.enemyManager.getActiveEnemies
                ? this.enemyManager.getActiveEnemies().length : 0;
            if (!this._lowQuality && (fps < 38 || (activeEnemies > 140 && fps < 45))) {
                this._lowQuality = true;
                // Disable heavy filters
                try {
                    if (this._bloomFilter) { this.cameras.main.filters.internal.remove(this._bloomFilter); this._bloomFilter = null; }
                    if (this._colorMatrix) { this.cameras.main.filters.internal.remove(this._colorMatrix); this._colorMatrix = null; }
                } catch (e) {}
                // Drop overlay intensity so pixel-fill cost falls but shadow mood stays
                if (this._colorTint) this._colorTint.setAlpha(0.4);
                if (this._vignetteOverlay) this._vignetteOverlay.setAlpha(0.5);
                // Disable ambient particles
                if (this.ambientEmitter) { this.ambientEmitter.destroy(); this.ambientEmitter = null; }
            }
        }

        // Update player
        this.player.update(time, delta);

        // Update enemies
        this.enemyManager.update(time, delta);

        // Update weapons
        this.weaponManager.update(time, delta);

        // Update XP orbs
        this.xpOrbPool.update(this.player, delta);

        // Update items
        this.itemDropManager.update(this.player, delta);

        // Update shadow army
        this.shadowArmyManager.update(time, delta);

        // Update pooled enemy VFX, projectiles, and damage texts (0 tweens/timers)
        Enemy.updateFrameVfx(this, delta);
        Enemy.updateProjectiles(this, delta);
        Enemy.updateDmgTexts(this, delta);

        // Update bosses
        this._updateBosses(time, delta);

        // Check boss spawn schedule
        this._checkBossSpawns();

        // Update ambient emitter to follow player
        if (this.ambientEmitter) {
            this.ambientEmitter.setPosition(this.player.x, this.player.y);
        }

        // Update vignette (dynamic HP-based intensity)
        this._updateVignette();

        // Update HUD
        this.hud.update(this.player, this.weaponManager, this.enemyManager, this.shadowArmyManager);

        this._autoSave(false);
        this._updateRankProgressSync();
    }

    _createFloor() {
        this.add.tileSprite(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 'floor_tile')
            .setDepth(0);

        const border = this.add.graphics();
        border.lineStyle(4, COLORS.SHADOW_PRIMARY, 0.5);
        border.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
        border.setDepth(1);
    }

    _createEnvironmentProps() {
        const propTypes = [
            { key: 'env_cracked_pillar', count: 12, minScale: 0.75, maxScale: 1.25, alpha: 0.62 },
            { key: 'env_rune_stone', count: 10, minScale: 0.7, maxScale: 1.15, alpha: 0.68 },
            { key: 'env_shadow_portal', count: 6, minScale: 0.65, maxScale: 1.0, alpha: 0.48 },
            { key: 'env_hanging_chain', count: 10, minScale: 0.6, maxScale: 1.1, alpha: 0.42 },
        ].filter(p => this.textures.exists(p.key));

        this.environmentProps = [];
        if (propTypes.length === 0) return;

        const center = WORLD_SIZE / 2;
        for (const prop of propTypes) {
            for (let i = 0; i < prop.count; i++) {
                let x = Phaser.Math.Between(140, WORLD_SIZE - 140);
                let y = Phaser.Math.Between(140, WORLD_SIZE - 140);

                if (Phaser.Math.Distance.Between(x, y, center, center) < 330) {
                    x += x < center ? -360 : 360;
                    y += y < center ? -220 : 220;
                    x = Phaser.Math.Clamp(x, 140, WORLD_SIZE - 140);
                    y = Phaser.Math.Clamp(y, 140, WORLD_SIZE - 140);
                }

                const shadow = this.add.ellipse(x, y + 24, 58, 14, 0x000000, 0.18)
                    .setDepth(1.8);
                const sprite = this.add.image(x, y, prop.key)
                    .setDepth(2)
                    .setAlpha(prop.alpha)
                    .setScale(Phaser.Math.FloatBetween(prop.minScale, prop.maxScale))
                    .setRotation(prop.key === 'env_shadow_portal' ? Phaser.Math.FloatBetween(-0.3, 0.3) : 0);

                if (prop.key === 'env_shadow_portal') {
                    sprite.setBlendMode(Phaser.BlendModes.ADD);
                    this.tweens.add({
                        targets: sprite,
                        alpha: prop.alpha + 0.16,
                        scale: sprite.scaleX * 1.06,
                        duration: Phaser.Math.Between(1400, 2200),
                        yoyo: true,
                        repeat: -1,
                    });
                }

                this.environmentProps.push(sprite, shadow);
            }
        }
    }

    _createAmbientParticles() {
        try {
            // Floating shadow embers around world center (repositioned in update)
            this.ambientEmitter = this.add.particles(WORLD_SIZE / 2, WORLD_SIZE / 2, 'particle_glow', {
                x: { min: -600, max: 600 },
                y: { min: -600, max: 600 },
                speed: { min: 5, max: 25 },
                angle: { min: 250, max: 290 },
                scale: { start: 0.4, end: 0.1 },
                alpha: { start: 0.2, end: 0 },
                lifespan: { min: 3000, max: 6000 },
                tint: [COLORS.SHADOW_PRIMARY, 0x4400aa, 0x220044],
                blendMode: 'ADD',
                frequency: 150,
                quantity: 1,
            });
            this.ambientEmitter.setDepth(1);
        } catch (e) {
            // Fallback to manual particles
            this._ambientFallback = [];
            for (let i = 0; i < 30; i++) {
                const p = this.add.circle(
                    Phaser.Math.Between(0, WORLD_SIZE), Phaser.Math.Between(0, WORLD_SIZE),
                    Phaser.Math.Between(1, 2), COLORS.SHADOW_PRIMARY, Phaser.Math.FloatBetween(0.05, 0.15)
                ).setDepth(1);
                this._ambientFallback.push({ obj: p, sx: Phaser.Math.FloatBetween(-0.3, 0.3), sy: Phaser.Math.FloatBetween(-0.5, -0.1) });
            }
            this._ambientFallbackTimer = this.time.addEvent({ delay: 50, loop: true, callback: () => {
                for (const p of this._ambientFallback) {
                    p.obj.x += p.sx; p.obj.y += p.sy;
                    if (p.obj.y < 0) { p.obj.y = WORLD_SIZE; p.obj.x = Phaser.Math.Between(0, WORLD_SIZE); }
                }
            }});
        }
    }

    _onPlayerHitEnemy(player, enemy) {
        if (!enemy.active || !player.active) return;
        if (enemy.isBoss) return;
        if (enemy.triggerMeleeAttack) enemy.triggerMeleeAttack();
        player.takeDamage(enemy.attack);
    }

    _checkBossSpawns() {
        const gameTimeSec = this.enemyManager.getGameTime() / 1000;

        for (let i = 0; i < BOSS_SCHEDULE.length; i++) {
            const schedule = BOSS_SCHEDULE[i];
            if (gameTimeSec >= schedule.time && !this.bossesSpawned.includes(i)) {
                this.bossesSpawned.push(i);
                this._spawnBoss(schedule.type, schedule.hp, schedule.atkMult || 1);
            }
        }
    }

    _spawnBoss(bossKey, hp = null, atkMult = 1) {
        // Spawn boss just outside visible screen
        const cam = this.cameras.main;
        const halfW = (cam.width / cam.zoom) / 2 + 120;
        const halfH = (cam.height / cam.zoom) / 2 + 120;
        const edge = Phaser.Math.Between(0, 3);
        let x, y;
        switch (edge) {
            case 0: x = this.player.x + Phaser.Math.Between(-halfW, halfW); y = this.player.y - halfH; break;
            case 1: x = this.player.x + Phaser.Math.Between(-halfW, halfW); y = this.player.y + halfH; break;
            case 2: x = this.player.x - halfW; y = this.player.y + Phaser.Math.Between(-halfH, halfH); break;
            case 3: x = this.player.x + halfW; y = this.player.y + Phaser.Math.Between(-halfH, halfH); break;
        }
        x = Phaser.Math.Clamp(x, 100, WORLD_SIZE - 100);
        y = Phaser.Math.Clamp(y, 100, WORLD_SIZE - 100);

        // Boss uses sqrt of difficulty (bosses already have high base stats)
        const diffMult = Math.sqrt(this.enemyManager.difficultyMultiplier);
        const boss = new Boss(this, x, y, bossKey, diffMult, hp, atkMult);
        this.activeBosses.push(boss);

        if (this.soundManager) this.soundManager.play('bossAppear');

        // System message for boss
        const bossConfig = BOSS_TYPES[bossKey];
        this.systemMessage.show(t('sysWarning'), [
            t('bossDetected'),
            `${bossConfig.name}${t('bossAppeared')}`,
        ], { duration: 3000, type: 'warning' });

        this._setupBossPlayerCollision(boss);

        // Weapon-boss collision for current weapons
        this._setupWeaponBossCollisions(boss);
    }

    _setupBossPlayerCollision(boss) {
        if (!boss || !this.player) return;

        boss._playerCollider = this.physics.add.collider(
            this.player,
            boss,
            () => {
                if (!boss.active || !this.player.active) return;
                this.player.takeDamage(boss.attack);
            },
            () => boss.active && this.player.active,
            this
        );
    }

    _setupWeaponBossCollisions(boss) {
        if (!boss._weaponColliders) boss._weaponColliders = [];
        for (const [key, weapon] of this.weaponManager.weapons) {
            if (weapon.getProjectileGroup) {
                const collider = this.physics.add.overlap(
                    weapon.getProjectileGroup(), boss,
                    (objA, objB) => {
                        // Phaser may swap argument order; identify which is proj vs boss
                        const proj = (objA === boss) ? objB : objA;
                        if (!proj.active || !boss.active) return;
                        if (boss.isInvincible) return;
                        const dmg = proj.damageAmount || weapon.getDamage();
                        boss.takeDamage(dmg);
                        if (this.soundManager) this.soundManager.play('hit');

                        // Deactivate projectile after hitting boss
                        proj.setActive(false);
                        proj.setVisible(false);
                        if (proj.body) proj.body.enable = false;
                    },
                    // processCallback: only process if both are active and proj body enabled
                    (objA, objB) => {
                        const proj = (objA === boss) ? objB : objA;
                        return proj.active && proj.body && proj.body.enable && boss.active && !boss.isInvincible;
                    },
                    this
                );
                boss._weaponColliders.push(collider);
            }
        }
    }

    // Called when player acquires a new weapon to set up collision with existing bosses
    onWeaponAdded(key, weapon) {
        for (const boss of this.activeBosses) {
            if (!boss.active) continue;
            if (weapon.getProjectileGroup) {
                const collider = this.physics.add.overlap(
                    weapon.getProjectileGroup(), boss,
                    (objA, objB) => {
                        const proj = (objA === boss) ? objB : objA;
                        if (!proj.active || !boss.active) return;
                        if (boss.isInvincible) return;
                        const dmg = proj.damageAmount || weapon.getDamage();
                        boss.takeDamage(dmg);
                        if (this.soundManager) this.soundManager.play('hit');

                        // Deactivate projectile after hitting boss
                        proj.setActive(false);
                        proj.setVisible(false);
                        if (proj.body) proj.body.enable = false;
                    },
                    (objA, objB) => {
                        const proj = (objA === boss) ? objB : objA;
                        return proj.active && proj.body && proj.body.enable && boss.active && !boss.isInvincible;
                    },
                    this
                );
                if (!boss._weaponColliders) boss._weaponColliders = [];
                boss._weaponColliders.push(collider);
            }
        }
    }

    _updateBosses(time, delta) { var __oc32, __oc33;
        for (let i = this.activeBosses.length - 1; i >= 0; i--) {
            const boss = this.activeBosses[i];
            if (boss.active) {
                const target = (((__oc33 = (__oc32 = this.player).getHurtboxCenter) === null || __oc33 === void 0 ? void 0 : __oc33.call(__oc32))) || this.player;
                boss.update(time, delta, target.x, target.y);
            } else {
                // Clean up colliders when boss is removed
                if (boss._playerCollider) {
                    this.physics.world.removeCollider(boss._playerCollider);
                }
                if (boss._weaponColliders) {
                    for (const c of boss._weaponColliders) {
                        this.physics.world.removeCollider(c);
                    }
                }
                // Safety: clean up HP bar if not already destroyed
                if (boss.hpBarGfx) { boss.hpBarGfx.destroy(); boss.hpBarGfx = null; }
                if (boss.hpText) { boss.hpText.destroy(); boss.hpText = null; }
                if (boss.nameText) { boss.nameText.destroy(); boss.nameText = null; }
                this.activeBosses.splice(i, 1);
            }
        }
    }

    onLevelUp() {
        // Prevent double-launch if LevelUpScene is already running
        if (this._levelUpActive) return;
        this._levelUpActive = true;

        if (this.soundManager) {
            this.soundManager.prepareLevelUpMix();
            this.soundManager.play('levelup');
        }

        // System message
        this.systemMessage.show(t('sysSystem'), [
            `${t('levelUpMsg')} Lv.${this.player.level}`,
            t('newSkill'),
        ], { duration: 2000, type: 'levelup' });

        // Stop the live battle render before the choice screen opens.
        this._addLevelUpBlur();

        // Pause game and show level up screen
        this.scene.pause();
        this.scene.launch('LevelUpScene', {
            gameScene: this,
            player: this.player,
            weaponManager: this.weaponManager,
        });
    }


    onPlayerDeath() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        GameScene.clearSavedGame();

        if (this.soundManager) this.soundManager.play('gameOver');

        this.systemMessage.show(t('sysSystem'), [
            t('playerDied'),
            t('exitDungeon'),
        ], { duration: 2000, type: 'warning' });

        this.cameras.main.shake(500, 0.02);
        this.cameras.main.fadeOut(1500, 20, 0, 0);

        this.time.delayedCall(1500, async () => { var __oc34;
            const finalScore = Math.floor(this.enemyManager.getGameTime() / 1000);
            let rankSyncFailed = this._rankSyncDisabled;
            let rankVerifiedScore = this._rankSyncedScore;
            if (!this._rankSyncDisabled) {
                rankVerifiedScore = await this._flushRankProgress();
                if (rankVerifiedScore !== finalScore) rankSyncFailed = true;
            }

            this.scene.start('GameOverScene', {
                level: this.player.level,
                rank: this.player.currentRank,
                kills: this.player.kills,
                time: finalScore,
                shadowCount: this.shadowArmyManager.getSoldierCount(),
                characterId: this.player.characterId,
                characterName: (((__oc34 = this.player.character) === null || __oc34 === void 0 ? void 0 : __oc34.name)),
                rankSessionId: this._rankSessionId,
                rankSyncFailed,
                rankSyncDisabled: this._rankSyncDisabled,
                rankVerifiedScore,
            });
        });
    }

    // === FILTER SETUP ===

    _setupCameraFilters() {
        // Skip heavy filters on low-end devices (mobile or low pixel ratio)
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window);
        if (isMobile) return;

        try {
            const cam = this.cameras.main;

            // Bloom effect via ParallelFilters (bright areas glow)
            this._bloomFilter = cam.filters.internal.addParallelFilters();
            this._bloomFilter.top.addThreshold(0.55, 1);
            this._bloomFilter.top.addBlur(0, 2.5, 2.5, 1.2);
            this._bloomFilter.blend.blendMode = Phaser.BlendModes.ADD;
            this._bloomFilter.blend.amount = 0.35;

            // ColorMatrix for a cool, desaturated shadow atmosphere.
            this._colorMatrix = cam.filters.internal.addColorMatrix();
            this._colorMatrix.colorMatrix.brightness(0.88);
            this._colorMatrix.colorMatrix.saturate(1.25);
            // Slight hue shift toward blue/purple (if supported); silently ignored if unavailable
            try { this._colorMatrix.colorMatrix.hue(-12); } catch (_) { /* hue optional */ }
        } catch (e) {
            console.warn('Camera filters not available:', e);
        }
    }

    // Screen-space purple tint overlay; mobile-safe and no WebGL filters required.
    // Keeps high-res AI sprites and retro DCSS tiles in the same "night dungeon" palette
    _setupColorTint() {
        try {
            const cam = this.cameras.main;
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
            this._colorTint = this.add.rectangle(
                cam.width / 2, cam.height / 2, cam.width, cam.height,
                isMobile ? 0x6f4a9d : 0xd5b8ee
            )
                .setScrollFactor(0)
                .setDepth(2.5)
                .setBlendMode(Phaser.BlendModes.MULTIPLY)
                .setAlpha(isMobile ? 0.52 : 0.38);

            if (isMobile) {
                this._mobileDarken = this.add.rectangle(
                    cam.width / 2, cam.height / 2, cam.width, cam.height,
                    0x01030a, 0.22
                )
                    .setScrollFactor(0)
                    .setDepth(2.6);
            }
        } catch (e) { /* tint overlay optional */ }
    }

    _setupVignette() {
        try {
            if (!this.textures.exists('vignette')) return;
            // Fixed-position vignette overlay; acts as player-centered torch light.
            // (camera follows player, so vignette center IS the player's screen position)
            // Slight over-scaling so dark edges reach past the canvas corners on wide aspects
            const cam = this.cameras.main;
            const scale = 1.15;
            this._vignetteOverlay = this.add.image(cam.width / 2, cam.height / 2, 'vignette')
                .setScrollFactor(0)
                .setDepth(90)
                .setDisplaySize(cam.width * scale, cam.height * scale)
                .setAlpha(0.52);
        } catch (e) { /* vignette not available */ }
    }

    _updateVignette() {
        if (!this._vignetteOverlay || !this.player) return;
        const hpRatio = this.player.stats.hp / this.player.stats.maxHp;
        if (hpRatio < 0.4) {
            // Low HP: vignette closes in and the tint warms.
            const intensity = 0.64 + (1 - hpRatio / 0.4) * 0.18;
            this._vignetteOverlay.setAlpha(intensity);
            if (this._colorTint) this._colorTint.fillColor = 0xeeb8a8;
            if (this._colorMatrix && hpRatio < 0.25) {
                try {
                    this._colorMatrix.colorMatrix.reset();
                    this._colorMatrix.colorMatrix.brightness(0.8);
                    this._colorMatrix.colorMatrix.saturate(0.75);
                } catch (e) { /* silent */ }
            }
        } else {
            this._vignetteOverlay.setAlpha(0.52);
            if (this._colorTint) this._colorTint.fillColor = 0xd5b8ee;
            if (this._colorMatrix) {
                try {
                    this._colorMatrix.colorMatrix.reset();
                    this._colorMatrix.colorMatrix.brightness(0.88);
                    this._colorMatrix.colorMatrix.saturate(1.25);
                    try { this._colorMatrix.colorMatrix.hue(-12); } catch (_) {}
                } catch (e) { /* silent */ }
            }
        }
    }

    _addLevelUpBlur() { var __oc35, __oc36;
        try {
            // A paused scene still renders. Bloom plus a full-screen blur on that
            // live frame stalls the audio thread for the whole choice. Hide the
            // battle instead of filtering it. LevelUpScene paints its own panel.
            if ((((__oc35 = this._bloomFilter) === null || __oc35 === void 0 ? void 0 : __oc35.setActive))) {
                this._bloomFilter.setActive(false);
                this._bloomSuspendedForLevelUp = true;
            }
            if ((((__oc36 = this._levelUpBlur) === null || __oc36 === void 0 ? void 0 : __oc36.setActive))) this._levelUpBlur.setActive(false);
            if (!this._levelUpSceneHidden) {
                this.scene.setVisible(false);
                this._levelUpSceneHidden = true;
            }
        } catch (e) { /* hiding the battle is optional */ }
    }

    removeLevelUpBlur() { var __oc37, __oc38;
        try {
            if ((((__oc37 = this._levelUpBlur) === null || __oc37 === void 0 ? void 0 : __oc37.setActive))) this._levelUpBlur.setActive(false);
            if (this._bloomSuspendedForLevelUp && (((__oc38 = this._bloomFilter) === null || __oc38 === void 0 ? void 0 : __oc38.setActive))) {
                this._bloomFilter.setActive(true);
            }
            this._bloomSuspendedForLevelUp = false;
            if (this._levelUpSceneHidden) {
                this.scene.setVisible(true);
                this._levelUpSceneHidden = false;
            }
        } catch (e) { /* silent */ }
    }

    _registerSaveHandlers() {
        this._saveOnPageHide = () => this._autoSave(true);
        this._saveOnVisibilityChange = () => {
            if (document.hidden) this._autoSave(true);
        };
        window.addEventListener('pagehide', this._saveOnPageHide);
        document.addEventListener('visibilitychange', this._saveOnVisibilityChange);
    }

    _autoSave(force = false) {
        if (this.isGameOver || this._isBooting || !this.player || this.player.isDead) return;
        const now = Date.now();
        if (!force && now - this._lastAutoSaveAt < AUTO_SAVE_INTERVAL_MS) return;

        try {
            const snap = this._createSaveSnapshot(now, {
                enemyLimit: force ? FORCE_SAVE_ENEMY_LIMIT : AUTO_SAVE_ENEMY_LIMIT,
            });
            localStorage.setItem(SAVE_KEY, JSON.stringify(snap));
            this._lastAutoSaveAt = now;
        } catch (e) {
            // Storage can fail in private mode or quota pressure.
        }
    }

    _createSaveSnapshot(ts = Date.now(), options = {}) { var __oc39, __oc40, __oc41, __oc42, __oc43, __oc44, __oc45, __oc46, __oc47, __oc48, __oc49, __oc50, __oc51, __oc52, __oc53;
        const player = this.player;
        const gameTime = (((__oc40 = (__oc39 = this.enemyManager) === null || __oc39 === void 0 ? void 0 : __oc39.getGameTime) === null || __oc40 === void 0 ? void 0 : __oc40.call(__oc39))) || 0;
        const enemyLimit = (((__oc41 = options.enemyLimit) !== null && __oc41 !== void 0 ? __oc41 : AUTO_SAVE_ENEMY_LIMIT));
        const weaponEntries = this.weaponManager
            ? Array.from(this.weaponManager.weapons.entries()).map(([key, weapon]) => ({
                key,
                level: weapon.level,
                damage: weapon.damage,
                cooldown: weapon.cooldown,
                count: weapon.count,
                cooldownTimer: weapon.cooldownTimer,
                extraRange: weapon.extraRange || 0,
                extraSlow: weapon.extraSlow || 0,
            }))
            : [];

        return {
            version: SAVE_VERSION,
            ts,
            rankSessionId: null,
            player: {
                characterId: player.characterId,
                x: player.x,
                y: player.y,
                level: player.level,
                xp: player.xp,
                xpToNext: player.xpToNext,
                currentRank: player.currentRank,
                rankUpCount: player.rankUpCount || 0,
                hp: player.stats.hp,
                kills: player.kills,
                passiveLevels: { ...(player.passiveLevels || {}) },
            },
            weapons: weaponEntries,
            enemyManager: {
                gameTime,
                difficultyMultiplier: (((__oc42 = this.enemyManager) === null || __oc42 === void 0 ? void 0 : __oc42.difficultyMultiplier)) || 1,
                spawnTimer: (((__oc43 = this.enemyManager) === null || __oc43 === void 0 ? void 0 : __oc43.spawnTimer)) || 0,
                eliteTimer: (((__oc44 = this.enemyManager) === null || __oc44 === void 0 ? void 0 : __oc44.eliteTimer)) || 0,
                activeDungeonBreak: (((__oc45 = this.enemyManager) === null || __oc45 === void 0 ? void 0 : __oc45.activeDungeonBreak)) || null,
                triggeredBreaks: [...((((__oc46 = this.enemyManager) === null || __oc46 === void 0 ? void 0 : __oc46.triggeredBreaks)) || [])],
                quests: JSON.parse(JSON.stringify((((__oc47 = this.enemyManager) === null || __oc47 === void 0 ? void 0 : __oc47.quests)) || [])),
                lastQuestTime: (((__oc48 = this.enemyManager) === null || __oc48 === void 0 ? void 0 : __oc48.lastQuestTime)) || 0,
                killCounters: { ...((((__oc49 = this.enemyManager) === null || __oc49 === void 0 ? void 0 : __oc49.killCounters)) || {}) },
                activeEnemies: (((__oc51 = (__oc50 = this.enemyManager) === null || __oc50 === void 0 ? void 0 : __oc50.getActiveEnemySnapshots) === null || __oc51 === void 0 ? void 0 : __oc51.call(__oc50, enemyLimit))) || [],
            },
            bossesSpawned: [...(this.bossesSpawned || [])],
            activeBosses: (this.activeBosses || []).filter(b => { return (
(b === null || b === void 0 ? void 0 : b.active)
); }).map(boss => ({
                bossKey: boss.bossKey,
                x: boss.x,
                y: boss.y,
                hp: boss.hp,
                maxHp: boss.maxHp,
                attack: boss.attack,
                speed: boss.speed,
                phase: boss.phase,
            })),
            shadows: (((__oc53 = (__oc52 = this.shadowArmyManager) === null || __oc52 === void 0 ? void 0 : __oc52.getSoldiers) === null || __oc53 === void 0 ? void 0 : __oc53.call(__oc52).filter(s => {
        return (((s === null || s === void 0 ? void 0 : s.active)) && !s._temporary);
    }).map(soldier => ({
        bossKey: soldier.bossKey,
        x: soldier.x,
        y: soldier.y,
    })))) || [],
        };
    }

    _restoreSavedGame() { var __oc54;
        const data = GameScene.getSavedGameData();
        if (!GameScene._hasMeaningfulProgress(data)) return false;

        try {
            this._restorePlayer(data.player || {});
            this._restoreEnemyProgress(data.enemyManager || {});
            this._restoreEnemies((((__oc54 = data.enemyManager) === null || __oc54 === void 0 ? void 0 : __oc54.activeEnemies)) || []);
            this.bossesSpawned = Array.isArray(data.bossesSpawned)
                ? data.bossesSpawned.filter(i => Number.isInteger(i))
                : [];
            this._restoreWeapons(data.weapons || []);
            this._restoreShadows(data.shadows || []);
            this._restoreBosses(data.activeBosses || []);
            return true;
        } catch (e) {
            if (window._sendGameError) {
                window._sendGameError(
                    'ResumeError',
                    e.message || String(e),
                    e.stack || '',
                    'GameScene:_restoreSavedGame',
                    { hasSavedData: !!data, savedAt: ((data === null || data === void 0 ? void 0 : data.ts)) || null }
                );
            }
            return false;
        }
    }

    _restorePlayer(saved) {
        const player = this.player;
        player.setPosition(
            Phaser.Math.Clamp(Number(saved.x) || WORLD_SIZE / 2, 80, WORLD_SIZE - 80),
            Phaser.Math.Clamp(Number(saved.y) || WORLD_SIZE / 2, 80, WORLD_SIZE - 80)
        );
        if (player.body) {
            player.body.enable = true;
            player.body.setVelocity(0, 0);
        }
        player.isDead = false;
        player.isInvincible = false;
        player.invincibleTimer = 0;
        player.setAlpha(1);
        player.clearTint();

        const restoredLevel = Number(saved.level);
        player.level = Number.isSafeInteger(restoredLevel) ? Math.max(1, restoredLevel) : 1;
        player.xp = Math.max(0, Number(saved.xp) || 0);
        player.xpToNext = getXpToNext(player.level);
        player.currentRank = RANKS[saved.currentRank] ? saved.currentRank : 'E';
        player.rankUpCount = Math.max(0, Number(saved.rankUpCount) || 0);
        player.kills = Math.max(0, Number(saved.kills) || 0);
        player.passiveLevels = { ...(saved.passiveLevels || {}) };
        player._tempAtkBuff = 0;
        player._tempCooldownReduction = 0;

        player.stats = { ...(player.baseStats || PLAYER_BASE_STATS) };
        for (const statKey of Object.keys(player.baseStats || PLAYER_BASE_STATS)) {
            if (statKey !== 'hp' && typeof player._recalcStat === 'function') {
                player._recalcStat(statKey);
            }
        }
        player.stats.hp = Phaser.Math.Clamp(
            Number(saved.hp) || player.stats.maxHp,
            1,
            player.stats.maxHp
        );
    }

    _restoreEnemyProgress(saved) { var __oc55;
        const manager = this.enemyManager;
        if (!manager) return;
        (((__oc55 = manager.cancelOpeningWave) === null || __oc55 === void 0 ? void 0 : __oc55.call(manager)));
        manager.gameTime = Math.max(0, Number(saved.gameTime) || 0);
        manager.difficultyMultiplier = Math.max(1, Number(saved.difficultyMultiplier) || 1);
        manager.spawnTimer = Math.max(0, Number(saved.spawnTimer) || 0);
        manager.eliteTimer = Math.max(0, Number(saved.eliteTimer) || 0);
        manager.triggeredBreaks = Array.isArray(saved.triggeredBreaks) ? [...saved.triggeredBreaks] : [];
        manager.quests = Array.isArray(saved.quests) ? JSON.parse(JSON.stringify(saved.quests)) : [];
        manager.lastQuestTime = Math.max(0, Number(saved.lastQuestTime) || 0);
        manager.killCounters = { ...(saved.killCounters || {}) };

        const activeBreak = saved.activeDungeonBreak;
        const seconds = manager.gameTime / 1000;
        manager.activeDungeonBreak = activeBreak && Number(activeBreak.endTime) > seconds
            ? { ...activeBreak }
            : null;
    }

    _restoreEnemies(savedEnemies) { var __oc56;
        if (!(((__oc56 = this.enemyManager) === null || __oc56 === void 0 ? void 0 : __oc56.restoreActiveEnemies))) return;
        this.enemyManager.restoreActiveEnemies(savedEnemies);
    }

    _restoreWeapons(savedWeapons) {
        if (this.weaponManager) this.weaponManager.destroy();
        this.weaponManager = new WeaponManager(this, this.player);

        const allowedKeys = new Set(getCharacterWeaponKeys(this.player.characterId));
        const starterKey = getStarterWeaponKey(this.player.characterId);
        const list = Array.isArray(savedWeapons)
            ? savedWeapons.filter(w => { return (
allowedKeys.has(((w === null || w === void 0 ? void 0 : w.key)))
); })
            : [];
        if (!list.some(w => { return (
((w === null || w === void 0 ? void 0 : w.key)) === starterKey
); })) list.unshift({ key: starterKey });

        for (const saved of list) {
            if (!((saved === null || saved === void 0 ? void 0 : saved.key)) || !this.weaponManager.addWeapon(saved.key)) continue;
            const weapon = this.weaponManager.weapons.get(saved.key);
            if (!weapon) continue;
            weapon.level = Phaser.Math.Clamp(Number(saved.level) || 1, 1, 10);
            if (Number.isFinite(saved.damage)) weapon.damage = saved.damage;
            if (Number.isFinite(saved.cooldown)) weapon.cooldown = saved.cooldown;
            if (Number.isFinite(saved.count)) weapon.count = saved.count;
            if (Number.isFinite(saved.cooldownTimer)) weapon.cooldownTimer = saved.cooldownTimer;
            if (Number.isFinite(saved.extraRange)) weapon.extraRange = saved.extraRange;
            if (Number.isFinite(saved.extraSlow)) weapon.extraSlow = saved.extraSlow;
        }
    }

    _restoreShadows(savedShadows) { var __oc57;
        if (!(((__oc57 = this.shadowArmyManager) === null || __oc57 === void 0 ? void 0 : __oc57.enabled)) || !Array.isArray(savedShadows)) return;
        this.shadowArmyManager.soldiers.forEach(s => { if (((s === null || s === void 0 ? void 0 : s.scene))) s.destroy(); });
        this.shadowArmyManager.soldiers = [];

        for (const saved of savedShadows.slice(0, this.shadowArmyManager.maxSoldiers)) {
            if (!((saved === null || saved === void 0 ? void 0 : saved.bossKey)) || !BOSS_TYPES[saved.bossKey]) continue;
            const soldier = new ShadowSoldier(
                this,
                Phaser.Math.Clamp(Number(saved.x) || this.player.x, 80, WORLD_SIZE - 80),
                Phaser.Math.Clamp(Number(saved.y) || this.player.y, 80, WORLD_SIZE - 80),
                saved.bossKey
            );
            this.shadowArmyManager.soldiers.push(soldier);
        }
    }

    _restoreBosses(savedBosses) {
        if (!Array.isArray(savedBosses)) return;
        for (const saved of savedBosses) {
            if (!((saved === null || saved === void 0 ? void 0 : saved.bossKey)) || !BOSS_TYPES[saved.bossKey]) continue;
            const boss = new Boss(
                this,
                Phaser.Math.Clamp(Number(saved.x) || this.player.x, 80, WORLD_SIZE - 80),
                Phaser.Math.Clamp(Number(saved.y) || this.player.y, 80, WORLD_SIZE - 80),
                saved.bossKey,
                1,
                Math.max(1, Number(saved.maxHp) || Number(saved.hp) || BOSS_TYPES[saved.bossKey].hp)
            );
            boss.maxHp = Math.max(1, Number(saved.maxHp) || boss.maxHp);
            boss.hp = Phaser.Math.Clamp(Number(saved.hp) || boss.maxHp, 1, boss.maxHp);
            if (Number.isFinite(saved.attack)) boss.attack = saved.attack;
            if (Number.isFinite(saved.speed)) boss.speed = saved.speed;
            boss.phase = saved.phase === 2 ? 2 : 1;

            this._setupBossPlayerCollision(boss);
            this.activeBosses.push(boss);
            this._setupWeaponBossCollisions(boss);
        }
    }

    static clearSavedGame() {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    }

    static getSavedGameData() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return ((data === null || data === void 0 ? void 0 : data.version)) === SAVE_VERSION ? data : null;
        } catch (e) {
            return null;
        }
    }

    static _hasMeaningfulProgress(data) { var __oc58;
        if (!((data === null || data === void 0 ? void 0 : data.player))) return false;
        const timeSec = Math.floor(((((__oc58 = data.enemyManager) === null || __oc58 === void 0 ? void 0 : __oc58.gameTime)) || 0) / 1000);
        return timeSec >= 5
            || (data.player.kills || 0) > 0
            || (data.player.level || 1) > 1
            || (Array.isArray(data.weapons) && data.weapons.length > 1)
            || (Array.isArray(data.shadows) && data.shadows.length > 0)
            || (Array.isArray(data.activeBosses) && data.activeBosses.length > 0);
    }

    static hasSavedGame() {
        return GameScene._hasMeaningfulProgress(GameScene.getSavedGameData());
    }

    static getSavedSummary() { var __oc59;
        const data = GameScene.getSavedGameData();
        if (!GameScene._hasMeaningfulProgress(data)) return null;
        return {
            level: data.player.level || 1,
            kills: data.player.kills || 0,
            timeSec: Math.floor(((((__oc59 = data.enemyManager) === null || __oc59 === void 0 ? void 0 : __oc59.gameTime)) || 0) / 1000),
            characterId: data.player.characterId || DEFAULT_CHARACTER_ID,
            characterName: getCharacter(data.player.characterId).name,
        };
    }

    shutdown() { var __oc60;
        this._rankRunToken = {};
        this._deferredStopped = true;
        try {
            if (this._deferredTimer) {
                try { this._deferredTimer.remove(false); } catch (e) { /* already removed */ }
                this._deferredTimer = null;
            }
            if (this._deferredUpgradeTimer) {
                try { this._deferredUpgradeTimer.remove(false); } catch (e) { /* already removed */ }
                this._deferredUpgradeTimer = null;
            }
            if (this._deferredListeners && this._deferredListeners.cleanup) {
                this._deferredListeners.cleanup();
            }
            this._deferredQueue = [];
            this._deferredUpgradeQueue = [];
            if (this._deferredFallbackMap) this._deferredFallbackMap.clear();
            if (!this.isGameOver) this._autoSave(true);

            if (this._startupTimers) {
                for (const timer of this._startupTimers) {
                    try { timer.remove(false); } catch (e) { /* already removed */ }
                }
                this._startupTimers = [];
            }
            if (this._startupOverlay) {
                this._startupOverlay.forEach(el => { if (((el === null || el === void 0 ? void 0 : el.active))) el.destroy(); });
                this._startupOverlay = null;
                this._startupLabel = null;
                this._startupPercent = null;
                this._startupProgressFill = null;
            }
            if (this._startupCoreTween) {
                this._startupCoreTween.stop();
                this._startupCoreTween = null;
            }

            if (this._saveOnPageHide) {
                window.removeEventListener('pagehide', this._saveOnPageHide);
                this._saveOnPageHide = null;
            }
            if (this._saveOnVisibilityChange) {
                document.removeEventListener('visibilitychange', this._saveOnVisibilityChange);
                this._saveOnVisibilityChange = null;
            }

            if (this._onGameResize) {
                this.events.off('game-resize', this._onGameResize, this);
                this._onGameResize = null;
            }
            if (this._soundToggleKey && this._soundToggleHandler) {
                this._soundToggleKey.off('down', this._soundToggleHandler);
                this._soundToggleHandler = null;
                this._soundToggleKey = null;
            }

            // Stop game BGM
            if (this.soundManager) this.soundManager.stopGameBGM();
            if (this.weaponManager) this.weaponManager.destroy();
            if (this.shadowArmyManager) this.shadowArmyManager.destroy();
            if (this.itemDropManager) this.itemDropManager.destroy();
            if (this.xpOrbPool) this.xpOrbPool.destroy();
            if (this.enemyManager) this.enemyManager.destroy();
            if (this.statusWindow) this.statusWindow.destroy();
            if (this.mobileControls) this.mobileControls.destroy();
            if (this.systemMessage) this.systemMessage.destroy();
            if (this.hud) this.hud.destroy();
            if (this.player) this.player.destroy();

            // Clean up filters
            try {
                if (this._bloomFilter) this.cameras.main.filters.internal.remove(this._bloomFilter);
                if (this._colorMatrix) this.cameras.main.filters.internal.remove(this._colorMatrix);
                if (this._levelUpBlur) this.cameras.main.filters.internal.remove(this._levelUpBlur);
            } catch (e) { /* filters cleanup */ }

            if (this._ambientFallbackTimer) { this._ambientFallbackTimer.destroy(); this._ambientFallbackTimer = null; }
            if (this._ambientFallback) {
                this._ambientFallback.forEach(p => { if (p.obj && p.obj.active) p.obj.destroy(); });
                this._ambientFallback = null;
            }
            if (this.ambientEmitter) { this.ambientEmitter.destroy(); this.ambientEmitter = null; }
            if (this.environmentProps) {
                this.environmentProps.forEach(prop => {
                    if (this.tweens) this.tweens.killTweensOf(prop);
                    if (((prop === null || prop === void 0 ? void 0 : prop.active))) prop.destroy();
                });
                this.environmentProps = null;
            }

            if (this._vignetteOverlay) { this._vignetteOverlay.destroy(); this._vignetteOverlay = null; }
            if (this._colorTint) { this._colorTint.destroy(); this._colorTint = null; }
            if (this._mobileDarken) { this._mobileDarken.destroy(); this._mobileDarken = null; }

            if (this.activeBosses && (((__oc60 = this.physics) === null || __oc60 === void 0 ? void 0 : __oc60.world))) {
                for (const boss of this.activeBosses) {
                    try {
                        if (boss._playerCollider) this.physics.world.removeCollider(boss._playerCollider);
                        if (boss._weaponColliders) {
                            for (const c of boss._weaponColliders) this.physics.world.removeCollider(c);
                        }
                    } catch (e) { /* already removed */ }
                    if (boss.hpBarGfx) { boss.hpBarGfx.destroy(); boss.hpBarGfx = null; }
                    if (boss.hpText) { boss.hpText.destroy(); boss.hpText = null; }
                    if (boss.nameText) { boss.nameText.destroy(); boss.nameText = null; }
                    if (this.tweens) this.tweens.killTweensOf(boss);
                    if (boss.scene) boss.destroy();
                }
                this.activeBosses = [];
            }

            this.weaponManager = null;
            this.shadowArmyManager = null;
            this.itemDropManager = null;
            this.xpOrbPool = null;
            this.enemyManager = null;
            this.statusWindow = null;
            this.mobileControls = null;
            this.systemMessage = null;
            this.hud = null;
            this.player = null;
            this.bossesSpawned = [];
            this._levelUpActive = false;
        } catch (e) {
            console.warn('GameScene shutdown error:', e);
        }
    }
}
