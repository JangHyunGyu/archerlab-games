const GAME_ID = "lumen-shift";
const RANK_API_BASE = "https://game-api.yama5993.workers.dev";
const COLS = 10;
const ROWS = 20;
const VISIBLE_NEXT = 5;
const SCORE_TABLE = [0, 100, 300, 500, 800];
const STORAGE_PREFIX = "lumen-shift";

const STAGES = [
  {
    name: "Deep Bloom",
    colors: [0x68e9ff, 0x7cffb0, 0xc9f7ff],
    bg: [0x070913, 0x09243a],
    accent: 0x68e9ff,
    bpm: 88,
  },
  {
    name: "Neon Pulse",
    colors: [0xff5bd4, 0x68e9ff, 0x8d6cff],
    bg: [0x090719, 0x221145],
    accent: 0xff5bd4,
    bpm: 104,
  },
  {
    name: "Solar Glass",
    colors: [0xffd36e, 0xffffff, 0x68e9ff],
    bg: [0x100c10, 0x3b2610],
    accent: 0xffd36e,
    bpm: 112,
  },
  {
    name: "Abyss Signal",
    colors: [0x8d6cff, 0x2dd9ff, 0xff5d73],
    bg: [0x050813, 0x10123d],
    accent: 0x8d6cff,
    bpm: 118,
  },
  {
    name: "Lumen Core",
    colors: [0xffffff, 0xff5bd4, 0xffd36e, 0x68e9ff],
    bg: [0x08070f, 0x251036],
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
  }

  async unlock() {
    if (this.ready || !window.Tone) return;
    try {
      await window.Tone.start();
      const Tone = window.Tone;
      const master = new Tone.Gain(0.74).toDestination();
      const delay = new Tone.FeedbackDelay("8n", 0.22).connect(master);
      const reverb = new Tone.Reverb({ decay: 3.2, wet: 0.28 }).connect(master);
      const pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.08, decay: 0.2, sustain: 0.42, release: 1.4 },
      }).connect(reverb);
      const pluck = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.08, sustain: 0.08, release: 0.16 },
      }).connect(delay);
      const bass = new Tone.MembraneSynth({
        pitchDecay: 0.015,
        octaves: 5,
        envelope: { attack: 0.001, decay: 0.25, sustain: 0.02, release: 0.2 },
      }).connect(master);
      const clear = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 2, spread: 18 },
        envelope: { attack: 0.01, decay: 0.18, sustain: 0.18, release: 0.42 },
      }).connect(reverb);
      this.synths = { pad, pluck, bass, clear };
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
    let step = 0;
    this.loop = new Tone.Loop((time) => {
      if (!this.synths) return;
      const chord = chords[step % chords.length];
      this.synths.pad.triggerAttackRelease(chord, "2n", time, 0.16);
      if (step % 2 === 0) this.synths.bass.triggerAttackRelease(chord[0], "8n", time, 0.22);
      step += 1;
    }, "1m");
    this.loop.start(0);
    Tone.Transport.bpm.value = STAGES[0].bpm;
    Tone.Transport.start();
    this.started = true;
  }

  setStage(index) {
    if (!window.Tone) return;
    this.currentStage = index;
    try {
      window.Tone.Transport.bpm.rampTo(STAGES[index]?.bpm || 100, 0.8);
    } catch {
      window.Tone.Transport.bpm.value = STAGES[index]?.bpm || 100;
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
      this.synths.bass.triggerAttackRelease("C2", "16n", undefined, 0.38);
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
    this.note("C5", "4n", 0.28);
    setTimeout(() => this.note("G5", "4n", 0.22), 80);
  }

  zoneEnd(lines) {
    if (!this.ready || !this.synths) return;
    try {
      this.synths.clear.triggerAttackRelease(["C4", "G4", "C5", "E5", "G5"], "2n", undefined, lines > 0 ? 0.55 : 0.24);
      this.synths.bass.triggerAttackRelease("C2", "4n", undefined, 0.48);
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
    this.dropTimer += dt;
    const interval = this.dropInterval();
    if (Number.isFinite(interval) && this.dropTimer >= interval) {
      this.dropTimer = 0;
      this.stepDown();
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
      if (manual) this.callbacks.onMove?.();
      return true;
    }
    this.lock();
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
      }
    }
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
    this.bgStars = [];
    this.stageIndex = 0;
    this.stagePulse = 0;
    this.zonePulse = 0;
    this.beat = 0;
    this.comboPulse = 0;
    this.flash = 0;
    this.shake = 0;
    this.lastLayoutKey = "";
  }

  detectQuality() {
    const coarse = matchMedia("(pointer: coarse)").matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 420;
    return {
      coarse,
      dpr: Math.min(window.devicePixelRatio || 1, coarse ? 1.35 : 1.75),
      bgStars: coarse ? (small ? 70 : 110) : 190,
      maxParticles: coarse ? 190 : 560,
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
    this.board = new window.PIXI.Graphics();
    this.fx = new window.PIXI.Graphics();
    this.flashLayer = new window.PIXI.Graphics();
    this.app.stage.addChild(this.bg, this.board, this.fx, this.flashLayer);
    this.seedStars();

    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS || 16.67;
      onFrame(dt);
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
    g.clear();
    const maxDim = Math.max(layout.w, layout.h);
    const beatPulse = Math.pow((Math.sin(this.beat * Math.PI * 2) + 1) * 0.5, 5);
    const energy = clamp(0.16 + snapshot.combo * 0.035 + this.zonePulse * 0.48 + this.stagePulse * 0.42 + beatPulse * 0.08, 0.12, 0.88);
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH / 2;

    g.rect(0, 0, layout.w, layout.h).fill({ color: stage.bg[0], alpha: 0.58 + this.zonePulse * 0.16 });
    g.circle(cx, cy, maxDim * (0.38 + energy * 0.18))
      .fill({ color: stage.bg[1], alpha: 0.08 + energy * 0.22 });
    g.circle(layout.w * 0.24, layout.h * 0.84, maxDim * 0.34)
      .fill({ color: stage.colors[1] || stage.accent, alpha: 0.07 + energy * 0.05 });
    g.circle(layout.w * 0.86, layout.h * 0.16, maxDim * 0.28)
      .fill({ color: stage.accent, alpha: 0.06 + energy * 0.06 });

    for (let i = 0; i < 7; i += 1) {
      const phase = (this.beat * 0.22 + i / 7) % 1;
      const radius = layout.boardW * (0.68 + phase * 2.35);
      const alpha = (1 - phase) * (0.045 + energy * 0.07);
      g.circle(cx, cy, radius)
        .stroke({ color: i % 2 ? stage.accent : 0xffffff, alpha, width: 1 + energy * 2 });
    }

    const waveCount = layout.portrait ? 6 : 9;
    for (let i = 0; i < waveCount; i += 1) {
      const y = layout.h * (0.16 + i / (waveCount + 0.5) * 0.68);
      const amp = 8 + energy * 24 + i * 0.8;
      const step = Math.max(18, layout.w / 24);
      g.moveTo(-20, y);
      for (let x = -20; x <= layout.w + 24; x += step) {
        const yy = y + Math.sin(x * 0.012 + t * (0.9 + i * 0.05) + i) * amp;
        g.lineTo(x, yy);
      }
      g.stroke({ color: stage.colors[i % stage.colors.length] || stage.accent, alpha: 0.035 + energy * 0.07, width: 1 + energy * 1.2 });
    }

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
    g.roundRect(bx - 10, by - 10, layout.boardW + 20, layout.boardH + 20, 16)
      .fill({ color: 0x02050d, alpha: 0.68 })
      .stroke({ color: stage.accent, alpha: 0.25 + boardEnergy * 0.48, width: 1.5 + boardEnergy * 2.5 });
    g.roundRect(bx - 20, by - 20, layout.boardW + 40, layout.boardH + 40, 22)
      .stroke({ color: stage.accent, alpha: 0.04 + boardEnergy * 0.14, width: 6 + boardEnergy * 8 });
    g.roundRect(bx - 4, by - 4, layout.boardW + 8, layout.boardH + 8, 10)
      .stroke({ color: 0xffffff, alpha: 0.12, width: 1 });

    const scanY = by + ((performance.now() * 0.035) % layout.boardH);
    g.rect(bx + 2, scanY, layout.boardW - 4, 2 + boardEnergy * 3)
      .fill({ color: stage.accent, alpha: 0.035 + boardEnergy * 0.08 });

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const px = bx + x * cell;
        const py = by + y * cell;
        g.rect(px + 1, py + 1, cell - 2, cell - 2)
          .fill({ color: 0xffffff, alpha: 0.026 });
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
          g.roundRect(px + cell * 0.18, py + cell * 0.18, cell * 0.64, cell * 0.64, Math.max(3, cell * 0.12))
            .stroke({ color: piece.color, alpha, width: 2 });
        } else {
          this.drawBlock(g, px, py, cell, piece.color, alpha, true);
        }
      }
    }
  }

  drawBlock(g, x, y, size, color, alpha, hot) {
    const gap = Math.max(1.5, size * 0.08);
    const radius = Math.max(3, size * 0.14);
    const glow = hot ? 0.34 : 0.14;
    if (hot) {
      g.roundRect(x + gap - 2, y + gap - 2, size - gap * 2 + 4, size - gap * 2 + 4, radius + 2)
        .fill({ color, alpha: alpha * 0.28 });
      g.roundRect(x + gap - 5, y + gap - 5, size - gap * 2 + 10, size - gap * 2 + 10, radius + 6)
        .stroke({ color, alpha: alpha * 0.22, width: Math.max(2, size * 0.1) });
    }
    g.roundRect(x + gap, y + gap, size - gap * 2, size - gap * 2, radius)
      .fill({ color, alpha })
      .stroke({ color: 0xffffff, alpha: 0.35, width: 1 });
    g.roundRect(x + gap * 1.45, y + gap * 1.45, size - gap * 2.9, size - gap * 2.9, radius * 0.72)
      .stroke({ color: 0xffffff, alpha: alpha * glow, width: 1 });
    g.rect(x + gap * 1.6, y + gap * 1.6, size - gap * 3.2, Math.max(2, size * 0.18))
      .fill({ color: 0xffffff, alpha: alpha * 0.31 });
    g.circle(x + size * 0.72, y + size * 0.72, Math.max(1.2, size * 0.08))
      .fill({ color: 0xffffff, alpha: alpha * 0.26 });
  }

  drawMiniPanel(g, panel, label, types, stage) {
    if (!panel || panel.y < 0) return;
    g.roundRect(panel.x, panel.y, panel.w, panel.h, 10)
      .fill({ color: 0x02050d, alpha: 0.56 })
      .stroke({ color: stage.accent, alpha: 0.2, width: 1 });
    this.drawTinyText(g, label, panel.x + 8, panel.y + 7, 0xffffff, 0.48);
    const max = panel.h > 80 ? Math.min(3, types.length) : Math.min(1, types.length);
    for (let i = 0; i < max; i += 1) {
      const type = types[i];
      if (!type) continue;
      const matrix = PIECES[type].matrix;
      const color = PIECES[type].color;
      const scale = Math.min((panel.w - 24) / matrix[0].length, (panel.h / max - 22) / matrix.length, 17);
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

  drawParticles(layout, dt) {
    const g = this.fx;
    g.clear();
    const decay = dt / 16.67;
    this.clearWaves = this.clearWaves.filter((wave) => {
      wave.life -= decay;
      wave.x += wave.speed * decay;
      if (wave.life <= 0) return false;
      const alpha = clamp(wave.life / wave.maxLife, 0, 1);
      const width = wave.width * (1.1 - alpha * 0.25);
      g.roundRect(wave.x - width * 0.5, wave.y - wave.height * 0.5, width, wave.height, wave.height * 0.5)
        .fill({ color: wave.color, alpha: 0.08 + alpha * 0.28 });
      g.roundRect(wave.x - width * 0.44, wave.y - wave.height * 0.18, width * 0.88, wave.height * 0.36, wave.height * 0.18)
        .fill({ color: 0xffffff, alpha: 0.08 + alpha * 0.24 });
      g.moveTo(wave.x - width * 0.5, wave.y);
      g.lineTo(wave.x + width * 0.5, wave.y);
      g.stroke({ color: 0xffffff, alpha: 0.16 + alpha * 0.52, width: 1.5 + wave.power });
      return true;
    });
    this.particles = this.particles.filter((p) => {
      p.life -= decay;
      p.x += p.vx * decay;
      p.y += p.vy * decay;
      p.vy += p.gravity * decay;
      if (p.life <= 0) return false;
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      g.circle(p.x, p.y, p.size * (0.5 + alpha)).fill({ color: p.color, alpha: alpha * p.alpha });
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

  lineClear(rows, lines, stage) {
    const layout = this.layout();
    const color = stage?.accent || 0x68e9ff;
    rows.forEach((row) => {
      const y = layout.boardY + row * layout.cell + layout.cell / 2;
      this.clearWaves.push({
        x: layout.boardX + layout.boardW / 2,
        y,
        speed: (Math.random() > 0.5 ? 1 : -1) * (1.4 + lines * 0.6),
        width: layout.w * (lines >= 4 ? 1.55 : 1.18),
        height: Math.max(18, layout.cell * (1.2 + lines * 0.18)),
        color,
        power: lines,
        life: 22 + lines * 5,
        maxLife: 22 + lines * 5,
      });
      for (let i = 0; i < Math.min(this.quality.maxParticles / 4, 54 + lines * 12); i += 1) {
        this.spawnParticle(
          layout.boardX + Math.random() * layout.boardW,
          y + (Math.random() - 0.5) * layout.cell,
          color,
          2.2 + Math.random() * 3.5,
          (Math.random() - 0.5) * (4 + lines),
          (Math.random() - 0.5) * (2 + lines * 0.8),
          28 + Math.random() * 24,
          0.86,
        );
      }
    });
    this.comboPulse = Math.max(this.comboPulse, 0.75);
    this.flash = Math.max(this.flash, lines >= 4 ? 0.28 : 0.12);
    this.shake = Math.max(this.shake, lines >= 4 ? 14 : 6);
  }

  zoneBurst(lines, stage) {
    const layout = this.layout();
    const color = stage?.accent || 0xffffff;
    const count = Math.min(this.quality.maxParticles, 140 + lines * 28);
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH * 0.56;
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * (8 + lines * 0.25);
      this.spawnParticle(cx, cy, Math.random() > 0.45 ? color : 0xffffff, 2 + Math.random() * 5, Math.cos(a) * speed, Math.sin(a) * speed, 42 + Math.random() * 38, 0.9);
    }
    for (let i = 0; i < 5; i += 1) {
      this.clearWaves.push({
        x: cx,
        y: cy + (i - 2) * layout.cell * 0.7,
        speed: (i % 2 ? 1 : -1) * (2.4 + i * 0.25),
        width: layout.w * 1.75,
        height: Math.max(30, layout.cell * 2.1),
        color: i % 2 ? color : 0xffffff,
        power: 4,
        life: 42 + i * 4,
        maxLife: 42 + i * 4,
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
    this.flash = Math.max(this.flash, 0.16);
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH * 0.28;
    for (let i = 0; i < Math.min(this.quality.maxParticles * 0.5, 130); i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 5;
      const c = Math.random() > 0.35 ? color : (stage?.colors?.[Math.floor(Math.random() * stage.colors.length)] || 0xffffff);
      this.spawnParticle(cx, cy, c, 1.8 + Math.random() * 4.6, Math.cos(a) * speed, Math.sin(a) * speed, 38 + Math.random() * 34, 0.75);
    }
  }

  zoneIgnite(stage) {
    if (!this.app) return;
    const layout = this.layout();
    const color = stage?.accent || 0xffffff;
    this.zonePulse = 1;
    this.flash = Math.max(this.flash, 0.24);
    this.shake = Math.max(this.shake, 8);
    for (let i = 0; i < Math.min(this.quality.maxParticles * 0.5, 120); i += 1) {
      const x = layout.boardX + Math.random() * layout.boardW;
      const y = layout.boardY + layout.boardH + Math.random() * 20;
      this.spawnParticle(x, y, Math.random() > 0.5 ? color : 0xffffff, 2 + Math.random() * 4, (Math.random() - 0.5) * 4, -2 - Math.random() * 6, 45 + Math.random() * 42, 0.82);
    }
  }

  actionPulse(kind, snapshot, amount = 1) {
    if (!this.app || !snapshot?.active) return;
    const layout = this.layout();
    const piece = snapshot.active;
    const color = piece.color || snapshot.stage?.accent || 0xffffff;
    const cx = layout.boardX + (piece.x + piece.matrix[0].length / 2) * layout.cell;
    const cy = layout.boardY + (piece.y + piece.matrix.length / 2) * layout.cell;
    const count = kind === "drop" ? 42 : kind === "rotate" ? 18 : 10;
    for (let i = 0; i < Math.min(count, this.quality.coarse ? 34 : 60); i += 1) {
      const a = kind === "drop"
        ? -Math.PI / 2 + (Math.random() - 0.5) * 0.9
        : Math.random() * Math.PI * 2;
      const speed = kind === "drop" ? 3 + Math.random() * 5 : 0.8 + Math.random() * 2.8;
      this.spawnParticle(
        cx + (Math.random() - 0.5) * layout.cell * 1.4,
        cy + (Math.random() - 0.5) * layout.cell * 1.4,
        Math.random() > 0.35 ? color : 0xffffff,
        kind === "drop" ? 2.2 + Math.random() * 4.5 : 1.5 + Math.random() * 3,
        Math.cos(a) * speed,
        Math.sin(a) * speed + (kind === "drop" ? 2.8 : 0),
        kind === "drop" ? 30 + Math.random() * 26 : 18 + Math.random() * 18,
        kind === "move" ? 0.45 : 0.68,
      );
    }
    if (kind === "drop") {
      this.clearWaves.push({
        x: cx,
        y: layout.boardY + layout.boardH - layout.cell * 0.6,
        speed: 0,
        width: Math.max(layout.boardW * 0.5, layout.cell * (2 + amount * 0.15)),
        height: Math.max(22, layout.cell * 1.35),
        color,
        power: 2,
        life: 20,
        maxLife: 20,
      });
      this.shake = Math.max(this.shake, 4);
    }
    if (kind === "rotate") this.comboPulse = Math.max(this.comboPulse, 0.22);
  }

  spawnParticle(x, y, color, size, vx, vy, life, alpha) {
    if (this.particles.length > this.quality.maxParticles) this.particles.splice(0, this.particles.length - this.quality.maxParticles);
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
    });
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
      this.dispatch(action);
    }, { passive: false });

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
      this.repeatTimer = window.setInterval(() => this.dispatch(this.repeatAction), action === "down" ? 42 : 62);
    }, 145);
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
      onStage: (index, stage) => {
        this.audio.setStage(index);
        this.view.stageShift(stage);
        this.showStageSplash(stage.name);
      },
      onClear: (info) => {
        const stage = STAGES[this.core.stageIndex] || STAGES[0];
        this.audio.clear(info.lines);
        this.view.lineClear(info.rows, info.lines, stage);
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
    this.elements.score.textContent = formatScore(snapshot.score);
    this.elements.lines.textContent = snapshot.lines;
    this.elements.level.textContent = snapshot.level;
    this.elements.combo.textContent = snapshot.combo;
    this.elements.stage.textContent = snapshot.stage?.name || "Deep Bloom";
    const lumenValue = snapshot.zoneActive ? snapshot.zoneProgress : snapshot.lumen;
    this.elements.lumenFill.style.width = `${clamp(lumenValue, 0, 1) * 100}%`;
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
app.init().catch((err) => {
  console.error(err);
  const label = document.getElementById("event-label");
  if (label) {
    label.textContent = "Renderer failed";
    label.style.opacity = "1";
  }
});
