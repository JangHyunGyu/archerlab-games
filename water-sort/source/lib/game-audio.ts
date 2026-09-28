export const SOUND_NAMES = ['select', 'start', 'pour', 'invalid', 'clear', 'timeout', 'tick'] as const;
export type SoundName = typeof SOUND_NAMES[number];
export const soundPath = (name: SoundName) => `/water-sort/sounds/${name === 'pour' ? 'v2' : 'v1'}/${name}.wav`;

/** Lazy Web Audio: never gates gameplay and never starts before a user gesture. */
export class GameAudio {
  private context: AudioContext | null = null;
  private buffers = new Map<SoundName, Promise<AudioBuffer>>();
  private sources = new Set<AudioBufferSourceNode>();
  private enabled = true;
  private unlocked = false;
  private generation = 0;
  private clock: { stage: string; seconds: number } | null = null;

  countdown(stage: string | null, seconds: number, running: boolean) {
    if (!stage || !running || seconds <= 0) { this.clock = null; return; }
    const previous = this.clock;
    if (previous?.stage === stage && seconds >= previous.seconds) return;
    this.clock = { stage, seconds };
    // Follow displayed server time; never replay missed seconds or repeat a clock correction.
    if (previous?.stage === stage && previous.seconds - seconds === 1) this.play('tick');
  }

  unlock() {
    if (!this.enabled || typeof window === 'undefined') return;
    try {
      if (!this.context || this.context.state === 'closed') {
        const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) return;
        this.context = new Constructor();
      }
      this.unlocked = true;
      if (this.context.state !== 'running') void this.context.resume().catch(() => {});
      for (const name of SOUND_NAMES) void this.buffer(name).catch(() => {});
    } catch { /* Unsupported audio must never stop play. */ }
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }
  private buffer(name: SoundName) {
    let pending = this.buffers.get(name);
    if (!pending) {
      const context = this.context!;
      pending = fetch(soundPath(name)).then(response => {
        if (!response.ok) throw new Error('sound unavailable');
        return response.arrayBuffer();
      }).then(bytes => context.decodeAudioData(bytes)).catch(error => { this.buffers.delete(name); throw error; });
      this.buffers.set(name, pending);
    }
    return pending;
  }
  play(name: SoundName, delay = 0, duration?: number) {
    const context = this.context;
    if (!this.enabled || !this.unlocked || !context || document.hidden) return;
    const generation = this.generation, target = context.currentTime + delay;
    void this.buffer(name).then(buffer => {
      if (!this.enabled || generation !== this.generation || document.hidden || context.state !== 'running' || context.currentTime - target > .3) return;
      const source = context.createBufferSource(), volume = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = duration ? buffer.duration / duration : 1;
      volume.gain.value = name === 'tick' ? .4 : name === 'pour' ? .3 : .65;
      source.connect(volume); volume.connect(context.destination);
      this.sources.add(source);
      source.onended = () => { this.sources.delete(source); source.disconnect(); volume.disconnect(); };
      source.start(Math.max(context.currentTime, target));
    }).catch(() => {});
  }
  stop() {
    this.generation++;
    for (const source of this.sources) { try { source.stop(); } catch {} }
    this.sources.clear();
  }
  dispose() {
    this.stop(); this.unlocked = false; this.buffers.clear(); this.clock = null;
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
