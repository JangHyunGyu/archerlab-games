(async function () {
  "use strict";

  if (document.readyState === "loading") {
    await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }

  const ASSETS = {
    menu: "assets/ui/menu-bg.png",
    board: "assets/ui/board-surface.png",
  };

  const STORAGE = {
    level: "archerlab-arrows-level",
    bestLevel: "archerlab-arrows-best-level",
    bestMoves: "archerlab-arrows-best-moves",
  };

  const PALETTE = [
    { main: 0x8fefff, glow: 0x24d8ff, hot: 0xe7feff },
    { main: 0xbba0ff, glow: 0x8b65ff, hot: 0xf7f0ff },
    { main: 0xffd36a, glow: 0xffa82d, hot: 0xfff1bd },
    { main: 0x76ffd9, glow: 0x2effb3, hot: 0xe7fff8 },
    { main: 0xff9eb1, glow: 0xff567d, hot: 0xffeef2 },
  ];

  const DIRS = {
    R: { x: 1, y: 0, angle: 0 },
    D: { x: 0, y: 1, angle: Math.PI / 2 },
    L: { x: -1, y: 0, angle: Math.PI },
    U: { x: 0, y: -1, angle: -Math.PI / 2 },
  };
  const DIR_KEYS = Object.keys(DIRS);

  const $ = id => document.getElementById(id);
  const dom = {
    container: $("game-container"),
    menu: $("menu"),
    hud: $("hud"),
    modal: $("complete-modal"),
    toast: $("toast"),
    level: $("level-label"),
    moves: $("moves-label"),
    left: $("left-label"),
    bestLevel: $("best-level-label"),
    bestMoves: $("best-moves-label"),
    clearMoves: $("clear-moves"),
    nextLevel: $("next-level-label"),
    clearTitle: $("clear-title"),
    play: $("play-btn"),
    continue: $("continue-btn"),
    next: $("next-btn"),
    home: $("home-btn"),
    modalMenu: $("modal-menu-btn"),
    retry: $("retry-btn"),
    undo: $("undo-btn"),
    hint: $("hint-btn"),
  };

  const app = new PIXI.Application();
  await app.init({
    resizeTo: dom.container,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    powerPreference: "high-performance",
  });
  dom.container.appendChild(app.canvas);
  app.canvas.addEventListener("contextmenu", event => event.preventDefault());

  let textures = {};
  try {
    textures = await PIXI.Assets.load([ASSETS.menu, ASSETS.board]);
  } catch (error) {
    console.warn("[Arrows] asset load failed; using vector fallback.", error);
  }

  class Random {
    constructor(seed) {
      this.seed = seed >>> 0;
    }
    next() {
      let t = this.seed += 0x6d2b79f5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    }
    chance(value) {
      return this.next() < value;
    }
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }
  }

  class ArrowsGame {
    constructor() {
      this.level = readInt(STORAGE.level, 1);
      this.bestLevel = readInt(STORAGE.bestLevel, 1);
      this.bestMoves = readInt(STORAGE.bestMoves, 0);
      this.moves = 0;
      this.gridW = 10;
      this.gridH = 12;
      this.cell = 42;
      this.boardX = 0;
      this.boardY = 0;
      this.boardW = 0;
      this.boardH = 0;
      this.pieces = [];
      this.history = [];
      this.tweens = [];
      this.mode = "menu";
      this.animating = false;
      this.audio = null;

      this.stage = new PIXI.Container();
      app.stage.addChild(this.stage);

      this.backdrop = new PIXI.Container();
      this.stage.addChild(this.backdrop);

      this.boardLayer = new PIXI.Container();
      this.stage.addChild(this.boardLayer);

      this.surfaceLayer = new PIXI.Container();
      this.boardLayer.addChild(this.surfaceLayer);

      this.gridLayer = new PIXI.Container();
      this.boardLayer.addChild(this.gridLayer);

      this.pieceLayer = new PIXI.Container();
      this.boardLayer.addChild(this.pieceLayer);

      this.fxLayer = new PIXI.Container();
      this.boardLayer.addChild(this.fxLayer);

      this.createBackdrop();
      this.bindUI();
      this.updateMenu();
      this.resize();

      app.ticker.add(ticker => this.update(ticker.deltaMS));
      window.addEventListener("resize", () => this.resize(), { passive: true });
      window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 250), { passive: true });
      document.addEventListener("pointerdown", () => this.ensureAudio(), { once: true, passive: true });
    }

    bindUI() {
      dom.play.addEventListener("click", () => this.start(1));
      dom.continue.addEventListener("click", () => this.start(this.level));
      dom.next.addEventListener("click", () => this.start(this.level + 1));
      dom.home.addEventListener("click", () => this.showMenu());
      dom.modalMenu.addEventListener("click", () => this.showMenu());
      dom.retry.addEventListener("click", () => this.start(this.level));
      dom.undo.addEventListener("click", () => this.undo());
      dom.hint.addEventListener("click", () => this.hint());
    }

    createBackdrop() {
      this.bgSprite = null;
      if (textures[ASSETS.menu]) {
        this.bgSprite = new PIXI.Sprite(textures[ASSETS.menu]);
        this.bgSprite.alpha = 0.34;
        this.backdrop.addChild(this.bgSprite);
      }
      this.bgWash = new PIXI.Graphics();
      this.backdrop.addChild(this.bgWash);
      this.bgSparks = [];
      for (let i = 0; i < 64; i++) {
        const spark = new PIXI.Graphics();
        spark.circle(0, 0, 1 + Math.random() * 1.8).fill({
          color: i % 7 === 0 ? 0xffd36a : 0x78eeff,
          alpha: 0.38 + Math.random() * 0.35,
        });
        spark.baseX = Math.random();
        spark.baseY = Math.random();
        spark.speed = 0.00012 + Math.random() * 0.00022;
        spark.phase = Math.random() * Math.PI * 2;
        this.backdrop.addChild(spark);
        this.bgSparks.push(spark);
      }
    }

    start(level) {
      this.level = Math.max(1, level | 0);
      localStorage.setItem(STORAGE.level, String(this.level));
      this.moves = 0;
      this.history = [];
      this.tweens = [];
      this.mode = "playing";
      this.animating = false;
      dom.menu.classList.add("hidden");
      dom.modal.classList.add("hidden");
      dom.hud.classList.remove("hidden");
      this.boardLayer.visible = true;
      this.generateLevel(this.level);
      this.resize();
      this.renderBoard();
      this.updateHud();
      this.playTone("start");
    }

    showMenu() {
      this.mode = "menu";
      this.animating = false;
      this.tweens = [];
      this.boardLayer.visible = false;
      dom.hud.classList.add("hidden");
      dom.modal.classList.add("hidden");
      dom.menu.classList.remove("hidden");
      this.updateMenu();
    }

    updateMenu() {
      this.bestLevel = Math.max(this.bestLevel, readInt(STORAGE.bestLevel, 1));
      this.bestMoves = readInt(STORAGE.bestMoves, 0);
      dom.bestLevel.textContent = String(this.bestLevel);
      dom.bestMoves.textContent = this.bestMoves > 0 ? String(this.bestMoves) : "-";
      dom.continue.disabled = this.level <= 1 && this.bestLevel <= 1;
    }

    generateLevel(level) {
      const rng = new Random(0x9e3779b9 ^ Math.imul(level, 2654435761));
      this.gridW = Math.min(15, 9 + Math.floor((level - 1) / 3));
      this.gridH = Math.min(17, 11 + Math.floor((level - 1) / 2));
      const target = Math.min(46, 10 + level * 3);
      const pieces = [];
      const maxAttempts = target * 520;

      for (let attempt = 0; attempt < maxAttempts && pieces.length < target; attempt++) {
        const length = rng.int(2, Math.min(7, 3 + Math.floor(level / 3)));
        const shape = makeShape(rng, length);
        const bounds = getBounds(shape);
        if (bounds.w > this.gridW - 1 || bounds.h > this.gridH - 1) continue;

        const x = rng.int(0, this.gridW - bounds.w);
        const y = rng.int(0, this.gridH - bounds.h);
        const cells = shape.map(cell => ({ x: cell.x + x, y: cell.y + y }));
        const candidate = {
          id: `p${level}-${pieces.length}-${attempt}`,
          cells,
          dir: rng.pick(DIR_KEYS),
          colorIndex: (pieces.length + rng.int(0, PALETTE.length - 1)) % PALETTE.length,
        };

        if (!fits(candidate, pieces, this.gridW, this.gridH)) continue;
        if (!this.canEscape(candidate, pieces).ok) continue;
        pieces.push(candidate);
      }

      this.pieces = pieces.map((piece, index) => ({
        ...clonePiece(piece),
        colorIndex: index % PALETTE.length,
        container: null,
      }));

      if (this.pieces.length < 6) {
        this.level += 1;
        this.generateLevel(this.level);
      }
    }

    resize() {
      const width = app.screen.width;
      const height = app.screen.height;

      this.bgWash.clear();
      this.bgWash.rect(0, 0, width, height).fill({ color: 0x030713, alpha: 0.42 });
      this.bgWash.rect(0, 0, width, height).fill({ color: 0x07152a, alpha: 0.18 });

      if (this.bgSprite) {
        coverSprite(this.bgSprite, width, height);
      }

      for (const spark of this.bgSparks) {
        spark.x = spark.baseX * width;
        spark.y = spark.baseY * height;
      }

      const topSafe = width < 620 ? 104 : 124;
      const bottomSafe = width < 620 ? 26 : 34;
      const side = width < 620 ? 18 : 44;
      const availableW = width - side * 2;
      const availableH = height - topSafe - bottomSafe;
      this.cell = Math.max(22, Math.floor(Math.min(availableW / this.gridW, availableH / this.gridH)));
      this.boardW = this.cell * this.gridW;
      this.boardH = this.cell * this.gridH;
      this.boardX = Math.round((width - this.boardW) / 2);
      this.boardY = Math.round(topSafe + (availableH - this.boardH) / 2);
      this.boardLayer.position.set(this.boardX, this.boardY);

      if (this.mode === "playing") {
        this.renderBoard();
      }
    }

    renderBoard() {
      this.surfaceLayer.removeChildren();
      this.gridLayer.removeChildren();
      this.pieceLayer.removeChildren();
      this.fxLayer.removeChildren();

      const pad = Math.round(this.cell * 0.82);
      if (textures[ASSETS.board]) {
        const surface = new PIXI.Sprite(textures[ASSETS.board]);
        surface.x = -pad;
        surface.y = -pad;
        surface.width = this.boardW + pad * 2;
        surface.height = this.boardH + pad * 2;
        surface.alpha = 0.92;
        this.surfaceLayer.addChild(surface);
      } else {
        const fallback = new PIXI.Graphics();
        fallback.roundRect(-pad, -pad, this.boardW + pad * 2, this.boardH + pad * 2, pad * 0.42)
          .fill({ color: 0x091425, alpha: 0.92 });
        this.surfaceLayer.addChild(fallback);
      }

      const frame = new PIXI.Graphics();
      frame.roundRect(-pad * 0.32, -pad * 0.32, this.boardW + pad * 0.64, this.boardH + pad * 0.64, this.cell * 0.38)
        .stroke({ width: Math.max(1.2, this.cell * 0.045), color: 0x89eaff, alpha: 0.22 });
      frame.roundRect(-pad * 0.18, -pad * 0.18, this.boardW + pad * 0.36, this.boardH + pad * 0.36, this.cell * 0.26)
        .stroke({ width: Math.max(1, this.cell * 0.028), color: 0x9c7fff, alpha: 0.14 });
      this.surfaceLayer.addChild(frame);

      const grid = new PIXI.Graphics();
      for (let y = 0; y < this.gridH; y++) {
        for (let x = 0; x < this.gridW; x++) {
          const px = this.cx(x);
          const py = this.cy(y);
          grid.circle(px, py, Math.max(1.1, this.cell * 0.045))
            .fill({ color: 0x9db7cf, alpha: 0.42 });
        }
      }
      this.gridLayer.addChild(grid);

      for (const piece of this.pieces) {
        this.drawPiece(piece);
      }
    }

    drawPiece(piece) {
      const color = PALETTE[piece.colorIndex % PALETTE.length];
      const dir = DIRS[piece.dir];
      const container = new PIXI.Container();
      container.eventMode = "static";
      container.cursor = "pointer";
      container.pieceId = piece.id;
      piece.container = container;

      const bounds = getBounds(piece.cells);
      const hitPad = this.cell * 0.5;
      container.hitArea = new PIXI.Rectangle(
        bounds.minX * this.cell - hitPad,
        bounds.minY * this.cell - hitPad,
        bounds.w * this.cell + hitPad * 2,
        bounds.h * this.cell + hitPad * 2
      );

      const glow = new PIXI.Graphics();
      drawPath(glow, piece.cells, this.cell, color.glow, this.cell * 0.54, 0.18);
      drawPath(glow, piece.cells, this.cell, color.main, this.cell * 0.38, 0.26);
      container.addChild(glow);

      const line = new PIXI.Graphics();
      drawPath(line, piece.cells, this.cell, color.main, this.cell * 0.22, 0.98);
      drawPath(line, piece.cells, this.cell, color.hot, Math.max(2, this.cell * 0.07), 0.72);
      drawArrow(line, piece, this.cell, color.hot, dir);
      drawNodeCaps(line, piece.cells, this.cell, color.hot);
      container.addChild(line);

      container.on("pointerdown", () => this.tapPiece(piece));
      this.pieceLayer.addChild(container);
    }

    tapPiece(piece) {
      if (this.mode !== "playing" || this.animating || !piece || !this.pieces.includes(piece)) return;
      const result = this.canEscape(piece, this.pieces.filter(other => other !== piece));
      if (!result.ok) {
        this.blockPiece(piece, result.blocker);
        return;
      }
      this.removePiece(piece);
    }

    removePiece(piece) {
      this.animating = true;
      this.moves += 1;
      this.history.push(clonePiece(piece));
      this.updateHud();
      this.playTone("clear");

      const dir = DIRS[piece.dir];
      const bounds = getBounds(piece.cells);
      let steps = 0;
      if (piece.dir === "R") steps = this.gridW - bounds.maxX + 2;
      if (piece.dir === "L") steps = bounds.minX + 2;
      if (piece.dir === "D") steps = this.gridH - bounds.maxY + 2;
      if (piece.dir === "U") steps = bounds.minY + 2;
      const endX = dir.x * steps * this.cell;
      const endY = dir.y * steps * this.cell;

      this.spawnTrail(piece, dir);
      this.tweens.push({
        duration: 360,
        elapsed: 0,
        update: dt => {
          const t = clamp(dt / 360, 0, 1);
          const eased = easeOutCubic(t);
          piece.container.x = endX * eased;
          piece.container.y = endY * eased;
          piece.container.alpha = 1 - Math.max(0, (t - 0.55) / 0.45);
          return t >= 1;
        },
        done: () => {
          this.pieceLayer.removeChild(piece.container);
          this.pieces = this.pieces.filter(other => other !== piece);
          this.animating = false;
          this.updateHud();
          if (this.pieces.length === 0) this.completeLevel();
        },
      });
    }

    blockPiece(piece, blocker) {
      this.playTone("blocked");
      this.showToast("막힘");
      const originalX = piece.container.x;
      const originalY = piece.container.y;
      const dir = DIRS[piece.dir];
      this.tweens.push({
        duration: 220,
        elapsed: 0,
        update: dt => {
          const t = clamp(dt / 220, 0, 1);
          const wobble = Math.sin(t * Math.PI * 4) * (1 - t) * this.cell * 0.1;
          piece.container.x = originalX + dir.x * wobble;
          piece.container.y = originalY + dir.y * wobble;
          return t >= 1;
        },
        done: () => {
          piece.container.position.set(originalX, originalY);
        },
      });
      if (blocker) this.spawnBlockPulse(blocker.x, blocker.y);
    }

    undo() {
      if (this.mode !== "playing" || this.animating || this.history.length === 0) return;
      const restored = this.history.pop();
      restored.container = null;
      this.pieces.push(restored);
      this.moves = Math.max(0, this.moves - 1);
      this.renderBoard();
      this.updateHud();
      this.playTone("tap");
    }

    hint() {
      if (this.mode !== "playing" || this.animating) return;
      const piece = this.pieces.find(item => this.canEscape(item, this.pieces.filter(other => other !== item)).ok);
      if (!piece) {
        this.showToast("대기");
        return;
      }
      this.playTone("hint");
      const original = piece.container.scale.x;
      this.tweens.push({
        duration: 900,
        elapsed: 0,
        update: dt => {
          const t = clamp(dt / 900, 0, 1);
          const pulse = 1 + Math.sin(t * Math.PI * 5) * 0.045;
          piece.container.scale.set(original * pulse);
          piece.container.alpha = 0.78 + Math.sin(t * Math.PI * 5) * 0.18;
          return t >= 1;
        },
        done: () => {
          piece.container.scale.set(original);
          piece.container.alpha = 1;
        },
      });
    }

    completeLevel() {
      this.playTone("win");
      this.bestLevel = Math.max(this.bestLevel, this.level + 1);
      localStorage.setItem(STORAGE.bestLevel, String(this.bestLevel));
      localStorage.setItem(STORAGE.level, String(this.level + 1));
      if (this.bestMoves === 0 || this.moves < this.bestMoves) {
        this.bestMoves = this.moves;
        localStorage.setItem(STORAGE.bestMoves, String(this.bestMoves));
      }
      dom.clearTitle.textContent = `레벨 ${this.level} 클리어`;
      dom.clearMoves.textContent = String(this.moves);
      dom.nextLevel.textContent = String(this.level + 1);
      dom.modal.classList.remove("hidden");
    }

    updateHud() {
      dom.level.textContent = String(this.level);
      dom.moves.textContent = String(this.moves);
      dom.left.textContent = String(this.pieces.length);
      dom.undo.disabled = this.history.length === 0;
      dom.hint.disabled = this.pieces.length === 0;
    }

    canEscape(piece, others) {
      const occupied = makeOccupied(others);
      const dir = DIRS[piece.dir];
      for (const cell of piece.cells) {
        let x = cell.x + dir.x;
        let y = cell.y + dir.y;
        while (x >= 0 && x < this.gridW && y >= 0 && y < this.gridH) {
          if (occupied.has(key(x, y))) return { ok: false, blocker: { x, y } };
          x += dir.x;
          y += dir.y;
        }
      }
      return { ok: true, blocker: null };
    }

    spawnTrail(piece, dir) {
      const color = PALETTE[piece.colorIndex % PALETTE.length];
      const bounds = getBounds(piece.cells);
      const x = this.cx((bounds.minX + bounds.maxX) / 2);
      const y = this.cy((bounds.minY + bounds.maxY) / 2);
      for (let i = 0; i < 16; i++) {
        const g = new PIXI.Graphics();
        const size = Math.max(2, this.cell * (0.04 + Math.random() * 0.06));
        g.roundRect(-size / 2, -size / 2, size, size, size * 0.3).fill({ color: color.main, alpha: 0.9 });
        g.x = x - dir.x * this.cell * Math.random() * 0.8 + (Math.random() - 0.5) * this.cell * 0.7;
        g.y = y - dir.y * this.cell * Math.random() * 0.8 + (Math.random() - 0.5) * this.cell * 0.7;
        this.fxLayer.addChild(g);
        this.tweens.push({
          duration: 430 + Math.random() * 220,
          elapsed: 0,
          update: dt => {
            const t = clamp(dt / 620, 0, 1);
            g.x -= dir.x * this.cell * 1.1 * t;
            g.y -= dir.y * this.cell * 1.1 * t;
            g.alpha = 1 - t;
            return t >= 1;
          },
          done: () => this.fxLayer.removeChild(g),
        });
      }
    }

    spawnBlockPulse(x, y) {
      const ring = new PIXI.Graphics();
      ring.x = this.cx(x);
      ring.y = this.cy(y);
      this.fxLayer.addChild(ring);
      this.tweens.push({
        duration: 360,
        elapsed: 0,
        update: dt => {
          const t = clamp(dt / 360, 0, 1);
          ring.clear();
          ring.circle(0, 0, this.cell * (0.18 + t * 0.5))
            .stroke({ width: Math.max(1.5, this.cell * 0.045) * (1 - t), color: 0xffd36a, alpha: 0.8 * (1 - t) });
          return t >= 1;
        },
        done: () => this.fxLayer.removeChild(ring),
      });
    }

    showToast(text) {
      dom.toast.textContent = text;
      dom.toast.classList.remove("hidden");
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => dom.toast.classList.add("hidden"), 620);
    }

    update(deltaMS) {
      const now = performance.now();
      for (const spark of this.bgSparks) {
        spark.alpha = 0.28 + Math.sin(now * spark.speed + spark.phase) * 0.18;
        spark.y += Math.sin(now * spark.speed + spark.phase) * 0.018;
      }

      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const tween = this.tweens[i];
        tween.elapsed += deltaMS;
        if (tween.update(tween.elapsed, deltaMS)) {
          this.tweens.splice(i, 1);
          if (tween.done) tween.done();
        }
      }
    }

    ensureAudio() {
      if (this.audio) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.audio = new AudioCtx();
    }

    playTone(type) {
      if (!this.audio) return;
      const ctx = this.audio;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(type === "blocked" ? 0.05 : 0.075, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === "win" ? 0.42 : 0.18));

      const notes = {
        start: [392, 523],
        clear: [660, 880],
        blocked: [180, 135],
        hint: [740, 988],
        tap: [420],
        win: [523, 659, 784, 1047],
      }[type] || [480];

      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        osc.type = type === "blocked" ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, now + index * 0.055);
        osc.connect(gain);
        osc.start(now + index * 0.055);
        osc.stop(now + index * 0.055 + 0.16);
      });
    }

    cx(x) {
      return (x + 0.5) * this.cell;
    }

    cy(y) {
      return (y + 0.5) * this.cell;
    }
  }

  function makeShape(rng, length) {
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    const cells = [{ x: 0, y: 0 }];
    let heading = rng.pick(dirs);
    for (let i = 1; i < length; i++) {
      const choices = rng.shuffle([
        heading,
        { x: -heading.y, y: heading.x },
        { x: heading.y, y: -heading.x },
        rng.pick(dirs),
      ]);
      let placed = false;
      for (const choice of choices) {
        const last = cells[cells.length - 1];
        const next = { x: last.x + choice.x, y: last.y + choice.y };
        if (cells.some(cell => cell.x === next.x && cell.y === next.y)) continue;
        cells.push(next);
        heading = choice;
        placed = true;
        break;
      }
      if (!placed) break;
    }
    const bounds = getBounds(cells);
    return cells.map(cell => ({ x: cell.x - bounds.minX, y: cell.y - bounds.minY }));
  }

  function drawPath(graphics, cells, cellSize, color, width, alpha) {
    if (!cells.length) return;
    graphics.moveTo((cells[0].x + 0.5) * cellSize, (cells[0].y + 0.5) * cellSize);
    for (let i = 1; i < cells.length; i++) {
      graphics.lineTo((cells[i].x + 0.5) * cellSize, (cells[i].y + 0.5) * cellSize);
    }
    graphics.stroke({ width, color, alpha, cap: "round", join: "round" });
  }

  function drawArrow(graphics, piece, cellSize, color, dir) {
    const front = getFrontCell(piece.cells, piece.dir);
    const cx = (front.x + 0.5) * cellSize;
    const cy = (front.y + 0.5) * cellSize;
    const size = cellSize * 0.28;
    const len = cellSize * 0.38;
    const points = [
      { x: len * 0.58, y: 0 },
      { x: -len * 0.34, y: -size * 0.72 },
      { x: -len * 0.12, y: 0 },
      { x: -len * 0.34, y: size * 0.72 },
    ].map(point => rotate(point, dir.angle));
    graphics.poly(points.map(point => [cx + point.x, cy + point.y]).flat())
      .fill({ color, alpha: 0.98 });
  }

  function drawNodeCaps(graphics, cells, cellSize, color) {
    if (!cells.length) return;
    const endpoints = [cells[0], cells[cells.length - 1]];
    for (const cell of endpoints) {
      graphics.circle((cell.x + 0.5) * cellSize, (cell.y + 0.5) * cellSize, Math.max(2, cellSize * 0.075))
        .fill({ color, alpha: 0.92 });
    }
  }

  function getFrontCell(cells, dir) {
    const score = cell => {
      if (dir === "R") return cell.x;
      if (dir === "L") return -cell.x;
      if (dir === "D") return cell.y;
      return -cell.y;
    };
    return cells.reduce((best, cell) => score(cell) > score(best) ? cell : best, cells[0]);
  }

  function rotate(point, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos,
    };
  }

  function fits(piece, pieces, gridW, gridH) {
    const occupied = makeOccupied(pieces);
    for (const cell of piece.cells) {
      if (cell.x < 0 || cell.x >= gridW || cell.y < 0 || cell.y >= gridH) return false;
      if (occupied.has(key(cell.x, cell.y))) return false;
    }
    return true;
  }

  function makeOccupied(pieces) {
    const occupied = new Set();
    for (const piece of pieces) {
      for (const cell of piece.cells) occupied.add(key(cell.x, cell.y));
    }
    return occupied;
  }

  function getBounds(cells) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const cell of cells) {
      minX = Math.min(minX, cell.x);
      minY = Math.min(minY, cell.y);
      maxX = Math.max(maxX, cell.x);
      maxY = Math.max(maxY, cell.y);
    }
    return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function clonePiece(piece) {
    return {
      id: piece.id,
      dir: piece.dir,
      colorIndex: piece.colorIndex,
      cells: piece.cells.map(cell => ({ x: cell.x, y: cell.y })),
      container: null,
    };
  }

  function key(x, y) {
    return `${x},${y}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
  }

  function readInt(name, fallback) {
    const value = parseInt(localStorage.getItem(name) || "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function coverSprite(sprite, width, height) {
    const texture = sprite.texture;
    const sourceW = texture.width || 1;
    const sourceH = texture.height || 1;
    const scale = Math.max(width / sourceW, height / sourceH);
    sprite.width = sourceW * scale;
    sprite.height = sourceH * scale;
    sprite.x = (width - sprite.width) / 2;
    sprite.y = (height - sprite.height) / 2;
  }

  window.__arrowsGame = new ArrowsGame();
})();
