export type HapticCue = 'select' | 'launch' | 'contact' | 'arrival' | 'complete' | 'clear';
type Environment = {
  supported: () => boolean;
  allowed: () => boolean;
  vibrate: (pattern: number | number[]) => boolean;
  now: () => number;
};
const browser: Environment = {
  supported: () => typeof window !== 'undefined' && typeof navigator.vibrate === 'function'
    && (navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches),
  allowed: () => !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches
    && navigator.userActivation?.hasBeenActive !== false,
  vibrate: pattern => typeof navigator.vibrate === 'function' && navigator.vibrate(pattern),
  now: () => performance.now(),
};
const priority: Record<HapticCue, number> = { select: 0, launch: 1, contact: 2, arrival: 3, complete: 4, clear: 5 };

/** One physical motor: stronger impacts preempt light taps; no timers or deferred vibration. */
export class GameHaptics {
  private environment: Environment;
  private enabled = true;
  private active = false;
  private unlocked = false;
  private running = false;
  private until = -Infinity;
  private last = -Infinity;
  private rank = -1;
  constructor(environment: Environment = browser) { this.environment = environment; }
  get supported() { try { return this.environment.supported(); } catch { return false; } }
  unlock() { this.unlocked = true; }
  setEnabled(enabled: boolean) { this.enabled = enabled; if (!enabled) this.stop(); }
  setActive(active: boolean) { this.active = active; if (!active) this.stop(); }
  play(cue: HapticCue, chain = 1) {
    try {
      if (!this.enabled || !this.active || !this.unlocked || !this.supported || !this.environment.allowed()) return false;
      const now = this.environment.now(), rank = priority[cue];
      // Navigator.vibrate replaces the running pattern, so protect a completion from a new pour.
      if (now < this.until && rank < this.rank || now - this.last < 35 && rank <= this.rank) return false;
      const boost = Math.max(0, Math.min(5, chain - 1)) * 3;
      const pattern = cue === 'clear' ? [38, 24, 52, 28, 72]
        : cue === 'complete' ? [28 + boost, 18, 40 + boost]
        : cue === 'arrival' ? 20 : cue === 'contact' ? 12 : 8;
      if (!this.environment.vibrate(pattern)) return false;
      this.last = now; this.rank = rank; this.running = true;
      this.until = now + (typeof pattern === 'number' ? pattern : pattern.reduce((sum, n) => sum + n, 0));
      return true;
    } catch { return false; } // Unsupported, blocked or absent hardware must never interrupt play.
  }
  stop() {
    if (this.running) { try { this.environment.vibrate(0); } catch {} }
    this.running = false; this.until = -Infinity; this.last = -Infinity; this.rank = -1;
  }
  dispose() { this.stop(); this.active = false; this.unlocked = false; }
}
