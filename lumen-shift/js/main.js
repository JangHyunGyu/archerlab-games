const GAME_ID = "lumen-shift";
const RANK_API_BASE = "https://game-api.yama5993.workers.dev";
const COLS = 10;
const ROWS = 20;
const VISIBLE_NEXT = 5;
const SCORE_TABLE = [0, 100, 300, 500, 800];
const STORAGE_PREFIX = "lumen-shift";
const TEMP_BGM_URL = "assets/audio/lumen-temp-bgm.mp3?v=20260704-bgm-v1";

const STAGES = [
  {
    name: "Deep Tide",
    kind: "tide",
    colors: [0x68e9ff, 0x7cffb0, 0xc9f7ff],
    bg: [0x00030a, 0x021c2b],
    accent: 0x68e9ff,
    bpm: 88,
  },
  {
    name: "Ember Veil",
    kind: "ember",
    colors: [0xffd36e, 0xff7a2f, 0xffffff],
    bg: [0x080300, 0x2a0b00],
    accent: 0xffd36e,
    bpm: 104,
  },
  {
    name: "Bloom Signal",
    kind: "signal",
    colors: [0xff5bd4, 0x68e9ff, 0x8d6cff],
    bg: [0x05020d, 0x1f0732],
    accent: 0xff5bd4,
    bpm: 112,
  },
  {
    name: "Void Aurora",
    kind: "aurora",
    colors: [0x8d6cff, 0x2dd9ff, 0x7cffb0],
    bg: [0x02020b, 0x07143b],
    accent: 0x8d6cff,
    bpm: 118,
  },
  {
    name: "White Core",
    kind: "core",
    colors: [0xffffff, 0x68e9ff, 0xffd36e, 0xff5bd4],
    bg: [0x030306, 0x1d1d2d],
    accent: 0xffffff,
    bpm: 126,
  },
];

const MODES = {
  journey: { label: "Journey", lineGoal: 70, ranked: true },
  marathon: { label: "Marathon", ranked: true },
  sprint: { label: "Sprint", lineGoal: 40, ranked: true },
  ultra: { label: "Ultra", timeLimitMs: 180000, ranked: true },
  relax: { label: "Relax", ranked: false, gravityScale: 0.78 },
};

const PIECES = {
  I: { color: 0x68e9ff, matrix: [[1, 1, 1, 1]] },
  O: { color: 0xffd36e, matrix: [[1, 1], [1, 1]] },
  T: { color: 0xbf7bff, matrix: [[0, 1, 0], [1, 1, 1]] },
  S: { color: 0x7cffb0, matrix: [[0, 1, 1], [1, 1, 0]] },
  Z: { color: 0xff5d73, matrix: [[1, 1, 0], [0, 1, 1]] },
  J: { color: 0x5d8cff, matrix: [[1, 0, 0], [1, 1, 1]] },
  L: { color: 0xffa85d, matrix: [[0, 0, 1], [1, 1, 1]] },
};

const PIECE_KEYS = Object.keys(PIECES);
const KICKS = [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, -1], [1, -1], [-1, -1]];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function formatScore(value) {
  return Math.floor(value || 0).toLocaleString("en-US");
}

function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

function rotateMatrix(matrix, dir) {
  const h = matrix.length;
  const w = matrix[0].length;
  const next = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (dir > 0) next[x][h - 1 - y] = matrix[y][x];
      else next[w - 1 - x][y] = matrix[y][x];
    }
  }
  return next;
}

function readStorage(key, fallback = "") {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}:${key}`) || fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${key}`, String(value));
  } catch {
    // Ignore private-mode storage failures.
  }
}

class RankClient {
  constructor() {
    this.sessionId = "";
    this.queue = [];
    this.disabled = false;
    this.syncing = false;
  }

  async start() {
    this.sessionId = "";
    this.queue = [];
    this.disabled = false;
    try {
      const res = await fetch(`${RANK_API_BASE}/score-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ game_id: GAME_ID }),
      });
      if (!res.ok) throw new Error(`session ${res.status}`);
      const data = await res.json();
      this.sessionId = data.session_id || "";
      if (!this.sessionId) throw new Error("empty session");
    } catch {
      this.disabled = true;
    }
  }

  record(event) {
    if (this.disabled || !this.sessionId || !event) return;
    const delta = Math.floor(Number(event.delta || 0));
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.queue.push({
      ...event,
      delta,
      level: Math.floor(Number(event.level || 1)),
      combo: Math.floor(Number(event.combo || 0)),
      at: Date.now(),
    });
    if (this.queue.length >= 8) {
      this.flush().catch(() => null);
    }
  }

  async flush() {
    if (this.disabled || !this.sessionId || this.syncing || this.queue.length === 0) return false;
    this.syncing = true;
    try {
      while (this.queue.length > 0) {
        const events = this.queue.slice(0, 20);
        const res = await fetch(`${RANK_API_BASE}/score-events`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            game_id: GAME_ID,
            session_id: this.sessionId,
            events,
          }),
        });
        if (!res.ok) throw new Error(`events ${res.status}`);
        this.queue.splice(0, events.length);
      }
      return true;
    } catch {
      this.disabled = true;
      return false;
    } finally {
      this.syncing = false;
    }
  }

  async submit(playerName, score, extraData) {
    if (this.disabled || !this.sessionId) throw new Error("ranking offline");
    const synced = await this.flush();
    if (!synced) throw new Error("score sync failed");
    const res = await fetch(`${RANK_API_BASE}/rankings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        game_id: GAME_ID,
        player_name: playerName,
        score: Math.floor(score),
        session_id: this.sessionId,
        extra_data: extraData,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `submit ${res.status}`);
    return data;
  }

  async fetchTop(limit = 20) {
    const res = await fetch(`${RANK_API_BASE}/rankings?game_id=${encodeURIComponent(GAME_ID)}&limit=${limit}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`ranking ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.rankings) ? data.rankings : [];
  }
}

class AudioDirector {
  constructor() {
    this.ready = false;
    this.started = false;
    this.currentStage = 0;
    this.synths = null;
    this.stemGains = null;
    this.musicLoops = [];
    this.backingPlayer = null;
    this.backingStarted = false;
    this.backingReady = false;
    this.backingFilter = null;
    this.backingPulse = 0;
    this.backingDuck = 0;
    this.backingRetryTimer = 0;
    this.arpStep = 0;
    this.energyStep = 0;
    this.inputStep = 0;
    this.arrangement = 0;
    this.gestureHeat = 0;
    this.lastLayer = 0;
    this.transportStart = 0;
    this.timelineStep = 0;
    this.lastBeatIndex = -1;
    this.lastBarIndex = -1;
    this.beatPulse = 0;
    this.downbeatPulse = 0;
    this.eventPulse = 0;
    this.clearPulse = 0;
    this.dropPulse = 0;
    this.lastBeatState = {
      ready: false,
      position: 0,
      beat: 0,
      bar: 0,
      sixteenth: 0,
      pulse: 0,
      downbeat: 0,
      event: 0,
      clear: 0,
      drop: 0,
      bpm: STAGES[0].bpm,
    };
  }

  async unlock() {
    if (this.ready || !window.Tone) return;
    try {
      await window.Tone.start();
      const Tone = window.Tone;
      let master = null;
      try {
        const limiter = new Tone.Limiter(-1.2).toDestination();
        const compressor = new Tone.Compressor({
          threshold: -14,
          ratio: 3.5,
          attack: 0.004,
          release: 0.16,
        }).connect(limiter);
        master = new Tone.Gain(0.62).connect(compressor);
      } catch {
        master = new Tone.Gain(0.58).toDestination();
      }
      const delay = new Tone.FeedbackDelay("8n", 0.22).connect(master);
      const reverb = new Tone.Reverb({ decay: 3.2, wet: 0.28 }).connect(master);
      const baseGain = new Tone.Gain(0.1).connect(reverb);
      const pulseGain = new Tone.Gain(0.01).connect(delay);
      const energyGain = new Tone.Gain(0.0).connect(master);
      const zoneGain = new Tone.Gain(0).connect(reverb);
      const hitGain = new Tone.Gain(0.26).connect(master);
      const clearGain = new Tone.Gain(0.72).connect(hitGain);
      const motionGain = new Tone.Gain(0.24).connect(delay);
      const textureGain = new Tone.Gain(0).connect(reverb);
      const rhythmGain = new Tone.Gain(0.0).connect(master);
      const backingGain = new Tone.Gain(0.0).connect(master);
      let backingInput = backingGain;
      try {
        this.backingFilter = new Tone.Filter({ type: "lowpass", frequency: 6200, Q: 0.45 }).connect(backingGain);
        backingInput = this.backingFilter;
      } catch {
        this.backingFilter = null;
      }
      const pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.08, decay: 0.2, sustain: 0.42, release: 1.4 },
      }).connect(baseGain);
      const pluck = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.08, sustain: 0.08, release: 0.16 },
      }).connect(motionGain);
      const bass = new Tone.MembraneSynth({
        pitchDecay: 0.015,
        octaves: 5,
        envelope: { attack: 0.001, decay: 0.25, sustain: 0.02, release: 0.2 },
      }).connect(energyGain);
      const impact = new Tone.MembraneSynth({
        pitchDecay: 0.012,
        octaves: 4.6,
        envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.18 },
      }).connect(hitGain);
      const clear = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsine", count: 2, spread: 12 },
        envelope: { attack: 0.012, decay: 0.14, sustain: 0.12, release: 0.34 },
      }).connect(clearGain);
      const arp = new Tone.Synth({
        oscillator: { type: "fatsine", count: 2, spread: 14 },
        envelope: { attack: 0.004, decay: 0.06, sustain: 0.04, release: 0.18 },
      }).connect(pulseGain);
      const pulse = new Tone.MetalSynth({
        frequency: 190,
        envelope: { attack: 0.001, decay: 0.08, release: 0.04 },
        harmonicity: 3.1,
        modulationIndex: 8,
        resonance: 900,
        octaves: 0.9,
      }).connect(energyGain);
      const kick = new Tone.MembraneSynth({
        pitchDecay: 0.018,
        octaves: 3.2,
        envelope: { attack: 0.001, decay: 0.18, sustain: 0.01, release: 0.12 },
      }).connect(rhythmGain);
      const hat = new Tone.MetalSynth({
        frequency: 320,
        envelope: { attack: 0.001, decay: 0.045, release: 0.02 },
        harmonicity: 4.2,
        modulationIndex: 10,
        resonance: 2100,
        octaves: 0.42,
      }).connect(rhythmGain);
      const shimmer = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.02, decay: 0.08, sustain: 0.24, release: 0.7 },
      }).connect(zoneGain);
      const sparkle = new Tone.Synth({
        oscillator: { type: "amsine", harmonicity: 1.5 },
        envelope: { attack: 0.006, decay: 0.08, sustain: 0.04, release: 0.26 },
      }).connect(textureGain);
      if (Tone.Player) {
        try {
          this.backingPlayer = new Tone.Player({
            url: TEMP_BGM_URL,
            loop: true,
            fadeIn: 0.18,
            fadeOut: 0.18,
            onload: () => {
              this.backingReady = true;
              if (this.started) this.startBackingTrack();
            },
          }).connect(backingInput);
        } catch {
          this.backingPlayer = null;
        }
      }
      this.stemGains = {
        base: baseGain,
        pulse: pulseGain,
        energy: energyGain,
        zone: zoneGain,
        hit: hitGain,
        motion: motionGain,
        texture: textureGain,
        rhythm: rhythmGain,
        backing: backingGain,
      };
      this.synths = { pad, pluck, bass, impact, clear, arp, pulse, shimmer, sparkle, kick, hat };
      this.ready = true;
      if (this.backingPlayer && Tone.loaded) {
        let loaded = false;
        try {
          await Promise.race([
            Tone.loaded().then(() => {
              loaded = true;
            }),
            new Promise((resolve) => setTimeout(resolve, 2400)),
          ]);
          this.backingReady = loaded || this.isBackingLoaded();
        } catch {
          this.backingReady = this.isBackingLoaded();
        }
      }
      this.startMusic();
    } catch {
      this.ready = false;
    }
  }

  startMusic() {
    if (!this.ready || this.started || !window.Tone) return;
    const Tone = window.Tone;
    const chords = [
      ["C3", "G3", "D4"],
      ["D3", "A3", "E4"],
      ["A2", "E3", "B3"],
      ["F2", "C3", "G3"],
    ];
    const arps = [
      ["C5", "D5", "G5", "A5"],
      ["D5", "E5", "A5", "C6"],
      ["A4", "B4", "E5", "G5"],
      ["F4", "G4", "C5", "E5"],
    ];
    let step = 0;
    this.musicLoops = [];
    const baseLoop = new Tone.Loop((time) => {
      if (!this.synths) return;
      const arrangement = this.arrangement;
      const chord = chords[step % chords.length];
      this.synths.pad.triggerAttackRelease(chord, "2n", time, 0.08 + arrangement * 0.13);
      if (step % 2 === 0 && arrangement > 0.12) {
        this.synths.bass.triggerAttackRelease(chord[0], "8n", time, 0.16 + arrangement * 0.22);
      }
      step += 1;
    }, "1m");
    const pulseLoop = new Tone.Loop((time) => {
      if (!this.synths) return;
      const arrangement = this.arrangement;
      if (arrangement < 0.14 && this.gestureHeat < 0.18 && this.arpStep % 2 === 1) {
        this.arpStep += 1;
        return;
      }
      const bank = arps[step % arps.length];
      const note = bank[this.arpStep % bank.length];
      this.synths.arp.triggerAttackRelease(note, "32n", time, 0.045 + arrangement * 0.1 + this.gestureHeat * 0.035);
      this.arpStep += 1;
    }, "8n");
    const energyLoop = new Tone.Loop((time) => {
      if (!this.synths) return;
      const arrangement = this.arrangement;
      if (arrangement > 0.28 || this.gestureHeat > 0.42) {
        const every = arrangement > 0.64 ? 1 : 2;
        if (this.energyStep % every === 0) this.synths.pulse.triggerAttackRelease("32n", time, 0.06 + arrangement * 0.12);
      }
      this.energyStep += 1;
    }, "4n");
    const zoneLoop = new Tone.Loop((time) => {
      if (!this.synths) return;
      const chord = chords[(step + 1) % chords.length].map((note) => note.replace(/\d$/, (oct) => String(Number(oct) + 2)));
      this.synths.shimmer.triggerAttackRelease(chord, "16n", time, 0.1);
    }, "2n");
    const textureLoop = new Tone.Loop((time) => {
      if (!this.synths || this.arrangement < 0.46) return;
      const bank = arps[(step + 1) % arps.length];
      const note = bank[(this.arpStep + 2) % bank.length].replace(/\d$/, (oct) => String(Math.min(7, Number(oct) + 1)));
      this.synths.sparkle.triggerAttackRelease(note, "32n", time, 0.035 + this.arrangement * 0.08);
    }, "16n");
    const timelineLoop = new Tone.Loop((time) => {
      if (!this.synths) return;
      const step16 = this.timelineStep % 16;
      const arrangement = this.arrangement;
      if (step16 % 4 === 0) {
        this.beatPulse = 1;
        if (step16 === 0) this.downbeatPulse = 1;
      }
      if (arrangement > 0.18 && (step16 === 0 || step16 === 8 || this.gestureHeat > 0.7)) {
        this.synths.kick.triggerAttackRelease(step16 === 0 ? "C1" : "G1", "16n", time, 0.08 + arrangement * 0.11);
      }
      if (arrangement > 0.38 && step16 % 2 === 1) {
        this.synths.hat.triggerAttackRelease("64n", time, 0.025 + arrangement * 0.035);
      }
      if (arrangement > 0.68 && (step16 === 6 || step16 === 14)) {
        this.synths.pulse.triggerAttackRelease("32n", time, 0.05 + arrangement * 0.08);
      }
      this.timelineStep = (this.timelineStep + 1) % 64;
    }, "16n");
    this.musicLoops.push(baseLoop, pulseLoop, energyLoop, zoneLoop, textureLoop, timelineLoop);
    this.musicLoops.forEach((loop) => loop.start(0));
    Tone.Transport.bpm.value = STAGES[0].bpm;
    this.transportStart = Tone.now();
    this.timelineStep = 0;
    this.startBackingTrack();
    Tone.Transport.start();
    this.started = true;
  }

  startBackingTrack() {
    if (!this.backingPlayer || this.backingStarted) return;
    if (!this.isBackingLoaded()) {
      this.backingReady = false;
      window.clearTimeout(this.backingRetryTimer);
      this.backingRetryTimer = window.setTimeout(() => this.startBackingTrack(), 320);
      return;
    }
    try {
      window.clearTimeout(this.backingRetryTimer);
      this.backingPlayer.loop = true;
      if (typeof this.backingPlayer.sync === "function") {
        this.backingPlayer.sync().start(0);
      } else {
        this.backingPlayer.start();
      }
      this.backingStarted = true;
      this.backingReady = true;
    } catch {
      this.backingReady = false;
    }
  }

  isBackingLoaded() {
    const player = this.backingPlayer;
    if (!player) return false;
    if (player.loaded === true) return true;
    if (player.buffer?.loaded === true) return true;
    return Number(player.buffer?.duration || 0) > 0;
  }

  setStage(index) {
    if (!window.Tone) return;
    this.currentStage = index;
    try {
      window.Tone.Transport.bpm.cancelScheduledValues?.(window.Tone.now());
      window.Tone.Transport.bpm.rampTo(STAGES[index]?.bpm || 100, 0.8);
    } catch {
      window.Tone.Transport.bpm.value = STAGES[index]?.bpm || 100;
    }
  }

  updateMix(snapshot) {
    if (!this.ready || !this.stemGains || !window.Tone || !snapshot) return;
    const stageCount = Math.max(1, STAGES.length - 1);
    const stageLift = clamp((snapshot.stageIndex || 0) / stageCount, 0, 1);
    const comboLift = clamp((snapshot.combo || 0) / 8, 0, 1);
    const lumenLift = clamp(snapshot.lumen || 0, 0, 1);
    const zoneLift = snapshot.zoneActive ? clamp(0.62 + (snapshot.zoneProgress || 0) * 0.38, 0, 1) : 0;
    const arrangementTarget = clamp(snapshot.arrangement?.progress ?? 0, 0, 1);
    const arrangement = smoothstep(arrangementTarget);
    this.arrangement += (arrangement - this.arrangement) * 0.22;
    this.gestureHeat = Math.max(0, this.gestureHeat - 0.045);
    this.backingPulse = Math.max(0, this.backingPulse - 0.05);
    this.backingDuck = Math.max(0, this.backingDuck - 0.045);
    const layer = snapshot.arrangement?.layer || 0;
    if (layer > this.lastLayer && this.synths?.sparkle) {
      this.lastLayer = layer;
      const liftNotes = ["C6", "E6", "G6", "B6"].slice(0, Math.max(1, Math.min(4, layer)));
      try {
        this.synths.sparkle.triggerAttackRelease(liftNotes[layer % liftNotes.length], "16n", undefined, 0.12);
      } catch {
        // Ignore decorative lift failures.
      }
    } else if (layer < this.lastLayer) {
      this.lastLayer = layer;
    }
    const energy = clamp(this.arrangement * 0.46 + stageLift * 0.2 + comboLift * 0.34 + lumenLift * 0.24 + zoneLift * 0.48, 0, 1);
    this.rampStem("base", 0.08 + this.arrangement * 0.2 + stageLift * 0.04 + zoneLift * 0.05);
    this.rampStem("pulse", 0.006 + Math.pow(this.arrangement, 1.25) * 0.19 + lumenLift * 0.1 + comboLift * 0.12 + zoneLift * 0.16);
    this.rampStem("energy", 0.004 + energy * 0.28);
    this.rampStem("texture", Math.pow(this.arrangement, 1.75) * 0.18 + zoneLift * 0.08);
    this.rampStem("motion", 0.21 + this.arrangement * 0.08 + this.gestureHeat * 0.05);
    this.rampStem("rhythm", Math.max(0, this.arrangement - 0.12) * 0.16 + comboLift * 0.045 + zoneLift * 0.08);
    const beatLift = Math.max(this.lastBeatState?.pulse || 0, this.lastBeatState?.downbeat || 0) * 0.012;
    const backingDuck = 1 - Math.min(0.38, this.backingDuck * 0.22 + (this.clearPulse || 0) * 0.13 + (this.dropPulse || 0) * 0.09);
    this.rampStem("backing", this.backingPlayer ? (0.036 + this.arrangement * 0.12 + zoneLift * 0.04 + beatLift + this.backingPulse * 0.018) * backingDuck : 0);
    this.rampStem("zone", zoneLift * 0.42);
    this.rampStem("hit", 0.22 + energy * 0.09);
    this.rampParam(this.backingFilter?.frequency, 4200 + this.arrangement * 6200 + zoneLift * 2800 + this.backingPulse * 1600, 0.18);
    const targetBpm = (snapshot.stage?.bpm || STAGES[this.currentStage]?.bpm || 100) + comboLift * 3 + zoneLift * 5 + this.arrangement * 1.6;
    try {
      window.Tone.Transport.bpm.cancelScheduledValues?.(window.Tone.now());
      window.Tone.Transport.bpm.rampTo(targetBpm, 0.4);
    } catch {
      window.Tone.Transport.bpm.value = targetBpm;
    }
  }

  rampStem(key, value) {
    const stem = this.stemGains?.[key];
    if (!stem) return;
    try {
      stem.gain.cancelScheduledValues?.(window.Tone.now());
      stem.gain.rampTo(value, 0.24);
    } catch {
      stem.gain.value = value;
    }
  }

  rampParam(param, value, time = 0.18) {
    if (!param || !window.Tone) return;
    try {
      param.cancelScheduledValues?.(window.Tone.now());
      if (typeof param.rampTo === "function") param.rampTo(value, time);
      else param.value = value;
    } catch {
      param.value = value;
    }
  }

  getBeatState(snapshot, dt = 16.67) {
    const bpm = snapshot?.stage?.bpm || STAGES[this.currentStage]?.bpm || STAGES[0].bpm;
    let beatFloat = 0;
    let ready = false;
    if (this.ready && this.started && window.Tone) {
      const Tone = window.Tone;
      const transportBpm = Number(Tone.Transport?.bpm?.value || bpm);
      const seconds = Number(Tone.Transport?.seconds || 0);
      beatFloat = seconds * transportBpm / 60;
      ready = true;
    } else {
      beatFloat = performance.now() * 0.001 * bpm / 60;
    }
    const beatIndex = Math.floor(beatFloat);
    const barIndex = Math.floor(beatIndex / 4);
    if (beatIndex !== this.lastBeatIndex) {
      this.lastBeatIndex = beatIndex;
      this.beatPulse = Math.max(this.beatPulse, 1);
    }
    if (barIndex !== this.lastBarIndex) {
      this.lastBarIndex = barIndex;
      this.downbeatPulse = Math.max(this.downbeatPulse, 1);
    }
    const decay = dt / 16.67;
    this.beatPulse = Math.max(0, this.beatPulse - 0.12 * decay);
    this.downbeatPulse = Math.max(0, this.downbeatPulse - 0.075 * decay);
    this.eventPulse = Math.max(0, this.eventPulse - 0.08 * decay);
    this.clearPulse = Math.max(0, this.clearPulse - 0.07 * decay);
    this.dropPulse = Math.max(0, this.dropPulse - 0.1 * decay);
    const position = beatFloat - Math.floor(beatFloat);
    this.lastBeatState = {
      ready,
      position,
      beat: beatIndex % 4,
      bar: barIndex,
      sixteenth: Math.floor(beatFloat * 4) % 16,
      pulse: Math.max(this.beatPulse, Math.pow(1 - position, 8) * 0.52),
      downbeat: this.downbeatPulse,
      event: this.eventPulse,
      clear: this.clearPulse,
      drop: this.dropPulse,
      bpm: ready ? Number(window.Tone.Transport?.bpm?.value || bpm) : bpm,
    };
    return this.lastBeatState;
  }

  move() {
    this.eventPulse = Math.max(this.eventPulse, 0.18);
    this.inputNote(0, "32n", 0.048, 0.2);
  }

  rotate() {
    this.eventPulse = Math.max(this.eventPulse, 0.28);
    this.inputNote(2, "32n", 0.07, 0.28);
  }

  drop() {
    if (!this.ready || !this.synths) return;
    this.gestureHeat = Math.max(this.gestureHeat, 0.78);
    this.eventPulse = Math.max(this.eventPulse, 0.72);
    this.dropPulse = Math.max(this.dropPulse, 1);
    this.backingPulse = Math.max(this.backingPulse, 0.56);
    this.backingDuck = Math.max(this.backingDuck, 0.68);
    try {
      const time = window.Tone.Transport?.nextSubdivision?.("16n");
      this.synths.impact.triggerAttackRelease("C2", "16n", time, 0.34);
      this.inputNote(4, "16n", 0.08, 0.36);
    } catch {
      // Audio can be interrupted on mobile when the page loses focus.
    }
  }

  clear(lines) {
    if (!this.ready || !this.synths) return;
    const chords = {
      1: ["C5", "G5"],
      2: ["C5", "E5", "G5"],
      3: ["D5", "F5", "A5", "C6"],
      4: ["C5", "E5", "G5", "B5", "D6"],
    };
    this.gestureHeat = Math.max(this.gestureHeat, 0.48 + lines * 0.09);
    this.eventPulse = Math.max(this.eventPulse, 0.72 + lines * 0.08);
    this.clearPulse = Math.max(this.clearPulse, lines >= 4 ? 1 : 0.68);
    this.beatPulse = Math.max(this.beatPulse, lines >= 4 ? 1 : 0.72);
    this.backingPulse = Math.max(this.backingPulse, lines >= 4 ? 1 : 0.68);
    this.backingDuck = Math.max(this.backingDuck, lines >= 4 ? 1 : 0.72);
    try {
      const time = window.Tone.Transport?.nextSubdivision?.("16n");
      this.synths.clear.releaseAll?.();
      this.synths.clear.triggerAttackRelease(chords[lines] || chords[1], "8n", time, lines >= 4 ? 0.27 : 0.16);
      if (this.synths.sparkle) {
        const lift = lines >= 4 ? ["C6", "E6", "G6", "C7"] : ["C6", "G6"];
        lift.slice(0, Math.min(lift.length, lines + 1)).forEach((note, index) => {
          setTimeout(() => {
            try {
              this.synths.sparkle.triggerAttackRelease(note, "32n", undefined, lines >= 4 ? 0.062 : 0.04);
            } catch {
              // Ignore late sparkle failures.
            }
          }, index * 42);
        });
      }
    } catch {
      // Keep gameplay responsive even if WebAudio rejects a rapid trigger.
    }
  }

  zoneStart() {
    this.eventPulse = Math.max(this.eventPulse, 1);
    this.downbeatPulse = Math.max(this.downbeatPulse, 1);
    this.backingPulse = Math.max(this.backingPulse, 0.82);
    this.backingDuck = Math.max(this.backingDuck, 0.44);
    this.rampStem("zone", 0.52);
    this.note("C5", "4n", 0.28);
    setTimeout(() => this.note("G5", "4n", 0.22), 80);
  }

  zoneEnd(lines) {
    if (!this.ready || !this.synths) return;
    this.eventPulse = Math.max(this.eventPulse, lines > 0 ? 1 : 0.42);
    this.clearPulse = Math.max(this.clearPulse, lines > 0 ? 1 : 0.35);
    this.backingPulse = Math.max(this.backingPulse, lines > 0 ? 1 : 0.42);
    this.backingDuck = Math.max(this.backingDuck, lines > 0 ? 0.92 : 0.36);
    try {
      const time = window.Tone.Transport?.nextSubdivision?.("8n");
      this.rampStem("zone", 0.04);
      this.synths.clear.releaseAll?.();
      this.synths.clear.triggerAttackRelease(["C4", "G4", "C5", "E5", "G5"], "2n", time, lines > 0 ? 0.3 : 0.16);
      this.synths.impact.triggerAttackRelease("C2", "4n", time, 0.28);
    } catch {
      // Ignore mobile audio scheduling errors.
    }
  }

  note(note, duration, velocity) {
    if (!this.ready || !this.synths) return;
    try {
      this.synths.pluck.triggerAttackRelease(note, duration, undefined, velocity);
    } catch {
      // Ignore rapid input audio errors.
    }
  }

  inputNote(offset, duration, velocity, heat) {
    if (!this.ready || !this.synths) return;
    const banks = [
      ["C5", "D5", "G5", "A5", "C6", "D6"],
      ["D5", "E5", "A5", "B5", "D6", "E6"],
      ["A4", "C5", "E5", "G5", "A5", "C6"],
      ["F5", "G5", "C6", "D6", "F6", "G6"],
      ["C5", "E5", "G5", "B5", "D6", "G6"],
    ];
    const bank = banks[this.currentStage % banks.length];
    const gridStep = this.lastBeatState?.sixteenth ?? this.timelineStep;
    const note = bank[(gridStep + this.inputStep + offset) % bank.length];
    this.inputStep = (this.inputStep + 1) % 64;
    this.gestureHeat = Math.max(this.gestureHeat, heat);
    this.note(note, duration, velocity + this.arrangement * 0.035);
  }
}

