/**
 * WAV 기반 SFX + Tone.js BGM 사운드 매니저
 * SFX: 사전 생성된 WAV 파일을 Audio 풀로 재생 (실시간 합성 오버헤드 없음)
 * BGM: Tone.js 프로시저럴 합성 유지 (인트로 음악, 게임 BGM)
 */
const CHARACTER_SFX_CONFIG = {
    shadowMonarchBasicDagger: { file: 'effects/characters/shadow_monarch/shadow_monarch_basic_dagger.wav', pool: 6, throttle: 220, release: 360, volume: 0.45, priority: 2 },
    shadowMonarchShadowDagger: { file: 'effects/characters/shadow_monarch/shadow_monarch_shadow_dagger.wav', pool: 6, throttle: 240, release: 430, volume: 0.5, priority: 2 },
    shadowMonarchShadowSlash: { file: 'effects/characters/shadow_monarch/shadow_monarch_shadow_slash.wav', pool: 5, throttle: 360, release: 650, volume: 0.76, priority: 2 },
    shadowMonarchRulersAuthority: { file: 'effects/characters/shadow_monarch/shadow_monarch_rulers_authority.wav', pool: 4, throttle: 620, release: 1040, volume: 0.49, priority: 3 },
    shadowMonarchDragonFear: { file: 'effects/characters/shadow_monarch/shadow_monarch_dragon_fear.wav', pool: 3, throttle: 900, release: 1780, volume: 0.34, priority: 3 },

    lightSwordSlash: { file: 'effects/characters/light_swordswoman/light_swordswoman_light_pierce.wav', pool: 6, throttle: 240, release: 420, volume: 0.42, priority: 2 },
    lightLance: { file: 'effects/characters/light_swordswoman/light_swordswoman_light_lance.wav', pool: 5, throttle: 260, release: 860, volume: 0.68, priority: 2 },
    lightCrescent: { file: 'effects/characters/light_swordswoman/light_swordswoman_light_crescent.wav', pool: 4, throttle: 360, release: 800, volume: 0.5, priority: 2 },
    lightJudgment: { file: 'effects/characters/light_swordswoman/light_swordswoman_light_judgment.wav', pool: 3, throttle: 620, release: 1340, volume: 0.58, priority: 3 },
    lightSanctum: { file: 'effects/characters/light_swordswoman/light_swordswoman_light_sanctum.wav', pool: 2, throttle: 780, release: 1500, volume: 0.78, priority: 3 },

    tigerClaw: { file: 'effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_palm.wav', pool: 6, throttle: 230, release: 400, volume: 0.58, priority: 2 },
    tigerFang: { file: 'effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_fang.wav', pool: 5, throttle: 260, release: 1540, volume: 0.6, priority: 2 },
    tigerRend: { file: 'effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_rend.wav', pool: 4, throttle: 360, release: 1480, volume: 0.74, priority: 2 },
    tigerQuake: { file: 'effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_quake.wav', pool: 3, throttle: 650, release: 1420, volume: 0.35, priority: 3 },
    tigerGuard: { file: 'effects/characters/white_tiger_brawler/white_tiger_brawler_tiger_guard.wav', pool: 2, throttle: 760, release: 1620, volume: 0.28, priority: 3 },

    flameSpark: { file: 'effects/characters/flame_mage/flame_mage_flame_spark.wav', pool: 6, throttle: 220, release: 720, volume: 0.36, priority: 2 },
    flameBolt: { file: 'effects/characters/flame_mage/flame_mage_flame_bolt.wav', pool: 5, throttle: 250, release: 940, volume: 0.44, priority: 2 },
    flameArc: { file: 'effects/characters/flame_mage/flame_mage_flame_arc.wav', pool: 4, throttle: 360, release: 680, volume: 0.43, priority: 2 },
    flameMeteor: { file: 'effects/characters/flame_mage/flame_mage_flame_meteor.wav', pool: 3, throttle: 680, release: 1570, volume: 0.5, priority: 3 },
    flameInferno: { file: 'effects/characters/flame_mage/flame_mage_flame_inferno.wav', pool: 2, throttle: 820, release: 1720, volume: 0.42, priority: 3 },

    sanctuaryStaffCast: { file: 'effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_strike.wav', pool: 5, throttle: 280, release: 960, volume: 0.42, priority: 2 },
    sanctuaryOrb: { file: 'effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_orb.wav', pool: 5, throttle: 280, release: 1500, volume: 0.78, priority: 2 },
    sanctuaryArc: { file: 'effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_arc.wav', pool: 4, throttle: 380, release: 1530, volume: 0.5, priority: 2 },
    sanctuarySeal: { file: 'effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_seal.wav', pool: 3, throttle: 660, release: 1880, volume: 0.42, priority: 3 },
    sanctuaryField: { file: 'effects/characters/sanctuary_healer/sanctuary_healer_sanctuary_field.wav', pool: 2, throttle: 820, release: 2380, volume: 0.62, priority: 3 },
};

