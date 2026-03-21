/**
 * WAV 기반 SFX + Tone.js BGM 사운드 매니저
 * SFX: 사전 생성된 WAV 파일을 Audio 풀로 재생 (실시간 합성 오버헤드 없음)
 * BGM: Tone.js 프로시저럴 합성 유지 (인트로 음악, 게임 BGM)
 */
export class SoundManager {
    constructor() {
        this.enabled = true;
        this._initialized = false;
        this._lastPlayTime = {};
        this._throttleMs = {
            hit: 150, kill: 180, xp: 80, dagger: 150, daggerThrow: 120,
            slash: 200, authority: 200, fear: 250,
            playerHit: 250, system: 250, warning: 350,
        };
        this._activeSounds = 0;
        this._maxActiveSounds = 5;
        // WAV Audio pools
        this._pools = {};
    }

    // WAV 오디오 풀 생성 (동시 재생 지원, 라운드로빈)
    _createPool(name, src, poolSize = 4) {
        this._pools[name] = [];
        for (let i = 0; i < poolSize; i++) {
            const audio = new Audio(src);
            audio.preload = 'auto';
            this._pools[name].push(audio);
        }
        this._pools[name]._index = 0;
    }

    // WAV 풀에서 재생
    _playFromPool(name, volume = 0.7) {
        const pool = this._pools[name];
        if (!pool) return;
        const audio = pool[pool._index];
        pool._index = (pool._index + 1) % pool.length;
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }

    init() {
        try {
            if (typeof Tone === 'undefined') { this.enabled = false; return; }

            try {
                Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: 0.1 }));
            } catch (e) { /* silent */ }

            // === Tone.js BGM 전용 이펙트 체인 ===
            this._masterVol = new Tone.Volume(4).toDestination();
            this._chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.3, wet: 0.1 })
                .connect(this._masterVol).start();
            this._comp = new Tone.Compressor(-24, 4).connect(this._chorus);
            this._reverb = new Tone.Freeverb({ roomSize: 0.55, dampening: 3000, wet: 0.18 }).connect(this._comp);
            this._delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.2, wet: 0.12 }).connect(this._comp);

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
            this._createPool('warning', base + 'warning.wav', 4);
            this._createPool('potion', base + 'potion.wav', 3);
            this._createPool('select', base + 'select.wav', 6);
            this._createPool('quest', base + 'quest.wav', 3);
            this._createPool('dungeonBreak', base + 'dungeonBreak.wav', 2);

            this._initialized = true;

            // 탭 전환 시 자동 일시정지
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
        } catch (e) {
            console.warn('SoundManager init failed:', e);
            this.enabled = false;
        }
    }

    resume() {
        try {
            if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
                Tone.start();
            }
        } catch (e) { /* silent */ }
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
        dagger: 0.6, daggerThrow: 0.65, slash: 0.7, authority: 0.75, fear: 0.65,
        hit: 0.7, kill: 0.7, playerHit: 0.8,
        xp: 0.5, levelup: 0.8, rankup: 0.85,
        system: 0.6, arise: 0.85, bossAppear: 0.8,
        warning: 0.7, potion: 0.6, select: 0.5,
        quest: 0.7, dungeonBreak: 0.8,
    };

    play(soundName) {
        if (!this.enabled || !this._initialized) return;
        if (this._activeSounds >= this._maxActiveSounds) return;
        const now = performance.now();
        const cooldown = this._throttleMs[soundName] || 0;
        if (cooldown > 0) {
            const last = this._lastPlayTime[soundName] || 0;
            if (now - last < cooldown) return;
        }
        this._lastPlayTime[soundName] = now;
        this._activeSounds++;
        setTimeout(() => { this._activeSounds = Math.max(0, this._activeSounds - 1); }, 100);

        const vol = this._sfxVolume[soundName] || 0.7;
        this._playFromPool(soundName, vol);
    }

    // ========== INTRO MUSIC (Tone.js) ==========

    async playIntroMusic() {
        if (!this._initialized || !this.enabled) return;
        try { await Tone.start(); } catch (e) { /* */ }
        if (Tone.context.state !== 'running') return;
        this.stopIntroMusic();
        this._introNodes = [];
        this._introIntervals = [];

        try {
            const introGain = new Tone.Volume(-30).connect(this._comp);
            introGain.volume.rampTo(-10, 4);
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
                    percNoise.triggerAttackRelease('64n', Tone.now(), 0.15);
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
                    setTimeout(() => {
                        try { rOsc.dispose(); rFilter.dispose(); rVol.dispose(); } catch (e) { /* silent */ }
                    }, 3000);
                } catch (e) { /* silent */ }
            }, 8000);
            this._introIntervals.push(riserInterval);
        } catch (e) {
            console.warn('Intro music error:', e);
        }
    }

    stopIntroMusic() {
        if (this._introIntervals) {
            this._introIntervals.forEach(id => clearInterval(id));
            this._introIntervals = [];
        }
        if (this._introGain) {
            try { this._introGain.volume.rampTo(-60, 0.3); } catch (e) { /* silent */ }
        }
        const nodes = this._introNodes || [];
        const arpSynth = this._introArpSynth;
        const gain = this._introGain;
        this._introNodes = [];
        this._introArpSynth = null;
        this._introGain = null;
        setTimeout(() => {
            nodes.forEach(node => {
                try { if (node.stop) node.stop(); } catch (e) { /* silent */ }
                try { node.dispose(); } catch (e) { /* silent */ }
            });
            if (arpSynth) { try { arpSynth.dispose(); } catch (e) { /* silent */ } }
            if (gain) { try { gain.dispose(); } catch (e) { /* silent */ } }
        }, 400);
    }

    // ========== IN-GAME BGM (Tone.js) ==========

    async startGameBGM() {
        if (!this._initialized || !this.enabled) return;
        try { await Tone.start(); } catch (e) { /* */ }
        if (Tone.context.state !== 'running') return;
        this.stopGameBGM();
        this._bgmNodes = [];
        this._bgmIntervals = [];

        try {
            const bgmGain = new Tone.Volume(-60).connect(this._comp);
            bgmGain.volume.rampTo(-10, 1.5);
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
                    const hatVol = new Tone.Volume(-24);
                    hatNoise.connect(hatFilter);
                    hatFilter.connect(hatVol);
                    hatVol.connect(bgmGain);
                    this._bgmNodes.push(hatNoise, hatFilter, hatVol);

                    let hatIdx = 0;
                    const hatPattern = [0.3, 0.1, 0.2, 0.1];
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

    stopGameBGM() {
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
            try {
                this._bgmGain.volume.rampTo(-60, 0.5);
                setTimeout(() => {
                    try { this._bgmGain.dispose(); } catch (e) { /* silent */ }
                }, 600);
            } catch (e) { /* silent */ }
            this._bgmGain = null;
        }
    }

    toggleSound() {
        this.enabled = !this.enabled;
        if (this._masterVol) {
            this._masterVol.volume.value = this.enabled ? 4 : -Infinity;
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
