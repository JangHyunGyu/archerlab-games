export class InputController {
  constructor(boardEl, callbacks) {
    this.boardEl = boardEl;
    this.callbacks = callbacks;
    this.pointerStart = null;
    this.enabled = true;
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerCancel = this.onPointerCancel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.boardEl.addEventListener('pointerdown', this.onPointerDown);
    this.boardEl.addEventListener('pointerup', this.onPointerUp);
    this.boardEl.addEventListener('pointercancel', this.onPointerCancel);
    this.boardEl.addEventListener('keydown', this.onKeyDown);
    this.boardEl.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  destroy() {
    this.boardEl.removeEventListener('pointerdown', this.onPointerDown);
    this.boardEl.removeEventListener('pointerup', this.onPointerUp);
    this.boardEl.removeEventListener('pointercancel', this.onPointerCancel);
    this.boardEl.removeEventListener('keydown', this.onKeyDown);
  }

  onPointerDown(event) {
    if (!this.enabled) return;
    const cell = event.target.closest('.cell');
    if (!cell || !this.boardEl.contains(cell)) return;
    this.pointerStart = {
      row: Number(cell.dataset.row),
      col: Number(cell.dataset.col),
      x: event.clientX,
      y: event.clientY
    };
    try { cell.setPointerCapture(event.pointerId); } catch (_err) {}
  }

  onPointerUp(event) { var __oc0, __oc1, __oc2, __oc3;
    if (!this.enabled || !this.pointerStart) return;
    const start = this.pointerStart;
    this.pointerStart = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 26) {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const to = {
        row: start.row + (absY > absX ? Math.sign(dy) : 0),
        col: start.col + (absX >= absY ? Math.sign(dx) : 0)
      };
      (((__oc1 = (__oc0 = this.callbacks).swipe) === null || __oc1 === void 0 ? void 0 : __oc1.call(__oc0, { row: start.row, col: start.col }, to)));
      return;
    }
    (((__oc3 = (__oc2 = this.callbacks).tap) === null || __oc3 === void 0 ? void 0 : __oc3.call(__oc2, { row: start.row, col: start.col })));
  }

  onPointerCancel() {
    this.pointerStart = null;
  }

  onKeyDown(event) { var __oc4, __oc5;
    if (!this.enabled) return;
    const keyMap = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 }
    };
    const dir = keyMap[event.key];
    if (!dir) return;
    event.preventDefault();
    (((__oc5 = (__oc4 = this.callbacks).keyboardMove) === null || __oc5 === void 0 ? void 0 : __oc5.call(__oc4, dir)));
  }
}
