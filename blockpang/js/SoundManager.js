class SoundManager {
    constructor() {
        this.enabled = true;
        this.volume = 1.4;
        this._initialized = false;

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

        // WAV audio pools
        this._wavPools = {};
    }

    // ── WAV Audio Pool System ─────────────────────────────────────

    _createPool(name, src, poolSize = 4) {
        this._wavPools[name] = [];
        for (let i = 0; i < poolSize; i++) {
            const audio = new Audio(src);
            audio.preload = 'auto';
            this._wavPools[name].push(audio);
        }
        this._wavPools[name]._index = 0;
    }

    _playWav(name, volumeMultiplier = 1) {
        const pool = this._wavPools[name];
        if (!pool || !this.enabled) return;
        const audio = pool[pool._index];
        pool._index = (pool._index + 1) % pool.length;
        audio.volume = Math.max(0, Math.min(1, this.volume * volumeMultiplier * 0.5));
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }

    // ── Initialization ──────────────────────────────────────────────

    init() {
        if (this._initialized) return;

        // Load WAV audio pools
        const soundBase = 'sounds/';
        this._createPool('block_break', soundBase + 'block_break.wav', 8);
        this._createPool('glass_shatter', soundBase + 'glass_shatter.wav', 4);
        this._createPool('combo_hit', soundBase + 'combo_hit.wav', 6);
        this._createPool('combo_escalate', soundBase + 'combo_escalate.wav', 4);
        this._createPool('clear_single', soundBase + 'clear_single.wav', 4);
        this._createPool('clear_double', soundBase + 'clear_double.wav', 3);
        this._createPool('clear_triple', soundBase + 'clear_triple.wav', 3);
        this._createPool('clear_quad', soundBase + 'clear_quad.wav', 2);
        this._createPool('impact_heavy', soundBase + 'impact_heavy.wav', 6);
        this._createPool('sparkle', soundBase + 'sparkle.wav', 6);
        this._createPool('whoosh', soundBase + 'whoosh.wav', 4);
        this._createPool('place', soundBase + 'place.wav', 6);
        this._createPool('pickup', soundBase + 'pickup.wav', 6);

        if (typeof Tone === 'undefined') {
            console.warn('SoundManager: Tone.js not loaded, using WAV-only mode.');
            this._initialized = true;
            return;
        }

        try {
            // Convert linear volume to dB for Tone.Destination
            const volDb = 20 * Math.log10(this.volume);
            Tone.Destination.volume.value = volDb;

            // ── Effects chain ──
            this._limiter = new Tone.Limiter(-1).toDestination();

            this._compressor = new Tone.Compressor({
                threshold: -20,
                knee: 25,
                ratio: 8,
                attack: 0.002,
                release: 0.15
            }).connect(this._limiter);

            this._reverb = new Tone.Reverb({
                decay: 1.8,
                wet: 0.18,
                preDelay: 0.01
            }).connect(this._compressor);

            // Generate the reverb impulse response immediately
            this._reverb.generate();

            // Dry path (no reverb)
            this._dryChannel = new Tone.Channel({ volume: 0 }).connect(this._compressor);

            // Wet path (with reverb)
            this._wetChannel = new Tone.Channel({ volume: 0 }).connect(this._reverb);

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

            this._initialized = true;
        } catch (e) {
            console.error('SoundManager init failed:', e);
            this._initialized = true; // Still allow WAV playback
        }
    }

    ensureContext() {
        if (typeof Tone !== 'undefined') {
            Tone.start().catch(() => {});
        }
        if (!this._initialized) {
            this.init();
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
            try { fn(); } catch (e) { /* Tone scheduling drift */ }
        } else {
            const ms = offsetSec * 1000;
            setTimeout(() => { try { fn(); } catch (e) { /* Tone scheduling drift */ } }, ms);
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
        try { this._playClearInner(lineCount); } catch (e) { console.warn('playClear error:', e); }
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
        try { this._playComboInner(level); } catch (e) { console.warn('playCombo error:', e); }
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
                this._bell.triggerAttackRelease(note, 0.4 - i * 0.018, now + t);
            });
        });

        // Grand finale chord
        const finaleDelay = 0.05 + scale.length * noteSpacing;
        this._at(finaleDelay, () => {
            this._poly.set({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.35, sustain: 0.35, release: 0.8 }
            });
            this._poly.volume.value = -8;
            this._poly.triggerAttackRelease(['C6', 'E6', 'G6', 'C7'], 1.3, now + finaleDelay);

            this._am.harmonicity.value = 2;
            this._am.volume.value = -10;
            this._am.triggerAttackRelease('C6', 1.2, now + finaleDelay + 0.01);

            this._fm.harmonicity.value = 3;
            this._fm.modulationIndex.value = 5;
            this._fm.volume.value = -16;
            this._fm.triggerAttackRelease('G6', 1.0, now + finaleDelay + 0.02);
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

    toggle() {
        this.enabled = !this.enabled;
        if (typeof Tone !== 'undefined') {
            Tone.Destination.mute = !this.enabled;
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
