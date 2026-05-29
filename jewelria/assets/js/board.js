import { createGem, randomGem, randomGemType } from './gem.js';

const DIRECTIONS = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: -1, dc: 0 }
];

export class BoardModel {
  constructor(size = 8, rng = Math.random) {
    this.size = size;
    this.rng = rng;
    this.grid = [];
  }

  generateInitial() {
    this.grid = Array.from({ length: this.size }, () => Array(this.size).fill(null));
    for (let r = 0; r < this.size; r += 1) {
      for (let c = 0; c < this.size; c += 1) {
        this.grid[r][c] = createGem(this.pickSafeType(r, c));
      }
    }
    let guard = 0;
    while (!this.findPossibleMove() && guard < 80) {
      guard += 1;
      this.shuffle({ preserveSpecials: false });
    }
  }

  pickSafeType(row, col) {
    const blocked = new Set();
    const leftA = this.get(row, col - 1);
    const leftB = this.get(row, col - 2);
    const upA = this.get(row - 1, col);
    const upB = this.get(row - 2, col);
    if (leftA && leftB && leftA.type === leftB.type) blocked.add(leftA.type);
    if (upA && upB && upA.type === upB.type) blocked.add(upA.type);
    for (let i = 0; i < 18; i += 1) {
      const type = randomGemType(this.rng);
      if (!blocked.has(type)) return type;
    }
    return randomGemType(this.rng);
  }

  inBounds(row, col) {
    return row >= 0 && row < this.size && col >= 0 && col < this.size;
  }

  get(row, col) {
    if (!this.inBounds(row, col)) return null;
    return this.grid[row][col];
  }

  set(row, col, gem) {
    if (this.inBounds(row, col)) this.grid[row][col] = gem;
  }

  areAdjacent(a, b) {
    return !!a && !!b && Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
  }

  swap(a, b) {
    if (!this.areAdjacent(a, b)) return false;
    const first = this.get(a.row, a.col);
    const second = this.get(b.row, b.col);
    this.set(a.row, a.col, second);
    this.set(b.row, b.col, first);
    return true;
  }

  findMatches() {
    const matches = [];
    for (let r = 0; r < this.size; r += 1) {
      let start = 0;
      while (start < this.size) {
        const gem = this.get(r, start);
        if (!gem) {
          start += 1;
          continue;
        }
        let end = start + 1;
        while (end < this.size && this.get(r, end) && this.get(r, end).type === gem.type) end += 1;
        if (end - start >= 3) {
          matches.push({
            direction: 'row',
            type: gem.type,
            length: end - start,
            cells: range(start, end).map((col) => ({ row: r, col }))
          });
        }
        start = end;
      }
    }
    for (let c = 0; c < this.size; c += 1) {
      let start = 0;
      while (start < this.size) {
        const gem = this.get(start, c);
        if (!gem) {
          start += 1;
          continue;
        }
        let end = start + 1;
        while (end < this.size && this.get(end, c) && this.get(end, c).type === gem.type) end += 1;
        if (end - start >= 3) {
          matches.push({
            direction: 'col',
            type: gem.type,
            length: end - start,
            cells: range(start, end).map((row) => ({ row, col: c }))
          });
        }
        start = end;
      }
    }
    return matches;
  }

  buildResolution(matches, originCells = []) {
    const remove = new Map();
    const specials = new Map();
    const activated = [];
    const originKeys = originCells.map(cellKey);

    for (const match of matches) {
      let createAt = null;
      if (match.length >= 4) {
        createAt = match.cells.find((cell) => originKeys.includes(cellKey(cell))) || match.cells[Math.floor(match.cells.length / 2)];
        const sourceGem = this.get(createAt.row, createAt.col);
        if (sourceGem) {
          specials.set(cellKey(createAt), {
            row: createAt.row,
            col: createAt.col,
            type: sourceGem.type,
            special: match.direction === 'row' ? 'row' : 'col',
            length: match.length
          });
        }
      }
      for (const cell of match.cells) {
        const key = cellKey(cell);
        const gem = this.get(cell.row, cell.col);
        if (gem && gem.special) activated.push({ ...cell, special: gem.special, type: gem.type });
        if (!specials.has(key)) remove.set(key, { ...cell });
      }
    }

    for (const active of activated) {
      const cells = active.special === 'row'
        ? range(0, this.size).map((col) => ({ row: active.row, col }))
        : range(0, this.size).map((row) => ({ row, col: active.col }));
      for (const cell of cells) {
        const key = cellKey(cell);
        if (!specials.has(key)) remove.set(key, cell);
      }
    }

    return {
      remove: [...remove.values()],
      specials: [...specials.values()],
      activated,
      longest: matches.reduce((max, match) => Math.max(max, match.length), 0),
      lineCount: matches.length
    };
  }

