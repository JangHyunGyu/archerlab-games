// Plays a challenge run in a real page up to a given stage, solving each board and tapping the
// moves like a player (reservations included), so browser checks can reach two-row boards.
import { pour, solve } from '../lib/game.ts';

const level = page => page.evaluate(() => Number(document.querySelector('.stage-stat strong')?.textContent));
export const idle = (page, timeout = 20000) => page.waitForFunction(() => !document.querySelector('.pour-source,[data-queued],[data-pouring],.bottle-ghost'), null, { timeout, polling: 50 });
export async function stageReady(page, stage) {
  await page.waitForFunction(stage => Number(document.querySelector('.stage-stat strong')?.textContent) === stage && document.querySelectorAll('.bottle-button:not([disabled])').length > 0 && !document.querySelector('.clear-burst'), stage, { timeout: 30000 });
}
// `latest()` returns the newest run the server sent back.
export async function playTo(page, stage, latest) {
  for (let current = await level(page); current < stage; current = await level(page)) {
    await stageReady(page, current);
    for (let k = 0; k < 50 && !(latest()?.level === current && latest()?.status === 'playing'); k++) await page.waitForTimeout(100);
    await idle(page);
    let board = latest().board;
    const moves = solve(board);
    if (!moves) throw new Error(`stage ${current} has no solution: ${JSON.stringify(board)}`);
    for (const [from, to] of moves) {
      // Keep the reservation queue below its limit of five.
      await page.waitForFunction(() => Number(document.querySelector('.queue-count')?.textContent.match(/(\d+)\s*\//)?.[1] ?? 0) < 4, null, { timeout: 20000, polling: 50 });
      const tap = async i => { const box = await page.locator(`[data-testid="bottle-${i}"]`).boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height * .55); };
      const pressed = (i, value) => page.waitForFunction(([i, value]) => document.querySelector(`[data-testid="bottle-${i}"]`)?.getAttribute('aria-pressed') === value, [i, String(value)], { timeout: 5000 });
      await tap(from); await pressed(from, true);
      await tap(to); await pressed(from, false);
      board = pour(board, from, to);
    }
    await page.waitForFunction(next => Number(document.querySelector('.stage-stat strong')?.textContent) >= next, current + 1, { timeout: 40000 }).catch(async error => {
      const dom = await page.evaluate(() => ({ stage: document.querySelector('.stage-stat strong')?.textContent, queued: document.querySelectorAll('[data-queued]').length, notice: document.querySelector('.board-notice')?.textContent, modal: document.querySelector('[role="dialog"]')?.textContent?.slice(0, 120) }));
      throw new Error(`stage ${current} did not advance: ${JSON.stringify({ dom, expected: board, server: latest() })}`, { cause: error });
    });
  }
  await stageReady(page, stage);
  for (let k = 0; k < 50 && !(latest()?.level === stage && latest()?.status === 'playing'); k++) await page.waitForTimeout(100);
  await idle(page);
}
// Resting tube rectangles (viewport px) and their rows, top row first.
export async function layout(page) {
  const tubes = await page.evaluate(() => [...document.querySelectorAll('.bottle-button .tube')].map(el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }));
  const tops = [...new Set(tubes.map(t => Math.round(t.y)))].sort((a, b) => a - b);
  return { tubes, rows: tubes.map(t => tops.indexOf(Math.round(t.y))) };
}
