import { loadSoundEnabled, saveSoundEnabled } from './storage.js';

export class AudioManager {
  constructor() {
    this.enabled = loadSoundEnabled();
    this.ctx = null;
    this.master = null;
    this.ambient = null;
  }

  async unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  toggle() {
    this.enabled = !this.enabled;
    saveSoundEnabled(this.enabled);
    if (!this.enabled) this.stopAmbient();
    return this.enabled;
  }

  play(name, intensity = 1) {
    if (!this.enabled) return;
    this.unlock().then(() => {
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime;
      if (name === 'swap') this.tone(now, 420, 0.05, 'triangle', 0.14);
      if (name === 'invalid') this.tone(now, 160, 0.09, 'sawtooth', 0.08);
      if (name === 'match') this.arpeggio(now, [520, 660, 880 + intensity * 40], 0.05, 0.12);
      if (name === 'combo') this.arpeggio(now, [660, 880, 1180, 1400], 0.055, 0.15);
      if (name === 'special') this.arpeggio(now, [420, 840, 1260, 1680], 0.065, 0.16);
      if (name === 'clear') this.arpeggio(now, [523, 659, 784, 1046], 0.09, 0.19);
      if (name === 'fail') this.arpeggio(now, [330, 260, 196], 0.11, 0.12);
      if (name === 'button') this.tone(now, 620, 0.045, 'sine', 0.08);
    });
  }

  startAmbient() {
    if (!this.enabled || this.ambient) return;
    this.unlock().then(() => {
      if (!this.ctx || !this.master || this.ambient) return;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.018;
      gain.connect(this.master);
      const oscA = this.ctx.createOscillator();
      const oscB = this.ctx.createOscillator();
      oscA.type = 'sine';
      oscB.type = 'triangle';
      oscA.frequency.value = 196;
      oscB.frequency.value = 293.66;
      oscA.connect(gain);
      oscB.connect(gain);
      oscA.start();
      oscB.start();
      this.ambient = { gain, oscA, oscB };
    });
  }

  stopAmbient() {
    if (!this.ambient || !this.ctx) return;
    const { gain, oscA, oscB } = this.ambient;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);
    oscA.stop(now + 0.22);
    oscB.stop(now + 0.22);
    this.ambient = null;
  }

  tone(start, freq, duration, type, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  arpeggio(start, notes, step, volume) {
    notes.forEach((freq, index) => this.tone(start + index * step, freq, step * 1.6, 'sine', volume));
  }
}
