/**
 * Web Audio API 기반 프로시저럴 사운드 매니저
 * 필터, ADSR 엔벨로프, 레이어드 합성으로 리얼한 효과음 생성
 */
export class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 0.35;
        this._initialized = false;
        this._masterGain = null;
        this._compressor = null;
    }

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            // Master chain: compressor → gain → output
            this._compressor = this.ctx.createDynamicsCompressor();
            this._compressor.threshold.value = -24;
            this._compressor.knee.value = 12;
            this._compressor.ratio.value = 4;
            this._masterGain = this.ctx.createGain();
            this._masterGain.gain.value = this.volume;
            this._compressor.connect(this._masterGain);
            this._masterGain.connect(this.ctx.destination);
            this._initialized = true;

            // 페이지 이탈/탭 전환 시 오디오 자동 일시정지
            this._onVisibilityChange = () => {
                if (!this.ctx) return;
                if (document.hidden) {
                    this.ctx.suspend();
                } else if (this.enabled) {
                    this.ctx.resume();
                }
            };
            document.addEventListener('visibilitychange', this._onVisibilityChange);
        } catch (e) {
            this.enabled = false;
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    get out() { return this._compressor || this.ctx.destination; }

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

    // --- Helper: create oscillator with ADSR envelope ---
    _osc(type, freq, { attack = 0.01, decay = 0.1, sustain = 0, release = 0.1, vol = 0.5, detune = 0 } = {}) {
        const t = this.ctx.currentTime;
        const dur = attack + decay + release;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        if (detune) osc.detune.value = detune;
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(vol, t + attack);
        gain.gain.linearRampToValueAtTime(vol * sustain, t + attack + decay);
        gain.gain.linearRampToValueAtTime(0.001, t + dur);
        osc.connect(gain);
        gain.connect(this.out);
        osc.start(t);
        osc.stop(t + dur + 0.05);
        return { osc, gain, dur };
    }

    // --- Helper: frequency sweep oscillator ---
    _sweep(type, startFreq, endFreq, duration, vol = 0.3) {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, t);
        osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.connect(gain);
        gain.connect(this.out);
        osc.start(t);
        osc.stop(t + duration + 0.05);
    }

    // --- Helper: filtered noise burst ---
    _noise(duration, { vol = 0.3, filterType = 'bandpass', freq = 2000, Q = 1, freqEnd = null } = {}) {
        const t = this.ctx.currentTime;
        const sr = this.ctx.sampleRate;
        const len = Math.floor(sr * duration);
        const buf = this.ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        const filter = this.ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(freq, t);
        if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
        filter.Q.value = Q;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.out);
        src.start(t);
    }

    // --- Helper: metallic impact (layered sines at inharmonic ratios) ---
    _metalImpact(baseFreq, vol = 0.3, decay = 0.15) {
        const ratios = [1, 2.76, 4.07, 5.48];
        const t = this.ctx.currentTime;
        for (const r of ratios) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = baseFreq * r;
            gain.gain.setValueAtTime(vol / (r * 0.8), t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + decay / r);
            osc.connect(gain);
            gain.connect(this.out);
            osc.start(t);
            osc.stop(t + decay + 0.05);
        }
    }

    // ========== WEAPON SOUNDS ==========

    // 단검 베기 - 금속 칼날이 공기를 가르는 소리 + 임팩트
    _playDagger() {
        // 1. 칼바람 swoosh (고주파 노이즈 스윕)
        this._noise(0.12, { vol: 0.25, filterType: 'bandpass', freq: 3000, freqEnd: 8000, Q: 0.8 });
        // 2. 칼날 금속음
        this._metalImpact(800, 0.12, 0.08);
        // 3. 저주파 임팩트 (베기 느낌)
        this._osc('sine', 90, { attack: 0.005, decay: 0.06, sustain: 0, release: 0.04, vol: 0.25 });
    }

    // 그림자 검기 - 검의 기가 뻗어나가는 에너지 슬래시
    _playSlash() {
        // 1. 날카로운 검명 (금속 공명 시작)
        this._osc('sine', 1200, { attack: 0.003, decay: 0.04, sustain: 0, release: 0.03, vol: 0.15 });
        this._osc('triangle', 2400, { attack: 0.003, decay: 0.03, sustain: 0, release: 0.02, vol: 0.06 });
        // 2. 에너지 방출 swoosh (저→고주파 스윕, 기가 뻗어나가는 느낌)
        this._noise(0.35, { vol: 0.3, filterType: 'bandpass', freq: 600, freqEnd: 6000, Q: 0.7 });
        this._sweep('sawtooth', 150, 800, 0.3, 0.18);
        // 3. 검기 공명 (에너지가 공간을 가르는 잔향)
        setTimeout(() => {
            this._sweep('sine', 400, 1200, 0.25, 0.12);
            this._osc('sine', 220, { attack: 0.02, decay: 0.15, sustain: 0.1, release: 0.2, vol: 0.1 });
        }, 60);
        // 4. 깊은 서브베이스 임팩트 (무게감)
        this._osc('sine', 55, { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1, vol: 0.3 });
        // 5. 에너지 잔향 테일 (기가 사라지는 여운)
        setTimeout(() => {
            this._noise(0.25, { vol: 0.08, filterType: 'bandpass', freq: 3000, freqEnd: 800, Q: 2 });
            this._osc('sine', 600, { attack: 0.01, decay: 0.15, sustain: 0, release: 0.15, vol: 0.05 });
        }, 150);
    }

    // 지배자의 권능 - 텔레키네시스 에너지 방출
    _playAuthority() {
        // 에너지 차징 → 방출
        this._sweep('sine', 200, 600, 0.3, 0.25);
        this._sweep('sawtooth', 150, 400, 0.25, 0.1);
        this._noise(0.35, { vol: 0.15, filterType: 'lowpass', freq: 1500, freqEnd: 500, Q: 2 });
        setTimeout(() => {
            this._osc('sine', 350, { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.15, vol: 0.2 });
            this._noise(0.15, { vol: 0.2, filterType: 'bandpass', freq: 2000, Q: 3 });
        }, 150);
    }

    // 용의 공포 - 깊은 으르렁 + 에너지 파동
    _playFear() {
        this._sweep('sawtooth', 60, 30, 0.6, 0.2);
        this._osc('sine', 80, { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.3, vol: 0.15 });
        this._noise(0.5, { vol: 0.1, filterType: 'lowpass', freq: 400, freqEnd: 100, Q: 4 });
    }

    // ========== COMBAT SOUNDS ==========

    // 적 타격 - 묵직한 임팩트
    _playHit() {
        // 저주파 펀치
        this._osc('sine', 80, { attack: 0.003, decay: 0.06, sustain: 0, release: 0.04, vol: 0.3 });
        // 살짝 딱 하는 임팩트 노이즈
        this._noise(0.05, { vol: 0.2, filterType: 'bandpass', freq: 1500, Q: 1.5 });
        // 미세한 금속감
        this._metalImpact(600, 0.06, 0.04);
    }

    // 적 처치 - 짧은 폭발 + 보상감
    _playKill() {
        // 터지는 느낌
        this._noise(0.08, { vol: 0.25, filterType: 'bandpass', freq: 2000, freqEnd: 500, Q: 0.5 });
        // 피치 드롭
        this._sweep('sine', 500, 100, 0.12, 0.2);
        // 보상 톤
        setTimeout(() => {
            this._osc('sine', 880, { attack: 0.005, decay: 0.08, sustain: 0, release: 0.06, vol: 0.1 });
        }, 40);
    }

    // 플레이어 피격 - 위협적인 임팩트
    _playPlayerHit() {
        // 무거운 타격
        this._osc('sine', 60, { attack: 0.003, decay: 0.1, sustain: 0, release: 0.08, vol: 0.35 });
        // 깨지는 노이즈
        this._noise(0.08, { vol: 0.3, filterType: 'lowpass', freq: 3000, freqEnd: 200, Q: 1 });
        // 경고 톤
        this._osc('square', 200, { attack: 0.005, decay: 0.04, sustain: 0, release: 0.05, vol: 0.1 });
    }

    // ========== REWARD SOUNDS ==========

    // XP 획득 - 가벼운 코인 소리
    _playXP() {
        this._osc('sine', 1400, { attack: 0.003, decay: 0.04, sustain: 0, release: 0.03, vol: 0.08 });
        setTimeout(() => {
            this._osc('sine', 1800, { attack: 0.003, decay: 0.04, sustain: 0, release: 0.03, vol: 0.06 });
        }, 25);
    }

    // 레벨업 - 화려한 팡파르
    _playLevelUp() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this._osc('sine', freq, { attack: 0.01, decay: 0.15, sustain: 0.3, release: 0.2, vol: 0.2 });
                this._osc('triangle', freq * 2, { attack: 0.01, decay: 0.1, sustain: 0, release: 0.15, vol: 0.05 });
            }, i * 90);
        });
        // 마지막에 심벌 노이즈
        setTimeout(() => {
            this._noise(0.3, { vol: 0.08, filterType: 'highpass', freq: 6000, Q: 0.5 });
        }, 350);
    }

    // 랭크업 - 장엄한 상승 멜로디
    _playRankUp() {
        const notes = [440, 554, 659, 880, 1047, 1319];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this._osc('sine', freq, { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.25, vol: 0.18 });
                this._osc('triangle', freq * 0.5, { attack: 0.02, decay: 0.15, sustain: 0, release: 0.2, vol: 0.08 });
            }, i * 70);
        });
        // 에너지 윙 사운드
        setTimeout(() => {
            this._sweep('sawtooth', 200, 2000, 0.5, 0.08);
            this._noise(0.4, { vol: 0.06, filterType: 'highpass', freq: 4000, Q: 0.5 });
        }, 400);
    }

    // ========== EVENT SOUNDS ==========

    // 시스템 메시지 - 전자적 알림음
    _playSystem() {
        this._osc('sine', 880, { attack: 0.005, decay: 0.05, sustain: 0.3, release: 0.05, vol: 0.12 });
        setTimeout(() => {
            this._osc('sine', 1100, { attack: 0.005, decay: 0.05, sustain: 0.3, release: 0.05, vol: 0.1 });
        }, 50);
    }

    // ARISE! - 극적인 드라마틱 사운드
    _playArise() {
        // 1. 깊은 럼블
        this._osc('sawtooth', 40, { attack: 0.1, decay: 0.5, sustain: 0.3, release: 0.8, vol: 0.25 });
        this._osc('sine', 60, { attack: 0.1, decay: 0.4, sustain: 0.2, release: 0.6, vol: 0.2 });
        // 2. 상승 에너지
        this._sweep('sine', 80, 800, 1.2, 0.15);
        this._sweep('sawtooth', 60, 600, 1.0, 0.08);
        // 3. 노이즈 빌드업
        this._noise(1.5, { vol: 0.12, filterType: 'lowpass', freq: 200, freqEnd: 3000, Q: 2 });
        // 4. 임팩트 (0.8초 후)
        setTimeout(() => {
            this._osc('square', 100, { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.2, vol: 0.3 });
            this._noise(0.25, { vol: 0.25, filterType: 'bandpass', freq: 1000, Q: 0.5 });
            this._metalImpact(200, 0.15, 0.3);
        }, 800);
    }

    // 보스 등장 - 위압적인 진동음
    _playBossAppear() {
        // 저주파 공명
        this._osc('sawtooth', 45, { attack: 0.1, decay: 0.3, sustain: 0.3, release: 0.4, vol: 0.3 });
        this._osc('sine', 70, { attack: 0.05, decay: 0.2, sustain: 0.2, release: 0.3, vol: 0.2 });
        // 긴장감 노이즈
        this._noise(0.5, { vol: 0.15, filterType: 'lowpass', freq: 600, freqEnd: 200, Q: 3 });
        // 브라스 스탭
        setTimeout(() => {
            this._osc('square', 80, { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.2, vol: 0.2 });
            this._osc('sawtooth', 65, { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.25, vol: 0.15 });
        }, 250);
        // 두 번째 스탭
        setTimeout(() => {
            this._osc('square', 60, { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3, vol: 0.25 });
            this._noise(0.2, { vol: 0.2, filterType: 'bandpass', freq: 800, Q: 1 });
        }, 500);
    }

    // 경고 - 사이렌 느낌
    _playWarning() {
        this._sweep('square', 600, 400, 0.12, 0.15);
        setTimeout(() => this._sweep('square', 600, 400, 0.12, 0.15), 180);
    }

    // 포션 - 버블 + 힐링 톤
    _playPotion() {
        this._osc('sine', 500, { attack: 0.01, decay: 0.08, sustain: 0.2, release: 0.1, vol: 0.15 });
        setTimeout(() => this._osc('sine', 700, { attack: 0.01, decay: 0.08, sustain: 0.1, release: 0.1, vol: 0.12 }), 70);
        setTimeout(() => this._osc('sine', 900, { attack: 0.01, decay: 0.06, sustain: 0, release: 0.1, vol: 0.08 }), 140);
        // 거품 노이즈
        this._noise(0.2, { vol: 0.05, filterType: 'bandpass', freq: 3000, Q: 5 });
    }

    // UI 선택
    _playSelect() {
        this._osc('sine', 660, { attack: 0.003, decay: 0.04, sustain: 0, release: 0.04, vol: 0.12 });
        this._osc('triangle', 1320, { attack: 0.003, decay: 0.03, sustain: 0, release: 0.03, vol: 0.04 });
    }

    // 퀘스트 완료 - 성취감
    _playQuest() {
        const notes = [660, 880, 1100];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this._osc('sine', freq, { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.15, vol: 0.15 });
            }, i * 100);
        });
    }

    // 던전 브레이크 - 지진 + 경고음
    _playDungeonBreak() {
        // 지진 럼블
        this._osc('sawtooth', 30, { attack: 0.2, decay: 0.5, sustain: 0.3, release: 0.8, vol: 0.3 });
        this._noise(1.0, { vol: 0.2, filterType: 'lowpass', freq: 300, freqEnd: 80, Q: 2 });
        // 경고 사이렌
        setTimeout(() => {
            this._sweep('square', 400, 800, 0.3, 0.15);
            setTimeout(() => this._sweep('square', 800, 400, 0.3, 0.15), 300);
        }, 300);
        // 임팩트
        setTimeout(() => {
            this._osc('sine', 40, { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.4, vol: 0.35 });
            this._noise(0.3, { vol: 0.25, filterType: 'bandpass', freq: 500, Q: 0.5 });
        }, 600);
    }

    // ========== INTRO MUSIC ==========

    // Epic ominous ambient loop for menu screen
    playIntroMusic() {
        if (!this._initialized || !this.enabled) return;
        this.stopIntroMusic(); // clean previous
        this._introNodes = [];
        this._introIntervals = [];
        const t = this.ctx.currentTime;
        const introGain = this.ctx.createGain();
        introGain.gain.setValueAtTime(0.001, t);
        introGain.gain.linearRampToValueAtTime(0.25, t + 3);
        introGain.connect(this.out);
        this._introGain = introGain;

        // 1. Low drone pad - sawtooth C2 (~65Hz) with filter LFO sweep
        const droneOsc = this.ctx.createOscillator();
        droneOsc.type = 'sawtooth';
        droneOsc.frequency.value = 65.41; // C2
        const droneFilter = this.ctx.createBiquadFilter();
        droneFilter.type = 'lowpass';
        droneFilter.frequency.value = 400;
        droneFilter.Q.value = 5;
        const droneLfo = this.ctx.createOscillator();
        droneLfo.type = 'sine';
        droneLfo.frequency.value = 0.15; // slow sweep
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 350; // LFO depth
        droneLfo.connect(lfoGain);
        lfoGain.connect(droneFilter.frequency);
        const droneVol = this.ctx.createGain();
        droneVol.gain.value = 0.35;
        droneOsc.connect(droneFilter);
        droneFilter.connect(droneVol);
        droneVol.connect(introGain);
        droneOsc.start(t);
        droneLfo.start(t);
        this._introNodes.push(droneOsc, droneLfo);

        // 2. Secondary drone - sine, fifth above: G2 (~98Hz)
        const drone2Osc = this.ctx.createOscillator();
        drone2Osc.type = 'sine';
        drone2Osc.frequency.value = 98.00; // G2
        const drone2Vol = this.ctx.createGain();
        drone2Vol.gain.value = 0.18;
        drone2Osc.connect(drone2Vol);
        drone2Vol.connect(introGain);
        drone2Osc.start(t);
        this._introNodes.push(drone2Osc);

        // 3. Arpeggiated notes in C minor pentatonic
        const notes = [130.81, 155.56, 196.00, 233.08, 261.63]; // C3, Eb3, G3, Bb3, C4
        let noteIndex = 0;
        const arpInterval = setInterval(() => {
            if (!this._initialized || !this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                const noteOsc = this.ctx.createOscillator();
                noteOsc.type = 'sine';
                noteOsc.frequency.value = notes[noteIndex % notes.length];
                const noteGain = this.ctx.createGain();
                // ADSR envelope for short note
                noteGain.gain.setValueAtTime(0.001, now);
                noteGain.gain.linearRampToValueAtTime(0.18, now + 0.05);   // attack
                noteGain.gain.linearRampToValueAtTime(0.10, now + 0.15);   // decay/sustain
                noteGain.gain.linearRampToValueAtTime(0.001, now + 0.45);  // release
                noteOsc.connect(noteGain);
                noteGain.connect(introGain);
                noteOsc.start(now);
                noteOsc.stop(now + 0.5);
                noteIndex++;
            } catch (e) { /* silent */ }
        }, 500); // 120 BPM = 500ms per beat
        this._introIntervals.push(arpInterval);

        // 4. Subtle percussion - filtered noise hits
        const percInterval = setInterval(() => {
            if (!this._initialized || !this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                const sr = this.ctx.sampleRate;
                const len = Math.floor(sr * 0.08);
                const buf = this.ctx.createBuffer(1, len, sr);
                const data = buf.getChannelData(0);
                for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
                const noiseSrc = this.ctx.createBufferSource();
                noiseSrc.buffer = buf;
                const percFilter = this.ctx.createBiquadFilter();
                percFilter.type = 'bandpass';
                percFilter.frequency.value = 800;
                percFilter.Q.value = 2;
                const percGain = this.ctx.createGain();
                percGain.gain.setValueAtTime(0.12, now);
                percGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                noiseSrc.connect(percFilter);
                percFilter.connect(percGain);
                percGain.connect(introGain);
                noiseSrc.start(now);
            } catch (e) { /* silent */ }
        }, 2000); // soft noise hit every 2 seconds
        this._introIntervals.push(percInterval);
    }

    stopIntroMusic() {
        if (this._introIntervals) {
            this._introIntervals.forEach(id => clearInterval(id));
            this._introIntervals = [];
        }
        if (this._introNodes) {
            this._introNodes.forEach(node => {
                try { node.stop(); } catch (e) { /* silent */ }
            });
            this._introNodes = [];
        }
        if (this._introGain) {
            try {
                const t = this.ctx.currentTime;
                this._introGain.gain.linearRampToValueAtTime(0.001, t + 0.5);
            } catch (e) { /* silent */ }
            this._introGain = null;
        }
    }

    toggleSound() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}
