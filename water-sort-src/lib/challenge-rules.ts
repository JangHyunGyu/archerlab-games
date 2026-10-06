import type { Board } from './game.ts';
import type { PourStats } from './pour-timing.ts';
// Safe shared rules/types; puzzle catalogs and solutions stay server-side.
export const timeLimit = (_level: number) => 60;
export const CLEAR_DELAY = 450;
// Pour pace is stamped on each run when it starts and never changes mid-run. Runs created before
// the faster pour (no `pace`) keep 1020 + 130/unit for their locks, minimum-time check and
// animation, so a run that began on the old client or worker is never judged by the new clock.
export const POUR_PACE = 2;
export type PourPace = typeof POUR_PACE;
// `pace` is required on purpose: pass the run's own `pace` (undefined = legacy run).
export const pourDuration = (amount: number, pace: PourPace | null | undefined) =>
  pace === POUR_PACE ? 600 + amount * 80 : 1020 + amount * 130;
export type Challenge = {
  rules: 2;
  level: number; cleared: number; score: number; board: Board; history: Board[];
  initialBoard?: Board; // Server-only checkpoint; optional for runs created before this rule.
  suspended?: boolean; // The player is on the start screen. The clock still runs: leaving never pauses a stage.
  pours?: PourStats; // Server-only pour timing used for bot checks; never sent to clients.
  bottleAvailableAt?: number[]; // Per-bottle animation locks. Missing only on legacy runs.
  pace?: PourPace; // Pour timing rule of this run. Missing on runs started before 2026-10-06 (legacy pace).
  endReason?: 'blocked' | 'timeout';
  endedAt?: number;
  moves: number; deadline: number; availableAt: number; status: 'playing' | 'cleared' | 'ended';
};
export function bottleReadyAt(state: Pick<Challenge, 'bottleAvailableAt' | 'availableAt'>, index: number) {
  return state.bottleAvailableAt?.[index] ?? state.availableAt;
}
export type RunView = Omit<Challenge, 'history' | 'initialBoard' | 'pours'> & { id: string; version: number; historyDepth: number; registered: boolean; nickname: string | null; serverNow: number };
export type RankRow = { id: string; nickname: string; cleared: number; score: number; created_at: number };