export class SoundManager {
    constructor() {
        this.enabled = true;
        this._initialized = false;
        this._destroyed = false;
        this._toneReady = false;
        this._userActivated = false;
        this._lastPlayTime = {};
        this._activeSoundNames = {};
        this._sameSoundLimit = {
            xp: 1, hit: 1, burnHit: 1, critHit: 1,
            shadowSoldierSlash: 1, shadowSoldierSpit: 1,
            dagger: 2, daggerThrow: 2,
            bossKill: 1, arise: 1, levelup: 1, rankup: 1,
        };
        this._throttleMs = {
            hit: 180, burnHit: 170, kill: 280, xp: 190, dagger: 230, daggerThrow: 220,
            slash: 360, authority: 520, fear: 700,
            playerHit: 400, system: 350, warning: 600,
            quest: 600, dungeonBreak: 1000, bossAppear: 900,
            levelup: 900, rankup: 1000, arise: 1000,
            bossCharge: 700, bossSlash: 420, groundSlam: 700,
            acidShot: 360, acidHit: 320, bossRage: 1000,
            shadowSoldierSlash: 240, shadowSoldierSlam: 520, shadowSoldierSpit: 260,
            mana: 260, essence: 420, critHit: 260, eliteKill: 650,
        };
        this._activeSounds = 0;
        this._maxActiveSounds = 4;
        this._activeSoundTimers = new Set();
        this._sfxMaster = 0.36;
        this._toneLeadTime = 0.035;
        this._releaseMs = {
            dagger: 320, daggerThrow: 380, hit: 200, burnHit: 420, kill: 620, xp: 360,
            playerHit: 390, select: 130, system: 190, warning: 340,
            slash: 620, authority: 860, fear: 660,
            levelup: 560, rankup: 860, arise: 860, bossAppear: 860,
            bossKill: 1060, gameOver: 1250, quest: 390, dungeonBreak: 760,
            potion: 280, mana: 340, essence: 560,
            bossCharge: 720, bossSlash: 420, groundSlam: 820,
            acidShot: 390, acidHit: 470, bossRage: 940,
            shadowSoldierSlash: 260, shadowSoldierSlam: 460, shadowSoldierSpit: 300,
            critHit: 460, eliteKill: 960,
        };
        this._soundPriority = {
            xp: 0, hit: 1, burnHit: 1, dagger: 1, daggerThrow: 1, kill: 1,
            slash: 2, authority: 2, fear: 2, playerHit: 3,
            system: 2, quest: 2, warning: 3, dungeonBreak: 3,
            bossAppear: 3, bossKill: 3, levelup: 3, rankup: 3,
            arise: 3, gameOver: 3, potion: 2, select: 1,
            bossCharge: 3, bossSlash: 3, groundSlam: 3,
            acidShot: 2, acidHit: 3, bossRage: 3,
            shadowSoldierSlash: 1, shadowSoldierSlam: 2, shadowSoldierSpit: 1,
            mana: 2, essence: 2, critHit: 2, eliteKill: 3,
        };
        // WAV Audio pools
        this._pools = {};
        this._sfxSources = {};
        this._sfxBuffers = new Map();
        this._liveSfx = new Set();
        this._levelUpDuck = false;
        this._sfxLoadPromise = null;
        this._sfxLoadTimer = null;
        this._sfxLoadTimerType = null;
        this._introPendingDispose = null;
        this._bgmPendingDispose = null;
        this._pageHidden = typeof document !== 'undefined' ? document.hidden : false;
        this._resumeSfxMutedUntil = 0;
        this._suppressToneUntil = 0;
        this._visibilityResumeTimer = null;
        this._wakeBgm = false;
        this._wakeIntro = false;
        this._bgmStarting = 0;
        this._introStarting = 0;
        this._contextInterrupted = false;
        this._settleInFlight = false;
        this._settleQueued = false;
        this._introTargetVolume = -16;
        this._bgmTargetVolume = -21;

        for (const [name, spec] of Object.entries(CHARACTER_SFX_CONFIG)) {
            this._throttleMs[name] = spec.throttle;
            this._releaseMs[name] = spec.release;
            this._soundPriority[name] = spec.priority;
            this._sfxVolume[name] = spec.volume;
        }
    }

    // WAV 오디오 풀 생성 (동시 재생 지원, 라운드로빈)
    _createPool(name, src, poolSize = 4) {
        this._sfxSources[name] = src;
        this._pools[name] = [];
        for (let i = 0; i < poolSize; i++) {
            const audio = new Audio(src);
            audio.preload = 'none';
            audio._inUse = false;
            audio._onEnded = () => { audio._inUse = false; };
            audio._onPause = () => {
                if (audio.ended || audio.currentTime === 0) audio._inUse = false;
            };
            audio.addEventListener('ended', audio._onEnded);
            audio.addEventListener('pause', audio._onPause);
            this._pools[name].push(audio);
        }
        this._pools[name]._index = 0;
    }

    _ensureMasterBus() {
        if (this._masterSum || typeof Tone === 'undefined') return;
        try {
            const ctx = Tone.getContext()?.rawContext;
            if (!ctx) return;
            this._sfxContext = ctx;

            // One sum, then a safety limiter. The old SFX compressor sat at -22 dB
            // with a 10:1 ratio, so every noisy hit and the level-up sting rode
            // the gain and came out as crackle. This limiter only shaves real overs.
            this._masterSum = ctx.createGain();
            this._masterSum.gain.value = 1;
            this._limiter = this._createLimiter(ctx);
            // Unity mute gate. The limiter's envelope survives suspend/resume
            // and comes back as continuous crackle, so the gate stays shut
            // until a fresh limiter is in place.
            this._outputGain = ctx.createGain();
            this._outputGain.gain.value = 1;
            this._masterSum.connect(this._limiter);
            this._limiter.connect(this._outputGain);
            this._outputGain.connect(ctx.destination);
            this._watchContextState();
        } catch (e) { /* HTMLAudio fallback remains available */ }
    }

    _createLimiter(ctx) {
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -1.5;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.001;
        limiter.release.value = 0.04;
        return limiter;
    }

    _rebuildLimiter() {
        const ctx = this._sfxContext;
        if (!ctx || !this._masterSum || !this._outputGain) return;
        const previous = this._limiter;
        try { this._masterSum.disconnect(); } catch (e) { /* already open */ }
        if (previous) {
            try { previous.disconnect(); } catch (e) { /* already open */ }
        }
        this._limiter = this._createLimiter(ctx);
        this._masterSum.connect(this._limiter);
        this._limiter.connect(this._outputGain);
    }

    _setAudioParam(param, value, rampSeconds = 0) {
        const ctx = this._sfxContext;
        if (!param || !ctx) return;
        const now = ctx.currentTime;
        try {
            param.cancelScheduledValues(now);
            if (rampSeconds > 0) {
                param.setValueAtTime(param.value, now);
                param.linearRampToValueAtTime(value, now + rampSeconds);
                return;
            }
            // setValueAtTime does not land once the context is already suspended,
            // so a tab hide would come back with the gate still open.
            param.value = value;
        } catch (e) { /* silent */ }
    }

    _watchContextState() {
        if (this._onContextState || typeof Tone === 'undefined') return;
        const raw = Tone.getContext()?.rawContext;
        if (!raw || typeof raw.addEventListener !== 'function') return;
        this._onContextState = () => {
            if (this._destroyed) return;
            if (raw.state === 'suspended' || raw.state === 'interrupted') {
                // Our own hide path sets _pageHidden before suspend, so that
                // suspend must not schedule a second settle on the way back.
                if (!this._pageHidden) this._contextInterrupted = true;
                return;
            }
            if (
                raw.state === 'running'
                && this._contextInterrupted
                && !this._pageHidden
                && !this._settleInFlight
                && !this._visibilityResumeTimer
            ) {
                this._contextInterrupted = false;
                this._settleAfterShow();
            }
        };
        raw.addEventListener('statechange', this._onContextState);
    }

    _audioNow() {
        let now = 0;
        try {
            if (typeof Tone !== 'undefined') now = Tone.now() || 0;
        } catch (e) { now = 0; }
        try {
            const raw = typeof Tone !== 'undefined' ? Tone.getContext()?.rawContext?.currentTime : 0;
            if (Number.isFinite(raw) && raw > now) now = raw;
        } catch (e) { /* Tone clock stands */ }
        return now;
    }

    _ensureSfxBus() {
        if (this._sfxGain || typeof Tone === 'undefined' || !this._toneReady) return;
        try {
            this._ensureMasterBus();
            const ctx = this._sfxContext;
            if (!ctx || !this._masterSum) return;

            this._sfxGain = ctx.createGain();
            this._sfxGain.gain.value = this.enabled ? this._sfxMaster : 0;
            this._sfxGain.connect(this._masterSum);
        } catch (e) { /* HTMLAudio fallback remains available */ }
    }

