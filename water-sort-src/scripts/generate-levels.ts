import { writeFileSync } from 'node:fs';
import { solve, type Board } from '../lib/game.ts';
let seed = 93751;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
const levels: { board: Board; solution: [number, number][] }[] = [];
for (let level = 1; level <= 30; level++) {
  const colors = Math.min(8, 2 + Math.ceil(level / 5));
  let found = false;
  for (let attempt = 0; attempt < 300 && !found; attempt++) {
    const deck = Array.from({length: colors * 4}, (_, i) => Math.floor(i / 4));
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const board = Array.from({length: colors}, (_, i) => deck.slice(i * 4, i * 4 + 4)).concat([[], []]);
    const solution = solve(board);
    if (solution && solution.length >= colors * 2) { levels.push({ board, solution }); found = true; }
  }
  if (!found) throw new Error(`Could not generate level ${level}`);
}
writeFileSync(new URL('../lib/levels.json', import.meta.url), JSON.stringify(levels));
console.log(`Generated ${levels.length} verified solvable levels.`);
