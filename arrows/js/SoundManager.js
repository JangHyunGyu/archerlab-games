(function (global) {
  "use strict";

  class ArrowsSoundManager {
    constructor() {
      this.enabled = true;
      this.ready = false;
      this.lastAt = new Map();
      this.nodes = {};
    }

    async ensure() {
      if (typeof Tone === "undefined") return false;
      try {
        if (Tone.context && Tone.context.state !== "running") {
          await Tone.start();
        }
        if (!this.ready) this.init();
        return true;
      } catch (error) {
        return false;
      }
    }

    init() {
      if (this.ready || typeof Tone === "undefined") return;

      this.nodes.limiter = new Tone.Limiter(-2).toDestination();
      this.nodes.comp = new Tone.Compressor({
        threshold: -20,
        ratio: 5,
        attack: 0.004,
        release: 0.16,
      }).connect(this.nodes.limiter);
      this.nodes.reverb = new Tone.Reverb({
        decay: 1.15,
        wet: 0.18,
        preDelay: 0.012,
      }).connect(this.nodes.comp);
      this.nodes.delay = new Tone.FeedbackDelay({
        delayTime: "16n.",
        feedback: 0.18,
        wet: 0.12,
      }).connect(this.nodes.comp);
      this.nodes.dry = new Tone.Channel({ volume: -5 }).connect(this.nodes.comp);
      this.nodes.wet = new Tone.Channel({ volume: -8 }).connect(this.nodes.reverb);
      this.nodes.echo = new Tone.Channel({ volume: -11 }).connect(this.nodes.delay);

      this.nodes.click = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.001, decay: 0.035, sustain: 0.02, release: 0.04 },
      }).connect(this.nodes.dry);
      this.nodes.click.volume.value = -12;

      this.nodes.bell = new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 12,
        oscillator: { type: "sine" },
        envelope: { attack: 0.002, decay: 0.09, sustain: 0.24, release: 0.42 },
      }).connect(this.nodes.wet);
      this.nodes.bell.volume.value = -10;

      this.nodes.fm = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 8,
        harmonicity: 2.8,
        modulationIndex: 7,
        oscillator: { type: "sine" },
        envelope: { attack: 0.004, decay: 0.16, sustain: 0.2, release: 0.28 },
        modulationEnvelope: { attack: 0.004, decay: 0.12, sustain: 0.18, release: 0.18 },
      }).connect(this.nodes.echo);
      this.nodes.fm.volume.value = -16;

      this.nodes.pad = new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 8,
        oscillator: { type: "sine" },
        envelope: { attack: 0.02, decay: 0.22, sustain: 0.32, release: 0.8 },
      }).connect(this.nodes.wet);
      this.nodes.pad.volume.value = -18;

      this.nodes.noise = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.04 },
      }).connect(this.nodes.dry);
      this.nodes.noise.volume.value = -24;

      this.nodes.sweep = new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { type: "lowpass", frequency: 440, Q: 3 },
        envelope: { attack: 0.006, decay: 0.18, sustain: 0.06, release: 0.14 },
        filterEnvelope: {
          attack: 0.006,
          decay: 0.18,
          sustain: 0.05,
          release: 0.14,
          baseFrequency: 220,
          octaves: 4.2,
        },
      }).connect(this.nodes.echo);
      this.nodes.sweep.volume.value = -18;

      this.ready = true;
    }

    play(type, intensity = 1) {
      if (!this.enabled || typeof Tone === "undefined") return;
      this.ensure().then(ok => {
        if (!ok) return;
        const nowMs = performance.now();
        const minGap = type === "blocked" ? 90 : 28;
        if (nowMs - (this.lastAt.get(type) || 0) < minGap) return;
        this.lastAt.set(type, nowMs);
        const now = Tone.now() + 0.01;
        const vel = Math.max(0.08, Math.min(0.9, intensity));

        try {
          switch (type) {
            case "start":
              this.nodes.pad.triggerAttackRelease(["C4", "G4", "D5"], "8n", now, 0.16);
              this.nodes.fm.triggerAttackRelease("G5", "16n", now + 0.04, 0.18);
              break;
            case "clear":
              this.nodes.click.triggerAttackRelease("C6", "32n", now, 0.32 * vel);
              this.nodes.bell.triggerAttackRelease(["E5", "A5"], "16n", now + 0.018, 0.26 * vel);
              this.nodes.sweep.triggerAttackRelease("A4", "16n", now, 0.12 * vel);
              break;
            case "blocked":
              this.nodes.click.triggerAttackRelease("G2", "32n", now, 0.24);
              this.nodes.noise.triggerAttackRelease("48n", now, 0.2);
              break;
            case "hint":
              this.nodes.bell.triggerAttackRelease(["D5", "F#5", "A5"], "16n", now, 0.2);
              this.nodes.fm.triggerAttackRelease("D6", "16n", now + 0.05, 0.12);
              break;
            case "button":
              this.nodes.click.triggerAttackRelease("B5", "48n", now, 0.18);
              break;
            case "submit":
              this.nodes.bell.triggerAttackRelease(["C5", "E5", "G5"], "8n", now, 0.22);
              break;
            case "win":
              ["C5", "E5", "G5", "B5", "D6"].forEach((note, index) => {
                this.nodes.bell.triggerAttackRelease(note, "16n", now + index * 0.055, 0.22);
              });
              this.nodes.pad.triggerAttackRelease(["C4", "G4", "E5"], "2n", now, 0.12);
              break;
            default:
              this.nodes.click.triggerAttackRelease("C5", "48n", now, 0.14);
          }
        } catch (_) {
          // Tone can reject rapid overlapping triggers on some mobile browsers.
        }
      });
    }
  }

  global.ArrowsSoundManager = ArrowsSoundManager;
})(window);
