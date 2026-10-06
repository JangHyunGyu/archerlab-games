export type Board = number[][];
export const CAPACITY = 4;
export const clone = (board: Board): Board => board.map(tube => [...tube]);
export const complete = (tube: number[]) => tube.length === CAPACITY && tube.every(c => c === tube[0]);
export const won = (board: Board) => board.every(tube => !tube.length || complete(tube));
export function pour(board: Board, from: number, to: number): Board | null {
  const a = board[from], b = board[to];
  if (!a || !b || from === to || !a.length || b.length === CAPACITY || (b.length && b.at(-1) !== a.at(-1))) return null;
  const next = clone(board), color = a.at(-1)!;
  while (next[from].at(-1) === color && next[to].length < CAPACITY) next[to].push(next[from].pop()!);
  return next;
}
// How many units from the bottom two bottles share: the liquid that stays put between them.
export function sharedBottom(a: number[], b: number[]) {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k;
}
export const hasMove = (board: Board) => board.some((a, i) => a.length && board.some((_, j) => pour(board, i, j)));
export function solve(initial: Board, budget = 60000): [number, number][] | null {
  const seen = new Set<string>();
  function visit(board: Board, path: [number, number][]): [number, number][] | null {
    if (won(board)) return path;
    if (seen.size >= budget || path.length > 120) return null;
    const key = board.map(t => t.join('')).sort().join('|');
    if (seen.has(key)) return null;
    seen.add(key);
    const candidates: { next: Board; from: number; to: number; priority: number }[] = [];
    for (let i = 0; i < board.length; i++) {
      if (!board[i].length || complete(board[i])) continue;
      let emptyUsed = false;
      for (let j = 0; j < board.length; j++) {
        if (!board[j].length) {
          if (emptyUsed || board[i].every(c => c === board[i][0])) continue;
          emptyUsed = true;
        }
        const next = pour(board, i, j);
        if (next) candidates.push({ next, from: i, to: j, priority: (complete(next[j]) ? 8 : 0) + (!next[i].length ? 4 : 0) + (board[j].length ? 2 : 0) });
      }
    }
    candidates.sort((a, b) => b.priority - a.priority);
    for (const c of candidates) {
      const answer = visit(c.next, [...path, [c.from, c.to]]);
      if (answer) return answer;
    }
    return null;
  }
  return visit(initial, []);
}
