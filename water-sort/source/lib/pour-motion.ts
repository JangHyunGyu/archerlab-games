export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const ease = (n: number) => { const t = clamp01(n); return t * t * (3 - 2 * t); };
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function roundBottom(rect: Rect, radius: number): Point[] {
  const { x, y, width: w, height: h } = rect, r = Math.min(radius, w / 2, h / 2);
  const points = [{ x, y }, { x: x + w, y }];
  for (let i = 0; i <= 8; i++) {
    const a = i / 8 * Math.PI / 2;
    points.push({ x: x + w - r + Math.cos(a) * r, y: y + h - r + Math.sin(a) * r });
  }
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 + i / 8 * Math.PI / 2;
    points.push({ x: x + r + Math.cos(a) * r, y: y + h - r + Math.sin(a) * r });
  }
  return points;
}
export function rotate(points: Point[], angle: number, pivot: Point = { x: 0, y: 0 }): Point[] {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return points.map(p => ({ x: (p.x - pivot.x) * cos - (p.y - pivot.y) * sin, y: (p.x - pivot.x) * sin + (p.y - pivot.y) * cos }));
}
export function area(points: Point[]): number {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
}
export function below(points: Point[], line: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a.y >= line) result.push(a);
    if ((a.y >= line) !== (b.y >= line)) {
      const t = (line - a.y) / (b.y - a.y);
      result.push({ x: mix(a.x, b.x, t), y: line });
    }
  }
  return result;
}
export function surface(points: Point[], volume: number): number {
  let low = Math.min(...points.map(p => p.y)), high = Math.max(...points.map(p => p.y));
  for (let i = 0; i < 19; i++) {
    const mid = (low + high) / 2;
    if (area(below(points, mid)) > volume) low = mid; else high = mid;
  }
  return (low + high) / 2;
}
export function spillAngle(points: Point[], pivot: Point, volume: number, direction: number): number {
  let low = 0, high = Math.PI * .525;
  for (let i = 0; i < 17; i++) {
    const angle = (low + high) / 2;
    if (area(below(rotate(points, angle * direction, pivot), 0)) > volume) low = angle; else high = angle;
  }
  return (low + high) / 2 * direction;
}
export function chooseDirection(source: Rect, target: Rect, viewportWidth: number): number {
  const x = target.x + target.width / 2, needed = Math.hypot(source.width, source.height) + 12;
  const preferred = source.x < target.x ? 1 : -1;
  if (preferred === 1 && x >= needed || preferred === -1 && viewportWidth - x >= needed) return preferred;
  return x > viewportWidth / 2 ? 1 : -1;
}
export function phases(progress: number) {
  return { approach: ease(progress / .24), flow: clamp01((progress - .27) / .46), retreat: ease((progress - .77) / .23) };
}
