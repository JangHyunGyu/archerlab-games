import type { Board } from './game.ts';
import type { PourStats } from './pour-timing.ts';
// Safe shared rules/types; puzzle catalogs and solutions stay server-side.
export const timeLimit = (_level: number) => 60;
export const CLEAR_DELAY = 450;
export const pourDuration = (amount: number) => 1020 + amount * 130;
export type Challenge = {
  rules: 2;
  level: number; cleared: number; score: number; board: Board; history: Board[];
  initialBoard?: Board; // Server-only checkpoint; optional for runs created before this rule.
  suspended?: boolean; // The player is on the start screen. The clock still runs: leaving never pauses a stage.
  pours?: PourStats; // Server-only pour timing used for bot checks; never sent to clients.
  bottleAvailableAt?: number[]; // Per-bottle animation locks. Missing only on legacy runs.
  endReason?: 'blocked' | 'timeout';
  endedAt?: number;
  moves: number; deadline: number; availableAt: number; status: 'playing' | 'cleared' | 'ended';
};
export function bottleReadyAt(state: Pick<Challenge, 'bottleAvailableAt' | 'availableAt'>, index: number) {
  return state.bottleAvailableAt?.[index] ?? state.availableAt;
}
export type RunView = Omit<Challenge, 'history' | 'initialBoard' | 'pours'> & { id: string; version: number; historyDepth: number; registered: boolean; nickname: string | null; serverNow: number };
export type RankRow = { id: string; nickname: string; cleared: number; score: number; created_at: number };
