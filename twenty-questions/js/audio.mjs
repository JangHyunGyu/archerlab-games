import { storage } from './api.mjs';

const files = { click: 'ui-click.mp3', send: 'send.wav', stamp: 'stamp.wav', tick: 'tick.wav', success: 'success.wav', record: 'record.wav', streak: 'streak.wav', wrong: 'wrong.mp3', end: 'end.mp3', ranking: 'ranking.mp3' };
export class GameAudio {
    constructor() {
        this.enabled = storage.get('sound') !== 'off';
        this.volume = Math.max(0, Math.min(1, Number(storage.get('volume') ?? 0.45)));
        this.buffers = new Map(); this.loading = new Map(); this.voices = new Set(); this.events = new Set();
        this.prefetched = new Map(['click', 'send', 'stamp'].map(key => [key, fetch(new URL(`../assets/audio/${files[key]}`, import.meta.url))
            .then(response => response.ok ? response.arrayBuffer() : null).catch(() => null)]));
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
    }
    async unlock() {
        if (!this.enabled) return;
        try {
            const first = !this.ctx;
            this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
            this.master ||= this.ctx.createGain();
            if (!this.connected) {
                const compressor = this.ctx.createDynamicsCompressor();
                compressor.threshold.value = -12; compressor.ratio.value = 8;
                this.master.connect(compressor); compressor.connect(this.ctx.destination); this.connected = true;
            }
            this.master.gain.value = this.volume;
            await this.ctx.resume();
            for (const key of Object.keys(files)) this.load(key).catch(() => {});
            if (first) { await this.load('click'); this.play('click', { gain: 0.6 }); }
        } catch { /* Audio failure must not block gameplay. */ }
    }
    load(key) {
        if (!this.loading.has(key)) this.loading.set(key, (this.prefetched.get(key) || fetch(new URL(`../assets/audio/${files[key]}`, import.meta.url))
            .then(r => { if (!r.ok) throw new Error('Sound unavailable'); return r.arrayBuffer(); }))
            .then(data => { if (!data) throw new Error('Sound unavailable'); return this.ctx.decodeAudioData(data); }).then(buffer => { this.buffers.set(key, buffer); return buffer; }));
        return this.loading.get(key);
    }
    play(key, { gain = 1, rate = 1, delay = 0, duration } = {}) {
        if (!this.enabled || !this.ctx || document.hidden || this.ctx.state !== 'running' || !this.buffers.has(key)) return;
        const source = this.ctx.createBufferSource(); const volume = this.ctx.createGain();
        source.buffer = this.buffers.get(key); source.playbackRate.value = rate;
        const start = this.ctx.currentTime + delay;
        const length = Math.min(duration ?? source.buffer.duration / rate, source.buffer.duration / rate);
        volume.gain.setValueAtTime(gain, start);
        volume.gain.setValueAtTime(gain, start + Math.max(0, length - 0.06));
        volume.gain.linearRampToValueAtTime(0, start + length);
        source.connect(volume); volume.connect(this.master); this.voices.add(source);
        source.onended = () => { this.voices.delete(source); source.disconnect(); volume.disconnect(); };
        source.start(start); source.stop(start + length);
    }
    result(event, game) {
        if (!event?.requestId || event.replayed || this.events.has(event.requestId)) return;
        this.events.add(event.requestId);
        if (game.status === 'won') {
            this.play('stamp', { gain: 0.55 }); this.play('success', { delay: 0.12, gain: 0.85 });
            this.play(event.recordImproved ? 'record' : 'streak', { delay: 0.65, gain: 0.6 });
        } else if (['lost', 'given_up'].includes(game.status)) this.play('end', { gain: 0.45, duration: 0.75 });
        else if (event.code === 'yes') this.play('stamp', { rate: 1.1, gain: 0.65 });
        else if (event.code === 'no') this.play('stamp', { rate: 0.85, gain: 0.6 });
        else if (event.code === 'wrong_guess') this.play('wrong', { gain: 0.55, duration: 0.27 });
        else if (event.code === 'multiple' || event.code === 'unknown') this.play('tick', { gain: 0.25 });
    }
    configure(enabled, volume = this.volume) {
        this.enabled = enabled; this.volume = volume;
        storage.set('sound', enabled ? 'on' : 'off'); storage.set('volume', volume);
        if (this.master) this.master.gain.value = volume;
        if (!enabled) this.stop(); else this.unlock();
    }
    stop() { for (const source of this.voices) { try { source.stop(); } catch {} } this.voices.clear(); }
}
