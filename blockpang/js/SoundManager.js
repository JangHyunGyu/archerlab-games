class SoundManager {
    constructor() {
        this.enabled = true;
        this.volume = 0.35;
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
    }

    // ── Initialization ──────────────────────────────────────────────

    init() {
        if (this._initialized) return;
        if (typeof Tone === 'undefined') {
            console.warn('SoundManager: Tone.js not loaded, audio disabled.');
            this.enabled = false;
            return;
        }

        try {
            // Convert linear volume (0.35) to dB for Tone.Destination
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
            this.enabled = false;
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

    /**
     * Schedule a callback at an offset from "now" (in seconds).
     * Uses Tone.Transport-free scheduling via Tone.Draw or setTimeout.
     */
    _at(offsetSec, fn) {
        if (offsetSec <= 0.005) {
            fn();
        } else {
            const ms = offsetSec * 1000;
            setTimeout(fn, ms);
        }
    }

    // ── PLACE: Heavy satisfying THUMP + crystalline click ──────────

    playPlace() {
        if (!this._canPlay()) return;
        this.ensureContext();
        const now = Tone.now();

        // Deep punchy bass thud (the satisfying weight)
        this._membrane.envelope.decay = 0.12;
        this._membrane.envelope.release = 0.06;
        this._membrane.octaves = 4;
        this._membrane.pitchDecay = 0.06;
        this._membrane.volume.value = -4;
        this._membrane.triggerAttackRelease('C1', '16n', now);

        // Sub-bass body (feel the impact)
        this._bass.envelope.attack = 0.001;
        this._bass.envelope.decay = 0.08;
        this._bass.envelope.sustain = 0.1;
        this._bass.envelope.release = 0.06;
        this._bass.volume.value = -8;
        this._bass.triggerAttackRelease('A0', '32n', now + 0.005);

        // Snappy mid click (crispness)
        this._click.oscillator.type = 'triangle';
        this._click.envelope.decay = 0.012;
        this._click.envelope.release = 0.02;
        this._click.volume.value = -10;
        this._click.triggerAttackRelease('C5', '64n', now + 0.008);

        // Bright crystalline sparkle - two layers
        this._bell.volume.value = -16;
        this._bell.triggerAttackRelease('A#6', 0.07, now + 0.015);

        // Metallic shimmer (adds texture)
        this._metal.envelope.decay = 0.04;
        this._metal.volume.value = -26;
        this._metal.triggerAttackRelease('32n', now + 0.01);

        // Soft transient noise (texture)
        this._noise.noise.type = 'pink';
        this._noise.envelope.decay = 0.025;
        this._noise.volume.value = -22;
        this._noise.triggerAttackRelease('64n', now);
    }

    // ── LINE CLEAR: Euphoric ascending arpeggio ────────────────────

    playClear(lineCount) {
        if (!this._canPlay()) return;
        this.ensureContext();
        const now = Tone.now();
        const clampLines = Math.min(Math.max(lineCount, 1), 4);

        // Musical scales - progressively more euphoric
        const scales = {
            1: ['C5', 'E5', 'G5'],
            2: ['C5', 'E5', 'G5', 'C6'],
            3: ['C5', 'E5', 'G5', 'B5', 'D6'],
            4: ['C5', 'E5', 'G5', 'B5', 'D6', 'G6']
        };
        const notes = scales[clampLines];
        const noteSpacing = 0.05;

        // Ascending arpeggio with bell tones
        notes.forEach((note, i) => {
            const t = now + i * noteSpacing;

            // Main bell-like tone
            this._at(i * noteSpacing, () => {
                this._bell.envelope.attack = 0.002;
                this._bell.envelope.decay = 0.08;
                this._bell.envelope.sustain = 0.4;
                this._bell.envelope.release = 0.3;
                this._bell.volume.value = -8;
                this._bell.triggerAttackRelease(note, 0.35 - i * 0.015, t);
            });
        });

        // Rich chord layer using PolySynth (all notes together, delayed)
        this._at(noteSpacing * 0.5, () => {
            this._poly.volume.value = -14;
            this._poly.triggerAttackRelease(
                notes.slice(0, 3),
                0.3,
                now + noteSpacing * 0.5
            );
        });

        // FM harmonic shimmer on top notes
        if (clampLines >= 2) {
            const topNote = notes[notes.length - 1];
            this._at(notes.length * noteSpacing * 0.6, () => {
                this._fm.harmonicity.value = 3;
                this._fm.modulationIndex.value = 6;
                this._fm.volume.value = -16;
                this._fm.triggerAttackRelease(topNote, 0.25, now + notes.length * noteSpacing * 0.6);
            });
        }

        // Satisfying whoosh sweep (rising with line count)
        this._sweep.filterEnvelope.octaves = 3 + clampLines;
        this._sweep.filterEnvelope.decay = 0.2 + clampLines * 0.05;
        this._sweep.volume.value = -18;
        this._sweep.triggerAttackRelease('G2', 0.3, now);

        // Sparkle noise burst
        this._at(notes.length * noteSpacing * 0.3, () => {
            this._noise.noise.type = 'pink';
            this._noise.envelope.decay = 0.15;
            this._noise.volume.value = -20;
            this._noise.triggerAttackRelease(0.2, now + notes.length * noteSpacing * 0.3);
        });

        // Impact sub-bass hit
        this._membrane.octaves = 5;
        this._membrane.pitchDecay = 0.04;
        this._membrane.envelope.decay = 0.1;
        this._membrane.volume.value = -6;
        this._membrane.triggerAttackRelease('C1', '16n', now);

        // Foundation bass pad
        this._bass.envelope.attack = 0.06;
        this._bass.envelope.decay = 0.2;
        this._bass.envelope.sustain = 0.3;
        this._bass.envelope.release = 0.25;
        this._bass.volume.value = -10;
        this._bass.triggerAttackRelease('C2', 0.4, now + 0.01);

        // Metallic sparkle accent
        this._metal.envelope.decay = 0.08;
        this._metal.volume.value = -24 + clampLines;
        this._metal.triggerAttackRelease('16n', now + 0.02);
    }

    // ── COMBO: Escalating power chord ──────────────────────────────

    playCombo(level) {
        if (!this._canPlay()) return;
        this.ensureContext();
        const now = Tone.now();
        const clampLevel = Math.min(level, 8);

        // Base note rises with combo level
        const semitonesUp = clampLevel - 2;
        const baseFreq = 440 * Math.pow(2, semitonesUp / 12);
        const baseNote = Tone.Frequency(baseFreq, 'hz').toNote();
        const fifthFreq = baseFreq * 1.5;
        const fifthNote = Tone.Frequency(fifthFreq, 'hz').toNote();
        const octaveFreq = baseFreq * 2;
        const octaveNote = Tone.Frequency(octaveFreq, 'hz').toNote();

        // Power chord via PolySynth (root, 5th, octave)
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

        // FM layer for grit/harmonics - more intense at higher levels
        this._fm.harmonicity.value = 2 + clampLevel * 0.3;
        this._fm.modulationIndex.value = 6 + clampLevel * 2;
        this._fm.volume.value = -14 + clampLevel * 0.5;
        this._fm.triggerAttackRelease(baseNote, 0.25, now + 0.01);

        // At high combos, add AM layer for extra intensity
        if (clampLevel >= 4) {
            this._am.harmonicity.value = 2 + clampLevel * 0.2;
            this._am.volume.value = -16 + clampLevel * 0.5;
            this._am.triggerAttackRelease(octaveNote, 0.2, now + 0.02);
        }

        // Rising whoosh (increasing intensity with level)
        this._sweep.filterEnvelope.octaves = 3 + clampLevel * 0.5;
        this._sweep.filterEnvelope.decay = 0.15 + clampLevel * 0.02;
        this._sweep.filter.Q.value = 2 + clampLevel * 0.5;
        this._sweep.volume.value = -18 + clampLevel * 0.5;
        this._sweep.triggerAttackRelease('D#2', 0.25, now);

        // Heavy impact thud
        this._membrane.octaves = 4 + clampLevel * 0.3;
        this._membrane.pitchDecay = 0.04;
        this._membrane.envelope.decay = 0.08;
        this._membrane.volume.value = -5 + clampLevel * 0.3;
        this._membrane.triggerAttackRelease('E1', '16n', now);

        // Crispy noise burst
        this._noise.noise.type = 'pink';
        this._noise.envelope.decay = 0.08 + clampLevel * 0.01;
        this._noise.volume.value = -20 + clampLevel;
        this._noise.triggerAttackRelease('16n', now + 0.03);

        // High sparkle accent (metallic)
        this._metal.envelope.decay = 0.06 + clampLevel * 0.01;
        this._metal.volume.value = -24 + clampLevel;
        this._metal.triggerAttackRelease('16n', now + 0.05);

        // At very high combos (6+), add distortion-like overtone
        if (clampLevel >= 6) {
            const highHarmonic = Tone.Frequency(baseFreq * 3, 'hz').toNote();
            this._at(0.015, () => {
                this._click.oscillator.type = 'square';
                this._click.envelope.decay = 0.03;
                this._click.volume.value = -18 + clampLevel;
                this._click.triggerAttackRelease(highHarmonic, 0.06, now + 0.015);
            });
        }
    }

    // ── GAME OVER: Dramatic descending progression ─────────────────

    playGameOver() {
        if (!this._canPlay()) return;
        this.ensureContext();
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
                const t = now + delay;

                // Chord with rich sustain
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

                // AM layer for melancholy tremolo
                this._am.harmonicity.value = 1.5;
                this._am.volume.value = -14;
                this._am.triggerAttackRelease(notes[0], 0.6, t + 0.01);
            });
        });

        // Heavy sub bass following root notes
        const bassNotes = ['A1', 'G1', 'F1', 'D1', 'A0'];
        bassNotes.forEach((note, i) => {
            const delay = i * 0.3;
            this._at(delay, () => {
                this._bass.envelope.attack = 0.03;
                this._bass.envelope.decay = 0.3;
                this._bass.envelope.sustain = 0.2;
                this._bass.envelope.release = 0.35;
                this._bass.volume.value = -10;
                this._bass.triggerAttackRelease(note, 0.7, now + delay);
            });
        });

        // Ominous final low rumble
        this._at(1.4, () => {
            this._membrane.octaves = 6;
            this._membrane.pitchDecay = 0.3;
            this._membrane.envelope.decay = 1.5;
            this._membrane.envelope.release = 0.8;
            this._membrane.volume.value = -6;
            this._membrane.triggerAttackRelease('F0', 1.8, now + 1.4);
        });

        // FM dark rumble tail
        this._at(1.5, () => {
            this._fm.harmonicity.value = 1.5;
            this._fm.modulationIndex.value = 20;
            this._fm.volume.value = -14;
            this._fm.triggerAttackRelease('A0', 1.5, now + 1.5);
        });

        // Noise tail (fading static)
        this._at(1.2, () => {
            this._noise.noise.type = 'brown';
            this._noise.envelope.attack = 0.1;
            this._noise.envelope.decay = 1.2;
            this._noise.volume.value = -18;
            this._noise.triggerAttackRelease(1.5, now + 1.2);
        });
    }

    // ── INVALID: Short punchy rejection buzz ───────────────────────

    playInvalid() {
        if (!this._canPlay()) return;
        this.ensureContext();
        const now = Tone.now();

        // Low harsh buzz
        this._click.oscillator.type = 'square';
        this._click.envelope.attack = 0.001;
        this._click.envelope.decay = 0.03;
        this._click.envelope.sustain = 0.2;
        this._click.envelope.release = 0.04;
        this._click.volume.value = -12;
        this._click.triggerAttackRelease('F#3', 0.07, now);

        // Second lower buzz (descending feel)
        this._at(0.04, () => {
            this._fm.harmonicity.value = 7;
            this._fm.modulationIndex.value = 15;
            this._fm.volume.value = -16;
            this._fm.triggerAttackRelease('C#3', 0.06, now + 0.04);
        });

        // Low thud
        this._membrane.octaves = 3;
        this._membrane.pitchDecay = 0.03;
        this._membrane.envelope.decay = 0.04;
        this._membrane.volume.value = -8;
        this._membrane.triggerAttackRelease('C#1', '32n', now);

        // Brief noise crunch
        this._noise.noise.type = 'white';
        this._noise.envelope.decay = 0.03;
        this._noise.volume.value = -22;
        this._noise.triggerAttackRelease('64n', now);
    }

    // ── PICKUP: Snappy satisfying click-pop ─────────────────────────

    playPickup() {
        if (!this._canPlay()) return;
        this.ensureContext();
        const now = Tone.now();

        // Pop click
        this._click.oscillator.type = 'sine';
        this._click.envelope.attack = 0.001;
        this._click.envelope.decay = 0.012;
        this._click.envelope.sustain = 0.08;
        this._click.envelope.release = 0.015;
        this._click.volume.value = -8;
        this._click.triggerAttackRelease('F5', 0.035, now);

        // High sparkle
        this._bell.envelope.decay = 0.01;
        this._bell.envelope.release = 0.015;
        this._bell.volume.value = -16;
        this._bell.triggerAttackRelease('D#6', 0.03, now + 0.008);

        // Tiny sub bump
        this._membrane.octaves = 2;
        this._membrane.pitchDecay = 0.02;
        this._membrane.envelope.decay = 0.03;
        this._membrane.volume.value = -10;
        this._membrane.triggerAttackRelease('B1', '64n', now);

        // Delicate metallic tick
        this._metal.envelope.decay = 0.02;
        this._metal.volume.value = -30;
        this._metal.triggerAttackRelease('64n', now + 0.005);
    }

    // ── LEVEL UP: Triumphant fanfare with punch ─────────────────────

    playLevelUp() {
        if (!this._canPlay()) return;
        this.ensureContext();
        const now = Tone.now();

        // Impact hit
        this._membrane.octaves = 5;
        this._membrane.pitchDecay = 0.06;
        this._membrane.envelope.decay = 0.1;
        this._membrane.envelope.release = 0.06;
        this._membrane.volume.value = -4;
        this._membrane.triggerAttackRelease('C1', '8n', now);

        // Impact noise
        this._noise.noise.type = 'white';
        this._noise.envelope.decay = 0.04;
        this._noise.volume.value = -16;
        this._noise.triggerAttackRelease('32n', now);

        // Fanfare arpeggio: C-E-G-C-E (triumphant major)
        const fanfare = ['C5', 'E5', 'G5', 'C6', 'E6'];
        fanfare.forEach((note, i) => {
            const t = 0.05 + i * 0.07;
            this._at(t, () => {
                // Main bell tone
                this._bell.envelope.attack = 0.003;
                this._bell.envelope.decay = 0.1;
                this._bell.envelope.sustain = 0.45;
                this._bell.envelope.release = 0.25;
                this._bell.volume.value = -8;
                this._bell.triggerAttackRelease(note, 0.3, now + t);

                // FM shimmer layer
                this._fm.harmonicity.value = 3;
                this._fm.modulationIndex.value = 4;
                this._fm.volume.value = -18;
                this._fm.triggerAttackRelease(note, 0.2, now + t + 0.01);
            });
        });

        // Grand resolving chord
        const resolveDelay = fanfare.length * 0.07 + 0.05;
        this._at(resolveDelay, () => {
            this._poly.set({
                oscillator: { type: 'sine' },
                envelope: {
                    attack: 0.008,
                    decay: 0.25,
                    sustain: 0.4,
                    release: 0.5
                }
            });
            this._poly.volume.value = -8;
            this._poly.triggerAttackRelease(['C6', 'E6', 'G6'], 0.8, now + resolveDelay);

            // AM sustain layer
            this._am.harmonicity.value = 2;
            this._am.volume.value = -12;
            this._am.triggerAttackRelease('C6', 0.7, now + resolveDelay + 0.01);
        });

        // Uplifting sweep
        this._sweep.filterEnvelope.octaves = 5;
        this._sweep.filterEnvelope.decay = 0.35;
        this._sweep.volume.value = -20;
        this._sweep.triggerAttackRelease('G2', 0.45, now + 0.05);

        // Sparkle shower noise
        this._at(0.15, () => {
            this._noise.noise.type = 'pink';
            this._noise.envelope.decay = 0.25;
            this._noise.volume.value = -20;
            this._noise.triggerAttackRelease(0.35, now + 0.15);
        });

        // Foundation bass
        this._bass.envelope.attack = 0.008;
        this._bass.envelope.decay = 0.2;
        this._bass.envelope.sustain = 0.25;
        this._bass.envelope.release = 0.25;
        this._bass.volume.value = -8;
        this._bass.triggerAttackRelease('C2', 0.45, now);

        // Metallic shimmer accent
        this._metal.envelope.decay = 0.1;
        this._metal.volume.value = -22;
        this._metal.triggerAttackRelease('8n', now + 0.08);
    }

    // ── PERFECT CLEAR: Magical euphoric celebration ─────────────────

    playPerfectClear() {
        if (!this._canPlay()) return;
        this.ensureContext();
        const now = Tone.now();

        // Massive impact
        this._membrane.octaves = 6;
        this._membrane.pitchDecay = 0.08;
        this._membrane.envelope.decay = 0.12;
        this._membrane.envelope.release = 0.08;
        this._membrane.volume.value = -2;
        this._membrane.triggerAttackRelease('B0', '8n', now);

        // Impact noise
        this._noise.noise.type = 'white';
        this._noise.envelope.decay = 0.05;
        this._noise.volume.value = -14;
        this._noise.triggerAttackRelease('16n', now);

        // Sparkling ascending major scale
        const scale = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6', 'G6', 'A6'];
        const noteSpacing = 0.045;

        scale.forEach((note, i) => {
            const t = 0.05 + i * noteSpacing;
            this._at(t, () => {
                // Primary bell tone
                this._bell.envelope.attack = 0.002;
                this._bell.envelope.decay = 0.07;
                this._bell.envelope.sustain = 0.3;
                this._bell.envelope.release = 0.25;
                this._bell.volume.value = -9;
                this._bell.triggerAttackRelease(note, 0.4 - i * 0.018, now + t);
            });

            // Every other note gets a metallic sparkle
            if (i % 2 === 0) {
                this._at(t + 0.008, () => {
                    this._metal.envelope.decay = 0.04;
                    this._metal.volume.value = -28;
                    this._metal.triggerAttackRelease('64n', now + t + 0.008);
                });
            }
        });

        // Sweeping PolySynth chords underneath the arpeggio
        // First chord
        this._at(0.08, () => {
            this._poly.set({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.2, sustain: 0.35, release: 0.4 }
            });
            this._poly.volume.value = -12;
            this._poly.triggerAttackRelease(['C5', 'E5', 'G5'], 0.4, now + 0.08);
        });

        // Second chord (midway)
        this._at(0.28, () => {
            this._poly.volume.value = -12;
            this._poly.triggerAttackRelease(['G5', 'B5', 'D6'], 0.4, now + 0.28);
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

            // AM swell on the finale
            this._am.harmonicity.value = 2;
            this._am.volume.value = -10;
            this._am.envelope.attack = 0.02;
            this._am.envelope.decay = 0.4;
            this._am.envelope.sustain = 0.35;
            this._am.envelope.release = 0.6;
            this._am.triggerAttackRelease('C6', 1.2, now + finaleDelay + 0.01);

            // FM rich overtone layer
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

        // Rising whoosh sweep
        this._sweep.filterEnvelope.octaves = 6;
        this._sweep.filterEnvelope.decay = 0.5;
        this._sweep.filter.Q.value = 4;
        this._sweep.volume.value = -20;
        this._sweep.triggerAttackRelease('C2', 0.7, now);

        // Noise atmosphere (airy sparkle shower)
        this._at(0.15, () => {
            this._noise.noise.type = 'pink';
            this._noise.envelope.attack = 0.05;
            this._noise.envelope.decay = 0.8;
            this._noise.volume.value = -20;
            this._noise.triggerAttackRelease(0.9, now + 0.15);
        });

        // Late sparkle metallic shimmer burst
        this._at(finaleDelay + 0.05, () => {
            this._metal.envelope.decay = 0.15;
            this._metal.volume.value = -22;
            this._metal.triggerAttackRelease('8n', now + finaleDelay + 0.05);
        });
    }

    // ── Toggle ──────────────────────────────────────────────────────

    toggle() {
        this.enabled = !this.enabled;
        if (typeof Tone !== 'undefined') {
            Tone.Destination.mute = !this.enabled;
        }
        return this.enabled;
    }
}
