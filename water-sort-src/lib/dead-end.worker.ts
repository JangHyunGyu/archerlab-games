import { boardOutcome, type BoardOutcome } from './dead-end';
import type { Board } from './game';

export type InspectionJob = { id: string; version: number; board: Board };
export type InspectionResult = { id: string; version: number; outcome: BoardOutcome };

// Standalone worker thread lacks the window compat script; polyfill Array.prototype.at for Safari < 15.4.
if (typeof Array.prototype.at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', {
    value: function at(this: unknown[], index: number) {
      if (this == null) throw new TypeError('Array.prototype.at called on null or undefined');
      const list = Object(this) as unknown[];
      const len = list.length >>> 0;
      const n = Number(index);
      let k = n !== n ? 0 : n < 0 ? Math.ceil(n) : Math.floor(n);
      if (k < 0) k += len;
      return k < 0 || k >= len ? undefined : list[k];
    },
    writable: true,
    configurable: true,
  });
}

// A dedicated browser thread owns all search work, never the animation thread.
self.onmessage = ({ data }: MessageEvent<InspectionJob>) => {
  const result: InspectionResult = { id: data.id, version: data.version, outcome: boardOutcome(data.board) };
  self.postMessage(result);
};
