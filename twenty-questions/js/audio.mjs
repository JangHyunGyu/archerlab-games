import { storage } from './api.mjs?v=20261124-v15';

const files = {
    click: 'ui-click.mp3',
    start: 'round-start.mp3',
    send: 'send.wav',
    stamp: 'stamp.wav',
    tick: 'tick.wav',
    clueMild: 'clue-mild.mp3',
    clueWarm: 'clue-warm.mp3',
    clueHot: 'clue-hot.mp3',
    clueMolten: 'clue-molten.mp3',
    solveBurst: 'solve-burst.mp3',
    solveFanfare: 'solve-fanfare.mp3',
    success: 'success.wav',
    record: 'record.wav',
    streak: 'streak.wav',
    wrong: 'wrong.mp3',
    end: 'end.mp3',
    ranking: 'ranking.mp3',
};

export class GameAudio {
    constructor() { var __oc0;
        this.enabled = storage.get('sound') !== 'off';
        this.volume = Math.max(0, Math.min(1, Number((((__oc0 = storage.get('volume')) !== null && __oc0 !== void 0 ? __oc0 : 0.45)))));
        this.buffers = new Map();
        this.loading = new Map();
        this.voices = new Set();
        this.events = new Set();
        this.prefetched = new Map(
            ['click', 'start', 'send', 'clueMild', 'clueWarm', 'clueHot', 'clueMolten'].map(key => [
                key,
                fetch(new URL(`../assets/audio/${files[key]}`, import.meta.url))
                    .then(response => (response.ok ? response.arrayBuffer() : null))
                    .catch(() => null),
            ])
        );
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stop();
        });
    }

    async unlock() {
        if (!this.enabled) return;
        try {
            const first = !this.ctx;
            ((this.ctx || (this.ctx = new (window.AudioContext || window.webkitAudioContext)())));
            ((this.master || (this.master = this.ctx.createGain())));
            if (!this.connected) {
                const compressor = this.ctx.createDynamicsCompressor();
                compressor.threshold.value = -12;
                compressor.ratio.value = 8;
                this.master.connect(compressor);
                compressor.connect(this.ctx.destination);
                this.connected = true;
            }
            this.master.gain.value = this.volume;
            await this.ctx.resume();
            for (const key of Object.keys(files)) this.load(key).catch(() => {});
            if (first) {
                await this.load('click');
                this.play('click', { gain: 0.55 });
            }
        } catch (_err) { /* 오디오 초기화 실패 시에도 게임 진행 유지 */ }
    }

    load(key) {
        if (!this.loading.has(key)) {
            this.loading.set(
                key,
                (this.prefetched.get(key) || fetch(new URL(`../assets/audio/${files[key]}`, import.meta.url))
                    .then(r => { if (!r.ok) throw new Error('Sound unavailable'); return r.arrayBuffer(); }))
                    .then(data => { if (!data) throw new Error('Sound unavailable'); return this.ctx.decodeAudioData(data); })
                    .then(buffer => { this.buffers.set(key, buffer); return buffer; })
            );
        }
        return this.loading.get(key);
    }

    play(key, { gain = 1, rate = 1, delay = 0, duration } = {}) {
        if (!this.enabled || !this.ctx || document.hidden || this.ctx.state !== 'running' || !this.buffers.has(key)) return;
        const source = this.ctx.createBufferSource();
        const volume = this.ctx.createGain();
        source.buffer = this.buffers.get(key);
        source.playbackRate.value = rate;
        const start = this.ctx.currentTime + delay;
        const length = Math.min(((duration !== null && duration !== void 0 ? duration : source.buffer.duration / rate)), source.buffer.duration / rate);
        volume.gain.setValueAtTime(gain, start);
        volume.gain.setValueAtTime(gain, start + Math.max(0, length - 0.06));
        volume.gain.linearRampToValueAtTime(0, start + length);
        source.connect(volume);
        volume.connect(this.master);
        this.voices.add(source);
        source.onended = () => {
            this.voices.delete(source);
            source.disconnect();
            volume.disconnect();
        };
        source.start(start);
        source.stop(start + length);
    }

    // 유사도 순위와 정답 여부에 따라 계층형 효과음 재생
    result(event, game) {
        if (!((event === null || event === void 0 ? void 0 : event.requestId)) || event.replayed || this.events.has(event.requestId)) return;
        this.events.add(event.requestId);
        if (((game === null || game === void 0 ? void 0 : game.status)) === 'won' && event.code === 'won') {
            this.play('solveBurst', { gain: 0.72 });
            this.play('solveFanfare', { delay: 0.08, gain: 0.85 });
            this.play(event.recordImproved ? 'record' : 'streak', { delay: 0.45, gain: 0.65 });
            return;
        }
        if (((game === null || game === void 0 ? void 0 : game.status)) === 'given_up' && event.code === 'given_up') {
            this.play('end', { gain: 0.45, duration: 0.75 });
            return;
        }
        if (event.code === 'unknown_word') {
            this.play('wrong', { gain: 0.45, duration: 0.22 });
            return;
        }
        if (event.code === 'duplicate') {
            this.play('tick', { gain: 0.25 });
            return;
        }
        if (event.code === 'guess') {
            const rank = event.rank;
            if (rank !== null && rank <= 10) {
                this.play('clueMolten', { gain: 0.75 });
                this.play('record', { delay: 0.08, rate: 1.08, gain: 0.5 });
            } else if (rank !== null && rank <= 100) {
                this.play('clueHot', { gain: 0.68 });
            } else if (rank !== null && rank <= 1000) {
                this.play('clueWarm', { rate: 1.04, gain: 0.6 });
            } else if (Number.isFinite(event.similarity) && event.similarity > 0) {
                this.play('clueMild', { gain: 0.45 });
            } else {
                this.play('stamp', { rate: 0.86, gain: 0.4 });
            }
        }
    }

    configure(enabled, volume = this.volume) {
        this.enabled = enabled;
        this.volume = volume;
        storage.set('sound', enabled ? 'on' : 'off');
        storage.set('volume', volume);
        if (this.master) this.master.gain.value = volume;
        if (!enabled) this.stop();
        else this.unlock();
    }

    stop() {
        for (const source of this.voices) {
            try { source.stop(); } catch (_err) {}
        }
        this.voices.clear();
    }
}
