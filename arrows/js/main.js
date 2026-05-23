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
  const DESIGNED_LEVELS = 1000;

  const PALETTE = [
    { main: 0xb9c9ff, glow: 0x5b78ff, hot: 0xf1f6ff },
    { main: 0xaedfff, glow: 0x38c8ff, hot: 0xeeffff },
    { main: 0xc6b6ff, glow: 0x9175ff, hot: 0xf4efff },
    { main: 0xa9f2f3, glow: 0x26e7ff, hot: 0xedffff },
    { main: 0xd0dcff, glow: 0x79a5ff, hot: 0xffffff },
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
    clearScore: $("clear-score"),
    clearTitle: $("clear-title"),
    play: $("play-btn"),
    continue: $("continue-btn"),
    rank: $("rank-btn"),
    next: $("next-btn"),
    home: $("home-btn"),
    modalMenu: $("modal-menu-btn"),
    modalRank: $("modal-rank-btn"),
    retry: $("retry-btn"),
    undo: $("undo-btn"),
    hint: $("hint-btn"),
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
      this.initialPieceCount = 0;
      this.lastClear = null;
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
      dom.retry.addEventListener("click", () => this.start(this.level));
      dom.undo.addEventListener("click", () => this.undo());
      dom.hint.addEventListener("click", () => this.hint());
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
      dom.rankModal.classList.add("hidden");
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

    generateLevel(level) {
      const rng = new Random(0x9e3779b9 ^ Math.imul(level, 2654435761));
      const config = getLevelConfig(level);
      this.gridW = config.gridW;
      this.gridH = config.gridH;
      const target = config.target;
      const pieces = [];
      const maxAttempts = target * config.attemptsPerPiece;

      for (let attempt = 0; attempt < maxAttempts && pieces.length < target; attempt++) {
        const length = rng.int(config.minLength, config.maxLength);
        const shape = makeShape(rng, length, config.turnBias);
        const bounds = getBounds(shape);
        if (bounds.w > this.gridW - 1 || bounds.h > this.gridH - 1) continue;

        const x = rng.int(0, this.gridW - bounds.w);
        const y = rng.int(0, this.gridH - bounds.h);
        const cells = shape.map(cell => ({ x: cell.x + x, y: cell.y + y }));
        const terminalDirs = rng.shuffle(getTerminalDirections(cells));
        const chosenDir = terminalDirs.find(dir => {
          const candidateForEscape = { cells, dir };
          return this.canEscape(candidateForEscape, pieces).ok;
        });
        if (!chosenDir) continue;
        const candidate = {
          id: `p${level}-${pieces.length}-${attempt}`,
          cells,
          dir: chosenDir,
          colorIndex: (pieces.length + rng.int(0, PALETTE.length - 1)) % PALETTE.length,
        };

        if (!fits(candidate, pieces, this.gridW, this.gridH)) continue;
        pieces.push(candidate);
      }

      this.pieces = pieces.map((piece, index) => ({
        ...clonePiece(piece),
        colorIndex: index % PALETTE.length,
        container: null,
      }));
      this.initialPieceCount = this.pieces.length;

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

      container.hitArea = new PathHitArea(piece.cells, this.cell, Math.max(7, this.cell * 0.17));

      const glow = new PIXI.Graphics();
      drawPath(glow, piece.cells, this.cell, color.glow, Math.max(5, this.cell * 0.2), 0.15);
      drawPath(glow, piece.cells, this.cell, color.main, Math.max(3, this.cell * 0.12), 0.22);
      container.addChild(glow);

      const line = new PIXI.Graphics();
      drawPath(line, piece.cells, this.cell, color.main, Math.max(2.6, this.cell * 0.085), 0.98);
      drawPath(line, piece.cells, this.cell, color.hot, Math.max(1.1, this.cell * 0.025), 0.78);
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
      const rankScore = calculateRankScore(this.level, this.moves, this.initialPieceCount);
      this.lastClear = {
        level: this.level,
        moves: this.moves,
        lines: this.initialPieceCount,
        score: rankScore,
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
      dom.clearScore.textContent = rankScore.toLocaleString();
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
      dom.undo.disabled = this.history.length === 0;
      dom.hint.disabled = this.pieces.length === 0;
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
        const level = Number(extra.level || Math.floor((Number(row.score) || 0) / 1000000));
        const moves = Number(extra.moves || 0);
        const lines = Number(extra.lines || 0);
        const meta = [
          level ? `Lv ${level}` : "",
          moves ? `${moves} moves` : "",
          lines ? `${lines} lines` : "",
        ].filter(Boolean).join(" · ");
        const cls = ["rank-row"];
        if (rank <= 3) cls.push(`top${rank}`);
        return `
          <div class="${cls.join(" ")}">
            <div class="rank-pos">${rank}</div>
            <div class="rank-name">${escapeHtml(row.player_name || "PLAYER")}<span class="rank-meta">${escapeHtml(meta || "Arrow Puzzle")}</span></div>
            <div class="rank-score">${Number(row.score || 0).toLocaleString()}</div>
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
            score: this.lastClear.score,
            extra_data: {
              level: this.lastClear.level,
              moves: this.lastClear.moves,
              lines: this.lastClear.lines,
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
    const tunedLevel = Math.min(rawLevel, DESIGNED_LEVELS);
    const early = clamp((tunedLevel - 1) / 90, 0, 1);
    const full = clamp((tunedLevel - 1) / (DESIGNED_LEVELS - 1), 0, 1);
    const late = Math.pow(full, 0.72);

    return {
      gridW: Math.min(15, 9 + Math.floor((tunedLevel - 1) / 12)),
      gridH: Math.min(17, 11 + Math.floor((tunedLevel - 1) / 14)),
      target: Math.min(50, Math.round(12 + early * 29 + late * 9)),
      minLength: tunedLevel < 160 ? 2 : 3,
      maxLength: Math.min(11, Math.round(5 + early * 3 + late * 3)),
      turnBias: 0.42 + late * 0.34,
      attemptsPerPiece: 560 + Math.floor(late * 260),
    };
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
    const size = cellSize * 0.12;
    const len = cellSize * 0.27;
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

    drawPolylinePoints(graphics, windowPoints, Math.max(5, cellSize * 0.21), color.glow, 0.2 * alpha);
    drawPolylinePoints(graphics, windowPoints, Math.max(3, cellSize * 0.12), color.main, 0.38 * alpha);
    drawPolylinePoints(graphics, windowPoints, Math.max(2.6, cellSize * 0.085), color.main, 0.98 * alpha);
    drawPolylinePoints(graphics, windowPoints, Math.max(1.1, cellSize * 0.026), color.hot, 0.86 * alpha);
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
    const size = cellSize * 0.12;
    const len = cellSize * 0.27;
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

  function calculateRankScore(level, moves, lines) {
    const progress = Math.max(1, level) * 1000000;
    const efficiency = Math.max(0, 180000 - Math.max(0, moves) * 2800);
    const density = Math.max(0, lines) * 375;
    return progress + efficiency + density;
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
