import levels from './challenge-levels.json' with { type: 'json' };
import { clone, hasMove, pour, won, type Board } from './game.ts';
import { colorsFor } from './difficulty-curve.ts';
import { boardOutcome } from './dead-end.ts';
import { recordPour } from './pour-timing.ts';
import { timeLimit, CLEAR_DELAY, pourDuration, bottleReadyAt, type Challenge } from './challenge-rules.ts';
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
export function newStage(level: number, now: number, cleared = 0, score = 0, pours?: Challenge['pours']): Challenge {
  const board = randomBoard(level);
  return { rules: 2, level, cleared, score, board, initialBoard: clone(board), bottleAvailableAt: board.map(() => now), history: [], moves: 0, deadline: now + timeLimit(level) * 1000, availableAt: now, status: 'playing', ...(pours ? { pours } : {}) };
}
function checkDeadEnd(state: Challenge, now: number): Challenge {
  // At most 90 pairs; no solution-tree search in the interactive pour response.
  if (state.status !== 'playing' || state.suspended || won(state.board) || hasMove(state.board)) return state;
  return { ...state, status: 'ended', endReason: 'blocked', endedAt: now };
}
export function inspectStage(state: Challenge, now: number): Challenge {
  if (state.status !== 'playing' || boardOutcome(state.board) !== 'blocked') return state;
  return { ...state, status: 'ended', endReason: 'blocked', endedAt: now };
}
export type Action = { type: 'pour'; from: number; to: number } | { type: 'undo' | 'end' | 'next' };
// The wall clock decides every deadline. A suspended (left) stage keeps counting, so leaving
// the game, switching tabs or reloading can never stretch the 60 seconds.
export function expire(state: Challenge, now: number): Challenge {
  if (state.status === 'cleared' && now >= state.availableAt + CLEAR_DELAY) {
    if (state.level === 100) return { ...state, status: 'ended' };
    // Anchor the next stage to the completion time, not to a delayed client request.
    return expire(newStage(state.level + 1, state.availableAt + CLEAR_DELAY, state.cleared, state.score, state.pours), now);
  }
  if (state.status === 'playing' && now >= state.deadline) return { ...state, status: 'ended', endReason: 'timeout', endedAt: state.deadline };
  return checkDeadEnd(state, now);
}
export function resumeStage(original: Challenge, now: number): Challenge {
  const state = inspectStage(expire(original, now), now);
  // Never reopen a scored stage or revive an expired run.
  if (state.status === 'ended') return state;
  if (state.status === 'cleared') {
    if (state.level === 100) return { ...state, suspended: false, status: 'ended' };
    // Anchor the next stage to the completion time, so time away from the screen is not refunded.
    return newStage(state.level + 1, Math.max(now, state.availableAt + CLEAR_DELAY), state.cleared, state.score, state.pours);
  }
  // Same board, same deadline: continuing only reopens input. Time spent away stays spent.
  return { ...state, suspended: false };
}
export function leaveStage(original: Challenge, now: number): Challenge {
  const state = inspectStage(expire(original, now), now);
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
  if (state.status !== 'playing') return state;
  if (action.type !== 'pour' || !Number.isInteger(action.from) || !Number.isInteger(action.to)) return state;
  if (now < bottleReadyAt(state, action.from) || now < bottleReadyAt(state, action.to)) return state;
  const board = pour(state.board, action.from, action.to);
  if (!board) return state;
  const duration = pourDuration(board[action.to].length - state.board[action.to].length);
  const bottleAvailableAt = board.map((_, i) => i === action.from || i === action.to ? now + duration : bottleReadyAt(state, i));
  const availableAt = Math.max(...bottleAvailableAt);
  const moves = state.moves + 1, cleared = won(board) && availableAt <= state.deadline;
  const remaining = Math.max(0, state.deadline - availableAt);
  const bonus = Math.floor(200 * Math.min(1, remaining / (timeLimit(state.level) * 1000))) + Math.max(0, 100 - moves * 2);
  return checkDeadEnd({ ...state, board, moves, history: [],
    deadline: state.deadline, bottleAvailableAt, availableAt,
    status: cleared ? 'cleared' : 'playing', cleared: state.cleared + Number(cleared), score: state.score + (cleared ? 1000 + bonus : 0),
    pours: recordPour(state.pours, now) }, now);
}
