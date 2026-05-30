import { GEM_BY_ID, getGemCssVars, getGemName } from './gem.js';
import { STAGES, getGoalText } from './stage.js';

const GEM_VFX = Object.fromEntries(Object.keys(GEM_BY_ID).map((type) => {
  const gem = GEM_BY_ID[type];
  return [type, {
    color: gem.color,
    rgb: hexToRgb(gem.color),
    glow: hexToRgba(gem.color, 0.72),
    burst: `assets/images/effects/gem-shatter-${type}.png`,
    shards: `assets/images/effects/gem-shards-${type}.png`
  }];
}));

export class UI {
  constructor(lang = 'ko') {
    this.lang = lang;
    this.refs = {
      title: document.getElementById('title-screen'),
      game: document.getElementById('game-screen'),
      app: document.getElementById('app'),
      board: document.getElementById('board'),
      boardFrame: document.querySelector('.board-frame'),
      comboLayer: document.getElementById('combo-layer'),
      particleLayer: document.getElementById('particle-layer'),
      titleProgress: document.getElementById('title-progress'),
      titleStars: document.getElementById('title-stars'),
      titleBest: document.getElementById('title-best'),
      continueBtn: document.getElementById('continue-btn'),
      hudTarget: document.getElementById('hud-target'),
      hudScore: document.getElementById('hud-score'),
      hudMoves: document.getElementById('hud-moves'),
      stageLabel: document.getElementById('stage-label'),
      objectiveTitle: document.getElementById('objective-title'),
      collectGoals: document.getElementById('collect-goals'),
      stageModal: document.getElementById('stage-modal'),
      stageList: document.getElementById('stage-list'),
      pauseModal: document.getElementById('pause-modal'),
      resultModal: document.getElementById('result-modal'),
      resultKicker: document.getElementById('result-kicker'),
      resultTitle: document.getElementById('result-title'),
      resultStars: document.getElementById('result-stars'),
      resultScore: document.getElementById('result-score'),
      resultBest: document.getElementById('result-best'),
      resultMoves: document.getElementById('result-moves'),
      rankSubmit: document.getElementById('rank-submit'),
      nicknameInput: document.getElementById('nickname-input'),
      submitStatus: document.getElementById('submit-status'),
      nextStageBtn: document.getElementById('next-stage-btn'),
      rankModal: document.getElementById('rank-modal'),
      rankContent: document.getElementById('rank-content'),
      toast: document.getElementById('toast')
    };
  }

  setScreen(screen) {
    this.refs.title.classList.toggle('is-active', screen === 'title');
    this.refs.game.classList.toggle('is-active', screen === 'game');
  }

  renderTitle({ progress, totalStars, bestScore, savedGame }) {
    this.refs.titleProgress.textContent = `Stage ${Math.min(progress.currentStage || 1, STAGES.length)}`;
    this.refs.titleStars.textContent = String(totalStars || 0);
    this.refs.titleBest.textContent = Number(bestScore || 0).toLocaleString();
    this.refs.continueBtn.disabled = !savedGame;
  }

  updateSoundButtons(enabled) {
    document.querySelectorAll('[id^="sound-toggle"]').forEach((button) => {
      button.textContent = enabled ? 'Sound' : 'Mute';
      button.setAttribute('aria-pressed', String(enabled));
    });
  }

  updateHUD(state) {
    const stage = state.stage;
    this.refs.hudTarget.textContent = Number(stage.targetScore).toLocaleString();
    this.refs.hudScore.textContent = Number(state.score).toLocaleString();
    this.refs.hudMoves.textContent = String(state.moves);
    this.refs.stageLabel.textContent = `Stage ${stage.id} · ${stage.name}`;
    this.refs.objectiveTitle.textContent = getGoalText(stage);
    this.renderGoals(stage, state.collections);
  }

  renderGoals(stage, collections = {}) {
    this.refs.collectGoals.replaceChildren();
    for (const goal of stage.goals) {
      const gem = GEM_BY_ID[goal.type];
      const current = Math.min(collections[goal.type] || 0, goal.count);
      const pill = document.createElement('div');
      pill.className = 'collect-pill';
      const icon = document.createElement('span');
      icon.className = 'mini-gem';
      icon.style.cssText = getGemCssVars(goal.type);
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = `${current}/${goal.count}`;
      pill.title = `${getGemName(goal.type, this.lang)} ${current}/${goal.count}`;
      pill.append(icon, label);
      if (gem) pill.style.borderColor = `${gem.color}66`;
      this.refs.collectGoals.appendChild(pill);
    }
  }

