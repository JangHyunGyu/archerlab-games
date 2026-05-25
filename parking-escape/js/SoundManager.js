(function (global) {
  "use strict";

  class ParkingSoundManager {
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
        oscillator: { type: "square" },
        envelope: { attack: 0.001, decay: 0.018, sustain: 0.01, release: 0.035 },
      }).connect(this.nodes.dry);
      this.nodes.click.volume.value = -16;

      this.nodes.bell = new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 8,
        oscillator: { type: "sine" },
        envelope: { attack: 0.002, decay: 0.08, sustain: 0.2, release: 0.36 },
      }).connect(this.nodes.wet);
      this.nodes.bell.volume.value = -10;

      this.nodes.engine = new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { type: "lowpass", frequency: 160, Q: 1.1 },
        envelope: { attack: 0.006, decay: 0.08, sustain: 0.18, release: 0.16 },
        filterEnvelope: {
          attack: 0.004,
          decay: 0.1,
          sustain: 0.16,
          release: 0.14,
          baseFrequency: 55,
          octaves: 2.1,
        },
      }).connect(this.nodes.dry);
      this.nodes.engine.volume.value = -15;

      this.nodes.rev = new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { type: "lowpass", frequency: 260, Q: 1.8 },
        envelope: { attack: 0.012, decay: 0.18, sustain: 0.05, release: 0.22 },
        filterEnvelope: {
          attack: 0.008,
          decay: 0.22,
          sustain: 0.04,
          release: 0.18,
          baseFrequency: 80,
          octaves: 3.4,
        },
      }).connect(this.nodes.echo);
      this.nodes.rev.volume.value = -17;

      this.nodes.pad = new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 8,
        oscillator: { type: "sine" },
        envelope: { attack: 0.02, decay: 0.22, sustain: 0.32, release: 0.8 },
      }).connect(this.nodes.wet);
      this.nodes.pad.volume.value = -18;

      this.nodes.tireFilter = new Tone.Filter({
        type: "bandpass",
        frequency: 780,
        Q: 0.95,
      }).connect(this.nodes.dry);
      this.nodes.tire = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.004, decay: 0.12, sustain: 0, release: 0.055 },
      }).connect(this.nodes.tireFilter);
      this.nodes.tire.volume.value = -23;

      this.nodes.impact = new Tone.Synth({
        oscillator: { type: "square" },
        envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.04 },
      }).connect(this.nodes.dry);
      this.nodes.impact.volume.value = -14;

      this.ready = true;
    }

    play(type, intensity = 1) {
      if (!this.enabled || typeof Tone === "undefined") return;
      this.ensure().then(ok => {
        if (!ok) return;
        const nowMs = performance.now();
        const minGap = type === "blocked" ? 90 : type === "move" || type === "targetMove" ? 60 : 28;
        if (nowMs - (this.lastAt.get(type) || 0) < minGap) return;
        this.lastAt.set(type, nowMs);
        const now = Tone.now() + 0.01;
        const vel = Math.max(0.08, Math.min(0.9, intensity));

        try {
          switch (type) {
            case "start":
              this.nodes.engine.triggerAttackRelease("C2", "16n", now, 0.24);
              this.nodes.engine.triggerAttackRelease("G2", "16n", now + 0.09, 0.18);
              this.nodes.click.triggerAttackRelease("E5", "48n", now + 0.02, 0.12);
              break;
            case "move":
              this.nodes.engine.triggerAttackRelease(vel > 0.45 ? "D2" : "C2", "16n", now, 0.16 + vel * 0.2);
              this.nodes.tire.triggerAttackRelease(vel > 0.55 ? "12n" : "18n", now + 0.006, 0.1 + vel * 0.22);
              break;
            case "targetMove":
              this.nodes.engine.triggerAttackRelease("E2", "16n", now, 0.22 + vel * 0.22);
              this.nodes.tire.triggerAttackRelease("14n", now + 0.006, 0.16 + vel * 0.24);
              break;
            case "clear":
            case "exit":
              this.nodes.rev.triggerAttackRelease("C2", "12n", now, 0.2 + vel * 0.22);
              this.nodes.rev.triggerAttackRelease("G2", "8n", now + 0.12, 0.18 + vel * 0.18);
              this.nodes.tire.triggerAttackRelease("8n", now + 0.02, 0.18 + vel * 0.22);
              break;
            case "blocked":
              this.nodes.impact.triggerAttackRelease("C2", "32n", now, 0.28);
              this.nodes.tire.triggerAttackRelease("48n", now + 0.01, 0.2);
              break;
            case "hint":
              this.nodes.bell.triggerAttackRelease(["D5", "F#5", "A5"], "16n", now, 0.2);
              this.nodes.click.triggerAttackRelease("D6", "32n", now + 0.05, 0.1);
              break;
            case "button":
              this.nodes.click.triggerAttackRelease("B5", "64n", now, 0.14);
              break;
            case "submit":
              this.nodes.bell.triggerAttackRelease(["C5", "E5", "G5"], "8n", now, 0.22);
              break;
            case "win":
              ["E5", "G5", "B5", "E6"].forEach((note, index) => {
                this.nodes.bell.triggerAttackRelease(note, "16n", now + index * 0.05, 0.18);
              });
              this.nodes.pad.triggerAttackRelease(["E4", "B4"], "4n", now, 0.09);
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

  global.ParkingSoundManager = ParkingSoundManager;
})(window);
