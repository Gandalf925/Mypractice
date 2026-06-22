import { clamp, distance } from '../core/utilities.js';

export function normalizeUndirectedAngle(angle) {
  let result = angle;
  while (result < 0) result += Math.PI;
  while (result >= Math.PI) result -= Math.PI;
  return result;
}

export function segmentAngle(segment) {
  return normalizeUndirectedAngle(Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x));
}

export function undirectedAngleGap(a, b) {
  const gap = Math.abs(a - b) % Math.PI;
  return Math.min(gap, Math.PI - gap);
}

export function segmentMidpoint(segment) {
  return { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 };
}

export function pointToSegmentProjection(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return { point: { ...a }, t: 0, distance: distance(point, a) };
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
  const projected = { x: a.x + dx * t, y: a.y + dy * t };
  return { point: projected, t, distance: distance(point, projected) };
}

export function segmentSeparation(a, b) {
  return Math.min(
    pointToSegmentProjection(a.a, b.a, b.b).distance,
    pointToSegmentProjection(a.b, b.a, b.b).distance,
    pointToSegmentProjection(b.a, a.a, a.b).distance,
    pointToSegmentProjection(b.b, a.a, a.b).distance,
    pointToSegmentProjection(a.mid, b.a, b.b).distance,
    pointToSegmentProjection(b.mid, a.a, a.b).distance
  );
}

function projectionInterval(segment, origin, ux, uy) {
  const p1 = (segment.a.x - origin.x) * ux + (segment.a.y - origin.y) * uy;
  const p2 = (segment.b.x - origin.x) * ux + (segment.b.y - origin.y) * uy;
  return [Math.min(p1, p2), Math.max(p1, p2)];
}

export function overlapRatio(a, b) {
  const dx = a.b.x - a.a.x;
  const dy = a.b.y - a.a.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const intervalA = projectionInterval(a, a.a, ux, uy);
  const intervalB = projectionInterval(b, a.a, ux, uy);
  const overlap = Math.max(0, Math.min(intervalA[1], intervalB[1]) - Math.max(intervalA[0], intervalB[0]));
  return overlap / Math.max(1, Math.min(intervalA[1] - intervalA[0], intervalB[1] - intervalB[0]));
}
