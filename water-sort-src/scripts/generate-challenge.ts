import { writeFileSync } from 'node:fs';
import { pour } from '../lib/game.ts';
import { pourDuration } from '../lib/challenge-rules.ts';
import { DIFFICULTY_BANDS } from '../lib/difficulty-curve.ts';
import { shortestSolution, segments } from './difficulty.ts';

let seed = 282610;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const output = [];
let previousDifficulty = 0;
for (const band of DIFFICULTY_BANDS) {
  const { colors, first, last, minimumMoves } = band;
  const stageCount = last - first + 1;
  const candidates = [], seen = new Set<string>();
  const wanted = Math.max(150, stageCount * 12);
  for (let attempt = 0; candidates.length < wanted && attempt < 15000; attempt++) {
    const deck = Array.from({ length: colors * 4 }, (_, i) => Math.floor(i / 4));
    for (let i = deck.length - 1; i; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const board = Array.from({ length: colors }, (_, i) => deck.slice(i * 4, i * 4 + 4)).concat([[], []]);
    const key = board.map(t => t.join('')).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const result = shortestSolution(board, 20000);
    if (!result || result.solution.length < minimumMoves) continue;
    const { solution } = result;
    let simulated = board, animationMs = 0;
    for (const [from, to] of solution) {
      const next = pour(simulated, from, to)!;
      // Budget with the slower legacy pace: runs started before 2026-10-06 still pour at it,
      // and keeping it leaves the generated catalog unchanged.
      animationMs += pourDuration(next[to].length - simulated[to].length, undefined);
      simulated = next;
    }
    // Leave at least 20 seconds for decisions at the hardest 60-second stage.
    if (animationMs > 40000) continue;
    const segmentCount = segments(board);
    const buried = board.reduce((n, t) => n + t.filter((c, i) => t.slice(i + 2).includes(c)).length, 0);
    // Proven minimum pours is primary. Structural entanglement breaks ties;
    // color count alone must never hide a drop in actual solution length.
    const difficulty = solution.length * 100000 + segmentCount * 1000 + buried * 10;
    if (difficulty < previousDifficulty) continue;
    candidates.push({ board, solution, minimumMoves: solution.length, animationMs, difficulty });
  }
  candidates.sort((a, b) => a.difficulty - b.difficulty);
  if (candidates.length < stageCount * 3) throw new Error(`Insufficient verified candidates for ${colors} colors: ${candidates.length}`);
  // Reserve the next band's move floor so adding a color never lowers the
  // minimum pours. Avoid reusing a layout between stages.
  const nextBand = DIFFICULTY_BANDS.find(b => b.first === last + 1);
  const eligible = nextBand ? candidates.filter(c => c.minimumMoves < nextBand.minimumMoves) : candidates;
  if (eligible.length < stageCount * 3) throw new Error(`Insufficient progression candidates for ${colors} colors`);
  for (let stage = 0; stage < stageCount; stage++) {
    const start = Math.floor(stage * (eligible.length - 3) / (stageCount - 1));
    const variants = eligible.slice(start, start + 3);
    output.push({ colors, variants });
    previousDifficulty = variants.at(-1)!.difficulty;
  }
  console.log(`Levels ${first}-${last}: ${colors} colors, ${eligible[0].minimumMoves}-${eligible.at(-1)!.minimumMoves} minimum pours (${eligible.length} candidates).`);
}
writeFileSync(new URL('../lib/challenge-levels.json', import.meta.url), JSON.stringify(output));
console.log(`Generated ${output.length} stages with three optimally solved variants each.`);
