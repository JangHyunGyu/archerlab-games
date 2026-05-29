import { GEM_BY_ID, getGemCssVars, getGemName } from './gem.js';
import { STAGES, getGoalText } from './stage.js';

export class UI {
  constructor(lang = 'ko') {
    this.lang = lang;
    this.refs = {
      title: document.getElementById('title-screen'),
      game: document.getElementById('game-screen'),
      board: document.getElementById('board'),
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

  renderBoard(grid, selected = null) {
    const frag = document.createDocumentFragment();
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
        if (gem) cell.appendChild(this.createGemEl(gem));
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

  markCells(cells, className, duration = 320) {
    for (const cell of cells) this.getCellEl(cell)?.classList.add(className);
    return delay(duration).then(() => {
      for (const cell of cells) this.getCellEl(cell)?.classList.remove(className);
    });
  }

  getCellEl(cell) {
    return this.refs.board.querySelector(`.cell[data-row="${cell.row}"][data-col="${cell.col}"]`);
  }

  showCombo(combo) {
    if (combo <= 1) return;
    const pop = document.createElement('div');
    pop.className = 'combo-pop';
    pop.textContent = `COMBO x${combo}`;
    this.refs.comboLayer.appendChild(pop);
    setTimeout(() => pop.remove(), 850);
  }

  spawnParticles(cells) {
    const layerRect = this.refs.particleLayer.getBoundingClientRect();
    for (const cell of cells.slice(0, 18)) {
      const el = this.getCellEl(cell);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const cx = rect.left - layerRect.left + rect.width / 2;
      const cy = rect.top - layerRect.top + rect.height / 2;
      for (let i = 0; i < 4; i += 1) {
        const spark = document.createElement('span');
        spark.className = 'spark';
        spark.style.left = `${cx}px`;
        spark.style.top = `${cy}px`;
        const angle = Math.random() * Math.PI * 2;
        const distance = 24 + Math.random() * 38;
        spark.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
        spark.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
        this.refs.particleLayer.appendChild(spark);
        setTimeout(() => spark.remove(), 680);
      }
    }
  }

  highlightHint(pair) {
    if (pair) this.markCells([pair.from, pair.to], 'hint', 1400);
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
