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
      submitRankButton: document.getElementById('submit-rank-btn'),
      skipRankButton: document.getElementById('skip-rank-btn'),
      submitStatus: document.getElementById('submit-status'),
      rankSubmitProgress: document.getElementById('rank-submit-progress'),
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

  _motionEnabled() {
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return Boolean(window.gsap && !reduced);
  }

  _animateScreen(screenEl, screen) {
    if (!this._motionEnabled() || !screenEl) return;
    const gsap = window.gsap;
    gsap.killTweensOf(screenEl);
    gsap.fromTo(screenEl, {
      autoAlpha: 0,
      scale: 0.985
    }, {
      autoAlpha: 1,
      scale: 1,
      duration: screen === 'game' ? 0.36 : 0.48,
      ease: 'power3.out',
      clearProps: 'opacity,visibility,transform'
    });

    if (screen === 'game' && this.refs.boardFrame) {
      gsap.killTweensOf(this.refs.boardFrame);
      gsap.fromTo(this.refs.boardFrame, {
        y: 18,
        scale: 0.975,
        filter: 'brightness(1.25)'
      }, {
        y: 0,
        scale: 1,
        filter: 'brightness(1)',
        duration: 0.5,
        ease: 'power3.out',
        clearProps: 'transform,filter'
      });
    }
  }

  _animateModalIn(modal) {
    if (!this._motionEnabled() || !modal) return;
    const gsap = window.gsap;
    const card = modal.querySelector('.modal-card');
    const targets = [modal, card].filter(Boolean);
    gsap.killTweensOf(targets);
    gsap.set(modal, { clearProps: 'opacity,visibility' });
    gsap.fromTo(modal, { autoAlpha: 0 }, {
      autoAlpha: 1,
      duration: 0.18,
      ease: 'power2.out',
      clearProps: 'opacity,visibility'
    });
    if (card) {
      gsap.fromTo(card, {
        autoAlpha: 0,
        y: 26,
        scale: 0.94,
        filter: 'brightness(1.2)'
      }, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        filter: 'brightness(1)',
        duration: 0.36,
        ease: 'back.out(1.35)',
        clearProps: 'opacity,visibility,transform,filter'
      });
    }
  }

  _animateModalOut(modal, onComplete) {
    if (!this._motionEnabled() || !modal) {
      onComplete?.();
      return;
    }
    const gsap = window.gsap;
    const card = modal.querySelector('.modal-card');
    const targets = [modal, card].filter(Boolean);
    gsap.killTweensOf(targets);
    if (card) {
      gsap.to(card, {
        y: 10,
        scale: 0.97,
        autoAlpha: 0,
        duration: 0.14,
        ease: 'power2.in'
      });
    }
    gsap.to(modal, {
      autoAlpha: 0,
      duration: 0.16,
      ease: 'power2.in',
      onComplete: () => {
        onComplete?.();
        gsap.set(targets, { clearProps: 'opacity,visibility,transform' });
      }
    });
  }

  _countText(el, value, duration = 0.58) {
    if (!el) return;
    const target = Number(value) || 0;
    if (!this._motionEnabled()) {
      el.textContent = target.toLocaleString();
      return;
    }
    const state = { value: 0 };
    el._countTween?.kill();
    el._countTween = window.gsap.to(state, {
      value: target,
      duration,
      ease: 'power3.out',
      onUpdate: () => {
        el.textContent = Math.round(state.value).toLocaleString();
      },
      onComplete: () => {
        el.textContent = target.toLocaleString();
        el._countTween = null;
      }
    });
  }

  _animateRankRows() {
    if (!this._motionEnabled()) return;
    const rows = this.refs.rankContent.querySelectorAll('.rank-row');
    if (!rows.length) return;
    window.gsap.fromTo(rows, {
      autoAlpha: 0,
      y: 12,
      scale: 0.985
    }, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.26,
      ease: 'power3.out',
      stagger: 0.035,
      clearProps: 'opacity,visibility,transform'
    });
  }

  setScreen(screen) {
    this.refs.title.classList.toggle('is-active', screen === 'title');
    this.refs.game.classList.toggle('is-active', screen === 'game');
    this._animateScreen(screen === 'title' ? this.refs.title : this.refs.game, screen);
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

  // 남은 시간을 갱신하고 막바지에는 경고 표시를 준다.
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
    // 점수가 0보다 높으면 명예의 전당 등록 UI를 노출한다.
    const showRank = score > 0;
    this.refs.rankSubmit.classList.toggle('hidden', !showRank);
    // 등록/건너뛰기를 결정하기 전에는 다시하기/타이틀 버튼을 숨긴다.
    if (this.refs.resultActions) {
      this.refs.resultActions.classList.toggle('hidden', showRank);
    }
    this.setRankSubmitLoading(false);
    this.refs.nicknameInput.value = nickname || '';
    this.refs.submitStatus.textContent = '';
    this.refs.submitStatus.className = 'submit-status';
    this.showModal(this.refs.resultModal);
    this._countText(this.refs.resultScore, score);
    this._countText(this.refs.resultBest, bestScore);
  }

  revealResultActions() {
    if (!this.refs.resultActions) return;
    this.refs.resultActions.classList.remove('hidden');
    if (this._motionEnabled()) {
      window.gsap.fromTo(this.refs.resultActions.children, {
        autoAlpha: 0,
        y: 10
      }, {
        autoAlpha: 1,
        y: 0,
        duration: 0.22,
        ease: 'power3.out',
        stagger: 0.045,
        clearProps: 'opacity,visibility,transform'
      });
    }
  }

  renderRanks(rows, myName = '') {
    this.refs.rankContent.replaceChildren();
    if (!rows || rows.length === 0) {
      this._setRankMessage('rank-empty', '아직 기록이 없습니다. 첫 번째 도전자가 되어보세요!');
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
      points.textContent = `${Number(row.score || 0).toLocaleString()}\uC810`;
      score.append(points);
      item.append(pos, name, score);
      this.refs.rankContent.appendChild(item);
    });
    this._animateRankRows();
  }

  showRankLoading() {
    this._setRankMessage('rank-loading', '불러오는 중...');
    this.showModal(this.refs.rankModal);
  }

  showRankError() {
    this._setRankMessage('rank-error', '랭킹을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  _setRankMessage(className, message) {
    this.refs.rankContent.replaceChildren();
    const el = document.createElement('div');
    el.className = className;
    el.textContent = message;
    this.refs.rankContent.appendChild(el);
  }

  setSubmitStatus(message, type = '') {
    this.refs.submitStatus.textContent = message;
    this.refs.submitStatus.className = `submit-status ${type}`.trim();
  }

  setRankSubmitLoading(isLoading, message) {
    if (this.refs.rankSubmit) this.refs.rankSubmit.classList.toggle('is-submitting', isLoading);
    if (this.refs.rankSubmitProgress) {
      this.refs.rankSubmitProgress.classList.toggle('hidden', !isLoading);
      this.refs.rankSubmitProgress.setAttribute('aria-hidden', String(!isLoading));
    }
    if (this.refs.nicknameInput) this.refs.nicknameInput.disabled = isLoading;
    if (this.refs.submitRankButton) this.refs.submitRankButton.disabled = isLoading;
    if (this.refs.skipRankButton) this.refs.skipRankButton.disabled = isLoading;
    if (message !== undefined) this.setSubmitStatus(message);
  }

  showPause() { this.showModal(this.refs.pauseModal); }
  hidePause() { this.hideModal(this.refs.pauseModal); }
  hideResult() { this.hideModal(this.refs.resultModal); }
  showModal(modal) {
    if (!modal) return;
    modal.classList.remove('hidden');
    this._animateModalIn(modal);
  }
  hideModal(modal) {
    if (!modal || modal.classList.contains('hidden')) return;
    this._animateModalOut(modal, () => modal.classList.add('hidden'));
  }

  showToast(message, duration = 1800) {
    const toast = this.refs.toast;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    if (this._motionEnabled()) {
      const gsap = window.gsap;
      gsap.killTweensOf(toast);
      gsap.fromTo(toast, {
        autoAlpha: 0,
        xPercent: -50,
        y: 18,
        scale: 0.96
      }, {
        autoAlpha: 1,
        xPercent: -50,
        y: 0,
        scale: 1,
        duration: 0.2,
        ease: 'back.out(1.45)'
      });
      this.toastTimer = setTimeout(() => {
        gsap.to(toast, {
          autoAlpha: 0,
          xPercent: -50,
          y: 14,
          scale: 0.98,
          duration: 0.16,
          ease: 'power2.in',
          onComplete: () => {
            toast.classList.remove('show');
            gsap.set(toast, { clearProps: 'opacity,visibility,transform' });
          }
        });
      }, duration);
      return;
    }
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  }
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
