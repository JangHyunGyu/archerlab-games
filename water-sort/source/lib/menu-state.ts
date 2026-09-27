import { CLEAR_DELAY, timeLimit, type RunView } from './challenge-rules.ts';

// Match server expiry without creating a board or resetting the running clock.
export function menuState(run: RunView | null, now: number) {
  if (!run || run.registered) return { canContinue: false, hasRecord: false };
  if (run.status === 'ended') return { canContinue: false, hasRecord: true };
  if (run.status === 'cleared' && run.level === 100) {
    return { canContinue: false, hasRecord: now >= run.availableAt + CLEAR_DELAY };
  }
  const deadline = run.status === 'cleared'
    ? run.availableAt + CLEAR_DELAY + timeLimit(run.level + 1) * 1000
    : run.deadline;
  return { canContinue: now < deadline, hasRecord: now >= deadline };
}