  removeCells(cells) {
    for (const cell of cells) this.set(cell.row, cell.col, null);
  }

  placeSpecials(specials) {
    for (const item of specials) this.set(item.row, item.col, createGem(item.type, item.special));
  }

  collapseAndRefill() {
    const moves = [];
    for (let c = 0; c < this.size; c += 1) {
      const stack = [];
      for (let r = this.size - 1; r >= 0; r -= 1) {
        const gem = this.get(r, c);
        if (gem) stack.push({ gem, from: r });
      }
      for (let r = this.size - 1; r >= 0; r -= 1) {
        const next = stack.shift();
        if (next) {
          this.set(r, c, next.gem);
          if (next.from !== r) moves.push({ from: { row: next.from, col: c }, to: { row: r, col: c } });
        } else {
          this.set(r, c, randomGem(this.rng));
          moves.push({ from: { row: -1, col: c }, to: { row: r, col: c } });
        }
      }
    }
    return moves;
  }

  shuffle({ preserveSpecials = true } = {}) {
    const gems = [];
    for (let r = 0; r < this.size; r += 1) {
      for (let c = 0; c < this.size; c += 1) {
        const gem = this.get(r, c);
        if (gem && (!preserveSpecials || !gem.special)) gems.push(gem);
      }
    }
    for (let i = gems.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [gems[i], gems[j]] = [gems[j], gems[i]];
    }
    let index = 0;
    for (let r = 0; r < this.size; r += 1) {
      for (let c = 0; c < this.size; c += 1) {
        const gem = this.get(r, c);
        if (!preserveSpecials || !gem?.special) {
          this.set(r, c, gems[index]);
          index += 1;
        }
      }
    }
    let guard = 0;
    while (this.findMatches().length && guard < 60) {
      guard += 1;
      const a = { row: Math.floor(this.rng() * this.size), col: Math.floor(this.rng() * this.size) };
      const b = { row: Math.floor(this.rng() * this.size), col: Math.floor(this.rng() * this.size) };
      const first = this.get(a.row, a.col);
      const second = this.get(b.row, b.col);
      if (preserveSpecials && (first?.special || second?.special)) continue;
      this.set(a.row, a.col, second);
      this.set(b.row, b.col, first);
    }
  }

  findPossibleMove() {
    for (let r = 0; r < this.size; r += 1) {
      for (let c = 0; c < this.size; c += 1) {
        const from = { row: r, col: c };
        for (const dir of DIRECTIONS.slice(0, 2)) {
          const to = { row: r + dir.dr, col: c + dir.dc };
          if (!this.inBounds(to.row, to.col)) continue;
          this.swap(from, to);
          const hasMatch = this.findMatches().length > 0;
          this.swap(from, to);
          if (hasMatch) return { from, to };
        }
      }
    }
    return null;
  }

  toJSON() {
    return this.grid.map((row) => row.map((gem) => gem ? { type: gem.type, special: gem.special || null } : null));
  }

  fromJSON(grid) {
    if (!Array.isArray(grid) || grid.length !== this.size) return false;
    this.grid = grid.map((row) => row.map((gem) => gem ? createGem(gem.type, gem.special || null) : null));
    return this.grid.every((row) => row.length === this.size);
  }
}

export function cellKey(cell) {
  return `${cell.row}:${cell.col}`;
}

function range(start, end) {
  return Array.from({ length: end - start }, (_, i) => start + i);
}
