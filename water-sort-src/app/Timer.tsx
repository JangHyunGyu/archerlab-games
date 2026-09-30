import { useEffect, useState } from 'react';
import type { GameAudio } from '../lib/game-audio';
import { copy as c } from './copy';

export const LOW_TIME_SECONDS = 10;
type TimerProps = {
  deadline: number; limit: number; clock: () => number;
  /** Fixed end time once the run is over; the display stops there. */
  frozenAt: number | null;
  active: boolean; running: boolean;
  audio: GameAudio; clockKey: string | null;
};

// Owns the once-per-second display so the rest of the game does not re-render for it.
export function Timer({ deadline, limit, clock, frozenAt, active, running, audio, clockKey }: TimerProps) {
  const [, redraw] = useState(0);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const at = frozenAt ?? clock();
  const left = Math.max(0, deadline - at);
  const remaining = Math.ceil(left / 1000);
  const live = frozenAt === null && !hidden && left > 0;
  useEffect(() => {
    const onVisibility = () => { setHidden(document.hidden); redraw(n => n + 1); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    if (!live) return;
    // Wake just after the displayed second changes; no polling.
    const rest = deadline - clock();
    const wait = rest - Math.floor((rest - 1) / 1000) * 1000 + 5;
    const timer = setTimeout(() => redraw(n => n + 1), wait);
    return () => clearTimeout(timer);
  }, [live, deadline, remaining, clock]);
  // The tick is a warning: arm the countdown one second early so it sounds for the last 10 seconds only.
  const ticking = running && remaining <= LOW_TIME_SECONDS + 1;
  useEffect(() => { audio.countdown(clockKey, remaining, ticking); }, [audio, clockKey, remaining, ticking]);
  const low = remaining <= LOW_TIME_SECONDS && active;
  // The bar eases toward where it will be one second from now, so a 1 Hz update still looks continuous.
  const target = frozenAt === null ? left - 1000 : left;
  return <div className={'timer-strip ' + (low ? 'low' : '')} role="timer" aria-label={`${remaining}${c.seconds}`}>
    <div className="timer-track"><div className={'timer-fill' + (live ? ' smooth' : '')} style={{ transform: `scaleX(${Math.max(0, Math.min(1, target / (limit * 1000)))})` }}/></div>
    <span className="timer-number">{remaining}<small>{c.seconds}</small></span>
    <span className="sr-only" role="status" aria-live="polite">{low && remaining > 0 ? c.lowTime : ''}</span>
  </div>;
}
