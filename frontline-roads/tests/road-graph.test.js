import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadGraphFromSegments } from '../src/roads/road-graph.js';
import { segmentAngle, segmentMidpoint } from '../src/roads/geometry.js';
import { shortestPath } from '../src/roads/pathfinding.js';

function makeSegment(id, a, b) {
  const segment = {
    id,
    a,
    b,
    highway: 'residential',
    roadWidth: 5.5,
    lanes: 1,
    name: '',
    oneway: false,
    mergedSegmentIds: [id]
  };
  segment.mid = segmentMidpoint(segment);
  segment.angle = segmentAngle(segment);
  return segment;
}

test('clustered intersections build a connected graph and path', () => {
  const graph = buildRoadGraphFromSegments([
    makeSegment('a', { x: 0, y: 0 }, { x: 100, y: 0 }),
    makeSegment('b', { x: 100.5, y: 0.5 }, { x: 200, y: 0 }),
    makeSegment('c', { x: 100, y: 0 }, { x: 100, y: 100 })
  ], { lat: 35, lon: 139 });
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.edges.length, 3);
  const left = graph.nodes.reduce((best, node) => node.x < best.x ? node : best, graph.nodes[0]);
  const right = graph.nodes.reduce((best, node) => node.x > best.x ? node : best, graph.nodes[0]);
  const path = shortestPath(graph, left.id, right.id);
  assert.ok(path);
  assert.equal(path.edgeIds.length, 2);
});
