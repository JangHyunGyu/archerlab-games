import { pour, type Board } from './game.ts';
import { bottleReadyAt, type RunView } from './challenge-rules.ts';

export type PourIntent = { from: number; to: number };
export type ActivePour = PourIntent & { id: number; before: Board; after: Board; amount: number; confirmed: boolean; visualDone: boolean; readyAt: number };
type Options = {
  getRun: () => RunView | null;
  clock: () => number;
  send: (from: number, to: number) => Promise<RunView>;
  accept: (run: RunView) => void;
  start: (entry: ActivePour) => void;
  change: () => void;
  reset: () => void;
  error: (error: unknown) => void;
  invalid: () => void;
};
const sameBoard = (a: Board, b: Board) => JSON.stringify(a) === JSON.stringify(b);

// Visual moves can overlap; HTTP writes remain ordered against the server version.
// At most one dependent intent is retained, and active pairs never share a bottle.
export class PourController {
  entries: ActivePour[] = [];
  queued: PourIntent | null = null;
  enabled = false;
  private sending = false;
  private generation = 0;
  private sequence = 0;
  private options: Options;
  constructor(options: Options) { this.options = options; }
  get board(): Board {
    let board = this.options.getRun()?.board ?? [];
    for (const entry of this.entries) if (!entry.confirmed) board = pour(board, entry.from, entry.to) ?? board;
    return board;
  }
  busy(index: number) {
    const run = this.options.getRun();
    return this.entries.some(e => e.from === index || e.to === index)
      || !!run && this.options.clock() < bottleReadyAt(run, index);
  }
  request(from: number, to: number): 'started' | 'queued' | 'cancelled' | 'invalid' {
    const run = this.options.getRun();
    if (!this.enabled || !run || run.status !== 'playing' || run.suspended || this.options.clock() >= run.deadline) return 'invalid';
    if (this.queued?.from === from && this.queued.to === to) {
      this.cancelQueued(); return 'cancelled';
    }
    const before = this.board, after = pour(before, from, to);
    if (!after) { this.options.invalid(); return 'invalid'; }
    if (this.busy(from) || this.busy(to)) {
      this.queued = { from, to }; this.options.change(); return 'queued';
    }
    // A new move involving a reserved bottle replaces the old reservation.
    if (this.queued && [from, to].some(i => i === this.queued!.from || i === this.queued!.to)) this.queued = null;
    const entry: ActivePour = { id: ++this.sequence, from, to, before, after, amount: after[to].length - before[to].length, confirmed: false, visualDone: false, readyAt: Infinity };
    this.entries.push(entry);
    this.options.start(entry); this.options.change();
    void this.pump();
    return 'started';
  }
  finish(id: number) {
    const entry = this.entries.find(e => e.id === id);
    if (entry) entry.visualDone = true;
    this.tick();
  }
  cancelQueued() { if (this.queued) { this.queued = null; this.options.change(); } }
  clear() {
    this.generation++; this.entries = []; this.queued = null; this.sending = false;
    this.options.reset(); this.options.change();
  }
  tick() {
    const run = this.options.getRun();
    if (run && (run.suspended || run.status === 'ended' || run.status === 'playing' && this.options.clock() >= run.deadline)) {
      if (this.entries.length || this.queued) this.clear();
      return;
    }
    const count = this.entries.length;
    this.entries = this.entries.filter(e => !(e.confirmed && e.visualDone && this.options.clock() >= e.readyAt));
    if (this.entries.length !== count) this.options.change();
    if (run?.status === 'cleared') this.cancelQueued();
    if (this.enabled && this.queued && !this.busy(this.queued.from) && !this.busy(this.queued.to)) {
      const next = this.queued; this.queued = null;
      this.request(next.from, next.to); this.options.change();
    }
    void this.pump();
  }
  private async pump() {
    if (this.sending) return;
    const entry = this.entries.find(e => !e.confirmed), run = this.options.getRun();
    if (!entry || !run || run.status !== 'playing' || run.suspended || this.options.clock() >= run.deadline) return;
    if (this.options.clock() < Math.max(bottleReadyAt(run, entry.from), bottleReadyAt(run, entry.to))) return;
    const expected = pour(run.board, entry.from, entry.to);
    if (!expected) { this.clear(); this.options.invalid(); return; }
    const generation = this.generation;
    this.sending = true;
    try {
      const next = await this.options.send(entry.from, entry.to);
      if (generation !== this.generation) return;
      this.options.accept(next);
      const accepted = next.id === run.id && next.level === run.level && next.version > run.version
        && next.moves === run.moves + 1 && !next.suspended && next.status !== 'ended' && sameBoard(next.board, expected);
      if (!accepted) { this.clear(); this.options.invalid(); return; }
      entry.confirmed = true;
      entry.readyAt = Math.max(bottleReadyAt(next, entry.from), bottleReadyAt(next, entry.to));
      this.options.change();
    } catch (error) {
      if (generation === this.generation) { this.clear(); this.options.error(error); }
    } finally {
      if (generation === this.generation) { this.sending = false; this.tick(); }
    }
  }
}
