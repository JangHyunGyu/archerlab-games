/**
 * WAV 기반 SFX + Tone.js BGM 사운드 매니저
 * SFX: 사전 생성된 WAV 파일을 Audio 풀로 재생 (실시간 합성 오버헤드 없음)
 * BGM: Tone.js 프로시저럴 합성 유지 (인트로 음악, 게임 BGM)
 */
export class SoundManager {
    constructor() {
        this.enabled = true;
        this._initialized = false;
        this._toneReady = false;
        this._userActivated = false;
        this._lastPlayTime = {};
        this._throttleMs = {
            hit: 180, kill: 280, xp: 150, dagger: 230, daggerThrow: 220,
            slash: 360, authority: 520, fear: 700,
            playerHit: 400, system: 350, warning: 600,
            quest: 600, dungeonBreak: 1000, bossAppear: 900,
            levelup: 900, rankup: 1000, arise: 1000,
        };
        this._activeSounds = 0;
        this._maxActiveSounds = 3;
        this._activeSoundTimers = new Set();
        this._sfxMaster = 0.48;
        this._releaseMs = {
            dagger: 320, daggerThrow: 380, hit: 500, kill: 300, xp: 160,
            playerHit: 390, select: 130, system: 190, warning: 340,
            slash: 620, authority: 860, fear: 660,
            levelup: 560, rankup: 860, arise: 860, bossAppear: 860,
            bossKill: 1060, gameOver: 1250, quest: 390, dungeonBreak: 760,
            potion: 280,
        };
        this._soundPriority = {
            xp: 0, hit: 1, dagger: 1, daggerThrow: 1, kill: 1,
            slash: 2, authority: 2, fear: 2, playerHit: 3,
            system: 2, quest: 2, warning: 3, dungeonBreak: 3,
            bossAppear: 3, bossKill: 3, levelup: 3, rankup: 3,
            arise: 3, gameOver: 3, potion: 2, select: 1,
        };
        // WAV Audio pools
        this._pools = {};
        this._sfxSources = {};
        this._sfxBuffers = new Map();
        this._sfxLoadPromise = null;
    }

    // WAV 오디오 풀 생성 (동시 재생 지원, 라운드로빈)
    _createPool(name, src, poolSize = 4) {
        this._sfxSources[name] = src;
        this._pools[name] = [];
        for (let i = 0; i < poolSize; i++) {
            const audio = new Audio(src);
            audio.preload = 'auto';
            audio._inUse = false;
            audio.addEventListener('ended', () => { audio._inUse = false; });
            audio.addEventListener('pause', () => {
                if (audio.ended || audio.currentTime === 0) audio._inUse = false;
            });
            this._pools[name].push(audio);
        }
        this._pools[name]._index = 0;
    }

    _ensureSfxBus() {
        if (this._sfxGain || typeof Tone === 'undefined' || !this._toneReady) return;
        try {
            const ctx = Tone.getContext()?.rawContext;
            if (!ctx) return;

            this._sfxContext = ctx;
            this._sfxGain = ctx.createGain();
            this._sfxGain.gain.value = this.enabled ? this._sfxMaster : 0;

            this._sfxComp = ctx.createDynamicsCompressor();
            this._sfxComp.threshold.value = -18;
            this._sfxComp.knee.value = 10;
            this._sfxComp.ratio.value = 8;
            this._sfxComp.attack.value = 0.003;
            this._sfxComp.release.value = 0.18;

            this._sfxGain.connect(this._sfxComp);
            this._sfxComp.connect(ctx.destination);
        } catch (e) { /* HTMLAudio fallback remains available */ }
    }

    _loadSfxBuffers() {
        if (this._sfxLoadPromise || !this._sfxContext || typeof fetch === 'undefined') return this._sfxLoadPromise;
        const entries = Object.entries(this._sfxSources);
        this._sfxLoadPromise = Promise.all(entries.map(async ([name, src]) => {
            if (this._sfxBuffers.has(name)) return;
            try {
                const response = await fetch(src);
                if (!response.ok) return;
                const data = await response.arrayBuffer();
                const buffer = await this._sfxContext.decodeAudioData(data.slice(0));
                this._sfxBuffers.set(name, buffer);
            } catch (e) { /* pool playback handles fallback */ }
        })).then(() => true).catch(() => false);
        return this._sfxLoadPromise;
    }

