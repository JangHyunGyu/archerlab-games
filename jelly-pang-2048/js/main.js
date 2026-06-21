(() => {
  const GAME_ID = "jelly-pang-2048";
  const RANK_API_BASE = "https://game-api.yama5993.workers.dev";
  const RANK_LIMIT = 20;
  const SIZE = 4;
  const STAGE = 900;
  const IS_TOUCH_DEVICE = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const RENDER_RESOLUTION = Math.min(window.devicePixelRatio || 1, IS_TOUCH_DEVICE ? 1.2 : 1.5);
  const MAX_FX_CHILDREN = IS_TOUCH_DEVICE ? 72 : 120;
  const SESSION_REQUEST_TIMEOUT_MS = 8000;
  const RANK_REQUEST_TIMEOUT_MS = 10000;
  const MOVE_UPLOAD_TIMEOUT_MS = 10000;
  const MOVE_UPLOAD_BATCH_SIZE = 50;
  const BOARD = {
    x: 78,
    y: 78,
    size: 744,
    gap: 18,
  };
  BOARD.cell = (BOARD.size - BOARD.gap * (SIZE - 1)) / SIZE;

  const TARGET_RANK = 10; // 2 -> rank 0, 2048 -> rank 10
  const JELLY_ASSETS = Array.from(
    { length: 12 },
    (_, rank) => `assets/images/jellies/jelly-${String(rank).padStart(2, "0")}.png`
  );
  const EFFECT_ASSETS = {
    mergePop: "assets/images/effects/merge-pop.png",
    sparkleStar: "assets/images/effects/sparkle-star.png",
    jellyDrop: "assets/images/effects/jelly-drop.png",
    crownBurst: "assets/images/effects/crown-burst.png",
  };
  const SOUND_ASSETS = {
    slide: "assets/sounds/jelly-slide.mp3",
    merge: "assets/sounds/jelly-merge.mp3",
    mergeCombo: "assets/sounds/jelly-merge-combo.mp3",
    bump: "assets/sounds/jelly-bump.mp3",
    win: "assets/sounds/jelly-win.mp3",
    gameover: "assets/sounds/jelly-gameover.mp3",
    start: "assets/sounds/jelly-start.mp3",
    rankOpen: "assets/sounds/jelly-rank-open.mp3",
    rankSubmit: "assets/sounds/jelly-rank-submit.mp3",
  };
  const SOUND_VOLUME = {
    slide: 0.44,
    merge: 0.58,
    mergeCombo: 0.6,
    bump: 0.48,
    win: 0.62,
    gameover: 0.58,
    start: 0.48,
    rankOpen: 0.46,
    rankSubmit: 0.5,
  };
  const STORAGE = {
    best: "jelly-pang-2048-best",
    guide: "jelly-pang-2048-guide-seen",
    nick: "jelly-pang-2048-nick",
  };

  const RANK_COLORS = [
    0xf76f9d, 0xff9c38, 0xffdf46, 0x83d928,
    0x4fd8ba, 0x42c5f5, 0x8e65f3, 0xf03f9b,
    0xf04437, 0xffca3a, 0xf39c12, 0xffd76a,
  ];
  const HAPTIC_PATTERNS = {
    bump: 24,
    merge: [12, 28, 22],
    mergeCombo: [14, 24, 24, 28, 34],
    win: [28, 42, 54, 42, 82],
    gameover: [52, 46, 30],
  };

  const dirs = {
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
  };

  const $ = (id) => document.getElementById(id);
  const refs = {
    shell: document.querySelector(".game-shell"),
    titleScreen: $("title-screen"),
    serverLoader: $("server-loader"),
    playGame: $("play-game"),
    homeGame: $("home-game"),
    mount: $("pixi-stage"),
    frame: $("stage-frame"),
    score: $("score"),
    best: $("best-score"),
    rankOpen: $("rank-open-title"),
    guide: $("quick-guide"),
    modal: $("message-modal"),
    messageActions: document.querySelector(".message-actions"),
    messageEyebrow: $("message-eyebrow"),
    messageTitle: $("message-title"),
    messageCopy: $("message-copy"),
    keepPlaying: $("keep-playing"),
    tryAgain: $("try-again"),
    rankModal: $("rank-modal"),
    rankClose: $("rank-close"),
    rankContent: $("rank-content"),
    rankSubmitPanel: $("rank-submit-panel"),
    modalScore: $("modal-score"),
    nicknameInput: $("nickname-input"),
    submitRank: $("submit-rank"),
    skipRank: $("skip-rank"),
    submitStatus: $("submit-status"),
  };

  let app;
  let boardLayer;
  let tileLayer;
  let fxLayer;
  let textures = [];
  let effectTextures = {};
  let grid = emptyGrid();
  let visuals = new Map();
  let nextTileId = 1;
  let score = 0;
  let bestScore = Number(localStorage.getItem(STORAGE.best) || 0);
  let locked = false;
  let won = false;
  let keepPlaying = false;
  let pointerStart = null;
  let audioCtx = null;
  let soundPools = {};
  let soundCursor = {};
  let ranking = null;
  let rankSubmitInFlight = false;
  let startInFlight = false;
  let serverTripCount = 0;
  let serverLoaderShownAt = 0;
  let serverLoaderHideTimer = null;

  async function init() {
    if (!window.PIXI || !window.gsap) {
      showLoadError();
      return;
    }

    PIXI.settings.RESOLUTION = RENDER_RESOLUTION;
    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR;

    app = new PIXI.Application({
      width: STAGE,
      height: STAGE,
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      resolution: RENDER_RESOLUTION,
    });
    refs.mount.appendChild(app.view);
    app.view.style.width = "100%";
    app.view.style.height = "100%";
    if (refs.rankModal && refs.rankModal.parentElement !== refs.shell) {
      refs.shell.appendChild(refs.rankModal);
    }

    boardLayer = new PIXI.Container();
    tileLayer = new PIXI.Container();
    fxLayer = new PIXI.Container();
    app.stage.addChild(boardLayer, tileLayer, fxLayer);

    ranking = new RankingClient();
    drawBoard();
    prepareSounds();
    await loadTextures();
    bindInput();
    if (refs.best) refs.best.textContent = formatScore(bestScore);
    showTitle();
  }

  function showLoadError() {
    refs.titleScreen.classList.add("hidden");
    refs.modal.classList.remove("hidden");
    refs.messageEyebrow.textContent = "Load error";
    refs.messageTitle.textContent = "Reload";
    refs.messageCopy.textContent = "라이브러리를 불러오지 못했습니다.";
    refs.keepPlaying.style.display = "none";
  }

  function showTitle() {
    locked = true;
    hideModal();
    hideRanks();
    refs.titleScreen.classList.remove("hidden");
  }

  function startGame() {
    if (startInFlight) return;
    startInFlight = true;
    resumeAudio();
    playSound("start");
    refs.titleScreen.classList.add("hidden");
    newGame().finally(() => {
      startInFlight = false;
    });
  }

  function beginServerTrip() {
    serverTripCount += 1;
    if (serverTripCount === 1) {
      serverLoaderShownAt = Date.now();
      if (serverLoaderHideTimer) {
        window.clearTimeout(serverLoaderHideTimer);
        serverLoaderHideTimer = null;
      }
      refs.shell?.classList.add("is-server-loading");
      refs.serverLoader?.classList.remove("hidden");
      refs.serverLoader?.setAttribute("aria-hidden", "false");
    }

    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      serverTripCount = Math.max(0, serverTripCount - 1);
      if (serverTripCount > 0) return;

      const elapsed = Date.now() - serverLoaderShownAt;
      const delay = Math.max(0, 420 - elapsed);
      serverLoaderHideTimer = window.setTimeout(() => {
        if (serverTripCount > 0) return;
        refs.serverLoader?.classList.add("hidden");
        refs.serverLoader?.setAttribute("aria-hidden", "true");
        refs.shell?.classList.remove("is-server-loading");
        serverLoaderHideTimer = null;
      }, delay);
    };
  }

  async function withServerTrip(task) {
    const endServerTrip = beginServerTrip();
    try {
      return await task();
    } finally {
      endServerTrip();
    }
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = RANK_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  }

  function withTimeout(promise, timeoutMs, message) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) window.clearTimeout(timer);
    });
  }

  async function loadTextures() {
    const effectEntries = Object.entries(EFFECT_ASSETS);
    const [jellyTextures, loadedEffects] = await Promise.all([
      Promise.all(JELLY_ASSETS.map((url) => PIXI.Assets.load(url))),
      Promise.all(effectEntries.map(async ([key, url]) => [key, await PIXI.Assets.load(url)])),
    ]);
    textures = jellyTextures;
    effectTextures = Object.fromEntries(loadedEffects);
  }

  function bindInput() {
    window.addEventListener("keydown", (event) => {
      const map = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
        a: "left",
        d: "right",
        w: "up",
        s: "down",
      };
      const dir = map[event.key];
      if (!dir) return;
      event.preventDefault();
      move(dir);
    }, { passive: false });

    app.view.addEventListener("pointerdown", (event) => {
      resumeAudio();
      pointerStart = { x: event.clientX, y: event.clientY };
    }, { passive: true });

    app.view.addEventListener("pointerup", (event) => {
      if (!pointerStart) return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      pointerStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    }, { passive: true });

    app.view.addEventListener("pointercancel", () => {
      pointerStart = null;
    });

    app.view.addEventListener("contextmenu", (event) => event.preventDefault());

    document.querySelectorAll("[data-dir]").forEach((button) => {
      let skipNextClick = false;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        skipNextClick = true;
        move(button.dataset.dir);
        window.setTimeout(() => {
          skipNextClick = false;
        }, 900);
      });
      button.addEventListener("click", (event) => {
        if (skipNextClick) {
          skipNextClick = false;
          event.preventDefault();
          return;
        }
        move(button.dataset.dir);
      });
    });

    refs.playGame.addEventListener("click", () => startGame());
    refs.homeGame.addEventListener("click", () => showTitle());
    refs.rankOpen.addEventListener("click", () => openRanks());
    refs.rankClose.addEventListener("click", () => hideRanks());
    refs.tryAgain.addEventListener("click", () => startGame());
    refs.keepPlaying.addEventListener("click", () => {
      keepPlaying = true;
      hideModal();
    });
    refs.submitRank.addEventListener("click", () => submitRank());
    refs.skipRank.addEventListener("click", () => {
      if (rankSubmitInFlight) return;
      refs.rankSubmitPanel.classList.add("hidden");
      setSubmitStatus("", "");
    });

    window.addEventListener("blur", () => {
      pointerStart = null;
    });
  }

  async function newGame() {
    locked = true;
    won = false;
    keepPlaying = false;
    score = 0;
    grid = emptyGrid();
    nextTileId = 1;
    visuals.forEach((visual) => destroyPixiObject(visual.container));
    visuals.clear();
    destroyLayerChildren(tileLayer);
    destroyLayerChildren(fxLayer);
    hideModal();
    hideRanks();
    resetRankSubmit();
    updateScore(0, true);

    const firstRun = localStorage.getItem(STORAGE.guide) !== "1";
    const session = await ranking.startSession();
    if (Array.isArray(session?.tiles) && session.tiles.length > 0) {
      session.tiles.forEach((tile) => {
        if (Number.isInteger(tile?.row) && Number.isInteger(tile?.col) && Number.isInteger(tile?.rank)) {
          placeTile(makeTile(tile.rank, tile.row, tile.col), true);
        }
      });
      if (firstRun) showGuide();
      else hideGuide();
    } else if (firstRun) {
      placeTile(makeTile(0, 2, 1), true);
      placeTile(makeTile(0, 2, 2), true);
      showGuide();
    } else {
      spawnRandomTile(true);
      spawnRandomTile(true);
      hideGuide();
    }
    locked = false;
  }

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
  }

  function makeTile(rank, row, col) {
    return { id: nextTileId++, rank, row, col };
  }

  function placeTile(tile, animate = false) {
    grid[tile.row][tile.col] = tile;
    createTileVisual(tile, animate);
    return tile;
  }

  function spawnRandomTile(animate = true) {
    const cells = emptyCells();
    if (!cells.length) return null;
    const spot = cells[Math.floor(Math.random() * cells.length)];
    const rank = Math.random() < 0.9 ? 0 : 1;
    return placeTile(makeTile(rank, spot.row, spot.col), animate);
  }

  function spawnNextTile(animate = true) {
    const spawned = ranking.nextSpawn(emptyCells());
    if (spawned && Number.isInteger(spawned.row) && Number.isInteger(spawned.col) && Number.isInteger(spawned.rank)) {
      return placeTile(makeTile(spawned.rank, spawned.row, spawned.col), animate);
    }
    return spawnRandomTile(animate);
  }

  function emptyCells() {
    const cells = [];
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (!grid[row][col]) cells.push({ row, col });
      }
    }
    return cells;
  }

  function killPixiTweens(target) {
    if (!target || !window.gsap) return;
    gsap.killTweensOf(target);
    ["position", "scale", "skew", "pivot"].forEach((prop) => {
      if (target[prop]) gsap.killTweensOf(target[prop]);
    });
    if (Array.isArray(target.children)) {
      target.children.forEach((child) => killPixiTweens(child));
    }
  }

  function destroyPixiObject(target) {
    if (!target || target.destroyed) return;
    killPixiTweens(target);
    target.destroy({ children: true });
  }

  function destroyLayerChildren(layer) {
    if (!layer) return;
    layer.removeChildren().forEach((child) => destroyPixiObject(child));
  }

  function addFxChild(child) {
    fxLayer.addChild(child);
    trimFxLayer();
    return child;
  }

  function trimFxLayer() {
    if (!fxLayer || fxLayer.children.length <= MAX_FX_CHILDREN) return;
    const overflow = fxLayer.children.length - MAX_FX_CHILDREN;
    for (let i = 0; i < overflow; i++) {
      destroyPixiObject(fxLayer.children[0]);
    }
  }

  function createFxSprite(type, x, y, { scale = 1, alpha = 1, rotation = 0 } = {}) {
    const texture = effectTextures[type];
    if (!texture) return null;
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.x = x;
    sprite.y = y;
    sprite.alpha = alpha;
    sprite.rotation = rotation;
    sprite.scale.set(scale);
    addFxChild(sprite);
    return sprite;
  }

  function move(dir) {
    if (!refs.titleScreen.classList.contains("hidden")) return;
    if (serverTripCount > 0) return;
    resumeAudio();
    if (locked || refs.modal.classList.contains("hidden") === false && !keepPlaying) return;

    const result = buildMove(dir);
    if (!result.changed) {
      shakeBoard(0.34);
      playSound("bump");
      playHaptic("bump");
      return;
    }

    hideGuide(true);
    locked = true;
    ranking.recordMove(dir);
    applyMoveState(result);
    animateMove(result);
  }

  function buildMove(dir) {
    const lines = getLines(dir);
    const newGrid = emptyGrid();
    const moves = [];
    const merges = [];
    let scoreGain = 0;
    let changed = false;

    lines.forEach((line) => {
      const tiles = line.map(({ row, col }) => grid[row][col]).filter(Boolean);
      let targetIndex = 0;

      for (let index = 0; index < tiles.length; index++) {
        const tile = tiles[index];
        const next = tiles[index + 1];
        const target = line[targetIndex];

        if (next && next.rank === tile.rank) {
          const merged = makeTile(tile.rank + 1, target.row, target.col);
          newGrid[target.row][target.col] = merged;
          merges.push({ tile: merged, from: [tile.id, next.id], value: tileValue(merged.rank) });
          scoreGain += tileValue(merged.rank);
          moves.push({ id: tile.id, from: { row: tile.row, col: tile.col }, to: target, remove: true });
          moves.push({ id: next.id, from: { row: next.row, col: next.col }, to: target, remove: true });
          changed = true;
          index++;
          targetIndex++;
        } else {
          newGrid[target.row][target.col] = tile;
          moves.push({ id: tile.id, from: { row: tile.row, col: tile.col }, to: target, remove: false });
          if (tile.row !== target.row || tile.col !== target.col) changed = true;
          targetIndex++;
        }
      }
    });

    return { changed, grid: newGrid, moves, merges, scoreGain };
  }

  function getLines(dir) {
    const lines = [];
    if (dir === "left" || dir === "right") {
      for (let row = 0; row < SIZE; row++) {
        const line = [];
        for (let i = 0; i < SIZE; i++) {
          const col = dir === "left" ? i : SIZE - 1 - i;
          line.push({ row, col });
        }
        lines.push(line);
      }
    } else {
      for (let col = 0; col < SIZE; col++) {
        const line = [];
        for (let i = 0; i < SIZE; i++) {
          const row = dir === "up" ? i : SIZE - 1 - i;
          line.push({ row, col });
        }
        lines.push(line);
      }
    }
    return lines;
  }

  function applyMoveState(result) {
    grid = result.grid;
    result.moves.forEach((moveItem) => {
      if (moveItem.remove) return;
      const tile = visuals.get(moveItem.id)?.tile;
      if (!tile) return;
      tile.row = moveItem.to.row;
      tile.col = moveItem.to.col;
    });
  }

  function animateMove(result) {
    const tl = gsap.timeline({
      defaults: { duration: 0.18, ease: "power3.out" },
      onComplete: () => {
        finishMove(result);
      },
    });

    result.moves.forEach((moveItem) => {
      const visual = visuals.get(moveItem.id);
      if (!visual) return;
      const pos = cellCenter(moveItem.to.row, moveItem.to.col);
      tl.to(visual.container, { x: pos.x, y: pos.y }, 0);
      if (moveItem.remove) {
        tl.to(visual.container.scale, { x: 0.82, y: 1.12, duration: 0.12, ease: "sine.out" }, 0.08);
      }
    });
  }

  function finishMove(result) {
    result.merges.forEach((merge) => {
      merge.from.forEach((id) => {
        const visual = visuals.get(id);
        if (!visual) return;
        destroyPixiObject(visual.container);
        visuals.delete(id);
      });

      createTileVisual(merge.tile, true, true);
      const pos = cellCenter(merge.tile.row, merge.tile.col);
      createMergeWow(pos.x, pos.y, merge.tile.rank, merge.tile.id);
      floatText(`+${formatScore(merge.value)}`, pos.x, pos.y - BOARD.cell * 0.5);
    });

    if (result.scoreGain > 0) {
      updateScore(score + result.scoreGain);
      playSound(result.merges.length > 1 ? "mergeCombo" : "merge");
      playHaptic(result.merges.length > 1 ? "mergeCombo" : "merge");
    } else {
      playSound("slide");
    }

    spawnNextTile(true);

    if (!won && !keepPlaying && hasRank(TARGET_RANK)) {
      won = true;
      locked = false;
      showModal("Crown Jelly", "You win!", "왕관 젤리를 계속 키워보세요.", true, false);
      celebrate();
      playSound("win");
      playHaptic("win");
      return;
    }

    if (!canMove()) {
      locked = false;
      showModal("Game over", "No space", "젤리들이 꽉 찼습니다.", false, true);
      shakeBoard(0.6);
      playSound("gameover");
      playHaptic("gameover");
      return;
    }

    locked = false;
  }

  function canMove() {
    if (emptyCells().length) return true;
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const tile = grid[row][col];
        if (!tile) continue;
        for (const { dr, dc } of Object.values(dirs)) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
          if (grid[nr][nc]?.rank === tile.rank) return true;
        }
      }
    }
    return false;
  }

  function hasRank(rank) {
    return grid.some((row) => row.some((tile) => tile && tile.rank >= rank));
  }

  function updateScore(nextScore, instant = false) {
    const previous = score;
    score = nextScore;
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem(STORAGE.best, String(bestScore));
      if (refs.best) {
        refs.best.textContent = formatScore(bestScore);
        gsap.fromTo(refs.best, { scale: 1.18 }, { scale: 1, duration: 0.58, ease: "elastic.out(1, 0.34)" });
      }
      if (score > 0) celebrate(16);
    }

    if (instant) {
      refs.score.textContent = formatScore(score);
      return;
    }

    const tween = { value: previous };
    gsap.to(tween, {
      value: score,
      duration: 0.36,
      ease: "power2.out",
      onUpdate: () => {
        refs.score.textContent = formatScore(Math.round(tween.value));
      },
      onComplete: () => {
        refs.score.textContent = formatScore(score);
      },
    });
    gsap.fromTo(refs.score, { scale: 1.15 }, { scale: 1, duration: 0.45, ease: "elastic.out(1, 0.45)" });
  }

  function createTileVisual(tile, animate = false, merged = false) {
    const pos = cellCenter(tile.row, tile.col);
    const container = new PIXI.Container();
    container.x = pos.x;
    container.y = pos.y;
    container.sortableChildren = true;

    const aura = new PIXI.Graphics();
    aura.beginFill(RANK_COLORS[tile.rank % RANK_COLORS.length], 0.16);
    aura.drawRoundedRect(-BOARD.cell * 0.46, -BOARD.cell * 0.44, BOARD.cell * 0.92, BOARD.cell * 0.88, 32);
    aura.endFill();
    aura.alpha = 0;

    const sprite = new PIXI.Sprite(textures[Math.min(tile.rank, textures.length - 1)]);
    sprite.anchor.set(0.5);
    const fit = Math.min((BOARD.cell * 0.98) / sprite.texture.width, (BOARD.cell * 0.98) / sprite.texture.height);
    sprite.scale.set(fit);
    sprite.y = BOARD.cell * 0.06;

    const shine = new PIXI.Graphics();
    shine.beginFill(0xffffff, 0.3);
    shine.drawEllipse(-BOARD.cell * 0.22, -BOARD.cell * 0.27, BOARD.cell * 0.16, BOARD.cell * 0.06);
    shine.endFill();
    shine.rotation = -0.38;
    shine.alpha = 0.45;

    const badge = createValueBadge(tile.rank);

    container.addChild(aura, sprite, shine, badge);
    tileLayer.addChild(container);
    visuals.set(tile.id, { tile, container, sprite, badge, aura });

    if (animate) {
      container.alpha = 0;
      const start = merged ? { x: 0.42, y: 1.34 } : { x: 0.35, y: 0.35 };
      container.scale.set(start.x, start.y);
      gsap.to(container, { alpha: 1, duration: 0.08, ease: "sine.out" });
      gsap.to(container.scale, {
        x: 1,
        y: 1,
        duration: merged ? 0.72 : 0.48,
        ease: merged ? "elastic.out(1, 0.38)" : "back.out(2.4)",
      });
      gsap.fromTo(aura, { alpha: merged ? 0.9 : 0.45 }, { alpha: 0, duration: 0.56, ease: "sine.out" });
    }
  }

  function createValueBadge(rank) {
    const value = String(tileValue(rank));
    const fontSize = value.length >= 4 ? 17 : value.length === 3 ? 19 : 22;
    const text = new PIXI.Text(value, {
      fontFamily: "Pretendard, Arial, sans-serif",
      fontSize,
      fontWeight: "950",
      fill: 0x1d2c3f,
      stroke: 0xffffff,
      strokeThickness: 3,
      align: "center",
    });
    text.anchor.set(0.5);
    text.y = -1;

    const width = Math.max(36, text.width + 15);
    const height = 28;
    const badge = new PIXI.Container();
    badge.x = -BOARD.cell * 0.34;
    badge.y = -BOARD.cell * 0.36;

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x1d2c3f, 0.12);
    shadow.drawRoundedRect(-width / 2 + 1.5, -height / 2 + 2.5, width, height, 12);
    shadow.endFill();

    const bg = new PIXI.Graphics();
    bg.beginFill(0xffffff, 0.92);
    bg.lineStyle(2, RANK_COLORS[rank % RANK_COLORS.length], 0.68);
    bg.drawRoundedRect(-width / 2, -height / 2, width, height, 12);
    bg.endFill();

    badge.addChild(shadow, bg, text);
    return badge;
  }

  function drawBoard() {
    boardLayer.cacheAsBitmap = false;
    boardLayer.removeChildren();

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x1f2b45, 0.12);
    shadow.drawRoundedRect(BOARD.x + 14, BOARD.y + 18, BOARD.size, BOARD.size, 44);
    shadow.endFill();

    const panel = new PIXI.Graphics();
    panel.beginFill(0xffffff, 0.38);
    panel.lineStyle(3, 0xffffff, 0.5);
    panel.drawRoundedRect(BOARD.x, BOARD.y, BOARD.size, BOARD.size, 44);
    panel.endFill();

    const glass = new PIXI.Graphics();
    glass.beginFill(0xf9fbff, 0.32);
    glass.drawRoundedRect(BOARD.x + 14, BOARD.y + 12, BOARD.size - 28, BOARD.size * 0.5, 34);
    glass.endFill();

    boardLayer.addChild(shadow, panel, glass);

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const pos = cellTopLeft(row, col);
        const cell = new PIXI.Graphics();
        cell.beginFill(0xffffff, 0.42);
        cell.drawRoundedRect(pos.x, pos.y, BOARD.cell, BOARD.cell, 28);
        cell.endFill();
        cell.lineStyle(2, 0xffffff, 0.55);
        cell.drawRoundedRect(pos.x + 1, pos.y + 1, BOARD.cell - 2, BOARD.cell - 2, 27);
        boardLayer.addChild(cell);

        const inner = new PIXI.Graphics();
        inner.beginFill(0x2b3a55, 0.045);
        inner.drawRoundedRect(pos.x + 11, pos.y + 12, BOARD.cell - 22, BOARD.cell - 24, 22);
        inner.endFill();
        boardLayer.addChild(inner);
      }
    }
    boardLayer.cacheAsBitmap = true;
  }

  function cellTopLeft(row, col) {
    return {
      x: BOARD.x + col * (BOARD.cell + BOARD.gap),
      y: BOARD.y + row * (BOARD.cell + BOARD.gap),
    };
  }

  function cellCenter(row, col) {
    const topLeft = cellTopLeft(row, col);
    return {
      x: topLeft.x + BOARD.cell / 2,
      y: topLeft.y + BOARD.cell / 2,
    };
  }

  function tileValue(rank) {
    return 2 ** (rank + 1);
  }

  function formatScore(value) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  function showGuide() {
    refs.guide.classList.add("is-visible");
  }

  function hideGuide(commit = false) {
    refs.guide.classList.remove("is-visible");
    if (commit) localStorage.setItem(STORAGE.guide, "1");
  }

  function showModal(eyebrow, title, copy, canKeepPlaying, canSubmitRank = false) {
    refs.messageEyebrow.textContent = eyebrow;
    refs.messageTitle.textContent = title;
    refs.messageCopy.textContent = copy;
    refs.keepPlaying.style.display = canKeepPlaying ? "" : "none";
    refs.messageActions.classList.toggle("is-single", !canKeepPlaying);
    if (canSubmitRank && score > 0) {
      resetRankSubmit();
      refs.modalScore.textContent = formatScore(score);
      refs.rankSubmitPanel.classList.remove("hidden");
    } else {
      refs.rankSubmitPanel.classList.add("hidden");
    }
    refs.modal.classList.remove("hidden");
    const card = refs.modal.querySelector(".message-card");
    gsap.fromTo(card, { scale: 0.78, y: 26, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.54, ease: "elastic.out(1, 0.42)" });
  }

  function hideModal() {
    refs.modal.classList.add("hidden");
    refs.keepPlaying.style.display = "";
    refs.messageActions.classList.remove("is-single");
  }

  async function openRanks() {
    resumeAudio();
    playSound("rankOpen");
    refs.rankContent.innerHTML = `<div class="rank-loading">불러오는 중...</div>`;
    refs.rankModal.classList.remove("hidden");
    try {
      const rows = await ranking.fetchTopRanks();
      renderRanks(rows);
    } catch {
      refs.rankContent.innerHTML = `<div class="rank-error">랭킹 서버에 연결할 수 없습니다.</div>`;
    }
  }

  function hideRanks() {
    refs.rankModal.classList.add("hidden");
  }

  async function submitRank() {
    if (rankSubmitInFlight || score <= 0) return;
    const name = refs.nicknameInput.value.trim().slice(0, 20);
    if (!name) {
      setSubmitStatus("닉네임을 입력해주세요.", "fail");
      refs.nicknameInput.focus();
      return;
    }

    rankSubmitInFlight = true;
    setRankSubmitDisabled(true);
    saveNickname(name);
    setSubmitStatus("서버 검증 중...", "");

    const extra = {
      max_tile: getMaxTileValue(),
      target_reached: hasRank(TARGET_RANK),
    };

    try {
      const result = await withServerTrip(() => ranking.submit(name, score, extra));
      playSound("rankSubmit");
      setSubmitStatus(`등록 완료${result?.rank ? ` (#${result.rank})` : ""}`, "ok");
    } catch (err) {
      const message = err?.message === "rank score verification mismatch"
        ? "서버 검증 점수와 현재 점수가 달라 등록하지 않았어요."
        : "서버 검증이 지연되거나 실패했어요. 잠시 후 다시 눌러주세요.";
      setSubmitStatus(message, "fail");
      setRankSubmitDisabled(false);
    } finally {
      rankSubmitInFlight = false;
    }
  }

  function resetRankSubmit() {
    rankSubmitInFlight = false;
    refs.rankSubmitPanel.classList.add("hidden");
    refs.modalScore.textContent = formatScore(score);
    refs.nicknameInput.disabled = false;
    refs.submitRank.disabled = false;
    refs.skipRank.disabled = false;
    refs.nicknameInput.value = loadNickname();
    setSubmitStatus("", "");
  }

  function setRankSubmitDisabled(disabled) {
    refs.nicknameInput.disabled = disabled;
    refs.submitRank.disabled = disabled;
    refs.skipRank.disabled = disabled;
  }

  function setSubmitStatus(text, type) {
    refs.submitStatus.textContent = text;
    refs.submitStatus.className = `submit-status${type ? ` ${type}` : ""}`;
  }

  function renderRanks(rows) {
    refs.rankContent.replaceChildren();
    if (!rows || rows.length === 0) {
      refs.rankContent.innerHTML = `<div class="rank-empty">아직 등록된 기록이 없습니다.</div>`;
      return;
    }

    const myName = loadNickname();
    rows.slice(0, RANK_LIMIT).forEach((row, index) => {
      refs.rankContent.appendChild(createRankRow(row, index, myName));
    });
  }

  function createRankRow(row, index, myName) {
    const rank = Number(row.rank || index + 1);
    const item = document.createElement("div");
    item.className = "rank-row";
    if (rank === 1) item.classList.add("top1");
    else if (rank === 2) item.classList.add("top2");
    else if (rank === 3) item.classList.add("top3");
    if (myName && String(row.player_name || "").trim() === myName) item.classList.add("me");

    const pos = document.createElement("div");
    pos.className = "rank-pos";
    pos.textContent = `#${rank}`;

    const name = document.createElement("div");
    name.className = "rank-name";
    name.textContent = row.player_name || "Jelly Player";

    const points = document.createElement("div");
    points.className = "rank-score";
    points.textContent = formatScore(Number(row.score || 0));

    item.append(pos, name, points);
    return item;
  }

  function getMaxTileValue() {
    let maxRank = 0;
    grid.forEach((row) => row.forEach((tile) => {
      if (tile) maxRank = Math.max(maxRank, tile.rank);
    }));
    return tileValue(maxRank);
  }

  function loadNickname() {
    try { return localStorage.getItem(STORAGE.nick) || ""; } catch { return ""; }
  }

  function saveNickname(name) {
    try { localStorage.setItem(STORAGE.nick, name); } catch {}
  }

  function shakeBoard(duration = 0.42) {
    gsap.killTweensOf(boardLayer);
    gsap.fromTo(boardLayer, { x: -8 }, { x: 0, duration, ease: "elastic.out(1.4, 0.28)" });
    gsap.fromTo(refs.frame, { x: -4 }, { x: 0, duration, ease: "elastic.out(1.2, 0.2)" });
  }

  function pulseButton(button) {
    gsap.fromTo(button, { scale: 0.96 }, { scale: 1, duration: 0.34, ease: "elastic.out(1, 0.35)" });
  }

  function createMergeWow(x, y, rank, tileId) {
    const color = RANK_COLORS[rank % RANK_COLORS.length];
    const nextColor = RANK_COLORS[(rank + 2) % RANK_COLORS.length];
    const intensity = Math.min(IS_TOUCH_DEVICE ? 1.28 : 1.5, 1 + rank * 0.07);
    const visual = visuals.get(tileId);

    pulseMergeTile(visual);
    pulseStageFrame(intensity);
    createShockwaves(x, y, color, nextColor, intensity);
    createSpriteMergeFx(x, y, rank, intensity);
  }

  function createSpriteMergeFx(x, y, rank, intensity) {
    const base = BOARD.cell / 512;
    const pop = createFxSprite("mergePop", x, y, {
      scale: base * 0.42,
      alpha: 0.95,
      rotation: (Math.random() - 0.5) * 0.18,
    });
    if (pop) {
      const targetScale = base * (1.32 + intensity * 0.18);
      gsap.to(pop.scale, { x: targetScale, y: targetScale, duration: 0.42, ease: "power3.out" });
      gsap.to(pop, {
        alpha: 0,
        rotation: pop.rotation + 0.12,
        duration: 0.5,
        delay: 0.1,
        ease: "sine.in",
        onComplete: () => destroyPixiObject(pop),
      });
    }

    const star = createFxSprite("sparkleStar", x, y, {
      scale: base * (0.58 + intensity * 0.12),
      alpha: 0.9,
      rotation: Math.random() * Math.PI,
    });
    if (star) {
      gsap.fromTo(star.scale, { x: base * 0.25, y: base * 0.25 }, {
        x: base * (0.78 + intensity * 0.12),
        y: base * (0.78 + intensity * 0.12),
        duration: 0.34,
        ease: "back.out(2)",
      });
      gsap.to(star, {
        alpha: 0,
        rotation: star.rotation + 0.65,
        duration: 0.62,
        delay: 0.18,
        ease: "sine.in",
        onComplete: () => destroyPixiObject(star),
      });
    }

    const drop = createFxSprite("jellyDrop", x + BOARD.cell * 0.1, y + BOARD.cell * 0.08, {
      scale: base * (0.46 + intensity * 0.08),
      alpha: 0.82,
      rotation: (Math.random() - 0.5) * 0.55,
    });
    if (drop) {
      gsap.to(drop.scale, {
        x: base * (0.72 + intensity * 0.08),
        y: base * (0.72 + intensity * 0.08),
        duration: 0.3,
        ease: "power2.out",
      });
      gsap.to(drop, {
        x: drop.x + BOARD.cell * 0.08,
        y: drop.y + BOARD.cell * 0.1,
        alpha: 0,
        duration: 0.52,
        delay: 0.12,
        ease: "sine.in",
        onComplete: () => destroyPixiObject(drop),
      });
    }

    if (rank >= TARGET_RANK) {
      const crown = createFxSprite("crownBurst", x, y, {
        scale: base * 0.52,
        alpha: 0.95,
        rotation: 0,
      });
      if (crown) {
        gsap.to(crown.scale, {
          x: base * 1.16,
          y: base * 1.16,
          duration: 0.58,
          ease: "power3.out",
        });
        gsap.to(crown, {
          alpha: 0,
          duration: 0.72,
          delay: 0.18,
          ease: "sine.in",
          onComplete: () => destroyPixiObject(crown),
        });
      }
    }
  }

  function pulseMergeTile(visual) {
    if (!visual) return;
    gsap.fromTo(
      visual.container,
      { rotation: -0.05 },
      { rotation: 0, duration: 0.52, ease: "elastic.out(1.2, 0.32)" }
    );
    gsap.fromTo(
      visual.sprite,
      { alpha: 0.82 },
      { alpha: 1, duration: 0.34, ease: "sine.out" }
    );
    gsap.fromTo(
      visual.aura,
      { alpha: 0.95 },
      { alpha: 0, duration: 0.78, ease: "sine.out" }
    );
  }

  function pulseStageFrame(intensity) {
    if (IS_TOUCH_DEVICE) return;
    gsap.killTweensOf(refs.frame);
    gsap.fromTo(
      refs.frame,
      { filter: "brightness(1.16) saturate(1.16)" },
      { filter: "brightness(1) saturate(1)", duration: 0.48 * intensity, ease: "power2.out" }
    );
  }

  function createShockwaves(x, y, color, nextColor, intensity) {
    const rings = [
      { color, delay: 0, width: 10, scale: 1.28 },
      { color: nextColor, delay: 0.06, width: 6, scale: 1.7 },
      { color: 0xffffff, delay: 0.1, width: 4, scale: 2.05 },
    ];
    rings.slice(0, IS_TOUCH_DEVICE ? 2 : rings.length).forEach((ring) => {
      const wave = new PIXI.Graphics();
      wave.lineStyle(ring.width, ring.color, 0.82);
      wave.drawCircle(0, 0, BOARD.cell * 0.28);
      wave.x = x;
      wave.y = y;
      wave.alpha = 0;
      wave.scale.set(0.45);
      addFxChild(wave);
      gsap.to(wave, { alpha: 0.85, duration: 0.08, delay: ring.delay, ease: "sine.out" });
      gsap.to(wave.scale, {
        x: ring.scale * intensity,
        y: ring.scale * intensity,
        duration: 0.62,
        delay: ring.delay,
        ease: "power3.out",
      });
      gsap.to(wave, {
        alpha: 0,
        duration: 0.46,
        delay: ring.delay + 0.16,
        ease: "sine.in",
        onComplete: () => destroyPixiObject(wave),
      });
    });
  }

  function floatText(text, x, y) {
    const label = new PIXI.Text(text, {
      fontFamily: "Pretendard, Arial, sans-serif",
      fontSize: 40,
      fontWeight: "950",
      fill: [0xffffff, 0xfff2b8],
      stroke: 0x1d2c3f,
      strokeThickness: 6,
      align: "center",
    });
    label.anchor.set(0.5);
    label.x = x;
    label.y = y;
    label.scale.set(0.72);
    addFxChild(label);
    gsap.to(label.scale, { x: 1.12, y: 1.12, duration: 0.18, ease: "back.out(2.8)" });
    gsap.to(label, {
      y: y - 58,
      alpha: 0,
      duration: 0.9,
      ease: "power2.out",
      onComplete: () => destroyPixiObject(label),
    });
  }

  function celebrate(count = 34) {
    const width = STAGE;
    const total = Math.max(8, Math.round(count * (IS_TOUCH_DEVICE ? 0.55 : 0.78)));
    for (let i = 0; i < total; i++) {
      const dot = new PIXI.Graphics();
      const color = RANK_COLORS[Math.floor(Math.random() * RANK_COLORS.length)];
      dot.beginFill(color, 0.98);
      dot.drawRoundedRect(-6, -6, 12, 12, 3);
      dot.endFill();
      dot.x = Math.random() * width;
      dot.y = -20 - Math.random() * 80;
      dot.rotation = Math.random() * Math.PI;
      addFxChild(dot);
      gsap.to(dot, {
        y: STAGE + 40,
        x: dot.x + (Math.random() - 0.5) * 140,
        rotation: dot.rotation + Math.PI * (1 + Math.random() * 2),
        duration: 1.5 + Math.random() * 1.2,
        ease: "power1.in",
        onComplete: () => destroyPixiObject(dot),
      });
    }
  }

  function prepareSounds() {
    if (!window.Audio) return;
    soundPools = {};
    soundCursor = {};
    Object.entries(SOUND_ASSETS).forEach(([type, src]) => {
      const poolSize = type === "slide" || type === "merge" || type === "bump" ? 4 : 2;
      soundPools[type] = Array.from({ length: poolSize }, () => {
        const audio = new Audio(src);
        audio.preload = "auto";
        audio.volume = SOUND_VOLUME[type] ?? 0.55;
        return audio;
      });
      soundCursor[type] = 0;
    });
  }

  function resumeAudio() {
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!audioCtx) audioCtx = new AudioCtor();
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    } catch {
      audioCtx = null;
    }
  }

  function canUseHaptics() {
    const nav = window.navigator;
    if (!nav || typeof nav.vibrate !== "function") return false;
    if (nav.maxTouchPoints > 0) return true;
    return window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches === true;
  }

  function playHaptic(type) {
    if (!canUseHaptics()) return;
    const pattern = HAPTIC_PATTERNS[type];
    if (!pattern) return;
    try {
      window.navigator.vibrate(pattern);
    } catch {}
  }

  function playSound(type) {
    if (playMp3Sound(type)) return;
    playSynthSound(type);
  }

  function playMp3Sound(type) {
    const pool = soundPools[type] || soundPools.merge;
    if (!pool || pool.length === 0) return false;
    const cursor = soundCursor[type] || 0;
    const audio = pool[cursor % pool.length];
    soundCursor[type] = cursor + 1;

    try {
      audio.pause();
      audio.currentTime = 0;
      const playing = audio.play();
      if (playing && typeof playing.catch === "function") {
        playing.catch(() => playSynthSound(type));
      }
      return true;
    } catch {
      return false;
    }
  }

  function playSynthSound(type) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.0001, now);

    const playTone = (freq, start, duration, volume, wave = "sine") => {
      const osc = audioCtx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now + start);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + start + duration);
      osc.connect(gain);
      osc.start(now + start);
      osc.stop(now + start + duration);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    };

    if (type === "merge" || type === "mergeCombo") {
      playTone(420, 0, 0.13, 0.06, "triangle");
      playTone(720, 0.06, 0.16, 0.045, "sine");
      if (type === "mergeCombo") playTone(920, 0.12, 0.18, 0.038, "sine");
    } else if (type === "win" || type === "rankSubmit") {
      [523, 659, 784, 1046].forEach((freq, index) => playTone(freq, index * 0.07, 0.22, 0.05, "sine"));
    } else if (type === "gameover") {
      playTone(180, 0, 0.28, 0.055, "triangle");
    } else if (type === "bump") {
      playTone(130, 0, 0.08, 0.035, "sine");
    } else if (type === "start" || type === "rankOpen") {
      playTone(520, 0, 0.08, 0.035, "triangle");
      playTone(780, 0.05, 0.11, 0.03, "sine");
    } else {
      playTone(300, 0, 0.07, 0.025, "triangle");
    }
  }

  class RankingClient {
    constructor() {
      this.sessionId = null;
      this.sessionPromise = null;
      this.moveSeq = 0;
      this.verifiedScore = 0;
      this.sessionData = null;
      this.rngState = 0;
      this.pendingEvents = [];
      this.unsupported = false;
      this.syncFailed = false;
    }

    startSession() {
      this.sessionId = null;
      this.moveSeq = 0;
      this.verifiedScore = 0;
      this.sessionData = null;
      this.rngState = 0;
      this.pendingEvents = [];
      this.unsupported = false;
      this.syncFailed = false;
      this.sessionPromise = withServerTrip(() => fetchWithTimeout(`${RANK_API_BASE}/score-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID }),
      }, SESSION_REQUEST_TIMEOUT_MS)).then(async (res) => {
        if (!res.ok) {
          if (res.status === 400 || res.status === 404) this.unsupported = true;
          throw new Error(`rank session ${res.status}`);
        }
        const data = await res.json();
        this.sessionId = data.session_id || null;
        this.moveSeq = Number(data.move_seq || 0);
        this.verifiedScore = Number(data.score || 0);
        this.rngState = this.normalizeUint32(data.rng_state);
        this.sessionData = data;
        return data;
      }).catch(() => {
        if (!this.unsupported) this.syncFailed = true;
        return null;
      });
      return this.sessionPromise;
    }

    async ensureSession() {
      if (this.unsupported || this.syncFailed) return null;
      if (this.sessionId) return this.sessionId;
      if (!this.sessionPromise) this.startSession();
      const data = await this.sessionPromise;
      return data?.session_id || null;
    }

    normalizeUint32(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return 0;
      return parsed >>> 0;
    }

    nextRandom() {
      const nextState = (this.normalizeUint32(this.rngState) + 0x6D2B79F5) >>> 0;
      let t = nextState;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      this.rngState = nextState;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    nextSpawn(cells) {
      if (this.unsupported || this.syncFailed || !this.rngState || !Array.isArray(cells) || cells.length === 0) return null;
      const spot = cells[Math.floor(this.nextRandom() * cells.length)] || cells[cells.length - 1];
      const rank = this.nextRandom() < 0.9 ? 0 : 1;
      return { row: spot.row, col: spot.col, rank };
    }

    recordMove(dir) {
      if (this.unsupported || this.syncFailed) return null;

      const nextSeq = this.moveSeq + 1;
      this.moveSeq = nextSeq;
      const event = { type: "move", dir, move_seq: nextSeq };
      this.pendingEvents.push(event);
      return event;
    }

    async flushMoves() {
      if (this.unsupported || this.syncFailed) return false;
      const sessionId = await this.ensureSession();
      if (!sessionId) return false;

      while (this.pendingEvents.length > 0) {
        const events = this.pendingEvents.slice(0, MOVE_UPLOAD_BATCH_SIZE);
        const res = await fetchWithTimeout(`${RANK_API_BASE}/score-events`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            game_id: GAME_ID,
            session_id: sessionId,
            events,
          }),
        }, MOVE_UPLOAD_TIMEOUT_MS);
        if (!res.ok) {
          if (res.status === 400 || res.status === 404 || res.status === 409) this.unsupported = true;
          throw new Error(`rank move upload ${res.status}`);
        }
        const data = await res.json();
        const verifiedScore = Number(data.score);
        if (Number.isFinite(verifiedScore)) this.verifiedScore = verifiedScore;
        this.moveSeq = Math.max(this.moveSeq, Number(data.move_seq || events[events.length - 1].move_seq));
        this.pendingEvents.splice(0, events.length);
      }

      return !this.unsupported && !this.syncFailed;
    }

    async submit(playerName, finalScore, extraData = {}) {
      await withTimeout(this.ensureSession(), SESSION_REQUEST_TIMEOUT_MS, "rank session timeout");
      await this.flushMoves();
      const canVerify = this.sessionId && !this.unsupported && !this.syncFailed && this.pendingEvents.length === 0;
      if (!canVerify) throw new Error("rank verification unavailable");
      const submittedScore = Math.max(0, Math.floor(finalScore || 0));
      if (submittedScore !== this.verifiedScore) throw new Error("rank score verification mismatch");
      const body = {
        game_id: GAME_ID,
        player_name: playerName,
        score: submittedScore,
        session_id: this.sessionId,
        extra_data: {
          ...extraData,
          session_id: this.sessionId,
          verification_mode: "session",
        },
      };

      const res = await fetchWithTimeout(`${RANK_API_BASE}/rankings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body),
      }, RANK_REQUEST_TIMEOUT_MS);
      if (!res.ok) throw new Error(`rank submit ${res.status}`);
      const result = await res.json();
      return result;
    }

    async fetchTopRanks(limit = RANK_LIMIT) {
      const res = await withServerTrip(() => fetchWithTimeout(`${RANK_API_BASE}/rankings?game_id=${encodeURIComponent(GAME_ID)}&limit=${limit}`, {
        headers: { "Accept": "application/json" },
      }, RANK_REQUEST_TIMEOUT_MS));
      if (!res.ok) throw new Error(`rank fetch ${res.status}`);
      const data = await res.json();
      return Array.isArray(data.rankings) ? data.rankings : [];
    }
  }

  init();
})();
