import assert from 'node:assert/strict';
import test from 'node:test';
import { menuState, stayOnBoard } from '../lib/menu-state.ts';
import { expire, newStage } from '../lib/challenge.ts';
import { CLEAR_DELAY, type RunView } from '../lib/challenge-rules.ts';

test('continue is available only for an unfinished run, with the same expiry as the server', () => {
  const base: RunView = { ...newStage(1, 1000), id: 'saved', version: 1, historyDepth: 0, registered: false, nickname: null, serverNow: 1000 };
  assert.deepEqual(menuState(null, 1000), { canContinue: false });
  assert.deepEqual(menuState({ ...base, suspended: true }, base.deadline + 86400000), { canContinue: true });
  for (const run of [base, { ...base, status: 'cleared' as const, availableAt: 3000, cleared: 1 }, { ...base, status: 'cleared' as const, level: 100, cleared: 100, availableAt: 3000 }, { ...base, status: 'ended' as const }]) {
    for (const now of [1000, 3000, 3000 + CLEAR_DELAY - 1, 3000 + CLEAR_DELAY, 60999, 61000, 3000 + CLEAR_DELAY + 59999, 3000 + CLEAR_DELAY + 60000]) {
      const expected = expire({ ...run, history: [] }, now);
      const state = menuState(run, now);
      assert.equal(state.canContinue, expected.status !== 'ended' && !(expected.status === 'cleared' && expected.level === 100), `${run.status}, level ${run.level}, time ${now}`);
      assert.deepEqual(menuState({ ...run, registered: true }, now), { canContinue: false });
    }
  }
});

test('an ended unregistered run opened from Home or reload still shows results', () => {
  const ended = { status: 'ended', registered: false };
  assert.equal(stayOnBoard(false, ended), true);
  assert.equal(stayOnBoard(false, { status: 'ended', registered: true }), false);
  assert.equal(stayOnBoard(false, { status: 'playing', registered: false }), false);
  assert.equal(stayOnBoard(false, null), false);
  assert.equal(stayOnBoard(true, { status: 'playing', registered: false }), true);
});
