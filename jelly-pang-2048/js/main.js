(() => {
  const SIZE = 4;
  const STAGE = 900;
  const BOARD = {
    x: 78,
    y: 78,
    size: 744,
    gap: 18,
  };
  BOARD.cell = (BOARD.size - BOARD.gap * (SIZE - 1)) / SIZE;

  const TARGET_RANK = 10; // 2 -> rank 0, 2048 -> rank 10
  const SPRITE_URL = "assets/images/jelly-sprites.png";
  const STORAGE = {
    best: "jelly-pang-2048-best",
    guide: "jelly-pang-2048-guide-seen",
  };

  const RANK_COLORS = [
    0xf76f9d, 0xff9c38, 0xffdf46, 0x83d928,
    0x4fd8ba, 0x42c5f5, 0x8e65f3, 0xf03f9b,
    0xf04437, 0xffca3a, 0xf39c12, 0xffd76a,
  ];

  const dirs = {
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
  };

  const $ = (id) => document.getElementById(id);
  const refs = {
    mount: $("pixi-stage"),
    frame: $("stage-frame"),
    score: $("score"),
    best: $("best-score"),
    newGame: $("new-game"),
    guide: $("quick-guide"),
    modal: $("message-modal"),
    messageEyebrow: $("message-eyebrow"),
    messageTitle: $("message-title"),
    messageCopy: $("message-copy"),
    keepPlaying: $("keep-playing"),
    tryAgain: $("try-again"),
  };

  let app;
  let boardLayer;
  let tileLayer;
  let fxLayer;
  let textures = [];
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

  async function init() {
    if (!window.PIXI || !window.gsap) {
      showLoadError();
      return;
    }

    PIXI.settings.RESOLUTION = Math.min(window.devicePixelRatio || 1, 2);
    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR;

    app = new PIXI.Application({
      width: STAGE,
      height: STAGE,
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    refs.mount.appendChild(app.view);
    app.view.style.width = "100%";
    app.view.style.height = "100%";

    boardLayer = new PIXI.Container();
    tileLayer = new PIXI.Container();
    fxLayer = new PIXI.Container();
    app.stage.addChild(boardLayer, tileLayer, fxLayer);

    drawBoard();
    await loadTextures();
    bindInput();
    refs.best.textContent = formatScore(bestScore);
    newGame();
  }

  function showLoadError() {
    refs.modal.classList.remove("hidden");
    refs.messageEyebrow.textContent = "Load error";
    refs.messageTitle.textContent = "Reload";
    refs.messageCopy.textContent = "라이브러리를 불러오지 못했습니다.";
    refs.keepPlaying.style.display = "none";
  }

  async function loadTextures() {
    const sheet = await PIXI.Assets.load(SPRITE_URL);
    const base = sheet.baseTexture;
    const cellW = 313;
    const cellH = 418;
    textures = Array.from({ length: 12 }, (_, rank) => {
      const col = rank % 4;
      const row = Math.floor(rank / 4);
      return new PIXI.Texture(base, new PIXI.Rectangle(col * cellW, row * cellH, cellW, cellH));
    });
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
      button.addEventListener("click", () => move(button.dataset.dir));
    });

    refs.newGame.addEventListener("click", () => newGame());
    refs.tryAgain.addEventListener("click", () => newGame());
    refs.keepPlaying.addEventListener("click", () => {
      keepPlaying = true;
      hideModal();
    });

    window.addEventListener("blur", () => {
      pointerStart = null;
    });
  }

  function newGame() {
    locked = false;
    won = false;
    keepPlaying = false;
    score = 0;
    grid = emptyGrid();
    nextTileId = 1;
    visuals.forEach((visual) => visual.container.destroy({ children: true }));
    visuals.clear();
    tileLayer.removeChildren();
    fxLayer.removeChildren();
    hideModal();
    updateScore(0, true);

    const firstRun = localStorage.getItem(STORAGE.guide) !== "1";
    if (firstRun) {
      placeTile(makeTile(0, 2, 1), true);
      placeTile(makeTile(0, 2, 2), true);
      showGuide();
    } else {
      spawnRandomTile(true);
      spawnRandomTile(true);
      hideGuide();
    }
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

  function emptyCells() {
    const cells = [];
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (!grid[row][col]) cells.push({ row, col });
      }
    }
    return cells;
  }

  function move(dir) {
    resumeAudio();
    if (locked || refs.modal.classList.contains("hidden") === false && !keepPlaying) return;

    const result = buildMove(dir);
    if (!result.changed) {
      shakeBoard(0.34);
      playSound("bump");
      return;
    }

    hideGuide(true);
    locked = true;
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
        visual.container.destroy({ children: true });
        visuals.delete(id);
      });

      createTileVisual(merge.tile, true, true);
      const pos = cellCenter(merge.tile.row, merge.tile.col);
      createBurst(pos.x, pos.y, RANK_COLORS[merge.tile.rank % RANK_COLORS.length], 18);
      floatText(`+${formatScore(merge.value)}`, pos.x, pos.y - BOARD.cell * 0.5);
    });

    if (result.scoreGain > 0) {
      updateScore(score + result.scoreGain);
      playSound("merge");
    } else {
      playSound("slide");
    }

    spawnRandomTile(true);

    if (!won && !keepPlaying && hasRank(TARGET_RANK)) {
      won = true;
      locked = false;
      showModal("2048 Jelly", "You win!", "왕관 젤리를 계속 키워보세요.", true);
      celebrate();
      playSound("win");
      return;
    }

    if (!canMove()) {
      locked = false;
      showModal("Game over", "No space", "젤리들이 꽉 찼습니다.", false);
      shakeBoard(0.6);
      playSound("gameover");
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
      refs.best.textContent = formatScore(bestScore);
      gsap.fromTo(refs.best, { scale: 1.18 }, { scale: 1, duration: 0.58, ease: "elastic.out(1, 0.34)" });
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
    const fit = Math.min((BOARD.cell * 1.15) / sprite.texture.width, (BOARD.cell * 1.08) / sprite.texture.height);
    sprite.scale.set(fit);
    sprite.y = -BOARD.cell * 0.01;

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
    const fontSize = value.length >= 4 ? 25 : value.length === 3 ? 30 : 35;
    const text = new PIXI.Text(value, {
      fontFamily: "Pretendard, Arial, sans-serif",
      fontSize,
      fontWeight: "950",
      fill: 0x1d2c3f,
      stroke: 0xffffff,
      strokeThickness: 4,
      align: "center",
    });
    text.anchor.set(0.5);
    text.y = -1;

    const width = Math.max(54, text.width + 22);
    const height = 39;
    const badge = new PIXI.Container();
    badge.y = BOARD.cell * 0.39;

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x1d2c3f, 0.14);
    shadow.drawRoundedRect(-width / 2 + 2, -height / 2 + 4, width, height, 19);
    shadow.endFill();

    const bg = new PIXI.Graphics();
    bg.beginFill(0xffffff, 0.9);
    bg.lineStyle(3, RANK_COLORS[rank % RANK_COLORS.length], 0.7);
    bg.drawRoundedRect(-width / 2, -height / 2, width, height, 19);
    bg.endFill();

    badge.addChild(shadow, bg, text);
    return badge;
  }

  function drawBoard() {
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

  function showModal(eyebrow, title, copy, canKeepPlaying) {
    refs.messageEyebrow.textContent = eyebrow;
    refs.messageTitle.textContent = title;
    refs.messageCopy.textContent = copy;
    refs.keepPlaying.style.display = canKeepPlaying ? "" : "none";
    refs.modal.classList.remove("hidden");
    const card = refs.modal.querySelector(".message-card");
    gsap.fromTo(card, { scale: 0.78, y: 26, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.54, ease: "elastic.out(1, 0.42)" });
  }

  function hideModal() {
    refs.modal.classList.add("hidden");
    refs.keepPlaying.style.display = "";
  }

  function shakeBoard(duration = 0.42) {
    gsap.killTweensOf(boardLayer);
    gsap.fromTo(boardLayer, { x: -8 }, { x: 0, duration, ease: "elastic.out(1.4, 0.28)" });
    gsap.fromTo(refs.frame, { x: -4 }, { x: 0, duration, ease: "elastic.out(1.2, 0.2)" });
  }

  function pulseButton(button) {
    gsap.fromTo(button, { scale: 0.96 }, { scale: 1, duration: 0.34, ease: "elastic.out(1, 0.35)" });
  }

  function createBurst(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const dot = new PIXI.Graphics();
      const radius = 5 + Math.random() * 8;
      dot.beginFill(i % 5 === 0 ? 0xffffff : color, 0.96);
      dot.drawCircle(0, 0, radius);
      dot.endFill();
      dot.x = x;
      dot.y = y;
      fxLayer.addChild(dot);

      const angle = Math.random() * Math.PI * 2;
      const distance = BOARD.cell * (0.22 + Math.random() * 0.56);
      gsap.to(dot, {
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        duration: 0.45 + Math.random() * 0.24,
        ease: "power2.out",
        onComplete: () => dot.destroy(),
      });
      gsap.to(dot.scale, { x: 0.25, y: 0.25, duration: 0.6, ease: "sine.in" });
    }
  }

  function floatText(text, x, y) {
    const label = new PIXI.Text(text, {
      fontFamily: "Pretendard, Arial, sans-serif",
      fontSize: 34,
      fontWeight: "900",
      fill: 0xffffff,
      stroke: 0x1d2c3f,
      strokeThickness: 5,
      align: "center",
    });
    label.anchor.set(0.5);
    label.x = x;
    label.y = y;
    fxLayer.addChild(label);
    gsap.to(label, {
      y: y - 42,
      alpha: 0,
      duration: 0.72,
      ease: "power2.out",
      onComplete: () => label.destroy(),
    });
  }

  function celebrate(count = 34) {
    const width = STAGE;
    for (let i = 0; i < count; i++) {
      const dot = new PIXI.Graphics();
      const color = RANK_COLORS[Math.floor(Math.random() * RANK_COLORS.length)];
      dot.beginFill(color, 0.98);
      dot.drawRoundedRect(-6, -6, 12, 12, 3);
      dot.endFill();
      dot.x = Math.random() * width;
      dot.y = -20 - Math.random() * 80;
      dot.rotation = Math.random() * Math.PI;
      fxLayer.addChild(dot);
      gsap.to(dot, {
        y: STAGE + 40,
        x: dot.x + (Math.random() - 0.5) * 140,
        rotation: dot.rotation + Math.PI * (1 + Math.random() * 2),
        duration: 1.5 + Math.random() * 1.2,
        ease: "power1.in",
        onComplete: () => dot.destroy(),
      });
    }
  }

  function resumeAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function playSound(type) {
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

    if (type === "merge") {
      playTone(420, 0, 0.13, 0.06, "triangle");
      playTone(720, 0.06, 0.16, 0.045, "sine");
    } else if (type === "win") {
      [523, 659, 784, 1046].forEach((freq, index) => playTone(freq, index * 0.07, 0.22, 0.05, "sine"));
    } else if (type === "gameover") {
      playTone(180, 0, 0.28, 0.055, "triangle");
    } else if (type === "bump") {
      playTone(130, 0, 0.08, 0.035, "sine");
    } else {
      playTone(300, 0, 0.07, 0.025, "triangle");
    }
  }

  init();
})();