class FallingBlockCore {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.reset("journey");
  }

  reset(modeKey = "journey") {
    this.modeKey = modeKey;
    this.mode = MODES[modeKey] || MODES.journey;
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.bag = [];
    this.queue = [];
    this.holdType = "";
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = 0;
    this.maxCombo = 0;
    this.stageIndex = 0;
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockDelay = 520;
    this.elapsed = 0;
    this.status = "playing";
    this.lumen = 0;
    this.zoneActive = false;
    this.zoneTimer = 0;
    this.zoneDuration = 0;
    this.zoneLines = 0;
    this.totalZoneLines = 0;
    this.lastFallAt = 0;
    while (this.queue.length < VISIBLE_NEXT + 1) this.queue.push(this.nextType());
    this.spawn();
    this.callbacks.onStage?.(0, STAGES[0]);
  }

  nextType() {
    if (this.bag.length === 0) {
      this.bag = PIECE_KEYS.slice();
      for (let i = this.bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  makePiece(type) {
    const def = PIECES[type];
    const matrix = cloneMatrix(def.matrix);
    return {
      type,
      matrix,
      color: def.color,
      x: Math.floor((COLS - matrix[0].length) / 2),
      y: -1,
    };
  }

  spawn(forcedType = "") {
    const type = forcedType || this.queue.shift();
    while (this.queue.length < VISIBLE_NEXT + 1) this.queue.push(this.nextType());
    this.active = this.makePiece(type);
    this.canHold = true;
    if (this.collides(this.active, 0, 0, this.active.matrix)) {
      if (this.modeKey === "relax") {
        this.grid.splice(0, 5);
        while (this.grid.length < ROWS) this.grid.unshift(Array(COLS).fill(null));
        this.callbacks.onEvent?.("BREATH");
      } else {
        this.finish("Game Over");
      }
    }
  }

  tick(dt) {
    if (this.status !== "playing") return;
    this.elapsed += dt;
    if (this.mode.timeLimitMs && this.elapsed >= this.mode.timeLimitMs) {
      this.finish("Time Up");
      return;
    }
    if (this.zoneActive) {
      this.zoneTimer -= dt;
      if (this.zoneTimer <= 0) this.endZone();
    }
    if (this.collides(this.active, 0, 1)) {
      this.lockTimer += dt;
      if (this.lockTimer >= this.lockDelay) {
        this.lockTimer = 0;
        this.lock();
        return;
      }
    } else {
      this.lockTimer = 0;
    }
    this.dropTimer += dt;
    const interval = this.dropInterval();
    if (Number.isFinite(interval) && this.dropTimer >= interval) {
      this.dropTimer = 0;
      this.gravityDown();
    }
  }

  dropInterval() {
    const scale = this.mode.gravityScale || 1;
    if (this.zoneActive) return Infinity;
    return Math.max(110, (900 - (this.level - 1) * 58) * scale);
  }

  collides(piece, dx, dy, matrix = piece.matrix) {
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix[y].length; x += 1) {
        if (!matrix[y][x]) continue;
        const bx = piece.x + x + dx;
        const by = piece.y + y + dy;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && this.grid[by][bx]) return true;
      }
    }
    return false;
  }

  move(dx) {
    if (this.status !== "playing") return false;
    if (!this.collides(this.active, dx, 0)) {
      this.active.x += dx;
      this.lockTimer = Math.max(0, this.lockTimer - 120);
      this.callbacks.onMove?.();
      return true;
    }
    return false;
  }

  rotate(dir = 1) {
    if (this.status !== "playing") return false;
    if (this.active.type === "O") {
      this.callbacks.onRotate?.();
      return true;
    }
    const rotated = rotateMatrix(this.active.matrix, dir);
    for (const [kx, ky] of KICKS) {
      if (!this.collides(this.active, kx, ky, rotated)) {
        this.active.matrix = rotated;
        this.active.x += kx;
        this.active.y += ky;
        this.lockTimer = Math.max(0, this.lockTimer - 160);
        this.callbacks.onRotate?.();
        return true;
      }
    }
    return false;
  }

  stepDown(manual = false) {
    if (this.status !== "playing") return false;
    if (!this.collides(this.active, 0, 1)) {
      this.active.y += 1;
      this.lockTimer = 0;
      if (manual) this.callbacks.onMove?.();
      return true;
    }
    if (manual) this.lockTimer = Math.min(this.lockDelay, this.lockTimer + 85);
    return false;
  }

  gravityDown() {
    if (this.status !== "playing") return false;
    if (!this.collides(this.active, 0, 1)) {
      this.active.y += 1;
      this.lockTimer = 0;
      return true;
    }
    return false;
  }

  hardDrop() {
    if (this.status !== "playing") return;
    let distance = 0;
    while (!this.collides(this.active, 0, 1)) {
      this.active.y += 1;
      distance += 1;
    }
    this.callbacks.onHardDrop?.(distance);
    this.lockTimer = 0;
    this.lock();
  }

  hold() {
    if (this.status !== "playing" || !this.canHold) return false;
    const current = this.active.type;
    if (this.holdType) {
      const held = this.holdType;
      this.holdType = current;
      this.active = this.makePiece(held);
      if (this.collides(this.active, 0, 0)) this.finish("Game Over");
    } else {
      this.holdType = current;
      this.spawn();
    }
    this.canHold = false;
    this.callbacks.onHold?.();
    return true;
  }

  lock() {
    if (this.status !== "playing") return;
    const lockedCells = [];
    for (let y = 0; y < this.active.matrix.length; y += 1) {
      for (let x = 0; x < this.active.matrix[y].length; x += 1) {
        if (!this.active.matrix[y][x]) continue;
        const bx = this.active.x + x;
        const by = this.active.y + y;
        if (by < 0) {
          this.finish("Game Over");
          return;
        }
        this.grid[by][bx] = { type: this.active.type, color: this.active.color };
        lockedCells.push({ row: by, col: bx, color: this.active.color, type: this.active.type });
      }
    }
    this.callbacks.onLock?.({ cells: lockedCells, type: this.active.type });
    const cleared = this.clearLines();
    if (cleared === 0) this.combo = 0;
    this.updateStage();
    if (this.mode.lineGoal && this.lines >= this.mode.lineGoal) {
      this.finish(this.modeKey === "sprint" ? "Sprint Clear" : "Journey Complete");
      return;
    }
    this.spawn();
  }

  clearLines() {
    const rows = [];
    for (let y = 0; y < ROWS; y += 1) {
      if (this.grid[y].every(Boolean)) rows.push(y);
    }
    if (rows.length === 0) return 0;

    const cells = rows.flatMap((row) => this.grid[row].map((cell, col) => ({
      row,
      col,
      color: cell?.color || STAGES[this.stageIndex]?.accent || 0xffffff,
      type: cell?.type || "",
    })));
    this.grid = this.grid.filter((_, index) => !rows.includes(index));
    while (this.grid.length < ROWS) this.grid.unshift(Array(COLS).fill(null));

    const lineCount = rows.length;
    this.lines += lineCount;
    this.level = Math.max(1, Math.floor(this.lines / 10) + 1);
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const comboBonus = Math.max(0, this.combo - 1) * 50 * this.level;
    const delta = SCORE_TABLE[lineCount] * this.level + comboBonus;
    this.score += delta;
    this.lumen = clamp(this.lumen + lineCount * 0.11 + (lineCount >= 4 ? 0.09 : 0), 0, 1);
    if (this.zoneActive) {
      this.zoneLines += lineCount;
      this.totalZoneLines += lineCount;
    }
    this.callbacks.onClear?.({
      rows,
      cells,
      lines: lineCount,
      delta,
      combo: this.combo,
      level: this.level,
      score: this.score,
      zoneActive: this.zoneActive,
    });
    return lineCount;
  }

  updateStage() {
    const nextStage = this.modeKey === "journey"
      ? clamp(Math.floor(this.lines / 14), 0, STAGES.length - 1)
      : clamp(Math.floor((this.level - 1) / 3), 0, STAGES.length - 1);
    if (nextStage !== this.stageIndex) {
      this.stageIndex = nextStage;
      this.callbacks.onStage?.(nextStage, STAGES[nextStage]);
    }
  }

  activateZone() {
    if (this.status !== "playing" || this.zoneActive || this.lumen < 0.3) return false;
    this.zoneActive = true;
    this.zoneDuration = 5600 + this.lumen * 7600;
    this.zoneTimer = this.zoneDuration;
    this.dropTimer = 0;
    this.lumen = 0;
    this.zoneLines = 0;
    this.callbacks.onZoneStart?.();
    return true;
  }

  endZone() {
    if (!this.zoneActive) return;
    this.zoneActive = false;
    const zoneLines = this.zoneLines;
    this.zoneTimer = 0;
    this.zoneDuration = 0;
    this.zoneLines = 0;
    if (zoneLines > 0) {
      const delta = zoneLines * zoneLines * 42 * this.level + zoneLines * 120;
      this.score += delta;
      this.callbacks.onZoneEnd?.({ lines: zoneLines, delta, level: this.level, score: this.score });
    } else {
      this.callbacks.onZoneEnd?.({ lines: 0, delta: 0, level: this.level, score: this.score });
    }
  }

  finish(title) {
    if (this.status === "finished") return;
    if (this.zoneActive) this.endZone();
    this.status = "finished";
    this.callbacks.onFinish?.(title, this.snapshot());
  }

  togglePause() {
    if (this.status === "playing") {
      this.status = "paused";
      return "paused";
    }
    if (this.status === "paused") {
      this.status = "playing";
      return "playing";
    }
    return this.status;
  }

  ghostPiece() {
    const ghost = {
      ...this.active,
      matrix: this.active.matrix,
    };
    while (!this.collides(ghost, 0, 1, ghost.matrix)) ghost.y += 1;
    return ghost;
  }

  arrangementState() {
    const modeGoal = this.mode.lineGoal || (this.modeKey === "ultra" ? 80 : 90);
    const lineProgress = clamp(this.lines / Math.max(1, modeGoal), 0, 1);
    const stageProgress = clamp((this.stageIndex + clamp((this.lines % 14) / 14, 0, 1)) / Math.max(1, STAGES.length - 1), 0, 1);
    const comboLift = clamp(this.combo / 10, 0, 1);
    const lumenLift = clamp(this.lumen, 0, 1);
    const zoneLift = this.zoneActive ? clamp(0.55 + this.zoneProgress * 0.45, 0, 1) : 0;
    const progress = clamp(0.035 + lineProgress * 0.48 + stageProgress * 0.22 + comboLift * 0.12 + lumenLift * 0.12 + zoneLift * 0.22, 0, 1);
    return {
      progress,
      layer: clamp(Math.floor(progress * 5.1), 0, 5),
      lineProgress,
      phrase: Math.floor(this.lines / 4) % 4,
    };
  }

  snapshot() {
    const arrangement = this.arrangementState();
    return {
      modeKey: this.modeKey,
      mode: this.mode,
      grid: this.grid,
      active: this.active,
      ghost: this.ghostPiece(),
      queue: this.queue.slice(0, VISIBLE_NEXT),
      holdType: this.holdType,
      score: this.score,
      lines: this.lines,
      level: this.level,
      combo: this.combo,
      maxCombo: this.maxCombo,
      stageIndex: this.stageIndex,
      stage: STAGES[this.stageIndex],
      lumen: this.lumen,
      zoneActive: this.zoneActive,
      zoneProgress: this.zoneActive ? 1 - this.zoneTimer / Math.max(1, this.zoneDuration) : 0,
      zoneLines: this.zoneLines,
      totalZoneLines: this.totalZoneLines,
      elapsed: this.elapsed,
      status: this.status,
      arrangement,
    };
  }
}

class PixiView {
  constructor(root) {
    this.root = root;
    this.quality = this.detectQuality();
    this.particles = [];
    this.meteors = [];
    this.clearWaves = [];
    this.beams = [];
    this.dropTrails = [];
    this.impactRings = [];
    this.rowSweeps = [];
    this.clearCores = [];
    this.clearTiles = [];
    this.lightFields = [];
    this.lockFlashes = [];
    this.shockBands = [];
    this.screenBursts = [];
    this.clearRays = [];
    this.resonancePips = [];
    this.swarm = [];
    this.swarmSprites = [];
    this.sparkSprites = [];
    this.sparkCursor = 0;
    this.particleTextures = null;
    this.particleAtlas = null;
    this.bgPlate = null;
    this.bgPlateTexture = null;
    this.distortionSprite = null;
    this.distortionFilter = null;
    this.bgStars = [];
    this.stageIndex = 0;
    this.stagePulse = 0;
    this.zonePulse = 0;
    this.beat = 0;
    this.beatHit = 0;
    this.comboPulse = 0;
    this.worldSurge = 0;
    this.arrangement = 0;
    this.arrangementLayer = 0;
    this.phrasePulse = 0;
    this.inputHeat = 0;
    this.chromaticPulse = 0;
    this.swarmTick = 0;
    this.flash = 0;
    this.shake = 0;
    this.lastLayoutKey = "";
  }

