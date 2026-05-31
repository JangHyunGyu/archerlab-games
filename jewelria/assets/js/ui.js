import { GEM_BY_ID, getGemName } from './gem.js';
import { STAGES, getGoalText } from './stage.js';
import { PixiBoard } from './pixi-board.js';

export class UI {
  constructor(lang = 'ko') {
    this.lang = lang;
    this.refs = {
      title: document.getElementById('title-screen'),
      game: document.getElementById('game-screen'),
      app: document.getElementById('app'),
      board: document.getElementById('board'),
      boardFrame: document.querySelector('.board-frame'),
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
      resultActions: document.getElementById('result-actions'),
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
    this._renderContinueButton(savedGame);
  }

  // 이어하기 버튼에 저장된 진행(스테이지·남은 이동 수)을 함께 표기해 "새로 시작"과 구분한다.
  _renderContinueButton(savedGame) {
    const btn = this.refs.continueBtn;
    if (!btn) return;
    btn.disabled = !savedGame;
    if (!btn.dataset.label) btn.dataset.label = (btn.querySelector('.btn-label')?.textContent || btn.textContent || '').trim();
    const label = btn.dataset.label;
    if (!savedGame) {
      btn.textContent = label;
      return;
    }
    const labelEl = document.createElement('span');
    labelEl.className = 'btn-label';
    labelEl.textContent = label;
    const subEl = document.createElement('small');
    subEl.className = 'btn-sub';
    subEl.textContent = this._savedGameLabel(savedGame);
    btn.replaceChildren(labelEl, subEl);
  }

  _savedGameLabel(saved) {
    const stageId = Number(saved.stageId) || 1;
    const moves = Math.max(0, Number(saved.moves) || 0);
    const lang = (this.lang || 'ko').slice(0, 2);
    const movesText = {
      ko: `${moves}수 남음`,
      ja: `残り${moves}手`,
      es: `${moves} mov. rest.`,
      en: `${moves} moves left`
    }[lang] || `${moves} moves left`;
    return `Stage ${stageId} · ${movesText}`;
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
    // 남은 이동이 적으면 경고 깜빡임(3 이하=위급/빨강, 5 이하=주의/노랑).
    const movesStat = this.refs.hudMoves.closest('.hud-stat');
    if (movesStat) {
      const left = Number(state.moves);
      movesStat.classList.toggle('moves-critical', left > 0 && left <= 3);
      movesStat.classList.toggle('moves-warn', left > 3 && left <= 5);
    }
    this.refs.stageLabel.textContent = `Stage ${stage.id} · ${stage.name}`;
    this.refs.objectiveTitle.textContent = getGoalText(stage);
    this.renderGoals(stage, state.collections, state.score);
  }

  renderGoals(stage, collections = {}, score = 0) {
    this.refs.collectGoals.replaceChildren();
    // 점수 목표도 클리어 조건이므로 미션으로 함께 표기(예: 1,000/1,900).
    const targetScore = Number(stage.targetScore) || 0;
    if (targetScore > 0) {
      const current = Math.min(Number(score) || 0, targetScore);
      const pill = document.createElement('div');
      pill.className = 'collect-pill collect-pill--score';
      if (current >= targetScore) pill.classList.add('is-done');
      const icon = document.createElement('span');
      icon.className = 'mini-score';
      icon.textContent = '★';
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = `${current.toLocaleString()}/${targetScore.toLocaleString()}`;
      pill.title = `점수 ${current.toLocaleString()}/${targetScore.toLocaleString()}`;
      pill.append(icon, label);
      this.refs.collectGoals.appendChild(pill);
    }
    for (const goal of stage.goals) {
      const gem = GEM_BY_ID[goal.type];
      const current = Math.min(collections[goal.type] || 0, goal.count);
      const pill = document.createElement('div');
      pill.className = 'collect-pill';
      if (current >= goal.count) pill.classList.add('is-done');
      const icon = document.createElement('img');
      icon.className = 'mini-gem';
      icon.src = gem?.image || '';
      icon.alt = '';
      icon.decoding = 'async';
      icon.setAttribute('aria-hidden', 'true');
      const gemName = getGemName(goal.type, this.lang);
      const label = document.createElement('span');
      label.className = 'collect-label';
      label.textContent = gemName;
      const count = document.createElement('strong');
      count.className = 'collect-count';
      count.textContent = `${current}/${goal.count}`;
      pill.title = `${gemName} ${current}/${goal.count}`;
      pill.setAttribute('aria-label', `${gemName} ${current}/${goal.count}`);
      pill.append(icon, label, count);
      if (gem) pill.style.borderColor = `${gem.color}66`;
      this.refs.collectGoals.appendChild(pill);
    }
  }

  renderBoard(grid, selected = null, fallMoves = []) {
    this.pixi?.renderBoard(grid, selected, fallMoves);
  }

  markCells(cells, className, duration = 320, stagger = 0) {
    return this.pixi ? this.pixi.markCells(cells, className, duration, stagger) : delay(duration);
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

  showResult({ cleared, runEnded, score, bestScore, moves, stars, canNext, nickname }) {
    this.refs.resultKicker.textContent = cleared ? 'CLEAR' : 'GAME OVER';
    this.refs.resultTitle.textContent = cleared ? '스테이지 클리어' : '게임 오버';
    // 실패 시 빨간 계열로 "게임이 끝났다"는 걸 확실히 인지시킨다.
    this.refs.resultKicker.classList.toggle('is-gameover', !cleared);
    this.refs.resultTitle.classList.toggle('is-gameover', !cleared);
    this.refs.resultStars.textContent = starsText(stars);
    this.refs.resultScore.textContent = Number(score).toLocaleString();
    this.refs.resultBest.textContent = Number(bestScore).toLocaleString();
    this.refs.resultMoves.textContent = String(Math.max(0, moves));
    // 랭킹 등록은 "런이 끝난 시점"(게임 오버 또는 최종 스테이지 클리어)에서만.
    const showRank = !!runEnded && score > 0;
    this.refs.rankSubmit.classList.toggle('hidden', !showRank);
    this.refs.nextStageBtn.classList.toggle('hidden', !cleared || !canNext);
    // 등록/건너뛰기를 결정하기 전엔 재도전/타이틀 버튼을 숨긴다.
    if (this.refs.resultActions) {
      this.refs.resultActions.classList.toggle('hidden', showRank);
    }
    this.refs.nicknameInput.value = nickname || '';
    this.refs.submitStatus.textContent = '';
    this.refs.submitStatus.className = 'submit-status';
    this.showModal(this.refs.resultModal);
  }

  revealResultActions() {
    if (this.refs.resultActions) this.refs.resultActions.classList.remove('hidden');
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
