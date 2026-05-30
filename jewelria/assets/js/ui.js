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
          if (fallMove) this.applyFallAnimation(gemEl, fallMove);
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
    const duration = Math.min(680, 260 + distance * 58);
    const delay = Math.min(130, Number(move.to?.col || 0) * 10 + Math.max(0, 7 - toRow) * 3);
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
    const points = cells
      .slice(0, 28)
      .map((cell) => this.getCellCenter(cell, layerRect))
      .filter(Boolean);
    if (!points.length) return;

    const combo = Number(options.combo || 1);
    const lineCount = Number(options.lineCount || 1);
    const longest = Number(options.longest || 3);
    const hasSpecial = Number(options.specialActivations || 0) > 0;
    const intensity = Math.min(3.4, 1 + combo * 0.28 + Math.max(0, lineCount - 1) * 0.3 + Math.max(0, longest - 3) * 0.22 + (hasSpecial ? 0.55 : 0));
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    center.x /= points.length;
    center.y /= points.length;
    const centerType = dominantType(points);

    this.pulseBoard(intensity);
    this.spawnBoardFlash(intensity, centerType);
    this.spawnBurst(center.x, center.y, Math.max(points[0].size * 3.2, 170 * intensity), 'mega', centerType);
    this.spawnRing(center.x, center.y, Math.max(points[0].size * 2.4, 130 * intensity), 'mega', centerType);

    for (const point of points) {
      const type = point.type || centerType;
      this.spawnBurst(point.x, point.y, point.size * randomBetween(1.9, 2.55) * intensity, '', type);
      this.spawnRing(point.x, point.y, point.size * randomBetween(1.35, 1.9) * intensity, '', type);
      this.spawnShardSpray(point.x, point.y, 7 + Math.round(intensity * 4), point.size, intensity, type);
      for (let i = 0; i < 5; i += 1) this.spawnSpark(point.x, point.y, point.size, intensity, type);
    }

    if (combo >= 3 || hasSpecial || longest >= 5) {
      this.spawnShardSpray(center.x, center.y, 30 + combo * 4, points[0].size * 1.2, intensity + 0.5, centerType);
      this.spawnRing(center.x, center.y, Math.max(points[0].size * 4.2, 220 * intensity), 'screen', centerType);
    }
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
    app.style.setProperty('--shake-power', `${Math.min(18, 7 + intensity * 5)}px`);
    app.classList.remove('match-shake');
    frame.classList.remove('match-impact');
    void app.offsetWidth;
    app.classList.add('match-shake');
    frame.classList.add('match-impact');
    clearTimeout(this.impactTimer);
    this.impactTimer = setTimeout(() => {
      app.classList.remove('match-shake');
      frame.classList.remove('match-impact');
    }, 520);
  }

  spawnBoardFlash(intensity, type) {
    const flash = document.createElement('span');
    flash.className = 'vfx-board-flash';
    this.applyVfxVars(flash, type);
    flash.style.setProperty('--flash-alpha', String(Math.min(0.6, 0.16 + intensity * 0.1)));
    this.refs.particleLayer.appendChild(flash);
    setTimeout(() => flash.remove(), 520);
  }

  spawnBurst(x, y, size, extraClass = '', type = null) {
    const burst = document.createElement('span');
    burst.className = `vfx-burst ${extraClass}`.trim();
    this.applyVfxVars(burst, type, 'burst');
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;
    burst.style.setProperty('--size', `${Math.min(520, size)}px`);
    burst.style.setProperty('--spin', `${randomBetween(-18, 18).toFixed(1)}deg`);
    this.refs.particleLayer.appendChild(burst);
    setTimeout(() => burst.remove(), 860);
  }

  spawnRing(x, y, size, extraClass = '', type = null) {
    const ring = document.createElement('span');
    ring.className = `vfx-ring ${extraClass}`.trim();
    this.applyVfxVars(ring, type);
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.setProperty('--size', `${Math.min(620, size)}px`);
    this.refs.particleLayer.appendChild(ring);
    setTimeout(() => ring.remove(), 740);
  }

  spawnShardSpray(x, y, count, baseSize, intensity, type = null) {
    const capped = Math.min(58, count);
    for (let i = 0; i < capped; i += 1) {
      const shard = document.createElement('span');
      shard.className = 'vfx-shard';
      this.applyVfxVars(shard, type, 'shard');
      shard.style.left = `${x}px`;
      shard.style.top = `${y}px`;
      const angle = (Math.PI * 2 * i / capped) + randomBetween(-0.28, 0.28);
      const distance = randomBetween(baseSize * 0.7, baseSize * (2.3 + intensity));
      const size = randomBetween(13, 30) * Math.min(1.45, 0.8 + intensity * 0.2);
      const atlasX = Math.floor(Math.random() * 4) * 33.333;
      const atlasY = Math.floor(Math.random() * 4) * 33.333;
      shard.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
      shard.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
      shard.style.setProperty('--rot', `${randomBetween(-220, 220).toFixed(1)}deg`);
      shard.style.setProperty('--size', `${size}px`);
      shard.style.setProperty('--dur', `${randomBetween(560, 920)}ms`);
      shard.style.setProperty('--atlas-x', `${atlasX}%`);
      shard.style.setProperty('--atlas-y', `${atlasY}%`);
      this.refs.particleLayer.appendChild(shard);
      setTimeout(() => shard.remove(), 980);
    }
  }

  spawnSpark(x, y, baseSize, intensity, type = null) {
    const spark = document.createElement('span');
    spark.className = 'spark';
    this.applyVfxVars(spark, type);
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    const angle = Math.random() * Math.PI * 2;
    const distance = randomBetween(baseSize * 0.5, baseSize * (1.7 + intensity));
    spark.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    spark.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    this.refs.particleLayer.appendChild(spark);
    setTimeout(() => spark.remove(), 720);
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
