// Pour-timing analysis. The server stamps every accepted pour with its own clock; nothing here
// trusts a client timestamp. Humans pause to think between pours, and a queued burst is capped
// at five. A script that replays a solution leaves two fingerprints: long streaks of pours
// faster than a person can click, and gaps that barely vary.
export type PourStats = {
  last: number;      // Server time of the latest accepted pour.
  gaps: number[];    // Most recent gaps between accepted pours (ms).
  streak: number;    // Current run of consecutive fast gaps.
  longest: number;   // Longest run of consecutive fast gaps.
};
export type PourVerdict = 'ok' | 'too_fast' | 'too_regular';

export const FAST_GAP_MS = 100;       // Two serialized, version-checked writes cannot be human-clicked this close.
export const MAX_FAST_STREAK = 12;    // A five-pour queue produces at most four fast gaps in a row.
export const REGULARITY_SAMPLE = 24;  // Gaps needed before regularity is judged.
export const MIN_VARIATION = 0.02;    // Standard deviation / mean. Human play and network jitter stay well above this.
const KEEP = 40;

export function recordPour(stats: PourStats | undefined, now: number): PourStats {
  if (!stats) return { last: now, gaps: [], streak: 0, longest: 0 };
  const gap = Math.max(0, now - stats.last);
  const streak = gap < FAST_GAP_MS ? stats.streak + 1 : 0;
  return { last: now, gaps: [...stats.gaps, gap].slice(-KEEP), streak, longest: Math.max(stats.longest, streak) };
}

export function pourVerdict(stats: PourStats | undefined): PourVerdict {
  if (!stats) return 'ok';
  if (stats.longest >= MAX_FAST_STREAK) return 'too_fast';
  const recent = stats.gaps.slice(-REGULARITY_SAMPLE);
  if (recent.length < REGULARITY_SAMPLE) return 'ok';
  const mean = recent.reduce((sum, gap) => sum + gap, 0) / recent.length;
  if (mean <= 0) return 'too_fast';
  const variance = recent.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / recent.length;
  return Math.sqrt(variance) / mean < MIN_VARIATION ? 'too_regular' : 'ok';
}
