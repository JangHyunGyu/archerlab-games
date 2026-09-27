import type { Board } from './game.ts';
// Safe shared rules/types; puzzle catalogs and solutions stay server-side.
export const timeLimit = (_level: number) => 60;
export const CLEAR_DELAY = 450;
export const pourDuration = (amount: number) => 1020 + amount * 130;
export type Challenge = {
  rules: 2;
  level: number; cleared: number; score: number; board: Board; history: Board[];
  moves: number; deadline: number; availableAt: number; status: 'playing' | 'cleared' | 'ended';
};
export type RunView = Omit<Challenge, 'history'> & { id: string; version: number; historyDepth: number; registered: boolean; nickname: string | null; serverNow: number };
export type RankRow = { id: string; nickname: string; cleared: number; score: number; created_at: number };