  detectQuality() {
    const coarse = matchMedia("(pointer: coarse)").matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 420;
    return {
      coarse,
      small,
      dpr: Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.85),
      bgStars: coarse ? (small ? 86 : 130) : 320,
      swarmParticles: coarse ? (small ? 860 : 1260) : 3600,
      glowParticles: coarse ? (small ? 210 : 320) : 960,
      maxParticles: coarse ? (small ? 430 : 620) : 1400,
    };
  }

  async init(onFrame) {
    if (!window.PIXI) throw new Error("PixiJS is required");
    this.app = new window.PIXI.Application();
    await this.app.init({
      resizeTo: this.root,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: this.quality.dpr,
      powerPreference: "high-performance",
    });
    this.root.appendChild(this.app.canvas || this.app.view);

    this.bg = new window.PIXI.Graphics();
    this.bgPlate = new window.PIXI.Sprite(window.PIXI.Texture.EMPTY);
    this.bgPlate.eventMode = "none";
    this.distortionSprite = new window.PIXI.Sprite(this.makeNoiseTexture());
    this.distortionSprite.eventMode = "none";
    this.distortionSprite.alpha = 0;
    this.bloomLayer = this.makeParticleLayer();
    this.swarmLayer = this.makeParticleLayer();
    this.board = new window.PIXI.Graphics();
    this.glow = new window.PIXI.Graphics();
    this.fx = new window.PIXI.Graphics();
    this.sparkLayer = this.makeParticleLayer();
    this.flashLayer = new window.PIXI.Graphics();
    this.setAdditive(this.bloomLayer);
    this.setAdditive(this.swarmLayer);
    this.setAdditive(this.glow);
    this.setAdditive(this.sparkLayer);
    this.app.stage.addChild(this.bg, this.bgPlate, this.bloomLayer, this.swarmLayer, this.board, this.glow, this.fx, this.sparkLayer, this.flashLayer, this.distortionSprite);
    this.makeParticleTextures();
    await this.loadStagePlate();
    this.applyBloomFilters();
    this.seedStars();
    this.seedSwarm();
    this.buildSwarmSprites();
    this.buildSparkSprites();

    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS || 16.67;
      onFrame(dt);
    });
  }

  makeParticleLayer() {
    const PIXI = window.PIXI;
    let layer = null;
    if (PIXI?.ParticleContainer) {
      try {
        layer = new PIXI.ParticleContainer({
          dynamicProperties: {
            position: true,
            scale: true,
            rotation: true,
            color: true,
            alpha: true,
          },
        });
      } catch {
        try {
          layer = new PIXI.ParticleContainer(4096, {
            position: true,
            scale: true,
            rotation: true,
            tint: true,
            alpha: true,
          });
        } catch {
          layer = null;
        }
      }
    }
    if (!layer) layer = new PIXI.Container();
    layer.eventMode = "none";
    return layer;
  }

  async loadStagePlate() {
    if (!this.bgPlate || !window.PIXI?.Assets) return;
    try {
      this.bgPlateTexture = await window.PIXI.Assets.load("assets/images/stage-lumen-field-v2.webp?v=20260704-field-v1");
      this.bgPlate.texture = this.bgPlateTexture;
      this.bgPlate.anchor?.set?.(0.5);
      this.bgPlate.visible = true;
    } catch {
      this.bgPlate.visible = false;
    }
  }

  makeNoiseTexture() {
    const PIXI = window.PIXI;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const x = (i / 4) % size;
      const y = Math.floor(i / 4 / size);
      const wave = Math.sin(x * 0.19) * 30 + Math.cos(y * 0.23) * 24;
      const grain = Math.random() * 72;
      const value = clamp(128 + wave + grain - 36, 0, 255);
      image.data[i] = value;
      image.data[i + 1] = 255 - value;
      image.data[i + 2] = 128 + Math.sin((x + y) * 0.08) * 64;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return PIXI.Texture.from(canvas);
  }

  setAdditive(layer) {
    if (!layer || !window.PIXI) return;
    try {
      layer.blendMode = window.PIXI.BLEND_MODES?.ADD || "add";
    } catch {
      layer.blendMode = "add";
    }
  }

  applyBloomFilters() {
    const PIXI = window.PIXI;
    if (!PIXI?.BlurFilter) return;
    const allowFilter = Math.min(window.innerWidth, window.innerHeight) >= (this.quality.coarse ? 360 : 560);
    if (!allowFilter) {
      this.bloomLayer.filters = null;
      if (this.glow) this.glow.filters = null;
      this.sparkLayer.filters = null;
      this.flashLayer.filters = null;
      return;
    }
    const makeBlur = (strength, quality) => {
      try {
        return new PIXI.BlurFilter({ strength, quality });
      } catch {
        const filter = new PIXI.BlurFilter();
        if ("strength" in filter) filter.strength = strength;
        if ("quality" in filter) filter.quality = quality;
        if ("blur" in filter) filter.blur = strength;
        return filter;
      }
    };
    try {
      const mobile = this.quality.coarse;
      this.bloomLayer.filters = [makeBlur(mobile ? 4.2 : 9.8, mobile ? 2 : 6)];
      if (this.glow) this.glow.filters = [makeBlur(mobile ? 6.4 : 15.5, mobile ? 2 : 6)];
      this.sparkLayer.filters = [makeBlur(mobile ? 0.75 : 1.35, mobile ? 1 : 3)];
      this.flashLayer.filters = [makeBlur(mobile ? 1.05 : 2.1, mobile ? 1 : 2)];
      if (PIXI.DisplacementFilter && this.distortionSprite && this.bgPlate) {
        try {
          this.distortionFilter = new PIXI.DisplacementFilter({ sprite: this.distortionSprite, scale: 0 });
        } catch {
          this.distortionFilter = new PIXI.DisplacementFilter(this.distortionSprite);
        }
        if (this.distortionFilter?.scale) {
          this.distortionFilter.scale.x = 0;
          this.distortionFilter.scale.y = 0;
        }
        this.bgPlate.filters = [this.distortionFilter];
      }
    } catch {
      this.bloomLayer.filters = null;
      if (this.glow) this.glow.filters = null;
      this.sparkLayer.filters = null;
      this.flashLayer.filters = null;
      if (this.bgPlate) this.bgPlate.filters = null;
      this.distortionFilter = null;
    }
  }

  addParticleSprite(layer, sprite) {
    if (!layer || !sprite) return;
    if (typeof layer.addParticle === "function") {
      layer.addParticle(sprite);
    } else {
      layer.addChild(sprite);
    }
  }

  createParticleNode(layer, texture) {
    const PIXI = window.PIXI;
    const useParticle = typeof layer?.addParticle === "function" && PIXI?.Particle;
    let node;
    if (useParticle) {
      node = new PIXI.Particle({
        texture,
        anchorX: 0.5,
        anchorY: 0.5,
        alpha: 0,
      });
      node.x = -9999;
      node.y = -9999;
    } else {
      node = new PIXI.Sprite(texture);
      node.anchor?.set?.(0.5);
      node.visible = false;
    }
    this.setAdditive(node);
    this.addParticleSprite(layer, node);
    return { node, isParticle: useParticle, active: false, texture };
  }

  showParticleNode(ref, x, y, color, alpha, scale, rotation = 0) {
    if (!ref?.node) return;
    const node = ref.node;
    ref.active = true;
    if (node.position?.set) node.position.set(x, y);
    else {
      node.x = x;
      node.y = y;
    }
    if (node.scale?.set) node.scale.set(scale);
    else {
      node.scaleX = scale;
      node.scaleY = scale;
    }
    node.tint = color;
    node.alpha = alpha;
    node.rotation = rotation;
    if ("visible" in node) node.visible = true;
  }

  hideParticleNode(ref) {
    if (!ref?.node) return;
    const node = ref.node;
    ref.active = false;
    node.alpha = 0;
    if (node.position?.set) node.position.set(-9999, -9999);
    else {
      node.x = -9999;
      node.y = -9999;
    }
    if ("visible" in node) node.visible = false;
  }

  setParticleTexture(ref, texture) {
    if (!ref?.node || !texture || ref.texture === texture) return;
    try {
      ref.node.texture = texture;
      ref.texture = texture;
    } catch {
      // Some Pixi particle builds keep texture immutable; the original pooled texture is fine.
    }
  }

  makeParticleTextures() {
    const PIXI = window.PIXI;
    const cell = this.quality.coarse ? 72 : 96;
    const kinds = ["orb", "pin", "flare", "shard", "star", "ring", "streak", "diamond", "nova", "mote", "comet", "lens", "cross"];
    const canvas = document.createElement("canvas");
    canvas.width = cell * kinds.length;
    canvas.height = cell;
    const ctx = canvas.getContext("2d");
    kinds.forEach((kind, index) => this.paintParticleCell(ctx, index * cell, cell, kind));
    const atlas = PIXI.Texture.from(canvas);
    this.particleAtlas = atlas;
    this.particleTextures = {};
    kinds.forEach((kind, index) => {
      this.particleTextures[kind] = this.textureFromAtlas(atlas, index, cell, kind);
    });
  }

  textureFromAtlas(atlas, index, cell, kind) {
    const PIXI = window.PIXI;
    const frame = PIXI.Rectangle ? new PIXI.Rectangle(index * cell, 0, cell, cell) : null;
    if (frame) {
      try {
        return new PIXI.Texture({ source: atlas.source, frame });
      } catch {
        try {
          return new PIXI.Texture(atlas.baseTexture, frame);
        } catch {
          // Fall through to a standalone canvas texture for older/newer Pixi builds.
        }
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = cell;
    canvas.height = cell;
    this.paintParticleCell(canvas.getContext("2d"), 0, cell, kind);
    return PIXI.Texture.from(canvas);
  }

  paintParticleCell(ctx, x, size, kind) {
    const cx = x + size / 2;
    const cy = size / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (kind === "flare") {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.18, "rgba(255,255,255,0.55)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, size, size);
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      ctx.fillRect(x + size * 0.1, cy - 1.2, size * 0.8, 2.4);
    } else if (kind === "nova") {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.12, "rgba(255,255,255,0.86)");
      gradient.addColorStop(0.42, "rgba(255,255,255,0.22)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, size, size);
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = size * 0.046;
      ctx.lineCap = "round";
      for (let i = 0; i < 6; i += 1) {
        const a = i * Math.PI / 3;
        const dx = Math.cos(a) * size * 0.43;
        const dy = Math.sin(a) * size * 0.43;
        ctx.beginPath();
        ctx.moveTo(cx - dx * 0.24, cy - dy * 0.24);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.stroke();
      }
    } else if (kind === "mote") {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.38);
      gradient.addColorStop(0, "rgba(255,255,255,0.95)");
      gradient.addColorStop(0.22, "rgba(255,255,255,0.58)");
      gradient.addColorStop(0.62, "rgba(255,255,255,0.16)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, size, size);
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.055, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.fill();
    } else if (kind === "comet") {
      const gradient = ctx.createLinearGradient(x + size * 0.06, cy, x + size * 0.94, cy);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.5, "rgba(255,255,255,0.26)");
      gradient.addColorStop(0.76, "rgba(255,255,255,0.92)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = size * 0.18;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + size * 0.1, cy + size * 0.11);
      ctx.quadraticCurveTo(x + size * 0.48, cy - size * 0.08, x + size * 0.9, cy);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.beginPath();
      ctx.arc(x + size * 0.77, cy - size * 0.02, size * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "lens") {
      const gradient = ctx.createRadialGradient(cx, cy, size * 0.04, cx, cy, size * 0.48);
      gradient.addColorStop(0, "rgba(255,255,255,0.78)");
      gradient.addColorStop(0.36, "rgba(255,255,255,0.24)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1.75, 0.42);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.62)";
      ctx.fillRect(x + size * 0.18, cy - 0.7, size * 0.64, 1.4);
    } else if (kind === "cross") {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.48);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.2, "rgba(255,255,255,0.42)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, size, size);
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = size * 0.03;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.44, cy);
      ctx.lineTo(cx + size * 0.44, cy);
      ctx.moveTo(cx, cy - size * 0.44);
      ctx.lineTo(cx, cy + size * 0.44);
      ctx.stroke();
    } else if (kind === "streak") {
      const gradient = ctx.createLinearGradient(x + size * 0.08, cy, x + size * 0.92, cy);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.42, "rgba(255,255,255,0.92)");
      gradient.addColorStop(0.58, "rgba(255,255,255,0.92)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = size * 0.1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + size * 0.08, cy);
      ctx.lineTo(x + size * 0.92, cy);
      ctx.stroke();
      ctx.lineWidth = size * 0.028;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.moveTo(x + size * 0.18, cy);
      ctx.lineTo(x + size * 0.82, cy);
      ctx.stroke();
    } else if (kind === "shard") {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.48);
      gradient.addColorStop(0, "rgba(255,255,255,0.72)");
      gradient.addColorStop(0.34, "rgba(255,255,255,0.22)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, size, size);
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.34);
      ctx.lineTo(cx + size * 0.16, cy);
      ctx.lineTo(cx, cy + size * 0.34);
      ctx.lineTo(cx - size * 0.16, cy);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "diamond") {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.46);
      gradient.addColorStop(0, "rgba(255,255,255,0.92)");
      gradient.addColorStop(0.36, "rgba(255,255,255,0.34)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, size, size);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = size * 0.035;
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.34);
      ctx.lineTo(cx + size * 0.34, cy);
      ctx.lineTo(cx, cy + size * 0.34);
      ctx.lineTo(cx - size * 0.34, cy);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.34)";
      ctx.fill();
    } else if (kind === "ring") {
      const gradient = ctx.createRadialGradient(cx, cy, size * 0.18, cx, cy, size * 0.48);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.52, "rgba(255,255,255,0.72)");
      gradient.addColorStop(0.72, "rgba(255,255,255,0.24)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, size, size);
    } else if (kind === "star") {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.48);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.18, "rgba(255,255,255,0.52)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, size, size);
      ctx.strokeStyle = "rgba(255,255,255,0.86)";
      ctx.lineWidth = size * 0.035;
      ctx.lineCap = "round";
      for (let i = 0; i < 4; i += 1) {
        const a = i * Math.PI / 4;
        const dx = Math.cos(a) * size * 0.38;
        const dy = Math.sin(a) * size * 0.38;
        ctx.beginPath();
        ctx.moveTo(cx - dx, cy - dy);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.stroke();
      }
    } else {
      const radius = kind === "pin" ? size * 0.32 : size * 0.5;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(kind === "pin" ? 0.18 : 0.26, "rgba(255,255,255,0.76)");
      gradient.addColorStop(0.58, "rgba(255,255,255,0.18)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, size, size);
      if (kind === "pin") {
        ctx.fillStyle = "rgba(255,255,255,0.76)";
        ctx.fillRect(cx - 0.8, cy - size * 0.32, 1.6, size * 0.64);
        ctx.fillRect(cx - size * 0.32, cy - 0.8, size * 0.64, 1.6);
      }
    }
    ctx.restore();
  }

  buildSwarmSprites() {
    const PIXI = window.PIXI;
    if (!PIXI || !this.particleTextures) return;
    const textures = this.particleTextures;
    const glowStep = Math.max(3, Math.floor(this.swarm.length / Math.max(1, this.quality.glowParticles)));
    this.swarmSprites = this.swarm.map((particle, index) => {
      const texture = particle.band < 0.12
        ? textures.comet
        : particle.band < 0.24
          ? textures.lens
          : (particle.colorBias > 0.82 ? textures.cross : (particle.colorBias > 0.58 ? textures.mote : textures.orb));
      const sprite = this.createParticleNode(this.swarmLayer, texture || textures.orb);
      let glow = null;
      if (index % glowStep === 0) {
        glow = this.createParticleNode(this.bloomLayer, particle.band < 0.2 ? textures.flare : textures.mote);
      }
      return { particle, sprite, glow };
    });
  }

  buildSparkSprites() {
    const PIXI = window.PIXI;
    if (!PIXI || !this.particleTextures) return;
    this.sparkSprites = Array.from({ length: this.quality.maxParticles }, (_, index) => {
      const pool = [
        this.particleTextures.orb,
        this.particleTextures.pin,
        this.particleTextures.shard,
        this.particleTextures.star,
        this.particleTextures.streak,
        this.particleTextures.diamond,
        this.particleTextures.nova,
        this.particleTextures.mote,
        this.particleTextures.comet,
        this.particleTextures.cross,
      ];
      const texture = pool[index % pool.length] || this.particleTextures.orb;
      return this.createParticleNode(this.sparkLayer, texture);
    });
  }

  seedStars() {
    this.bgStars = Array.from({ length: this.quality.bgStars }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.8 + 0.35,
      speed: Math.random() * 0.018 + 0.006,
      phase: Math.random() * Math.PI * 2,
      color: Math.random() > 0.64 ? 0xffd36e : (Math.random() > 0.5 ? 0x68e9ff : 0xffffff),
    }));
  }

  seedSwarm() {
    this.swarm = Array.from({ length: this.quality.swarmParticles }, (_, i) => {
      const band = Math.random();
      return {
        seed: i * 17.13 + Math.random() * 999,
        band,
        lane: Math.random(),
        phase: Math.random() * Math.PI * 2,
        orbit: Math.random() * 1.0 + 0.12,
        size: Math.pow(Math.random(), 1.35) * 3.2 + 0.34,
        speed: Math.random() * 0.64 + 0.18,
        depth: Math.random(),
        side: Math.random() > 0.5 ? 1 : -1,
        colorBias: Math.random(),
      };
    });
  }

  layout() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const portrait = h >= w;
    const topInset = portrait ? (h < 720 ? 134 : 164) : 92;
    const bottomInset = portrait ? (h < 720 ? 118 : 146) : 34;
    const availableH = Math.max(300, h - topInset - bottomInset);
    const boardW = portrait
      ? Math.min(w * 0.76, availableH * 0.5, 332)
      : Math.min(w * 0.28, (h - 124) * 0.5, 380);
    const cell = Math.floor(boardW / COLS);
    const actualW = cell * COLS;
    const actualH = cell * ROWS;
    const boardX = portrait ? Math.round((w - actualW) / 2) : Math.round(w * 0.5 - actualW / 2);
    const boardY = portrait
      ? Math.round(topInset + Math.max(0, availableH - actualH) * 0.42)
      : Math.round((h - actualH) / 2 + 18);
    const sideSpace = Math.max(0, (w - actualW) / 2);
    const portraitSidePanels = portrait && sideSpace >= 50;
    const miniW = portrait
      ? (portraitSidePanels ? Math.min(58, sideSpace - 10) : Math.min(88, Math.floor((actualW - 14) / 2)))
      : 96;
    const miniH = portrait ? (portraitSidePanels ? 66 : 52) : 96;
    const hold = portrait
      ? (portraitSidePanels
        ? { x: Math.max(8, boardX - miniW - 7), y: boardY + 22, w: miniW, h: miniH }
        : { x: boardX, y: boardY - miniH - 10, w: miniW, h: miniH })
      : { x: boardX - miniW - 22, y: boardY + 16, w: miniW, h: miniH };
    const next = portrait
      ? (portraitSidePanels
        ? { x: Math.min(w - miniW - 8, boardX + actualW + 7), y: boardY + 22, w: miniW, h: miniH + 72 }
        : { x: boardX + actualW - miniW, y: boardY - miniH - 10, w: miniW, h: miniH })
      : { x: boardX + actualW + 22, y: boardY + 16, w: miniW, h: miniH + 132 };
    return { w, h, portrait, boardX, boardY, boardW: actualW, boardH: actualH, cell, hold, next };
  }

  render(snapshot, dt, beatState = null) {
    if (!this.app || !snapshot) return;
    const layout = this.layout();
    const stage = snapshot.stage || STAGES[0];
    this.drawBackground(layout, stage, dt, snapshot, beatState);
    this.drawBoard(layout, snapshot);
    this.drawParticles(layout, dt);
    this.drawFlash(layout, dt);
  }

  drawBackground(layout, stage, dt, snapshot, beatState = null) {
    const g = this.bg;
    const t = performance.now() * 0.001;
    let beatPosition;
    if (beatState?.ready) {
      beatPosition = beatState.position || 0;
      this.beat = (beatState.bar || 0) * 4 + (beatState.beat || 0) + beatPosition;
      this.beatHit = Math.max(this.beatHit, beatState.pulse || 0, (beatState.event || 0) * 0.72);
    } else {
      const bpm = (snapshot.stage?.bpm || stage?.bpm || 100)
        + Math.min(8, (snapshot.combo || 0) * 0.45)
        + (snapshot.zoneActive ? 8 : 0);
      const previousBeat = this.beat % 1;
      this.beat += dt * 0.001 * (bpm / 60);
      beatPosition = this.beat % 1;
      if (beatPosition < previousBeat) this.beatHit = 1;
    }
    const arrangementTarget = clamp(snapshot.arrangement?.progress ?? 0, 0, 1);
    const arrangementEase = smoothstep(arrangementTarget);
    this.arrangement += (arrangementEase - this.arrangement) * clamp(dt * 0.003, 0.02, 0.18);
    const nextLayer = snapshot.arrangement?.layer || 0;
    if (nextLayer !== this.arrangementLayer) {
      this.arrangementLayer = nextLayer;
      this.phrasePulse = 1;
    }
    this.beatHit = Math.max(0, this.beatHit - dt * 0.0052);
    this.stagePulse = Math.max(0, this.stagePulse - dt * 0.0016);
    this.zonePulse = snapshot.zoneActive ? Math.min(1, this.zonePulse + dt * 0.0038) : Math.max(0, this.zonePulse - dt * 0.0024);
    this.comboPulse = Math.max(0, this.comboPulse - dt * 0.002);
    this.worldSurge = Math.max(0, this.worldSurge - dt * 0.0015);
    this.phrasePulse = Math.max(0, this.phrasePulse - dt * 0.0024);
    this.inputHeat = Math.max(0, this.inputHeat - dt * 0.003);
    g.clear();
    const maxDim = Math.max(layout.w, layout.h);
    const beatPulse = Math.max(
      this.beatHit,
      beatState?.pulse || 0,
      (beatState?.downbeat || 0) * 0.72,
      (beatState?.clear || 0) * 0.68,
      (beatState?.drop || 0) * 0.42,
      Math.pow(1 - beatPosition, 7) * 0.56,
    );
    const energy = clamp(
      0.045
      + this.arrangement * 0.34
      + snapshot.combo * 0.036
      + this.zonePulse * 0.54
      + this.stagePulse * 0.46
      + this.worldSurge * 0.4
      + beatPulse * 0.12
      + (beatState?.event || 0) * 0.09
      + (beatState?.clear || 0) * 0.14
      + this.inputHeat * 0.11,
      0.04,
      1,
    );
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH / 2;
    this.updateDistortion(layout, t, energy, beatPulse, snapshot);
    this.drawStagePlate(layout, stage, t, energy, beatPulse, cx, cy);

    g.rect(0, 0, layout.w, layout.h).fill({ color: 0x000006, alpha: 0.9 });
    g.rect(0, 0, layout.w, layout.h).fill({ color: stage.bg[0], alpha: 0.3 + this.arrangement * 0.14 + this.zonePulse * 0.12 });
    g.circle(cx, cy, maxDim * (0.38 + energy * 0.15))
      .fill({ color: stage.bg[1], alpha: 0.028 + this.arrangement * 0.05 + energy * 0.13 });
    g.circle(cx, cy, layout.boardW * (0.78 + energy * 0.16))
      .fill({ color: 0x000000, alpha: 0.28 + energy * 0.18 });
    g.circle(layout.w * 0.12, layout.h * 0.86, maxDim * 0.42)
      .fill({ color: stage.colors[1] || stage.accent, alpha: 0.014 + this.arrangement * 0.026 + energy * 0.062 });
    g.circle(layout.w * 0.9, layout.h * 0.08, maxDim * 0.36)
      .fill({ color: stage.accent, alpha: 0.014 + this.arrangement * 0.028 + energy * 0.066 });

    const ribbonBands = this.quality.coarse ? 4 : 6;
    const ribbonSegments = this.quality.coarse ? 36 : 64;
    const ribbonPasses = this.quality.coarse ? 1 : 2;
    for (let band = 0; band < ribbonBands; band += 1) {
      const phase = (t * (0.045 + band * 0.008) + band * 0.137 + this.stagePulse * 0.08) % 1;
      const side = band % 2 ? -1 : 1;
      const width = 1.2 + energy * 7 + band * 0.6;
      const alpha = (0.01 + this.arrangement * 0.024 + energy * 0.068) * (1 - band * 0.08);
      const color = stage.colors[band % stage.colors.length] || stage.accent;
      for (let pass = 0; pass < ribbonPasses; pass += 1) {
        const offset = (pass - 0.5) * layout.boardW * 0.16;
        for (let i = 0; i <= ribbonSegments; i += 1) {
          const p = i / ribbonSegments;
          const angle = -Math.PI * (0.9 + phase * 0.38) + p * Math.PI * (1.18 + phase * 0.28);
          const rx = layout.boardW * (1.05 + band * 0.19 + pass * 0.1);
          const ry = layout.boardH * (0.28 + band * 0.045);
          const x = cx + Math.cos(angle) * rx * side + offset + Math.sin(t * 0.5 + p * 8 + band) * 14;
          const y = layout.boardY + layout.boardH * (0.1 + band * 0.045) + Math.sin(angle) * ry + Math.cos(t * 0.42 + p * 7) * 10;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke({ color, alpha: alpha * (pass ? 0.55 : 1), width: width * (pass ? 0.45 : 1) });
      }
    }

    this.drawStageMotifs(layout, stage, t, energy, snapshot, cx, cy);
    this.drawDepthCurtains(layout, stage, t, energy, snapshot, cx, cy);
    this.drawResonanceField(layout, stage, t, energy, beatPulse, snapshot, cx, cy);
    this.drawVolumetricBloom(layout, stage, t, energy, beatPulse, snapshot, cx, cy);

    const drift = dt * 0.001;
    for (const star of this.bgStars) {
      star.y += star.speed * drift * (snapshot.zoneActive ? 16 : 5);
      star.x += Math.sin(t * 0.35 + star.phase) * 0.00022;
      if (star.y > 1.04) {
        star.y = -0.02;
        star.x = Math.random();
      }
      const alpha = 0.08 + this.arrangement * 0.12 + Math.sin(t * 1.8 + star.phase) * 0.16 + energy * 0.24;
      const size = star.r * (1 + beatPulse * 0.7 + this.zonePulse * 0.6);
      g.circle(star.x * layout.w, star.y * layout.h, size).fill({ color: star.color, alpha: clamp(alpha, 0.05, 0.84) });
    }

    this.drawParticleSwarm(layout, stage, t, energy + beatPulse * 0.08, snapshot);
    this.updateMeteors(layout, stage, dt, energy);

    if (snapshot.zoneActive || this.zonePulse > 0) {
      const ring = Math.sin(t * 10) * 0.5 + 0.5;
      for (let i = 0; i < 4; i += 1) {
        g.circle(cx, cy, layout.boardW * (0.62 + i * 0.28 + ring * 0.12))
          .stroke({ color: i % 2 ? stage.accent : 0xffffff, alpha: this.zonePulse * (0.1 + ring * 0.12), width: 2 + i });
      }
      g.rect(0, 0, layout.w, layout.h).fill({ color: stage.accent, alpha: this.zonePulse * 0.035 });
    }
  }

  drawResonanceField(layout, stage, t, energy, beatPulse, snapshot, cx, cy) {
    const g = this.bg;
    const arrangement = this.arrangement;
    if (arrangement <= 0.04 && this.inputHeat <= 0.03 && this.phrasePulse <= 0.03) return;
    const color = stage.accent || 0xffffff;
    const secondary = stage.colors?.[1] || color;
    const meterCount = layout.portrait ? 10 : 16;
    const sideGap = Math.max(layout.cell * 0.42, 10);
    const meterW = Math.max(2, layout.cell * 0.08);
    const meterMax = layout.cell * (0.55 + arrangement * 1.8 + beatPulse * 0.65);
    const top = layout.boardY + layout.cell * 0.5;
    const span = layout.boardH - layout.cell;
    for (let side = -1; side <= 1; side += 2) {
      const x = side < 0
        ? layout.boardX - sideGap - meterW
        : layout.boardX + layout.boardW + sideGap;
      for (let i = 0; i < meterCount; i += 1) {
        const p = i / Math.max(1, meterCount - 1);
        const y = top + span * p;
        const wave = 0.5 + Math.sin(t * (2.8 + arrangement * 2.4) + i * 0.83 + side) * 0.5;
        const phrase = snapshot.arrangement?.phrase || 0;
        const phraseLift = ((i + phrase) % 4 === 0 ? 0.34 : 0);
        const h = meterMax * (0.28 + wave * 0.56 + phraseLift + this.inputHeat * 0.42);
        const alpha = clamp(0.06 + arrangement * 0.3 + beatPulse * 0.18 + this.inputHeat * 0.16, 0, 0.64);
        g.roundRect(x, y - h / 2, meterW, h, meterW / 2)
          .fill({ color: i % 2 ? secondary : color, alpha });
      }
    }

    const ringAlpha = clamp((arrangement * 0.12 + this.phrasePulse * 0.24 + beatPulse * 0.08) * (layout.portrait ? 0.82 : 1), 0, 0.38);
    for (let i = 0; i < 3; i += 1) {
      const phase = (t * 0.12 + i * 0.18 + this.arrangementLayer * 0.07) % 1;
      g.roundRect(
        layout.boardX - layout.cell * (0.55 + phase * 1.1),
        layout.boardY - layout.cell * (0.55 + phase * 1.1),
        layout.boardW + layout.cell * (1.1 + phase * 2.2),
        layout.boardH + layout.cell * (1.1 + phase * 2.2),
        Math.max(4, layout.cell * 0.18),
      ).stroke({
        color: i % 2 ? secondary : color,
        alpha: ringAlpha * (1 - phase * 0.68),
        width: 0.8 + arrangement * 2.2 + this.phrasePulse * 2.8,
      });
    }

    if (this.phrasePulse > 0.02) {
      const radius = layout.boardW * (0.82 + (1 - this.phrasePulse) * 1.35);
      g.circle(cx, cy, radius)
        .stroke({ color: 0xffffff, alpha: this.phrasePulse * 0.34, width: 1.4 + this.phrasePulse * 4.2 });
      g.circle(cx, cy, radius * 0.62)
        .fill({ color, alpha: this.phrasePulse * 0.035 });
    }
  }

  drawVolumetricBloom(layout, stage, t, energy, beatPulse, snapshot, cx, cy) {
    const g = this.bg;
    const colors = stage.colors || [stage.accent, 0xffffff];
    const zone = snapshot.zoneActive ? 1 : 0;
    const clearLift = this.worldSurge * 0.32 + this.phrasePulse * 0.18;
    const base = clamp(0.035 + this.arrangement * 0.1 + energy * 0.15 + beatPulse * 0.075 + zone * 0.13 + clearLift, 0, 0.44);
    const radius = layout.boardW * (1.05 + this.arrangement * 0.65 + zone * 0.42 + beatPulse * 0.18);
    g.circle(cx, cy, radius)
      .fill({ color: stage.accent, alpha: base * 0.16 });
    g.circle(cx, cy, radius * (0.56 + beatPulse * 0.08))
      .fill({ color: 0xffffff, alpha: base * 0.055 });

    const plumeCount = this.quality.coarse ? 3 : 5;
    for (let i = 0; i < plumeCount; i += 1) {
      const phase = t * (0.11 + i * 0.018) + i * 1.7;
      const side = i % 2 ? -1 : 1;
      const x = cx + Math.sin(phase) * layout.boardW * (0.8 + i * 0.16) * side;
      const y = cy + Math.cos(phase * 0.72) * layout.boardH * (0.18 + i * 0.035);
      const w = layout.boardW * (0.62 + energy * 0.7 + i * 0.12);
      const h = layout.boardH * (0.2 + energy * 0.18);
      g.roundRect(x - w / 2, y - h / 2, w, h, Math.max(12, h / 2))
        .fill({ color: colors[i % colors.length] || stage.accent, alpha: base * (0.06 + i * 0.006) });
    }

    if (beatPulse > 0.04 || this.worldSurge > 0.08) {
      const pulse = Math.max(beatPulse, this.worldSurge * 0.6);
      g.roundRect(layout.boardX - layout.cell * 0.8, layout.boardY - layout.cell * 0.8, layout.boardW + layout.cell * 1.6, layout.boardH + layout.cell * 1.6, Math.max(6, layout.cell * 0.18))
        .stroke({ color: 0xffffff, alpha: pulse * 0.11, width: Math.max(1.2, layout.cell * 0.12) });
      g.roundRect(layout.boardX - layout.cell * 1.35, layout.boardY - layout.cell * 1.35, layout.boardW + layout.cell * 2.7, layout.boardH + layout.cell * 2.7, Math.max(8, layout.cell * 0.28))
        .stroke({ color: stage.accent, alpha: pulse * 0.08, width: Math.max(1.4, layout.cell * 0.18) });
    }
  }

  drawDepthCurtains(layout, stage, t, energy, snapshot, cx, cy) {
    const g = this.bg;
    const lite = this.quality.coarse;
    const colors = stage.colors || [stage.accent, 0xffffff];
    const count = lite ? 3 : 7;
    const arrangement = this.arrangement;
    const zone = snapshot.zoneActive ? 1 : 0;
    const widthBase = Math.max(layout.cell * 0.7, layout.boardW * 0.018);
    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const side = sideIndex === 0 ? -1 : 1;
      const anchorX = side < 0 ? layout.boardX - layout.boardW * 0.44 : layout.boardX + layout.boardW * 1.44;
      for (let i = 0; i < count; i += 1) {
        const color = colors[(i + sideIndex) % colors.length] || stage.accent;
        const phase = t * (0.14 + i * 0.017) + i * 1.77 + sideIndex * 0.9;
        const spread = layout.boardW * (0.6 + i * 0.18 + arrangement * 0.22);
        const x0 = anchorX + Math.sin(phase) * layout.boardW * 0.18;
        const y0 = layout.h * (-0.08 + i / Math.max(1, count - 1) * 1.08);
        const segments = lite ? 7 : 13;
        g.moveTo(x0, y0);
        for (let s = 1; s <= segments; s += 1) {
          const p = s / segments;
          const x = x0 + side * Math.sin(p * Math.PI * 1.15 + phase) * spread * (0.16 + p * 0.36);
          const y = y0 + (p - 0.5) * layout.h * 0.46 + Math.cos(phase + p * 5.2) * layout.cell * (1.4 + arrangement);
          g.lineTo(x, y);
        }
        g.stroke({
          color,
          alpha: (0.018 + arrangement * 0.05 + energy * 0.035 + zone * 0.04) * (1 - i * 0.055),
          width: widthBase * (1.4 + i * 0.42 + energy * 1.8),
        });
      }
    }

    if (!lite) {
      const haloCount = 8;
      for (let i = 0; i < haloCount; i += 1) {
        const phase = (t * 0.08 + i / haloCount + this.phrasePulse * 0.08) % 1;
        const radius = layout.boardW * (1.2 + phase * (2.4 + arrangement));
        g.circle(cx, cy, radius)
          .stroke({
            color: i % 2 ? colors[1] || stage.accent : colors[0] || 0xffffff,
            alpha: (1 - phase) * (0.018 + arrangement * 0.035 + this.phrasePulse * 0.05),
            width: 0.9 + energy * 2.4,
          });
      }
    }
  }

  updateDistortion(layout, t, energy, beatPulse, snapshot) {
    const sprite = this.distortionSprite;
    if (!sprite) return;
    const cover = Math.max(layout.w, layout.h) / 128;
    sprite.position.set(layout.w / 2 + Math.sin(t * 0.19) * layout.w * 0.08, layout.h / 2 + Math.cos(t * 0.16) * layout.h * 0.06);
    sprite.scale.set(cover * (1.65 + energy * 0.24));
    sprite.rotation = t * 0.045;
    if (!this.distortionFilter?.scale) return;
    const strength = this.quality.coarse
      ? 0
      : clamp(0.35 + this.arrangement * 3.6 + this.worldSurge * 8.5 + this.zonePulse * 7 + beatPulse * 3.8 + (snapshot.combo || 0) * 0.24, 0, 16);
    this.distortionFilter.scale.x = Math.sin(t * 0.7) * strength;
    this.distortionFilter.scale.y = Math.cos(t * 0.61) * strength * 0.72;
  }

  drawStagePlate(layout, stage, t, energy, beatPulse, cx, cy) {
    const sprite = this.bgPlate;
    const texture = this.bgPlateTexture;
    if (!sprite || !texture || !sprite.visible) return;
    const tw = texture.width || sprite.texture?.width || 1;
    const th = texture.height || sprite.texture?.height || 1;
    const scale = Math.max(layout.w / tw, layout.h / th) * (1.018 + this.arrangement * 0.01 + energy * 0.025 + beatPulse * 0.012);
    const driftX = Math.sin(t * 0.055 + this.stagePulse) * layout.w * 0.018;
    const driftY = Math.cos(t * 0.047 + this.worldSurge) * layout.h * 0.014;
    const tint = stage.kind === "ember"
      ? 0xffb06a
      : stage.kind === "signal"
        ? 0xff9bed
        : stage.kind === "aurora"
          ? 0xa8c6ff
          : stage.kind === "core"
            ? 0xeaf7ff
            : 0xffffff;
    const baseAlpha = stage.kind === "tide" ? 0.58 : stage.kind === "core" ? 0.4 : 0.34;
    sprite.tint = tint;
    sprite.alpha = clamp(baseAlpha * (0.48 + this.arrangement * 0.62) + energy * 0.1 + this.worldSurge * 0.09 + beatPulse * 0.045, 0.18, 0.84);
    sprite.scale.set(scale);
    sprite.position.set(layout.w / 2 + driftX, layout.h / 2 + driftY);
    sprite.rotation = Math.sin(t * 0.026) * 0.012;
  }

  drawStageMotifs(layout, stage, t, energy, snapshot, cx, cy) {
    const g = this.bg;
    const colors = stage.colors || [stage.accent, 0xffffff];
    const kind = stage.kind || "tide";
    const pulse = this.stagePulse + this.worldSurge + this.zonePulse * 0.65;
    const lite = this.quality.coarse;

    if (kind === "ember") {
      for (let i = 0; i < (lite ? 5 : 9); i += 1) {
        const y = layout.h * (0.18 + i * 0.085);
        const drift = (t * (18 + i * 2.5) + i * 31) % (layout.w + 220);
        g.moveTo(drift - 190, y + Math.sin(t * 0.8 + i) * 24);
        g.lineTo(drift - 40, y - 20 + Math.cos(t * 0.4 + i) * 12);
        g.stroke({ color: colors[i % colors.length], alpha: 0.08 + energy * 0.11, width: 1 + energy * 3 });
      }
      g.circle(cx, layout.boardY + layout.boardH + layout.cell * 1.5, layout.boardW * (1.1 + energy * 0.7))
        .fill({ color: stage.accent, alpha: 0.04 + energy * 0.08 });
    } else if (kind === "signal") {
      for (let i = 0; i < (lite ? 5 : 10); i += 1) {
        const phase = (t * 0.12 + i * 0.1) % 1;
        g.circle(cx, cy, layout.boardW * (0.72 + phase * (3.8 + i * 0.1)))
          .stroke({ color: i % 2 ? colors[0] : colors[1], alpha: (1 - phase) * (0.035 + energy * 0.065), width: 1 + energy * 2.5 });
      }
      const dotCount = lite ? 22 : 42;
      for (let i = 0; i < dotCount; i += 1) {
        const a = i / dotCount * Math.PI * 2 + t * 0.08;
        const r = layout.boardW * (1.5 + Math.sin(i * 2.7) * 0.36);
        g.circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.72, 1.2 + energy * 2.8)
          .fill({ color: colors[i % colors.length], alpha: 0.08 + energy * 0.16 });
      }
    } else if (kind === "aurora") {
      for (let i = 0; i < (lite ? 4 : 8); i += 1) {
        const baseX = layout.w * (-0.1 + i * 0.18 + Math.sin(t * 0.12 + i) * 0.03);
        g.moveTo(baseX, -40);
        for (let y = -40; y <= layout.h + 60; y += Math.max(lite ? 46 : 26, layout.h / (lite ? 14 : 24))) {
          const x = baseX + y * 0.18 + Math.sin(y * 0.014 + t * (0.9 + i * 0.04)) * (28 + energy * 42);
          g.lineTo(x, y);
        }
        g.stroke({ color: colors[i % colors.length], alpha: 0.035 + energy * 0.09, width: 6 + energy * 10 });
      }
    } else if (kind === "core") {
      const beamW = layout.boardW * (0.18 + energy * 0.16 + pulse * 0.24);
      g.roundRect(cx - beamW / 2, -layout.cell, beamW, layout.h + layout.cell * 2, beamW / 2)
        .fill({ color: 0xffffff, alpha: 0.025 + energy * 0.085 + pulse * 0.08 });
      const ringCount = lite ? 4 : 7;
      for (let i = 0; i < ringCount; i += 1) {
        const phase = (t * 0.18 + i / ringCount) % 1;
        g.circle(cx, cy, layout.boardW * (0.64 + phase * 2.5))
          .stroke({ color: i % 2 ? stage.accent : 0xffffff, alpha: (1 - phase) * (0.04 + energy * 0.11), width: 1.4 + energy * 3.5 });
      }
    } else {
      const waveCount = lite ? (layout.portrait ? 4 : 6) : (layout.portrait ? 8 : 12);
      for (let i = 0; i < waveCount; i += 1) {
        const y = layout.h * (0.12 + i / (waveCount + 0.5) * 0.78);
        const amp = 14 + energy * 42 + i * 1.4;
        const step = Math.max(lite ? 34 : 16, layout.w / (lite ? 18 : 32));
        g.moveTo(-30, y);
        for (let x = -30; x <= layout.w + 36; x += step) {
          const yy = y + Math.sin(x * 0.015 + t * (0.96 + i * 0.055) + i) * amp;
          g.lineTo(x, yy);
        }
        g.stroke({ color: colors[i % colors.length] || stage.accent, alpha: 0.035 + energy * 0.085, width: 1.2 + energy * 2.6 });
      }
    }
  }

  drawParticleSwarm(layout, stage, t, energy, snapshot) {
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH / 2;
    const colors = stage.colors || [stage.accent, 0xffffff];
    const stageWarm = stage.kind === "ember" || stage.kind === "core";
    const arrangement = this.arrangement;
    const baseAlpha = (layout.portrait ? 0.22 : 0.26) + arrangement * (layout.portrait ? 0.2 : 0.26);
    const zoneBoost = snapshot.zoneActive ? 0.5 : 0;
    const comboBoost = Math.min(0.32, snapshot.combo * 0.048);
    const flowBoost = 0.72 + arrangement * 0.52 + this.zonePulse * 0.9 + this.stagePulse * 0.8 + this.worldSurge * 0.65;
    this.swarmTick = (this.swarmTick + 1) % 120;
    if (this.quality.coarse && this.swarmTick % 2 === 1) return;

    for (const entry of this.swarmSprites) {
      const p = entry.particle;
      const travel = (p.lane + t * 0.022 * p.speed * flowBoost + this.stagePulse * 0.04 + this.worldSurge * 0.05) % 1;
      const ribbon = p.band < 0.64;
      let x;
      let y;
      let rotation = 0;
      if (ribbon) {
        if (stage.kind === "ember") {
          const angle = -Math.PI * 0.15 + travel * Math.PI * 1.22 + p.phase * 0.08;
          const rx = layout.boardW * (1.0 + p.orbit * 2.25);
          const ry = layout.boardH * (0.44 + p.orbit * 0.34);
          x = cx + Math.cos(angle) * rx * p.side + Math.sin(t * 1.2 + p.phase) * 26;
          y = layout.boardY + layout.boardH * (0.88 - p.orbit * 0.3) - Math.abs(Math.sin(angle)) * ry + Math.cos(t * 0.7 + p.phase) * 20;
          rotation = -Math.PI * 0.5 + angle * 0.2;
        } else if (stage.kind === "signal" || stage.kind === "core") {
          const angle = travel * Math.PI * 2 + p.phase;
          const rx = layout.boardW * (0.95 + p.orbit * 2.25);
          const ry = layout.boardH * (0.3 + p.orbit * 0.48);
          x = cx + Math.cos(angle) * rx + Math.sin(t * 0.8 + p.phase) * 18;
          y = cy + Math.sin(angle * 0.78) * ry + Math.cos(t * 0.7 + p.phase) * 16;
          rotation = angle + Math.PI * 0.5;
        } else {
          const angle = -Math.PI * 1.08 + travel * Math.PI * 1.78;
          const rx = layout.boardW * (0.98 + p.orbit * 2.05);
          const ry = layout.boardH * (0.22 + p.orbit * 0.58);
          const crest = stage.kind === "aurora" ? Math.sin(travel * Math.PI * 2 + p.phase) * layout.boardH * 0.18 : 0;
          x = cx + Math.cos(angle) * rx + Math.sin(t * 0.72 + p.phase) * 22;
          y = layout.boardY + layout.boardH * (0.08 + p.orbit * 0.16) + Math.sin(angle) * ry + crest + Math.cos(t * 0.8 + p.phase) * 15;
          rotation = angle + Math.PI * 0.5;
        }
      } else if (p.band < 0.86) {
        const angle = travel * Math.PI * 2 + p.phase;
        const sideBias = stage.kind === "aurora" ? Math.sin(t * 0.13 + p.phase) : p.side;
        const rx = layout.boardW * (1.16 + p.orbit * 2.55);
        const ry = layout.boardH * (0.5 + p.orbit * 0.45);
        x = cx + sideBias * rx + Math.cos(angle) * layout.boardW * (0.22 + p.depth * 0.34);
        y = cy + Math.sin(angle * 0.72) * ry + Math.cos(t * 0.5 + p.phase) * 24;
        rotation = angle;
      } else {
        const drift = (travel + p.phase * 0.03) % 1;
        const angle = p.phase + t * 0.06 * p.side;
        x = ((p.seed * 37.1 + drift * layout.w * (1.15 + p.depth * 0.45)) % (layout.w + 180)) - 90;
        y = layout.h * ((p.seed * 0.013) % 1) + Math.sin(angle) * (22 + p.depth * 34);
        rotation = angle;
      }
      const nearBoard = x > layout.boardX - layout.boardW * 0.2
        && x < layout.boardX + layout.boardW * 1.2
        && y > layout.boardY - layout.cell * 1.2
        && y < layout.boardY + layout.boardH + layout.cell * 1.2;
      const insideBoard = x > layout.boardX - layout.cell * 0.25
        && x < layout.boardX + layout.boardW + layout.cell * 0.25
        && y > layout.boardY - layout.cell * 0.25
        && y < layout.boardY + layout.boardH + layout.cell * 0.25;
      if (insideBoard || (nearBoard && p.band > 0.7) || x < -64 || x > layout.w + 64 || y < -64 || y > layout.h + 64) {
        this.hideParticleNode(entry.sprite);
        if (entry.glow) this.hideParticleNode(entry.glow);
        continue;
      }

      const twinkle = 0.48 + Math.sin(t * (3.6 + p.speed * 1.8) + p.phase) * 0.36;
      const color = p.colorBias > 0.72
        ? 0xffffff
        : (p.colorBias > 0.42 ? colors[0] : (stageWarm ? 0xffd36e : (colors[1] || stage.accent)));
      const stageAlpha = stage.kind === "core" ? 0.12 : 0;
      const alpha = clamp(baseAlpha * twinkle + energy * 0.32 + arrangement * 0.12 + zoneBoost + comboBoost + stageAlpha, 0.055, 0.98);
      const size = p.size * (0.96 + arrangement * 0.5 + energy * 2.75 + this.worldSurge * 1.7 + (snapshot.zoneActive ? 2.1 : 0));
      const spriteScale = Math.max(0.048, size / 14);
      const lensScale = p.band < 0.24 ? 2.05 : 1;
      this.showParticleNode(entry.sprite, x, y, color, alpha, spriteScale * (ribbon ? 1.86 : 1.18) * lensScale, rotation);
      if (entry.glow) {
        this.showParticleNode(
          entry.glow,
          x,
          y,
          color,
          alpha * (snapshot.zoneActive ? 0.54 : 0.34),
          spriteScale * (snapshot.zoneActive ? 7.8 : 5.6),
          rotation,
        );
      }
    }
  }

  updateMeteors(layout, stage, dt, energy) {
    const g = this.bg;
    const spawnChance = ((this.quality.coarse ? 0.012 : 0.024) + energy * 0.018) * (0.55 + this.arrangement * 0.75);
    if (Math.random() < spawnChance && this.meteors.length < (this.quality.coarse ? 8 : 18)) {
      const fromLeft = Math.random() > 0.5;
      this.meteors.push({
        x: fromLeft ? -40 : layout.w + 40,
        y: Math.random() * layout.h * 0.78,
        vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 7),
        vy: 2.2 + Math.random() * 3.6,
        life: 70 + Math.random() * 60,
        maxLife: 110,
        color: Math.random() > 0.5 ? stage.accent : (stage.colors[Math.floor(Math.random() * stage.colors.length)] || 0xffffff),
      });
    }
    const decay = dt / 16.67;
    this.meteors = this.meteors.filter((m) => {
      m.life -= decay;
      m.x += m.vx * decay;
      m.y += m.vy * decay;
      if (m.life <= 0 || m.y > layout.h + 80 || m.x < -120 || m.x > layout.w + 120) return false;
      const alpha = clamp(m.life / m.maxLife, 0, 1);
      g.moveTo(m.x, m.y);
      g.lineTo(m.x - m.vx * 7, m.y - m.vy * 7);
      g.stroke({ color: m.color, alpha: 0.16 + alpha * 0.5, width: 1.5 + energy * 2.5 });
      g.circle(m.x, m.y, 1.6 + energy * 2).fill({ color: 0xffffff, alpha: 0.32 + alpha * 0.44 });
      return true;
    });
  }

  drawBoard(layout, snapshot) {
    const g = this.board;
    const stage = snapshot.stage || STAGES[0];
    const shakeX = (Math.random() - 0.5) * this.shake;
    const shakeY = (Math.random() - 0.5) * this.shake;
    const bx = layout.boardX + shakeX;
    const by = layout.boardY + shakeY;
    const cell = layout.cell;
    g.clear();

    const boardEnergy = clamp(this.arrangement * 0.24 + this.inputHeat * 0.22 + this.zonePulse + this.comboPulse * 0.55 + (snapshot.combo >= 2 ? 0.18 : 0), 0, 1);
    g.roundRect(bx - 28, by - 28, layout.boardW + 56, layout.boardH + 56, 8)
      .fill({ color: 0x000000, alpha: 0.18 + boardEnergy * 0.18 });
    g.roundRect(bx - 18, by - 18, layout.boardW + 36, layout.boardH + 36, 6)
      .stroke({ color: stage.accent, alpha: 0.05 + boardEnergy * 0.22, width: 7 + boardEnergy * 12 });
    g.roundRect(bx - 7, by - 7, layout.boardW + 14, layout.boardH + 14, 4)
      .fill({ color: 0x00030a, alpha: 0.42 })
      .stroke({ color: stage.accent, alpha: 0.34 + boardEnergy * 0.52, width: 1.2 + boardEnergy * 2.4 });
    g.rect(bx, by, layout.boardW, layout.boardH)
      .fill({ color: 0x01040a, alpha: 0.82 });
    g.rect(bx + 1, by + 1, layout.boardW - 2, layout.boardH - 2)
      .stroke({ color: 0xffffff, alpha: 0.08 + boardEnergy * 0.12, width: 1 });

    const scanY = by + ((performance.now() * 0.035) % layout.boardH);
    g.rect(bx + 1, scanY, layout.boardW - 2, 1.4 + boardEnergy * 3)
      .fill({ color: stage.accent, alpha: 0.035 + boardEnergy * 0.1 });

    for (let x = 1; x < COLS; x += 1) {
      const px = bx + x * cell;
      g.moveTo(px, by);
      g.lineTo(px, by + layout.boardH);
      g.stroke({ color: 0xffffff, alpha: 0.035, width: 1 });
    }
    for (let y = 1; y < ROWS; y += 1) {
      const py = by + y * cell;
      g.moveTo(bx, py);
      g.lineTo(bx + layout.boardW, py);
      g.stroke({ color: 0xffffff, alpha: 0.03, width: 1 });
    }

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const px = bx + x * cell;
        const py = by + y * cell;
        const cellData = snapshot.grid[y][x];
        if (cellData) this.drawBlock(g, px, py, cell, cellData.color, 0.95, false);
      }
    }

    if (snapshot.zoneLines > 0 || snapshot.zoneActive) {
      const stored = Math.min(ROWS, snapshot.zoneLines);
      for (let i = 0; i < stored; i += 1) {
        const yy = by + layout.boardH - (i + 1) * Math.max(4, cell * 0.28);
        g.rect(bx + 3, yy, layout.boardW - 6, Math.max(3, cell * 0.16))
          .fill({ color: i % 2 ? stage.accent : 0xffffff, alpha: 0.18 + this.zonePulse * 0.28 });
      }
    }

    this.drawPiece(g, snapshot.ghost, bx, by, cell, 0.18, true);
    this.drawPieceAura(g, snapshot.active, bx, by, cell, stage, snapshot.zoneActive);
    this.drawPiece(g, snapshot.active, bx, by, cell, snapshot.zoneActive ? 1 : 0.98, false);

    if (snapshot.zoneActive) {
      const progressH = layout.boardH * snapshot.zoneProgress;
      g.rect(bx - 15, by + layout.boardH - progressH, 5, progressH)
        .fill({ color: 0xffffff, alpha: 0.46 });
      if (snapshot.zoneLines > 0) {
        const labelY = by + layout.boardH + 20;
        this.drawLabelPill(g, bx + layout.boardW / 2 - 58, labelY, 116, 27, `${snapshot.zoneLines} LUMEN`, 0xffffff);
      }
    }

    this.drawMiniPanel(g, layout.hold, "HOLD", snapshot.holdType ? [snapshot.holdType] : [], stage);
    this.drawMiniPanel(g, layout.next, "NEXT", snapshot.queue, stage);

    this.shake = Math.max(0, this.shake - 0.8);
  }

  drawPiece(g, piece, bx, by, cell, alpha, ghost) {
    if (!piece) return;
    for (let y = 0; y < piece.matrix.length; y += 1) {
      for (let x = 0; x < piece.matrix[y].length; x += 1) {
        if (!piece.matrix[y][x]) continue;
        const gy = piece.y + y;
        if (gy < 0) continue;
        const px = bx + (piece.x + x) * cell;
        const py = by + gy * cell;
        if (ghost) {
          const inset = cell * 0.2;
          g.rect(px + inset, py + inset, cell - inset * 2, cell - inset * 2)
            .stroke({ color: piece.color, alpha: alpha * 0.9, width: 1.5 });
          g.circle(px + cell / 2, py + cell / 2, Math.max(1.2, cell * 0.055))
            .fill({ color: piece.color, alpha: alpha * 0.7 });
        } else {
          this.drawBlock(g, px, py, cell, piece.color, alpha, true);
        }
      }
    }
  }

  drawPieceAura(g, piece, bx, by, cell, stage, zoneActive) {
    if (!piece) return;
    const t = performance.now() * 0.006;
    const pulse = 0.5 + Math.sin(t) * 0.5;
    const color = piece.color || stage?.accent || 0xffffff;
    for (let y = 0; y < piece.matrix.length; y += 1) {
      for (let x = 0; x < piece.matrix[y].length; x += 1) {
        if (!piece.matrix[y][x]) continue;
        const gy = piece.y + y;
        if (gy < 0) continue;
        const px = bx + (piece.x + x) * cell;
        const py = by + gy * cell;
        const inset = cell * (zoneActive ? 0.02 : 0.08);
        const spill = cell * (zoneActive ? 0.36 : 0.22);
        g.roundRect(px + inset - spill, py + inset - spill, cell - inset * 2 + spill * 2, cell - inset * 2 + spill * 2, Math.max(2, cell * 0.14))
          .fill({ color, alpha: (zoneActive ? 0.16 : 0.08) + pulse * (zoneActive ? 0.08 : 0.04) });
        g.roundRect(px + inset - spill * 0.45, py + inset - spill * 0.45, cell - inset * 2 + spill * 0.9, cell - inset * 2 + spill * 0.9, Math.max(2, cell * 0.1))
          .stroke({ color: 0xffffff, alpha: 0.16 + pulse * 0.16, width: Math.max(1, cell * 0.035) });
      }
    }
  }

  drawBlock(g, x, y, size, color, alpha, hot) {
    const gap = Math.max(1.2, size * 0.075);
    const radius = Math.max(1.5, size * 0.06);
    const outer = size - gap * 2;
    const innerGap = gap * 1.62;
    const inner = size - innerGap * 2;
    const glow = hot ? 0.72 : 0.38;
    if (hot) {
      g.roundRect(x + gap - size * 0.18, y + gap - size * 0.18, outer + size * 0.36, outer + size * 0.36, radius + 4)
        .fill({ color, alpha: alpha * 0.18 });
      g.roundRect(x + gap - size * 0.28, y + gap - size * 0.28, outer + size * 0.56, outer + size * 0.56, radius + 5)
        .stroke({ color, alpha: alpha * 0.22, width: Math.max(2.4, size * 0.12) });
    }
    g.roundRect(x + gap, y + gap, outer, outer, radius)
      .fill({ color, alpha: alpha * (hot ? 0.32 : 0.26) })
      .stroke({ color, alpha: alpha * (hot ? 0.98 : 0.82), width: Math.max(1.15, size * 0.07) });
    g.roundRect(x + innerGap, y + innerGap, inner, inner, radius)
      .fill({ color: 0x01040a, alpha: alpha * (hot ? 0.5 : 0.62) })
      .stroke({ color: 0xffffff, alpha: alpha * glow, width: Math.max(0.85, size * 0.045) });
    g.roundRect(x + innerGap + inner * 0.08, y + innerGap + inner * 0.08, inner * 0.84, inner * 0.84, Math.max(1.2, radius * 0.7))
      .fill({ color, alpha: alpha * (hot ? 0.16 : 0.1) });
    g.circle(x + size * 0.5, y + size * 0.5, Math.max(1.8, size * 0.12))
      .fill({ color: 0xffffff, alpha: alpha * (hot ? 0.18 : 0.1) });
    g.rect(x + innerGap, y + innerGap, inner, Math.max(2, size * 0.14))
      .fill({ color: 0xffffff, alpha: alpha * (hot ? 0.46 : 0.3) });
    g.rect(x + innerGap, y + innerGap, Math.max(2, size * 0.12), inner)
      .fill({ color: 0xffffff, alpha: alpha * 0.18 });
    if (size >= 13) {
      g.moveTo(x + innerGap * 1.06, y + size - innerGap * 1.08);
      g.lineTo(x + size - innerGap * 1.08, y + innerGap * 1.06);
      g.stroke({ color: 0xffffff, alpha: alpha * 0.18, width: Math.max(0.8, size * 0.035) });
      g.moveTo(x + size - innerGap * 0.94, y + size - innerGap * 1.08);
      g.lineTo(x + size * 0.54, y + size * 0.54);
      g.stroke({ color, alpha: alpha * 0.34, width: Math.max(0.8, size * 0.035) });
      g.circle(x + size * 0.73, y + size * 0.28, Math.max(1.1, size * 0.06))
        .fill({ color: 0xffffff, alpha: alpha * (hot ? 0.42 : 0.28) });
      g.moveTo(x + innerGap * 1.18, y + innerGap * 1.28);
      g.lineTo(x + size - innerGap * 1.2, y + innerGap * 1.28);
      g.stroke({ color: 0xffffff, alpha: alpha * (hot ? 0.18 : 0.11), width: Math.max(0.65, size * 0.026) });
      g.moveTo(x + innerGap * 1.18, y + size - innerGap * 1.28);
      g.lineTo(x + size - innerGap * 1.2, y + size - innerGap * 1.28);
      g.stroke({ color, alpha: alpha * 0.22, width: Math.max(0.65, size * 0.026) });
    }
  }

  drawMiniPanel(g, panel, label, types, stage) {
    if (!panel || panel.y < 0) return;
    g.rect(panel.x, panel.y, panel.w, panel.h)
      .fill({ color: 0x000000, alpha: 0.16 });
    g.moveTo(panel.x + 6, panel.y + 8);
    g.lineTo(panel.x + Math.min(panel.w - 6, 26), panel.y + 8);
    g.stroke({ color: 0xffffff, alpha: 0.34, width: 1 });
    g.moveTo(panel.x + 6, panel.y + 12);
    g.lineTo(panel.x + Math.min(panel.w - 18, 18), panel.y + 12);
    g.stroke({ color: stage.accent, alpha: 0.2, width: 1 });
    const max = panel.h > 80 ? Math.min(3, types.length) : Math.min(1, types.length);
    for (let i = 0; i < max; i += 1) {
      const type = types[i];
      if (!type) continue;
      const matrix = PIECES[type].matrix;
      const color = PIECES[type].color;
      const scale = Math.min((panel.w - 20) / matrix[0].length, (panel.h / max - 22) / matrix.length, 18);
      const offsetY = panel.y + 24 + i * ((panel.h - 26) / Math.max(1, max));
      const offsetX = panel.x + (panel.w - matrix[0].length * scale) / 2;
      for (let y = 0; y < matrix.length; y += 1) {
        for (let x = 0; x < matrix[y].length; x += 1) {
          if (!matrix[y][x]) continue;
          this.drawBlock(g, offsetX + x * scale, offsetY + y * scale, scale, color, 0.9, false);
        }
      }
    }
  }

  drawTinyText(g, text, x, y, color, alpha) {
    const width = text.length * 4.5;
    g.rect(x, y, width, 1.5).fill({ color, alpha });
    g.rect(x, y + 5, width * 0.64, 1.5).fill({ color, alpha: alpha * 0.55 });
  }

  drawLabelPill(g, x, y, w, h, text, color) {
    g.roundRect(x, y, w, h, 8).fill({ color: 0x02050d, alpha: 0.78 }).stroke({ color, alpha: 0.48, width: 1 });
    const marks = Math.min(9, text.length);
    for (let i = 0; i < marks; i += 1) {
      g.rect(x + 16 + i * 9, y + h / 2 - 2, 5, 4).fill({ color, alpha: 0.8 });
    }
  }

  pieceLock(cells, stage, intense = false) {
    if (!this.app || !Array.isArray(cells) || cells.length === 0) return;
    const layout = this.layout();
    const color = stage?.accent || cells[0]?.color || 0xffffff;
    const cx = cells.reduce((sum, cell) => sum + (layout.boardX + cell.col * layout.cell + layout.cell / 2), 0) / cells.length;
    const cy = cells.reduce((sum, cell) => sum + (layout.boardY + cell.row * layout.cell + layout.cell / 2), 0) / cells.length;
    cells.forEach((cell) => {
      const x = layout.boardX + cell.col * layout.cell + layout.cell / 2;
      const y = layout.boardY + cell.row * layout.cell + layout.cell / 2;
      const cellColor = cell.color || color;
      this.lockFlashes.push({
        x,
        y,
        color: cellColor,
        size: layout.cell * (intense ? 1.08 : 0.86),
        life: intense ? 24 : 14,
        maxLife: intense ? 24 : 14,
      });
      const sparkleCount = intense ? 4 : 1;
      for (let i = 0; i < sparkleCount; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const speed = intense ? 1.6 + Math.random() * 3.8 : 0.55 + Math.random() * 1.45;
        this.spawnParticle(
          x + (Math.random() - 0.5) * layout.cell * 0.36,
          y + (Math.random() - 0.5) * layout.cell * 0.36,
          Math.random() > 0.35 ? cellColor : 0xffffff,
          intense ? 1.9 + Math.random() * 4.2 : 1.0 + Math.random() * 2.1,
          Math.cos(a) * speed,
          Math.sin(a) * speed,
          intense ? 24 + Math.random() * 20 : 14 + Math.random() * 11,
          intense ? 0.74 : 0.42,
        );
      }
    });
    if (intense) {
      this.screenBursts.push({
        x: cx,
        y: cy,
        radius: layout.boardW * 0.7,
        color: 0xffffff,
        alpha: 0.24,
        width: 2.4,
        life: 24,
        maxLife: 24,
      });
    }
  }

  drawParticles(layout, dt) {
    const g = this.fx;
    const glow = this.glow;
    g.clear();
    glow?.clear();
    const decay = dt / 16.67;
    this.lightFields = this.lightFields.filter((field) => {
      field.life -= decay;
      if (field.life <= 0) return false;
      const alpha = clamp(field.life / field.maxLife, 0, 1);
      const p = 1 - alpha;
      const radius = field.radius * (1 + p * (field.growth ?? 0.55));
      const x = field.x + Math.sin(p * Math.PI) * (field.swayX || 0);
      const y = field.y + Math.sin(p * Math.PI) * (field.swayY || 0);
      const color = field.color || 0xffffff;
      glow?.circle(x, y, radius)
        .fill({ color, alpha: alpha * field.alpha * 0.18 });
      glow?.circle(x, y, radius * 0.44)
        .fill({ color: 0xffffff, alpha: alpha * field.alpha * 0.08 });
      return true;
    });
    this.screenBursts = this.screenBursts.filter((burst) => {
      burst.life -= decay;
      if (burst.life <= 0) return false;
      const alpha = clamp(burst.life / burst.maxLife, 0, 1);
      const growth = 1 - alpha;
      const cx = burst.x ?? (layout.boardX + layout.boardW / 2);
      const cy = burst.y ?? (layout.boardY + layout.boardH / 2);
      const radius = burst.radius * (0.38 + growth * 1.85);
      glow?.circle(cx, cy, radius * 0.92)
        .fill({ color: burst.color, alpha: alpha * burst.alpha * 0.055 });
      g.circle(cx, cy, radius)
        .stroke({ color: burst.color, alpha: alpha * burst.alpha, width: burst.width * (0.8 + growth * 2.4) });
      g.circle(cx, cy, radius * 0.62)
        .fill({ color: burst.color, alpha: alpha * burst.alpha * 0.08 });
      return true;
    });
    this.clearRays = this.clearRays.filter((ray) => {
      ray.life -= decay;
      if (ray.life <= 0) return false;
      const alpha = clamp(ray.life / ray.maxLife, 0, 1);
      const p = 1 - alpha;
      const sway = Math.sin(p * Math.PI * 2 + ray.phase) * ray.sway;
      const angle = ray.angle + ray.spin * p;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const length = ray.length * (0.42 + p * 0.92);
      const width = ray.width * (0.3 + alpha * 1.35);
      const cx = ray.x + dx * ray.speed * p + Math.cos(angle + Math.PI / 2) * sway;
      const cy = ray.y + dy * ray.speed * p + Math.sin(angle + Math.PI / 2) * sway;
      const x1 = cx - dx * length * 0.5;
      const y1 = cy - dy * length * 0.5;
      const x2 = cx + dx * length * 0.5;
      const y2 = cy + dy * length * 0.5;
      glow?.moveTo(x1, y1);
      glow?.lineTo(x2, y2);
      glow?.stroke({ color: ray.color, alpha: alpha * ray.alpha * 0.12, width: width * 5.4 });
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke({ color: ray.color, alpha: alpha * ray.alpha * 0.58, width });
      g.moveTo(cx - dx * length * 0.16, cy - dy * length * 0.16);
      g.lineTo(cx + dx * length * 0.16, cy + dy * length * 0.16);
      g.stroke({ color: 0xffffff, alpha: alpha * ray.alpha * 0.72, width: Math.max(0.8, width * 0.22) });
      return true;
    });
    this.shockBands = this.shockBands.filter((band) => {
      band.life -= decay;
      if (band.life <= 0) return false;
      const alpha = clamp(band.life / band.maxLife, 0, 1);
      const p = 1 - alpha;
      if (band.orientation === "vertical") {
        const x = band.x + Math.sin(p * Math.PI) * band.sway;
        const w = band.width * (0.4 + p * 2.2);
        glow?.roundRect(x - w, -layout.cell, w * 2, layout.h + layout.cell * 2, w)
          .fill({ color: band.color, alpha: alpha * band.alpha * 0.06 });
        g.roundRect(x - w / 2, -layout.cell, w, layout.h + layout.cell * 2, w / 2)
          .fill({ color: band.color, alpha: alpha * band.alpha * 0.22 });
      } else {
        const y = band.y + Math.sin(p * Math.PI) * band.sway;
        const h = band.height * (0.4 + p * 2.4);
        glow?.roundRect(-layout.cell, y - h, layout.w + layout.cell * 2, h * 2, h)
          .fill({ color: band.color, alpha: alpha * band.alpha * 0.075 });
        g.roundRect(-layout.cell, y - h / 2, layout.w + layout.cell * 2, h, h / 2)
          .fill({ color: band.color, alpha: alpha * band.alpha * 0.26 });
      }
      return true;
    });
    this.lockFlashes = this.lockFlashes.filter((flash) => {
      flash.life -= decay;
      if (flash.life <= 0) return false;
      const alpha = clamp(flash.life / flash.maxLife, 0, 1);
      const p = 1 - alpha;
      const size = flash.size * (1 + p * 0.9);
      const half = size / 2;
      g.roundRect(flash.x - half - 4, flash.y - half - 4, size + 8, size + 8, Math.max(2, size * 0.08))
        .fill({ color: flash.color, alpha: alpha * 0.16 });
      g.roundRect(flash.x - half, flash.y - half, size, size, Math.max(2, size * 0.06))
        .stroke({ color: flash.color, alpha: alpha * 0.7, width: 1.4 + p * 2.2 });
      g.circle(flash.x, flash.y, Math.max(1.8, size * 0.08))
        .fill({ color: 0xffffff, alpha: alpha * 0.46 });
      return true;
    });
    this.resonancePips = this.resonancePips.filter((pip) => {
      pip.life -= decay;
      if (pip.life <= 0) return false;
      const alpha = clamp(pip.life / pip.maxLife, 0, 1);
      const p = 1 - alpha;
      const radius = pip.radius * (0.4 + p * 1.6);
      const x = pip.x + pip.vx * p;
      const y = pip.y + pip.vy * p;
      glow?.circle(x, y, radius * 1.9)
        .fill({ color: pip.color, alpha: alpha * pip.alpha * 0.05 });
      g.circle(x, y, radius)
        .stroke({ color: pip.color, alpha: alpha * pip.alpha, width: 1.1 + p * 2.4 });
      g.circle(x, y, Math.max(1.4, radius * 0.1))
        .fill({ color: 0xffffff, alpha: alpha * pip.alpha * 0.56 });
      return true;
    });
    this.dropTrails = this.dropTrails.filter((trail) => {
      trail.life -= decay;
      if (trail.life <= 0) return false;
      const alpha = clamp(trail.life / trail.maxLife, 0, 1);
      const x = trail.x + Math.sin((1 - alpha) * Math.PI) * trail.sway;
      const top = Math.min(trail.y1, trail.y2);
      const height = Math.abs(trail.y2 - trail.y1);
      const width = trail.width * (0.45 + alpha * 1.2);
      glow?.roundRect(x - width * 1.4, top, width * 2.8, height, width * 1.4)
        .fill({ color: trail.color, alpha: alpha * 0.035 });
      g.roundRect(x - width / 2, top, width, height, width / 2)
        .fill({ color: trail.color, alpha: alpha * (trail.alpha ?? 0.12) });
      g.roundRect(x - width * 0.11, top, width * 0.22, height, width * 0.11)
        .fill({ color: 0xffffff, alpha: alpha * (trail.coreAlpha ?? 0.34) });
      g.moveTo(x, top);
      g.lineTo(x, top + height);
      g.stroke({ color: 0xffffff, alpha: alpha * (trail.lineAlpha ?? 0.42), width: Math.max(0.8, width * 0.06) });
      return true;
    });
    this.impactRings = this.impactRings.filter((ring) => {
      ring.life -= decay;
      if (ring.life <= 0) return false;
      const alpha = clamp(ring.life / ring.maxLife, 0, 1);
      const growth = 1 - alpha;
      if (ring.kind === "landing") {
        const w = ring.width * (0.42 + growth * 1.05);
        const h = ring.height * (0.38 + growth * 1.65);
        g.roundRect(ring.x - w / 2, ring.y - h / 2, w, h, h / 2)
          .stroke({ color: ring.color, alpha: alpha * 0.58, width: 2 + growth * 5 });
        g.roundRect(layout.boardX - layout.cell * 0.5, ring.y - h * 0.16, layout.boardW + layout.cell, Math.max(3, h * 0.18), Math.max(2, h * 0.09))
          .fill({ color: 0xffffff, alpha: alpha * 0.18 });
      } else {
        const radius = ring.radius * (0.3 + growth * 1.5);
        g.circle(ring.x, ring.y, radius)
          .stroke({ color: ring.color, alpha: alpha * 0.5, width: 1.5 + growth * 4 });
      }
      return true;
    });
    this.rowSweeps = this.rowSweeps.filter((sweep) => {
      sweep.life -= decay;
      if (sweep.life <= 0) return false;
      const alpha = clamp(sweep.life / sweep.maxLife, 0, 1);
      const p = 1 - alpha;
      const headX = sweep.dir > 0
        ? layout.boardX + layout.boardW * p
        : layout.boardX + layout.boardW * (1 - p);
      const tail = layout.boardW * (0.18 + p * 0.35);
      const x = sweep.dir > 0 ? headX - tail : headX;
      g.roundRect(x, sweep.y - sweep.height / 2, tail, sweep.height, sweep.height / 2)
        .fill({ color: sweep.color, alpha: alpha * 0.28 });
      g.roundRect(headX - sweep.height * 0.16, sweep.y - sweep.height * 0.62, sweep.height * 0.32, sweep.height * 1.24, sweep.height * 0.16)
        .fill({ color: 0xffffff, alpha: alpha * 0.72 });
      return true;
    });
    this.clearCores = this.clearCores.filter((core) => {
      core.life -= decay;
      if (core.life <= 0) return false;
      const alpha = clamp(core.life / core.maxLife, 0, 1);
      const p = 1 - alpha;
      const height = core.height * (0.72 + p * 1.38);
      const glowH = height * (1.9 + p * 1.2);
      glow?.roundRect(layout.boardX - layout.cell * 0.9, core.y - glowH * 0.8, layout.boardW + layout.cell * 1.8, glowH * 1.6, glowH * 0.8)
        .fill({ color: core.color, alpha: alpha * core.alpha * 0.12 });
      g.roundRect(layout.boardX - layout.cell * 0.58, core.y - glowH / 2, layout.boardW + layout.cell * 1.16, glowH, glowH / 2)
        .fill({ color: core.color, alpha: alpha * core.alpha * 0.18 });
      g.roundRect(layout.boardX - layout.cell * 0.22, core.y - height / 2, layout.boardW + layout.cell * 0.44, height, height / 2)
        .fill({ color: 0xffffff, alpha: alpha * core.alpha * 0.72 });
      g.roundRect(layout.boardX + layout.cell * 0.16, core.y - height * 0.18, layout.boardW - layout.cell * 0.32, Math.max(2, height * 0.36), Math.max(1, height * 0.18))
        .fill({ color: core.color, alpha: alpha * core.alpha * 0.52 });
      return true;
    });
    this.clearTiles = this.clearTiles.filter((tile) => {
      tile.life -= decay;
      tile.x += tile.vx * decay;
      tile.y += tile.vy * decay;
      tile.vy += 0.018 * decay;
      tile.rotation += tile.spin * decay;
      if (tile.life <= 0) return false;
      const alpha = clamp(tile.life / tile.maxLife, 0, 1);
      const size = tile.size * (0.44 + alpha * 0.76);
      const half = size / 2;
      const ca = Math.cos(tile.rotation);
      const sa = Math.sin(tile.rotation);
      const pts = [
        [-half, -half],
        [half, -half * 0.82],
        [half * 0.86, half],
        [-half * 0.92, half * 0.78],
      ].map(([dx, dy]) => ({
        x: tile.x + dx * ca - dy * sa,
        y: tile.y + dx * sa + dy * ca,
      }));
      glow?.circle(tile.x, tile.y, size * 1.2).fill({ color: tile.color, alpha: alpha * 0.05 });
      g.roundRect(tile.x - half - 4, tile.y - half - 4, size + 8, size + 8, Math.max(2, size * 0.08))
        .fill({ color: tile.color, alpha: alpha * 0.18 });
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i].x, pts[i].y);
      g.lineTo(pts[0].x, pts[0].y);
      g.fill({ color: tile.color, alpha: alpha * 0.84 });
      g.stroke({ color: 0xffffff, alpha: alpha * 0.52, width: 1 });
      g.moveTo(pts[3].x * 0.62 + pts[0].x * 0.38, pts[3].y * 0.62 + pts[0].y * 0.38);
      g.lineTo(pts[1].x * 0.66 + pts[2].x * 0.34, pts[1].y * 0.66 + pts[2].y * 0.34);
      g.stroke({ color: 0xffffff, alpha: alpha * 0.2, width: 1 });
      return true;
    });
    this.beams = this.beams.filter((beam) => {
      beam.life -= decay;
      if (beam.life <= 0) return false;
      const alpha = clamp(beam.life / beam.maxLife, 0, 1);
      if (beam.kind === "vertical") {
        if (beam.style === "drop") {
          const top = beam.top ?? layout.boardY;
          const bottom = beam.bottom ?? (layout.boardY + layout.boardH);
          const h = Math.max(1, bottom - top);
          const w = beam.width * (0.45 + alpha * 0.7);
          const color = beam.color || 0xffffff;
          const beamAlpha = beam.alpha ?? 1;
          glow?.roundRect(beam.x - w * 2.2, top, w * 4.4, h, w * 2.2)
            .fill({ color, alpha: alpha * 0.045 * beamAlpha });
          g.roundRect(beam.x - w * 1.2, top, w * 2.4, h, w)
            .fill({ color, alpha: alpha * 0.08 * beamAlpha });
          g.roundRect(beam.x - w * 0.22, top, w * 0.44, h, w * 0.22)
            .fill({ color: 0xffffff, alpha: alpha * 0.24 * beamAlpha });
          g.moveTo(beam.x - w * 0.58, top);
          g.lineTo(beam.x - w * 0.18, bottom);
          g.moveTo(beam.x + w * 0.42, top);
          g.lineTo(beam.x + w * 0.12, bottom);
          g.stroke({ color: 0xffffff, alpha: alpha * 0.24 * beamAlpha, width: Math.max(0.8, w * 0.08) });
        } else {
          const w = beam.width * (0.7 + alpha * 0.9);
          glow?.roundRect(beam.x - w, layout.boardY - layout.cell, w * 2, layout.boardH + layout.cell * 2, w)
            .fill({ color: 0xffffff, alpha: alpha * 0.1 });
          g.roundRect(beam.x - w / 2, layout.boardY - layout.cell, w, layout.boardH + layout.cell * 2, w / 2)
            .fill({ color: 0xffffff, alpha: 0.16 + alpha * 0.62 });
          g.roundRect(beam.x - w * 0.18, layout.boardY - layout.cell, w * 0.36, layout.boardH + layout.cell * 2, w * 0.18)
            .fill({ color: 0xffffff, alpha: 0.32 + alpha * 0.78 });
        }
      } else {
        g.roundRect(layout.boardX - layout.cell, beam.y - beam.height / 2, layout.boardW + layout.cell * 2, beam.height, beam.height / 2)
          .fill({ color: beam.color, alpha: 0.14 + alpha * 0.48 });
      }
      return true;
    });
    this.clearWaves = this.clearWaves.filter((wave) => {
      wave.life -= decay;
      wave.x += wave.speed * decay;
      if (wave.life <= 0) return false;
      const alpha = clamp(wave.life / wave.maxLife, 0, 1);
      const width = wave.width * (1.1 - alpha * 0.25);
      g.roundRect(wave.x - width * 0.5, wave.y - wave.height * 0.5, width, wave.height, wave.height * 0.5)
        .fill({ color: wave.color, alpha: 0.1 + alpha * 0.38 });
      g.roundRect(wave.x - width * 0.44, wave.y - wave.height * 0.18, width * 0.88, wave.height * 0.36, wave.height * 0.18)
        .fill({ color: 0xffffff, alpha: 0.12 + alpha * 0.34 });
      g.moveTo(wave.x - width * 0.5, wave.y);
      g.lineTo(wave.x + width * 0.5, wave.y);
      g.stroke({ color: 0xffffff, alpha: 0.22 + alpha * 0.62, width: 1.8 + wave.power });
      return true;
    });
    this.particles = this.particles.filter((p) => {
      p.life -= decay;
      p.x += p.vx * decay;
      p.y += p.vy * decay;
      p.vy += p.gravity * decay;
      if (p.life <= 0) {
        this.hideParticleNode(p.sprite);
        return false;
      }
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      if (p.sprite) {
        p.rotation += p.spin * decay;
        const textureScale = p.textureKind === "comet" ? 1.55 : p.textureKind === "nova" ? 1.3 : p.textureKind === "lens" ? 1.8 : 1;
        this.showParticleNode(p.sprite, p.x, p.y, p.color, alpha * p.alpha, Math.max(0.04, p.size * (0.5 + alpha) / 18) * textureScale, p.rotation);
      } else {
        g.circle(p.x, p.y, p.size * (0.5 + alpha)).fill({ color: p.color, alpha: alpha * p.alpha });
      }
      return true;
    });
  }

  drawFlash(layout, dt) {
    this.flashLayer.clear();
    if (this.chromaticPulse > 0) {
      const pulse = this.chromaticPulse;
      const drift = Math.max(1, layout.cell * 0.1) * pulse;
      const alpha = pulse * 0.16;
      this.flashLayer.roundRect(layout.boardX - 10 - drift, layout.boardY - 10, layout.boardW + 20, layout.boardH + 20, 6)
        .stroke({ color: 0x68e9ff, alpha, width: 1.2 + pulse * 2.4 });
      this.flashLayer.roundRect(layout.boardX - 10 + drift, layout.boardY - 10, layout.boardW + 20, layout.boardH + 20, 6)
        .stroke({ color: 0xff5bd4, alpha: alpha * 0.9, width: 1.2 + pulse * 2.4 });
      this.flashLayer.rect(0, layout.boardY + layout.boardH * 0.52 - drift * 0.5, layout.w, Math.max(1, layout.cell * 0.035))
        .fill({ color: 0xffffff, alpha: alpha * 0.5 });
      this.chromaticPulse = Math.max(0, this.chromaticPulse - dt * 0.0034);
    }
    if (this.flash > 0) {
      this.flashLayer.rect(0, 0, layout.w, layout.h).fill({ color: 0xffffff, alpha: this.flash });
      this.flash = Math.max(0, this.flash - dt * 0.0018);
    }
  }

  lineClear(rows, lines, stage, cells = []) {
    const layout = this.layout();
    const color = stage?.accent || 0x68e9ff;
    this.worldSurge = Math.max(this.worldSurge, 0.62 + lines * 0.2);
    this.beatHit = Math.max(this.beatHit, lines >= 4 ? 1 : 0.62);
    this.phrasePulse = Math.max(this.phrasePulse, lines >= 4 ? 1 : 0.62);
    this.inputHeat = Math.max(this.inputHeat, 0.4 + lines * 0.12);
    this.chromaticPulse = Math.max(this.chromaticPulse, lines >= 4 ? 1 : 0.52);
    const clearColor = lines >= 4 ? 0xffffff : color;
    const centerY = rows.length
      ? rows.reduce((sum, row) => sum + layout.boardY + row * layout.cell + layout.cell / 2, 0) / rows.length
      : layout.boardY + layout.boardH / 2;
    const centerX = layout.boardX + layout.boardW / 2;
    const rayCount = Math.min(this.quality.coarse ? 18 : 38, 12 + lines * 7);
    for (let i = 0; i < rayCount; i += 1) {
      const side = i % 2 ? 1 : -1;
      const angle = (Math.random() - 0.5) * 0.38 + (side > 0 ? 0 : Math.PI);
      this.clearRays.push({
        x: centerX + (Math.random() - 0.5) * layout.boardW * 0.36,
        y: centerY + (Math.random() - 0.5) * layout.cell * Math.max(1, lines),
        angle,
        length: layout.w * (lines >= 4 ? 0.58 + Math.random() * 0.54 : 0.36 + Math.random() * 0.34),
        width: Math.max(1.4, layout.cell * (0.09 + Math.random() * 0.1 + lines * 0.022)),
        speed: layout.boardW * (0.25 + Math.random() * 0.42),
        color: Math.random() > 0.42 ? clearColor : color,
        alpha: lines >= 4 ? 0.96 : 0.7,
        sway: layout.cell * (0.12 + Math.random() * 0.26),
        spin: (Math.random() - 0.5) * 0.18,
        phase: Math.random() * Math.PI * 2,
        life: 26 + lines * 6 + Math.random() * 16,
        maxLife: 26 + lines * 6 + Math.random() * 16,
      });
    }
    this.lightFields.push({
      x: centerX,
      y: centerY,
      radius: layout.boardW * (lines >= 4 ? 1.45 : 0.96),
      color: clearColor,
      alpha: lines >= 4 ? 0.72 : 0.45,
      growth: lines >= 4 ? 1.1 : 0.72,
      life: 34 + lines * 7,
      maxLife: 34 + lines * 7,
    });
    this.screenBursts.push({
      x: centerX,
      y: centerY,
      radius: layout.boardW * (lines >= 4 ? 1.8 : 1.15),
      color: clearColor,
      alpha: lines >= 4 ? 0.5 : 0.28,
      width: lines >= 4 ? 4.2 : 2.6,
      life: 38 + lines * 8,
      maxLife: 38 + lines * 8,
    });
    if (lines >= 3) {
      this.screenBursts.push({
        x: centerX,
        y: centerY,
        radius: layout.boardW * (lines >= 4 ? 2.32 : 1.72),
        color,
        alpha: lines >= 4 ? 0.34 : 0.22,
        width: lines >= 4 ? 6.4 : 4.2,
        life: 46 + lines * 9,
        maxLife: 46 + lines * 9,
      });
    }
    this.shockBands.push({
      orientation: "horizontal",
      y: centerY,
      height: Math.max(layout.cell * 1.5, 24 + lines * 9),
      color: clearColor,
      alpha: lines >= 4 ? 0.9 : 0.58,
      sway: layout.cell * 0.18,
      life: 28 + lines * 5,
      maxLife: 28 + lines * 5,
    });
    rows.forEach((row) => {
      const y = layout.boardY + row * layout.cell + layout.cell / 2;
      this.clearCores.push({
        y,
        height: Math.max(20, layout.cell * (1.3 + lines * 0.24)),
        color: clearColor,
        alpha: lines >= 4 ? 1 : 0.88,
        life: 30 + lines * 7,
        maxLife: 30 + lines * 7,
      });
      this.rowSweeps.push({
        y,
        dir: 1,
        height: Math.max(18, layout.cell * (1.05 + lines * 0.16)),
        color: clearColor,
        life: 28 + lines * 4,
        maxLife: 28 + lines * 4,
      });
      this.rowSweeps.push({
        y,
        dir: -1,
        height: Math.max(16, layout.cell * (0.9 + lines * 0.12)),
        color,
        life: 34 + lines * 5,
        maxLife: 34 + lines * 5,
      });
      this.clearWaves.push({
        x: layout.boardX + layout.boardW / 2,
        y,
        speed: (Math.random() > 0.5 ? 1 : -1) * (2.2 + lines * 0.8),
        width: layout.w * (lines >= 4 ? 2.0 : 1.45),
        height: Math.max(28, layout.cell * (1.58 + lines * 0.28)),
        color,
        power: lines,
        life: 38 + lines * 8,
        maxLife: 38 + lines * 8,
      });
      this.beams.push({
        kind: "horizontal",
        y,
        height: Math.max(32, layout.cell * (1.8 + lines * 0.32)),
        color,
        life: 32 + lines * 6,
        maxLife: 32 + lines * 6,
      });
      for (let i = 0; i < Math.min(this.quality.maxParticles * 0.62, 118 + lines * 44); i += 1) {
        const outward = Math.random() > 0.45 ? (Math.random() > 0.5 ? 1 : -1) : 0;
        const texture = lines >= 4
          ? (Math.random() > 0.7 ? "nova" : (Math.random() > 0.54 ? "comet" : "streak"))
          : (Math.random() > 0.62 ? "cross" : (Math.random() > 0.48 ? "streak" : "shard"));
        this.spawnParticle(
          layout.boardX + Math.random() * layout.boardW,
          y + (Math.random() - 0.5) * layout.cell,
          Math.random() > 0.36 ? color : 0xffffff,
          2.8 + Math.random() * (lines >= 4 ? 8.4 : 5.8),
          outward * (3.8 + Math.random() * (6.4 + lines * 1.45)) + (Math.random() - 0.5) * 3.2,
          (Math.random() - 0.5) * (3.2 + lines * 1.3),
          42 + Math.random() * 42 + lines * 6,
          lines >= 4 ? 1 : 0.92,
          texture,
        );
      }
    });
    const sourceCells = cells.length
      ? cells
      : rows.flatMap((row) => Array.from({ length: COLS }, (_, col) => ({ row, col, color })));
    for (const cellInfo of sourceCells) {
      const px = layout.boardX + cellInfo.col * layout.cell + layout.cell / 2;
      const py = layout.boardY + cellInfo.row * layout.cell + layout.cell / 2;
      const side = cellInfo.col < COLS / 2 ? -1 : 1;
      this.clearTiles.push({
        x: px,
        y: py,
        vx: side * (1.8 + Math.random() * (3.2 + lines)) + (Math.random() - 0.5) * 1.4,
        vy: (Math.random() - 0.5) * (2.4 + lines * 0.5),
        color: Math.random() > 0.22 ? (cellInfo.color || color) : 0xffffff,
        size: layout.cell * (0.88 + Math.random() * 0.16),
        life: 28 + Math.random() * 18 + lines * 6,
        maxLife: 28 + Math.random() * 18 + lines * 6,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.12,
      });
      if (!this.quality.coarse || Math.random() > 0.35) {
        this.spawnParticle(
          px,
          py,
          Math.random() > 0.3 ? clearColor : (cellInfo.color || color),
          layout.cell * (0.12 + Math.random() * 0.18),
          side * (4.4 + Math.random() * 7.5),
          (Math.random() - 0.5) * (2.4 + lines),
          34 + Math.random() * 24 + lines * 4,
          lines >= 4 ? 1 : 0.78,
          lines >= 4 ? (Math.random() > 0.5 ? "nova" : "comet") : (Math.random() > 0.45 ? "diamond" : "streak"),
        );
      }
    }
    this.impactRings.push({
      kind: "clear",
      x: centerX,
      y: layout.boardY + layout.boardH / 2,
      radius: layout.boardW * (lines >= 4 ? 1.35 : 0.9),
      color: clearColor,
      life: 44 + lines * 5,
      maxLife: 44 + lines * 5,
    });
    this.comboPulse = Math.max(this.comboPulse, 0.75);
    this.flash = Math.max(this.flash, lines >= 4 ? 0.56 : 0.24);
    this.shake = Math.max(this.shake, lines >= 4 ? 18 : 8);
  }

  zoneBurst(lines, stage) {
    const layout = this.layout();
    const color = stage?.accent || 0xffffff;
    const count = Math.min(this.quality.maxParticles, 140 + lines * 28);
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH * 0.56;
    this.worldSurge = 1;
    this.chromaticPulse = Math.max(this.chromaticPulse, 0.86);
    this.lightFields.push({
      x: cx,
      y: cy,
      radius: layout.boardW * (1.2 + Math.min(1.6, lines * 0.06)),
      color,
      alpha: 0.85,
      growth: 1.2,
      life: 68,
      maxLife: 68,
    });
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 3.2 + Math.random() * (10 + lines * 0.36);
      this.spawnParticle(cx, cy, Math.random() > 0.38 ? color : 0xffffff, 2.6 + Math.random() * 7, Math.cos(a) * speed, Math.sin(a) * speed, 52 + Math.random() * 44, 0.95, Math.random() > 0.5 ? "star" : "diamond");
    }
    for (let i = 0; i < 5; i += 1) {
      this.clearWaves.push({
        x: cx,
        y: cy + (i - 2) * layout.cell * 0.7,
        speed: (i % 2 ? 1 : -1) * (2.4 + i * 0.25),
        width: layout.w * 2.1,
        height: Math.max(36, layout.cell * 2.4),
        color: i % 2 ? color : 0xffffff,
        power: 4,
        life: 50 + i * 5,
        maxLife: 50 + i * 5,
      });
    }
    this.flash = Math.max(this.flash, 0.42);
    this.shake = Math.max(this.shake, 18);
    this.comboPulse = 1;
  }

  stageShift(stage) {
    if (!this.app) return;
    const layout = this.layout();
    const color = stage?.accent || 0x68e9ff;
    this.stagePulse = 1;
    this.worldSurge = 1;
    this.flash = Math.max(this.flash, 0.16);
    this.chromaticPulse = Math.max(this.chromaticPulse, 0.55);
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH * 0.28;
    this.lightFields.push({
      x: cx,
      y: cy,
      radius: layout.boardW * 1.4,
      color,
      alpha: 0.5,
      growth: 0.9,
      life: 54,
      maxLife: 54,
      swayY: layout.cell * 0.5,
    });
    for (let i = 0; i < Math.min(this.quality.maxParticles * 0.72, 260); i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1.8 + Math.random() * 7.5;
      const c = Math.random() > 0.35 ? color : (stage?.colors?.[Math.floor(Math.random() * stage.colors.length)] || 0xffffff);
      this.spawnParticle(cx, cy, c, 2.2 + Math.random() * 6.2, Math.cos(a) * speed, Math.sin(a) * speed, 48 + Math.random() * 42, 0.84, Math.random() > 0.5 ? "star" : "flare");
    }
    for (let i = 0; i < (this.quality.coarse ? 6 : 14); i += 1) {
      const angle = -Math.PI * 0.35 + Math.random() * Math.PI * 0.7 + (i % 2 ? 0 : Math.PI);
      this.clearRays.push({
        x: cx,
        y: cy + (Math.random() - 0.5) * layout.boardH * 0.22,
        angle,
        length: layout.w * (0.22 + Math.random() * 0.26),
        width: Math.max(1.1, layout.cell * (0.06 + Math.random() * 0.06)),
        speed: layout.boardW * (0.18 + Math.random() * 0.28),
        color: Math.random() > 0.4 ? color : 0xffffff,
        alpha: 0.48,
        sway: layout.cell * 0.16,
        spin: (Math.random() - 0.5) * 0.12,
        phase: Math.random() * Math.PI * 2,
        life: 34 + Math.random() * 20,
        maxLife: 54,
      });
    }
  }

  zoneIgnite(stage) {
    if (!this.app) return;
    const layout = this.layout();
    const color = stage?.accent || 0xffffff;
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH / 2;
    this.zonePulse = 1;
    this.worldSurge = 1;
    this.flash = Math.max(this.flash, 0.42);
    this.chromaticPulse = Math.max(this.chromaticPulse, 1);
    this.shake = Math.max(this.shake, 12);
    this.lightFields.push({
      x: cx,
      y: cy,
      radius: layout.boardW * 1.65,
      color,
      alpha: 0.86,
      growth: 0.92,
      life: 66,
      maxLife: 66,
    });
    this.screenBursts.push({
      x: cx,
      y: cy,
      radius: layout.boardW * 1.9,
      color: 0xffffff,
      alpha: 0.5,
      width: 4,
      life: 54,
      maxLife: 54,
    });
    this.shockBands.push({
      orientation: "vertical",
      x: cx,
      width: Math.max(layout.cell * 2.8, layout.boardW * 0.32),
      color: 0xffffff,
      alpha: 0.84,
      sway: layout.cell * 0.1,
      life: 58,
      maxLife: 58,
    });
    this.beams.push({
      kind: "vertical",
      x: cx,
      width: Math.max(layout.cell * 2.2, layout.boardW * 0.24),
      life: 46,
      maxLife: 46,
    });
    for (let i = 0; i < Math.min(this.quality.maxParticles * 0.7, 220); i += 1) {
      const x = layout.boardX + Math.random() * layout.boardW;
      const y = layout.boardY + layout.boardH + Math.random() * 20;
      this.spawnParticle(x, y, Math.random() > 0.5 ? color : 0xffffff, 2.2 + Math.random() * 5.4, (Math.random() - 0.5) * 5, -3 - Math.random() * 8, 54 + Math.random() * 46, 0.9, Math.random() > 0.5 ? "streak" : "star");
    }
  }

  actionPulse(kind, snapshot, amount = 1) {
    if (!this.app || !snapshot?.active) return;
    const layout = this.layout();
    const piece = snapshot.active;
    const color = piece.color || snapshot.stage?.accent || 0xffffff;
    const cx = layout.boardX + (piece.x + piece.matrix[0].length / 2) * layout.cell;
    const cy = layout.boardY + (piece.y + piece.matrix.length / 2) * layout.cell;
    const count = kind === "drop" ? 34 + Math.min(34, amount * 1.25) : kind === "rotate" ? 28 : 12;
    this.inputHeat = Math.max(this.inputHeat, kind === "drop" ? 0.7 : kind === "rotate" ? 0.46 : 0.32);
    if (kind === "drop") {
      this.worldSurge = Math.max(this.worldSurge, 0.28);
      this.chromaticPulse = Math.max(this.chromaticPulse, 0.28);
    }
    const pipCount = kind === "move" ? 2 : kind === "rotate" ? 5 : 4;
    for (let i = 0; i < pipCount; i += 1) {
      const a = kind === "move"
        ? (piece.x < COLS / 2 ? Math.PI : 0) + (Math.random() - 0.5) * 0.7
        : Math.random() * Math.PI * 2;
      this.resonancePips.push({
        x: cx + Math.cos(a) * layout.cell * 0.42,
        y: cy + Math.sin(a) * layout.cell * 0.42,
        vx: Math.cos(a) * layout.cell * (kind === "drop" ? 1.7 : 0.9),
        vy: Math.sin(a) * layout.cell * (kind === "drop" ? 1.1 : 0.7),
        radius: layout.cell * (kind === "drop" ? 0.38 : 0.26),
        color: Math.random() > 0.28 ? color : 0xffffff,
        alpha: kind === "drop" ? 0.62 : 0.5,
        life: kind === "drop" ? 22 : 16,
        maxLife: kind === "drop" ? 22 : 16,
      });
    }
    for (let i = 0; i < Math.min(count, this.quality.coarse ? 36 : 62); i += 1) {
      const a = kind === "drop"
        ? -Math.PI / 2 + (Math.random() - 0.5) * 0.72
        : Math.random() * Math.PI * 2;
      const speed = kind === "drop" ? 1.8 + Math.random() * 5.2 : 0.9 + Math.random() * 3.2;
      this.spawnParticle(
        cx + (Math.random() - 0.5) * layout.cell * (kind === "drop" ? 1.0 : 1.4),
        cy + (Math.random() - 0.5) * layout.cell * (kind === "drop" ? 0.8 : 1.4),
        Math.random() > 0.35 ? color : 0xffffff,
        kind === "drop" ? 1.6 + Math.random() * 3.4 : 1.6 + Math.random() * 3.2,
        Math.cos(a) * speed,
        Math.sin(a) * speed + (kind === "drop" ? 2.1 : 0),
        kind === "drop" ? 22 + Math.random() * 22 : 20 + Math.random() * 20,
        kind === "drop" ? 0.42 : (kind === "move" ? 0.48 : 0.74),
        kind === "drop" ? (Math.random() > 0.46 ? "comet" : "streak") : (kind === "rotate" ? "star" : "pin"),
      );
    }
    if (kind === "drop") {
      const dropDistance = Math.max(1, amount || 1);
      this.beatHit = Math.max(this.beatHit, 0.28);
      const landedCells = [];
      for (let y = 0; y < piece.matrix.length; y += 1) {
        for (let x = 0; x < piece.matrix[y].length; x += 1) {
          if (!piece.matrix[y][x]) continue;
          const px = layout.boardX + (piece.x + x) * layout.cell + layout.cell / 2;
          const py = layout.boardY + (piece.y + y) * layout.cell + layout.cell / 2;
          landedCells.push({ x: px, y: py });
          this.dropTrails.push({
            x: px,
            y1: Math.max(layout.boardY - layout.cell, py - dropDistance * layout.cell),
            y2: py + layout.cell * 0.42,
            width: Math.max(3.5, layout.cell * 0.2),
            color,
            sway: (Math.random() - 0.5) * layout.cell * 0.16,
            alpha: 0.15,
            coreAlpha: 0.44,
            lineAlpha: 0.56,
            life: 14 + Math.min(12, dropDistance * 0.72),
            maxLife: 14 + Math.min(12, dropDistance * 0.72),
          });
          this.impactRings.push({
            kind: "landing",
            x: px,
            y: py + layout.cell * 0.34,
            width: layout.cell * (1.5 + Math.min(1.8, dropDistance * 0.08)),
            height: layout.cell * 0.72,
            color: Math.random() > 0.26 ? color : 0xffffff,
            life: 24 + Math.min(14, dropDistance),
            maxLife: 24 + Math.min(14, dropDistance),
          });
        }
      }
      const impactY = landedCells.length
        ? landedCells.reduce((sum, block) => sum + block.y, 0) / landedCells.length
        : cy;
      this.lightFields.push({
        x: cx,
        y: impactY,
        radius: Math.max(layout.boardW * 0.48, layout.cell * (2.2 + dropDistance * 0.08)),
        color,
        alpha: 0.32,
        growth: 0.62,
        life: 22 + Math.min(10, dropDistance * 0.36),
        maxLife: 22 + Math.min(10, dropDistance * 0.36),
      });
      this.screenBursts.push({
        x: cx,
        y: impactY,
        radius: Math.max(layout.boardW * 0.9, layout.cell * (4 + dropDistance * 0.18)),
        color: 0xffffff,
        alpha: 0.26,
        width: 3.2,
        life: 32 + Math.min(18, dropDistance * 1.1),
        maxLife: 32 + Math.min(18, dropDistance * 1.1),
      });
      this.shockBands.push({
        orientation: "vertical",
        x: cx,
        width: Math.max(layout.cell * 0.28, 5 + dropDistance * 0.08),
        color: 0xffffff,
        alpha: 0.12,
        sway: layout.cell * 0.08,
        life: 14 + Math.min(10, dropDistance * 0.55),
        maxLife: 14 + Math.min(10, dropDistance * 0.55),
      });
      this.shockBands.push({
        orientation: "horizontal",
        y: impactY + layout.cell * 0.62,
        height: Math.max(layout.cell * 0.9, 18 + dropDistance * 0.35),
        color,
        alpha: 0.55,
        sway: layout.cell * 0.12,
        life: 22 + Math.min(14, dropDistance),
        maxLife: 22 + Math.min(14, dropDistance),
      });
      this.impactRings.push({
        kind: "landing",
        x: cx,
        y: impactY + layout.cell * 0.62,
        width: Math.max(layout.boardW * 0.68, layout.cell * (3 + dropDistance * 0.28)),
        height: Math.max(layout.cell * 1.25, layout.cell * (1.1 + dropDistance * 0.05)),
        color: 0xffffff,
        life: 32 + Math.min(18, dropDistance * 1.2),
        maxLife: 32 + Math.min(18, dropDistance * 1.2),
      });
      this.beams.push({
        kind: "vertical",
        style: "drop",
        x: cx,
        top: Math.max(layout.boardY - layout.cell * 0.4, impactY - dropDistance * layout.cell - layout.cell * 0.7),
        bottom: impactY + layout.cell * 0.8,
        width: Math.max(layout.cell * 0.32, 6 + dropDistance * 0.08),
        color,
        alpha: 0.36,
        life: 18 + Math.min(8, dropDistance * 0.38),
        maxLife: 18 + Math.min(8, dropDistance * 0.38),
      });
      for (let i = 0; i < (this.quality.coarse ? 4 : 9); i += 1) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
        this.clearRays.push({
          x: cx + (Math.random() - 0.5) * layout.cell,
          y: impactY,
          angle,
          length: layout.boardH * (0.18 + Math.random() * 0.22),
          width: Math.max(1, layout.cell * (0.05 + Math.random() * 0.04)),
          speed: layout.cell * (3 + Math.random() * 6),
          color: Math.random() > 0.28 ? color : 0xffffff,
          alpha: 0.38,
          sway: layout.cell * 0.12,
          spin: (Math.random() - 0.5) * 0.16,
          phase: Math.random() * Math.PI * 2,
          life: 18 + Math.random() * 12,
          maxLife: 30,
        });
      }
      this.clearWaves.push({
        x: cx,
        y: layout.boardY + layout.boardH - layout.cell * 0.6,
        speed: 0,
        width: Math.max(layout.boardW * 0.78, layout.cell * (2.4 + amount * 0.2)),
        height: Math.max(26, layout.cell * 1.55),
        color,
        power: 2,
        life: 28,
        maxLife: 28,
      });
      this.shake = Math.max(this.shake, 5);
    }
    if (kind === "rotate") this.comboPulse = Math.max(this.comboPulse, 0.22);
  }

  spawnParticle(x, y, color, size, vx, vy, life, alpha, textureKind = "") {
    while (this.particles.length >= this.quality.maxParticles) {
      const old = this.particles.shift();
      this.hideParticleNode(old?.sprite);
    }
    const sprite = this.acquireSparkSprite();
    const rotation = Math.random() * Math.PI * 2;
    if (sprite) {
      this.setParticleTexture(sprite, this.particleTextures?.[textureKind] || sprite.texture);
      this.showParticleNode(sprite, x, y, color, alpha, Math.max(0.04, size / 18), rotation);
    }
    this.particles.push({
      x,
      y,
      color,
      size,
      vx,
      vy,
      life,
      maxLife: life,
      gravity: 0.025,
      alpha,
      spin: (Math.random() - 0.5) * 0.08,
      rotation,
      textureKind,
      sprite,
    });
  }

  acquireSparkSprite() {
    if (!this.sparkSprites.length) return null;
    for (let i = 0; i < this.sparkSprites.length; i += 1) {
      const index = (this.sparkCursor + i) % this.sparkSprites.length;
      const sprite = this.sparkSprites[index];
      if (!sprite.active) {
        this.sparkCursor = (index + 1) % this.sparkSprites.length;
        return sprite;
      }
    }
    const old = this.particles.shift();
    this.hideParticleNode(old?.sprite);
    const sprite = this.sparkSprites[this.sparkCursor % this.sparkSprites.length];
    this.sparkCursor = (this.sparkCursor + 1) % this.sparkSprites.length;
    return sprite;
  }
}

