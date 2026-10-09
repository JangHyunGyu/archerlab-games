class SoundManager {
    constructor() {
        let storedSound = null;
        try { storedSound = localStorage.getItem('blockpang_sound_enabled'); } catch (_) {}
        this.enabled = storedSound !== '0';
        this.volume = 1;
        this._initialized = false;
        this._masterSum = null;
        this._outputGain = null;
        this._sfxContext = null;
        this._pageHidden = false;
        this._settleToken = 0;
        this._contextWatcher = null;

        // Synth references (created in init)
        this._membrane = null;
        this._bass = null;
        this._click = null;
        this._bell = null;
        this._poly = null;
        this._fm = null;
        this._am = null;
        this._metal = null;
        this._noise = null;
        this._sweep = null;

        // Effects
        this._reverb = null;
        this._compressor = null;
        this._limiter = null;

        // WAV audio pools (HTMLAudioElement fallback) + decoded AudioBuffers (preferred)
        this._wavPools = {};
        this._wavBuffers = {};
        this._pendingTimeouts = new Set();
        this._destroyed = false;

        // A suspended DynamicsCompressor comes back with a stuck envelope and
        // crackles until it is replaced. Hide the output, then rebuild the limiter.
        this._visibilityHandler = () => {
            if (this._destroyed) return;
            this._settleToken += 1;
            if (document.hidden) {
                this._pageHidden = true;
                this._ambientWasRunning = !!this._ambientLoop;
                this.stopAmbient();
                try {
                    if (typeof Tone !== 'undefined' && Tone.Transport) Tone.Transport.pause();
                } catch (_) { /* transport may not be started */ }
                if (this._outputGain) this._outputGain.gain.value = 0;
                this._suspendContext();
                return;
            }
            this._pageHidden = false;
            this._settleAfterShow();
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);
        if (typeof Tone !== 'undefined' && Tone.Destination) {
            Tone.Destination.mute = true;
        }
    }

    _createLimiter(ctx) {
        const limiter = ctx.createDynamicsCompressor();
        // Safety ceiling only. The old -20 dB / 8:1 compressor rode the reverb
        // floor and turned every stacked hit into crackle.
        limiter.threshold.value = -1.5;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.05;
        return limiter;
    }

    _ensureMasterBus() {
        if (this._masterSum) return;
        const ctx = this._getAudioContext();
        if (!ctx || !ctx.createGain) return;
        this._sfxContext = ctx;
        this._masterSum = ctx.createGain();
        this._masterSum.gain.value = 1;
        this._outputGain = ctx.createGain();
        this._outputGain.gain.value = 0;
        this._limiter = this._createLimiter(ctx);
        this._masterSum.connect(this._limiter);
        this._limiter.connect(this._outputGain);
        this._outputGain.connect(ctx.destination);
        if (!this._contextWatcher) {
            this._contextWatcher = () => {
                if (!this._sfxContext) return;
                if (this._sfxContext.state !== 'running' && this._outputGain) {
                    this._outputGain.gain.value = 0;
                }
            };
            ctx.addEventListener('statechange', this._contextWatcher);
        }
        if (ctx.state === 'running' && this.enabled && !this._pageHidden) {
            this._outputGain.gain.value = 0.72;
        }
    }

    _rebuildLimiter() {
        const ctx = this._sfxContext;
        if (!ctx || !this._masterSum || !this._outputGain) return;
        const previous = this._limiter;
        try { this._masterSum.disconnect(); } catch (_) { /* already open */ }
        if (previous) {
            try { previous.disconnect(); } catch (_) { /* already open */ }
        }
        this._limiter = this._createLimiter(ctx);
        this._masterSum.connect(this._limiter);
        this._limiter.connect(this._outputGain);
    }

    _suspendContext() {
        const ctx = this._sfxContext || this._getAudioContext();
        if (!ctx || typeof ctx.suspend !== 'function' || ctx.state === 'suspended') return;
        const suspended = ctx.suspend();
        if (suspended && typeof suspended.catch === 'function') suspended.catch(() => {});
    }

    _openOutput(rebuild) {
        if (this._destroyed || this._pageHidden || !this.enabled) return;
        if (rebuild) this._rebuildLimiter();
        const ctx = this._sfxContext;
        if (!this._outputGain || !ctx || ctx.state !== 'running') return;
        // Assign the value directly. A ramp never reaches its target when the
        // audio clock is still at 0, which leaves the whole game silent.
        try { this._outputGain.gain.cancelScheduledValues(ctx.currentTime || 0); } catch (_) { /* no events yet */ }
        this._outputGain.gain.value = 0.72;
    }

    async _settleAfterShow() {
        if (this._pageHidden || !this.enabled || this._destroyed) return;
        const token = this._settleToken;
        if (this._outputGain) this._outputGain.gain.value = 0;
        try {
            if (typeof Tone !== 'undefined') {
                const started = Tone.start();
                if (started && typeof started.catch === 'function') await started.catch(() => {});
            }
            const raw = this._getAudioContext();
            if (raw && raw.state !== 'running' && typeof raw.resume === 'function') {
                await raw.resume().catch(() => {});
            }
        } catch (_) { /* resume can fail without a gesture */ }
        if (token !== this._settleToken || this._pageHidden || this._destroyed) return;
        this._ensureMasterBus();
        this._openOutput(true);
        if (this._ambientWasRunning && this.enabled && !this._destroyed && !this._pageHidden) {
            this._ambientWasRunning = false;
            this.startAmbient();
        }
    }

    // ── WAV Audio Pool System ─────────────────────────────────────

    _createPool(name, src, poolSize = 4) {
        // HTMLAudioElement pool serves as fallback until Web Audio decode completes
        this._wavPools[name] = [];
        for (let i = 0; i < poolSize; i++) {
            const audio = new Audio(src);
            audio.preload = 'auto';
            this._wavPools[name].push(audio);
        }
        this._wavPools[name]._index = 0;

        // Preferred path: pre-decode once, play via AudioBufferSourceNode (avoids
        // mobile HTMLAudio state bugs that surface NotSupportedError on rapid reuse)
        this._decodeWavBuffer(name, src);
    }

    _getAudioContext() {
        if (typeof Tone === 'undefined') return null;
        try {
            const ctx = Tone.getContext ? Tone.getContext() : Tone.context;
            return (ctx && ctx.rawContext) || ctx || null;
        } catch (e) { return null; }
    }

    _decodeWavBuffer(name, src) {
        const ctx = this._getAudioContext();
        if (!ctx || !ctx.decodeAudioData) return;
        fetch(src)
            .then((r) => r.arrayBuffer())
            .then((buf) => ctx.decodeAudioData(buf))
            .then((audioBuffer) => {
                if (!this._destroyed) this._wavBuffers[name] = audioBuffer;
            })
            .catch(() => { /* fall back to HTMLAudio pool */ });
    }

    _playWav(name, volumeMultiplier = 1) {
        if (!this.enabled) return;
        // Several layers play together. Keep each one under the shared limiter
        // instead of summing full-scale buffers straight into the speakers.
        const volume = Math.max(0, Math.min(0.4, 0.32 * volumeMultiplier));

        const buffer = this._wavBuffers[name];
        const ctx = this._getAudioContext();
        if (buffer && ctx) {
            try {
                this._ensureMasterBus();
                const src = ctx.createBufferSource();
                src.buffer = buffer;
                const gain = ctx.createGain();
                gain.gain.value = volume;
                src.connect(gain).connect(this._masterSum || ctx.destination);
                src.onended = () => {
                    try { src.disconnect(); } catch (_) {}
                    try { gain.disconnect(); } catch (_) {}
                };
                src.start(0);
                return;
            } catch (e) { /* fall through to HTMLAudio */ }
        }

        const pool = this._wavPools[name];
        if (!pool) return;
        const audio = pool[pool._index];
        pool._index = (pool._index + 1) % pool.length;
        if (!audio.paused) audio.pause();
        audio.volume = volume;
        audio.currentTime = 0;
        const p = audio.play();
        if (p && p.catch) {
            p.catch((e) => {
                if (e.name === 'NotAllowedError') {
                    this._needsUserGesture = true;
                } else if (e.name === 'AbortError' || e.name === 'NotSupportedError') {
                    // 모바일 브라우저에서 빠른 재사용 시 발생 — 다음 호출은 Web Audio 경로로 처리됨
                } else {
                    if (window._sendGameError) window._sendGameError('WavPlayError', name + ': ' + (e.message || String(e)), '', 'SoundManager.js:_playWav');
                }
            });
        }
    }

    // ── Initialization ──────────────────────────────────────────────

    init() {
        if (this._initialized) return;

        // Load WAV audio pools
        const soundBase = 'sounds/';
        this._createPool('block_break', soundBase + 'block_break.wav', 3);
        this._createPool('glass_shatter', soundBase + 'glass_shatter.wav', 2);
        this._createPool('combo_hit', soundBase + 'combo_hit.wav', 2);
        this._createPool('combo_escalate', soundBase + 'combo_escalate.wav', 2);
        this._createPool('clear_single', soundBase + 'clear_single.wav', 2);
        this._createPool('clear_double', soundBase + 'clear_double.wav', 2);
        this._createPool('clear_triple', soundBase + 'clear_triple.wav', 2);
        this._createPool('clear_quad', soundBase + 'clear_quad.wav', 2);
        this._createPool('impact_heavy', soundBase + 'impact_heavy.wav', 2);
        this._createPool('sparkle', soundBase + 'sparkle.wav', 2);
        this._createPool('whoosh', soundBase + 'whoosh.wav', 2);
        this._createPool('place', soundBase + 'place.wav', 2);
        this._createPool('pickup', soundBase + 'pickup.wav', 2);

        if (typeof Tone === 'undefined') {
            console.warn('SoundManager: Tone.js not loaded, using WAV-only mode.');
            this._initialized = true;
            return;
        }

        try {
            this._ensureMasterBus();
            // Synths sum into the same limiter as the WAVs. Tone.Destination
            // stays muted so nothing is boosted past the ceiling.
            if (Tone.Destination) {
                Tone.Destination.volume.value = 0;
                Tone.Destination.mute = true;
            }
            const sink = this._masterSum || Tone.Destination;

            // ── Effects chain ──
            this._compressor = null;

            this._reverb = new Tone.Reverb({
                decay: 1.2,
                wet: 0.1,
                preDelay: 0.01
            }).connect(sink);

            // Generate the reverb impulse response immediately
            this._reverb.generate();

            // Dry path (no reverb)
            this._dryChannel = new Tone.Channel({ volume: -3 }).connect(sink);

            // Wet path (with reverb)
            this._wetChannel = new Tone.Channel({ volume: -8 }).connect(this._reverb);

            // ── Synths ──

            // MembraneSynth: Deep bass thumps and impacts
            this._membrane = new Tone.MembraneSynth({
                pitchDecay: 0.06,
                octaves: 4,
                oscillator: { type: 'sine' },
                envelope: {
                    attack: 0.001,
                    decay: 0.15,
                    sustain: 0,
                    release: 0.08
                }
            }).connect(this._dryChannel);

            // Bass Synth: Sub-bass and low-end foundation
            this._bass = new Tone.MonoSynth({
                oscillator: { type: 'sine' },
                filter: { type: 'lowpass', frequency: 800, Q: 1 },
                envelope: {
                    attack: 0.005,
                    decay: 0.2,
                    sustain: 0.3,
                    release: 0.3
                },
                filterEnvelope: {
                    attack: 0.005,
                    decay: 0.15,
                    sustain: 0.2,
                    release: 0.2,
                    baseFrequency: 80,
                    octaves: 2
                }
            }).connect(this._wetChannel);
            this._bass.volume.value = -6;

            // Click Synth: Short percussive clicks and pops
            this._click = new Tone.Synth({
                oscillator: { type: 'triangle' },
                envelope: {
                    attack: 0.001,
                    decay: 0.015,
                    sustain: 0.05,
                    release: 0.02
                }
            }).connect(this._wetChannel);
            this._click.volume.value = -8;

            // Bell Synth: Crystalline melodic tones
            this._bell = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: {
                    attack: 0.002,
                    decay: 0.08,
                    sustain: 0.35,
                    release: 0.4
                }
            }).connect(this._wetChannel);
            this._bell.volume.value = -8;

            // PolySynth: Chords and arpeggios
            this._poly = new Tone.PolySynth(Tone.Synth, {
                maxPolyphony: 12,
                oscillator: { type: 'sine' },
                envelope: {
                    attack: 0.005,
                    decay: 0.1,
                    sustain: 0.4,
                    release: 0.4
                }
            }).connect(this._wetChannel);
            this._poly.volume.value = -10;

            // FMSynth: Rich harmonic tones, power chords
            this._fm = new Tone.FMSynth({
                harmonicity: 3,
                modulationIndex: 10,
                oscillator: { type: 'sine' },
                envelope: {
                    attack: 0.003,
                    decay: 0.15,
                    sustain: 0.3,
                    release: 0.25
                },
                modulation: { type: 'sine' },
                modulationEnvelope: {
                    attack: 0.005,
                    decay: 0.2,
                    sustain: 0.3,
                    release: 0.2
                }
            }).connect(this._wetChannel);
            this._fm.volume.value = -12;

            // AMSynth: Tremolo-rich tones for atmosphere
            this._am = new Tone.AMSynth({
                harmonicity: 2,
                oscillator: { type: 'sine' },
                envelope: {
                    attack: 0.01,
                    decay: 0.2,
                    sustain: 0.3,
                    release: 0.5
                },
                modulation: { type: 'sine' },
                modulationEnvelope: {
                    attack: 0.02,
                    decay: 0.3,
                    sustain: 0.3,
                    release: 0.4
                }
            }).connect(this._wetChannel);
            this._am.volume.value = -10;

            // MetalSynth: Metallic percussion, shimmers, impacts
            this._metal = new Tone.MetalSynth({
                frequency: 200,
                envelope: {
                    attack: 0.001,
                    decay: 0.1,
                    release: 0.05
                },
                harmonicity: 5.1,
                modulationIndex: 16,
                resonance: 4000,
                octaves: 1.5
            }).connect(this._wetChannel);
            this._metal.volume.value = -20;

            // NoiseSynth: Noise bursts for texture
            this._noise = new Tone.NoiseSynth({
                noise: { type: 'pink' },
                envelope: {
                    attack: 0.002,
                    decay: 0.12,
                    sustain: 0,
                    release: 0.05
                }
            }).connect(this._wetChannel);
            this._noise.volume.value = -18;

            // Sweep Synth: Filter sweeps, whooshes
            this._sweep = new Tone.MonoSynth({
                oscillator: { type: 'sawtooth' },
                filter: { type: 'lowpass', frequency: 300, rolloff: -24, Q: 3 },
                envelope: {
                    attack: 0.005,
                    decay: 0.15,
                    sustain: 0.15,
                    release: 0.15
                },
                filterEnvelope: {
                    attack: 0.01,
                    decay: 0.2,
                    sustain: 0.1,
                    release: 0.15,
                    baseFrequency: 200,
                    octaves: 4
                }
            }).connect(this._wetChannel);
            this._sweep.volume.value = -16;

            // Patch all synths to silently handle Tone.js scheduling conflicts
            this._patchSynths();

            this._initialized = true;
        } catch (e) {
            if (window._sendGameError) window._sendGameError('SoundInitError', e.message || String(e), e.stack || '', 'SoundManager.js:init');
            this._initialized = true; // Still allow WAV playback
        }
    }

    /**
     * Wrap triggerAttackRelease on all synths to prevent uncaught
     * "Start time must be strictly greater than previous start time" errors.
     * These occur when multiple game events trigger the same synth in rapid succession.
     */
    _patchSynths() {
        const synths = [this._membrane, this._bass, this._click, this._bell,
                        this._poly, this._fm, this._am, this._metal, this._sweep];
        for (const synth of synths) {
            if (!synth || !synth.triggerAttackRelease) continue;
            const orig = synth.triggerAttackRelease.bind(synth);
            synth.triggerAttackRelease = (...args) => {
                try { return orig(...args); } catch (e) { /* timing conflict */ }
            };
        }
        // Also patch NoiseSynth (same method name)
        if (this._noise && this._noise.triggerAttackRelease) {
            const origNoise = this._noise.triggerAttackRelease.bind(this._noise);
            this._noise.triggerAttackRelease = (...args) => {
                try { return origNoise(...args); } catch (e) { /* timing conflict */ }
            };
        }
    }

    ensureContext() {
        if (!this._initialized) {
            this.init();
        }
        const raw = this._getAudioContext();
        const wasRunning = !!(raw && raw.state === 'running');
        if (typeof Tone !== 'undefined') {
            const started = Tone.start();
            if (started && typeof started.catch === 'function') started.catch(() => {});
            if (raw && raw.state !== 'running' && typeof raw.resume === 'function') {
                raw.resume().then(() => this._openOutput(true)).catch(() => {});
            } else if (wasRunning) {
                this._openOutput(false);
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    _canPlay() {
        return this.enabled && this._initialized;
    }

    _hasTone() {
        return this._canPlay() && this._membrane !== null;
    }

    /**
     * Schedule a callback at an offset from "now" (in seconds).
     */
    _at(offsetSec, fn) {
        if (offsetSec <= 0.005) {
            if (this._destroyed) return;
            try { fn(); } catch (e) { /* Tone scheduling drift */ }
        } else {
            const ms = offsetSec * 1000;
            let id = null;
            id = setTimeout(() => {
                this._pendingTimeouts.delete(id);
                if (this._destroyed) return;
                try { fn(); } catch (e) { /* Tone scheduling drift */ }
            }, ms);
            this._pendingTimeouts.add(id);
        }
    }

    /**
     * Returns a safe time for Tone.js scheduling (never in the past).
     */
    _safeTime(time) {
        return Math.max(time, Tone.now());
    }

    // ── PLACE: Heavy satisfying THUMP + crystalline click ──────────

    playPlace() {
        if (!this._canPlay()) return;
        this.ensureContext();

        // WAV place sound - punchy and satisfying
        this._playWav('place', 0.9);

        if (!this._hasTone()) return;
        const now = Tone.now();

        // Harmonic pop (satisfying "lock-in" tone)
        this._bell.envelope.attack = 0.001;
        this._bell.envelope.decay = 0.04;
        this._bell.envelope.sustain = 0.25;
        this._bell.envelope.release = 0.15;
        this._bell.volume.value = -10;
        this._bell.triggerAttackRelease('G5', 0.1, now + 0.01);

        // Upper sparkle
        this._at(0.018, () => {
            this._bell.volume.value = -14;
            this._bell.triggerAttackRelease('E6', 0.08, this._safeTime(now + 0.018));
        });
    }

    // ── LINE CLEAR: WAV-based clears + Tone.js melodic layers ────

    playClear(lineCount) {
        if (!this._canPlay()) return;
        this.ensureContext();
        try { this._playClearInner(lineCount); } catch (e) { if (window._sendGameError) window._sendGameError('SoundError', 'playClear: ' + (e.message || String(e)), '', 'SoundManager.js'); }
    }

    _playClearInner(lineCount) {
        const now = this._hasTone() ? Tone.now() : 0;
        const clampLines = Math.min(Math.max(lineCount, 1), 4);

        // ── WAV layer: matching clear sound ──
        if (clampLines === 1) {
            this._playWav('clear_single', 0.8);
            this._playWav('block_break', 0.5);
        } else if (clampLines === 2) {
            this._playWav('clear_double', 0.85);
            this._playWav('glass_shatter', 0.4);
            this._playWav('impact_heavy', 0.5);
        } else if (clampLines === 3) {
            this._playWav('clear_triple', 0.9);
            this._playWav('glass_shatter', 0.6);
            this._playWav('impact_heavy', 0.7);
        } else {
            this._playWav('clear_quad', 1.0);
            this._playWav('glass_shatter', 0.8);
            this._playWav('impact_heavy', 0.9);
            this._playWav('whoosh', 0.5);
        }

        if (!this._hasTone()) return;

        // ── Tone.js melodic layers (kept for sparkle/shimmer) ──

        // ── 1줄: 깔끔한 "딩" ──
        if (clampLines === 1) {
            const notes = ['C5', 'E5', 'G5'];
            notes.forEach((note, i) => {
                this._at(i * 0.05, () => {
                    this._bell.envelope.attack = 0.002;
                    this._bell.envelope.decay = 0.06;
                    this._bell.envelope.sustain = 0.3;
                    this._bell.envelope.release = 0.2;
                    this._bell.volume.value = -8;
                    this._bell.triggerAttackRelease(note, 0.25, this._safeTime(now + i * 0.05));
                });
            });
        }

        // ── 2줄: 풍성한 코드 + 스윕 ──
        else if (clampLines === 2) {
            const notes = ['C5', 'E5', 'G5', 'C6'];
            notes.forEach((note, i) => {
                this._at(i * 0.045, () => {
                    this._bell.envelope.attack = 0.002;
                    this._bell.envelope.decay = 0.08;
                    this._bell.envelope.sustain = 0.4;
                    this._bell.envelope.release = 0.3;
                    this._bell.volume.value = -7;
                    this._bell.triggerAttackRelease(note, 0.3, this._safeTime(now + i * 0.045));
                });
            });

            // Chord layer
            this._at(0.03, () => {
                this._poly.volume.value = -12;
                this._poly.triggerAttackRelease(['C5', 'E5', 'G5'], 0.3, this._safeTime(now + 0.03));
            });

            // FM shimmer
            this._at(0.12, () => {
                this._fm.harmonicity.value = 3;
                this._fm.modulationIndex.value = 5;
                this._fm.volume.value = -15;
                this._fm.triggerAttackRelease('C6', 0.2, this._safeTime(now + 0.12));
            });
        }

        // ── 3줄: 파워풀 아르페지오 + 더블 히트 ──
        else if (clampLines === 3) {
            const notes = ['C5', 'E5', 'G5', 'B5', 'D6', 'E6'];
            notes.forEach((note, i) => {
                this._at(i * 0.04, () => {
                    this._bell.envelope.attack = 0.001;
                    this._bell.envelope.decay = 0.1;
                    this._bell.envelope.sustain = 0.5;
                    this._bell.envelope.release = 0.4;
                    this._bell.volume.value = -6;
                    this._bell.triggerAttackRelease(note, 0.35, this._safeTime(now + i * 0.04));
                });
            });

            // Power chord
            this._at(0.02, () => {
                this._poly.volume.value = -10;
                this._poly.triggerAttackRelease(['C5', 'E5', 'G5', 'B5'], 0.35, this._safeTime(now + 0.02));
            });

            // FM shimmer
            this._at(0.1, () => {
                this._fm.harmonicity.value = 4;
                this._fm.modulationIndex.value = 8;
                this._fm.volume.value = -12;
                this._fm.triggerAttackRelease('D6', 0.3, this._safeTime(now + 0.1));
            });
        }

        // ── 4줄+: 유포릭 폭발! ──
        else {
            const notes = ['C5', 'E5', 'G5', 'B5', 'D6', 'E6', 'G6'];
            notes.forEach((note, i) => {
                this._at(i * 0.035, () => {
                    this._bell.envelope.attack = 0.001;
                    this._bell.envelope.decay = 0.12;
                    this._bell.envelope.sustain = 0.6;
                    this._bell.envelope.release = 0.5;
                    this._bell.volume.value = -5;
                    this._bell.triggerAttackRelease(note, 0.4, this._safeTime(now + i * 0.035));
                });
            });

            // Massive chord
            this._at(0.02, () => {
                this._poly.volume.value = -8;
                this._poly.triggerAttackRelease(['C5', 'E5', 'G5', 'B5', 'D6'], 0.45, this._safeTime(now + 0.02));
            });

            // Dual FM shimmer
            this._at(0.08, () => {
                this._fm.harmonicity.value = 5;
                this._fm.modulationIndex.value = 12;
                this._fm.volume.value = -10;
                this._fm.triggerAttackRelease('E6', 0.35, this._safeTime(now + 0.08));
            });
            this._at(0.15, () => {
                this._fm.harmonicity.value = 3;
                this._fm.modulationIndex.value = 8;
                this._fm.volume.value = -12;
                this._fm.triggerAttackRelease('G6', 0.3, this._safeTime(now + 0.15));
            });

            // AM shimmer tail
            this._at(0.1, () => {
                this._am.harmonicity.value = 2;
                this._am.volume.value = -16;
                this._am.triggerAttackRelease('C6', 0.4, this._safeTime(now + 0.1));
            });
        }
    }

    // ── COMBO: Escalating power chord + WAV layers ──────────────

    playCombo(level) {
        if (!this._canPlay()) return;
        this.ensureContext();
        try { this._playComboInner(level); } catch (e) { if (window._sendGameError) window._sendGameError('SoundError', 'playCombo: ' + (e.message || String(e)), '', 'SoundManager.js'); }
    }

    _playComboInner(level) {
        const now = this._hasTone() ? Tone.now() : 0;
        const clampLevel = Math.min(level, 8);

        // ── WAV layers: escalating with combo level ──
        this._playWav('combo_hit', 0.5 + clampLevel * 0.06);
        this._playWav('impact_heavy', 0.3 + clampLevel * 0.05);

        if (clampLevel >= 3) {
            this._playWav('whoosh', 0.3 + clampLevel * 0.04);
        }
        if (clampLevel >= 4) {
            this._playWav('glass_shatter', 0.3 + clampLevel * 0.05);
        }
        if (clampLevel >= 6) {
            this._playWav('combo_escalate', 0.6 + clampLevel * 0.05);
            this._playWav('glass_shatter', 0.5);
        }

        if (!this._hasTone()) return;

        // Base note rises with combo level
        const semitonesUp = clampLevel - 2;
        const baseFreq = 440 * Math.pow(2, semitonesUp / 12);
        const baseNote = Tone.Frequency(baseFreq, 'hz').toNote();
        const fifthFreq = baseFreq * 1.5;
        const fifthNote = Tone.Frequency(fifthFreq, 'hz').toNote();
        const octaveFreq = baseFreq * 2;
        const octaveNote = Tone.Frequency(octaveFreq, 'hz').toNote();

        // Power chord via PolySynth
        this._poly.set({
            oscillator: { type: 'sine' },
            envelope: {
                attack: 0.003,
                decay: 0.1,
                sustain: 0.45,
                release: 0.2
            }
        });
        this._poly.volume.value = -8;
        this._poly.triggerAttackRelease([baseNote, fifthNote, octaveNote], 0.3, now);

        // FM layer for grit/harmonics
        this._fm.harmonicity.value = 2 + clampLevel * 0.3;
        this._fm.modulationIndex.value = 6 + clampLevel * 2;
        this._fm.volume.value = -14 + clampLevel * 0.5;
        this._fm.triggerAttackRelease(baseNote, 0.25, this._safeTime(now + 0.01));

        // High combos: AM layer
        if (clampLevel >= 4) {
            this._am.harmonicity.value = 2 + clampLevel * 0.2;
            this._am.volume.value = -16 + clampLevel * 0.5;
            this._am.triggerAttackRelease(octaveNote, 0.2, this._safeTime(now + 0.02));
        }

        // High combos: distortion overtone
        if (clampLevel >= 6) {
            const highHarmonic = Tone.Frequency(baseFreq * 3, 'hz').toNote();
            this._at(0.015, () => {
                this._click.oscillator.type = 'square';
                this._click.envelope.decay = 0.03;
                this._click.volume.value = -18 + clampLevel;
                this._click.triggerAttackRelease(highHarmonic, 0.06, this._safeTime(now + 0.015));
            });
        }
    }

    // ── GAME OVER: Dramatic descending progression ─────────────────

    playGameOver() {
        if (!this._canPlay()) return;
        this.ensureContext();

        if (!this._hasTone()) return;
        const now = Tone.now();

        // Descending minor chord progression
        const progression = [
            { notes: ['A4', 'C5', 'E5'], delay: 0 },
            { notes: ['G4', 'Bb4', 'D5'], delay: 0.3 },
            { notes: ['F4', 'Ab4', 'C5'], delay: 0.6 },
            { notes: ['D4', 'F4', 'A4'], delay: 0.9 },
            { notes: ['A3', 'C4', 'E4'], delay: 1.2 }
        ];

        progression.forEach(({ notes, delay }) => {
            this._at(delay, () => {
                const t = this._safeTime(now + delay);

                this._poly.set({
                    oscillator: { type: 'sine' },
                    envelope: {
                        attack: 0.02,
                        decay: 0.25,
                        sustain: 0.3,
                        release: 0.35
                    }
                });
                this._poly.volume.value = -10;
                this._poly.triggerAttackRelease(notes, 0.55, t);

                this._am.harmonicity.value = 1.5;
                this._am.volume.value = -14;
                this._am.triggerAttackRelease(notes[0], 0.6, t + 0.01);
            });
        });

        // Heavy sub bass
        const bassNotes = ['A1', 'G1', 'F1', 'D1', 'A0'];
        bassNotes.forEach((note, i) => {
            const delay = i * 0.3;
            this._at(delay, () => {
                this._bass.envelope.attack = 0.03;
                this._bass.envelope.decay = 0.3;
                this._bass.envelope.sustain = 0.2;
                this._bass.envelope.release = 0.35;
                this._bass.volume.value = -10;
                this._bass.triggerAttackRelease(note, 0.7, this._safeTime(now + delay));
            });
        });

        // Ominous final low rumble
        this._at(1.4, () => {
            this._membrane.octaves = 6;
            this._membrane.pitchDecay = 0.3;
            this._membrane.envelope.decay = 1.5;
            this._membrane.envelope.release = 0.8;
            this._membrane.volume.value = -6;
            this._membrane.triggerAttackRelease('F0', 1.8, this._safeTime(now + 1.4));
        });

        // FM dark rumble tail
        this._at(1.5, () => {
            this._fm.harmonicity.value = 1.5;
            this._fm.modulationIndex.value = 20;
            this._fm.volume.value = -14;
            this._fm.triggerAttackRelease('A0', 1.5, this._safeTime(now + 1.5));
        });

        // Noise tail
        this._at(1.2, () => {
            this._noise.noise.type = 'brown';
            this._noise.envelope.attack = 0.1;
            this._noise.envelope.decay = 1.2;
            this._noise.volume.value = -18;
            this._noise.triggerAttackRelease(1.5, this._safeTime(now + 1.2));
        });
    }

    // ── INVALID: Short punchy rejection buzz ───────────────────────

    playInvalid() {
        if (!this._canPlay()) return;
        this.ensureContext();

        if (!this._hasTone()) return;
        const now = Tone.now();

        // Swoosh down
        this._fm.harmonicity.value = 3;
        this._fm.modulationIndex.value = 8;
        this._fm.volume.value = -14;
        this._fm.triggerAttackRelease('A4', 0.12, now);
        this._fm.frequency.setValueAtTime(Tone.Frequency('A4').toFrequency(), now);
        this._fm.frequency.exponentialRampToValueAtTime(
            Tone.Frequency('D3').toFrequency(), now + 0.12
        );

        // Soft rubber bonk
        this._membrane.octaves = 5;
        this._membrane.pitchDecay = 0.08;
        this._membrane.envelope.decay = 0.12;
        this._membrane.volume.value = -6;
        this._membrane.triggerAttackRelease('G1', '16n', now + 0.06);

        // Gentle tonal bounce
        this._click.oscillator.type = 'triangle';
        this._click.envelope.attack = 0.001;
        this._click.envelope.decay = 0.04;
        this._click.envelope.sustain = 0.05;
        this._click.envelope.release = 0.03;
        this._click.volume.value = -10;
        this._click.triggerAttackRelease('E4', 0.04, now + 0.08);

        this._at(0.13, () => {
            this._bell.oscillator.type = 'sine';
            this._bell.envelope.decay = 0.06;
            this._bell.envelope.release = 0.08;
            this._bell.volume.value = -14;
            this._bell.triggerAttackRelease('B3', 0.05, this._safeTime(now + 0.13));
        });

        // Soft air puff
        this._noise.noise.type = 'pink';
        this._noise.envelope.attack = 0.005;
        this._noise.envelope.decay = 0.06;
        this._noise.volume.value = -24;
        this._noise.triggerAttackRelease('32n', now + 0.02);
    }

    // ── PICKUP: Snappy satisfying click-pop ─────────────────────────

    playPickup() {
        if (!this._canPlay()) return;
        this.ensureContext();

        // WAV glass bottle clink
        this._playWav('pickup', 0.6);

        if (!this._hasTone()) return;
        const now = Tone.now();

        // Soft low pop
        this._click.oscillator.type = 'sine';
        this._click.envelope.attack = 0.001;
        this._click.envelope.decay = 0.025;
        this._click.envelope.sustain = 0.05;
        this._click.envelope.release = 0.02;
        this._click.volume.value = -10;
        this._click.triggerAttackRelease('G3', 0.04, now);

        // Warm mid accent (no high sparkle)
        this._bell.envelope.decay = 0.02;
        this._bell.envelope.release = 0.02;
        this._bell.volume.value = -18;
        this._bell.triggerAttackRelease('C4', 0.03, now + 0.01);

        // Sub bump
        this._membrane.octaves = 2;
        this._membrane.pitchDecay = 0.02;
        this._membrane.envelope.decay = 0.04;
        this._membrane.volume.value = -8;
        this._membrane.triggerAttackRelease('C2', '64n', now);
    }

    // ── LEVEL UP: Triumphant fanfare with punch ─────────────────────

    playLevelUp() {
        if (!this._canPlay()) return;
        this.ensureContext();

        // WAV layers
        this._playWav('clear_quad', 0.7);
        this._playWav('sparkle', 0.6);
        this._playWav('impact_heavy', 0.6);

        if (!this._hasTone()) return;
        const now = Tone.now();

        // Impact hit
        this._membrane.octaves = 5;
        this._membrane.pitchDecay = 0.06;
        this._membrane.envelope.decay = 0.1;
        this._membrane.envelope.release = 0.06;
        this._membrane.volume.value = -4;
        this._membrane.triggerAttackRelease('C1', '8n', now);

        // Fanfare arpeggio
        const fanfare = ['C5', 'E5', 'G5', 'C6', 'E6'];
        fanfare.forEach((note, i) => {
            const t = 0.05 + i * 0.07;
            this._at(t, () => {
                const st = this._safeTime(now + t);
                this._bell.envelope.attack = 0.003;
                this._bell.envelope.decay = 0.1;
                this._bell.envelope.sustain = 0.45;
                this._bell.envelope.release = 0.25;
                this._bell.volume.value = -8;
                this._bell.triggerAttackRelease(note, 0.3, st);

                this._fm.harmonicity.value = 3;
                this._fm.modulationIndex.value = 4;
                this._fm.volume.value = -18;
                this._fm.triggerAttackRelease(note, 0.2, st + 0.01);
            });
        });

        // Grand resolving chord
        const resolveDelay = fanfare.length * 0.07 + 0.05;
        this._at(resolveDelay, () => {
            const st = this._safeTime(now + resolveDelay);
            this._poly.set({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.008, decay: 0.25, sustain: 0.4, release: 0.5 }
            });
            this._poly.volume.value = -8;
            this._poly.triggerAttackRelease(['C6', 'E6', 'G6'], 0.8, st);

            this._am.harmonicity.value = 2;
            this._am.volume.value = -12;
            this._am.triggerAttackRelease('C6', 0.7, st + 0.01);
        });

        // Bass foundation
        this._bass.envelope.attack = 0.008;
        this._bass.envelope.decay = 0.2;
        this._bass.envelope.sustain = 0.25;
        this._bass.envelope.release = 0.25;
        this._bass.volume.value = -8;
        this._bass.triggerAttackRelease('C2', 0.45, now);
    }

    // ── PERFECT CLEAR: Magical euphoric celebration ─────────────────

    playPerfectClear() {
        if (!this._canPlay()) return;
        this.ensureContext();

        // WAV layers
        this._playWav('clear_quad', 1.0);
        this._playWav('glass_shatter', 0.8);
        this._playWav('impact_heavy', 0.9);
        this._playWav('combo_escalate', 0.7);
        this._playWav('sparkle', 0.8);

        if (!this._hasTone()) return;
        const now = Tone.now();

        // Massive impact
        this._membrane.octaves = 6;
        this._membrane.pitchDecay = 0.08;
        this._membrane.envelope.decay = 0.12;
        this._membrane.envelope.release = 0.08;
        this._membrane.volume.value = -2;
        this._membrane.triggerAttackRelease('B0', '8n', now);

        // Sparkling ascending scale
        const scale = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6', 'G6', 'A6'];
        const noteSpacing = 0.045;

        scale.forEach((note, i) => {
            const t = 0.05 + i * noteSpacing;
            this._at(t, () => {
                this._bell.envelope.attack = 0.002;
                this._bell.envelope.decay = 0.07;
                this._bell.envelope.sustain = 0.3;
                this._bell.envelope.release = 0.25;
                this._bell.volume.value = -9;
                this._bell.triggerAttackRelease(note, 0.4 - i * 0.018, this._safeTime(now + t));
            });
        });

        // Grand finale chord
        const finaleDelay = 0.05 + scale.length * noteSpacing;
        this._at(finaleDelay, () => {
            const st = this._safeTime(now + finaleDelay);
            this._poly.set({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.35, sustain: 0.35, release: 0.8 }
            });
            this._poly.volume.value = -8;
            this._poly.triggerAttackRelease(['C6', 'E6', 'G6', 'C7'], 1.3, st);

            this._am.harmonicity.value = 2;
            this._am.volume.value = -10;
            this._am.triggerAttackRelease('C6', 1.2, st + 0.01);

            this._fm.harmonicity.value = 3;
            this._fm.modulationIndex.value = 5;
            this._fm.volume.value = -16;
            this._fm.triggerAttackRelease('G6', 1.0, st + 0.02);
        });

        // Bass foundation
        this._bass.envelope.attack = 0.03;
        this._bass.envelope.decay = 0.35;
        this._bass.envelope.sustain = 0.25;
        this._bass.envelope.release = 0.6;
        this._bass.volume.value = -8;
        this._bass.triggerAttackRelease('C2', 1.2, now + 0.02);
    }

    // ── DRAG GRID SNAP: Subtle tick ──

    playDragSnap() {
        if (!this._canPlay()) return;
        this.ensureContext();

        if (!this._hasTone()) return;
        const now = Tone.now();

        this._click.oscillator.type = 'sine';
        this._click.envelope.attack = 0.001;
        this._click.envelope.decay = 0.006;
        this._click.envelope.sustain = 0.02;
        this._click.envelope.release = 0.008;
        this._click.volume.value = -18;
        this._click.triggerAttackRelease('A5', '128n', now);
    }

    // ── NEAR COMPLETE: Tension tone ──

    playNearComplete(emptyCells) {
        if (!this._canPlay()) return;
        this.ensureContext();

        if (!this._hasTone()) return;
        const now = Tone.now();

        const note = emptyCells === 1 ? 'E5' : 'B4';
        this._bell.envelope.attack = 0.005;
        this._bell.envelope.decay = 0.06;
        this._bell.envelope.sustain = 0.15;
        this._bell.envelope.release = 0.2;
        this._bell.volume.value = -20;
        this._bell.triggerAttackRelease(note, 0.1, now);
    }

    // ── AMBIENT: Subtle background pad loop ──

    startAmbient() {
        if (!this._canPlay() || this._ambientLoop) return;
        this.ensureContext();

        if (!this._hasTone()) return;

        this._ambientLoop = new Tone.Loop((time) => {
            if (!this.enabled) return;
            this._am.harmonicity.value = 1.5;
            this._am.volume.value = -32;
            this._am.envelope.attack = 0.8;
            this._am.envelope.decay = 1.5;
            this._am.envelope.sustain = 0.2;
            this._am.envelope.release = 2.0;
            this._am.triggerAttackRelease('C3', 3.5, time);
        }, 4);
        this._ambientLoop.start(Tone.now());
        Tone.Transport.start();
    }

    stopAmbient() {
        if (this._ambientLoop) {
            this._ambientLoop.stop();
            this._ambientLoop.dispose();
            this._ambientLoop = null;
        }
    }

    // ── Toggle ──────────────────────────────────────────────────────

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._pendingTimeouts.forEach(id => clearTimeout(id));
        this._pendingTimeouts.clear();
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
        if (this._contextWatcher && this._sfxContext) {
            this._sfxContext.removeEventListener('statechange', this._contextWatcher);
            this._contextWatcher = null;
        }
        this.stopAmbient();
        const synths = [this._membrane, this._bass, this._click, this._bell,
                        this._poly, this._fm, this._am, this._metal, this._sweep, this._noise];
        for (const s of synths) { try { if (s?.dispose) s.dispose(); } catch(e) {} }
        for (const node of [this._reverb, this._compressor, this._dryChannel, this._wetChannel]) {
            try { if (node?.dispose) node.dispose(); } catch(e) {}
        }
        for (const node of [this._masterSum, this._limiter, this._outputGain]) {
            try { if (node && node.disconnect) node.disconnect(); } catch(e) {}
        }
        this._masterSum = null;
        this._limiter = null;
        this._outputGain = null;
        for (const name in this._wavPools) {
            const pool = this._wavPools[name];
            for (let i = 0; i < pool.length; i++) {
                if (typeof pool[i]._index !== 'undefined') continue;
                pool[i].pause();
                pool[i].src = '';
            }
        }
        this._wavPools = {};
        this._wavBuffers = {};
    }

    toggle() {
        this.enabled = !this.enabled;
        try {
            localStorage.setItem('blockpang_sound_enabled', this.enabled ? '1' : '0');
        } catch (_) {}
        if (typeof Tone !== 'undefined' && Tone.Destination) {
            Tone.Destination.mute = true;
        }
        if (this._outputGain) {
            this._outputGain.gain.value = this.enabled && !this._pageHidden ? 0.72 : 0;
        }
        // Mute/unmute all WAV pools
        for (const name in this._wavPools) {
            const pool = this._wavPools[name];
            for (const audio of pool) {
                if (typeof audio._index === 'undefined') {
                    audio.muted = !this.enabled;
                }
            }
        }
        if (!this.enabled) {
            this.stopAmbient();
        }
        return this.enabled;
    }
}
