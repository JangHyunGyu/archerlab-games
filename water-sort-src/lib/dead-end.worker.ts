import { boardOutcome, type BoardOutcome } from './dead-end';
import type { Board } from './game';

export type InspectionJob = { id: string; version: number; board: Board };
export type InspectionResult = { id: string; version: number; outcome: BoardOutcome };

// A dedicated browser thread owns all search work, never the animation thread.
self.onmessage = ({ data }: MessageEvent<InspectionJob>) => {
  const result: InspectionResult = { id: data.id, version: data.version, outcome: boardOutcome(data.board) };
  self.postMessage(result);
};