class InputController {
  constructor(root, buttons, dispatch) {
    this.root = root;
    this.buttons = buttons;
    this.dispatch = dispatch;
    this.repeatTimer = 0;
    this.repeatAction = "";
    this.pointerStart = null;
    this.bind();
  }

  bind() {
    window.addEventListener("keydown", (event) => {
      const action = this.keyToAction(event);
      if (!action) return;
      event.preventDefault();
      if ((action === "left" || action === "right" || action === "down") && event.repeat) return;
      this.dispatch(action);
      if (action === "left" || action === "right" || action === "down") this.startRepeat(action);
    }, { passive: false });

    window.addEventListener("keyup", (event) => {
      const action = this.keyToAction(event);
      if (!action) return;
      if (action === this.repeatAction) this.stopRepeat();
    }, { passive: true });

    this.buttons.querySelectorAll("button[data-action]").forEach((button) => {
      const action = button.dataset.action;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        this.dispatch(action);
        if (action === "left" || action === "right" || action === "down") {
          this.startRepeat(action);
        }
      });
      const stop = () => this.stopRepeat();
      button.addEventListener("pointerup", stop);
      button.addEventListener("pointercancel", stop);
      button.addEventListener("pointerleave", stop);
    });

    this.root.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, input, a, .screen-layer")) return;
      this.pointerStart = { x: event.clientX, y: event.clientY, t: performance.now() };
    }, { passive: true });

    this.root.addEventListener("pointerup", (event) => {
      if (!this.pointerStart || event.target.closest("button, input, a, .screen-layer")) return;
      const dx = event.clientX - this.pointerStart.x;
      const dy = event.clientY - this.pointerStart.y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (ady > 52 && dy > 0 && ady > adx * 1.2) {
        this.dispatch("drop");
      } else if (adx > 34 && adx > ady * 1.1) {
        const steps = clamp(Math.round(adx / 52), 1, 4);
        for (let i = 0; i < steps; i += 1) this.dispatch(dx > 0 ? "right" : "left");
      } else if (performance.now() - this.pointerStart.t < 280) {
        this.dispatch("rotate");
      }
      this.pointerStart = null;
    }, { passive: true });
  }

  keyToAction(event) {
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") return "left";
    if (key === "arrowright" || key === "d") return "right";
    if (key === "arrowdown" || key === "s") return "down";
    if (key === "arrowup" || key === "w" || key === "x") return "rotate";
    if (key === "z") return "rotate-ccw";
    if (key === " " || key === "spacebar") return "drop";
    if (key === "c" || key === "shift") return "hold";
    if (key === "l") return "zone";
    if (key === "enter" || key === "escape" || key === "p") return "pause";
    return "";
  }

  startRepeat(action) {
    this.stopRepeat();
    this.repeatAction = action;
    this.repeatTimer = window.setTimeout(() => {
      this.repeatTimer = window.setInterval(() => this.dispatch(this.repeatAction), action === "down" ? 32 : 46);
    }, 112);
  }

  stopRepeat() {
    if (this.repeatTimer) {
      window.clearTimeout(this.repeatTimer);
      window.clearInterval(this.repeatTimer);
      this.repeatTimer = 0;
    }
    this.repeatAction = "";
  }
}