    _connectElementToBus(audio) {
        if (!audio || audio._mediaSource || !this._sfxContext || !this._sfxGain) return false;
        try {
            const source = this._sfxContext.createMediaElementSource(audio);
            source.connect(this._sfxGain);
            audio._mediaSource = source;
            return true;
        } catch (e) {
            return false;
        }
    }

    _loadSfxBuffers() {
        if (this._sfxLoadPromise || !this._sfxContext || typeof fetch === 'undefined') return this._sfxLoadPromise;
        const loadContext = this._sfxContext;
        const entries = Object.entries(this._sfxSources);
        this._sfxLoadPromise = Promise.all(entries.map(async ([name, src]) => {
            if (this._sfxBuffers.has(name)) return;
            try {
                const response = await fetch(src);
                if (!response.ok) return;
                const data = await response.arrayBuffer();
                const buffer = await loadContext.decodeAudioData(data.slice(0));
                if (this._destroyed || !this._initialized || this._sfxContext !== loadContext) return;
                this._sfxBuffers.set(name, buffer);
            } catch (e) { /* pool playback handles fallback */ }
        })).then(() => true).catch(() => false);
        return this._sfxLoadPromise;
    }

    _scheduleSfxBufferLoad() {
        if (this._sfxLoadPromise || this._sfxLoadTimer || !this._sfxContext) return;

        const load = () => {
            this._sfxLoadTimer = null;
            this._loadSfxBuffers();
        };

        if (typeof requestIdleCallback === 'function') {
            this._sfxLoadTimer = requestIdleCallback(load, { timeout: 2200 });
            this._sfxLoadTimerType = 'idle';
        } else {
            this._sfxLoadTimer = setTimeout(load, 1400);
            this._sfxLoadTimerType = 'timeout';
        }
    }

