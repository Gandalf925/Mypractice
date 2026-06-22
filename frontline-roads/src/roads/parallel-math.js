import { nearestPointOnRoad } from './nearest-road-point.js';

export function segmentSeparation(first, second) {
  return Math.min(
    nearestPointOnRoad(first.a, second.a, second.b).distance,
    nearestPointOnRoad(first.b, second.a, second.b).distance,
    nearestPointOnRoad(second.a, first.a, first.b).distance,
    nearestPointOnRoad(second.b, first.a, first.b).distance,
    nearestPointOnRoad(first.mid, second.a, second.b).distance,
    nearestPointOnRoad(second.mid, first.a, first.b).distance
  );
}

export function overlapRatio(first, second) {
  const dx = first.b.x - first.a.x;
  const dy = first.b.y - first.a.y;
  const length = Math.hypot(dx, dy) || 1;
  const unitX = dx / length;
  const unitY = dy / length;
  const project = point => (point.x - first.a.x) * unitX + (point.y - first.a.y) * unitY;
  const secondRange = [project(second.a), project(second.b)].sort((a, b) => a - b);
  const overlap = Math.max(0, Math.min(length, secondRange[1]) - Math.max(0, secondRange[0]));
  return overlap / Math.max(1, Math.min(length, secondRange[1] - secondRange[0]));
}
