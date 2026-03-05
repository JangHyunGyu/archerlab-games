// Sound Manager using Tone.js - Clean & Polished
class SoundManager {
    constructor() {
        this.initialized = false;
        this.muted = false;
        this.volume = 0.5;
        this.cooldowns = {};
    }

    // 쿨다운 체크: 같은 사운드가 너무 빨리 재트리거되는 것을 방지
    canPlay(id, minInterval) {
        const now = performance.now();
        if (this.cooldowns[id] && now - this.cooldowns[id] < minInterval) return false;
        this.cooldowns[id] = now;
        return true;
    }

    async init() {
        if (this.initialized) return;
        try {
            await Tone.start();

            // 마스터 체인: 컴프레서 + 리미터로 클리핑 방지
            this.compressor = new Tone.Compressor({
                threshold: -20,
                ratio: 4,
                attack: 0.003,
                release: 0.1,
            }).toDestination();

            this.limiter = new Tone.Limiter(-3).connect(this.compressor);

            // 배구공 타격음: 멤브레인(둥) + 스냅 노이즈(탁) + 톤 레이어
            this.hitMembrane = new Tone.MembraneSynth({
                pitchDecay: 0.008,
                octaves: 2,
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
            }).connect(this.limiter);

            this.hitSnap = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.001, decay: 0.015, sustain: 0, release: 0.01 },
            });
            this.hitSnapFilter = new Tone.Filter(4500, 'bandpass', -12).connect(this.limiter);
            this.hitSnap.connect(this.hitSnapFilter);

            this.hitBody = new Tone.NoiseSynth({
                noise: { type: 'pink' },
                envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.03 },
            });
            this.hitBodyFilter = new Tone.Filter(1200, 'lowpass').connect(this.limiter);
            this.hitBody.connect(this.hitBodyFilter);

            // 점프: 부드러운 슈웅
            this.jumpSynth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.06, sustain: 0, release: 0.03 },
            }).connect(this.limiter);

            // 득점 팡파레
            this.scoreSynth = new Tone.PolySynth(Tone.Synth, {
                maxPolyphony: 6,
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.02, decay: 0.25, sustain: 0.05, release: 0.3 },
            }).connect(this.limiter);

            // 벽 바운스
            this.wallNoise = new Tone.NoiseSynth({
                noise: { type: 'pink' },
                envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
            });
            this.wallFilter = new Tone.Filter(600, 'lowpass').connect(this.limiter);
            this.wallNoise.connect(this.wallFilter);

            // 네트 바운스
            this.netSynth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.03 },
            }).connect(this.limiter);

            // 바닥 착지
            this.floorNoise = new Tone.NoiseSynth({
                noise: { type: 'brown' },
                envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
            });
            this.floorFilter = new Tone.Filter(400, 'lowpass').connect(this.limiter);
            this.floorNoise.connect(this.floorFilter);

            // 게임오버
            this.gameOverSynth = new Tone.PolySynth(Tone.Synth, {
                maxPolyphony: 8,
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.05, decay: 0.4, sustain: 0.15, release: 0.5 },
            });
            this.gameOverReverb = new Tone.Reverb(2).connect(this.limiter);
            this.gameOverSynth.connect(this.gameOverReverb);

            // UI
            this.uiSynth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.08, sustain: 0, release: 0.08 },
            }).connect(this.limiter);

            this.updateVolume();
            this.initialized = true;
        } catch (e) {
            console.warn('Sound init failed:', e);
        }
    }

    updateVolume() {
        const db = this.muted ? -Infinity : Tone.gainToDb(this.volume);
        Tone.getDestination().volume.value = db;
    }

    setMuted(muted) {
        this.muted = muted;
        this.updateVolume();
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        this.updateVolume();
    }

    playHit(intensity = 1) {
        if (!this.initialized || this.muted) return;
        if (!this.canPlay('hit', 50)) return;
        try {
            const note = 'C' + (2 + Math.floor(intensity * 2));
            // 멤브레인: 둥 하는 임팩트
            this.hitMembrane.volume.value = -16 + intensity * 5;
            this.hitMembrane.triggerAttackRelease(note, 0.06);
            // 스냅: 탁 하는 고음 어택
            this.hitSnap.volume.value = -20 + intensity * 4;
            this.hitSnap.triggerAttackRelease(0.012);
            // 바디: 묵직한 중저음
            this.hitBody.volume.value = -22 + intensity * 3;
            this.hitBody.triggerAttackRelease(0.03);
        } catch (e) {}
    }

    playJump() {
        if (!this.initialized || this.muted) return;
        if (!this.canPlay('jump', 80)) return;
        try {
            this.jumpSynth.volume.value = -22;
            this.jumpSynth.triggerAttackRelease('B5', 0.04);
        } catch (e) {}
    }

    playWallBounce() {
        if (!this.initialized || this.muted) return;
        if (!this.canPlay('wall', 40)) return;
        try {
            this.wallNoise.volume.value = -16;
            this.wallNoise.triggerAttackRelease(0.03);
        } catch (e) {}
    }

    playNetBounce() {
        if (!this.initialized || this.muted) return;
        if (!this.canPlay('net', 40)) return;
        try {
            this.netSynth.volume.value = -14;
            this.netSynth.triggerAttackRelease('A3', 0.04);
        } catch (e) {}
    }

    playFloorBounce() {
        if (!this.initialized || this.muted) return;
        if (!this.canPlay('floor', 60)) return;
        try {
            this.floorNoise.volume.value = -10;
            this.floorNoise.triggerAttackRelease(0.06);
        } catch (e) {}
    }

    playScore(team) {
        if (!this.initialized || this.muted) return;
        if (!this.canPlay('score', 300)) return;
        try {
            this.scoreSynth.volume.value = -10;
            const now = Tone.now();
            if (team === 0) {
                this.scoreSynth.triggerAttackRelease(['E4', 'G#4', 'B4'], 0.2, now);
                this.scoreSynth.triggerAttackRelease(['E5'], 0.15, now + 0.15);
            } else {
                this.scoreSynth.triggerAttackRelease(['D4', 'F#4', 'A4'], 0.2, now);
                this.scoreSynth.triggerAttackRelease(['D5'], 0.15, now + 0.15);
            }
        } catch (e) {}
    }

    playGameOver(won) {
        if (!this.initialized || this.muted) return;
        try {
            this.gameOverSynth.volume.value = -8;
            const now = Tone.now();
            if (won) {
                this.gameOverSynth.triggerAttackRelease(['C4', 'E4', 'G4'], 0.3, now);
                this.gameOverSynth.triggerAttackRelease(['E4', 'G4', 'C5'], 0.3, now + 0.25);
                this.gameOverSynth.triggerAttackRelease(['G4', 'C5', 'E5'], 0.5, now + 0.5);
            } else {
                this.gameOverSynth.triggerAttackRelease(['E3', 'G3', 'Bb3'], 0.4, now);
                this.gameOverSynth.triggerAttackRelease(['Eb3', 'Gb3', 'A3'], 0.6, now + 0.35);
            }
        } catch (e) {}
    }

    playUI(type) {
        if (!this.initialized || this.muted) return;
        if (!this.canPlay('ui', 60)) return;
        try {
            this.uiSynth.volume.value = -18;
            switch (type) {
                case 'click':
                    this.uiSynth.triggerAttackRelease('A5', 0.03);
                    break;
                case 'ready':
                    this.uiSynth.triggerAttackRelease('E5', 0.06);
                    break;
                case 'start': {
                    const now = Tone.now();
                    this.uiSynth.triggerAttackRelease('C5', 0.06, now);
                    this.uiSynth.triggerAttackRelease('E5', 0.06, now + 0.1);
                    this.uiSynth.triggerAttackRelease('G5', 0.08, now + 0.2);
                    break;
                }
            }
        } catch (e) {}
    }

    playCountdown(num) {
        if (!this.initialized || this.muted) return;
        try {
            this.uiSynth.volume.value = -15;
            if (num > 0) {
                this.uiSynth.triggerAttackRelease('G4', 0.08);
            } else {
                this.uiSynth.triggerAttackRelease('C5', 0.15);
            }
        } catch (e) {}
    }
}
