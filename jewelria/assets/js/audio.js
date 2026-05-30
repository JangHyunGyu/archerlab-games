import { loadSoundEnabled, saveSoundEnabled } from './storage.js';

const SOUND_ASSETS = {
  clearSingle: 'assets/sounds/clear_single.wav',
  clearDouble: 'assets/sounds/clear_double.wav',
  clearQuad: 'assets/sounds/clear_quad.wav',
  comboHit: 'assets/sounds/combo_hit.wav',
  comboEscalate: 'assets/sounds/combo_escalate.wav',
  impactHeavy: 'assets/sounds/impact_heavy.wav',
  sparkle: 'assets/sounds/sparkle.wav',
  whoosh: 'assets/sounds/whoosh.wav'
};

const MUSIC_ASSETS = {
  main: 'assets/sounds/bgm_main_loop.mp3',
  game: 'assets/sounds/bgm_game_loop.mp3'
};

export class AudioManager {
  constructor() {
    this.enabled = loadSoundEnabled();
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.music = null;
    this.desiredMusic = null;
    this.buffers = new Map();
    this.loading = new Map();
  }

  async unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.34;
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 24;
      this.compressor.ratio.value = 8;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.16;
      this.master.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
      this.preloadAssets();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  preloadAssets() {
    Object.entries(SOUND_ASSETS).forEach(([name, url]) => this.loadBuffer(name, url));
  }

