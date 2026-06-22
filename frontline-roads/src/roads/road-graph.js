import { distance, stableId } from '../core/utilities.js';
import { clusterSegmentEndpoints } from './intersection-clustering.js';
import { mergeRoadMetadata } from './parallel-road-collapse.js';
import { segmentAngle, segmentMidpoint } from './geometry.js';

export function buildRoadGraphFromSegments(segments, center) {
  const clustered = clusterSegmentEndpoints(segments, center);
  const edges = [];
  const edgeByPair = new Map();

  for (const segment of segments) {
    const a = clustered.nodeByRoot.get(clustered.find(segment.pointA));
    const b = clustered.nodeByRoot.get(clustered.find(segment.pointB));
    if (!a || !b || a.id === b.id) continue;
    const length = distance(a, b);
    if (length < 6 || length > 280) continue;
    const pair = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const existing = edgeByPair.get(pair);
    if (existing) {
      mergeRoadMetadata(existing, segment);
      continue;
    }

    const edge = {
      id: stableId('edge', pair, segment.name, segment.highway),
      a: a.id,
      b: b.id,
      length,
      points: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }],
      barrier: null,
      roadWidth: segment.roadWidth,
      lanes: segment.lanes,
      highway: segment.highway,
      name: segment.name,
      oneway: segment.oneway,
      mergedSegmentIds: [...(segment.mergedSegmentIds ?? [segment.id])]
    };
    edge.angle = segmentAngle({ a, b });
    edge.mid = segmentMidpoint({ a, b });
    edges.push(edge);
    edgeByPair.set(pair, edge);
  }

  return attachGraphIndexes({ nodes: clustered.nodes, edges, center, source: 'osm', roadSpecVersion: 1 });
}

export function attachGraphIndexes(graph) {
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
  const edgeById = new Map();
  const adjacency = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) {
    const a = nodeById.get(edge.a);
    const b = nodeById.get(edge.b);
    if (a && b) {
      edge.points ??= [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
      edge.angle ??= segmentAngle({ a, b });
      edge.mid ??= segmentMidpoint({ a, b });
    }
    edge.mergedSegmentIds ??= [edge.id];
    edgeById.set(edge.id, edge);
    adjacency.get(edge.a)?.push({ to: edge.b, edgeId: edge.id, length: edge.length });
    adjacency.get(edge.b)?.push({ to: edge.a, edgeId: edge.id, length: edge.length });
  }
  Object.defineProperties(graph, {
    nodeById: { value: nodeById, enumerable: false, writable: true, configurable: true },
    edgeById: { value: edgeById, enumerable: false, writable: true, configurable: true },
    adjacency: { value: adjacency, enumerable: false, writable: true, configurable: true }
  });
  return graph;
}