    _attachVisibilityHandler() {
        if (this._onVisibilityChange || typeof document === 'undefined') return;
        this._pageHidden = document.hidden;
        this._onVisibilityChange = () => this._handleVisibilityChange();
        document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    _resetSfxRuntimeState() {
        if (this._activeSoundTimers) {
            this._activeSoundTimers.forEach(id => clearTimeout(id));
            this._activeSoundTimers.clear();
        }
        this._activeSounds = 0;
        this._activeSoundNames = {};
    }

    _stopHtmlAudioPoolPlayback() {
        for (const name in this._pools) {
            const pool = this._pools[name];
            for (let i = 0; i < pool.length; i++) {
                const audio = pool[i];
                if (!audio || typeof audio.pause !== 'function') continue;
                try { audio.pause(); } catch (e) { /* silent */ }
                try { audio.currentTime = 0; } catch (e) { /* silent */ }
                audio._inUse = false;
            }
        }
    }

    _rampActiveMusicGains(volume, duration) {
        try { if (this._introGain) this._introGain.volume.rampTo(volume, duration); } catch (e) { /* silent */ }
        try { if (this._bgmGain) this._bgmGain.volume.rampTo(volume, duration); } catch (e) { /* silent */ }
    }

    _restoreActiveMusicGains() {
        const bgmLevel = this._levelUpDuck ? this._bgmTargetVolume - 4 : this._bgmTargetVolume;
        try { if (this._introGain) this._introGain.volume.rampTo(this._introTargetVolume, 0.35); } catch (e) { /* silent */ }
        try { if (this._bgmGain) this._bgmGain.volume.rampTo(bgmLevel, 0.35); } catch (e) { /* silent */ }
    }

    _suspendContext() {
        try {
            if (typeof Tone === 'undefined' || !this._toneReady) return;
            const suspended = Tone.getContext().rawContext.suspend();
            if (suspended && typeof suspended.catch === 'function') suspended.catch(() => {});
        } catch (e) { /* silent */ }
    }

    _handleVisibilityChange() {
        if (typeof document === 'undefined') return;
        const hidden = document.hidden;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this._pageHidden = hidden;

        if (this._visibilityResumeTimer) {
            clearTimeout(this._visibilityResumeTimer);
            this._visibilityResumeTimer = null;
        }
        this._settleToken = (this._settleToken || 0) + 1;

        if (hidden) {
            // A suspended DynamicsCompressor keeps a broken envelope and
            // hisses after the tab returns. Silence the output, drop the
            // live voices, and tear the synths down while the clock still runs.
            this._resumeSfxMutedUntil = now + 300;
            this.releaseCombatVoices();
            this._setAudioParam(this._outputGain?.gain, 0, 0);
            this._setAudioParam(this._sfxGain?.gain, 0, 0);
            this._wakeBgm = !!this._bgmGain || !!this._bgmStarting;
            this._wakeIntro = (!!this._introGain || !!this._introStarting) && !this._wakeBgm;
            if (this._wakeBgm) this.stopGameBGM(true);
            if (this._wakeIntro) this.stopIntroMusic(true);
            this._suspendContext();
            return;
        }

        // The show path owns the settle. A context that resumes on its own
        // in the same moment must not start a second one.
        this._contextInterrupted = false;
        this._resumeSfxMutedUntil = now + 620;
        this._suppressToneUntil = now + 560;
        this._visibilityResumeTimer = setTimeout(() => {
            this._visibilityResumeTimer = null;
            this._settleAfterShow();
        }, 40);
    }

    async _settleAfterShow() {
        if (this._pageHidden || !this.enabled || this._destroyed) return;
        if (this._settleInFlight) {
            this._settleQueued = true;
            return;
        }
        this._settleInFlight = true;
        try {
            do {
                this._settleQueued = false;
                await this._settleOnce();
            } while (this._settleQueued && !this._destroyed && !this._pageHidden);
        } catch (e) { /* silent */ }
        finally {
            this._settleInFlight = false;
            if (this._settleQueued && !this._destroyed && !this._pageHidden) {
                this._settleQueued = false;
                this._settleAfterShow();
            }
        }
    }

    async _settleOnce() {
        if (this._pageHidden || !this.enabled || this._destroyed) return;
        // resume() flips the context to running. Drop the flag first so that
        // statechange cannot start another settle over this one.
        this._contextInterrupted = false;
        const token = (this._settleToken || 0) + 1;
        this._settleToken = token;
        const restartBgm = this._wakeBgm;
        const restartIntro = this._wakeIntro;
        this._wakeBgm = false;
        this._wakeIntro = false;
        this._setAudioParam(this._outputGain?.gain, 0, 0);
        let audioReady = await this.resume(false);
        if (!audioReady && this._userActivated && !this._pageHidden && typeof Tone !== 'undefined') {
            try {
                const raw = Tone.getContext()?.rawContext;
                if (raw && raw.state !== 'running') await raw.resume();
                audioReady = !!raw && raw.state === 'running';
            } catch (e) { /* gesture-less resume can fail closed */ }
        }
        if (!audioReady || token !== this._settleToken || this._pageHidden || this._destroyed) return;
        this._rebuildLimiter();
        this._setAudioParam(this._sfxGain?.gain, this.enabled ? this._sfxMaster : 0, 0);
        if (restartBgm) this.startGameBGM();
        else if (restartIntro) this.playIntroMusic();
        else this._restoreActiveMusicGains();
        await new Promise(resolve => setTimeout(resolve, 160));
        if (token !== this._settleToken || this._pageHidden || this._destroyed) return;
        // A second suspend during the wait dirties the limiter we just made.
        if (this._contextInterrupted) {
            this._contextInterrupted = false;
            try {
                const raw = typeof Tone !== 'undefined' ? Tone.getContext()?.rawContext : null;
                if (raw && raw.state !== 'running') await raw.resume();
            } catch (e) { /* stay gated if the context will not run */ }
            if (token !== this._settleToken || this._pageHidden || this._destroyed) return;
            this._rebuildLimiter();
        }
        const raw = typeof Tone !== 'undefined' ? Tone.getContext()?.rawContext : null;
        if (!raw || raw.state !== 'running') return;
        this._setAudioParam(this._outputGain?.gain, 1, 0.18);
    }

    _ensureToneGraph() {
        this._attachVisibilityHandler();
        if (this._toneReady || typeof Tone === 'undefined') return;

        this._ensureMasterBus();
        this._masterVol = new Tone.Volume(-7);
        if (this._masterSum) this._masterVol.connect(this._masterSum);
        else this._masterVol.toDestination();
        // Dry music bus. Freeverb, the feedback delay, chorus, and the -20 dB
        // compressor stayed live for the whole run. Their denormal tails and
        // gain riding showed up as crackle whenever the main thread hitched.
        this._musicIn = new Tone.Volume(-4).connect(this._masterVol);
        this._toneReady = true;
    }

    // One note per callback, on a grid that jumps over slots missed during a stall.
    // Scheduling the backlog piles kicks and arpeggios into a burst of clicks.
    _takeToneSlot(grid) {
        if (typeof Tone === 'undefined' || !grid) return null;
        const wallNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (wallNow < (this._suppressToneUntil || 0)) return null;
        const now = this._audioNow();
        const lead = Math.max(0.05, this._toneLeadTime || 0);
        const earliest = now + 0.02;
        const interval = grid.interval;
        if (!Number.isFinite(interval) || interval <= 0) return { when: now + lead, skipped: 0 };
        if (grid.next == null || !Number.isFinite(grid.next)) grid.next = now + lead;
        let skipped = 0;
        if (grid.next < earliest) {
            skipped = Math.min(32, Math.ceil((earliest - grid.next) / interval));
            grid.next += skipped * interval;
            if (grid.next < earliest) grid.next = now + lead;
        }
        const when = grid.next;
        grid.next += interval;
        return { when, skipped };
    }

    _playFromBuffer(name, volume = 0.7) {
        if (this._pageHidden) return false;
        const ctx = this._sfxContext;
        const buffer = this._sfxBuffers.get(name);
        if (!ctx || !buffer || !this._sfxGain || ctx.state !== 'running') return false;

        try {
            const source = ctx.createBufferSource();
            const gain = ctx.createGain();
            source.buffer = buffer;
            const safeVolume = Math.max(0, Math.min(0.88, volume));
            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(safeVolume, now + 0.006);
            if (buffer.duration > 0.03) {
                gain.gain.setValueAtTime(safeVolume, now + Math.max(0.006, buffer.duration - 0.018));
                gain.gain.linearRampToValueAtTime(0, now + buffer.duration);
            }
            source.connect(gain);
            gain.connect(this._sfxGain);
            const voice = { source, gain };
            this._liveSfx.add(voice);
            source.onended = () => {
                this._liveSfx.delete(voice);
                try { source.disconnect(); } catch (e) { /* silent */ }
                try { gain.disconnect(); } catch (e) { /* silent */ }
            };
            source.start(now);
            return true;
        } catch (e) {
            return false;
        }
    }

    // WAV 풀에서 재생
    _playFromPool(name, volume = 0.7) {
        if (this._pageHidden) return false;
        const pool = this._pools[name];
        if (!pool || pool.length === 0) return false;

        const start = pool._index || 0;
        let audio = null;
        let pickedIndex = -1;
        for (let i = 0; i < pool.length; i++) {
            const idx = (start + i) % pool.length;
            const candidate = pool[idx];
            if (!candidate._inUse || candidate.paused || candidate.ended) {
                audio = candidate;
                pickedIndex = idx;
                break;
            }
        }
        if (!audio) return false;

        pool._index = (pickedIndex + 1) % pool.length;
        audio._inUse = true;
        audio.muted = !this.enabled;
        const throughBus = this._connectElementToBus(audio);
        audio.volume = throughBus
            ? Math.max(0, Math.min(0.88, volume))
            : Math.max(0, Math.min(0.72, volume * this._sfxMaster));
        try { audio.currentTime = 0; } catch (e) { /* silent */ }
        try {
            // Old iOS/in-app WebViews return undefined; autoplay policy may reject.
            const playing = audio.play();
            if (playing && typeof playing.catch === 'function') playing.catch(() => { audio._inUse = false; });
        } catch (e) { audio._inUse = false; }
        return true;
    }

    _playSfx(name, volume = 0.7) {
        if (this._playFromBuffer(name, volume)) return true;
        return this._playFromPool(name, volume);
    }

    init() {
        try {
            if (this._initialized) return;
            this._destroyed = false;

            // Tone graph is created lazily in resume(true) after a trusted gesture.

            // === Tone.js BGM 전용 이펙트 체인 ===
            // === WAV SFX 풀 로드 ===
            const base = 'sounds/';
            // 무기 (자주 발생 → 풀 크게)
            this._createPool('dagger', base + 'dagger.wav', 6);
            this._createPool('daggerThrow', base + 'dagger_throw.wav', 6);
            this._createPool('slash', base + 'slash.wav', 6);
            this._createPool('authority', base + 'authority.wav', 4);
            this._createPool('fear', base + 'fear.wav', 3);
            this._createPool('bossCharge', base + 'boss_charge.wav', 3);
            this._createPool('bossSlash', base + 'boss_slash.wav', 4);
            this._createPool('groundSlam', base + 'ground_slam.wav', 3);
            this._createPool('acidShot', base + 'acid_shot.wav', 4);
            this._createPool('acidHit', base + 'acid_hit.wav', 4);
            this._createPool('bossRage', base + 'boss_rage.wav', 2);
            this._createPool('shadowSoldierSlash', base + 'shadow_soldier_slash.wav', 4);
            this._createPool('shadowSoldierSlam', base + 'shadow_soldier_slam.wav', 3);
            this._createPool('shadowSoldierSpit', base + 'shadow_soldier_spit.wav', 4);
            // 전투 (매우 빈번)
            this._createPool('hit', base + 'hit.wav', 8);
            this._createPool('burnHit', base + 'effects/characters/flame_mage/combat_burn_hit.wav', 7);
            this._createPool('kill', base + 'kill.wav', 6);
            this._createPool('critHit', base + 'crit_hit.wav', 5);
            this._createPool('eliteKill', base + 'elite_kill.wav', 3);
            this._createPool('playerHit', base + 'playerHit.wav', 4);
            // 보상
            this._createPool('xp', base + 'xp.wav', 8);
            this._createPool('levelup', base + 'levelup.wav', 3);
            this._createPool('rankup', base + 'rankup.wav', 2);
            // 이벤트
            this._createPool('system', base + 'system.wav', 4);
            this._createPool('arise', base + 'arise.wav', 2);
            this._createPool('bossAppear', base + 'bossAppear.wav', 2);
            this._createPool('bossKill', base + 'bossKill.wav', 2);
            this._createPool('gameOver', base + 'gameOver.wav', 2);
            this._createPool('warning', base + 'warning.wav', 4);
            this._createPool('potion', base + 'potion.wav', 3);
            this._createPool('mana', base + 'mana.wav', 3);
            this._createPool('essence', base + 'essence.wav', 3);
            this._createPool('select', base + 'select.wav', 6);
            this._createPool('quest', base + 'quest.wav', 3);
            this._createPool('dungeonBreak', base + 'dungeonBreak.wav', 2);
            for (const [name, spec] of Object.entries(CHARACTER_SFX_CONFIG)) {
                this._createPool(name, base + spec.file, spec.pool);
            }

            this._initialized = true;

            // 탭 전환 시 자동 일시정지
            this._attachVisibilityHandler();
        } catch (e) {
            console.warn('SoundManager init failed:', e);
            this.enabled = false;
        }
    }

    async resume(userGesture = false) {
        try {
            if (userGesture) this._userActivated = true;
            if (!this.enabled || !this._initialized || !this._userActivated) return false;
            if (this._pageHidden) return false;

            // Keep every Tone node on the library's single default context. Replacing
            // it leaves deprecated static context exports pointing at the old graph and
            // can make native AudioNode connections fail with InvalidAccessError.
            if (!this._toneReady && typeof Tone !== 'undefined') {
                const toneContext = Tone.getContext();
                if (toneContext.state !== 'running') {
                    await Tone.start();
                }
                await new Promise(resolve => setTimeout(resolve, 0));
                this._ensureToneGraph();
            } else if (typeof Tone !== 'undefined' && this._toneReady) {
                const toneContext = Tone.getContext();
                if (toneContext.state !== 'running') await Tone.start();
            }
            if (typeof Tone !== 'undefined' && this._toneReady) {
                this._ensureSfxBus();
                this._scheduleSfxBufferLoad();
            }
            return typeof Tone !== 'undefined'
                && this._toneReady
                && Tone.getContext().state === 'running';
        } catch (e) { /* silent */ }
        return false;
    }

    warmup() {
        // WAV 기반이므로 Web Audio 노드 워밍업 불필요 (BGM용 Tone.js만 해당)
        if (!this.enabled || !this._initialized || this._warmedUp) return;
        this._warmedUp = true;
    }

    get out() { return this._musicIn; }
    get wet() { return this._musicIn; }

    // SFX 볼륨 매핑 (사운드별 적절한 볼륨)
    _sfxVolume = {
        dagger: 0.44, daggerThrow: 0.46, slash: 0.38, authority: 0.5, fear: 0.46,
        hit: 0.4, burnHit: 0.46, kill: 0.46, playerHit: 0.52,
        xp: 0.3, levelup: 0.62, rankup: 0.66,
        system: 0.45, arise: 0.66, bossAppear: 0.62,
        warning: 0.56, potion: 0.46, select: 0.38, bossKill: 0.66, gameOver: 0.62,
        quest: 0.52, dungeonBreak: 0.62,
        bossCharge: 0.5, bossSlash: 0.58, groundSlam: 0.64,
        acidShot: 0.42, acidHit: 0.48, bossRage: 0.64,
        shadowSoldierSlash: 0.3, shadowSoldierSlam: 0.38, shadowSoldierSpit: 0.3,
        mana: 0.44, essence: 0.5, critHit: 0.52, eliteKill: 0.56,
    };

    play(soundName) {
        if (!this.enabled || !this._initialized) return;
        const now = performance.now();
        if (this._pageHidden || now < this._resumeSfxMutedUntil) return;
        const priority = this._soundPriority[soundName] || 1;
        if (this._activeSounds >= this._maxActiveSounds) {
            if (priority < 3 || this._activeSounds >= this._maxActiveSounds + 1) return;
        }
        const activeSame = this._activeSoundNames[soundName] || 0;
        const sameLimit = this._sameSoundLimit[soundName] ?? (priority >= 3 ? 2 : 1);
        if (activeSame >= sameLimit) return;
        const cooldown = this._throttleMs[soundName] || 0;
        if (cooldown > 0) {
            const last = this._lastPlayTime[soundName] || 0;
            if (now - last < cooldown) return;
        }
        this._lastPlayTime[soundName] = now;
        const vol = this._sfxVolume[soundName] || 0.7;
        const congestionDuck = Math.max(0.36, 1 - this._activeSounds * 0.18 - activeSame * 0.12);
        if (!this._playSfx(soundName, vol * congestionDuck)) return;

        this._activeSounds++;
        this._activeSoundNames[soundName] = activeSame + 1;
        let releaseTimer = null;
        releaseTimer = setTimeout(() => {
            this._activeSoundTimers.delete(releaseTimer);
            this._activeSounds = Math.max(0, this._activeSounds - 1);
            this._activeSoundNames[soundName] = Math.max(0, (this._activeSoundNames[soundName] || 1) - 1);
        }, this._releaseMs[soundName] || 220);
        this._activeSoundTimers.add(releaseTimer);
    }

    // Drop combat tails before the level-up sting. Those tails were still
    // inside the old compressor when the choice screen opened, which is when
    // the crackle was loudest.
    releaseCombatVoices() {
        const ctx = this._sfxContext;
        if (ctx) {
            const now = ctx.currentTime;
            for (const voice of this._liveSfx) {
                try {
                    const param = voice.gain.gain;
                    param.cancelScheduledValues(now);
                    param.setValueAtTime(Math.max(0.0001, param.value || 0.0001), now);
                    param.linearRampToValueAtTime(0, now + 0.015);
                    voice.source.stop(now + 0.02);
                } catch (e) { /* already stopped */ }
            }
        }
        this._stopHtmlAudioPoolPlayback();
        this._resetSfxRuntimeState();
    }

    prepareLevelUpMix() {
        this.releaseCombatVoices();
        this._levelUpDuck = true;
        try {
            if (this._bgmGain) this._bgmGain.volume.rampTo(this._bgmTargetVolume - 4, 0.06);
        } catch (e) { /* silent */ }
    }

    restoreLevelUpMix() {
        if (!this._levelUpDuck) return;
        this._levelUpDuck = false;
        try {
            if (this._bgmGain && this.enabled && !this._pageHidden) {
                this._bgmGain.volume.rampTo(this._bgmTargetVolume, 0.2);
            }
        } catch (e) { /* silent */ }
    }

    // ========== INTRO MUSIC (Tone.js) ==========

    async playIntroMusic() {
        if (!this._initialized || !this.enabled) return;
        this.stopIntroMusic();
        const introToken = (this._introToken || 0) + 1;
        this._introToken = introToken;
        // Owned by this call only. A hide that bumps the token must not let
        // this continuation clear a newer start's flag.
        this._introStarting = introToken;
        const audioReady = await this.resume();
        if (introToken !== this._introToken) {
            if (this._introStarting === introToken) this._introStarting = 0;
            return;
        }
        if (!audioReady) {
            this._introStarting = 0;
            return;
        }
        this._introNodes = [];
        this._introIntervals = [];
        this._introTimeouts = [];
        this._introTransientNodes = [];

        try {
            const introGain = new Tone.Volume(-30).connect(this._musicIn);
            this._introTargetVolume = -16;
            introGain.volume.rampTo(this._introTargetVolume, 4);
            this._introGain = introGain;
            this._introStarting = 0;

            // 1. Low drone
            const droneOsc = new Tone.Oscillator({ frequency: 65.41, type: 'sawtooth' });
            const droneFilter = new Tone.Filter({ frequency: 350, type: 'lowpass', Q: 6 });
            const droneVol = new Tone.Volume(-10);
            droneOsc.connect(droneFilter);
            droneFilter.connect(droneVol);
            droneVol.connect(introGain);
            const lfo = new Tone.LFO({ frequency: 0.1, min: 200, max: 550 });
            lfo.connect(droneFilter.frequency);
            lfo.start();
            droneOsc.start();
            this._introNodes.push(droneOsc, lfo, droneFilter, droneVol);

            // 2. Sub bass
            const subOsc = new Tone.Oscillator({ frequency: 32.7, type: 'sine' });
            const subVol = new Tone.Volume(-16);
            subOsc.connect(subVol);
            subVol.connect(introGain);
            subOsc.start();
            this._introNodes.push(subOsc, subVol);

            // 3. Minor drone
            const drone2 = new Tone.Oscillator({ frequency: 77.78, type: 'sine' });
            const drone2Vol = new Tone.Volume(-18);
            drone2.connect(drone2Vol);
            drone2Vol.connect(introGain);
            drone2.start();
            this._introNodes.push(drone2, drone2Vol);

            // 4. Dark FM arpeggio
            const arpSynth = new Tone.FMSynth({
                harmonicity: 3, modulationIndex: 5,
                envelope: { attack: 0.03, decay: 0.15, sustain: 0.08, release: 0.25 },
            });
            arpSynth.connect(introGain);
            this._introArpSynth = arpSynth;

            const notes = ['C3', 'Eb3', 'G3', 'Bb3', 'C4'];
            let noteIdx = 0;
            const introArpGrid = { interval: 0.6, next: null };
            const arpInterval = setInterval(() => {
                if (!this._initialized || introToken !== this._introToken || this._pageHidden) return;
                try {
                    const slot = this._takeToneSlot(introArpGrid);
                    if (!slot) return;
                    noteIdx = (noteIdx + slot.skipped) % notes.length;
                    arpSynth.triggerAttackRelease(notes[noteIdx], '8n', slot.when, 0.25);
                    noteIdx = (noteIdx + 1) % notes.length;
                } catch (e) { /* silent */ }
            }, 600);
            this._introIntervals.push(arpInterval);

            // 5. Tension riser. Keep the soundtrack tonal: short white-noise
            // bursts read as recurring static on phone and laptop speakers.
            const riserInterval = setInterval(() => {
                if (!this._initialized || introToken !== this._introToken || this._pageHidden) return;
                try {
                    const rOsc = new Tone.Oscillator({ type: 'sawtooth' });
                    const rFilter = new Tone.Filter({ frequency: 100, type: 'lowpass', Q: 3 });
                    const rVol = new Tone.Volume(-25);
                    rOsc.connect(rFilter);
                    rFilter.connect(rVol);
                    rVol.connect(introGain);
                    const riserWhen = this._audioNow() + Math.max(0.05, this._toneLeadTime || 0);
                    rOsc.frequency.rampTo(200, 2);
                    rFilter.frequency.rampTo(1500, 2);
                    rVol.volume.rampTo(-15, 1.5);
                    rVol.volume.rampTo(-60, 0.5, '+2');
                    rOsc.start(riserWhen);
                    rOsc.stop(riserWhen + 2.5);
                    this._introTransientNodes.push(rOsc, rFilter, rVol);
                    let cleanupTimer = null;
                    cleanupTimer = setTimeout(() => {
                        this._introTimeouts = (this._introTimeouts || []).filter(id => id !== cleanupTimer);
                        this._introTransientNodes = (this._introTransientNodes || []).filter(
                            node => node !== rOsc && node !== rFilter && node !== rVol
                        );
                        try { rOsc.dispose(); rFilter.dispose(); rVol.dispose(); } catch (e) { /* silent */ }
                    }, 3000);
                    this._introTimeouts.push(cleanupTimer);
                } catch (e) { /* silent */ }
            }, 8000);
            this._introIntervals.push(riserInterval);
        } catch (e) {
            console.warn('Intro music error:', e);
            if (introToken !== this._introToken) return;
            this._introStarting = 0;
            this.stopIntroMusic(true);
        }
    }

    _flushPendingIntroDispose() {
        if (this._introDisposeTimeout) {
            clearTimeout(this._introDisposeTimeout);
            this._introDisposeTimeout = null;
        }
        if (this._introPendingDispose) {
            const dispose = this._introPendingDispose;
            this._introPendingDispose = null;
            dispose();
        }
    }

    stopIntroMusic(immediate = false) {
        this._flushPendingIntroDispose();
        this._introToken = (this._introToken || 0) + 1;
        if (this._introIntervals) {
            this._introIntervals.forEach(id => clearInterval(id));
            this._introIntervals = [];
        }
        if (this._introTimeouts) {
            this._introTimeouts.forEach(id => clearTimeout(id));
            this._introTimeouts = [];
        }
        if (this._introGain) {
            try { this._introGain.volume.rampTo(-60, 0.3); } catch (e) { /* silent */ }
        }
        const nodes = this._introNodes || [];
        const transientNodes = this._introTransientNodes || [];
        const arpSynth = this._introArpSynth;
        const gain = this._introGain;
        this._introNodes = [];
        this._introTransientNodes = [];
        this._introArpSynth = null;
        this._introGain = null;
        const disposeIntroNodes = () => {
            this._introDisposeTimeout = null;
            this._introPendingDispose = null;
            nodes.forEach(node => {
                try { if (node.stop) node.stop(); } catch (e) { /* silent */ }
                try { node.dispose(); } catch (e) { /* silent */ }
            });
            transientNodes.forEach(node => {
                try { if (node.stop) node.stop(); } catch (e) { /* silent */ }
                try { node.dispose(); } catch (e) { /* silent */ }
            });
            if (arpSynth) { try { arpSynth.dispose(); } catch (e) { /* silent */ } }
            if (gain) { try { gain.dispose(); } catch (e) { /* silent */ } }
        };
        if (immediate) disposeIntroNodes();
        else {
            this._introPendingDispose = disposeIntroNodes;
            this._introDisposeTimeout = setTimeout(disposeIntroNodes, 400);
        }
    }

    // ========== IN-GAME BGM (Tone.js) ==========

    async startGameBGM() {
        if (!this._initialized || !this.enabled) return;
        this.stopGameBGM();
        const bgmToken = (this._bgmToken || 0) + 1;
        this._bgmToken = bgmToken;
        this._bgmStarting = bgmToken;
        const audioReady = await this.resume();
        if (bgmToken !== this._bgmToken) {
            if (this._bgmStarting === bgmToken) this._bgmStarting = 0;
            return;
        }
        if (!audioReady) {
            this._bgmStarting = 0;
            return;
        }
        this._bgmNodes = [];
        this._bgmIntervals = [];

        try {
            const bgmGain = new Tone.Volume(-60).connect(this._musicIn);
            this._bgmTargetVolume = -21;
            const bgmLevel = this._levelUpDuck ? this._bgmTargetVolume - 4 : this._bgmTargetVolume;
            bgmGain.volume.rampTo(bgmLevel, 1.5);
            this._bgmGain = bgmGain;
            this._bgmStarting = 0;
            this._bgmTimeouts = [];

            const bpm = 100;
            const beatMs = 60000 / bpm;

            // === Phase 1: Drone + Sub ===
            const droneOsc = new Tone.Oscillator({ frequency: 65.41, type: 'triangle' });
            const droneFilter = new Tone.Filter({ frequency: 280, type: 'lowpass', Q: 4 });
            const droneVol = new Tone.Volume(-12);
            droneOsc.connect(droneFilter);
            droneFilter.connect(droneVol);
            droneVol.connect(bgmGain);
            const droneLfo = new Tone.LFO({ frequency: 0.06, min: 180, max: 400 });
            droneLfo.connect(droneFilter.frequency);
            const bgmStart = this._audioNow() + 0.05;
            droneLfo.start(bgmStart);
            droneOsc.start(bgmStart);
            this._bgmNodes.push(droneOsc, droneFilter, droneVol, droneLfo);

            const subOsc = new Tone.Oscillator({ frequency: 32.7, type: 'sine' });
            const subVol = new Tone.Volume(-18);
            const subLfo = new Tone.LFO({ frequency: 0.5, min: -22, max: -14 });
            subOsc.connect(subVol);
            subVol.connect(bgmGain);
            subLfo.connect(subVol.volume);
            subLfo.start(bgmStart);
            subOsc.start(bgmStart);
            this._bgmNodes.push(subOsc, subVol, subLfo);

            // === Phase 2: Kick (500ms) ===
            this._bgmTimeouts.push(setTimeout(() => {
                if (!this._initialized || bgmToken !== this._bgmToken || this._bgmGain !== bgmGain) return;
                try {
                    const kickSynth = new Tone.MembraneSynth({
                        pitchDecay: 0.03, octaves: 4,
                        envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.06 },
                    });
                    const kickVol = new Tone.Volume(-16);
                    kickSynth.connect(kickVol);
                    kickVol.connect(bgmGain);
                    this._bgmNodes.push(kickSynth, kickVol);

                    let beatIdx = 0;
                    const kickPattern = [1, 0, 0.6, 0, 1, 0, 0.4, 0.7];
                    const kickGrid = { interval: (beatMs / 2) / 1000, next: null };
                    const kickInterval = setInterval(() => {
                        if (!this._initialized || bgmToken !== this._bgmToken || this._bgmGain !== bgmGain || this._pageHidden) return;
                        try {
                            const slot = this._takeToneSlot(kickGrid);
                            if (!slot) return;
                            beatIdx = (beatIdx + slot.skipped) % kickPattern.length;
                            const vel = kickPattern[beatIdx];
                            beatIdx = (beatIdx + 1) % kickPattern.length;
                            if (vel > 0) kickSynth.triggerAttackRelease('C1', '32n', slot.when, vel * 0.28);
                        } catch (e) { /* silent */ }
                    }, beatMs / 2);
                    this._bgmIntervals.push(kickInterval);

                } catch (e) { /* silent */ }
            }, 500));

            // === Phase 3: Arpeggio + Pad (1200ms) ===
            this._bgmTimeouts.push(setTimeout(() => {
                if (!this._initialized || bgmToken !== this._bgmToken || this._bgmGain !== bgmGain) return;
                try {
                    const arpSynth = new Tone.FMSynth({
                        harmonicity: 2, modulationIndex: 3,
                        envelope: { attack: 0.02, decay: 0.12, sustain: 0.05, release: 0.2 },
                    });
                    const arpVol = new Tone.Volume(-18);
                    arpSynth.connect(arpVol);
                    arpVol.connect(bgmGain);
                    this._bgmNodes.push(arpSynth, arpVol);

                    const arpNotes = ['C3', 'Eb3', 'G3', 'Bb3', 'C4', 'Bb3', 'G3', 'Eb3'];
                    let arpIdx = 0;
                    const arpGrid = { interval: beatMs / 1000, next: null };
                    const arpInterval = setInterval(() => {
                        if (!this._initialized || bgmToken !== this._bgmToken || this._bgmGain !== bgmGain || this._pageHidden) return;
                        try {
                            const slot = this._takeToneSlot(arpGrid);
                            if (!slot) return;
                            arpIdx = (arpIdx + slot.skipped) % arpNotes.length;
                            arpSynth.triggerAttackRelease(arpNotes[arpIdx], '16n', slot.when, 0.16);
                            arpIdx = (arpIdx + 1) % arpNotes.length;
                        } catch (e) { /* silent */ }
                    }, beatMs);
                    this._bgmIntervals.push(arpInterval);

                    const padSynth = new Tone.PolySynth(Tone.Synth, {
                        maxPolyphony: 8,
                        voice: Tone.Synth,
                        options: {
                            oscillator: { type: 'sine' },
                            envelope: { attack: 1.5, decay: 2.0, sustain: 0.3, release: 2.0 },
                        },
                    });
                    const padFilter = new Tone.Filter({ frequency: 600, type: 'lowpass', Q: 1 });
                    const padVol = new Tone.Volume(-22);
                    padSynth.connect(padFilter);
                    padFilter.connect(padVol);
                    padVol.connect(bgmGain);
                    this._bgmNodes.push(padSynth, padFilter, padVol);

                    const padChords = [
                        ['C3', 'Eb3', 'G3', 'Bb3'],
                        ['Ab2', 'C3', 'Eb3', 'G3'],
                        ['F2', 'Ab2', 'C3', 'Eb3'],
                        ['G2', 'B2', 'D3', 'F3'],
                    ];
                    let padIdx = 0;
                    const padGrid = { interval: (beatMs * 8) / 1000, next: null };
                    const padInterval = setInterval(() => {
                        if (!this._initialized || bgmToken !== this._bgmToken || this._bgmGain !== bgmGain || this._pageHidden) return;
                        try {
                            const slot = this._takeToneSlot(padGrid);
                            if (!slot) return;
                            padIdx = (padIdx + slot.skipped) % padChords.length;
                            padSynth.triggerAttackRelease(padChords[padIdx], '1m', slot.when, 0.11);
                            padIdx = (padIdx + 1) % padChords.length;
                        } catch (e) { /* silent */ }
                    }, beatMs * 8);
                    this._bgmIntervals.push(padInterval);
                    if (!this._pageHidden) {
                        try {
                            const slot = this._takeToneSlot(padGrid);
                            if (slot) padSynth.triggerAttackRelease(padChords[0], '1m', slot.when, 0.11);
                        } catch (e) { /* silent */ }
                    }
                } catch (e) { /* silent */ }
            }, 1200));
        } catch (e) {
            console.warn('Game BGM error:', e);
            if (bgmToken !== this._bgmToken) return;
            this._bgmStarting = 0;
            this.stopGameBGM(true);
        }
    }