class LumenShiftApp {
  constructor() {
    this.root = document.getElementById("game-root");
    this.pixiRoot = document.getElementById("pixi-root");
    this.view = new PixiView(this.pixiRoot);
    this.audio = new AudioDirector();
    this.rank = new RankClient();
    this.modeKey = readStorage("mode", "journey");
    this.rankOnly = false;
    this.lastAudioMixAt = 0;
    this.elements = {
      menu: document.getElementById("menu-screen"),
      pause: document.getElementById("pause-screen"),
      result: document.getElementById("result-screen"),
      play: document.getElementById("play-button"),
      rank: document.getElementById("rank-button"),
      home: document.getElementById("home-button"),
      pauseButton: document.getElementById("pause-button"),
      resume: document.getElementById("resume-button"),
      restart: document.getElementById("restart-button"),
      again: document.getElementById("again-button"),
      menuButton: document.getElementById("menu-button"),
      submit: document.getElementById("submit-score"),
      nickname: document.getElementById("nickname-input"),
      submitStatus: document.getElementById("submit-status"),
      ranking: document.getElementById("ranking-list"),
      score: document.getElementById("score-value"),
      lines: document.getElementById("lines-value"),
      level: document.getElementById("level-value"),
      combo: document.getElementById("combo-value"),
      speedLv: document.getElementById("speed-lv-value"),
      areaLines: document.getElementById("area-lines-value"),
      areaLinesGoal: document.getElementById("area-lines-goal"),
      time: document.getElementById("time-value"),
      areaScore: document.getElementById("area-score-value"),
      maxRing: document.getElementById("max-ring"),
      stage: document.getElementById("stage-name"),
      lumenFill: document.getElementById("lumen-fill"),
      eventLabel: document.getElementById("event-label"),
      stageSplash: document.getElementById("stage-splash"),
      zoneVeil: document.getElementById("zone-veiler"),
      finalScore: document.getElementById("final-score"),
      resultTitle: document.getElementById("result-title"),
      resultMode: document.getElementById("result-mode"),
      controls: document.getElementById("touch-controls"),
    };
    this.elements.nickname.value = readStorage("nickname", "");
    this.core = new FallingBlockCore(this.makeCallbacks());
    this.core.status = "menu";
    this.input = new InputController(this.root, this.elements.controls, (action) => this.handleAction(action));
  }

