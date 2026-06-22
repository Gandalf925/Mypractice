import { ROAD_PRIORITY } from './road-constants.js';

export function trimShortSpurs(graph) {
  let changed = true;
  while (changed) {
    changed = false;
    const degree = new Map(graph.nodes.map(node => [node.id, 0]));
    for (const edge of graph.edges) {
      degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
      degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
    }
    const trimmed = new Set();
    graph.edges.forEach((edge, index) => {
      const terminal = degree.get(edge.a) === 1 || degree.get(edge.b) === 1;
      const localRoad = (ROAD_PRIORITY[edge.highway] ?? 0) <= 3;
      if (terminal && localRoad && edge.length < 24) trimmed.add(index);
    });
    if (trimmed.size > 0) {
      graph.edges = graph.edges.filter((_, index) => !trimmed.has(index));
      changed = true;
    }
  }
  return graph;
}
