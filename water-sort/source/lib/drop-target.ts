export type DropRect = { left: number; top: number; right: number; bottom: number };
export type DropPoint = { x: number; y: number };
export type DropCandidate = { index: number; rect: DropRect };

/** Geometry only: never redirect an invalid bottle to a different, valid one. */
export function pickDropTarget(candidates: DropCandidate[], source: number, pointer: DropPoint, center: DropPoint, touch: boolean): number | null {
  const padding = touch ? 32 : 24;
  const distance = (point: DropPoint, rect: DropRect) => Math.hypot(
    Math.max(rect.left - point.x, 0, point.x - rect.right),
    Math.max(rect.top - point.y, 0, point.y - rect.bottom),
  );
  const visible = candidates.filter(({ rect }) => rect.right > rect.left && rect.bottom > rect.top);
  // The pointer wins an exact hit, including returning the bottle to its own slot.
  for (const point of [pointer, center]) {
    const direct = visible.find(({ rect }) => distance(point, rect) === 0);
    if (direct) return direct.index === source ? null : direct.index;
  }
  let best: { index: number; distance: number; centerDistance: number } | null = null;
  for (const { index, rect } of visible) {
    const edgeDistance = Math.min(distance(pointer, rect), distance(center, rect));
    if (edgeDistance > padding) continue;
    const midpoint = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
    const centerDistance = Math.min(Math.hypot(pointer.x - midpoint.x, pointer.y - midpoint.y), Math.hypot(center.x - midpoint.x, center.y - midpoint.y));
    if (!best || edgeDistance < best.distance || edgeDistance === best.distance && centerDistance < best.centerDistance) best = { index, distance: edgeDistance, centerDistance };
  }
  return best && best.index !== source ? best.index : null;
}
