/**
 * Web Audio API 기반 프로시저럴 사운드 매니저
 * 외부 오디오 파일 없이 모든 효과음을 실시간 합성합니다.
 */
export class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 0.3;
        this._initialized = false;
    }

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._initialized = true;
        } catch (e) {
            this.enabled = false;
        }
    }

    // Resume audio context (required after user interaction)
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

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
        } catch (e) {
            // Silently fail
        }
    }

    _createOsc(type, freq, duration, vol = 1) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = this.volume * vol;
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
        return { osc, gain };
    }

    _playNoise(duration, vol = 0.3) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.value = this.volume * vol;
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }

    // 단검 베기 (swoosh + 가벼운 임팩트)
    _playDagger() {
        // 고주파 노이즈 swoosh - 칼날이 공기를 가르는 소리
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.12);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            // 앞부분은 세게, 뒤로 갈수록 빠르게 감쇠 + 고주파 필터 느낌
            data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        // 하이패스 필터로 칼바람 느낌
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2000;
        hp.frequency.exponentialRampToValueAtTime(6000, this.ctx.currentTime + 0.08);
        const gain = this.ctx.createGain();
        gain.gain.value = this.volume * 0.5;
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
        noise.connect(hp);
        hp.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();

        // 짧은 저주파 thud - 베기 임팩트
        setTimeout(() => {
            this._createOsc('sine', 120, 0.06, 0.2);
        }, 40);
    }

    // 그림자 베기 (더 무거운 swoosh)
    _playSlash() {
        this._playNoise(0.15, 0.25);
        this._createOsc('sawtooth', 100, 0.12, 0.2);
        setTimeout(() => this._createOsc('sine', 80, 0.08, 0.15), 50);
    }

    // 지배자의 권능
    _playAuthority() {
        this._createOsc('sine', 150, 0.4, 0.3);
        this._createOsc('sine', 300, 0.3, 0.15);
        setTimeout(() => this._createOsc('sine', 200, 0.2, 0.2), 100);
    }

    // 용의 공포
    _playFear() {
        this._createOsc('sawtooth', 80, 0.5, 0.2);
        this._createOsc('sine', 120, 0.4, 0.15);
    }

    // 적 타격 (짧은 임팩트)
    _playHit() {
        this._createOsc('sine', 100, 0.06, 0.2);
        this._playNoise(0.04, 0.12);
    }

    // 적 처치
    _playKill() {
        this._createOsc('sine', 600, 0.1, 0.2);
        this._createOsc('sine', 800, 0.08, 0.15);
    }

    // XP 획득
    _playXP() {
        this._createOsc('sine', 1000, 0.06, 0.1);
        setTimeout(() => this._createOsc('sine', 1200, 0.06, 0.1), 30);
    }

    // 레벨업
    _playLevelUp() {
        const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
            setTimeout(() => this._createOsc('sine', freq, 0.2, 0.25), i * 100);
        });
    }

    // 시스템 메시지
    _playSystem() {
        this._createOsc('sine', 880, 0.08, 0.15);
        setTimeout(() => this._createOsc('sine', 1100, 0.08, 0.15), 60);
    }

    // ARISE! 연출
    _playArise() {
        // Deep rumble
        this._createOsc('sawtooth', 50, 1.0, 0.3);
        this._createOsc('sine', 80, 0.8, 0.2);
        // Rising tone
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 100;
        osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 1.5);
        gain.gain.value = this.volume * 0.25;
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2.0);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 2.0);
        // Impact
        setTimeout(() => {
            this._createOsc('square', 150, 0.3, 0.3);
            this._playNoise(0.2, 0.2);
        }, 800);
    }

    // 보스 등장
    _playBossAppear() {
        this._createOsc('sawtooth', 60, 0.6, 0.3);
        this._playNoise(0.3, 0.15);
        setTimeout(() => this._createOsc('square', 100, 0.3, 0.25), 200);
        setTimeout(() => this._createOsc('sawtooth', 80, 0.4, 0.2), 400);
    }

    // 랭크업
    _playRankUp() {
        const notes = [440, 554, 659, 880, 1047, 1319];
        notes.forEach((freq, i) => {
            setTimeout(() => this._createOsc('sine', freq, 0.3, 0.2), i * 80);
        });
    }

    // 플레이어 피격
    _playPlayerHit() {
        this._createOsc('square', 150, 0.1, 0.2);
        this._playNoise(0.05, 0.15);
    }

    // 경고
    _playWarning() {
        this._createOsc('square', 440, 0.15, 0.2);
        setTimeout(() => this._createOsc('square', 440, 0.15, 0.2), 200);
    }

    // 포션 사용
    _playPotion() {
        this._createOsc('sine', 500, 0.15, 0.2);
        setTimeout(() => this._createOsc('sine', 700, 0.15, 0.15), 80);
        setTimeout(() => this._createOsc('sine', 900, 0.1, 0.1), 160);
    }

    // UI 선택
    _playSelect() {
        this._createOsc('sine', 660, 0.08, 0.15);
    }

    // 퀘스트 완료
    _playQuest() {
        const notes = [660, 880, 1100];
        notes.forEach((freq, i) => {
            setTimeout(() => this._createOsc('sine', freq, 0.15, 0.2), i * 120);
        });
    }

    // 던전 브레이크
    _playDungeonBreak() {
        this._createOsc('sawtooth', 40, 1.5, 0.35);
        this._playNoise(0.5, 0.2);
        setTimeout(() => {
            this._createOsc('square', 80, 0.5, 0.25);
            this._createOsc('sawtooth', 60, 0.8, 0.2);
        }, 500);
    }

    toggleSound() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}