  loadBuffer(name, url) {
    if (!url) return Promise.resolve(null);
    if (!this.ctx || this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (this.loading.has(name)) return this.loading.get(name);
    const promise = fetch(url)
      .then((res) => res.ok ? res.arrayBuffer() : Promise.reject(new Error(`sound ${res.status}`)))
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(name, buffer);
        return buffer;
      })
      .catch(() => null)
      .finally(() => this.loading.delete(name));
    this.loading.set(name, promise);
    return promise;
  }

  toggle() {
    this.enabled = !this.enabled;
    saveSoundEnabled(this.enabled);
    if (!this.enabled) this.fadeOutMusic(0.34);
    else {
      this.preloadAssets();
      if (this.desiredMusic) this.startAmbient(this.desiredMusic);
    }
    return this.enabled;
  }

  play(name, intensity = 1, detail = {}) {
    if (!this.enabled) return;
    this.unlock().then(() => {
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime;
      const level = Math.max(1, Number(intensity) || 1);
      if (name === 'swap') this.playSwap(now);
      if (name === 'invalid') this.playInvalid(now);
      if (name === 'match') this.playMatch(now, level, detail);
      if (name === 'combo') this.playCombo(now, level, detail);
      if (name === 'special') this.playSpecial(now, level, detail);
      if (name === 'clear') this.playClear(now);
      if (name === 'fail') this.playFail(now);
      if (name === 'button') this.playButton(now);
    });
  }

  playSwap(now) {
    this.tone(now, 420, 0.045, 'triangle', 0.14);
    this.tone(now + 0.026, 620, 0.04, 'sine', 0.08);
  }

  playInvalid(now) {
    this.tone(now, 170, 0.08, 'sawtooth', 0.08);
    this.tone(now + 0.045, 118, 0.07, 'triangle', 0.06);
  }

  playMatch(now, level, detail) {
    const lineCount = Number(detail.lineCount || 1);
    const longest = Number(detail.longest || 3);
    const big = lineCount > 1 || longest >= 4;
    const huge = lineCount >= 3 || longest >= 5;
    this.playBuffer(huge ? 'clearQuad' : big ? 'clearDouble' : 'clearSingle', big ? 0.72 : 0.58);
    this.playBuffer('sparkle', 0.42, 0.02, 1 + Math.min(0.18, level * 0.02));
    if (big) this.playBuffer('impactHeavy', huge ? 0.68 : 0.46);
    this.impact(now, big ? 1.25 : 0.86);
    this.noiseBurst(now + 0.012, big ? 0.12 : 0.075, big ? 0.13 : 0.07, 'pink');
    this.sweep(now + 0.018, 740, huge ? 2600 : 1900, big ? 0.19 : 0.13, big ? 0.1 : 0.065);
    this.crystalRun(now + 0.025, huge ? [740, 980, 1320, 1760, 2200] : big ? [620, 820, 1120, 1480] : [520, 660, 880], 0.034, big ? 0.14 : 0.1);
  }

  playCombo(now, level, detail) {
    this.playBuffer('comboHit', 0.58 + Math.min(0.24, level * 0.035));
    this.playBuffer('impactHeavy', 0.38 + Math.min(0.28, level * 0.04));
    this.playBuffer('whoosh', 0.32 + Math.min(0.18, level * 0.025), 0.01);
    if (level >= 3) this.playBuffer('comboEscalate', 0.5 + Math.min(0.25, level * 0.035), 0.035);
    this.impact(now, 1.2 + level * 0.16);
    this.noiseBurst(now, 0.14, 0.13 + level * 0.014, 'white');
    this.sweep(now + 0.005, 520 + level * 24, 2500 + level * 220, 0.24, 0.13);
    const base = 520 * Math.pow(2, Math.min(level, 8) / 12);
    this.crystalRun(now + 0.018, [base, base * 1.25, base * 1.5, base * 2, base * 2.5], 0.032, 0.14);
    this.tone(now + 0.035, base * 0.5, 0.22, 'triangle', 0.12);
  }

  playSpecial(now, level, detail) {
    this.playBuffer('clearQuad', 0.86);
    this.playBuffer('impactHeavy', 0.78);
    this.playBuffer('whoosh', 0.52, 0.012);
    this.playBuffer('sparkle', 0.62, 0.05, 1.08);
    this.impact(now, 1.65 + level * 0.12);
    this.noiseBurst(now + 0.005, 0.18, 0.18, 'white');
    this.sweep(now, 360, 3400, 0.32, 0.18);
    this.crystalRun(now + 0.04, [420, 840, 1260, 1680, 2100, 2520], 0.036, 0.16);
  }

  playClear(now) {
    this.playBuffer('clearQuad', 0.78);
    this.playBuffer('sparkle', 0.64, 0.08);
    this.crystalRun(now, [523, 659, 784, 1046, 1318], 0.07, 0.16);
  }

  playFail(now) {
    this.crystalRun(now, [330, 260, 196], 0.11, 0.1);
    this.noiseBurst(now + 0.08, 0.2, 0.06, 'brown');
  }

  playButton(now) {
    this.tone(now, 620, 0.042, 'sine', 0.075);
    this.tone(now + 0.018, 880, 0.035, 'triangle', 0.04);
  }

  startAmbient(track = 'main') {
    const musicKey = MUSIC_ASSETS[track] ? track : 'main';
    this.desiredMusic = musicKey;
    if (!this.enabled) return;
    this.unlock().then(() => this.playMusic(musicKey));
  }

  stopAmbient() {
    this.desiredMusic = null;
    this.fadeOutMusic(0.34);
  }

  async playMusic(track) {
    if (!this.ctx || !this.master || !this.enabled) return;
    if (this.music?.track === track) return;
    const buffer = await this.loadBuffer(`music:${track}`, MUSIC_ASSETS[track]);
    if (!buffer || !this.ctx || !this.master || !this.enabled || this.desiredMusic !== track) return;
    const now = this.ctx.currentTime;
    this.fadeOutMusic(0.52);
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const targetVolume = track === 'game' ? 0.105 : 0.088;
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(targetVolume, now + 0.9);
    source.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.onended = () => {
      try { source.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    };
    this.music = { track, source, gain };
  }

  fadeOutMusic(duration = 0.42) {
    if (!this.music || !this.ctx) return;
    const { source, gain } = this.music;
    const now = this.ctx.currentTime;
    const stopAt = now + Math.max(0.08, duration);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    try { source.stop(stopAt + 0.03); } catch {}
    this.music = null;
  }

  playBuffer(name, volume = 0.5, delay = 0, rate = 1) {
    const buffer = this.buffers.get(name);
    if (!buffer || !this.ctx || !this.master) {
      this.loadBuffer(name, SOUND_ASSETS[name]);
      return false;
    }
    const start = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.05, buffer.duration / rate));
    source.connect(gain);
    gain.connect(this.master);
    source.onended = () => {
      try { source.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    };
    source.start(start);
    return true;
  }

  impact(start, power = 1) {
    this.tone(start, 92, 0.11, 'sine', 0.22 * power);
    this.tone(start + 0.012, 46, 0.18, 'triangle', 0.13 * power);
    this.tone(start + 0.025, 185, 0.08, 'square', 0.045 * power);
  }

  tone(start, freq, duration, type, volume) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = Math.max(20, freq);
    const safeVolume = Math.max(0.0001, Math.min(0.7, volume));
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(safeVolume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  crystalRun(start, notes, step, volume) {
    notes.forEach((freq, index) => {
      this.tone(start + index * step, freq, step * 2.2, index % 2 ? 'triangle' : 'sine', volume * (1 - index * 0.05));
    });
  }

  sweep(start, from, to, duration, volume) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(Math.max(20, from), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(21, to), start + duration);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.max(80, from * 1.4), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(100, to * 1.1), start + duration);
    filter.Q.value = 3.2;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  noiseBurst(start, duration, volume, color = 'white') {
    if (!this.ctx || !this.master) return;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (color === 'brown') {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else if (color === 'pink') {
        last = 0.82 * last + 0.18 * white;
        data[i] = last;
      } else {
        data[i] = white;
      }
    }
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    filter.type = color === 'brown' ? 'lowpass' : 'highpass';
    filter.frequency.value = color === 'brown' ? 380 : 1500;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start);
  }
}
