import { distance, lerp } from '../core/utilities.js';

export function nearestPointOnRoad(point, a, b) {
  let left = 0;
  let right = 1;
  for (let index = 0; index < 24; index += 1) {
    const first = left + (right - left) / 3;
    const second = right - (right - left) / 3;
    const firstPoint = { x: lerp(a.x, b.x, first), y: lerp(a.y, b.y, first) };
    const secondPoint = { x: lerp(a.x, b.x, second), y: lerp(a.y, b.y, second) };
    if (distance(point, firstPoint) <= distance(point, secondPoint)) right = second;
    else left = first;
  }
  const t = (left + right) / 2;
  const nearest = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  return { point: nearest, t, distance: distance(point, nearest) };
}
