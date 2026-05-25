(async function () {
  "use strict";

  if (document.readyState === "loading") {
    await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }

  const ASSETS = {
    menu: "assets/ui/menu-bg.png",
    board: "assets/ui/board-surface.png",
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
  app.stage.eventMode = "static";

  let textures = {};
  try {
    textures = await PIXI.Assets.load([ASSETS.menu, ASSETS.board, ...VEHICLE_ASSETS]);
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
      this.gridW = 6;
      this.gridH = 6;
      this.exitRow = 2;
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
      this.startToken = 0;
      this.sound = new ((window.ParkingSoundManager || window.ArrowsSoundManager) || class {
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
      this.level = Math.max(1, level | 0);
      localStorage.setItem(STORAGE.level, String(this.level));
      this.moves = 0;
      this.tweens = [];
      this.drag = null;
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
      this.renderBoard();
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
      this.drag = null;
      this.tweens = [];
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

    resize() {
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const topSafe = viewportW < 620 ? 104 : 126;
      const bottomSafe = viewportW < 620 ? 24 : 42;
      const side = viewportW < 620 ? 14 : 46;
      const maxBoardW = viewportW - side * 2;
      const maxBoardH = viewportH - topSafe - bottomSafe;
      const rawCell = Math.floor(Math.min(maxBoardW / this.gridW, maxBoardH / this.gridH));
      const minCell = viewportW < 390 ? 44 : viewportW < 620 ? 48 : 58;
      const maxCell = viewportW < 620 ? 66 : 86;
      this.cell = clamp(rawCell, minCell, maxCell);
      this.boardW = this.cell * this.gridW;
      this.boardH = this.cell * this.gridH;

      const contentW = Math.max(viewportW, this.boardW + side * 2 + this.cell * 0.9);
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
      app.stage.hitArea = new PIXI.Rectangle(0, 0, width, height);
      this.bgWash.clear();
      this.bgWash.rect(0, 0, width, height).fill({ color: 0x030712, alpha: 0.5 });
      this.bgWash.rect(0, 0, width, height).fill({ color: 0x07182b, alpha: 0.18 });
      if (this.bgSprite) coverSprite(this.bgSprite, width, height);
      for (const spark of this.bgSparks) {
        spark.x = spark.baseX * width;
        spark.y = spark.baseY * height;
      }

      this.boardX = Math.round(Math.max(side, (width - this.boardW) / 2));
      this.boardY = Math.round(topSafe + Math.max(0, (height - topSafe - bottomSafe - this.boardH) / 2));
      this.boardLayer.position.set(this.boardX, this.boardY);

      if (this.mode === "playing") this.renderBoard();
    }

    renderBoard() {
      this.surfaceLayer.removeChildren();
      this.gridLayer.removeChildren();
      this.vehicleLayer.removeChildren();
      this.fxLayer.removeChildren();

      const pad = Math.round(this.cell * 0.72);
      if (textures[ASSETS.board]) {
        const surface = new PIXI.Sprite(textures[ASSETS.board]);
        surface.x = -pad;
        surface.y = -pad;
        surface.width = this.boardW + pad * 2;
        surface.height = this.boardH + pad * 2;
        surface.alpha = 1;
        this.surfaceLayer.addChild(surface);
      } else {
        const fallback = new PIXI.Graphics();
        fallback.roundRect(-pad, -pad, this.boardW + pad * 2, this.boardH + pad * 2, this.cell * 0.2)
          .fill({ color: 0xf7fbff, alpha: 0.96 });
        this.surfaceLayer.addChild(fallback);
      }

      this.drawBoardChrome(pad);
      for (const vehicle of this.vehicles) this.drawVehicle(vehicle);
    }

    drawBoardChrome(pad) {
      const g = new PIXI.Graphics();
      const lineColor = 0x9fafbf;
      g.roundRect(-pad, -pad, this.boardW + pad * 2, this.boardH + pad * 2, this.cell * 0.2)
        .stroke({ width: Math.max(2, this.cell * 0.04), color: 0xffffff, alpha: 0.52 });
      g.roundRect(0, 0, this.boardW, this.boardH, this.cell * 0.08)
        .fill({ color: 0xffffff, alpha: 0.18 })
        .stroke({ width: Math.max(2, this.cell * 0.035), color: 0x86a0b8, alpha: 0.42 });

      for (let x = 1; x < this.gridW; x++) {
        g.moveTo(x * this.cell, 0).lineTo(x * this.cell, this.boardH)
          .stroke({ width: Math.max(1, this.cell * 0.012), color: lineColor, alpha: 0.28 });
      }
      for (let y = 1; y < this.gridH; y++) {
        g.moveTo(0, y * this.cell).lineTo(this.boardW, y * this.cell)
          .stroke({ width: Math.max(1, this.cell * 0.012), color: lineColor, alpha: 0.28 });
      }

      for (let y = 0; y < this.gridH; y++) {
        for (let x = 0; x < this.gridW; x++) {
          g.roundRect(x * this.cell + this.cell * 0.1, y * this.cell + this.cell * 0.1, this.cell * 0.8, this.cell * 0.8, this.cell * 0.05)
            .fill({ color: 0xffffff, alpha: 0.08 })
            .stroke({ width: Math.max(1, this.cell * 0.01), color: 0x6f8294, alpha: 0.14 });
        }
      }

      const exitY = this.exitRow * this.cell;
      g.rect(this.boardW - this.cell * 0.06, exitY + this.cell * 0.08, this.cell * 0.16, this.cell * 0.84)
        .fill({ color: 0x6ceeff, alpha: 0.16 });
      g.roundRect(this.boardW + this.cell * 0.04, exitY + this.cell * 0.12, this.cell * 0.64, this.cell * 0.76, this.cell * 0.12)
        .fill({ color: 0xffffff, alpha: 0.68 })
        .stroke({ width: Math.max(2, this.cell * 0.035), color: 0x45c9e8, alpha: 0.86 });
      g.moveTo(this.boardW + this.cell * 0.16, exitY + this.cell * 0.5)
        .lineTo(this.boardW + this.cell * 0.54, exitY + this.cell * 0.5)
        .stroke({ width: Math.max(3, this.cell * 0.055), color: 0xffd05a, alpha: 0.9, cap: "round" });
      g.moveTo(this.boardW + this.cell * 0.44, exitY + this.cell * 0.32)
        .lineTo(this.boardW + this.cell * 0.58, exitY + this.cell * 0.5)
        .lineTo(this.boardW + this.cell * 0.44, exitY + this.cell * 0.68)
        .stroke({ width: Math.max(3, this.cell * 0.055), color: 0xffd05a, alpha: 0.9, cap: "round", join: "round" });

      this.gridLayer.addChild(g);
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
      if (vehicle.axis === "H") {
        const nextX = clamp(Math.round(vehicle.container.x / this.cell), range.min, range.max);
        vehicle.x = nextX;
        vehicle.container.x = nextX * this.cell;
        moved = nextX !== originX;
      } else {
        const nextY = clamp(Math.round(vehicle.container.y / this.cell), range.min, range.max);
        vehicle.y = nextY;
        vehicle.container.y = nextY * this.cell;
        moved = nextY !== originY;
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
      this.playTone(vehicle.target ? "clear" : "button", 0.8);

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
      if (target.x + target.w < this.gridW) return false;
      const occupied = makeVehicleOccupancy(this.vehicles, target.id);
      for (let x = target.x + target.w; x < this.gridW; x++) {
        if (occupied.has(key(x, target.y))) return false;
      }
      return true;
    }

    exitTarget(vehicle) {
      this.animating = true;
      vehicle.container.eventMode = "none";
      const startX = vehicle.container.x;
      const endX = this.boardW + this.cell * 1.2;
      this.spawnExitGlow(vehicle);
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
          g.roundRect(this.boardW - this.cell * 0.35, y - this.cell * 0.42, this.cell * 1.45, this.cell * 0.84, this.cell * 0.16)
            .fill({ color: 0xffd05a, alpha: 0.18 * alpha });
          g.moveTo(this.boardW - this.cell * 0.2, y).lineTo(this.boardW + this.cell * 0.95, y)
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
    }

    completeLevel() {
      this.playTone("win");
      this.animating = false;
      const clearedLevel = calculateClearedLevel(this.level);
      this.lastClear = {
        level: this.level,
        rankLevel: clearedLevel,
        moves: this.moves,
        vehicles: this.initialVehicleCount,
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
      this.mode = "complete";
    }

    updateHud() {
      dom.level.textContent = String(this.level);
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
      dom.rankContent.innerHTML = rows.map((row, index) => {
        const rank = row.rank || index + 1;
        const extra = row.extra || {};
        const level = Number(extra.cleared_level || extra.level || row.score || 0);
        const moves = Number(extra.moves || 0);
        let meta = "";
        if (moves > 0) meta = `${moves} 이동`;
        if (row.created_at) {
          const date = new Date(row.created_at);
          if (!Number.isNaN(date.getTime())) meta += `${meta ? " · " : ""}${date.toLocaleDateString("ko-KR")}`;
        }
        const cls = ["rank-row"];
        if (rank <= 3) cls.push(`top${rank}`);
        return `
          <div class="${cls.join(" ")}">
            <div class="rank-pos">${rank}</div>
            <div class="rank-name">${escapeHtml(row.player_name || "PLAYER")}<span class="rank-meta">${escapeHtml(meta || "Parking Puzzle")}</span></div>
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
        const response = await fetch(`${RANK_API_BASE}/rankings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game_id: GAME_ID,
            player_name: name,
            score: this.lastClear.rankLevel,
            extra: {
              level: this.lastClear.rankLevel,
              cleared_level: this.lastClear.rankLevel,
              moves: this.lastClear.moves,
              vehicles: this.lastClear.vehicles,
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
    const progress = clamp((rawLevel - 1) / 40, 0, 1);
    const exitRow = 2;
    const vehicleCount = Math.min(13, 9 + Math.floor(progress * 4));
    const scrambleMoves = Math.min(90, 22 + rawLevel * 2 + Math.floor(progress * 22));
    return { size, exitRow, vehicleCount, scrambleMoves, level: rawLevel };
  }

  function createParkingPuzzle(config, seed) {
    const rng = new Random(seed ^ 0x51f15eed);
    let best = null;
    for (let attempt = 0; attempt < 80; attempt++) {
      const vehicles = createSolvedVehicleSet(config, rng, attempt);
      scrambleVehicles(vehicles, config, rng, config.scrambleMoves + attempt);
      const score = scoreParkingPuzzle(vehicles, config);
      if (!best || score > best.score) best = { vehicles: cloneVehicles(vehicles), score };
      if (score >= 8 + Math.min(8, Math.floor(config.level / 10))) {
        return { vehicles: cloneVehicles(vehicles) };
      }
    }
    return { vehicles: best && best.score >= 3 ? best.vehicles : createFallbackPuzzle(config) };
  }

  function createSolvedVehicleSet(config, rng, attempt) {
    const vehicles = [{
      id: "goal",
      target: true,
      axis: "H",
      x: config.size - 2,
      y: config.exitRow,
      w: 2,
      h: 1,
      colorIndex: 0,
    }];
    const occupied = makeVehicleOccupancy(vehicles);
    const tries = config.vehicleCount * 80 + attempt * 5;
    let colorCursor = 1;
    for (let i = 0; i < tries && vehicles.length < config.vehicleCount; i++) {
      const axis = rng.chance(0.52) ? "V" : "H";
      const length = rng.chance(config.level > 18 ? 0.28 : 0.14) ? 3 : 2;
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
      if (vehicle.target) next = rng.int(range.min, Math.max(range.min, vehicle.x - 1));
      if (vehicle.axis === "H") vehicle.x = next;
      else vehicle.y = next;
    }
  }

  function scoreParkingPuzzle(vehicles, config) {
    const target = vehicles.find(vehicle => vehicle.target);
    if (!target) return 0;
    const occupied = makeVehicleOccupancy(vehicles, target.id);
    let blockers = 0;
    for (let x = target.x + target.w; x < config.size; x++) {
      if (occupied.has(key(x, target.y))) blockers += 1;
    }
    const distance = config.size - (target.x + target.w);
    if (distance <= 0 || blockers <= 0) return 0;
    const movable = vehicles.filter(vehicle => {
      const range = getVehicleRange(vehicle, vehicles, config.size);
      return range.max > range.min;
    }).length;
    return blockers * 7 + distance * 2 + movable * 0.35;
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
    shadow.roundRect(inset * 0.6, inset * 1.2, w - inset * 0.3, h - inset * 0.1, radius)
      .fill({ color: 0x000000, alpha: 0.34 });
    container.addChild(shadow);

    const glow = new PIXI.Graphics();
    glow.roundRect(inset * 0.3, inset * 0.3, w - inset * 0.6, h - inset * 0.6, radius)
      .stroke({ width: Math.max(2, cell * 0.045), color: vehicle.target ? 0xffe0a3 : palette.glow, alpha: vehicle.target ? 0.72 : 0.34 });
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
      sprite.rotation = vehicle.axis === "H" ? -Math.PI / 2 : 0;
      if (vehicle.axis === "H") {
        sprite.scale.set(targetH / texW, targetW / texH);
      } else {
        sprite.scale.set(targetW / texW, targetH / texH);
      }
      sprite.alpha = vehicle.target ? 1 : 0.98;
      container.addChild(sprite);

      if (vehicle.target) {
        const targetGlow = new PIXI.Graphics();
        targetGlow.roundRect(inset * 0.35, inset * 0.35, w - inset * 0.7, h - inset * 0.7, radius)
          .stroke({ width: Math.max(2, cell * 0.04), color: 0xfff1b0, alpha: 0.75 });
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

  window.__parkingGame = new ParkingGame();
  window.__arrowsGame = window.__parkingGame;
})();
