/**
 * Tone.js 기반 프로시저럴 사운드 매니저
 * FM/AM 합성, 리버브, 컴프레서, 프리셋 신스 풀로 리얼한 게임 사운드 생성
 */
export class SoundManager {
    constructor() {
        this.enabled = true;
        this._initialized = false;
    }

    init() {
        try {
            if (typeof Tone === 'undefined') { this.enabled = false; return; }

            // Effects chain: synths → comp → masterVol → destination
            this._masterVol = new Tone.Volume(-8).toDestination();
            this._comp = new Tone.Compressor(-18, 6).connect(this._masterVol);
            this._reverb = new Tone.Freeverb({ roomSize: 0.55, dampening: 3000, wet: 0.18 }).connect(this._comp);

            // === Pre-created synth pool ===

            // Impact (bass drum / punch)
            this._impact = new Tone.MembraneSynth({
                pitchDecay: 0.04, octaves: 5,
                envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.08 },
            }).connect(this._comp);

            // Tonal (melodies, beeps - dry)
            this._tone = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
            }).connect(this._comp);

            // Tonal wet (reverbed melodies)
            this._toneWet = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.2 },
            }).connect(this._reverb);

            // FM synth (energy, weapon effects - dry)
            this._fm = new Tone.FMSynth({
                harmonicity: 3, modulationIndex: 10,
                envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
                modulation: { type: 'sine' },
            }).connect(this._comp);

            // FM synth wet (spacious FX)
            this._fmWet = new Tone.FMSynth({
                harmonicity: 2, modulationIndex: 8,
                envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 },
                modulation: { type: 'sine' },
            }).connect(this._reverb);

            // Metal synth (metallic clinks, blade rings)
            this._metal = new Tone.MetalSynth({
                frequency: 800, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.08 },
                harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
            }).connect(this._comp);

            // Noise synth → bandpass filter (whooshes, textures)
            this._noiseFilter = new Tone.Filter(2000, 'bandpass').connect(this._comp);
            this._noise = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.08 },
            }).connect(this._noiseFilter);

            // Sub bass (deep sine)
            this._sub = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.003, decay: 0.15, sustain: 0, release: 0.1 },
            }).connect(this._comp);

            // Poly synth (chords, arpeggios - reverbed)
            this._poly = new Tone.PolySynth(Tone.Synth, {
                maxPolyphony: 8,
                voice: Tone.Synth,
                options: {
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.01, decay: 0.2, sustain: 0.15, release: 0.3 },
                },
            }).connect(this._reverb);

            // FM Poly (rich chords)
            this._fmPoly = new Tone.PolySynth(Tone.FMSynth, {
                maxPolyphony: 6,
                voice: Tone.FMSynth,
                options: {
                    harmonicity: 3, modulationIndex: 5,
                    envelope: { attack: 0.008, decay: 0.2, sustain: 0.1, release: 0.25 },
                },
            }).connect(this._reverb);

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

    get out() { return this._comp; }
    get wet() { return this._reverb; }

    play(soundName) {
        if (!this.enabled || !this._initialized) return;
        this.resume();
        try {
            switch (soundName) {
                case 'hit': this._playHit(); break;
                case 'kill': this._playKill(); break;
                case 'dagger': this._playDagger(); break;
                case 'slash': this._playSlash(); break;
                case 'authority': this._playAuthority(); break;
                case 'fear': this._playFear(); break;
                case 'xp': this._playXP(); break;
                case 'levelup': this._playLevelUp(); break;
                case 'system': this._playSystem(); break;
                case 'arise': this._playArise(); break;
                case 'bossAppear': this._playBossAppear(); break;
                case 'rankup': this._playRankUp(); break;
                case 'playerHit': this._playPlayerHit(); break;
                case 'warning': this._playWarning(); break;
                case 'potion': this._playPotion(); break;
                case 'select': this._playSelect(); break;
                case 'quest': this._playQuest(); break;
                case 'dungeonBreak': this._playDungeonBreak(); break;
            }
        } catch (e) { /* silent */ }
    }

    // ========== WEAPON SOUNDS ==========

    // 단검 베기 - swoosh + metallic clink
    _playDagger() {
        const now = Tone.now();
        // Swoosh
        this._noiseFilter.frequency.setValueAtTime(3000, now);
        this._noiseFilter.frequency.rampTo(9000, 0.08);
        this._noise.envelope.decay = 0.08;
        this._noise.envelope.release = 0.04;
        this._noise.triggerAttackRelease('16n', now, 0.5);
        // Blade ring
        this._metal.frequency = 900;
        this._metal.envelope.decay = 0.06;
        this._metal.triggerAttackRelease('32n', now, 0.25);
        // Sub thud
        this._sub.envelope.decay = 0.06;
        this._sub.triggerAttackRelease('C2', '32n', now, 0.5);
    }

    // 그림자 검기 - dark energy slash (thick layers)
    _playSlash() {
        const now = Tone.now();
        // Blade FM ring
        this._fm.harmonicity.value = 3;
        this._fm.modulationIndex.value = 12;
        this._fm.envelope.decay = 0.04;
        this._fm.triggerAttackRelease('A5', '32n', now, 0.3);
        // Energy sweep noise (low → high)
        this._noiseFilter.frequency.setValueAtTime(500, now);
        this._noiseFilter.frequency.rampTo(7000, 0.3);
        this._noiseFilter.type = 'bandpass';
        this._noise.envelope.decay = 0.3;
        this._noise.envelope.release = 0.05;
        this._noise.triggerAttackRelease('4n', now, 0.6);
        // Deep sub impact
        this._sub.envelope.decay = 0.2;
        this._sub.triggerAttackRelease('A1', '8n', now, 0.7);
        // Delayed resonance
        this._fmWet.harmonicity.value = 2;
        this._fmWet.modulationIndex.value = 5;
        this._fmWet.triggerAttackRelease('D4', '8n', now + 0.05, 0.2);
        // High shimmer
        this._toneWet.triggerAttackRelease('A6', '16n', now + 0.08, 0.1);
    }

    // 지배자의 권능 - telekinesis energy burst
    _playAuthority() {
        const now = Tone.now();
        // Charge FM rising
        this._fm.harmonicity.value = 2;
        this._fm.modulationIndex.value = 8;
        this._fm.envelope.attack = 0.05;
        this._fm.envelope.decay = 0.2;
        this._fm.triggerAttackRelease('G3', '4n', now, 0.4);
        this._fm.envelope.attack = 0.005; // reset
        // Sub rumble
        this._sub.envelope.decay = 0.25;
        this._sub.triggerAttackRelease('E1', '4n', now, 0.5);
        // Psionic noise
        this._noiseFilter.frequency.setValueAtTime(800, now);
        this._noiseFilter.frequency.rampTo(3000, 0.3);
        this._noise.envelope.attack = 0.08;
        this._noise.envelope.decay = 0.3;
        this._noise.triggerAttackRelease('4n', now, 0.3);
        this._noise.envelope.attack = 0.005; // reset
        // Impact burst
        this._impact.triggerAttackRelease('C2', '16n', now + 0.18, 0.7);
        // Reverb tail
        this._fmWet.triggerAttackRelease('C4', '8n', now + 0.2, 0.15);
    }

    // 용의 공포 - deep dragon growl
    _playFear() {
        const now = Tone.now();
        // Deep FM growl
        this._fm.harmonicity.value = 1.5;
        this._fm.modulationIndex.value = 6;
        this._fm.envelope.attack = 0.08;
        this._fm.envelope.decay = 0.4;
        this._fm.envelope.sustain = 0.2;
        this._fm.envelope.release = 0.3;
        this._fm.triggerAttackRelease('A1', '2n', now, 0.4);
        // Sub bass drone
        this._sub.envelope.decay = 0.5;
        this._sub.triggerAttackRelease('D1', '2n', now, 0.5);
        // Dark filtered noise
        this._noiseFilter.frequency.setValueAtTime(400, now);
        this._noiseFilter.frequency.rampTo(80, 0.5);
        this._noiseFilter.type = 'lowpass';
        this._noise.envelope.decay = 0.5;
        this._noise.triggerAttackRelease('2n', now, 0.25);
        // Dissonant beating
        this._toneWet.triggerAttackRelease(93, '2n', now, 0.15);
        // Reset
        setTimeout(() => {
            this._fm.envelope.attack = 0.005;
            this._fm.envelope.sustain = 0;
            this._noiseFilter.type = 'bandpass';
            this._noise.envelope.attack = 0.005;
        }, 1200);
    }

    // ========== COMBAT SOUNDS ==========

    // 적 타격 - punchy impact
    _playHit() {
        const now = Tone.now();
        this._impact.triggerAttackRelease('G1', '32n', now, 0.6);
        this._noiseFilter.frequency.setValueAtTime(2000, now);
        this._noise.envelope.decay = 0.04;
        this._noise.triggerAttackRelease('64n', now, 0.5);
        this._metal.frequency = 700;
        this._metal.envelope.decay = 0.04;
        this._metal.triggerAttackRelease('64n', now, 0.1);
    }

    // 적 처치 - burst + reward chime
    _playKill() {
        const now = Tone.now();
        // Burst
        this._noiseFilter.frequency.setValueAtTime(2500, now);
        this._noiseFilter.frequency.rampTo(400, 0.06);
        this._noise.envelope.decay = 0.06;
        this._noise.triggerAttackRelease('32n', now, 0.5);
        // Body pop
        this._impact.triggerAttackRelease('E1', '32n', now, 0.5);
        // Reward chime
        this._tone.triggerAttackRelease('A5', '32n', now + 0.03, 0.2);
        this._toneWet.triggerAttackRelease('E6', '16n', now + 0.05, 0.1);
    }

    // 플레이어 피격 - heavy slam + warning
    _playPlayerHit() {
        const now = Tone.now();
        // Heavy impact
        this._impact.pitchDecay = 0.06;
        this._impact.triggerAttackRelease('D1', '16n', now, 0.8);
        this._impact.pitchDecay = 0.04; // reset
        // Cracking noise
        this._noiseFilter.frequency.setValueAtTime(1500, now);
        this._noiseFilter.frequency.rampTo(300, 0.06);
        this._noise.envelope.decay = 0.06;
        this._noise.triggerAttackRelease('16n', now, 0.6);
        // FM distortion layer
        this._fm.harmonicity.value = 4;
        this._fm.modulationIndex.value = 15;
        this._fm.triggerAttackRelease('D2', '16n', now, 0.35);
        // Sub thud
        this._sub.triggerAttackRelease('A0', '16n', now, 0.5);
    }

    // ========== REWARD SOUNDS ==========

    // XP 획득 - bell ting
    _playXP() {
        const now = Tone.now();
        this._fm.harmonicity.value = 3;
        this._fm.modulationIndex.value = 5;
        this._fm.envelope.decay = 0.04;
        this._fm.triggerAttackRelease('A6', '64n', now, 0.15);
        this._tone.triggerAttackRelease('E7', '64n', now + 0.025, 0.1);
    }

    // 레벨업 - ascending fanfare chord
    _playLevelUp() {
        const now = Tone.now();
        const notes = ['C5', 'E5', 'G5', 'C6'];
        notes.forEach((note, i) => {
            this._fmPoly.triggerAttackRelease(note, '4n', now + i * 0.085, 0.35);
        });
        // Bright shimmer
        this._toneWet.triggerAttackRelease('C7', '8n', now + 0.34, 0.08);
        // Sub warmth
        this._sub.envelope.decay = 0.4;
        this._sub.triggerAttackRelease('C3', '4n', now, 0.2);
    }

    // 랭크업 - heroic ascending arpeggio
    _playRankUp() {
        const now = Tone.now();
        const notes = ['A4', 'C#5', 'E5', 'A5', 'C#6', 'E6'];
        notes.forEach((note, i) => {
            this._fmPoly.triggerAttackRelease(note, '4n', now + i * 0.065, 0.3);
        });
        // Ethereal pad
        this._toneWet.triggerAttackRelease('A3', '2n', now + 0.2, 0.1);
        // Power burst
        this._impact.triggerAttackRelease('A1', '8n', now + 0.4, 0.35);
        // Shimmer noise
        this._noiseFilter.frequency.setValueAtTime(5000, now + 0.38);
        this._noise.envelope.decay = 0.3;
        this._noise.triggerAttackRelease('4n', now + 0.38, 0.12);
    }

    // ========== EVENT SOUNDS ==========

    // 시스템 메시지 - digital double beep
    _playSystem() {
        const now = Tone.now();
        this._fm.harmonicity.value = 3;
        this._fm.modulationIndex.value = 4;
        this._fm.envelope.decay = 0.04;
        this._fm.triggerAttackRelease('A5', '32n', now, 0.2);
        this._fm.triggerAttackRelease('C#6', '32n', now + 0.055, 0.15);
    }

    // ARISE! - epic dramatic summon
    _playArise() {
        const now = Tone.now();
        // Deep rumble
        this._sub.envelope.attack = 0.15;
        this._sub.envelope.decay = 0.8;
        this._sub.envelope.sustain = 0.3;
        this._sub.envelope.release = 0.5;
        this._sub.triggerAttackRelease('C1', '1n', now, 0.6);
        // Rising FM
        this._fm.harmonicity.value = 2;
        this._fm.modulationIndex.value = 6;
        this._fm.envelope.attack = 0.1;
        this._fm.envelope.decay = 0.5;
        this._fm.triggerAttackRelease('E2', '2n', now + 0.1, 0.3);
        // Noise buildup
        this._noiseFilter.frequency.setValueAtTime(150, now);
        this._noiseFilter.frequency.rampTo(4000, 1.2);
        this._noiseFilter.type = 'lowpass';
        this._noise.envelope.attack = 0.3;
        this._noise.envelope.decay = 1.0;
        this._noise.triggerAttackRelease('1n', now, 0.3);
        // Dissonant tension
        this._toneWet.triggerAttackRelease(130, '2n', now + 0.2, 0.15);
        // IMPACT at 0.8s
        setTimeout(() => {
            try {
                const t = Tone.now();
                this._impact.triggerAttackRelease('C1', '8n', t, 0.9);
                this._metal.frequency = 200;
                this._metal.envelope.decay = 0.3;
                this._metal.triggerAttackRelease('4n', t, 0.3);
                this._noiseFilter.frequency.setValueAtTime(1200, t);
                this._noise.envelope.decay = 0.2;
                this._noise.triggerAttackRelease('8n', t, 0.6);
            } catch (e) { /* silent */ }
        }, 800);
        // Ethereal afterglow
        setTimeout(() => {
            try {
                const t = Tone.now();
                this._fmWet.triggerAttackRelease('C4', '2n', t, 0.12);
                this._toneWet.triggerAttackRelease('G4', '2n', t, 0.08);
            } catch (e) { /* silent */ }
        }, 1000);
        // Reset envelopes
        setTimeout(() => {
            this._sub.envelope.attack = 0.003;
            this._sub.envelope.sustain = 0;
            this._fm.envelope.attack = 0.005;
            this._noise.envelope.attack = 0.005;
            this._noiseFilter.type = 'bandpass';
        }, 2000);
    }

    // 보스 등장 - ominous boss entrance
    _playBossAppear() {
        const now = Tone.now();
        // Ground shake FM
        this._fm.harmonicity.value = 1.5;
        this._fm.modulationIndex.value = 8;
        this._fm.envelope.attack = 0.08;
        this._fm.envelope.decay = 0.35;
        this._fm.triggerAttackRelease('C#2', '2n', now, 0.5);
        // Sub bass
        this._sub.envelope.decay = 0.6;
        this._sub.triggerAttackRelease('B0', '2n', now, 0.6);
        // Tension noise
        this._noiseFilter.frequency.setValueAtTime(500, now);
        this._noiseFilter.frequency.rampTo(150, 0.5);
        this._noise.envelope.decay = 0.5;
        this._noise.triggerAttackRelease('2n', now, 0.25);
        // Brass stab 1
        setTimeout(() => {
            try {
                this._impact.triggerAttackRelease('E1', '8n', Tone.now(), 0.6);
                this._fmWet.triggerAttackRelease('E2', '8n', Tone.now(), 0.3);
            } catch (e) { /* silent */ }
        }, 280);
        // Brass stab 2 (deeper)
        setTimeout(() => {
            try {
                this._impact.triggerAttackRelease('C1', '4n', Tone.now(), 0.7);
                this._noiseFilter.frequency.setValueAtTime(600, Tone.now());
                this._noise.envelope.decay = 0.15;
                this._noise.triggerAttackRelease('8n', Tone.now(), 0.35);
            } catch (e) { /* silent */ }
        }, 550);
        // Reset
        setTimeout(() => {
            this._fm.envelope.attack = 0.005;
        }, 1200);
    }

    // 경고 - sharp alarm
    _playWarning() {
        const now = Tone.now();
        this._fm.harmonicity.value = 3;
        this._fm.modulationIndex.value = 8;
        this._fm.triggerAttackRelease('E5', '32n', now, 0.3);
        this._fm.triggerAttackRelease('E5', '32n', now + 0.16, 0.3);
    }

    // 포션 - bubble + healing
    _playPotion() {
        const now = Tone.now();
        const notes = ['C5', 'E5', 'G5', 'B5'];
        notes.forEach((note, i) => {
            this._fmPoly.triggerAttackRelease(note, '16n', now + i * 0.055, 0.2);
        });
        // Healing shimmer noise
        this._noiseFilter.frequency.setValueAtTime(4000, now);
        this._noise.envelope.decay = 0.2;
        this._noise.triggerAttackRelease('8n', now, 0.08);
        // Warm resolve
        this._toneWet.triggerAttackRelease('E5', '8n', now + 0.2, 0.12);
    }

    // UI 선택 - quick click
    _playSelect() {
        const now = Tone.now();
        this._fm.harmonicity.value = 3;
        this._fm.modulationIndex.value = 3;
        this._fm.envelope.decay = 0.03;
        this._fm.triggerAttackRelease('E5', '64n', now, 0.2);
    }

    // 퀘스트 완료 - achievement jingle
    _playQuest() {
        const now = Tone.now();
        const notes = ['E5', 'A5', 'C#6', 'E6'];
        notes.forEach((note, i) => {
            this._fmPoly.triggerAttackRelease(note, '8n', now + i * 0.08, 0.25);
        });
        // Shimmer
        this._toneWet.triggerAttackRelease('E7', '16n', now + 0.3, 0.06);
    }

    // 던전 브레이크 - earthquake + alarm
    _playDungeonBreak() {
        const now = Tone.now();
        // Earthquake rumble
        this._sub.envelope.attack = 0.2;
        this._sub.envelope.decay = 0.8;
        this._sub.envelope.sustain = 0.3;
        this._sub.envelope.release = 0.6;
        this._sub.triggerAttackRelease('B0', '1n', now, 0.7);
        // Debris noise
        this._noiseFilter.frequency.setValueAtTime(400, now);
        this._noiseFilter.frequency.rampTo(60, 1.0);
        this._noiseFilter.type = 'lowpass';
        this._noise.envelope.attack = 0.2;
        this._noise.envelope.decay = 0.8;
        this._noise.triggerAttackRelease('1n', now, 0.4);
        // Alarm siren
        setTimeout(() => {
            try {
                const t = Tone.now();
                this._fm.harmonicity.value = 3;
                this._fm.modulationIndex.value = 10;
                this._fm.triggerAttackRelease('E4', '4n', t, 0.25);
                setTimeout(() => this._fm.triggerAttackRelease('B3', '4n', Tone.now(), 0.25), 300);
            } catch (e) { /* silent */ }
        }, 350);
        // Structural collapse
        setTimeout(() => {
            try {
                const t = Tone.now();
                this._impact.triggerAttackRelease('C1', '4n', t, 0.8);
                this._metal.frequency = 150;
                this._metal.envelope.decay = 0.35;
                this._metal.triggerAttackRelease('4n', t, 0.2);
            } catch (e) { /* silent */ }
        }, 650);
        // Reset
        setTimeout(() => {
            this._sub.envelope.attack = 0.003;
            this._sub.envelope.sustain = 0;
            this._noise.envelope.attack = 0.005;
            this._noiseFilter.type = 'bandpass';
        }, 2500);
    }

    // ========== INTRO MUSIC ==========

    playIntroMusic() {
        if (!this._initialized || !this.enabled) return;
        this.resume();
        this.stopIntroMusic();
        this._introNodes = [];
        this._introIntervals = [];

        try {
            // Master gain for intro (fade in)
            const introGain = new Tone.Volume(-30).connect(this._comp);
            introGain.volume.rampTo(-10, 4);
            this._introGain = introGain;

            // 1. Low drone - filtered sawtooth C2
            const droneOsc = new Tone.Oscillator({ frequency: 65.41, type: 'sawtooth' });
            const droneFilter = new Tone.Filter({ frequency: 350, type: 'lowpass', Q: 6 });
            const droneVol = new Tone.Volume(-10);
            droneOsc.connect(droneFilter);
            droneFilter.connect(droneVol);
            droneVol.connect(introGain);
            // LFO on filter
            const lfo = new Tone.LFO({ frequency: 0.1, min: 200, max: 550 });
            lfo.connect(droneFilter.frequency);
            lfo.start();
            droneOsc.start();
            this._introNodes.push(droneOsc, lfo);

            // 2. Sub bass sine C1
            const subOsc = new Tone.Oscillator({ frequency: 32.7, type: 'sine' });
            const subVol = new Tone.Volume(-16);
            subOsc.connect(subVol);
            subVol.connect(introGain);
            subOsc.start();
            this._introNodes.push(subOsc);

            // 3. Minor drone Eb2
            const drone2 = new Tone.Oscillator({ frequency: 77.78, type: 'sine' });
            const drone2Vol = new Tone.Volume(-18);
            drone2.connect(drone2Vol);
            drone2Vol.connect(introGain);
            drone2.start();
            this._introNodes.push(drone2);

            // 4. Dark FM arpeggio (C minor pentatonic)
            const arpSynth = new Tone.FMSynth({
                harmonicity: 3, modulationIndex: 5,
                envelope: { attack: 0.03, decay: 0.15, sustain: 0.08, release: 0.25 },
            });
            const arpReverb = new Tone.Freeverb({ roomSize: 0.7, dampening: 2500, wet: 0.35 });
            arpSynth.connect(arpReverb);
            arpReverb.connect(introGain);
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

            // 5. Subtle percussion noise
            const percNoise = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
            });
            const percFilter = new Tone.Filter({ frequency: 700, type: 'bandpass', Q: 3 });
            percNoise.connect(percFilter);
            percFilter.connect(introGain);

            const percInterval = setInterval(() => {
                if (!this._initialized) return;
                try {
                    percFilter.frequency.value = 600 + Math.random() * 400;
                    percNoise.triggerAttackRelease('64n', Tone.now(), 0.15);
                } catch (e) { /* silent */ }
            }, 2400);
            this._introIntervals.push(percInterval);

            // 6. Tension riser every 8 seconds
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
        if (this._introNodes) {
            this._introNodes.forEach(node => {
                try { node.stop(); node.dispose(); } catch (e) { /* silent */ }
            });
            this._introNodes = [];
        }
        if (this._introArpSynth) {
            try { this._introArpSynth.dispose(); } catch (e) { /* silent */ }
            this._introArpSynth = null;
        }
        if (this._introGain) {
            try {
                this._introGain.volume.rampTo(-60, 0.5);
                setTimeout(() => {
                    try { this._introGain.dispose(); } catch (e) { /* silent */ }
                }, 600);
            } catch (e) { /* silent */ }
            this._introGain = null;
        }
    }

    toggleSound() {
        this.enabled = !this.enabled;
        if (this._masterVol) {
            this._masterVol.volume.value = this.enabled ? -8 : -Infinity;
        }
        return this.enabled;
    }
}
