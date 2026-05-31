import { GEM_TYPES, GEM_BY_ID } from './gem.js';

/**
 * PixiJS 기반 보석 보드 렌더러.
 * - 보석은 안정적인 gem.id로 스프라이트를 재사용(reconcile)하여 전체 재생성 없이 부드럽게 이동시킨다.
 * - 스왑/낙하/제거/특수 변환 애니메이션과 매치 파티클 이펙트를 GPU에서 처리한다.
 */

const BG_COLOR = 0x05161d;
const CELL_COLOR = 0x0d3641;
const CELL_BORDER = 0x9fdedc;
const SELECT_COLOR = 0xffe07c;

const TYPE_COLORS = Object.fromEntries(
  GEM_TYPES.map((g) => [g.id, parseInt(g.color.replace('#', ''), 16)])
);

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeInQuad(t) {
  return t * t;
}
function randomBetweenLocal(min, max) {
  return min + Math.random() * (max - min);
}

export class PixiBoard {
  constructor(mountEl, { size = 8 } = {}) {
    this.mountEl = mountEl;
    this.size = size;
    this.app = null;
    this.textures = {};
    this.fxFrames = {}; // 'shatter-<type>' -> [Texture...] (애니 프레임), 'shards-<type>' -> [Texture...] (조각 프레임)
    this.fxReady = false;
    this.sprites = new Map(); // gem.id -> { sprite, row, col, base }
    this.tweens = new Set();
    this.particles = new Set();
    this.combos = new Set();
    this.callbacks = {};
    this.enabled = false;
    this.selected = null;
    this.cell = 0;
    this.pad = 0;
    this.gap = 0;
    this.origin = 0;
    this.pointerStart = null;
    this._ready = false;
  }

  async init() {
    this.app = new PIXI.Application();
    await this.app.init({
      resizeTo: this.mountEl,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      powerPreference: 'high-performance'
    });
    this.app.canvas.style.position = 'absolute';
    this.app.canvas.style.inset = '0';
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';
    this.app.canvas.style.display = 'block';
    this.app.canvas.style.touchAction = 'none';
    this.mountEl.appendChild(this.app.canvas);

    // 레이어
    this.bgLayer = new PIXI.Container();
    this.gemLayer = new PIXI.Container();
    this.selectLayer = new PIXI.Container();
    this.fxLayer = new PIXI.Container();
    this.comboLayer = new PIXI.Container();
    this.app.stage.addChild(this.bgLayer, this.gemLayer, this.selectLayer, this.fxLayer, this.comboLayer);

    // 선택 하이라이트
    this.selectGfx = new PIXI.Graphics();
    this.selectGfx.visible = false;
    this.selectLayer.addChild(this.selectGfx);

    await this._loadTextures();
    this._computeGeometry();
    this._drawBackground();
    this._bindInput();

    this.app.ticker.add((ticker) => this._update(ticker.deltaMS));
    this.app.renderer.on('resize', () => this._onResize());
    this._ready = true;

    // 대형 VFX(폭발/조각 스트립)는 첫 렌더를 막지 않도록 백그라운드 지연 로드
    this._preloadEffects().catch((err) => console.warn('[Jewelria] 이펙트 프리로드 실패, 벡터 폴백 사용', err));
  }

  async _loadTextures() {
    const assets = GEM_TYPES
      .filter((g) => g.image)
      .map((g) => ({ alias: g.id, src: g.image }));
    try {
      const loaded = await PIXI.Assets.load(assets);
      for (const g of GEM_TYPES) {
        if (loaded[g.id]) this.textures[g.id] = loaded[g.id];
      }
    } catch (err) {
      console.warn('[Jewelria] 보석 텍스처 로드 실패, 벡터 폴백 사용', err);
    }
  }

  /** 이펙트 스트립/아틀라스를 지연 로드 후 프레임으로 슬라이스 (첫 렌더 비차단) */
  async _preloadEffects() {
    const fxAssets = [];
    for (const g of GEM_TYPES) {
      fxAssets.push({ alias: `fx-shatter-${g.id}`, src: `assets/images/effects/gem-shatter-${g.id}.png` });
      fxAssets.push({ alias: `fx-shards-${g.id}`, src: `assets/images/effects/gem-shards-${g.id}.png` });
    }
    const fx = await PIXI.Assets.load(fxAssets);
    for (const g of GEM_TYPES) {
      const shatterTex = fx[`fx-shatter-${g.id}`];
      if (shatterTex) this.fxFrames[`shatter-${g.id}`] = this._sliceStrip(shatterTex);
      const shardsTex = fx[`fx-shards-${g.id}`];
      if (shardsTex) this.fxFrames[`shards-${g.id}`] = this._sliceGrid(shardsTex, 4, 4);
    }
    this.fxReady = true;
  }