    _playFromBuffer(name, volume = 0.7) {
        const ctx = this._sfxContext;
        const buffer = this._sfxBuffers.get(name);
        if (!ctx || !buffer || !this._sfxGain || ctx.state !== 'running') return false;

        try {
            const source = ctx.createBufferSource();
            const gain = ctx.createGain();
            source.buffer = buffer;
            gain.gain.value = Math.max(0, Math.min(1, volume));
            source.connect(gain);
            gain.connect(this._sfxGain);
            source.onended = () => {
                try { source.disconnect(); } catch (e) { /* silent */ }
                try { gain.disconnect(); } catch (e) { /* silent */ }
            };
            source.start();
            return true;
        } catch (e) {
            return false;
        }
    }

    // WAV 풀에서 재생
    _playFromPool(name, volume = 0.7) {
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
        audio.volume = Math.max(0, Math.min(1, volume * this._sfxMaster));
        try { audio.currentTime = 0; } catch (e) { /* silent */ }
        audio.play().catch(() => { audio._inUse = false; });
        return true;
    }

    _playSfx(name, volume = 0.7) {
        if (this._playFromBuffer(name, volume)) return true;
        return this._playFromPool(name, volume);
    }

    init() {
        try {
            if (this._initialized) return;

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
            // 전투 (매우 빈번)
            this._createPool('hit', base + 'hit.wav', 8);
            this._createPool('kill', base + 'kill.wav', 6);
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
            this._createPool('select', base + 'select.wav', 6);
            this._createPool('quest', base + 'quest.wav', 3);
            this._createPool('dungeonBreak', base + 'dungeonBreak.wav', 2);

            this._initialized = true;

            // 탭 전환 시 자동 일시정지
            if (this._toneReady && !this._onVisibilityChange) {
                this._onVisibilityChange = () => {
                    try {
                        if (document.hidden) {
                            Tone.getContext().rawContext.suspend();
                        } else if (this.enabled) {
                            Tone.getContext().rawContext.resume();
                        }
                    } catch (e) { /* silent */ }
                };
                document.addEventListener('visibilitychange', this._onVisibilityChange);
            }
        } catch (e) {
            console.warn('SoundManager init failed:', e);
            this.enabled = false;
        }
    }

    async resume(userGesture = false) {
        try {
            if (userGesture) this._userActivated = true;
            if (!this.enabled || !this._initialized || !this._userActivated) return false;

            if (!this._toneReady && typeof Tone !== 'undefined') {
                try {
                    Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: 0.1 }));
                } catch (e) { /* silent */ }

