import levels from './challenge-levels.json' with { type: 'json' };
import { clone, pour, won, type Board } from './game.ts';
import { colorsFor } from './difficulty-curve.ts';
import { timeLimit, CLEAR_DELAY, pourDuration, type Challenge } from './challenge-rules.ts';
export { timeLimit, CLEAR_DELAY, pourDuration, type Challenge, type RunView, type RankRow } from './challenge-rules.ts';

export { colorsFor };
export function randomBoard(level: number, random = Math.random): Board {
  const colors = colorsFor(level), pool = levels[Math.min(99, level - 1)].variants;
  const shuffle = <T,>(items: T[]) => {
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    return items;
  };
  const palette = shuffle(Array.from({ length: colors }, (_, i) => i));
  return shuffle(clone(pool[Math.floor(random() * pool.length)].board).map(tube => tube.map(c => palette[c])));
}
export function newStage(level: number, now: number, cleared = 0, score = 0): Challenge {
  const board = randomBoard(level);
  return { rules: 2, level, cleared, score, board, initialBoard: clone(board), history: [], moves: 0, deadline: now + timeLimit(level) * 1000, availableAt: now, status: 'playing' };
}
export type Action = { type: 'pour'; from: number; to: number } | { type: 'undo' | 'end' | 'next' };
export function expire(state: Challenge, now: number): Challenge {
  if (state.suspended) return state;
  if (state.status === 'cleared' && now >= state.availableAt + CLEAR_DELAY) {
    if (state.level === 100) return { ...state, status: 'ended' };
    // Anchor the next stage to the completion time, not to a delayed client request.
    return expire(newStage(state.level + 1, state.availableAt + CLEAR_DELAY, state.cleared, state.score), now);
  }
  return state.status === 'playing' && now >= state.deadline ? { ...state, status: 'ended' } : state;
}
export function resumeStage(original: Challenge, now: number): Challenge {
  const state = expire(original, now);
  // Never reopen a scored stage or revive an expired run.
  if (state.status === 'ended') return state;
  if (state.status === 'cleared') {
    if (state.level === 100) return { ...state, suspended: false, status: 'ended' };
    return newStage(state.level + 1, Math.max(now, state.availableAt + CLEAR_DELAY), state.cleared, state.score);
  }
  // Legacy runs lack the original layout: assign one verified checkpoint once.
  const initialBoard = state.initialBoard ?? (state.moves === 0 ? clone(state.board) : randomBoard(state.level));
  // Reset the board and clock together; never preserve partial progress with fresh time.
  // Keep score and the cumulative move penalty, so retries do not erase past moves.
  // A fresh state/version also invalidates pours issued before this resume.
  return { ...state, initialBoard, board: clone(initialBoard), history: [], suspended: false, deadline: now + timeLimit(state.level) * 1000, availableAt: Math.max(now, state.availableAt) };
}
export function leaveStage(original: Challenge, now: number): Challenge {
  const state = expire(original, now);
  // An already expired stage cannot be converted into a saved, resumable one.
  if (state.status === 'ended' || state.suspended) return state;
  return { ...state, suspended: true };
}
export function advance(original: Challenge, action: Action, now: number): Challenge {
  const state = expire(original, now);
  if (state !== original) return state;
  if (state.status === 'ended' || state.suspended) return state;
  // Removed controls must not remain usable through direct requests.
  if (action.type !== 'pour') return state;
  if (state.status !== 'playing' || now < state.availableAt) return state;
  if (action.type !== 'pour' || !Number.isInteger(action.from) || !Number.isInteger(action.to)) return state;
  const board = pour(state.board, action.from, action.to);
  if (!board) return state;
  const duration = pourDuration(board[action.to].length - state.board[action.to].length);
  const moves = state.moves + 1, cleared = won(board) && now + duration <= state.deadline;
  const remaining = Math.max(0, state.deadline - now - duration);
  const bonus = Math.floor(200 * Math.min(1, remaining / (timeLimit(state.level) * 1000))) + Math.max(0, 100 - moves * 2);
  return { ...state, board, moves, history: [],
    deadline: state.deadline, availableAt: now + duration,
    status: cleared ? 'cleared' : 'playing', cleared: state.cleared + Number(cleared), score: state.score + (cleared ? 1000 + bonus : 0) };
}