  async init() {
    this.bindDom();
    this.applyModeSelection();
    await this.view.init((dt) => this.frame(dt));
    this.view.render(this.core.snapshot(), 16);
    this.updateHud(this.core.snapshot());
  }

  bindDom() {
    document.querySelectorAll(".mode-card").forEach((button) => {
      button.addEventListener("click", () => {
        this.modeKey = button.dataset.mode || "journey";
        writeStorage("mode", this.modeKey);
        this.applyModeSelection();
      });
    });
    this.elements.play.addEventListener("click", () => this.startGame(this.modeKey));
    this.elements.rank.addEventListener("click", () => this.openRankingOnly());
    this.elements.home.addEventListener("click", () => this.openMenu());
    this.elements.pauseButton.addEventListener("click", () => this.togglePause());
    this.elements.resume.addEventListener("click", () => this.togglePause(false));
    this.elements.restart.addEventListener("click", () => this.startGame(this.modeKey));
    this.elements.again.addEventListener("click", () => this.startGame(this.modeKey));
    this.elements.menuButton.addEventListener("click", () => this.openMenu());
    this.elements.submit.addEventListener("click", () => this.submitScore());
    this.elements.nickname.addEventListener("change", () => writeStorage("nickname", this.elements.nickname.value.trim()));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.core.status === "playing") this.togglePause(true);
    });
  }

  makeCallbacks() {
    return {
      onMove: () => {
        this.audio.move();
        this.view.actionPulse("move", this.core?.snapshot?.());
        this.haptic(4);
      },
      onRotate: () => {
        this.audio.rotate();
        this.view.actionPulse("rotate", this.core?.snapshot?.());
        this.haptic(7);
      },
      onHardDrop: (distance) => {
        this.audio.drop();
        this.view.actionPulse("drop", this.core?.snapshot?.(), distance);
        this.haptic([12, 22, 16]);
      },
      onHold: () => {
        this.audio.rotate();
        this.view.actionPulse("rotate", this.core?.snapshot?.());
        this.haptic(8);
      },
      onLock: (info) => {
        const stage = STAGES[this.core.stageIndex] || STAGES[0];
        this.view.pieceLock(info.cells, stage, false);
      },
      onStage: (index, stage) => {
        this.audio.setStage(index);
        this.view.stageShift(stage);
        this.showStageSplash(stage.name);
      },
      onClear: (info) => {
        const stage = STAGES[this.core.stageIndex] || STAGES[0];
        this.audio.clear(info.lines);
        this.view.lineClear(info.rows, info.lines, stage, info.cells);
        this.showEvent(this.clearLabel(info.lines, info.combo, info.zoneActive));
        this.haptic(info.lines >= 4 ? [28, 36, 42] : [14, 20, 10]);
        this.rank.record({
          type: "clear",
          lines: info.lines,
          combo: info.combo,
          level: info.level,
          delta: info.delta,
        });
      },
      onZoneStart: () => {
        this.audio.zoneStart();
        this.view.zoneIgnite(STAGES[this.core.stageIndex] || STAGES[0]);
        this.showEvent("LUMEN ZONE");
        this.setZoneVeil(true);
        this.haptic([18, 28, 18, 28, 32]);
      },
      onZoneEnd: (info) => {
        const stage = STAGES[this.core.stageIndex] || STAGES[0];
        this.audio.zoneEnd(info.lines);
        this.view.zoneBurst(info.lines, stage);
        this.haptic(info.lines > 0 ? [24, 28, 24, 36, 44] : 18);
        if (info.delta > 0) {
          this.showEvent(`${info.lines} LINE BURST`);
          this.rank.record({
            type: "zone_bonus",
            zone_lines: info.lines,
            level: info.level,
            delta: info.delta,
          });
        } else {
          this.showEvent("ZONE FADE");
        }
        this.setZoneVeil(false);
      },
      onEvent: (label) => this.showEvent(label),
      onFinish: (title, snapshot) => this.openResult(title, snapshot),
    };
  }

  haptic(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {
      // Haptics are optional and browser/device dependent.
    }
  }

  frame(dt) {
    if (this.core.status === "playing") this.core.tick(dt);
    const snapshot = this.core.snapshot();
    const beatState = this.audio.getBeatState(snapshot, dt);
    this.view.render(snapshot, dt, beatState);
    const now = performance.now();
    if (now - this.lastAudioMixAt > 48) {
      this.audio.updateMix(snapshot);
      this.lastAudioMixAt = now;
    }
    this.updateHud(snapshot);
  }

  async startGame(modeKey) {
    this.modeKey = modeKey || this.modeKey || "journey";
    writeStorage("mode", this.modeKey);
    this.hideAllScreens();
    this.setZoneVeil(false, true);
    await this.audio.unlock();
    this.rank = new RankClient();
    if (MODES[this.modeKey]?.ranked) this.rank.start().catch(() => null);
    this.core.callbacks = this.makeCallbacks();
    this.core.reset(this.modeKey);
  }

  handleAction(action) {
    if (this.elements.menu.classList.contains("is-hidden") === false) {
      if (action === "drop" || action === "rotate" || action === "pause") this.startGame(this.modeKey);
      return;
    }
    if (this.core.status === "finished") return;
    if (action === "pause") {
      this.togglePause();
      return;
    }
    if (this.core.status !== "playing") return;
    if (action === "left") this.core.move(-1);
    else if (action === "right") this.core.move(1);
    else if (action === "down") this.core.stepDown(true);
    else if (action === "rotate") this.core.rotate(1);
    else if (action === "rotate-ccw") this.core.rotate(-1);
    else if (action === "drop") this.core.hardDrop();
    else if (action === "hold") this.core.hold();
    else if (action === "zone") {
      const ok = this.core.activateZone();
      if (!ok) this.showEvent("CHARGE");
    }
  }

  togglePause(forcePause) {
    if (this.core.status === "menu" || this.core.status === "finished") return;
    if (forcePause === true && this.core.status !== "playing") return;
    const status = forcePause === true ? (this.core.status = "paused") : this.core.togglePause();
    if (status === "paused") {
      this.elements.pause.classList.remove("is-hidden");
    } else if (status === "playing") {
      this.elements.pause.classList.add("is-hidden");
    }
  }

  openMenu() {
    this.core.status = "menu";
    this.setZoneVeil(false, true);
    this.applyModeSelection();
    this.elements.menu.classList.remove("is-hidden");
    this.elements.pause.classList.add("is-hidden");
    this.elements.result.classList.add("is-hidden");
  }

  async openRankingOnly() {
    this.rankOnly = true;
    this.hideAllScreens();
    this.elements.result.classList.remove("is-hidden");
    this.elements.resultTitle.textContent = "Ranking";
    this.elements.resultMode.textContent = "LUMEN SHIFT";
    this.elements.finalScore.textContent = "";
    this.elements.submitStatus.textContent = "";
    this.elements.nickname.parentElement.classList.add("is-hidden");
    await this.renderRanks();
  }

  openResult(title, snapshot) {
    this.hideAllScreens();
    this.rankOnly = false;
    this.elements.result.classList.remove("is-hidden");
    this.elements.nickname.parentElement.classList.toggle("is-hidden", !MODES[snapshot.modeKey]?.ranked || snapshot.score <= 0);
    this.elements.resultTitle.textContent = title;
    this.elements.resultMode.textContent = MODES[snapshot.modeKey]?.label || "Journey";
    this.elements.finalScore.textContent = formatScore(snapshot.score);
    this.elements.submitStatus.textContent = MODES[snapshot.modeKey]?.ranked ? "" : "Relax records stay local.";
    this.renderRanks().catch(() => null);
  }

  hideAllScreens() {
    this.elements.menu.classList.add("is-hidden");
    this.elements.pause.classList.add("is-hidden");
    this.elements.result.classList.add("is-hidden");
  }

  async submitScore() {
    const name = this.elements.nickname.value.trim().slice(0, 20) || "Player";
    writeStorage("nickname", name);
    const snapshot = this.core.snapshot();
    if (!MODES[snapshot.modeKey]?.ranked) {
      this.elements.submitStatus.textContent = "Relax mode is not ranked.";
      return;
    }
    this.elements.submit.disabled = true;
    this.elements.submitStatus.textContent = "Submitting...";
    try {
      const data = await this.rank.submit(name, snapshot.score, {
        mode: snapshot.modeKey,
        lines: snapshot.lines,
        level: snapshot.level,
        max_combo: snapshot.maxCombo,
        zone_lines: snapshot.totalZoneLines,
        elapsed_ms: Math.floor(snapshot.elapsed),
      });
      this.elements.submitStatus.textContent = `Rank ${data.rank || "-"} saved.`;
      await this.renderRanks();
    } catch (err) {
      this.elements.submitStatus.textContent = err.message || "Submit failed.";
    } finally {
      this.elements.submit.disabled = false;
    }
  }

  async renderRanks() {
    this.elements.ranking.innerHTML = '<div class="rank-row"><span>...</span><strong>Loading</strong><span></span></div>';
    try {
      const rows = await this.rank.fetchTop(20);
      if (rows.length === 0) {
        this.elements.ranking.innerHTML = '<div class="rank-row"><span>-</span><strong>No records yet</strong><span></span></div>';
        return;
      }
      this.elements.ranking.innerHTML = rows.map((row, index) => (
        `<div class="rank-row"><span>${index + 1}</span><strong>${this.escape(row.player_name || "Player")}</strong><span>${formatScore(row.score)}</span></div>`
      )).join("");
    } catch {
      this.elements.ranking.innerHTML = '<div class="rank-row"><span>!</span><strong>Ranking offline</strong><span></span></div>';
    }
  }

  updateHud(snapshot) {
    const layout = this.view.app ? this.view.layout() : null;
    if (layout) {
      const hudY = Math.round(layout.boardY + layout.boardH * (layout.portrait ? 0.58 : 0.56));
      const leftX = Math.max(7, Math.round(layout.boardX - (layout.portrait ? 86 : 126)));
      const rightX = Math.min(window.innerWidth - 84, Math.round(layout.boardX + layout.boardW + (layout.portrait ? 16 : 34)));
      this.root.style.setProperty("--board-x", `${Math.round(layout.boardX)}px`);
      this.root.style.setProperty("--board-y", `${Math.round(layout.boardY)}px`);
      this.root.style.setProperty("--board-w", `${Math.round(layout.boardW)}px`);
      this.root.style.setProperty("--board-h", `${Math.round(layout.boardH)}px`);
      this.root.style.setProperty("--effect-hud-y", `${hudY}px`);
      this.root.style.setProperty("--effect-hud-left-x", `${leftX}px`);
      this.root.style.setProperty("--effect-hud-right-x", `${rightX}px`);
    }
    this.elements.score.textContent = formatScore(snapshot.score);
    this.elements.lines.textContent = snapshot.lines;
    this.elements.level.textContent = snapshot.level;
    this.elements.combo.textContent = snapshot.combo;
    this.elements.speedLv.textContent = snapshot.level;
    this.elements.areaLines.textContent = snapshot.lines;
    this.elements.areaLinesGoal.textContent = snapshot.mode?.lineGoal || (snapshot.modeKey === "ultra" ? "∞" : 150);
    this.elements.time.textContent = this.formatTime(snapshot.elapsed);
    this.elements.areaScore.textContent = formatScore(snapshot.score);
    this.elements.maxRing.classList.toggle("is-ready", snapshot.lumen >= 0.3 || snapshot.zoneActive);
    this.elements.stage.textContent = snapshot.stage?.name || "Deep Bloom";
    const lumenValue = snapshot.zoneActive ? snapshot.zoneProgress : snapshot.lumen;
    this.elements.lumenFill.style.width = `${clamp(lumenValue, 0, 1) * 100}%`;
  }

  formatTime(ms) {
    const total = Math.max(0, Math.floor((ms || 0) / 1000));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  clearLabel(lines, combo, zoneActive) {
    const base = lines === 4 ? "LUMEN CLEAR" : lines === 3 ? "TRIPLE" : lines === 2 ? "DOUBLE" : "SINGLE";
    if (zoneActive) return `${base} +${combo}`;
    if (combo >= 4) return `${base} COMBO ${combo}`;
    return base;
  }

  showEvent(label) {
    if (!label || !window.gsap) {
      this.elements.eventLabel.textContent = label || "";
      return;
    }
    this.elements.eventLabel.textContent = label;
    window.gsap.killTweensOf(this.elements.eventLabel);
    window.gsap.fromTo(this.elements.eventLabel, { opacity: 0, y: 8, scale: 0.96 }, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.16,
      ease: "power2.out",
      onComplete: () => {
        window.gsap.to(this.elements.eventLabel, { opacity: 0, y: -10, duration: 0.42, delay: 0.56, ease: "power2.in" });
      },
    });
  }

  showStageSplash(label) {
    if (!this.elements.stageSplash || !label) return;
    this.elements.stageSplash.textContent = label;
    if (!window.gsap) {
      this.elements.stageSplash.style.opacity = "0";
      return;
    }
    window.gsap.killTweensOf(this.elements.stageSplash);
    window.gsap.fromTo(this.elements.stageSplash, {
      opacity: 0,
      scale: 0.84,
      filter: "blur(18px)",
    }, {
      opacity: 1,
      scale: 1,
      filter: "blur(0px)",
      duration: 0.26,
      ease: "power3.out",
      onComplete: () => {
        window.gsap.to(this.elements.stageSplash, {
          opacity: 0,
          scale: 1.08,
          filter: "blur(12px)",
          duration: 0.44,
          delay: 0.22,
          ease: "power3.in",
        });
      },
    });
  }

  setZoneVeil(active, immediate = false) {
    if (!this.elements.zoneVeil) return;
    if (!window.gsap || immediate) {
      this.elements.zoneVeil.style.opacity = active ? "1" : "0";
      return;
    }
    window.gsap.killTweensOf(this.elements.zoneVeil);
    window.gsap.to(this.elements.zoneVeil, {
      opacity: active ? 1 : 0,
      duration: active ? 0.24 : 0.52,
      ease: active ? "power2.out" : "power2.in",
    });
  }

  applyModeSelection() {
    document.querySelectorAll(".mode-card").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.mode === this.modeKey);
    });
  }

  escape(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

const app = new LumenShiftApp();
const debugHandleAllowed = new URLSearchParams(window.location.search).has("debug")
  || window.location.hostname === "127.0.0.1"
  || window.location.hostname === "localhost";
if (debugHandleAllowed) {
  window.__lumenApp = app;
}
app.init().catch((err) => {
  console.error(err);
  const label = document.getElementById("event-label");
  if (label) {
    label.textContent = "Renderer failed";
    label.style.opacity = "1";
  }
});
