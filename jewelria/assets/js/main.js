import { BoardModel } from './board.js';
import { InputController } from './input.js';
import { scoreBatch } from './score.js';
import { STAGES, getStage, getStarsForScore, isStageCleared } from './stage.js';
import {
  clearSavedGame,
  getBestScore,
  getTotalStars,
  isStageUnlocked,
  loadLocalRanks,
  loadNickname,
  loadProgress,
  loadSavedGame,
  saveGame,
  saveLocalRank,
  saveNickname,
  updateStageProgress
} from './storage.js';
import { AudioManager } from './audio.js';
import { UI, delay } from './ui.js';
import { trackEvent } from './ga.js';
import { checkBrowserSupport } from './browser-check.js';

const GAME_ID = 'jewelria';
const RANK_API_BASE = 'https://game-api.yama5993.workers.dev';
const BOARD_SIZE = 8;
const RANK_LIMIT = 20;

const query = new URLSearchParams(location.search);
const lang = query.get('lang') || document.documentElement.lang || 'ko';
document.documentElement.lang = lang.slice(0, 2);

const audio = new AudioManager();
const ui = new UI(lang);
let ranking = null;
let progress = loadProgress();
let input = null;
let state = null;
let selected = null;
let locked = false;

queueMicrotask(boot);

function boot() {
  ranking = new RankingClient();
  if (!checkBrowserSupport()) ui.showToast('이 브라우저에서는 일부 기능이 제한될 수 있습니다.', 2600);
  input = new InputController(ui.refs.board, {
    tap: handleTap,
    swipe: handleSwipe,
    keyboardMove: handleKeyboardMove
  });
  input.setEnabled(false);
  bindButtons();
  ui.updateSoundButtons(audio.enabled);
  renderTitle();
  audio.startAmbient('main');
  const stageParam = Number(query.get('stage'));
  if (Number.isInteger(stageParam) && stageParam >= 1 && stageParam <= STAGES.length && isStageUnlocked(progress, stageParam)) {
    startStage(stageParam - 1);
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
  window.addEventListener('pagehide', () => {
    if (state?.status === 'playing') saveCurrentGame();
  });
}

function bindButtons() {
  on('play-btn', 'click', () => {
    audio.play('button');
    const stageIndex = Math.max(0, Math.min((progress.currentStage || 1) - 1, STAGES.length - 1));
    startStage(stageIndex);
  });
  on('continue-btn', 'click', () => {
    audio.play('button');
    resumeSavedGame();
  });
  on('stage-btn', 'click', () => {
    audio.play('button');
    ui.showStages(progress, (stageId) => isStageUnlocked(progress, stageId), (index) => {
      ui.hideModal(ui.refs.stageModal);
      startStage(index);
    });
  });
  on('stage-close', 'click', () => ui.hideModal(ui.refs.stageModal));
  on('home-btn', 'click', goTitle);
  on('pause-btn', 'click', () => {
    if (!state || state.status !== 'playing') return;
    audio.play('button');
    locked = true;
    input.setEnabled(false);
    saveCurrentGame();
    ui.showPause();
  });
  on('resume-btn', 'click', () => {
    audio.play('button');
    ui.hidePause();
    locked = false;
    input.setEnabled(true);
  });
  on('pause-restart-btn', 'click', () => {
    audio.play('button');
    ui.hidePause();
    startStage(state?.stageIndex || 0);
  });
  on('pause-home-btn', 'click', goTitle);
  on('restart-btn', 'click', () => {
    audio.play('button');
    startStage(state?.stageIndex || 0);
  });
  on('rank-open-title', 'click', openRanks);
  on('rank-open-game', 'click', openRanks);
  on('rank-close', 'click', () => ui.hideModal(ui.refs.rankModal));
  on('sound-toggle-title', 'click', toggleSound);
  on('next-stage-btn', 'click', () => {
    audio.play('button');
    const nextIndex = Math.min((state?.stageIndex || 0) + 1, STAGES.length - 1);
    ui.hideResult();
    startStage(nextIndex);
  });
  on('retry-btn', 'click', () => {
    audio.play('button');
    ui.hideResult();
    startStage(state?.stageIndex || 0);
  });
  on('result-home-btn', 'click', goTitle);
  on('submit-rank-btn', 'click', submitRank);
  on('skip-rank-btn', 'click', () => ui.refs.rankSubmit.classList.add('hidden'));
}

function renderTitle() {
  progress = loadProgress();
  ui.renderTitle({
    progress,
    totalStars: getTotalStars(progress),
    bestScore: getBestScore(progress),
    savedGame: !!loadSavedGame()
  });
}

function startStage(stageIndex) {
  const stage = getStage(stageIndex);
  const board = new BoardModel(BOARD_SIZE);
  board.generateInitial();
  selected = null;
  locked = false;
  state = {
    status: 'playing',
    stageIndex,
    stage,
    board,
    moves: stage.moves,
    score: 0,
    collections: Object.fromEntries(stage.goals.map((goal) => [goal.type, 0]))
  };
  clearSavedGame();
  ranking.startSession();
  audio.startAmbient('game');
  ui.setScreen('game');
  ui.updateHUD(state);
  ui.renderBoard(board.grid, selected);
  input.setEnabled(true);
  saveCurrentGame();
  trackEvent('jewelria_stage_start', { stage_id: stage.id });
}

function resumeSavedGame() {
  const saved = loadSavedGame();
  if (!saved) {
    ui.showToast('이어할 게임이 없습니다.');
    renderTitle();
    return;
  }
  const stageIndex = STAGES.findIndex((stage) => stage.id === saved.stageId);
  const board = new BoardModel(BOARD_SIZE);
  if (stageIndex < 0 || !board.fromJSON(saved.grid)) {
    clearSavedGame();
    ui.showToast('저장된 게임을 불러오지 못했습니다.');
    renderTitle();
    return;
  }
  selected = null;
  locked = false;
  state = {
    status: 'playing',
    stageIndex,
    stage: getStage(stageIndex),
    board,
    moves: saved.moves,
    score: saved.score,
    collections: saved.collections || {}
  };
  ranking.restore(saved.rankSessionId, saved.rankUnsupported);
  audio.startAmbient('game');
  ui.setScreen('game');
  ui.updateHUD(state);
  ui.renderBoard(board.grid, selected);
  input.setEnabled(true);
}

function goTitle() {
  audio.play('button');
  if (state?.status === 'playing') saveCurrentGame();
  locked = false;
  selected = null;
  input.setEnabled(false);
  ui.hidePause();
  ui.hideResult();
  ui.setScreen('title');
  renderTitle();
  audio.startAmbient('main');
}

function handleTap(cell) {
  if (!canPlay() || !state.board.inBounds(cell.row, cell.col)) return;
  audio.unlock();
  if (!selected) {
    selected = cell;
    ui.renderBoard(state.board.grid, selected);
    return;
  }
  if (selected.row === cell.row && selected.col === cell.col) {
    selected = null;
    ui.renderBoard(state.board.grid, selected);
    return;
  }
  if (state.board.areAdjacent(selected, cell)) {
    attemptSwap(selected, cell);
    return;
  }
  selected = cell;
  ui.renderBoard(state.board.grid, selected);
}

function handleSwipe(from, to) {
  if (!canPlay() || !state.board.inBounds(to.row, to.col)) return;
  audio.unlock();
  attemptSwap(from, to);
}

function handleKeyboardMove(dir) {
  if (!canPlay()) return;
  if (!selected) {
    selected = { row: 0, col: 0 };
    ui.renderBoard(state.board.grid, selected);
    return;
  }
  const to = { row: selected.row + dir.row, col: selected.col + dir.col };
  if (!state.board.inBounds(to.row, to.col)) return;
  attemptSwap(selected, to);
}

async function attemptSwap(from, to) {
  if (!canPlay() || !state.board.areAdjacent(from, to)) return;
  locked = true;
  input.setEnabled(false);
  state.board.swap(from, to);
  selected = null;
  ui.renderBoard(state.board.grid, selected);
  await delay(70);
  const matches = state.board.findMatches();

  if (matches.length === 0) {
    audio.play('invalid');
    await ui.markCells([from, to], 'invalid', 250);
    state.board.swap(from, to);
    ui.renderBoard(state.board.grid, selected);
    unlockBoard();
    return;
  }

  audio.play('swap');
  state.moves -= 1;
  ui.updateHUD(state);
  await processMatches(matches, [from, to]);
  await ensurePlayableBoard();
  finishTurn();
}

async function processMatches(initialMatches, originCells) {
  let matches = initialMatches;
  let combo = 1;
  let guard = 0;
  while (matches.length > 0 && guard < 14) {
    guard += 1;
    const resolution = state.board.buildResolution(matches, originCells);
    const removalCells = resolution.remove.map((cell) => {
      const gem = state.board.get(cell.row, cell.col);
      return { ...cell, type: gem?.type || null, special: gem?.special || null };
    });
    const removedGems = removalCells.filter((cell) => cell.type);
    if (removedGems.length === 0 && resolution.specials.length === 0) break;

    for (const gem of removedGems) {
      if (Object.prototype.hasOwnProperty.call(state.collections, gem.type)) state.collections[gem.type] += 1;
    }

    const scoring = scoreBatch({
      removedCount: removedGems.length,
      longest: resolution.longest,
      lineCount: resolution.lineCount,
      specialActivations: resolution.activated.length,
      combo
    });
    state.score += scoring.delta;
    ranking.queueScoreEvent(scoring.event);
    ui.updateHUD(state);
    ui.showCombo(combo, resolution.lineCount, resolution.longest);
    ui.spawnMatchEffects(removalCells, {
      combo,
      lineCount: resolution.lineCount,
      longest: resolution.longest,
      specialActivations: resolution.activated.length
    });
    vibrateMatch(combo, resolution);
    audio.play(resolution.activated.length ? 'special' : combo > 1 ? 'combo' : 'match', combo, {
      lineCount: resolution.lineCount,
      longest: resolution.longest,
      removedCount: removedGems.length,
      specialActivations: resolution.activated.length
    });

    await Promise.all([
      ui.markCells(removalCells, 'clearing', 320),
      ui.markCells(resolution.specials, 'transforming', 360)
    ]);
    state.board.removeCells(resolution.remove);
    state.board.placeSpecials(resolution.specials);
    const fallMoves = state.board.collapseAndRefill();
    ui.renderBoard(state.board.grid, null, fallMoves);
    saveCurrentGame();
    await delay(getFallAnimationWait(fallMoves));

    matches = state.board.findMatches();
    originCells = [];
    combo += 1;
  }
}

async function ensurePlayableBoard() {
  if (state.board.findMatches().length > 0) return;
  if (state.board.findPossibleMove()) return;
  ui.showToast('가능한 이동이 없어 보드를 섞었습니다.');
  for (let guard = 0; guard < 24; guard += 1) {
    state.board.shuffle();
    if (state.board.findMatches().length === 0 && state.board.findPossibleMove()) break;
  }
  ui.renderBoard(state.board.grid, null);
  await delay(220);
}

function finishTurn() {
  const cleared = isStageCleared(state);
  if (cleared || state.moves <= 0) {
    endStage(cleared);
    return;
  }
  saveCurrentGame();
  unlockBoard();
}

function unlockBoard() {
  locked = false;
  input.setEnabled(true);
}

function getFallAnimationWait(moves) {
  if (!moves?.length) return 190;
  let longest = 0;
  for (const move of moves) {
    const fromRow = Number(move.from?.row ?? move.to.row);
    const toRow = Number(move.to?.row ?? fromRow);
    const distance = Math.max(1, fromRow < 0 ? toRow + 1.6 : toRow - fromRow);
    const duration = Math.min(920, 380 + distance * 72);
    const stagger = Math.min(160, Number(move.to?.col || 0) * 12 + Math.max(0, 7 - toRow) * 4);
    longest = Math.max(longest, duration + stagger);
  }
  return Math.min(1120, Math.max(520, longest + 70));
}

function endStage(cleared) {
  locked = true;
  input.setEnabled(false);
  state.status = 'result';
  const stars = getStarsForScore(state.stage, state.score, cleared);
  progress = updateStageProgress(state.stage.id, state.score, stars);
  clearSavedGame();
  audio.play(cleared ? 'clear' : 'fail');
  audio.startAmbient('main');
  trackEvent(cleared ? 'jewelria_stage_clear' : 'jewelria_stage_fail', {
    stage_id: state.stage.id,
    score: state.score,
    stars
  });
  ui.showResult({
    cleared,
    score: state.score,
    bestScore: progress.stages[String(state.stage.id)]?.bestScore || state.score,
    moves: state.moves,
    stars,
    canNext: state.stageIndex < STAGES.length - 1,
    nickname: loadNickname()
  });
}

async function submitRank() {
  if (!state) return;
  const name = ui.refs.nicknameInput.value.trim().slice(0, 20);
  if (!name) {
    ui.setSubmitStatus('닉네임을 입력해 주세요.', 'fail');
    ui.refs.nicknameInput.focus();
    return;
  }
  saveNickname(name);
  ui.refs.nicknameInput.disabled = true;
  document.getElementById('submit-rank-btn').disabled = true;
  ui.setSubmitStatus('등록 중...', '');
  try {
    const result = await ranking.submit(name, state.score, {
      stage: state.stage.id,
      stars: getStarsForScore(state.stage, state.score, isStageCleared(state)),
      moves_left: Math.max(0, state.moves)
    });
    ui.setSubmitStatus(`등록 완료${result?.rank ? ` (#${result.rank})` : ''}`, 'ok');
  } catch {
    ui.setSubmitStatus('로컬 기록으로 저장했습니다.', 'ok');
  } finally {
    ui.refs.nicknameInput.disabled = false;
    document.getElementById('submit-rank-btn').disabled = false;
  }
}

async function openRanks() {
  audio.play('button');
  ui.showRankLoading();
  const myName = loadNickname();
  try {
    const rows = await ranking.fetchTopRanks();
    ui.renderRanks(rows.length ? rows : localRowsWithRank(), myName);
  } catch {
    const localRows = localRowsWithRank();
    if (localRows.length) ui.renderRanks(localRows, myName);
    else ui.showRankError();
  }
}

function toggleSound() {
  const enabled = audio.toggle();
  ui.updateSoundButtons(enabled);
  if (enabled) audio.play('button');
}

function saveCurrentGame() {
  if (!state || state.status !== 'playing') return;
  saveGame({
    stageId: state.stage.id,
    grid: state.board.toJSON(),
    moves: state.moves,
    score: state.score,
    collections: state.collections,
    rankSessionId: ranking.sessionId,
    rankUnsupported: ranking.unsupported
  });
  renderTitle();
}

function canPlay() {
  return !!state && state.status === 'playing' && !locked;
}

function vibrateMatch(combo, resolution) {
  if (!navigator.vibrate) return;
  const lineCount = Number(resolution?.lineCount || 1);
  const longest = Number(resolution?.longest || 3);
  const hasSpecial = (resolution?.activated?.length || 0) > 0;
  let pattern = [28, 18, 46];

  if (lineCount > 1 || longest >= 4) pattern = [38, 18, 58, 26, 74];
  if (combo >= 2) pattern = [42, 20, 66, 28, 92, 36, Math.min(150, 84 + combo * 12)];
  if (combo >= 4 || hasSpecial || longest >= 5) pattern = [58, 22, 92, 28, 132, 38, 172];

  try {
    navigator.vibrate(pattern);
  } catch {}
}

function on(id, eventName, handler) {
  document.getElementById(id)?.addEventListener(eventName, handler);
}

function localRowsWithRank() {
  return loadLocalRanks()
    .sort((a, b) => b.score - a.score || String(a.created_at).localeCompare(String(b.created_at)))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

class RankingClient {
  constructor() {
    this.sessionId = null;
    this.sessionPromise = null;
    this.queue = [];
    this.flushPromise = null;
    this.unsupported = false;
    this.syncFailed = false;
  }

  startSession() {
    this.sessionId = null;
    this.queue = [];
    this.flushPromise = null;
    this.unsupported = false;
    this.syncFailed = false;
    this.sessionPromise = fetch(`${RANK_API_BASE}/score-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ game_id: GAME_ID })
    }).then(async (res) => {
      if (!res.ok) {
        if (res.status === 400 || res.status === 404) this.unsupported = true;
        throw new Error(`rank session ${res.status}`);
      }
      const data = await res.json();
      this.sessionId = data.session_id || null;
      return this.sessionId;
    }).catch(() => {
      if (!this.unsupported) this.syncFailed = true;
      return null;
    });
  }

  restore(sessionId, unsupported = false) {
    this.sessionId = sessionId || null;
    this.unsupported = !!unsupported;
    this.syncFailed = !this.sessionId && !this.unsupported;
    this.queue = [];
    this.flushPromise = null;
    this.sessionPromise = this.sessionId ? Promise.resolve(this.sessionId) : null;
  }

  queueScoreEvent(event) {
    if (this.unsupported || this.syncFailed || !event) return;
    this.queue.push(event);
    this.flush();
  }

  async ensureSession() {
    if (this.unsupported || this.syncFailed) return null;
    if (this.sessionId) return this.sessionId;
    if (!this.sessionPromise) this.startSession();
    return this.sessionPromise;
  }

  async flush() {
    if (this.unsupported || this.syncFailed) return false;
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = (async () => {
      const sessionId = await this.ensureSession();
      if (!sessionId) return false;
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, 20);
        const res = await fetch(`${RANK_API_BASE}/score-events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ game_id: GAME_ID, session_id: sessionId, events: batch })
        });
        if (!res.ok) {
          this.queue = batch.concat(this.queue);
          if (res.status === 400 || res.status === 404) this.unsupported = true;
          throw new Error(`rank event ${res.status}`);
        }
      }
      return true;
    })().catch(() => {
      if (!this.unsupported) this.syncFailed = true;
      return false;
    }).finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  async submit(playerName, score, extraData = {}) {
    saveLocalRank(playerName, score, extraData);
    await this.ensureSession();
    const canVerify = this.sessionId && !this.unsupported && !this.syncFailed;
    if (canVerify) await this.flush();
    const body = {
      game_id: GAME_ID,
      player_name: playerName,
      score: Math.max(0, Math.floor(score || 0)),
      extra_data: {
        ...extraData,
        session_id: canVerify ? this.sessionId : undefined,
        verification_mode: canVerify ? 'session' : 'direct'
      }
    };
    if (canVerify) body.session_id = this.sessionId;
    const res = await fetch(`${RANK_API_BASE}/rankings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`rank submit ${res.status}`);
    return res.json();
  }

  async fetchTopRanks(limit = RANK_LIMIT) {
    const res = await fetch(`${RANK_API_BASE}/rankings?game_id=${encodeURIComponent(GAME_ID)}&limit=${limit}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`rank fetch ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.rankings) ? data.rankings : [];
  }
}
