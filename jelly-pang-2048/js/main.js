(() => {
  const GAME_ID = "jelly-pang-2048";
  const RANK_API_BASE = "https://game-api.yama5993.workers.dev";
  const RANK_LIMIT = 20;
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
  const JELLY_ASSETS = Array.from(
    { length: 12 },
    (_, rank) => `assets/images/jellies/jelly-${String(rank).padStart(2, "0")}.png`
  );
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
    rankOpen: $("rank-open"),
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
  let ranking = null;
  let rankSubmitInFlight = false;

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

    ranking = new RankingClient();
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
    textures = await Promise.all(JELLY_ASSETS.map((url) => PIXI.Assets.load(url)));
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
    refs.rankOpen.addEventListener("click", () => openRanks());
    refs.rankClose.addEventListener("click", () => hideRanks());
    refs.tryAgain.addEventListener("click", () => newGame());
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
    visuals.forEach((visual) => visual.container.destroy({ children: true }));
    visuals.clear();
    tileLayer.removeChildren();
    fxLayer.removeChildren();
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

  function emptyCells() {
    const cells = [];
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (!grid[row][col]) cells.push({ row, col });
      }
    }
    return cells;
  }

  async function move(dir) {
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
    const verifiedMove = await ranking.recordMove(dir);
    if (verifiedMove) {
      result.verifiedMove = verifiedMove;
    }
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
      const verifiedScore = Number(result.verifiedMove?.score);
      updateScore(Number.isFinite(verifiedScore) ? verifiedScore : score + result.scoreGain);
      playSound("merge");
    } else {
      playSound("slide");
    }

    const spawned = result.verifiedMove?.spawned;
    if (spawned && Number.isInteger(spawned.row) && Number.isInteger(spawned.col) && Number.isInteger(spawned.rank)) {
      placeTile(makeTile(spawned.rank, spawned.row, spawned.col), true);
    } else {
      spawnRandomTile(true);
    }

    if (!won && !keepPlaying && hasRank(TARGET_RANK)) {
      won = true;
      locked = false;
      showModal("2048 Jelly", "You win!", "왕관 젤리를 계속 키워보세요.", true, false);
      celebrate();
      playSound("win");
      return;
    }

    if (result.verifiedMove?.game_over || !canMove()) {
      locked = false;
      showModal("Game over", "No space", "젤리들이 꽉 찼습니다.", false, true);
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
    setSubmitStatus("등록 중...", "");

    const extra = {
      max_tile: getMaxTileValue(),
      target_reached: hasRank(TARGET_RANK),
    };

    try {
      const result = await ranking.submit(name, score, extra);
      setSubmitStatus(`등록 완료${result?.rank ? ` (#${result.rank})` : ""}`, "ok");
    } catch {
      setSubmitStatus("검증 실패로 등록되지 않았어요. 새 게임으로 다시 도전해주세요.", "fail");
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

  class RankingClient {
    constructor() {
      this.sessionId = null;
      this.sessionPromise = null;
      this.moveSeq = 0;
      this.verifiedScore = 0;
      this.sessionData = null;
      this.unsupported = false;
      this.syncFailed = false;
    }

    startSession() {
      this.sessionId = null;
      this.moveSeq = 0;
      this.verifiedScore = 0;
      this.sessionData = null;
      this.unsupported = false;
      this.syncFailed = false;
      this.sessionPromise = fetch(`${RANK_API_BASE}/score-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID }),
      }).then(async (res) => {
        if (!res.ok) {
          if (res.status === 400 || res.status === 404) this.unsupported = true;
          throw new Error(`rank session ${res.status}`);
        }
        const data = await res.json();
        this.sessionId = data.session_id || null;
        this.moveSeq = Number(data.move_seq || 0);
        this.verifiedScore = Number(data.score || 0);
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

    async recordMove(dir) {
      if (this.unsupported || this.syncFailed) return null;
      const sessionId = await this.ensureSession();
      if (!sessionId) return null;

      const nextSeq = this.moveSeq + 1;
      try {
        const res = await fetch(`${RANK_API_BASE}/score-events`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            game_id: GAME_ID,
            session_id: sessionId,
            event: { type: "move", dir, move_seq: nextSeq },
          }),
        });
        if (!res.ok) {
          if (res.status === 400 || res.status === 404 || res.status === 409) this.unsupported = true;
          throw new Error(`rank move ${res.status}`);
        }
        const data = await res.json();
        this.moveSeq = Number(data.move_seq || nextSeq);
        this.verifiedScore = Number(data.score || this.verifiedScore || 0);
        return data;
      } catch {
        if (!this.unsupported) this.syncFailed = true;
        return null;
      }
    }

    async submit(playerName, finalScore, extraData = {}) {
      await this.ensureSession();
      const canVerify = this.sessionId && !this.unsupported && !this.syncFailed;
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

      const res = await fetch(`${RANK_API_BASE}/rankings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`rank submit ${res.status}`);
      const result = await res.json();
      return result;
    }

    async fetchTopRanks(limit = RANK_LIMIT) {
      const res = await fetch(`${RANK_API_BASE}/rankings?game_id=${encodeURIComponent(GAME_ID)}&limit=${limit}`, {
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) throw new Error(`rank fetch ${res.status}`);
      const data = await res.json();
      return Array.isArray(data.rankings) ? data.rankings : [];
    }
  }

  init();
})();
