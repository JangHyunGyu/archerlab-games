import { pour, won, type Board } from '../lib/game.ts';

export const segments = (board: Board) => board.reduce((sum, tube) => sum + tube.filter((c, i) => i === 0 || c !== tube[i - 1]).length, 0);
const keyFor = (board: Board) => board.map(t => t.join('')).sort().join('|');
type Node = { board: Board; moves: number; estimate: number; parent: Node | null; move: [number, number] | null };

/** Offline A*: each pour removes at most one color segment, so segments-colors
 * is an admissible lower bound. Only equivalent empty destinations are skipped.
 * A budget exhaustion rejects a candidate rather than claiming optimality. */
export function shortestSolution(initial: Board, budget = 60000) {
  const colors = new Set(initial.flat()).size;
  const heap: Node[] = [], distances = new Map<string, number>();
  const before = (a: Node, b: Node) => a.estimate < b.estimate || (a.estimate === b.estimate && a.moves > b.moves);
  const push = (node: Node) => {
    heap.push(node); let i = heap.length - 1;
    while (i) { const parent = (i - 1) >> 1; if (!before(node, heap[parent])) break; heap[i] = heap[parent]; i = parent; }
    heap[i] = node;
  };
  const pop = () => {
    const first = heap[0], last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && before(heap[child + 1], heap[child])) child++;
        if (!before(heap[child], last)) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  push({ board: initial, moves: 0, estimate: segments(initial) - colors, parent: null, move: null });
  distances.set(keyFor(initial), 0);
  let expanded = 0;
  while (heap.length && expanded < budget) {
    const node = pop();
    if (node.moves !== distances.get(keyFor(node.board))) continue;
    if (won(node.board)) {
      const solution: [number, number][] = [];
      for (let n: Node | null = node; n?.move; n = n.parent) solution.push(n.move);
      return { solution: solution.reverse(), expanded };
    }
    expanded++;
    for (let from = 0; from < node.board.length; from++) {
      if (!node.board[from].length) continue;
      let emptyUsed = false;
      for (let to = 0; to < node.board.length; to++) {
        if (from === to) continue;
        if (!node.board[to].length) { if (emptyUsed) continue; emptyUsed = true; }
        const board = pour(node.board, from, to);
        if (!board) continue;
        const moves = node.moves + 1, key = keyFor(board);
        if (moves >= (distances.get(key) ?? Infinity)) continue;
        distances.set(key, moves);
        push({ board, moves, estimate: moves + segments(board) - colors, parent: node, move: [from, to] });
      }
    }
  }
  return null;
}