  /** 가로 애니메이션 스트립을 정사각 프레임 배열로 분할 */
  _sliceStrip(tex) {
    const src = tex.source;
    const fh = src.height;
    const count = Math.max(1, Math.round(src.width / fh));
    const fw = src.width / count;
    const frames = [];
    for (let i = 0; i < count; i += 1) {
      frames.push(new PIXI.Texture({ source: src, frame: new PIXI.Rectangle(i * fw, 0, fw, fh) }));
    }
    return frames;
  }

  /** 아틀라스를 cols×rows 그리드 조각으로 분할 (각 조각 = 보석 파편 묶음) */
  _sliceGrid(tex, cols, rows) {
    const src = tex.source;
    const fw = src.width / cols;
    const fh = src.height / rows;
    const frames = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        frames.push(new PIXI.Texture({ source: src, frame: new PIXI.Rectangle(c * fw, r * fh, fw, fh) }));
      }
    }
    return frames;
  }

  _computeGeometry() {
    const w = this.mountEl.clientWidth || 360;
    const h = this.mountEl.clientHeight || 360;
    const board = Math.min(w, h);
    this.pad = Math.max(5, Math.round(board * 0.018));
    this.gap = Math.max(4, Math.round(board * 0.012));
    const inner = board - this.pad * 2 - this.gap * (this.size - 1);
    this.cell = inner / this.size;
    this.boardSize = board;
    this.offsetX = (w - board) / 2;
    this.offsetY = (h - board) / 2;
  }

  cellX(col) {
    return this.offsetX + this.pad + col * (this.cell + this.gap) + this.cell / 2;
  }
  cellY(row) {
    return this.offsetY + this.pad + row * (this.cell + this.gap) + this.cell / 2;
  }

  getCellMetrics(cell, layerRect = null) {
    if (!this._ready || !cell) return null;
    const canvasRect = this.app.canvas.getBoundingClientRect();
    const x = this.cellX(cell.col);
    const y = this.cellY(cell.row);
    return {
      x: layerRect ? canvasRect.left - layerRect.left + x : x,
      y: layerRect ? canvasRect.top - layerRect.top + y : y,
      size: this.cell,
      type: cell.type || null
    };
  }

  _drawBackground() {
    const g = this.bgLayer;
    g.removeChildren();
    const board = new PIXI.Graphics();
    board.roundRect(this.offsetX, this.offsetY, this.boardSize, this.boardSize, 8).fill({ color: BG_COLOR, alpha: 0.94 });
    g.addChild(board);
    for (let r = 0; r < this.size; r += 1) {
      for (let c = 0; c < this.size; c += 1) {
        const x = this.cellX(c) - this.cell / 2;
        const y = this.cellY(r) - this.cell / 2;
        const tile = new PIXI.Graphics();
        tile.roundRect(x, y, this.cell, this.cell, Math.max(5, this.cell * 0.16))
          .fill({ color: CELL_COLOR, alpha: 0.72 });
        tile.roundRect(x + 2, y + 2, this.cell - 4, this.cell - 4, Math.max(4, this.cell * 0.13))
          .stroke({ color: CELL_BORDER, alpha: 0.12, width: 1 });
        g.addChild(tile);
      }
    }
  }

  _makeGemSprite(gem) {
    const container = new PIXI.Container();
    const tex = this.textures[gem.type];
    let visual;
    if (tex) {
      visual = new PIXI.Sprite(tex);
      visual.anchor.set(0.5);
      const target = this.cell * 0.86;
      visual.width = target;
      visual.height = target;
    } else {
      visual = new PIXI.Graphics();
      const radius = this.cell * 0.4;
      visual.circle(0, 0, radius).fill({ color: TYPE_COLORS[gem.type] || 0xffffff });
      visual.circle(-radius * 0.3, -radius * 0.3, radius * 0.32).fill({ color: 0xffffff, alpha: 0.5 });
    }
    container.addChild(visual);
    container._visual = visual;

    if (gem.special) {
      const marker = this._makeSpecialMarker(gem.special, gem.type);
      container.addChild(marker);
      container._specialMarker = marker;
    }
    return container;
  }

  // 특수 보석 마커: 보석색 발광 오라 + 어두운 대비 베이스 + 밝은 에너지 코어 +
  // 양끝 방향 화살표로 "이 줄을 쓸어버린다"는 걸 직관적으로 보여준다. row=가로, col=세로.
  _makeSpecialMarker(direction, gemType) {
    const color = TYPE_COLORS[gemType] || 0xffffff;
    const m = new PIXI.Container();
    const len = this.cell * 0.64;
    const half = len / 2;
    const glowThick = this.cell * 0.36;
    const baseThick = this.cell * 0.185;
    const coreThick = this.cell * 0.10;
    const aw = this.cell * 0.13; // 화살표 길이
    const ah = this.cell * 0.145; // 화살표 절반 높이

    // 1) 보석색 발광 오라(에너지가 흐르는 느낌)
    const glow = new PIXI.Graphics();
    glow.roundRect(-half, -glowThick / 2, len, glowThick, glowThick / 2).fill({ color, alpha: 0.26 });
    glow.roundRect(-half, -glowThick * 0.32, len, glowThick * 0.64, glowThick * 0.32).fill({ color, alpha: 0.34 });
    m.addChild(glow);

    // 2) 어두운 베이스 — 주황/노랑 같은 밝은 보석 위에서도 또렷하게 보이도록 대비.
    const base = new PIXI.Graphics();
    base.roundRect(-half, -baseThick / 2, len, baseThick, baseThick / 2).fill({ color: 0x06121a, alpha: 0.58 });
    m.addChild(base);

    // 3) 밝은 에너지 코어 + 중앙 발광 점.
    const core = new PIXI.Graphics();
    core.roundRect(-half, -coreThick / 2, len, coreThick, coreThick / 2).fill({ color: 0xffffff, alpha: 0.96 });
    core.ellipse(0, 0, coreThick * 1.1, coreThick * 0.85).fill({ color: 0xffffff, alpha: 0.92 });
    m.addChild(core);

    // 4) 양끝 화살표 — 클리어 방향(가로/세로)을 한눈에.
    const arrows = new PIXI.Graphics();
    arrows.poly([half, -ah, half + aw, 0, half, ah]).fill({ color: 0xffffff, alpha: 0.96 });
    arrows.poly([-half, -ah, -half - aw, 0, -half, ah]).fill({ color: 0xffffff, alpha: 0.96 });
    m.addChild(arrows);

    // col(세로) 특수는 90° 회전해 세로 줄무늬로.
    if (direction !== 'row') m.rotation = Math.PI / 2;
    m._glow = glow;
    m._phase = Math.random() * Math.PI * 2; // 보석마다 펄스 위상을 달리해 자연스럽게.
    return m;
  }

  /** main.js가 호출: 보드 상태를 화면에 반영(스왑/낙하/선택 포함) */
  renderBoard(grid, selected = null, fallMoves = []) {
    if (!this._ready) return;
    this.selected = selected;
    const fallMap = new Map(
      (fallMoves || []).map((m) => [`${m.to.row}:${m.to.col}`, m])
    );
    const present = new Set();

    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < grid[r].length; c += 1) {
        const gem = grid[r][c];
        if (!gem) continue;
        present.add(gem.id);
        const tx = this.cellX(c);
        const ty = this.cellY(r);
        let entry = this.sprites.get(gem.id);

        if (!entry) {
          const sprite = this._makeGemSprite(gem);
          const fall = fallMap.get(`${r}:${c}`);
          if (fall && fall.from.row < 0) {
            sprite.position.set(tx, this.cellY(-1.5));
          } else {
            sprite.position.set(tx, ty);
            sprite.scale.set(0);
            this._tween(sprite, { scale: 1 }, 220, easeOutBack);
          }
          this.gemLayer.addChild(sprite);
          entry = { sprite, row: r, col: c, special: gem.special || null };
          this.sprites.set(gem.id, entry);
          if (fall) this._animateFall(sprite, fall, r, c);
        } else {
          // 특수 변환으로 외형이 바뀐 경우 스프라이트 교체
          if ((entry.special || null) !== (gem.special || null)) {
            const oldSprite = entry.sprite;
            const px = oldSprite.x;
            const py = oldSprite.y;
            this.gemLayer.removeChild(oldSprite);
            oldSprite.destroy({ children: true });
            const sprite = this._makeGemSprite(gem);
            sprite.position.set(px, py);
            this.gemLayer.addChild(sprite);
            entry.sprite = sprite;
            entry.special = gem.special || null;
          }
          const fall = fallMap.get(`${r}:${c}`);
          if (fall) {
            this._animateFall(entry.sprite, fall, r, c);
          } else if (Math.abs(entry.sprite.x - tx) > 0.5 || Math.abs(entry.sprite.y - ty) > 0.5) {
            this._tween(entry.sprite, { x: tx, y: ty }, 150, easeOutCubic);
          } else {
            entry.sprite.position.set(tx, ty);
          }
        }
        entry.row = r;
        entry.col = c;
      }
    }

    // 사라진 보석 정리
    for (const [id, entry] of this.sprites) {
      if (!present.has(id)) {
        this.gemLayer.removeChild(entry.sprite);
        entry.sprite.destroy({ children: true });
        this.sprites.delete(id);
      }
    }

    this._updateSelection();
  }

  _animateFall(sprite, move, row, col) {
    const tx = this.cellX(col);
    const ty = this.cellY(row);
    const fromRow = Number(move.from?.row ?? row);
    const distance = Math.max(1, fromRow < 0 ? row + 1.6 : row - fromRow);
    const dur = Math.min(820, 320 + distance * 64);
    const delay = Math.min(150, col * 10 + Math.max(0, 7 - row) * 4);
    sprite.x = tx;
    this._tween(sprite, { y: ty }, dur, easeOutCubic, delay);
    const landDelay = delay + dur * 0.76;
    setTimeout(() => {
      if (!sprite.parent || sprite.destroyed) return;
      this._spawnLandingPulse(tx, ty, distance);
      this._tween(sprite, { scale: 1.1 }, 70, easeOutCubic);
      setTimeout(() => {
        if (!sprite.parent || sprite.destroyed) return;
        this._tween(sprite, { scale: 1 }, 180, easeOutBack);
      }, 72);
    }, landDelay);
  }

  _updateSelection() {
    if (!this.selected) {
      this.selectGfx.visible = false;
      return;
    }
    const { row, col } = this.selected;
    const x = this.cellX(col) - this.cell / 2;
    const y = this.cellY(row) - this.cell / 2;
    this.selectGfx.clear();
    this.selectGfx
      .roundRect(x, y, this.cell, this.cell, Math.max(5, this.cell * 0.16))
      .stroke({ color: SELECT_COLOR, alpha: 0.9, width: 3 });
    this.selectGfx.visible = true;
    this._pulse = 0;
  }

  /** main.js가 호출: clearing/invalid/transforming 표시 */
  markCells(cells, className, duration = 320, stagger = 0) {
    if (!this._ready) return Promise.resolve();
    if (className === 'clearing') {
      const ordered = stagger > 0 ? this._staggerOrder(cells) : cells;
      ordered.forEach((cell, i) => {
        const entry = this._entryAt(cell.row, cell.col);
        if (!entry) return;
        const run = () => {
          const s = entry.sprite;
          const color = TYPE_COLORS[cell.type] || 0xfff0a8;
          this._spawnFlash(this.cellX(cell.col), this.cellY(cell.row), color, 1.8);
          this._spawnRing(this.cellX(cell.col), this.cellY(cell.row), color, 1.45);
          this._tween(s, { scale: 1.42 }, duration * 0.38, easeOutCubic);
          this._tween(s, { alpha: 0 }, duration, easeInQuad);
          setTimeout(() => this._tween(s, { scale: 0 }, duration * 0.5, easeInQuad), duration * 0.38);
        };
        const wait = stagger > 0 ? i * stagger : 0;
        if (wait > 0) setTimeout(run, wait); else run();
      });
      const total = duration + (stagger > 0 ? Math.max(0, ordered.length - 1) * stagger : 0);
      return new Promise((resolve) => setTimeout(resolve, total));
    } else if (className === 'invalid') {
      for (const cell of cells) {
        const entry = this._entryAt(cell.row, cell.col);
        if (entry) this._shake(entry.sprite, this.cell * 0.18, duration);
      }
    } else if (className === 'transforming') {
      for (const cell of cells) {
        const entry = this._entryAt(cell.row, cell.col);
        if (entry) {
          this._tween(entry.sprite, { scale: 1.18 }, duration * 0.5, easeOutBack);
          setTimeout(() => this._tween(entry.sprite, { scale: 1 }, duration * 0.5, easeOutCubic), duration * 0.5);
        }
      }
    }
    return new Promise((resolve) => setTimeout(resolve, duration));
  }

  /** 매치 셀을 중심에서 바깥쪽으로 퍼지는 순서로 정렬해 순차적으로 깨지게 한다. */
  _staggerOrder(cells) {
    if (!cells.length) return cells;
    let cx = 0;
    let cy = 0;
    for (const cell of cells) { cx += cell.col; cy += cell.row; }
    cx /= cells.length;
    cy /= cells.length;
    return cells
      .map((cell) => ({ cell, d: (cell.col - cx) ** 2 + (cell.row - cy) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .map((o) => o.cell);
  }

  _entryAt(row, col) {
    for (const entry of this.sprites.values()) {
      if (entry.row === row && entry.col === col) return entry;
    }
    return null;
  }

  // ─── 파티클 이펙트 ───
  spawnMatchEffects(cells, options = {}) {
    if (!this._ready || !cells.length) return;
    const combo = Number(options.combo || 1);
    const longest = Number(options.longest || 3);
    const lineCount = Number(options.lineCount || 1);
    const hasSpecial = Number(options.specialActivations || 0) > 0;
    const stagger = Number(options.stagger || 0);
    const intensity = Math.min(5, 1.2 + combo * 0.4 + Math.max(0, lineCount - 1) * 0.4 + Math.max(0, longest - 3) * 0.3 + (hasSpecial ? 0.8 : 0));

    // 중심점 / 대표 색상 선계산
    let cx = 0;
    let cy = 0;
    let dominant = null;
    const counts = {};
    for (const cell of cells) {
      cx += this.cellX(cell.col);
      cy += this.cellY(cell.row);
      if (cell.type) {
        counts[cell.type] = (counts[cell.type] || 0) + 1;
        if (!dominant || counts[cell.type] > counts[dominant]) dominant = cell.type;
      }
    }
    cx /= cells.length;
    cy /= cells.length;

    const ordered = stagger > 0 ? this._staggerOrder(cells) : cells;
    const burstCell = (cell) => {
      const x = this.cellX(cell.col);
      const y = this.cellY(cell.row);
      const type = cell.type;
      const color = TYPE_COLORS[type] || 0xfff0a8;
      if (this.fxFrames[`shards-${type}`]) {
        // 이미지 에셋 기반 파편 + 폭발(저비용, GPU)
        const n = Math.round(6 + intensity * 2.6);
        for (let i = 0; i < n; i += 1) this._spawnShardSprite(x, y, type, intensity);
        this._spawnBurstSprite(x, y, type, intensity);
        if (intensity > 2.2) this._spawnBurstSprite(x, y, type, intensity * 0.7);
      } else {
        const shardCount = Math.round(9 + intensity * 3.2);
        for (let i = 0; i < shardCount; i += 1) this._spawnShard(x, y, color, intensity);
      }
      this._spawnRing(x, y, color, intensity * 0.9);
      this._spawnShockwave(x, y, color, intensity * 0.7);
    };
    ordered.forEach((cell, i) => {
      const wait = stagger > 0 ? i * stagger : 0;
      if (wait > 0) setTimeout(() => burstCell(cell), wait); else burstCell(cell);
    });

    const centerColor = TYPE_COLORS[dominant] || 0xfff0a8;
    this._spawnFlash(cx, cy, centerColor, intensity * 1.25);
    this._spawnRing(cx, cy, centerColor, intensity * 1.8);
    // 중앙 대형 파동(shockwave)
    this._spawnShockwave(cx, cy, centerColor, intensity * 1.6);
    const rays = Math.round(12 + intensity * 6);
    for (let i = 0; i < rays; i += 1) this._spawnSpark(cx, cy, centerColor, intensity * 1.5);

    // 진동: 모든 매치에 기본 진동, 콤보/대형 매치일수록 강하게
    this._shakeStage(Math.min(26, 4 + intensity * 3.4), 360 + intensity * 40);

    if (combo >= 3 || hasSpecial || longest >= 5) {
      this._spawnShockwave(cx, cy, 0xffffff, intensity * 2.2);
      this._spawnRing(cx, cy, 0xffffff, intensity * 2.4);
      this._spawnBigFlash(intensity);
    }
  }

  _spawnParticle(gfx, life, update) {
    gfx._life = life;
    gfx._age = 0;
    gfx._update = update;
    this.fxLayer.addChild(gfx);
    this.particles.add(gfx);
  }

  /** gem-shatter-<type>.png 스트립을 프레임 애니메이션으로 재생하는 폭발 스프라이트 */
  _spawnBurstSprite(x, y, type, intensity) {
    const frames = this.fxFrames[`shatter-${type}`];
    if (!frames || !frames.length) return false;
    const s = new PIXI.Sprite(frames[0]);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.rotation = (Math.random() - 0.5) * 0.5;
    s.blendMode = 'add';
    const base = this.cell * (1.4 + intensity * 0.2);
    s.width = base;
    s.height = base;
    const bsx = s.scale.x;
    const bsy = s.scale.y;
    const fc = frames.length;
    let cur = -1;
    this._spawnParticle(s, 440 + intensity * 40, (p, dt, t) => {
      const idx = Math.min(fc - 1, Math.floor(t * fc));
      if (idx !== cur) { cur = idx; p.texture = frames[idx]; }
      const k = 1 + t * 0.35; // 살짝 커지며 퍼짐
      p.scale.set(bsx * k, bsy * k);
      p.alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
    });
    return true;
  }

  /** gem-shards-<type>.png 아틀라스에서 조각 하나를 골라 날리는 파편 스프라이트 */
  _spawnShardSprite(x, y, type, intensity) {
    const frames = this.fxFrames[`shards-${type}`];
    if (!frames || !frames.length) return false;
    const tex = frames[(Math.random() * frames.length) | 0];
    const s = new PIXI.Sprite(tex);
    s.anchor.set(0.5);
    s.position.set(x, y);
    const size = this.cell * (0.46 + Math.random() * 0.36);
    s.width = size;
    s.height = size;
    const bsx = s.scale.x;
    const bsy = s.scale.y;
    s.rotation = Math.random() * Math.PI * 2;
    const angle = Math.random() * Math.PI * 2;
    const speed = (3 + Math.random() * 3.4) * intensity;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 1.4 * intensity;
    const spin = (Math.random() - 0.5) * 0.24;
    this._spawnParticle(s, 560 + Math.random() * 220, (p, dt, t) => {
      p.x += vx * dt * 0.06;
      p.y += vy * dt * 0.06 + t * t * 7;
      p.rotation += spin;
      p.alpha = 1 - t;
      const k = 1 - t * 0.35;
      p.scale.set(bsx * k, bsy * k);
    });
    return true;
  }

  _spawnShard(x, y, color, intensity) {
    const g = new PIXI.Graphics();
    const size = this.cell * (0.08 + Math.random() * 0.1);
    g.poly([0, -size, size * 0.6, 0, 0, size, -size * 0.6, 0]).fill({ color });
    g.position.set(x, y);
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.5 + Math.random() * 2.4) * intensity;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 1.2 * intensity;
    const spin = (Math.random() - 0.5) * 0.3;
    this._spawnParticle(g, 520 + Math.random() * 220, (p, dt, t) => {
      p.x += vx * dt * 0.06;
      p.y += vy * dt * 0.06 + t * t * 6;
      p.rotation += spin;
      p.alpha = 1 - t;
      p.scale.set(1 - t * 0.4);
    });
  }

  _spawnSpark(x, y, color, intensity) {
    const g = new PIXI.Graphics();
    const len = this.cell * (0.12 + Math.random() * 0.16);
    g.roundRect(-len / 2, -1.4, len, 2.8, 1.4).fill({ color: 0xffffff, alpha: 0.9 });
    g.position.set(x, y);
    const angle = Math.random() * Math.PI * 2;
    g.rotation = angle;
    const speed = (2.4 + Math.random() * 3) * intensity;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    this._spawnParticle(g, 360 + Math.random() * 160, (p, dt, t) => {
      p.x += vx * dt * 0.06;
      p.y += vy * dt * 0.06;
      p.alpha = (1 - t) * 0.95;
      p.scale.x = 1 - t * 0.6;
    });
  }

  _spawnRing(x, y, color, intensity) {
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    const maxR = this.cell * (0.8 + intensity * 0.5);
    this._spawnParticle(g, 380 + intensity * 40, (p, dt, t) => {
      const r = maxR * easeOutCubic(t);
      p.clear();
      p.circle(0, 0, r).stroke({ color, alpha: (1 - t) * 0.7, width: Math.max(1.5, 4 * (1 - t)) });
    });
  }

  _spawnFlash(x, y, color, intensity) {
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    const maxR = this.cell * (0.6 + intensity * 0.4);
    g.circle(0, 0, maxR).fill({ color });
    g.blendMode = 'add';
    this._spawnParticle(g, 260, (p, dt, t) => {
      p.alpha = (1 - t) * 0.8;
      p.scale.set(0.6 + t * 0.8);
    });
  }

  /** 확장하는 파동(shockwave) — 밝은 이중 링 + 옅은 충격 디스크 */
  _spawnShockwave(x, y, color, intensity) {
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    g.blendMode = 'add';
    const maxR = this.cell * (1.3 + intensity * 0.95);
    this._spawnParticle(g, 480 + intensity * 60, (p, dt, t) => {
      const e = easeOutCubic(t);
      const r = maxR * e;
      const w = Math.max(2, this.cell * 0.42 * (1 - t));
      p.clear();
      p.circle(0, 0, r).fill({ color, alpha: (1 - t) * 0.12 });
      p.circle(0, 0, r).stroke({ color, alpha: (1 - t) * 0.85, width: w });
      p.circle(0, 0, r * 0.8).stroke({ color: 0xffffff, alpha: (1 - t) * 0.5, width: w * 0.5 });
    });
  }

  /** 큰 콤보 시 보드 전체를 덮는 화면 플래시 */
  _spawnBigFlash(intensity) {
    const g = new PIXI.Graphics();
    g.position.set(this.offsetX + this.boardSize / 2, this.offsetY + this.boardSize / 2);
    g.blendMode = 'add';
    const r = this.boardSize * 0.85;
    g.circle(0, 0, r).fill({ color: 0xffffff });
    const peak = Math.min(0.5, 0.18 + intensity * 0.06);
    this._spawnParticle(g, 280, (p, dt, t) => {
      p.alpha = (t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75) * peak;
      p.scale.set(0.85 + t * 0.3);
    });
  }

  _spawnLandingPulse(x, y, distance = 1) {
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    g.blendMode = 'add';
    const strength = Math.min(2.1, 0.9 + distance * 0.12);
    this._spawnParticle(g, 460, (p, dt, t) => {
      const ring = this.cell * (0.32 + strength * 0.34) * easeOutCubic(t);
      p.clear();
      p.ellipse(0, this.cell * 0.18, ring * 1.2, ring * 0.32)
        .stroke({ color: 0xffe8a8, alpha: (1 - t) * 0.65, width: Math.max(1.5, 3.5 * (1 - t)) });
      p.circle(0, 0, this.cell * (0.18 + t * 0.34))
        .fill({ color: 0xffffff, alpha: (1 - t) * 0.24 });
    });

    const sparks = Math.round(5 + strength * 4);
    for (let i = 0; i < sparks; i += 1) {
      const s = new PIXI.Graphics();
      const len = this.cell * randomBetweenLocal(0.09, 0.18);
      s.roundRect(-len / 2, -1.1, len, 2.2, 1.1).fill({ color: 0xffffff, alpha: 0.88 });
      s.position.set(x, y + this.cell * randomBetweenLocal(0.05, 0.2));
      const angle = -Math.PI / 2 + randomBetweenLocal(-1.25, 1.25);
      s.rotation = angle;
      const speed = randomBetweenLocal(1.2, 2.4) * strength;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      s.blendMode = 'add';
      this._spawnParticle(s, 360 + Math.random() * 140, (p, dt, t) => {
        p.x += vx * dt * 0.06;
        p.y += vy * dt * 0.06 + t * t * 4;
        p.alpha = 1 - t;
        p.scale.x = 1 - t * 0.45;
      });
    }
  }

  // ─── 콤보 텍스트 ───
  showCombo(combo, lineCount = 1, longest = 3) {
    if (!this._ready) return;
    const bigMatch = lineCount > 1 || longest >= 4;
    if (combo <= 1 && !bigMatch) return;
    const label = combo > 1
      ? `${combo >= 5 ? 'LEGEND' : combo >= 3 ? 'MEGA' : 'COMBO'} x${combo}!`
      : longest >= 5 ? 'PRISM!'
        : lineCount >= 2 ? 'DOUBLE!'
          : 'WOW!';
    const size = combo >= 5 ? 0.19 : combo >= 3 ? 0.155 : 0.125;
    const isLegend = combo >= 5;
    const fill = isLegend
      ? new PIXI.FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
          colorStops: [{ offset: 0, color: 0xfff6c8 }, { offset: 0.5, color: 0xffd24a }, { offset: 1, color: 0xff8c2a }] })
      : combo >= 3
        ? new PIXI.FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
            colorStops: [{ offset: 0, color: 0xffffff }, { offset: 1, color: 0xffd86a }] })
        : 0xffffff;
    const text = new PIXI.Text({
      text: label,
      style: {
        fontFamily: 'Pretendard Variable, Pretendard, sans-serif',
        fontSize: Math.round(this.boardSize * size),
        fontWeight: '900',
        letterSpacing: 1,
        fill,
        stroke: { color: 0x3a1b5e, width: Math.max(3, this.boardSize * 0.009), join: 'round' },
        dropShadow: { color: 0x1a0a2e, alpha: 0.55, blur: 6, distance: Math.max(2, this.boardSize * 0.006), angle: Math.PI / 2 }
      }
    });
    text.anchor.set(0.5);
    text.position.set(this.offsetX + this.boardSize / 2, this.offsetY + this.boardSize * 0.42);
    text.scale.set(0.4);
    this.comboLayer.addChild(text);
    text._life = 850;
    text._age = 0;
    text._update = (p, dt, t) => {
      if (t < 0.18) p.scale.set(0.4 + easeOutBack(t / 0.18) * 0.62);
      else p.scale.set(1.02 - (t - 0.18) * 0.06);
      p.y -= dt * 0.012; // 살짝 떠오름
      p.alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
    };
    this.combos.add(text);
  }

  // ─── 애니메이션 엔진 ───
  _tween(target, props, duration, ease = easeOutCubic, delay = 0) {
    const tween = {
      target,
      duration,
      ease,
      delay,
      elapsed: 0,
      from: {},
      to: {},
      done: false
    };
    for (const key of Object.keys(props)) {
      if (key === 'scale') {
        tween.from.scale = target.scale.x;
        tween.to.scale = props.scale;
      } else {
        tween.from[key] = target[key];
        tween.to[key] = props[key];
      }
    }
    this.tweens.add(tween);
    return tween;
  }

  _shake(sprite, amplitude, duration) {
    const baseX = sprite.x;
    const start = performance.now();
    const tween = { custom: true, done: false };
    tween.tick = () => {
      const t = (performance.now() - start) / duration;
      if (t >= 1) {
        sprite.x = baseX;
        tween.done = true;
        return;
      }
      sprite.x = baseX + Math.sin(t * Math.PI * 6) * amplitude * (1 - t);
    };
    this.tweens.add(tween);
  }

  _shakeStage(power, dur = 420) {
    this._stageShake = { power, start: performance.now(), dur };
  }

  _update(dt) {
    // tween
    for (const tween of this.tweens) {
      // 파괴된 스프라이트를 가리키는 트윈은 즉시 제거(파괴 후 속성 접근 방지).
      if (!tween.custom && tween.target && tween.target.destroyed) {
        this.tweens.delete(tween);
        continue;
      }
      if (tween.custom) {
        tween.tick();
        if (tween.done) this.tweens.delete(tween);
        continue;
      }
      if (tween.delay > 0) {
        tween.delay -= dt;
        continue;
      }
      tween.elapsed += dt;
      const t = Math.min(1, tween.elapsed / tween.duration);
      const e = tween.ease(t);
      for (const key of Object.keys(tween.to)) {
        const v = tween.from[key] + (tween.to[key] - tween.from[key]) * e;
        if (key === 'scale') tween.target.scale.set(v);
        else tween.target[key] = v;
      }
      if (t >= 1) this.tweens.delete(tween);
    }

    // particles
    for (const p of this.particles) {
      p._age += dt;
      const t = Math.min(1, p._age / p._life);
      p._update(p, dt, t);
      if (t >= 1) {
        this.fxLayer.removeChild(p);
        this.particles.delete(p);
        p.destroy();
      }
    }

    // combos
    for (const c of this.combos) {
      c._age += dt;
      const t = Math.min(1, c._age / c._life);
      c._update(c, dt, t);
      if (t >= 1) {
        this.comboLayer.removeChild(c);
        this.combos.delete(c);
        c.destroy();
      }
    }

    // selection pulse
    if (this.selectGfx.visible) {
      this._pulse = (this._pulse || 0) + dt * 0.005;
      this.selectGfx.alpha = 0.7 + Math.sin(this._pulse) * 0.3;
    }

    // 특수 보석 마커 펄스(은은하게 커졌다 작아지며 빛나 "특별함"을 강조)
    this._clock = (this._clock || 0) + dt;
    for (const entry of this.sprites.values()) {
      const m = entry.sprite && entry.sprite._specialMarker;
      if (!m) continue;
      const w = Math.sin(this._clock * 0.005 + m._phase);
      m.scale.set(1 + w * 0.07);
      if (m._glow) m._glow.alpha = 0.7 + w * 0.3;
    }

    // stage shake
    if (this._stageShake) {
      const s = this._stageShake;
      const t = (performance.now() - s.start) / s.dur;
      if (t >= 1) {
        this.app.stage.position.set(0, 0);
        this._stageShake = null;
      } else {
        const decay = (1 - t) * (1 - t) * s.power;
        const ang = Math.random() * Math.PI * 2;
        this.app.stage.position.set(
          Math.cos(ang) * decay,
          Math.sin(ang) * decay
        );
      }
    }
  }

  // ─── 입력 ───
  setInputCallbacks(callbacks) {
    this.callbacks = callbacks || {};
  }
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  _bindInput() {
    const canvas = this.app.canvas;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
    canvas.addEventListener('pointercancel', () => { this.pointerStart = null; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    if (this.mountEl.hasAttribute && this.mountEl.tabIndex >= 0) {
      this.mountEl.addEventListener('keydown', (e) => this._onKeyDown(e));
    }
  }

  _cellFromEvent(e) {
    const rect = this.app.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor((x - this.offsetX - this.pad + this.gap / 2) / (this.cell + this.gap));
    const row = Math.floor((y - this.offsetY - this.pad + this.gap / 2) / (this.cell + this.gap));
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) return null;
    return { row, col };
  }

  _onPointerDown(e) {
    if (!this.enabled) return;
    const cell = this._cellFromEvent(e);
    if (!cell) return;
    this.pointerStart = { ...cell, x: e.clientX, y: e.clientY };
  }

  _onPointerUp(e) {
    if (!this.enabled || !this.pointerStart) return;
    const start = this.pointerStart;
    this.pointerStart = null;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 26) {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const to = {
        row: start.row + (absY > absX ? Math.sign(dy) : 0),
        col: start.col + (absX >= absY ? Math.sign(dx) : 0)
      };
      this.callbacks.swipe?.({ row: start.row, col: start.col }, to);
      return;
    }
    this.callbacks.tap?.({ row: start.row, col: start.col });
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    const map = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 }
    };
    const dir = map[e.key];
    if (!dir) return;
    e.preventDefault();
    this.callbacks.keyboardMove?.(dir);
  }

  _onResize() {
    if (!this._ready) return;
    this._computeGeometry();
    this._drawBackground();
    // 보석 재배치
    for (const entry of this.sprites.values()) {
      entry.sprite.position.set(this.cellX(entry.col), this.cellY(entry.row));
      const visual = entry.sprite._visual;
      if (visual && visual.texture) {
        const target = this.cell * 0.86;
        visual.width = target;
        visual.height = target;
      }
    }
    this._updateSelection();
  }

  /** 게임 화면이 표시될 때 호출: 숨겨진 상태로 0 크기로 초기화된 캔버스를 실제 크기로 맞춘다. */
  resize() {
    if (!this._ready) return;
    this.app.resize();
    this._onResize();
  }

  clear() {
    for (const entry of this.sprites.values()) {
      this.gemLayer.removeChild(entry.sprite);
      entry.sprite.destroy({ children: true });
    }
    this.sprites.clear();
    for (const p of this.particles) { this.fxLayer.removeChild(p); p.destroy(); }
    this.particles.clear();
    for (const c of this.combos) { this.comboLayer.removeChild(c); c.destroy(); }
    this.combos.clear();
    this.tweens.clear();
    this.selectGfx.visible = false;
  }
}
