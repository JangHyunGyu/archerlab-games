// Sound Manager using Tone.js + MP3 effects
class SoundManager {
    constructor() {
        this.initialized = false;
        this.muted = false;
        this.volume = 1.0;
        this.cooldowns = {};
        // MP3 풀: 동시 재생을 위해 여러 Audio 인스턴스 관리
        this.mp3Pools = {};
    }

    // 쿨다운 체크: 같은 사운드가 너무 빨리 재트리거되는 것을 방지
    canPlay(id, minInterval) {
        const now = performance.now();
        if (this.cooldowns[id] && now - this.cooldowns[id] < minInterval) return false;
        this.cooldowns[id] = now;
        return true;
    }

    // MP3 오디오 풀 생성 (동시 재생 지원)
    createMp3Pool(name, src, poolSize = 4) {
        this.mp3Pools[name] = [];
        for (let i = 0; i < poolSize; i++) {
            const audio = new Audio(src);
            audio.preload = 'auto';
            this.mp3Pools[name].push(audio);
        }
        this.mp3Pools[name]._index = 0;
    }

    // MP3 풀에서 재생 (볼륨 적용, 라운드로빈)
    playMp3(name, volumeMultiplier = 1) {
        const pool = this.mp3Pools[name];
        if (!pool) return;
        const audio = pool[pool._index];
        pool._index = (pool._index + 1) % pool.length;
        audio.volume = Math.max(0, Math.min(1, this.volume * volumeMultiplier));
        audio.currentTime = 0;
        audio.play().catch(() => {});
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

            // === WAV 효과음 로드 (공/슬라임 충돌 & 바운스) ===
            const soundBase = 'sounds/';
            this.createMp3Pool('hit', soundBase + 'hit.wav', 6);
            this.createMp3Pool('wall', soundBase + 'wall.wav', 4);
            this.createMp3Pool('net', soundBase + 'net.wav', 4);
            this.createMp3Pool('floor', soundBase + 'floor.wav', 4);

            // === Tone.js 합성 사운드 (점프, 득점, 게임오버, UI) ===

            // 점프: 젤리 튀어오르는 뽱 사운드
            this.jumpSynth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.06 },
            }).connect(this.limiter);

            this.jumpSweep = new Tone.Synth({
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
            }).connect(this.limiter);

            // 득점 팡파레
            this.scoreSynth = new Tone.PolySynth(Tone.Synth, {
                maxPolyphony: 6,
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.02, decay: 0.25, sustain: 0.05, release: 0.3 },
            }).connect(this.limiter);

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
        // MP3 풀 볼륨도 업데이트
        for (const name in this.mp3Pools) {
            const pool = this.mp3Pools[name];
            for (const audio of pool) {
                if (typeof audio._index === 'undefined') {
                    audio.volume = this.muted ? 0 : this.volume;
                }
            }
        }
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
        // intensity 0~1 → 볼륨 0.5~1.0
        this.playMp3('hit', 0.5 + intensity * 0.5);
    }

    playJump() {
        if (!this.initialized || this.muted) return;
        if (!this.canPlay('jump', 100)) return;
        try {
            // 젤리 뽱: 낮은음→높은음 슬라이드 + 하모닉
            this.jumpSynth.volume.value = -20;
            this.jumpSynth.frequency.setValueAtTime(200, Tone.now());
            this.jumpSynth.frequency.exponentialRampToValueAtTime(600, Tone.now() + 0.08);
            this.jumpSynth.triggerAttackRelease('C4', 0.1);
            // 경쾌한 상승음
            this.jumpSweep.volume.value = -26;
            this.jumpSweep.triggerAttackRelease('E6', 0.05, Tone.now() + 0.02);
        } catch (e) {}
    }

    playWallBounce() {
        if (!this.initialized || this.muted) return;
        if (!this.canPlay('wall', 40)) return;
        this.playMp3('wall', 0.7);
    }

    playNetBounce() {
        if (!this.initialized || this.muted) return;
        if (!this.canPlay('net', 40)) return;
        this.playMp3('net', 0.8);
    }

    playFloorBounce() {
        if (!this.initialized || this.muted) return;
        if (!this.canPlay('floor', 60)) return;
        this.playMp3('floor', 0.9);
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