                this._masterVol = new Tone.Volume(-7).toDestination();
                this._chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.3, wet: 0.1 })
                    .connect(this._masterVol).start();
                this._comp = new Tone.Compressor(-20, 6).connect(this._chorus);
                this._reverb = new Tone.Freeverb({ roomSize: 0.55, dampening: 3000, wet: 0.18 }).connect(this._comp);
                this._delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.2, wet: 0.12 }).connect(this._comp);
                this._toneReady = true;

                if (!this._onVisibilityChange) {
                    this._onVisibilityChange = () => {
                        try {
                            if (document.hidden) {
                                Tone.getContext().rawContext.suspend();
                            } else if (this.enabled) {
                                Tone.getContext().rawContext.resume();
                            }
                        } catch (e) { /* silent */ }
                    };
                    document.addEventListener('visibilitychange', this._onVisibilityChange);
                }
            }

            if (typeof Tone !== 'undefined' && this._toneReady && Tone.context.state !== 'running') {
                await Tone.start();
            }
            if (typeof Tone !== 'undefined' && this._toneReady) {
                this._ensureSfxBus();
                this._loadSfxBuffers();
            }
            return typeof Tone !== 'undefined' && this._toneReady && Tone.context.state === 'running';
        } catch (e) { /* silent */ }
        return false;
    }

    warmup() {
        // WAV 기반이므로 Web Audio 노드 워밍업 불필요 (BGM용 Tone.js만 해당)
        if (!this.enabled || !this._initialized || this._warmedUp) return;
        this._warmedUp = true;
    }

    get out() { return this._comp; }
    get wet() { return this._reverb; }

    // SFX 볼륨 매핑 (사운드별 적절한 볼륨)
    _sfxVolume = {
        dagger: 0.48, daggerThrow: 0.5, slash: 0.52, authority: 0.56, fear: 0.5,
        hit: 0.46, kill: 0.5, playerHit: 0.6,
        xp: 0.36, levelup: 0.62, rankup: 0.66,
        system: 0.45, arise: 0.66, bossAppear: 0.62,
        warning: 0.56, potion: 0.46, select: 0.38, bossKill: 0.66, gameOver: 0.62,
        quest: 0.52, dungeonBreak: 0.62,
    };

    play(soundName) {
        if (!this.enabled || !this._initialized) return;
        const priority = this._soundPriority[soundName] || 1;
        if (this._activeSounds >= this._maxActiveSounds) {
            if (priority < 3 || this._activeSounds >= this._maxActiveSounds + 1) return;
        }
        const now = performance.now();
        const cooldown = this._throttleMs[soundName] || 0;
        if (cooldown > 0) {
            const last = this._lastPlayTime[soundName] || 0;
            if (now - last < cooldown) return;
        }
        this._lastPlayTime[soundName] = now;
        const vol = this._sfxVolume[soundName] || 0.7;
        const congestionDuck = Math.max(0.42, 1 - this._activeSounds * 0.2);
        if (!this._playSfx(soundName, vol * congestionDuck)) return;

        this._activeSounds++;
        let releaseTimer = null;
        releaseTimer = setTimeout(() => {
            this._activeSoundTimers.delete(releaseTimer);
            this._activeSounds = Math.max(0, this._activeSounds - 1);
        }, this._releaseMs[soundName] || 220);
        this._activeSoundTimers.add(releaseTimer);
    }

    // ========== INTRO MUSIC (Tone.js) ==========

    async playIntroMusic() {
        if (!this._initialized || !this.enabled) return;
        const audioReady = await this.resume();
        if (!audioReady) return;
        this.stopIntroMusic();
        this._introNodes = [];
        this._introIntervals = [];
        this._introTimeouts = [];
        this._introTransientNodes = [];

        try {
            const introGain = new Tone.Volume(-30).connect(this._comp);
            introGain.volume.rampTo(-16, 4);
            this._introGain = introGain;

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
            arpSynth.connect(this._reverb);
            arpSynth.connect(introGain);
            this._introArpSynth = arpSynth;

            const notes = ['C3', 'Eb3', 'G3', 'Bb3', 'C4'];
            let noteIdx = 0;
            const arpInterval = setInterval(() => {
                if (!this._initialized) return;
                try {
                    arpSynth.triggerAttackRelease(notes[noteIdx % notes.length], '8n', Tone.now(), 0.25);
                    noteIdx++;
                } catch (e) { /* silent */ }
            }, 600);
            this._introIntervals.push(arpInterval);

            // 5. Subtle percussion
            const percNoise = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
            });
            const percFilter = new Tone.Filter({ frequency: 700, type: 'bandpass', Q: 3 });
            percNoise.connect(percFilter);
            percFilter.connect(introGain);
            this._introNodes.push(percNoise, percFilter);

            const percInterval = setInterval(() => {
                if (!this._initialized) return;
                try {
                    percFilter.frequency.value = 600 + Math.random() * 400;
                    percNoise.triggerAttackRelease('64n', Tone.now(), 0.08);
                } catch (e) { /* silent */ }
            }, 2400);
            this._introIntervals.push(percInterval);

            // 6. Tension riser
            const riserInterval = setInterval(() => {
                if (!this._initialized) return;
                try {
                    const rOsc = new Tone.Oscillator({ type: 'sawtooth' });
                    const rFilter = new Tone.Filter({ frequency: 100, type: 'lowpass', Q: 3 });
                    const rVol = new Tone.Volume(-25);
                    rOsc.connect(rFilter);
                    rFilter.connect(rVol);
                    rVol.connect(introGain);
                    rOsc.frequency.rampTo(200, 2);
                    rFilter.frequency.rampTo(1500, 2);
                    rVol.volume.rampTo(-15, 1.5);
                    rVol.volume.rampTo(-60, 0.5, '+2');
                    rOsc.start();
                    rOsc.stop('+2.5');
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
        }
    }

    stopIntroMusic(immediate = false) {
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
        if (this._introDisposeTimeout) clearTimeout(this._introDisposeTimeout);
        const disposeIntroNodes = () => {
            this._introDisposeTimeout = null;
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
        else this._introDisposeTimeout = setTimeout(disposeIntroNodes, 400);
    }

    // ========== IN-GAME BGM (Tone.js) ==========

    async startGameBGM() {
        if (!this._initialized || !this.enabled) return;
        const audioReady = await this.resume();
        if (!audioReady) return;
        this.stopGameBGM();
        this._bgmNodes = [];
        this._bgmIntervals = [];

        try {
            const bgmGain = new Tone.Volume(-60).connect(this._comp);
            bgmGain.volume.rampTo(-21, 1.5);
            this._bgmGain = bgmGain;
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
            const bgmStart = Tone.now() + 0.05;
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

            // === Phase 2: Kick + Hi-hat (500ms) ===
            this._bgmTimeouts.push(setTimeout(() => {
                if (!this._initialized) return;
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
                    const kickInterval = setInterval(() => {
                        if (!this._initialized) return;
                        try {
                            const vel = kickPattern[beatIdx % kickPattern.length];
                            if (vel > 0) kickSynth.triggerAttackRelease('C1', '32n', Tone.now(), vel * 0.35);
                            beatIdx++;
                        } catch (e) { /* silent */ }
                    }, beatMs / 2);
                    this._bgmIntervals.push(kickInterval);

                    const hatNoise = new Tone.NoiseSynth({
                        noise: { type: 'white' },
                        envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
                    });
                    const hatFilter = new Tone.Filter({ frequency: 8000, type: 'highpass' });
                    const hatVol = new Tone.Volume(-34);
                    hatNoise.connect(hatFilter);
                    hatFilter.connect(hatVol);
                    hatVol.connect(bgmGain);
                    this._bgmNodes.push(hatNoise, hatFilter, hatVol);

                    let hatIdx = 0;
                    const hatPattern = [0.12, 0.04, 0.08, 0.04];
                    const hatInterval = setInterval(() => {
                        if (!this._initialized) return;
                        try {
                            const vel = hatPattern[hatIdx % hatPattern.length];
                            hatNoise.triggerAttackRelease('64n', Tone.now(), vel);
                            hatIdx++;
                        } catch (e) { /* silent */ }
                    }, beatMs / 2);
                    this._bgmIntervals.push(hatInterval);
                } catch (e) { /* silent */ }
            }, 500));

            // === Phase 3: Arpeggio + Pad (1200ms) ===
            this._bgmTimeouts.push(setTimeout(() => {
                if (!this._initialized) return;
                try {
                    const arpSynth = new Tone.FMSynth({
                        harmonicity: 2, modulationIndex: 3,
                        envelope: { attack: 0.02, decay: 0.12, sustain: 0.05, release: 0.2 },
                    });
                    const arpVol = new Tone.Volume(-18);
                    arpSynth.connect(this._reverb);
                    arpSynth.connect(arpVol);
                    arpVol.connect(bgmGain);
                    this._bgmNodes.push(arpSynth, arpVol);

                    const arpNotes = ['C3', 'Eb3', 'G3', 'Bb3', 'C4', 'Bb3', 'G3', 'Eb3'];
                    let arpIdx = 0;
                    const arpInterval = setInterval(() => {
                        if (!this._initialized) return;
                        try {
                            arpSynth.triggerAttackRelease(arpNotes[arpIdx % arpNotes.length], '16n', Tone.now(), 0.2);
                            arpIdx++;
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
                    padFilter.connect(this._reverb);
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
                    const padInterval = setInterval(() => {
                        if (!this._initialized) return;
                        try {
                            const chord = padChords[padIdx % padChords.length];
                            padSynth.triggerAttackRelease(chord, '1m', Tone.now(), 0.15);
                            padIdx++;
                        } catch (e) { /* silent */ }
                    }, beatMs * 8);
                    this._bgmIntervals.push(padInterval);
                    try { padSynth.triggerAttackRelease(padChords[0], '1m', Tone.now(), 0.15); } catch (e) { /* silent */ }
                } catch (e) { /* silent */ }
            }, 1200));
        } catch (e) {
            console.warn('Game BGM error:', e);
        }
    }

    stopGameBGM(immediate = false) {
        if (this._bgmTimeouts) {
            this._bgmTimeouts.forEach(id => clearTimeout(id));
            this._bgmTimeouts = [];
        }
        if (this._bgmIntervals) {
            this._bgmIntervals.forEach(id => clearInterval(id));
            this._bgmIntervals = [];
        }
        if (this._bgmNodes) {
            this._bgmNodes.forEach(node => {
                try { if (node.stop) node.stop(); } catch (e) { /* silent */ }
                try { node.dispose(); } catch (e) { /* silent */ }
            });
            this._bgmNodes = [];
        }
        if (this._bgmGain) {
            const bgmGain = this._bgmGain;
            this._bgmGain = null;
            try {
                if (!immediate) bgmGain.volume.rampTo(-60, 0.5);
                if (this._bgmDisposeTimeout) clearTimeout(this._bgmDisposeTimeout);
                const disposeBgmGain = () => {
                    this._bgmDisposeTimeout = null;
                    try { bgmGain.dispose(); } catch (e) { /* silent */ }
                };
                if (immediate) disposeBgmGain();
                else this._bgmDisposeTimeout = setTimeout(disposeBgmGain, 600);
            } catch (e) { /* silent */ }
        }
    }

    destroy() {
        if (this._activeSoundTimers) {
            this._activeSoundTimers.forEach(id => clearTimeout(id));
            this._activeSoundTimers.clear();
        }
        this.stopIntroMusic(true);
        this.stopGameBGM(true);

        if (this._introDisposeTimeout) { clearTimeout(this._introDisposeTimeout); this._introDisposeTimeout = null; }
        if (this._bgmDisposeTimeout) { clearTimeout(this._bgmDisposeTimeout); this._bgmDisposeTimeout = null; }

        if (this._onVisibilityChange) {
            document.removeEventListener('visibilitychange', this._onVisibilityChange);
            this._onVisibilityChange = null;
        }

        for (const name in this._pools) {
            const pool = this._pools[name];
            for (let i = 0; i < pool.length; i++) {
                if (pool[i] instanceof Audio) {
                    pool[i].pause();
                    pool[i].src = '';
                    pool[i] = null;
                }
            }
        }
        this._pools = {};

        try {
            if (this._sfxGain) { this._sfxGain.disconnect(); this._sfxGain = null; }
            if (this._sfxComp) { this._sfxComp.disconnect(); this._sfxComp = null; }
            this._sfxContext = null;
            this._sfxBuffers.clear();
            this._sfxLoadPromise = null;
            if (this._delay) { this._delay.dispose(); this._delay = null; }
            if (this._reverb) { this._reverb.dispose(); this._reverb = null; }
            if (this._comp) { this._comp.dispose(); this._comp = null; }
            if (this._chorus) { this._chorus.dispose(); this._chorus = null; }
            if (this._masterVol) { this._masterVol.dispose(); this._masterVol = null; }
        } catch (e) { /* silent */ }

        this._initialized = false;
    }

    toggleSound() {
        this.enabled = !this.enabled;
        if (this._masterVol) {
            this._masterVol.volume.value = this.enabled ? -7 : -Infinity;
        }
        if (this._sfxGain) {
            this._sfxGain.gain.value = this.enabled ? this._sfxMaster : 0;
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
