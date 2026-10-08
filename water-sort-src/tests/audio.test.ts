import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { GameAudio, SOUND_NAMES, soundPath } from '../lib/game-audio.ts';

test('WAV effects are short, non-silent, and have headroom', () => {
  let total = 0;
  for (const name of SOUND_NAMES) {
    const bytes = readFileSync(new URL(`../public${soundPath(name).replace('/water-sort', '')}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt16LE(20), 1); assert.equal(bytes.readUInt16LE(22), 1); assert.equal(bytes.readUInt16LE(34), 16);
    const duration = bytes.readUInt32LE(40) / bytes.readUInt32LE(28);
    assert.ok(duration > .1 && duration <= 1);
    let peak = 0;
    for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)) / 32768);
    assert.ok(peak > .1 && peak < .7, `${name}: ${peak}`);
    total += bytes.length;
  }
  assert.ok(total < 150000);
});

test('audio needs a gesture, trims pours without speeding them up, and cancels muted/hidden/pending sounds', async () => {
  const starts: number[] = [], rates: number[] = [], clips: Array<number | undefined> = [];
  let context: FakeContext, stopped = 0, requests = 0, hidden = false;
  class FakeContext {
    state = 'suspended'; currentTime = 10; destination = {};
    constructor() { context = this; }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
    async decodeAudioData() { return { duration: .64 }; }
    createGain() {
      return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} };
    }
    createBufferSource() {
      const source = { buffer: null as { duration: number } | null, playbackRate: { value: 1 }, onended: null as null | (() => void),
        connect() {}, disconnect() {}, start(at: number, _offset?: number, length?: number) {
          starts.push(at); rates.push(source.playbackRate.value); clips.push(length);
        },
        stop() { stopped++; source.onended?.(); } };
      return source;
    }
  }
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, { window: { AudioContext: FakeContext }, document: { get hidden() { return hidden; } } });
  globalThis.fetch = async () => { requests++; return new Response(new Uint8Array([1])); };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const audio = new GameAudio();
  try {
    audio.play('start'); await flush(); assert.equal(requests, 0); assert.equal(starts.length, 0);
    audio.unlock(); await flush(); assert.equal(requests, SOUND_NAMES.length);
    audio.play('pour', .3, .5); await flush();
    assert.equal(starts[0], 10.3); assert.equal(rates[0], 1); assert.equal(clips[0], .5);
    audio.play('clear'); audio.setEnabled(false); await flush();
    assert.equal(starts.length, 1); assert.equal(stopped, 1);
    audio.play('select'); audio.unlock(); await flush(); assert.equal(starts.length, 1);
    audio.setEnabled(true); audio.unlock(); hidden = true; audio.play('timeout'); await flush(); assert.equal(starts.length, 1);
    hidden = false; audio.play('clear'); context!.currentTime = 11; await flush(); assert.equal(starts.length, 1); // Skip stale queued audio.
    audio.play('select'); await flush(); assert.equal(starts.length, 2);
    audio.play('pour', 0, 2); await flush();
    assert.equal(starts.length, 3); assert.equal(rates[2], 1); assert.equal(clips[2], undefined);
    audio.dispose(); assert.equal(context!.state, 'closed'); assert.equal(stopped, 3);
    audio.play('select'); await flush(); assert.equal(starts.length, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test('missing audio support does not interrupt gameplay', () => {
  Object.assign(globalThis, { window: {}, document: { hidden: false } });
  const audio = new GameAudio();
  assert.doesNotThrow(() => { audio.unlock(); audio.play('start'); audio.stop(); audio.dispose(); });
});

test('countdown ticks once per second, skips clock jumps, and resets between stages', () => {
  const audio = new GameAudio(), sounds: string[] = [];
  audio.play = name => { sounds.push(name); };
  audio.countdown('run:1', 60, true); assert.equal(sounds.length, 0);
  for (let second = 59; second >= 56; second--) {
    audio.countdown('run:1', second, true);
    audio.countdown('run:1', second, true); // UI rerender does not double-play.
  }
  assert.deepEqual(sounds, ['tick', 'tick', 'tick', 'tick']);
  audio.countdown('run:1', 57, true); audio.countdown('run:1', 56, true);
  assert.equal(sounds.length, 4); // A server clock correction cannot replay a second.
  audio.countdown('run:1', 42, true); assert.equal(sounds.length, 4); // No catch-up burst.
  audio.countdown('run:1', 41, true); assert.equal(sounds.length, 5);
  audio.countdown('run:1', 40, false); audio.countdown('run:1', 39, false);
  audio.countdown('run:2', 60, true); assert.equal(sounds.length, 5);
  audio.countdown('run:2', 59, true); assert.equal(sounds.length, 6);
  audio.countdown('run:2', 0, false); audio.countdown(null, 60, false);
  assert.equal(sounds.length, 6);
});
