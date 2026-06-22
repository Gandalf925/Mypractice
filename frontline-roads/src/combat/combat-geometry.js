import { clamp, lerp } from '../core/utilities.js';

export function edgePoint(graph, edgeId, progress) {
  const edge = graph.edgeById.get(edgeId);
  if (!edge) return null;
  const a = graph.nodeById.get(edge.a);
  const b = graph.nodeById.get(edge.b);
  const t = clamp(progress / Math.max(1, edge.length), 0, 1);
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function edgeMidpoint(graph, edgeId) {
  const edge = graph.edgeById.get(edgeId);
  if (!edge) return null;
  const a = graph.nodeById.get(edge.a);
  const b = graph.nodeById.get(edge.b);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
