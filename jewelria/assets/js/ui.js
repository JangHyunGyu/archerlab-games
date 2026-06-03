import { GEM_BY_ID, getGemName } from './gem.js';
import { formatTime } from './stage.js';
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
      titleTime: document.getElementById('title-time'),
      titleBest: document.getElementById('title-best'),
      hudTime: document.getElementById('hud-time'),
      hudScore: document.getElementById('hud-score'),
      pauseModal: document.getElementById('pause-modal'),
      resultModal: document.getElementById('result-modal'),
      resultKicker: document.getElementById('result-kicker'),
      resultTitle: document.getElementById('result-title'),
      resultScore: document.getElementById('result-score'),
      resultBest: document.getElementById('result-best'),
      rankSubmit: document.getElementById('rank-submit'),
      nicknameInput: document.getElementById('nickname-input'),
      submitStatus: document.getElementById('submit-status'),
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

  renderTitle({ bestScore }) {
    if (this.refs.titleTime) this.refs.titleTime.textContent = formatTime(180);
    this.refs.titleBest.textContent = Number(bestScore || 0).toLocaleString();
  }

  updateSoundButtons(enabled) {
    document.querySelectorAll('[id^="sound-toggle"]').forEach((button) => {
      button.textContent = enabled ? 'Sound' : 'Mute';
      button.setAttribute('aria-pressed', String(enabled));
    });
  }

  updateHUD(state) {
    this.refs.hudScore.textContent = Number(state.score).toLocaleString();
    this.updateTime(state.timeLeft);
  }

  // 남은 시간을 갱신하고 막바지(10초 이하)에는 경고 표시를 준다.
  updateTime(timeLeft) {
    const left = Math.max(0, Number(timeLeft) || 0);
    if (this.refs.hudTime) this.refs.hudTime.textContent = formatTime(left);
    const timeStat = this.refs.hudTime?.closest('.hud-stat');
    if (timeStat) {
      timeStat.classList.toggle('moves-critical', left > 0 && left <= 10);
      timeStat.classList.toggle('moves-warn', left > 10 && left <= 30);
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

  showResult({ score, bestScore, nickname }) {
    this.refs.resultKicker.textContent = 'TIME UP';
    this.refs.resultTitle.textContent = '타임 어택 종료';
    this.refs.resultScore.textContent = Number(score).toLocaleString();
    this.refs.resultBest.textContent = Number(bestScore).toLocaleString();
    // 점수가 0보다 크면 명예의 전당 등록 폼을 노출한다.
    const showRank = score > 0;
    this.refs.rankSubmit.classList.toggle('hidden', !showRank);
    // 등록/건너뛰기를 결정하기 전엔 다시하기/타이틀 버튼을 숨긴다.
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
      const points = document.createElement('span');
      points.className = 'rank-points';
      points.textContent = `${Number(row.score || 0).toLocaleString()}점`;
      score.append(points);
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

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
