import { distance, stableId } from '../core/utilities.js';
import { clusterSegmentEndpoints } from './intersection-clustering.js';
import { mergeRoadMetadata } from './parallel-road-collapse.js';
import { segmentAngle, segmentMidpoint } from './angle-utils.js';
import { attachGraphIndexes } from './graph-indexes.js';

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
    if (existing) { mergeRoadMetadata(existing, segment); continue; }
    const edge = {
      id: stableId('edge', pair, segment.name, segment.highway), a: a.id, b: b.id, length,
      points: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], barrier: null,
      roadWidth: segment.roadWidth, lanes: segment.lanes, highway: segment.highway,
      name: segment.name, oneway: segment.oneway,
      mergedSegmentIds: [...(segment.mergedSegmentIds ?? [segment.id])]
    };
    edge.angle = segmentAngle({ a, b });
    edge.mid = segmentMidpoint({ a, b });
    edges.push(edge);
    edgeByPair.set(pair, edge);
  }
  return attachGraphIndexes({ nodes: clustered.nodes, edges, center, source: 'osm', roadSpecVersion: 1 });
}
