import assert from 'node:assert/strict';
import test from 'node:test';
import { GameHaptics } from '../lib/game-haptics.ts';

function fixture() {
  let now = 0, allowed = true, supported = true, accepted = true;
  const calls: Array<number | number[]> = [];
  const haptics = new GameHaptics({ supported: () => supported, allowed: () => allowed,
    now: () => now, vibrate: pattern => { calls.push(pattern); return accepted; } });
  return { haptics, calls, time: (n: number) => { now = n; }, allow: (v: boolean) => { allowed = v; }, support: (v: boolean) => { supported = v; }, accept: (v: boolean) => { accepted = v; } };
}

test('vibration requires support, a gesture and active gameplay; preferences and accessibility gate every cue', () => {
  const f = fixture();
  assert.equal(f.haptics.play('launch'), false); f.haptics.unlock();
  assert.equal(f.haptics.play('launch'), false); f.haptics.setActive(true);
  f.support(false); assert.equal(f.haptics.play('launch'), false);
  f.support(true); f.allow(false); assert.equal(f.haptics.play('launch'), false);
  f.allow(true); assert.equal(f.haptics.play('launch'), true); assert.deepEqual(f.calls, [8]);
  f.haptics.setEnabled(false); assert.deepEqual(f.calls, [8,0]);
  f.time(100); assert.equal(f.haptics.play('complete'), false);
  f.haptics.setEnabled(true); assert.equal(f.haptics.play('complete'), true);
  f.haptics.setActive(false); assert.equal(f.calls.at(-1), 0);
  assert.equal(f.haptics.play('clear'), false);
});

test('strong events preempt taps while rapid or weaker pours cannot interrupt the completion motor pattern', () => {
  const f = fixture(); f.haptics.unlock(); f.haptics.setActive(true);
  assert.equal(f.haptics.play('launch'), true);
  f.time(1); assert.equal(f.haptics.play('complete', 6), true);
  f.time(10); assert.equal(f.haptics.play('launch'), false);
  f.time(50); assert.equal(f.haptics.play('contact'), false);
  assert.equal(f.haptics.play('clear'), true);
  f.time(80); assert.equal(f.haptics.play('complete'), false);
  f.time(300); assert.equal(f.haptics.play('arrival'), true);
  assert.deepEqual(f.calls, [8,[43,18,55],[38,24,52,28,72],20]);
  f.time(301); assert.equal(f.haptics.play('arrival'), false);
  f.time(340); assert.equal(f.haptics.play('arrival'), true);
  f.haptics.dispose(); assert.equal(f.calls.at(-1), 0); assert.equal(f.haptics.play('clear'), false);
});

test('rejected or throwing platform vibration calls do not block later events or gameplay', () => {
  const f = fixture(); f.haptics.unlock(); f.haptics.setActive(true); f.accept(false);
  assert.equal(f.haptics.play('complete'), false);
  f.accept(true); assert.equal(f.haptics.play('launch'), true);
  const broken = new GameHaptics({ supported: () => true, allowed: () => true, now: () => 0, vibrate() { throw new Error('blocked'); } });
  broken.unlock(); broken.setActive(true);
  assert.doesNotThrow(() => { assert.equal(broken.play('clear'), false); broken.stop(); broken.dispose(); });
});
