// 지연된 트윈이 이미 파괴된 스프라이트를 만나도 예외 없이 건너뛰는지, 실제 PixiBoard._tween 경로로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
const { PixiBoard } = await import('./assets/js/pixi-board.js');

function board(motion) {
  const b = Object.create(PixiBoard.prototype);
  b.tweens = new Set();
  b.gsapTweens = new Set();
  b._motionEnabled = () => motion;
  return b;
}

test('destroyed sprite (scale null) is skipped instead of throwing', () => {
  for (const motion of [false, true]) {
    const b = board(motion);
    const destroyed = { destroyed: true, scale: null, alpha: 1 };
    assert.doesNotThrow(() => b._tween(destroyed, { scale: 0 }, 100));
    assert.equal(b._tween(destroyed, { scale: 0 }, 100), null);
    assert.equal(b.tweens.size, 0);
  }
  assert.equal(board(false)._tween(null, { alpha: 0 }, 100), null);
});

test('live sprite still gets a fallback tween', () => {
  const b = board(false);
  const live = { destroyed: false, scale: { x: 1, set() {} }, alpha: 1 };
  const tween = b._tween(live, { scale: 0, alpha: 0 }, 100);
  assert.equal(tween.from.scale, 1);
  assert.equal(tween.to.alpha, 0);
  assert.equal(b.tweens.size, 1);
});
