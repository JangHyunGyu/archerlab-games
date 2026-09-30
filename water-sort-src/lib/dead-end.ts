import { CAPACITY, hasMove, pour, won, type Board } from './game.ts';

export type BoardOutcome = 'solvable' | 'blocked' | 'unknown';
const key = (board: Board) => board.map(tube => tube.join(',')).sort().join('|');

/** Only exhaustive failure is a proof. Budget exhaustion must never end a game. */
export function boardOutcome(initial: Board, budget = 512): BoardOutcome {
  if (won(initial)) return 'solvable';
  if (!hasMove(initial)) return 'blocked';
  // This proof search is defined for the shipped one-bottle-per-color puzzles.
  // Unsupported/partial boards are not evidence of a lost game.
  const counts = new Map<number, number>();
  for (const tube of initial) for (const color of tube) counts.set(color, (counts.get(color) ?? 0) + 1);
  if ([...counts.values()].some(count => count !== CAPACITY)) return 'unknown';
  const seen = new Set<string>([key(initial)]), pending: Board[] = [initial];
  while (pending.length) {
    const board = pending.pop()!;
    const candidates: { board: Board; priority: number }[] = [];
    for (let from = 0; from < board.length; from++) {
      if (!board[from].length) continue;
      for (let to = 0; to < board.length; to++) {
        const next = pour(board, from, to);
        if (!next) continue;
        if (won(next)) return 'solvable';
        const hash = key(next);
        if (seen.has(hash)) continue;
        if (seen.size >= budget) return 'unknown';
        seen.add(hash);
        candidates.push({ board: next, priority: Number(next[to].length === CAPACITY) * 4 + Number(!next[from].length) * 2 + Number(!!board[to].length) });
      }
    }
    candidates.sort((a, b) => a.priority - b.priority);
    pending.push(...candidates.map(candidate => candidate.board));
  }
  return 'blocked';
}
