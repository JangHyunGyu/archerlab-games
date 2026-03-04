/**
 * Tone.js 기반 프로시저럴 사운드 매니저
 * FM/AM 합성, 리버브, 컴프레서, 프리셋 신스 풀로 리얼한 게임 사운드 생성
 */
export class SoundManager {
    constructor() {
        this.enabled = true;
        this._initialized = false;
        // Sound throttling: prevents audio glitch from rapid triggers
        this._lastPlayTime = {};
        this._throttleMs = {
            hit: 150, kill: 180, xp: 80, dagger: 150,
            slash: 200, authority: 200, fear: 250,
            playerHit: 250, system: 250, warning: 350,
        };
        // Global limit: max simultaneous sounds to prevent crackling
        this._activeSounds = 0;
        this._maxActiveSounds = 5;
    }

    init() {
        try {
            if (typeof Tone === 'undefined') { this.enabled = false; return; }

            // 오디오 컨텍스트 최적화: 저사양 기기 찌직거림 방지
            // "playback" 힌트 = 큰 버퍼 사용, 안정적 재생 우선 (약간의 지연 허용)
            try {
                Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: 0.1 }));
            } catch (e) { /* silent */ }

            // Effects chain: synths → comp → chorus → masterVol → destination
            this._masterVol = new Tone.Volume(-8).toDestination();
            this._chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.3, wet: 0.1 })
                .connect(this._masterVol).start();
            this._comp = new Tone.Compressor(-24, 4).connect(this._chorus);
            this._reverb = new Tone.Freeverb({ roomSize: 0.55, dampening: 3000, wet: 0.18 }).connect(this._comp);
            // Dedicated delay for spatial FX (weapon trails, echoes)
            this._delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.2, wet: 0.12 }).connect(this._comp);

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

    /**
     * 모든 신스를 무음으로 트리거하여 Web Audio 노드를 사전 활성화 (콜드 스타트 노이즈 방지)
     * 메뉴 화면에서 호출하면 게임 시작 시 찌직거림 없이 깨끗한 사운드 출력
     */
    async warmup() {
        if (!this.enabled || !this._initialized || this._warmedUp) return;
        const savedVol = this._masterVol.volume.value;
        this._masterVol.volume.value = -Infinity;
        try {
            await Tone.start();
            // AudioContext 안정화 대기 후 미래 시점에 스케줄 (타이밍 충돌 방지)
            const now = Tone.now() + 0.1;
            // 각 신스를 개별 try-catch로 트리거 (하나 실패해도 나머지 진행)
            try { this._impact.triggerAttackRelease('C1', '32n', now, 0.01); } catch (e) { /* */ }
            try { this._tone.triggerAttackRelease('C4', '32n', now + 0.01, 0.01); } catch (e) { /* */ }
            try { this._toneWet.triggerAttackRelease('C4', '32n', now + 0.02, 0.01); } catch (e) { /* */ }
            try { this._fm.triggerAttackRelease('C4', '32n', now + 0.03, 0.01); } catch (e) { /* */ }
            try { this._fmWet.triggerAttackRelease('C4', '32n', now + 0.04, 0.01); } catch (e) { /* */ }
            try { this._metal.triggerAttackRelease('32n', now + 0.05, 0.01); } catch (e) { /* */ }
            try { this._noise.triggerAttackRelease('32n', now + 0.06, 0.01); } catch (e) { /* */ }
            try { this._sub.triggerAttackRelease('C2', '32n', now + 0.07, 0.01); } catch (e) { /* */ }
            try { this._poly.triggerAttackRelease('C4', '32n', now + 0.08, 0.01); } catch (e) { /* */ }
            try { this._fmPoly.triggerAttackRelease('C4', '32n', now + 0.09, 0.01); } catch (e) { /* */ }
            await new Promise(resolve => setTimeout(resolve, 300));
            this._warmedUp = true;
        } catch (e) {
            console.warn('SoundManager warmup failed:', e);
        } finally {
            // 에러 발생해도 반드시 볼륨 복원 (이전엔 catch에서 복원 누락 → 영구 무음 버그)
            this._masterVol.volume.value = savedVol;
        }
    }

    get out() { return this._comp; }
    get wet() { return this._reverb; }

    play(soundName) {
        if (!this.enabled || !this._initialized) return;
        // Global active sounds limit
        if (this._activeSounds >= this._maxActiveSounds) return;
        // Throttle: skip if called too soon
        const now = performance.now();
        const cooldown = this._throttleMs[soundName] || 0;
        if (cooldown > 0) {
            const last = this._lastPlayTime[soundName] || 0;
            if (now - last < cooldown) return;
        }
        this._lastPlayTime[soundName] = now;
        this._activeSounds++;
        setTimeout(() => { this._activeSounds = Math.max(0, this._activeSounds - 1); }, 100);
        this.resume();
        // Reset shared synth params to defaults before playing
        this._resetSynths();
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

    // Reset shared synth parameters to defaults (prevents cross-contamination)
    _resetSynths() {
        try {
            // FM synth defaults
            this._fm.harmonicity.value = 3;
            this._fm.modulationIndex.value = 10;
            this._fm.envelope.attack = 0.005;
            this._fm.envelope.decay = 0.1;
            this._fm.envelope.sustain = 0;
            this._fm.envelope.release = 0.1;
            // Sub defaults
            this._sub.envelope.attack = 0.003;
            this._sub.envelope.decay = 0.15;
            this._sub.envelope.sustain = 0;
            this._sub.envelope.release = 0.1;
            // Noise defaults
            this._noise.envelope.attack = 0.005;
            this._noise.envelope.decay = 0.1;
            this._noise.envelope.sustain = 0;
            this._noise.envelope.release = 0.08;
            this._noiseFilter.type = 'bandpass';
            this._noiseFilter.frequency.cancelScheduledValues(Tone.now());
            this._noiseFilter.frequency.value = 2000;
            // Impact defaults
            this._impact.pitchDecay = 0.04;
        } catch (e) { /* silent */ }
    }

    // ========== WEAPON SOUNDS ==========

    // 단검 베기 - swoosh + metallic clink + stereo shimmer
    _playDagger() {
        const now = Tone.now();
        // Fast swoosh (fixed high freq, no rampTo)
        this._noiseFilter.frequency.cancelScheduledValues(now);
        this._noiseFilter.frequency.setValueAtTime(6000, now);
        this._noise.envelope.decay = 0.05;
        this._noise.envelope.release = 0.02;
        this._noise.triggerAttackRelease('16n', now, 0.35);
        // Blade ring (sharp metallic)
        this._metal.frequency = 1100;
        this._metal.envelope.decay = 0.05;
        this._metal.triggerAttackRelease('32n', now + 0.01, 0.3);
        // Sub thud (punch)
        this._sub.envelope.decay = 0.05;
        this._sub.triggerAttackRelease('D2', '32n', now, 0.55);
        // Delayed shimmer for spatial feel
        this._toneWet.triggerAttackRelease('A6', '64n', now + 0.04, 0.06);
    }

    // 그림자 검기 - dark energy slash (thick layers + spatial delay)
    _playSlash() {
        const now = Tone.now();
        // Blade FM ring (brighter)
        this._fm.harmonicity.value = 3.5;
        this._fm.modulationIndex.value = 14;
        this._fm.envelope.decay = 0.05;
        this._fm.triggerAttackRelease('B5', '32n', now, 0.35);
        // Energy sweep noise (cancel previous, short ramp)
        this._noiseFilter.frequency.cancelScheduledValues(now);
        this._noiseFilter.frequency.setValueAtTime(800, now);
        this._noiseFilter.frequency.rampTo(4000, 0.1);
        this._noiseFilter.type = 'bandpass';
        this._noise.envelope.decay = 0.1;
        this._noise.envelope.release = 0.03;
        this._noise.triggerAttackRelease('16n', now, 0.35);
        // Deep sub impact (heavier)
        this._sub.envelope.decay = 0.22;
        this._sub.triggerAttackRelease('G1', '8n', now, 0.75);
        // Dark resonance with delay
        this._fmWet.harmonicity.value = 2;
        this._fmWet.modulationIndex.value = 6;
        this._fmWet.triggerAttackRelease('D4', '8n', now + 0.04, 0.22);
        // High shimmer cascade
        this._toneWet.triggerAttackRelease('B6', '16n', now + 0.06, 0.12);
        this._toneWet.triggerAttackRelease('F#7', '32n', now + 0.1, 0.06);
        // Metal tail
        this._metal.frequency = 1200;
        this._metal.envelope.decay = 0.08;
        this._metal.triggerAttackRelease('16n', now + 0.03, 0.12);
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
        this._noiseFilter.frequency.cancelScheduledValues(now);
        this._noiseFilter.frequency.setValueAtTime(800, now);
        this._noiseFilter.frequency.rampTo(3000, 0.3);
        this._noise.envelope.attack = 0.08;
        this._noise.envelope.decay = 0.3;
        this._noise.triggerAttackRelease('4n', now, 0.25);
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
        this._noiseFilter.frequency.cancelScheduledValues(now);
        this._noiseFilter.frequency.setValueAtTime(400, now);
        this._noiseFilter.frequency.rampTo(80, 0.5);
        this._noiseFilter.type = 'lowpass';
        this._noise.envelope.decay = 0.5;
        this._noise.triggerAttackRelease('2n', now, 0.2);
        // Dissonant beating
        this._toneWet.triggerAttackRelease(93, '2n', now, 0.15);
    }

    // ========== COMBAT SOUNDS ==========

    // 적 타격 - punchy impact with crunch
    _playHit() {
        const now = Tone.now();
        // Heavy membrane hit
        this._impact.triggerAttackRelease('F1', '32n', now, 0.65);
        // Crunch noise (fixed freq, no rampTo to avoid zipper noise)
        this._noiseFilter.frequency.cancelScheduledValues(now);
        this._noiseFilter.frequency.setValueAtTime(1800, now);
        this._noise.envelope.decay = 0.03;
        this._noise.triggerAttackRelease('64n', now, 0.3);
        // Metallic click
        this._metal.frequency = 800;
        this._metal.envelope.decay = 0.03;
        this._metal.triggerAttackRelease('64n', now + 0.005, 0.12);
        // Micro sub thump
        this._sub.envelope.decay = 0.04;
        this._sub.triggerAttackRelease('C2', '64n', now, 0.35);
    }

    // 적 처치 - burst + reward chime + satisfying pop
    _playKill() {
        const now = Tone.now();
        // Visceral burst (fixed freq, no rampTo)
        this._noiseFilter.frequency.cancelScheduledValues(now);
        this._noiseFilter.frequency.setValueAtTime(2200, now);
        this._noise.envelope.decay = 0.04;
        this._noise.triggerAttackRelease('32n', now, 0.3);
        // Body pop impact
        this._impact.triggerAttackRelease('D1', '32n', now, 0.55);
        // Pop pitch (satisfying high click)
        this._fm.harmonicity.value = 5;
        this._fm.modulationIndex.value = 2;
        this._fm.envelope.decay = 0.02;
        this._fm.triggerAttackRelease('C6', '64n', now + 0.01, 0.15);
        // Reward chime (brighter)
        this._tone.triggerAttackRelease('B5', '32n', now + 0.03, 0.22);
        this._toneWet.triggerAttackRelease('F#6', '16n', now + 0.05, 0.12);
    }

    // 플레이어 피격 - heavy slam + warning
    _playPlayerHit() {
        const now = Tone.now();
        // Heavy impact
        this._impact.pitchDecay = 0.06;
        this._impact.triggerAttackRelease('D1', '16n', now, 0.8);
        this._impact.pitchDecay = 0.04; // reset
        // Cracking noise
        this._noiseFilter.frequency.cancelScheduledValues(now);
        this._noiseFilter.frequency.setValueAtTime(1500, now);
        this._noiseFilter.frequency.rampTo(300, 0.06);
        this._noise.envelope.decay = 0.06;
        this._noise.triggerAttackRelease('16n', now, 0.45);
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

    // 레벨업 - ascending fanfare with sparkle
    _playLevelUp() {
        const now = Tone.now();
        const notes = ['C5', 'E5', 'G5', 'C6'];
        notes.forEach((note, i) => {
            this._fmPoly.triggerAttackRelease(note, '4n', now + i * 0.08, 0.38);
        });
        // Sparkle cascade
        this._toneWet.triggerAttackRelease('C7', '16n', now + 0.32, 0.1);
        this._toneWet.triggerAttackRelease('E7', '32n', now + 0.38, 0.06);
        // Sub warmth
        this._sub.envelope.decay = 0.4;
        this._sub.triggerAttackRelease('C3', '4n', now, 0.22);
        // Impact punctuation
        this._impact.triggerAttackRelease('C2', '16n', now + 0.32, 0.3);
        // Shimmer noise
        this._noiseFilter.frequency.setValueAtTime(6000, now + 0.3);
        this._noise.envelope.decay = 0.15;
        this._noise.triggerAttackRelease('8n', now + 0.3, 0.06);
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
        this._noiseFilter.frequency.cancelScheduledValues(now);
        this._noiseFilter.frequency.setValueAtTime(150, now);
        this._noiseFilter.frequency.rampTo(4000, 1.2);
        this._noiseFilter.type = 'lowpass';
        this._noise.envelope.attack = 0.3;
        this._noise.envelope.decay = 1.0;
        this._noise.triggerAttackRelease('1n', now, 0.25);
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
    }

    // 보스 등장 - ominous boss entrance (cinematic)
    _playBossAppear() {
        const now = Tone.now();
        // Ground shake FM (ominous rumble)
        this._fm.harmonicity.value = 1.5;
        this._fm.modulationIndex.value = 10;
        this._fm.envelope.attack = 0.08;
        this._fm.envelope.decay = 0.4;
        this._fm.triggerAttackRelease('C#2', '2n', now, 0.55);
        // Deep sub bass drone
        this._sub.envelope.attack = 0.05;
        this._sub.envelope.decay = 0.7;
        this._sub.triggerAttackRelease('B0', '2n', now, 0.65);
        // Tension noise sweep
        this._noiseFilter.frequency.cancelScheduledValues(now);
        this._noiseFilter.frequency.setValueAtTime(600, now);
        this._noiseFilter.frequency.rampTo(120, 0.6);
        this._noise.envelope.decay = 0.6;
        this._noise.triggerAttackRelease('2n', now, 0.22);
        // Dissonant horn tone
        this._toneWet.triggerAttackRelease('Bb1', '2n', now + 0.05, 0.18);
        // Brass stab 1 (sharp)
        setTimeout(() => {
            try {
                const t = Tone.now();
                this._impact.triggerAttackRelease('E1', '8n', t, 0.65);
                this._fmWet.triggerAttackRelease('E2', '8n', t, 0.35);
                this._metal.frequency = 300;
                this._metal.envelope.decay = 0.12;
                this._metal.triggerAttackRelease('8n', t, 0.15);
            } catch (e) { /* silent */ }
        }, 280);
        // Brass stab 2 (massive)
        setTimeout(() => {
            try {
                const t = Tone.now();
                this._impact.triggerAttackRelease('C1', '4n', t, 0.8);
                this._noiseFilter.frequency.setValueAtTime(700, t);
                this._noise.envelope.decay = 0.18;
                this._noise.triggerAttackRelease('8n', t, 0.4);
                // Minor chord stinger
                this._fmPoly.triggerAttackRelease(['C3', 'Eb3', 'Gb3'], '4n', t, 0.25);
            } catch (e) { /* silent */ }
        }, 550);
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
        this._noiseFilter.frequency.cancelScheduledValues(now);
        this._noiseFilter.frequency.setValueAtTime(400, now);
        this._noiseFilter.frequency.rampTo(60, 1.0);
        this._noiseFilter.type = 'lowpass';
        this._noise.envelope.attack = 0.2;
        this._noise.envelope.decay = 0.8;
        this._noise.triggerAttackRelease('1n', now, 0.35);
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
            this._introNodes.push(droneOsc, lfo, droneFilter, droneVol);

            // 2. Sub bass sine C1
            const subOsc = new Tone.Oscillator({ frequency: 32.7, type: 'sine' });
            const subVol = new Tone.Volume(-16);
            subOsc.connect(subVol);
            subVol.connect(introGain);
            subOsc.start();
            this._introNodes.push(subOsc, subVol);

            // 3. Minor drone Eb2
            const drone2 = new Tone.Oscillator({ frequency: 77.78, type: 'sine' });
            const drone2Vol = new Tone.Volume(-18);
            drone2.connect(drone2Vol);
            drone2Vol.connect(introGain);
            drone2.start();
            this._introNodes.push(drone2, drone2Vol);

            // 4. Dark FM arpeggio (C minor pentatonic)
            const arpSynth = new Tone.FMSynth({
                harmonicity: 3, modulationIndex: 5,
                envelope: { attack: 0.03, decay: 0.15, sustain: 0.08, release: 0.25 },
            });
            arpSynth.connect(this._reverb); // 공유 리버브 재사용
            arpSynth.connect(introGain);    // 드라이 시그널도 믹스
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
            this._introNodes.push(percNoise, percFilter);

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
                try { if (node.stop) node.stop(); } catch (e) { /* silent */ }
                try { node.dispose(); } catch (e) { /* silent */ }
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

    // ========== IN-GAME BGM ==========

    startGameBGM() {
        if (!this._initialized || !this.enabled) return;
        this.resume();
        this.stopGameBGM();
        this._bgmNodes = [];
        this._bgmIntervals = [];

        try {
            // Master gain for game BGM
            const bgmGain = new Tone.Volume(-14).connect(this._comp);
            bgmGain.volume.rampTo(-10, 3);
            this._bgmGain = bgmGain;
            this._bgmTimeouts = [];

            const bpm = 100;
            const beatMs = 60000 / bpm;

            // === 1단계: 드론 + 서브베이스 (즉시) ===
            // 1. Dark ambient drone — Cm (C + Eb)
            const droneOsc = new Tone.Oscillator({ frequency: 65.41, type: 'triangle' });
            const droneFilter = new Tone.Filter({ frequency: 280, type: 'lowpass', Q: 4 });
            const droneVol = new Tone.Volume(-12);
            droneOsc.connect(droneFilter);
            droneFilter.connect(droneVol);
            droneVol.connect(bgmGain);
            const droneLfo = new Tone.LFO({ frequency: 0.06, min: 180, max: 400 });
            droneLfo.connect(droneFilter.frequency);
            droneLfo.start();
            droneOsc.start();
            this._bgmNodes.push(droneOsc, droneFilter, droneVol, droneLfo);

            // 2. Sub bass pulse
            const subOsc = new Tone.Oscillator({ frequency: 32.7, type: 'sine' });
            const subVol = new Tone.Volume(-18);
            const subLfo = new Tone.LFO({ frequency: 0.5, min: -22, max: -14 });
            subOsc.connect(subVol);
            subVol.connect(bgmGain);
            subLfo.connect(subVol.volume);
            subLfo.start();
            subOsc.start();
            this._bgmNodes.push(subOsc, subVol, subLfo);

            // === 2단계: 킥 + 하이햇 (500ms 후) ===
            this._bgmTimeouts.push(setTimeout(() => {
                if (!this._initialized) return;
                try {
                    // 3. Battle rhythm — kick pattern
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

                    // 6. Hi-hat texture
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

            // === 3단계: 아르페지오 + 패드 (1200ms 후) ===
            this._bgmTimeouts.push(setTimeout(() => {
                if (!this._initialized) return;
                try {
                    // 4. Dark arpeggio
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

                    // 5. Atmospheric pad layer
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
            this._masterVol.volume.value = this.enabled ? -8 : -Infinity;
        }
        return this.enabled;
    }
}
