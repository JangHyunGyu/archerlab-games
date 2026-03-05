// Sound Manager using Tone.js
class SoundManager {
    constructor() {
        this.initialized = false;
        this.muted = false;
        this.volume = 0.5;
    }

    async init() {
        if (this.initialized) return;
        try {
            await Tone.start();

            // 배구공 타격음: 짧은 멤브레인 톤 (팡!)
            this.hitTone = new Tone.MembraneSynth({
                pitchDecay: 0.01,
                octaves: 3,
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
            }).toDestination();

            // 점프: 가벼운 슈웅
            this.jumpSynth = new Tone.Synth({
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.01, decay: 0.08, sustain: 0, release: 0.03 },
            }).toDestination();

            // 득점
            this.scoreSynth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'square' },
                envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.3 },
            }).toDestination();

            // 벽 바운스: 둔탁한 노이즈
            this.wallNoise = new Tone.NoiseSynth({
                noise: { type: 'pink' },
                envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
            }).toDestination();

            this.wallFilter = new Tone.Filter(800, 'lowpass').toDestination();
            this.wallNoise.disconnect();
            this.wallNoise.connect(this.wallFilter);

            // 네트 바운스: 중간 톤 탁
            this.netNoise = new Tone.NoiseSynth({
                noise: { type: 'brown' },
                envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
            }).toDestination();

            this.netFilter = new Tone.Filter(1200, 'bandpass').toDestination();
            this.netNoise.disconnect();
            this.netNoise.connect(this.netFilter);

            // 게임오버
            this.gameOverSynth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'sawtooth' },
                envelope: { attack: 0.05, decay: 0.5, sustain: 0.2, release: 0.5 },
            }).toDestination();

            // UI
            this.uiSynth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 },
            }).toDestination();

            // 바닥 바운스: 배구공 바닥 착지 (퍽)
            this.floorNoise = new Tone.NoiseSynth({
                noise: { type: 'brown' },
                envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
            }).toDestination();

            this.floorFilter = new Tone.Filter(500, 'lowpass').toDestination();
            this.floorNoise.disconnect();
            this.floorNoise.connect(this.floorFilter);

            // Reverb
            this.reverb = new Tone.Reverb(1.5).toDestination();
            this.scoreSynth.connect(this.reverb);
            this.gameOverSynth.connect(this.reverb);

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
        try {
            // 세기에 따라 필터 주파수와 볼륨 조절
            const freq = 2000 + intensity * 2000;
            this.hitFilter.frequency.value = freq;

            // 노이즈 임팩트 (팡!)
            this.hitNoise.volume.value = -8 + intensity * 6;
            this.hitNoise.triggerAttackRelease('32n');

            // 짧은 톤 (탁 하는 느낌)
            const note = 'G' + (3 + Math.floor(intensity * 2));
            this.hitTone.volume.value = -12 + intensity * 4;
            this.hitTone.triggerAttackRelease(note, '32n');
        } catch (e) {}
    }

    playJump() {
        if (!this.initialized || this.muted) return;
        try {
            this.jumpSynth.volume.value = -15;
            this.jumpSynth.triggerAttackRelease('C5', '32n');
        } catch (e) {}
    }

    playWallBounce() {
        if (!this.initialized || this.muted) return;
        try {
            this.wallNoise.volume.value = -10;
            this.wallNoise.triggerAttackRelease('32n');
        } catch (e) {}
    }

    playNetBounce() {
        if (!this.initialized || this.muted) return;
        try {
            this.netNoise.volume.value = -8;
            this.netNoise.triggerAttackRelease('32n');
        } catch (e) {}
    }

    playFloorBounce() {
        if (!this.initialized || this.muted) return;
        try {
            this.floorNoise.volume.value = -6;
            this.floorNoise.triggerAttackRelease('16n');
        } catch (e) {}
    }

    playScore(team) {
        if (!this.initialized || this.muted) return;
        try {
            const now = Tone.now();
            if (team === 0) {
                this.scoreSynth.triggerAttackRelease(['E4', 'G4', 'B4'], '8n', now);
                this.scoreSynth.triggerAttackRelease(['E5'], '8n', now + 0.15);
            } else {
                this.scoreSynth.triggerAttackRelease(['D4', 'F#4', 'A4'], '8n', now);
                this.scoreSynth.triggerAttackRelease(['D5'], '8n', now + 0.15);
            }
        } catch (e) {}
    }

    playGameOver(won) {
        if (!this.initialized || this.muted) return;
        try {
            const now = Tone.now();
            if (won) {
                this.gameOverSynth.triggerAttackRelease(['C4', 'E4', 'G4'], '4n', now);
                this.gameOverSynth.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], '4n', now + 0.3);
            } else {
                this.gameOverSynth.triggerAttackRelease(['E3', 'G3', 'Bb3'], '4n', now);
                this.gameOverSynth.triggerAttackRelease(['D3', 'F3', 'Ab3'], '2n', now + 0.4);
            }
        } catch (e) {}
    }

    playUI(type) {
        if (!this.initialized || this.muted) return;
        try {
            switch (type) {
                case 'click':
                    this.uiSynth.triggerAttackRelease('A5', '32n');
                    break;
                case 'ready':
                    this.uiSynth.triggerAttackRelease('E5', '16n');
                    break;
                case 'start':
                    const now = Tone.now();
                    this.uiSynth.triggerAttackRelease('C5', '16n', now);
                    this.uiSynth.triggerAttackRelease('E5', '16n', now + 0.1);
                    this.uiSynth.triggerAttackRelease('G5', '16n', now + 0.2);
                    break;
            }
        } catch (e) {}
    }

    playCountdown(num) {
        if (!this.initialized || this.muted) return;
        try {
            if (num > 0) {
                this.uiSynth.triggerAttackRelease('G4', '8n');
            } else {
                this.uiSynth.triggerAttackRelease('C5', '4n');
            }
        } catch (e) {}
    }
}
