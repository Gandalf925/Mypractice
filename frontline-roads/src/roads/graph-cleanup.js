import { ROAD_CONFIG } from '../core/constants.js';
import { AppError, ErrorCode } from '../core/errors.js';
import { ROAD_PRIORITY } from './road-constants.js';
import { isParallelDuplicate, mergeRoadMetadata } from './parallel-road-collapse.js';
import { attachGraphIndexes } from './road-graph.js';

export function removeParallelGraphEdges(graph) {
  const removed = new Set();
  for (let left = 0; left < graph.edges.length; left += 1) {
    if (removed.has(left)) continue;
    const edge = graph.edges[left];
    for (let right = left + 1; right < graph.edges.length; right += 1) {
      if (removed.has(right)) continue;
      const other = graph.edges[right];
      if (edge.a === other.a && edge.b === other.b) continue;
      if (!isParallelDuplicate(edge, other)) continue;
      const edgePriority = (ROAD_PRIORITY[edge.highway] ?? 0) * 100 + edge.roadWidth;
      const otherPriority = (ROAD_PRIORITY[other.highway] ?? 0) * 100 + other.roadWidth;
      if (edgePriority >= otherPriority) {
        mergeRoadMetadata(edge, other);
        removed.add(right);
      } else {
        mergeRoadMetadata(other, edge);
        removed.add(left);
        break;
      }
    }
  }
  graph.edges = graph.edges.filter((_, index) => !removed.has(index));
  return graph;
}

export function removeShortDeadEnds(graph) {
  let changed = true;
  while (changed) {
    changed = false;
    const degree = new Map(graph.nodes.map(node => [node.id, 0]));
    for (const edge of graph.edges) {
      degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
      degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
    }
    const remove = new Set();
    graph.edges.forEach((edge, index) => {
      const deadEnd = degree.get(edge.a) === 1 || degree.get(edge.b) === 1;
      const lowPriority = (ROAD_PRIORITY[edge.highway] ?? 0) <= 3;
      if (deadEnd && lowPriority && edge.length < 24) remove.add(index);
    });
    if (remove.size > 0) {
      graph.edges = graph.edges.filter((_, index) => !remove.has(index));
      changed = true;
    }
  }
  return graph;
}

export function keepCenterComponent(graph, centerPoint = { x: 0, y: 0 }) {
  if (graph.nodes.length === 0) return graph;
  const adjacency = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) {
    adjacency.get(edge.a)?.push(edge.b);
    adjacency.get(edge.b)?.push(edge.a);
  }
  const centerNode = graph.nodes.reduce((best, node) =>
    Math.hypot(node.x - centerPoint.x, node.y - centerPoint.y) < Math.hypot(best.x - centerPoint.x, best.y - centerPoint.y) ? node : best
  , graph.nodes[0]);
  const keep = new Set([centerNode.id]);
  const queue = [centerNode.id];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of adjacency.get(current) ?? []) {
      if (keep.has(next)) continue;
      keep.add(next);
      queue.push(next);
    }
  }
  graph.nodes = graph.nodes.filter(node => keep.has(node.id));
  graph.edges = graph.edges.filter(edge => keep.has(edge.a) && keep.has(edge.b));
  return graph;
}

export function finalizeRoadGraph(graph, {
  centerPoint = { x: 0, y: 0 },
  keepSingleComponent = true,
  minimumNodes = ROAD_CONFIG.minimumNodes,
  minimumEdges = ROAD_CONFIG.minimumEdges
} = {}) {
  removeParallelGraphEdges(graph);
  removeShortDeadEnds(graph);
  if (keepSingleComponent) keepCenterComponent(graph, centerPoint);
  if (graph.nodes.length < minimumNodes || graph.edges.length < minimumEdges) {
    throw new AppError(ErrorCode.ROAD_NETWORK_DISCONNECTED, '周辺の道路網が小さいか分断されています。別の場所で再試行してください。');
  }
  return attachGraphIndexes(graph);
}
