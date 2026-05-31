import { GEM_BY_ID, getGemCssVars, getGemName } from './gem.js';
import { STAGES, getGoalText } from './stage.js';
import { PixiBoard } from './pixi-board.js';

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
    this.pixi = null;
  }

  async initBoard() {
    this.pixi = new PixiBoard(this.refs.board, { size: 8 });
    await this.pixi.init();
  }

  createInput(callbacks) {
    this.pixi?.setInputCallbacks(callbacks);
    return {
      setEnabled: (enabled) => this.pixi?.setEnabled(enabled)
    };
  }

  setScreen(screen) {
    this.refs.title.classList.toggle('is-active', screen === 'title');
    this.refs.game.classList.toggle('is-active', screen === 'game');
    if (screen === 'game' && this.pixi) {
      requestAnimationFrame(() => this.pixi.resize());
    }
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
    this.pixi?.renderBoard(grid, selected, fallMoves);
  }

  markCells(cells, className, duration = 320) {
    return this.pixi ? this.pixi.markCells(cells, className, duration) : delay(duration);
  }

  showCombo(combo, lineCount = 1, longest = 3) {
    this.pixi?.showCombo(combo, lineCount, longest);
  }

  spawnMatchEffects(cells, options = {}) {
    this.pixi?.spawnMatchEffects(cells, options);
  }

  spawnParticles(cells) {
    this.pixi?.spawnMatchEffects(cells);
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

function getFallTiming(move) {
  const fromRow = Number(move.from?.row ?? move.to.row);
  const toRow = Number(move.to?.row ?? fromRow);
  const distance = Math.max(1, fromRow < 0 ? toRow + 1.6 : toRow - fromRow);
  const duration = Math.min(920, 380 + distance * 72);
  const delay = Math.min(160, Number(move.to?.col || 0) * 12 + Math.max(0, 7 - toRow) * 4);
  return { duration, delay, distance };
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
