export function normalizeUndirectedAngle(angle) {
  return ((angle % Math.PI) + Math.PI) % Math.PI;
}

export function segmentAngle({ a, b }) {
  return normalizeUndirectedAngle(Math.atan2(b.y - a.y, b.x - a.x));
}

export function undirectedAngleGap(a, b) {
  const gap = Math.abs(a - b) % Math.PI;
  return Math.min(gap, Math.PI - gap);
}

export function segmentMidpoint({ a, b }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