    _flushPendingBgmDispose() {
        if (this._bgmDisposeTimeout) {
            clearTimeout(this._bgmDisposeTimeout);
            this._bgmDisposeTimeout = null;
        }
        if (this._bgmPendingDispose) {
            const dispose = this._bgmPendingDispose;
            this._bgmPendingDispose = null;
            dispose();
        }
    }

    stopGameBGM(immediate = false) {
        this._flushPendingBgmDispose();
        this._bgmToken = (this._bgmToken || 0) + 1;
        if (this._bgmTimeouts) {
            this._bgmTimeouts.forEach(id => clearTimeout(id));
            this._bgmTimeouts = [];
        }
        if (this._bgmIntervals) {
            this._bgmIntervals.forEach(id => clearInterval(id));
            this._bgmIntervals = [];
        }
        const nodes = this._bgmNodes || [];
        this._bgmNodes = [];
        if (this._bgmGain) {
            const bgmGain = this._bgmGain;
            this._bgmGain = null;
            try {
                if (!immediate) bgmGain.volume.rampTo(-60, 0.5);
                const disposeBgmGain = () => {
                    this._bgmDisposeTimeout = null;
                    this._bgmPendingDispose = null;
                    nodes.forEach(node => {
                        try { if (node.stop) node.stop(); } catch (e) { /* silent */ }
                        try { node.dispose(); } catch (e) { /* silent */ }
                    });
                    try { bgmGain.dispose(); } catch (e) { /* silent */ }
                };
                if (immediate) disposeBgmGain();
                else {
                    this._bgmPendingDispose = disposeBgmGain;
                    this._bgmDisposeTimeout = setTimeout(disposeBgmGain, 600);
                }
            } catch (e) { /* silent */ }
        } else {
            nodes.forEach(node => {
                try { if (node.stop) node.stop(); } catch (e) { /* silent */ }
                try { node.dispose(); } catch (e) { /* silent */ }
            });
        }
    }

