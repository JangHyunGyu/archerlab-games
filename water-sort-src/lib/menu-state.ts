import { CLEAR_DELAY, timeLimit, type RunView } from './challenge-rules.ts';

// Match server expiry without creating a board or resetting the running clock.
export function menuState(run: RunView | null, now: number) {
  if (!run || run.registered || run.status === 'ended' || run.status === 'cleared' && run.level === 100) return { canContinue: false };
  if (run.suspended) return { canContinue: true };
  const deadline = run.status === 'cleared'
    ? run.availableAt + CLEAR_DELAY + timeLimit(run.level + 1) * 1000
    : run.deadline;
  return { canContinue: now < deadline };
}

// Home and reload normally stay on the start screen. An inspection that ended
// the run there is the only ranking door, so that run has to come back on screen.
export function stayOnBoard(showGame: boolean, run: { status: string; registered: boolean } | null) {
  return showGame || !!run && run.status === 'ended' && !run.registered;
}

// A stuck board is not a timeout. The deadline sting stays for a real expiry and a late clear.
export function endCue(
  run: { status: string; cleared: number; endReason?: string | null } | null,
  ended: boolean,
  animating: boolean,
): 'timeout' | 'clear' | null {
  if (!run) return null;
  if (ended && run.cleared < 100 && run.endReason !== 'blocked') return 'timeout';
  if (run.status === 'cleared' && !animating) return 'clear';
  return null;
}
