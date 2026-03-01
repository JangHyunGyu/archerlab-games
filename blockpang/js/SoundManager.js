class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 0.35;
        this.masterGain = null;
        this.reverbNode = null;
        this.compressor = null;
    }

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            // Master compressor for punchy, polished sound
            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-20, this.ctx.currentTime);
            this.compressor.knee.setValueAtTime(25, this.ctx.currentTime);
            this.compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
            this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
            this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

            // Master gain
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

            // Convolution reverb
            this._createReverb();

            this.compressor.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);
        } catch (e) {
            this.enabled = false;
        }
    }

    _createReverb() {
        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * 1.8;
        const impulse = this.ctx.createBuffer(2, length, sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                const t = i / sampleRate;
                // More lush reverb with early reflections
                const earlyRef = t < 0.05 ? Math.sin(t * 200) * 0.3 : 0;
                data[i] = ((Math.random() * 2 - 1) * Math.exp(-t * 3.5) * 0.35) + earlyRef;
            }
        }
        this.reverbNode = this.ctx.createConvolver();
        this.reverbNode.buffer = impulse;

        const reverbGain = this.ctx.createGain();
        reverbGain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        this.reverbNode.connect(reverbGain);
        reverbGain.connect(this.compressor);

        this.reverbSend = this.ctx.createGain();
        this.reverbSend.gain.setValueAtTime(1, this.ctx.currentTime);
        this.reverbSend.connect(this.reverbNode);
    }

    ensureContext() {
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    _getOutput() {
        return this.compressor || this.ctx.destination;
    }

    _playTone(freq, duration, type = 'sine', vol = 0.2, delay = 0, opts = {}) {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime + delay;
        const output = this._getOutput();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);

        // Detune for richness
        if (opts.detune) {
            osc.detune.setValueAtTime(opts.detune, t);
        }

        // Vibrato
        if (opts.vibrato) {
            const lfo = this.ctx.createOscillator();
            const lfoGain = this.ctx.createGain();
            lfo.frequency.setValueAtTime(opts.vibrato.rate || 5, t);
            lfoGain.gain.setValueAtTime(opts.vibrato.depth || 3, t);
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            lfo.start(t);
            lfo.stop(t + duration);
        }

        // Filter for warmth
        filter.type = opts.filterType || 'lowpass';
        filter.frequency.setValueAtTime(opts.filterFreq || 8000, t);
        filter.Q.setValueAtTime(opts.filterQ || 1, t);
        if (opts.filterSweep) {
            filter.frequency.exponentialRampToValueAtTime(opts.filterSweep, t + duration);
        }

        // Envelope: ADSR
        const attack = opts.attack || 0.005;
        const decay = opts.decay || duration * 0.3;
        const sustain = opts.sustain || 0.5;
        const release = opts.release || duration * 0.5;

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + attack);
        gain.gain.linearRampToValueAtTime(vol * sustain, t + attack + decay);
        gain.gain.setValueAtTime(vol * sustain, t + duration - release);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        // Frequency glide
        if (opts.freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + duration);
        }

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(output);

        // Send to reverb
        if (this.reverbSend && (opts.reverb !== false)) {
            const reverbAmount = this.ctx.createGain();
            reverbAmount.gain.setValueAtTime(opts.reverbMix || 0.3, t);
            gain.connect(reverbAmount);
            reverbAmount.connect(this.reverbSend);
        }

        osc.start(t);
        osc.stop(t + duration + 0.05);
    }

    _playChord(freqs, duration, type = 'sine', vol = 0.15, delay = 0, opts = {}) {
        freqs.forEach((f, i) => {
            this._playTone(f, duration, type, vol / freqs.length, delay, {
                ...opts,
                detune: (i - Math.floor(freqs.length / 2)) * 5,
            });
        });
    }

    _playNoise(duration, vol = 0.08, delay = 0, opts = {}) {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime + delay;
        const output = this._getOutput();
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        const noiseType = opts.type || 'white';
        if (noiseType === 'pink') {
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
                data[i] *= Math.pow(1 - i / bufferSize, opts.decay || 2);
                b6 = white * 0.115926;
            }
        } else {
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, opts.decay || 2);
            }
        }

        const src = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        src.buffer = buffer;
        filter.type = opts.filterType || 'bandpass';
        filter.frequency.setValueAtTime(opts.filterFreq || 4000, t);
        filter.Q.setValueAtTime(opts.filterQ || 0.5, t);
        if (opts.filterSweep) {
            filter.frequency.exponentialRampToValueAtTime(opts.filterSweep, t + duration);
        }

        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(output);

        if (this.reverbSend && opts.reverb !== false) {
            const revGain = this.ctx.createGain();
            revGain.gain.setValueAtTime(0.2, t);
            gain.connect(revGain);
            revGain.connect(this.reverbSend);
        }

        src.start(t);
    }

    // ── PLACE: Heavy satisfying THUMP + crystalline shimmer ──
    playPlace() {
        this.ensureContext();
        // Deep punchy bass thud (the satisfying weight)
        this._playTone(90, 0.15, 'sine', 0.3, 0, {
            attack: 0.001, decay: 0.04, sustain: 0.2, release: 0.1,
            freqEnd: 40, filterFreq: 400, filterSweep: 60,
            reverb: false
        });
        // Sub-bass body (feel the impact)
        this._playTone(55, 0.1, 'sine', 0.2, 0.005, {
            attack: 0.001, decay: 0.03, sustain: 0.15, release: 0.06,
            reverb: false
        });
        // Snappy mid click (the crispness)
        this._playTone(520, 0.04, 'triangle', 0.15, 0.008, {
            attack: 0.001, decay: 0.012, sustain: 0.1, release: 0.02,
            filterFreq: 2000, filterSweep: 400
        });
        // Bright crystalline sparkle
        this._playTone(1880, 0.07, 'sine', 0.06, 0.015, {
            attack: 0.001, decay: 0.025, sustain: 0.08, release: 0.03,
            reverbMix: 0.5
        });
        this._playTone(2640, 0.05, 'sine', 0.03, 0.02, {
            attack: 0.001, decay: 0.02, sustain: 0.05, release: 0.02,
            reverbMix: 0.6
        });
        // Soft transient noise (gives texture)
        this._playNoise(0.03, 0.06, 0, {
            type: 'pink', filterFreq: 3500, filterSweep: 300, decay: 6
        });
    }

    // ── LINE CLEAR: Euphoric ascending arpeggio with harmonics ──
    playClear(lineCount) {
        this.ensureContext();
        const clampLines = Math.min(lineCount, 4);

        // Musical scales - each progressively more euphoric
        const scales = {
            1: [523.25, 659.25, 783.99],
            2: [523.25, 659.25, 783.99, 1046.50],
            3: [523.25, 659.25, 783.99, 987.77, 1174.66],
            4: [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98]
        };
        const notes = scales[clampLines];
        const noteSpacing = 0.05;

        notes.forEach((freq, i) => {
            // Main bell-like tone
            this._playTone(freq, 0.4 - i * 0.015, 'sine', 0.18, i * noteSpacing, {
                attack: 0.002, decay: 0.06, sustain: 0.5, release: 0.2,
                reverbMix: 0.5, vibrato: { rate: 5, depth: 2 }
            });
            // Bright harmonic (octave up, adds sparkle)
            this._playTone(freq * 2, 0.2, 'sine', 0.05, i * noteSpacing + 0.008, {
                attack: 0.002, decay: 0.04, sustain: 0.15, release: 0.1,
                reverbMix: 0.7
            });
            // Warm triangle sub-layer
            this._playTone(freq * 0.5, 0.25, 'triangle', 0.07, i * noteSpacing, {
                attack: 0.008, decay: 0.08, sustain: 0.3, release: 0.1
            });
        });

        // Satisfying "whoosh" sweep
        this._playTone(200, 0.3, 'sawtooth', 0.04, 0, {
            freqEnd: 800 + clampLines * 200,
            filterType: 'lowpass', filterFreq: 300, filterSweep: 3000 + clampLines * 500,
            attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.12,
            reverbMix: 0.3
        });

        // Sparkle shower noise
        this._playNoise(0.25, 0.07, notes.length * noteSpacing * 0.2, {
            type: 'pink', filterFreq: 9000, filterSweep: 2000, decay: 2.5,
            reverbMix: 0.5
        });

        // Foundation bass pad (fullness)
        this._playTone(notes[0] * 0.25, 0.5, 'sine', 0.1, 0, {
            attack: 0.08, decay: 0.15, sustain: 0.4, release: 0.2,
            filterFreq: 800, filterSweep: 2500, reverbMix: 0.6
        });

        // Impact sub-bass hit
        this._playTone(65, 0.12, 'sine', 0.15, 0, {
            attack: 0.001, decay: 0.04, sustain: 0.1, release: 0.07,
            freqEnd: 35, reverb: false
        });
    }

    // ── COMBO: Escalating power chord with rising energy ──
    playCombo(level) {
        this.ensureContext();
        const clampLevel = Math.min(level, 8);
        const baseNote = 440 * Math.pow(2, (clampLevel - 2) / 12);

        // Power chord: root, 5th, octave
        const chord = [baseNote, baseNote * 1.5, baseNote * 2];

        // Punchy strum
        chord.forEach((freq, i) => {
            this._playTone(freq, 0.35, 'sine', 0.14, i * 0.025, {
                attack: 0.003, decay: 0.08, sustain: 0.5, release: 0.18,
                reverbMix: 0.5, vibrato: { rate: 4 + clampLevel * 0.5, depth: 2 + clampLevel * 0.3 }
            });
            // Bright octave shimmer
            this._playTone(freq * 2, 0.2, 'triangle', 0.05, i * 0.025 + 0.01, {
                attack: 0.003, decay: 0.06, sustain: 0.25, release: 0.1,
                reverbMix: 0.6
            });
        });

        // Rising whoosh (increasing intensity with level)
        this._playTone(150, 0.3, 'sawtooth', 0.04 + clampLevel * 0.005, 0, {
            freqEnd: 150 * Math.pow(2, clampLevel / 4),
            filterType: 'lowpass', filterFreq: 400, filterSweep: 3000 + clampLevel * 500,
            attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.12,
            reverbMix: 0.4
        });

        // Heavy impact thud
        this._playTone(80, 0.1, 'sine', 0.15 + clampLevel * 0.01, 0, {
            attack: 0.001, decay: 0.03, sustain: 0.15, release: 0.06,
            freqEnd: 40, reverb: false
        });

        // Crispy noise burst
        this._playNoise(0.12, 0.06, 0.03, {
            type: 'pink', filterFreq: 5000 + clampLevel * 500, filterSweep: 800, decay: 4,
            reverbMix: 0.3
        });

        // High sparkle accent
        this._playTone(baseNote * 4, 0.12, 'sine', 0.04, 0.06, {
            attack: 0.001, decay: 0.04, sustain: 0.08, release: 0.06,
            reverbMix: 0.8
        });
    }

    // ── GAME OVER: Dramatic descending with weight ──
    playGameOver() {
        this.ensureContext();
        const progression = [
            { freqs: [440, 523.25, 659.25], delay: 0 },
            { freqs: [392, 466.16, 587.33], delay: 0.3 },
            { freqs: [349.23, 415.30, 523.25], delay: 0.6 },
            { freqs: [293.66, 349.23, 440], delay: 0.9 },
            { freqs: [220, 261.63, 329.63], delay: 1.2 },
        ];

        progression.forEach(({ freqs, delay }) => {
            freqs.forEach((f, i) => {
                this._playTone(f, 0.7, 'sine', 0.09, delay + i * 0.01, {
                    attack: 0.02, decay: 0.2, sustain: 0.35, release: 0.3,
                    reverbMix: 0.7, vibrato: { rate: 2.5, depth: 5 }
                });
            });
            // Heavy sub bass
            this._playTone(freqs[0] * 0.25, 0.9, 'sine', 0.08, delay, {
                attack: 0.04, decay: 0.25, sustain: 0.25, release: 0.35,
                filterFreq: 180, reverbMix: 0.5
            });
        });

        // Ominous final low rumble
        this._playTone(45, 2.0, 'sine', 0.12, 1.4, {
            attack: 0.1, decay: 0.5, sustain: 0.25, release: 0.8,
            filterFreq: 150, filterSweep: 30, reverbMix: 0.8,
            vibrato: { rate: 1.5, depth: 8 }
        });
        // Noise tail
        this._playNoise(1.5, 0.05, 1.2, {
            type: 'pink', filterFreq: 400, filterSweep: 40, decay: 1.2,
            reverbMix: 0.7
        });
    }

    // ── INVALID: Short punchy rejection buzz ──
    playInvalid() {
        this.ensureContext();
        this._playTone(180, 0.08, 'square', 0.08, 0, {
            attack: 0.001, decay: 0.02, sustain: 0.3, release: 0.04,
            filterFreq: 700, filterSweep: 150
        });
        this._playTone(140, 0.1, 'square', 0.05, 0.04, {
            attack: 0.001, decay: 0.02, sustain: 0.3, release: 0.05,
            filterFreq: 500, filterSweep: 120
        });
        // Low thud
        this._playTone(70, 0.06, 'sine', 0.08, 0, {
            attack: 0.001, decay: 0.02, sustain: 0.1, release: 0.03,
            reverb: false
        });
    }

    // ── PICKUP: Snappy satisfying click-pop ──
    playPickup() {
        this.ensureContext();
        // Pop click
        this._playTone(700, 0.04, 'sine', 0.1, 0, {
            attack: 0.001, decay: 0.01, sustain: 0.15, release: 0.015
        });
        // High sparkle
        this._playTone(1200, 0.035, 'triangle', 0.05, 0.008, {
            attack: 0.001, decay: 0.008, sustain: 0.08, release: 0.015,
            reverbMix: 0.4
        });
        // Tiny sub bump
        this._playTone(250, 0.03, 'sine', 0.06, 0, {
            attack: 0.001, decay: 0.01, sustain: 0.1, release: 0.015,
            reverb: false
        });
    }

    // ── LEVEL UP: Triumphant fanfare with punch ──
    playLevelUp() {
        this.ensureContext();
        // Impact hit
        this._playTone(80, 0.12, 'sine', 0.2, 0, {
            attack: 0.001, decay: 0.04, sustain: 0.15, release: 0.07,
            freqEnd: 45, reverb: false
        });
        this._playNoise(0.05, 0.08, 0, {
            type: 'white', filterFreq: 4000, filterSweep: 500, decay: 5
        });

        // Fanfare arpeggio: C-E-G-C-E (triumphant major)
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        notes.forEach((freq, i) => {
            this._playTone(freq, 0.35, 'sine', 0.14, 0.05 + i * 0.07, {
                attack: 0.003, decay: 0.08, sustain: 0.5, release: 0.18,
                reverbMix: 0.5, vibrato: { rate: 5, depth: 2 }
            });
            // Harmonic shimmer
            this._playTone(freq * 2, 0.25, 'sine', 0.04, 0.05 + i * 0.07 + 0.015, {
                attack: 0.003, decay: 0.06, sustain: 0.2, release: 0.12,
                reverbMix: 0.7
            });
        });

        // Grand resolving chord
        const finalChord = [1046.50, 1318.51, 1567.98];
        finalChord.forEach((f, i) => {
            this._playTone(f, 0.9, 'sine', 0.1, notes.length * 0.07 + 0.05 + i * 0.015, {
                attack: 0.008, decay: 0.2, sustain: 0.45, release: 0.4,
                reverbMix: 0.8, vibrato: { rate: 4, depth: 3 }
            });
        });

        // Uplifting sweep
        this._playTone(200, 0.5, 'sawtooth', 0.03, 0.05, {
            freqEnd: 1600,
            filterType: 'lowpass', filterFreq: 300, filterSweep: 5000,
            attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.15,
            reverbMix: 0.4
        });

        // Sparkle shower
        this._playNoise(0.4, 0.06, 0.15, {
            type: 'pink', filterFreq: 10000, filterSweep: 3000, decay: 2,
            reverbMix: 0.5
        });

        // Foundation bass
        this._playTone(65.41, 0.5, 'sine', 0.12, 0, {
            attack: 0.008, decay: 0.15, sustain: 0.3, release: 0.2
        });
    }

    // ── PERFECT CLEAR: Magical euphoric celebration ──
    playPerfectClear() {
        this.ensureContext();

        // Massive impact
        this._playTone(60, 0.15, 'sine', 0.25, 0, {
            attack: 0.001, decay: 0.05, sustain: 0.15, release: 0.08,
            freqEnd: 30, reverb: false
        });
        this._playNoise(0.06, 0.1, 0, {
            type: 'white', filterFreq: 5000, filterSweep: 400, decay: 5
        });

        // Sparkling ascending scale
        const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.50, 1174.66, 1318.51, 1567.98, 1760];
        scale.forEach((freq, i) => {
            this._playTone(freq, 0.45 - i * 0.02, 'sine', 0.09, 0.05 + i * 0.045, {
                attack: 0.002, decay: 0.06, sustain: 0.35, release: 0.2,
                reverbMix: 0.6
            });
            // Octave sparkle
            this._playTone(freq * 2, 0.25, 'sine', 0.03, 0.05 + i * 0.045 + 0.008, {
                attack: 0.002, decay: 0.04, sustain: 0.12, release: 0.12,
                reverbMix: 0.8
            });
        });

        // Grand finale chord
        const finaleDelay = 0.05 + scale.length * 0.045;
        const finale = [1046.50, 1318.51, 1567.98, 2093.00];
        finale.forEach((f, i) => {
            this._playTone(f, 1.5, 'sine', 0.09, finaleDelay + i * 0.015, {
                attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.7,
                reverbMix: 0.9, vibrato: { rate: 4, depth: 4 }
            });
        });

        // Bass foundation
        this._playTone(130.81, 1.5, 'sine', 0.14, 0, {
            attack: 0.04, decay: 0.3, sustain: 0.3, release: 0.6,
            reverbMix: 0.5
        });

        // Noise sweep (airy atmosphere)
        this._playNoise(1.0, 0.06, 0.15, {
            type: 'pink', filterFreq: 12000, filterSweep: 2000, decay: 1.5,
            reverbMix: 0.7
        });

        // Rising whoosh
        this._playTone(100, 0.8, 'sawtooth', 0.03, 0, {
            freqEnd: 2000,
            filterType: 'lowpass', filterFreq: 200, filterSweep: 6000,
            attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.3,
            reverbMix: 0.5
        });
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}
