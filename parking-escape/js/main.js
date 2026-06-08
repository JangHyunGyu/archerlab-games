(async function () {
  "use strict";

  if (document.readyState === "loading") {
    await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }

  const ASSETS = {
    menu: "assets/ui/menu-bg.png",
    board: "assets/ui/board-surface.png",
    cinematicBoard: "assets/ui/game-board-cinematic.png",
    asphaltTile: "assets/ui/asphalt-tile.png",
  };

  const VEHICLE_ASSETS = [
    "assets/vehicles/red.png",
    "assets/vehicles/blue.png",
    "assets/vehicles/yellow.png",
    "assets/vehicles/white.png",
    "assets/vehicles/green-truck.png",
    "assets/vehicles/purple-bus.png",
    "assets/vehicles/orange.png",
    "assets/vehicles/black.png",
  ];

  const STORAGE = {
    level: "archerlab-parking-level",
    bestLevel: "archerlab-parking-best-level",
    bestMoves: "archerlab-parking-best-moves",
  };

  const RANK_API_BASE = "https://game-api.yama5993.workers.dev";
  const GAME_ID = "parking_escape";
  const RANK_LIMIT = 20;
  const NICK_KEY = "archerlab-parking-nick";
  const LEVEL_TIME_LIMIT = 30;

  const CAR_PALETTE = [
    { body: 0xff334a, dark: 0x8c1422, light: 0xffd5d9, glass: 0x10243d, glow: 0xff5064 },
    { body: 0x2f8cff, dark: 0x0e3f8e, light: 0xcde8ff, glass: 0x071b33, glow: 0x4fb4ff },
    { body: 0xffc533, dark: 0x9b6a08, light: 0xfff1b8, glass: 0x211507, glow: 0xffd45a },
    { body: 0x43d36f, dark: 0x166b32, light: 0xd8ffe2, glass: 0x071c10, glow: 0x55ee8b },
    { body: 0xa66bff, dark: 0x4d2494, light: 0xf0e4ff, glass: 0x160b2c, glow: 0xba86ff },
    { body: 0xf2f5fa, dark: 0x8c98a6, light: 0xffffff, glass: 0x182234, glow: 0xddeaff },
    { body: 0x101827, dark: 0x05080f, light: 0xb6c7e3, glass: 0x02050a, glow: 0x5f8dff },
    { body: 0xff8a2a, dark: 0x91400e, light: 0xffdfbd, glass: 0x201005, glow: 0xffa24a },
  ];

  const $ = id => document.getElementById(id);
  const dom = {
    container: $("game-container"),
    menu: $("menu"),
    hud: $("hud"),
    loading: $("loading-screen"),
    modal: $("complete-modal"),
    toast: $("toast"),
    level: $("level-label"),
    time: $("time-label"),
    timeStat: $("time-stat"),
    moves: $("moves-label"),
    left: $("left-label"),
    bestLevel: $("best-level-label"),
    bestMoves: $("best-moves-label"),
    clearMoves: $("clear-moves"),
    clearMovesLabel: $("clear-moves-label"),
    nextLevel: $("next-level-label"),
    nextLevelCaption: $("next-level-caption"),
    loadingLevel: $("loading-level-label"),
    clearLevel: $("clear-level"),
    clearLevelCaption: $("clear-level-caption"),
    clearKicker: $("clear-kicker"),
    clearTitle: $("clear-title"),
    play: $("play-btn"),
    continue: $("continue-btn"),
    rank: $("rank-btn"),
    next: $("next-btn"),
    home: $("home-btn"),
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
  app.stage.eventMode = "static";

  let textures = {};
  try {
    textures = await PIXI.Assets.load([ASSETS.menu, ASSETS.board, ASSETS.cinematicBoard, ASSETS.asphaltTile, ...VEHICLE_ASSETS]);
  } catch (error) {
    console.warn("[Parking] asset load failed; using vector fallback.", error);
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
  }

  class ParkingGame {
    constructor() {
      this.level = readInt(STORAGE.level, 1);
      this.bestLevel = readInt(STORAGE.bestLevel, 1);
      this.bestMoves = readInt(STORAGE.bestMoves, 0);
      this.moves = 0;
      this.timeLeft = LEVEL_TIME_LIMIT;
      this.gridW = 6;
      this.gridH = 6;
      this.exitRow = 3;
      this.exitSide = "left";
      this.cell = 68;
      this.boardX = 0;
      this.boardY = 0;
      this.boardW = 0;
      this.boardH = 0;
      this.vehicles = [];
      this.vehicleMap = new Map();
      this.tweens = [];
      this.mode = "menu";
      this.animating = false;
      this.drag = null;
      this.levelSeed = 0;
      this.initialVehicleCount = 0;
      this.lastClear = null;
      this.runMoves = 0;
      this.runRecord = null;
      this.nextLevelTarget = this.level + 1;
      this.startToken = 0;
      this.resizeQueued = false;
      this.orientationTimer = null;
      this.rankSessionId = null;
      this.rankSessionPromise = null;
      this.rankSyncFailed = false;
      this.sound = new (window.ParkingSoundManager || class {
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

      this.vehicleLayer = new PIXI.Container();
      this.vehicleLayer.sortableChildren = true;
      this.boardLayer.addChild(this.vehicleLayer);

      this.fxLayer = new PIXI.Container();
      this.boardLayer.addChild(this.fxLayer);

      this.createBackdrop();
      this.bindUI();
      this.updateMenu();
      this.resize();

      app.ticker.add(ticker => this.update(ticker.deltaMS));
      window.addEventListener("resize", () => this.queueResize(), { passive: true });
      window.addEventListener("orientationchange", () => {
        clearTimeout(this.orientationTimer);
        this.orientationTimer = setTimeout(() => this.queueResize(), 250);
      }, { passive: true });
      window.addEventListener("blur", () => this.cancelDrag(), { passive: true });
      document.addEventListener("pointerdown", () => this.ensureAudio(), { once: true, passive: true });
    }

    resetRankSessionState() {
      this.rankSessionId = null;
      this.rankSessionPromise = null;
      this.rankSyncFailed = false;
    }

    async createRankSession() {
      const response = await fetch(`${RANK_API_BASE}/score-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID }),
      });
      if (!response.ok) throw new Error(`rank session ${response.status}`);
      const data = await response.json();
      if (!data || !data.session_id) throw new Error("invalid rank session response");
      this.rankSessionId = data.session_id;
      return this.rankSessionId;
    }

    startRankSession() {
      this.resetRankSessionState();
      this.rankSessionPromise = this.createRankSession().catch(error => {
        this.rankSyncFailed = true;
        console.warn("[Parking] rank session failed:", error.message);
        return null;
      });
    }

    ensureRankSession() {
      if (this.rankSessionId) return Promise.resolve(this.rankSessionId);
      if (!this.rankSessionPromise) {
        this.rankSessionPromise = this.createRankSession().catch(error => {
          this.rankSyncFailed = true;
          throw error;
        });
      }
      return this.rankSessionPromise;
    }

    async recordRankClear(clearData) {
      if (this.rankSyncFailed || !clearData) return false;
      try {
        const sessionId = await this.ensureRankSession();
        if (!sessionId) return false;
        const response = await fetch(`${RANK_API_BASE}/score-events`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            game_id: GAME_ID,
            session_id: sessionId,
            event: {
              type: "level_clear",
              score: clearData.rankLevel,
              level: clearData.rankLevel,
              cleared_level: clearData.rankLevel,
              moves: clearData.moves,
              level_moves: clearData.levelMoves,
              vehicles: clearData.vehicles,
              cleared_before_timeout: clearData.clearedBeforeTimeout || null,
              failed_level: clearData.failedLevel || null,
              timed_out: !!clearData.timedOut,
            },
          }),
        });
        if (!response.ok) throw new Error(`rank event ${response.status}`);
        const data = await response.json().catch(() => null);
        if (!data || data.success !== true) throw new Error("invalid rank event response");
        return true;
      } catch (error) {
        this.rankSyncFailed = true;
        console.warn("[Parking] rank sync failed:", error.message);
        return false;
      }
    }

    bindUI() {
      dom.play.addEventListener("click", () => this.start(1));
      dom.continue.addEventListener("click", () => this.start(this.level));
      dom.next.addEventListener("click", () => this.start(this.nextLevelTarget || this.level + 1));
      dom.home.addEventListener("click", () => this.showMenu());
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
        this.bgSprite.alpha = 0.44;
        this.backdrop.addChild(this.bgSprite);
      }
      this.bgWash = new PIXI.Graphics();
      this.backdrop.addChild(this.bgWash);
      this.bgSparks = [];
      for (let i = 0; i < 52; i++) {
        const spark = new PIXI.Graphics();
        spark.circle(0, 0, 1 + Math.random() * 1.8).fill({
          color: i % 6 === 0 ? 0xffc65a : 0x5fefff,
          alpha: 0.32 + Math.random() * 0.34,
        });
        spark.baseX = Math.random();
        spark.baseY = Math.random();
        spark.speed = 0.00008 + Math.random() * 0.00018;
        spark.phase = Math.random() * Math.PI * 2;
        this.backdrop.addChild(spark);
        this.bgSparks.push(spark);
      }
    }

    async start(level) {
      if (this.mode === "loading") return;
      const token = ++this.startToken;
      const targetLevel = Math.max(1, level | 0);
      const continuesRun = this.mode === "complete" && targetLevel === this.nextLevelTarget && !!this.runRecord;
      if (targetLevel <= 1 || !this.rankSessionId || !continuesRun) this.startRankSession();
      this.level = targetLevel;
      localStorage.setItem(STORAGE.level, String(this.level));
      this.moves = 0;
      this.timeLeft = LEVEL_TIME_LIMIT;
      this.lastClear = null;
      if (!continuesRun) {
        this.runMoves = 0;
        this.runRecord = null;
      }
      this.cancelDrag();
      this.cancelTweens({ clearFx: true });
      this.mode = "loading";
      this.animating = false;
      dom.menu.classList.add("hidden");
      dom.modal.classList.add("hidden");
      dom.rankModal.classList.add("hidden");
      dom.hud.classList.add("hidden");
      this.boardLayer.visible = false;
      this.showLoading(this.level);
      await nextFrame();
      await waitMs(80);
      const ready = this.generateLevel(this.level, token);
      if (!ready || token !== this.startToken) return;
      this.hideLoading();
      this.mode = "playing";
      dom.hud.classList.remove("hidden");
      this.boardLayer.visible = true;
      this.resize();
      this.updateHud();
      this.playTone("start");
    }

    generateLevel(level, token) {
      if (token !== this.startToken) return false;
      this.levelSeed = createLevelSeed(level);
      const config = getParkingConfig(level);
      const puzzle = createParkingPuzzle(config, this.levelSeed);
      this.gridW = config.size;
      this.gridH = config.size;
      this.exitRow = config.exitRow;
      this.exitSide = config.exitSide;
      this.levelMetrics = puzzle.metrics || null;
      this.vehicles = puzzle.vehicles.map((vehicle, index) => ({
        ...cloneVehicle(vehicle),
        id: vehicle.id || `v${index}`,
        container: null,
      }));
      this.vehicleMap = new Map(this.vehicles.map(vehicle => [vehicle.id, vehicle]));
      this.initialVehicleCount = this.vehicles.length;
      return true;
    }

    showMenu() {
      this.startToken += 1;
      this.mode = "menu";
      this.animating = false;
      this.cancelDrag();
      this.cancelTweens({ clearFx: true });
      this.boardLayer.visible = false;
      dom.hud.classList.add("hidden");
      dom.modal.classList.add("hidden");
      dom.rankModal.classList.add("hidden");
      dom.loading.classList.add("hidden");
      dom.menu.classList.remove("hidden");
      this.updateMenu();
      this.playTone("button");
      this.resize();
    }

    updateMenu() {
      this.bestLevel = Math.max(this.bestLevel, readInt(STORAGE.bestLevel, 1));
      this.bestMoves = readInt(STORAGE.bestMoves, 0);
      dom.bestLevel.textContent = String(this.bestLevel);
      dom.bestMoves.textContent = this.bestMoves > 0 ? String(this.bestMoves) : "-";
      dom.continue.disabled = this.level <= 1 && this.bestLevel <= 1;
    }

    showLoading(level) {
      if (dom.loadingLevel) dom.loadingLevel.textContent = String(level);
      if (dom.loading) dom.loading.classList.remove("hidden");
    }

    hideLoading() {
      if (dom.loading) dom.loading.classList.add("hidden");
    }

    queueResize() {
      if (this.resizeQueued) return;
      this.resizeQueued = true;
      requestAnimationFrame(() => {
        this.resizeQueued = false;
        this.cancelDrag();
        this.resize();
      });
    }

    resize() {
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const topSafe = viewportW < 620 ? 104 : 126;
      const bottomSafe = viewportW < 620 ? 24 : 42;
      const side = viewportW < 620 ? 14 : 46;
      const maxBoardW = viewportW - side * 2;
      const maxBoardH = viewportH - topSafe - bottomSafe;
      const exitExtra = this.exitSide === "left" ? 0.9 : 0;
      const rawCell = Math.floor(Math.min(maxBoardW / (this.gridW + exitExtra), maxBoardH / this.gridH));
      const minCell = viewportW < 390 ? 44 : viewportW < 620 ? 48 : 58;
      const maxCell = viewportW < 620 ? 66 : 86;
      this.cell = clamp(rawCell, minCell, maxCell);
      const visualPad = Math.round((textures[ASSETS.cinematicBoard] ? 1.16 : 0.9) * this.cell);
      this.boardW = this.cell * this.gridW;
      this.boardH = this.cell * this.gridH;

      const contentW = Math.max(viewportW, this.boardW + side * 2 + visualPad * 2);
      const contentH = Math.max(viewportH, this.boardH + topSafe + bottomSafe + visualPad);
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
      app.stage.hitArea = new PIXI.Rectangle(0, 0, width, height);
      this.bgWash.clear();
      this.bgWash.rect(0, 0, width, height).fill({ color: 0x030712, alpha: 0.5 });
      this.bgWash.rect(0, 0, width, height).fill({ color: 0x07182b, alpha: 0.18 });
      if (this.bgSprite) coverSprite(this.bgSprite, width, height);
      for (const spark of this.bgSparks) {
        spark.x = spark.baseX * width;
        spark.y = spark.baseY * height;
      }

      this.boardX = Math.round(Math.max(side + visualPad, (width - this.boardW) / 2));
      this.boardY = Math.round(topSafe + Math.max(0, (height - topSafe - bottomSafe - this.boardH) / 2));
      this.boardLayer.position.set(this.boardX, this.boardY);

      if (this.mode === "playing" && !this.animating) {
        this.cancelTweens({ clearFx: true });
        this.renderBoard();
      }
    }

    renderBoard() {
      for (const vehicle of this.vehicles) vehicle.container = null;
      clearLayer(this.surfaceLayer);
      clearLayer(this.gridLayer);
      clearLayer(this.vehicleLayer);
      clearLayer(this.fxLayer);

      const hasCinematicBoard = !!textures[ASSETS.cinematicBoard];
      const pad = Math.round(this.cell * (hasCinematicBoard ? 1.16 : 0.34));

      const platformShadow = new PIXI.Graphics();
      platformShadow.roundRect(-pad * 0.66, -pad * 0.38, this.boardW + pad * 1.32, this.boardH + pad * 1.18, this.cell * 0.34)
        .fill({ color: 0x000000, alpha: hasCinematicBoard ? 0.46 : 0.24 });
      platformShadow.y = this.cell * 0.18;
      this.surfaceLayer.addChild(platformShadow);

      const boardTexture = textures[ASSETS.cinematicBoard] || textures[ASSETS.board];
      if (boardTexture) {
        const surface = new PIXI.Sprite(boardTexture);
        surface.x = -pad;
        surface.y = -pad;
        surface.width = this.boardW + pad * 2;
        surface.height = this.boardH + pad * 2;
        surface.alpha = hasCinematicBoard ? 0.9 : 0.92;
        this.surfaceLayer.addChild(surface);
      } else {
        const fallback = new PIXI.Graphics();
        fallback.roundRect(-pad, -pad, this.boardW + pad * 2, this.boardH + pad * 2, this.cell * 0.2)
          .fill({ color: 0x111a24, alpha: 0.96 });
        this.surfaceLayer.addChild(fallback);
      }

      this.drawTileSurface(hasCinematicBoard);
      this.drawBoardChrome(pad, hasCinematicBoard);
      for (const vehicle of this.vehicles) this.drawVehicle(vehicle);
    }

    drawTileSurface(hasCinematicBoard = false) {
      const base = new PIXI.Graphics();
      base.roundRect(-this.cell * 0.02, -this.cell * 0.02, this.boardW + this.cell * 0.04, this.boardH + this.cell * 0.04, this.cell * 0.08)
        .fill({ color: 0x071018, alpha: hasCinematicBoard ? 0.96 : 0.88 });
      this.surfaceLayer.addChild(base);

      const tileTexture = textures[ASSETS.asphaltTile];
      for (let y = 0; y < this.gridH; y++) {
        for (let x = 0; x < this.gridW; x++) {
          const tx = x * this.cell + this.cell * 0.055;
          const ty = y * this.cell + this.cell * 0.055;
          const size = this.cell * 0.89;
          if (tileTexture) {
            const tile = new PIXI.Sprite(tileTexture);
            tile.x = tx;
            tile.y = ty;
            tile.width = size;
            tile.height = size;
            tile.alpha = 0.94;
            tile.tint = ((x + y) % 3 === 0) ? 0xf6fbff : ((x * 7 + y * 11) % 4 === 0 ? 0xe9f2f7 : 0xffffff);
            this.surfaceLayer.addChild(tile);
          } else {
            const fallback = new PIXI.Graphics();
            fallback.roundRect(tx, ty, size, size, this.cell * 0.05)
              .fill({ color: 0x111a22, alpha: 0.96 });
            this.surfaceLayer.addChild(fallback);
          }
        }
      }
    }

    drawBoardChrome(pad, hasCinematicBoard = false) {
      const g = new PIXI.Graphics();
      const lineColor = 0xd9e7ed;
      const exitY = this.exitRow * this.cell;
      const exitGapY = exitY + this.cell * 0.08;
      const exitGapH = this.cell * 0.84;

      g.roundRect(-pad * 0.72, -pad * 0.46, this.boardW + pad * 1.44, this.boardH + pad * 1.1, this.cell * 0.22)
        .stroke({ width: Math.max(2, this.cell * 0.04), color: 0x79eaff, alpha: hasCinematicBoard ? 0.2 : 0.28 });
      g.roundRect(0, 0, this.boardW, this.boardH, this.cell * 0.08)
        .fill({ color: 0x07101b, alpha: hasCinematicBoard ? 0.08 : 0.2 })
        .stroke({ width: Math.max(2, this.cell * 0.035), color: 0xf3f8ff, alpha: hasCinematicBoard ? 0.18 : 0.3 });

      for (let x = 1; x < this.gridW; x++) {
        g.moveTo(x * this.cell, 0).lineTo(x * this.cell, this.boardH)
          .stroke({ width: Math.max(1, this.cell * 0.012), color: lineColor, alpha: hasCinematicBoard ? 0.08 : 0.14 });
      }
      for (let y = 1; y < this.gridH; y++) {
        g.moveTo(0, y * this.cell).lineTo(this.boardW, y * this.cell)
          .stroke({ width: Math.max(1, this.cell * 0.012), color: lineColor, alpha: hasCinematicBoard ? 0.08 : 0.14 });
      }

      for (let y = 0; y < this.gridH; y++) {
        for (let x = 0; x < this.gridW; x++) {
          g.roundRect(x * this.cell + this.cell * 0.1, y * this.cell + this.cell * 0.1, this.cell * 0.8, this.cell * 0.8, this.cell * 0.05)
            .stroke({ width: Math.max(1, this.cell * 0.012), color: 0xdfe8ef, alpha: hasCinematicBoard ? 0.2 : 0.1 });
        }
      }

      if (hasCinematicBoard) {
        g.roundRect(-this.cell * 1.02, exitY + this.cell * 0.1, this.cell * 0.94, this.cell * 0.8, this.cell * 0.16)
          .fill({ color: 0x110b04, alpha: 0.56 })
          .stroke({ width: Math.max(1, this.cell * 0.02), color: 0xffc34a, alpha: 0.34 });
        g.roundRect(-this.cell * 1.1, exitY + this.cell * 0.2, this.cell, this.cell * 0.6, this.cell * 0.18)
          .fill({ color: 0xffb931, alpha: 0.11 });
      }
      g.rect(-this.cell * 0.16, exitGapY, this.cell * 0.2, exitGapH)
        .fill({ color: 0x07101b, alpha: hasCinematicBoard ? 0.82 : 0.92 });
      g.roundRect(-this.cell * 0.86, exitY + this.cell * 0.1, this.cell * 0.72, this.cell * 0.8, this.cell * 0.12)
        .fill({ color: hasCinematicBoard ? 0x1d1405 : 0x0d2d35, alpha: hasCinematicBoard ? 0.24 : 0.78 })
        .stroke({ width: Math.max(2, this.cell * 0.03), color: hasCinematicBoard ? 0xffc34a : 0x68f5ff, alpha: hasCinematicBoard ? 0.48 : 0.76 });
      g.roundRect(-this.cell * 1.16, exitY + this.cell * 0.18, this.cell * 1.04, this.cell * 0.64, this.cell * 0.18)
        .fill({ color: 0xffb931, alpha: hasCinematicBoard ? 0.14 : 0.08 });
      for (let i = 0; i < 3; i++) {
        const cx = -this.cell * (0.52 + i * 0.22);
        g.moveTo(cx + this.cell * 0.08, exitY + this.cell * 0.3)
          .lineTo(cx - this.cell * 0.08, exitY + this.cell * 0.5)
          .lineTo(cx + this.cell * 0.08, exitY + this.cell * 0.7)
          .stroke({ width: Math.max(3, this.cell * 0.065), color: 0xffc34a, alpha: 0.94 - i * 0.12, cap: "round", join: "round" });
      }

      this.drawRimLights(g, pad);

      this.gridLayer.addChild(g);
    }

    drawRimLights(g, pad) {
      const lightW = this.cell * 0.5;
      const lightH = Math.max(3, this.cell * 0.06);
      const amber = 0xffb63f;
      const cyan = 0x5eeeff;
      for (let i = 0; i < 4; i++) {
        const x = this.boardW * (0.16 + i * 0.23);
        g.roundRect(x, -pad * 0.76, lightW, lightH, lightH * 0.5).fill({ color: amber, alpha: 0.48 });
        g.roundRect(x, this.boardH + pad * 0.62, lightW, lightH, lightH * 0.5).fill({ color: amber, alpha: 0.38 });
      }
      g.roundRect(-pad * 0.86, -pad * 0.6, lightW, lightH, lightH * 0.5).fill({ color: cyan, alpha: 0.48 });
      g.roundRect(this.boardW + pad * 0.36, -pad * 0.6, lightW, lightH, lightH * 0.5).fill({ color: cyan, alpha: 0.42 });
      g.roundRect(-pad * 0.86, this.boardH + pad * 0.48, lightW, lightH, lightH * 0.5).fill({ color: cyan, alpha: 0.42 });
      g.roundRect(this.boardW + pad * 0.36, this.boardH + pad * 0.48, lightW, lightH, lightH * 0.5).fill({ color: cyan, alpha: 0.42 });
    }

    drawVehicle(vehicle) {
      const container = new PIXI.Container();
      container.eventMode = "static";
      container.cursor = "grab";
      container.vehicleId = vehicle.id;
      container.zIndex = vehicle.target ? 10 : 1;
      vehicle.container = container;
      container.position.set(vehicle.x * this.cell, vehicle.y * this.cell);
      container.hitArea = new PIXI.Rectangle(0, 0, vehicle.w * this.cell, vehicle.h * this.cell);

      drawCar(container, vehicle, this.cell);
      container.on("pointerdown", event => this.beginDrag(event, vehicle));
      this.vehicleLayer.addChild(container);
    }

    beginDrag(event, vehicle) {
      if (this.mode !== "playing" || this.animating || this.drag) return;
      if (event.nativeEvent && event.nativeEvent.cancelable) event.nativeEvent.preventDefault();
      this.playTone("button");
      const range = this.getMoveRange(vehicle);
      this.drag = {
        vehicle,
        pointerId: event.pointerId,
        startX: event.global.x,
        startY: event.global.y,
        originX: vehicle.x,
        originY: vehicle.y,
        range,
      };
      vehicle.container.cursor = "grabbing";
      vehicle.container.zIndex = 20;
      vehicle.container.alpha = 0.96;
      app.stage.on("pointermove", this.boundMove || (this.boundMove = event => this.moveDrag(event)));
      app.stage.on("pointerup", this.boundEnd || (this.boundEnd = event => this.endDrag(event)));
      app.stage.on("pointerupoutside", this.boundEnd);
    }

    cancelDrag() {
      if (!this.drag) return;
      app.stage.off("pointermove", this.boundMove);
      app.stage.off("pointerup", this.boundEnd);
      app.stage.off("pointerupoutside", this.boundEnd);
      const vehicle = this.drag.vehicle;
      if (vehicle && vehicle.container && !vehicle.container.destroyed) {
        vehicle.container.cursor = "grab";
        vehicle.container.alpha = 1;
        vehicle.container.zIndex = vehicle.target ? 10 : 1;
      }
      this.drag = null;
    }

    cancelTweens({ clearFx = false } = {}) {
      this.tweens = [];
      if (clearFx && this.fxLayer) clearLayer(this.fxLayer);
    }

    moveDrag(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const { vehicle, originX, originY, startX, startY, range } = this.drag;
      if (vehicle.axis === "H") {
        const dx = Math.round((event.global.x - startX) / this.cell);
        const nextX = clamp(originX + dx, range.min, range.max);
        vehicle.container.x = nextX * this.cell;
      } else {
        const dy = Math.round((event.global.y - startY) / this.cell);
        const nextY = clamp(originY + dy, range.min, range.max);
        vehicle.container.y = nextY * this.cell;
      }
    }

    endDrag(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const { vehicle, originX, originY, range } = this.drag;
      app.stage.off("pointermove", this.boundMove);
      app.stage.off("pointerup", this.boundEnd);
      app.stage.off("pointerupoutside", this.boundEnd);

      let moved = false;
      let movedCells = 0;
      if (vehicle.axis === "H") {
        const nextX = clamp(Math.round(vehicle.container.x / this.cell), range.min, range.max);
        vehicle.x = nextX;
        vehicle.container.x = nextX * this.cell;
        moved = nextX !== originX;
        movedCells = Math.abs(nextX - originX);
      } else {
        const nextY = clamp(Math.round(vehicle.container.y / this.cell), range.min, range.max);
        vehicle.y = nextY;
        vehicle.container.y = nextY * this.cell;
        moved = nextY !== originY;
        movedCells = Math.abs(nextY - originY);
      }

      vehicle.container.cursor = "grab";
      vehicle.container.alpha = 1;
      vehicle.container.zIndex = vehicle.target ? 10 : 1;
      this.drag = null;

      if (!moved) {
        this.blockPulse(vehicle);
        return;
      }

      this.moves += 1;
      this.updateHud();
      this.playTone(vehicle.target ? "targetMove" : "move", clamp(0.26 + movedCells * 0.18, 0.35, 0.95));

      if (vehicle.target && this.canTargetExit()) {
        this.exitTarget(vehicle);
      }
    }

    getMoveRange(vehicle) {
      const occupied = makeVehicleOccupancy(this.vehicles, vehicle.id);
      if (vehicle.axis === "H") {
        let min = vehicle.x;
        while (min > 0 && !occupied.has(key(min - 1, vehicle.y))) min -= 1;
        let max = vehicle.x;
        while (max + vehicle.w < this.gridW && !occupied.has(key(max + vehicle.w, vehicle.y))) max += 1;
        return { min, max };
      }

      let min = vehicle.y;
      while (min > 0 && !occupied.has(key(vehicle.x, min - 1))) min -= 1;
      let max = vehicle.y;
      while (max + vehicle.h < this.gridH && !occupied.has(key(vehicle.x, max + vehicle.h))) max += 1;
      return { min, max };
    }

    canTargetExit() {
      const target = this.vehicles.find(vehicle => vehicle.target);
      if (!target || target.axis !== "H") return false;
      if (target.x > 0) return false;
      const occupied = makeVehicleOccupancy(this.vehicles, target.id);
      for (let x = 0; x < target.x; x++) {
        if (occupied.has(key(x, target.y))) return false;
      }
      return true;
    }

    exitTarget(vehicle) {
      this.animating = true;
      vehicle.container.eventMode = "none";
      const startX = vehicle.container.x;
      const endX = -this.cell * 1.9;
      this.spawnExitGlow(vehicle);
      this.playTone("exit", 0.95);
      this.tweens.push({
        duration: 680,
        elapsed: 0,
        update: t => {
          const eased = easeOutCubic(t);
          vehicle.container.x = startX + (endX - startX) * eased;
          vehicle.container.alpha = 1 - clamp((t - 0.68) / 0.32, 0, 1);
          return t >= 1;
        },
        done: () => {
          this.vehicleLayer.removeChild(vehicle.container);
          this.completeLevel();
        },
      });
    }

    spawnExitGlow(vehicle) {
      const y = (vehicle.y + 0.5) * this.cell;
      const g = new PIXI.Graphics();
      this.fxLayer.addChild(g);
      this.tweens.push({
        duration: 700,
        elapsed: 0,
        update: t => {
          g.clear();
          const alpha = 1 - t;
          g.roundRect(-this.cell * 1.1, y - this.cell * 0.42, this.cell * 1.45, this.cell * 0.84, this.cell * 0.16)
            .fill({ color: 0xffd05a, alpha: 0.18 * alpha });
          g.moveTo(this.cell * 0.18, y).lineTo(-this.cell * 0.95, y)
            .stroke({ width: Math.max(4, this.cell * 0.08), color: 0xffd05a, alpha: 0.9 * alpha, cap: "round" });
          return t >= 1;
        },
        done: () => this.fxLayer.removeChild(g),
      });
    }

    blockPulse(vehicle) {
      this.playTone("blocked");
      this.showToast("이 방향으로는 움직일 수 없습니다");
      const originalX = vehicle.container.x;
      const originalY = vehicle.container.y;
      this.tweens.push({
        duration: 220,
        elapsed: 0,
        update: t => {
          const wobble = Math.sin(t * Math.PI * 5) * (1 - t) * this.cell * 0.05;
          if (vehicle.axis === "H") vehicle.container.x = originalX + wobble;
          else vehicle.container.y = originalY + wobble;
          return t >= 1;
        },
        done: () => vehicle.container.position.set(originalX, originalY),
      });
    }

    update(deltaMS) {
      const width = app.screen.width;
      const height = app.screen.height;
      for (const spark of this.bgSparks) {
        spark.phase += deltaMS * spark.speed;
        spark.x = spark.baseX * width + Math.sin(spark.phase) * 10;
        spark.y = spark.baseY * height + Math.cos(spark.phase * 0.8) * 7;
      }

      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const tween = this.tweens[i];
        tween.elapsed += deltaMS;
        const t = clamp(tween.elapsed / tween.duration, 0, 1);
        if (tween.update(t)) {
          if (tween.done) tween.done();
          this.tweens.splice(i, 1);
        }
      }

      if (this.mode === "playing" && !this.animating) {
        this.timeLeft = Math.max(0, this.timeLeft - deltaMS / 1000);
        this.updateHud();
        if (this.timeLeft <= 0) {
          this.failLevel();
        }
      }
    }

    completeLevel() {
      this.playTone("win");
      this.animating = false;
      this.nextLevelTarget = this.level + 1;
      const clearedLevel = calculateClearedLevel(this.level);
      this.runMoves += this.moves;
      this.runRecord = {
        level: this.level,
        rankLevel: clearedLevel,
        moves: this.runMoves,
        levelMoves: this.moves,
        vehicles: this.initialVehicleCount,
        seed: this.levelSeed,
      };
      this.lastClear = this.runRecord;
      this.bestLevel = Math.max(this.bestLevel, this.level + 1);
      localStorage.setItem(STORAGE.bestLevel, String(this.bestLevel));
      localStorage.setItem(STORAGE.level, String(this.level + 1));
      if (this.bestMoves === 0 || this.moves < this.bestMoves) {
        this.bestMoves = this.moves;
        localStorage.setItem(STORAGE.bestMoves, String(this.bestMoves));
      }
      dom.clearTitle.textContent = `레벨 ${this.level} 클리어`;
      dom.clearKicker.textContent = "PARKING EXIT";
      dom.clearMovesLabel.textContent = "MOVE";
      dom.clearMoves.textContent = String(this.moves);
      dom.nextLevelCaption.textContent = "NEXT";
      dom.nextLevel.textContent = String(this.level + 1);
      dom.clearLevelCaption.textContent = "CLEARED";
      dom.clearLevel.textContent = `Lv ${clearedLevel.toLocaleString()}`;
      dom.next.textContent = "NEXT";
      dom.nickname.value = localStorage.getItem(NICK_KEY) || "";
      dom.submitStatus.textContent = "";
      dom.rankSubmitRow.classList.add("hidden");
      dom.modal.classList.remove("is-timeout");
      dom.modal.classList.add("is-clear");
      dom.modal.classList.remove("hidden");
      this.mode = "complete";
    }

    failLevel() {
      if (this.mode !== "playing") return;
      this.mode = "timeout";
      this.animating = false;
      this.nextLevelTarget = this.level;
      this.timeLeft = 0;
      this.cancelDrag();
      this.cancelTweens({ clearFx: true });
      this.lastClear = {
        ...(this.runRecord || {}),
        level: this.level,
        rankLevel: this.level,
        moves: this.runMoves + this.moves,
        levelMoves: this.moves,
        vehicles: this.initialVehicleCount,
        seed: this.levelSeed,
        clearedBeforeTimeout: this.runRecord ? this.runRecord.rankLevel : 0,
        failedLevel: this.level,
        timedOut: true,
      };
      dom.clearTitle.textContent = "TIME UP";
      dom.clearKicker.textContent = "TIME LIMIT";
      dom.clearMovesLabel.textContent = "MOVE";
      dom.clearMoves.textContent = String(this.moves);
      dom.nextLevelCaption.textContent = "RETRY";
      dom.nextLevel.textContent = String(this.level);
      dom.clearLevelCaption.textContent = "REACHED";
      dom.clearLevel.textContent = `Lv ${this.lastClear.rankLevel.toLocaleString()}`;
      dom.next.textContent = "RETRY";
      dom.nickname.value = localStorage.getItem(NICK_KEY) || "";
      dom.submitStatus.textContent = "";
      dom.rankSubmitRow.classList.remove("hidden");
      dom.submitRank.disabled = false;
      dom.skipRank.disabled = false;
      dom.modal.classList.remove("is-clear");
      dom.modal.classList.add("is-timeout");
      dom.modal.classList.remove("hidden");
      this.updateHud();
      this.playTone("blocked");
    }

    updateHud() {
      dom.level.textContent = String(this.level);
      if (dom.time) dom.time.textContent = formatTime(this.timeLeft);
      if (dom.timeStat) dom.timeStat.classList.toggle("is-low", this.mode === "playing" && this.timeLeft <= 5);
      dom.moves.textContent = String(this.moves);
      dom.left.textContent = String(this.vehicles.length);
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
      const sortedRows = rows.slice().sort((a, b) => {
        const levelDiff = getRankLevel(b) - getRankLevel(a);
        if (levelDiff !== 0) return levelDiff;
        const movesA = getRankMoves(a);
        const movesB = getRankMoves(b);
        if (movesA !== movesB) return movesA - movesB;
        return getRankTime(a) - getRankTime(b);
      });
      dom.rankContent.innerHTML = sortedRows.map((row, index) => {
        const rank = index + 1;
        const level = getRankLevel(row);
        let meta = "";
        if (row.created_at) {
          const date = new Date(row.created_at);
          if (!Number.isNaN(date.getTime())) meta = date.toLocaleDateString("ko-KR");
        }
        const cls = ["rank-row"];
        if (rank <= 3) cls.push(`top${rank}`);
        const metaHtml = meta ? `<span class="rank-meta">${escapeHtml(meta)}</span>` : "";
        return `
          <div class="${cls.join(" ")}">
            <div class="rank-pos">${rank}</div>
            <div class="rank-name">${escapeHtml(row.player_name || "PLAYER")}${metaHtml}</div>
            <div class="rank-level">Lv ${Number(level || 0).toLocaleString()}</div>
          </div>
        `;
      }).join("");
    }

    async handleSubmitRank() {
      if (!this.lastClear) return;
      const name = (dom.nickname.value || "").trim().slice(0, 20);
      if (!name) {
        dom.submitStatus.textContent = "닉네임을 입력하세요";
        return;
      }
      dom.submitRank.disabled = true;
      dom.skipRank.disabled = true;
      dom.submitStatus.textContent = "등록 중...";
      try {
        const synced = await this.recordRankClear(this.lastClear);
        if (!this.rankSessionId || !synced || this.rankSyncFailed) throw new Error("rank score sync failed");
        const response = await fetch(`${RANK_API_BASE}/rankings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game_id: GAME_ID,
            player_name: name,
            score: this.lastClear.rankLevel,
            session_id: this.rankSessionId,
            extra_data: {
              session_id: this.rankSessionId,
              level: this.lastClear.rankLevel,
              cleared_level: this.lastClear.rankLevel,
              moves: this.lastClear.moves,
              level_moves: this.lastClear.levelMoves,
              vehicles: this.lastClear.vehicles,
              seed: this.lastClear.seed,
              cleared_before_timeout: this.lastClear.clearedBeforeTimeout || null,
              failed_level: this.lastClear.failedLevel || null,
              timed_out: !!this.lastClear.timedOut,
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

    showToast(text) {
      dom.toast.textContent = text;
      dom.toast.classList.remove("hidden");
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => dom.toast.classList.add("hidden"), 1100);
    }

    playTone(type, intensity = 1) {
      if (this.sound && this.sound.play) this.sound.play(type, intensity);
    }

    ensureAudio() {
      if (this.sound && this.sound.ensure) this.sound.ensure();
    }
  }

  function getParkingConfig(level) {
    const rawLevel = Math.max(1, level | 0);
    const size = 6;
    const exitRow = 3;
    const exitSide = "left";
    const vehicleCount = rawLevel < 8 ? 9 : rawLevel < 16 ? 10 : rawLevel < 28 ? 11 : rawLevel < 40 ? 12 : 13;
    const targetDepth = getTargetSolutionDepth(rawLevel);
    const minBlockers = clamp(1 + Math.floor(rawLevel / 16), 1, 4);
    const longVehicleRate = clamp(0.16 + rawLevel / 180, 0.18, 0.44);
    const scrambleMoves = Math.min(120, 24 + rawLevel * 2);
    const attempts = rawLevel < 16 ? 120 : rawLevel < 40 ? 170 : rawLevel < 80 ? 220 : 280;
    const solverStateLimit = rawLevel < 40 ? 18000 : 26000;
    return {
      size,
      exitRow,
      exitSide,
      vehicleCount,
      targetDepth,
      minBlockers,
      longVehicleRate,
      scrambleMoves,
      attempts,
      solverStateLimit,
      level: rawLevel,
    };
  }

  function createParkingPuzzle(config, seed) {
    let best = null;
    for (let attempt = 0; attempt < config.attempts; attempt++) {
      const rng = new Random((seed ^ 0x51f15eed ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0);
      const vehicles = createSolvedVehicleSet(config, rng, attempt);
      scrambleVehicles(vehicles, config, rng, config.scrambleMoves + attempt);
      const metrics = measureParkingPuzzle(vehicles, config);
      if (!metrics.valid) continue;
      const score = scoreParkingCandidate(metrics, config);
      if (!best || score < best.score) best = { vehicles: cloneVehicles(vehicles), metrics, score };
      if (metrics.depth >= config.targetDepth && metrics.depth <= config.targetDepth + 1 && metrics.blockers >= config.minBlockers) {
        return { vehicles: cloneVehicles(vehicles), metrics };
      }
    }
    if (best) return { vehicles: best.vehicles, metrics: best.metrics };
    const fallback = createFallbackPuzzle(config);
    return { vehicles: fallback, metrics: measureParkingPuzzle(fallback, config) };
  }

  function getTargetSolutionDepth(level) {
    if (level < 6) return 2;
    if (level < 12) return 3;
    if (level < 20) return 5;
    if (level < 30) return 6;
    if (level < 45) return 7;
    if (level < 60) return 8;
    return 9;
  }

  function createSolvedVehicleSet(config, rng, attempt) {
    const vehicles = [{
      id: "goal",
      target: true,
      axis: "H",
      x: 0,
      y: config.exitRow,
      w: 2,
      h: 1,
      colorIndex: 0,
    }];
    const occupied = makeVehicleOccupancy(vehicles);
    const tries = config.vehicleCount * 80 + attempt * 5;
    let colorCursor = 1;
    for (let i = 0; i < tries && vehicles.length < config.vehicleCount; i++) {
      const axis = rng.chance(0.58) ? "V" : "H";
      const length = rng.chance(config.longVehicleRate) ? 3 : 2;
      const w = axis === "H" ? length : 1;
      const h = axis === "V" ? length : 1;
      const x = rng.int(0, config.size - w);
      const y = rng.int(0, config.size - h);
      const draft = {
        id: `c${vehicles.length}`,
        target: false,
        axis,
        x,
        y,
        w,
        h,
        colorIndex: colorCursor++ % (CAR_PALETTE.length - 1) + 1,
      };
      if (vehicleTouchesExitLane(draft, config.exitRow)) continue;
      if (!vehicleFits(draft, config.size, occupied)) continue;
      vehicles.push(draft);
      for (const cell of vehicleCells(draft)) occupied.add(key(cell.x, cell.y));
    }
    return vehicles;
  }

  function scrambleVehicles(vehicles, config, rng, moves) {
    for (let step = 0; step < moves; step++) {
      const candidates = vehicles
        .map(vehicle => ({ vehicle, range: getVehicleRange(vehicle, vehicles, config.size) }))
        .filter(item => item.range.max > item.range.min);
      if (!candidates.length) return;
      let item = rng.pick(candidates);
      const targetItem = candidates.find(candidate => candidate.vehicle.target);
      if (targetItem && (step < 5 || rng.chance(0.18))) item = targetItem;
      const { vehicle, range } = item;
      let next = rng.int(range.min, range.max);
      if (vehicle.target) {
        const minTarget = Math.min(range.max, 1);
        next = rng.int(minTarget, range.max);
      }
      if (vehicle.axis === "H") vehicle.x = next;
      else vehicle.y = next;
    }
  }

  function measureParkingPuzzle(vehicles, config) {
    const target = vehicles.find(vehicle => vehicle.target);
    if (!target) return { valid: false, depth: 0, blockers: 0, movable: 0, states: 0 };
    const occupied = makeVehicleOccupancy(vehicles, target.id);
    let blockers = 0;
    for (let x = 0; x < target.x; x++) {
      if (occupied.has(key(x, target.y))) blockers += 1;
    }
    const distance = target.x;
    const movable = vehicles.filter(vehicle => {
      const range = getVehicleRange(vehicle, vehicles, config.size);
      return range.max > range.min;
    }).length;
    if (distance <= 0 || blockers <= 0) {
      return { valid: false, depth: 0, blockers, movable, states: 0 };
    }
    const solution = solveParkingPuzzle(vehicles, config);
    const valid = Number.isFinite(solution.depth) && solution.depth > 0;
    return {
      valid,
      depth: valid ? solution.depth : 0,
      blockers,
      movable,
      states: solution.states,
      vehicles: vehicles.length,
      distance,
    };
  }

  function scoreParkingCandidate(metrics, config) {
    const depthMiss = Math.max(0, config.targetDepth - metrics.depth);
    const depthOver = Math.max(0, metrics.depth - config.targetDepth - 1);
    const blockerMiss = Math.max(0, config.minBlockers - metrics.blockers);
    const densityMiss = Math.max(0, config.vehicleCount - metrics.vehicles);
    return depthMiss * 900
      + depthOver * 60
      + blockerMiss * 220
      + densityMiss * 90
      - metrics.depth * 18
      - metrics.blockers * 6
      - Math.min(metrics.states, 12000) / 1800;
  }

  function solveParkingPuzzle(vehicles, config) {
    const start = cloneVehicles(vehicles);
    const targetIndex = start.findIndex(vehicle => vehicle.target);
    if (targetIndex < 0) return { depth: Infinity, states: 0 };

    const queue = [{ vehicles: start, depth: 0 }];
    const seen = new Set([encodeVehiclePositions(start)]);
    for (let head = 0; head < queue.length && head < config.solverStateLimit; head++) {
      const item = queue[head];
      if (item.vehicles[targetIndex].x === 0) return { depth: item.depth, states: seen.size };

      for (let i = 0; i < item.vehicles.length; i++) {
        const vehicle = item.vehicles[i];
        const range = getVehicleRange(vehicle, item.vehicles, config.size);
        for (let pos = range.min; pos <= range.max; pos++) {
          if ((vehicle.axis === "H" && pos === vehicle.x) || (vehicle.axis === "V" && pos === vehicle.y)) continue;
          const next = cloneVehicles(item.vehicles);
          if (vehicle.axis === "H") next[i].x = pos;
          else next[i].y = pos;
          const encoded = encodeVehiclePositions(next);
          if (seen.has(encoded)) continue;
          seen.add(encoded);
          queue.push({ vehicles: next, depth: item.depth + 1 });
        }
      }
    }
    return { depth: Infinity, states: seen.size };
  }

  function encodeVehiclePositions(vehicles) {
    return vehicles.map(vehicle => `${vehicle.x},${vehicle.y}`).join("|");
  }

  function createFallbackPuzzle(config) {
    const size = config.size;
    const row = config.exitRow;
    const vehicles = [
      { id: "goal", target: true, axis: "H", x: 1, y: row, w: 2, h: 1, colorIndex: 0 },
      { id: "c1", axis: "V", x: 3, y: Math.max(0, row - 1), w: 1, h: 3, colorIndex: 2 },
      { id: "c2", axis: "V", x: 4, y: 0, w: 1, h: 2, colorIndex: 3 },
      { id: "c3", axis: "H", x: 0, y: 0, w: 2, h: 1, colorIndex: 4 },
      { id: "c4", axis: "H", x: 2, y: 0, w: 2, h: 1, colorIndex: 5 },
      { id: "c5", axis: "V", x: 0, y: 3, w: 1, h: 2, colorIndex: 6 },
      { id: "c6", axis: "H", x: 1, y: size - 1, w: 2, h: 1, colorIndex: 7 },
      { id: "c7", axis: "V", x: 5, y: 0, w: 1, h: 3, colorIndex: 1 },
      { id: "c8", axis: "H", x: 2, y: 4, w: 2, h: 1, colorIndex: 2 },
      { id: "c9", axis: "V", x: 4, y: 4, w: 1, h: 2, colorIndex: 3 },
      { id: "c10", axis: "H", x: 4, y: 3, w: 2, h: 1, colorIndex: 4 },
    ];
    return vehicles.filter(vehicle => vehicle.x + vehicle.w <= size && vehicle.y + vehicle.h <= size);
  }

  function vehicleTouchesExitLane(vehicle, exitRow) {
    for (const cell of vehicleCells(vehicle)) {
      if (cell.y === exitRow) return true;
    }
    return false;
  }

  function getVehicleRange(vehicle, vehicles, size) {
    const occupied = makeVehicleOccupancy(vehicles, vehicle.id);
    if (vehicle.axis === "H") {
      let min = vehicle.x;
      while (min > 0 && !occupied.has(key(min - 1, vehicle.y))) min -= 1;
      let max = vehicle.x;
      while (max + vehicle.w < size && !occupied.has(key(max + vehicle.w, vehicle.y))) max += 1;
      return { min, max };
    }
    let min = vehicle.y;
    while (min > 0 && !occupied.has(key(vehicle.x, min - 1))) min -= 1;
    let max = vehicle.y;
    while (max + vehicle.h < size && !occupied.has(key(vehicle.x, max + vehicle.h))) max += 1;
    return { min, max };
  }

  function vehicleFits(vehicle, size, occupied) {
    if (vehicle.x < 0 || vehicle.y < 0 || vehicle.x + vehicle.w > size || vehicle.y + vehicle.h > size) return false;
    for (const cell of vehicleCells(vehicle)) {
      if (occupied.has(key(cell.x, cell.y))) return false;
    }
    return true;
  }

  function makeVehicleOccupancy(vehicles, exceptId = null) {
    const occupied = new Set();
    for (const vehicle of vehicles) {
      if (vehicle.id === exceptId) continue;
      for (const cell of vehicleCells(vehicle)) occupied.add(key(cell.x, cell.y));
    }
    return occupied;
  }

  function vehicleCells(vehicle) {
    const cells = [];
    for (let y = 0; y < vehicle.h; y++) {
      for (let x = 0; x < vehicle.w; x++) {
        cells.push({ x: vehicle.x + x, y: vehicle.y + y });
      }
    }
    return cells;
  }

  function getVehicleTexture(vehicle) {
    const longVehicle = (vehicle.axis === "H" ? vehicle.w : vehicle.h) >= 3;
    const pool = vehicle.target ? [0] : longVehicle ? [3, 4, 5] : [1, 2, 6, 7];
    const index = pool[Math.abs(vehicle.colorIndex || 0) % pool.length];
    return textures[VEHICLE_ASSETS[index]] || null;
  }

  function drawCar(container, vehicle, cell) {
    const palette = vehicle.target ? CAR_PALETTE[0] : CAR_PALETTE[vehicle.colorIndex % CAR_PALETTE.length];
    const w = vehicle.w * cell;
    const h = vehicle.h * cell;
    const inset = cell * 0.08;
    const radius = cell * 0.16;

    const shadow = new PIXI.Graphics();
    shadow.roundRect(inset * 0.25, inset * 1.05, w - inset * 0.1, h - inset * 0.05, radius * 1.05)
      .fill({ color: 0x000000, alpha: 0.44 });
    shadow.roundRect(inset * 0.8, inset * 1.55, w - inset * 1.1, h - inset * 0.85, radius * 0.92)
      .fill({ color: 0x000000, alpha: 0.28 });
    container.addChild(shadow);

    const glow = new PIXI.Graphics();
    glow.roundRect(inset * 0.45, inset * 0.45, w - inset * 0.9, h - inset * 0.9, radius)
      .stroke({ width: Math.max(1.5, cell * 0.026), color: vehicle.target ? 0xffd36b : palette.glow, alpha: vehicle.target ? 0.62 : 0.2 });
    glow.roundRect(inset * 0.85, inset * 0.85, w - inset * 1.7, h - inset * 1.7, radius * 0.78)
      .stroke({ width: Math.max(1, cell * 0.014), color: 0xffffff, alpha: vehicle.target ? 0.16 : 0.08 });
    container.addChild(glow);

    const spriteTexture = getVehicleTexture(vehicle);
    if (spriteTexture) {
      const sprite = new PIXI.Sprite(spriteTexture);
      const texW = spriteTexture.width || 1;
      const texH = spriteTexture.height || 1;
      const targetW = Math.max(cell * 0.72, w - inset * 1.15);
      const targetH = Math.max(cell * 0.72, h - inset * 1.15);
      sprite.anchor.set(0.5);
      sprite.x = w * 0.5;
      sprite.y = h * 0.5;
      sprite.rotation = vehicle.axis === "H" ? Math.PI / 2 : 0;
      if (vehicle.axis === "H") {
        sprite.scale.set(targetH / texW, targetW / texH);
      } else {
        sprite.scale.set(targetW / texW, targetH / texH);
      }
      sprite.alpha = vehicle.target ? 1 : 0.98;
      container.addChild(sprite);

      if (vehicle.target) {
        const targetGlow = new PIXI.Graphics();
        targetGlow.roundRect(inset * 0.24, inset * 0.24, w - inset * 0.48, h - inset * 0.48, radius)
          .stroke({ width: Math.max(2, cell * 0.032), color: 0xfff1b0, alpha: 0.68 });
        targetGlow.roundRect(inset * 0.55, inset * 0.55, w - inset * 1.1, h - inset * 1.1, radius * 0.82)
          .stroke({ width: Math.max(1, cell * 0.012), color: 0xffffff, alpha: 0.24 });
        container.addChild(targetGlow);
      }
      return;
    }

    const body = new PIXI.Graphics();
    body.roundRect(inset, inset, w - inset * 2, h - inset * 2, radius)
      .fill({ color: palette.dark, alpha: 1 });
    body.roundRect(inset * 1.35, inset * 1.25, w - inset * 2.7, h - inset * 2.7, radius * 0.82)
      .fill({ color: palette.body, alpha: 1 });
    body.roundRect(inset * 1.65, inset * 1.55, w - inset * 3.3, Math.max(cell * 0.12, (h - inset * 3.1) * 0.38), radius * 0.55)
      .fill({ color: palette.light, alpha: 0.22 });
    container.addChild(body);

    const glass = new PIXI.Graphics();
    if (vehicle.axis === "H") {
      const cabinW = Math.min(w * 0.38, cell * 0.82);
      glass.roundRect(w * 0.5 - cabinW * 0.5, h * 0.24, cabinW, h * 0.52, cell * 0.08)
        .fill({ color: palette.glass, alpha: 0.84 })
        .stroke({ width: Math.max(1, cell * 0.014), color: 0xdff7ff, alpha: 0.26 });
      body.rect(w - inset * 2.2, h * 0.28, inset * 0.9, h * 0.16).fill({ color: 0xfff0a4, alpha: 0.9 });
      body.rect(w - inset * 2.2, h * 0.56, inset * 0.9, h * 0.16).fill({ color: 0xfff0a4, alpha: 0.9 });
      body.rect(inset * 1.3, h * 0.28, inset * 0.7, h * 0.16).fill({ color: 0xff3048, alpha: 0.72 });
      body.rect(inset * 1.3, h * 0.56, inset * 0.7, h * 0.16).fill({ color: 0xff3048, alpha: 0.72 });
    } else {
      const cabinH = Math.min(h * 0.38, cell * 0.82);
      glass.roundRect(w * 0.24, h * 0.5 - cabinH * 0.5, w * 0.52, cabinH, cell * 0.08)
        .fill({ color: palette.glass, alpha: 0.84 })
        .stroke({ width: Math.max(1, cell * 0.014), color: 0xdff7ff, alpha: 0.26 });
      body.rect(w * 0.28, inset * 1.3, w * 0.16, inset * 0.75).fill({ color: 0xfff0a4, alpha: 0.9 });
      body.rect(w * 0.56, inset * 1.3, w * 0.16, inset * 0.75).fill({ color: 0xfff0a4, alpha: 0.9 });
      body.rect(w * 0.28, h - inset * 2.1, w * 0.16, inset * 0.65).fill({ color: 0xff3048, alpha: 0.72 });
      body.rect(w * 0.56, h - inset * 2.1, w * 0.16, inset * 0.65).fill({ color: 0xff3048, alpha: 0.72 });
    }
    container.addChild(glass);

    if (vehicle.target) {
      const stripe = new PIXI.Graphics();
      if (vehicle.axis === "H") {
        stripe.roundRect(w * 0.16, h * 0.42, w * 0.68, h * 0.16, h * 0.08).fill({ color: 0xffffff, alpha: 0.82 });
      } else {
        stripe.roundRect(w * 0.42, h * 0.16, w * 0.16, h * 0.68, w * 0.08).fill({ color: 0xffffff, alpha: 0.82 });
      }
      container.addChild(stripe);
    }
  }

  function cloneVehicle(vehicle) {
    return {
      id: vehicle.id,
      target: !!vehicle.target,
      axis: vehicle.axis,
      x: vehicle.x,
      y: vehicle.y,
      w: vehicle.w,
      h: vehicle.h,
      colorIndex: vehicle.colorIndex || 0,
    };
  }

  function cloneVehicles(vehicles) {
    return vehicles.map(cloneVehicle);
  }

  function createLevelSeed(level) {
    let n = Math.max(1, level | 0);
    n ^= 0x9e3779b9;
    n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    return (n ^ (n >>> 16)) >>> 0;
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

  function calculateClearedLevel(level) {
    return Math.max(1, level | 0);
  }

  function formatTime(seconds) {
    return String(Math.ceil(Math.max(0, seconds))).padStart(2, "0");
  }

  function getRankExtra(row) {
    const extra = row.extra_data || row.extra || {};
    if (typeof extra === "string") {
      try {
        return JSON.parse(extra) || {};
      } catch (error) {
        return {};
      }
    }
    return extra;
  }

  function getRankLevel(row) {
    const extra = getRankExtra(row);
    return Number(extra.cleared_level || extra.level || row.score || 0);
  }

  function getRankMoves(row) {
    const extra = getRankExtra(row);
    const moves = Number(extra.moves || 0);
    return moves > 0 ? moves : Number.POSITIVE_INFINITY;
  }

  function getRankTime(row) {
    const time = row.created_at ? new Date(row.created_at).getTime() : Number.POSITIVE_INFINITY;
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
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

  function clearLayer(layer) {
    if (!layer) return;
    for (const child of layer.removeChildren()) {
      if (child && !child.destroyed) child.destroy({ children: true });
    }
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

  window.__parkingGame = new ParkingGame();
})();
