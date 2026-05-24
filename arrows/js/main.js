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

  const RANK_API_BASE = "https://game-api.yama5993.workers.dev";
  const GAME_ID = "arrows";
  const RANK_LIMIT = 20;
  const NICK_KEY = "archerlab-arrows-nick";
  const DIFFICULTY_CAP_LEVEL = 100;
  const MAP_SIZE_CAP_LEVEL = 1000;

  const PALETTE = [
    { main: 0xd7e2f1, glow: 0x1b2230, hot: 0x10141d },
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
    loading: $("loading-screen"),
    modal: $("complete-modal"),
    toast: $("toast"),
    level: $("level-label"),
    moves: $("moves-label"),
    left: $("left-label"),
    bestLevel: $("best-level-label"),
    bestMoves: $("best-moves-label"),
    clearMoves: $("clear-moves"),
    nextLevel: $("next-level-label"),
    loadingLevel: $("loading-level-label"),
    clearLevel: $("clear-level"),
    clearTitle: $("clear-title"),
    play: $("play-btn"),
    continue: $("continue-btn"),
    rank: $("rank-btn"),
    next: $("next-btn"),
    home: $("home-btn"),
    modalMenu: $("modal-menu-btn"),
    modalRank: $("modal-rank-btn"),
    rankModal: $("rank-modal"),
    rankContent: $("rank-content"),
    rankClose: $("rank-close-btn"),
    rankSubmitRow: $("rank-submit-row"),
    nickname: $("nickname-input"),
    submitRank: $("submit-rank-btn"),
    skipRank: $("skip-rank-btn"),
    submitStatus: $("submit-status"),
  };

  const app = new PIXI.Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
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
      this.initialPieceCount = 0;
      this.lastClear = null;
      this.levelSeed = 0;
      this.startToken = 0;
      this.sound = new (window.ArrowsSoundManager || class {
        ensure() {}
        play() {}
      })();

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
      dom.modalRank.addEventListener("click", () => this.openRankModal());
      dom.rank.addEventListener("click", () => this.openRankModal());
      dom.rankClose.addEventListener("click", () => {
        this.playTone("button");
        dom.rankModal.classList.add("hidden");
      });
      dom.submitRank.addEventListener("click", () => this.handleSubmitRank());
      dom.skipRank.addEventListener("click", () => this.handleSkipRank());
      dom.nickname.addEventListener("keydown", event => {
        if (event.key === "Enter") this.handleSubmitRank();
      });
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

    async start(level) {
      if (this.mode === "loading") return;
      const token = ++this.startToken;
      this.level = Math.max(1, level | 0);
      localStorage.setItem(STORAGE.level, String(this.level));
      this.moves = 0;
      this.history = [];
      this.tweens = [];
      this.mode = "loading";
      this.animating = false;
      dom.menu.classList.add("hidden");
      dom.modal.classList.add("hidden");
      dom.rankModal.classList.add("hidden");
      dom.hud.classList.add("hidden");
      this.boardLayer.visible = false;
      this.showLoading(this.level);
      await nextFrame();
      await waitMs(30);
      const ready = await this.generateLevel(this.level, token);
      if (!ready || token !== this.startToken) return;
      this.hideLoading();
      this.mode = "playing";
      dom.hud.classList.remove("hidden");
      this.boardLayer.visible = true;
      this.resize();
      this.renderBoard();
      this.updateHud();
      this.playTone("start");
    }

    showMenu() {
      this.startToken += 1;
      this.mode = "menu";
      this.animating = false;
      this.tweens = [];
      this.boardLayer.visible = false;
      this.hideLoading();
      dom.hud.classList.add("hidden");
      dom.modal.classList.add("hidden");
      dom.rankModal.classList.add("hidden");
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

    async generateLevel(level, token) {
      this.levelSeed = createLevelSeed(level);
      const template = createTemplateLevel(level);
      if (template) {
        this.gridW = template.gridW;
        this.gridH = template.gridH;
        this.pieces = template.pieces.map((piece, index) => ({
          ...clonePiece(piece),
          id: `t${level}-${index}`,
          colorIndex: 0,
          container: null,
        }));
        this.initialPieceCount = this.pieces.length;
        return true;
      }

      const rng = new Random(this.levelSeed);
      const config = getLevelConfig(level);
      this.gridW = config.gridW;
      this.gridH = config.gridH;
      const target = config.target;
      const minPieces = config.minPieces;
      const targetCells = Math.max(1, config.targetCells - config.targetSlack);
      const minTargetCells = Math.floor(targetCells * config.minFillCompletion);
      const softTargetCells = Math.floor(targetCells * config.softFillCompletion);
      const budgetTargetCells = Math.floor(targetCells * config.budgetFillCompletion);
      const pieces = [];
      let occupiedCells = 0;
      let missesSincePlace = 0;
      const maxAttempts = target * config.attemptsPerPiece;
      const generationStartedAt = performance.now();
      const isOverBudget = () => (
        pieces.length >= minPieces &&
        occupiedCells >= budgetTargetCells &&
        performance.now() - generationStartedAt > config.generationBudgetMs
      );
      const shouldStopAfterMiss = () => {
        if (isOverBudget()) return true;
        if (occupiedCells >= minTargetCells) return missesSincePlace > config.completedStallLimit;
        return occupiedCells >= softTargetCells && missesSincePlace > config.stallLimit;
      };

      for (let attempt = 0; attempt < maxAttempts && pieces.length < target && (occupiedCells < targetCells || pieces.length < minPieces); attempt++) {
        if (isOverBudget()) break;
        if (attempt > 0 && attempt % config.yieldEvery === 0) {
          await nextFrame();
          if (token !== this.startToken) return false;
        }
        const shapeCandidate = makeShapeCandidate(rng, config);
        const length = shapeCandidate.length;
        const shape = shapeCandidate.shape;
        if (shape.length < config.minActualLength || shape.length < Math.floor(length * config.lengthCompletion)) {
          missesSincePlace += 1;
          if (shouldStopAfterMiss()) break;
          continue;
        }
        const bounds = getBounds(shape);
        if (bounds.w > this.gridW - 1 || bounds.h > this.gridH - 1) {
          missesSincePlace += 1;
          if (shouldStopAfterMiss()) break;
          continue;
        }

        const candidate = this.findDensePlacement(shape, bounds, pieces, rng, config);
        if (!candidate) {
          missesSincePlace += 1;
          if (shouldStopAfterMiss()) break;
          continue;
        }
        candidate.id = `p${level}-${pieces.length}-${attempt}`;
        candidate.colorIndex = 0;
        pieces.push(candidate);
        occupiedCells += candidate.cells.length;
        missesSincePlace = 0;
      }

      tightenExitDirections(pieces, this.gridW, this.gridH, config);

      this.pieces = pieces.map((piece, index) => ({
        ...clonePiece(piece),
        colorIndex: 0,
        container: null,
      }));
      this.initialPieceCount = this.pieces.length;

      if (this.pieces.length < 6) {
        this.level += 1;
        return this.generateLevel(this.level, token);
      }
      return true;
    }

    showLoading(level) {
      if (dom.loadingLevel) dom.loadingLevel.textContent = String(level);
      if (dom.loading) dom.loading.classList.remove("hidden");
    }

    hideLoading() {
      if (dom.loading) dom.loading.classList.add("hidden");
    }

    findDensePlacement(shape, bounds, pieces, rng, config) {
      let best = null;
      const tries = pieces.length ? config.placementTries : Math.max(8, Math.floor(config.placementTries * 0.7));
      for (let i = 0; i < tries; i++) {
        const origin = chooseShapeOrigin(shape, bounds, pieces, this.gridW, this.gridH, rng, config);
        const cells = shape.map(cell => ({ x: cell.x + origin.x, y: cell.y + origin.y }));
        const draft = { cells };
        if (!fits(draft, pieces, this.gridW, this.gridH)) continue;

        const terminalDirs = rng.shuffle(getTerminalDirections(cells));
        const validDirs = terminalDirs.filter(dir => this.canEscape({ cells, dir }, pieces).ok);
        const chosenDir = chooseExitDirection(validDirs, cells, pieces, this.gridW, this.gridH, rng, config);
        if (!chosenDir) continue;

        const score =
          scorePlacement(cells, pieces, this.gridW, this.gridH, config) +
          scoreBlockingPressure(cells, pieces, this.gridW, this.gridH, config) +
          scoreExitDirection(cells, chosenDir, pieces, this.gridW, this.gridH, config) +
          rng.next() * 0.05;
        if (!best || score > best.score) {
          best = {
            cells,
            dir: chosenDir,
            score,
          };
        }
      }
      return best ? {
        cells: best.cells,
        dir: best.dir,
      } : null;
    }

    resize() {
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const topSafe = viewportW < 620 ? 104 : 124;
      const bottomSafe = viewportW < 620 ? 30 : 42;
      const side = viewportW < 620 ? 20 : 48;
      const baseCell = viewportW < 620 ? 18 : 24;
      this.cell = baseCell;
      this.boardW = this.cell * this.gridW;
      this.boardH = this.cell * this.gridH;

      const contentW = Math.max(viewportW, this.boardW + side * 2);
      const contentH = Math.max(viewportH, this.boardH + topSafe + bottomSafe);
      if (app.screen.width !== contentW || app.screen.height !== contentH) {
        app.renderer.resize(contentW, contentH);
        app.canvas.style.width = `${contentW}px`;
        app.canvas.style.height = `${contentH}px`;
      }
      dom.container.style.width = `${contentW}px`;
      dom.container.style.height = `${contentH}px`;
      document.documentElement.style.setProperty("--game-width", `${contentW}px`);
      document.documentElement.style.setProperty("--game-height", `${contentH}px`);

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

      this.boardX = Math.round(Math.max(side, (width - this.boardW) / 2));
      this.boardY = Math.round(topSafe + Math.max(0, (height - topSafe - bottomSafe - this.boardH) / 2));
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

      container.hitArea = new PathHitArea(piece.cells, this.cell, Math.max(5, this.cell * 0.18));

      const glow = new PIXI.Graphics();
      drawPath(glow, piece.cells, this.cell, color.glow, Math.max(5, this.cell * 0.52), 0.3);
      drawPath(glow, piece.cells, this.cell, color.main, Math.max(4, this.cell * 0.4), 0.2);
      container.addChild(glow);

      const line = new PIXI.Graphics();
      drawPath(line, piece.cells, this.cell, color.main, Math.max(4.6, this.cell * 0.39), 0.98);
      drawPath(line, piece.cells, this.cell, color.hot, Math.max(1.4, this.cell * 0.06), 0.78);
      drawArrow(line, piece, this.cell, color.main, color.hot, dir);
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
      const track = buildExitTrack(piece, this.cell, this.boardW, this.boardH);
      const flow = new PIXI.Graphics();
      this.fxLayer.addChild(flow);
      piece.container.eventMode = "none";

      this.spawnTrail(piece, dir);
      this.tweens.push({
        duration: 620,
        elapsed: 0,
        update: dt => {
          const t = clamp(dt / 620, 0, 1);
          const eased = easeInOutCubic(t);
          const start = track.totalLength * eased;
          const end = Math.min(track.totalLength, start + track.pathLength);
          piece.container.alpha = 1 - clamp(t / 0.16, 0, 1);
          flow.clear();
          drawFlowWindow(flow, track.points, start, end, this.cell, PALETTE[piece.colorIndex % PALETTE.length], piece.dir);
          return t >= 1;
        },
        done: () => {
          this.pieceLayer.removeChild(piece.container);
          this.fxLayer.removeChild(flow);
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
      const clearedLevel = calculateClearedLevel(this.level);
      this.lastClear = {
        level: this.level,
        rankLevel: clearedLevel,
        moves: this.moves,
        lines: this.initialPieceCount,
        seed: this.levelSeed,
      };
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
      dom.clearLevel.textContent = `Lv ${clearedLevel.toLocaleString()}`;
      dom.nickname.value = localStorage.getItem(NICK_KEY) || "";
      dom.submitStatus.textContent = "";
      dom.rankSubmitRow.classList.remove("hidden");
      dom.submitRank.disabled = false;
      dom.skipRank.disabled = false;
      dom.modal.classList.remove("hidden");
    }

    updateHud() {
      dom.level.textContent = String(this.level);
      dom.moves.textContent = String(this.moves);
      dom.left.textContent = String(this.pieces.length);
    }

    async openRankModal() {
      this.playTone("button");
      dom.rankContent.innerHTML = `<div class="rank-loading">불러오는 중...</div>`;
      dom.rankModal.classList.remove("hidden");
      try {
        const rows = await this.fetchRankings();
        this.renderRankRows(rows);
      } catch (error) {
        dom.rankContent.innerHTML = `<div class="rank-error">랭킹을 불러오지 못했습니다</div>`;
      }
    }

    async fetchRankings() {
      const url = `${RANK_API_BASE}/rankings?game_id=${encodeURIComponent(GAME_ID)}&limit=${RANK_LIMIT}`;
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) throw new Error(`rankings ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.rankings)) throw new Error("invalid rankings response");
      return data.rankings;
    }

    renderRankRows(rows) {
      if (!rows.length) {
        dom.rankContent.innerHTML = `<div class="rank-empty">아직 등록된 기록이 없습니다</div>`;
        return;
      }
      dom.rankContent.innerHTML = rows.map((row, index) => {
        const rank = row.rank || index + 1;
        const extra = row.extra_data || {};
        const level = Number(extra.cleared_level || extra.level || row.score || 0);
        const moves = Number(extra.moves || 0);
        const lines = Number(extra.lines || 0);
        const meta = [
          moves ? `${moves} moves` : "",
          lines ? `${lines} lines` : "",
        ].filter(Boolean).join(" · ");
        const cls = ["rank-row"];
        if (rank <= 3) cls.push(`top${rank}`);
        return `
          <div class="${cls.join(" ")}">
            <div class="rank-pos">${rank}</div>
            <div class="rank-name">${escapeHtml(row.player_name || "PLAYER")}<span class="rank-meta">${escapeHtml(meta || "Arrow Puzzle")}</span></div>
            <div class="rank-level">Lv ${Number(level || 0).toLocaleString()}</div>
          </div>
        `;
      }).join("");
    }

    async handleSubmitRank() {
      if (!this.lastClear) {
        dom.submitStatus.textContent = "등록할 기록이 없습니다";
        return;
      }
      const name = dom.nickname.value.trim().slice(0, 20);
      if (!name) {
        dom.submitStatus.textContent = "닉네임을 입력하세요";
        dom.nickname.focus();
        return;
      }

      dom.submitRank.disabled = true;
      dom.skipRank.disabled = true;
      dom.submitStatus.textContent = "등록 중...";

      try {
        const response = await fetch(`${RANK_API_BASE}/rankings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game_id: GAME_ID,
            player_name: name,
            score: this.lastClear.rankLevel,
            extra_data: {
              level: this.lastClear.rankLevel,
              cleared_level: this.lastClear.rankLevel,
              moves: this.lastClear.moves,
              lines: this.lastClear.lines,
              seed: this.lastClear.seed,
            },
          }),
        });
        if (!response.ok) throw new Error(`submit ${response.status}`);
        const result = await response.json();
        localStorage.setItem(NICK_KEY, name);
        dom.submitStatus.textContent = result.rank ? `등록 완료 #${result.rank}` : "등록 완료";
        this.playTone("submit");
      } catch (error) {
        dom.submitStatus.textContent = "등록 실패";
        dom.submitRank.disabled = false;
        dom.skipRank.disabled = false;
      }
    }

    handleSkipRank() {
      this.playTone("button");
      dom.rankSubmitRow.classList.add("hidden");
    }

    canEscape(piece, others) {
      const occupied = makeOccupied(others);
      const dir = DIRS[piece.dir];
      const front = getArrowEndpoint(piece.cells, piece.dir);
      for (const cell of piece.cells) occupied.add(key(cell.x, cell.y));
      let x = front.x + dir.x;
      let y = front.y + dir.y;
      while (x >= 0 && x < this.gridW && y >= 0 && y < this.gridH) {
        if (occupied.has(key(x, y))) return { ok: false, blocker: { x, y } };
        x += dir.x;
        y += dir.y;
      }
      return { ok: true, blocker: null };
    }

    spawnTrail(piece, dir) {
      const color = PALETTE[piece.colorIndex % PALETTE.length];
      const front = getArrowEndpoint(piece.cells, piece.dir);
      const x = this.cx(front.x);
      const y = this.cy(front.y);
      for (let i = 0; i < 10; i++) {
        const g = new PIXI.Graphics();
        const size = Math.max(1.4, this.cell * (0.025 + Math.random() * 0.035));
        g.circle(0, 0, size).fill({ color: color.hot, alpha: 0.78 });
        g.x = x - dir.x * this.cell * Math.random() * 0.18 + (Math.random() - 0.5) * this.cell * 0.18;
        g.y = y - dir.y * this.cell * Math.random() * 0.18 + (Math.random() - 0.5) * this.cell * 0.18;
        this.fxLayer.addChild(g);
        this.tweens.push({
          duration: 430 + Math.random() * 220,
          elapsed: 0,
          update: dt => {
            const t = clamp(dt / 620, 0, 1);
            g.x += dir.x * this.cell * 1.05 * t;
            g.y += dir.y * this.cell * 1.05 * t;
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
      if (this.sound && this.sound.ensure) this.sound.ensure();
    }

    playTone(type, intensity = 1) {
      if (this.sound && this.sound.play) this.sound.play(type, intensity);
    }

    cx(x) {
      return (x + 0.5) * this.cell;
    }

    cy(y) {
      return (y + 0.5) * this.cell;
    }
  }

  function getLevelConfig(level) {
    const rawLevel = Math.max(1, level | 0);
    const tunedLevel = Math.min(rawLevel, DIFFICULTY_CAP_LEVEL);
    const rawProgress = DIFFICULTY_CAP_LEVEL <= 1 ? 1 : clamp((tunedLevel - 1) / (DIFFICULTY_CAP_LEVEL - 1), 0, 1);
    const earlyProgress = clamp((rawLevel - 1) / 9, 0, 1);
    const lateProgress = clamp((tunedLevel - 10) / 90, 0, 1);
    const entryProgress = 0.38 + earlyProgress * 0.62;
    const size = Math.pow(entryProgress, 0.62);
    const pressure = 0.88 + Math.pow(entryProgress, 0.72) * 0.1 + lateProgress * 0.02;
    const curve = Math.pow(pressure, 0.72);
    const gridW = Math.min(21, Math.round(11 + size * 3 + lateProgress * 7));
    const gridH = Math.min(29, Math.round(14 + size * 6 + lateProgress * 9));
    const activeW = Math.min(gridW, Math.round(gridW - (earlyProgress >= 1 ? 1 : 2)));
    const activeH = Math.min(gridH, Math.round(gridH - (earlyProgress >= 1 ? 1 : 2)));
    const clusterInsetX = Math.max(0, Math.floor((gridW - activeW) / 2));
    const clusterInsetY = Math.max(0, Math.floor((gridH - activeH) / 2));
    const fillRatio = 0.82 + entryProgress * 0.1 + lateProgress * 0.04;
    const minLength = Math.round(2 + lateProgress * 2);
    const maxLength = Math.min(12, Math.round(4 + earlyProgress + lateProgress * 7));

    return {
      gridW,
      gridH,
      target: Math.min(104, Math.round(66 + entryProgress * 24 + lateProgress * 14)),
      minPieces: Math.round(54 + entryProgress * 16 + lateProgress * 12),
      targetCells: Math.round(activeW * activeH * fillRatio),
      targetSlack: Math.floor(maxLength * 0.1),
      clusterInsetX,
      clusterInsetY,
      minLength,
      minActualLength: Math.max(2, Math.round(minLength * 0.72)),
      maxLength,
      lengthBias: 1.18 + pressure * 0.44,
      lengthCompletion: 0.54 + pressure * 0.08,
      shapeRetries: 3 + Math.floor(entryProgress * 2 + lateProgress),
      turnBias: 0.78 + pressure * 0.15,
      attemptsPerPiece: 250 + Math.floor(entryProgress * 90 + lateProgress * 90),
      minFillCompletion: 0.96,
      softFillCompletion: 0.9,
      budgetFillCompletion: 0.94,
      stallLimit: 320 + Math.floor(entryProgress * 150 + lateProgress * 110),
      completedStallLimit: 190 + Math.floor(entryProgress * 120 + lateProgress * 100),
      generationBudgetMs: 3200 + Math.floor(entryProgress * 2200 + lateProgress * 1800),
      placementTries: 34 + Math.floor(entryProgress * 12 + lateProgress * 12),
      yieldEvery: 90,
      clusterBias: 0.992,
      centerBias: 0.9 + entryProgress * 0.07,
      centerJitter: entryProgress < 0.65 ? 1 : 2,
      weaveBias: 3.1 + entryProgress * 0.7 + lateProgress * 0.7,
      blockingBias: 1.75 + entryProgress * 0.65 + lateProgress * 0.55,
      exitLaneBias: 1.35 + entryProgress * 0.24 + lateProgress * 0.25,
    };
  }

  function createTemplateLevel(level) {
    const rawLevel = Math.max(1, level | 0);
    const mapLevel = Math.min(rawLevel, MAP_SIZE_CAP_LEVEL);
    const earlyProgress = clamp((mapLevel - 1) / 9, 0, 1);
    const expansion = Math.sqrt(Math.max(0, mapLevel - 10));
    const gridW = snapTemplateSize(18 + earlyProgress * 6 + expansion * 2.4, 3);
    const gridH = snapTemplateSize(24 + earlyProgress * 9 + expansion * 3.3, 3);
    const pieces = createWovenTemplatePieces(gridW, gridH, rawLevel);

    const guaranteedDirs = pieces.map(piece => piece.dir);
    const config = getLevelConfig(level);
    confuseExitDirections(pieces, gridW, gridH, config);
    repairSolvability(pieces, guaranteedDirs, gridW, gridH);
    if (!isSolvableTemplate(pieces, gridW, gridH)) {
      for (let i = 0; i < pieces.length; i++) pieces[i].dir = guaranteedDirs[i];
    }

    return { gridW, gridH, pieces };
  }

  function createWovenTemplatePieces(gridW, gridH, variant) {
    const rng = new Random((createLevelSeed(variant) ^ 0x7f4a7c15) >>> 0);
    const occupied = new Set();
    const pieces = [];
    const boardCells = gridW * gridH;
    const targetFill = gridW >= 45 ? 0.82 : gridW >= 33 ? 0.87 : gridW >= 24 ? 0.9 : 0.85;
    const minLength = gridW >= 45 ? 26 : gridW >= 33 ? 22 : gridW >= 24 ? 18 : 10;
    const maxLength = Math.min(gridW >= 45 ? 64 : 90, Math.max(42, Math.round(Math.min(gridW, gridH) * 1.72)));
    const minPieces = Math.max(14, Math.round((boardCells * targetFill) / (maxLength * 0.84)));
    const maxAttempts = Math.max(900, boardCells * 5);
    const stallLimit = gridW >= 45 ? 30 : gridW >= 33 ? 36 : 42;
    const closeFill = targetFill - (gridW >= 45 ? 0.04 : 0.02);
    let occupiedCells = 0;
    let misses = 0;

    for (let attempt = 0; attempt < maxAttempts && occupiedCells / boardCells < targetFill; attempt++) {
      const candidate = makeBestWovenCandidate(gridW, gridH, occupied, pieces, rng, minLength, maxLength);
      if (!candidate) {
        misses += 1;
        if (misses > stallLimit && pieces.length >= minPieces && occupiedCells / boardCells >= closeFill) break;
        if (misses > stallLimit * 2 && occupiedCells / boardCells >= closeFill) break;
        if (misses > stallLimit * 6 && pieces.length >= Math.floor(minPieces * 0.85)) break;
        continue;
      }
      const dir = chooseTemplateDirection(candidate.cells, pieces, gridW, gridH);
      if (!dir) {
        misses += 1;
        if (misses > stallLimit && pieces.length >= minPieces && occupiedCells / boardCells >= closeFill) break;
        if (misses > stallLimit * 2 && occupiedCells / boardCells >= closeFill) break;
        if (misses > stallLimit * 6 && pieces.length >= Math.floor(minPieces * 0.85)) break;
        continue;
      }
      pieces.push({
        id: `woven-${pieces.length}`,
        dir,
        colorIndex: 0,
        cells: candidate.cells,
        container: null,
      });
      for (const cell of candidate.cells) occupied.add(key(cell.x, cell.y));
      occupiedCells += candidate.cells.length;
      misses = 0;
    }

    const fillerTargetFill = gridW >= 45 ? Math.min(targetFill, 0.78) : targetFill;
    if (occupiedCells / boardCells < fillerTargetFill) {
      const fillerMinLength = gridW >= 45 ? 24 : gridW >= 33 ? 18 : 16;
      const fillerMaxLength = Math.min(maxLength - 4, gridW >= 45 ? 44 : gridW >= 33 ? 40 : 32);
      let fillerMisses = 0;
      const fillerAttempts = Math.max(160, boardCells * 2);
      for (let attempt = 0; attempt < fillerAttempts && occupiedCells / boardCells < fillerTargetFill; attempt++) {
        const candidate = makeBestWovenCandidate(gridW, gridH, occupied, pieces, rng, fillerMinLength, fillerMaxLength);
        if (!candidate) {
          fillerMisses += 1;
          if (fillerMisses > stallLimit) break;
          continue;
        }
        const dir = chooseTemplateDirection(candidate.cells, pieces, gridW, gridH);
        if (!dir) {
          fillerMisses += 1;
          if (fillerMisses > stallLimit) break;
          continue;
        }
        pieces.push({
          id: `woven-${pieces.length}`,
          dir,
          colorIndex: 0,
          cells: candidate.cells,
          container: null,
        });
        for (const cell of candidate.cells) occupied.add(key(cell.x, cell.y));
        occupiedCells += candidate.cells.length;
        fillerMisses = 0;
      }
    }

    return pieces;
  }

  function makeBestWovenCandidate(gridW, gridH, occupied, pieces, rng, minLength, maxLength) {
    let best = null;
    const samples = gridW >= 45 ? (pieces.length < 4 ? 36 : 48) : pieces.length < 4 ? 52 : 72;
    for (let i = 0; i < samples; i++) {
      const cells = makeWovenWalk(gridW, gridH, occupied, rng, minLength, maxLength);
      if (!cells || cells.length < minLength) continue;
      const score = scoreWovenWalk(cells, occupied, gridW, gridH) + rng.next() * 0.5;
      if (!best || score > best.score) best = { cells, score };
    }
    return best;
  }

  function makeWovenWalk(gridW, gridH, occupied, rng, minLength, maxLength) {
    const start = pickWovenStart(gridW, gridH, occupied, rng);
    if (!start) return null;

    const cells = [start];
    const own = new Set([key(start.x, start.y)]);
    let heading = rng.pick(DIR_KEYS);
    for (let stepIndex = 1; stepIndex < maxLength; stepIndex++) {
      const last = cells[cells.length - 1];
      const choices = DIR_KEYS
        .map(dir => {
          const step = DIRS[dir];
          const cell = { x: last.x + step.x, y: last.y + step.y };
          if (cell.x < 0 || cell.x >= gridW || cell.y < 0 || cell.y >= gridH) return null;
          const cellKey = key(cell.x, cell.y);
          if (occupied.has(cellKey) || own.has(cellKey)) return null;
          return {
            dir,
            cell,
            score: scoreWovenStep(cell, dir, heading, occupied, own, gridW, gridH, stepIndex),
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);
      if (!choices.length) break;
      const pick = choices[Math.min(choices.length - 1, Math.floor(Math.pow(rng.next(), 2.2) * choices.length))];
      cells.push(pick.cell);
      own.add(key(pick.cell.x, pick.cell.y));
      heading = pick.dir;
    }
    return cells.length >= minLength ? cells : null;
  }

  function pickWovenStart(gridW, gridH, occupied, rng) {
    let best = null;
    const sampleCount = occupied.size ? 64 : 24;
    for (let i = 0; i < sampleCount; i++) {
      const cell = { x: rng.int(0, gridW - 1), y: rng.int(0, gridH - 1) };
      if (occupied.has(key(cell.x, cell.y))) continue;
      const edgePull = Math.min(cell.x, gridW - 1 - cell.x, cell.y, gridH - 1 - cell.y);
      const score =
        countAdjacentSet(cell, occupied) * 8 +
        countNearbySet(cell, occupied, 2) * 1.7 -
        edgePull * (occupied.size ? 0.18 : -0.22) +
        rng.next();
      if (!best || score > best.score) best = { cell, score };
    }
    return best ? best.cell : null;
  }

  function scoreWovenStep(cell, dir, heading, occupied, own, gridW, gridH, stepIndex) {
    const edgeDistance = Math.min(cell.x, gridW - 1 - cell.x, cell.y, gridH - 1 - cell.y);
    const occupiedAdj = countAdjacentSet(cell, occupied);
    const occupiedNear = countNearbySet(cell, occupied, 2);
    const selfAdj = countAdjacentSet(cell, own);
    const turn = dir === heading ? 1.35 : 1.85;
    const centerX = (gridW - 1) / 2;
    const centerY = (gridH - 1) / 2;
    const centerPull = 1 - clamp((Math.abs(cell.x - centerX) / gridW + Math.abs(cell.y - centerY) / gridH) * 1.4, 0, 1);
    const lateHug = stepIndex > 4 ? occupiedAdj * 5.8 + occupiedNear * 1.1 : occupiedNear * 0.35;
    return lateHug + selfAdj * 1.35 + turn + centerPull * 1.6 - edgeDistance * 0.05;
  }

  function scoreWovenWalk(cells, occupied, gridW, gridH) {
    const bounds = getBounds(cells);
    let adjacent = 0;
    let near = 0;
    for (const cell of cells) {
      adjacent += countAdjacentSet(cell, occupied);
      near += countNearbySet(cell, occupied, 2);
    }
    const turns = countPathTurns(cells);
    const span = bounds.w + bounds.h;
    const wrap = adjacent * 10.5 + near * 1.25 + turns * 2.5 + span * 2.9;
    return wrap + cells.length * 4.4 - countIslands(cells, new Set(cells.map(cell => key(cell.x, cell.y)))) * 0.7;
  }

  function countAdjacentSet(cell, cellSet) {
    let count = 0;
    for (const dir of DIR_KEYS) {
      const step = DIRS[dir];
      if (cellSet.has(key(cell.x + step.x, cell.y + step.y))) count += 1;
    }
    return count;
  }

  function countNearbySet(cell, cellSet, radius) {
    let count = 0;
    for (let y = cell.y - radius; y <= cell.y + radius; y++) {
      for (let x = cell.x - radius; x <= cell.x + radius; x++) {
        if (Math.abs(x - cell.x) + Math.abs(y - cell.y) > radius) continue;
        if (cellSet.has(key(x, y))) count += 1;
      }
    }
    return count;
  }

  function countPathTurns(cells) {
    let turns = 0;
    for (let i = 2; i < cells.length; i++) {
      const prev = cells[i - 1];
      const a = cells[i - 2];
      const b = cells[i];
      if (prev.x - a.x !== b.x - prev.x || prev.y - a.y !== b.y - prev.y) turns += 1;
    }
    return turns;
  }

  function createDenseTemplatePieces(gridW, gridH, variant) {
    const basePatterns = [
      [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [4, 1], [3, 1], [3, 2], [4, 2], [5, 2], [5, 3], [4, 3]],
      [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [2, 2], [1, 2], [1, 1], [2, 1], [3, 1], [4, 1], [4, 0], [3, 0]],
      [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [4, 3], [3, 3], [3, 4], [4, 4]],
      [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2], [3, 2], [3, 1], [2, 1], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [5, 2]],
      [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0], [3, 0], [4, 0], [4, 1], [3, 1], [3, 2], [4, 2], [5, 2], [5, 3], [4, 3], [3, 3]],
      [[0, 1], [1, 1], [2, 1], [2, 0], [3, 0], [4, 0], [4, 1], [3, 1], [3, 2], [2, 2], [1, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3]],
      [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [2, 1], [1, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [5, 3], [4, 3], [3, 3], [3, 4], [4, 4]],
      [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [2, 1], [3, 1], [3, 2], [2, 2], [2, 3], [3, 3], [4, 3], [5, 3], [5, 2], [4, 2], [4, 1]],
      [[0, 2], [0, 1], [1, 1], [1, 0], [2, 0], [3, 0], [3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [5, 2], [5, 3], [4, 3], [3, 3]],
      [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [3, 1], [2, 1], [2, 2], [1, 2], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3]],
      [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [2, 1], [1, 1], [1, 2], [2, 2], [3, 2]],
      [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [1, 1], [1, 0], [2, 0], [3, 0]],
      [[0, 1], [1, 1], [2, 1], [2, 0], [3, 0], [4, 0], [4, 1], [3, 1], [3, 2], [4, 2], [5, 2]],
      [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [3, 2], [2, 2], [2, 3], [3, 3], [4, 3]],
      [[0, 2], [0, 1], [1, 1], [1, 0], [2, 0], [3, 0], [3, 1], [2, 1], [2, 2], [3, 2], [4, 2]],
      [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1], [3, 1], [3, 0]],
      [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 3], [1, 3]],
      [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [3, 0], [4, 0]],
      [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [1, 2], [2, 2]],
      [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [2, 1], [2, 0]],
      [[0, 1], [1, 1], [1, 0], [2, 0], [3, 0], [3, 1], [2, 1], [2, 2]],
      [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [3, 2], [2, 2], [1, 2]],
    ];
    const shapeMap = new Map();
    for (const pattern of basePatterns) {
      for (const shape of createTemplateShapeVariants(pattern)) {
        shapeMap.set(shape.map(cell => key(cell.x, cell.y)).join(";"), shape);
      }
    }
    const shapes = Array.from(shapeMap.values());
    const candidates = [];
    const centerX = (gridW - 1) / 2;
    const centerY = (gridH - 1) / 2;

    for (let shapeIndex = 0; shapeIndex < shapes.length; shapeIndex++) {
      const shape = shapes[shapeIndex];
      const maxX = Math.max(...shape.map(cell => cell.x));
      const maxY = Math.max(...shape.map(cell => cell.y));
      for (let y = 0; y <= gridH - maxY - 1; y++) {
        for (let x = 0; x <= gridW - maxX - 1; x++) {
          const cells = shape.map(cell => ({ x: x + cell.x, y: y + cell.y }));
          const middle = cells.reduce((sum, cell) => ({
            x: sum.x + cell.x / cells.length,
            y: sum.y + cell.y / cells.length,
          }), { x: 0, y: 0 });
          const distance = Math.abs(middle.x - centerX) / gridW + Math.abs(middle.y - centerY) / gridH;
          const noise = templateNoise((x + 1) * 73856093 ^ (y + 1) * 19349663 ^ (shapeIndex + variant) * 83492791);
          candidates.push({
            cells,
            score: distance * 90 - cells.length * 3 + noise * 9,
            order: candidates.length,
          });
        }
      }
    }

    candidates.sort((a, b) => a.score - b.score || a.order - b.order);
    const pieces = [];
    const used = new Set();
    let occupiedCells = 0;
    const boardCells = gridW * gridH;
    const targetFill = gridW >= 45 ? 0.78 : gridW >= 33 ? 0.82 : gridW >= 24 ? 0.88 : 0.84;
    const minPieces = gridW >= 45 ? Math.round(boardCells / 34) : gridW >= 33 ? Math.round(boardCells / 28) : gridW >= 24 ? 54 : 26;
    for (const candidate of candidates) {
      if (candidate.cells.some(cell => used.has(key(cell.x, cell.y)))) continue;
      const dir = chooseTemplateDirection(candidate.cells, pieces, gridW, gridH);
      if (!dir) continue;
      pieces.push({
        id: `template-${pieces.length}`,
        dir,
        colorIndex: 0,
        cells: candidate.cells.map(cell => ({ x: cell.x, y: cell.y })),
        container: null,
      });
      for (const cell of candidate.cells) used.add(key(cell.x, cell.y));
      occupiedCells += candidate.cells.length;
      if (occupiedCells / boardCells >= targetFill && pieces.length >= minPieces) break;
    }
    return pieces;
  }

  function createTemplateShapeVariants(pattern) {
    const variants = [];
    for (let rotation = 0; rotation < 4; rotation++) {
      for (const flip of [false, true]) {
        let cells = pattern.map(([x, y]) => ({ x, y }));
        for (let i = 0; i < rotation; i++) {
          cells = cells.map(cell => ({ x: -cell.y, y: cell.x }));
        }
        if (flip) cells = cells.map(cell => ({ x: -cell.x, y: cell.y }));
        variants.push(normalizeTemplateShape(cells));
      }
    }
    return variants;
  }

  function normalizeTemplateShape(cells) {
    const minX = Math.min(...cells.map(cell => cell.x));
    const minY = Math.min(...cells.map(cell => cell.y));
    return cells.map(cell => ({ x: cell.x - minX, y: cell.y - minY }));
  }

  function templateNoise(value) {
    let n = value | 0;
    n = Math.imul(n ^ 61, n ^ (n >>> 16));
    n += n << 3;
    n = Math.imul(n, n ^ (n >>> 4));
    n = Math.imul(n, 0x27d4eb2d);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967295;
  }

  function chooseTemplateDirection(cells, placed, gridW, gridH) {
    const centerX = (gridW - 1) / 2;
    const centerY = (gridH - 1) / 2;
    let best = null;
    for (const dir of getTerminalDirections(cells)) {
      const piece = { cells, dir };
      if (!canPieceEscape(piece, placed, gridW, gridH).ok) continue;
      const front = getArrowEndpoint(cells, dir);
      const step = DIRS[dir];
      const outward = (front.x - centerX) * step.x + (front.y - centerY) * step.y;
      let distance = 0;
      let x = front.x + step.x;
      let y = front.y + step.y;
      while (x >= 0 && x < gridW && y >= 0 && y < gridH) {
        distance += 1;
        x += step.x;
        y += step.y;
      }
      const score = outward * 10 - distance;
      if (!best || score > best.score) best = { dir, score };
    }
    return best ? best.dir : null;
  }

  function isSolvableTemplate(pieces, gridW, gridH) {
    let remaining = pieces.slice();
    while (remaining.length) {
      const next = remaining.find(piece => canPieceEscape(
        piece,
        remaining.filter(other => other !== piece),
        gridW,
        gridH
      ).ok);
      if (!next) return false;
      remaining = remaining.filter(piece => piece !== next);
    }
    return true;
  }

  function snapTemplateSize(value, step) {
    return Math.max(step * 3, Math.round(value / step) * step);
  }

  function samplePieceLength(rng, config) {
    const min = config.minLength;
    const max = Math.max(min, config.maxLength);
    const t = Math.pow(rng.next(), 1 / Math.max(1, config.lengthBias || 1));
    return Math.round(min + (max - min) * t);
  }

  function makeShapeCandidate(rng, config) {
    let best = null;
    const tries = config.shapeRetries || 1;
    for (let i = 0; i < tries; i++) {
      const length = samplePieceLength(rng, config);
      const shape = makeShape(rng, length, config.turnBias);
      if (!best || shape.length / length > best.shape.length / best.length || shape.length > best.shape.length) {
        best = { length, shape };
      }
      if (shape.length >= config.minActualLength && shape.length >= Math.floor(length * config.lengthCompletion)) {
        return { length, shape };
      }
    }
    return best;
  }

  function chooseShapeOrigin(shape, bounds, pieces, gridW, gridH, rng, config) {
    const placement = getPlacementBounds(bounds, gridW, gridH, config);
    const minX = placement.minX;
    const minY = placement.minY;
    const maxX = placement.maxX;
    const maxY = placement.maxY;
    if (!pieces.length || !rng.chance(config.clusterBias)) {
      const centerX = Math.round((minX + maxX) / 2);
      const centerY = Math.round((minY + maxY) / 2);
      if (rng.chance(config.centerBias)) {
        const jitter = Math.max(0, config.centerJitter || 0);
        return {
          x: clamp(centerX + rng.int(-jitter, jitter), minX, maxX),
          y: clamp(centerY + rng.int(-jitter, jitter), minY, maxY),
        };
      }
      return {
        x: rng.int(minX, maxX),
        y: rng.int(minY, maxY),
      };
    }

    const anchor = pickOccupiedCell(pieces, rng, gridW, gridH, config);
    const source = rng.pick(shape);
    const offset = rng.pick([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: -1, y: -1 },
    ]);
    return {
      x: clamp(anchor.x + offset.x - source.x, minX, maxX),
      y: clamp(anchor.y + offset.y - source.y, minY, maxY),
    };
  }

  function getPlacementBounds(bounds, gridW, gridH, config) {
    const insetX = Math.min(config.clusterInsetX || 0, Math.floor((gridW - bounds.w) / 2));
    const insetY = Math.min(config.clusterInsetY || 0, Math.floor((gridH - bounds.h) / 2));
    const minX = Math.max(0, insetX);
    const minY = Math.max(0, insetY);
    const maxX = Math.max(minX, gridW - bounds.w - insetX);
    const maxY = Math.max(minY, gridH - bounds.h - insetY);
    return { minX, minY, maxX, maxY };
  }

  function scorePlacement(cells, pieces, gridW, gridH, config) {
    const occupied = makeOccupied(pieces);
    const centerX = (gridW - 1) / 2;
    const centerY = (gridH - 1) / 2;
    let adjacent = 0;
    let near = 0;
    let squeezed = 0;
    let surrounded = 0;
    let parallelTouch = 0;
    let centerDistance = 0;
    let edgeTouches = 0;
    const own = new Set(cells.map(cell => key(cell.x, cell.y)));
    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index];
      centerDistance += Math.abs(cell.x - centerX) / gridW + Math.abs(cell.y - centerY) / gridH;
      if (cell.x === 0 || cell.x === gridW - 1 || cell.y === 0 || cell.y === gridH - 1) edgeTouches += 1;
      let sides = 0;
      for (const dir of DIR_KEYS) {
        const step = DIRS[dir];
        const neighbor = key(cell.x + step.x, cell.y + step.y);
        if (occupied.has(neighbor)) {
          adjacent += 1;
          sides += 1;
        }
      }
      if (
        occupied.has(key(cell.x - 1, cell.y)) && occupied.has(key(cell.x + 1, cell.y)) ||
        occupied.has(key(cell.x, cell.y - 1)) && occupied.has(key(cell.x, cell.y + 1))
      ) squeezed += 1;
      if (sides >= 3) surrounded += 1;
      for (let y = cell.y - 2; y <= cell.y + 2; y++) {
        for (let x = cell.x - 2; x <= cell.x + 2; x++) {
          if (Math.abs(x - cell.x) + Math.abs(y - cell.y) > 2) continue;
          if (occupied.has(key(x, y))) near += 1;
        }
      }
      const next = cells[index + 1];
      if (next) {
        const dx = Math.sign(next.x - cell.x);
        const dy = Math.sign(next.y - cell.y);
        const sideA = { x: -dy, y: dx };
        const sideB = { x: dy, y: -dx };
        if (occupied.has(key(cell.x + sideA.x, cell.y + sideA.y)) || occupied.has(key(next.x + sideA.x, next.y + sideA.y))) parallelTouch += 1;
        if (occupied.has(key(cell.x + sideB.x, cell.y + sideB.y)) || occupied.has(key(next.x + sideB.x, next.y + sideB.y))) parallelTouch += 1;
      }
    }
    const compactness = adjacent * 3.5 + near * 0.45;
    const weave = (squeezed * 9.8 + surrounded * 7.8 + parallelTouch * 4.2) * config.weaveBias;
    const centerPull = (cells.length - centerDistance) * (1.28 + config.centerBias * 1.45);
    return compactness + weave + centerPull - edgeTouches * 2.7 - countIslands(cells, own) * 0.6;
  }

  function tightenExitDirections(pieces, gridW, gridH, config) {
    for (let index = 0; index < pieces.length; index++) {
      const piece = pieces[index];
      const previous = pieces.slice(0, index);
      const later = pieces.slice(index + 1);
      const validDirs = getTerminalDirections(piece.cells)
        .filter(dir => canPieceEscape({ cells: piece.cells, dir }, previous, gridW, gridH).ok);
      if (!validDirs.length) continue;

      let best = null;
      for (const dir of validDirs) {
        const score =
          scoreInitialBlockage(piece.cells, dir, later, gridW, gridH, config) +
          scoreExitDirection(piece.cells, dir, previous, gridW, gridH, config) * 0.35;
        if (!best || score > best.score) best = { dir, score };
      }
      piece.dir = best ? best.dir : piece.dir;
    }

    const guaranteedDirs = pieces.map(piece => piece.dir);
    confuseExitDirections(pieces, gridW, gridH, config);
    repairSolvability(pieces, guaranteedDirs, gridW, gridH);
  }

  function confuseExitDirections(pieces, gridW, gridH, config) {
    for (let index = 0; index < pieces.length; index++) {
      const piece = pieces[index];
      const others = pieces.filter((_, otherIndex) => otherIndex !== index);
      const dirs = getTerminalDirections(piece.cells);
      let best = null;
      for (const dir of dirs) {
        const score =
          scoreInitialBlockage(piece.cells, dir, others, gridW, gridH, config) +
          scoreExitDirection(piece.cells, dir, others, gridW, gridH, config) * 0.22;
        if (!best || score > best.score) best = { dir, score };
      }
      if (best) piece.dir = best.dir;
    }
  }

  function repairSolvability(pieces, guaranteedDirs, gridW, gridH) {
    const remaining = pieces.map((_, index) => index);
    let guard = pieces.length * 3;
    while (remaining.length && guard-- > 0) {
      const freeIndex = remaining.find(index => {
        const piece = pieces[index];
        const others = remaining
          .filter(otherIndex => otherIndex !== index)
          .map(otherIndex => pieces[otherIndex]);
        return canPieceEscape(piece, others, gridW, gridH).ok;
      });

      if (freeIndex !== undefined) {
        remaining.splice(remaining.indexOf(freeIndex), 1);
        continue;
      }

      const fallbackIndex = remaining.reduce((best, index) => Math.max(best, index), -1);
      if (fallbackIndex < 0) break;
      pieces[fallbackIndex].dir = guaranteedDirs[fallbackIndex];
    }
  }

  function chooseExitDirection(dirs, cells, pieces, gridW, gridH, rng, config) {
    let best = null;
    for (const dir of dirs) {
      const score = scoreExitDirection(cells, dir, pieces, gridW, gridH, config) + rng.next() * 0.02;
      if (!best || score > best.score) best = { dir, score };
    }
    return best ? best.dir : null;
  }

  function scoreExitDirection(cells, dir, pieces, gridW, gridH, config) {
    if (!dir) return 0;
    const occupied = makeOccupied(pieces);
    const step = DIRS[dir];
    const front = getArrowEndpoint(cells, dir);
    const centerX = (gridW - 1) / 2;
    const centerY = (gridH - 1) / 2;
    let x = front.x + step.x;
    let y = front.y + step.y;
    let distance = 0;
    let hotLane = 0;
    let centerLane = 0;

    while (x >= 0 && x < gridW && y >= 0 && y < gridH) {
      distance += 1;
      const centrality = 1 - clamp((Math.abs(x - centerX) / gridW + Math.abs(y - centerY) / gridH) * 1.35, 0, 1);
      centerLane += centrality;
      for (const side of DIR_KEYS) {
        const sideStep = DIRS[side];
        if (occupied.has(key(x + sideStep.x, y + sideStep.y))) hotLane += 1;
      }
      x += step.x;
      y += step.y;
    }

    const frontCentrality = 1 - clamp((Math.abs(front.x - centerX) / gridW + Math.abs(front.y - centerY) / gridH) * 1.6, 0, 1);
    const shortExit = Math.max(0, 12 - distance);
    return (
      hotLane * 2.9 +
      centerLane * 0.42 +
      shortExit * 1.35 +
      frontCentrality * 5.2 -
      distance * 0.38
    ) * (config.exitLaneBias || 1);
  }

  function scoreBlockingPressure(cells, pieces, gridW, gridH, config) {
    if (!pieces.length) return 0;
    const draft = new Set(cells.map(cell => key(cell.x, cell.y)));
    let blockedRays = 0;
    let closeLocks = 0;
    let headCrowding = 0;

    for (const piece of pieces) {
      const step = DIRS[piece.dir];
      const front = getArrowEndpoint(piece.cells, piece.dir);
      let x = front.x + step.x;
      let y = front.y + step.y;
      let distance = 1;
      while (x >= 0 && x < gridW && y >= 0 && y < gridH) {
        if (draft.has(key(x, y))) {
          blockedRays += 1 + Math.max(0, 7 - distance) * 0.32;
          if (distance <= 3) closeLocks += 1;
          break;
        }
        x += step.x;
        y += step.y;
        distance += 1;
      }

      for (const dir of DIR_KEYS) {
        const side = DIRS[dir];
        if (draft.has(key(front.x + side.x, front.y + side.y))) headCrowding += 1;
      }
    }

    return (blockedRays * 18 + closeLocks * 11 + headCrowding * 3.2) * (config.blockingBias || 1);
  }

  function scoreInitialBlockage(cells, dir, laterPieces, gridW, gridH, config) {
    if (!laterPieces.length) return 0;
    const occupied = makeOccupied(laterPieces);
    const step = DIRS[dir];
    const front = getArrowEndpoint(cells, dir);
    let x = front.x + step.x;
    let y = front.y + step.y;
    let distance = 1;
    let laneCrowding = 0;

    while (x >= 0 && x < gridW && y >= 0 && y < gridH) {
      if (occupied.has(key(x, y))) {
        return (110 + Math.max(0, 12 - distance) * 16 + laneCrowding * 4) * (config.blockingBias || 1);
      }
      for (const side of DIR_KEYS) {
        const sideStep = DIRS[side];
        if (occupied.has(key(x + sideStep.x, y + sideStep.y))) laneCrowding += 1;
      }
      x += step.x;
      y += step.y;
      distance += 1;
    }

    return laneCrowding * 2.2 * (config.blockingBias || 1);
  }

  function canPieceEscape(piece, others, gridW, gridH) {
    const occupied = makeOccupied(others);
    const dir = DIRS[piece.dir];
    const front = getArrowEndpoint(piece.cells, piece.dir);
    for (const cell of piece.cells) occupied.add(key(cell.x, cell.y));
    let x = front.x + dir.x;
    let y = front.y + dir.y;
    while (x >= 0 && x < gridW && y >= 0 && y < gridH) {
      if (occupied.has(key(x, y))) return { ok: false, blocker: { x, y } };
      x += dir.x;
      y += dir.y;
    }
    return { ok: true, blocker: null };
  }

  function countIslands(cells, own) {
    let looseEnds = 0;
    for (const cell of cells) {
      let links = 0;
      for (const dir of DIR_KEYS) {
        const step = DIRS[dir];
        if (own.has(key(cell.x + step.x, cell.y + step.y))) links += 1;
      }
      if (links <= 1) looseEnds += 1;
    }
    return looseEnds;
  }

  function pickOccupiedCell(pieces, rng, gridW, gridH, config) {
    if (!gridW || !gridH) {
      const piece = rng.pick(pieces);
      return rng.pick(piece.cells);
    }

    const centerX = (gridW - 1) / 2;
    const centerY = (gridH - 1) / 2;
    const samples = 8 + Math.floor((config.centerBias || 0) * 8);
    let best = null;
    for (let i = 0; i < samples; i++) {
      const piece = rng.pick(pieces);
      const cell = rng.pick(piece.cells);
      const score = -Math.abs(cell.x - centerX) - Math.abs(cell.y - centerY) + rng.next() * 0.9;
      if (!best || score > best.score) best = { cell, score };
    }
    return best.cell;
  }

  function createLevelSeed(level) {
    return (0x9e3779b9 ^ Math.imul(Math.max(1, level | 0), 2654435761)) >>> 0;
  }

  function makeShape(rng, length, turnBias = 0.5) {
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    const cells = [{ x: 0, y: 0 }];
    let heading = rng.pick(dirs);
    for (let i = 1; i < length; i++) {
      const left = { x: -heading.y, y: heading.x };
      const right = { x: heading.y, y: -heading.x };
      const choices = rng.chance(turnBias)
        ? rng.shuffle([left, right, heading, rng.pick(dirs)])
        : rng.shuffle([heading, left, right, rng.pick(dirs)]);
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

  class PathHitArea {
    constructor(cells, cellSize, radius) {
      this.cells = cells;
      this.cellSize = cellSize;
      this.radius = radius;
    }

    contains(x, y) {
      const radiusSq = this.radius * this.radius;
      for (let i = 0; i < this.cells.length; i++) {
        const cell = this.cells[i];
        const cx = (cell.x + 0.5) * this.cellSize;
        const cy = (cell.y + 0.5) * this.cellSize;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radiusSq) return true;
      }
      for (let i = 0; i < this.cells.length - 1; i++) {
        const a = this.cells[i];
        const b = this.cells[i + 1];
        const ax = (a.x + 0.5) * this.cellSize;
        const ay = (a.y + 0.5) * this.cellSize;
        const bx = (b.x + 0.5) * this.cellSize;
        const by = (b.y + 0.5) * this.cellSize;
        if (distanceToSegmentSq(x, y, ax, ay, bx, by) <= radiusSq) return true;
      }
      return false;
    }
  }

  function drawPath(graphics, cells, cellSize, color, width, alpha) {
    if (!cells.length) return;
    graphics.moveTo((cells[0].x + 0.5) * cellSize, (cells[0].y + 0.5) * cellSize);
    for (let i = 1; i < cells.length; i++) {
      graphics.lineTo((cells[i].x + 0.5) * cellSize, (cells[i].y + 0.5) * cellSize);
    }
    graphics.stroke({ width, color, alpha, cap: "round", join: "round" });
  }

  function drawArrow(graphics, piece, cellSize, color, accent, dir) {
    const front = getArrowEndpoint(piece.cells, piece.dir);
    const cx = (front.x + 0.5) * cellSize;
    const cy = (front.y + 0.5) * cellSize;
    const size = cellSize * 0.22;
    const len = cellSize * 0.48;
    const points = [
      { x: len * 0.62, y: 0 },
      { x: -len * 0.32, y: -size },
      { x: -len * 0.32, y: size },
    ].map(point => rotate(point, dir.angle));
    graphics.poly(points.map(point => [cx + point.x, cy + point.y]).flat())
      .fill({ color, alpha: 0.98 });
    graphics.poly(points.map(point => [cx + point.x, cy + point.y]).flat())
      .stroke({ width: Math.max(0.8, cellSize * 0.014), color: accent, alpha: 0.5, join: "round" });
  }

  function drawNodeCaps(graphics, cells, cellSize, color) {
    if (!cells.length) return;
    const endpoints = [cells[0], cells[cells.length - 1]];
    for (const cell of endpoints) {
      graphics.circle((cell.x + 0.5) * cellSize, (cell.y + 0.5) * cellSize, Math.max(2, cellSize * 0.075))
        .fill({ color, alpha: 0.92 });
    }
  }

  function buildExitTrack(piece, cellSize, boardW, boardH) {
    const dir = DIRS[piece.dir];
    const orderedCells = getOrderedCellsForExit(piece.cells, piece.dir);
    const pathPoints = orderedCells.map(cell => ({
      x: (cell.x + 0.5) * cellSize,
      y: (cell.y + 0.5) * cellSize,
    }));
    const head = pathPoints[pathPoints.length - 1];
    const pathLength = Math.max(polylineLength(pathPoints), cellSize * 0.35);
    let distanceToEdge = cellSize;
    if (piece.dir === "R") distanceToEdge = boardW - head.x;
    if (piece.dir === "L") distanceToEdge = head.x;
    if (piece.dir === "D") distanceToEdge = boardH - head.y;
    if (piece.dir === "U") distanceToEdge = head.y;
    const exitDistance = Math.max(cellSize * 2.2, distanceToEdge + pathLength + cellSize * 1.35);
    const points = pathPoints.concat({
      x: head.x + dir.x * exitDistance,
      y: head.y + dir.y * exitDistance,
    });
    return {
      points,
      pathLength,
      totalLength: polylineLength(points),
    };
  }

  function getOrderedCellsForExit(cells, dir) {
    const front = getArrowEndpoint(cells, dir);
    if (sameCell(front, cells[0])) return cells.slice().reverse();
    return cells.slice();
  }

  function drawFlowWindow(graphics, points, startDist, endDist, cellSize, color, dir) {
    const windowPoints = slicePolyline(points, startDist, endDist);
    if (windowPoints.length < 2) return;

    const visible = Math.max(0, endDist - startDist);
    const head = pointAtDistance(points, endDist);
    const alpha = clamp(visible / (cellSize * 0.6), 0, 1);

    drawPolylinePoints(graphics, windowPoints, Math.max(5, cellSize * 0.46), color.glow, 0.3 * alpha);
    drawPolylinePoints(graphics, windowPoints, Math.max(4, cellSize * 0.36), color.main, 0.26 * alpha);
    drawPolylinePoints(graphics, windowPoints, Math.max(4.2, cellSize * 0.34), color.main, 0.98 * alpha);
    drawPolylinePoints(graphics, windowPoints, Math.max(1.6, cellSize * 0.085), color.hot, 0.86 * alpha);
    drawFlowArrow(graphics, head, DIRS[dir], cellSize, color.main, color.hot, alpha);
  }

  function drawPolylinePoints(graphics, points, width, color, alpha) {
    if (points.length < 2) return;
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.stroke({ width, color, alpha, cap: "round", join: "round" });
  }

  function drawFlowArrow(graphics, head, dir, cellSize, color, accent, alpha) {
    if (!head || alpha <= 0) return;
    const angle = dir.angle;
    const size = cellSize * 0.22;
    const len = cellSize * 0.48;
    const points = [
      { x: len * 0.62, y: 0 },
      { x: -len * 0.32, y: -size },
      { x: -len * 0.32, y: size },
    ].map(point => rotate(point, angle));
    graphics.poly(points.map(point => [head.x + point.x, head.y + point.y]).flat())
      .fill({ color, alpha: 0.98 * alpha });
    graphics.poly(points.map(point => [head.x + point.x, head.y + point.y]).flat())
      .stroke({ width: Math.max(0.8, cellSize * 0.014), color: accent, alpha: 0.5 * alpha, join: "round" });
  }

  function slicePolyline(points, startDist, endDist) {
    const total = polylineLength(points);
    const start = clamp(startDist, 0, total);
    const end = clamp(endDist, 0, total);
    if (end - start <= 0.1) return [];

    const sliced = [];
    let cursor = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const len = pointDistance(a, b);
      if (len <= 0) continue;
      const next = cursor + len;
      if (end < cursor) break;
      if (start <= next && end >= cursor) {
        const from = clamp((start - cursor) / len, 0, 1);
        const to = clamp((end - cursor) / len, 0, 1);
        if (to > from) {
          const p0 = lerpPoint(a, b, from);
          const p1 = lerpPoint(a, b, to);
          if (!sliced.length || !samePoint(sliced[sliced.length - 1], p0)) sliced.push(p0);
          sliced.push(p1);
        }
      }
      cursor = next;
    }
    return sliced;
  }

  function pointAtDistance(points, distance) {
    const total = polylineLength(points);
    const target = clamp(distance, 0, total);
    let cursor = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const len = pointDistance(a, b);
      if (len <= 0) continue;
      if (target <= cursor + len) {
        return lerpPoint(a, b, (target - cursor) / len);
      }
      cursor += len;
    }
    return points[points.length - 1] || null;
  }

  function polylineLength(points) {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      total += pointDistance(points[i], points[i + 1]);
    }
    return total;
  }

  function pointDistance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lerpPoint(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
  }

  function sameCell(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y;
  }

  function samePoint(a, b) {
    return !!a && !!b && Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
  }

  function getArrowEndpoint(cells, dir) {
    if (cells.length >= 2) {
      const first = cells[0];
      const second = cells[1];
      const firstDir = vectorToDir(first.x - second.x, first.y - second.y);
      if (firstDir === dir) return first;

      const last = cells[cells.length - 1];
      const prev = cells[cells.length - 2];
      const lastDir = vectorToDir(last.x - prev.x, last.y - prev.y);
      if (lastDir === dir) return last;
    }
    return getDirectionalCell(cells, dir);
  }

  function getDirectionalCell(cells, dir) {
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

  function getTerminalDirections(cells) {
    if (cells.length < 2) return DIR_KEYS.slice();
    const first = cells[0];
    const second = cells[1];
    const last = cells[cells.length - 1];
    const prev = cells[cells.length - 2];
    return unique([
      vectorToDir(first.x - second.x, first.y - second.y),
      vectorToDir(last.x - prev.x, last.y - prev.y),
    ].filter(Boolean));
  }

  function vectorToDir(x, y) {
    if (x === 1 && y === 0) return "R";
    if (x === -1 && y === 0) return "L";
    if (x === 0 && y === 1) return "D";
    if (x === 0 && y === -1) return "U";
    return null;
  }

  function unique(values) {
    return values.filter((value, index) => values.indexOf(value) === index);
  }

  function distanceToSegmentSq(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const lenSq = vx * vx + vy * vy;
    if (lenSq <= 0) {
      const dx = px - ax;
      const dy = py - ay;
      return dx * dx + dy * dy;
    }
    const t = clamp((wx * vx + wy * vy) / lenSq, 0, 1);
    const cx = ax + t * vx;
    const cy = ay + t * vy;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
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

  function easeInOutCubic(value) {
    return value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;
  }

  function calculateClearedLevel(level) {
    return Math.max(1, level | 0);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function readInt(name, fallback) {
    const value = parseInt(localStorage.getItem(name) || "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  function waitMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
