import { ROAD_PRIORITY } from './road-constants.js';
import { isParallelDuplicate, mergeRoadMetadata } from './parallel-road-collapse.js';

export function dedupeGraphEdges(graph) {
  const skipped = new Set();
  for (let left = 0; left < graph.edges.length; left += 1) {
    if (skipped.has(left)) continue;
    const edge = graph.edges[left];
    for (let right = left + 1; right < graph.edges.length; right += 1) {
      if (skipped.has(right)) continue;
      const other = graph.edges[right];
      if (edge.a === other.a && edge.b === other.b) continue;
      if (!isParallelDuplicate(edge, other)) continue;
      const edgePriority = (ROAD_PRIORITY[edge.highway] ?? 0) * 100 + edge.roadWidth;
      const otherPriority = (ROAD_PRIORITY[other.highway] ?? 0) * 100 + other.roadWidth;
      if (edgePriority >= otherPriority) { mergeRoadMetadata(edge, other); skipped.add(right); }
      else { mergeRoadMetadata(other, edge); skipped.add(left); break; }
    }
  }
  graph.edges = graph.edges.filter((_, index) => !skipped.has(index));
  return graph;
}