  renderBoard(grid, selected = null, fallMoves = []) {
    const frag = document.createDocumentFragment();
    const fallMap = new Map(fallMoves.map((move) => [`${move.to.row}:${move.to.col}`, move]));
    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < grid[r].length; c += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', `${r + 1}행 ${c + 1}열`);
        if (selected && selected.row === r && selected.col === c) cell.classList.add('selected');
        const gem = grid[r][c];
        if (gem) {
          const gemEl = this.createGemEl(gem);
          const fallMove = fallMap.get(`${r}:${c}`);
          if (fallMove) {
            const timing = this.applyFallAnimation(gemEl, fallMove);
            cell.appendChild(this.createLandingVfx(timing));
          }
          cell.appendChild(gemEl);
        }
        frag.appendChild(cell);
      }
    }
    this.refs.board.replaceChildren(frag);
  }

  createGemEl(gem) {
    const meta = GEM_BY_ID[gem.type];
    const el = document.createElement('span');
    el.className = `gem ${meta?.cssClass || ''}`;
    if (meta?.image) el.classList.add('has-image');
    if (gem.special) el.classList.add(gem.special === 'row' ? 'special-row' : 'special-col');
    el.dataset.type = gem.type;
    if (gem.special) el.dataset.special = gem.special;
    el.setAttribute('aria-label', `${getGemName(gem.type, this.lang)}${gem.special ? ' 광선 보석' : ''}`);
    if (meta?.image) {
      const img = document.createElement('img');
      img.className = 'gem-image';
      img.src = meta.image;
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.addEventListener('error', () => {
        el.classList.remove('has-image');
        img.remove();
      }, { once: true });
      el.appendChild(img);
    }
    const core = document.createElement('span');
    core.className = 'gem-core';
    el.appendChild(core);
    return el;
  }

  applyFallAnimation(el, move) {
    const fromRow = Number(move.from?.row ?? move.to.row);
    const toRow = Number(move.to?.row ?? fromRow);
    const distance = Math.max(1, fromRow < 0 ? toRow + 1.6 : toRow - fromRow);
    const duration = Math.min(920, 380 + distance * 72);
    const delay = Math.min(160, Number(move.to?.col || 0) * 12 + Math.max(0, 7 - toRow) * 4);
    el.classList.add('falling');
    el.style.setProperty('--fall-offset', `${Math.min(10, distance) * -112}%`);
    el.style.setProperty('--fall-duration', `${duration}ms`);
    el.style.setProperty('--fall-delay', `${delay}ms`);
    el.addEventListener('animationend', () => {
      el.classList.remove('falling');
      el.style.removeProperty('--fall-offset');
      el.style.removeProperty('--fall-duration');
      el.style.removeProperty('--fall-delay');
    }, { once: true });
    return { duration, delay, distance };
  }

  createLandingVfx({ duration, delay, distance }) {
    const vfx = document.createElement('span');
    vfx.className = 'landing-vfx';
    vfx.style.setProperty('--landing-delay', `${Math.max(0, delay + duration * 0.62)}ms`);
    vfx.style.setProperty('--landing-scale', String(Math.min(1.45, 0.9 + distance * 0.08)));
    return vfx;
  }

  markCells(cells, className, duration = 320) {
    for (const cell of cells) {
      const el = this.getCellEl(cell);
      if (!el) continue;
      if (className === 'clearing') this.applyVfxVars(el, cell.type || el.querySelector('.gem')?.dataset.type, 'cell');
      el.classList.add(className);
    }
    return delay(duration).then(() => {
      for (const cell of cells) {
        const el = this.getCellEl(cell);
        if (!el) continue;
        el.classList.remove(className);
        if (className === 'clearing') {
          el.style.removeProperty('--cell-vfx-color');
          el.style.removeProperty('--cell-vfx-rgb');
          el.style.removeProperty('--cell-vfx-glow');
        }
      }
    });
  }

  getCellEl(cell) {
    return this.refs.board.querySelector(`.cell[data-row="${cell.row}"][data-col="${cell.col}"]`);
  }

  showCombo(combo, lineCount = 1, longest = 3) {
    const bigMatch = lineCount > 1 || longest >= 4;
    if (combo <= 1 && !bigMatch) return;
    const pop = document.createElement('div');
    pop.className = 'combo-pop';
    if (combo >= 5) pop.classList.add('mega');
    if (combo >= 3 || longest >= 5 || lineCount >= 3) pop.classList.add('super');
    pop.textContent = combo > 1
      ? `${combo >= 5 ? 'LEGEND' : combo >= 3 ? 'MEGA' : 'COMBO'} x${combo}!`
      : longest >= 5 ? 'PRISM!'
        : lineCount >= 2 ? 'DOUBLE!'
          : 'WOW!';
    this.refs.comboLayer.appendChild(pop);
    setTimeout(() => pop.remove(), 980);
  }

  spawnMatchEffects(cells, options = {}) {
    const layerRect = this.refs.particleLayer.getBoundingClientRect();
    const vfxLimit = window.matchMedia('(max-width: 640px)').matches ? 180 : 360;
    const activeVfx = this.refs.particleLayer.childElementCount;
    const loadRatio = activeVfx / vfxLimit;
    const queueScale = loadRatio > 1.15 ? 0.28 : loadRatio > 0.82 ? 0.48 : loadRatio > 0.46 ? 0.72 : 1;
    const eventScale = cells.length > 18 ? 0.42 : cells.length > 10 ? 0.52 : cells.length > 6 ? 0.7 : 1;
    const loadScale = Math.min(queueScale, eventScale);
    const maxPoints = loadScale <= 0.35 ? 8 : loadScale <= 0.55 ? 14 : loadScale < 0.8 ? 22 : 32;
    const points = cells
      .slice(0, maxPoints)
      .map((cell) => this.getCellCenter(cell, layerRect))
      .filter(Boolean);
    if (!points.length) return;

    const combo = Number(options.combo || 1);
    const lineCount = Number(options.lineCount || 1);
    const longest = Number(options.longest || 3);
    const hasSpecial = Number(options.specialActivations || 0) > 0;
    const intensity = Math.min(5.2, 1.32 + combo * 0.42 + Math.max(0, lineCount - 1) * 0.46 + Math.max(0, longest - 3) * 0.34 + (hasSpecial ? 0.85 : 0));
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    center.x /= points.length;
    center.y /= points.length;
    const centerType = dominantType(points);
    const pointDensity = Math.max(0.14, Math.min(1, 4.8 / points.length) * loadScale);

    this.pulseBoard(intensity);
    this.spawnBoardFlash(intensity, centerType);
    if (loadScale > 0.55) this.spawnBoardFlash(intensity * 0.72, centerType, 'white-hot');
    this.spawnBurst(center.x, center.y, Math.max(points[0].size * 2.35, 96 * intensity), 'mega', centerType);
    if (loadScale > 0.5) this.spawnBurst(center.x, center.y, Math.max(points[0].size * 1.6, 62 * intensity), 'flash', centerType);
    this.spawnRing(center.x, center.y, Math.max(points[0].size * 3.4, 180 * intensity), 'mega shock', centerType);
    this.spawnRaySpray(center.x, center.y, Math.round((18 + intensity * 8) * loadScale), points[0].size * 1.3, intensity + 0.4, centerType);
    if (loadScale > 0.5) this.spawnGlint(center.x, center.y, points[0].size * (2.4 + intensity * 0.32), intensity, centerType, 'major');

    for (const point of points) {
      const type = point.type || centerType;
      if (loadScale > 0.62) this.spawnBurst(point.x, point.y, point.size * randomBetween(1.2, 1.62) * (1 + intensity * 0.24), '', type);
      if (loadScale > 0.72) this.spawnBurst(point.x, point.y, point.size * randomBetween(0.92, 1.24) * (1 + intensity * 0.18), 'flash', type);
      if (loadScale > 0.62) this.spawnRing(point.x, point.y, point.size * randomBetween(1.9, 2.7) * intensity, '', type);
      this.spawnShardSpray(point.x, point.y, Math.round((15 + intensity * 7) * pointDensity), point.size, intensity, type);
      this.spawnRaySpray(point.x, point.y, Math.round((5 + intensity * 3) * pointDensity), point.size, intensity, type);
      if (loadScale > 0.62) this.spawnGlint(point.x, point.y, point.size * randomBetween(1.25, 1.8), intensity, type);
      const sparkCount = Math.round((8 + intensity * 3) * pointDensity);
      for (let i = 0; i < sparkCount; i += 1) this.spawnSpark(point.x, point.y, point.size, intensity, type);
    }

    if (combo >= 3 || hasSpecial || longest >= 5) {
      this.spawnShardSpray(center.x, center.y, Math.round((48 + combo * 8) * loadScale), points[0].size * 1.45, intensity + 0.8, centerType);
      this.spawnRaySpray(center.x, center.y, Math.round((34 + combo * 6) * loadScale), points[0].size * 1.7, intensity + 0.9, centerType);
      this.spawnRing(center.x, center.y, Math.max(points[0].size * 5.4, 300 * intensity), 'screen shock', centerType);
      if (loadScale > 0.5) this.spawnGlint(center.x, center.y, points[0].size * (3.2 + intensity * 0.42), intensity + 0.8, centerType, 'major');
    }
    this.trimParticleLayer(vfxLimit);
  }

  spawnParticles(cells) {
    this.spawnMatchEffects(cells);
  }

  getCellCenter(cell, layerRect) {
    const el = this.getCellEl(cell);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left - layerRect.left + rect.width / 2,
      y: rect.top - layerRect.top + rect.height / 2,
      size: Math.max(rect.width, rect.height),
      type: cell.type || el.querySelector('.gem')?.dataset.type || null
    };
  }

  pulseBoard(intensity) {
    const app = this.refs.app;
    const frame = this.refs.boardFrame;
    if (!app || !frame) return;
    app.style.setProperty('--shake-power', `${Math.min(28, 8 + intensity * 6.2)}px`);
    app.classList.remove('match-shake');
    frame.classList.remove('match-impact');
    void app.offsetWidth;
    app.classList.add('match-shake');
    frame.classList.add('match-impact');
    clearTimeout(this.impactTimer);
    this.impactTimer = setTimeout(() => {
      app.classList.remove('match-shake');
      frame.classList.remove('match-impact');
    }, 680);
  }

  spawnBoardFlash(intensity, type, extraClass = '') {
    const flash = document.createElement('span');
    flash.className = `vfx-board-flash ${extraClass}`.trim();
    this.applyVfxVars(flash, type);
    flash.style.setProperty('--flash-alpha', String(Math.min(0.86, 0.22 + intensity * 0.12)));
    this.refs.particleLayer.appendChild(flash);
    setTimeout(() => flash.remove(), 660);
  }

  spawnBurst(x, y, size, extraClass = '', type = null) {
    const burst = document.createElement('span');
    burst.className = `vfx-burst ${extraClass}`.trim();
    this.applyVfxVars(burst, type, 'burst');
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;
    const cap = extraClass.includes('mega') ? 360 : extraClass.includes('flash') ? 230 : 260;
    burst.style.setProperty('--size', `${Math.min(cap, size)}px`);
    burst.style.setProperty('--spin', `${randomBetween(-18, 18).toFixed(1)}deg`);
    this.refs.particleLayer.appendChild(burst);
    setTimeout(() => burst.remove(), 1080);
  }

  spawnRing(x, y, size, extraClass = '', type = null) {
    const ring = document.createElement('span');
    ring.className = `vfx-ring ${extraClass}`.trim();
    this.applyVfxVars(ring, type);
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.setProperty('--size', `${Math.min(920, size)}px`);
    this.refs.particleLayer.appendChild(ring);
    setTimeout(() => ring.remove(), 940);
  }

  spawnShardSpray(x, y, count, baseSize, intensity, type = null) {
    const capped = Math.min(96, count);
    for (let i = 0; i < capped; i += 1) {
      const shard = document.createElement('span');
      shard.className = 'vfx-shard';
      this.applyVfxVars(shard, type, 'shard');
      shard.style.left = `${x}px`;
      shard.style.top = `${y}px`;
      const angle = (Math.PI * 2 * i / capped) + randomBetween(-0.28, 0.28);
      const distance = randomBetween(baseSize * 0.9, baseSize * (3.25 + intensity * 0.82));
      const size = randomBetween(16, 42) * Math.min(1.85, 0.9 + intensity * 0.22);
      const atlasX = Math.floor(Math.random() * 4) * 33.333;
      const atlasY = Math.floor(Math.random() * 4) * 33.333;
      shard.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
      shard.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
      shard.style.setProperty('--rot', `${randomBetween(-420, 420).toFixed(1)}deg`);
      shard.style.setProperty('--size', `${size}px`);
      shard.style.setProperty('--dur', `${randomBetween(720, 1180)}ms`);
      shard.style.setProperty('--atlas-x', `${atlasX}%`);
      shard.style.setProperty('--atlas-y', `${atlasY}%`);
      this.refs.particleLayer.appendChild(shard);
      setTimeout(() => shard.remove(), 1240);
    }
  }

  spawnSpark(x, y, baseSize, intensity, type = null) {
    const spark = document.createElement('span');
    spark.className = 'spark';
    this.applyVfxVars(spark, type);
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    const angle = Math.random() * Math.PI * 2;
    const distance = randomBetween(baseSize * 0.7, baseSize * (2.4 + intensity * 0.7));
    spark.style.setProperty('--size', `${randomBetween(7, 15) * Math.min(1.55, 0.9 + intensity * 0.16)}px`);
    spark.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    spark.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    spark.style.setProperty('--rot', `${randomBetween(-220, 220).toFixed(1)}deg`);
    spark.style.setProperty('--dur', `${randomBetween(620, 980)}ms`);
    this.refs.particleLayer.appendChild(spark);
    setTimeout(() => spark.remove(), 1040);
  }

  spawnRaySpray(x, y, count, baseSize, intensity, type = null) {
    const capped = Math.min(76, Math.max(0, count));
    for (let i = 0; i < capped; i += 1) {
      const ray = document.createElement('span');
      ray.className = 'vfx-ray';
      this.applyVfxVars(ray, type);
      ray.style.left = `${x}px`;
      ray.style.top = `${y}px`;
      const angle = (Math.PI * 2 * i / capped) + randomBetween(-0.42, 0.42);
      const distance = randomBetween(baseSize * 1.05, baseSize * (3.8 + intensity * 0.75));
      ray.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
      ray.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
      ray.style.setProperty('--rot', `${(angle * 180 / Math.PI).toFixed(1)}deg`);
      ray.style.setProperty('--width', `${randomBetween(baseSize * 0.42, baseSize * (0.9 + intensity * 0.18))}px`);
      ray.style.setProperty('--height', `${randomBetween(3, 7)}px`);
      ray.style.setProperty('--dur', `${randomBetween(560, 920)}ms`);
      this.refs.particleLayer.appendChild(ray);
      setTimeout(() => ray.remove(), 980);
    }
  }

  spawnGlint(x, y, size, intensity, type = null, extraClass = '') {
    const glint = document.createElement('span');
    glint.className = `vfx-glint ${extraClass}`.trim();
    this.applyVfxVars(glint, type);
    glint.style.left = `${x}px`;
    glint.style.top = `${y}px`;
    glint.style.setProperty('--size', `${Math.min(260, size)}px`);
    glint.style.setProperty('--rot', `${randomBetween(-28, 28).toFixed(1)}deg`);
    glint.style.setProperty('--dur', `${randomBetween(520, 780) + intensity * 24}ms`);
    this.refs.particleLayer.appendChild(glint);
    setTimeout(() => glint.remove(), 940);
  }

  trimParticleLayer(limit) {
    const layer = this.refs.particleLayer;
    const max = Math.max(120, Math.floor(limit));
    while (layer.childElementCount > max) layer.firstElementChild?.remove();
  }

  applyVfxVars(el, type, asset = '') {
    const meta = GEM_VFX[type] || GEM_VFX.ruby;
    if (!meta) return;
    const prefix = asset === 'cell' ? '--cell-vfx' : '--vfx';
    el.style.setProperty(`${prefix}-color`, meta.color);
    el.style.setProperty(`${prefix}-rgb`, meta.rgb);
    el.style.setProperty(`${prefix}-glow`, meta.glow);
    if (asset === 'burst') el.style.backgroundImage = `url("${meta.burst}")`;
    if (asset === 'shard') el.style.backgroundImage = `url("${meta.shards}")`;
  }

  showStages(progress, isUnlocked, onSelect) {
    this.refs.stageList.replaceChildren();
    for (const stage of STAGES) {
      const unlocked = isUnlocked(stage.id);
      const data = progress.stages[String(stage.id)] || { stars: 0, bestScore: 0 };
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `stage-item${unlocked ? '' : ' locked'}`;
      item.disabled = !unlocked;
      const label = document.createElement('span');
      label.textContent = `STAGE ${stage.id}`;
      const name = document.createElement('strong');
      name.textContent = stage.name;
      const meta = document.createElement('span');
      meta.textContent = `${stage.moves} moves · ${stage.targetScore.toLocaleString()} pts`;
      const stars = document.createElement('div');
      stars.className = 'stage-stars';
      stars.textContent = starsText(data.stars || 0);
      item.append(label, name, meta, stars);
      item.addEventListener('click', () => onSelect(stage.id - 1));
      this.refs.stageList.appendChild(item);
    }
    this.showModal(this.refs.stageModal);
  }

  showResult({ cleared, score, bestScore, moves, stars, canNext, nickname }) {
    this.refs.resultKicker.textContent = cleared ? 'CLEAR' : 'TRY AGAIN';
    this.refs.resultTitle.textContent = cleared ? '스테이지 클리어' : '목표까지 조금 남았어요';
    this.refs.resultStars.textContent = starsText(stars);
    this.refs.resultScore.textContent = Number(score).toLocaleString();
    this.refs.resultBest.textContent = Number(bestScore).toLocaleString();
    this.refs.resultMoves.textContent = String(Math.max(0, moves));
    this.refs.rankSubmit.classList.toggle('hidden', score <= 0);
    this.refs.nextStageBtn.classList.toggle('hidden', !cleared || !canNext);
    this.refs.nicknameInput.value = nickname || '';
    this.refs.submitStatus.textContent = '';
    this.refs.submitStatus.className = 'submit-status';
    this.showModal(this.refs.resultModal);
  }

  renderRanks(rows, myName = '') {
    this.refs.rankContent.replaceChildren();
    if (!rows || rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'rank-empty';
      empty.textContent = '아직 기록이 없습니다. 첫 번째 도전자가 되어보세요.';
      this.refs.rankContent.appendChild(empty);
      return;
    }
    rows.slice(0, 20).forEach((row, index) => {
      const rank = Number(row.rank || index + 1);
      const item = document.createElement('div');
      item.className = 'rank-row';
      if (rank === 1) item.classList.add('top1');
      if (rank === 2) item.classList.add('top2');
      if (rank === 3) item.classList.add('top3');
      if (myName && row.player_name === myName) item.classList.add('me');
      const pos = document.createElement('div');
      pos.className = 'rank-pos';
      pos.textContent = String(rank);
      const name = document.createElement('div');
      name.className = 'rank-name';
      name.textContent = row.player_name || 'Player';
      const score = document.createElement('div');
      score.className = 'rank-score';
      score.textContent = Number(row.score || 0).toLocaleString();
      item.append(pos, name, score);
      this.refs.rankContent.appendChild(item);
    });
  }

  showRankLoading() {
    this.refs.rankContent.innerHTML = '<div class="rank-loading">불러오는 중...</div>';
    this.showModal(this.refs.rankModal);
  }

  showRankError() {
    this.refs.rankContent.innerHTML = '<div class="rank-error">랭킹을 불러오지 못했어요. 로컬 기록을 표시합니다.</div>';
  }

  setSubmitStatus(message, type = '') {
    this.refs.submitStatus.textContent = message;
    this.refs.submitStatus.className = `submit-status ${type}`.trim();
  }

  showPause() { this.showModal(this.refs.pauseModal); }
  hidePause() { this.hideModal(this.refs.pauseModal); }
  hideResult() { this.hideModal(this.refs.resultModal); }
  showModal(modal) { modal.classList.remove('hidden'); }
  hideModal(modal) { modal.classList.add('hidden'); }

  showToast(message, duration = 1800) {
    const toast = this.refs.toast;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  }
}

export function starsText(stars) {
  const full = Math.max(0, Math.min(3, stars || 0));
  return '★'.repeat(full) + '☆'.repeat(3 - full);
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function dominantType(points) {
  const counts = new Map();
  for (const point of points) {
    if (!point.type) continue;
    counts.set(point.type, (counts.get(point.type) || 0) + 1);
  }
  let bestType = points.find((point) => point.type)?.type || 'ruby';
  let bestCount = -1;
  counts.forEach((count, type) => {
    if (count > bestCount) {
      bestType = type;
      bestCount = count;
    }
  });
  return bestType;
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function hexToRgba(hex, alpha) {
  return `rgba(${hexToRgb(hex)}, ${alpha})`;
}