    destroy() {
        this._destroyed = true;
        this._settleToken = (this._settleToken || 0) + 1;
        this._settleInFlight = false;
        if (this._visibilityResumeTimer) {
            clearTimeout(this._visibilityResumeTimer);
            this._visibilityResumeTimer = null;
        }
        if (this._activeSoundTimers) {
            this._activeSoundTimers.forEach(id => clearTimeout(id));
            this._activeSoundTimers.clear();
        }
        this._activeSounds = 0;
        this._activeSoundNames = {};
        this.stopIntroMusic(true);
        this.stopGameBGM(true);

        if (this._introDisposeTimeout) { clearTimeout(this._introDisposeTimeout); this._introDisposeTimeout = null; }
        if (this._bgmDisposeTimeout) { clearTimeout(this._bgmDisposeTimeout); this._bgmDisposeTimeout = null; }
        if (this._sfxLoadTimer) {
            if (this._sfxLoadTimerType === 'idle' && typeof cancelIdleCallback === 'function') {
                cancelIdleCallback(this._sfxLoadTimer);
            } else {
                clearTimeout(this._sfxLoadTimer);
            }
            this._sfxLoadTimer = null;
            this._sfxLoadTimerType = null;
        }

        if (this._onVisibilityChange) {
            document.removeEventListener('visibilitychange', this._onVisibilityChange);
            this._onVisibilityChange = null;
        }

        for (const name in this._pools) {
            const pool = this._pools[name];
            for (let i = 0; i < pool.length; i++) {
                if (pool[i] instanceof Audio) {
                    const audio = pool[i];
                    if (audio._onEnded) audio.removeEventListener('ended', audio._onEnded);
                    if (audio._onPause) audio.removeEventListener('pause', audio._onPause);
                    audio.pause();
                    audio.removeAttribute('src');
                    try { audio.load(); } catch (e) { /* silent */ }
                    audio._onEnded = null;
                    audio._onPause = null;
                    pool[i] = null;
                }
            }
        }
        this._pools = {};
        this._sfxSources = {};
        this._lastPlayTime = {};

        try {
            this._liveSfx.clear();
            if (this._onContextState && this._sfxContext) {
                try { this._sfxContext.removeEventListener('statechange', this._onContextState); } catch (e) { /* silent */ }
            }
            this._onContextState = null;
            if (this._sfxGain) { this._sfxGain.disconnect(); this._sfxGain = null; }
            if (this._limiter) { this._limiter.disconnect(); this._limiter = null; }
            if (this._outputGain) { this._outputGain.disconnect(); this._outputGain = null; }
            if (this._masterSum) { this._masterSum.disconnect(); this._masterSum = null; }
            this._sfxContext = null;
            this._sfxBuffers.clear();
            this._sfxLoadPromise = null;
            if (this._musicIn) { this._musicIn.dispose(); this._musicIn = null; }
            if (this._masterVol) { this._masterVol.dispose(); this._masterVol = null; }
        } catch (e) { /* silent */ }

        this._initialized = false;
        this._toneReady = false;
        this._userActivated = false;
        this._warmedUp = false;
    }

    toggleSound() {
        this.enabled = !this.enabled;
        if (this._masterVol) {
            this._masterVol.volume.value = this.enabled ? -7 : -Infinity;
        }
        if (this._sfxGain) {
            this._sfxGain.gain.value = this.enabled && !this._pageHidden ? this._sfxMaster : 0;
        }
        // WAV SFX 풀도 음소거/복원
        for (const name in this._pools) {
            const pool = this._pools[name];
            for (let i = 0; i < pool.length; i++) {
                if (pool[i] instanceof Audio) {
                    pool[i].muted = !this.enabled;
                }
            }
        }
        return this.enabled;
    }
}
