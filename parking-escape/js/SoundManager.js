(function (global) {
  "use strict";

  class ParkingSoundManager {
    constructor() {
      this.storageKey = "archerlab-parking-sound-enabled";
      this.enabled = this.readEnabled();
      this.ready = false;
      this.lastAt = new Map();
      this.nodes = {};
    }

    readEnabled() {
      try {
        return localStorage.getItem(this.storageKey) !== "0";
      } catch (_) {
        return true;
      }
    }

    isEnabled() {
      return this.enabled;
    }

    setEnabled(enabled) {
      this.enabled = !!enabled;
      try {
        localStorage.setItem(this.storageKey, this.enabled ? "1" : "0");
      } catch (_) {}
      return this.enabled;
    }

    toggle() {
      return this.setEnabled(!this.enabled);
    }

    async ensure() {
      if (!this.enabled) return false;
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

      this.nodes.limiter = new Tone.Limiter(-1).toDestination();
      this.nodes.comp = new Tone.Compressor({
        threshold: -16,
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
      this.nodes.dry = new Tone.Channel({ volume: 2 }).connect(this.nodes.comp);
      this.nodes.wet = new Tone.Channel({ volume: -1 }).connect(this.nodes.reverb);
      this.nodes.echo = new Tone.Channel({ volume: -3 }).connect(this.nodes.delay);

      this.nodes.click = new Tone.Synth({
        oscillator: { type: "square" },
        envelope: { attack: 0.001, decay: 0.018, sustain: 0.01, release: 0.035 },
      }).connect(this.nodes.dry);
      this.nodes.click.volume.value = -12;

      this.nodes.bell = new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 8,
        oscillator: { type: "sine" },
        envelope: { attack: 0.002, decay: 0.08, sustain: 0.2, release: 0.36 },
      }).connect(this.nodes.wet);
      this.nodes.bell.volume.value = -5;

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
      this.nodes.engine.volume.value = -9;

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
      this.nodes.rev.volume.value = -10;

      this.nodes.body = new Tone.MonoSynth({
        oscillator: { type: "triangle" },
        filter: { type: "lowpass", frequency: 92, Q: 0.55 },
        envelope: { attack: 0.006, decay: 0.16, sustain: 0.08, release: 0.18 },
        filterEnvelope: {
          attack: 0.004,
          decay: 0.18,
          sustain: 0.05,
          release: 0.18,
          baseFrequency: 38,
          octaves: 1.6,
        },
      }).connect(this.nodes.dry);
      this.nodes.body.volume.value = -11;

      this.nodes.gear = new Tone.Synth({
        oscillator: { type: "square" },
        envelope: { attack: 0.001, decay: 0.012, sustain: 0, release: 0.018 },
      }).connect(this.nodes.dry);
      this.nodes.gear.volume.value = -15;

      this.nodes.pad = new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 8,
        oscillator: { type: "sine" },
        envelope: { attack: 0.02, decay: 0.22, sustain: 0.32, release: 0.8 },
      }).connect(this.nodes.wet);
      this.nodes.pad.volume.value = -12;

      this.nodes.tireFilter = new Tone.Filter({
        type: "bandpass",
        frequency: 780,
        Q: 0.95,
      }).connect(this.nodes.dry);
      this.nodes.tire = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.004, decay: 0.12, sustain: 0, release: 0.055 },
      }).connect(this.nodes.tireFilter);
      this.nodes.tire.volume.value = -16;

      this.nodes.rollFilter = new Tone.Filter({
        type: "lowpass",
        frequency: 420,
        Q: 0.55,
      }).connect(this.nodes.dry);
      this.nodes.roll = new Tone.NoiseSynth({
        noise: { type: "brown" },
        envelope: { attack: 0.006, decay: 0.18, sustain: 0.02, release: 0.09 },
      }).connect(this.nodes.rollFilter);
      this.nodes.roll.volume.value = -20;

      this.nodes.skidFilter = new Tone.Filter({
        type: "bandpass",
        frequency: 1650,
        Q: 1.85,
      }).connect(this.nodes.dry);
      this.nodes.skid = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.035 },
      }).connect(this.nodes.skidFilter);
      this.nodes.skid.volume.value = -18;

      this.nodes.airFilter = new Tone.Filter({
        type: "highpass",
        frequency: 1850,
        Q: 0.7,
      }).connect(this.nodes.echo);
      this.nodes.air = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.004, decay: 0.22, sustain: 0, release: 0.08 },
      }).connect(this.nodes.airFilter);
      this.nodes.air.volume.value = -22;

      this.nodes.rumbleFilter = new Tone.Filter({
        type: "lowpass",
        frequency: 120,
        Q: 0.6,
      }).connect(this.nodes.dry);
      this.nodes.rumble = new Tone.NoiseSynth({
        noise: { type: "brown" },
        envelope: { attack: 0.01, decay: 0.18, sustain: 0.02, release: 0.1 },
      }).connect(this.nodes.rumbleFilter);
      this.nodes.rumble.volume.value = -20;

      this.nodes.impact = new Tone.Synth({
        oscillator: { type: "square" },
        envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.04 },
      }).connect(this.nodes.dry);
      this.nodes.impact.volume.value = -8;

      this.nodes.metal = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.03 },
      }).connect(this.nodes.wet);
      this.nodes.metal.volume.value = -12;

      this.nodes.alarm = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.002, decay: 0.09, sustain: 0.02, release: 0.08 },
      }).connect(this.nodes.wet);
      this.nodes.alarm.volume.value = -7;

      this.nodes.sensor = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.035, sustain: 0.06, release: 0.045 },
      }).connect(this.nodes.wet);
      this.nodes.sensor.volume.value = -6;

      this.ready = true;
    }

    clamp(value, min = 0.08, max = 0.9) {
      return Math.max(min, Math.min(max, value));
    }

    jitter(range = 0.012) {
      return (Math.random() - 0.5) * range;
    }

    hit(node, note, duration, time, velocity) {
      node.triggerAttackRelease(note, duration, time + this.jitter(), this.clamp(velocity));
    }

    noise(node, duration, time, velocity) {
      node.triggerAttackRelease(duration, time + this.jitter(), this.clamp(velocity));
    }

    playStart(now, vel) {
      this.hit(this.nodes.body, "G1", "12n", now, 0.12 + vel * 0.08);
      this.hit(this.nodes.engine, "C2", "16n", now + 0.012, 0.22);
      this.hit(this.nodes.engine, "G2", "16n", now + 0.105, 0.16);
      this.hit(this.nodes.rev, "D2", "16n", now + 0.06, 0.14);
      this.hit(this.nodes.gear, "E5", "128n", now + 0.018, 0.11);
      this.noise(this.nodes.roll, "12n", now + 0.018, 0.09);
      this.noise(this.nodes.air, "16n", now + 0.12, 0.06);
    }

    playDragStart(now, vel) {
      this.hit(this.nodes.gear, "G5", "128n", now, 0.12);
      this.hit(this.nodes.metal, "D6", "128n", now + 0.012, 0.08);
      this.hit(this.nodes.body, "A1", "64n", now + 0.006, 0.08 + vel * 0.04);
      this.noise(this.nodes.roll, "64n", now + 0.014, 0.05);
    }

    playMove(now, vel, target = false) {
      const engineNote = target ? "F2" : vel > 0.72 ? "E2" : vel > 0.48 ? "D2" : "C2";
      const bodyNote = target ? "B1" : "A1";
      this.hit(this.nodes.body, bodyNote, "16n", now, 0.07 + vel * 0.09);
      this.hit(this.nodes.engine, engineNote, "16n", now + 0.006, 0.12 + vel * 0.22);
      this.noise(this.nodes.roll, vel > 0.58 ? "12n" : "18n", now + 0.004, 0.08 + vel * 0.17);
      this.noise(this.nodes.tire, vel > 0.58 ? "14n" : "18n", now + 0.012, 0.09 + vel * 0.18);
      if (target || vel > 0.48) {
        this.noise(this.nodes.skid, "32n", now + 0.032, 0.05 + vel * 0.1);
      }
      if (target) {
        this.hit(this.nodes.rev, "C3", "32n", now + 0.072, 0.1 + vel * 0.12);
        this.hit(this.nodes.gear, "A5", "128n", now + 0.02, 0.08);
      }
    }

    playExit(now, vel) {
      this.hit(this.nodes.body, "C2", "8n", now, 0.15 + vel * 0.08);
      [["C2", 0], ["F2", 0.08], ["A2", 0.17], ["C3", 0.28]].forEach(([note, offset], index) => {
        this.hit(this.nodes.rev, note, index < 2 ? "16n" : "12n", now + offset, 0.15 + vel * 0.13);
      });
      this.noise(this.nodes.roll, "4n", now + 0.012, 0.18 + vel * 0.24);
      this.noise(this.nodes.tire, "8n", now + 0.02, 0.18 + vel * 0.24);
      this.noise(this.nodes.skid, "16n", now + 0.05, 0.11 + vel * 0.12);
      this.noise(this.nodes.air, "4n", now + 0.12, 0.16 + vel * 0.18);
      this.nodes.bell.triggerAttackRelease(["E4", "A4"], "16n", now + 0.24, 0.12);
      this.hit(this.nodes.metal, "B5", "64n", now + 0.32, 0.08);
    }

    playBlocked(now, vel) {
      this.hit(this.nodes.body, "F1", "32n", now, 0.17 + vel * 0.07);
      this.hit(this.nodes.impact, "C2", "64n", now + 0.004, 0.25);
      this.hit(this.nodes.impact, "F#1", "64n", now + 0.035, 0.13);
      this.hit(this.nodes.metal, "C5", "96n", now + 0.018, 0.08);
      this.hit(this.nodes.metal, "F5", "128n", now + 0.05, 0.05);
      this.noise(this.nodes.skid, "48n", now + 0.008, 0.2);
      this.noise(this.nodes.tire, "48n", now + 0.02, 0.14);
      this.noise(this.nodes.rumble, "32n", now, 0.12);
    }

    playTimer(now, vel) {
      const note = vel > 0.68 ? "C6" : vel > 0.52 ? "B5" : vel > 0.36 ? "A5" : "G5";
      this.hit(this.nodes.sensor, note, "32n", now, 0.16 + vel * 0.16);
      this.hit(this.nodes.sensor, note, "64n", now + 0.065, 0.08 + vel * 0.1);
      this.hit(this.nodes.click, "A5", "128n", now + 0.005, 0.08);
    }

    playTimeout(now, vel) {
      this.hit(this.nodes.body, "G1", "8n", now, 0.22);
      this.hit(this.nodes.impact, "G1", "16n", now + 0.02, 0.21);
      ["E4", "D4", "C#4"].forEach((note, index) => {
        this.hit(this.nodes.alarm, note, "16n", now + index * 0.11, 0.16 + vel * 0.04);
      });
      this.noise(this.nodes.rumble, "8n", now, 0.14);
      this.noise(this.nodes.air, "8n", now + 0.04, 0.09);
    }

    playButton(now) {
      this.hit(this.nodes.click, "B5", "128n", now, 0.11);
      this.hit(this.nodes.gear, "E6", "128n", now + 0.015, 0.05);
    }

    playRank(now) {
      this.nodes.bell.triggerAttackRelease(["D5", "A5"], "16n", now, 0.17);
      this.hit(this.nodes.click, "E6", "128n", now + 0.055, 0.08);
      this.noise(this.nodes.air, "16n", now + 0.035, 0.05);
    }

    playSubmit(now) {
      this.nodes.bell.triggerAttackRelease(["C5", "E5", "G5"], "8n", now, 0.2);
      this.hit(this.nodes.metal, "C6", "64n", now + 0.08, 0.08);
    }

    playWin(now) {
      this.playExit(now, 0.55);
      ["E5", "G5", "B5", "E6"].forEach((note, index) => {
        this.nodes.bell.triggerAttackRelease(note, "16n", now + 0.18 + index * 0.052, 0.16);
      });
      this.nodes.pad.triggerAttackRelease(["E4", "B4"], "4n", now + 0.18, 0.08);
    }

    play(type, intensity = 1) {
      if (!this.enabled || typeof Tone === "undefined") return;
      this.ensure().then(ok => {
        if (!ok) return;
        const nowMs = performance.now();
        const gaps = {
          blocked: 90,
          dragStart: 80,
          exit: 260,
          move: 60,
          rank: 200,
          targetMove: 60,
          timer: 140,
          timeout: 600,
          win: 340,
        };
        const minGap = gaps[type] || 28;
        if (nowMs - (this.lastAt.get(type) || 0) < minGap) return;
        this.lastAt.set(type, nowMs);
        const now = Tone.now() + 0.01;
        const vel = Math.max(0.08, Math.min(0.9, intensity));

        try {
          switch (type) {
            case "start":
              this.playStart(now, vel);
              break;
            case "dragStart":
              this.playDragStart(now, vel);
              break;
            case "move":
              this.playMove(now, vel, false);
              break;
            case "targetMove":
              this.playMove(now, vel, true);
              break;
            case "clear":
            case "exit":
              this.playExit(now, vel);
              break;
            case "blocked":
              this.playBlocked(now, vel);
              break;
            case "timer":
              this.playTimer(now, vel);
              break;
            case "hint":
              this.nodes.bell.triggerAttackRelease(["D5", "F#5", "A5"], "16n", now, 0.2);
              this.nodes.click.triggerAttackRelease("D6", "32n", now + 0.05, 0.1);
              break;
            case "button":
              this.playButton(now);
              break;
            case "rank":
              this.playRank(now);
              break;
            case "submit":
              this.playSubmit(now);
              break;
            case "win":
              this.playWin(now);
              break;
            case "timeout":
              this.playTimeout(now, vel);
              break;
            default:
              this.playButton(now);
          }
        } catch (_) {
          // Tone can reject rapid overlapping triggers on some mobile browsers.
        }
      });
    }
  }

  global.ParkingSoundManager = ParkingSoundManager;
})(window);
