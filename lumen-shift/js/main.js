const GAME_ID = "lumen-shift";
const RANK_API_BASE = "https://game-api.yama5993.workers.dev";
const COLS = 10;
const ROWS = 20;
const VISIBLE_NEXT = 5;
const SCORE_TABLE = [0, 100, 300, 500, 800];
const STORAGE_PREFIX = "lumen-shift";

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
    this.arpStep = 0;
    this.energyStep = 0;
  }

  async unlock() {
    if (this.ready || !window.Tone) return;
    try {
      await window.Tone.start();
      const Tone = window.Tone;
      const master = new Tone.Gain(0.74).toDestination();
      const delay = new Tone.FeedbackDelay("8n", 0.22).connect(master);
      const reverb = new Tone.Reverb({ decay: 3.2, wet: 0.28 }).connect(master);
      const baseGain = new Tone.Gain(0.24).connect(reverb);
      const pulseGain = new Tone.Gain(0.04).connect(delay);
      const energyGain = new Tone.Gain(0.02).connect(master);
      const zoneGain = new Tone.Gain(0).connect(reverb);
      const hitGain = new Tone.Gain(0.4).connect(master);
      const pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.08, decay: 0.2, sustain: 0.42, release: 1.4 },
      }).connect(baseGain);
      const pluck = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.08, sustain: 0.08, release: 0.16 },
      }).connect(hitGain);
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
        oscillator: { type: "fatsawtooth", count: 2, spread: 18 },
        envelope: { attack: 0.01, decay: 0.18, sustain: 0.18, release: 0.42 },
      }).connect(hitGain);
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
      const shimmer = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.02, decay: 0.08, sustain: 0.24, release: 0.7 },
      }).connect(zoneGain);
      this.stemGains = { base: baseGain, pulse: pulseGain, energy: energyGain, zone: zoneGain, hit: hitGain };
      this.synths = { pad, pluck, bass, impact, clear, arp, pulse, shimmer };
      this.ready = true;
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
      const chord = chords[step % chords.length];
      this.synths.pad.triggerAttackRelease(chord, "2n", time, 0.18);
      if (step % 2 === 0) this.synths.bass.triggerAttackRelease(chord[0], "8n", time, 0.34);
      step += 1;
    }, "1m");
    const pulseLoop = new Tone.Loop((time) => {
      if (!this.synths) return;
      const bank = arps[step % arps.length];
      const note = bank[this.arpStep % bank.length];
      this.synths.arp.triggerAttackRelease(note, "32n", time, 0.12);
      this.arpStep += 1;
    }, "8n");
    const energyLoop = new Tone.Loop((time) => {
      if (!this.synths) return;
      if (this.energyStep % 2 === 0) this.synths.pulse.triggerAttackRelease("32n", time, 0.14);
      this.energyStep += 1;
    }, "4n");
    const zoneLoop = new Tone.Loop((time) => {
      if (!this.synths) return;
      const chord = chords[(step + 1) % chords.length].map((note) => note.replace(/\d$/, (oct) => String(Number(oct) + 2)));
      this.synths.shimmer.triggerAttackRelease(chord, "16n", time, 0.1);
    }, "2n");
    this.musicLoops.push(baseLoop, pulseLoop, energyLoop, zoneLoop);
    this.musicLoops.forEach((loop) => loop.start(0));
    Tone.Transport.bpm.value = STAGES[0].bpm;
    Tone.Transport.start();
    this.started = true;
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
    const energy = clamp(stageLift * 0.34 + comboLift * 0.42 + lumenLift * 0.34 + zoneLift * 0.45, 0, 1);
    this.rampStem("base", 0.2 + stageLift * 0.06 + zoneLift * 0.06);
    this.rampStem("pulse", 0.02 + lumenLift * 0.16 + comboLift * 0.16 + zoneLift * 0.22);
    this.rampStem("energy", 0.02 + energy * 0.3);
    this.rampStem("zone", zoneLift * 0.42);
    this.rampStem("hit", 0.34 + energy * 0.14);
    const targetBpm = (snapshot.stage?.bpm || STAGES[this.currentStage]?.bpm || 100) + comboLift * 3 + zoneLift * 5;
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

  move() {
    this.note("C6", "32n", 0.06);
  }

  rotate() {
    this.note("G5", "32n", 0.08);
  }

  drop() {
    if (!this.ready || !this.synths) return;
    try {
      this.synths.impact.triggerAttackRelease("C2", "16n", undefined, 0.38);
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
    try {
      this.synths.clear.triggerAttackRelease(chords[lines] || chords[1], "8n", undefined, lines >= 4 ? 0.44 : 0.25);
    } catch {
      // Keep gameplay responsive even if WebAudio rejects a rapid trigger.
    }
  }

  zoneStart() {
    this.rampStem("zone", 0.52);
    this.note("C5", "4n", 0.28);
    setTimeout(() => this.note("G5", "4n", 0.22), 80);
  }

  zoneEnd(lines) {
    if (!this.ready || !this.synths) return;
    try {
      this.rampStem("zone", 0.04);
      this.synths.clear.triggerAttackRelease(["C4", "G4", "C5", "E5", "G5"], "2n", undefined, lines > 0 ? 0.55 : 0.24);
      this.synths.impact.triggerAttackRelease("C2", "4n", undefined, 0.48);
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

  snapshot() {
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
    this.lockFlashes = [];
    this.shockBands = [];
    this.screenBursts = [];
    this.swarm = [];
    this.swarmSprites = [];
    this.sparkSprites = [];
    this.sparkCursor = 0;
    this.particleTextures = null;
    this.particleAtlas = null;
    this.bgStars = [];
    this.stageIndex = 0;
    this.stagePulse = 0;
    this.zonePulse = 0;
    this.beat = 0;
    this.comboPulse = 0;
    this.worldSurge = 0;
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
      dpr: Math.min(window.devicePixelRatio || 1, coarse ? 1.15 : 1.75),
      bgStars: coarse ? (small ? 48 : 82) : 190,
      swarmParticles: coarse ? (small ? 540 : 780) : 1900,
      glowParticles: coarse ? (small ? 112 : 170) : 440,
      maxParticles: coarse ? 230 : 720,
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
    this.bloomLayer = this.makeParticleLayer();
    this.swarmLayer = this.makeParticleLayer();
    this.board = new window.PIXI.Graphics();
    this.fx = new window.PIXI.Graphics();
    this.sparkLayer = this.makeParticleLayer();
    this.flashLayer = new window.PIXI.Graphics();
    this.setAdditive(this.bloomLayer);
    this.setAdditive(this.swarmLayer);
    this.setAdditive(this.sparkLayer);
    this.app.stage.addChild(this.bg, this.bloomLayer, this.swarmLayer, this.board, this.fx, this.sparkLayer, this.flashLayer);
    this.makeParticleTextures();
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
    const allowFilter = !this.quality.coarse && Math.min(window.innerWidth, window.innerHeight) > 1000;
    if (!allowFilter) {
      this.bloomLayer.filters = null;
      this.sparkLayer.filters = null;
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
      this.bloomLayer.filters = [makeBlur(this.quality.coarse ? 2.4 : 3.8, this.quality.coarse ? 3 : 5)];
      this.sparkLayer.filters = [makeBlur(this.quality.coarse ? 0.45 : 0.75, 2)];
    } catch {
      this.bloomLayer.filters = null;
      this.sparkLayer.filters = null;
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
    return { node, isParticle: useParticle, active: false };
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

  makeParticleTextures() {
    const PIXI = window.PIXI;
    const cell = 64;
    const kinds = ["orb", "pin", "flare", "shard"];
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
      const texture = particle.band < 0.2 ? textures.flare : (particle.colorBias > 0.78 ? textures.pin : textures.orb);
      const sprite = this.createParticleNode(this.swarmLayer, texture || textures.orb);
      let glow = null;
      if (index % glowStep === 0) {
        glow = this.createParticleNode(this.bloomLayer, textures.orb);
      }
      return { particle, sprite, glow };
    });
  }

  buildSparkSprites() {
    const PIXI = window.PIXI;
    if (!PIXI || !this.particleTextures) return;
    this.sparkSprites = Array.from({ length: this.quality.maxParticles }, (_, index) => {
      const texture = index % 5 === 0 ? this.particleTextures.shard : (index % 3 === 0 ? this.particleTextures.pin : this.particleTextures.orb);
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

  render(snapshot, dt) {
    if (!this.app || !snapshot) return;
    const layout = this.layout();
    const stage = snapshot.stage || STAGES[0];
    this.drawBackground(layout, stage, dt, snapshot);
    this.drawBoard(layout, snapshot);
    this.drawParticles(layout, dt);
    this.drawFlash(layout, dt);
  }

  drawBackground(layout, stage, dt, snapshot) {
    const g = this.bg;
    const t = performance.now() * 0.001;
    this.beat += dt * 0.001 * (snapshot.zoneActive ? 1.75 : 1);
    this.stagePulse = Math.max(0, this.stagePulse - dt * 0.0016);
    this.zonePulse = snapshot.zoneActive ? Math.min(1, this.zonePulse + dt * 0.0038) : Math.max(0, this.zonePulse - dt * 0.0024);
    this.comboPulse = Math.max(0, this.comboPulse - dt * 0.002);
    this.worldSurge = Math.max(0, this.worldSurge - dt * 0.0015);
    g.clear();
    const maxDim = Math.max(layout.w, layout.h);
    const beatPulse = Math.pow((Math.sin(this.beat * Math.PI * 2) + 1) * 0.5, 5);
    const energy = clamp(0.12 + snapshot.combo * 0.04 + this.zonePulse * 0.54 + this.stagePulse * 0.52 + this.worldSurge * 0.46 + beatPulse * 0.12, 0.1, 1);
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH / 2;

    g.rect(0, 0, layout.w, layout.h).fill({ color: 0x000006, alpha: 0.9 });
    g.rect(0, 0, layout.w, layout.h).fill({ color: stage.bg[0], alpha: 0.42 + this.zonePulse * 0.12 });
    g.circle(cx, cy, maxDim * (0.38 + energy * 0.15))
      .fill({ color: stage.bg[1], alpha: 0.05 + energy * 0.16 });
    g.circle(cx, cy, layout.boardW * (0.78 + energy * 0.16))
      .fill({ color: 0x000000, alpha: 0.28 + energy * 0.18 });
    g.circle(layout.w * 0.12, layout.h * 0.86, maxDim * 0.42)
      .fill({ color: stage.colors[1] || stage.accent, alpha: 0.035 + energy * 0.07 });
    g.circle(layout.w * 0.9, layout.h * 0.08, maxDim * 0.36)
      .fill({ color: stage.accent, alpha: 0.035 + energy * 0.075 });

    const ribbonBands = this.quality.coarse ? 4 : 6;
    const ribbonSegments = this.quality.coarse ? 36 : 64;
    const ribbonPasses = this.quality.coarse ? 1 : 2;
    for (let band = 0; band < ribbonBands; band += 1) {
      const phase = (t * (0.045 + band * 0.008) + band * 0.137 + this.stagePulse * 0.08) % 1;
      const side = band % 2 ? -1 : 1;
      const width = 1.2 + energy * 7 + band * 0.6;
      const alpha = (0.025 + energy * 0.075) * (1 - band * 0.08);
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

    const drift = dt * 0.001;
    for (const star of this.bgStars) {
      star.y += star.speed * drift * (snapshot.zoneActive ? 16 : 5);
      star.x += Math.sin(t * 0.35 + star.phase) * 0.00022;
      if (star.y > 1.04) {
        star.y = -0.02;
        star.x = Math.random();
      }
      const alpha = 0.18 + Math.sin(t * 1.8 + star.phase) * 0.2 + energy * 0.28;
      const size = star.r * (1 + beatPulse * 0.7 + this.zonePulse * 0.6);
      g.circle(star.x * layout.w, star.y * layout.h, size).fill({ color: star.color, alpha: clamp(alpha, 0.05, 0.84) });
    }

    this.drawParticleSwarm(layout, stage, t, energy, snapshot);
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
    const baseAlpha = layout.portrait ? 0.32 : 0.4;
    const zoneBoost = snapshot.zoneActive ? 0.5 : 0;
    const comboBoost = Math.min(0.32, snapshot.combo * 0.048);
    const flowBoost = 1 + this.zonePulse * 0.9 + this.stagePulse * 0.8 + this.worldSurge * 0.65;
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
      const alpha = clamp(baseAlpha * twinkle + energy * 0.36 + zoneBoost + comboBoost + stageAlpha, 0.08, 0.98);
      const size = p.size * (1.12 + energy * 2.55 + this.worldSurge * 1.4 + (snapshot.zoneActive ? 1.75 : 0));
      const spriteScale = Math.max(0.048, size / 14);
      this.showParticleNode(entry.sprite, x, y, color, alpha, spriteScale * (ribbon ? 1.78 : 1.12), rotation);
      if (entry.glow) {
        this.showParticleNode(
          entry.glow,
          x,
          y,
          color,
          alpha * (snapshot.zoneActive ? 0.48 : 0.3),
          spriteScale * (snapshot.zoneActive ? 7.0 : 5.0),
          rotation,
        );
      }
    }
  }

  updateMeteors(layout, stage, dt, energy) {
    const g = this.bg;
    const spawnChance = (this.quality.coarse ? 0.018 : 0.035) + energy * 0.018;
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

    const boardEnergy = clamp(this.zonePulse + this.comboPulse * 0.55 + (snapshot.combo >= 2 ? 0.18 : 0), 0, 1);
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
    g.clear();
    const decay = dt / 16.67;
    this.screenBursts = this.screenBursts.filter((burst) => {
      burst.life -= decay;
      if (burst.life <= 0) return false;
      const alpha = clamp(burst.life / burst.maxLife, 0, 1);
      const growth = 1 - alpha;
      const cx = burst.x ?? (layout.boardX + layout.boardW / 2);
      const cy = burst.y ?? (layout.boardY + layout.boardH / 2);
      const radius = burst.radius * (0.38 + growth * 1.85);
      g.circle(cx, cy, radius)
        .stroke({ color: burst.color, alpha: alpha * burst.alpha, width: burst.width * (0.8 + growth * 2.4) });
      g.circle(cx, cy, radius * 0.62)
        .fill({ color: burst.color, alpha: alpha * burst.alpha * 0.08 });
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
        g.roundRect(x - w / 2, -layout.cell, w, layout.h + layout.cell * 2, w / 2)
          .fill({ color: band.color, alpha: alpha * band.alpha * 0.22 });
      } else {
        const y = band.y + Math.sin(p * Math.PI) * band.sway;
        const h = band.height * (0.4 + p * 2.4);
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
    this.dropTrails = this.dropTrails.filter((trail) => {
      trail.life -= decay;
      if (trail.life <= 0) return false;
      const alpha = clamp(trail.life / trail.maxLife, 0, 1);
      const x = trail.x + Math.sin((1 - alpha) * Math.PI) * trail.sway;
      const top = Math.min(trail.y1, trail.y2);
      const height = Math.abs(trail.y2 - trail.y1);
      const width = trail.width * (0.45 + alpha * 1.2);
      g.roundRect(x - width / 2, top, width, height, width / 2)
        .fill({ color: trail.color, alpha: alpha * 0.2 });
      g.roundRect(x - width * 0.16, top, width * 0.32, height, width * 0.16)
        .fill({ color: 0xffffff, alpha: alpha * 0.58 });
      g.moveTo(x, top);
      g.lineTo(x, top + height);
      g.stroke({ color: 0xffffff, alpha: alpha * 0.68, width: Math.max(1, width * 0.08) });
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
      g.roundRect(tile.x - half - 4, tile.y - half - 4, size + 8, size + 8, Math.max(2, size * 0.08))
        .fill({ color: tile.color, alpha: alpha * 0.18 });
      g.roundRect(tile.x - half, tile.y - half, size, size, Math.max(1.5, size * 0.06))
        .fill({ color: tile.color, alpha: alpha * 0.86 })
        .stroke({ color: 0xffffff, alpha: alpha * 0.56, width: 1 });
      g.moveTo(tile.x - half * 0.62, tile.y + half * 0.62);
      g.lineTo(tile.x + half * 0.62, tile.y - half * 0.62);
      g.stroke({ color: 0xffffff, alpha: alpha * 0.2, width: 1 });
      return true;
    });
    this.beams = this.beams.filter((beam) => {
      beam.life -= decay;
      if (beam.life <= 0) return false;
      const alpha = clamp(beam.life / beam.maxLife, 0, 1);
      if (beam.kind === "vertical") {
        const w = beam.width * (0.7 + alpha * 0.9);
        g.roundRect(beam.x - w / 2, layout.boardY - layout.cell, w, layout.boardH + layout.cell * 2, w / 2)
          .fill({ color: 0xffffff, alpha: 0.16 + alpha * 0.62 });
        g.roundRect(beam.x - w * 0.18, layout.boardY - layout.cell, w * 0.36, layout.boardH + layout.cell * 2, w * 0.18)
          .fill({ color: 0xffffff, alpha: 0.32 + alpha * 0.78 });
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
        this.showParticleNode(p.sprite, p.x, p.y, p.color, alpha * p.alpha, Math.max(0.04, p.size * (0.5 + alpha) / 18), p.rotation);
      } else {
        g.circle(p.x, p.y, p.size * (0.5 + alpha)).fill({ color: p.color, alpha: alpha * p.alpha });
      }
      return true;
    });
  }

  drawFlash(layout, dt) {
    this.flashLayer.clear();
    if (this.flash > 0) {
      this.flashLayer.rect(0, 0, layout.w, layout.h).fill({ color: 0xffffff, alpha: this.flash });
      this.flash = Math.max(0, this.flash - dt * 0.0018);
    }
  }

  lineClear(rows, lines, stage, cells = []) {
    const layout = this.layout();
    const color = stage?.accent || 0x68e9ff;
    this.worldSurge = Math.max(this.worldSurge, 0.62 + lines * 0.2);
    const clearColor = lines >= 4 ? 0xffffff : color;
    const centerY = rows.length
      ? rows.reduce((sum, row) => sum + layout.boardY + row * layout.cell + layout.cell / 2, 0) / rows.length
      : layout.boardY + layout.boardH / 2;
    this.screenBursts.push({
      x: layout.boardX + layout.boardW / 2,
      y: centerY,
      radius: layout.boardW * (lines >= 4 ? 1.8 : 1.15),
      color: clearColor,
      alpha: lines >= 4 ? 0.5 : 0.28,
      width: lines >= 4 ? 4.2 : 2.6,
      life: 38 + lines * 8,
      maxLife: 38 + lines * 8,
    });
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
        height: Math.max(18, layout.cell * (1.15 + lines * 0.2)),
        color: clearColor,
        alpha: lines >= 4 ? 1 : 0.72,
        life: 22 + lines * 6,
        maxLife: 22 + lines * 6,
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
        height: Math.max(22, layout.cell * (1.35 + lines * 0.24)),
        color,
        power: lines,
        life: 30 + lines * 7,
        maxLife: 30 + lines * 7,
      });
      this.beams.push({
        kind: "horizontal",
        y,
        height: Math.max(26, layout.cell * (1.55 + lines * 0.28)),
        color,
        life: 24 + lines * 5,
        maxLife: 24 + lines * 5,
      });
      for (let i = 0; i < Math.min(this.quality.maxParticles / 2, 86 + lines * 28); i += 1) {
        const outward = Math.random() > 0.45 ? (Math.random() > 0.5 ? 1 : -1) : 0;
        this.spawnParticle(
          layout.boardX + Math.random() * layout.boardW,
          y + (Math.random() - 0.5) * layout.cell,
          Math.random() > 0.36 ? color : 0xffffff,
          2.4 + Math.random() * (lines >= 4 ? 6.6 : 4.6),
          outward * (3 + Math.random() * (5 + lines * 1.2)) + (Math.random() - 0.5) * 2.4,
          (Math.random() - 0.5) * (2.5 + lines * 1.1),
          36 + Math.random() * 34 + lines * 4,
          0.9,
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
    }
    this.impactRings.push({
      kind: "clear",
      x: layout.boardX + layout.boardW / 2,
      y: layout.boardY + layout.boardH / 2,
      radius: layout.boardW * (lines >= 4 ? 1.35 : 0.9),
      color: clearColor,
      life: 44 + lines * 5,
      maxLife: 44 + lines * 5,
    });
    this.comboPulse = Math.max(this.comboPulse, 0.75);
    this.flash = Math.max(this.flash, lines >= 4 ? 0.48 : 0.2);
    this.shake = Math.max(this.shake, lines >= 4 ? 20 : 9);
  }

  zoneBurst(lines, stage) {
    const layout = this.layout();
    const color = stage?.accent || 0xffffff;
    const count = Math.min(this.quality.maxParticles, 140 + lines * 28);
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH * 0.56;
    this.worldSurge = 1;
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 3.2 + Math.random() * (10 + lines * 0.36);
      this.spawnParticle(cx, cy, Math.random() > 0.38 ? color : 0xffffff, 2.6 + Math.random() * 7, Math.cos(a) * speed, Math.sin(a) * speed, 52 + Math.random() * 44, 0.95);
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
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH * 0.28;
    for (let i = 0; i < Math.min(this.quality.maxParticles * 0.72, 260); i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1.8 + Math.random() * 7.5;
      const c = Math.random() > 0.35 ? color : (stage?.colors?.[Math.floor(Math.random() * stage.colors.length)] || 0xffffff);
      this.spawnParticle(cx, cy, c, 2.2 + Math.random() * 6.2, Math.cos(a) * speed, Math.sin(a) * speed, 48 + Math.random() * 42, 0.84);
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
    this.shake = Math.max(this.shake, 12);
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
      this.spawnParticle(x, y, Math.random() > 0.5 ? color : 0xffffff, 2.2 + Math.random() * 5.4, (Math.random() - 0.5) * 5, -3 - Math.random() * 8, 54 + Math.random() * 46, 0.9);
    }
  }

  actionPulse(kind, snapshot, amount = 1) {
    if (!this.app || !snapshot?.active) return;
    const layout = this.layout();
    const piece = snapshot.active;
    const color = piece.color || snapshot.stage?.accent || 0xffffff;
    const cx = layout.boardX + (piece.x + piece.matrix[0].length / 2) * layout.cell;
    const cy = layout.boardY + (piece.y + piece.matrix.length / 2) * layout.cell;
    const count = kind === "drop" ? 76 + Math.min(70, amount * 4) : kind === "rotate" ? 28 : 12;
    if (kind === "drop") this.worldSurge = Math.max(this.worldSurge, 0.28);
    for (let i = 0; i < Math.min(count, this.quality.coarse ? 82 : 156); i += 1) {
      const a = kind === "drop"
        ? -Math.PI / 2 + (Math.random() - 0.5) * 0.9
        : Math.random() * Math.PI * 2;
      const speed = kind === "drop" ? 3.8 + Math.random() * 7 : 0.9 + Math.random() * 3.2;
      this.spawnParticle(
        cx + (Math.random() - 0.5) * layout.cell * 1.4,
        cy + (Math.random() - 0.5) * layout.cell * 1.4,
        Math.random() > 0.35 ? color : 0xffffff,
        kind === "drop" ? 2.6 + Math.random() * 5.6 : 1.6 + Math.random() * 3.2,
        Math.cos(a) * speed,
        Math.sin(a) * speed + (kind === "drop" ? 3.6 : 0),
        kind === "drop" ? 38 + Math.random() * 32 : 20 + Math.random() * 20,
        kind === "move" ? 0.48 : 0.74,
      );
    }
    if (kind === "drop") {
      const dropDistance = Math.max(1, amount || 1);
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
            width: Math.max(8, layout.cell * 0.52),
            color,
            sway: (Math.random() - 0.5) * layout.cell * 0.16,
            life: 20 + Math.min(18, dropDistance * 1.2),
            maxLife: 20 + Math.min(18, dropDistance * 1.2),
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
      this.screenBursts.push({
        x: cx,
        y: impactY,
        radius: Math.max(layout.boardW * 0.9, layout.cell * (4 + dropDistance * 0.18)),
        color: 0xffffff,
        alpha: 0.36,
        width: 3.6,
        life: 32 + Math.min(18, dropDistance * 1.1),
        maxLife: 32 + Math.min(18, dropDistance * 1.1),
      });
      this.shockBands.push({
        orientation: "vertical",
        x: cx,
        width: Math.max(layout.cell * 1.4, 18 + dropDistance * 0.45),
        color: 0xffffff,
        alpha: 0.8,
        sway: layout.cell * 0.08,
        life: 24 + Math.min(18, dropDistance),
        maxLife: 24 + Math.min(18, dropDistance),
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
        x: cx,
        width: Math.max(layout.cell * 2.4, 40 + dropDistance * 0.82),
        life: 42,
        maxLife: 42,
      });
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

  spawnParticle(x, y, color, size, vx, vy, life, alpha) {
    while (this.particles.length >= this.quality.maxParticles) {
      const old = this.particles.shift();
      this.hideParticleNode(old?.sprite);
    }
    const sprite = this.acquireSparkSprite();
    const rotation = Math.random() * Math.PI * 2;
    if (sprite) {
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
      },
      onRotate: () => {
        this.audio.rotate();
        this.view.actionPulse("rotate", this.core?.snapshot?.());
      },
      onHardDrop: (distance) => {
        this.audio.drop();
        this.view.actionPulse("drop", this.core?.snapshot?.(), distance);
      },
      onHold: () => {
        this.audio.rotate();
        this.view.actionPulse("rotate", this.core?.snapshot?.());
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
      },
      onZoneEnd: (info) => {
        const stage = STAGES[this.core.stageIndex] || STAGES[0];
        this.audio.zoneEnd(info.lines);
        this.view.zoneBurst(info.lines, stage);
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

  frame(dt) {
    if (this.core.status === "playing") this.core.tick(dt);
    const snapshot = this.core.snapshot();
    this.view.render(snapshot, dt);
    const now = performance.now();
    if (now - this.lastAudioMixAt > 96) {
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
if (new URLSearchParams(window.location.search).has("debug")) {
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
